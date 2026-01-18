/**
 * Training Commands
 *
 * Handles the "train" command for allocating Character Points (CP) to stats.
 */

import { MessageType, CPStatName, CP_STAT_NAMES, CP_STAT_ABBREVIATIONS, getCPCostForNextPoint, getTotalCPCost, getMaxPointsAffordable, DEFAULT_STARTING_CP } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { CommandResponse } from './commands.js';
import { colors } from '../utils/colors.js';
import { wordWrap } from '../utils/textFormat.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';

// Map from user-friendly stat names to internal names
const STAT_ALIASES: Record<string, CPStatName> = {
  str: 'strength',
  strength: 'strength',
  agi: 'agility',
  agility: 'agility',
  dex: 'agility',      // Common alias
  dexterity: 'agility', // Map dexterity to agility
  con: 'constitution',
  constitution: 'constitution',
  int: 'intellect',
  intellect: 'intellect',
  intelligence: 'intellect', // Map intelligence to intellect
  wis: 'wisdom',
  wisdom: 'wisdom',
  cha: 'charisma',
  charisma: 'charisma',
};

// Map from internal stat names to character DB column names
const STAT_TO_COLUMN: Record<CPStatName, string> = {
  strength: 'strength',
  agility: 'dexterity',      // DB uses dexterity
  constitution: 'constitution',
  intellect: 'intelligence',  // DB uses intelligence
  wisdom: 'wisdom',
  charisma: 'charisma',
};

/**
 * Handle the train command
 *
 * Usage:
 *   train           - Show current stats and CP
 *   train <stat>    - Train one point in the specified stat
 *   train <stat> <amount> - Train multiple points
 */
