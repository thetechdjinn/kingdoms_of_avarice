import { MessageType, Currency } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { copperToDenominationCounts, formatCopperAsDenominations } from '../utils/textFormat.js';
import { DENOMINATION_COPPER_VALUE, deductCopperFromWallet } from '../utils/currency.js';
import { parseCurrencyType, calculateTotalWealth, CURRENCY_TYPES } from './itemCommands.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as roomRepo from '../db/repositories/roomRepository.js';
import { withTransaction } from '../db/index.js';

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

  const balance = await characterRepo.getBankBalance(socket.characterId!);

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

  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  const currency: Currency = {
    copper: character.copper ?? 0,
    silver: character.silver ?? 0,
    gold: character.gold ?? 0,
    platinum: character.platinum ?? 0,
    runic: character.runic ?? 0,
  };

  // deposit all
  if (args[0].toLowerCase() === 'all') {
    const total = calculateTotalWealth(currency);
    if (total === 0) {
      return { type: MessageType.ERROR, message: 'You have no currency to deposit.' };
    }

    await withTransaction(async (client) => {
      await characterRepo.addCurrency(socket.characterId!, 'copper', -(currency.copper), client);
      await characterRepo.addCurrency(socket.characterId!, 'silver', -(currency.silver), client);
      await characterRepo.addCurrency(socket.characterId!, 'gold', -(currency.gold), client);
      await characterRepo.addCurrency(socket.characterId!, 'platinum', -(currency.platinum), client);
      await characterRepo.addCurrency(socket.characterId!, 'runic', -(currency.runic), client);
      await characterRepo.addBankBalance(socket.characterId!, total, client);
    });

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

    await withTransaction(async (client) => {
      await characterRepo.addCurrency(socket.characterId!, currencyInfo.field, -amount, client);
      await characterRepo.addBankBalance(socket.characterId!, copperValue, client);
    });

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

  await withTransaction(async (client) => {
    for (const [field, qty] of deductions) {
      // qty > 0 means deduct coins, qty < 0 means give change back
      await characterRepo.addCurrency(socket.characterId!, field, -qty, client);
    }
    await characterRepo.addBankBalance(socket.characterId!, amount, client);
  });

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

  const balance = await characterRepo.getBankBalance(socket.characterId!);

  if (balance === 0) {
    return { type: MessageType.ERROR, message: 'You have no funds on deposit.' };
  }

  // withdraw all
  if (args[0].toLowerCase() === 'all') {
    const denomCounts = copperToDenominationCounts(balance);

    await withTransaction(async (client) => {
      const success = await characterRepo.addBankBalance(socket.characterId!, -balance, client);
      if (!success) {
        throw new Error('Insufficient bank balance');
      }
      for (const [denom, count] of denomCounts) {
        const currencyInfo = CURRENCY_TYPES[denom];
        if (currencyInfo) {
          await characterRepo.addCurrency(socket.characterId!, currencyInfo.field, count, client);
        }
      }
    });

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

    await withTransaction(async (client) => {
      const success = await characterRepo.addBankBalance(socket.characterId!, -copperValue, client);
      if (!success) {
        throw new Error('Insufficient bank balance');
      }
      await characterRepo.addCurrency(socket.characterId!, currencyInfo.field, amount, client);
    });

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

  await withTransaction(async (client) => {
    const success = await characterRepo.addBankBalance(socket.characterId!, -amount, client);
    if (!success) {
      throw new Error('Insufficient bank balance');
    }
    for (const [denom, count] of denomCounts) {
      const currencyInfo = CURRENCY_TYPES[denom];
      if (currencyInfo) {
        await characterRepo.addCurrency(socket.characterId!, currencyInfo.field, count, client);
      }
    }
  });

  const denomStr = formatCopperAsDenominations(amount);
  return {
    type: MessageType.OUTPUT,
    message: `You withdraw ${colors.gold(denomStr)} from the bank.`,
  };
}
