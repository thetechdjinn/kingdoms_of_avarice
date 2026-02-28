import { MessageType, Currency, ItemLocationType, ItemCondition } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket, broadcastToRoom } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { formatCopperAsDenominations, copperToDenominationCounts, withArticle, withNpcName, withNpcNameCapitalized, withNpcNamePossessive } from '../utils/textFormat.js';
import { deductCopperFromWallet } from '../utils/currency.js';
import { calculateTotalWealth, CURRENCY_TYPES } from './itemCommands.js';
import { getMerchantsInRoom, findMerchantInRoom, NpcCombatInstance, isMerchantHostileToPlayer } from './npcManager.js';
import * as merchantRepo from '../db/repositories/merchantRepository.js';
import * as factionRepo from '../db/repositories/factionRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import { withTransaction } from '../db/index.js';

// ============================================================================
// HAGGLE REPUTATION (in-memory)
// ============================================================================

/** Haggle cooldown: 1 point decays per 5 minutes */
const HAGGLE_DECAY_INTERVAL_MS = 5 * 60 * 1000;

interface HaggleState {
  rep: number;
  lastHaggleAt: number;
}

/** Map<characterId, Map<npcTemplateId, HaggleState>> */
const haggleReputation = new Map<number, Map<number, HaggleState>>();

/**
 * Get the effective haggle rep for a character/merchant pair,
 * accounting for time-based decay since lastHaggleAt.
 */
function getEffectiveHaggleRep(characterId: number, npcTemplateId: number): number {
  const playerMap = haggleReputation.get(characterId);
  if (!playerMap) return 0;
  const state = playerMap.get(npcTemplateId);
  if (!state || state.rep <= 0) return 0;

  const elapsed = Date.now() - state.lastHaggleAt;
  const decayPoints = Math.floor(elapsed / HAGGLE_DECAY_INTERVAL_MS);
  const effectiveRep = Math.max(0, state.rep - decayPoints);

  // Clean up if fully decayed
  if (effectiveRep <= 0) {
    playerMap.delete(npcTemplateId);
    if (playerMap.size === 0) haggleReputation.delete(characterId);
  }

  return effectiveRep;
}

/**
 * Increment haggle rep for a character/merchant pair.
 */
function incrementHaggleRep(characterId: number, npcTemplateId: number): number {
  let playerMap = haggleReputation.get(characterId);
  if (!playerMap) {
    playerMap = new Map();
    haggleReputation.set(characterId, playerMap);
  }

  const existing = playerMap.get(npcTemplateId);
  const currentEffective = existing ? getEffectiveHaggleRep(characterId, npcTemplateId) : 0;
  const newRep = currentEffective + 1;

  playerMap.set(npcTemplateId, { rep: newRep, lastHaggleAt: Date.now() });
  return newRep;
}

/**
 * Clear all haggle state for a character (on disconnect).
 */
export function clearHaggleState(characterId: number): void {
  haggleReputation.delete(characterId);
}

// ============================================================================
// PRICING ENGINE
// ============================================================================

/**
 * Calculate merchant price for an item.
 * Total Rep = factionRep + floor((charisma - 50) / 10)
 * Each +10 positive rep = 1% discount (max 10%)
 * Each -10 negative rep = 2% surcharge (max 10%, then refuse)
 * Sell to merchant: 50% of base_value, same modifiers
 * Haggle rep 1-3: 1% improvement per point; 4: reset to MSRP; 5-9: +2%/point surcharge; 10: refuse
 */
export function calculateMerchantPrice(
  baseValue: number,
  factionRep: number,
  charisma: number,
  isBuying: boolean,
  haggleRep: number = 0
): { price: number; refused: boolean } {
  if (baseValue <= 0) return { price: 0, refused: false };

  // Start with base value for buying, 50% for selling
  let price = isBuying ? baseValue : Math.floor(baseValue * 0.5);

  // Combined reputation = faction rep + charisma modifier
  const charismaModifier = Math.floor((charisma - 50) / 10);
  const totalRep = factionRep + charismaModifier;

  // Apply faction/charisma-based modifier
  if (totalRep > 0) {
    // Discount: 1% per 10 rep, max 10%
    const discountPct = Math.min(Math.floor(totalRep / 10), 10);
    price = Math.round(price * (1 - discountPct / 100));
  } else if (totalRep < 0) {
    // Surcharge: 2% per 10 negative rep, max 10%
    const surchargePct = Math.min(Math.floor(Math.abs(totalRep) / 10) * 2, 10);
    price = Math.round(price * (1 + surchargePct / 100));

    // Refuse at -50 or worse
    if (totalRep <= -50) {
      return { price, refused: true };
    }
  }

  // Apply haggle reputation effects
  if (haggleRep >= 10) {
    return { price, refused: true };
  } else if (haggleRep >= 5) {
    // Rep 5-9: +2% per point above 4
    const haggleSurcharge = (haggleRep - 4) * 2;
    price = Math.round(price * (1 + haggleSurcharge / 100));
  } else if (haggleRep === 4) {
    // Rep 4: reset to base MSRP (ignore positive modifiers)
    price = isBuying ? baseValue : Math.floor(baseValue * 0.5);
  } else if (haggleRep > 0) {
    // Rep 1-3: 1% improvement per point (lower buy price, higher sell price)
    const haggleDiscount = haggleRep;
    if (isBuying) {
      price = Math.round(price * (1 - haggleDiscount / 100));
    } else {
      price = Math.round(price * (1 + haggleDiscount / 100));
    }
  }

  // Minimum price of 1 copper
  return { price: Math.max(1, price), refused: false };
}

