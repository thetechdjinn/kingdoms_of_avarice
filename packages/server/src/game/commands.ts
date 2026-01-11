import { MessageType, GameMessage, Role, hasAnyRole } from '@koa/shared';
import { GameWorld } from './world.js';
import { AuthenticatedSocket, broadcastToRoom } from './socket.js';
import { colors } from '../utils/colors.js';
import { processAdminCommand, getPlayerLocation, setPlayerLocation } from './adminCommands.js';
import * as playerRepo from '../db/repositories/playerRepository.js';

export interface CommandResponse {
  type: MessageType;
  message: string;
}

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

  const currentRoomId = getPlayerLocation(socket.playerId);

  if (command === 'look' || command === 'l') {
    // Check if looking in a direction
    if (args.length > 0) {
      const direction = DIRECTION_ALIASES[args[0]] || args[0];
      return handleLookDirection(currentRoomId, direction, world, _connectedPlayers);
    }
    return handleLook(socket, currentRoomId, world, _connectedPlayers, false);
  }

  if (command === 'glance') {
    // Internal command for empty enter - respects brief mode
    return handleLook(socket, currentRoomId, world, _connectedPlayers, socket.briefMode);
  }

  if (command === 'brief') {
    return await handleBrief(socket);
  }

  if (command === 'go' || DIRECTION_ALIASES[command] || isDirection(command)) {
    const direction = command === 'go' ? args[0] : (DIRECTION_ALIASES[command] || command);
    return await handleMove(socket, currentRoomId, direction, world, _connectedPlayers);
  }

  if (command === 'help' || command === '?') {
    return handleHelp(socket.roles);
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

function handleLook(
  socket: AuthenticatedSocket,
  roomId: number,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  useBriefMode: boolean
): CommandResponse {
  const room = world.getRoom(roomId);
  if (!room) {
    return { type: MessageType.ERROR, message: 'You are in an unknown location.' };
  }
  const otherPlayers = getOtherPlayersInRoom(roomId, socket.playerId, connectedPlayers);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(room, otherPlayers, useBriefMode) };
}

function handleLookDirection(
  currentRoomId: number,
  direction: string,
  world: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  // Check if it's a valid direction
  if (!isDirection(direction)) {
    return { type: MessageType.ERROR, message: `You can't look that way.` };
  }

  const targetRoom = world.getRoomInDirection(currentRoomId, direction);
  if (!targetRoom) {
    return { type: MessageType.ERROR, message: `There is no exit ${direction}.` };
  }

  // Show the full room including players and exits
  const playersInRoom = getPlayersInRoom(targetRoom.id, connectedPlayers);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(targetRoom, playersInRoom, false) };
}

async function handleBrief(socket: AuthenticatedSocket): Promise<CommandResponse> {
  socket.briefMode = !socket.briefMode;
  
  // Save to database
  await playerRepo.setBriefMode(socket.playerId, socket.briefMode);
  
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
    // Send logout message to trigger client-side logout
    const logoutMessage: GameMessage = {
      type: MessageType.LOGOUT,
      payload: 'You have left the realm.',
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(logoutMessage));
    // Close the socket after a brief delay to ensure message is sent
    setTimeout(() => socket.close(), 100);
  }, 10000);

  return { type: MessageType.SYSTEM, message: 'You sit down and meditate...' };
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

  // Broadcast to players in the old room that player left
  broadcastToRoom(currentRoomId, `${socket.username} left to the ${fullDirection}.`, socket.playerId);

  setPlayerLocation(socket.playerId, newRoom.id);
  
  // Save room location to database
  await playerRepo.setCurrentRoomId(socket.playerId, newRoom.id);

  // Broadcast to players in the new room that player arrived
  const oppositeDir = OPPOSITE_DIRECTIONS[fullDirection] || fullDirection;
  broadcastToRoom(newRoom.id, `${socket.username} walks in from the ${oppositeDir}.`, socket.playerId);

  const otherPlayers = getOtherPlayersInRoom(newRoom.id, socket.playerId, connectedPlayers);
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(newRoom, otherPlayers, socket.briefMode) };
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

function handleHelp(userRoles: Role[]): CommandResponse {
  const lines = [
    colors.boldYellow('Player Commands:'),
    `  ${colors.boldCyan('look')} (l)           - Look around the current room`,
    `  ${colors.boldCyan('go <direction>')}    - Move in a direction (n, s, e, w, etc.)`,
    `  ${colors.boldCyan('brief')}             - Toggle brief mode (hide room descriptions)`,
    `  ${colors.boldCyan('who')}               - See who is online`,
    `  ${colors.boldCyan('x')}                 - Meditate and leave the realm`,
    `  ${colors.boldCyan('help')} (?)          - Show this help message`,
    '',
    `${colors.boldYellow('Directions:')} n, s, e, w, ne, nw, se, sw, u, d`,
    '  (or full names: north, south, east, west, etc.)',
  ];

  // Staff commands (Moderator+)
  const isStaff = hasAnyRole(userRoles, [Role.MODERATOR, Role.SYSOP, Role.DEVELOPER, Role.ADMIN]);
  if (isStaff) {
    lines.push('');
    lines.push(colors.boldYellow('Staff Commands:'));
    lines.push(`  ${colors.boldCyan('@goto <id>')}        - Teleport to a room`);
    lines.push(`  ${colors.boldCyan('@rooms')}            - List all rooms`);
    lines.push(`  ${colors.boldCyan('@roominfo [id]')}    - Show room details`);
    lines.push(`  ${colors.boldCyan('@help')}             - Show admin command help`);
  }

  // Developer commands
  const isDeveloper = hasAnyRole(userRoles, [Role.DEVELOPER, Role.ADMIN]);
  if (isDeveloper) {
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands:'));
    lines.push(`  ${colors.boldCyan('@create room <name>')} - Create a new room`);
    lines.push(`  ${colors.boldCyan('@link <dir> <id>')}  - Link current room to another`);
    lines.push(`  ${colors.boldCyan('@unlink <dir>')}     - Remove an exit`);
    lines.push(`  ${colors.boldCyan('@edit <field> <value>')} - Edit room (name/desc/area)`);
    lines.push(`  ${colors.boldCyan('@delete room <id>')} - Delete a room`);
    lines.push(`  ${colors.boldCyan('@reload')}           - Reload data from database`);
  }

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
