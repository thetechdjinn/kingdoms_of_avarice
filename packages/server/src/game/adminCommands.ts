import { MessageType, Role, hasAnyRole, ItemLocationType, ItemCondition } from '@koa/shared';
import * as spellRepo from '../db/repositories/spellRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import { GameWorld, Room } from './world.js';
import { AuthenticatedSocket, connectedPlayers, sendVitals, sendMessage, broadcastToRoom } from './socket.js';
import { colors } from '../utils/colors.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import { isProgressionCommand, processProgressionCommand, getProgressionHelpText } from './progressionCommands.js';
import { initializeDoorStates } from '../services/doorStateManager.js';
import {
  applyEffect,
  removeEffect,
  getActiveEffectsDisplay,
  formatDuration,
  getAllEffectIds,
  getEffectDefinition,
  initializeEffectDefinitions,
} from './statusEffects.js';
import { getDelayModifierDescriptions } from './delayModifiers.js';
import { StatusEffectCategory } from '@koa/shared';
import {
  applyDamage,
  initializeDroppedState,
  initializeDeadState,
  formatDroppedMessage,
  formatDeathMessage,
} from './damageHandler.js';
import { initializeActionCommands } from './actionCommands.js';

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
const developerCommands = ['create', 'link', 'unlink', 'edit', 'delete', 'reload', 'spawn', 'purge', 'items', 'iteminfo'];

