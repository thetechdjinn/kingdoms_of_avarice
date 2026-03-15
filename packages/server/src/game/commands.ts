import { MessageType, GameMessage, Role, hasAnyRole, StatusEffectCategory, DoorType, DoorState, Door, ResourceType } from '@koa/shared';
import { getActiveEffectsDisplay, formatDuration } from './statusEffects.js';
import { getDelayModifierDescriptions, getStatusEffectDelayMultiplier } from './delayModifiers.js';
import { getPlayerQueueStatus } from './tickProcessor.js';
import { getRemainingCooldown, formatAbilityName } from './cooldownTracker.js';
import { GameWorld } from './world.js';
import { AuthenticatedSocket, broadcastToRoom, sendVitals, sendMessage } from './socket.js';
import { colors } from '../utils/colors.js';
import { processAdminCommand, getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as doorStateManager from '../services/doorStateManager.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import { handleGet, handleDrop, handleInventory, handleExamine, getRoomItemsDescription, handleWield, handleWear, handleRemove, handleEquipment, handlePut, handleGetFrom, handleLookIn, handleUse, handleLight, handleExtinguish, handleRepair, handleSearch, handleRecipes, handleCraft, handleEnchantments, handleEnchant, handleDropCurrency, handleGetCurrency } from './itemCommands.js';
import { handleAttack, handleFlee, handleBreak } from './combatCommands.js';
import { isSpellMnemonic, handleSpellCommand, handleSpellbook } from './spellCommands.js';
import { isActionCommand, handleActionCommand, handleEmoteCommand, getActionHelpList } from './actionCommands.js';
import { handleTrain } from './trainingCommands.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import { generatePlayerDescription } from './playerDescription.js';
import {
  isPlayerDropped,
  isPlayerDead,
  isPlayerAided,
  setPlayerAided,
  clearDeathState,
} from './damageHandler.js';
import { isHidden, isSneaking, isStealthing, setStealthMode, breakStealth } from './stealth/stealthState.js';
import { handleHide, handleSneak, handleVisible, handleBackstab } from './stealth/stealthCommands.js';
import { rollCumulativeDetection } from './stealth/stealthCheck.js';
import { wordWrap, withNpcNameCapitalized, withNpcNameThe } from '../utils/textFormat.js';
import { calculateStealth, calculatePerception, characterHasStealth, getEncumbrancePenalty, calculateLockpicking, characterHasLockpicking } from './stats/secondaryStats.js';
import { calculateEncumbranceRatio, getEquipmentCombatStats } from './combatStats.js';
import { getRespawnRoomId } from '../services/respawnService.js';
import { findPlayerInRoom } from './playerUtils.js';
import { getNpcsInRoom, findNpcInRoom, checkHostileAggro, isPlayerTargetedByAnyNpc, getResponseForKeywords } from './npcManager.js';
import {
  handleGossip, handleAuction, handleTelepath, handleBlock, handleUnblock,
  handleShout, handleBroadcastCreate, handleJoinBroadcast, handleLeaveBroadcast, handleBroadcast,
} from './socialCommands.js';
import {
  handleInvite, handleJoinGroup, handleLeaveGroup, handleKick, handleGroupChat,
  getGroupForPlayer, isGroupLeader,
} from './groupManager.js';
import { checkTalkTrigger, checkVisitTrigger } from './questManager.js';
import { handleQuest } from './questCommands.js';
import * as questRepo from '../db/repositories/questRepository.js';
import { handleBank, handleDeposit, handleWithdraw } from './bankCommands.js';
import { handleList, handleBuy, handleSell, handlePrice, handleHaggle } from './merchantCommands.js';

export interface CommandResponse {
  type: MessageType;
  message: string;
}

// Configuration constants
const EXIT_MEDITATION_TIMEOUT_MS = 10000;

// Filter input to printable ASCII characters only (security)
function sanitizeInput(input: string): string {
  // Allow printable ASCII characters (space through tilde: 0x20-0x7E)
  return input.replace(/[^\x20-\x7E]/g, '');
}

const DIRECTION_ALIASES: Record<string, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  u: 'up',
  d: 'down',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
};

