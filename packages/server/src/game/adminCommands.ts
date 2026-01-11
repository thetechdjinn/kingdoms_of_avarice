import { MessageType, Role, hasAnyRole } from '@koa/shared';
import { GameWorld, Room } from './world.js';
import { AuthenticatedSocket } from './socket.js';
import { colors } from '../utils/colors.js';

interface CommandResponse {
  type: MessageType;
  message: string;
}

const playerLocations = new Map<number, number>();

export function getPlayerLocation(playerId: number): number {
  return playerLocations.get(playerId) || 1;
}

export function setPlayerLocation(playerId: number, roomId: number): void {
  playerLocations.set(playerId, roomId);
}

// Commands that require Developer role
const developerCommands = ['create', 'link', 'unlink', 'edit', 'delete', 'reload'];

// Commands that any staff can use (Moderator+)
const staffCommands = ['goto', 'rooms', 'roominfo', 'help'];

export async function processAdminCommand(
  input: string,
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse | null> {
  const trimmed = input.trim();
  
  if (!trimmed.startsWith('@')) {
    return null;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  // Check permissions based on command type
  const userRoles = socket.roles || [];
  
  if (developerCommands.includes(command)) {
    if (!hasAnyRole(userRoles, [Role.DEVELOPER, Role.ADMIN])) {
      return { type: MessageType.ERROR, message: 'You do not have permission to use this command. Developer role required.' };
    }
  } else if (staffCommands.includes(command)) {
    if (!hasAnyRole(userRoles, [Role.MODERATOR, Role.SYSOP, Role.DEVELOPER, Role.ADMIN])) {
      return { type: MessageType.ERROR, message: 'You do not have permission to use admin commands.' };
    }
  }

  switch (command) {
    case 'create':
      return handleCreate(args, socket, world);
    case 'link':
      return handleLink(args, socket, world);
    case 'unlink':
      return handleUnlink(args, socket, world);
    case 'edit':
      return handleEdit(args, socket, world);
    case 'delete':
      return handleDelete(args, socket, world);
    case 'goto':
      return handleGoto(args, socket, world);
    case 'rooms':
      return handleListRooms(world);
    case 'roominfo':
      return handleRoomInfo(args, socket, world);
    case 'reload':
      return handleReload(args, world);
    case 'help':
      return handleAdminHelp(userRoles);
    default:
      return { type: MessageType.ERROR, message: `Unknown admin command: @${command}` };
  }
}

async function handleCreate(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @create room <name>
  if (args[0] !== 'room' || args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @create room <name>' };
  }

  const name = args.slice(1).join(' ');
  const currentRoomId = getPlayerLocation(socket.playerId);
  const currentRoom = world.getRoom(currentRoomId);
  const area = currentRoom?.area || 'Unknown';

  try {
    const newRoom = await world.createRoom(name, 'A newly created room.', area);
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Room created:')} ${colors.roomName(newRoom.name)} (ID: ${newRoom.id})`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to create room: ${error}` };
  }
}

async function handleLink(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @link <direction> <room_id> [oneway]
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @link <direction> <room_id> [oneway]' };
  }

  const direction = args[0].toLowerCase();
  const targetRoomId = parseInt(args[1]);
  const oneway = args[2]?.toLowerCase() === 'oneway';

  if (isNaN(targetRoomId)) {
    return { type: MessageType.ERROR, message: 'Invalid room ID' };
  }

  const targetRoom = world.getRoom(targetRoomId);
  if (!targetRoom) {
    return { type: MessageType.ERROR, message: `Room ${targetRoomId} does not exist` };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);

  try {
    await world.linkRooms(currentRoomId, targetRoomId, direction, !oneway);
    const linkType = oneway ? 'one-way' : 'two-way';
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Exit created:')} ${direction} -> ${colors.roomName(targetRoom.name)} (${linkType})`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to create exit: ${error}` };
  }
}

async function handleUnlink(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @unlink <direction> [oneway]
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @unlink <direction> [oneway]' };
  }

  const direction = args[0].toLowerCase();
  const oneway = args[1]?.toLowerCase() === 'oneway';
  const currentRoomId = getPlayerLocation(socket.playerId);

  try {
    const success = await world.unlinkRooms(currentRoomId, direction, !oneway);
    if (success) {
      return {
        type: MessageType.SYSTEM,
        message: `${colors.boldYellow('Exit removed:')} ${direction}`,
      };
    } else {
      return { type: MessageType.ERROR, message: `No exit in direction: ${direction}` };
    }
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to remove exit: ${error}` };
  }
}

async function handleEdit(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @edit name <new name>
  // @edit desc <new description>
  // @edit area <new area>
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @edit <name|desc|area> <value>' };
  }

  const field = args[0].toLowerCase();
  const value = args.slice(1).join(' ');
  const currentRoomId = getPlayerLocation(socket.playerId);

  const updates: { name?: string; description?: string; area?: string } = {};

  switch (field) {
    case 'name':
      updates.name = value;
      break;
    case 'desc':
    case 'description':
      updates.description = value;
      break;
    case 'area':
      updates.area = value;
      break;
    default:
      return { type: MessageType.ERROR, message: `Unknown field: ${field}. Use name, desc, or area.` };
  }

  try {
    const updatedRoom = await world.updateRoom(currentRoomId, updates);
    if (updatedRoom) {
      return {
        type: MessageType.SYSTEM,
        message: `${colors.boldGreen('Room updated!')}\r\n${world.formatRoomDescription(updatedRoom)}`,
      };
    } else {
      return { type: MessageType.ERROR, message: 'Failed to update room' };
    }
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to update room: ${error}` };
  }
}

