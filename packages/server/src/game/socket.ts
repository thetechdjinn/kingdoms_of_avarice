import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { parse as parseCookie } from 'cookie';
import { MessageType, GameMessage, Role, VitalsData, ResourceType, PlayerRegenState, ActiveStatusEffect, PlayerQueueState, createPlayerQueueState, PlayerStatus, DeathState, StealthMode } from '@koa/shared';
import type { CharacterStats, Currency, ItemInstance } from '@koa/shared';
import { verifyToken, COOKIE_NAME } from '../routes/auth.js';
import { GameWorld } from './world.js';
import { processCommand } from './commands.js';
import { getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import { markVitalsDirty, markRoomDirty, flushPlayer } from './sessionState.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { initializeProgressionData } from './progressionLoader.js';
import { loadCharacterProgression, unloadCharacterProgression } from './progression.js';
import { initializeDefaultRegenConfigs, startRegenLoops } from './regeneration.js';
import { startCombatLoop } from './combat.js';
import { startCharacterSaveLoop } from './characterSaveLoop.js';
import { initializeSpellMnemonics } from './spellCommands.js';
import { initializeActionCommands } from './actionCommands.js';
import { loadEffectsFromDb, processEffectsTick, initializeEffectDefinitions } from './statusEffects.js';
import { colors } from '../utils/colors.js';
import { checkWebSocketIp, getClientIpFromRequest } from '../middleware/ipAccess.js';
import { startGameLoop, stopGameLoop } from './gameLoop.js';
import { initializeTickProcessor, startQueuedAction, executeQueuedCommand, handlePlayerInput } from './tickProcessor.js';
import { initializeDoorStates } from '../services/doorStateManager.js';
import { getCommandQueueConfig } from '../config/commandQueueConfig.js';
import { initializeInterruptHandler } from './interruptHandler.js';
import { startDroppedStateLoop, stopDroppedStateLoop, handleDroppedDisconnect } from './droppedStateManager.js';
import { startFuelLoop, stopFuelLoop, untrackLitCharacter } from './fuelManager.js';
import { isPlayerDropped, isPlayerDead, clearDeathState } from './damageHandler.js';
import { getRespawnRoomId } from '../services/respawnService.js';
import { raceCanSeeHidden } from './stats/secondaryStats.js';
import { isHidden } from './stealth/stealthState.js';
import type { CombatEntity, CombatState } from './combatEntity.js';
import { NPC_ID_OFFSET, isPlayerEntity, getEntityRoomId } from './combatEntity.js';
import { initializeNpcManager, checkHostileAggro, initializeNpcWorld, clearMerchantHostility } from './npcManager.js';
import { cleanupBroadcastMembership } from './socialCommands.js';
import { cleanupPlayerGroup } from './groupManager.js';
import { clearHaggleState } from './merchantCommands.js';
import { initializeQuestManager } from './questManager.js';
import { calculateEffectiveVision, canSee as canSeeVision, getDarknessTag, getBlindMessage } from './vision.js';

interface AuthenticatedSocket extends WebSocket {
  playerId: number;
  username: string;
  characterId?: number;
  roles: Role[];
  vitals: VitalsData;
  regenState: PlayerRegenState;
  briefMode: boolean;
  exitTimer?: NodeJS.Timeout;
  properlyExited?: boolean; // True if player exited via 'x' command
  // Combat-related properties
  combatState: CombatState;
  characterLevel: number;
  characterClass: string;
  characterRace: string;
  characterStats: CharacterStats;
  combatLevel: number;
  // Status effects
  activeEffects: Map<string, ActiveStatusEffect>;
  // Command queue state
  queueState: PlayerQueueState;
  // Death state (dropped/purgatory)
  deathState: DeathState | null;
  // Stealth state (none/sneaking/hidden)
  stealthMode: StealthMode;
  // Cached: can this character see hidden players? (from race trait)
  canSeeHidden: boolean;
  // CombatEntity identity fields (set during character login)
  entityId: number;
  entityName: string;
  isProperName: boolean;
  entityType: 'player' | 'npc';
  // Training form state (player is removed from game world while training)
  isTraining: boolean;
  // Social system fields
  gossipEnabled: boolean;
  auctionEnabled: boolean;
  telepathEnabled: boolean;
  telepathBlocks: Set<number>;
  broadcastChannel: string | null;
  groupId: string | null;
  pendingGroupInvite: { groupId: string; leaderId: number; leaderName: string; expiresAt: number } | null;
  // Memory-first session cache (see notes/Memory_First_Architecture.md)
  // Mutations to these fields must go through sessionState helpers, which
  // mark the corresponding entry in `dirty` so the next flush picks them up.
  pocket: Currency;
  bankBalance: number;
  inventory: ItemInstance[];
  dirty: Set<DirtyField>;
  dirtyItems: Set<number>; // item instance IDs needing flush
}

type DirtyField = 'vitals' | 'room' | 'pocket' | 'bank' | 'inventory' | 'effects';

const connectedPlayers = new Map<number, AuthenticatedSocket>();
const gameWorld = new GameWorld();
let worldInitialized = false;

/**
 * Get the GameWorld instance for external access (e.g., from API routes)
 */
export function getGameWorld(): GameWorld {
  return gameWorld;
}

/**
 * Get the client IP address from a WebSocket request.
 * Delegates to centralized IP extraction which respects TRUST_PROXY setting.
 */
function getWebSocketClientIp(req: IncomingMessage): string {
  return getClientIpFromRequest(req);
}

/**
 * Get the emergency token from WebSocket request query string
 */
function getWebSocketEmergencyToken(req: IncomingMessage): string | undefined {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    return url.searchParams.get('emergencyToken') || undefined;
  } catch {
    return undefined;
  }
}

