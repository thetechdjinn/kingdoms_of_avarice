/**
 * Combat Calculations Module
 *
 * Implements the core combat mechanics:
 * - Energy per round calculation
 * - Number of attacks (swings) per round
 * - Hit/miss determination
 * - Damage calculation
 */

import {
  EnergyFactors,
  AccuracyFactors,
  DefenseFactors,
  AttackResult,
  SwingResult,
  COMBAT_LEVEL_ENERGY_MULTIPLIER,
  COMBAT_LEVEL_ACCURACY_BONUS,
  ENCUMBRANCE_BASELINE,
  DEFAULT_WEAPON_SPEED,
  DEFAULT_COMBAT_CONFIG,
} from '@koa/shared';

/**
 * Calculate energy available per combat round
 *
 * Energy determines how many attacks a character can make.
 * Factors: combat level (most significant), character level, dexterity, encumbrance
 */
export function calculateRoundEnergy(factors: EnergyFactors): number {
  const baseEnergy = DEFAULT_COMBAT_CONFIG.baseEnergyPerRound;

  // Combat level multiplier (most significant factor)
  const combatMultiplier = COMBAT_LEVEL_ENERGY_MULTIPLIER[factors.combatLevel] ?? 1.0;

  // Character level bonus (2% per level)
  const levelMultiplier = 1 + (factors.characterLevel - 1) * 0.02;

  // Dexterity bonus (1% per 10 DEX above 50)
  const dexBonus = Math.max(0, (factors.dexterity - 50) / 10) * 0.01;
  const dexMultiplier = 1 + dexBonus;

  // Encumbrance modifier (50% = baseline, less = bonus, more = penalty)
  // At 0% encumbrance: +25% energy
  // At 50% encumbrance: no modifier
  // At 100% encumbrance: -25% energy
  const encumbranceOffset = ENCUMBRANCE_BASELINE - factors.encumbranceRatio;
  const encumbranceMultiplier = 1 + (encumbranceOffset * 0.5);

  const totalEnergy = baseEnergy
    * combatMultiplier
    * levelMultiplier
    * dexMultiplier
    * Math.max(0.5, encumbranceMultiplier); // Floor at 50% to prevent negative energy

  return Math.floor(totalEnergy);
}

/**
 * Calculate number of attacks (swings) for a combat round
 *
 * @param availableEnergy - Total energy available (round energy + carried energy)
 * @param weaponSpeed - Energy cost per swing (lower = faster)
 * @returns Object with swings count and remaining energy
 */
export function calculateSwings(
  availableEnergy: number,
  weaponSpeed: number = DEFAULT_WEAPON_SPEED
): { swings: number; remainingEnergy: number; bonusCritChance: number } {
  const speed = Math.max(1, weaponSpeed); // Prevent division by zero
  const maxAttacks = DEFAULT_COMBAT_CONFIG.maxAttacksPerRound;

  // Calculate raw number of swings
  let swings = Math.floor(availableEnergy / speed);
  const remainingEnergy = availableEnergy - (swings * speed);

  // Calculate bonus crit chance if we would exceed max attacks
  let bonusCritChance = 0;
  if (swings > maxAttacks) {
    // Each excess attack converts to +5% crit chance
    bonusCritChance = (swings - maxAttacks) * 5;
    swings = maxAttacks;
  }

  return { swings, remainingEnergy, bonusCritChance };
}

/**
 * Calculate total accuracy rating
 *
 * Accuracy is compared against defense to determine hit chance.
 */
export function calculateAccuracy(factors: AccuracyFactors): number {
  // Base from combat level
  const combatBonus = COMBAT_LEVEL_ACCURACY_BONUS[factors.combatLevel] ?? 0;

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
 * Calculate miss chance using the squared ratio formula
 *
 * Formula: ((D^2 / A^2) / 100) = miss chance (as decimal)
 * This creates a squared relationship where large disparities are very impactful.
 *
 * @param accuracy - Attacker's total accuracy
 * @param defense - Defender's total defense
 * @returns Miss chance as a value between 0 and 1
 */
export function calculateMissChance(accuracy: number, defense: number): number {
  const acc = Math.max(1, accuracy);
  const def = Math.max(1, defense);

  // Formula: (D^2 / A^2) / 100
  const missChance = ((def * def) / (acc * acc)) / 100;

  // Clamp between 5% and 95% (always some chance to hit or miss)
  return Math.min(0.95, Math.max(0.05, missChance));
}

/**
 * Determine if an attack hits, misses, is dodged, or is a critical
 *
 * @param accuracy - Attacker's accuracy
 * @param defense - Defender's defense
 * @param critChance - Critical hit chance (0-100)
 * @returns AttackResult enum value
 */
export function resolveAttack(
  accuracy: number,
  defense: number,
  critChance: number
): AttackResult {
  const missChance = calculateMissChance(accuracy, defense);
  const roll = Math.random();

  // Check for miss first
  if (roll < missChance) {
    // Determine type of miss (dodge vs pure miss)
    // Higher defense = more likely to be a dodge
    const dodgeChance = Math.min(0.5, defense / (defense + accuracy));
    if (Math.random() < dodgeChance) {
      return AttackResult.DODGE;
    }
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
 * Calculate damage for a single hit
 *
 * @param minDamage - Minimum damage
 * @param maxDamage - Maximum damage
 * @param isCritical - Whether this is a critical hit
 * @param critMultiplier - Damage multiplier for crits (default 2.0)
 * @param damageReduction - Flat damage reduction from armor
 * @returns Final damage dealt (minimum 1)
 */
export function calculateDamage(
  minDamage: number,
  maxDamage: number,
  isCritical: boolean,
  critMultiplier: number = 2.0,
  damageReduction: number = 0
): number {
  // Roll base damage
  const range = Math.max(0, maxDamage - minDamage);
  let damage = minDamage + Math.floor(Math.random() * (range + 1));

  // Apply critical multiplier
  if (isCritical) {
    damage = Math.floor(damage * critMultiplier);
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
  damageReduction: number
): { swings: SwingResult[]; remainingEnergy: number; totalDamage: number } {
  const totalEnergy = availableEnergy + carriedEnergy;
  const { swings: numSwings, remainingEnergy, bonusCritChance } = calculateSwings(totalEnergy, weaponSpeed);

  const effectiveCritChance = baseCritChance + bonusCritChance;
  const swings: SwingResult[] = [];
  let totalDamage = 0;

  for (let i = 0; i < numSwings; i++) {
    const result = resolveAttack(attackerAccuracy, defenderDefense, effectiveCritChance);
    const isCritical = result === AttackResult.CRITICAL;

    let damage = 0;
    if (result === AttackResult.HIT || result === AttackResult.CRITICAL) {
      damage = calculateDamage(minDamage, maxDamage, isCritical, critMultiplier, damageReduction);
      totalDamage += damage;
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