// ============================================================================
// GUARD CHECKS
// ============================================================================

function requireCharacter(socket: AuthenticatedSocket): CommandResponse | null {
  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }
  return null;
}

/**
 * Resolve which merchant to use. If multiple merchants in room and no target specified,
 * prompt the player to specify.
 */
function resolveMerchant(
  roomId: number,
  merchantName?: string
): { merchant?: NpcCombatInstance; error?: CommandResponse } {
  const merchants = getMerchantsInRoom(roomId);

  if (merchants.length === 0) {
    return { error: { type: MessageType.ERROR, message: 'There are no merchants here.' } };
  }

  if (merchantName) {
    const merchant = findMerchantInRoom(merchantName, roomId);
    if (!merchant) {
      return { error: { type: MessageType.ERROR, message: `There is no merchant "${merchantName}" here.` } };
    }
    return { merchant };
  }

  if (merchants.length === 1) {
    return { merchant: merchants[0] };
  }

  // Multiple merchants — prompt player to specify
  const names = merchants.map(m => colors.boldWhite(m.entityName)).join(', ');
  return { error: { type: MessageType.ERROR, message: `Multiple merchants here: ${names}. Specify which one.` } };
}

function isMerchantAvailable(merchant: NpcCombatInstance, characterId?: number): CommandResponse | null {
  if (merchant.behaviorState === 'combat') {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} is busy fighting and cannot trade right now.` };
  }
  if (merchant.behaviorState === 'fleeing' || merchant.behaviorState === 'returning') {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} is not available right now.` };
  }
  if (merchant.vitals.hp <= 0) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} is dead.` };
  }
  if (characterId && isMerchantHostileToPlayer(characterId, merchant.templateId)) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} refuses to deal with you after your attack.` };
  }
  return null;
}

// ============================================================================
// LIST COMMAND
// ============================================================================

