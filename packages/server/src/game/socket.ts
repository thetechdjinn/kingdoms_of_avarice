import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { parse as parseCookie } from 'cookie';
import { MessageType, GameMessage, Role, VitalsData, ResourceType, PlayerRegenState, ActiveStatusEffect, PlayerQueueState, createPlayerQueueState } from '@koa/shared';
import type { CharacterStats, CombatActionType, SpellCastingState } from '@koa/shared';
import { verifyToken, COOKIE_NAME } from '../routes/auth.js';
import { GameWorld } from './world.js';
import { processCommand } from './commands.js';
import { getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { initializeProgressionData } from './progressionLoader.js';
import { loadCharacterProgression, unloadCharacterProgression } from './progression.js';
import { initializeDefaultRegenConfigs, startRegenLoops } from './regeneration.js';
import { startCombatLoop } from './combat.js';
import { initializeSpellMnemonics } from './spellCommands.js';
import { loadEffectsFromDb, processEffectsTick, initializeEffectDefinitions } from './statusEffects.js';
import { colors } from '../utils/colors.js';
import { checkWebSocketIp } from '../middleware/ipAccess.js';
import { startGameLoop, stopGameLoop } from './gameLoop.js';
import { initializeTickProcessor, startQueuedAction, executeQueuedCommand, handlePlayerInput } from './tickProcessor.js';
import { initializeDoorStates } from '../services/doorStateManager.js';
import { getCommandQueueConfig } from '../config/commandQueueConfig.js';
import { initializeInterruptHandler } from './interruptHandler.js';

// Combat state tracked per-player in memory
interface CombatState {
  targets: Set<number>;    // playerIds this player is attacking
  energy: number;          // Current energy pool for this round
  carriedEnergy: number;   // Leftover energy from last round
  combatAction: CombatActionType;  // 'melee' or 'spell'
  activeSpell: SpellCastingState | null;  // If casting, the spell being cast
}

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
  characterStats: CharacterStats;
  combatLevel: number;
  // Status effects
  activeEffects: Map<string, ActiveStatusEffect>;
  // Command queue state
  queueState: PlayerQueueState;
}

const connectedPlayers = new Map<number, AuthenticatedSocket>();
const gameWorld = new GameWorld();
let worldInitialized = false;

/**
 * Get the client IP address from a WebSocket request
 */
function getWebSocketClientIp(req: IncomingMessage): string {
  // Check for forwarded IP (if behind a proxy)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstIp = forwardedValue?.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }
  return req.socket.remoteAddress || '127.0.0.1';
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
  await initializeDoorStates();

  // Initialize progression system from JSON data files
  try {
    await initializeProgressionData();
  } catch (error) {
    console.error('[Progression] CRITICAL: Failed to load progression data - classes/races may be unavailable:', error);
    // Server continues but progression features will be degraded
  }

  // Initialize resource regeneration system
  initializeDefaultRegenConfigs();
  startRegenLoops(connectedPlayers, sendVitals);

  // Start status effect processing loop
  startStatusEffectLoop();

  // Start combat loop
  startCombatLoop(connectedPlayers);

  // Initialize status effect definitions from database
  await initializeEffectDefinitions();

  // Initialize spell system
  await initializeSpellMnemonics();

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

    // Initialize vitals from character data
    authWs.vitals = {
      hp: character.health,
      maxHp: character.max_health,
      resource: character.mana,
      maxResource: character.max_mana,
      resourceType: resourceType,
    };

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
    };

    // Cache character stats for combat (avoid DB lookups during combat rounds)
    authWs.characterLevel = character.level;
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

    // Load brief mode from database (default to false on error)
    try {
      authWs.briefMode = await playerRepo.getBriefMode(payload.playerId);
    } catch (error) {
      console.error('Failed to load brief mode:', error);
      authWs.briefMode = false;
    }

    // Load character progression into memory for level-up checks
    try {
      await loadCharacterProgression(character.id, character.class);
    } catch (error) {
      console.error('Failed to load character progression:', error);
    }

    connectedPlayers.set(payload.playerId, authWs);

    // Use character's room location (default to room 1 if invalid)
    const startRoomId = character.current_room_id || 1;

    // Persist the room if we had to default
    if (!character.current_room_id) {
      characterRepo.updateCharacterRoom(characterId, startRoomId).catch((err) => {
        console.error('Failed to persist default room:', err);
      });
    }

    setPlayerLocation(payload.playerId, startRoomId);

    // Broadcast to all players that someone entered the realm (using character name)
    broadcastToAll(`${character.name} entered the realm.`, authWs.playerId);

    sendMessage(authWs, MessageType.SYSTEM, '\r\n=== Welcome to Kingdoms of Avarice ===\r\n');
    
    const room = gameWorld.getRoom(startRoomId);
    if (room) {
      // Get other players in the room (excluding self)
      const otherPlayers: string[] = [];
      for (const [playerId, socket] of connectedPlayers) {
        if (playerId !== payload.playerId && getPlayerLocation(playerId) === startRoomId) {
          otherPlayers.push(socket.username);
        }
      }
      const { getRoomItemsDescription } = await import('./itemCommands.js');
      let itemDescriptions: string | null = null;
      try {
        itemDescriptions = await getRoomItemsDescription(startRoomId);
      } catch (err) {
        console.error('Failed to get room items:', err);
      }
      sendMessage(authWs, MessageType.OUTPUT, gameWorld.formatRoomDescription(room, otherPlayers, authWs.briefMode, itemDescriptions));
    }

    // Send initial vitals
    sendVitals(authWs);

    // Check if this is a new character that should show the training form
    // New characters have full unspent CP and no points allocated
    const isNewCharacter = character.unspent_cp >= 100 &&
      (!character.cp_spent || Object.keys(character.cp_spent).length === 0 ||
       Object.values(character.cp_spent).every(v => v === 0));

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

      // Save character vitals (HP, mana) on disconnect
      if (authWs.characterId) {
        try {
          await characterRepo.updateCharacterStats(authWs.characterId, {
            health: authWs.vitals.hp,
            mana: authWs.vitals.resource ?? 0,
          });
        } catch (error) {
          console.error(`Failed to save vitals for character ${authWs.characterId}:`, error);
        }

        // Unload character progression from memory
        unloadCharacterProgression(authWs.characterId);
      }

      // Broadcast appropriate message based on how they disconnected
      if (authWs.properlyExited) {
        broadcastToAll(`${authWs.username} left the realm.`, payload.playerId);
      } else {
        // Player closed browser/tab without proper exit - potential cheating
        broadcastToAll(colors.boldWhite(`** ${authWs.username} just hung up! **`), payload.playerId);
      }

      connectedPlayers.delete(payload.playerId);
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
  const message: GameMessage = {
    type: MessageType.VITALS,
    payload: JSON.stringify(ws.vitals),
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
    if (playerId !== excludePlayerId) {
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
    if (!excludeSet.has(playerId) && getPlayerLocation(playerId) === roomId) {
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

export { connectedPlayers, AuthenticatedSocket, sendVitals, sendMessage, CombatState, CharacterStats, startStatusEffectLoop };
