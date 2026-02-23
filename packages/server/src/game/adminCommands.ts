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
  clearDeathState,
  isPlayerDropped,
  isPlayerDead,
  getDeathRoomId,
} from './damageHandler.js';
import { initializeActionCommands } from './actionCommands.js';
import {
  setStealthMode,
  isHidden,
  isSneaking,
} from './stealth/stealthState.js';
import {
  calculateStealth,
  calculatePerception,
  characterHasStealth,
  getEquipmentStealthModifier,
  getBackstabDamageBonuses,
  calculateLockpicking,
  getLockpickingCapability,
  NO_LOCKPICK_BONUS,
} from './stats/secondaryStats.js';
import { StealthMode } from '@koa/shared';
import { getAllNpcInstances, reloadNpcTemplates } from './npcManager.js';
import { clearDenominationCache } from './npcDeathHandler.js';

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
const developerCommands = ['create', 'link', 'unlink', 'edit', 'delete', 'reload', 'spawn', 'purge', 'items', 'iteminfo', 'setstealth', 'testbackstab', 'lockpicking', 'npcs', 'mobbehavior'];

// Commands that any staff can use (Moderator+)
const staffCommands = ['goto', 'rooms', 'roominfo', 'help', 'give', 'hurt', 'heal', 'drain', 'revive', 'teleport', 'learn', 'spells', 'effect', 'cleareffect', 'effects', 'stealth'];

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
    case 'heal':
      return await handleHeal(args, socket);
    case 'drain':
      return handleDrain(args, socket);
    case 'revive':
      return await handleRevive(args, socket, world);
    case 'teleport':
      return await handleTeleport(args, socket, world);
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
    case 'stealth':
      return handleStealthInfo(args, socket);
    case 'lockpicking':
      return handleLockpickingInfo(args, socket);
    case 'setstealth':
      return handleSetStealth(args, socket);
    case 'testbackstab':
      return await handleTestBackstab(args, socket);
    case 'npcs':
      return handleListNpcs();
    case 'mobbehavior':
      return handleMobBehavior();
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

  const currentRoomId = getPlayerLocation(socket.playerId);

  // Broadcast departure from current room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} vanishes in a flash of light!`), socket.playerId);

  setPlayerLocation(socket.playerId, roomId);

  // Broadcast arrival at new room
  broadcastToRoom(roomId, colors.green(`${colors.red(socket.username)} appears in a flash of light!`), socket.playerId);

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
  // @reload [rooms|items|mobs|effects|doors|actions|droptables|all]
  const target = args[0]?.toLowerCase() || 'all';

  const validTargets = ['rooms', 'items', 'mobs', 'effects', 'doors', 'actions', 'droptables', 'all'];
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
      const count = await reloadNpcTemplates();
      results.push(`${colors.green('✓')} Reloaded ${count} NPC templates`);
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

    if (target === 'droptables' || target === 'all') {
      clearDenominationCache();
      results.push(`${colors.green('✓')} Cleared denomination template cache`);
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
      location_type: ItemLocationType.PLAYER,
      location_id: socket.characterId!,
      quantity,
      condition: ItemCondition.PRISTINE,
    });

    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Spawned:')} ${quantity}x ${colors.item(template.name ?? 'item')} in your inventory`,
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
    // Show backstab modifiers if any are non-zero
    const bsAcc = template.weapon_data.backstab_accuracy ?? 0;
    const bsMinDmg = template.weapon_data.backstab_min_damage_bonus ?? 0;
    const bsMaxDmg = template.weapon_data.backstab_max_damage_bonus ?? 0;
    if (bsAcc !== 0) {
      lines.push(`  ${colors.boldCyan('Backstab Accuracy:')} ${bsAcc >= 0 ? '+' : ''}${bsAcc}`);
    }
    if (bsMinDmg !== 0 || bsMaxDmg !== 0) {
      const minSign = bsMinDmg >= 0 ? '+' : '';
      const maxSign = bsMaxDmg >= 0 ? '+' : '';
      lines.push(`  ${colors.boldCyan('Backstab Damage:')} ${minSign}${bsMinDmg} to ${maxSign}${bsMaxDmg}`);
    }
  }
  if (template.armor_data) {
    lines.push(`  ${colors.boldCyan('AC:')} ${template.armor_data.armor_class}`);
  }
  if (template.consumable_data) {
    lines.push(`  ${colors.boldCyan('Effect:')} ${template.consumable_data.effect_type} ${template.consumable_data.effect_value}`);
  }
  // Show stealth modifier for any equippable item
  if (template.stealth_modifier && template.stealth_modifier !== 0) {
    const sign = template.stealth_modifier >= 0 ? '+' : '';
    lines.push(`  ${colors.boldCyan('Stealth:')} ${sign}${template.stealth_modifier}`);
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

  // Handle state transitions
  const roomId = getPlayerLocation(targetSocket.playerId);

  // Send damage notification first (before state change messages), but only if not dying
  if (targetSocket !== socket && damageResult.stateChange !== 'death') {
    sendMessage(targetSocket, MessageType.SYSTEM, `${colors.boldRed('Ouch!')} You take ${amount} damage from an unknown force.`);
  }

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

  // Send updated vitals to target (but not if dead - avoids duplicate message)
  if (damageResult.stateChange !== 'death') {
    sendVitals(targetSocket);
  }

  if (targetSocket === socket) {
    if (damageResult.stateChange === 'death') {
      return { type: MessageType.SYSTEM, message: '' }; // Death message already sent
    }
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldRed('Ouch!')} You take ${amount} damage.`,
    };
  } else {
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Hurt:')} ${targetName} takes ${amount} damage.`,
    };
  }
}