export async function initializeGameWorld(): Promise<void> {
  if (worldInitialized) return;
  await gameWorld.initialize();

  // Initialize door state manager (loads doors and sets default states)
  // Pass broadcastToRoom callback for auto-close timer notifications
  await initializeDoorStates(broadcastToRoom);

  // Initialize progression system from JSON data files
  try {
    await initializeProgressionData();
  } catch (error) {
    console.error('[Progression] CRITICAL: Failed to load progression data - classes/races may be unavailable:', error);
    // Server continues but progression features will be degraded
  }

  // Initialize resource regeneration system
  await initializeDefaultRegenConfigs();
  startRegenLoops(connectedPlayers, sendVitals);

  // Start status effect processing loop
  startStatusEffectLoop();

  // Start combat loop
  startCombatLoop(connectedPlayers);

  // Start dropped state processing loop (bleed/recovery for downed players)
  await startDroppedStateLoop(connectedPlayers, sendMessage, sendVitals, broadcastToRoom);

  // Start fuel consumption loop (burns fuel on lit light sources)
  await startFuelLoop(connectedPlayers, sendMessage, gameWorld);

  // Start periodic character save loop (saves HP/mana at configurable interval)
  await startCharacterSaveLoop(connectedPlayers);

  // Initialize status effect definitions from database
  await initializeEffectDefinitions();

  // Initialize spell system
  await initializeSpellMnemonics();

  // Initialize action commands
  await initializeActionCommands();

  // Initialize NPC manager (load templates, spawn instances, start respawn timers)
  try {
    await initializeNpcManager();
    initializeNpcWorld(gameWorld, connectedPlayers);
  } catch (error) {
    console.error('[NPC Manager] Failed to initialize:', error);
    // Server continues but NPCs will be unavailable
  }

  // Initialize quest manager (load quest definitions into cache)
  try {
    await initializeQuestManager();
  } catch (error) {
    console.error('[Quest Manager] Failed to initialize:', error);
  }

  // Initialize command queue system
  try {
    const config = getCommandQueueConfig();
    console.log(`[CommandQueue] Loaded configuration with ${Object.keys(config.actions).length} action types`);

    // Initialize the tick processor with references
    initializeTickProcessor(gameWorld, connectedPlayers, sendMessage, sendVitals);

    // Initialize the interrupt handler
    initializeInterruptHandler(sendMessage);

    // Start the game loop for command queue processing
    startGameLoop(connectedPlayers, startQueuedAction, executeQueuedCommand);
  } catch (error) {
    console.error('[CommandQueue] Failed to initialize command queue system:', error);
    // Continue without command queue - commands will process immediately (legacy mode)
  }

  worldInitialized = true;
}

