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
  hp_adj?: number; // Flat HP adjustment at character creation (Warrior +4, Mage +0)
  hp_per_level_min?: number; // Min HP gained per level (Warrior 6, Mage 3)
  hp_per_level_max?: number; // Max HP gained per level (Warrior 10, Mage 6)
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
  base_hp?: number; // Race base HP at creation (Human 26, Half-Ogre 37)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ============================================================================
// SPELLCASTING
// ============================================================================

/** Base SP values by magic level (at base stat, level 1) */
const BASE_SP_BY_MAGIC_LEVEL: Record<number, number> = { 1: 33, 2: 38, 3: 43 };

/** SP gained per character level */
export const SP_PER_LEVEL = 2;

/** SP per stat point for single-stat classes (mage/INT, priest/WIS, bardic/CHA, kai/WIS) */
const SP_PER_STAT_POINT = 0.5;

/** SP per combined stat point for dual-stat classes (druid: INT+WIS) */
const SP_PER_DUAL_STAT_POINT = 0.35;

/**
 * Calculate a character's spellcasting (SP) value.
 * SP = baseSP + statBonus + (level - 1) * 2 + equipmentBonus
 */
export function calculateSpellcasting(
  magicLevel: number,
  magicSchool: string | undefined,
  stats: { intelligence: number; wisdom: number; charisma: number },
  raceBaseStats: { intelligence?: number; wisdom?: number; charisma?: number },
  characterLevel: number,
  equipmentSpellcastingBonus?: number,
): number {
  const baseSp = BASE_SP_BY_MAGIC_LEVEL[magicLevel];
  if (baseSp === undefined) return 0; // magic_level 0 = no spellcasting

  // Stat bonus depends on magic school
  let statBonus: number;
  if (magicSchool === 'druid') {
    // Druid: both INT and WIS contribute at 0.35/point each
    const intGain = stats.intelligence - (raceBaseStats.intelligence ?? 40);
    const wisGain = stats.wisdom - (raceBaseStats.wisdom ?? 40);
    statBonus = Math.floor((intGain + wisGain) * SP_PER_DUAL_STAT_POINT);
  } else {
    // Single-stat: 0.5/point above race base
    let primaryStat: number;
    let baseStat: number;
    switch (magicSchool) {
      case 'priest':
      case 'kai':
        primaryStat = stats.wisdom;
        baseStat = raceBaseStats.wisdom ?? 40;
        break;
      case 'bardic':
        primaryStat = stats.charisma;
        baseStat = raceBaseStats.charisma ?? 40;
        break;
      default: // mage and fallback
        primaryStat = stats.intelligence;
        baseStat = raceBaseStats.intelligence ?? 40;
        break;
    }
    statBonus = Math.floor((primaryStat - baseStat) * SP_PER_STAT_POINT);
  }

  const levelBonus = (characterLevel - 1) * SP_PER_LEVEL;
  return baseSp + statBonus + levelBonus + (equipmentSpellcastingBonus ?? 0);
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

/**
 * CON breakpoint bonus for HP calculations.
 * Absolute CON thresholds: 70 → +1, 85 → +2, 100 → +3 (cumulative).
 */
export function getConBreakpointBonus(constitution: number): number {
  if (constitution >= 100) return 3;
  if (constitution >= 85) return 2;
  if (constitution >= 70) return 1;
  return 0;
}

/**
 * Extract the hp_per_level racial trait value from a race's traits array.
 * Half-Ogre: +1, Halfling: -1, all others: 0.
 */
export function getRaceHpPerLevelBonus(traits?: RacialTrait[] | string[]): number {
  if (!traits || !Array.isArray(traits)) return 0;
  for (const trait of traits) {
    if (typeof trait === 'object' && trait.id === 'hp_per_level' && typeof trait.value === 'number') {
      return trait.value;
    }
  }
  return 0;
}

/**
 * Calculate starting HP for a new character.
 * Formula: race_base_hp + class_hp_adj + floor((CON - race_base_CON) × 0.5) + CON_breakpoints
 */
export function calculateStartingHp(
  raceBaseHp: number,
  raceBaseCon: number,
  classHpAdj: number,
  constitution: number,
): number {
  const conBonus = Math.floor((constitution - raceBaseCon) * 0.5);
  const breakpointBonus = getConBreakpointBonus(constitution);
  return raceBaseHp + classHpAdj + conBonus + breakpointBonus;
}

/**
 * Roll HP gained on level-up.
 * Formula: random(min..max) + CON_breakpoint_bonus + race_hp_level_bonus
 */
export function rollLevelUpHp(
  hpMin: number,
  hpMax: number,
  constitution: number,
  raceHpLevelBonus: number,
): number {
  const baseRoll = Math.floor(Math.random() * (hpMax - hpMin + 1)) + hpMin;
  const breakpointBonus = getConBreakpointBonus(constitution);
  return baseRoll + breakpointBonus + raceHpLevelBonus;
}
