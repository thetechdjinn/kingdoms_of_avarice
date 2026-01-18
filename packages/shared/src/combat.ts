// Combat system types for Kingdoms of Avarice

/**
 * Result of a single attack swing
 */
export enum AttackResult {
  HIT = 'hit',
  MISS = 'miss',
  CRITICAL = 'critical',
  DODGE = 'dodge',
  PARRY = 'parry',
  BLOCK = 'block',
}

/**
 * Configuration for combat timing
 */
export interface CombatConfig {
  roundIntervalMs: number;     // Time between combat rounds (default 4000)
  maxAttacksPerRound: number;  // Cap on attacks per round (default 6)
  baseEnergyPerRound: number;  // Base energy before modifiers
}

/**
 * Calculated combat stats for a combatant
 * These are derived from base stats, equipment, and buffs
 */
export interface CombatantStats {
  // Offensive stats
  accuracy: number;            // Total accuracy rating
  attackEnergy: number;        // Energy available per round
  weaponSpeed: number;         // Weapon's energy cost per swing
  minDamage: number;           // Minimum damage per hit
  maxDamage: number;           // Maximum damage per hit
  critChance: number;          // Critical hit chance (0-100)
  critMultiplier: number;      // Damage multiplier on critical (default 2.0)

  // Defensive stats
  defense: number;             // Total defense (AC + secondary defenses)
  armorClass: number;          // Base armor class
  damageReduction: number;     // Flat damage reduction
}

/**
 * Result of a single swing in combat
 */
export interface SwingResult {
  result: AttackResult;
  damage: number;
  isCritical: boolean;
  attackerName: string;
  defenderName: string;
}

/**
 * Result of an entire combat round for one attacker
 */
export interface RoundResult {
  attackerId: number;
  defenderId: number;
  swings: SwingResult[];
  totalDamage: number;
  attacksLanded: number;
  attacksMissed: number;
}

/**
 * Combat message to be displayed to players
 */
export interface CombatMessage {
  toAttacker: string;
  toDefender: string;
  toRoom: string;
}

/**
 * Energy calculation factors
 * Used to determine attacks per round
 */
export interface EnergyFactors {
  combatLevel: number;         // Class combat level (1-5)
  characterLevel: number;      // Character level
  dexterity: number;           // DEX stat (agility)
  encumbranceRatio: number;    // Current/max encumbrance (0.0-1.0+)
}

/**
 * Accuracy calculation factors
 */
export interface AccuracyFactors {
  characterLevel: number;
  combatLevel: number;
  dexterity: number;
  intelligence: number;
  charisma: number;
  equipmentBonus: number;
  spellModifier: number;
  encumbrancePenalty: number;
  isBlind: boolean;
}

/**
 * Defense calculation factors
 */
export interface DefenseFactors {
  armorClass: number;
  perception: number;          // Secondary defense
  shadow: number;              // Flat +10 defense
  equipmentBonus: number;
  spellModifier: number;
}

/**
 * Default combat configuration
 */
export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  roundIntervalMs: 4000,
  maxAttacksPerRound: 6,
  baseEnergyPerRound: 20,  // Low base so level 1 gets 1-2 attacks, scaling up with levels
};

/**
 * Combat level base energy multipliers
 * Combat 5 gets significantly more energy than Combat 1
 */
export const COMBAT_LEVEL_ENERGY_MULTIPLIER: Record<number, number> = {
  1: 0.6,   // Mage, Priest
  2: 0.75,  // Warlock
  3: 0.9,   // Druid
  4: 1.0,   // Warrior
  5: 1.15,  // Witchunter, Ranger
};

/**
 * Combat level base accuracy bonus
 */
export const COMBAT_LEVEL_ACCURACY_BONUS: Record<number, number> = {
  1: 0,
  2: 10,
  3: 20,
  4: 35,
  5: 50,
};

/**
 * Default weapon speed if none specified
 */
export const DEFAULT_WEAPON_SPEED = 10;

/**
 * Encumbrance baseline (50% = no modifier)
 */
export const ENCUMBRANCE_BASELINE = 0.5;
