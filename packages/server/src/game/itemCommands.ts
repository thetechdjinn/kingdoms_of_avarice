import { MessageType, ItemLocationType, ItemInstance, getItemDisplayName, EquipmentSlot, ItemType, TWO_HANDED_BLOCKED_SLOTS, getAlternatePairedSlot, ItemCondition, CraftingRecipe, AppliedEnchantment, Currency } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket, broadcastToRoom, sendMessage } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { wordWrap } from '../utils/textFormat.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as craftingRepo from '../db/repositories/craftingRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import { withTransaction } from '../db/index.js';
import { calculateEncumbranceRatio } from './combatStats.js';
import { isHidden, breakStealth } from './stealth/stealthState.js';
import { rollStealthCheck } from './stealth/stealthCheck.js';
import { calculateStealth, calculatePerception } from './stats/secondaryStats.js';

// Guard function to check if character is selected
function requireCharacter(socket: AuthenticatedSocket): CommandResponse | null {
  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }
  return null;
}

// Get the display name for an item (uses name, falls back to short_desc for legacy)
// Returns name as stored in database (should be lowercase)
function getItemName(item: ItemInstance): string {
  return item.template?.name ?? item.template?.short_desc ?? 'something';
}

// Add article (a/an) to item name
function withArticle(name: string): string {
  if (!name || name.length === 0) {
    return 'something';
  }
  const lower = name.toLowerCase();
  // Check if already has an article
  if (lower.startsWith('a ') || lower.startsWith('an ') || lower.startsWith('the ') || lower.startsWith('some ')) {
    return name;
  }
  // Use "an" for vowel sounds
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const firstChar = lower[0];
  const article = firstChar && vowels.includes(firstChar) ? 'an' : 'a';
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
  const charError = requireCharacter(socket);
  if (charError) return charError;

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

  const item = matches[0];

  // Check if this is a currency item - if so, add to wallet directly
  // We have the item already, so use direct currency pickup instead of re-searching
  if (item.template?.item_type === ItemType.CURRENCY) {
    const currencyType = detectCurrencyType(item.template?.name);
    if (currencyType) {
      const currencyInfo = CURRENCY_TYPES[currencyType];
      // Calculate how much to pick up
      // Use the explicit quantity if user specified one, otherwise pick up just 1
      // (consistent with how stacked items work - "get coins" = 1, "get 50 coins" = 50)
      const totalAvailable = matches.reduce((sum, m) => sum + m.quantity, 0);
      const pickupAmount = Math.min(quantity, totalAvailable);

      if (pickupAmount <= 0) {
        return { type: MessageType.ERROR, message: `There aren't that many ${currencyType} coins here.` };
      }

      // Pick up currency using transaction
      await withTransaction(async (client) => {
        // Add currency to character
        await client.query(
          `UPDATE characters SET ${currencyInfo.field} = ${currencyInfo.field} + $1 WHERE id = $2`,
          [pickupAmount, socket.characterId]
        );

        // Remove currency items from room
        let remaining = pickupAmount;
        for (const currencyItem of matches) {
          if (remaining <= 0) break;

          if (currencyItem.quantity <= remaining) {
            remaining -= currencyItem.quantity;
            await client.query('DELETE FROM item_instances WHERE id = $1', [currencyItem.id]);
          } else {
            await client.query(
              'UPDATE item_instances SET quantity = quantity - $1 WHERE id = $2',
              [remaining, currencyItem.id]
            );
            remaining = 0;
          }
        }
      });

      const coinWord = pickupAmount === 1 ? 'coin' : 'coins';
      const displayAmount = `${pickupAmount} ${currencyType} ${coinWord}`;
      broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} picks up ${displayAmount}.`), socket.playerId);
      return { type: MessageType.OUTPUT, message: `You pick up ${colors.gold(displayAmount)}.` };
    }
  }

  // If quantity > 1 requested, we may need to pick up from multiple instances
  if (quantity > 1) {
    return pickUpMultipleItems(socket, matches, currentRoomId, quantity);
  }

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

  // Check if we can stack with existing item in inventory (same condition only)
  const existingStack = await itemRepo.findStackableInstance(
    item.template_id,
    ItemLocationType.PLAYER,
    socket.characterId!,
    item.condition
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
      socket.characterId!
    );
  }

  const itemName = getItemName(item);
  
  // Broadcast to room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} picks up ${withArticle(itemName)}.`), socket.playerId);

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
        socket.characterId!,
        item.condition
      );

      if (existingStack) {
        await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
        await itemRepo.deleteInstance(item.id);
      } else {
        await itemRepo.updateInstanceLocation(
          item.id,
          ItemLocationType.PLAYER,
          socket.characterId!
        );
      }
    } else {
      // Taking partial from this instance
      await itemRepo.updateInstanceQuantity(item.id, item.quantity - takeFromThis);

      const existingStack = await itemRepo.findStackableInstance(
        item.template_id,
        ItemLocationType.PLAYER,
        socket.characterId!,
        item.condition
      );
      
      if (existingStack) {
        await itemRepo.addToInstanceQuantity(existingStack.id, takeFromThis);
      } else {
        await itemRepo.createInstance({
          template_id: item.template_id,
          location_type: ItemLocationType.PLAYER,
          location_id: socket.characterId!,
          quantity: takeFromThis,
          condition: item.condition,
        });
      }
    }
    
    remaining -= takeFromThis;
  }

  const displayName = actualQuantity > 1 ? `${actualQuantity} ${itemName}` : withArticle(itemName);

  // Broadcast to room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} picks up ${displayName}.`), socket.playerId);

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
      socket.characterId!,
      item.condition
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
        socket.characterId!
      );
    }
  } else {
    // Picking up partial - reduce room stack
    await itemRepo.updateInstanceQuantity(item.id, item.quantity - actualQuantity);

    // Check if we can stack with existing item in inventory
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.PLAYER,
      socket.characterId!,
      item.condition
    );
    
    if (existingStack) {
      // Add to existing stack
      await itemRepo.addToInstanceQuantity(existingStack.id, actualQuantity);
    } else {
      // Create new instance in player inventory
      await itemRepo.createInstance({
        template_id: item.template_id,
        location_type: ItemLocationType.PLAYER,
        location_id: socket.characterId!,
        quantity: actualQuantity,
        condition: item.condition,
      });
    }
  }

  const displayName = actualQuantity > 1 ? `${actualQuantity} ${itemName}` : withArticle(itemName);

  // Broadcast to room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} picks up ${displayName}.`), socket.playerId);

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
  const currencyPickedUp: string[] = [];

  for (const item of takeableItems) {
    // Check if this is a currency item - add to wallet instead of inventory
    const currencyDisplay = await handleCurrencyPickup(item, socket.characterId!);
    if (currencyDisplay) {
      currencyPickedUp.push(currencyDisplay);
      continue;
    }

    // Regular item - add to inventory
    // Check if we can stack with existing item in inventory
    const existingStack = await itemRepo.findStackableInstance(
      item.template_id,
      ItemLocationType.PLAYER,
      socket.characterId!,
      item.condition
    );

    if (existingStack) {
      await itemRepo.addToInstanceQuantity(existingStack.id, item.quantity);
      await itemRepo.deleteInstance(item.id);
    } else {
      await itemRepo.updateInstanceLocation(
        item.id,
        ItemLocationType.PLAYER,
        socket.characterId!
      );
    }
    pickedUp.push(getItemName(item));
  }

  // Build pickup message
  const parts: string[] = [];
  if (pickedUp.length > 0) {
    parts.push(pickedUp.map(n => colors.item(n)).join(', '));
  }
  if (currencyPickedUp.length > 0) {
    parts.push(currencyPickedUp.map(n => colors.gold(n)).join(', '));
  }

  // Broadcast to room
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} picks up some items.`), socket.playerId);

  return {
    type: MessageType.OUTPUT,
    message: `You pick up: ${parts.join(', ')}.`,
  };
}

// Handle "drop <item>" or "drop <quantity> <item>" command
export async function handleDrop(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

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
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

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
        currentRoomId,
        item.condition
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
        currentRoomId,
        item.condition
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
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} drops ${displayName}.`), socket.playerId);

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

  // Check if we can stack with existing item in room (same condition only)
  const existingStack = await itemRepo.findStackableInstance(
    item.template_id,
    ItemLocationType.ROOM,
    currentRoomId,
    item.condition
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
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} drops ${withArticle(itemName)}.`), socket.playerId);

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
      currentRoomId,
      item.condition
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
      currentRoomId,
      item.condition
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
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} drops ${displayName}.`), socket.playerId);

  return { type: MessageType.OUTPUT, message: `You drop ${colors.item(displayName)}.` };
}

