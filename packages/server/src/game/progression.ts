// ============================================================================
// MASTERY EXCHANGE & PROGRESSION SYSTEM (MEPS) - Server Implementation
// ============================================================================

import {
  ClassDefinition,
  LevelRequirement,
  CharacterProgression,
  LevelCheckResult,
  getEssenceRequired,
  getCpEarnedForLevel,
  rollLevelUpHp,
  getRaceHpPerLevelBonus,
} from '@koa/shared';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { getXpOvercapPercent } from '../db/repositories/settingsRepository.js';

// ============================================================================
// DATA STORES (In-memory for now, can be backed by DB/JSON files)
// ============================================================================

const classDefinitions: Map<string, ClassDefinition> = new Map();
const progressionTable: LevelRequirement[] = [];
const characterProgressions: Map<number, CharacterProgression> = new Map();

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Register a class definition
 */
export function registerClass(classDef: ClassDefinition): void {
  classDefinitions.set(classDef.class_id, classDef);
}

/**
 * Get a class definition by ID
 */
export function getClassDefinition(classId: string): ClassDefinition | undefined {
  return classDefinitions.get(classId);
}

/**
 * Get all registered classes
 */
export function getAllClasses(): ClassDefinition[] {
  return Array.from(classDefinitions.values());
}

/**
 * Set the global progression table
 */
export function setProgressionTable(table: LevelRequirement[]): void {
  progressionTable.length = 0;
  progressionTable.push(...table.sort((a, b) => a.level - b.level));
}

/**
 * Get level requirements for a specific level
 */
export function getLevelRequirements(level: number): LevelRequirement | undefined {
  return progressionTable.find((req) => req.level === level);
}

// ============================================================================
// CHARACTER PROGRESSION MANAGEMENT
// ============================================================================

/**
 * Initialize progression for a character
 */
export function initializeProgression(
  characterId: number,
  classId: string,
  startingLevel: number = 1
): CharacterProgression {
  const progression: CharacterProgression = {
    character_id: characterId,
    class_id: classId,
    level: startingLevel,
    std_xp: 0,
    essence_earned_this_level: 0,
    essence_wallet: 0,
    total_essence_earned: 0,
  };
  characterProgressions.set(characterId, progression);

  return progression;
}

/**
 * Get progression for a character
 */
export function getProgression(characterId: number): CharacterProgression | undefined {
  return characterProgressions.get(characterId);
}

/**
 * Load a character's progression from the database into the in-memory map.
 * Call this when a character enters the game.
 *
 * @param characterLevel - The character's actual trained level from the characters table.
 *   This overrides the SQL-calculated level (which auto-advances based on XP alone)
 *   because leveling requires explicit training.
 */
export async function loadCharacterProgression(characterId: number, classId: string, characterLevel?: number): Promise<CharacterProgression | null> {
  // Try to load from database
  const dbProgression = await progressionRepo.getCharacterProgression(characterId);

  if (dbProgression) {
    // Use the character table's level as authoritative (training required to level)
    // rather than the SQL-calculated level (which advances on XP alone)
    if (characterLevel !== undefined) {
      dbProgression.level = characterLevel;
    }

    // Store in memory
    characterProgressions.set(characterId, dbProgression);

    return dbProgression;
  }

  // No progression in DB - create a new one
  const newProgression = await progressionRepo.createCharacterProgression(characterId, classId);
  if (newProgression) {
    if (characterLevel !== undefined) {
      newProgression.level = characterLevel;
    }
    characterProgressions.set(characterId, newProgression);
  }

  return newProgression;
}

/**
 * Unload a character's progression from memory (when they disconnect)
 */
export function unloadCharacterProgression(characterId: number): void {
  characterProgressions.delete(characterId);
}

// ============================================================================
// FLAT ESSENCE AWARD (NPC kills, quest rewards, etc.)
// ============================================================================

/**
 * Award a flat amount of XP or essence to a character.
 * This is a direct, unconditional award (e.g., from NPC kills).
 *
 * Updates in-memory state and persists to DB.
 * Returns false if progression not loaded or amount <= 0.
 */
async function awardProgression(
  characterId: number,
  amount: number,
  persistFn: (id: number, amt: number) => Promise<CharacterProgression | null>,
  syncFn: (progression: CharacterProgression, result: CharacterProgression) => void,
  label: string
): Promise<boolean> {
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return false;

  const progression = characterProgressions.get(characterId);
  if (!progression) return false;

  try {
    const result = await persistFn(characterId, amount);
    if (!result) {
      console.error(`[Progression] No progression row found in DB for character ${characterId}`);
      return false;
    }

    // Sync in-memory from the authoritative DB result
    syncFn(progression, result);
  } catch (error) {
    console.error(`[Progression] Failed to persist ${label} for character ${characterId}:`, error);
    return false;
  }

  return true;
}

