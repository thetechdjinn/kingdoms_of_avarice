/**
 * Training Commands
 *
 * Handles the "train" command for leveling up and allocating stats.
 * - train       : Level up character (if all requirements met)
 * - train stats : Open ANSI form to allocate CP to stats
 */

import { MessageType, CPStatName, CP_STAT_NAMES, getCPCostForNextPoint, getTotalCPCost, DEFAULT_STARTING_CP, TrainingFormPayload, TrainingSubmitPayload, formatCurrency, HairStyle, HairColor, EyeColor, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, Gender } from '@koa/shared';
import { AuthenticatedSocket, broadcastToAll } from './socket.js';
import { CommandResponse } from './commands.js';
import { colors } from '../utils/colors.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import * as roomRepo from '../db/repositories/roomRepository.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import { getPlayerLocation } from './adminCommands.js';
import { checkLevelUp, performLevelUp } from './progression.js';
import { calculateTrainingCost } from '@koa/shared';

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
 *   train       - Level up (if all requirements met)
 *   train stats - Open ANSI form to allocate CP to stats
 */
export async function handleTrain(
  socket: AuthenticatedSocket,
  args: string
): Promise<CommandResponse | null> {
  const characterId = socket.characterId;
  if (!characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  // Check if we're in a training room
  const currentRoomId = getPlayerLocation(socket.playerId);
  const inTrainingRoom = await roomRepo.isTrainingRoom(currentRoomId);

  if (!inTrainingRoom) {
    return { type: MessageType.ERROR, message: 'You must be in a training room to train.' };
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

  // Parse argument
  const arg = args.trim().toLowerCase();

  // Handle "train stats" - open ANSI form for stat allocation
  if (arg === 'stats') {
    // Any training room works for stats - no class/level check
    const classData = await progressionRepo.getClassById(character.class);
    const formPayload = buildTrainingFormPayload(
      character,
      race.display_name,
      classData?.display_name || character.class,
      raceBaseStats,
      cpSpent,
      unspentCp
    );

    // Remove player from game world while training
    socket.isTraining = true;
    broadcastToAll(`${socket.username} left the realm.`, socket.playerId);

    try {
      socket.send(JSON.stringify({
        type: MessageType.TRAINING_FORM,
        payload: JSON.stringify(formPayload),
      }));
    } catch (error) {
      // Restore player to game world if send fails
      socket.isTraining = false;
      broadcastToAll(`${socket.username} entered the realm.`, socket.playerId);
      return { type: MessageType.ERROR, message: 'Failed to open training form.' };
    }

    // Return null to indicate we handled this directly
    return null;
  }

  // Handle "train" (no args) - level up directly
  if (arg === '') {
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

    // Perform immediate level up if all requirements are met
    return await handleImmediateLevelUp(socket, character);
  }

  // Unknown argument
  return {
    type: MessageType.ERROR,
    message: 'What would you like to train?',
  };
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

  // Parse hair field (stored as "style color", e.g., "short black")
  let hairStyle: HairStyle | undefined;
  let hairColor: HairColor | undefined;
  if (character.hair) {
    const hairParts = character.hair.split(' ');
    if (hairParts.length >= 2) {
      const style = hairParts[0] as HairStyle;
      const color = hairParts.slice(1).join(' ') as HairColor;
      if (HAIR_STYLES.includes(style)) hairStyle = style;
      if (HAIR_COLORS.includes(color)) hairColor = color;
    } else if (hairParts.length === 1) {
      // Single word - could be style or color
      const word = hairParts[0];
      if (HAIR_STYLES.includes(word as HairStyle)) hairStyle = word as HairStyle;
      else if (HAIR_COLORS.includes(word as HairColor)) hairColor = word as HairColor;
    }
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
      gender: character.gender as Gender | undefined,
      hairStyle,
      hairColor,
      eyeColor: character.eye_color as EyeColor | undefined,
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
  // Helper to restore player to game world
  const exitTraining = () => {
    if (socket.isTraining) {
      socket.isTraining = false;
      broadcastToAll(`${socket.username} entered the realm.`, socket.playerId);
    }
  };

  // Validate payload structure
  if (!payload || typeof payload !== 'object') {
    exitTraining();
    return { type: MessageType.ERROR, message: 'Invalid training data.' };
  }

  // If cancelled, restore to world and acknowledge
  if (payload.cancelled) {
    exitTraining();
    return { type: MessageType.OUTPUT, message: 'Training cancelled.' };
  }

  // Validate payload has required fields
  if (!payload.stats || typeof payload.stats !== 'object' ||
      !payload.cpSpent || typeof payload.cpSpent !== 'object') {
    exitTraining();
    return { type: MessageType.ERROR, message: 'Invalid training data structure.' };
  }

  const characterId = socket.characterId;
  if (!characterId) {
    exitTraining();
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  // Get character and race data
  const character = await characterRepo.findCharacterById(characterId);
  if (!character) {
    exitTraining();
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  const race = await progressionRepo.getRaceById(character.race);
  if (!race || !race.base_stats) {
    exitTraining();
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
      exitTraining();
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
      exitTraining();
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
    exitTraining();
    return { type: MessageType.ERROR, message: 'Not enough CP for these changes.' };
  }

  // Build appearance update object
  const appearanceUpdates: Record<string, string | null> = {};

  // Handle family name update with validation
  if (payload.familyName !== undefined) {
    const trimmedName = (payload.familyName || '').trim();
    if (trimmedName.length > 20) {
      exitTraining();
      return { type: MessageType.ERROR, message: 'Family name too long (max 20 characters).' };
    }
    // Allow only letters, hyphens, apostrophes, and spaces
    if (trimmedName && !/^[a-zA-Z'\s-]+$/.test(trimmedName)) {
      exitTraining();
      return { type: MessageType.ERROR, message: 'Family name contains invalid characters.' };
    }
    appearanceUpdates.last_name = trimmedName || null;
  }

  // Handle appearance updates (hair stored as "style color", e.g., "short black")
  if (payload.appearance) {
    const { hairStyle, hairColor, eyeColor } = payload.appearance;

    // Validate and combine hair fields
    if (hairStyle || hairColor) {
      const validStyle = hairStyle && HAIR_STYLES.includes(hairStyle) ? hairStyle : 'none';
      const validColor = hairColor && HAIR_COLORS.includes(hairColor) ? hairColor : 'black';
      appearanceUpdates.hair = `${validStyle} ${validColor}`;
    }

    // Validate and set eye color
    if (eyeColor) {
      if (EYE_COLORS.includes(eyeColor)) {
        appearanceUpdates.eye_color = eyeColor;
      }
    }
  }

  // Apply the changes to DB before restoring player to game world
  try {
    await characterRepo.updateCharacterStats(characterId, {
      ...statUpdates,
      ...appearanceUpdates,
      unspent_cp: newUnspentCp,
      cp_spent: newCpSpent,
    });
  } catch (error) {
    console.error('[Training] Failed to save stat changes:', error);
    exitTraining();
    return { type: MessageType.ERROR, message: 'Failed to save training changes. Please try again.' };
  }

  // DB update succeeded — restore player to game world
  exitTraining();

  // Silently complete - client refreshes the room display
  return { type: MessageType.OUTPUT, message: '' };
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

  // Remove player from game world while training
  socket.isTraining = true;
  broadcastToAll(`${socket.username} left the realm.`, socket.playerId);

  try {
    socket.send(JSON.stringify({
      type: MessageType.TRAINING_FORM,
      payload: JSON.stringify(formPayload),
    }));
  } catch (error) {
    // Restore player to game world if send fails
    socket.isTraining = false;
    broadcastToAll(`${socket.username} entered the realm.`, socket.playerId);
  }
}

/**
 * Handle immediate level up - performs level up if all requirements are met,
 * otherwise shows what's missing
 */
async function handleImmediateLevelUp(
  socket: AuthenticatedSocket,
  character: characterRepo.DbCharacter
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

  // Check each requirement
  const missing: string[] = [];
  let xpReady = false;
  let essenceReady = false;

  if (levelCheck) {
    if (levelCheck.std_xp_current >= levelCheck.std_xp_required) {
      xpReady = true;
    } else {
      const xpPct = Math.floor(levelCheck.std_xp_progress * 100);
      missing.push(`Experience: ${levelCheck.std_xp_current}/${levelCheck.std_xp_required} (${xpPct}%)`);
    }

    if (levelCheck.essence_required !== Infinity) {
      if (levelCheck.essence_current >= levelCheck.essence_required) {
        essenceReady = true;
      } else {
        const essencePct = Math.floor(levelCheck.essence_progress * 100);
        missing.push(`Essence: ${levelCheck.essence_current}/${levelCheck.essence_required} (${essencePct}%)`);
      }
    } else {
      // Max level reached
      return { type: MessageType.ERROR, message: 'You have reached the maximum level.' };
    }
  } else {
    return { type: MessageType.ERROR, message: 'Unable to check level requirements.' };
  }

  // Currency check
  const currencyStr = formatCurrency(trainingCost);
  const characterCopper = character.copper || 0;
  let currencyReady = false;
  if (characterCopper >= trainingCost) {
    currencyReady = true;
  } else {
    missing.push(`Currency: need ${currencyStr}, have ${formatCurrency(characterCopper)}`);
  }

  // Check if all requirements are met
  const canLevelUp = xpReady && essenceReady && currencyReady && (levelCheck?.can_level_up ?? false);

  if (!canLevelUp) {
    const lines: string[] = [];
    lines.push(colors.yellow(`Cannot train to level ${targetLevel}. Missing requirements:`));
    for (const item of missing) {
      lines.push(`  - ${item}`);
    }
    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  }

  // All requirements met - perform the level up immediately
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
    successLines.push(`Type ${colors.cyan("'train stats'")} to allocate your stats.`);

    return { type: MessageType.OUTPUT, message: successLines.join('\r\n') };
  } catch (error) {
    console.error('Level up error:', error);
    return { type: MessageType.ERROR, message: 'An error occurred during training.' };
  }
}