// Handle "drop all" command
async function handleDropAll(
  socket: AuthenticatedSocket,
  currentRoomId: number
): Promise<CommandResponse> {
  const items = await itemRepo.getCharacterInventory(socket.characterId!);

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
      currentRoomId,
      item.condition
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
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} drops some items.`), socket.playerId);

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

// Calculate total weight of items
function calculateTotalWeight(items: ItemInstance[]): number {
  let totalWeight = 0;
  for (const item of items) {
    const itemWeight = item.template?.weight || 0;
    const quantity = item.quantity || 1;
    totalWeight += itemWeight * quantity;
  }
  return totalWeight;
}

// Get encumbrance level label based on percentage
function getEncumbranceLevel(percent: number): string {
  if (percent < 20) return 'None';
  if (percent < 35) return 'Light';
  if (percent < 65) return 'Medium';
  return 'Heavy';
}

/**
 * Calculate total wealth in copper farthings.
 * Conversion rates: 10 copper = 1 silver, 10 silver = 1 gold,
 * 10 gold = 1 platinum, 100 platinum = 1 runic.
 *
 * @param currency - The currency amounts to convert
 * @returns Total wealth expressed in copper farthings
 */
function calculateTotalWealth(currency: Currency): number {
  return currency.copper +
    (currency.silver * 10) +
    (currency.gold * 100) +
    (currency.platinum * 1000) +
    (currency.runic * 100000);
}

/**
 * Format currency display for the inventory command.
 * Shows all currency types and total wealth in copper farthings.
 *
 * @param currency - The currency amounts to display
 * @returns Array of formatted display lines
 */
async function formatCurrencyDisplay(currency: Currency): Promise<string[]> {
  const runicName = await settingsRepo.getRunicName();

  const lines: string[] = [];

  // "You have:" line with all currency types (using colors.gold() for currency values)
  const currencyParts: string[] = [];
  currencyParts.push(`${colors.gold(String(currency.runic))} ${runicName}`);
  currencyParts.push(`${colors.gold(String(currency.platinum))} platinum`);
  currencyParts.push(`${colors.gold(String(currency.gold))} gold`);
  currencyParts.push(`${colors.gold(String(currency.silver))} silver`);
  currencyParts.push(`and ${colors.gold(String(currency.copper))} copper`);

  lines.push(`${colors.green('You have:')} ${currencyParts.join(', ')}.`);

  // Wealth line
  const totalWealth = calculateTotalWealth(currency);
  lines.push(`${colors.green('Wealth:')} ${colors.gold(String(totalWealth))} copper farthings.`);

  return lines;
}

// Handle "inventory" / "i" command
export async function handleInventory(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  const items = await itemRepo.getCharacterInventory(socket.characterId!);
  const equipped = await itemRepo.getCharacterEquipped(socket.characterId!);

  // Fetch character data for currency
  const character = await characterRepo.findCharacterById(socket.characterId!);
  const currency: Currency = character ? {
    copper: character.copper ?? 0,
    silver: character.silver ?? 0,
    gold: character.gold ?? 0,
    platinum: character.platinum ?? 0,
    runic: character.runic ?? 0,
  } : { copper: 0, silver: 0, gold: 0, platinum: 0, runic: 0 };

  const lines: string[] = [];

  if (items.length === 0 && equipped.length === 0) {
    lines.push('You are carrying:');
    lines.push('  nothing');
  } else {
    lines.push('You are carrying:');

    // Build paragraph-form item list
    const itemParts: string[] = [];

    // Show equipped items first with slot indicator
    for (const item of equipped) {
      const name = getItemName(item);
      const slot = item.equipped_slot ? INVENTORY_SLOT_NAMES[item.equipped_slot] || item.equipped_slot : 'worn';
      itemParts.push(`${colors.item(name)} (${slot})`);
    }

    // Show inventory items (non-equipped)
    for (const item of items) {
      const display = itemRepo.instanceToDisplay(item);
      const name = getItemDisplayName(display);
      itemParts.push(colors.item(name));
    }

    // Join items with commas and word-wrap at 80 chars
    if (itemParts.length > 0) {
      const itemLine = '  ' + itemParts.join(', ');
      lines.push(wordWrap(itemLine, 78)); // 78 to account for 2-char indent
    }
  }

  // Add blank line before currency
  lines.push('');

  // Add currency display
  const currencyLines = await formatCurrencyDisplay(currency);
  lines.push(...currencyLines);

  // Calculate encumbrance (including currency weight)
  const allItems = [...items, ...equipped];
  const itemWeight = calculateTotalWeight(allItems);

  // Get currency encumbrance settings from database
  const encSettings = await settingsRepo.getCurrencyEncumbranceSettings();
  const currencyWeight =
    Math.floor(currency.copper / encSettings.copperPerEnc) +
    Math.floor(currency.silver / encSettings.silverPerEnc) +
    Math.floor(currency.gold / encSettings.goldPerEnc) +
    Math.floor(currency.platinum / encSettings.platinumPerEnc) +
    Math.floor(currency.runic / encSettings.runicPerEnc);

  const totalWeight = itemWeight + currencyWeight;
  const strength = socket.characterStats?.strength || 10;
  const maxCapacity = strength * 48;
  const encumbranceRatio = calculateEncumbranceRatio(totalWeight, strength);
  const encumbrancePercent = Math.round(encumbranceRatio * 100);
  const encumbranceLevel = getEncumbranceLevel(encumbrancePercent);

  // Add encumbrance line
  lines.push('');
  lines.push(colors.yellow(`Encumbrance: ${totalWeight}/${maxCapacity} ${encumbranceLevel} (${encumbrancePercent}%)`));

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// Handle "examine <item>" / "look <item>" command
export async function handleExamine(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Examine what?' };
  }

  const keyword = args.join(' ');

  // First check inventory (includes equipped items)
  let matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

  // Also check equipped items
  if (matches.length === 0) {
    const equipped = await itemRepo.getCharacterEquipped(socket.characterId!);
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
    lines.push(`Damage: ${colors.boldWhite(`${wd.min_damage}-${wd.max_damage}`)} (${wd.damage_type})`);
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

/**
 * Simple pluralization for item names.
 * Handles common cases: coin->coins, ruby->rubies, torch->torches
 */
function pluralizeName(name: string): string {
  const lower = name.toLowerCase();
  // Already plural (ends in 's' but not 'ss')
  if (lower.endsWith('s') && !lower.endsWith('ss')) {
    return name;
  }
  // Words ending in consonant + y -> ies (ruby -> rubies)
  if (lower.match(/[bcdfghjklmnpqrstvwxz]y$/)) {
    return name.slice(0, -1) + 'ies';
  }
  // Words ending in s, sh, ch, x, z -> es
  if (lower.match(/(s|sh|ch|x|z)$/)) {
    return name + 'es';
  }
  // Default: add s
  return name + 's';
}

// Get items to display in room description
export async function getRoomItemsDescription(roomId: number): Promise<string | null> {
  const displays = await itemRepo.getRoomItemDisplays(roomId);

  if (displays.length === 0) {
    return null;
  }

  const itemNames = displays.map(d => {
    const name = d.name || d.short_desc;
    // Format: "sparkling ruby" or "2 sparkling rubies"
    if (d.quantity > 1) {
      return `${d.quantity} ${pluralizeName(name)}`;
    }
    return name;
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
  [EquipmentSlot.HELD]: 'Readied',
};

// Handle "wield <item>" command - for weapons
export async function handleWield(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Wield what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

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
  const equipped = await itemRepo.getCharacterEquipped(socket.characterId!);

  // Check for two-handed weapon conflicts
  if (isTwoHanded) {
    // Unequip anything in off_hand, shield, or held slots (unless cursed)
    for (const equippedItem of equipped) {
      if (equippedItem.equipped_slot && TWO_HANDED_BLOCKED_SLOTS.includes(equippedItem.equipped_slot as EquipmentSlot)) {
        if (equippedItem.template?.flags?.cursed) {
          return { type: MessageType.ERROR, message: `You can't wield that - a cursed item is blocking the slot.` };
        }
        await itemRepo.updateInstanceLocation(equippedItem.id, ItemLocationType.PLAYER, socket.characterId!);
        const unequippedName = getItemName(equippedItem);
        broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} stops using ${unequippedName}.`), socket.playerId);
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
    await itemRepo.updateInstanceLocation(mainHandItem.id, ItemLocationType.PLAYER, socket.characterId!);
    const unequippedName = getItemName(mainHandItem);
    broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} stops wielding ${unequippedName}.`), socket.playerId);
  }

  // Equip the new weapon
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.EQUIPPED, socket.characterId!, EquipmentSlot.MAIN_HAND);

  const itemName = template.name;
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} wields ${itemName}.`), socket.playerId);

  return { type: MessageType.OUTPUT, message: `You wield ${colors.item(itemName)}.` };
}

// Handle "wear <item>" command - for armor/accessories
export async function handleWear(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Wear what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

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
  const equipped = await itemRepo.getCharacterEquipped(socket.characterId!);

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
        await itemRepo.updateInstanceLocation(currentlyInSlot.id, ItemLocationType.PLAYER, socket.characterId!);
        const unequippedName = getItemName(currentlyInSlot);
        broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} removes ${unequippedName}.`), socket.playerId);
      }
    } else {
      // Not a paired slot - check if current item is cursed
      if (currentlyInSlot.template?.flags?.cursed) {
        return { type: MessageType.ERROR, message: `You can't remove that - it's cursed!` };
      }
      // Unequip current item
      await itemRepo.updateInstanceLocation(currentlyInSlot.id, ItemLocationType.PLAYER, socket.characterId!);
      const unequippedName = getItemName(currentlyInSlot);
      broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} removes ${unequippedName}.`), socket.playerId);
    }
  }

  // Equip the item
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.EQUIPPED, socket.characterId!, targetSlot);

  const itemName = template.name;
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} wears ${itemName}.`), socket.playerId);

  return { type: MessageType.OUTPUT, message: `You wear ${colors.item(itemName)}.` };
}

