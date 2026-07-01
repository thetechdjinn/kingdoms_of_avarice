import { MessageType, Currency } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { copperToDenominationCounts, formatCopperAsDenominations } from '../utils/textFormat.js';
import { DENOMINATION_COPPER_VALUE, deductCopperFromWallet } from '../utils/currency.js';
import { parseCurrencyType, calculateTotalWealth, CURRENCY_TYPES } from './itemCommands.js';
import * as roomRepo from '../db/repositories/roomRepository.js';
import { addPocket, addBank } from './sessionState.js';

/** Strict integer parse — rejects partial matches like "10abc" */
function parseStrictInt(value: string): number {
  if (!/^\d+$/.test(value)) return NaN;
  return parseInt(value, 10);
}

function requireCharacter(socket: AuthenticatedSocket): CommandResponse | null {
  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }
  return null;
}

// ============================================================================
// BANK - Check balance (works anywhere)
// ============================================================================

export async function handleBank(socket: AuthenticatedSocket): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  // Read from memory-first cache (see notes/Memory_First_Architecture.md).
  // The cache is the source of truth; flushPlayer persists changes at the
  // next save tick or any other flush trigger.
  const balance = socket.bankBalance;

  if (balance === 0) {
    return {
      type: MessageType.OUTPUT,
      message: `${colors.green('Bank Balance:')} You have no funds on deposit.`,
    };
  }

  const denomStr = formatCopperAsDenominations(balance);

  const lines: string[] = [
    `${colors.green('Bank Balance:')} ${colors.gold(String(balance))} copper farthings`,
    `  (${denomStr})`,
  ];

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// DEPOSIT - Requires bank room
// ============================================================================

export async function handleDeposit(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  const currentRoomId = getPlayerLocation(socket.playerId);
  const isBank = await roomRepo.isBankRoom(currentRoomId);
  if (!isBank) {
    return { type: MessageType.ERROR, message: 'You must be in a bank to deposit funds.' };
  }

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Deposit what? Try "deposit all", "deposit <amount>", or "deposit <amount> <currency>".' };
  }

  // Read from memory-first cache. Atomicity between pocket and bank is now
  // in-memory (synchronous mutation); the save tick flushes both via
  // flushPlayer in one transaction. See notes/Memory_First_Architecture.md.
  const currency: Currency = { ...socket.pocket };

  // deposit all
  if (args[0].toLowerCase() === 'all') {
    const total = calculateTotalWealth(currency);
    if (total === 0) {
      return { type: MessageType.ERROR, message: 'You have no currency to deposit.' };
    }

    addPocket(socket, 'copper', -currency.copper);
    addPocket(socket, 'silver', -currency.silver);
    addPocket(socket, 'gold', -currency.gold);
    addPocket(socket, 'platinum', -currency.platinum);
    addPocket(socket, 'runic', -currency.runic);
    addBank(socket, total);

    const denomStr = formatCopperAsDenominations(total);
    return {
      type: MessageType.OUTPUT,
      message: `You deposit all your currency (${colors.gold(denomStr)}) into the bank.`,
    };
  }

  // deposit <amount> [currency]
  const amount = parseStrictInt(args[0]);
  if (isNaN(amount) || amount <= 0) {
    return { type: MessageType.ERROR, message: 'You must specify a positive amount to deposit.' };
  }

  // deposit <amount> <currency>
  if (args.length >= 2) {
    const currencyType = parseCurrencyType(args[1]);
    if (!currencyType) {
      return { type: MessageType.ERROR, message: `Unknown currency type "${args[1]}".` };
    }

    const currencyInfo = CURRENCY_TYPES[currencyType];
    const available = currency[currencyInfo.field] ?? 0;

    if (amount > available) {
      return { type: MessageType.ERROR, message: `You don't have ${amount} ${currencyType} to deposit.` };
    }

    const copperValue = amount * DENOMINATION_COPPER_VALUE[currencyType];

    addPocket(socket, currencyInfo.field, -amount);
    addBank(socket, copperValue);

    return {
      type: MessageType.OUTPUT,
      message: `You deposit ${colors.gold(String(amount))} ${currencyType} into the bank.`,
    };
  }

  // deposit <amount> (in copper value, deducted across all denominations)
  const totalWealth = calculateTotalWealth(currency);
  if (amount > totalWealth) {
    return { type: MessageType.ERROR, message: `You don't have that much currency. Your total wealth is ${colors.gold(String(totalWealth))} copper farthings.` };
  }

  // Deduct from wallet starting with lowest denominations first
  const deductions = deductCopperFromWallet(currency, amount);

  for (const [field, qty] of deductions) {
    // qty > 0 means deduct coins, qty < 0 means give change back
    addPocket(socket, field, -qty);
  }
  addBank(socket, amount);

  const denomStr = formatCopperAsDenominations(amount);
  return {
    type: MessageType.OUTPUT,
    message: `You deposit ${colors.gold(denomStr)} into the bank.`,
  };
}