// Commands that any staff can use (Moderator+)
const staffCommands = ['goto', 'rooms', 'roominfo', 'help', 'give', 'hurt', 'drain', 'learn', 'spells', 'effect', 'cleareffect', 'effects'];

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

  // Check if it's a progression command first
  if (isProgressionCommand(command)) {
    return processProgressionCommand(command, args, socket);
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
    case 'spawn':
      return handleSpawn(args, socket);
    case 'purge':
      return handlePurge(args, socket);
    case 'items':
      return handleListItems(socket);
    case 'iteminfo':
      return handleItemInfo(args);
    case 'give':
      return handleGive(args, socket);
    case 'hurt':
      return await handleHurt(args, socket);
    case 'drain':
      return handleDrain(args, socket);
    case 'learn':
      return handleLearn(args, socket);
    case 'spells':
      return handleListSpells();
    case 'effect':
      return handleApplyEffect(args, socket);
    case 'cleareffect':
      return handleClearEffect(args, socket);
    case 'effects':
      return handleListEffects(socket);
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
      const { getRoomItemsDescription } = await import('./itemCommands.js');
      const itemDescriptions = await getRoomItemsDescription(currentRoomId);
      return {
        type: MessageType.SYSTEM,
        message: `${colors.boldGreen('Room updated!')}\r\n${world.formatRoomDescription(updatedRoom, [], false, itemDescriptions)}`,
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
  const { getRoomItemsDescription } = await import('./itemCommands.js');
  const itemDescriptions = await getRoomItemsDescription(roomId);
  return {
    type: MessageType.OUTPUT,
    message: `${colors.system('You teleport...')}\r\n\r\n${world.formatRoomDescription(room, [], false, itemDescriptions)}`,
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
  // @reload [rooms|items|mobs|effects|doors|actions|all]
  const target = args[0]?.toLowerCase() || 'all';

  const validTargets = ['rooms', 'items', 'mobs', 'effects', 'doors', 'actions', 'all'];
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
      // Items are loaded from DB on-demand, so just clear any caches
      // For now, just confirm items are available
      const templates = await itemRepo.getAllTemplates();
      results.push(`${colors.green('✓')} Reloaded ${templates.length} item templates`);
    }

    if (target === 'mobs' || target === 'all') {
      // TODO: Implement mob reload when mobs are added
      results.push(`${colors.yellow('○')} Mobs reload not yet implemented`);
    }

    if (target === 'effects' || target === 'all') {
      await initializeEffectDefinitions();
      results.push(`${colors.green('✓')} Reloaded status effect definitions`);
    }

    if (target === 'doors' || target === 'all') {
      await initializeDoorStates();
      results.push(`${colors.green('✓')} Reloaded door definitions and states`);
    }

    if (target === 'actions' || target === 'all') {
      await initializeActionCommands();
      results.push(`${colors.green('✓')} Reloaded action commands`);
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

// ============================================================================
// ITEM ADMIN COMMANDS
// ============================================================================

async function handleSpawn(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  // @spawn <template_id|name> [quantity]
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @spawn <template_id|name> [quantity]' };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);

  // Check if last arg is a number (quantity), rest is template name
  let quantity = 1;
  let templateIdOrName: string;
  
  const lastArg = args[args.length - 1];
  const parsedLastArg = parseInt(lastArg);
  
  if (args.length > 1 && !isNaN(parsedLastArg) && parsedLastArg > 0) {
    // Last arg is quantity, rest is template name
    quantity = parsedLastArg;
    templateIdOrName = args.slice(0, -1).join(' ');
  } else {
    // No quantity specified, all args are template name
    templateIdOrName = args.join(' ');
  }

  let template;
  const templateId = parseInt(templateIdOrName);
  
  if (!isNaN(templateId) && templateIdOrName === String(templateId)) {
    // Only treat as ID if it's purely numeric
    template = await itemRepo.getTemplateById(templateId);
  } else {
    template = await itemRepo.getTemplateByName(templateIdOrName);
  }

  if (!template) {
    return { type: MessageType.ERROR, message: `Item template not found: ${templateIdOrName}` };
  }

  try {
    await itemRepo.createInstance({
      template_id: template.id,
      location_type: ItemLocationType.ROOM,
      location_id: currentRoomId,
      quantity,
      condition: ItemCondition.PRISTINE,
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Spawned:')} ${quantity}x ${colors.item(template.name ?? 'item')} in room ${currentRoomId}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to spawn item: ${error}` };
  }
}

async function handlePurge(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  // @purge items - Remove all items from current room
  // @purge item <instance_id> - Remove specific item
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @purge items | @purge item <instance_id>' };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);

  if (args[0] === 'items') {
    const items = await itemRepo.getInstancesInRoom(currentRoomId);
    let count = 0;
    
    for (const item of items) {
      try {
        await itemRepo.deleteInstance(item.id);
        count++;
      } catch (err) {
        console.error(`Failed to delete item ${item.id}:`, err);
      }
    }

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldYellow('Purged:')} ${count} items from room ${currentRoomId}`,
    };
  } else if (args[0] === 'item' && args[1]) {
    const instanceId = parseInt(args[1]);
    if (isNaN(instanceId)) {
      return { type: MessageType.ERROR, message: 'Invalid instance ID' };
    }

    const instance = await itemRepo.getInstanceById(instanceId);
    if (!instance) {
      return { type: MessageType.ERROR, message: `Item instance ${instanceId} not found` };
    }

    try {
      await itemRepo.deleteInstance(instanceId);
    } catch (err) {
      console.error(`Failed to delete item ${instanceId}:`, err);
      return { type: MessageType.ERROR, message: `Failed to delete item instance ${instanceId}` };
    }
    const itemName = instance.template?.name || 'item';
    
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldYellow('Purged:')} ${colors.item(itemName)} (instance #${instanceId})`,
    };
  }

  return { type: MessageType.ERROR, message: 'Usage: @purge items | @purge item <instance_id>' };
}

async function handleListItems(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  // @items - List all item templates
  const templates = await itemRepo.getAllTemplates();

  if (templates.length === 0) {
    return { type: MessageType.SYSTEM, message: 'No item templates exist.' };
  }

  const lines = [
    colors.boldYellow(`Item Templates (${templates.length} total):`),
    '',
  ];

  // Group by type
  const byType = new Map<string, typeof templates>();
  for (const template of templates) {
    const type = template.item_type;
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(template);
  }

  for (const [type, typeTemplates] of byType) {
    lines.push(colors.boldCyan(`  ${type.charAt(0).toUpperCase() + type.slice(1)}:`));
    for (const template of typeTemplates.slice(0, 10)) { // Limit to 10 per type
      lines.push(`    ${colors.white(`[${template.id}]`)} ${colors.item(template.name)}`);
    }
    if (typeTemplates.length > 10) {
      lines.push(`    ... and ${typeTemplates.length - 10} more`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

async function handleItemInfo(
  args: string[]
): Promise<CommandResponse> {
  // @iteminfo <template_id|name>
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @iteminfo <template_id|name>' };
  }

  const templateIdOrName = args.join(' ');
  let template;
  const templateId = parseInt(templateIdOrName);
  
  if (!isNaN(templateId)) {
    template = await itemRepo.getTemplateById(templateId);
  } else {
    template = await itemRepo.getTemplateByName(templateIdOrName);
  }

  if (!template) {
    return { type: MessageType.ERROR, message: `Item template not found: ${templateIdOrName}` };
  }

  const lines = [
    colors.boldYellow('Item Template Info:'),
    `  ${colors.boldCyan('ID:')} ${template.id}`,
    `  ${colors.boldCyan('Name:')} ${template.name}`,
    `  ${colors.boldCyan('Short:')} ${template.short_desc}`,
    `  ${colors.boldCyan('Type:')} ${template.item_type}`,
    `  ${colors.boldCyan('Slot:')} ${template.equipment_slot || 'none'}`,
    `  ${colors.boldCyan('Weight:')} ${template.weight}`,
    `  ${colors.boldCyan('Value:')} ${template.base_value}`,
    `  ${colors.boldCyan('Keywords:')} ${template.keywords.join(', ')}`,
  ];

  if (template.weapon_data) {
    lines.push(`  ${colors.boldCyan('Damage:')} ${template.weapon_data.min_damage}-${template.weapon_data.max_damage} ${template.weapon_data.damage_type}`);
  }
  if (template.armor_data) {
    lines.push(`  ${colors.boldCyan('AC:')} ${template.armor_data.armor_class}`);
  }
  if (template.consumable_data) {
    lines.push(`  ${colors.boldCyan('Effect:')} ${template.consumable_data.effect_type} ${template.consumable_data.effect_value}`);
  }

  const flags = Object.entries(template.flags || {})
    .filter(([_, v]) => v)
    .map(([k]) => k);
  if (flags.length > 0) {
    lines.push(`  ${colors.boldCyan('Flags:')} ${flags.join(', ')}`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

async function handleGive(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  // @give <template_id|name> [quantity] - Give item to yourself
  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @give <template_id|name> [quantity]' };
  }

  // Check if last arg is a number (quantity), rest is template name
  let quantity = 1;
  let templateIdOrName: string;
  
  const lastArg = args[args.length - 1];
  const parsedLastArg = parseInt(lastArg);
  
  if (args.length > 1 && !isNaN(parsedLastArg) && parsedLastArg > 0) {
    // Last arg is quantity, rest is template name
    quantity = parsedLastArg;
    templateIdOrName = args.slice(0, -1).join(' ');
  } else {
    // No quantity specified, all args are template name
    templateIdOrName = args.join(' ');
  }

  let template;
  const templateId = parseInt(templateIdOrName);
  
  if (!isNaN(templateId) && templateIdOrName === String(templateId)) {
    // Only treat as ID if it's purely numeric
    template = await itemRepo.getTemplateById(templateId);
  } else {
    template = await itemRepo.getTemplateByName(templateIdOrName);
  }

  if (!template) {
    return { type: MessageType.ERROR, message: `Item template not found: ${templateIdOrName}` };
  }

  try {
    await itemRepo.createInstance({
      template_id: template.id,
      location_type: ItemLocationType.PLAYER,
      location_id: socket.characterId!,
      quantity,
      condition: ItemCondition.PRISTINE,
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Received:')} ${quantity}x ${colors.item(template.name ?? 'item')}`,
    };
  } catch (error) {
    return { type: MessageType.ERROR, message: `Failed to give item: ${error}` };
  }
}

async function handleHurt(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  // @hurt [amount] [player] OR @hurt [player] - Reduce HP for testing regen
  // Default: hurt self by 10
  let amount = 10;
  let targetSocket: AuthenticatedSocket = socket;
  let targetName = socket.username;
  let playerNameArgs: string[] = [];

  if (args.length >= 1) {
    // Only treat as amount if the first arg is purely numeric
    if (/^\d+$/.test(args[0])) {
      const parsedAmount = parseInt(args[0]);
      if (parsedAmount > 0) {
        amount = parsedAmount;
        playerNameArgs = args.slice(1);
      } else {
        playerNameArgs = args;
      }
    } else {
      // First arg is not purely numeric, treat all args as player name
      playerNameArgs = args;
    }
  }

  if (playerNameArgs.length > 0) {
    const playerName = playerNameArgs.join(' ').toLowerCase();
    let found = false;
    for (const [, playerSocket] of connectedPlayers) {
      if (playerSocket.username.toLowerCase() === playerName) {
        targetSocket = playerSocket;
        targetName = playerSocket.username;
        found = true;
        break;
      }
    }
    if (!found) {
      return { type: MessageType.ERROR, message: `Player not found: ${playerNameArgs.join(' ')}` };
    }
  }

  // Apply damage using centralized handler (allows negative HP and state transitions)
  const damageResult = await applyDamage(targetSocket, amount, 'environmental');
  const newHp = damageResult.newHp;

  // Handle state transitions
  const roomId = getPlayerLocation(targetSocket.playerId);

  if (damageResult.stateChange === 'dropped') {
    initializeDroppedState(targetSocket, roomId);
    sendMessage(targetSocket, MessageType.SYSTEM, formatDroppedMessage());
    broadcastToRoom(roomId, colors.boldRed(`${targetName} collapses to the ground!`), targetSocket.playerId);
  } else if (damageResult.stateChange === 'death') {
    initializeDeadState(targetSocket, roomId);

    // Drop all items on death
    try {
      const { dropAllItemsOnDeath } = await import('./itemCommands.js');
      await dropAllItemsOnDeath(targetSocket.characterId!, roomId);
    } catch (error) {
      console.error('[AdminCommands] Failed to drop items on death:', error);
    }

    sendMessage(targetSocket, MessageType.SYSTEM, formatDeathMessage());
    broadcastToRoom(roomId, colors.boldRed(`${targetName} has died!`), targetSocket.playerId);
  }

  // Send updated vitals to target
  sendVitals(targetSocket);

  if (targetSocket === socket) {
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Ouch!')} You take ${amount} damage. HP: ${newHp}/${targetSocket.vitals.maxHp}`,
    };
  } else {
    // Notify the target player
    sendMessage(targetSocket, MessageType.SYSTEM, `${colors.boldRed('Ouch!')} You take ${amount} damage from an unknown force. HP: ${newHp}/${targetSocket.vitals.maxHp}`);
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Hurt:')} ${targetName} takes ${amount} damage. HP: ${newHp}/${targetSocket.vitals.maxHp}`,
    };
  }
}

function handleDrain(
  args: string[],
  socket: AuthenticatedSocket
): CommandResponse {
  // @drain [amount] [player] OR @drain [player] - Reduce mana for testing regen
  // Default: drain self by 10
  let amount = 10;
  let targetSocket: AuthenticatedSocket = socket;
  let targetName = socket.username;
  let playerNameArgs: string[] = [];

  if (args.length >= 1) {
    // Only treat as amount if the first arg is purely numeric
    if (/^\d+$/.test(args[0])) {
      const parsedAmount = parseInt(args[0]);
      if (parsedAmount > 0) {
        amount = parsedAmount;
        playerNameArgs = args.slice(1);
      } else {
        playerNameArgs = args;
      }
    } else {
      // First arg is not purely numeric, treat all args as player name
      playerNameArgs = args;
    }
  }

  if (playerNameArgs.length > 0) {
    const playerName = playerNameArgs.join(' ').toLowerCase();
    let found = false;
    for (const [, playerSocket] of connectedPlayers) {
      if (playerSocket.username.toLowerCase() === playerName) {
        targetSocket = playerSocket;
        targetName = playerSocket.username;
        found = true;
        break;
      }
    }
    if (!found) {
      return { type: MessageType.ERROR, message: `Player not found: ${playerNameArgs.join(' ')}` };
    }
  }

  // Check if target has mana
  if (targetSocket.vitals.resource === undefined || targetSocket.vitals.maxResource === undefined) {
    return { type: MessageType.ERROR, message: `${targetName} has no mana resource.` };
  }

  // Apply drain
  const oldMana = targetSocket.vitals.resource;
  targetSocket.vitals.resource = Math.max(0, targetSocket.vitals.resource - amount);
  const newMana = targetSocket.vitals.resource;
  const actualDrain = oldMana - newMana;

  // Send updated vitals to target
  sendVitals(targetSocket);

  if (targetSocket === socket) {
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldCyan('Drained!')} You lose ${actualDrain} mana. Mana: ${newMana}/${targetSocket.vitals.maxResource}`,
    };
  } else {
    // Notify the target player
    sendMessage(targetSocket, MessageType.SYSTEM, `${colors.boldCyan('Drained!')} You lose ${actualDrain} mana from an unknown force. Mana: ${newMana}/${targetSocket.vitals.maxResource}`);
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldCyan('Drain:')} ${targetName} loses ${actualDrain} mana. Mana: ${newMana}/${targetSocket.vitals.maxResource}`,
    };
  }
}

async function handleLearn(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  // @learn <mnemonic> - Learn a spell for your current character
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @learn <mnemonic>' };
  }

  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  const mnemonic = args[0].toLowerCase();
  const spell = await spellRepo.getSpellByMnemonic(mnemonic);

  if (!spell) {
    return { type: MessageType.ERROR, message: `Unknown spell mnemonic: ${mnemonic}` };
  }

  // Check if already learned
  const hasSpell = await spellRepo.hasSpell(socket.characterId, spell.id);
  if (hasSpell) {
    return { type: MessageType.SYSTEM, message: `You already know ${colors.cyan(spell.name)}.` };
  }

  // Get character info for class check
  const character = await characterRepo.findCharacterById(socket.characterId);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Get class display name for restriction check
  const { getClassById } = await import('../db/repositories/progressionRepository.js');
  const classDef = await getClassById(character.class);
  const classDisplayName = classDef?.display_name || character.class;

  // Check class restriction
  if (spell.classRestrictions.length > 0 && !spell.classRestrictions.includes(classDisplayName)) {
    return {
      type: MessageType.ERROR,
      message: `Only ${spell.classRestrictions.join(', ')} can learn ${spell.name}.`
    };
  }

  // Learn the spell
  const result = await spellRepo.learnSpell(socket.characterId, spell.id);
  if (!result) {
    return { type: MessageType.ERROR, message: 'Failed to learn spell.' };
  }

  return {
    type: MessageType.SYSTEM,
    message: `${colors.boldGreen('Learned:')} ${colors.cyan(spell.name)} (${colors.white(spell.mnemonic)}) - ${spell.manaCost} mana`,
  };
}

async function handleListSpells(): Promise<CommandResponse> {
  // @spells - List all available spells
  const spells = await spellRepo.getAllSpells();

  if (spells.length === 0) {
    return { type: MessageType.SYSTEM, message: 'No spells exist.' };
  }

  const lines = [
    colors.boldYellow(`Spells (${spells.length} total):`),
    '',
  ];

  // Group by type
  const byType = new Map<string, typeof spells>();
  for (const spell of spells) {
    const type = spell.spellType;
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(spell);
  }

  for (const [type, typeSpells] of byType) {
    lines.push(colors.boldCyan(`  ${type.charAt(0).toUpperCase() + type.slice(1)}:`));
    for (const spell of typeSpells) {
      const classes = spell.classRestrictions.length > 0
        ? spell.classRestrictions.join(', ')
        : 'All';
      lines.push(
        `    ${colors.white(spell.mnemonic.padEnd(6))} ${colors.cyan(spell.name.padEnd(18))} ` +
        `Lv${spell.levelRequired.toString().padEnd(3)} ${spell.manaCost.toString().padStart(2)} mana  [${classes}]`
      );
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
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
  lines.push(`  ${colors.boldCyan('@give <id|name> [quantity]')} - Give yourself an item`);
  lines.push(`  ${colors.boldCyan('@hurt [amount] [player]')} - Damage HP (for testing regen)`);
  lines.push(`  ${colors.boldCyan('@drain [amount] [player]')} - Drain mana (for testing regen)`);
  lines.push(`  ${colors.boldCyan('@spells')}                 - List all spells in the game`);
  lines.push(`  ${colors.boldCyan('@learn <mnemonic>')}       - Learn a spell for your character`);
  lines.push(`  ${colors.boldCyan('@effect <id> [duration] [player]')} - Apply effect (default 60s, self)`);
  lines.push(`  ${colors.boldCyan('@cleareffect <id|all>')}  - Remove a status effect`);
  lines.push(`  ${colors.boldCyan('@effects')}                - List available effects`);
  lines.push(`  ${colors.boldCyan('@help')}                   - Show this help`);

  // Developer commands
  if (isDeveloper) {
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands (Rooms):'));
    lines.push(`  ${colors.boldCyan('@create room <name>')}     - Create a new room`);
    lines.push(`  ${colors.boldCyan('@link <dir> <id> [oneway]')} - Link current room to another`);
    lines.push(`  ${colors.boldCyan('@unlink <dir> [oneway]')}  - Remove an exit`);
    lines.push(`  ${colors.boldCyan('@edit <field> <value>')}   - Edit current room (name/desc/area)`);
    lines.push(`  ${colors.boldCyan('@delete room <id>')}       - Delete a room`);
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands (Items):'));
    lines.push(`  ${colors.boldCyan('@items')}                  - List all item templates`);
    lines.push(`  ${colors.boldCyan('@iteminfo <id|name>')}     - Show item template details`);
    lines.push(`  ${colors.boldCyan('@spawn <id|name> [qty]')}  - Spawn item in current room`);
    lines.push(`  ${colors.boldCyan('@purge items')}            - Remove all items from room`);
    lines.push(`  ${colors.boldCyan('@purge item <id>')}        - Remove specific item instance`);
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands (System):'));
    lines.push(`  ${colors.boldCyan('@reload [type]')}     - Reload data from database`);
    
    // Add progression commands help
    lines.push(getProgressionHelpText());
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Apply a status effect to a character
 * Usage: @effect <effectId> [duration] [player]
 */
async function handleApplyEffect(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  if (args.length < 1) {
    const availableEffects = getAllEffectIds().join(', ');
    return {
      type: MessageType.ERROR,
      message: `Usage: @effect <effectId> [duration] [player]\r\nAvailable effects: ${availableEffects}`,
    };
  }

  const effectId = args[0].toLowerCase();

  // Parse duration and player name
  // Format: @effect <id> [duration] [player]
  // Duration is numeric, player name is everything else after
  let durationSeconds = 60; // Default 60 seconds
  let targetSocket: AuthenticatedSocket = socket;
  let targetName = socket.username;
  let playerNameArgs: string[] = [];

  if (args.length >= 2) {
    // Check if second arg is a number (duration)
    if (/^\d+$/.test(args[1])) {
      const parsedDuration = parseInt(args[1]);
      if (parsedDuration > 0) {
        durationSeconds = parsedDuration;
        playerNameArgs = args.slice(2);
      } else {
        // Duration is 0 or negative - this is an error, not a player name
        return { type: MessageType.ERROR, message: 'Duration must be a positive number of seconds.' };
      }
    } else {
      // Second arg is not numeric, treat remaining args as player name
      playerNameArgs = args.slice(1);
    }
  }

  // Find target player if specified
  if (playerNameArgs.length > 0) {
    const playerName = playerNameArgs.join(' ').toLowerCase();
    let found = false;
    for (const [, playerSocket] of connectedPlayers) {
      if (playerSocket.username.toLowerCase() === playerName) {
        targetSocket = playerSocket;
        targetName = playerSocket.username;
        found = true;
        break;
      }
    }
    if (!found) {
      return { type: MessageType.ERROR, message: `Player not found: ${playerNameArgs.join(' ')}` };
    }
  }

  if (durationSeconds <= 0) {
    return { type: MessageType.ERROR, message: 'Duration must be a positive number of seconds.' };
  }

  const definition = getEffectDefinition(effectId);
  if (!definition) {
    const availableEffects = getAllEffectIds().join(', ');
    return {
      type: MessageType.ERROR,
      message: `Unknown effect: ${effectId}\r\nAvailable effects: ${availableEffects}`,
    };
  }

  const durationMs = durationSeconds * 1000;
  const result = await applyEffect(targetSocket, effectId, durationMs);

  if (result.success) {
    if (targetSocket === socket) {
      // Applied to self
      const delayModifiers = getDelayModifierDescriptions(socket);
      let message = `${colors.green('Applied effect:')} ${result.message} (${formatDuration(durationMs)})`;
      if (delayModifiers.length > 0) {
        message += `\r\n${colors.cyan('Active delay modifiers:')} ${delayModifiers.join(', ')}`;
      }
      return { type: MessageType.SYSTEM, message };
    } else {
      // Applied to another player - notify them
      sendMessage(targetSocket, MessageType.SYSTEM, `${colors.yellow('Effect applied:')} ${result.message} (${formatDuration(durationMs)})`);
      return {
        type: MessageType.SYSTEM,
        message: `${colors.green('Applied effect to')} ${colors.player(targetName)}: ${result.message} (${formatDuration(durationMs)})`,
      };
    }
  }

  return { type: MessageType.ERROR, message: result.message };
}

/**
 * Remove a status effect from the current character
 * Usage: @cleareffect <effectId|all>
 */
async function handleClearEffect(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @cleareffect <effectId|all>' };
  }

  const effectId = args[0].toLowerCase();

  if (effectId === 'all') {
    // Clear all effects
    if (!socket.activeEffects || socket.activeEffects.size === 0) {
      return { type: MessageType.SYSTEM, message: 'No active effects to clear.' };
    }

    const effectIds = Array.from(socket.activeEffects.keys());
    for (const id of effectIds) {
      await removeEffect(socket, id);
    }

    return {
      type: MessageType.SYSTEM,
      message: colors.green(`Cleared ${effectIds.length} effect(s).`),
    };
  }

  // Clear specific effect
  const removed = await removeEffect(socket, effectId);
  if (removed) {
    const definition = getEffectDefinition(effectId);
    return {
      type: MessageType.SYSTEM,
      message: colors.green(`Removed effect: ${definition?.name || effectId}`),
    };
  }

  return { type: MessageType.ERROR, message: `Effect not active: ${effectId}` };
}

/**
 * List all available status effects
 * Usage: @effects
 */
function handleListEffects(socket: AuthenticatedSocket): CommandResponse {
  const effectIds = getAllEffectIds();
  const lines = [colors.boldYellow('Available Status Effects:'), ''];

  // Group by category
  const byCategory = new Map<StatusEffectCategory, Array<{ id: string; name: string; description: string; speedMod?: number }>>();

  for (const effectId of effectIds) {
    const def = getEffectDefinition(effectId);
    if (!def) continue;

    const category = def.category;
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push({
      id: effectId,
      name: def.name,
      description: def.description || '',
      speedMod: def.speedModifier,
    });
  }

  // Display grouped effects
  for (const [category, effects] of byCategory) {
    const categoryColor = category === StatusEffectCategory.BUFF || category === StatusEffectCategory.HOT
      ? colors.green
      : category === StatusEffectCategory.DEBUFF || category === StatusEffectCategory.DOT
      ? colors.red
      : colors.yellow;

    lines.push(categoryColor(`[${category}]`));
    for (const effect of effects) {
      let speedInfo = '';
      if (effect.speedMod) {
        const sign = effect.speedMod < 0 ? '' : '+';
        speedInfo = colors.cyan(` (${sign}${effect.speedMod}% speed)`);
      }
      lines.push(`  ${colors.white(effect.id.padEnd(15))} ${effect.name}${speedInfo}`);
    }
    lines.push('');
  }

  // Show currently active effects
  const activeEffects = getActiveEffectsDisplay(socket);
  if (activeEffects.length > 0) {
    lines.push(colors.boldCyan('Your Active Effects:'));
    for (const effect of activeEffects) {
      const stackInfo = effect.stacks > 1 ? ` (x${effect.stacks})` : '';
      lines.push(`  ${colors.yellow(effect.name)}${stackInfo} - ${formatDuration(effect.remainingMs)} remaining`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}
