// ============================================================================
// MASTERY EXCHANGE & PROGRESSION SYSTEM (MEPS) - Server Implementation
// ============================================================================

import {
  ClassDefinition,
  LevelRequirement,
  GameEvent,
  CharacterProgression,
  CharacterActivityTracker,
  ActivityCount,
  YieldTier,
  DEFAULT_YIELD_CURVE,
  EssenceAwardResult,
  LevelCheckResult,
  ThematicTag,
  getYieldMultiplier,
  getEssenceRequired,
  getMatchingTags,
  getCpEarnedForLevel,
} from '@koa/shared';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';

// ============================================================================
// DATA STORES (In-memory for now, can be backed by DB/JSON files)
// ============================================================================

const classDefinitions: Map<string, ClassDefinition> = new Map();
const progressionTable: LevelRequirement[] = [];
const gameEvents: Map<string, GameEvent> = new Map();
const characterProgressions: Map<number, CharacterProgression> = new Map();
const activityTrackers: Map<number, CharacterActivityTracker> = new Map();

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

/**
 * Register a game event
 */
export function registerGameEvent(event: GameEvent): void {
  gameEvents.set(event.event_id, event);
}

/**
 * Get a game event by ID
 */
export function getGameEvent(eventId: string): GameEvent | undefined {
  return gameEvents.get(eventId);
}

/**
 * Get all registered game events
 */
export function getAllGameEvents(): GameEvent[] {
  return Array.from(gameEvents.values());
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
    unlocked_talents: [],
    learned_abilities: [],
  };
  characterProgressions.set(characterId, progression);

  // Initialize activity tracker
  const tracker: CharacterActivityTracker = {
    character_id: characterId,
    activity_counts: [],
    last_reset_level: startingLevel,
  };
  activityTrackers.set(characterId, tracker);

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
 */
export async function loadCharacterProgression(characterId: number, classId: string): Promise<CharacterProgression | null> {
  // Try to load from database
  const dbProgression = await progressionRepo.getCharacterProgression(characterId);

  if (dbProgression) {
    // Store in memory
    characterProgressions.set(characterId, dbProgression);

    // Initialize activity tracker (not persisted, reset each session)
    const tracker: CharacterActivityTracker = {
      character_id: characterId,
      activity_counts: [],
      last_reset_level: dbProgression.level,
    };
    activityTrackers.set(characterId, tracker);

    return dbProgression;
  }

  // No progression in DB - create a new one
  const newProgression = await progressionRepo.createCharacterProgression(characterId, classId);
  if (newProgression) {
    characterProgressions.set(characterId, newProgression);

    const tracker: CharacterActivityTracker = {
      character_id: characterId,
      activity_counts: [],
      last_reset_level: newProgression.level,
    };
    activityTrackers.set(characterId, tracker);
  }

  return newProgression;
}

/**
 * Unload a character's progression from memory (when they disconnect)
 */
export function unloadCharacterProgression(characterId: number): void {
  characterProgressions.delete(characterId);
  activityTrackers.delete(characterId);
}

/**
 * Get activity tracker for a character
 */
export function getActivityTracker(characterId: number): CharacterActivityTracker | undefined {
  return activityTrackers.get(characterId);
}

// ============================================================================
// EVENT PROCESSING
// ============================================================================

/**
 * Process a game event for a character, awarding XP and essence
 * XP is always awarded; essence is awarded only if class tags match event tags
 */
export function processGameEvent(
  characterId: number,
  eventId: string,
  yieldCurve: YieldTier[] = DEFAULT_YIELD_CURVE
): EssenceAwardResult | null {
  const progression = characterProgressions.get(characterId);
  if (!progression) {
    return null;
  }

  const classDef = classDefinitions.get(progression.class_id);
  if (!classDef) {
    return null;
  }

  const event = gameEvents.get(eventId);
  if (!event) {
    return null;
  }

  // Check if class subscribes to any of the event's tags
  const matchedTags = getMatchingTags(event.emitted_tags, classDef.subscribed_tags);
  
  // Get or create activity tracker
  let tracker = activityTrackers.get(characterId);
  if (!tracker) {
    tracker = {
      character_id: characterId,
      activity_counts: [],
      last_reset_level: progression.level,
    };
    activityTrackers.set(characterId, tracker);
  }

  // Find or create activity count for this event
  let activityCount = tracker.activity_counts.find((ac) => ac.event_id === eventId);
  if (!activityCount) {
    activityCount = { event_id: eventId, count: 0 };
    tracker.activity_counts.push(activityCount);
  }

  // Increment activity count
  activityCount.count++;

  // Calculate yield multiplier based on diminishing returns
  const yieldMultiplier = getYieldMultiplier(activityCount.count, yieldCurve);

  // Calculate essence award
  // If no tags match, character still gets base XP but no essence
  let essenceAwarded = 0;
  if (matchedTags.length > 0) {
    essenceAwarded = Math.floor(event.base_essence_value * yieldMultiplier);
  }

  // Calculate XP award (always awarded regardless of tag match)
  const xpAwarded = event.base_xp_value ?? 0;

  // Apply awards
  progression.std_xp += xpAwarded;
  progression.essence_earned_this_level += essenceAwarded;
  progression.essence_wallet += essenceAwarded;
  progression.total_essence_earned += essenceAwarded;

  return {
    event_id: eventId,
    matched_tags: matchedTags,
    base_essence: event.base_essence_value,
    yield_multiplier: yieldMultiplier,
    final_essence: essenceAwarded,
    xp_awarded: xpAwarded,
    activity_count: activityCount.count,
  };
}