export async function processCommand(
  input: string,
  socket: AuthenticatedSocket,
  world: GameWorld,
  _connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  const trimmed = sanitizeInput(input).trim();
  
  // Check if player is meditating to exit - cancel if they type anything except during the x command itself
  if (socket.exitTimer) {
    clearTimeout(socket.exitTimer);
    socket.exitTimer = undefined;
    // Don't cancel if they're typing 'x' again (let it fall through to handle below)
    if (trimmed.toLowerCase() !== 'x') {
      sendVitals(socket); // Update statline to remove meditating status
      return { type: MessageType.SYSTEM, message: 'You stop meditating and return to the realm.' };
    }
  }
  
  // Check for admin commands first (they start with @)
  if (trimmed.startsWith('@')) {
    const adminResponse = await processAdminCommand(trimmed, socket, world);
    if (adminResponse) return adminResponse;
  }

  // Split into parts preserving original case for args
  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  const lowerTrimmed = trimmed.toLowerCase();

  // Death state command restrictions
  // Dead state - very limited commands
  if (isPlayerDead(socket)) {
    const allowedDead = ['respawn', 'look', 'l', 'who', 'say', "'", 'help', '?',
      'gossip', 'gos', 'auction', 'auc', 'tel', 'telepath', 'shout', 'yel',
      'group', 'gr', 'br', 'broadcast', '/block', '/unblock',
      'bank', 'bal', 'balance',
      'quest', 'qu'];
    if (!allowedDead.includes(command)) {
      return { type: MessageType.ERROR, message: 'You are dead. Type "respawn" to return to life.' };
    }
  }
  // Dropped state - limited commands (but allow actions/emotes for roleplay)
  else if (isPlayerDropped(socket)) {
    const allowedDropped = ['look', 'l', 'inventory', 'inv', 'i', 'who', 'say', "'", 'quit', 'x', 'help', '?', 'status', 'st', 'sta', 'stat', 'statu', 'me', '/me',
      'gossip', 'gos', 'auction', 'auc', 'tel', 'telepath', 'shout', 'yel',
      'group', 'gr', 'br', 'broadcast', '/block', '/unblock',
      'invite', 'join', 'kick', 'leave',
      'bank', 'bal', 'balance',
      'quest', 'qu'];
    // Also allow action commands while dropped
    if (!allowedDropped.includes(command) && !isActionCommand(command)) {
      return { type: MessageType.ERROR, message: 'You cannot do that while on the ground. Wait for aid or bleed out.' };
    }
  }

  // Clear enhanced regen state when any command other than 'rest' is entered
  // This breaks the resting state when the player takes any action
  if (command !== 'rest' && command !== 're' && socket.regenState.enhancedRegen.size > 0) {
    socket.regenState.enhancedRegen.clear();
    sendVitals(socket); // Update statline to remove resting status
  }

  const currentRoomId = getPlayerLocation(socket.playerId);

  if (command === 'look' || command === 'l') {
    // Check if looking at an item, player, or in a container
    if (args.length > 0) {
      // Check for "look in <container>"
      if (args[0].toLowerCase() === 'in' && args.length > 1) {
        return handleLookIn(socket, args.slice(1), currentRoomId);
      }
      const direction = DIRECTION_ALIASES[args[0]] || args[0];
      // If it's a direction, look in that direction
      if (isDirection(direction)) {
        return await handleLookDirection(socket, currentRoomId, direction, world, _connectedPlayers);
      }
      // Check if looking at self
      const targetName = args.join(' ').toLowerCase();
      if (socket.username.toLowerCase() === targetName || socket.username.toLowerCase().startsWith(targetName)) {
        return await handleLookAtPlayer(socket);
      }
      // Try to find another player in the room with that name (respects stealth visibility)
      const targetPlayer = findPlayerInRoom(targetName, currentRoomId, _connectedPlayers, socket.playerId, socket.canSeeHidden);
      if (targetPlayer) {
        const result = await handleLookAtPlayer(targetPlayer);
        // Notify the target player and room
        sendMessage(targetPlayer, MessageType.OUTPUT, colors.green(`${colors.red(socket.username)} looks you up and down.`));
        broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} looks ${colors.red(targetPlayer.username)} up and down.`), [socket.playerId, targetPlayer.playerId]);
        return result;
      }
      // Check if looking at an NPC
      const npcTarget = findNpcInRoom(targetName, currentRoomId);
      if (npcTarget) {
        return handleLookAtNpc(npcTarget);
      }
      // Check if looking at a special door (e.g., "look portal", "look vortex")
      const specialDoor = doorStateManager.findSpecialDoorByDisplayName(currentRoomId, targetName);
      if (specialDoor) {
        return handleLookAtSpecialDoor(specialDoor);
      }
      // Otherwise, examine an item
      return handleExamine(socket, args, currentRoomId);
    }
    // Broadcast that the player is looking around
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} looks around the room.`), socket.playerId);
    return await handleLook(socket, currentRoomId, world, _connectedPlayers, false);
  }

  if (command === 'examine' || command === 'exa') {
    return handleExamine(socket, args, currentRoomId);
  }

  if (command === 'get' || command === 'take' || command === 'g') {
    // Check for "get <item> from <container>"
    const fullArgs = args.join(' ');
    if (fullArgs.toLowerCase().includes(' from ')) {
      return handleGetFrom(socket, args, currentRoomId);
    }
    // Try currency handling first (e.g., "get gold", "get 50 gold")
    const currencyResult = await handleGetCurrency(socket, args, currentRoomId);
    if (currencyResult) {
      return currencyResult;
    }
    return handleGet(socket, args, currentRoomId);
  }

  if (command === 'put') {
    return handlePut(socket, args, currentRoomId);
  }

  if (command === 'drop') {
    // Try currency handling first (e.g., "drop 50 gold")
    const currencyResult = await handleDropCurrency(socket, args, currentRoomId);
    if (currencyResult) {
      return currencyResult;
    }
    return handleDrop(socket, args, currentRoomId);
  }

  if (command === 'inventory' || command === 'inv' || command === 'i') {
    return handleInventory(socket);
  }

  if (command === 'wield') {
    return handleWield(socket, args, currentRoomId);
  }

  if (command === 'wear') {
    return handleWear(socket, args, currentRoomId);
  }

  if (command === 'remove' || command === 'rem') {
    return handleRemove(socket, args, currentRoomId);
  }

  if (command === 'equipment' || command === 'eq') {
    return handleEquipment(socket);
  }

  if (command === 'use' || command === 'eat' || command === 'drink' || command === 'quaff') {
    // Check if this is a key usage: use [key] [direction]
    if (command === 'use' && args.length >= 2) {
      const lastArg = args[args.length - 1].toLowerCase();
      const possibleDirection = DIRECTION_ALIASES[lastArg] || lastArg;
      if (isDirection(possibleDirection)) {
        return await handleUseKey(socket, args, currentRoomId);
      }
    }
    // Otherwise handle as normal consumable item
    return handleUse(socket, args, currentRoomId);
  }

  if (command === 'light') {
    return handleLight(socket, args, currentRoomId);
  }

  if (command === 'extinguish' || command === 'douse') {
    return handleExtinguish(socket, args, currentRoomId);
  }

  if (command === 'repair') {
    return handleRepair(socket, args, currentRoomId);
  }

  if (command === 'search') {
    return handleSearch(socket, currentRoomId, _connectedPlayers);
  }

  if (command === 'recipes') {
    return handleRecipes(socket);
  }

  if (command === 'craft') {
    return handleCraft(socket, args, currentRoomId);
  }

  if (command === 'enchantments') {
    return handleEnchantments(socket);
  }

  if (command === 'enchant') {
    return handleEnchant(socket, args, currentRoomId);
  }

  if (command === 'glance') {
    // Internal command for empty enter - respects brief mode
    return await handleLook(socket, currentRoomId, world, _connectedPlayers, socket.briefMode);
  }

  if (command === 'brief') {
    return await handleBrief(socket);
  }

  if (DIRECTION_ALIASES[command] || isDirection(command)) {
    const direction = DIRECTION_ALIASES[command] || command;
    return await handleMove(socket, currentRoomId, direction, world, _connectedPlayers);
  }

  if (command === 'open') {
    return await handleOpenDoor(socket, args, currentRoomId);
  }

  if (command === 'close') {
    return await handleCloseDoor(socket, args, currentRoomId);
  }

  if (command === 'lock') {
    return await handleLockDoor(socket, args, currentRoomId);
  }

  if (command === 'pick') {
    return await handlePickDoor(socket, args, currentRoomId);
  }

  if (command === 'bash') {
    return await handleBashDoor(socket, args, currentRoomId);
  }

  if (command === 'help' || command === '?') {
    return handleHelp(socket.roles, args[0]);
  }

  if (command === 'who') {
    return handleWho(_connectedPlayers);
  }

  if (command === 'quit' || command === 'exit') {
    return { type: MessageType.SYSTEM, message: 'Type "x" to leave the realm.' };
  }

  if (command === 'x' && args.length === 0) {
    return handleExit(socket);
  }

  if (command === 'rest' || command === 're') {
    return handleRest(socket);
  }

  // Aid command - stabilize a fallen ally
  if (command === 'aid') {
    return handleAid(socket, args, currentRoomId, _connectedPlayers);
  }

  // Respawn command - return to life after death
  if (command === 'respawn') {
    return await handleRespawn(socket, world, _connectedPlayers);
  }

  // Combat commands
  if (command === 'attack' || command === 'att' || command === 'kill' || command === 'k' || command === 'a') {
    return handleAttack(socket, args, _connectedPlayers);
  }

  if (command === 'flee' || command === 'fl') {
    const fleeResult = await handleFlee(socket, world, _connectedPlayers);
    // Check for special flee movement marker
    if (fleeResult.type === MessageType.SYSTEM && fleeResult.message.startsWith('FLEE:')) {
      const direction = fleeResult.message.substring(5);
      broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} flees ${direction}!`), socket.playerId);
      return await handleMove(socket, currentRoomId, direction, world, _connectedPlayers);
    }
    return fleeResult;
  }

  // Break combat command (bre, brea, break)
  if ('break'.startsWith(command) && command.length >= 3) {
    return handleBreak(socket, _connectedPlayers);
  }

  // Stealth commands
  if (command === 'hide') {
    return handleHide(socket);
  }

  if (command === 'sneak' || command === 'sn') {
    return handleSneak(socket);
  }

  if (command === 'visible' || command === 'vis') {
    return handleVisible(socket);
  }

  if (command === 'backstab' || command === 'bs') {
    return handleBackstab(socket, args, _connectedPlayers);
  }

  // Spellbook command
  if (command === 'spells' || command === 'spellbook' || command === 'sp') {
    return handleSpellbook(socket);
  }

  // Training command (allocate CP to stats)
  if (command === 'train' || command === 'tr') {
    const trainResult = await handleTrain(socket, args.join(' '));
    // null means the training form was sent (no text response needed)
    if (trainResult === null) {
      return { type: MessageType.SYSTEM, message: '' };
    }
    return trainResult;
  }

  // Status/character sheet command (st, sta, stat, statu, status)
  if ('status'.startsWith(command) && command.length >= 2) {
    return handleStatus(socket);
  }

  // Queue status command - shows queued commands and current action
  if (command === 'queue' || command === 'que' || command === 'q') {
    return handleQueueStatus(socket);
  }

  // Cooldowns command - shows active ability cooldowns
  if (command === 'cooldowns' || command === 'cooldown' || command === 'cd') {
    return handleCooldowns(socket);
  }

  // Check for spell mnemonics (e.g., 'mmis goblin' for Magic Missile)
  if (isSpellMnemonic(command)) {
    return handleSpellCommand(socket, command, args, _connectedPlayers);
  }

  // ---------- Social / Chat commands ----------

  // Gossip channel
  if (command === 'gossip' || command === 'gos') {
    return handleGossip(socket, args, _connectedPlayers);
  }

  // Auction channel
  if (command === 'auction' || command === 'auc') {
    return handleAuction(socket, args, _connectedPlayers);
  }

  // Telepath (private message)
  if (command === 'tel' || command === 'telepath') {
    return handleTelepath(socket, args, _connectedPlayers);
  }

  // Block/unblock telepaths
  if (command === '/block') {
    return handleBlock(socket, args, _connectedPlayers);
  }
  if (command === '/unblock') {
    return handleUnblock(socket, args, _connectedPlayers);
  }

  // Shout (room + adjacent rooms)
  if (command === 'shout' || command === 'yel') {
    return handleShout(socket, args, _connectedPlayers, world);
  }

  // Broadcast channels
  if (command === 'broadcast' || command === 'br') {
    // "broadcast create <name> [password]"
    if (args.length >= 2 && args[0].toLowerCase() === 'create') {
      return handleBroadcastCreate(socket, args.slice(1), _connectedPlayers);
    }
    return handleBroadcast(socket, args, _connectedPlayers);
  }

  // Join: disambiguate broadcast vs group
  if (command === 'join') {
    if (args.length > 1 && args[0].toLowerCase() === 'br') {
      return handleJoinBroadcast(socket, args.slice(1), _connectedPlayers);
    }
    return handleJoinGroup(socket, args, _connectedPlayers);
  }

  // Leave: disambiguate broadcast vs group
  if (command === 'leave') {
    if (args.length > 0) {
      // If the player is in a broadcast channel matching the argument, leave that channel.
      // Otherwise treat it as a group leave (which will give its own error if not in a group).
      if (socket.broadcastChannel && socket.broadcastChannel === args[0].toLowerCase()) {
        return handleLeaveBroadcast(socket, args, _connectedPlayers);
      }
      return { type: MessageType.ERROR, message: `You are not in broadcast channel "${args[0]}". To leave your group, type "leave" with no arguments.` };
    }
    return handleLeaveGroup(socket, _connectedPlayers);
  }

  // Group invite
  if (command === 'invite') {
    return handleInvite(socket, args, _connectedPlayers);
  }

  // Group kick
  if (command === 'kick') {
    return handleKick(socket, args, _connectedPlayers);
  }

  // Group chat / status
  if (command === 'group' || command === 'gr') {
    return handleGroupChat(socket, args, _connectedPlayers);
  }

  // ---------- Banking commands ----------

  if (command === 'bank' || command === 'bal' || command === 'balance') {
    return handleBank(socket);
  }

  if (command === 'deposit' || command === 'dep') {
    return handleDeposit(socket, args);
  }

  if (command === 'withdraw' || command === 'wit') {
    return handleWithdraw(socket, args);
  }

  // ---------- Quest commands ----------

  if (command === 'quest' || command === 'qu') {
    return handleQuest(socket, args);
  }

  // ---------- Merchant commands ----------

  if (command === 'list') {
    return handleList(socket, args);
  }

  if (command === 'buy') {
    return handleBuy(socket, args);
  }

  if (command === 'sell') {
    return handleSell(socket, args);
  }

  if (command === 'price') {
    return handlePrice(socket, args);
  }

  if (command === 'haggle' || command === 'hag') {
    return handleHaggle(socket, args);
  }

  // Directed speech: >target message
  if (trimmed.startsWith('>')) {
    return await handleDirectedSpeech(socket, trimmed.slice(1), currentRoomId, _connectedPlayers);
  }

  // Check for temporary portal spawn triggers (e.g., "Valar Morghulis")
  // This spawns inactive portals, making them visible and usable
  const portalToSpawn = doorStateManager.findPortalBySpawnTrigger(currentRoomId, lowerTrimmed);
  if (portalToSpawn) {
    return await handlePortalSpawn(socket, portalToSpawn, currentRoomId);
  }

  // Check for special door triggers (e.g., "go portal", "climb rope")
  // This is checked before the default say handler so trigger text takes priority
  const specialDoor = doorStateManager.findSpecialDoorByTrigger(currentRoomId, lowerTrimmed);
  if (specialDoor) {
    return await handleSpecialDoorTrigger(socket, specialDoor, currentRoomId, world, _connectedPlayers);
  }

  // Handle emote command (/me or me)
  if (command === 'me' || command === '/me') {
    return handleEmoteCommand(socket, args, _connectedPlayers);
  }

  // Check for action commands (dance, bow, wave, etc.)
  if (isActionCommand(command)) {
    return handleActionCommand(socket, command, args, _connectedPlayers);
  }

  // Default: treat as speech
  return handleSay(socket, trimmed, _connectedPlayers);
}

function isDirection(cmd: string): boolean {
  const directions = ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest'];
  return directions.includes(cmd);
}

// Get names of other players in the same room (excluding the current player)
// Includes status indicators for dropped/dead players
// Hidden players are filtered out unless viewer has "see hidden" ability
function getOtherPlayersInRoom(
  roomId: number,
  excludePlayerId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  canSeeHidden: boolean = false
): string[] {
  const otherPlayers: string[] = [];
  for (const [playerId, socket] of connectedPlayers) {
    if (playerId !== excludePlayerId && !socket.isTraining && getPlayerLocation(playerId) === roomId) {
      // Check if player is hidden
      const playerIsHidden = isHidden(socket);

      // Skip hidden players unless viewer can see them
      if (playerIsHidden && !canSeeHidden) {
        continue;
      }

      let displayName = socket.username;

      // Add status indicators
      if (isPlayerDead(socket)) {
        displayName = `corpse of ${socket.username}`;
      } else if (isPlayerDropped(socket)) {
        displayName += ' (on the ground)';
      } else if (playerIsHidden && canSeeHidden) {
        // Show hidden indicator for those who can see hidden
        displayName += ' (hidden)';
      }
      otherPlayers.push(displayName);
    }
  }
  return otherPlayers;
}

// Get display names of NPCs in a room (for "Also here:" line)
// Returns pre-colored names: hostile NPCs in red, non-hostile in blue, corpses in gray
function getNpcDisplayNames(roomId: number): string[] {
  const npcs = getNpcsInRoom(roomId);
  const names: string[] = [];
  for (const npc of npcs) {
    if (npc.isCorpse) {
      names.push(colors.gray(`corpse of ${npc.entityName}`));
      continue;
    }
    if (npc.vitals.hp <= 0) continue; // Skip dead NPCs without corpse flag
    const name = npc.template.hostile
      ? colors.hostileInRoom(npc.entityName)
      : colors.npcInRoom(npc.entityName);
    names.push(name);
  }
  return names;
}

// Get names of all players in a room (for looking into adjacent rooms)
// Hidden players are filtered out unless viewer can see hidden
function getPlayersInRoom(
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  canSeeHidden: boolean = false
): string[] {
  const players: string[] = [];
  for (const [playerId, socket] of connectedPlayers) {
    if (socket.isTraining) continue;
    if (getPlayerLocation(playerId) === roomId) {
      const playerIsHidden = isHidden(socket);

      // Skip hidden players unless viewer can see them
      if (playerIsHidden && !canSeeHidden) {
        continue;
      }

      let displayName = socket.username;

      // Add status indicators (consistent with getOtherPlayersInRoom)
      if (isPlayerDead(socket)) {
        displayName = `corpse of ${socket.username}`;
      } else if (isPlayerDropped(socket)) {
        displayName += ' (on the ground)';
      } else if (playerIsHidden && canSeeHidden) {
        displayName += ' (hidden)';
      }
      players.push(displayName);
    }
  }
  return players;
}

/**
 * Observer data for stealth detection checks
 */
interface RoomObserver {
  name: string;
  perception: number;
}

/**
 * Get all players in a room (excluding one player) with their perception values
 * Used for stealth movement detection checks
 */
async function getObserversInRoom(
  roomId: number,
  excludePlayerId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<RoomObserver[]> {
  const observers: RoomObserver[] = [];

  for (const [playerId, socket] of connectedPlayers) {
    if (playerId !== excludePlayerId && !socket.isTraining && getPlayerLocation(playerId) === roomId) {
      // Dead/dropped players can't observe
      if (isPlayerDead(socket) || isPlayerDropped(socket)) {
        continue;
      }

      // Hidden players are focused on concealment, not observing
      if (isHidden(socket)) {
        continue;
      }

      // Calculate observer's perception
      const stats = socket.characterStats;
      const perceptionBreakdown = calculatePerception(
        stats.intelligence,
        stats.wisdom,
        stats.charisma,
        0 // TODO: Add equipment perception modifier in Phase 6
      );

      observers.push({
        name: socket.username,
        perception: perceptionBreakdown.total,
      });
    }
  }

  return observers;
}

/**
 * Calculate a player's current stealth value including encumbrance
 */
async function calculatePlayerStealth(socket: AuthenticatedSocket): Promise<number> {
  // Get character for race/class info
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) return 0;

  // Calculate encumbrance ratio
  const equipmentStats = await getEquipmentCombatStats(socket.characterId!);
  const encumbranceRatio = calculateEncumbranceRatio(
    equipmentStats.totalWeight,
    socket.characterStats.strength
  );

  // Calculate full stealth value
  const stealthBreakdown = await calculateStealth(
    {
      dexterity: socket.characterStats.dexterity,
      intelligence: socket.characterStats.intelligence,
      wisdom: socket.characterStats.wisdom,
      charisma: socket.characterStats.charisma,
      level: socket.characterLevel,
      race: character.race,
      class: character.class,
    },
    0, // TODO: Add equipment stealth modifier in Phase 6
    encumbranceRatio
  );

  return stealthBreakdown.total;
}

/**
 * Handle looking at another player
 * Returns their description based on stats, appearance, and equipment
 */
async function handleLookAtPlayer(
  targetSocket: AuthenticatedSocket
): Promise<CommandResponse> {
  // Get character data
  const character = await characterRepo.findCharacterById(targetSocket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Something went wrong.' };
  }

  // Get display names for race/class
  const sharedChar = await characterRepo.toSharedCharacterWithDisplayNames(character);

  // Get equipped items
  const equippedItems = await itemRepo.getPlayerEquipped(targetSocket.characterId!);

  // Generate description
  const description = generatePlayerDescription({
    character: sharedChar,
    currentHp: targetSocket.vitals.hp,
    maxHp: targetSocket.vitals.maxHp,
    equippedItems,
  });

  return { type: MessageType.OUTPUT, message: description };
}

/**
 * Handle looking at an NPC
 * Returns name, description, and HP status
 */
function handleLookAtNpc(npc: import('./npcManager.js').NpcCombatInstance): CommandResponse {
  const lines: string[] = [];

  // Name — prefix with "Merchant" if applicable
  const displayName = npc.template.merchantEnabled
    ? `Merchant ${npc.entityName}`
    : npc.entityName;
  lines.push(colors.boldYellow(displayName));

  // Description
  if (npc.template.description) {
    lines.push('');
    lines.push(wordWrap(npc.template.description, 80));
  }

  // HP status
  lines.push('');
  const hpPercent = Math.round((npc.vitals.hp / npc.vitals.maxHp) * 100);
  let hpStatus: string;
  if (hpPercent >= 90) {
    hpStatus = colors.green('is in excellent condition.');
  } else if (hpPercent >= 75) {
    hpStatus = colors.green('has a few scratches.');
  } else if (hpPercent >= 50) {
    hpStatus = colors.yellow('has some wounds.');
  } else if (hpPercent >= 25) {
    hpStatus = colors.red('is badly wounded.');
  } else if (hpPercent > 0) {
    hpStatus = colors.boldRed('is near death!');
  } else {
    hpStatus = colors.boldRed('is dead.');
  }
  lines.push(`${withNpcNameCapitalized(npc.entityName, npc.isProperName)} ${hpStatus}`);

  // Hostile indicator
  if (npc.template.hostile) {
    lines.push(colors.red(`${withNpcNameThe(npc.entityName, npc.isProperName)} looks hostile.`));
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Handle looking at a special door (portal, vortex, etc.)
 * Returns the door's description
 */
function handleLookAtSpecialDoor(door: Door): CommandResponse {
  if (door.description) {
    return { type: MessageType.OUTPUT, message: door.description };
  }
  // If no description, show a generic message using the display name
  const displayName = door.itemDisplayName || door.name;
  return { type: MessageType.OUTPUT, message: `You see ${displayName}.` };
}

async function handleLook(
  socket: AuthenticatedSocket,
  roomId: number,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  useBriefMode: boolean
): Promise<CommandResponse> {
  const room = world.getRoom(roomId);
  if (!room) {
    return { type: MessageType.ERROR, message: 'You are in an unknown location.' };
  }

  const otherPlayers = getOtherPlayersInRoom(roomId, socket.playerId, connectedPlayers, socket.canSeeHidden);
  const npcNames = getNpcDisplayNames(roomId);
  const itemDescriptions = await getRoomItemsDescription(roomId);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(room, otherPlayers, useBriefMode, itemDescriptions, npcNames) };
}

async function handleLookDirection(
  socket: AuthenticatedSocket,
  currentRoomId: number,
  direction: string,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Check if it's a valid direction
  if (!isDirection(direction)) {
    return { type: MessageType.ERROR, message: `You can't look that way.` };
  }

  const targetRoom = world.getRoomInDirection(currentRoomId, direction);
  if (!targetRoom) {
    return { type: MessageType.ERROR, message: `There is no exit ${direction}.` };
  }

  // Check if there's a door blocking the view
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, direction);
  if (door && door.doorType === DoorType.PHYSICAL) {
    const doorState = doorStateManager.getDoorState(door.id);
    if (doorState !== DoorState.OPEN) {
      // Can't see through a closed door
      return { type: MessageType.OUTPUT, message: `The ${getDoorDisplayName(door, direction)} is closed.` };
    }
  }

  // Notify players in the current room that someone is looking in a direction
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} looks ${direction}.`), socket.playerId);

  // Notify players in the target room that someone is peeking in
  const oppositeDir = OPPOSITE_DIRECTIONS[direction] || direction;
  broadcastToRoom(targetRoom.id, colors.green(`${colors.red(socket.username)} peeks in from the ${oppositeDir}.`), socket.playerId);

  // Show the full room including players, NPCs, and exits
  const playersInRoom = getPlayersInRoom(targetRoom.id, connectedPlayers, socket.canSeeHidden);
  const adjacentNpcNames = getNpcDisplayNames(targetRoom.id);
  const itemDescriptions = await getRoomItemsDescription(targetRoom.id);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(targetRoom, playersInRoom, false, itemDescriptions, adjacentNpcNames) };
}

async function handleBrief(socket: AuthenticatedSocket): Promise<CommandResponse> {
  const newBriefMode = !socket.briefMode;

  // Save to database first, only update memory if successful
  try {
    await playerRepo.setBriefMode(socket.playerId, newBriefMode);
    socket.briefMode = newBriefMode;
  } catch (error) {
    console.error('Failed to save brief mode:', error);
    return { type: MessageType.ERROR, message: 'Failed to save preference. Please try again.' };
  }

  if (socket.briefMode) {
    return { type: MessageType.SYSTEM, message: 'Brief mode on.' };
  } else {
    return { type: MessageType.SYSTEM, message: 'Brief mode off.' };
  }
}

function handleExit(socket: AuthenticatedSocket): CommandResponse {
  // If already meditating, just acknowledge
  if (socket.exitTimer) {
    return { type: MessageType.SYSTEM, message: 'You are already meditating to leave the realm...' };
  }

  // Broadcast to others in the room that this player is meditating
  const currentRoomId = getPlayerLocation(socket.playerId);
  broadcastToRoom(currentRoomId, `${socket.username} sits down to meditate...`, socket.playerId);

  // Start the 10 second countdown
  socket.exitTimer = setTimeout(() => {
    socket.exitTimer = undefined;
    // Mark as properly exited so disconnect message is friendly
    socket.properlyExited = true;
    // Send logout message to trigger client-side logout
    const logoutMessage: GameMessage = {
      type: MessageType.LOGOUT,
      payload: 'You have left the realm.',
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(logoutMessage));
    // Close the socket after a brief delay to ensure message is sent
    setTimeout(() => socket.close(), 100);
  }, EXIT_MEDITATION_TIMEOUT_MS);

  return { type: MessageType.SYSTEM, message: 'You sit down and meditate...' };
}

function handleRest(socket: AuthenticatedSocket): CommandResponse {
  // Check if already resting
  if (socket.regenState.enhancedRegen.has('mana') && socket.regenState.enhancedRegen.has('health')) {
    return { type: MessageType.SYSTEM, message: 'You are already resting.' };
  }

  // Check if in combat (self-heal stale flag if no targets exist on either side)
  if (socket.regenState.inCombat) {
    if (socket.combatState.targets.size === 0 && !isPlayerTargetedByAnyNpc(socket.playerId)) {
      socket.regenState.inCombat = false;
    } else {
      return { type: MessageType.ERROR, message: 'You cannot rest while in combat!' };
    }
  }

  // Check if poisoned
  if (socket.regenState.isPoisoned) {
    return { type: MessageType.ERROR, message: 'You cannot rest while poisoned!' };
  }

  // Enable enhanced regeneration for mana and health
  socket.regenState.enhancedRegen.add('mana');
  socket.regenState.enhancedRegen.add('health');

  // Broadcast to others in the room
  const currentRoomId = getPlayerLocation(socket.playerId);
  broadcastToRoom(currentRoomId, `${socket.username} sits down to rest.`, socket.playerId);

  return { type: MessageType.SYSTEM, message: 'You sit down and rest. (Type any command to stand up)' };
}

// Map direction to opposite direction for "walks in from" messages
const OPPOSITE_DIRECTIONS: Record<string, string> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'below',
  down: 'above',
  northeast: 'southwest',
  northwest: 'southeast',
  southeast: 'northwest',
  southwest: 'northeast',
};

/**
 * Move a group follower to the same room the leader just entered.
 * Mirrors the relevant parts of handleMove but skips direction validation
 * and recursive auto-follow. Door/permission checks are enforced per-follower.
 */
async function moveFollower(
  follower: AuthenticatedSocket,
  oldRoomId: number,
  direction: string,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<void> {
  // Re-check: follower may have moved or entered combat since setImmediate was scheduled
  if (getPlayerLocation(follower.playerId) !== oldRoomId) return;
  if (follower.regenState.inCombat) return;
  if (isPlayerDead(follower) || isPlayerDropped(follower)) return;

  // Check door restrictions for this follower individually
  const door = doorStateManager.getDoorByRoomAndDirection(oldRoomId, direction);
  if (door) {
    // Block special/triggered/temporary doors
    if (
      door.doorType === DoorType.SPECIAL ||
      door.doorType === DoorType.TRIGGERED_PASSAGEWAY ||
      door.doorType === DoorType.TEMPORARY_PORTAL
    ) {
      sendMessage(follower, MessageType.OUTPUT, colors.yellow(`You cannot follow through that passage.`));
      return;
    }

    // Check per-player permissions (level, class, required item)
    const permissionError = await checkDoorPermissionsForPlayer(door, follower);
    if (permissionError) {
      sendMessage(follower, MessageType.OUTPUT, permissionError.message);
      return;
    }

    // Check door state (closed/locked)
    const passageCheck = doorStateManager.canPassThrough(door.id, oldRoomId);
    if (!passageCheck.allowed) {
      sendMessage(follower, MessageType.OUTPUT, colors.yellow(passageCheck.reason || 'You cannot follow that way.'));
      return;
    }
  }

  const newRoom = world.getRoomInDirection(oldRoomId, direction);
  if (!newRoom) return; // Should never happen since leader already moved

  // Save to DB
  try {
    await characterRepo.updateCharacterRoom(follower.characterId!, newRoom.id);
  } catch (error) {
    console.error('Failed to save follower room location:', error);
    sendMessage(follower, MessageType.ERROR, 'Something prevents you from following.');
    return;
  }

  // Handle stealth: hidden → sneaking for movement
  if (isHidden(follower)) {
    setStealthMode(follower, 'sneaking');
  }

  // Exit announcement
  if (isSneaking(follower)) {
    sendMessage(follower, MessageType.OUTPUT, colors.cyan('Sneaking...'));
  } else {
    broadcastToRoom(oldRoomId, colors.green(`${colors.red(follower.username)} left to the ${direction}.`), follower.playerId);
  }

  // Update in-memory location
  setPlayerLocation(follower.playerId, newRoom.id);

  // Entry announcement
  const oppositeDir = OPPOSITE_DIRECTIONS[direction] || direction;

  if (isSneaking(follower)) {
    const observers = await getObserversInRoom(newRoom.id, follower.playerId, connectedPlayers);
    if (observers.length > 0) {
      const stealthValue = await calculatePlayerStealth(follower);
      const detectionResult = rollCumulativeDetection(stealthValue, observers);
      if (detectionResult.detected) {
        breakStealth(follower, 'movement_failed', false);
        broadcastToRoom(newRoom.id, colors.green(`You notice ${colors.red(follower.username)} sneaking into the room.`), follower.playerId);
        broadcastToRoom(oldRoomId, colors.green(`You notice ${colors.red(follower.username)} slipping away.`), follower.playerId);
      }
    }
  } else {
    broadcastToRoom(newRoom.id, colors.green(`${colors.red(follower.username)} walks in from the ${oppositeDir}.`), follower.playerId);
  }

  // Send room description to follower
  const otherPlayers = getOtherPlayersInRoom(newRoom.id, follower.playerId, connectedPlayers, follower.canSeeHidden);
  const npcNames = getNpcDisplayNames(newRoom.id);
  const itemDescriptions = await getRoomItemsDescription(newRoom.id);
  const roomDescription = world.formatRoomDescription(newRoom, otherPlayers, follower.briefMode, itemDescriptions, npcNames);
  sendMessage(follower, MessageType.OUTPUT, roomDescription);

  // Trigger aggro check in new room
  setImmediate(() => checkHostileAggro(newRoom.id, follower));

  // Check for quest visit triggers
  setImmediate(() => checkVisitTrigger(follower, newRoom.id));
}

async function handleMove(
  socket: AuthenticatedSocket,
  currentRoomId: number,
  direction: string,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  if (!direction) {
    return { type: MessageType.ERROR, message: 'Go where?' };
  }

  const fullDirection = DIRECTION_ALIASES[direction] || direction;

  // Check if there's a door in this direction
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, fullDirection);
  if (door) {
    // Special doors, triggered passageways, and temporary portals cannot be entered by direction
    // They require trigger text (e.g., "go portal", "enter hole", "climb rope")
    if (
      door.doorType === DoorType.SPECIAL ||
      door.doorType === DoorType.TRIGGERED_PASSAGEWAY ||
      door.doorType === DoorType.TEMPORARY_PORTAL
    ) {
      broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} ran into the wall to the ${fullDirection}.`), socket.playerId);
      return { type: MessageType.OUTPUT, message: colors.yellow(`You cannot go ${fullDirection}.`) };
    }

    // Check door permissions first (before passage checks)
    const permissionError = await checkDoorPermissionsForPlayer(door, socket);
    if (permissionError) {
      return permissionError;
    }

    const passageCheck = doorStateManager.canPassThrough(door.id, currentRoomId);
    if (!passageCheck.allowed) {
      // Broadcast that player ran into the door
      broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} ran into the ${getDoorDisplayName(door, fullDirection)}.`), socket.playerId);
      return { type: MessageType.OUTPUT, message: colors.yellow(passageCheck.reason || 'You cannot go that way.') };
    }
  }

  const newRoom = world.getRoomInDirection(currentRoomId, fullDirection);

  if (!newRoom) {
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} ran into the wall to the ${fullDirection}.`), socket.playerId);
    return { type: MessageType.OUTPUT, message: colors.yellow(`You cannot go ${fullDirection}.`) };
  }

  // Save room location to database first
  try {
    await characterRepo.updateCharacterRoom(socket.characterId!, newRoom.id);
  } catch (error) {
    console.error('Failed to save room location:', error);
    return { type: MessageType.ERROR, message: 'Something prevents you from moving.' };
  }

  // Database succeeded, now update in-memory state

  // Handle stealth movement
  const wasStealthing = isStealthing(socket);
  let playerMessage: string | undefined;

  // If hidden, auto-transition to sneaking for movement
  if (isHidden(socket)) {
    setStealthMode(socket, 'sneaking');
  }

  // Handle exit room announcement based on stealth state
  if (isSneaking(socket)) {
    // Sneaking player - no announcement to room, show message to player
    playerMessage = colors.cyan('Sneaking...');
  } else {
    // Normal movement - broadcast to room
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} left to the ${fullDirection}.`), socket.playerId);
  }

  // Update player location
  setPlayerLocation(socket.playerId, newRoom.id);

  // Handle entry room announcement based on stealth state
  const oppositeDir = OPPOSITE_DIRECTIONS[fullDirection] || fullDirection;

  if (isSneaking(socket)) {
    // Get observers in the new room for stealth check
    const observers = await getObserversInRoom(newRoom.id, socket.playerId, connectedPlayers);

    if (observers.length > 0) {
      // Calculate player's stealth value
      const stealthValue = await calculatePlayerStealth(socket);

      // Roll cumulative detection check against all observers
      const detectionResult = rollCumulativeDetection(
        stealthValue,
        observers
      );

      if (detectionResult.detected) {
        // Sneak failed - break stealth and announce arrival
        playerMessage = undefined; // Clear "Sneaking..." since we failed
        breakStealth(socket, 'movement_failed', false); // Don't double-notify room

        // Notify observers they detected someone sneaking in
        broadcastToRoom(newRoom.id, colors.green(`You notice ${colors.red(socket.username)} sneaking into the room.`), socket.playerId);

        // Also announce departure to old room (if they didn't already know)
        if (wasStealthing) {
          broadcastToRoom(currentRoomId, colors.green(`You notice ${colors.red(socket.username)} slipping away.`), socket.playerId);
        }
      }
      // If sneak succeeded, no announcements needed (silent entry)
    }
    // If no observers in new room, sneak auto-succeeds (silent entry)
  } else {
    // Normal movement - broadcast arrival to new room
    broadcastToRoom(newRoom.id, colors.green(`${colors.red(socket.username)} walks in from the ${oppositeDir}.`), socket.playerId);
  }

  // Build room description
  const otherPlayers = getOtherPlayersInRoom(newRoom.id, socket.playerId, connectedPlayers, socket.canSeeHidden);
  const npcNames = getNpcDisplayNames(newRoom.id);
  const itemDescriptions = await getRoomItemsDescription(newRoom.id);
  let roomDescription = world.formatRoomDescription(newRoom, otherPlayers, socket.briefMode, itemDescriptions, npcNames);

  // Prepend stealth message if applicable
  if (playerMessage) {
    roomDescription = playerMessage + '\r\n' + roomDescription;
  }

  // Defer hostile aggro check until after the room description is sent to the player.
  // checkHostileAggro sends combat messages via WebSocket immediately, but the room
  // description is only sent after processCommand returns. Without deferring, the
  // "attacks you!" message arrives before the player sees the room.
  setImmediate(() => checkHostileAggro(newRoom.id, socket));

  // Check for quest visit triggers after room description
  setImmediate(() => checkVisitTrigger(socket, newRoom.id));

  // Auto-follow: if the mover is a group leader, move followers who are in the old room
  if (isGroupLeader(socket.playerId)) {
    const group = getGroupForPlayer(socket.playerId);
    if (group) {
      // Collect eligible followers before any async work
      const followers: AuthenticatedSocket[] = [];
      for (const memberId of group.members) {
        if (memberId === socket.playerId) continue;
        const memberSocket = connectedPlayers.get(memberId);
        if (!memberSocket) continue;
        // Must be in the room the leader just left
        if (getPlayerLocation(memberId) !== currentRoomId) continue;
        // Cannot follow if dead or dropped
        if (isPlayerDead(memberSocket) || isPlayerDropped(memberSocket)) continue;
        // Cannot follow if in combat
        if (memberSocket.regenState.inCombat) continue;
        followers.push(memberSocket);
      }

      // Move each follower asynchronously (fire-and-forget so leader isn't delayed)
      if (followers.length > 0) {
        setImmediate(async () => {
          for (const follower of followers) {
            try {
              await moveFollower(follower, currentRoomId, fullDirection, world, connectedPlayers);
            } catch (err) {
              console.error(`Auto-follow failed for ${follower.username}:`, err);
            }
          }
        });
      }
    }
  }

  return { type: MessageType.OUTPUT, message: roomDescription };
}

type DoorAction = 'open' | 'close';

async function handleDoorAction(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number,
  action: DoorAction
): Promise<CommandResponse> {
  const verb = action;
  const verbs = action === 'open' ? 'opens' : 'closes';
  const capitalVerb = action.charAt(0).toUpperCase() + action.slice(1);

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: `${capitalVerb} what?` };
  }

  // Parse direction from args
  const directionArg = args[0].toLowerCase();
  const direction = DIRECTION_ALIASES[directionArg] || directionArg;

  // Find door in the specified direction
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, direction);
  if (!door) {
    if (!isDirection(direction)) {
      return { type: MessageType.ERROR, message: `${capitalVerb} what?` };
    }
    return { type: MessageType.ERROR, message: `There is no door to the ${direction}.` };
  }

  // Check door permissions first (before any other checks)
  const permissionError = await checkDoorPermissionsForPlayer(door, socket);
  if (permissionError) {
    return permissionError;
  }

  // Only physical doors can be opened/closed
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot ${verb} the ${getDoorDisplayName(door, direction)}.` };
  }

  // Get current state (null treated as closed)
  const currentState = doorStateManager.getDoorState(door.id);
  const doorDisplay = getDoorDisplayName(door, direction);

  // Validate state and perform action
  if (action === 'open') {
    if (currentState === DoorState.OPEN) {
      return { type: MessageType.ERROR, message: `The ${doorDisplay} is already open.` };
    }
    if (currentState === DoorState.LOCKED) {
      return { type: MessageType.ERROR, message: `The ${doorDisplay} is locked.` };
    }
    doorStateManager.openDoor(door.id);
  } else {
    if (currentState !== DoorState.OPEN) {
      return { type: MessageType.ERROR, message: `The ${doorDisplay} is already closed.` };
    }
    doorStateManager.closeDoor(door.id);
  }

  // Broadcast to current room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} ${verbs} the ${doorDisplay}.`), socket.playerId);

  // Broadcast to the other side (if two-way door) using the opposite direction
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    const oppositeDirection = OPPOSITE_DIRECTIONS[direction] || direction;
    const otherDoorDisplay = getDoorDisplayName(door, oppositeDirection);
    broadcastToRoom(otherRoomId, `The ${otherDoorDisplay} ${verbs} from the other side.`);
  }

  return { type: MessageType.OUTPUT, message: `You ${verb} the ${doorDisplay}.` };
}

