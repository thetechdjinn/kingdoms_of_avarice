import { MessageType, ItemLocationType, ItemInstance, getItemDisplayName, EquipmentSlot, ItemType, TWO_HANDED_BLOCKED_SLOTS, getAlternatePairedSlot, ItemCondition, CraftingRecipe, Enchantment, AppliedEnchantment } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket, broadcastToRoom } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { wordWrap } from '../utils/textFormat.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as craftingRepo from '../db/repositories/craftingRepository.js';

// Get the display name for an item (uses name, falls back to short_desc for legacy)
// Returns name as stored in database (should be lowercase)
function getItemName(item: ItemInstance): string {
  return item.template?.name ?? item.template?.short_desc ?? 'something';
}

// Add article (a/an) to item name
function withArticle(name: string): string {
  const lower = name.toLowerCase();
  // Check if already has an article
  if (lower.startsWith('a ') || lower.startsWith('an ') || lower.startsWith('the ') || lower.startsWith('some ')) {
    return name;
  }
  // Use "an" for vowel sounds
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const article = vowels.includes(lower[0]) ? 'an' : 'a';
  return `${article} ${name}`;
}

// Check if matches are all the same item type (same template)
function areAllSameTemplate(matches: ItemInstance[]): boolean {
  if (matches.length <= 1) return true;
  const firstTemplateId = matches[0].template_id;
  return matches.every(m => m.template_id === firstTemplateId);
}

// Format disambiguation prompt - shows matching items and asks for more specific input
function formatDisambiguation(matches: ItemInstance[]): string {
  const uniqueNames = [...new Set(matches.map(m => getItemName(m)))];
  const itemList = uniqueNames.map(name => colors.item(withArticle(name))).join(', ');
  return `Be more specific. You see: ${itemList}`;
}

// Handle "get <item>" or "get <quantity> <item>" command
export async function handleGet(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Get what?' };
  }

  // Handle "get all"
  if (args[0].toLowerCase() === 'all') {
    return handleGetAll(socket, currentRoomId);
  }

  // Check if first arg is a quantity (e.g., "get 5 coins")
  let quantity = 1;
  let keyword: string;
  
  const firstArgNum = parseInt(args[0]);
  if (!isNaN(firstArgNum) && firstArgNum > 0 && args.length > 1) {
    quantity = firstArgNum;
    keyword = args.slice(1).join(' ');
  } else {
    keyword = args.join(' ');
  }

  // Find matching items in the room
  const matches = await itemRepo.findItemsInRoomByKeyword(currentRoomId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't see that here.` };
  }

  // If multiple different item types match, ask for more specific input
  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  // If quantity > 1 requested, we may need to pick up from multiple instances
  if (quantity > 1) {
    return pickUpMultipleItems(socket, matches, currentRoomId, quantity);
  }
  
  const item = matches[0];
  
  // Handle stacked items (pick up 1 from stack)
  if (item.quantity > 1) {
    return pickUpItemQuantity(socket, item, currentRoomId, 1);
  }

  // Non-stacked item with no quantity specified - pick up the whole thing
  return pickUpItem(socket, item, currentRoomId);
}

