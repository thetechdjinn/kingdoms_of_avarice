/**
 * Combat Calculations Module
 *
 * Implements the core combat mechanics:
 * - Energy per round calculation
 * - Number of attacks (swings) per round
 * - Hit/miss determination
 * - Damage calculation
 *
 * NOTE: Combat settings are loaded from the database (game_settings table).
 * Functions accept an optional config parameter; if not provided, they use
 * fallback defaults from @koa/shared.
 */

import {
  EnergyFactors,
  AccuracyFactors,
  DefenseFactors,
  CriticalHitFactors,
  DodgeFactors,
  AttackResult,
  SwingResult,
  COMBAT_LEVEL_ENERGY_MULTIPLIER,
  COMBAT_LEVEL_ACCURACY_BONUS,
  ENCUMBRANCE_BASELINE,
  DEFAULT_WEAPON_SPEED,
  DEFAULT_COMBAT_CONFIG,
  ENCUMBRANCE_CRIT_THRESHOLDS,
  CRIT_SOFT_CAP,
  CRIT_DAMAGE_MULTIPLIER,
  DODGE_SOFT_CAP,
  DODGE_STAT_CONTRIBUTION,
  DODGE_MIN_ATTACKER_ACCURACY,
} from '@koa/shared';
import { CombatSettings } from '../db/repositories/settingsRepository.js';

/**
 * Runtime combat configuration (loaded from database)
 */
export interface RuntimeCombatConfig {
  baseEnergy: number;
  maxAttacksPerRound: number;
  defaultWeaponSpeed: number;
  levelMultipliers: Record<string, number>;
  levelAccuracyBonus: Record<string, number>;
}

/**
 * Convert CombatSettings from DB to RuntimeCombatConfig
 */
export function toRuntimeConfig(settings: CombatSettings): RuntimeCombatConfig {
  return {
    baseEnergy: settings.base_energy,
    maxAttacksPerRound: settings.max_attacks_per_round,
    defaultWeaponSpeed: settings.default_weapon_speed,
    levelMultipliers: settings.level_multipliers,
    levelAccuracyBonus: settings.level_accuracy_bonus,
  };
}

/**
 * Default runtime config (fallback when DB not available)
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeCombatConfig = {
  baseEnergy: DEFAULT_COMBAT_CONFIG.baseEnergyPerRound,
  maxAttacksPerRound: DEFAULT_COMBAT_CONFIG.maxAttacksPerRound,
  defaultWeaponSpeed: DEFAULT_WEAPON_SPEED,
  levelMultipliers: Object.fromEntries(
    Object.entries(COMBAT_LEVEL_ENERGY_MULTIPLIER).map(([k, v]) => [k, v])
  ),
  levelAccuracyBonus: Object.fromEntries(
    Object.entries(COMBAT_LEVEL_ACCURACY_BONUS).map(([k, v]) => [k, v])
  ),
};

/**
 * Calculate energy available per combat round (MajorMUD-style additive formula)
 *
 * Energy determines how many attacks a character can make.
 * This uses an additive formula reverse-engineered from MajorMUD:
 *
 *   Base Energy = (CombatLevel * 2 + 3) * 100 + (CharLevel * 10) + ((Agility - 50) * 2)
 *   Encumbrance Modifier: ±50% based on deviation from 50% baseline
 *   Final Energy = Base Energy * Encumbrance Modifier
 *
 * @param factors - Character stats affecting energy
 * @param config - Optional runtime config (uses defaults if not provided)
 */
export function calculateRoundEnergy(
  factors: EnergyFactors,
  config: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG
): number {
  // MajorMUD-style additive formula:
  // Combat level is the primary factor: (CL * 2 + 3) * 500
  // This gives: Combat 1 = 2500, Combat 2 = 3500, Combat 3 = 4500, Combat 4 = 5500, Combat 5 = 6500
  // Ratio of Combat 5 to Combat 1 = 2.6x (matches MajorMUD research)
  const combatContribution = (factors.combatLevel * 2 + 3) * 500;

  // Character level adds +10 energy per level
  const levelContribution = factors.characterLevel * 10;

  // Agility (DEX) adds +2 energy per point above 50
  const agilityContribution = Math.max(0, (factors.dexterity - 50)) * 2;

  // Base energy before encumbrance
  const baseEnergy = combatContribution + levelContribution + agilityContribution;

  // Encumbrance modifier (MajorMUD-style):
  // At 50% encumbrance = 1.0x (baseline)
  // At 0% encumbrance = 1.5x (+50% bonus)
  // At 100% encumbrance = 0.5x (-50% penalty)
  const encumbrancePercent = factors.encumbranceRatio * 100;
  let encumbranceModifier: number;
  if (encumbrancePercent < 50) {
    encumbranceModifier = 1.0 + ((50 - encumbrancePercent) / 100);
  } else {
    encumbranceModifier = 1.0 - ((encumbrancePercent - 50) / 100);
  }

  // Floor at 50% to prevent extremely low energy
  encumbranceModifier = Math.max(0.5, encumbranceModifier);

  const totalEnergy = baseEnergy * encumbranceModifier;

  return Math.floor(totalEnergy);
}