export async function awardXp(characterId: number, amount: number): Promise<number> {
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return 0;

  const progression = characterProgressions.get(characterId);
  if (!progression) return 0;

  // Cap XP so it doesn't exceed next level's requirement by more than the overcap setting
  const nextLevelReqs = getLevelRequirements(progression.level + 1);
  if (nextLevelReqs) {
    const overcapPercent = await getXpOvercapPercent();
    const maxXp = Math.floor(nextLevelReqs.std_xp_required * (1 + overcapPercent / 100));
    const headroom = maxXp - progression.std_xp;
    if (headroom <= 0) return 0; // Already at or over cap
    amount = Math.min(amount, headroom);
  }

  const success = await awardProgression(
    characterId, amount,
    progressionRepo.incrementStdXp,
    (prog, result) => { prog.std_xp = result.std_xp; },
    'XP award'
  );
  return success ? amount : 0;
}

export async function awardEssence(characterId: number, amount: number): Promise<number> {
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return 0;

  const progression = characterProgressions.get(characterId);
  if (!progression) return 0;

  // Cap essence at the cumulative threshold for the next level
  const classDef = classDefinitions.get(progression.class_id);
  const nextLevelReqs = getLevelRequirements(progression.level + 1);
  if (classDef && nextLevelReqs) {
    const essenceCap = getEssenceRequired(nextLevelReqs.base_essence_required, classDef.essence_multiplier);
    const headroom = essenceCap - progression.essence_earned_this_level;
    if (headroom <= 0) return 0; // Already at cap
    amount = Math.min(amount, headroom);
  }

  const success = await awardProgression(
    characterId, amount,
    progressionRepo.incrementEssenceWallet,
    (prog, result) => { prog.essence_wallet = result.essence_wallet; prog.essence_earned_this_level = result.essence_earned_this_level; prog.total_essence_earned = result.total_essence_earned; },
    'essence award'
  );
  return success ? amount : 0;
}

// ============================================================================
// LEVEL CHECK
// ============================================================================

/**
 * Check if a character can level up
 */
export function checkLevelUp(characterId: number): LevelCheckResult | null {
  const progression = characterProgressions.get(characterId);
  if (!progression) {
    return null;
  }

  const classDef = classDefinitions.get(progression.class_id);
  if (!classDef) {
    return null;
  }

  const nextLevel = progression.level + 1;
  const requirements = getLevelRequirements(nextLevel);
  
  if (!requirements) {
    // Max level reached or no requirements defined
    return {
      can_level_up: false,
      current_level: progression.level,
      next_level: nextLevel,
      std_xp_current: progression.std_xp,
      std_xp_required: Infinity,
      std_xp_progress: 1.0,
      essence_current: progression.essence_earned_this_level,
      essence_required: Infinity,
      essence_progress: 1.0,
    };
  }

  // Apply class multiplier to essence requirement
  const essenceRequired = getEssenceRequired(
    requirements.base_essence_required,
    classDef.essence_multiplier
  );

  const xpProgress = Math.min(1.0, progression.std_xp / requirements.std_xp_required);
  const essenceProgress = Math.min(1.0, progression.essence_earned_this_level / essenceRequired);

  const canLevelUp =
    progression.std_xp >= requirements.std_xp_required &&
    progression.essence_earned_this_level >= essenceRequired;

  return {
    can_level_up: canLevelUp,
    current_level: progression.level,
    next_level: nextLevel,
    std_xp_current: progression.std_xp,
    std_xp_required: requirements.std_xp_required,
    std_xp_progress: xpProgress,
    essence_current: progression.essence_earned_this_level,
    essence_required: essenceRequired,
    essence_progress: essenceProgress,
  };
}

/**
 * Level up result containing the new level, CP earned, and HP/mana gains
 */
export interface LevelUpResult {
  success: boolean;
  newLevel: number;
  cpEarned: number;
  hpGained: number;
  manaGained: number;
  newMaxHealth: number;
  newMaxMana: number;
  resourceType: string;
}

/**
 * Perform level up for a character
 * Awards CP based on the new level and persists to database
 */
const FAILED_LEVEL_UP: LevelUpResult = Object.freeze({ success: false, newLevel: 0, cpEarned: 0, hpGained: 0, manaGained: 0, newMaxHealth: 0, newMaxMana: 0, resourceType: 'none' });