async function handleHeal(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  // @heal [amount] [player] OR @heal [player] - Restore HP
  // Default: heal self by 10
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

  // Cannot heal dead players - they must respawn
  if (isPlayerDead(targetSocket)) {
    return { type: MessageType.ERROR, message: `${targetName} is dead. They need to respawn, not be healed.` };
  }

  // Track if target is dropped (for recovery check after healing)
  const wasDropped = isPlayerDropped(targetSocket);
  const roomId = getPlayerLocation(targetSocket.playerId);

  // Apply healing (cap at max HP)
  const oldHp = targetSocket.vitals.hp;
  targetSocket.vitals.hp = Math.min(targetSocket.vitals.hp + amount, targetSocket.vitals.maxHp);
  const newHp = targetSocket.vitals.hp;
  const actualHeal = newHp - oldHp;

  // Check if healing brought a dropped player back to consciousness
  if (wasDropped && targetSocket.vitals.hp > 0) {
    clearDeathState(targetSocket);
    broadcastToRoom(
      roomId,
      `${targetName} regains consciousness and rises to their feet!`,
      targetSocket.playerId
    );
    sendMessage(targetSocket, MessageType.SYSTEM, colors.boldGreen('You regain consciousness and rise to your feet!'));
  }

  // Persist HP to database
  if (targetSocket.characterId) {
    await characterRepo.updateCharacterStats(targetSocket.characterId, { health: newHp });
  }

  // Send updated vitals to target
  sendVitals(targetSocket);

  if (targetSocket === socket) {
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Healed!')} You restore ${actualHeal} HP.`,
    };
  } else {
    // Notify the target player
    sendMessage(targetSocket, MessageType.SYSTEM, `${colors.boldGreen('Healed!')} You are healed for ${actualHeal} HP by a divine force.`);
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Heal:')} ${targetName} is healed for ${actualHeal} HP.`,
    };
  }
}