/**
 * Calculate number of attacks (swings) for a combat round
 *
 * @param availableEnergy - Total energy available (round energy + carried energy)
 * @param weaponSpeed - Energy cost per swing (lower = faster)
 * @param config - Optional runtime config (uses defaults if not provided)
 * @returns Object with swings count and remaining energy
 */
export function calculateSwings(
  availableEnergy: number,
  weaponSpeed?: number,
  config: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG
): { swings: number; remainingEnergy: number; bonusCritChance: number } {
  const speed = Math.max(1, weaponSpeed ?? config.defaultWeaponSpeed); // Prevent division by zero
  const maxAttacks = config.maxAttacksPerRound;

  // Calculate raw number of swings
  let swings = Math.floor(availableEnergy / speed);
  const remainingEnergy = availableEnergy - (swings * speed);

  // Calculate bonus crit chance if we would exceed max attacks
  let bonusCritChance = 0;
  if (swings > maxAttacks) {
    // Each excess attack converts to +1% crit chance
    bonusCritChance = (swings - maxAttacks) * 1;
    swings = maxAttacks;
  }

  return { swings, remainingEnergy, bonusCritChance };
}

/**
 * Calculate total accuracy rating
 *
 * Accuracy is compared against defense to determine hit chance.
 *
 * @param factors - Character stats affecting accuracy
 * @param config - Optional runtime config (uses defaults if not provided)
 */
export function calculateAccuracy(
  factors: AccuracyFactors,
  config: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG
): number {
  // Base from combat level
  const combatBonus = config.levelAccuracyBonus[String(factors.combatLevel)] ?? 0;

  // Character level contribution (2 per level)
  const levelBonus = factors.characterLevel * 2;

  // Stat contributions
  // Dexterity: +1 accuracy per 10 points
  const dexBonus = Math.floor(factors.dexterity / 10);
  // Intelligence: +0.5 accuracy per 10 points
  const intBonus = Math.floor(factors.intelligence / 20);
  // Charisma: +1.2 accuracy per 10 points
  const chaBonus = Math.floor(factors.charisma / 10 * 1.2);

  // Equipment and spell bonuses
  const equipBonus = factors.equipmentBonus;
  const spellBonus = factors.spellModifier;

  // Penalties
  const encPenalty = factors.encumbrancePenalty;
  const blindPenalty = factors.isBlind ? 10 : 0;

  const total = combatBonus
    + levelBonus
    + dexBonus
    + intBonus
    + chaBonus
    + equipBonus
    + spellBonus
    - encPenalty
    - blindPenalty;

  return Math.max(1, total); // Minimum 1 to prevent division issues
}

/**
 * Calculate total defense rating
 *
 * Defense is compared against accuracy to determine miss chance.
 */
export function calculateDefense(factors: DefenseFactors): number {
  // Base armor class
  const ac = factors.armorClass;

  // Secondary defenses add 1:1
  const perception = factors.perception;

  // Shadow provides flat +10
  const shadow = factors.shadow > 0 ? 10 : 0;

  // Equipment and spell bonuses
  const equipBonus = factors.equipmentBonus;
  const spellBonus = factors.spellModifier;

  const total = ac + perception + shadow + equipBonus + spellBonus;

  return Math.max(1, total); // Minimum 1
}

/**
 * Calculate encumbrance-based crit bonus (MajorMUD-style)
 *
 * Light armor users get significant crit bonuses as a trade-off for less protection.
 *
 * @param encumbranceRatio - Current encumbrance as ratio (0.0-1.0)
 * @returns Crit bonus percentage (0, 10, or 20)
 */