export function setupGameSocket(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // Check IP access before processing connection
    const clientIp = getWebSocketClientIp(req);
    const emergencyToken = getWebSocketEmergencyToken(req);
    const ipCheck = await checkWebSocketIp(clientIp, emergencyToken);
    if (!ipCheck.allowed) {
      ws.close(1008, ipCheck.message || 'Access denied');
      return;
    }

    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies[COOKIE_NAME];

    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      ws.close(1008, 'Invalid token');
      return;
    }

    // Parse characterId from query string
    let characterId: number | null = null;
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const characterIdParam = url.searchParams.get('characterId');
      characterId = characterIdParam ? parseInt(characterIdParam, 10) : null;
    } catch {
      ws.close(1008, 'Invalid request URL');
      return;
    }

    if (!characterId || isNaN(characterId)) {
      ws.close(1008, 'Character selection required');
      return;
    }

    // Verify character exists and belongs to this player
    let character: characterRepo.DbCharacter | null = null;
    try {
      character = await characterRepo.findCharacterById(characterId);
    } catch (error) {
      console.error('Failed to load character:', error);
      ws.close(1008, 'Failed to load character');
      return;
    }

    if (!character) {
      ws.close(1008, 'Character not found');
      return;
    }

    if (character.player_id !== payload.playerId) {
      ws.close(1008, 'Invalid character');
      return;
    }

    // Check if this player already has a connected character - kick the old one
    const existingSocket = connectedPlayers.get(payload.playerId);
    if (existingSocket) {
      console.log(`Player ${payload.playerId} already connected as ${existingSocket.username}, kicking old connection`);

      // Notify the old connection they're being replaced
      const kickMessage: GameMessage = {
        type: MessageType.SYSTEM,
        payload: 'You have been disconnected because you logged in from another location.',
        timestamp: Date.now(),
      };
      existingSocket.send(JSON.stringify(kickMessage));

      // Mark as properly exited so we don't broadcast "hung up"
      existingSocket.properlyExited = true;

      // Clear any exit timer
      if (existingSocket.exitTimer) {
        clearTimeout(existingSocket.exitTimer);
        existingSocket.exitTimer = undefined;
      }

      // Close the old connection
      existingSocket.close(1000, 'Logged in from another location');
    }

    // Check if character was dead/dropped when they disconnected (HP <= 0)
    // If so, auto-respawn them at the respawn location with full HP
    if (character.health <= 0) {
      const respawnRoomId = await getRespawnRoomId(character.current_room_id, character.id);
      character.health = character.max_health;
      character.mana = character.max_mana;
      character.current_room_id = respawnRoomId;

      // Persist the respawn state
      try {
        await characterRepo.updateCharacterStats(character.id, {
          health: character.health,
          mana: character.mana,
        });
        await characterRepo.updateCharacterRoom(character.id, respawnRoomId);
      } catch (error) {
        console.error('Failed to auto-respawn character:', error);
      }
    }

    // Determine resource type based on class
    let resourceType = ResourceType.NONE;
    try {
      const classDef = await progressionRepo.getClassById(character.class);
      if (classDef?.resource_type) {
        if (classDef.resource_type === 'mana') {
          resourceType = ResourceType.MANA;
        } else if (classDef.resource_type === 'kai') {
          resourceType = ResourceType.KAI;
        }
      }
    } catch (error) {
      console.error('Failed to load class definition:', error);
      // Default to MANA for spell casters based on class ID
      if (['mage', 'cleric', 'paladin'].includes(character.class)) {
        resourceType = ResourceType.MANA;
      }
    }

    const authWs = ws as AuthenticatedSocket;
    authWs.playerId = payload.playerId;
    authWs.username = character.name; // Use character name instead of account username
    authWs.characterId = character.id;
    authWs.roles = payload.roles || [];

    // CombatEntity identity fields
    authWs.entityId = payload.playerId;
    authWs.entityName = character.name;
    authWs.isProperName = true; // Players are always proper nouns
    authWs.entityType = 'player';

    // Initialize vitals from character data
    authWs.vitals = {
      hp: character.health,
      maxHp: character.max_health,
      resource: character.mana,
      maxResource: character.max_mana,
      resourceType: resourceType,
    };

    // Initialize memory-first session cache (see notes/Memory_First_Architecture.md).
    // The cache is loaded once at login and mutated in-place by gameplay code.
    // Mutations go through sessionState helpers which mark these entries dirty;
    // flushPlayer drains all dirty state in a single transaction at every flush point.
    authWs.pocket = {
      copper: character.copper ?? 0,
      silver: character.silver ?? 0,
      gold: character.gold ?? 0,
      platinum: character.platinum ?? 0,
      runic: character.runic ?? 0,
    };
    authWs.bankBalance = character.bank_balance ?? 0;
    try {
      authWs.inventory = await itemRepo.getCharacterInventory(character.id);
    } catch (error) {
      console.error('Failed to load character inventory:', error);
      authWs.inventory = [];
    }
    authWs.dirty = new Set();
    authWs.dirtyItems = new Set();

    // Initialize regeneration state
    authWs.regenState = {
      enhancedRegen: new Set<string>(),
      inCombat: false,
      isPoisoned: false,
    };

    // Initialize combat state
    authWs.combatState = {
      targets: new Set(),
      energy: 0,
      carriedEnergy: 0,
      combatAction: 'melee',
      activeSpell: null,
      combatOrderPosition: 0,
    };

    // Cache character stats for combat (avoid DB lookups during combat rounds)
    authWs.characterLevel = character.level;
    authWs.characterClass = character.class;
    authWs.characterRace = character.race;
    authWs.characterStats = {
      strength: character.strength,
      dexterity: character.dexterity,
      intelligence: character.intelligence,
      constitution: character.constitution,
      wisdom: character.wisdom,
      charisma: character.charisma,
    };

    // Get combat level from class definition (default to 1 if not found)
    let combatLevel = 1;
    try {
      const classDef = await progressionRepo.getClassById(character.class);
      if (classDef?.combat_level) {
        combatLevel = classDef.combat_level;
      }
    } catch (error) {
      console.error('Failed to load class combat level:', error);
    }
    authWs.combatLevel = combatLevel;

    // Initialize status effects and load from database
    authWs.activeEffects = new Map();
    try {
      await loadEffectsFromDb(authWs);
    } catch (error) {
      console.error('Failed to load status effects:', error);
    }

    // Initialize command queue state
    authWs.queueState = createPlayerQueueState();

    // Initialize death state (null means alive/normal)
    authWs.deathState = null;

    // Initialize stealth state (none = not stealthing)
    authWs.stealthMode = 'none';

    // Cache whether this character can see hidden players (race trait)
    try {
      authWs.canSeeHidden = await raceCanSeeHidden(character.race);
    } catch (error) {
      console.error('Failed to check seeHidden trait:', error);
      authWs.canSeeHidden = false;
    }

    // Initialize training state
    authWs.isTraining = false;

    // Initialize social system state
    authWs.gossipEnabled = true;
    authWs.auctionEnabled = true;
    authWs.telepathEnabled = true;
    authWs.telepathBlocks = new Set();
    authWs.broadcastChannel = null;
    authWs.groupId = null;
    authWs.pendingGroupInvite = null;

    // Load brief mode from database (default to false on error)
    try {
      authWs.briefMode = await playerRepo.getBriefMode(payload.playerId);
    } catch (error) {
      console.error('Failed to load brief mode:', error);
      authWs.briefMode = false;
    }

    // Load character progression into memory for level-up checks
    try {
      await loadCharacterProgression(character.id, character.class, character.level);
    } catch (error) {
      console.error('Failed to load character progression:', error);
    }

    connectedPlayers.set(payload.playerId, authWs);

    // Use character's room location (default to room 1 if invalid).
    // No direct persist needed: the default-room assignment flows through
    // setPlayerLocation below; the close handler / next save tick flushes it.
    const startRoomId = character.current_room_id || 1;

    setPlayerLocation(payload.playerId, startRoomId);

    // Check if this is a new character that hasn't completed initial training
    const isNewCharacter = !character.initial_training_complete;

    // Broadcast to all players that someone entered the realm (using character name).
    // Skip for new characters — they go straight into training, which broadcasts
    // "entered the realm" when training completes.
    if (!isNewCharacter) {
      broadcastToAll(`${character.name} entered the realm.`, authWs.playerId);
    }

    sendMessage(authWs, MessageType.SYSTEM, '\r\n=== Welcome to Kingdoms of Avarice ===\r\n');
    
    const room = gameWorld.getRoom(startRoomId);
    if (room) {
      // Get other players in the room (excluding self, respecting hidden/seeHidden)
      const otherPlayers: string[] = [];
      for (const [playerId, playerSocket] of connectedPlayers) {
        if (playerId !== payload.playerId && !playerSocket.isTraining && getPlayerLocation(playerId) === startRoomId) {
          const playerIsHidden = isHidden(playerSocket);

          // Skip hidden players unless viewer can see them
          if (playerIsHidden && !authWs.canSeeHidden) {
            continue;
          }

          let displayName = playerSocket.username;

          // Add status indicators
          if (isPlayerDead(playerSocket)) {
            displayName = `corpse of ${playerSocket.username}`;
          } else if (isPlayerDropped(playerSocket)) {
            displayName += ' (on the ground)';
          } else if (playerIsHidden && authWs.canSeeHidden) {
            displayName += ' (hidden)';
          }
          otherPlayers.push(displayName);
        }
      }
      // Add NPCs to room display
      const { getNpcsInRoom } = await import('./npcManager.js');
      const { colors: colorUtils } = await import('../utils/colors.js');
      const npcNames: string[] = [];
      for (const npc of getNpcsInRoom(startRoomId)) {
        if (npc.vitals.hp > 0) {
          const name = npc.template.hostile
            ? colorUtils.hostileInRoom(npc.entityName)
            : colorUtils.npcInRoom(npc.entityName);
          npcNames.push(name);
        }
      }

      const { getRoomItemsDescription } = await import('./itemCommands.js');
      let itemDescriptions: string | null = null;
      try {
        itemDescriptions = await getRoomItemsDescription(startRoomId);
      } catch (err) {
        console.error('Failed to get room items:', err);
      }
      // Vision check for login room display
      const loginVision = await calculateEffectiveVision(authWs);
      if (!canSeeVision(loginVision, room.darkness_level)) {
        sendMessage(authWs, MessageType.OUTPUT, getBlindMessage(room.darkness_level));
      } else {
        const darknessTag = getDarknessTag(room.darkness_level);
        sendMessage(authWs, MessageType.OUTPUT, gameWorld.formatRoomDescription(room, otherPlayers, authWs.briefMode, itemDescriptions, npcNames, darknessTag));
      }
    }

    // Send initial vitals
    sendVitals(authWs);

    // Check for hostile NPCs in the room (auto-aggro on login)
    checkHostileAggro(startRoomId, authWs);

    if (isNewCharacter) {
      // Send training form after a short delay to let the room render first
      setTimeout(async () => {
        try {
          const { sendTrainingForm } = await import('./trainingCommands.js');
          await sendTrainingForm(authWs, true);
        } catch (error) {
          console.error('Failed to send training form for new character:', error);
        }
      }, 500);
    }

    ws.on('message', async (data) => {
      // Parse JSON separately to distinguish parse errors from command errors
      let message: GameMessage;
      try {
        message = JSON.parse(data.toString());
      } catch {
        sendMessage(authWs, MessageType.ERROR, 'Invalid message format');
        return;
      }

      // While training, only TRAINING_SUBMIT is accepted — reject everything else
      if (authWs.isTraining) {
        if (message.type !== MessageType.TRAINING_SUBMIT) {
          return; // silently drop non-training messages
        }
      }

      // Process command through the queue system
      if (message.type === MessageType.COMMAND) {
        try {
          // handlePlayerInput determines whether to queue, bypass, or execute immediately
          // It handles sending responses and vitals internally
          await handlePlayerInput(authWs, message.payload);
        } catch (error) {
          console.error('Queue system error, falling back to direct processing:', error);
          // Fallback to direct command processing if queue system fails
          try {
            const response = await processCommand(
              message.payload,
              authWs,
              gameWorld,
              connectedPlayers
            );
            sendMessage(authWs, response.type, response.message);
            sendVitals(authWs);
          } catch (fallbackError) {
            console.error('Fallback command processing also failed:', fallbackError);
            sendMessage(authWs, MessageType.ERROR, 'An error occurred processing your command');
          }
        }
      }

      // Handle training form submission
      if (message.type === MessageType.TRAINING_SUBMIT) {
        try {
          const { handleTrainingSubmit } = await import('./trainingCommands.js');
          const payload = JSON.parse(message.payload);
          const response = await handleTrainingSubmit(authWs, payload);
          if (response) {
            sendMessage(authWs, response.type, response.message);
          }
        } catch (error) {
          console.error('Training submit error:', error);
          sendMessage(authWs, MessageType.ERROR, 'An error occurred processing your training.');
        }
      }
    });

    ws.on('close', async () => {
      // Clear any pending exit timer
      if (authWs.exitTimer) {
        clearTimeout(authWs.exitTimer);
        authWs.exitTimer = undefined;
      }

      // Handle disconnect while in dropped or dead state
      if (isPlayerDropped(authWs)) {
        // Player disconnected while dropped - they die and items drop
        await handleDroppedDisconnect(authWs);
      }

      // Flush all dirty cached state on disconnect via the central helper.
      // If dead/dropped, save with 0 HP so they auto-respawn on reconnect.
      //
      // INVARIANT (memory-first architecture):
      // This flush — like every flush (save tick, shutdown hook, quest
      // completion, level-up, etc.) — drains the player's entire dirty
      // state in a single transaction via flushPlayer. See
      // notes/Memory_First_Architecture.md.
      if (authWs.characterId) {
        try {
          if (isPlayerDead(authWs)) {
            // Override hp to 0 so the auto-respawn path triggers on next
            // login. Mutating the cache directly is safe here because the
            // socket is about to be GC'd.
            authWs.vitals.hp = 0;
          }
          markVitalsDirty(authWs);
          markRoomDirty(authWs);
          await flushPlayer(authWs);
        } catch (error) {
          console.error(`Failed to flush state for character ${authWs.characterId}:`, error);
        }

        // Unload character progression from memory
        unloadCharacterProgression(authWs.characterId);
      }

      // Only process full cleanup if this socket is still the registered one.
      // Prevents a race where an old socket's close handler clobbers a newer connection.
      if (connectedPlayers.get(payload.playerId) === authWs) {
        // Clean up social system state (broadcast channels, groups)
        cleanupBroadcastMembership(authWs, connectedPlayers);
        cleanupPlayerGroup(authWs.playerId);

        // Clean up merchant state (haggle reputation, hostility) and fuel tracking
        if (authWs.characterId) {
          clearHaggleState(authWs.characterId);
          clearMerchantHostility(authWs.characterId);
          await untrackLitCharacter(authWs.characterId);
        }

        // Broadcast appropriate message based on how they disconnected.
        // If isTraining, "left the realm." was already sent when training started — skip.
        if (authWs.isTraining) {
          authWs.isTraining = false;
        } else if (authWs.properlyExited) {
          broadcastToAll(`${authWs.username} left the realm.`, payload.playerId);
        } else {
          // Player closed browser/tab without proper exit - potential cheating
          broadcastToAll(colors.boldWhite(`** ${authWs.username} just hung up! **`), payload.playerId);
        }

        connectedPlayers.delete(payload.playerId);
      }
      console.log(`Character ${authWs.username} (Player ${payload.playerId}) disconnected${authWs.properlyExited ? '' : ' (hung up)'}`);
    });

    console.log(`Character ${authWs.username} (Player ${payload.playerId}) connected`);
  });
}