async function handleOpenDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  return handleDoorAction(socket, args, currentRoomId, 'open');
}

async function handleCloseDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  return handleDoorAction(socket, args, currentRoomId, 'close');
}

/**
 * Check if a player has an item with the specified tag (key_tag) in their inventory
 * Used for both door lock keys and door permission requirements
 * The item is not consumed when used for permission checks
 */
async function playerHasItemWithTag(characterId: number, itemTag: string): Promise<boolean> {
  const inventory = await itemRepo.getCharacterInventory(characterId);
  return inventory.some(item => item.template?.flags?.key_tag === itemTag);
}

/**
 * Attempt to consume a key after use (for consumable keys)
 * Returns a message if the key was consumed, null otherwise
 */
async function maybeConsumeKey(characterId: number, keyTag: string): Promise<string | null> {
  const key = await itemRepo.findKeyWithTag(characterId, keyTag);
  if (!key || !key.template) return null;

  const flags = key.template.flags;

  // Check if key should be consumed
  let shouldConsume = false;
  let isIntentionalConsume = false;

  if (flags.consumeOnUse) {
    // Always consume (intentional single-use key)
    shouldConsume = true;
    isIntentionalConsume = true;
  } else if (flags.consumeChance && flags.consumeChance > 0) {
    // Roll for break chance (accidental breakage)
    const roll = Math.floor(Math.random() * 100) + 1;
    shouldConsume = roll <= flags.consumeChance;
  }

  if (shouldConsume) {
    const consumed = await itemRepo.consumeOneFromStack(key.id);
    if (consumed) {
      // Different messages for intentional consumption vs accidental breakage
      if (isIntentionalConsume) {
        return `Your ${key.template.name} crumbles to dust.`;
      } else {
        return `Your ${key.template.name} breaks!`;
      }
    }
  }

  return null;
}

