import { MessageType, Role, hasAnyRole } from '@koa/shared';
import { GameWorld } from './world.js';
import { AuthenticatedSocket } from './socket.js';
import { colors } from '../utils/colors.js';
import { processAdminCommand, getPlayerLocation, setPlayerLocation } from './adminCommands.js';

export interface CommandResponse {
  type: MessageType;
  message: string;
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
  const trimmed = input.trim();
  
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
    return handleLook(currentRoomId, world);
  }

  if (command === 'go' || DIRECTION_ALIASES[command] || isDirection(command)) {
    const direction = command === 'go' ? args[0] : (DIRECTION_ALIASES[command] || command);
    return handleMove(socket.playerId, currentRoomId, direction, world);
  }

  if (command === 'say') {
    const message = args.join(' ');
    return handleSay(socket.username, message);
  }

  if (command === 'help' || command === '?') {
    return handleHelp(socket.roles);
  }

  if (command === 'who') {
    return handleWho(_connectedPlayers);
  }

  if (command === 'quit' || command === 'exit') {
    return { type: MessageType.SYSTEM, message: 'Use your browser to disconnect.' };
  }

  return { type: MessageType.ERROR, message: `Unknown command: ${command}. Type 'help' for a list of commands.` };
}

function isDirection(cmd: string): boolean {
  const directions = ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest'];
  return directions.includes(cmd);
}

function handleLook(roomId: number, world: GameWorld): CommandResponse {
  const room = world.getRoom(roomId);
  if (!room) {
    return { type: MessageType.ERROR, message: 'You are in an unknown location.' };
  }
  return { type: MessageType.OUTPUT, message: world.formatRoomDescription(room) };
}

function handleMove(
  playerId: number,
  currentRoomId: number,
  direction: string,
  world: GameWorld
): CommandResponse {
  if (!direction) {
    return { type: MessageType.ERROR, message: 'Go where?' };
  }

  const fullDirection = DIRECTION_ALIASES[direction] || direction;
  const newRoom = world.getRoomInDirection(currentRoomId, fullDirection);

  if (!newRoom) {
    return { type: MessageType.ERROR, message: `You cannot go ${fullDirection}.` };
  }

  setPlayerLocation(playerId, newRoom.id);
  return { type: MessageType.OUTPUT, message: `You go ${fullDirection}.\r\n\r\n${world.formatRoomDescription(newRoom)}` };
}

function handleSay(username: string, message: string): CommandResponse {
  if (!message) {
    return { type: MessageType.ERROR, message: 'Say what?' };
  }
  return { type: MessageType.OUTPUT, message: `${colors.sayName(username + ' says:')} ${colors.say('"' + message + '"')}` };
}

function handleHelp(userRoles: Role[]): CommandResponse {
  const lines = [
    colors.boldYellow('Player Commands:'),
    `  ${colors.boldCyan('look')} (l)           - Look around the current room`,
    `  ${colors.boldCyan('go <direction>')}    - Move in a direction (n, s, e, w, etc.)`,
    `  ${colors.boldCyan('say <message>')}     - Say something to the room`,
    `  ${colors.boldCyan('who')}               - See who is online`,
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
