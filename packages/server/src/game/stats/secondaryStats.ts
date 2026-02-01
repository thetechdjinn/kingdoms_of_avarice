/**
 * Secondary Stats Module
 *
 * Calculates derived stats (Stealth, Perception) from character attributes,
 * race/class traits, equipment, and encumbrance.
 *
 * Based on MajorMUD mechanics - see notes/Stealth_Implementation_Plan.md
 */

import { RaceDefinition, ClassDefinition, RacialTrait, ItemInstance } from '@koa/shared';
import * as progressionRepo from '../../db/repositories/progressionRepository.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CharacterStats {
  dexterity: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  level: number;
  race: string;
  class: string;
}

export interface StealthBreakdown {
  base: number;           // Racial + class stealth bonuses
  dexterityBonus: number; // +2.5 per 10 dex
  intellectBonus: number; // +1 per 10 int
  charismaBonus: number;  // +2.5 per 10 cha
  thresholdBonus: number; // +1 per threshold (60, 75, 90) for each stat
  levelBonus: number;     // +1 per level
  equipmentModifier: number; // Sum of equipment stealth modifiers
  encumbrancePenalty: number; // -10 for medium, -25 for heavy
  total: number;
}

export interface PerceptionBreakdown {
  intellectBonus: number; // +6 per 10 int
  wisdomBonus: number;    // +2 per 10 wis
  charismaBonus: number;  // +1 per 10 cha
  equipmentModifier: number; // Sum of equipment perception modifiers
  total: number;
}

export interface LockpickingBreakdown {
  base: number;             // +1 for race trait, +1 for class ability
  levelBonus: number;       // +1 per level
  dexterityBonus: number;   // +2.5 per 10 dex
  intellectBonus: number;   // +1 per 10 int
  itemBonus: number;        // From lockpick quality
  total: number;
}

/** Stats required for lockpicking calculation (subset of CharacterStats) */
export interface LockpickingStats {
  dexterity: number;
  intelligence: number;
  level: number;
  race: string;
  class: string;
}

/** Placeholder for lockpick item bonus - lockpick quality items to be added later */
export const NO_LOCKPICK_BONUS = 0;

// ============================================================================
// STEALTH CALCULATION
// ============================================================================

/**
 * Check if a race has the stealth trait
 */
function raceHasStealth(race: RaceDefinition): boolean {
  if (!race.traits) return false;

  for (const trait of race.traits) {
    if (typeof trait === 'string') {
      if (trait === 'stealth') return true;
    } else {
      const t = trait as RacialTrait;
      if (t.id === 'stealth' && t.value === true) return true;
    }
  }
  return false;
}

/**
 * Check if a class has stealth capability
 */
function classHasStealth(classDef: ClassDefinition): boolean {
  return classDef.stealth === true;
}

/**
 * Calculate stat threshold bonuses for stealth
 * Each stat (Dex, Int, Cha) gives +1 at 60, +1 at 75, +1 at 90
 * Maximum possible: +9 (3 stats × 3 thresholds)
 */
function calculateThresholdBonus(dex: number, int: number, cha: number): number {
  const thresholds = [60, 75, 90];
  let bonus = 0;

  for (const stat of [dex, int, cha]) {
    for (const threshold of thresholds) {
      if (stat >= threshold) bonus += 1;
    }
  }

  return bonus;
}

/**
 * Calculate encumbrance penalty for stealth
 * None (0-17%): 0
 * Light (18-33%): 0
 * Medium (34-67%): -10
 * Heavy (68%+): -25
 */
export function getEncumbrancePenalty(encumbranceRatio: number): number {
  if (encumbranceRatio >= 0.68) return -25;
  if (encumbranceRatio >= 0.34) return -10;
  return 0;
}

/**
 * Calculate total stealth value for a character
 *
 * Formula:
 * - Base: +1 for racial stealth, +1 for class stealth
 * - Dexterity: +2.5 per 10 points
 * - Intellect: +1 per 10 points
 * - Charisma: +2.5 per 10 points
 * - Thresholds: +1 per stat reaching 60, 75, 90
 * - Level: +1 per level
 * - Equipment: sum of stealth modifiers
 * - Encumbrance: -10 for medium, -25 for heavy
 */
