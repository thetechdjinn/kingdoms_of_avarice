import { MessageType, GameMessage, Role, hasAnyRole, StatusEffectCategory, DoorType, DoorState } from '@koa/shared';
import { getActiveEffectsDisplay, formatDuration } from './statusEffects.js';
import { getDelayModifierDescriptions, getStatusEffectDelayMultiplier } from './delayModifiers.js';
import { getPlayerQueueStatus } from './tickProcessor.js';
import { getRemainingCooldown, formatAbilityName } from './cooldownTracker.js';
import { GameWorld } from './world.js';
import { AuthenticatedSocket, broadcastToRoom, sendVitals } from './socket.js';
import { colors } from '../utils/colors.js';
import { processAdminCommand, getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as doorStateManager from '../services/doorStateManager.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import { handleGet, handleDrop, handleInventory, handleExamine, getRoomItemsDescription, handleWield, handleWear, handleRemove, handleEquipment, handlePut, handleGetFrom, handleLookIn, handleUse, handleLight, handleExtinguish, handleRepair, handleSearch, handleRecipes, handleCraft, handleEnchantments, handleEnchant, handleDropCurrency, handleGetCurrency } from './itemCommands.js';
import { handleAttack, handleFlee, handleBreak } from './combatCommands.js';
import { isSpellMnemonic, handleSpellCommand, handleSpellbook } from './spellCommands.js';
import { handleTrain } from './trainingCommands.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import { generatePlayerDescription } from './playerDescription.js';

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
      return { type: MessageType.SYSTEM, message: 'You stop meditating and return to the realm.' };
    }
  }
  
  // Check for admin commands first (they start with @)
  if (trimmed.startsWith('@')) {
    const adminResponse = await processAdminCommand(trimmed, socket, world);
    if (adminResponse) return adminResponse;
  }

  const lowerTrimmed = trimmed.toLowerCase();
  const parts = lowerTrimmed.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  // Clear enhanced regen state when any command other than 'rest' is entered
  // This breaks the resting/meditating state when the player takes any action
  if (command !== 'rest' && command !== 're' && socket.regenState.enhancedRegen.size > 0) {
    socket.regenState.enhancedRegen.clear();
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
      // Try to find another player in the room with that name
      const targetPlayer = findPlayerInRoom(targetName, currentRoomId, _connectedPlayers, socket.playerId);
      if (targetPlayer) {
        return await handleLookAtPlayer(targetPlayer);
      }
      // Otherwise, examine an item
      return handleExamine(socket, args, currentRoomId);
    }
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
    return handleSearch(socket, currentRoomId);
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
    return handleOpenDoor(socket, args, currentRoomId);
  }

  if (command === 'close') {
    return handleCloseDoor(socket, args, currentRoomId);
  }

  if (command === 'unlock') {
    return await handleUnlockDoor(socket, args, currentRoomId);
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

  // Combat commands
  if (command === 'attack' || command === 'att' || command === 'kill' || command === 'k' || command === 'a') {
    return handleAttack(socket, args, _connectedPlayers);
  }

  if (command === 'flee' || command === 'fl') {
    const fleeResult = await handleFlee(socket, world, _connectedPlayers);
    // Check for special flee movement marker
    if (fleeResult.type === MessageType.SYSTEM && fleeResult.message.startsWith('FLEE:')) {
      const direction = fleeResult.message.substring(5);
      broadcastToRoom(currentRoomId, `${socket.username} flees ${direction}!`, socket.playerId);
      return await handleMove(socket, currentRoomId, direction, world, _connectedPlayers);
    }
    return fleeResult;
  }

  // Break combat command (bre, brea, break)
  if ('break'.startsWith(command) && command.length >= 3) {
    return handleBreak(socket, _connectedPlayers);
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

  // Default: treat as speech
  return handleSay(socket, trimmed, _connectedPlayers);
}

function isDirection(cmd: string): boolean {
  const directions = ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest'];
  return directions.includes(cmd);
}

// Get names of other players in the same room (excluding the current player)
function getOtherPlayersInRoom(
  roomId: number,
  excludePlayerId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>
): string[] {
  const otherPlayers: string[] = [];
  for (const [playerId, socket] of connectedPlayers) {
    if (playerId !== excludePlayerId && getPlayerLocation(playerId) === roomId) {
      otherPlayers.push(socket.username);
    }
  }
  return otherPlayers;
}

// Get names of all players in a room (for looking into adjacent rooms)
function getPlayersInRoom(
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>
): string[] {
  const players: string[] = [];
  for (const [playerId, socket] of connectedPlayers) {
    if (getPlayerLocation(playerId) === roomId) {
      players.push(socket.username);
    }
  }
  return players;
}

/**
 * Find a player in the same room by name (case-insensitive partial match)
 * Excludes the searching player from results
 */
function findPlayerInRoom(
  targetName: string,
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  excludePlayerId: number
): AuthenticatedSocket | null {
  const lowerTarget = targetName.toLowerCase();

  for (const [playerId, socket] of connectedPlayers) {
    if (playerId === excludePlayerId) continue;
    if (getPlayerLocation(playerId) !== roomId) continue;

    const playerName = socket.username.toLowerCase();
    if (playerName === lowerTarget || playerName.startsWith(lowerTarget)) {
      return socket;
    }
  }

  return null;
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
  const equippedItems = await itemRepo.getPlayerEquipped(targetSocket.playerId);

  // Generate description
  const description = generatePlayerDescription({
    character: sharedChar,
    currentHp: targetSocket.vitals.hp,
    maxHp: targetSocket.vitals.maxHp,
    equippedItems,
  });

  return { type: MessageType.OUTPUT, message: description };
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
  const otherPlayers = getOtherPlayersInRoom(roomId, socket.playerId, connectedPlayers);
  const itemDescriptions = await getRoomItemsDescription(roomId);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(room, otherPlayers, useBriefMode, itemDescriptions) };
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
      return { type: MessageType.OUTPUT, message: `The ${door.name} to the ${direction} is closed.` };
    }
  }

  // Notify players in the target room that someone is peeking in
  const oppositeDir = OPPOSITE_DIRECTIONS[direction] || direction;
  broadcastToRoom(targetRoom.id, `${socket.username} peeks in from the ${oppositeDir}.`, socket.playerId);

  // Show the full room including players and exits
  const playersInRoom = getPlayersInRoom(targetRoom.id, connectedPlayers);
  const itemDescriptions = await getRoomItemsDescription(targetRoom.id);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(targetRoom, playersInRoom, false, itemDescriptions) };
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

  // Check if in combat
  if (socket.regenState.inCombat) {
    return { type: MessageType.ERROR, message: 'You cannot rest while in combat!' };
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
    const passageCheck = doorStateManager.canPassThrough(door.id, currentRoomId);
    if (!passageCheck.allowed) {
      return { type: MessageType.ERROR, message: passageCheck.reason || 'You cannot go that way.' };
    }
  }

  const newRoom = world.getRoomInDirection(currentRoomId, fullDirection);

  if (!newRoom) {
    return { type: MessageType.ERROR, message: `You cannot go ${fullDirection}.` };
  }

  // Save room location to database first
  try {
    await characterRepo.updateCharacterRoom(socket.characterId!, newRoom.id);
  } catch (error) {
    console.error('Failed to save room location:', error);
    return { type: MessageType.ERROR, message: 'Something prevents you from moving.' };
  }

  // Database succeeded, now update in-memory state and broadcast
  broadcastToRoom(currentRoomId, `${socket.username} left to the ${fullDirection}.`, socket.playerId);
  setPlayerLocation(socket.playerId, newRoom.id);

  // Broadcast to players in the new room that player arrived
  const oppositeDir = OPPOSITE_DIRECTIONS[fullDirection] || fullDirection;
  broadcastToRoom(newRoom.id, `${socket.username} walks in from the ${oppositeDir}.`, socket.playerId);

  const otherPlayers = getOtherPlayersInRoom(newRoom.id, socket.playerId, connectedPlayers);
  const itemDescriptions = await getRoomItemsDescription(newRoom.id);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(newRoom, otherPlayers, socket.briefMode, itemDescriptions) };
}