export async function handleTrain(
  socket: AuthenticatedSocket,
  args: string
): Promise<CommandResponse> {
  const characterId = socket.characterId;
  if (!characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  // Get character and race data
  const character = await characterRepo.findCharacterById(characterId);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  const race = await progressionRepo.getRaceById(character.race);
  if (!race || !race.base_stats || typeof race.base_stats.strength !== 'object') {
    return { type: MessageType.ERROR, message: 'Race data not found or uses legacy format.' };
  }

  // Cast to the expected type after validation
  const raceBaseStats = race.base_stats as unknown as Record<string, { min: number; max: number }>;

  const cpSpent = character.cp_spent || {};
  const unspentCp = character.unspent_cp ?? DEFAULT_STARTING_CP;

  // Parse arguments
  const parts = args.trim().toLowerCase().split(/\s+/);
  const statArg = parts[0];
  const amountArg = parts[1];

  // No arguments - show training status
  if (!statArg) {
    return showTrainingStatus(character, race.display_name, raceBaseStats, cpSpent, unspentCp);
  }

  // Look up the stat
  const statName = STAT_ALIASES[statArg];
  if (!statName) {
    const validStats = Object.keys(STAT_ALIASES)
      .filter(k => k.length <= 3) // Only show short aliases
      .join(', ');
    return {
      type: MessageType.ERROR,
      message: `Unknown stat "${statArg}". Valid stats: ${validStats}`,
    };
  }

  // Determine amount to train
  let amount = 1;
  if (amountArg) {
    amount = parseInt(amountArg, 10);
    if (isNaN(amount) || amount < 1) {
      return { type: MessageType.ERROR, message: 'Amount must be a positive number.' };
    }
  }

  // Get current values
  const statMin = raceBaseStats[statName]?.min ?? 40;
  const statMax = raceBaseStats[statName]?.max ?? 100;
  const currentSpent = cpSpent[statName] || 0;
  const currentValue = statMin + currentSpent;

  // Check if already at max
  if (currentValue >= statMax) {
    return {
      type: MessageType.ERROR,
      message: `Your ${statName} is already at its racial maximum of ${statMax}.`,
    };
  }

  // Limit amount to what's possible
  const maxTrainable = statMax - currentValue;
  if (amount > maxTrainable) {
    amount = maxTrainable;
  }

  // Calculate CP cost
  const cpCost = getTotalCPCost(currentSpent, amount);

  // Check if enough CP
  if (cpCost > unspentCp) {
    const affordable = getMaxPointsAffordable(currentSpent, unspentCp);
    if (affordable === 0) {
      return {
        type: MessageType.ERROR,
        message: `You don't have enough CP. Next point costs ${getCPCostForNextPoint(currentSpent)} CP, you have ${unspentCp}.`,
      };
    }
    return {
      type: MessageType.ERROR,
      message: `You can only afford to train ${affordable} point(s) in ${statName} (costs ${getTotalCPCost(currentSpent, affordable)} CP).`,
    };
  }

  // Apply the training
  const newSpent = currentSpent + amount;
  const newValue = statMin + newSpent;
  const newUnspentCp = unspentCp - cpCost;

  // Update cp_spent
  const newCpSpent = { ...cpSpent, [statName]: newSpent };

  // Update character in database
  const columnName = STAT_TO_COLUMN[statName];
  await characterRepo.updateCharacterStats(characterId, {
    [columnName]: newValue,
    unspent_cp: newUnspentCp,
    cp_spent: newCpSpent,
  });

  const statDisplay = CP_STAT_ABBREVIATIONS[statName];
  const message = amount === 1
    ? `You train your ${statName}. ${statDisplay}: ${currentValue} -> ${colors.green(String(newValue))} (${cpCost} CP spent, ${newUnspentCp} CP remaining)`
    : `You train your ${statName} ${amount} times. ${statDisplay}: ${currentValue} -> ${colors.green(String(newValue))} (${cpCost} CP spent, ${newUnspentCp} CP remaining)`;

  return { type: MessageType.OUTPUT, message };
}

/**
 * Show the training status screen
 */
function showTrainingStatus(
  character: characterRepo.DbCharacter,
  raceDisplayName: string,
  raceBaseStats: Record<string, { min: number; max: number }>,
  cpSpent: Record<string, number>,
  unspentCp: number
): CommandResponse {
  const lines: string[] = [];

  lines.push(colors.cyan('=== Training ==='));
  lines.push(`Race: ${raceDisplayName}`);
  lines.push(`Unspent CP: ${colors.green(String(unspentCp))}`);
  lines.push('');
  lines.push('Stat        Current  Max    Spent  Next Cost');
  lines.push('----------  -------  -----  -----  ---------');

  for (const statName of CP_STAT_NAMES) {
    const baseStats = raceBaseStats[statName];
    if (!baseStats) continue;

    const min = baseStats.min;
    const max = baseStats.max;
    const spent = cpSpent[statName] || 0;

    // Get the actual value from character for display (handles stat name mapping)
    const columnName = STAT_TO_COLUMN[statName];
    const actualValue = getCharacterStat(character, columnName);

    const abbr = CP_STAT_ABBREVIATIONS[statName].padEnd(10);
    const currentStr = String(actualValue).padStart(7);
    const maxStr = String(max).padStart(5);
    const spentStr = String(spent).padStart(5);

    let nextCostStr: string;
    if (actualValue >= max) {
      nextCostStr = colors.yellow('MAX');
    } else {
      const nextCost = getCPCostForNextPoint(spent);
      nextCostStr = String(nextCost) + ' CP';
    }

    lines.push(`${abbr}  ${currentStr}  ${maxStr}  ${spentStr}  ${nextCostStr}`);
  }

  lines.push('');
  lines.push('Usage: train <stat> [amount]');
  lines.push('Example: train str 5');

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

/**
 * Helper to get a stat value from character by column name
 */
function getCharacterStat(character: characterRepo.DbCharacter, columnName: string): number {
  switch (columnName) {
    case 'strength': return character.strength;
    case 'dexterity': return character.dexterity;
    case 'constitution': return character.constitution;
    case 'intelligence': return character.intelligence;
    case 'wisdom': return character.wisdom;
    case 'charisma': return character.charisma;
    default: return 0;
  }
}