// ============================================================================
// FLAT ESSENCE AWARD (NPC kills, quest rewards, etc.)
// ============================================================================

/**
 * Award a flat amount of essence to a character's wallet.
 * Unlike processGameEvent() which uses tag matching + diminishing returns,
 * this is a direct, unconditional award (e.g., from NPC kills).
 *
 * Updates in-memory state and persists to DB.
 * Returns false if progression not loaded or amount <= 0.
 */
export async function awardEssence(characterId: number, amount: number): Promise<boolean> {
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return false;

  const progression = characterProgressions.get(characterId);
  if (!progression) return false;

  // Persist to DB first with atomic increment to avoid race conditions
  try {
    const result = await progressionRepo.incrementEssenceWallet(characterId, amount);
    if (!result) {
      console.error(`[Progression] No progression row found in DB for character ${characterId}`);
      return false;
    }

    // Sync in-memory from the authoritative DB result
    progression.essence_wallet = result.essence_wallet;
    progression.total_essence_earned = result.total_essence_earned;
  } catch (error) {
    console.error(`[Progression] Failed to persist essence award for character ${characterId}:`, error);
    return false;
  }

  return true;
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
 * Level up result containing the new level and CP earned
 */
export interface LevelUpResult {
  success: boolean;
  newLevel: number;
  cpEarned: number;
}

/**
 * Perform level up for a character
 * Awards CP based on the new level and persists to database
 */
export async function performLevelUp(characterId: number): Promise<LevelUpResult> {
  const checkResult = checkLevelUp(characterId);
  if (!checkResult || !checkResult.can_level_up) {
    return { success: false, newLevel: 0, cpEarned: 0 };
  }

  const progression = characterProgressions.get(characterId);
  if (!progression) {
    return { success: false, newLevel: 0, cpEarned: 0 };
  }

  // Calculate new values before modifying state
  const newLevel = progression.level + 1;
  const cpEarned = getCpEarnedForLevel(newLevel);
  const newStdXp = progression.std_xp - checkResult.std_xp_required;

  // Persist level and CP to database FIRST
  try {
    const character = await characterRepo.findCharacterById(characterId);
    if (!character) {
      console.error(`[Progression] Character ${characterId} not found for level-up persistence`);
      return { success: false, newLevel: 0, cpEarned: 0 };
    }

    const newUnspentCp = (character.unspent_cp ?? 0) + cpEarned;

    // Persist level and CP to characters table
    await characterRepo.updateCharacterStats(characterId, {
      level: newLevel,
      unspent_cp: newUnspentCp,
    });

    // Persist XP and essence reset to character_progression table
    await progressionRepo.updateCharacterProgression(characterId, {
      std_xp: newStdXp,
      essence_earned_this_level: 0,
    });
  } catch (error) {
    console.error(`[Progression] Failed to persist level-up for character ${characterId}:`, error);
    return { success: false, newLevel: 0, cpEarned: 0 };
  }

  // Invalidate the DB-level progression cache immediately after DB success,
  // before updating in-memory state, to prevent concurrent reads from
  // returning stale cached data during the in-memory update window.
  progressionRepo.invalidateProgressionCache(characterId);

  // Database succeeded, now update in-memory state
  progression.std_xp = newStdXp;
  progression.essence_earned_this_level = 0;
  progression.level = newLevel;

  // Reset activity tracker for diminishing returns
  const tracker = activityTrackers.get(characterId);
  if (tracker) {
    tracker.activity_counts = [];
    tracker.last_reset_level = newLevel;
  }

  return { success: true, newLevel, cpEarned };
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
// REGION RESET
// ============================================================================

/**
 * Reset activity tracker when entering a new region
 */
export function resetActivityForRegion(characterId: number, regionId: string): void {
  const tracker = activityTrackers.get(characterId);
  if (tracker) {
    tracker.activity_counts = [];
    tracker.last_reset_region = regionId;
  }
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

  // Reset activity tracker (consistent with performLevelUp)
  const tracker = activityTrackers.get(characterId);
  if (tracker) {
    tracker.activity_counts = [];
    tracker.last_reset_level = progression.level;
  }

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
  tracker: CharacterActivityTracker | undefined;
  classDef: ClassDefinition | undefined;
  levelCheck: LevelCheckResult | null;
} {
  const progression = characterProgressions.get(characterId);
  const tracker = activityTrackers.get(characterId);
  const classDef = progression ? classDefinitions.get(progression.class_id) : undefined;
  const levelCheck = checkLevelUp(characterId);

  return { progression, tracker, classDef, levelCheck };
}

/**
 * Clear all progression data (for testing)
 */
export function clearAllProgressionData(): void {
  classDefinitions.clear();
  progressionTable.length = 0;
  gameEvents.clear();
  characterProgressions.clear();
  activityTrackers.clear();
}