function sendMessage(ws: AuthenticatedSocket, type: MessageType, payload: string): void {
  const message: GameMessage = { type, payload, timestamp: Date.now() };
  ws.send(JSON.stringify(message));
}

function sendVitals(ws: AuthenticatedSocket): void {
  // Determine player status (death states take priority)
  let status: PlayerStatus = 'normal';
  if (ws.deathState?.isDead) {
    status = 'dead';
  } else if (ws.deathState?.isDropped) {
    status = ws.deathState.isAided ? 'aided' : 'dropped';
  } else if (ws.exitTimer) {
    status = 'meditating';
  } else if (ws.regenState.enhancedRegen.has('mana') && ws.regenState.enhancedRegen.has('health')) {
    status = 'resting';
  } else if (ws.stealthMode === 'hidden') {
    status = 'hidden';
  } else if (ws.stealthMode === 'sneaking') {
    status = 'sneaking';
  }

  const vitalsWithStatus: VitalsData = {
    ...ws.vitals,
    status,
  };

  const message: GameMessage = {
    type: MessageType.VITALS,
    payload: JSON.stringify(vitalsWithStatus),
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(message));
}

// Broadcast a system message to all connected players (except excludePlayerId)
function broadcastToAll(text: string, excludePlayerId?: number): void {
  const message: GameMessage = {
    type: MessageType.SYSTEM,
    payload: text,
    timestamp: Date.now(),
  };
  for (const [playerId, socket] of connectedPlayers) {
    if (playerId !== excludePlayerId && !socket.isTraining) {
      socket.send(JSON.stringify(message));
    }
  }
}