export function calculateEncumbranceCritBonus(encumbranceRatio: number): number {
  if (encumbranceRatio <= ENCUMBRANCE_CRIT_THRESHOLDS.LIGHT.maxRatio) {
    return ENCUMBRANCE_CRIT_THRESHOLDS.LIGHT.bonus;  // +20% for very light
  }
  if (encumbranceRatio <= ENCUMBRANCE_CRIT_THRESHOLDS.MEDIUM.maxRatio) {
    return ENCUMBRANCE_CRIT_THRESHOLDS.MEDIUM.bonus; // +10% for medium
  }
  return ENCUMBRANCE_CRIT_THRESHOLDS.HEAVY.bonus;    // +0% for heavy
}

/**
 * Calculate critical hit chance (MajorMUD-style)
 *
 * Base formula: (Level/10) + ((INT-50)/10) + ((DEX-50)/25)
 * Plus: class bonus, encumbrance bonus, weapon/equipment modifiers
 *
 * Applies soft cap at 40% with diminishing returns above:
 *   if (crit > 40) crit = 40 + ((crit - 40) / 3)
 *
 * @param factors - All factors affecting crit chance
 * @returns Final crit chance percentage (typically 0-50)
 */
export function calculateCritChance(factors: CriticalHitFactors): number {
  // Base from character level (+1% per 10 levels)
  const levelBonus = Math.floor(factors.characterLevel / 10);

  // Intelligence bonus (+1% per 10 INT above 50) - primary stat for crits
  const intBonus = Math.max(0, Math.floor((factors.intelligence - 50) / 10));

  // Dexterity bonus (+1% per 25 DEX above 50) - secondary stat for crits
  const dexBonus = Math.max(0, Math.floor((factors.dexterity - 50) / 25));

  // Class bonus (e.g., Ninja/Mystic get +10%)
  const classBonus = factors.classCritBonus;

  // Weapon crit modifier
  const weaponBonus = factors.weaponCritModifier;

  // Other equipment bonuses
  const equipBonus = factors.equipmentCritBonus;

  // Encumbrance bonus (light armor = more crits)
  const encBonus = calculateEncumbranceCritBonus(factors.encumbranceRatio);

  // Sum all bonuses
  let totalCrit = levelBonus + intBonus + dexBonus + classBonus + weaponBonus + equipBonus + encBonus;

  // Apply MajorMUD-style soft cap with diminishing returns
  // Above 40%, excess crit is divided by 3
  if (totalCrit > CRIT_SOFT_CAP) {
    const excessCrit = totalCrit - CRIT_SOFT_CAP;
    totalCrit = CRIT_SOFT_CAP + Math.floor(excessCrit / 3);
  }

  // Clamp to reasonable bounds (0-60% effective max due to diminishing returns)
  return Math.max(0, Math.min(60, totalCrit));
}

// ============================================================================
// DODGE CALCULATIONS (MajorMUD-style)
// ============================================================================

/**
 * Calculate dodge chance using MajorMUD-style formula
 *
 * Dodge is a class skill - only classes with dodge_bonus > 0 can dodge.
 * The formula is:
 *   baseDodge = classDodgeBonus + raceDodgeBonus + equipmentDodgeBonus
 *   statDodge = floor(agility / 10) * 2 + floor(charm / 10) * 1
 *   totalDodge = baseDodge + statDodge
 *
 * Then apply soft cap at 52% with diminishing returns.
 * Finally factor in attacker accuracy to get effective dodge.
 *
 * @param factors - DodgeFactors containing all dodge-related values
 * @returns Effective dodge chance (0-90, capped by diminishing returns)
 */