type DoorAction = 'open' | 'close';

function handleDoorAction(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number,
  action: DoorAction
): CommandResponse {
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

  // Only physical doors can be opened/closed
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot ${verb} the ${door.name}.` };
  }

  // Get current state (null treated as closed)
  const currentState = doorStateManager.getDoorState(door.id);

  // Validate state and perform action
  if (action === 'open') {
    if (currentState === DoorState.OPEN) {
      return { type: MessageType.ERROR, message: `The ${door.name} is already open.` };
    }
    if (currentState === DoorState.LOCKED) {
      return { type: MessageType.ERROR, message: `The ${door.name} is locked.` };
    }
    doorStateManager.openDoor(door.id);
  } else {
    if (currentState !== DoorState.OPEN) {
      return { type: MessageType.ERROR, message: `The ${door.name} is already closed.` };
    }
    doorStateManager.closeDoor(door.id);
  }

  // Broadcast to current room
  broadcastToRoom(currentRoomId, `${socket.username} ${verbs} the ${door.name}.`, socket.playerId);

  // Broadcast to the other side (if two-way door)
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    broadcastToRoom(otherRoomId, `The ${door.name} ${verbs} from the other side.`);
  }

  return { type: MessageType.OUTPUT, message: `You ${verb} the ${door.name}.` };
}

function handleOpenDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): CommandResponse {
  return handleDoorAction(socket, args, currentRoomId, 'open');
}

function handleCloseDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): CommandResponse {
  return handleDoorAction(socket, args, currentRoomId, 'close');
}

/**
 * Check if a player has a key with the specified tag in their inventory
 */
async function playerHasKey(characterId: number, keyTag: string): Promise<boolean> {
  const inventory = await itemRepo.getCharacterInventory(characterId);
  return inventory.some(item => item.template?.flags?.key_tag === keyTag);
}

async function handleUnlockDoor(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Unlock what?' };
  }

  // Parse direction from args
  const directionArg = args[0].toLowerCase();
  const direction = DIRECTION_ALIASES[directionArg] || directionArg;

  // Find door in the specified direction
  const door = doorStateManager.getDoorByRoomAndDirection(currentRoomId, direction);
  if (!door) {
    if (!isDirection(direction)) {
      return { type: MessageType.ERROR, message: 'Unlock what?' };
    }
    return { type: MessageType.ERROR, message: `There is no door to the ${direction}.` };
  }

  // Only physical doors can be unlocked
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot unlock the ${door.name}.` };
  }

  // Check if door has a lock
  if (!door.hasLock) {
    return { type: MessageType.ERROR, message: `The ${door.name} has no lock.` };
  }

  // Check current state
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState !== DoorState.LOCKED) {
    return { type: MessageType.ERROR, message: `The ${door.name} is not locked.` };
  }

  // Check if player has the right key
  if (door.keyItemTag) {
    const hasKey = await playerHasKey(socket.characterId!, door.keyItemTag);
    if (!hasKey) {
      return { type: MessageType.ERROR, message: `You don't have the right key.` };
    }
  }

  // Unlock the door
  doorStateManager.unlockDoor(door.id);

  // Broadcast to current room
  broadcastToRoom(currentRoomId, `${socket.username} unlocks the ${door.name}.`, socket.playerId);

  // Broadcast to the other side (if two-way door)
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    broadcastToRoom(otherRoomId, `The ${door.name} unlocks from the other side.`);
  }

  return { type: MessageType.OUTPUT, message: `You unlock the ${door.name}.` };
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

  // Only physical doors can be locked
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot lock the ${door.name}.` };
  }

  // Check if door has a lock
  if (!door.hasLock) {
    return { type: MessageType.ERROR, message: `The ${door.name} has no lock.` };
  }

  // Check current state
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState === DoorState.LOCKED) {
    return { type: MessageType.ERROR, message: `The ${door.name} is already locked.` };
  }
  if (currentState === DoorState.OPEN) {
    return { type: MessageType.ERROR, message: `You need to close the ${door.name} first.` };
  }

  // Check if player has the right key
  if (door.keyItemTag) {
    const hasKey = await playerHasKey(socket.characterId!, door.keyItemTag);
    if (!hasKey) {
      return { type: MessageType.ERROR, message: `You don't have the right key.` };
    }
  }

  // Lock the door
  doorStateManager.lockDoor(door.id);

  // Broadcast to current room
  broadcastToRoom(currentRoomId, `${socket.username} locks the ${door.name}.`, socket.playerId);

  // Broadcast to the other side (if two-way door)
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    broadcastToRoom(otherRoomId, `The ${door.name} locks from the other side.`);
  }

  return { type: MessageType.OUTPUT, message: `You lock the ${door.name}.` };
}