// Broadcast to players in a specific room (except excludePlayerId)
export function broadcastToRoom(roomId: number, text: string, excludePlayerIds?: number | number[]): void {
  const message: GameMessage = {
    type: MessageType.OUTPUT,
    payload: text,
    timestamp: Date.now(),
  };
  const excludeSet = new Set(
    excludePlayerIds === undefined ? [] :
    Array.isArray(excludePlayerIds) ? excludePlayerIds : [excludePlayerIds]
  );
  for (const [playerId, socket] of connectedPlayers) {
    if (!excludeSet.has(playerId) && !socket.isTraining && getPlayerLocation(playerId) === roomId) {
      socket.send(JSON.stringify(message));
    }
  }
}

// Status effect tick interval (matches regen interval)
const STATUS_EFFECT_TICK_INTERVAL_MS = 5000;
let statusEffectTimer: NodeJS.Timeout | null = null;
let statusEffectTickInProgress = false;

/**
 * Start the status effect processing loop
 * Handles DoT damage, HoT healing, and effect expiration
 */
function startStatusEffectLoop(): void {
  if (statusEffectTimer) {
    clearInterval(statusEffectTimer);
  }

  statusEffectTimer = setInterval(() => {
    // Prevent overlapping async executions
    if (statusEffectTickInProgress) {
      return;
    }
    statusEffectTickInProgress = true;

    (async () => {
      try {
        for (const [, socket] of connectedPlayers) {
          if (socket.activeEffects && socket.activeEffects.size > 0) {
            try {
              await processEffectsTick(socket, sendMessage, sendVitals);
              // Always send vitals after effect ticks to ensure client has latest state
              sendVitals(socket);
            } catch (error) {
              console.error(`Failed to process status effects for player ${socket.playerId}:`, error);
            }
          }
        }
      } finally {
        statusEffectTickInProgress = false;
      }
    })();
  }, STATUS_EFFECT_TICK_INTERVAL_MS);

  console.log(`[StatusEffects] Started status effect processing loop (every ${STATUS_EFFECT_TICK_INTERVAL_MS}ms)`);
}

export { connectedPlayers, AuthenticatedSocket, sendVitals, sendMessage, broadcastToAll, startStatusEffectLoop };
export type { CombatEntity, CombatState };
export { NPC_ID_OFFSET, isPlayerEntity, getEntityRoomId };