// Actually pick up an item
async function pickUpItem(
  socket: AuthenticatedSocket,
  item: ItemInstance,
  currentRoomId: number
): Promise<CommandResponse> {
  // Check if item is takeable
  if (item.template?.flags?.takeable === false) {
    return { type: MessageType.ERROR, message: `You can't pick that up.` };
  }

  // Check if we can stack with existing item in inventory
  const existingStack = await itemRepo.findStackableInstance(
    item.template_id,
    ItemLocationType.PLAYER,
    socket.playerId
  );
  
  if (existingStack) {
    // Add to existing stack and delete room instance
    await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
    await itemRepo.deleteInstance(item.id);
  } else {
    // Move item to player inventory
    await itemRepo.updateInstanceLocation(
      item.id,
      ItemLocationType.PLAYER,
      socket.playerId
    );
  }

  const itemName = getItemName(item);
  
  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} picks up ${withArticle(itemName)}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You pick up ${colors.item(withArticle(itemName))}.` };
}

// Pick up from multiple instances to reach requested quantity
async function pickUpMultipleItems(
  socket: AuthenticatedSocket,
  items: ItemInstance[],
  currentRoomId: number,
  requestedQuantity: number
): Promise<CommandResponse> {
  // Check if items are takeable
  if (items[0].template?.flags?.takeable === false) {
    return { type: MessageType.ERROR, message: `You can't pick that up.` };
  }

  const itemName = getItemName(items[0]);
  
  // Calculate total available
  const totalAvailable = items.reduce((sum, item) => sum + item.quantity, 0);
  const actualQuantity = Math.min(requestedQuantity, totalAvailable);
  
  let remaining = actualQuantity;
  
  for (const item of items) {
    if (remaining <= 0) break;
    
    const takeFromThis = Math.min(remaining, item.quantity);
    
    if (takeFromThis >= item.quantity) {
      // Taking all from this instance - check if we can stack with existing in inventory
      const existingStack = await itemRepo.findStackableInstance(
        item.template_id,
        ItemLocationType.PLAYER,
        socket.playerId
      );
      
      if (existingStack) {
        await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
        await itemRepo.deleteInstance(item.id);
      } else {
        await itemRepo.updateInstanceLocation(
          item.id,
          ItemLocationType.PLAYER,
          socket.playerId
        );
      }
    } else {
      // Taking partial from this instance
      await itemRepo.updateInstanceQuantity(item.id, item.quantity - takeFromThis);
      
      const existingStack = await itemRepo.findStackableInstance(
        item.template_id,
        ItemLocationType.PLAYER,
        socket.playerId
      );
      
      if (existingStack) {
        await itemRepo.addToInstanceQuantity(existingStack.id, takeFromThis);
      } else {
        await itemRepo.createInstance({
          template_id: item.template_id,
          location_type: ItemLocationType.PLAYER,
          location_id: socket.playerId,
          quantity: takeFromThis,
          condition: item.condition,
        });
      }
    }
    
    remaining -= takeFromThis;
  }

  const displayName = actualQuantity > 1 ? `${actualQuantity} ${itemName}` : withArticle(itemName);

  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} picks up ${displayName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You pick up ${colors.item(displayName)}.` };
}

// Pick up a specific quantity from a stacked item
async function pickUpItemQuantity(
  socket: AuthenticatedSocket,
  item: ItemInstance,
  currentRoomId: number,
  quantity: number
): Promise<CommandResponse> {
  // Check if item is takeable
  if (item.template?.flags?.takeable === false) {
    return { type: MessageType.ERROR, message: `You can't pick that up.` };
  }

  // Clamp quantity to available amount
  const actualQuantity = Math.min(quantity, item.quantity);
  const itemName = getItemName(item);

  if (actualQuantity >= item.quantity) {
    // Picking up all - check if we can stack with existing item in inventory
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.PLAYER,
      socket.playerId
    );
    
    if (existingStack) {
      // Add to existing stack and delete room instance
      await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
      await itemRepo.deleteInstance(item.id);
    } else {
      // Just move the whole stack to inventory
      await itemRepo.updateInstanceLocation(
        item.id,
        ItemLocationType.PLAYER,
        socket.playerId
      );
    }
  } else {
    // Picking up partial - reduce room stack
    await itemRepo.updateInstanceQuantity(item.id, item.quantity - actualQuantity);
    
    // Check if we can stack with existing item in inventory
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.PLAYER,
      socket.playerId
    );
    
    if (existingStack) {
      // Add to existing stack
      await itemRepo.addToInstanceQuantity(existingStack.id, actualQuantity);
    } else {
      // Create new instance in player inventory
      await itemRepo.createInstance({
        template_id: item.template_id,
        location_type: ItemLocationType.PLAYER,
        location_id: socket.playerId,
        quantity: actualQuantity,
        condition: item.condition,
      });
    }
  }

  const displayName = actualQuantity > 1 ? `${actualQuantity} ${itemName}` : withArticle(itemName);

  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} picks up ${displayName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You pick up ${colors.item(displayName)}.` };
}

// Handle "get all" command
async function handleGetAll(
  socket: AuthenticatedSocket,
  currentRoomId: number
): Promise<CommandResponse> {
  const items = await itemRepo.getInstancesInRoom(currentRoomId);
  
  // Filter to takeable items only
  const takeableItems = items.filter(i => i.template?.flags?.takeable !== false);

  if (takeableItems.length === 0) {
    return { type: MessageType.ERROR, message: `There's nothing here to pick up.` };
  }

  const pickedUp: string[] = [];

  for (const item of takeableItems) {
    // Check if we can stack with existing item in inventory
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.PLAYER,
      socket.playerId
    );
    
    if (existingStack) {
      await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
      await itemRepo.deleteInstance(item.id);
    } else {
      await itemRepo.updateInstanceLocation(
        item.id,
        ItemLocationType.PLAYER,
        socket.playerId
      );
    }
    pickedUp.push(getItemName(item));
  }

  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} picks up some items.`, socket.playerId);

  return {
    type: MessageType.OUTPUT,
    message: `You pick up: ${pickedUp.map(n => colors.item(n)).join(', ')}.`,
  };
}

// Handle "drop <item>" or "drop <quantity> <item>" command
export async function handleDrop(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Drop what?' };
  }

  // Handle "drop all"
  if (args[0].toLowerCase() === 'all') {
    return handleDropAll(socket, currentRoomId);
  }

  // Check if first arg is a quantity (e.g., "drop 5 coins")
  let quantity = 1;
  let keyword: string;
  
  const firstArgNum = parseInt(args[0]);
  if (!isNaN(firstArgNum) && firstArgNum > 0 && args.length > 1) {
    quantity = firstArgNum;
    keyword = args.slice(1).join(' ');
  } else {
    keyword = args.join(' ');
  }

  // Find matching items in inventory
  const matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  // If multiple different item types match, ask for more specific input
  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  // If quantity > 1 requested, we may need to drop from multiple instances
  if (quantity > 1) {
    return dropMultipleItems(socket, matches, currentRoomId, quantity);
  }
  
  const item = matches[0];
  
  // Handle stacked items (drop 1 from stack)
  if (item.quantity > 1) {
    return dropItemQuantity(socket, item, currentRoomId, 1);
  }

  // Non-stacked item with no quantity specified - drop the whole thing
  return dropItem(socket, item, currentRoomId);
}

// Drop from multiple instances to reach requested quantity
async function dropMultipleItems(
  socket: AuthenticatedSocket,
  items: ItemInstance[],
  currentRoomId: number,
  requestedQuantity: number
): Promise<CommandResponse> {
  // Check if items have no_drop flag
  if (items[0].template?.flags?.no_drop) {
    return { type: MessageType.ERROR, message: `You can't drop that.` };
  }

  const itemName = getItemName(items[0]);
  
  // Calculate total available
  const totalAvailable = items.reduce((sum, item) => sum + item.quantity, 0);
  const actualQuantity = Math.min(requestedQuantity, totalAvailable);
  
  let remaining = actualQuantity;
  
  for (const item of items) {
    if (remaining <= 0) break;
    
    const dropFromThis = Math.min(remaining, item.quantity);
    
    if (dropFromThis >= item.quantity) {
      // Dropping all from this instance - check if we can stack with existing in room
      const existingStack = await itemRepo.findStackableInstance(
        item.template_id,
        ItemLocationType.ROOM,
        currentRoomId
      );
      
      if (existingStack) {
        await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
        await itemRepo.deleteInstance(item.id);
      } else {
        await itemRepo.updateInstanceLocation(
          item.id,
          ItemLocationType.ROOM,
          currentRoomId
        );
      }
    } else {
      // Dropping partial from this instance
      await itemRepo.updateInstanceQuantity(item.id, item.quantity - dropFromThis);
      
      const existingStack = await itemRepo.findStackableInstance(
        item.template_id,
        ItemLocationType.ROOM,
        currentRoomId
      );
      
      if (existingStack) {
        await itemRepo.addToInstanceQuantity(existingStack.id, dropFromThis);
      } else {
        await itemRepo.createInstance({
          template_id: item.template_id,
          location_type: ItemLocationType.ROOM,
          location_id: currentRoomId,
          quantity: dropFromThis,
          condition: item.condition,
        });
      }
    }
    
    remaining -= dropFromThis;
  }

  const displayName = actualQuantity > 1 ? `${actualQuantity} ${itemName}` : withArticle(itemName);

  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} drops ${displayName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You drop ${colors.item(displayName)}.` };
}

// Actually drop an item
async function dropItem(
  socket: AuthenticatedSocket,
  item: ItemInstance,
  currentRoomId: number
): Promise<CommandResponse> {
  // Check if item has no_drop flag
  if (item.template?.flags?.no_drop) {
    return { type: MessageType.ERROR, message: `You can't drop that.` };
  }

  // Check if we can stack with existing item in room
  const existingStack = await itemRepo.findStackableInstance(
    item.template_id,
    ItemLocationType.ROOM,
    currentRoomId
  );
  
  if (existingStack) {
    // Add to existing stack and delete inventory instance
    await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
    await itemRepo.deleteInstance(item.id);
  } else {
    // Move item to room
    await itemRepo.updateInstanceLocation(
      item.id,
      ItemLocationType.ROOM,
      currentRoomId
    );
  }

  const itemName = getItemName(item);

  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} drops ${withArticle(itemName)}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You drop ${colors.item(withArticle(itemName))}.` };
}

// Drop a specific quantity from a stacked item
async function dropItemQuantity(
  socket: AuthenticatedSocket,
  item: ItemInstance,
  currentRoomId: number,
  quantity: number
): Promise<CommandResponse> {
  // Check if item has no_drop flag
  if (item.template?.flags?.no_drop) {
    return { type: MessageType.ERROR, message: `You can't drop that.` };
  }

  // Clamp quantity to available amount
  const actualQuantity = Math.min(quantity, item.quantity);
  const itemName = getItemName(item);

  if (actualQuantity >= item.quantity) {
    // Dropping all - check if we can stack with existing item in room
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.ROOM,
      currentRoomId
    );
    
    if (existingStack) {
      // Add to existing stack and delete our instance
      await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
      await itemRepo.deleteInstance(item.id);
    } else {
      // Just move the whole stack to room
      await itemRepo.updateInstanceLocation(
        item.id,
        ItemLocationType.ROOM,
        currentRoomId
      );
    }
  } else {
    // Dropping partial - reduce inventory stack
    await itemRepo.updateInstanceQuantity(item.id, item.quantity - actualQuantity);
    
    // Check if we can stack with existing item in room
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.ROOM,
      currentRoomId
    );
    
    if (existingStack) {
      // Add to existing stack
      await itemRepo.addToInstanceQuantity(existingStack.id, actualQuantity);
    } else {
      // Create new instance in room
      await itemRepo.createInstance({
        template_id: item.template_id,
        location_type: ItemLocationType.ROOM,
        location_id: currentRoomId,
        quantity: actualQuantity,
        condition: item.condition,
      });
    }
  }

  const displayName = actualQuantity > 1 ? `${actualQuantity} ${itemName}` : withArticle(itemName);

  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} drops ${displayName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You drop ${colors.item(displayName)}.` };
}

// Handle "drop all" command
async function handleDropAll(
  socket: AuthenticatedSocket,
  currentRoomId: number
): Promise<CommandResponse> {
  const items = await itemRepo.getPlayerInventory(socket.playerId);

  // Filter out no_drop items
  const droppableItems = items.filter(i => !i.template?.flags?.no_drop);

  if (droppableItems.length === 0) {
    return { type: MessageType.ERROR, message: `You have nothing to drop.` };
  }

  const dropped: string[] = [];

  for (const item of droppableItems) {
    // Check if we can stack with existing item in room
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.ROOM,
      currentRoomId
    );
    
    if (existingStack) {
      await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
      await itemRepo.deleteInstance(item.id);
    } else {
      await itemRepo.updateInstanceLocation(
        item.id,
        ItemLocationType.ROOM,
        currentRoomId
      );
    }
    dropped.push(getItemName(item));
  }

  // Broadcast to room
  broadcastToRoom(currentRoomId, `${socket.username} drops some items.`, socket.playerId);

  return {
    type: MessageType.OUTPUT,
    message: `You drop: ${dropped.map(n => colors.item(n)).join(', ')}.`,
  };
}

// Slot display names for inventory (hyphenated format)
const INVENTORY_SLOT_NAMES: Record<string, string> = {
  'head': 'head',
  'face': 'face',
  'neck': 'neck',
  'back': 'back',
  'body': 'body',
  'arms': 'arms',
  'hands': 'hands',
  'wrist_left': 'left-wrist',
  'wrist_right': 'right-wrist',
  'finger_left': 'left-finger',
  'finger_right': 'right-finger',
  'waist': 'waist',
  'legs': 'legs',
  'feet': 'feet',
  'main_hand': 'main-hand',
  'off_hand': 'off-hand',
  'shield': 'shield',
  'held': 'held',
};

// Handle "inventory" / "i" command
export async function handleInventory(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  const items = await itemRepo.getPlayerInventory(socket.playerId);
  const equipped = await itemRepo.getPlayerEquipped(socket.playerId);

  if (items.length === 0 && equipped.length === 0) {
    return { type: MessageType.OUTPUT, message: 'You are not carrying anything.' };
  }

  const lines = [colors.boldYellow('You are carrying:')];

  // Show equipped items first with slot indicator
  for (const item of equipped) {
    const name = getItemName(item);
    const slot = item.equipped_slot ? INVENTORY_SLOT_NAMES[item.equipped_slot] || item.equipped_slot : 'worn';
    lines.push(`  ${colors.item(name)} (${slot})`);
  }

  // Show inventory items
  for (const item of items) {
    const display = itemRepo.instanceToDisplay(item);
    const name = getItemDisplayName(display);
    lines.push(`  ${colors.item(name)}`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// Handle "examine <item>" / "look <item>" command
export async function handleExamine(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Examine what?' };
  }

  const keyword = args.join(' ');

  // First check inventory (includes equipped items)
  let matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  // Also check equipped items
  if (matches.length === 0) {
    const equipped = await itemRepo.getPlayerEquipped(socket.playerId);
    matches = equipped.filter(item => {
      const template = item.template;
      if (!template) return false;
      const kw = keyword.toLowerCase();
      return template.name.toLowerCase().includes(kw) ||
             template.keywords?.some(k => k.toLowerCase().includes(kw));
    });
  }

  // If not in inventory or equipped, check room
  if (matches.length === 0) {
    matches = await itemRepo.findItemsInRoomByKeyword(currentRoomId, keyword);
  }

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't see that here.` };
  }

  // If multiple different item types match, ask for more specific input
  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  return formatItemExamine(item);
}