// Handle "remove <item>" command
export async function handleRemove(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Remove what?' };
  }

  const keyword = args.join(' ');

  // Search equipped items
  const equipped = await itemRepo.getCharacterEquipped(socket.characterId!);
  
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
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.PLAYER, socket.characterId!);

  const itemName = getItemName(item);
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} removes ${itemName}.`), socket.playerId);

  return { type: MessageType.OUTPUT, message: `You remove ${colors.item(itemName)}.` };
}

// Handle "equipment" / "eq" command
export async function handleEquipment(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  const equipped = await itemRepo.getCharacterEquipped(socket.characterId!);

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
  let matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);
  
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
  const charError = requireCharacter(socket);
  if (charError) return charError;

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
  const itemMatches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, itemKeyword);

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
  if (containerTemplate?.container_capacity != null && containerTemplate.container_capacity > 0) {
    const currentCount = await itemRepo.getContainerItemCount(container.id);
    if (currentCount + item.quantity > containerTemplate.container_capacity) {
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
  const charError = requireCharacter(socket);
  if (charError) return charError;

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
  const containerName = container.template?.name ?? 'something';

  // Check if this is a currency item - add to wallet instead of inventory
  const currencyDisplay = await handleCurrencyPickup(item, socket.characterId!);
  if (currencyDisplay) {
    broadcastToRoom(currentRoomId, `${socket.username} gets ${currencyDisplay} from ${withArticle(containerName)}.`, socket.playerId);
    return { type: MessageType.OUTPUT, message: `You get ${colors.gold(currencyDisplay)} from ${colors.item(withArticle(containerName))}.` };
  }

  // Move item to player inventory
  await itemRepo.updateInstanceLocation(item.id, ItemLocationType.PLAYER, socket.characterId!);

  const itemName = getItemName(item);

  broadcastToRoom(currentRoomId, `${socket.username} gets ${withArticle(itemName)} from ${withArticle(containerName)}.`, socket.playerId);

  return { type: MessageType.OUTPUT, message: `You get ${colors.item(withArticle(itemName))} from ${colors.item(withArticle(containerName))}.` };
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
  const currencyPickedUp: string[] = [];

  for (const item of items) {
    // Check if this is a currency item - add to wallet instead of inventory
    const currencyDisplay = await handleCurrencyPickup(item, socket.characterId!);
    if (currencyDisplay) {
      currencyPickedUp.push(currencyDisplay);
      continue;
    }

    await itemRepo.updateInstanceLocation(item.id, ItemLocationType.PLAYER, socket.characterId!);
    pickedUp.push(withArticle(getItemName(item)));
  }

  // Build pickup message
  const parts: string[] = [];
  if (pickedUp.length > 0) {
    parts.push(pickedUp.map(n => colors.item(n)).join(', '));
  }
  if (currencyPickedUp.length > 0) {
    parts.push(currencyPickedUp.map(n => colors.gold(n)).join(', '));
  }

  const containerName = container.template?.name ?? 'something';
  broadcastToRoom(currentRoomId, `${socket.username} empties ${withArticle(containerName)}.`, socket.playerId);

  return {
    type: MessageType.OUTPUT,
    message: `You get from ${colors.item(withArticle(containerName))}: ${parts.join(', ')}.`,
  };
}

// Handle "look in <container>" command
export async function handleLookIn(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

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
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Use what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

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
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Light what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

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
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Extinguish what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

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
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Repair what?' };
  }

  const keyword = args.join(' ');
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, keyword);

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
// SEARCH COMMAND (for hidden items and players)
// ============================================================================

// Handle "search" command
export async function handleSearch(
  socket: AuthenticatedSocket,
  currentRoomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  const results: string[] = [];
  results.push('You search the area...');

  // Get searcher's character for perception calculation
  const searcherCharacter = await characterRepo.findCharacterById(socket.characterId!);
  if (!searcherCharacter) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Calculate searcher's perception
  const perceptionBreakdown = calculatePerception(
    searcherCharacter.intelligence,
    searcherCharacter.wisdom,
    searcherCharacter.charisma
    // TODO: Add equipment perception modifier when implemented
  );
  const searcherPerception = perceptionBreakdown.total;

  // Search for hidden players in the room
  const hiddenPlayersFound: string[] = [];
  for (const [playerId, playerSocket] of connectedPlayers) {
    // Skip self
    if (playerId === socket.playerId) continue;

    // Skip players not in this room
    if (getPlayerLocation(playerId) !== currentRoomId) continue;

    // Only check hidden players (sneaking players are visible)
    if (!isHidden(playerSocket)) continue;

    // Get hidden player's character for stealth calculation
    const hiddenCharacter = await characterRepo.findCharacterById(playerSocket.characterId!);
    if (!hiddenCharacter) continue;

    // Calculate hidden player's stealth
    const stealthBreakdown = await calculateStealth({
      dexterity: hiddenCharacter.dexterity,
      intelligence: hiddenCharacter.intelligence,
      wisdom: hiddenCharacter.wisdom,
      charisma: hiddenCharacter.charisma,
      level: hiddenCharacter.level,
      race: hiddenCharacter.race,
      class: hiddenCharacter.class,
    });
    const hiddenStealth = stealthBreakdown.total;

    // Roll perception vs stealth
    const checkResult = rollStealthCheck(hiddenStealth, searcherPerception);

    if (checkResult.detected) {
      // Found! Break their stealth (don't notify room yet - we'll do custom message)
      hiddenPlayersFound.push(playerSocket.username);

      // Break the hidden player's stealth without room broadcast
      // (we send a more specific message below)
      breakStealth(playerSocket, 'searched', false);

      // Tell the hidden player who found them specifically
      sendMessage(
        playerSocket,
        MessageType.OUTPUT,
        colors.red(`${socket.username} found you!`)
      );
    }
  }

  // Add found players to results
  if (hiddenPlayersFound.length > 0) {
    for (const name of hiddenPlayersFound) {
      results.push(`You spot ${colors.player(name)} hiding in the shadows!`);
      broadcastToRoom(
        currentRoomId,
        `${socket.username} discovers ${colors.player(name)} hiding in the shadows!`,
        socket.playerId
      );
    }
  }

  // Search for hidden items in the room
  const hiddenItems = await itemRepo.findHiddenItemsInRoom(currentRoomId);

  // Filter out already revealed items
  const unrevealed = hiddenItems.filter(item => !item.custom_data?.revealed);

  if (unrevealed.length > 0) {
    // Reveal a random hidden item (could add perception check here later)
    const foundItem = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    await itemRepo.revealItem(foundItem.id);

    const itemName = foundItem.template?.name ?? 'something';
    results.push(`You discover ${colors.item(itemName)}!`);
    broadcastToRoom(currentRoomId, `${socket.username} discovers something hidden!`, socket.playerId);
  }

  // If nothing found at all
  if (hiddenPlayersFound.length === 0 && unrevealed.length === 0) {
    return { type: MessageType.OUTPUT, message: 'You search the area but find nothing hidden.' };
  }

  return {
    type: MessageType.OUTPUT,
    message: results.join('\r\n')
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
  const charError = requireCharacter(socket);
  if (charError) return charError;

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
    const inventory = await itemRepo.getCharacterInventory(socket.characterId!);
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
  const inventory = await itemRepo.getCharacterInventory(socket.characterId!);
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

  // Consume ingredients and create result atomically
  let resultName = 'something';
  await withTransaction(async () => {
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
    await itemRepo.createInstance({
      template_id: recipe.result_template_id,
      location_type: ItemLocationType.PLAYER,
      location_id: socket.characterId!,
      quantity: recipe.result_quantity,
    });

    const resultTemplate = await itemRepo.getTemplateById(recipe.result_template_id);
    resultName = resultTemplate?.name ?? 'something';
  });

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
  const charError = requireCharacter(socket);
  if (charError) return charError;

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
  const itemMatches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, itemKeyword);

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
    const inventory = await itemRepo.getCharacterInventory(socket.characterId!);
    
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
    const inventory = await itemRepo.getCharacterInventory(socket.characterId!);
    
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

// ============================================================================
// CURRENCY COMMANDS
// ============================================================================

/**
 * Mapping of currency type names to their item template names and character fields.
 * Used to look up the correct database template and character column for each currency type.
 */
const CURRENCY_TYPES: Record<string, { templateName: string; field: keyof Currency }> = {
  'copper': { templateName: 'copper coins', field: 'copper' },
  'silver': { templateName: 'silver coins', field: 'silver' },
  'gold': { templateName: 'gold coins', field: 'gold' },
  'platinum': { templateName: 'platinum coins', field: 'platinum' },
  'runic': { templateName: 'runic coins', field: 'runic' },
};

/**
 * Detect currency type from an item's template name.
 * Uses exact template name matching against CURRENCY_TYPES for reliability.
 * @returns The currency type key (e.g., 'gold') or null if not a currency
 */
function detectCurrencyType(templateName: string | undefined | null): string | null {
  if (!templateName) return null;
  const lowerName = templateName.toLowerCase();
  for (const [type, info] of Object.entries(CURRENCY_TYPES)) {
    if (lowerName === info.templateName) {
      return type;
    }
  }
  return null;
}

/**
 * Handle picking up a currency item - adds to wallet and deletes instance.
 * @returns Display name for the currency picked up, or null if not a currency item
 */
async function handleCurrencyPickup(
  item: ItemInstance,
  characterId: number
): Promise<string | null> {
  if (item.template?.item_type !== ItemType.CURRENCY) return null;

  const currencyType = detectCurrencyType(item.template?.name);
  if (!currencyType) return null;

  const currencyInfo = CURRENCY_TYPES[currencyType];
  return await withTransaction(async () => {
    await characterRepo.addCurrency(characterId, currencyInfo.field, item.quantity);
    await itemRepo.deleteInstance(item.id);
    return item.quantity === 1 ? `1 ${currencyType} coin` : `${item.quantity} ${currencyType} coins`;
  });
}

/**
 * Parse currency type from user input.
 * Handles full names ("gold"), abbreviations ("g"), and partial matches ("gol").
 *
 * @param input - The user's input string
 * @returns The normalized currency type name, or null if not recognized
 */
function parseCurrencyType(input: string): string | null {
  const lower = input.toLowerCase();
  // Exact matches
  if (CURRENCY_TYPES[lower]) return lower;
  // Single-letter abbreviations
  const abbrevMap: Record<string, string> = {
    'c': 'copper',
    's': 'silver',
    'g': 'gold',
    'p': 'platinum',
    'r': 'runic',
  };
  if (abbrevMap[lower]) return abbrevMap[lower];
  // Partial matches
  for (const type of Object.keys(CURRENCY_TYPES)) {
    if (type.startsWith(lower)) return type;
  }
  return null;
}

/**
 * Handle "drop <amount> <currency_type>" command
 * Drops currency from character inventory to the room as a stackable item.
 * Uses a transaction to ensure atomicity - either both the character update
 * and item creation succeed, or neither does.
 */
export async function handleDropCurrency(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse | null> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length < 2) {
    return null; // Not a currency drop, let normal drop handle it
  }

  // Check if first arg is a number and second is a currency type
  const amount = parseInt(args[0]);
  if (isNaN(amount)) {
    return null; // Not a currency drop
  }
  if (amount <= 0) {
    return { type: MessageType.ERROR, message: 'You must drop a positive amount.' };
  }

  const currencyType = parseCurrencyType(args[1]);
  if (!currencyType) {
    return null; // Not a valid currency type, let normal drop handle it
  }

  // Get character's current currency
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  const currencyInfo = CURRENCY_TYPES[currencyType];
  const currentAmount = character[currencyInfo.field] ?? 0;

  if (currentAmount < amount) {
    return { type: MessageType.ERROR, message: `You don't have that much ${currencyType}.` };
  }

  // Find the currency template
  const template = await itemRepo.getTemplateByName(currencyInfo.templateName);
  if (!template) {
    return { type: MessageType.ERROR, message: 'Currency system is not configured. Please contact an administrator.' };
  }

  // Use transaction to ensure atomicity
  try {
    await withTransaction(async (client) => {
      // Deduct currency from character
      await client.query(
        `UPDATE characters SET ${currencyInfo.field} = ${currencyInfo.field} - $1 WHERE id = $2`,
        [amount, socket.characterId]
      );

      // Check if there's already currency of this type in the room
      const existingResult = await client.query(
        `SELECT id, quantity FROM item_instances
         WHERE template_id = $1 AND location_type = $2 AND location_id = $3 AND condition = $4
         LIMIT 1`,
        [template.id, ItemLocationType.ROOM, currentRoomId, ItemCondition.PRISTINE]
      );

      if (existingResult.rows.length > 0) {
        // Add to existing stack
        await client.query(
          'UPDATE item_instances SET quantity = quantity + $1 WHERE id = $2',
          [amount, existingResult.rows[0].id]
        );
      } else {
        // Create new instance in room
        await client.query(
          `INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
           VALUES ($1, $2, $3, $4, $5)`,
          [template.id, ItemLocationType.ROOM, currentRoomId, amount, ItemCondition.PRISTINE]
        );
      }
    });
  } catch (error) {
    console.error('Failed to drop currency:', error);
    return { type: MessageType.ERROR, message: 'Failed to drop currency. Please try again.' };
  }

  const displayName = amount === 1 ? `1 ${currencyType} coin` : `${amount} ${currencyType} coins`;
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} drops ${displayName}.`), socket.playerId);

  return { type: MessageType.OUTPUT, message: `You drop ${colors.gold(displayName)}.` };
}

/**
 * Handle picking up currency items - "get <currency_type>" or "get <amount> <currency_type>"
 * Picks up currency from the room and adds it to the character's wallet.
 * Uses a transaction to ensure atomicity - either both the item removal
 * and character update succeed, or neither does.
 */
export async function handleGetCurrency(
  socket: AuthenticatedSocket,
  args: string[],
  currentRoomId: number
): Promise<CommandResponse | null> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return null;
  }

  // Check if first arg is a currency type (e.g., "get gold" or "g g")
  // OR if first arg is a number and second is currency type (e.g., "get 50 gold")
  let amount: number | null = null;
  let currencyType: string | null = null;

  const firstArgNum = parseInt(args[0]);
  if (!isNaN(firstArgNum) && args.length > 1) {
    // "get 50 gold" format
    if (firstArgNum <= 0) {
      return { type: MessageType.ERROR, message: 'You must pick up a positive amount.' };
    }
    amount = firstArgNum;
    currencyType = parseCurrencyType(args[1]);
  } else {
    // "get gold" format - get all
    currencyType = parseCurrencyType(args[0]);
    amount = null; // null means get all
  }

  if (!currencyType) {
    return null; // Not a currency get, let normal get handle it
  }

  const currencyInfo = CURRENCY_TYPES[currencyType];

  // Find currency items of this type in the room
  // Search by item_type=CURRENCY and detect currency type from template name
  // This handles both "gold coins" (currency template) and "Gold Coin" (misc template that should be currency)
  const roomItems = await itemRepo.getInstancesInRoom(currentRoomId);
  const currencyItems = roomItems.filter(i => {
    // Check if item is explicitly a currency type
    if (i.template?.item_type === ItemType.CURRENCY) {
      return detectCurrencyType(i.template?.name) === currencyType;
    }
    // Also check for items that match currency keywords (handles legacy "Gold Coin" misc items)
    const templateName = i.template?.name?.toLowerCase() ?? '';
    const keywords = i.template?.keywords?.map(k => k.toLowerCase()) ?? [];
    return templateName.includes(currencyType) || keywords.includes(currencyType);
  });

  if (currencyItems.length === 0) {
    return { type: MessageType.ERROR, message: `You don't see any ${currencyType} coins here.` };
  }

  // Calculate total available
  const totalAvailable = currencyItems.reduce((sum, item) => sum + item.quantity, 0);

  // Determine how much to pick up
  const pickupAmount = amount === null ? totalAvailable : Math.min(amount, totalAvailable);

  if (pickupAmount <= 0) {
    return { type: MessageType.ERROR, message: `There aren't that many ${currencyType} coins here.` };
  }

  // Use transaction to ensure atomicity
  try {
    await withTransaction(async (client) => {
      // Add currency to character
      await client.query(
        `UPDATE characters SET ${currencyInfo.field} = ${currencyInfo.field} + $1 WHERE id = $2`,
        [pickupAmount, socket.characterId]
      );

      // Remove currency items from room
      let remaining = pickupAmount;
      for (const item of currencyItems) {
        if (remaining <= 0) break;

        if (item.quantity <= remaining) {
          remaining -= item.quantity;
          await client.query('DELETE FROM item_instances WHERE id = $1', [item.id]);
        } else {
          await client.query(
            'UPDATE item_instances SET quantity = quantity - $1 WHERE id = $2',
            [remaining, item.id]
          );
          remaining = 0;
        }
      }
    });
  } catch (error) {
    console.error('Failed to pick up currency:', error);
    return { type: MessageType.ERROR, message: 'Failed to pick up currency. Please try again.' };
  }

  const displayName = pickupAmount === 1 ? `1 ${currencyType} coin` : `${pickupAmount} ${currencyType} coins`;
  broadcastToRoom(currentRoomId, colors.green(`${colors.red(socket.username)} picks up ${displayName}.`), socket.playerId);

  return { type: MessageType.OUTPUT, message: `You pick up ${colors.gold(displayName)}.` };
}