/**
 * Check door permissions for a character
 * Returns null if allowed, or an error CommandResponse if not allowed
 */
async function checkDoorPermissionsForPlayer(
  door: Door,
  socket: AuthenticatedSocket
): Promise<CommandResponse | null> {
  // Fast path: no permission requirements
  if (!doorStateManager.doorHasPermissionRequirements(door)) {
    return null;
  }

  // Get character data for permission check
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Check if player has the required item (if any)
  let hasRequiredItem = true;
  if (door.requiredItemTag) {
    hasRequiredItem = await playerHasItemWithTag(socket.characterId!, door.requiredItemTag);
  }

  // Check quest flag (only query DB if door requires one)
  let questFlags: string[] | undefined;
  if (door.requiredQuestFlag) {
    const hasFlag = await questRepo.hasQuestFlag(socket.characterId!, door.requiredQuestFlag);
    questFlags = hasFlag ? [door.requiredQuestFlag] : [];
  }

  const permissionCheck = doorStateManager.checkDoorPermissions(
    door,
    { level: character.level, class: character.class, questFlags },
    hasRequiredItem
  );

  if (!permissionCheck.allowed) {
    return { type: MessageType.ERROR, message: permissionCheck.reason || 'You cannot use this door.' };
  }

  return null;
}

/**
 * Get the player-facing display name for a door.
 * Uses displayName if set, otherwise returns "door to the [direction]" or just "door".
 */
function getDoorDisplayName(door: Door, direction?: string): string {
  if (door.displayName) {
    return direction ? `${door.displayName} to the ${direction}` : door.displayName;
  }
  return direction ? `door to the ${direction}` : 'the door';
}

async function handleLockDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Lock what?' };
  }

  // Parse direction from args
  const directionArg = args[0].toLowerCase();
  const direction = DIRECTION_ALIASES[directionArg] || directionArg;

  // Find door in the specified direction
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, direction);
  if (!door) {
    if (!isDirection(direction)) {
      return { type: MessageType.ERROR, message: 'Lock what?' };
    }
    return { type: MessageType.ERROR, message: `There is no door to the ${direction}.` };
  }

  // Check door permissions first (before any other checks)
  const permissionError = await checkDoorPermissionsForPlayer(door, socket);
  if (permissionError) {
    return permissionError;
  }

  const doorDisplay = getDoorDisplayName(door, direction);

  // Only physical doors can be locked
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot lock the ${doorDisplay}.` };
  }

  // Check if door has a lock
  if (!door.hasLock) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} has no lock.` };
  }

  // Check current state
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState === DoorState.LOCKED) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} is already locked.` };
  }
  if (currentState === DoorState.OPEN) {
    return { type: MessageType.ERROR, message: `You need to close the ${doorDisplay} first.` };
  }

  // Check if player has the right key
  if (door.keyItemTag) {
    const hasKey = await playerHasItemWithTag(socket.characterId!, door.keyItemTag);
    if (!hasKey) {
      return { type: MessageType.ERROR, message: `You don't have the right key.` };
    }
  }

  // Lock the door
  doorStateManager.lockDoor(door.id);

  // Broadcast to current room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} locks the ${doorDisplay}.`), socket.playerId);

  // Broadcast to the other side (if two-way door) using the opposite direction
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    const oppositeDirection = OPPOSITE_DIRECTIONS[direction] || direction;
    const otherDoorDisplay = getDoorDisplayName(door, oppositeDirection);
    broadcastToRoom(otherRoomId, `The ${otherDoorDisplay} locks from the other side.`);
  }

  // Check if key should be consumed
  let message = `You lock the ${doorDisplay}.`;
  if (door.keyItemTag) {
    const consumeMessage = await maybeConsumeKey(socket.characterId!, door.keyItemTag);
    if (consumeMessage) {
      message += `\r\n${colors.yellow(consumeMessage)}`;
    }
  }

  return { type: MessageType.OUTPUT, message };
}

/**
 * Handle unlocking a door using a specific key from inventory.
 * Command: use [key keyword...] [direction]
 * Example: "use crusty key west" or "use cru west"
 */