export async function calculateStealth(
  stats: CharacterStats,
  equipmentStealthModifier: number = 0,
  encumbranceRatio: number = 0
): Promise<StealthBreakdown> {
  // Fetch race and class definitions
  const [race, classDef] = await Promise.all([
    progressionRepo.getRaceById(stats.race),
    progressionRepo.getClassById(stats.class),
  ]);

  // Calculate base stealth from race/class
  let base = 0;
  if (race && raceHasStealth(race)) base += 1;
  if (classDef && classHasStealth(classDef)) base += 1;

  // Calculate stat bonuses
  const dexterityBonus = Math.floor(stats.dexterity / 10) * 2.5;
  const intellectBonus = Math.floor(stats.intelligence / 10);
  const charismaBonus = Math.floor(stats.charisma / 10) * 2.5;

  // Calculate threshold bonuses
  const thresholdBonus = calculateThresholdBonus(
    stats.dexterity,
    stats.intelligence,
    stats.charisma
  );

  // Level bonus
  const levelBonus = stats.level;

  // Encumbrance penalty
  const encumbrancePenalty = getEncumbrancePenalty(encumbranceRatio);

  // Calculate total
  const total = Math.floor(
    base +
    dexterityBonus +
    intellectBonus +
    charismaBonus +
    thresholdBonus +
    levelBonus +
    equipmentStealthModifier +
    encumbrancePenalty
  );

  return {
    base,
    dexterityBonus,
    intellectBonus,
    charismaBonus,
    thresholdBonus,
    levelBonus,
    equipmentModifier: equipmentStealthModifier,
    encumbrancePenalty,
    total: Math.max(0, total), // Stealth cannot go negative
  };
}

/**
 * Check if a character has stealth capability (from race or class)
 */
export async function characterHasStealth(race: string, characterClass: string): Promise<boolean> {
  const capability = await getStealthCapability(race, characterClass);
  return capability.hasStealth;
}

/**
 * Get detailed stealth capability info for a character
 */
export async function getStealthCapability(race: string, characterClass: string): Promise<{
  hasStealth: boolean;
  hasRacialStealth: boolean;
  hasClassStealth: boolean;
}> {
  const [raceDef, classDef] = await Promise.all([
    progressionRepo.getRaceById(race),
    progressionRepo.getClassById(characterClass),
  ]);

  const hasRacialStealth = raceDef ? raceHasStealth(raceDef) : false;
  const hasClassStealth = classDef ? classHasStealth(classDef) : false;

  return {
    hasStealth: hasRacialStealth || hasClassStealth,
    hasRacialStealth,
    hasClassStealth,
  };
}

// ============================================================================
// PERCEPTION CALCULATION
// ============================================================================

/**
 * Calculate total perception value for a character
 *
 * Formula (per 10 points of each stat):
 * - Intellect: +6 per 10 points
 * - Wisdom: +2 per 10 points
 * - Charisma: +1 per 10 points
 * - Equipment: sum of perception modifiers
 */
export function calculatePerception(
  intelligence: number,
  wisdom: number,
  charisma: number,
  equipmentPerceptionModifier: number = 0
): PerceptionBreakdown {
  // Calculate stat bonuses (per 10 points)
  const intellectBonus = Math.floor(intelligence / 10) * 6;
  const wisdomBonus = Math.floor(wisdom / 10) * 2;
  const charismaBonus = Math.floor(charisma / 10) * 1;

  // Calculate total
  const total = intellectBonus + wisdomBonus + charismaBonus + equipmentPerceptionModifier;

  return {
    intellectBonus,
    wisdomBonus,
    charismaBonus,
    equipmentModifier: equipmentPerceptionModifier,
    total: Math.max(0, total), // Perception cannot go negative
  };
}

// ============================================================================
// SEE HIDDEN TRAIT
// ============================================================================

/**
 * Check if a race has the "see hidden" trait (like Gaunt One)
 */
export async function raceCanSeeHidden(race: string): Promise<boolean> {
  const raceDef = await progressionRepo.getRaceById(race);
  if (!raceDef?.traits) return false;

  for (const trait of raceDef.traits) {
    if (typeof trait === 'string') {
      if (trait === 'see_hidden') return true;
    } else {
      const t = trait as RacialTrait;
      if (t.id === 'see_hidden' && t.value === true) return true;
    }
  }
  return false;
}

// ============================================================================
// LOCKPICKING CALCULATION
// ============================================================================

/**
 * Check if a race has the lockpicking trait (e.g., Gnome with 'picklocks')
 */
