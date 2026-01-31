// ============================================================================
// MASTERY EXCHANGE & PROGRESSION SYSTEM (MEPS)
// A data-driven class progression system with dual-track XP and Essence
// ============================================================================

// ============================================================================
// THEMATIC TAGS
// Tags are content-agnostic identifiers that connect events to classes
// ============================================================================

// Common thematic tags (content can define more)
export const THEMATIC_TAGS = [
  'melee',
  'ranged',
  'arcane',
  'holy',
  'unholy',
  'stealth',
  'subterfuge',
  'protection',
  'nature',
  'crafting',
  'social',
  'exploration',
] as const;

export type ThematicTag = (typeof THEMATIC_TAGS)[number] | string;

// ============================================================================
// CLASS DEFINITION SCHEMA
// Defines the "identity" of a class and how it interacts with the world
// ============================================================================

export interface ClassDefinition {
  class_id: string;
  display_name: string;
  description?: string;
  essence_multiplier: number;
  subscribed_tags: ThematicTag[];
  talent_tree_id?: string;
  resource_type?: string;
  playable?: boolean;
  combat_level?: number; // 1-5, defaults to 1. Higher = better melee combat
  magic_level?: number; // 0-3, magic power level
  magic_school?: string; // mage, priest, druid, bardic, kai
  stealth?: boolean; // Can use stealth abilities
  thievery?: boolean; // Can use thief skills (picklocks, traps)
  crit_bonus?: number; // Flat crit chance bonus (e.g., 10 for Ninja/Mystic)
  dodge_bonus?: number; // Flat dodge chance bonus (e.g., 25 for Ninja/Mystic)
  backstab_accuracy_bonus?: number; // Flat backstab accuracy bonus (e.g., for Thief/Ninja)
  special_abilities?: string[]; // Class-specific abilities
}

// ============================================================================
// PROGRESSION TABLE SCHEMA
// Global table defining base requirements per level
// ============================================================================

export interface LevelRequirement {
  level: number;
  std_xp_required: number;
  base_essence_required: number;
}

// ============================================================================
// GAME EVENT SCHEMA
// Maps world actions to thematic tags for XP and essence generation
// ============================================================================

export interface GameEvent {
  event_id: string;
  display_name?: string;
  emitted_tags: ThematicTag[];
  base_essence_value: number;
  base_xp_value?: number;
}

// ============================================================================
// TALENT SCHEMA
// Defines purchasable abilities/upgrades using essence
// ============================================================================

export interface TalentDefinition {
  talent_id: string;
  display_name: string;
  description?: string;
  class_restriction?: string;
  essence_cost: number;
  prerequisite_level?: number;
  prerequisite_talents?: string[];
  effect_modifiers?: Record<string, number>;
  grants_ability?: string;
}

// ============================================================================
// PLAYER PROGRESSION STATE
// Runtime state for a character's progression
// ============================================================================

export interface CharacterProgression {
  character_id: number;
  class_id: string;
  level: number;
  std_xp: number;
  essence_earned_this_level: number;
  essence_wallet: number;
  total_essence_earned: number;
  unlocked_talents: string[];
  learned_abilities: string[];
}

// ============================================================================
// ACTIVITY TRACKER
// Tracks event completions for diminishing returns
// ============================================================================

export interface ActivityCount {
  event_id: string;
  count: number;
}

export interface CharacterActivityTracker {
  character_id: number;
  activity_counts: ActivityCount[];
  last_reset_level: number;
  last_reset_region?: string;
}

// ============================================================================
// YIELD CURVE CONFIGURATION
// Defines diminishing returns thresholds
// ============================================================================

export interface YieldTier {
  min_count: number;
  max_count: number;
  yield_multiplier: number;
}

export const DEFAULT_YIELD_CURVE: YieldTier[] = [
  { min_count: 1, max_count: 20, yield_multiplier: 1.0 },
  { min_count: 21, max_count: 50, yield_multiplier: 0.5 },
  { min_count: 51, max_count: Infinity, yield_multiplier: 0.1 },
];

// ============================================================================
// ESSENCE AWARD RESULT
// Result of processing an essence event
// ============================================================================

export interface EssenceAwardResult {
  event_id: string;
  matched_tags: ThematicTag[];
  base_essence: number;
  yield_multiplier: number;
  final_essence: number;
  xp_awarded: number;
  activity_count: number;
}

// ============================================================================
// LEVEL CHECK RESULT
// Result of checking if a character can level up
// ============================================================================

export interface LevelCheckResult {
  can_level_up: boolean;
  current_level: number;
  next_level: number;
  std_xp_current: number;
  std_xp_required: number;
  std_xp_progress: number;
  essence_current: number;
  essence_required: number;
  essence_progress: number;
}

// ============================================================================
// RACE DEFINITION SCHEMA
// ============================================================================

import type { RaceBaseStats, RacialTrait } from './characterPoints.js';

export interface RaceDefinition {
  race_id: string;
  display_name: string;
  description?: string;
  // New format: base stats with min/max ranges for CP system
  base_stats?: RaceBaseStats;
  // Legacy format (deprecated): flat stat modifiers
  stat_modifiers?: Record<string, number>;
  // Racial traits/abilities
  traits?: RacialTrait[] | string[];
  allowed_classes?: string[];
  playable?: boolean;
  dodge_bonus?: number; // Racial dodge bonus (e.g., 10 for Halfling)
}

// ============================================================================
// ABILITY DEFINITION SCHEMA
// ============================================================================

export type AbilityType = 'skill' | 'spell' | 'technique' | 'passive';

export interface AbilityDefinition {
  ability_id: string;
  display_name: string;
  description?: string;
  ability_type: AbilityType;
  emitted_tags?: ThematicTag[];
  resource_cost?: number;
  resource_type?: string;
  cooldown?: number;
  effect_data?: Record<string, unknown>;
  requirements?: {
    level?: number;
    stats?: Record<string, number>;
    abilities?: string[];
  };
}

// ============================================================================
// CLASS ABILITY MAPPING
// ============================================================================

export interface ClassAbilityMapping {
  class_id: string;
  ability_id: string;
  required_level: number;
  auto_learn: boolean;
  training_cost?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate the yield multiplier based on activity count
 */
export function getYieldMultiplier(
  activityCount: number,
  yieldCurve: YieldTier[] = DEFAULT_YIELD_CURVE
): number {
  for (const tier of yieldCurve) {
    if (activityCount >= tier.min_count && activityCount <= tier.max_count) {
      return tier.yield_multiplier;
    }
  }
  return yieldCurve[yieldCurve.length - 1]?.yield_multiplier ?? 0.1;
}

/**
 * Calculate essence required for a level based on class multiplier
 */
export function getEssenceRequired(
  baseEssence: number,
  classMultiplier: number
): number {
  return Math.floor(baseEssence * classMultiplier);
}

/**
 * Check if tags match between an event and a class
 */
export function getMatchingTags(
  eventTags: ThematicTag[],
  classTags: ThematicTag[]
): ThematicTag[] {
  return eventTags.filter((tag) => classTags.includes(tag));
}
