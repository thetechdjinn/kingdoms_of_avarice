import { MessageType, GameMessage, Role, hasAnyRole, StatusEffectCategory } from '@koa/shared';
import { getActiveEffectsDisplay, formatDuration } from './statusEffects.js';
import { GameWorld } from './world.js';
import { AuthenticatedSocket, broadcastToRoom } from './socket.js';
import { colors } from '../utils/colors.js';
import { processAdminCommand, getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import { handleGet, handleDrop, handleInventory, handleExamine, getRoomItemsDescription, handleWield, handleWear, handleRemove, handleEquipment, handlePut, handleGetFrom, handleLookIn, handleUse, handleLight, handleExtinguish, handleRepair, handleSearch, handleRecipes, handleCraft, handleEnchantments, handleEnchant } from './itemCommands.js';
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
    return handleGet(socket, args, currentRoomId);
  }

  if (command === 'put') {
    return handlePut(socket, args, currentRoomId);
  }

  if (command === 'drop') {
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
    return handleTrain(socket, args.join(' '));
  }

  // Status/character sheet command (st, sta, stat, statu, status)
  if ('status'.startsWith(command) && command.length >= 2) {
    return handleStatus(socket);
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
    colors.boldCyan('  Information & System:'),
    `    ${colors.white('status')} (st)            - View your character sheet`,
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
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}