// Format detailed item examination
function formatItemExamine(item: ItemInstance): CommandResponse {
  const template = item.template;
  if (!template) {
    return { type: MessageType.ERROR, message: 'You see nothing special.' };
  }

  const lines: string[] = [];

  // Name
  lines.push(colors.boldYellow(template.name));

  // Long description (word wrapped)
  if (template.long_desc) {
    lines.push(wordWrap(template.long_desc, 80));
  }

  // Condition (if not pristine)
  if (item.condition !== 'pristine') {
    lines.push(`It is in ${colors.boldWhite(item.condition)} condition.`);
  }

  // Weight
  if (template.weight > 0) {
    lines.push(`It weighs about ${template.weight} unit${template.weight !== 1 ? 's' : ''}.`);
  }

  // Weapon info
  if (template.weapon_data) {
    const wd = template.weapon_data;
    lines.push(`Damage: ${colors.boldWhite(wd.damage_dice)} (${wd.damage_type})`);
    if (template.flags?.two_handed) {
      lines.push('This is a two-handed weapon.');
    }
  }

  // Armor info
  if (template.armor_data) {
    const ad = template.armor_data;
    lines.push(`Armor Class: ${colors.boldWhite(String(ad.armor_class))}`);
    if (ad.weight_class) {
      lines.push(`Weight Class: ${ad.weight_class}`);
    }
  }

  // Value
  if (template.base_value > 0) {
    lines.push(`It looks to be worth about ${colors.gold(String(template.base_value))} gold.`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// Get items to display in room description
export async function getRoomItemsDescription(roomId: number): Promise<string | null> {
  const displays = await itemRepo.getRoomItemDisplays(roomId);

  if (displays.length === 0) {
    return null;
  }

  const itemNames = displays.map(d => {
    const name = d.name || d.short_desc;
    // Format: "sparkling ruby" or "2 sparkling ruby"
    return d.quantity > 1 ? `${d.quantity} ${name}` : name;
  });

  // "You notice <item1>, <item2>, <item3>." in cyan
  return colors.cyan(`You notice ${itemNames.join(', ')}.`);
}

// ============================================================================
// EQUIPMENT COMMANDS
// ============================================================================

// Slot display names for user-friendly output
const SLOT_DISPLAY_NAMES: Record<EquipmentSlot, string> = {
  [EquipmentSlot.HEAD]: 'Head',
  [EquipmentSlot.FACE]: 'Face',
  [EquipmentSlot.NECK]: 'Neck',
  [EquipmentSlot.BACK]: 'Back',
  [EquipmentSlot.BODY]: 'Body',
  [EquipmentSlot.ARMS]: 'Arms',
  [EquipmentSlot.HANDS]: 'Hands',
  [EquipmentSlot.WRIST_LEFT]: 'Left Wrist',
  [EquipmentSlot.WRIST_RIGHT]: 'Right Wrist',
  [EquipmentSlot.FINGER_LEFT]: 'Left Finger',
  [EquipmentSlot.FINGER_RIGHT]: 'Right Finger',
  [EquipmentSlot.WAIST]: 'Waist',
  [EquipmentSlot.LEGS]: 'Legs',
  [EquipmentSlot.FEET]: 'Feet',
  [EquipmentSlot.MAIN_HAND]: 'Main Hand',
  [EquipmentSlot.OFF_HAND]: 'Off Hand',
  [EquipmentSlot.SHIELD]: 'Shield',
  [EquipmentSlot.HELD]: 'Held',
};

// Handle "wield <item>" command - for weapons
export async function handleWield(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Wield what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  const template = item.template;

  // Must be a weapon
  if (!template || template.item_type !== ItemType.WEAPON) {
    return { type: MessageType.ERROR, message: `You can't wield that.` };
  }

  // Check if it's a two-handed weapon
  const isTwoHanded = template.flags?.two_handed === true;

  // Get currently equipped items
  const equipped = await itemRepo.getPlayerEquipped(socket.playerId);

  // Check for two-handed weapon conflicts
  if (isTwoHanded) {
    // Unequip anything in off_hand, shield, or held slots (unless cursed)
    for (const equippedItem of equipped) {
      if (equippedItem.equipped_slot && TWO_HANDED_BLOCKED_SLOTS.includes(equippedItem.equipped_slot as EquipmentSlot)) {
        if (equippedItem.template?.flags?.cursed) {
          return { type: MessageType.ERROR, message: `You can't wield that - a cursed item is blocking the slot.` };
        }
        await itemRepo.updateInstanceLocation(equippedItem.id, ItemLocationType.PLAYER, socket.playerId);
        const unequippedName = getItemName(equippedItem);
        broadcastToRoom(currentRoomId, `${socket.username} stops using ${unequippedName}.`, socket.playerId);
      }
    }
  }

  // Check if wielding with a two-handed weapon already equipped
  const mainHandItem = equipped.find(e => e.equipped_slot === EquipmentSlot.MAIN_HAND);
  if (mainHandItem) {
    if (mainHandItem.template?.flags?.cursed) {
      return { type: MessageType.ERROR, message: `You can't remove your current weapon - it's cursed!` };
    }
    // Unequip current main hand weapon
    await itemRepo.updateInstanceLocation(mainHandItem.id, ItemLocationType.PLAYER, socket.playerId);
    const unequippedName = getItemName(mainHandItem);
    broadcastToRoom(currentRoomId, `${socket.username} stops wielding ${unequippedName}.`, socket.playerId);
  }

  // Equip the new weapon
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.EQUIPPED, socket.playerId, EquipmentSlot.MAIN_HAND);

  const itemName = template.name;
  broadcastToRoom(currentRoomId, `${socket.username} wields ${itemName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You wield ${colors.item(itemName)}.` };
}

// Handle "wear <item>" command - for armor/accessories
export async function handleWear(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Wear what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  const template = item.template;

  // Must have an equipment slot and not be a weapon (use wield for weapons)
  if (!template || !template.equipment_slot) {
    return { type: MessageType.ERROR, message: `You can't wear that.` };
  }

  if (template.item_type === ItemType.WEAPON) {
    return { type: MessageType.ERROR, message: `Use 'wield' for weapons.` };
  }

  let targetSlot = template.equipment_slot as EquipmentSlot;

  // Get currently equipped items
  const equipped = await itemRepo.getPlayerEquipped(socket.playerId);

  // Check if a two-handed weapon is equipped and this would conflict
  const mainHandItem = equipped.find(e => e.equipped_slot === EquipmentSlot.MAIN_HAND);
  if (mainHandItem?.template?.flags?.two_handed && TWO_HANDED_BLOCKED_SLOTS.includes(targetSlot)) {
    return { type: MessageType.ERROR, message: `You can't wear that while wielding a two-handed weapon.` };
  }

  // Check if slot is already occupied
  const currentlyInSlot = equipped.find(e => e.equipped_slot === targetSlot);

  // For paired slots (wrists, fingers), try alternate slot if primary is full
  if (currentlyInSlot) {
    const alternateSlot = getAlternatePairedSlot(targetSlot);
    if (alternateSlot) {
      const inAlternate = equipped.find(e => e.equipped_slot === alternateSlot);
      if (!inAlternate) {
        targetSlot = alternateSlot;
      } else {
        // Both slots full - check if primary slot item is cursed
        if (currentlyInSlot.template?.flags?.cursed) {
          return { type: MessageType.ERROR, message: `You can't remove that - it's cursed!` };
        }
        // Unequip from primary slot
        await itemRepo.updateInstanceLocation(currentlyInSlot.id, ItemLocationType.PLAYER, socket.playerId);
        const unequippedName = getItemName(currentlyInSlot);
        broadcastToRoom(currentRoomId, `${socket.username} removes ${unequippedName}.`, socket.playerId);
      }
    } else {
      // Not a paired slot - check if current item is cursed
      if (currentlyInSlot.template?.flags?.cursed) {
        return { type: MessageType.ERROR, message: `You can't remove that - it's cursed!` };
      }
      // Unequip current item
      await itemRepo.updateInstanceLocation(currentlyInSlot.id, ItemLocationType.PLAYER, socket.playerId);
      const unequippedName = getItemName(currentlyInSlot);
      broadcastToRoom(currentRoomId, `${socket.username} removes ${unequippedName}.`, socket.playerId);
    }
  }

  // Equip the item
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.EQUIPPED, socket.playerId, targetSlot);

  const itemName = template.name;
  broadcastToRoom(currentRoomId, `${socket.username} wears ${itemName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You wear ${colors.item(itemName)}.` };
}

// Handle "remove <item>" command
export async function handleRemove(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Remove what?' };
  }

  const keyword = args.join(' ');

  // Search equipped items
  const equipped = await itemRepo.getPlayerEquipped(socket.playerId);
  
  // Filter by keyword
  const matches = equipped.filter(item => {
    const template = item.template;
    if (!template) return false;
    const searchTerm = keyword.toLowerCase();
    if (template.name.toLowerCase().includes(searchTerm)) return true;
    if (template.keywords?.some(kw => kw.toLowerCase().includes(searchTerm))) return true;
    return false;
  });

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You're not wearing that.` };
  }

  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  const template = item.template;

  // Check for cursed items
  if (template?.flags?.cursed) {
    return { type: MessageType.ERROR, message: `You can't remove that! It's cursed!` };
  }

  // Move to inventory
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.PLAYER, socket.playerId);

  const itemName = template?.name ?? 'something';
  broadcastToRoom(currentRoomId, `${socket.username} removes ${itemName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You remove ${colors.item(itemName)}.` };
}