async function handleUseKey(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Use what key on what?' };
  }

  // Last arg is direction, all others are the key keyword
  const directionArg = args[args.length - 1].toLowerCase();
  const direction = DIRECTION_ALIASES[directionArg] || directionArg;
  const keyKeyword = args.slice(0, -1).join(' ').toLowerCase();

  // Validate direction
  if (!isDirection(direction)) {
    return { type: MessageType.ERROR, message: `"${directionArg}" is not a valid direction. Try: use [key] [direction]` };
  }

  // Find key in inventory by keyword (must have key_tag flag)
  const matchingItems = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyKeyword);

  // Filter to only items with key_tag (keys)
  const keys = matchingItems.filter(item => item.template?.flags?.key_tag);

  if (keys.length === 0) {
    // Check if we found items but none were keys
    if (matchingItems.length > 0) {
      return { type: MessageType.ERROR, message: `The ${matchingItems[0].template?.name ?? 'item'} is not a key.` };
    }
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (keys.length > 1) {
    // Multiple matching keys - need disambiguation
    const keyNames = keys.map(k => k.template?.name ?? 'key').join(', ');
    return { type: MessageType.ERROR, message: `Which key do you mean: ${keyNames}?` };
  }

  const key = keys[0];
  const keyName = key.template?.name ?? 'key';
  const keyTag = key.template?.flags?.key_tag as string;

  // Find door in the specified direction
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, direction);
  if (!door) {
    return { type: MessageType.ERROR, message: `There is no door to the ${direction}.` };
  }

  const doorDisplay = getDoorDisplayName(door, direction);

  // Check door permissions first (before any other checks)
  const permissionError = await checkDoorPermissionsForPlayer(door, socket);
  if (permissionError) {
    return permissionError;
  }

  // Only physical doors can be unlocked
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot unlock the ${doorDisplay}.` };
  }

  // Check if door has a lock
  if (!door.hasLock) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} has no lock.` };
  }

  // Check current state
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState !== DoorState.LOCKED) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} is not locked.` };
  }

  // Check if this key matches the door's lock
  if (!door.keyItemTag || door.keyItemTag !== keyTag) {
    return { type: MessageType.ERROR, message: `The ${keyName} doesn't fit this lock.` };
  }

  // Unlock the door
  doorStateManager.unlockDoor(door.id);

  // Broadcast to current room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} unlocks the ${doorDisplay} with a key.`), socket.playerId);

  // Broadcast to the other side (if two-way door) using the opposite direction
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    const oppositeDirection = OPPOSITE_DIRECTIONS[direction] || direction;
    const otherDoorDisplay = getDoorDisplayName(door, oppositeDirection);
    broadcastToRoom(otherRoomId, `The ${otherDoorDisplay} unlocks from the other side.`);
  }

  // Check if key should be consumed
  let message = `You unlock the ${doorDisplay} with the ${keyName}.`;
  const consumeMessage = await maybeConsumeKey(socket.characterId!, keyTag);
  if (consumeMessage) {
    message += `\r\n${colors.yellow(consumeMessage)}`;
  }

  return { type: MessageType.OUTPUT, message };
}

/**
 * Calculate a character's bash stat (for bashing doors)
 * Based primarily on strength with some level bonus
 */
function calculateBashStat(character: {
  strength: number;
  level: number;
}): number {
  // Base bash from strength
  const strengthBonus = character.strength;

  // Level bonus: 1 point per level
  const levelBonus = character.level;

  // TODO: Add race/class bonuses
  // TODO: Add equipment bonuses

  return strengthBonus + levelBonus;
}

/**
 * Check if a lockpick breaks on a failed pick attempt.
 * Returns a break message if the lockpick broke, or null if it survived.
 */
async function checkLockpickBreakage(
  lockpick: Awaited<ReturnType<typeof itemRepo.findBestLockpickInInventory>>
): Promise<string | null> {
  if (!lockpick || !lockpick.template?.tool_data) {
    return null;
  }

  const durability = lockpick.template.tool_data.durability ?? 50;

  // Durability 101+ means unbreakable
  if (durability >= 101) {
    return null;
  }

  // Roll 1-100; if roll > durability, the lockpick breaks
  const breakRoll = Math.floor(Math.random() * 100) + 1;

  if (breakRoll <= durability) {
    // Survived
    return null;
  }

  // Lockpick breaks - atomically consume one from stack
  const consumed = await itemRepo.consumeOneFromStack(lockpick.id);

  if (!consumed) {
    // Item was already consumed or doesn't exist - don't show break message
    return null;
  }

  return `Your ${colors.item(lockpick.template.name)} broke!`;
}

async function handlePickDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Pick what?' };
  }

  // Get character data
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Check if character has lockpicking ability
  const hasAbility = await characterHasLockpicking(character.race, character.class);
  if (!hasAbility) {
    return { type: MessageType.ERROR, message: `You don't know how to pick locks.` };
  }

  // Parse direction from args
  const directionArg = args[0].toLowerCase();
  const direction = DIRECTION_ALIASES[directionArg] || directionArg;

  // Find door in the specified direction
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, direction);
  if (!door) {
    if (!isDirection(direction)) {
      return { type: MessageType.ERROR, message: 'Pick what?' };
    }
    return { type: MessageType.ERROR, message: `There is no door to the ${direction}.` };
  }

  // Check door permissions first (before any other checks)
  // Permission checks occur before lock checks per design doc
  const permissionError = await checkDoorPermissionsForPlayer(door, socket);
  if (permissionError) {
    return permissionError;
  }

  // Check for lockpicks in inventory
  const lockpick = await itemRepo.findBestLockpickInInventory(socket.characterId!);
  if (!lockpick) {
    return { type: MessageType.ERROR, message: `You don't have any lockpicks.` };
  }

  // Get lockpick quality bonus (1-5)
  const lockpickQuality = lockpick.template?.tool_data?.quality ?? 0;
  const doorDisplay = getDoorDisplayName(door, direction);

  // Only physical doors can be picked
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot pick the ${doorDisplay}.` };
  }

  // Check if door has a lock
  if (!door.hasLock) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} has no lock to pick.` };
  }

  // Check current state
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState !== DoorState.LOCKED) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} is not locked.` };
  }

  // Check pick difficulty - max of 500+ means unpickable
  if (door.pickDifficultyMax >= 500) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} cannot be picked.` };
  }

  // Calculate lockpicking stat (includes lockpick quality bonus)
  const lockpickingBreakdown = await calculateLockpicking(
    {
      dexterity: character.dexterity,
      intelligence: character.intelligence,
      level: character.level,
      race: character.race,
      class: character.class,
    },
    lockpickQuality
  );
  const lockpickingStat = lockpickingBreakdown.total;

  // Range-based mechanics:
  // - If skill < min difficulty -> 100% fail
  // - If skill >= max difficulty -> 100% success
  // - Otherwise -> roll within range
  const minDiff = door.pickDifficultyMin;
  const maxDiff = door.pickDifficultyMax;

  // Auto-fail if skill is below minimum
  if (lockpickingStat < minDiff) {
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} fails to pick the ${doorDisplay}.`), socket.playerId);

    // Check if lockpick breaks on failure
    const breakMessage = await checkLockpickBreakage(lockpick);
    const failMessage = `The lock on the ${doorDisplay} is beyond your skill.`;

    return {
      type: MessageType.OUTPUT,
      message: breakMessage ? `${failMessage}\r\n${breakMessage}` : failMessage,
    };
  }

  // Auto-success if skill meets or exceeds maximum
  if (lockpickingStat >= maxDiff) {
    // Success! Unlock the door
    doorStateManager.unlockDoor(door.id);

    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} easily picks the lock on the ${doorDisplay}.`), socket.playerId);

    const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
    if (otherRoomId) {
      const oppositeDirection = OPPOSITE_DIRECTIONS[direction] || direction;
      const otherDoorDisplay = getDoorDisplayName(door, oppositeDirection);
      broadcastToRoom(otherRoomId, `The ${otherDoorDisplay} clicks as its lock is picked.`);
    }

    return {
      type: MessageType.OUTPUT,
      message: `You easily pick the lock on the ${doorDisplay}.`,
    };
  }

  // Roll within the range: roll between min and max, succeed if roll <= skill
  const roll = Math.floor(Math.random() * (maxDiff - minDiff + 1)) + minDiff;

  if (roll > lockpickingStat) {
    // Failed attempt - broadcast to room
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} fails to pick the ${doorDisplay}.`), socket.playerId);

    // Check if lockpick breaks on failure
    const breakMessage = await checkLockpickBreakage(lockpick);
    const failMessage = `You fail to pick the lock on the ${doorDisplay}.`;

    return {
      type: MessageType.OUTPUT,
      message: breakMessage ? `${failMessage}\r\n${breakMessage}` : failMessage,
    };
  }

  // Success! Unlock the door (which sets it to CLOSED state)
  doorStateManager.unlockDoor(door.id);

  // Broadcast success to current room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} picks the lock on the ${doorDisplay}.`), socket.playerId);

  // Broadcast to the other side (if two-way door) using the opposite direction
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    const oppositeDirection = OPPOSITE_DIRECTIONS[direction] || direction;
    const otherDoorDisplay = getDoorDisplayName(door, oppositeDirection);
    broadcastToRoom(otherRoomId, `The ${otherDoorDisplay} clicks as its lock is picked.`);
  }

  return {
    type: MessageType.OUTPUT,
    message: `You pick the lock on the ${doorDisplay}.`,
  };
}

async function handleBashDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Bash what?' };
  }

  // Get character data
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Parse direction from args
  const directionArg = args[0].toLowerCase();
  const direction = DIRECTION_ALIASES[directionArg] || directionArg;

  // Find door in the specified direction
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, direction);
  if (!door) {
    if (!isDirection(direction)) {
      return { type: MessageType.ERROR, message: 'Bash what?' };
    }
    return { type: MessageType.ERROR, message: `There is no door to the ${direction}.` };
  }

  // Check door permissions first (before any other checks)
  // Permission checks occur before lock checks per design doc
  const permissionError = await checkDoorPermissionsForPlayer(door, socket);
  if (permissionError) {
    return permissionError;
  }

  const doorDisplay = getDoorDisplayName(door, direction);

  // Only physical doors can be bashed
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot bash the ${doorDisplay}.` };
  }

  // Check current state - can bash closed or locked doors
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState === DoorState.OPEN) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} is already open.` };
  }

  // Check bash difficulty - negative means unbashable
  // High values (500+) are mathematically unbashable but allow attempts
  if (door.bashDifficulty < 0) {
    return { type: MessageType.ERROR, message: `The ${doorDisplay} cannot be bashed open.` };
  }

  // Calculate bash stat
  const bashStat = calculateBashStat(character);

  // Roll 0-100
  const roll = Math.floor(Math.random() * 101);

  // Calculate total: roll + bash stat
  const total = roll + bashStat;

  // Check against difficulty
  if (total < door.bashDifficulty) {
    // Failed attempt - deal damage to player (1-2% of max HP)
    const damagePercent = 1 + Math.random(); // 1-2%
    const damage = Math.max(1, Math.floor(character.max_health * damagePercent / 100));

    // Update character health
    const newHealth = Math.max(1, character.health - damage); // Don't kill from bash damage
    await characterRepo.updateCharacterStats(socket.characterId!, { health: newHealth });

    // Update socket's cached vitals and send to client
    socket.vitals.hp = newHealth;
    sendVitals(socket);

    // Broadcast failed attempt to room
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} slams into the ${doorDisplay} and bounces off!`), socket.playerId);

    return {
      type: MessageType.OUTPUT,
      message: `You slam into the ${doorDisplay} but it doesn't budge! You take ${colors.red(damage.toString())} damage.`,
    };
  }

  // Success! If locked, unlock first, then open
  if (currentState === DoorState.LOCKED) {
    doorStateManager.unlockDoor(door.id);
  }
  doorStateManager.openDoor(door.id);

  // Broadcast success to current room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} bashes open the ${doorDisplay}!`), socket.playerId);

  // Broadcast to the other side (if two-way door) using the opposite direction
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    const oppositeDirection = OPPOSITE_DIRECTIONS[direction] || direction;
    const otherDoorDisplay = getDoorDisplayName(door, oppositeDirection);
    broadcastToRoom(otherRoomId, `The ${otherDoorDisplay} bursts open with a crash!`);
  }

  return {
    type: MessageType.OUTPUT,
    message: `You bash open the ${doorDisplay}!`,
  };
}

/**
 * Handle passing through a special door via trigger text (e.g., "go portal", "climb rope")
 * Special doors appear on the "Also here:" line and require specific text to activate
 */
async function handleSpecialDoorTrigger(
  socket: AuthenticatedSocket,
  door: Door,
  currentRoomId: number,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Check door permissions first (before passage checks)
  const permissionError = await checkDoorPermissionsForPlayer(door, socket);
  if (permissionError) {
    return permissionError;
  }

  // Check if door can be passed through (validates room connection, one-way rules, etc.)
  const passageCheck = doorStateManager.canPassThrough(door.id, currentRoomId);
  if (!passageCheck.allowed) {
    return { type: MessageType.ERROR, message: passageCheck.reason || 'You cannot go that way.' };
  }

  // Get the destination room — for one-directional doors (no exitRoomId),
  // fall back to the room's normal exit in the door's entry direction
  let destinationRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (!destinationRoomId) {
    const exitRoom = world.getRoomInDirection(currentRoomId, door.entryDirection);
    destinationRoomId = exitRoom?.id ?? null;
  }
  if (!destinationRoomId) {
    return { type: MessageType.ERROR, message: 'The passage leads nowhere.' };
  }

  const newRoom = world.getRoom(destinationRoomId);
  if (!newRoom) {
    return { type: MessageType.ERROR, message: 'Something prevents you from passing through.' };
  }

  // Save room location to database first
  try {
    await characterRepo.updateCharacterRoom(socket.characterId!, newRoom.id);
  } catch (error) {
    console.error('Failed to save room location:', error);
    return { type: MessageType.ERROR, message: 'Something prevents you from moving.' };
  }

  // Database succeeded, now update in-memory state and broadcast

  // Broadcast departure message to current room (custom or default)
  const departureMessage = wordWrap(door.passageMessageRoom
    ? door.passageMessageRoom.replace('{player}', colors.red(socket.username))
    : `${colors.red(socket.username)} passes through ${door.itemDisplayName || door.name}.`, 80);
  broadcastToRoom(currentRoomId, colors.green(departureMessage), socket.playerId);

  // Update player location
  setPlayerLocation(socket.playerId, newRoom.id);

  // Broadcast arrival to new room
  const arrivalMessage = colors.green(`${colors.red(socket.username)} arrives.`);
  broadcastToRoom(newRoom.id, arrivalMessage, socket.playerId);

  // Build player's passage message (custom or default)
  const playerMessage = wordWrap(door.passageMessageSelf
    ? door.passageMessageSelf
    : `You pass through ${door.itemDisplayName || door.name}.`, 80);

  // Get the new room display
  const otherPlayers = getOtherPlayersInRoom(newRoom.id, socket.playerId, connectedPlayers, socket.canSeeHidden);
  const itemDescriptions = await getRoomItemsDescription(newRoom.id);
  const roomDisplay = world.formatRoomDescription(newRoom, otherPlayers, socket.briefMode, itemDescriptions);

  return {
    type: MessageType.OUTPUT,
    message: `${playerMessage}\r\n\r\n${roomDisplay}`,
  };
}