/**
 * Check if a character has the lockpicking ability
 * Characters can pick locks if their class has thievery=true or 'lockpicking' in special_abilities
 */
async function characterHasLockpickingAbility(characterClass: string): Promise<boolean> {
  const classDef = await progressionRepo.getClassById(characterClass);
  if (!classDef) return false;

  // Class has thievery skill (thief, bard, gypsy, missionary)
  if (classDef.thievery) return true;

  // Class has lockpicking in special_abilities (ninja)
  if (classDef.special_abilities?.includes('lockpicking')) return true;

  return false;
}

/**
 * Calculate a character's lockpicking stat
 * Based on: intellect, dexterity, level, race/class bonuses, equipment bonuses
 * For now, simplified formula: (intellect + dexterity) / 2 + level * 2
 * TODO: Add race bonuses, class bonuses, equipment bonuses, quest bonuses
 */
function calculateLockpickingStat(character: {
  dexterity: number;
  intelligence: number;
  level: number;
}): number {
  // Base lockpicking from stats: average of intellect and dexterity
  const statBonus = Math.floor((character.intelligence + character.dexterity) / 2);

  // Level bonus: 2 points per level
  const levelBonus = character.level * 2;

  // TODO: Add race/class bonuses from definitions
  // TODO: Add equipment bonuses from equipped items
  // TODO: Add quest completion bonuses

  return statBonus + levelBonus;
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
  const hasAbility = await characterHasLockpickingAbility(character.class);
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

  // Only physical doors can be picked
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot pick the ${door.name}.` };
  }

  // Check if door has a lock
  if (!door.hasLock) {
    return { type: MessageType.ERROR, message: `The ${door.name} has no lock to pick.` };
  }

  // Check current state
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState !== DoorState.LOCKED) {
    return { type: MessageType.ERROR, message: `The ${door.name} is not locked.` };
  }

  // Check pick difficulty - 0 means unpickable for this implementation
  // Actually, high values like 500+ mean unpickable
  if (door.pickDifficulty <= 0) {
    // No pick difficulty set means it can't be picked (must use key)
    return { type: MessageType.ERROR, message: `The ${door.name} cannot be picked.` };
  }

  // Calculate lockpicking stat
  const lockpickingStat = calculateLockpickingStat(character);

  // Roll 0-100
  const roll = Math.floor(Math.random() * 101);

  // Roll of 0 is automatic failure (fumble)
  if (roll === 0) {
    broadcastToRoom(currentRoomId, `${socket.username} fumbles while trying to pick the ${door.name}.`, socket.playerId);
    return { type: MessageType.OUTPUT, message: `You fumble the lockpick! The ${door.name} remains locked.` };
  }

  // Calculate total: roll + lockpicking stat
  const total = roll + lockpickingStat;

  // Check against difficulty
  if (total < door.pickDifficulty) {
    // Failed attempt - broadcast to room
    broadcastToRoom(currentRoomId, `${socket.username} fails to pick the ${door.name}.`, socket.playerId);
    return {
      type: MessageType.OUTPUT,
      message: `You fail to pick the lock on the ${door.name}. (Roll: ${roll} + Skill: ${lockpickingStat} = ${total} vs Difficulty: ${door.pickDifficulty})`,
    };
  }

  // Success! Unlock the door (which sets it to CLOSED state)
  doorStateManager.unlockDoor(door.id);

  // Now open it
  doorStateManager.openDoor(door.id);

  // Broadcast success to current room
  broadcastToRoom(currentRoomId, `${socket.username} picks the lock on the ${door.name}!`, socket.playerId);

  // Broadcast to the other side (if two-way door)
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    broadcastToRoom(otherRoomId, `The ${door.name} clicks and swings open.`);
  }

  return {
    type: MessageType.OUTPUT,
    message: `You skillfully pick the lock on the ${door.name}! (Roll: ${roll} + Skill: ${lockpickingStat} = ${total} vs Difficulty: ${door.pickDifficulty})`,
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

  // Only physical doors can be bashed
  if (door.doorType !== DoorType.PHYSICAL) {
    return { type: MessageType.ERROR, message: `You cannot bash the ${door.name}.` };
  }

  // Check current state - can bash closed or locked doors
  const currentState = doorStateManager.getDoorState(door.id);
  if (currentState === DoorState.OPEN) {
    return { type: MessageType.ERROR, message: `The ${door.name} is already open.` };
  }

  // Check bash difficulty - 0 means unbashable for this implementation
  if (door.bashDifficulty <= 0) {
    return { type: MessageType.ERROR, message: `The ${door.name} cannot be bashed open.` };
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
    broadcastToRoom(currentRoomId, `${socket.username} slams into the ${door.name} and bounces off!`, socket.playerId);

    return {
      type: MessageType.OUTPUT,
      message: `You slam into the ${door.name} but it doesn't budge! You take ${colors.red(damage.toString())} damage. (Roll: ${roll} + Strength: ${bashStat} = ${total} vs Difficulty: ${door.bashDifficulty})`,
    };
  }

  // Success! If locked, unlock first, then open
  if (currentState === DoorState.LOCKED) {
    doorStateManager.unlockDoor(door.id);
  }
  doorStateManager.openDoor(door.id);

  // Broadcast success to current room
  broadcastToRoom(currentRoomId, `${socket.username} bashes open the ${door.name}!`, socket.playerId);

  // Broadcast to the other side (if two-way door)
  const otherRoomId = doorStateManager.getDestinationRoom(door.id, currentRoomId);
  if (otherRoomId) {
    broadcastToRoom(otherRoomId, `The ${door.name} bursts open with a crash!`);
  }

  return {
    type: MessageType.OUTPUT,
    message: `You bash open the ${door.name}! (Roll: ${roll} + Strength: ${bashStat} = ${total} vs Difficulty: ${door.bashDifficulty})`,
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
      return { type: MessageType.SYSTEM, message: 'Admin commands are not yet implemented.' };
    }
    
    // Unknown category - show player help with note
    return { type: MessageType.ERROR, message: `Unknown help category: ${category}. Try: help, help staff, help developer` };
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
    `    ${colors.white('unlock <direction>')}    - Unlock a locked door (requires key)`,
    `    ${colors.white('lock <direction>')}      - Lock an unlocked door (requires key)`,
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
    '',
    colors.boldCyan('  Magic:'),
    `    ${colors.white('spells')} (sp)           - View your spellbook`,
    `    ${colors.white('<mnemonic> <target>')}   - Cast a spell (e.g., mmis goblin)`,
    '',
    colors.boldCyan('  Progression:'),
    `    ${colors.white('train')} (tr)            - Level up (in training room)`,
    `    ${colors.white('train stats')}           - Allocate CP to stats (in training room)`,
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
    `    ${colors.white('@spawn <id|name> [qty]')}  - Spawn item in current room`,
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
    `    ${colors.white('@reload [rooms|all]')}     - Reload data from database`,
    '',
    `Type ${colors.boldCyan('@help')} for the full admin command reference.`,
  ];

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function handleWho(connectedPlayers: Map<number, AuthenticatedSocket>): CommandResponse {
  const players = Array.from(connectedPlayers.values()).map(p => colors.player(p.username));
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

  // Unimplemented skills (show 0)
  const perception = 0;
  const stealth = 0;
  const thievery = 0;
  const traps = 0;
  const picklocks = 0;
  const tracking = 0;
  const martialArts = 0;
  const magicRes = 0;
  const armourClass = '0/0';

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
    cellRight('Thievery:', thievery.toString(), COL3)
  );

  // Row 5: Mana | (empty) | Traps
  lines.push(
    cellRight('Mana:', `${resource}/${maxResource}`, COL1) +
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