// Handle "equipment" / "eq" command
export async function handleEquipment(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  const equipped = await itemRepo.getPlayerEquipped(socket.playerId);

  if (equipped.length === 0) {
    return { type: MessageType.OUTPUT, message: 'You are not wearing anything.' };
  }

  const lines = [colors.boldYellow('You are wearing:')];

  // Sort by slot order
  const slotOrder: EquipmentSlot[] = [
    EquipmentSlot.HEAD,
    EquipmentSlot.FACE,
    EquipmentSlot.NECK,
    EquipmentSlot.BACK,
    EquipmentSlot.BODY,
    EquipmentSlot.ARMS,
    EquipmentSlot.HANDS,
    EquipmentSlot.WRIST_LEFT,
    EquipmentSlot.WRIST_RIGHT,
    EquipmentSlot.FINGER_LEFT,
    EquipmentSlot.FINGER_RIGHT,
    EquipmentSlot.WAIST,
    EquipmentSlot.LEGS,
    EquipmentSlot.FEET,
    EquipmentSlot.MAIN_HAND,
    EquipmentSlot.OFF_HAND,
    EquipmentSlot.SHIELD,
    EquipmentSlot.HELD,
  ];

  for (const slot of slotOrder) {
    const item = equipped.find(e => e.equipped_slot === slot);
    if (item) {
      const slotName = SLOT_DISPLAY_NAMES[slot];
      const itemName = getItemName(item);
      lines.push(`  ${colors.boldWhite(slotName + ':')} ${colors.item(itemName)}`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// CONTAINER COMMANDS
// ============================================================================

// Find a container by keyword in inventory or room
async function findContainer(
  socket: AuthenticatedSocket,
  keyword: string,
  currentRoomId: number
): Promise<{ container: ItemInstance | null; error?: string }> {
  // Check inventory first
  let matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);
  
  // Filter to containers only
  let containers = matches.filter(m => m.template?.item_type === ItemType.CONTAINER);
  
  // If not in inventory, check room
  if (containers.length === 0) {
    matches = await itemRepo.findItemsInRoomByKeyword(currentRoomId, keyword);
    containers = matches.filter(m => m.template?.item_type === ItemType.CONTAINER);
  }

  if (containers.length === 0) {
    return { container: null, error: `You don't see that container.` };
  }

  if (containers.length > 1 && !areAllSameTemplate(containers)) {
    return { container: null, error: formatDisambiguation(containers) };
  }

  return { container: containers[0] };
}

// Handle "put <item> in <container>" command
export async function handlePut(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Put what where?' };
  }

  const input = args.join(' ');
  
  // Parse "put <item> in <container>" format
  // Use word boundary to avoid matching "in" within words like "ring"
  const inMatch = input.match(/^(.+?)\s+\bin\b\s+(.+)$/i);
  if (!inMatch) {
    return { type: MessageType.ERROR, message: 'Usage: put <item> in <container>' };
  }

  const itemKeyword = inMatch[1].trim();
  const containerKeyword = inMatch[2].trim();

  // Find the item in inventory
  const itemMatches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, itemKeyword);

  if (itemMatches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (itemMatches.length > 1 && !areAllSameTemplate(itemMatches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(itemMatches) };
  }

  const item = itemMatches[0];

  // Find the container
  const { container, error } = await findContainer(socket, containerKeyword, currentRoomId);
  if (!container) {
    return { type: MessageType.ERROR, message: error! };
  }

  // Can't put container in itself
  if (container.id === item.id) {
    return { type: MessageType.ERROR, message: `You can't put something inside itself.` };
  }

  // Can't put containers inside other containers (prevent nesting for now)
  if (item.template?.item_type === ItemType.CONTAINER) {
    return { type: MessageType.ERROR, message: `You can't put containers inside other containers.` };
  }

  // Check container capacity (item count)
  const containerTemplate = container.template;
  if (containerTemplate?.container_capacity) {
    const currentCount = await itemRepo.getContainerItemCount(container.id);
    if (currentCount >= containerTemplate.container_capacity) {
      return { type: MessageType.ERROR, message: `The ${containerTemplate.name} is full.` };
    }
  }

  // Check container weight limit
  if (containerTemplate?.container_weight_limit) {
    const currentWeight = await itemRepo.getContainerWeight(container.id);
    const itemWeight = (item.template?.weight ?? 0) * item.quantity;
    if (currentWeight + itemWeight > containerTemplate.container_weight_limit) {
      return { type: MessageType.ERROR, message: `That would be too heavy for the ${containerTemplate.name}.` };
    }
  }

  // Move item to container
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.CONTAINER, container.id);

  const itemName = getItemName(item);
  const containerName = containerTemplate?.name ?? 'something';

  broadcastToRoom(currentRoomId, `${socket.username} puts ${itemName} in ${containerName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You put ${colors.item(itemName)} in ${colors.item(containerName)}.` };
}

// Handle "get <item> from <container>" command
export async function handleGetFrom(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Get what from where?' };
  }

  const input = args.join(' ');
  
  // Parse "get <item> from <container>" format
  const fromMatch = input.match(/^(.+?)\s+\bfrom\b\s+(.+)$/i);
  if (!fromMatch) {
    return { type: MessageType.ERROR, message: 'Usage: get <item> from <container>' };
  }

  const itemKeyword = fromMatch[1].trim();
  const containerKeyword = fromMatch[2].trim();

  // Find the container
  const { container, error } = await findContainer(socket, containerKeyword, currentRoomId);
  if (!container) {
    return { type: MessageType.ERROR, message: error! };
  }

  // Handle "get all from <container>"
  if (itemKeyword.toLowerCase() === 'all') {
    return handleGetAllFromContainer(socket, container, currentRoomId);
  }

  // Find the item in the container
  const itemMatches = await itemRepo.findItemsInContainerByKeyword(container.id, itemKeyword);

  if (itemMatches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't see that in there.` };
  }

  if (itemMatches.length > 1 && !areAllSameTemplate(itemMatches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(itemMatches) };
  }

  const item = itemMatches[0];

  // Move item to player inventory
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.PLAYER, socket.playerId);

  const itemName = getItemName(item);
  const containerName = container.template?.name ?? 'something';

  broadcastToRoom(currentRoomId, `${socket.username} gets ${itemName} from ${containerName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You get ${colors.item(itemName)} from ${colors.item(containerName)}.` };
}