/**
 * Handle spawning a temporary portal when player speaks the spawn trigger text
 * The portal appears in the room and becomes usable for its duration
 */
async function handlePortalSpawn(
  socket: AuthenticatedSocket,
  door: Door,
  currentRoomId: number
): Promise<CommandResponse> {
  // Check door permissions first (before allowing portal spawn)
  const permissionError = await checkDoorPermissionsForPlayer(door, socket);
  if (permissionError) {
    return permissionError;
  }

  // Check if portal is already active
  if (doorStateManager.isPortalActive(door.id)) {
    // Portal already exists - don't spawn again, just acknowledge
    // This prevents spamming the spawn trigger to extend duration
    return {
      type: MessageType.OUTPUT,
      message: `You speak the words, but nothing new happens.`,
    };
  }

  // Spawn the portal
  const spawned = doorStateManager.spawnPortal(door.id);
  if (!spawned) {
    return {
      type: MessageType.ERROR,
      message: 'Nothing happens.',
    };
  }

  // Build the appearance message
  // Use custom appear message if set, otherwise generate default
  let appearanceMessage: string;
  if (door.appearMessage) {
    appearanceMessage = door.appearMessage;
  } else {
    // Use the display name as-is (it already has an article like "a whirling vortex")
    // Capitalize first letter for sentence start
    const portalName = door.itemDisplayName || door.name || 'a portal';
    const capitalizedName = portalName.charAt(0).toUpperCase() + portalName.slice(1);
    appearanceMessage = `${capitalizedName} appears out of thin air!`;
  }

  // Broadcast to room (including the player who spawned it)
  broadcastToRoom(currentRoomId, appearanceMessage);

  // Also broadcast to exit room if it's a two-way portal
  if (door.exitRoomId && door.exitRoomId !== currentRoomId) {
    broadcastToRoom(door.exitRoomId, appearanceMessage);
  }

  // Return empty response since the broadcast already notified everyone
  return {
    type: MessageType.OUTPUT,
    message: '',
  };
}

function handleSay(
  socket: AuthenticatedSocket,
  message: string,
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (!message) {
    return { type: MessageType.ERROR, message: 'Say what?' };
  }

  // Send to others in the same room: "Username says:"
  const othersMessage = `${colors.sayName(socket.username + ' says:')} ${colors.say('"' + message + '"')}`;
  const currentRoomId = getPlayerLocation(socket.playerId);
  
  // Broadcast to players in the same room only
  for (const [playerId, playerSocket] of connectedPlayers) {
    if (playerId !== socket.playerId && getPlayerLocation(playerId) === currentRoomId) {
      const gameMessage: GameMessage = {
        type: MessageType.OUTPUT,
        payload: othersMessage,
        timestamp: Date.now(),
      };
      playerSocket.send(JSON.stringify(gameMessage));
    }
  }

  // Return to speaker: "You say:"
  return { type: MessageType.OUTPUT, message: `${colors.sayName('You say:')} ${colors.say('"' + message + '"')}` };
}

async function handleDirectedSpeech(
  socket: AuthenticatedSocket,
  input: string,
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Parse ">target message" — first word is target, rest is message
  const spaceIdx = input.indexOf(' ');
  if (spaceIdx < 0 || input.trim().length === 0) {
    return { type: MessageType.ERROR, message: 'Say what to whom? Usage: >target message' };
  }

  const targetName = input.substring(0, spaceIdx).trim();
  const message = input.substring(spaceIdx + 1).trim();

  if (!targetName || !message) {
    return { type: MessageType.ERROR, message: 'Say what to whom? Usage: >target message' };
  }

  // Check players in room first
  const targetPlayer = findPlayerInRoom(targetName, roomId, connectedPlayers, socket.playerId, socket.canSeeHidden);
  if (targetPlayer) {
    // Broadcast to room (exclude speaker and target)
    for (const [playerId, playerSocket] of connectedPlayers) {
      if (playerId !== socket.playerId && playerId !== targetPlayer.playerId && getPlayerLocation(playerId) === roomId) {
        const gameMessage: GameMessage = {
          type: MessageType.OUTPUT,
          payload: `${colors.sayName(socket.username + ' says to ' + targetPlayer.username + ':')} ${colors.say('"' + message + '"')}`,
          timestamp: Date.now(),
        };
        playerSocket.send(JSON.stringify(gameMessage));
      }
    }

    // Notify target
    const targetMsg: GameMessage = {
      type: MessageType.OUTPUT,
      payload: `${colors.sayName(socket.username + ' says to you:')} ${colors.say('"' + message + '"')}`,
      timestamp: Date.now(),
    };
    targetPlayer.send(JSON.stringify(targetMsg));

    return {
      type: MessageType.OUTPUT,
      message: `${colors.sayName('You say to ' + targetPlayer.username + ':')} ${colors.say('"' + message + '"')}`,
    };
  }

  // Check NPCs in room (skip dead/corpse NPCs)
  const npcTarget = findNpcInRoom(targetName, roomId);
  if (npcTarget && npcTarget.vitals.hp > 0 && !npcTarget.isCorpse) {
    // Broadcast to room
    for (const [playerId, playerSocket] of connectedPlayers) {
      if (playerId !== socket.playerId && getPlayerLocation(playerId) === roomId) {
        const gameMessage: GameMessage = {
          type: MessageType.OUTPUT,
          payload: `${colors.sayName(socket.username + ' says to ' + npcTarget.entityName + ':')} ${colors.say('"' + message + '"')}`,
          timestamp: Date.now(),
        };
        playerSocket.send(JSON.stringify(gameMessage));
      }
    }

    // Check for merchant keyword response
    if (npcTarget.template.merchantEnabled) {
      const npcResponse = await getResponseForKeywords(npcTarget.template.id, message);
      if (npcResponse) {
        // Send merchant's response to speaker after their speech (via sendMessage),
        // then broadcast to the rest of the room. The speaker's own speech line is
        // returned as the CommandResponse so it arrives first.
        const merchantLine = `${colors.sayName(npcTarget.entityName + ' says:')} ${colors.say('"' + npcResponse + '"')}`;
        // Use setTimeout(0) to ensure the CommandResponse (player's speech) is sent first
        setTimeout(() => {
          if (socket.readyState === socket.OPEN) {
            sendMessage(socket, MessageType.OUTPUT, merchantLine);
          }
          broadcastToRoom(roomId, merchantLine, socket.playerId);
        }, 0);
        return {
          type: MessageType.OUTPUT,
          message: `${colors.sayName('You say to ' + npcTarget.entityName + ':')} ${colors.say('"' + message + '"')}`,
        };
      }
    }

    // Check for quest trigger
    const questResponse = await checkTalkTrigger(socket, npcTarget.templateId, message);
    if (questResponse !== null) {
      // Quest system handled this speech
      if (questResponse) {
        // NPC has dialogue to show (denial, in-progress, completed)
        const npcLine = `${colors.sayName(npcTarget.entityName + ' says:')} ${colors.say('"' + questResponse + '"')}`;
        setTimeout(() => {
          if (socket.readyState === socket.OPEN) {
            sendMessage(socket, MessageType.OUTPUT, npcLine);
          }
          broadcastToRoom(roomId, npcLine, socket.playerId);
        }, 0);
      }
      // Empty string = quest event handled, messages sent via setTimeout
      return {
        type: MessageType.OUTPUT,
        message: `${colors.sayName('You say to ' + npcTarget.entityName + ':')} ${colors.say('"' + message + '"')}`,
      };
    }

    return {
      type: MessageType.OUTPUT,
      message: `${colors.sayName('You say to ' + npcTarget.entityName + ':')} ${colors.say('"' + message + '"')}`,
    };
  }

  return { type: MessageType.ERROR, message: `There is no ${targetName} here.` };
}