// ============================================================================
// WITHDRAW - Requires bank room
// ============================================================================

export async function handleWithdraw(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const charError = requireCharacter(socket);
  if (charError) return charError;

  const currentRoomId = getPlayerLocation(socket.playerId);
  const isBank = await roomRepo.isBankRoom(currentRoomId);
  if (!isBank) {
    return { type: MessageType.ERROR, message: 'You must be in a bank to withdraw funds.' };
  }

  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Withdraw what? Try "withdraw all", "withdraw <amount>", or "withdraw <amount> <currency>".' };
  }

  // Read from memory-first cache. Sufficient-funds checks are done against
  // socket.bankBalance; mutation is synchronous so pocket↔bank atomicity is
  // in-process. flushPlayer drains both via one transaction at the next tick.
  const balance = socket.bankBalance;

  if (balance === 0) {
    return { type: MessageType.ERROR, message: 'You have no funds on deposit.' };
  }

  // withdraw all
  if (args[0].toLowerCase() === 'all') {
    const denomCounts = copperToDenominationCounts(balance);

    addBank(socket, -balance);
    for (const [denom, count] of denomCounts) {
      const currencyInfo = CURRENCY_TYPES[denom];
      if (currencyInfo) {
        addPocket(socket, currencyInfo.field, count);
      }
    }

    const denomStr = formatCopperAsDenominations(balance);
    return {
      type: MessageType.OUTPUT,
      message: `You withdraw ${colors.gold(denomStr)} from the bank.`,
    };
  }

  // withdraw <amount> [currency]
  const amount = parseStrictInt(args[0]);
  if (isNaN(amount) || amount <= 0) {
    return { type: MessageType.ERROR, message: 'You must specify a positive amount to withdraw.' };
  }

  // withdraw <amount> <currency>
  if (args.length >= 2) {
    const currencyType = parseCurrencyType(args[1]);
    if (!currencyType) {
      return { type: MessageType.ERROR, message: `Unknown currency type "${args[1]}".` };
    }

    const copperValue = amount * DENOMINATION_COPPER_VALUE[currencyType];
    if (copperValue > balance) {
      return { type: MessageType.ERROR, message: 'Insufficient funds in your bank account.' };
    }

    const currencyInfo = CURRENCY_TYPES[currencyType];

    addBank(socket, -copperValue);
    addPocket(socket, currencyInfo.field, amount);

    return {
      type: MessageType.OUTPUT,
      message: `You withdraw ${colors.gold(String(amount))} ${currencyType} from the bank.`,
    };
  }

  // withdraw <amount> (copper, auto-convert to highest denominations)
  if (amount > balance) {
    return { type: MessageType.ERROR, message: 'Insufficient funds in your bank account.' };
  }

  const denomCounts = copperToDenominationCounts(amount);

  addBank(socket, -amount);
  for (const [denom, count] of denomCounts) {
    const currencyInfo = CURRENCY_TYPES[denom];
    if (currencyInfo) {
      addPocket(socket, currencyInfo.field, count);
    }
  }

  const denomStr = formatCopperAsDenominations(amount);
  return {
    type: MessageType.OUTPUT,
    message: `You withdraw ${colors.gold(denomStr)} from the bank.`,
  };
}
