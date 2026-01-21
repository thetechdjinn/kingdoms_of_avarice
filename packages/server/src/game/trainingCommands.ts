/**
 * Training Commands
 *
 * Handles the "train" command for allocating Character Points (CP) to stats.
 * Supports both text-based training and ANSI form-based training in training rooms.
 */

import { MessageType, CPStatName, CP_STAT_NAMES, CP_STAT_ABBREVIATIONS, getCPCostForNextPoint, getTotalCPCost, getMaxPointsAffordable, DEFAULT_STARTING_CP, TrainingFormPayload, TrainingSubmitPayload, getCpEarnedForLevel, formatCurrency } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { CommandResponse } from './commands.js';
import { colors } from '../utils/colors.js';
import { wordWrap } from '../utils/textFormat.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import * as roomRepo from '../db/repositories/roomRepository.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import { getPlayerLocation } from './adminCommands.js';
import { checkLevelUp, performLevelUp, getProgression } from './progression.js';
import { calculateTrainingCost } from '@koa/shared';

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
 *   train           - In training room: opens form. Outside: shows stats.
 *   train level     - In training room: shows level-up info.
 *   train <stat>    - Train one point in the specified stat (text mode).
 *   train <stat> <amount> - Train multiple points (text mode).
 */
export async function handleTrain(
  socket: AuthenticatedSocket,
  args: string
): Promise<CommandResponse | null> {
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
  if (!race || !race.base_stats) {
    return { type: MessageType.ERROR, message: 'Race data not found.' };
  }

  // Validate race base_stats structure
  const baseStats = race.base_stats as unknown as Record<string, unknown>;
  if (typeof baseStats.strength !== 'object' || baseStats.strength === null) {
    return { type: MessageType.ERROR, message: 'Race data uses legacy format. Please contact an administrator.' };
  }

  // Validate all stats have min/max
  const requiredStats: CPStatName[] = ['strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma'];
  for (const stat of requiredStats) {
    const statData = baseStats[stat] as { min?: number; max?: number } | undefined;
    if (!statData || typeof statData.min !== 'number' || typeof statData.max !== 'number') {
      return { type: MessageType.ERROR, message: `Race data missing valid ${stat} configuration.` };
    }
  }

  // Cast to the expected type after validation
  const raceBaseStats = baseStats as Record<string, { min: number; max: number }>;

  const cpSpent = character.cp_spent || {};
  const unspentCp = character.unspent_cp ?? DEFAULT_STARTING_CP;

  // Check if we're in a training room
  const currentRoomId = getPlayerLocation(socket.playerId);
  const inTrainingRoom = await roomRepo.isTrainingRoom(currentRoomId);

  // Parse arguments
  const parts = args.trim().toLowerCase().split(/\s+/);
  const statArg = parts[0];
  const amountArg = parts[1];

  // Handle "train level" command
  if (statArg === 'level') {
    // Check if in a training room first
    if (!inTrainingRoom) {
      return { type: MessageType.ERROR, message: 'You must be in a training room to level up.' };
    }

    // Check if character can train in this room for the target level
    const targetLevel = character.level + 1;
    const canTrainResult = await roomRepo.canTrainInRoom(
      currentRoomId,
      character.class,
      character.level,
      targetLevel
    );

    if (!canTrainResult.allowed) {
      return { type: MessageType.ERROR, message: canTrainResult.reason || 'You cannot train here.' };
    }

    // Check for "train level confirm"
    const isConfirm = amountArg === 'confirm';
    return await handleLevelUp(socket, character, isConfirm);
  }

  // No arguments - show form (if in training room) or status
  if (!statArg) {
    if (inTrainingRoom) {
      // Check if character can train in this room
      const canTrainResult = await roomRepo.canTrainInRoom(
        currentRoomId,
        character.class,
        character.level
      );

      if (!canTrainResult.allowed) {
        return { type: MessageType.ERROR, message: canTrainResult.reason || 'You cannot train here.' };
      }

      // Send training form to client
      const classData = await progressionRepo.getClassById(character.class);
      const formPayload = buildTrainingFormPayload(
        character,
        race.display_name,
        classData?.display_name || character.class,
        raceBaseStats,
        cpSpent,
        unspentCp
      );

      socket.send(JSON.stringify({
        type: MessageType.TRAINING_FORM,
        payload: JSON.stringify(formPayload),
      }));

      // Return null to indicate we handled this directly
      return null;
    }

    // Not in training room - show text-based status
    return showTrainingStatus(character, race.display_name, raceBaseStats, cpSpent, unspentCp);
  }

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

/**
 * Build the training form payload for the client
 */
function buildTrainingFormPayload(
  character: characterRepo.DbCharacter,
  raceDisplayName: string,
  classDisplayName: string,
  raceBaseStats: Record<string, { min: number; max: number }>,
  cpSpent: Record<string, number>,
  unspentCp: number,
  isNewCharacter: boolean = false
): TrainingFormPayload {
  const stats: TrainingFormPayload['stats'] = {};

  for (const statName of CP_STAT_NAMES) {
    const baseStats = raceBaseStats[statName];
    if (!baseStats) continue;

    const min = baseStats.min;
    const max = baseStats.max;
    const spent = cpSpent[statName] || 0;
    const current = min + spent;

    stats[statName] = {
      current,
      min,
      max,
      spent,
    };
  }

  return {
    characterName: character.name,
    familyName: character.last_name || undefined,
    race: raceDisplayName,
    class: classDisplayName,
    level: character.level,
    stats,
    unspentCp,
    appearance: {
      gender: character.gender || undefined,
      hairColour: character.hair || undefined,
      eyeColour: character.eye_color || undefined,
    },
    isNewCharacter,
  };
}

/**
 * Handle training form submission from the client
 */
export async function handleTrainingSubmit(
  socket: AuthenticatedSocket,
  payload: TrainingSubmitPayload
): Promise<CommandResponse | null> {
  // Validate payload structure
  if (!payload || typeof payload !== 'object') {
    return { type: MessageType.ERROR, message: 'Invalid training data.' };
  }

  // If cancelled, just acknowledge
  if (payload.cancelled) {
    return { type: MessageType.OUTPUT, message: 'Training cancelled.' };
  }

  // Validate payload has required fields
  if (!payload.stats || typeof payload.stats !== 'object' ||
      !payload.cpSpent || typeof payload.cpSpent !== 'object') {
    return { type: MessageType.ERROR, message: 'Invalid training data structure.' };
  }

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
  if (!race || !race.base_stats) {
    return { type: MessageType.ERROR, message: 'Race data not found.' };
  }

  const raceBaseStats = race.base_stats as unknown as Record<string, { min: number; max: number }>;
  const oldCpSpent = character.cp_spent || {};
  const oldUnspentCp = character.unspent_cp ?? DEFAULT_STARTING_CP;

  // Calculate total CP used by the new allocation
  let totalCpUsed = 0;
  const newCpSpent: Record<string, number> = {};
  const statUpdates: Record<string, number> = {};

  for (const statName of CP_STAT_NAMES) {
    const newSpent = payload.cpSpent[statName];
    const oldSpent = oldCpSpent[statName] ?? 0;
    const baseStats = raceBaseStats[statName];

    // Validate race has this stat defined
    if (!baseStats || typeof baseStats.min !== 'number' || typeof baseStats.max !== 'number') {
      return { type: MessageType.ERROR, message: `Invalid race stat configuration for ${statName}.` };
    }

    // Validate newSpent is a valid number
    if (typeof newSpent !== 'number' || !Number.isFinite(newSpent) || newSpent < 0) {
      // Default to old value if not provided or invalid
      newCpSpent[statName] = oldSpent;
      const columnName = STAT_TO_COLUMN[statName];
      statUpdates[columnName] = baseStats.min + oldSpent;
      continue;
    }

    // Calculate CP difference
    const spentDiff = newSpent - oldSpent;
    if (spentDiff > 0) {
      // Calculate cost for new points
      totalCpUsed += getTotalCPCost(oldSpent, spentDiff);
    } else if (spentDiff < 0) {
      // Refund for removed points
      for (let i = 0; i < Math.abs(spentDiff); i++) {
        totalCpUsed -= getCPCostForNextPoint(oldSpent - i - 1);
      }
    }

    // Validate new value is within bounds
    const newCurrent = baseStats.min + newSpent;
    if (newCurrent < baseStats.min || newCurrent > baseStats.max) {
      return { type: MessageType.ERROR, message: `${statName} value ${newCurrent} is outside allowed range (${baseStats.min}-${baseStats.max}).` };
    }

    newCpSpent[statName] = newSpent;

    // Map to DB column name
    const columnName = STAT_TO_COLUMN[statName];
    statUpdates[columnName] = newCurrent;
  }

  // Validate we have enough CP
  const newUnspentCp = oldUnspentCp - totalCpUsed;
  if (newUnspentCp < 0) {
    return { type: MessageType.ERROR, message: 'Not enough CP for these changes.' };
  }

  // Apply the changes
  await characterRepo.updateCharacterStats(characterId, {
    ...statUpdates,
    unspent_cp: newUnspentCp,
    cp_spent: newCpSpent,
  });

  // Build success message
  const changedStats: string[] = [];
  for (const statName of CP_STAT_NAMES) {
    const oldSpent = oldCpSpent[statName] ?? 0;
    const newSpent = newCpSpent[statName] ?? 0;
    if (oldSpent !== newSpent) {
      const baseStats = raceBaseStats[statName];
      if (baseStats) {
        const oldValue = baseStats.min + oldSpent;
        const newValue = baseStats.min + newSpent;
        const abbr = CP_STAT_ABBREVIATIONS[statName];
        changedStats.push(`${abbr}: ${oldValue} -> ${colors.green(String(newValue))}`);
      }
    }
  }

  if (changedStats.length === 0) {
    return { type: MessageType.OUTPUT, message: 'No changes made.' };
  }

  const message = [
    'Training complete!',
    changedStats.join(', '),
    `CP remaining: ${colors.green(String(newUnspentCp))}`,
  ].join('\r\n');

  return { type: MessageType.OUTPUT, message };
}

/**
 * Send the training form to a character (used for new character creation)
 */
export async function sendTrainingForm(
  socket: AuthenticatedSocket,
  isNewCharacter: boolean = false
): Promise<void> {
  const characterId = socket.characterId;
  if (!characterId) return;

  const character = await characterRepo.findCharacterById(characterId);
  if (!character) return;

  const race = await progressionRepo.getRaceById(character.race);
  if (!race || !race.base_stats) return;

  const raceBaseStats = race.base_stats as unknown as Record<string, { min: number; max: number }>;
  const cpSpent = character.cp_spent || {};
  const unspentCp = character.unspent_cp ?? DEFAULT_STARTING_CP;

  const classData = await progressionRepo.getClassById(character.class);
  const formPayload = buildTrainingFormPayload(
    character,
    race.display_name,
    classData?.display_name || character.class,
    raceBaseStats,
    cpSpent,
    unspentCp,
    isNewCharacter
  );

  socket.send(JSON.stringify({
    type: MessageType.TRAINING_FORM,
    payload: JSON.stringify(formPayload),
  }));
}

/**
 * Handle the "train level" command
 */
async function handleLevelUp(
  socket: AuthenticatedSocket,
  character: characterRepo.DbCharacter,
  isConfirm: boolean
): Promise<CommandResponse> {
  const characterId = socket.characterId;
  if (!characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  // Get training settings for cost calculation
  const trainingSettings = await settingsRepo.getTrainingSettings();
  const targetLevel = character.level + 1;
  const trainingCost = calculateTrainingCost(
    targetLevel,
    trainingSettings.training_base_cost,
    trainingSettings.training_cost_multiplier
  );

  // Check progression requirements (XP and essence)
  const levelCheck = checkLevelUp(characterId);

  // Build status message
  const lines: string[] = [];
  lines.push(colors.cyan(`=== Train to Level ${targetLevel} ===`));
  lines.push('');

  // XP status
  let xpReady = false;
  if (levelCheck) {
    const xpPct = Math.floor(levelCheck.std_xp_progress * 100);
    if (levelCheck.std_xp_current >= levelCheck.std_xp_required) {
      lines.push(`Experience: ${colors.green(`${levelCheck.std_xp_current}/${levelCheck.std_xp_required}`)} (Ready!)`);
      xpReady = true;
    } else {
      lines.push(`Experience: ${colors.yellow(`${levelCheck.std_xp_current}/${levelCheck.std_xp_required}`)} (${xpPct}%)`);
    }
  } else {
    lines.push(`Experience: ${colors.red('Unable to check requirements')}`);
  }

  // Essence status
  let essenceReady = false;
  if (levelCheck && levelCheck.essence_required !== Infinity) {
    const essencePct = Math.floor(levelCheck.essence_progress * 100);
    if (levelCheck.essence_current >= levelCheck.essence_required) {
      lines.push(`Essence: ${colors.green(`${levelCheck.essence_current}/${levelCheck.essence_required}`)} (Ready!)`);
      essenceReady = true;
    } else {
      lines.push(`Essence: ${colors.yellow(`${levelCheck.essence_current}/${levelCheck.essence_required}`)} (${essencePct}%)`);
    }
  } else if (levelCheck) {
    lines.push(`Essence: ${colors.red('Max level reached')}`);
  }

  // Currency cost (training costs are in copper)
  const currencyStr = formatCurrency(trainingCost);
  const characterCopper = character.copper || 0;
  let currencyReady = false;
  if (characterCopper >= trainingCost) {
    lines.push(`Training cost: ${colors.gold(currencyStr)} (You have enough)`);
    currencyReady = true;
  } else {
    lines.push(`Training cost: ${colors.gold(currencyStr)} (${colors.red('Not enough - you have ' + formatCurrency(characterCopper))})`);
  }

  // CP reward info
  const cpReward = getCpEarnedForLevel(targetLevel);
  lines.push('');
  lines.push(`Level up reward: ${colors.green(`${cpReward} CP`)} to allocate to stats`);

  // Check if all requirements are met
  const canLevelUp = xpReady && essenceReady && currencyReady && (levelCheck?.can_level_up ?? false);

  if (!canLevelUp) {
    lines.push('');
    lines.push(colors.yellow('You do not meet all requirements to level up.'));
    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  }

  // If not confirming, show the confirm prompt
  if (!isConfirm) {
    lines.push('');
    lines.push(`Type ${colors.cyan("'train level confirm'")} to proceed.`);
    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  }

  // Perform the level up
  try {
    // Deduct currency first (training costs are in copper)
    await characterRepo.updateCharacterStats(characterId, {
      copper: characterCopper - trainingCost,
    });

    // Perform the level up (this updates XP, essence, level, and CP)
    const result = await performLevelUp(characterId);

    if (!result.success) {
      // Refund currency if level up failed
      await characterRepo.updateCharacterStats(characterId, {
        copper: characterCopper,
      });
      return { type: MessageType.ERROR, message: 'Level up failed. Please try again.' };
    }

    // Update socket cache
    socket.characterLevel = result.newLevel;

    // Success message
    const successLines: string[] = [];
    successLines.push(colors.green(`You pay ${currencyStr} to the trainer.`));
    successLines.push(colors.green(`You have trained to level ${result.newLevel}!`));
    successLines.push(colors.green(`You gained ${result.cpEarned} CP to allocate to your stats.`));
    successLines.push('');
    successLines.push(`Type ${colors.cyan("'train'")} to allocate your stats.`);

    return { type: MessageType.OUTPUT, message: successLines.join('\r\n') };
  } catch (error) {
    console.error('Level up error:', error);
    return { type: MessageType.ERROR, message: 'An error occurred during training.' };
  }
}