async function handleRevive(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @revive <player> - Revive a dead player in the room they died in
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @revive <player>' };
  }

  const playerName = args.join(' ').toLowerCase();
  let targetSocket: AuthenticatedSocket | null = null;
  let targetName = '';

  for (const [, playerSocket] of connectedPlayers) {
    if (playerSocket.username.toLowerCase() === playerName) {
      targetSocket = playerSocket;
      targetName = playerSocket.username;
      break;
    }
  }

  if (!targetSocket) {
    return { type: MessageType.ERROR, message: `Player not found: ${args.join(' ')}` };
  }

  // Check if player is dead
  if (!isPlayerDead(targetSocket)) {
    // Also check if they're dropped
    if (isPlayerDropped(targetSocket)) {
      // Just heal them and clear dropped state
      const roomId = getPlayerLocation(targetSocket.playerId);
      targetSocket.vitals.hp = targetSocket.vitals.maxHp;
      if (targetSocket.vitals.maxResource !== undefined) {
        targetSocket.vitals.resource = targetSocket.vitals.maxResource;
      }
      clearDeathState(targetSocket);

      if (targetSocket.characterId) {
        await characterRepo.updateCharacterStats(targetSocket.characterId, {
          health: targetSocket.vitals.hp,
          mana: targetSocket.vitals.resource ?? 0,
        });
      }

      sendVitals(targetSocket);
      broadcastToRoom(roomId, `${targetName} is revived by divine intervention!`, targetSocket.playerId);
      sendMessage(targetSocket, MessageType.SYSTEM, colors.boldGreen('You feel divine energy flow through you! You are revived!'));

      return {
        type: MessageType.SYSTEM,
        message: `${colors.boldGreen('Revived:')} ${targetName} has been revived from dropped state.`,
      };
    }
    return { type: MessageType.ERROR, message: `${targetName} is not dead or dropped.` };
  }

  // Get the room where they died
  const deathRoomId = getDeathRoomId(targetSocket);
  const reviveRoomId = deathRoomId ?? getPlayerLocation(targetSocket.playerId);
  const currentRoomId = getPlayerLocation(targetSocket.playerId);

  // Clear death state
  clearDeathState(targetSocket);

  // Restore HP and mana to full
  targetSocket.vitals.hp = targetSocket.vitals.maxHp;
  if (targetSocket.vitals.maxResource !== undefined) {
    targetSocket.vitals.resource = targetSocket.vitals.maxResource;
  }

  // Update character in database
  if (targetSocket.characterId) {
    await characterRepo.updateCharacterStats(targetSocket.characterId, {
      health: targetSocket.vitals.hp,
      mana: targetSocket.vitals.resource ?? 0,
    });
    await characterRepo.updateCharacterRoom(targetSocket.characterId, reviveRoomId);
  }

  // Move to revive room
  setPlayerLocation(targetSocket.playerId, reviveRoomId);

  // Send vitals
  sendVitals(targetSocket);

  // Broadcast departure from current room (if different)
  if (currentRoomId !== reviveRoomId) {
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(targetName)}'s spirit fades away...`), targetSocket.playerId);
  }

  // Broadcast arrival at revive room
  broadcastToRoom(reviveRoomId, colors.green(`${colors.red(targetName)} is revived by divine intervention!`), targetSocket.playerId);

  // Send room description to revived player
  const room = world.getRoom(reviveRoomId);
  if (room) {
    const { getRoomItemsDescription } = await import('./itemCommands.js');
    const itemDescriptions = await getRoomItemsDescription(reviveRoomId);
    sendMessage(targetSocket, MessageType.SYSTEM, colors.boldGreen('You feel divine energy flow through you! You are revived!'));
    sendMessage(targetSocket, MessageType.OUTPUT, world.formatRoomDescription(room, [], false, itemDescriptions));
  }

  return {
    type: MessageType.SYSTEM,
    message: `${colors.boldGreen('Revived:')} ${targetName} has been revived in room ${reviveRoomId}.`,
  };
}