async function handleDelete(
  args: string[],
  _socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @delete room <room_id>
  if (args[0] !== 'room' || args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @delete room <room_id>' };
  }

  const roomId = parseInt(args[1]);
  if (isNaN(roomId)) {
    return { type: MessageType.ERROR, message: 'Invalid room ID' };
  }

  if (roomId === 1) {
    return { type: MessageType.ERROR, message: 'Cannot delete the starting room (ID: 1)' };
  }

  const room = world.getRoom(roomId);
  if (!room) {
    return { type: MessageType.ERROR, message: `Room ${roomId} does not exist` };
  }

  try {
    await world.deleteRoom(roomId);
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Room deleted:')} ${room.name} (ID: ${roomId})`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to delete room: ${error}` };
  }
}

async function handleGoto(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @goto <room_id>
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @goto <room_id>' };
  }

  const roomId = parseInt(args[0]);
  if (isNaN(roomId)) {
    return { type: MessageType.ERROR, message: 'Invalid room ID' };
  }

  const room = world.getRoom(roomId);
  if (!room) {
    return { type: MessageType.ERROR, message: `Room ${roomId} does not exist` };
  }

  setPlayerLocation(socket.playerId, roomId);
  return {
    type: MessageType.OUTPUT,
    message: `${colors.system('You teleport...')}\r\n\r\n${world.formatRoomDescription(room)}`,
  };
}