function handleHelp(userRoles: Role[], category?: string): CommandResponse {
  const isStaff = hasAnyRole(userRoles, [Role.MODERATOR, Role.SYSOP, Role.DEVELOPER, Role.ADMIN]);
  const isDeveloper = hasAnyRole(userRoles, [Role.DEVELOPER, Role.ADMIN]);
  
  // Handle specific category requests
  if (category) {
    const cat = category.toLowerCase();
    
    if (cat === 'staff') {
      if (!isStaff) {
        return { type: MessageType.ERROR, message: 'You do not have access to staff commands.' };
      }
      return getStaffHelp();
    }
    
    if (cat === 'developer' || cat === 'dev') {
      if (!isDeveloper) {
        return { type: MessageType.ERROR, message: 'You do not have access to developer commands.' };
      }
      return getDeveloperHelp();
    }
    
    if (cat === 'admin') {
      if (!isStaff) {
        return { type: MessageType.ERROR, message: 'You do not have access to admin commands.' };
      }
      return { type: MessageType.SYSTEM, message: 'Use @help for the full admin command reference.' };
    }

    if (cat === 'actions' || cat === 'action' || cat === 'emotes' || cat === 'emote') {
      return getActionsHelp();
    }

    if (cat === 'stealth') {
      return getStealthHelp();
    }

    // Unknown category - show player help with note (only suggest staff options if user has access)
    const suggestions = isStaff
      ? 'Try: help, help actions, help stealth, help staff, help developer, or @help'
      : 'Try: help, help actions, help stealth';
    return { type: MessageType.ERROR, message: `Unknown help category: ${category}. ${suggestions}` };
  }
  
  // Default: show player commands
  const lines = [
    colors.boldYellow('Player Commands:'),
    '',
    colors.boldCyan('  Movement & Looking:'),
    `    ${colors.white('look')} (l)              - Look around the current room`,
    `    ${colors.white('look <direction>')}      - Look in a direction`,
    `    ${colors.white('look <item>')}           - Examine an item`,
    `    ${colors.white('look in <container>')}   - View container contents`,
    `    ${colors.white('<direction>')}           - Move (n, s, e, w, ne, nw, se, sw, u, d)`,
    `    ${colors.white('open <direction>')}      - Open a door`,
    `    ${colors.white('close <direction>')}     - Close a door`,
    `    ${colors.white('use <key> <direction>')} - Unlock a door with a key`,
    `    ${colors.white('lock <direction>')}      - Lock an unlocked door (requires key)`,
    `    ${colors.white('pick <direction>')}      - Pick the lock on a door (thief skills)`,
    `    ${colors.white('bash <direction>')}      - Bash a door open (uses strength)`,
    `    ${colors.white('brief')}                 - Toggle brief mode`,
    '',
    colors.boldCyan('  Items & Inventory:'),
    `    ${colors.white('get <item>')}            - Pick up an item`,
    `    ${colors.white('get <item> from <container>')} - Get from container`,
    `    ${colors.white('drop <item>')}           - Drop an item`,
    `    ${colors.white('put <item> in <container>')} - Put in container`,
    `    ${colors.white('inventory')} (i)         - List items you are carrying`,
    `    ${colors.white('search')}                - Search for hidden items`,
    '',
    colors.boldCyan('  Equipment:'),
    `    ${colors.white('wield <item>')}          - Wield a weapon`,
    `    ${colors.white('wear <item>')}           - Wear armor or accessories`,
    `    ${colors.white('remove <item>')}         - Remove equipped item`,
    `    ${colors.white('equipment')} (eq)        - List equipped items`,
    '',
    colors.boldCyan('  Using Items:'),
    `    ${colors.white('use <item>')}            - Use a consumable item`,
    `    ${colors.white('use <key> <direction>')} - Unlock a door with a key`,
    `    ${colors.white('eat/drink/quaff <item>')} - Consume food/drink/potion`,
    `    ${colors.white('light <item>')}          - Light a torch or lantern`,
    `    ${colors.white('extinguish <item>')}     - Put out a light source`,
    `    ${colors.white('repair <item>')}         - Repair a damaged item`,
    '',
    colors.boldCyan('  Crafting:'),
    `    ${colors.white('recipes')}               - List known crafting recipes`,
    `    ${colors.white('craft <recipe>')}        - Craft an item`,
    `    ${colors.white('enchantments')}          - List known enchantments`,
    `    ${colors.white('enchant <item> with <enchantment>')} - Enchant an item`,
    '',
    colors.boldCyan('  Combat:'),
    `    ${colors.white('attack <player>')} (k)   - Attack another player`,
    `    ${colors.white('flee')} (fl)             - Attempt to flee from combat`,
    `    ${colors.white('aid <player>')}          - Stabilize a fallen ally`,
    '',
    colors.boldCyan('  Stealth:'),
    `    ${colors.white('hide')}                  - Attempt to hide in the shadows`,
    `    ${colors.white('sneak')} (sn)            - Attempt to move stealthily`,
    `    ${colors.white('backstab <player>')} (bs) - Surprise attack from stealth`,
    `    ${colors.white('visible')} (vis)         - Stop hiding or sneaking`,
    `    ${colors.gray('Stealth requires a race or class with the stealth ability.')}`,
    '',
    colors.boldCyan('  Death & Revival:'),
    `    ${colors.white('respawn')}               - Return to life at a safe location (when dead)`,
    `    ${colors.gray('When you drop to 0 HP, you collapse. Allies can "aid" you.')}`,
    `    ${colors.gray('If you die, your items drop. Type "respawn" to return.')}`,'',
    '',
    colors.boldCyan('  Magic:'),
    `    ${colors.white('spells')} (sp)           - View your spellbook`,
    `    ${colors.white('<mnemonic> <target>')}   - Cast a spell (e.g., mmis goblin)`,
    '',
    colors.boldCyan('  Progression:'),
    `    ${colors.white('train')} (tr)            - Level up (in training room)`,
    `    ${colors.white('train stats')}           - Allocate CP to stats (in training room)`,
    '',
    colors.boldCyan('  Banking:'),
    `    ${colors.white('bank')} (bal)            - Check your bank balance`,
    `    ${colors.white('deposit all')} (dep)     - Deposit all currency`,
    `    ${colors.white('deposit <amt> [type]')}  - Deposit currency (in bank)`,
    `    ${colors.white('withdraw all')} (wit)    - Withdraw all funds`,
    `    ${colors.white('withdraw <amt> [type]')} - Withdraw currency (in bank)`,
    '',
    colors.boldCyan('  Quests:'),
    `    ${colors.white('quest')} (qu)             - List active quests`,
    `    ${colors.white('quest log')}              - Detailed quest journal`,
    `    ${colors.white('quest info <name>')}      - View a specific quest's details`,
    '',
    colors.boldCyan('  Merchants:'),
    `    ${colors.white('list')}                  - View merchant inventory and prices`,
    `    ${colors.white('buy <item>')}            - Buy an item from a merchant`,
    `    ${colors.white('sell <item>')}           - Sell an item to a merchant`,
    `    ${colors.white('price <item>')}          - Check buy/sell price of an item`,
    `    ${colors.white('haggle')} (hag)          - Try to get better prices`,
    `    ${colors.white('>merchant message')}     - Say something to a merchant`,
    '',
    colors.boldCyan('  Chat Channels:'),
    `    ${colors.white('gossip <msg>')} (gos)    - Send to gossip channel`,
    `    ${colors.white('gossip on/off')}         - Toggle gossip channel`,
    `    ${colors.white('auction <msg>')} (auc)   - Send to auction channel`,
    `    ${colors.white('auction on/off')}        - Toggle auction channel`,
    `    ${colors.white('tel <player> <msg>')}    - Send private telepath`,
    `    ${colors.white('tel on/off')}            - Toggle receiving telepaths`,
    `    ${colors.white('/block <player>')}       - Block telepaths from player`,
    `    ${colors.white('/unblock <player>')}     - Unblock a player`,
    `    ${colors.white('shout <msg>')} (yel)     - Shout to room and adjacent rooms`,
    '',
    colors.boldCyan('  Broadcast Channels:'),
    `    ${colors.white('broadcast create <name> [pass]')} - Create a channel`,
    `    ${colors.white('join br <name> [pass]')} - Join a broadcast channel`,
    `    ${colors.white('leave <channel>')}       - Leave a broadcast channel`,
    `    ${colors.white('br <msg>')}              - Send to your broadcast channel`,
    `    ${colors.white('br')}                    - List channel members`,
    '',
    colors.boldCyan('  Groups:'),
    `    ${colors.white('invite <player>')}       - Invite a player to your group`,
    `    ${colors.white('join <leader>')}         - Accept a group invitation`,
    `    ${colors.white('leave')}                 - Leave your group`,
    `    ${colors.white('kick <player>')}         - Kick a member (leader only)`,
    `    ${colors.white('group <msg>')} (gr)      - Send to group chat`,
    `    ${colors.white('group')}                 - Show group status`,
    '',
    colors.boldCyan('  Social:'),
    `    ${colors.white('/me <text>')}            - Custom emote (e.g., /me waves)`,
    `    ${colors.white('<action>')}              - Social actions (dance, bow, wave, etc.)`,
    `    ${colors.white('<action> <player>')}     - Target a player (e.g., wave bob)`,
    `    ${colors.white('help actions')}          - List all available social actions`,
    '',
    colors.boldCyan('  Information & System:'),
    `    ${colors.white('status')} (st)            - View your character sheet`,
    `    ${colors.white('queue')} (q)              - Show queued commands`,
    `    ${colors.white('cooldowns')} (cd)         - Show ability cooldowns`,
    `    ${colors.white('rest')} (re)             - Rest to regenerate faster`,
    `    ${colors.white('who')}                   - See who is online`,
    `    ${colors.white('x')}                     - Meditate and leave the realm`,
    `    ${colors.white('help')} (?)              - Show this help message`,
  ];

  // Add note about additional help categories for staff/developers
  if (isStaff || isDeveloper) {
    lines.push('');
    lines.push(colors.boldYellow('Additional Help:'));
    if (isStaff) {
      lines.push(`  ${colors.white('help staff')}           - View staff commands`);
    }
    if (isDeveloper) {
      lines.push(`  ${colors.white('help developer')}       - View developer commands`);
    }
    if (isStaff) {
      lines.push(`  ${colors.white('@help')}                - Full admin command reference`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function getStaffHelp(): CommandResponse {
  const lines = [
    colors.boldYellow('Staff Commands:'),
    '',
    `  ${colors.boldCyan('@goto <id>')}              - Teleport to a room`,
    `  ${colors.boldCyan('@rooms')}                  - List all rooms`,
    `  ${colors.boldCyan('@roominfo [id]')}          - Show room details`,
    `  ${colors.boldCyan('@give <id|name> [qty]')}   - Give yourself an item`,
    `  ${colors.boldCyan('@help')}                   - Show full admin command reference`,
  ];

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function getDeveloperHelp(): CommandResponse {
  const lines = [
    colors.boldYellow('Developer Commands:'),
    '',
    colors.boldCyan('  Room Building:'),
    `    ${colors.white('@create room <name>')}     - Create a new room`,
    `    ${colors.white('@link <dir> <id> [oneway]')} - Link current room to another`,
    `    ${colors.white('@unlink <dir> [oneway]')}  - Remove an exit`,
    `    ${colors.white('@edit <field> <value>')}   - Edit current room (name/desc/area)`,
    `    ${colors.white('@delete room <id>')}       - Delete a room`,
    '',
    colors.boldCyan('  Item Management:'),
    `    ${colors.white('@items')}                  - List all item templates`,
    `    ${colors.white('@iteminfo <id|name>')}     - Show item template details`,
    `    ${colors.white('@spawn <id|name> [qty]')}  - Spawn item in your inventory`,
    `    ${colors.white('@purge items')}            - Remove all items from room`,
    `    ${colors.white('@purge item <id>')}        - Remove specific item instance`,
    '',
    colors.boldCyan('  Progression System:'),
    `    ${colors.white('@classes')}                - List all classes`,
    `    ${colors.white('@classinfo <id>')}         - Show class details`,
    `    ${colors.white('@races')}                  - List all races`,
    `    ${colors.white('@raceinfo <id>')}          - Show race details`,
    `    ${colors.white('@abilities [type]')}       - List abilities`,
    `    ${colors.white('@talents [class]')}        - List talents`,
    `    ${colors.white('@events')}                 - List essence events`,
    '',
    colors.boldCyan('  System:'),
    `    ${colors.white('@reload [type]')}              - Reload data from database`,
    '',
    `Type ${colors.boldCyan('@help')} for the full admin command reference.`,
  ];

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function getActionsHelp(): CommandResponse {
  const actions = getActionHelpList();

  if (actions.length === 0) {
    return {
      type: MessageType.OUTPUT,
      message: colors.yellow('No social actions are currently available.'),
    };
  }

  const lines = [
    colors.boldYellow('Social Actions:'),
    '',
    'Perform actions by typing their name. Add a player\'s name to target them.',
    '',
  ];

  // Find the longest command for padding, capped at 15 to ensure 80-char width
  const maxCmdLen = 15;
  const maxLen = Math.min(maxCmdLen, Math.max(...actions.map(a => a.command.length)));

  for (const action of actions) {
    // Truncate command if too long
    let cmd = action.command;
    if (cmd.length > maxCmdLen) {
      cmd = cmd.slice(0, maxCmdLen - 1) + '…';
    }
    const paddedCmd = cmd.padEnd(maxLen + 2);
    let desc = action.description || '(no description)';
    // Truncate description to fit 80 char width: 2 indent + cmd + 3 " - " = 5 + maxLen + 2
    const maxDescLen = 80 - 5 - maxLen - 2;
    if (desc.length > maxDescLen) {
      desc = desc.slice(0, maxDescLen - 3) + '...';
    }
    lines.push(`  ${colors.white(paddedCmd)} - ${desc}`);
  }

  lines.push('');
  lines.push(colors.boldCyan('Examples:'));
  lines.push(`  ${colors.white('dance')}             - You dance a little jig!`);
  lines.push(`  ${colors.white('wave bob')}          - You wave at Bob.`);
  lines.push('');
  lines.push(colors.gray('Tip: Use /me <text> for custom emotes (e.g., /me stretches)'));

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function getStealthHelp(): CommandResponse {
  const lines = [
    colors.boldYellow('Stealth System:'),
    '',
    colors.boldCyan('Requirements:'),
    '  Your race or class must have the stealth trait to use stealth abilities.',
    '  You cannot use stealth while in combat.',
    '',
    colors.boldCyan('Commands:'),
    `  ${colors.white('hide')}                  - Attempt to hide in the shadows`,
    `  ${colors.white('sneak')} (sn)            - Attempt to move stealthily`,
    `  ${colors.white('backstab <target>')} (bs) - Surprise attack from stealth`,
    `  ${colors.white('visible')} (vis)         - Stop hiding or sneaking`,
    `  ${colors.white('search')}                - Search for hidden players and items`,
    '',
    colors.boldCyan('Stealth Modes:'),
    `  ${colors.yellow('Hidden')} - You are invisible in the room. Other players must`,
    '            "search" to find you. Moving transitions to sneaking.',
    `  ${colors.yellow('Sneaking')} - You are visible but move silently. Entering a`,
    '              room tests your stealth vs observers\' perception.',
    '',
    colors.boldCyan('Backstab Mechanics:'),
    '  - Must be sneaking or hidden to backstab',
    '  - Requires a one-handed weapon (cannot backstab with two-handed)',
    '  - Deals high damage: 2-4x weapon max damage + level bonuses',
    '  - Accuracy based on DEX, INT, CHA, stealth, and weapon modifiers',
    '  - Always breaks stealth and engages combat (hit or miss)',
    '  - Weapon choice matters: daggers have accuracy bonuses, swords have penalties',
    '',
    colors.boldCyan('Stealth Breaks When:'),
    '  - You attack or cast a spell',
    '  - You are detected while sneaking into a room',
    '  - You use a social action targeting another player',
    '  - You use the "visible" command',
    '',
    colors.boldCyan('Stealth Modifiers:'),
    '  - Equipment can add or subtract from stealth (heavy armor = penalty)',
    '  - Encumbrance affects stealth (heavy load = -25 penalty)',
    '  - Weapon backstab accuracy varies (daggers +5 to +15, swords -5 to -10)',
    '',
    colors.gray('Tip: Use lighter armor and daggers for maximum stealth effectiveness.'),
  ];

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function handleWho(connectedPlayers: Map<number, AuthenticatedSocket>): CommandResponse {
  const players = Array.from(connectedPlayers.values())
    .filter(p => !p.isTraining)
    .map(p => colors.player(p.username));
  const count = players.length;
  const list = players.join(', ');

  return {
    type: MessageType.OUTPUT,
    message: `${colors.boldYellow('Players Online (' + count + '):')} ${list}`,
  };
}

async function handleStatus(socket: AuthenticatedSocket): Promise<CommandResponse> {
  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  const character = await characterRepo.findCharacterById(socket.characterId);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Get display names for class and race
  const classDef = await progressionRepo.getClassById(character.class);
  const raceDef = await progressionRepo.getRaceById(character.race);
  const className = classDef?.display_name || character.class;
  const raceName = raceDef?.display_name || character.race;

  // Build the MajorMUD-style 3-column character sheet
  // Colors: Labels are green, values are cyan
  // Format from MajorMUD:
  // Name: Slaughter Machine               Lives/CP:      9/0
  // Race: Elf         Exp: 3000000000     Perception:     47
  // Class: Warrior    Level: 10           Stealth:        44
  // Hits:   133/133   Armour Class:  26/6 Thievery:        0
  //                                       Traps:           0
  //                                       Picklocks:       0
  // Strength:  65     Dexterity:    70    Tracking:        0
  // Intellect: 50     Constitution: 70    Martial Arts:   23
  // Wisdom:    40     Charisma:     50    MagicRes:       42

  const lines: string[] = [];

  // Column widths (widened for readability)
  const COL1 = 18;  // First column width
  const COL2 = 20;  // Second column width
  const COL3 = 18;  // Third column width
  const GAP = 2;    // Space between columns
  const LABEL_WIDTH = 7;  // Fixed label width for Name/Race/Class alignment

  // Helper: Cell with green label and cyan LEFT-aligned value (for text like Name, Race, Class)
  // Label is padded to LABEL_WIDTH so values align vertically
  const cellLeft = (label: string, value: string, width: number): string => {
    const paddedLabel = label.padEnd(LABEL_WIDTH);
    const content = paddedLabel + value;
    const padding = Math.max(0, width - content.length);
    return colors.green(paddedLabel) + colors.cyan(value) + ' '.repeat(padding + GAP);
  };

  // Helper: Cell with green label and cyan RIGHT-aligned value (for numbers)
  const cellRight = (label: string, value: string, width: number): string => {
    const valueWidth = width - label.length;
    return colors.green(label) + colors.cyan(value.padStart(valueWidth)) + ' '.repeat(GAP);
  };

  // Helper: Empty cell
  const empty = (width: number): string => ' '.repeat(width + GAP);

  // Build each row
  const maxResource = socket.vitals.maxResource ?? 0;
  const resource = socket.vitals.resource ?? 0;
  const hp = socket.vitals.hp;
  const maxHp = socket.vitals.maxHp;
  const lives = 0; // Not implemented
  const cp = character.unspent_cp ?? 0;

  // Calculate perception (everyone has it)
  const perceptionBreakdown = calculatePerception(
    character.intelligence,
    character.wisdom,
    character.charisma,
    0 // TODO: equipment perception modifier
  );
  const perception = perceptionBreakdown.total;

  // Calculate stealth (only if character has stealth ability)
  const hasStealth = await characterHasStealth(character.race, character.class);
  let stealth = 0;
  if (hasStealth) {
    const stealthBreakdown = await calculateStealth(
      {
        dexterity: character.dexterity,
        intelligence: character.intelligence,
        wisdom: character.wisdom,
        charisma: character.charisma,
        level: character.level,
        race: character.race,
        class: character.class,
      },
      0, // TODO: equipment stealth modifier
      0  // TODO: encumbrance ratio
    );
    stealth = stealthBreakdown.total;
  }

  // Calculate lockpicking (only if character has lockpicking ability)
  const hasLockpicking = await characterHasLockpicking(character.race, character.class);
  let picklocks = 0;
  if (hasLockpicking) {
    const lockpickingBreakdown = await calculateLockpicking({
      dexterity: character.dexterity,
      intelligence: character.intelligence,
      level: character.level,
      race: character.race,
      class: character.class,
    });
    picklocks = lockpickingBreakdown.total;
  }

  // Unimplemented skills (show 0)
  const pickpocket = 0;
  const traps = 0;
  const tracking = 0;
  const martialArts = 0;
  const magicRes = 0;

  // Get actual armor stats from equipped items
  const equipmentStats = await getEquipmentCombatStats(socket.characterId);
  const ac = Math.floor(equipmentStats.armor.totalArmorClass);
  const dr = Math.floor(equipmentStats.armor.damageReduction);
  const armourClass = `${ac}/${dr}`;

  // Row 1: Name (spans col1+col2+gap) | Lives/CP
  // Add extra GAP to match the space that would be between col1 and col2 in other rows
  const fullName = character.last_name?.trim() ? `${character.name} ${character.last_name.trim()}` : character.name;
  lines.push(
    cellLeft('Name:', fullName, COL1 + COL2 + GAP) +
    cellRight('Lives/CP:', `${lives}/${cp}`, COL3)
  );

  // Row 2: Race | Exp | Perception
  lines.push(
    cellLeft('Race:', raceName, COL1) +
    cellRight('Exp:', character.experience.toString(), COL2) +
    cellRight('Perception:', perception.toString(), COL3)
  );

  // Row 3: Class | Level | Stealth
  lines.push(
    cellLeft('Class:', className, COL1) +
    cellRight('Level:', character.level.toString(), COL2) +
    cellRight('Stealth:', stealth.toString(), COL3)
  );

  // Row 4: Hits | Armour Class | Thievery
  lines.push(
    cellRight('Hits:', `${hp}/${maxHp}`, COL1) +
    cellRight('Armour Class:', armourClass, COL2) +
    cellRight('Pickpocket:', pickpocket.toString(), COL3)
  );

  // Row 5: Mana/Kai (if applicable) | (empty) | Traps
  const hasResource = socket.vitals.resourceType !== ResourceType.NONE;
  const resourceLabel = socket.vitals.resourceType === ResourceType.KAI ? 'Kai:' : 'Mana:';
  lines.push(
    (hasResource ? cellRight(resourceLabel, `${resource}/${maxResource}`, COL1) : empty(COL1)) +
    empty(COL2) +
    cellRight('Traps:', traps.toString(), COL3)
  );

  // Row 6: (empty) | (empty) | Picklocks
  lines.push(
    empty(COL1) +
    empty(COL2) +
    cellRight('Picklocks:', picklocks.toString(), COL3)
  );

  // Row 7: Strength | Dexterity | Tracking
  lines.push(
    cellRight('Strength:', character.strength.toString(), COL1) +
    cellRight('Dexterity:', character.dexterity.toString(), COL2) +
    cellRight('Tracking:', tracking.toString(), COL3)
  );

  // Row 8: Intellect | Constitution | Martial Arts
  lines.push(
    cellRight('Intellect:', character.intelligence.toString(), COL1) +
    cellRight('Constitution:', character.constitution.toString(), COL2) +
    cellRight('Martial Arts:', martialArts.toString(), COL3)
  );

  // Row 9: Wisdom | Charisma | MagicRes
  lines.push(
    cellRight('Wisdom:', character.wisdom.toString(), COL1) +
    cellRight('Charisma:', character.charisma.toString(), COL2) +
    cellRight('MagicRes:', magicRes.toString(), COL3)
  );

  // Add combat status on a new line if applicable
  if (socket.regenState.inCombat) {
    lines.push('');
    lines.push(colors.red('[ IN COMBAT ]'));
  } else if (socket.regenState.enhancedRegen.size > 0) {
    lines.push('');
    lines.push(colors.cyan('[ RESTING ]'));
  }

  // Active effects
  const activeEffects = getActiveEffectsDisplay(socket);
  if (activeEffects.length > 0) {
    lines.push('');
    lines.push(colors.boldCyan('Active Effects:'));

    for (const effect of activeEffects) {
      const timeLeft = formatDuration(effect.remainingMs);
      const stackInfo = effect.stacks > 1 ? ` (x${effect.stacks})` : '';

      // Color based on effect category
      let effectColor: (s: string) => string;
      switch (effect.category) {
        case StatusEffectCategory.BUFF:
        case StatusEffectCategory.HOT:
          effectColor = colors.green;
          break;
        case StatusEffectCategory.DEBUFF:
        case StatusEffectCategory.DOT:
          effectColor = colors.red;
          break;
        case StatusEffectCategory.CONTROL:
          effectColor = colors.yellow;
          break;
        default:
          effectColor = colors.white;
      }

      lines.push(`  ${effectColor(effect.name)}${stackInfo} ${colors.gray(`(${timeLeft})`)}`);
    }

    // Show overall speed modifier if any
    const speedMultiplier = getStatusEffectDelayMultiplier(socket);
    if (speedMultiplier !== 1.0) {
      const speedPercent = Math.round((speedMultiplier - 1) * 100);
      const speedText = speedPercent < 0
        ? colors.green(`${speedPercent}% action delay`)
        : colors.red(`+${speedPercent}% action delay`);
      lines.push(`  ${colors.cyan('Speed:')} ${speedText}`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Handle queue status command - shows queued commands and action timing
 */
function handleQueueStatus(socket: AuthenticatedSocket): CommandResponse {
  const queueStatus = getPlayerQueueStatus(socket);
  const lines: string[] = [];

  lines.push(colors.boldCyan('=== Command Queue ==='));
  lines.push('');

  // Current action
  if (queueStatus.currentAction) {
    const timeUntilComplete = Math.max(0, (socket.queueState.currentAction?.completesAt ?? 0) - Date.now());
    lines.push(colors.yellow('Current Action:'));
    lines.push(`  ${colors.white(queueStatus.currentAction)} ${colors.gray(`(${formatDuration(timeUntilComplete)} remaining)`)}`);
    lines.push('');
  }

  // Time until ready
  if (queueStatus.timeUntilReady > 0) {
    lines.push(`${colors.cyan('Ready in:')} ${formatDuration(queueStatus.timeUntilReady)}`);
  } else if (!queueStatus.currentAction) {
    lines.push(`${colors.green('Status:')} Ready for commands`);
  }

  // Queued commands
  if (queueStatus.queueLength > 0) {
    lines.push('');
    lines.push(colors.yellow(`Queued Commands (${queueStatus.queueLength}):`));
    const queue = socket.queueState.commandQueue;
    const maxToShow = Math.min(queue.length, 5);
    for (let i = 0; i < maxToShow; i++) {
      lines.push(`  ${i + 1}. ${colors.white(queue[i])}`);
    }
    if (queue.length > 5) {
      lines.push(colors.gray(`  ... and ${queue.length - 5} more`));
    }
  } else if (!queueStatus.currentAction) {
    lines.push('');
    lines.push(colors.gray('No commands queued.'));
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Handle cooldowns command - shows active ability cooldowns
 */
function handleCooldowns(socket: AuthenticatedSocket): CommandResponse {
  const lines: string[] = [];
  const cooldowns = socket.queueState.cooldowns;
  const now = Date.now();

  lines.push(colors.boldCyan('=== Active Cooldowns ==='));
  lines.push('');

  // Filter to only active cooldowns and sort by remaining time
  const activeCooldowns: Array<{ name: string; remaining: number }> = [];
  for (const [name, cooldown] of Object.entries(cooldowns)) {
    const remaining = cooldown.readyAt - now;
    if (remaining > 0) {
      activeCooldowns.push({ name, remaining });
    }
  }

  if (activeCooldowns.length === 0) {
    lines.push(colors.green('All abilities are ready.'));
    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  }

  // Sort by remaining time (shortest first)
  activeCooldowns.sort((a, b) => a.remaining - b.remaining);

  for (const cd of activeCooldowns) {
    // Skip shared cooldown groups (they show as individual abilities)
    if (cd.name.includes('_group') || cd.name === 'meleeSpecial') {
      continue;
    }

    const timeText = formatDuration(cd.remaining);
    const abilityName = formatAbilityName(cd.name);
    lines.push(`  ${colors.yellow(abilityName)}: ${colors.white(timeText)} remaining`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Handle aid command - stabilize a fallen ally
 */
function handleAid(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Aid who?' };
  }

  const targetName = args.join(' ').toLowerCase();

  // Find target player in the room (respects stealth visibility)
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId, socket.canSeeHidden);
  if (!target) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // Check if target is dropped (not dead)
  if (!isPlayerDropped(target)) {
    if (isPlayerDead(target)) {
      return { type: MessageType.ERROR, message: `${target.username} is beyond your help. They must respawn.` };
    }
    return { type: MessageType.ERROR, message: `${target.username} doesn't need aid.` };
  }

  // Check if already aided
  if (isPlayerAided(target)) {
    return { type: MessageType.SYSTEM, message: `${target.username} has already been stabilized.` };
  }

  // Aid the player
  setPlayerAided(target, true);

  // Notify everyone
  broadcastToRoom(currentRoomId, `${socket.username} stabilizes ${target.username}!`, socket.playerId);

  // Notify the target
  const targetMsg = {
    type: MessageType.SYSTEM,
    payload: colors.green(`${socket.username} stabilizes you! You begin to recover.`),
    timestamp: Date.now(),
  };
  target.send(JSON.stringify(targetMsg));

  return { type: MessageType.OUTPUT, message: `You stabilize ${colors.player(target.username)}. They will begin to recover.` };
}

/**
 * Handle respawn command - return to life after death
 */
async function handleRespawn(
  socket: AuthenticatedSocket,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Check if player is dead
  if (!isPlayerDead(socket)) {
    return { type: MessageType.ERROR, message: 'You are not dead.' };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);

  // Get respawn room
  const respawnRoomId = await getRespawnRoomId(currentRoomId, socket.characterId ?? undefined);

  // Clear death state
  clearDeathState(socket);

  // Restore HP and mana to full
  socket.vitals.hp = socket.vitals.maxHp;
  if (socket.vitals.maxResource !== undefined) {
    socket.vitals.resource = socket.vitals.maxResource;
  }

  // Update character in database
  if (socket.characterId) {
    await characterRepo.updateCharacterStats(socket.characterId, {
      health: socket.vitals.hp,
      mana: socket.vitals.resource ?? 0,
    });
    await characterRepo.updateCharacterRoom(socket.characterId, respawnRoomId);
  }

  // Update player location
  setPlayerLocation(socket.playerId, respawnRoomId);

  // Send vitals
  sendVitals(socket);

  // Broadcast departure from death room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)}'s spirit fades away...`), socket.playerId);

  // Broadcast arrival at respawn room
  broadcastToRoom(respawnRoomId, colors.green(`${colors.red(socket.username)} appears in a flash of light!`), socket.playerId);

  // Get room description
  const room = world.getRoom(respawnRoomId);
  if (!room) {
    return { type: MessageType.SYSTEM, message: 'You wake up at a safe location...' };
  }

  const otherPlayers = getOtherPlayersInRoom(respawnRoomId, socket.playerId, connectedPlayers, socket.canSeeHidden);
  const itemDescriptions = await getRoomItemsDescription(respawnRoomId);

  const roomDesc = world.formatRoomDescription(room, otherPlayers, socket.briefMode, itemDescriptions);

  return {
    type: MessageType.OUTPUT,
    message: colors.green('You wake up at a safe location...') + '\r\n\r\n' + roomDesc,
  };
}
