/**
 * Backstab Accuracy Module
 *
 * Calculates accuracy for backstab attacks.
 *
 * Attacker accuracy formula:
 *   DEX/10 + INT/20 + CHA*1.2/10 + Stealth + weaponBackstabAccuracy
 *
 * Defender defense formula:
 *   (AC / 2) + (Perception / 2)
 */

export interface BackstabHitResult {
  hit: boolean;
  attackerAccuracy: number;
  defenderDefense: number;
  roll: number;
}

export interface AttackerStats {
  dexterity: number;
  intelligence: number;
  charisma: number;
}

/**
 * Calculate the attacker's backstab accuracy
 *
 * @param stats - Attacker's stats (DEX, INT, CHA)
 * @param stealthValue - Attacker's total stealth stat
 * @param weaponBackstabAccuracy - Backstab accuracy bonus from weapon (can be negative)
 * @returns Total backstab accuracy value
 */
export function calculateBackstabAccuracy(
  stats: AttackerStats,
  stealthValue: number,
  weaponBackstabAccuracy: number
): number {
  // DEX/10 + INT/20 + CHA*1.2/10
  const dexBonus = Math.floor(stats.dexterity / 10);
  const intBonus = Math.floor(stats.intelligence / 20);
  const chaBonus = Math.floor((stats.charisma * 1.2) / 10);

  return dexBonus + intBonus + chaBonus + stealthValue + weaponBackstabAccuracy;
}

/**
 * Calculate the defender's backstab defense
 *
 * @param armorClass - Defender's total armor class
 * @param perception - Defender's total perception stat
 * @returns Total backstab defense value
 */
export function calculateBackstabDefense(armorClass: number, perception: number): number {
  return Math.floor(armorClass / 2) + Math.floor(perception / 2);
}

/**
 * Roll to determine if a backstab hits
 *
 * Uses a d100 roll where success = roll <= (accuracy - defense + 50)
 * This gives roughly 50% base chance, modified by accuracy vs defense
 *
 * @param attackerAccuracy - Attacker's total backstab accuracy
 * @param defenderDefense - Defender's total backstab defense
 * @returns BackstabHitResult with hit/miss and roll details
 */
export function rollBackstabHit(
  attackerAccuracy: number,
  defenderDefense: number
): BackstabHitResult {
  // Roll 1-100
  const roll = Math.floor(Math.random() * 100) + 1;

  // Hit threshold: base 50 + (accuracy - defense)
  // Minimum 5%, maximum 95%
  const hitThreshold = Math.min(95, Math.max(5, 50 + attackerAccuracy - defenderDefense));

  return {
    hit: roll <= hitThreshold,
    attackerAccuracy,
    defenderDefense,
    roll,
  };
}