export function calculateDodgeChance(factors: DodgeFactors): number {
  // If no class or race dodge bonus and no equipment bonus, can't dodge at all
  const baseDodge = factors.classDodgeBonus + factors.raceDodgeBonus + factors.equipmentDodgeBonus;
  if (baseDodge <= 0) {
    return 0;
  }

  // Stat contributions: +2% per 10 AGI, +1% per 10 CHA
  const agiBonus = Math.floor(factors.agility / 10) * DODGE_STAT_CONTRIBUTION.agilityPer10;
  const chaBonus = Math.floor(factors.charm / 10) * DODGE_STAT_CONTRIBUTION.charmPer10;

  // Total pre-cap dodge
  let totalDodge = baseDodge + agiBonus + chaBonus;

  // Apply soft cap at 52% with harsh diminishing returns
  // Above 52%, gains are severely reduced
  if (totalDodge > DODGE_SOFT_CAP) {
    const excessDodge = totalDodge - DODGE_SOFT_CAP;
    // MajorMUD-style: very harsh diminishing returns above cap
    // Testing showed 52% -> 85-90% max even with massive investment
    totalDodge = DODGE_SOFT_CAP + Math.floor(excessDodge / 4);
  }

  // Factor in attacker accuracy (MajorMUD-style)
  // If attacker accuracy is very low, dodge doesn't work
  // Otherwise: effectiveDodge = (totalDodge * 10) / attackerAccuracy
  if (factors.attackerAccuracy <= DODGE_MIN_ATTACKER_ACCURACY) {
    return 0;
  }

  // Scale dodge based on attacker accuracy
  // Higher accuracy monsters reduce dodge effectiveness
  const effectiveDodge = Math.floor((totalDodge * 10) / factors.attackerAccuracy);

  // Clamp to reasonable bounds (max ~90% as per MajorMUD testing)
  return Math.max(0, Math.min(90, effectiveDodge));
}

/**
 * Check if a defender can dodge (has any source of dodge ability)
 *
 * @param classDodgeBonus - Class dodge bonus
 * @param raceDodgeBonus - Race dodge bonus
 * @param equipmentDodgeBonus - Equipment dodge bonus
 * @returns True if the defender has any dodge capability
 */
export function canDodge(
  classDodgeBonus: number,
  raceDodgeBonus: number,
  equipmentDodgeBonus: number
): boolean {
  return (classDodgeBonus + raceDodgeBonus + equipmentDodgeBonus) > 0;
}

/**
 * Calculate miss chance using the squared ratio formula
 *
 * Formula: D^2 / (A^2 + D^2) = miss chance (as decimal)
 * This creates a squared relationship where large disparities are impactful:
 * - Equal A and D: 50% miss
 * - A = 2D: 20% miss
 * - A = 3D: 10% miss
 * - D = 2A: 80% miss
 *
 * @param accuracy - Attacker's total accuracy
 * @param defense - Defender's total defense
 * @returns Miss chance as a value between 0 and 1
 */
export function calculateMissChance(accuracy: number, defense: number): number {
  const acc = Math.max(1, accuracy);
  const def = Math.max(1, defense);

  // Formula: D^2 / (A^2 + D^2)
  const accSq = acc * acc;
  const defSq = def * def;
  const missChance = defSq / (accSq + defSq);

  // Clamp between 5% and 95% (always some chance to hit or miss)
  return Math.min(0.95, Math.max(0.05, missChance));
}

/**
 * Determine if an attack hits, misses, is dodged, or is a critical
 *
 * MajorMUD combat sequence:
 * 1. Roll dodge FIRST (if defender has dodge ability)
 * 2. If dodge succeeds, attack is completely avoided
 * 3. If dodge fails, roll accuracy vs defense
 * 4. If hit, check for critical
 *
 * @param accuracy - Attacker's accuracy
 * @param defense - Defender's defense
 * @param critChance - Critical hit chance (0-100)
 * @param dodgeChance - Defender's effective dodge chance (0-100), 0 if no dodge ability
 * @returns AttackResult enum value
 */
export function resolveAttack(
  accuracy: number,
  defense: number,
  critChance: number,
  dodgeChance: number = 0
): AttackResult {
  // MajorMUD-style: Check dodge FIRST before accuracy
  // Dodge is a complete avoidance - no damage, no further checks
  if (dodgeChance > 0) {
    const dodgeRoll = Math.random() * 100;
    if (dodgeRoll < dodgeChance) {
      return AttackResult.DODGE;
    }
  }

  // Dodge failed (or defender can't dodge) - check accuracy vs defense
  const missChance = calculateMissChance(accuracy, defense);
  const roll = Math.random();

  if (roll < missChance) {
    return AttackResult.MISS;
  }

  // Attack hits - check for critical
  const critRoll = Math.random() * 100;
  if (critRoll < critChance) {
    return AttackResult.CRITICAL;
  }

  return AttackResult.HIT;
}

/**
 * Calculate damage for a single hit (MajorMUD-style)
 *
 * Normal hits: Roll damage between min and max
 * Critical hits: Use MAX damage × random(2.0-4.0) multiplier
 *
 * This makes crits significantly more impactful - they always use the weapon's
 * maximum damage potential multiplied by a variable factor.
 *
 * @param minDamage - Minimum damage
 * @param maxDamage - Maximum damage
 * @param isCritical - Whether this is a critical hit
 * @param _critMultiplier - DEPRECATED: Now uses CRIT_DAMAGE_MULTIPLIER range
 * @param damageReduction - Flat damage reduction from armor
 * @returns Final damage dealt (minimum 1)
 */