function raceHasLockpicking(race: RaceDefinition): boolean {
  if (!race.traits) return false;

  for (const trait of race.traits) {
    if (typeof trait === 'string') {
      if (trait === 'picklocks' || trait === 'lockpicking') return true;
    } else {
      const t = trait as RacialTrait;
      if ((t.id === 'picklocks' || t.id === 'lockpicking') && t.value === true) return true;
    }
  }
  return false;
}

/**
 * Check if a class has lockpicking capability via 'lockpicking' in special_abilities
 */
function classHasLockpicking(classDef: ClassDefinition): boolean {
  return classDef.special_abilities?.includes('lockpicking') ?? false;
}

/**
 * Check if a character has lockpicking capability (from race or class)
 */
export async function characterHasLockpicking(race: string, characterClass: string): Promise<boolean> {
  const capability = await getLockpickingCapability(race, characterClass);
  return capability.hasLockpicking;
}

/**
 * Get detailed lockpicking capability info for a character
 */
export async function getLockpickingCapability(race: string, characterClass: string): Promise<{
  hasLockpicking: boolean;
  hasRacialLockpicking: boolean;
  hasClassLockpicking: boolean;
}> {
  const [raceDef, classDef] = await Promise.all([
    progressionRepo.getRaceById(race),
    progressionRepo.getClassById(characterClass),
  ]);

  const hasRacialLockpicking = raceDef ? raceHasLockpicking(raceDef) : false;
  const hasClassLockpicking = classDef ? classHasLockpicking(classDef) : false;

  return {
    hasLockpicking: hasRacialLockpicking || hasClassLockpicking,
    hasRacialLockpicking,
    hasClassLockpicking,
  };
}

/**
 * Calculate total lockpicking skill for a character
 *
 * Formula:
 * - Base: +1 for racial lockpicking, +1 for class lockpicking
 * - Level: +1 per level
 * - Dexterity: +2.5 per 10 points (stepped, not linear)
 * - Intellect: +1 per 10 points (stepped, not linear)
 * - Item bonus: from lockpick quality (0-5)
 */
export async function calculateLockpicking(
  stats: LockpickingStats,
  itemBonus: number = 0
): Promise<LockpickingBreakdown> {
  // Fetch race and class definitions
  const [race, classDef] = await Promise.all([
    progressionRepo.getRaceById(stats.race),
    progressionRepo.getClassById(stats.class),
  ]);

  // Calculate base from race/class
  let base = 0;
  if (race && raceHasLockpicking(race)) base += 1;
  if (classDef && classHasLockpicking(classDef)) base += 1;

  // Level bonus: +1 per level
  const levelBonus = stats.level;

  // Stat bonuses
  const dexterityBonus = Math.floor(stats.dexterity / 10) * 2.5;
  const intellectBonus = Math.floor(stats.intelligence / 10);

  // Calculate total
  const total = Math.floor(
    base +
    levelBonus +
    dexterityBonus +
    intellectBonus +
    itemBonus
  );

  return {
    base,
    levelBonus,
    dexterityBonus,
    intellectBonus,
    itemBonus,
    total: Math.max(0, total), // Lockpicking cannot go negative
  };
}

// ============================================================================
// EQUIPMENT AGGREGATION
// ============================================================================

export interface BackstabDamageBonuses {
  minBonus: number;
  maxBonus: number;
}

/**
 * Calculate total stealth modifier from equipped items
 * Sums stealth_modifier from all equipped item templates
 */
export function getEquipmentStealthModifier(equippedItems: ItemInstance[]): number {
  return equippedItems.reduce((total, item) => {
    const modifier = item.template?.stealth_modifier ?? 0;
    return total + modifier;
  }, 0);
}

/**
 * Calculate total backstab damage bonuses from equipped weapon
 * Only the main-hand weapon contributes to backstab damage bonuses
 */
export function getBackstabDamageBonuses(equippedItems: ItemInstance[]): BackstabDamageBonuses {
  // Find main-hand weapon
  const mainHandWeapon = equippedItems.find(
    item => item.equipped_slot === 'main_hand' && item.template?.weapon_data
  );

  if (!mainHandWeapon?.template?.weapon_data) {
    return { minBonus: 0, maxBonus: 0 };
  }

  const weaponData = mainHandWeapon.template.weapon_data;
  return {
    minBonus: weaponData.backstab_min_damage_bonus ?? 0,
    maxBonus: weaponData.backstab_max_damage_bonus ?? 0,
  };
}