export async function handleList(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  const roomId = getPlayerLocation(socket.playerId);
  if (!roomId) return { type: MessageType.ERROR, message: 'You are nowhere.' };

  // Parse optional merchant name (e.g., "list goran")
  const merchantName = args.length > 0 ? args.join(' ') : undefined;
  const { merchant, error } = resolveMerchant(roomId, merchantName);
  if (error) return error;
  if (!merchant) return { type: MessageType.ERROR, message: 'No merchant found.' };

  const available = isMerchantAvailable(merchant, socket.characterId!);
  if (available) return available;

  // Get inventory with templates
  const inventory = await merchantRepo.getInventoryWithTemplates(merchant.templateId);
  if (inventory.length === 0) {
    return { type: MessageType.OUTPUT, message: `${colors.boldWhite(withNpcNameCapitalized(merchant.entityName, merchant.isProperName))} has nothing for sale.` };
  }

  // Get player faction rep, charisma, and haggle rep for pricing
  const charisma = socket.characterStats?.charisma ?? 50;
  const factionRep = merchant.template.primaryFactionId
    ? await factionRepo.getPlayerReputation(socket.characterId!, merchant.template.primaryFactionId)
    : 0;
  const haggleRep = getEffectiveHaggleRep(socket.characterId!, merchant.templateId);

  const lines: string[] = [
    colors.boldYellow(`${withNpcNamePossessive(merchant.entityName, merchant.isProperName)} Wares:`),
    '',
    `  ${colors.boldWhite('Item'.padEnd(30))} ${colors.boldWhite('Stock'.padEnd(8))} ${colors.boldWhite('Price')}`,
    `  ${'─'.repeat(30)} ${'─'.repeat(7)} ${'─'.repeat(20)}`,
  ];

  for (const entry of inventory) {
    const template = entry.itemTemplate;
    const { price, refused } = calculateMerchantPrice(template.base_value, factionRep, charisma, true, haggleRep);

    const stockRaw = entry.currentStock > 0 ? String(entry.currentStock) : 'OUT';
    const stockStr = entry.currentStock > 0
      ? stockRaw.padEnd(8)
      : colors.red(stockRaw.padEnd(8));
    const priceStr = refused
      ? colors.red('REFUSED')
      : formatCopperAsDenominations(price);

    const nameStr = template.name.length > 28
      ? template.name.substring(0, 27) + '…'
      : template.name;

    lines.push(`  ${colors.item(nameStr.padEnd(30))} ${stockStr} ${priceStr}`);
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// BUY COMMAND
// ============================================================================

export async function handleBuy(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Buy what? Usage: buy <item> [from <merchant>]' };
  }

  const roomId = getPlayerLocation(socket.playerId);
  if (!roomId) return { type: MessageType.ERROR, message: 'You are nowhere.' };

  // Parse "buy <item> from <merchant>"
  const fromIdx = args.findIndex(a => a.toLowerCase() === 'from');
  const itemKeyword = fromIdx >= 0 ? args.slice(0, fromIdx).join(' ') : args.join(' ');
  const merchantName = fromIdx >= 0 ? args.slice(fromIdx + 1).join(' ') : undefined;

  const { merchant, error } = resolveMerchant(roomId, merchantName);
  if (error) return error;
  if (!merchant) return { type: MessageType.ERROR, message: 'No merchant found.' };

  const available = isMerchantAvailable(merchant, socket.characterId!);
  if (available) return available;

  // Find item in merchant inventory
  const inventory = await merchantRepo.getInventoryWithTemplates(merchant.templateId);
  const lowerKeyword = itemKeyword.toLowerCase();
  const entry = inventory.find(e => {
    const t = e.itemTemplate;
    return t.name.toLowerCase() === lowerKeyword ||
           t.name.toLowerCase().startsWith(lowerKeyword) ||
           t.keywords?.some(k => k.toLowerCase() === lowerKeyword || k.toLowerCase().startsWith(lowerKeyword));
  });

  if (!entry) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} doesn't sell that.` };
  }

  if (entry.currentStock <= 0) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} is out of stock on ${entry.itemTemplate.name}.` };
  }

  // Calculate price with haggle rep
  const charisma = socket.characterStats?.charisma ?? 50;
  const factionRep = merchant.template.primaryFactionId
    ? await factionRepo.getPlayerReputation(socket.characterId!, merchant.template.primaryFactionId)
    : 0;
  const haggleRep = getEffectiveHaggleRep(socket.characterId!, merchant.templateId);

  const { price, refused } = calculateMerchantPrice(entry.itemTemplate.base_value, factionRep, charisma, true, haggleRep);
  if (refused) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} refuses to do business with you.` };
  }

  // Check player can afford
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) return { type: MessageType.ERROR, message: 'Character not found.' };

  const currency: Currency = {
    copper: character.copper ?? 0,
    silver: character.silver ?? 0,
    gold: character.gold ?? 0,
    platinum: character.platinum ?? 0,
    runic: character.runic ?? 0,
  };

  const totalWealth = calculateTotalWealth(currency);
  if (totalWealth < price) {
    return { type: MessageType.ERROR, message: `You can't afford that. It costs ${formatCopperAsDenominations(price)}.` };
  }

  // Perform the transaction
  const deductions = deductCopperFromWallet(currency, price);

  try {
    await withTransaction(async (client) => {
      // Enforce max_in_world limit
      if (entry.itemTemplate.max_in_world != null) {
        const worldCount = await itemRepo.countWorldInstances(entry.itemTemplateId, client);
        if (worldCount >= entry.itemTemplate.max_in_world) {
          throw new Error('WORLD_LIMIT');
        }
      }

      // Deduct currency from player
      for (const [field, qty] of deductions) {
        await characterRepo.addCurrency(socket.characterId!, field, -qty, client);
      }

      // Create item instance in player inventory
      await itemRepo.createInstance({
        template_id: entry.itemTemplateId,
        location_type: ItemLocationType.PLAYER,
        location_id: socket.characterId!,
        condition: ItemCondition.PRISTINE,
      }, client);

      // Decrement merchant stock
      const decremented = await merchantRepo.decrementStock(entry.id, client);
      if (!decremented) {
        throw new Error('Item is out of stock.');
      }
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'WORLD_LIMIT') {
      return { type: MessageType.ERROR, message: `That item is no longer available.` };
    }
    throw err;
  }

  const priceStr = formatCopperAsDenominations(price);
  broadcastToRoom(roomId, `${socket.username} buys ${withArticle(entry.itemTemplate.name)} from ${withNpcName(merchant.entityName, merchant.isProperName)}.`, socket.playerId);

  return {
    type: MessageType.OUTPUT,
    message: `You buy ${colors.item(withArticle(entry.itemTemplate.name))} from ${colors.boldWhite(withNpcName(merchant.entityName, merchant.isProperName))} for ${colors.gold(priceStr)}.`,
  };
}