/**
 * Check if an item instance is a currency item (coins).
 * Used to determine if special currency handling should be applied.
 *
 * @param item - The item instance to check
 * @returns True if the item is a currency type, false otherwise
 */
export function isCurrencyItem(item: ItemInstance): boolean {
  return item.template?.item_type === ItemType.CURRENCY;
}

/**
 * Drop all items and currency when a player dies.
 * Items with no_drop flag are kept in inventory.
 * Currency is converted to ground item stacks.
 *
 * @param characterId - The character ID of the dead player
 * @param roomId - The room where items should be dropped
 */
export async function dropAllItemsOnDeath(characterId: number, roomId: number): Promise<void> {
  // Get all inventory items (including equipped)
  const inventoryItems = await itemRepo.getCharacterInventory(characterId);
  const equippedItems = await itemRepo.getPlayerEquipped(characterId);

  // Combine all items
  const allItems = [...inventoryItems, ...equippedItems];

  for (const item of allItems) {
    // Skip items with no_drop flag
    if (item.template?.flags?.no_drop) {
      continue;
    }

    // Move item to room (unequip if equipped)
    await itemRepo.updateInstanceLocation(item.id, ItemLocationType.ROOM, roomId);
  }

  // Get character currency and drop it
  const character = await characterRepo.findCharacterById(characterId);
  if (character) {
    const currencyTypes: Array<{ type: string; amount: number }> = [
      { type: 'copper', amount: character.copper ?? 0 },
      { type: 'silver', amount: character.silver ?? 0 },
      { type: 'gold', amount: character.gold ?? 0 },
      { type: 'platinum', amount: character.platinum ?? 0 },
      { type: 'runic', amount: character.runic ?? 0 },
    ];

    for (const currency of currencyTypes) {
      if (currency.amount > 0) {
        // Find existing currency stack in room or create new
        const existingStack = await findCurrencyInRoom(roomId, currency.type);
        if (existingStack) {
          await itemRepo.addToInstanceQuantity(existingStack.id, currency.amount);
        } else {
          // Create currency item in room - need to find the template for this currency type
          const template = await itemRepo.getTemplateByName(`${currency.type} coins`);
          if (template) {
            await itemRepo.createInstance({
              template_id: template.id,
              location_type: ItemLocationType.ROOM,
              location_id: roomId,
              quantity: currency.amount,
            });
          }
        }
      }
    }

    // Clear character's currency
    await characterRepo.updateCharacterStats(characterId, {
      copper: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
      runic: 0,
    });
  }
}

/**
 * Find a currency item stack in a room
 */
async function findCurrencyInRoom(roomId: number, currencyType: string): Promise<ItemInstance | null> {
  const roomItems = await itemRepo.getInstancesInRoom(roomId);
  for (const item of roomItems) {
    if (item.template?.item_type === ItemType.CURRENCY) {
      const itemName = item.template?.name?.toLowerCase() ?? '';
      if (itemName.includes(currencyType)) {
        return item;
      }
    }
  }
  return null;
}