// Handle "get all from <container>"
async function handleGetAllFromContainer(
  socket: AuthenticatedSocket,
  container: ItemInstance,
  currentRoomId: number
): Promise<CommandResponse> {
  const items = await itemRepo.getItemsInContainer(container.id);

  if (items.length === 0) {
    return { type: MessageType.ERROR, message: `It's empty.` };
  }

  const pickedUp: string[] = [];

  for (const item of items) {
    await itemRepo.updateInstanceLocation(item.id, ItemLocationType.PLAYER, socket.playerId);
    pickedUp.push(getItemName(item));
  }

  const containerName = container.template?.name ?? 'something';
  broadcastToRoom(currentRoomId, `${socket.username} empties ${containerName}.`, socket.playerId);

  return {
    type: MessageType.OUTPUT,
    message: `You get from ${colors.item(containerName)}: ${pickedUp.map(n => colors.item(n)).join(', ')}.`,
  };
}

// Handle "look in <container>" command
export async function handleLookIn(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Look in what?' };
  }

  const containerKeyword = args.join(' ');

  // Find the container
  const { container, error } = await findContainer(socket, containerKeyword, currentRoomId);
  if (!container) {
    return { type: MessageType.ERROR, message: error! };
  }

  const containerName = container.template?.name ?? 'something';
  const items = await itemRepo.getItemsInContainer(container.id);

  if (items.length === 0) {
    return { type: MessageType.OUTPUT, message: `The ${colors.item(containerName)} is empty.` };
  }

  const lines = [`${colors.item(containerName)} contains:`];
  for (const item of items) {
    const display = itemRepo.instanceToDisplay(item);
    const name = getItemDisplayName(display);
    lines.push(`  ${colors.item(name)}`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// CONSUMABLE COMMANDS
// ============================================================================

// Handle "use <item>" / "eat <item>" / "drink <item>" / "quaff <item>" command
export async function handleUse(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Use what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  const template = item.template;

  // Must be a consumable
  if (!template || template.item_type !== ItemType.CONSUMABLE) {
    return { type: MessageType.ERROR, message: `You can't use that.` };
  }

  const consumableData = template.consumable_data;
  if (!consumableData) {
    return { type: MessageType.ERROR, message: `You can't use that.` };
  }

  // Apply the effect
  const effectResult = applyConsumableEffect(socket, consumableData);

  // Handle charges or delete item
  if (item.charges_remaining !== undefined && item.charges_remaining > 1) {
    // Multi-charge item (like a wand) - decrement charges
    await itemRepo.updateInstanceCharges(item.id, item.charges_remaining - 1);
  } else {
    // Single use or last charge - delete the item
    await itemRepo.deleteInstance(item.id);
  }

  const itemName = template.name;
  broadcastToRoom(currentRoomId, `${socket.username} uses ${itemName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You use ${colors.item(itemName)}. ${effectResult}` };
}

// Apply consumable effect and return description
function applyConsumableEffect(socket: AuthenticatedSocket, data: { effect_type: string; effect_value: number; duration?: number }): string {
  const { effect_type, effect_value } = data;

  switch (effect_type.toLowerCase()) {
    case 'heal':
    case 'health': {
      // Heal the player
      const oldHp = socket.vitals.hp;
      socket.vitals.hp = Math.min(socket.vitals.hp + effect_value, socket.vitals.maxHp);
      const healed = socket.vitals.hp - oldHp;
      return colors.green(`You feel better! (+${healed} HP)`);
    }

    case 'mana':
    case 'restore_mana': {
      // Restore mana
      const oldMana = socket.vitals.resource ?? 0;
      const maxResource = socket.vitals.maxResource ?? 0;
      socket.vitals.resource = Math.min(oldMana + effect_value, maxResource);
      const restored = (socket.vitals.resource ?? 0) - oldMana;
      return colors.blue(`Your magical energy is restored! (+${restored} Mana)`);
    }

    case 'damage':
      // Damage the player (poison, etc.)
      socket.vitals.hp = Math.max(socket.vitals.hp - effect_value, 0);
      return colors.red(`You take ${effect_value} damage!`);

    case 'food':
      // Food effect (placeholder - could track hunger later)
      return colors.yellow(`You feel satiated.`);

    case 'drink':
      // Drink effect (placeholder - could track thirst later)
      return colors.cyan(`You feel refreshed.`);

    default:
      return `The ${effect_type} effect washes over you.`;
  }
}

// ============================================================================
// LIGHT SOURCE COMMANDS
// ============================================================================

// Handle "light <item>" command
export async function handleLight(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Light what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  const template = item.template;

  // Must be a light source
  if (!template || template.item_type !== ItemType.LIGHT) {
    return { type: MessageType.ERROR, message: `You can't light that.` };
  }

  const lightData = template.light_data;
  if (!lightData) {
    return { type: MessageType.ERROR, message: `You can't light that.` };
  }

  // Check if already lit (fuel_remaining > 0 for consumable lights, -1 for permanent lights)
  if (item.fuel_remaining !== undefined && item.fuel_remaining !== 0) {
    return { type: MessageType.ERROR, message: `It's already lit.` };
  }

  // Check if it has fuel (for items with fuel_max)
  if (lightData.fuel_max !== undefined) {
    // Initialize fuel if not set
    const fuelToSet = item.fuel_remaining ?? lightData.fuel_max;
    if (fuelToSet <= 0) {
      return { type: MessageType.ERROR, message: `It's out of fuel.` };
    }
    await itemRepo.updateInstanceFuel(item.id, fuelToSet);
  } else {
    // Permanent light source - set fuel to -1 to indicate "lit"
    await itemRepo.updateInstanceFuel(item.id, -1);
  }

  const itemName = template.name;
  broadcastToRoom(currentRoomId, `${socket.username} lights ${itemName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You light ${colors.item(itemName)}. It casts a warm glow.` };
}

// Handle "extinguish <item>" command
export async function handleExtinguish(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Extinguish what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  const template = item.template;

  // Must be a light source
  if (!template || template.item_type !== ItemType.LIGHT) {
    return { type: MessageType.ERROR, message: `You can't extinguish that.` };
  }

  // Check if it's lit
  if (item.fuel_remaining === undefined || item.fuel_remaining === 0) {
    return { type: MessageType.ERROR, message: `It's not lit.` };
  }

  // Extinguish - set fuel to 0 (preserving remaining fuel would require different tracking)
  // For now, extinguishing a torch uses it up
  if (template.light_data?.fuel_max !== undefined) {
    // Consumable light - set to 0
    await itemRepo.updateInstanceFuel(item.id, 0);
  } else {
    // Permanent light - just turn off
    await itemRepo.updateInstanceFuel(item.id, 0);
  }

  const itemName = template.name;
  broadcastToRoom(currentRoomId, `${socket.username} extinguishes ${itemName}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You extinguish ${colors.item(itemName)}.` };
}

// ============================================================================
// CONDITION & REPAIR COMMANDS
// ============================================================================

// Handle "repair <item>" command
export async function handleRepair(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Repair what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, keyword);

  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (matches.length > 1 && !areAllSameTemplate(matches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(matches) };
  }

  const item = matches[0];
  const template = item.template;

  if (!template) {
    return { type: MessageType.ERROR, message: `You can't repair that.` };
  }

  // Check if item needs repair
  if (item.condition === ItemCondition.PRISTINE) {
    return { type: MessageType.ERROR, message: `It doesn't need repair.` };
  }

  // Get better condition
  const betterCondition = itemRepo.getBetterCondition(item.condition);
  if (!betterCondition) {
    return { type: MessageType.ERROR, message: `It can't be repaired further.` };
  }

  // Calculate repair cost (based on item value and condition)
  const conditionMultiplier: Record<string, number> = {
    [ItemCondition.GOOD]: 0.1,
    [ItemCondition.WORN]: 0.25,
    [ItemCondition.DAMAGED]: 0.5,
    [ItemCondition.BROKEN]: 1.0,
  };
  const repairCost = Math.ceil(template.base_value * (conditionMultiplier[item.condition] ?? 0.25));

  // For now, repair is free (would need gold system to charge)
  // TODO: Implement gold cost when economy system is added

  // Repair the item
  await itemRepo.updateInstanceCondition(item.id, betterCondition);

  const itemName = template.name;
  broadcastToRoom(currentRoomId, `${socket.username} repairs ${itemName}.`, socket.playerId);

  return { 
    type: MessageType.OUTPUT, 
    message: `You repair ${colors.item(itemName)}. It is now in ${colors.boldWhite(betterCondition)} condition.` 
  };
}

// ============================================================================
// SEARCH COMMAND (for hidden items)
// ============================================================================

// Handle "search" command
export async function handleSearch(
  socket: AuthenticatedSocket,
  currentRoomId: number
): Promise<CommandResponse> {
  // Find hidden items in the room that haven't been revealed yet
  const hiddenItems = await itemRepo.findHiddenItemsInRoom(currentRoomId);
  
  // Filter out already revealed items
  const unrevealed = hiddenItems.filter(item => !item.custom_data?.revealed);

  if (unrevealed.length === 0) {
    return { type: MessageType.OUTPUT, message: 'You search the area but find nothing hidden.' };
  }

  // Reveal a random hidden item (could add skill check here later)
  const foundItem = unrevealed[Math.floor(Math.random() * unrevealed.length)];
  await itemRepo.revealItem(foundItem.id);

  const itemName = foundItem.template?.name ?? 'something';
  broadcastToRoom(currentRoomId, `${socket.username} discovers something hidden!`, socket.playerId);

  return { 
    type: MessageType.OUTPUT, 
    message: `You search carefully and discover ${colors.item(itemName)}!` 
  };
}

// Degrade item condition (called during combat or use)
export async function degradeItemCondition(itemId: number, currentCondition: ItemCondition): Promise<ItemCondition | null> {
  const worseCondition = itemRepo.getWorseCondition(currentCondition);
  if (worseCondition) {
    await itemRepo.updateInstanceCondition(itemId, worseCondition);
    return worseCondition;
  }
  return null;
}

// ============================================================================
// CRAFTING COMMANDS
// ============================================================================

// Handle "recipes" command - list available recipes
export async function handleRecipes(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  const recipes = await craftingRepo.getAllRecipes();

  if (recipes.length === 0) {
    return { type: MessageType.OUTPUT, message: 'No crafting recipes are known.' };
  }

  const lines = [colors.boldYellow('Known Recipes:')];
  
  // Group by skill type
  const bySkill = new Map<string, CraftingRecipe[]>();
  for (const recipe of recipes) {
    const skill = recipe.skill_type ?? 'general';
    if (!bySkill.has(skill)) {
      bySkill.set(skill, []);
    }
    bySkill.get(skill)!.push(recipe);
  }

  for (const [skill, skillRecipes] of bySkill) {
    lines.push(`\r\n${colors.boldWhite(skill.charAt(0).toUpperCase() + skill.slice(1))}:`);
    for (const recipe of skillRecipes) {
      const levelReq = recipe.skill_level > 0 ? ` (Lv.${recipe.skill_level})` : '';
      lines.push(`  ${colors.item(recipe.name)}${levelReq}`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// Handle "craft <recipe>" command
export async function handleCraft(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Craft what? Use "recipes" to see available recipes.' };
  }

  const recipeName = args.join(' ');
  const recipe = await craftingRepo.getRecipeByName(recipeName);

  if (!recipe) {
    return { type: MessageType.ERROR, message: `Unknown recipe: ${recipeName}` };
  }

  // Check for required tools (must be in inventory, not consumed)
  if (recipe.tools_required && recipe.tools_required.length > 0) {
    const inventory = await itemRepo.getPlayerInventory(socket.playerId);
    for (const toolId of recipe.tools_required) {
      const hasTool = inventory.some(i => i.template_id === toolId);
      if (!hasTool) {
        const toolTemplate = await itemRepo.getTemplateById(toolId);
        const toolName = toolTemplate?.name ?? 'required tool';
        return { type: MessageType.ERROR, message: `You need ${colors.item(toolName)} to craft this.` };
      }
    }
  }

  // Check for ingredients
  const inventory = await itemRepo.getPlayerInventory(socket.playerId);
  const missingIngredients: string[] = [];

  for (const ingredient of recipe.ingredients) {
    const matching = inventory.filter(i => i.template_id === ingredient.template_id);
    const totalQty = matching.reduce((sum, i) => sum + i.quantity, 0);
    
    if (totalQty < ingredient.quantity) {
      const template = await itemRepo.getTemplateById(ingredient.template_id);
      const name = template?.name ?? 'unknown item';
      missingIngredients.push(`${ingredient.quantity}x ${name} (have ${totalQty})`);
    }
  }

  if (missingIngredients.length > 0) {
    return { 
      type: MessageType.ERROR, 
      message: `Missing ingredients:\r\n  ${missingIngredients.join('\r\n  ')}` 
    };
  }

  // Consume ingredients
  for (const ingredient of recipe.ingredients) {
    let remaining = ingredient.quantity;
    const matching = inventory.filter(i => i.template_id === ingredient.template_id);
    
    for (const item of matching) {
      if (remaining <= 0) break;
      
      if (item.quantity <= remaining) {
        remaining -= item.quantity;
        await itemRepo.deleteInstance(item.id);
      } else {
        await itemRepo.updateInstanceQuantity(item.id, item.quantity - remaining);
        remaining = 0;
      }
    }
  }

  // Create the result item
  const resultItem = await itemRepo.createInstance({
    template_id: recipe.result_template_id,
    location_type: ItemLocationType.PLAYER,
    location_id: socket.playerId,
    quantity: recipe.result_quantity,
  });

  const resultTemplate = await itemRepo.getTemplateById(recipe.result_template_id);
  const resultName = resultTemplate?.name ?? 'something';

  broadcastToRoom(currentRoomId, `${socket.username} crafts ${resultName}.`, socket.playerId);

  return { 
    type: MessageType.OUTPUT, 
    message: `You successfully craft ${colors.item(resultName)}!` 
  };
}

// ============================================================================
// ENCHANTING COMMANDS
// ============================================================================

// Handle "enchantments" command - list available enchantments
export async function handleEnchantments(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  const enchantments = await craftingRepo.getAllEnchantments();

  if (enchantments.length === 0) {
    return { type: MessageType.OUTPUT, message: 'No enchantments are known.' };
  }

  const lines = [colors.boldYellow('Known Enchantments:')];

  for (const ench of enchantments) {
    const levelReq = ench.skill_level > 0 ? ` (Lv.${ench.skill_level})` : '';
    const manaCost = ench.mana_cost > 0 ? ` [${ench.mana_cost} mana]` : '';
    lines.push(`  ${colors.magenta(ench.name)}${levelReq}${manaCost}`);
    if (ench.description) {
      lines.push(`    ${ench.description}`);
    }
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// Handle "enchant <item> with <enchantment>" command
export async function handleEnchant(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Enchant what? Usage: enchant <item> with <enchantment>' };
  }

  const input = args.join(' ');
  
  // Parse "enchant <item> with <enchantment>" format
  const withMatch = input.match(/^(.+?)\s+with\s+(.+)$/i);
  if (!withMatch) {
    return { type: MessageType.ERROR, message: 'Usage: enchant <item> with <enchantment>' };
  }

  const itemKeyword = withMatch[1].trim();
  const enchantmentName = withMatch[2].trim();

  // Find the item in inventory
  const itemMatches = await itemRepo.findItemsInInventoryByKeyword(socket.playerId, itemKeyword);

  if (itemMatches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  if (itemMatches.length > 1 && !areAllSameTemplate(itemMatches)) {
    return { type: MessageType.ERROR, message: formatDisambiguation(itemMatches) };
  }

  const item = itemMatches[0];
  const template = item.template;

  if (!template) {
    return { type: MessageType.ERROR, message: `You can't enchant that.` };
  }

  // Find the enchantment
  const enchantment = await craftingRepo.getEnchantmentByName(enchantmentName);

  if (!enchantment) {
    return { type: MessageType.ERROR, message: `Unknown enchantment: ${enchantmentName}` };
  }

  // Check if enchantment can be applied to this item type
  if (enchantment.applicable_types.length > 0 && 
      !enchantment.applicable_types.includes(template.item_type)) {
    return { type: MessageType.ERROR, message: `This enchantment cannot be applied to ${template.item_type} items.` };
  }

  // Check effect slots - safely handle potentially malformed data
  const rawEnchantments = item.custom_data?.enchantments;
  const currentEnchantments: AppliedEnchantment[] = Array.isArray(rawEnchantments) 
    ? (rawEnchantments as AppliedEnchantment[]) 
    : [];
  if (currentEnchantments.length >= template.effect_slots) {
    return { type: MessageType.ERROR, message: `This item has no more enchantment slots available.` };
  }

  // Check if already has this enchantment
  if (currentEnchantments.some(e => e.enchantment_id === enchantment.id)) {
    return { type: MessageType.ERROR, message: `This item already has that enchantment.` };
  }

  // Check mana cost
  const currentMana = socket.vitals.resource ?? 0;
  if (currentMana < enchantment.mana_cost) {
    return { type: MessageType.ERROR, message: `You need ${enchantment.mana_cost} mana to cast this enchantment.` };
  }

  // Check reagents first (before consuming anything)
  if (enchantment.reagents && enchantment.reagents.length > 0) {
    const inventory = await itemRepo.getPlayerInventory(socket.playerId);
    
    for (const reagent of enchantment.reagents) {
      const matching = inventory.filter(i => i.template_id === reagent.template_id);
      const totalQty = matching.reduce((sum, i) => sum + i.quantity, 0);
      
      if (totalQty < reagent.quantity) {
        const reagentTemplate = await itemRepo.getTemplateById(reagent.template_id);
        const name = reagentTemplate?.name ?? 'unknown reagent';
        return { type: MessageType.ERROR, message: `You need ${reagent.quantity}x ${name} for this enchantment.` };
      }
    }
  }

  // Apply enchantment first (the main operation)
  const appliedEnchantment = craftingRepo.createAppliedEnchantment(enchantment);
  const newEnchantments = [...currentEnchantments, appliedEnchantment];
  
  // Update item custom_data
  const newCustomData = {
    ...item.custom_data,
    enchantments: newEnchantments,
  };

  try {
    await itemRepo.updateInstanceCustomData(item.id, newCustomData);
  } catch (err) {
    console.error('Failed to apply enchantment:', err);
    return { type: MessageType.ERROR, message: 'Failed to apply enchantment.' };
  }

  // Only consume resources after successful enchantment
  // Consume mana
  socket.vitals.resource = currentMana - enchantment.mana_cost;

  // Consume reagents
  if (enchantment.reagents && enchantment.reagents.length > 0) {
    const inventory = await itemRepo.getPlayerInventory(socket.playerId);
    
    for (const reagent of enchantment.reagents) {
      let remaining = reagent.quantity;
      const matching = inventory.filter(i => i.template_id === reagent.template_id);
      
      for (const reagentItem of matching) {
        if (remaining <= 0) break;
        
        try {
          if (reagentItem.quantity <= remaining) {
            remaining -= reagentItem.quantity;
            await itemRepo.deleteInstance(reagentItem.id);
          } else {
            await itemRepo.updateInstanceQuantity(reagentItem.id, reagentItem.quantity - remaining);
            remaining = 0;
          }
        } catch (err) {
          console.error('Failed to consume reagent:', err);
        }
      }
    }
  }

  const itemName = template.name;
  broadcastToRoom(currentRoomId, `${socket.username} enchants ${itemName} with magical energy!`, socket.playerId);

  return { 
    type: MessageType.OUTPUT, 
    message: `You enchant ${colors.item(itemName)} with ${colors.magenta(enchantment.name)}!` 
  };
}