export function calculateDamage(
  minDamage: number,
  maxDamage: number,
  isCritical: boolean,
  _critMultiplier: number = 2.0,
  damageReduction: number = 0
): number {
  let damage: number;

  if (isCritical) {
    // MajorMUD-style: Crits use MAX damage × random(2.0-4.0)
    const multiplierRange = CRIT_DAMAGE_MULTIPLIER.max - CRIT_DAMAGE_MULTIPLIER.min;
    const critMultiplier = CRIT_DAMAGE_MULTIPLIER.min + (Math.random() * multiplierRange);
    damage = Math.floor(maxDamage * critMultiplier);
  } else {
    // Normal hit: Roll damage between min and max
    const range = Math.max(0, maxDamage - minDamage);
    damage = minDamage + Math.floor(Math.random() * (range + 1));
  }

  // Apply damage reduction
  damage = damage - damageReduction;

  // Minimum 1 damage on a hit
  return Math.max(1, damage);
}

/**
 * Parse a dice string (e.g., "2d6+3") and roll it
 *
 * @param diceString - Dice notation (e.g., "1d6", "2d8+4", "3d6-2")
 * @returns Object with min, max, and rolled damage
 */
export function parseDiceString(diceString: string): { min: number; max: number; roll: number } {
  const match = diceString.match(/^(\d+)d(\d+)([+-]\d+)?$/i);

  if (!match) {
    // Default to 1d4 if parsing fails
    return { min: 1, max: 4, roll: Math.floor(Math.random() * 4) + 1 };
  }

  const numDice = parseInt(match[1], 10);
  const dieSize = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  const min = numDice + modifier;
  const max = numDice * dieSize + modifier;

  // Roll the dice
  let roll = modifier;
  for (let i = 0; i < numDice; i++) {
    roll += Math.floor(Math.random() * dieSize) + 1;
  }

  return {
    min: Math.max(1, min),
    max: Math.max(1, max),
    roll: Math.max(1, roll),
  };
}

/**
 * Execute a full combat round between attacker and defender
 *
 * @param config - Optional runtime config (uses defaults if not provided)
 * @param defenderCurrentHp - Defender's current HP (optional, for early termination)
 * @param defenderDodgeChance - Defender's effective dodge chance (0-100), 0 if no dodge ability
 * @returns Array of swing results for the round
 */
export function executeCombatRound(
  attackerName: string,
  defenderName: string,
  attackerAccuracy: number,
  defenderDefense: number,
  availableEnergy: number,
  carriedEnergy: number,
  weaponSpeed: number,
  baseCritChance: number,
  minDamage: number,
  maxDamage: number,
  critMultiplier: number,
  damageReduction: number,
  config: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG,
  defenderCurrentHp?: number,
  defenderDodgeChance: number = 0
): { swings: SwingResult[]; remainingEnergy: number; totalDamage: number } {
  const totalEnergy = availableEnergy + carriedEnergy;
  const { swings: numSwings, remainingEnergy, bonusCritChance } = calculateSwings(totalEnergy, weaponSpeed, config);

  // Cap bonus crit chance at 25% to prevent excess attacks from guaranteeing crits
  const cappedBonusCrit = Math.min(25, bonusCritChance);
  const effectiveCritChance = Math.min(50, baseCritChance + cappedBonusCrit);
  const swings: SwingResult[] = [];
  let totalDamage = 0;
  let remainingHp = defenderCurrentHp ?? Infinity;

  for (let i = 0; i < numSwings; i++) {
    // Stop attacking if defender is already dead
    if (remainingHp <= 0) {
      break;
    }

    const result = resolveAttack(attackerAccuracy, defenderDefense, effectiveCritChance, defenderDodgeChance);
    const isCritical = result === AttackResult.CRITICAL;

    let damage = 0;
    if (result === AttackResult.HIT || result === AttackResult.CRITICAL) {
      damage = calculateDamage(minDamage, maxDamage, isCritical, critMultiplier, damageReduction);
      totalDamage += damage;
      remainingHp -= damage;
    }

    swings.push({
      result,
      damage,
      isCritical,
      attackerName,
      defenderName,
    });
  }

  return { swings, remainingEnergy, totalDamage };
}