// ============================================================================
// SELL COMMAND
// ============================================================================

export async function handleSell(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Sell what? Usage: sell <item> [to <merchant>]' };
  }

  const roomId = getPlayerLocation(socket.playerId);
  if (!roomId) return { type: MessageType.ERROR, message: 'You are nowhere.' };

  // Parse "sell <item> to <merchant>"
  const toIdx = args.findIndex(a => a.toLowerCase() === 'to');
  const itemKeyword = toIdx >= 0 ? args.slice(0, toIdx).join(' ') : args.join(' ');
  const merchantName = toIdx >= 0 ? args.slice(toIdx + 1).join(' ') : undefined;

  const { merchant, error } = resolveMerchant(roomId, merchantName);
  if (error) return error;
  if (!merchant) return { type: MessageType.ERROR, message: 'No merchant found.' };

  const available = isMerchantAvailable(merchant, socket.characterId!);
  if (available) return available;

  // Find item in player inventory
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, itemKeyword);
  if (matches.length === 0) {
    return { type: MessageType.ERROR, message: `You don't have that.` };
  }

  const item = matches[0];
  const template = item.template;
  if (!template) {
    return { type: MessageType.ERROR, message: `You can't sell that.` };
  }

  // Can't sell no_drop items
  if (template.flags?.no_drop) {
    return { type: MessageType.ERROR, message: `You can't sell that.` };
  }

  // Can't sell currency items
  if (template.item_type === 'currency') {
    return { type: MessageType.ERROR, message: `You can't sell currency.` };
  }

  // Items with no base value can't be sold
  if (template.base_value <= 0) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} isn't interested in that.` };
  }

  // Calculate sell price with haggle rep
  const charisma = socket.characterStats?.charisma ?? 50;
  const factionRep = merchant.template.primaryFactionId
    ? await factionRepo.getPlayerReputation(socket.characterId!, merchant.template.primaryFactionId)
    : 0;
  const haggleRep = getEffectiveHaggleRep(socket.characterId!, merchant.templateId);

  const { price, refused } = calculateMerchantPrice(template.base_value, factionRep, charisma, false, haggleRep);
  if (refused) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} refuses to do business with you.` };
  }

  // Perform the transaction
  const denomCounts = copperToDenominationCounts(price);

  await withTransaction(async (client) => {
    // Remove item from player inventory
    await itemRepo.deleteInstance(item.id, client);

    // Add currency to player
    for (const [denom, count] of denomCounts) {
      const currencyInfo = CURRENCY_TYPES[denom];
      if (currencyInfo) {
        await characterRepo.addCurrency(socket.characterId!, currencyInfo.field, count, client);
      }
    }

    // Increment merchant stock if this item is in their catalog
    const catalogEntry = await merchantRepo.findInventoryEntry(merchant.templateId, template.id, client);
    if (catalogEntry) {
      await merchantRepo.incrementStock(catalogEntry.id, client);
    }
  });

  const priceStr = formatCopperAsDenominations(price);
  broadcastToRoom(roomId, `${socket.username} sells ${withArticle(template.name)} to ${withNpcName(merchant.entityName, merchant.isProperName)}.`, socket.playerId);

  return {
    type: MessageType.OUTPUT,
    message: `You sell ${colors.item(withArticle(template.name))} to ${colors.boldWhite(withNpcName(merchant.entityName, merchant.isProperName))} for ${colors.gold(priceStr)}.`,
  };
}

// ============================================================================
// PRICE COMMAND
// ============================================================================

export async function handlePrice(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Price what? Usage: price <item> [from <merchant>]' };
  }

  const roomId = getPlayerLocation(socket.playerId);
  if (!roomId) return { type: MessageType.ERROR, message: 'You are nowhere.' };

  // Parse "price <item> from <merchant>"
  const fromIdx = args.findIndex(a => a.toLowerCase() === 'from');
  const itemKeyword = fromIdx >= 0 ? args.slice(0, fromIdx).join(' ') : args.join(' ');
  const merchantName = fromIdx >= 0 ? args.slice(fromIdx + 1).join(' ') : undefined;

  const { merchant, error } = resolveMerchant(roomId, merchantName);
  if (error) return error;
  if (!merchant) return { type: MessageType.ERROR, message: 'No merchant found.' };

  const available = isMerchantAvailable(merchant, socket.characterId!);
  if (available) return available;
  const charisma = socket.characterStats?.charisma ?? 50;
  const factionRep = merchant.template.primaryFactionId
    ? await factionRepo.getPlayerReputation(socket.characterId!, merchant.template.primaryFactionId)
    : 0;
  const haggleRep = getEffectiveHaggleRep(socket.characterId!, merchant.templateId);

  const lines: string[] = [];

  // Check merchant inventory for buy price
  const inventory = await merchantRepo.getInventoryWithTemplates(merchant.templateId);
  const lowerKeyword = itemKeyword.toLowerCase();
  const merchantEntry = inventory.find(e => {
    const t = e.itemTemplate;
    return t.name.toLowerCase() === lowerKeyword ||
           t.name.toLowerCase().startsWith(lowerKeyword) ||
           t.keywords?.some(k => k.toLowerCase() === lowerKeyword || k.toLowerCase().startsWith(lowerKeyword));
  });

  if (merchantEntry) {
    const { price: buyPrice, refused } = calculateMerchantPrice(merchantEntry.itemTemplate.base_value, factionRep, charisma, true, haggleRep);
    const buyStr = refused ? colors.red('REFUSED') : colors.gold(formatCopperAsDenominations(buyPrice));
    lines.push(`Buy ${colors.item(merchantEntry.itemTemplate.name)}: ${buyStr}`);
  }

  // Check player inventory for sell price
  const matches = await itemRepo.findItemsInCharacterInventoryByKeyword(socket.characterId!, itemKeyword);
  if (matches.length > 0 && matches[0].template) {
    const template = matches[0].template;
    if (template.base_value > 0 && template.item_type !== 'currency' && !template.flags?.no_drop) {
      const { price: sellPrice, refused } = calculateMerchantPrice(template.base_value, factionRep, charisma, false, haggleRep);
      const sellStr = refused ? colors.red('REFUSED') : colors.gold(formatCopperAsDenominations(sellPrice));
      lines.push(`Sell ${colors.item(template.name)}: ${sellStr}`);
    }
  }

  if (lines.length === 0) {
    return { type: MessageType.ERROR, message: `No pricing available for "${itemKeyword}".` };
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// HAGGLE COMMAND
// ============================================================================

export async function handleHaggle(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  const roomId = getPlayerLocation(socket.playerId);
  if (!roomId) return { type: MessageType.ERROR, message: 'You are nowhere.' };

  const merchantName = args.length > 0 ? args.join(' ') : undefined;
  const { merchant, error } = resolveMerchant(roomId, merchantName);
  if (error) return error;
  if (!merchant) return { type: MessageType.ERROR, message: 'No merchant found.' };

  const available = isMerchantAvailable(merchant, socket.characterId!);
  if (available) return available;

  // Check current effective rep before incrementing
  const currentRep = getEffectiveHaggleRep(socket.characterId!, merchant.templateId);
  if (currentRep >= 10) {
    return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(merchant.entityName, merchant.isProperName)} refuses to deal with you any further. Try again later.` };
  }

  // Increment haggle rep
  const newRep = incrementHaggleRep(socket.characterId!, merchant.templateId);

  // Broadcast to room
  broadcastToRoom(roomId, `${socket.username} haggles with ${withNpcName(merchant.entityName, merchant.isProperName)}.`, socket.playerId);

  if (newRep <= 3) {
    return {
      type: MessageType.OUTPUT,
      message: `You haggle with ${colors.boldWhite(withNpcName(merchant.entityName, merchant.isProperName))}. Prices seem a bit better.`,
    };
  } else if (newRep === 4) {
    return {
      type: MessageType.OUTPUT,
      message: `${colors.boldWhite(withNpcNameCapitalized(merchant.entityName, merchant.isProperName))} crosses their arms. "That's my final offer."`,
    };
  } else if (newRep <= 9) {
    return {
      type: MessageType.OUTPUT,
      message: `${colors.boldWhite(withNpcNameCapitalized(merchant.entityName, merchant.isProperName))} narrows their eyes. "You're pushing your luck."`,
    };
  } else {
    return {
      type: MessageType.ERROR,
      message: `${colors.boldWhite(withNpcNameCapitalized(merchant.entityName, merchant.isProperName))} turns away. "We're done here."`,
    };
  }
}