async function handleTeleport(
  args: string[],
  socket: AuthenticatedSocket,
  world: GameWorld
): Promise<CommandResponse> {
  // @teleport <player> <room_id> - Teleport a player to a specific room
  if (args.length < 2) {
    return { type: MessageType.ERROR, message: 'Usage: @teleport <player> <room_id>' };
  }

  // Last argument is the room ID
  const roomIdStr = args[args.length - 1];
  const roomId = parseInt(roomIdStr);
  if (isNaN(roomId)) {
    return { type: MessageType.ERROR, message: `Invalid room ID: ${roomIdStr}` };
  }

  // Everything else is the player name
  const playerName = args.slice(0, -1).join(' ').toLowerCase();

  let targetSocket: AuthenticatedSocket | null = null;
  let targetName = '';

  for (const [, playerSocket] of connectedPlayers) {
    if (playerSocket.username.toLowerCase() === playerName) {
      targetSocket = playerSocket;
      targetName = playerSocket.username;
      break;
    }
  }

  if (!targetSocket) {
    return { type: MessageType.ERROR, message: `Player not found: ${args.slice(0, -1).join(' ')}` };
  }

  // Verify target room exists
  const room = world.getRoom(roomId);
  if (!room) {
    return { type: MessageType.ERROR, message: `Room ${roomId} does not exist.` };
  }

  const currentRoomId = getPlayerLocation(targetSocket.playerId);

  // Don't teleport if already there
  if (currentRoomId === roomId) {
    return { type: MessageType.ERROR, message: `${targetName} is already in that room.` };
  }

  // Update character in database
  if (targetSocket.characterId) {
    await characterRepo.updateCharacterRoom(targetSocket.characterId, roomId);
  }

  // Broadcast departure from current room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(targetName)} vanishes in a flash of light!`), targetSocket.playerId);

  // Move player
  setPlayerLocation(targetSocket.playerId, roomId);

  // Broadcast arrival at new room
  broadcastToRoom(roomId, colors.green(`${colors.red(targetName)} appears in a flash of light!`), targetSocket.playerId);

  // Send room description to teleported player
  const { getRoomItemsDescription } = await import('./itemCommands.js');
  const itemDescriptions = await getRoomItemsDescription(roomId);
  sendMessage(targetSocket, MessageType.SYSTEM, colors.yellow('You feel a strange pull as you are teleported...'));
  sendMessage(targetSocket, MessageType.OUTPUT, world.formatRoomDescription(room, [], false, itemDescriptions));

  return {
    type: MessageType.SYSTEM,
    message: `${colors.boldGreen('Teleported:')} ${targetName} has been teleported to ${room.name} (ID: ${roomId}).`,
  };
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

function handleListNpcs(): CommandResponse {
  const npcs = getAllNpcInstances();

  if (npcs.length === 0) {
    return { type: MessageType.SYSTEM, message: 'No active NPC instances.' };
  }

  const lines = [
    colors.boldYellow(`Active NPCs (${npcs.length} total):`),
    '',
  ];

  // Group by room
  const byRoom = new Map<number, typeof npcs>();
  for (const npc of npcs) {
    const roomId = npc.currentRoomId;
    if (!byRoom.has(roomId)) {
      byRoom.set(roomId, []);
    }
    byRoom.get(roomId)!.push(npc);
  }

  for (const [roomId, roomNpcs] of byRoom) {
    lines.push(colors.boldCyan(`  Room ${roomId}:`));
    for (const npc of roomNpcs) {
      const hpPct = Math.round((npc.vitals.hp / npc.vitals.maxHp) * 100);
      const hostileTag = npc.template.hostile ? colors.red(' [hostile]') : '';
      const stateTag = npc.behaviorState !== 'idle'
        ? colors.boldYellow(` [${npc.behaviorState}]`)
        : (npc.combatState.targets.size > 0 ? colors.boldRed(' [in combat]') : '');
      lines.push(`    ${colors.white(`[${npc.entityId}]`)} ${npc.entityName} - Lv${npc.characterLevel} HP:${npc.vitals.hp}/${npc.vitals.maxHp} (${hpPct}%)${hostileTag}${stateTag}`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

function handleMobBehavior(): CommandResponse {
  const npcs = getAllNpcInstances();

  if (npcs.length === 0) {
    return { type: MessageType.SYSTEM, message: 'No active NPC instances.' };
  }

  const lines = [
    colors.boldYellow(`NPC Behavior States (${npcs.length} total):`),
    '',
  ];

  for (const npc of npcs) {
    const hpPct = Math.round((npc.vitals.hp / npc.vitals.maxHp) * 100);
    const targets = npc.combatState.targets.size;
    const stateColor = npc.behaviorState === 'idle' ? colors.green
      : npc.behaviorState === 'combat' ? colors.red
      : npc.behaviorState === 'fleeing' ? colors.boldYellow
      : colors.cyan;

    let detail = `  ${colors.white(`[${npc.entityId}]`)} ${npc.entityName}`;
    detail += ` - ${stateColor(npc.behaviorState)}`;
    detail += ` | Room:${npc.currentRoomId}`;
    detail += ` | HP:${hpPct}%`;
    detail += ` | Targets:${targets}`;

    if (npc.combatRoomId !== null) {
      detail += ` | CombatRoom:${npc.combatRoomId}`;
    }
    if (npc.fleeDistance > 0) {
      detail += ` | FleeDist:${npc.fleeDistance}`;
    }
    if (npc.hasCalledForHelp) {
      detail += ` | CalledHelp`;
    }
    if (npc.template.roamEnabled) {
      const secsLeft = Math.max(0, Math.round((npc.nextRoamAt - Date.now()) / 1000));
      detail += ` | Roam:${secsLeft}s`;
    }
    detail += ` | Aug:${npc.augmentation ?? 'none'}`;

    lines.push(detail);
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
  lines.push(`  ${colors.boldCyan('@heal [amount] [player]')} - Restore HP (heals self or player)`);
  lines.push(`  ${colors.boldCyan('@drain [amount] [player]')} - Drain mana (for testing regen)`);
  lines.push(`  ${colors.boldCyan('@revive <player>')}        - Revive a dead/dropped player`);
  lines.push(`  ${colors.boldCyan('@teleport <player> <room>')} - Teleport player to a room`);
  lines.push(`  ${colors.boldCyan('@spells')}                 - List all spells in the game`);
  lines.push(`  ${colors.boldCyan('@learn <mnemonic>')}       - Learn a spell for your character`);
  lines.push(`  ${colors.boldCyan('@effect <id> [duration] [player]')} - Apply effect (default 60s, self)`);
  lines.push(`  ${colors.boldCyan('@cleareffect <id|all>')}  - Remove a status effect`);
  lines.push(`  ${colors.boldCyan('@effects')}                - List available effects`);
  lines.push(`  ${colors.boldCyan('@stealth [player]')}       - Show stealth/perception breakdown`);
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
    lines.push(`  ${colors.boldCyan('@spawn <id|name> [qty]')}  - Spawn item in your inventory`);
    lines.push(`  ${colors.boldCyan('@purge items')}            - Remove all items from room`);
    lines.push(`  ${colors.boldCyan('@purge item <id>')}        - Remove specific item instance`);
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands (System):'));
    lines.push(`  ${colors.boldCyan('@reload [type]')}     - Reload data from database`);
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands (NPCs):'));
    lines.push(`  ${colors.boldCyan('@npcs')}                    - List active NPC instances`);
    lines.push(`  ${colors.boldCyan('@mobbehavior')}             - Show NPC behavior states/debug info`);
    lines.push('');
    lines.push(colors.boldYellow('Developer Commands (Stealth/Skills):'));
    lines.push(`  ${colors.boldCyan('@setstealth <mode> [player]')} - Force stealth state (none/sneaking/hidden)`);
    lines.push(`  ${colors.boldCyan('@testbackstab <target>')}  - Test backstab without stealth requirement`);
    lines.push(`  ${colors.boldCyan('@lockpicking [player]')}   - Show lockpicking skill breakdown`);

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

// ============================================================================
// STEALTH TESTING COMMANDS
// ============================================================================

/**
 * Show stealth/perception breakdown for a player
 * Usage: @stealth [player]
 */
async function handleStealthInfo(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  let targetSocket: AuthenticatedSocket = socket;
  let targetName = socket.username;

  // Find target player if specified
  if (args.length > 0) {
    const playerName = args.join(' ').toLowerCase();
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
      return { type: MessageType.ERROR, message: `Player not found: ${args.join(' ')}` };
    }
  }

  if (!targetSocket.characterId) {
    return { type: MessageType.ERROR, message: `${targetName} has no character selected.` };
  }

  // Get character data
  const character = await characterRepo.findCharacterById(targetSocket.characterId);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Check stealth capability
  const hasStealth = await characterHasStealth(character.race, character.class);

  // Get equipped items
  const equippedItems = await itemRepo.getCharacterEquipped(targetSocket.characterId);
  const equipmentStealthMod = getEquipmentStealthModifier(equippedItems);
  const backstabBonuses = getBackstabDamageBonuses(equippedItems);

  // Calculate stealth
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
    equipmentStealthMod,
    0  // TODO: Get actual encumbrance ratio
  );

  // Calculate perception
  const perceptionBreakdown = calculatePerception(
    character.intelligence,
    character.wisdom,
    character.charisma,
    0  // TODO: Equipment perception modifier
  );

  // Build output
  const lines = [
    colors.boldYellow(`Stealth Info for ${targetName}:`),
    '',
    colors.boldCyan('Stealth Capability:'),
    `  Has Stealth: ${hasStealth ? colors.green('Yes') : colors.red('No')}`,
    `  Current Mode: ${colors.white(targetSocket.stealthMode || 'none')}`,
    '',
    colors.boldCyan('Stealth Calculation:'),
    `  Base (race/class stealth): ${colors.white(stealthBreakdown.base.toString())}`,
    `  Stat Bonuses:`,
    `    DEX ${character.dexterity} × 0.25 = ${colors.white(stealthBreakdown.dexterityBonus.toFixed(1))}`,
    `    INT ${character.intelligence} × 0.10 = ${colors.white(stealthBreakdown.intellectBonus.toFixed(1))}`,
    `    CHA ${character.charisma} × 0.25 = ${colors.white(stealthBreakdown.charismaBonus.toFixed(1))}`,
    `  Threshold Bonuses: ${colors.white(stealthBreakdown.thresholdBonus.toString())}`,
    `  Level Bonus (Lv ${character.level}): ${colors.white(stealthBreakdown.levelBonus.toString())}`,
    `  Equipment Modifier: ${equipmentStealthMod >= 0 ? colors.green('+' + equipmentStealthMod) : colors.red(equipmentStealthMod.toString())}`,
    `  Encumbrance Penalty: ${stealthBreakdown.encumbrancePenalty ? colors.red(stealthBreakdown.encumbrancePenalty.toString()) : colors.white('0')}`,
    `  ${colors.boldWhite('Total Stealth:')} ${colors.boldGreen(stealthBreakdown.total.toString())}`,
    '',
    colors.boldCyan('Perception Calculation:'),
    `  INT ${character.intelligence} × 0.2 = ${colors.white(perceptionBreakdown.intellectBonus.toFixed(1))}`,
    `  WIS ${character.wisdom} × 0.2 = ${colors.white(perceptionBreakdown.wisdomBonus.toFixed(1))}`,
    `  CHA ${character.charisma} × 0.1 = ${colors.white(perceptionBreakdown.charismaBonus.toFixed(1))}`,
    `  Equipment Modifier: ${colors.white('0')}`,
    `  ${colors.boldWhite('Total Perception:')} ${colors.boldGreen(perceptionBreakdown.total.toString())}`,
  ];

  // Add backstab bonuses if they have stealth
  if (hasStealth) {
    lines.push('');
    lines.push(colors.boldCyan('Backstab Equipment Bonuses:'));
    lines.push(`  Damage: +${backstabBonuses.minBonus} to +${backstabBonuses.maxBonus}`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Show lockpicking skill breakdown for a player
 * Usage: @lockpicking [player]
 */
async function handleLockpickingInfo(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  let targetSocket: AuthenticatedSocket = socket;
  let targetName = socket.username;

  // Find target player if specified
  if (args.length > 0) {
    const playerName = args.join(' ').toLowerCase();
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
      return { type: MessageType.ERROR, message: `Player not found: ${args.join(' ')}` };
    }
  }

  if (!targetSocket.characterId) {
    return { type: MessageType.ERROR, message: `${targetName} has no character selected.` };
  }

  // Get character data
  const character = await characterRepo.findCharacterById(targetSocket.characterId);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Check lockpicking capability
  const capability = await getLockpickingCapability(character.race, character.class);

  // Calculate lockpicking skill
  const lockpickingBreakdown = await calculateLockpicking(
    {
      dexterity: character.dexterity,
      intelligence: character.intelligence,
      level: character.level,
      race: character.race,
      class: character.class,
    },
    NO_LOCKPICK_BONUS
  );

  // Build output
  const lines = [
    colors.boldYellow(`Lockpicking Info for ${targetName}:`),
    '',
    colors.boldCyan('Lockpicking Capability:'),
    `  Has Lockpicking: ${capability.hasLockpicking ? colors.green('Yes') : colors.red('No')}`,
    `  From Race: ${capability.hasRacialLockpicking ? colors.green('Yes') : colors.red('No')}`,
    `  From Class: ${capability.hasClassLockpicking ? colors.green('Yes') : colors.red('No')}`,
    '',
    colors.boldCyan('Lockpicking Calculation:'),
    `  Base (race/class): ${colors.white(lockpickingBreakdown.base.toString())}`,
    `  Level Bonus (+1/level): ${colors.white(lockpickingBreakdown.levelBonus.toString())}`,
    `  Stat Bonuses:`,
    `    DEX ${character.dexterity} (+2.5 per 10): ${colors.white(lockpickingBreakdown.dexterityBonus.toFixed(1))}`,
    `    INT ${character.intelligence} (+1 per 10): ${colors.white(lockpickingBreakdown.intellectBonus.toFixed(1))}`,
    `  Item Bonus (lockpick): ${lockpickingBreakdown.itemBonus > 0 ? colors.green('+' + lockpickingBreakdown.itemBonus) : colors.white('0')}`,
    `  ${colors.boldWhite('Total Lockpicking:')} ${colors.boldGreen(lockpickingBreakdown.total.toString())}`,
  ];

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Force a player's stealth state
 * Usage: @setstealth <none|sneaking|hidden> [player]
 */
async function handleSetStealth(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @setstealth <none|sneaking|hidden> [player]' };
  }

  const mode = args[0].toLowerCase() as StealthMode;
  if (!['none', 'sneaking', 'hidden'].includes(mode)) {
    return { type: MessageType.ERROR, message: 'Invalid stealth mode. Use: none, sneaking, or hidden' };
  }

  let targetSocket: AuthenticatedSocket = socket;
  let targetName = socket.username;

  // Find target player if specified
  if (args.length > 1) {
    const playerName = args.slice(1).join(' ').toLowerCase();
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
      return { type: MessageType.ERROR, message: `Player not found: ${args.slice(1).join(' ')}` };
    }
  }

  const oldMode = targetSocket.stealthMode || 'none';
  setStealthMode(targetSocket, mode);
  sendVitals(targetSocket);

  if (targetSocket === socket) {
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Stealth mode changed:')} ${oldMode} -> ${mode}`,
    };
  } else {
    sendMessage(targetSocket, MessageType.SYSTEM, `${colors.yellow('Your stealth mode was changed to:')} ${mode}`);
    return {
      type: MessageType.SYSTEM,
      message: `${colors.boldGreen('Set stealth mode for')} ${targetName}: ${oldMode} -> ${mode}`,
    };
  }
}

/**
 * Test backstab without stealth requirement
 * Usage: @testbackstab <target>
 */
async function handleTestBackstab(
  args: string[],
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  if (args.length < 1) {
    return { type: MessageType.ERROR, message: 'Usage: @testbackstab <target>' };
  }

  // Temporarily set to hidden for the backstab, then restore
  const originalMode = socket.stealthMode || 'none';
  setStealthMode(socket, 'hidden');

  try {
    // Import and call the backstab handler
    const { handleBackstab } = await import('./stealth/stealthCommands.js');
    const result = await handleBackstab(socket, args, connectedPlayers);

    // The backstab handler will break stealth, so we don't need to restore it
    return result;
  } catch (error) {
    // Restore original mode on error
    setStealthMode(socket, originalMode);
    return { type: MessageType.ERROR, message: `Backstab failed: ${error}` };
  }
}