export async function performLevelUp(characterId: number): Promise<LevelUpResult> {
  const checkResult = checkLevelUp(characterId);
  if (!checkResult || !checkResult.can_level_up) {
    return FAILED_LEVEL_UP;
  }

  const progression = characterProgressions.get(characterId);
  if (!progression) {
    return FAILED_LEVEL_UP;
  }

  // Calculate new values before modifying state
  const newLevel = progression.level + 1;
  const cpEarned = getCpEarnedForLevel(newLevel);

  // Persist level and CP to database FIRST
  try {
    const character = await characterRepo.findCharacterById(characterId);
    if (!character) {
      console.error(`[Progression] Character ${characterId} not found for level-up persistence`);
      return FAILED_LEVEL_UP;
    }

    // Fetch class and race for HP/mana calculation
    const classDef = classDefinitions.get(progression.class_id);
    const raceDef = await progressionRepo.getRaceById(character.race);

    // Roll HP gain
    const hpMin = classDef?.hp_per_level_min ?? 4;
    const hpMax = classDef?.hp_per_level_max ?? 7;
    const raceHpBonus = getRaceHpPerLevelBonus(raceDef?.traits as Array<{ id: string; value: number | boolean }>);
    const hpGained = rollLevelUpHp(hpMin, hpMax, character.constitution, raceHpBonus);

    // Mana gain: flat per level based on magic level
    const magicLevel = classDef?.magic_level ?? 0;
    const resourceType = classDef?.resource_type;
    let manaGained = 0;
    if (resourceType === 'kai') {
      manaGained = 1; // Mystic: +1 kai per level
    } else if (magicLevel > 0) {
      manaGained = magicLevel * 2; // lv1=+2, lv2=+4, lv3=+6
    }

    const newMaxHealth = character.max_health + hpGained;
    const newHealth = Math.min(character.health + hpGained, newMaxHealth);
    const newMaxMana = character.max_mana + manaGained;
    const newMana = Math.min(character.mana + manaGained, newMaxMana);
    const newUnspentCp = (character.unspent_cp ?? 0) + cpEarned;

    // Persist level, CP, and HP/mana to characters table
    await characterRepo.updateCharacterStats(characterId, {
      level: newLevel,
      unspent_cp: newUnspentCp,
      max_health: newMaxHealth,
      health: newHealth,
      max_mana: newMaxMana,
      mana: newMana,
    });

    // Invalidate the DB-level progression cache immediately after DB success
    progressionRepo.invalidateProgressionCache(characterId);

    // Database succeeded, now update in-memory state (XP and essence stay cumulative)
    progression.level = newLevel;

    return { success: true, newLevel, cpEarned, hpGained, manaGained, newMaxHealth, newMaxMana, resourceType: resourceType ?? 'none' };
  } catch (error) {
    console.error(`[Progression] Failed to persist level-up for character ${characterId}:`, error);
    return FAILED_LEVEL_UP;
  }
}

// ============================================================================
// ESSENCE SPENDING (Talent System)
// ============================================================================

/**
 * Spend essence from wallet (does NOT affect level progress)
 */
export function spendEssence(characterId: number, amount: number): boolean {
  // Validate amount is a positive finite number
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    return false;
  }

  const progression = characterProgressions.get(characterId);
  if (!progression) {
    return false;
  }

  if (progression.essence_wallet < amount) {
    return false;
  }

  progression.essence_wallet -= amount;
  return true;
}

// ============================================================================
// CLASS SWITCHING
// ============================================================================

/**
 * Switch a character's active class
 * Archives current essence progress, keeps XP
 */
export function switchClass(
  characterId: number,
  newClassId: string
): CharacterProgression | null {
  const progression = characterProgressions.get(characterId);
  if (!progression) {
    return null;
  }

  const newClass = classDefinitions.get(newClassId);
  if (!newClass) {
    return null;
  }

  // Archive current essence progress (could be stored in DB for class switching back)
  // For now, we just reset essence tracking for the new class
  progression.class_id = newClassId;
  progression.essence_earned_this_level = 0;
  progression.essence_wallet = 0;
  // Note: std_xp and level are preserved

  return progression;
}

// ============================================================================
// DEBUG / ADMIN UTILITIES
// ============================================================================

/**
 * Get full progression state for debugging
 */
export function getProgressionDebugInfo(characterId: number): {
  progression: CharacterProgression | undefined;
  classDef: ClassDefinition | undefined;
  levelCheck: LevelCheckResult | null;
} {
  const progression = characterProgressions.get(characterId);
  const classDef = progression ? classDefinitions.get(progression.class_id) : undefined;
  const levelCheck = checkLevelUp(characterId);

  return { progression, classDef, levelCheck };
}

/**
 * Clear all progression data (for testing)
 */
export function clearAllProgressionData(): void {
  classDefinitions.clear();
  progressionTable.length = 0;
  characterProgressions.clear();
}
