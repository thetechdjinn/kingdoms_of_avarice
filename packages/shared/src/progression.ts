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
  crit_bonus?: number; // Flat crit chance bonus (e.g., 10 for Ninja/Mystic)
  dodge_bonus?: number; // Flat dodge chance bonus (e.g., 25 for Ninja/Mystic)
  traits?: string[]; // Class traits (stealth, lockpicking, traps, pickpocket, etc.)
  armor_type_restrictions?: string[]; // Allowed armor types (empty = all)
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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate essence required for a level based on class multiplier
 */
export function getEssenceRequired(
  baseEssence: number,
  classMultiplier: number
): number {
  return Math.floor(baseEssence * classMultiplier);
}
