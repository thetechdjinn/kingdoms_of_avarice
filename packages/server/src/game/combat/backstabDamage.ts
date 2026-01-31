/**
 * Backstab Damage Module
 *
 * Calculates damage for backstab attacks using multiplier-based formula.
 *
 * Damage formula:
 *   effectiveWeaponMax = weapon.max_damage + strengthBonus
 *   backstabMin = (effectiveWeaponMax * BASE_MIN_MULTIPLIER) + (level * LEVEL_BONUS_MIN)
 *   backstabMax = (effectiveWeaponMax * BASE_MAX_MULTIPLIER) + (level * LEVEL_BONUS_MAX)
 */

// Backstab damage multipliers
// These create a high-damage surprise attack range
const BASE_MIN_MULTIPLIER = 2.0;  // Min damage = 2x weapon max
const BASE_MAX_MULTIPLIER = 4.0;  // Max damage = 4x weapon max
const LEVEL_BONUS_MIN = 0.5;      // +0.5 to min per level
const LEVEL_BONUS_MAX = 1.0;      // +1.0 to max per level

export interface BackstabDamageResult {
  damage: number;
  backstabMin: number;
  backstabMax: number;
}

/**
 * Calculate damage bonus from strength
 * MajorMUD-style: +1 damage per 10 STR
 *
 * @param strength - Character's strength stat
 * @returns Strength damage bonus
 */
export function calculateStrengthDamageBonus(strength: number): number {
  return Math.floor(strength / 10);
}

/**
 * Calculate backstab damage
 *
 * @param weaponMaxDamage - Maximum damage of the equipped weapon
 * @param strengthBonus - Damage bonus from strength
 * @param level - Character's level
 * @returns BackstabDamageResult with rolled damage and damage range
 */
export function calculateBackstabDamage(
  weaponMaxDamage: number,
  strengthBonus: number,
  level: number
): BackstabDamageResult {
  // Calculate effective weapon max with strength bonus
  const effectiveWeaponMax = weaponMaxDamage + strengthBonus;

  // Calculate backstab damage range
  const backstabMin = Math.floor(effectiveWeaponMax * BASE_MIN_MULTIPLIER) + Math.floor(level * LEVEL_BONUS_MIN);
  const backstabMax = Math.floor(effectiveWeaponMax * BASE_MAX_MULTIPLIER) + Math.floor(level * LEVEL_BONUS_MAX);

  // Roll damage within the range
  const damageRange = backstabMax - backstabMin + 1;
  const damage = backstabMin + Math.floor(Math.random() * damageRange);

  return {
    damage,
    backstabMin,
    backstabMax,
  };
}