function handleListRooms(world: GameWorld): CommandResponse {
  const rooms = world.getAllRooms();
  
  if (rooms.length === 0) {
    return { type: MessageType.SYSTEM, message: 'No rooms exist.' };
  }

  const lines = [
    colors.boldYellow(`Rooms (${rooms.length} total):`),
    '',
  ];

  // Group by area
  const byArea = new Map<string, Room[]>();
  for (const room of rooms) {
    const area = room.area || 'Unknown';
    if (!byArea.has(area)) {
      byArea.set(area, []);
    }
    byArea.get(area)!.push(room);
  }

  for (const [area, areaRooms] of byArea) {
    lines.push(colors.boldCyan(`  ${area}:`));
    for (const room of areaRooms) {
      const exits = Array.from(room.exits.keys()).join(', ') || 'none';
      lines.push(`    ${colors.white(`[${room.id}]`)} ${room.name} ${colors.exits(`(${exits})`)}`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function handleRoomInfo(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): CommandResponse {
  // @roominfo [room_id]
  let roomId: number;
  
  if (args.length > 0) {
    roomId = parseInt(args[0]);
    if (isNaN(roomId)) {
      return { type: MessageType.ERROR, message: 'Invalid room ID' };
    }
  } else {
    roomId = getPlayerLocation(socket.playerId);
  }

  const room = world.getRoom(roomId);
  if (!room) {
    return { type: MessageType.ERROR, message: `Room ${roomId} does not exist` };
  }

  const exits = Array.from(room.exits.entries())
    .map(([dir, targetId]) => `${dir} -> ${targetId}`)
    .join(', ') || 'none';

  const lines = [
    colors.boldYellow('Room Info:'),
    `  ${colors.boldCyan('ID:')} ${room.id}`,
    `  ${colors.boldCyan('Name:')} ${room.name}`,
    `  ${colors.boldCyan('Area:')} ${room.area}`,
    `  ${colors.boldCyan('Description:')} ${room.description}`,
    `  ${colors.boldCyan('Exits:')} ${exits}`,
  ];

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

async function handleReload(
  args: string[],
  world: GameWorld
): Promise<CommandResponse> {
  // @reload [rooms|items|mobs|all]
  const target = args[0]?.toLowerCase() || 'all';

  const validTargets = ['rooms', 'items', 'mobs', 'all'];
  if (!validTargets.includes(target)) {
    return { type: MessageType.ERROR, message: `Usage: @reload [${validTargets.join('|')}]` };
  }

  const results: string[] = [];

  try {
    if (target === 'rooms' || target === 'all') {
      const count = await world.reloadAllRooms();
      results.push(`${colors.green('✓')} Reloaded ${count} rooms`);
    }

    if (target === 'items' || target === 'all') {
      // TODO: Implement item reload when items are added
      results.push(`${colors.yellow('○')} Items reload not yet implemented`);
    }

    if (target === 'mobs' || target === 'all') {
      // TODO: Implement mob reload when mobs are added
      results.push(`${colors.yellow('○')} Mobs reload not yet implemented`);
    }

    return {
      type: MessageType.OUTPUT,
      message: [colors.boldYellow('Reload complete:'), ...results].join('\r\n'),
    };
  } catch (error) {
    console.error('Reload failed:', error);
    return { type: MessageType.ERROR, message: 'Reload failed: ' + String(error) };
  }
}

function handleAdminHelp(userRoles: Role[]): CommandResponse {
  const isDeveloper = hasAnyRole(userRoles, [Role.DEVELOPER, Role.ADMIN]);
  
  const lines = [
    colors.boldYellow('Admin Commands:'),
    '',
  ];

  // Staff commands (Moderator+)
  lines.push(`  ${colors.boldCyan('@goto <id>')}              - Teleport to a room`);
  lines.push(`  ${colors.boldCyan('@rooms')}                  - List all rooms`);
  lines.push(`  ${colors.boldCyan('@roominfo [id]')}          - Show room details`);
  lines.push(`  ${colors.boldCyan('@help')}                   - Show this help`);

  // Developer commands
  if (isDeveloper) {
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands:'));
    lines.push(`  ${colors.boldCyan('@create room <name>')}     - Create a new room`);
    lines.push(`  ${colors.boldCyan('@link <dir> <id> [oneway]')} - Link current room to another`);
    lines.push(`  ${colors.boldCyan('@unlink <dir> [oneway]')}  - Remove an exit`);
    lines.push(`  ${colors.boldCyan('@edit <field> <value>')}   - Edit current room (name/desc/area)`);
    lines.push(`  ${colors.boldCyan('@delete room <id>')}       - Delete a room`);
    lines.push(`  ${colors.boldCyan('@reload [rooms|all]')}     - Reload data from database`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}
