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
  blindPenaltyValue?: number;
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
 * Critical hit calculation factors (MajorMUD-style)
 *
 * Base formula: (Level/10) + ((INT-50)/10) + ((DEX-50)/25)
 * Plus: class bonus, encumbrance bonus, weapon/equipment modifiers
 * Soft cap at 40% with diminishing returns above
 */
export interface CriticalHitFactors {
  characterLevel: number;      // +1% per 10 levels
  intelligence: number;        // +1% per 10 INT above 50 (primary stat)
  dexterity: number;           // +1% per 25 DEX above 50 (secondary stat)
  classCritBonus: number;      // Flat class bonus (e.g., +10 for Ninja/Mystic)
  weaponCritModifier: number;  // Weapon's crit bonus
  equipmentCritBonus: number;  // Other equipment crit bonuses
  encumbranceRatio: number;    // 0.0-1.0, affects encumbrance crit bonus
}

/**
 * Encumbrance-based crit bonus thresholds (MajorMUD-style)
 * Light armor users get significant crit bonuses
 */
export const ENCUMBRANCE_CRIT_THRESHOLDS = {
  LIGHT: { maxRatio: 0.32, bonus: 20 },   // ≤32% encumbrance: +20% crit
  MEDIUM: { maxRatio: 0.65, bonus: 10 },  // ≤65% encumbrance: +10% crit
  HEAVY: { maxRatio: 1.0, bonus: 0 },     // >65% encumbrance: no bonus
};

/**
 * Critical hit soft cap (MajorMUD-style diminishing returns)
 * Above this threshold, excess crit is divided by 3
 */
export const CRIT_SOFT_CAP = 40;

/**
 * Critical damage multiplier range (MajorMUD-style)
 * Crits deal between 2x and 4x the weapon's MAX damage
 */
export const CRIT_DAMAGE_MULTIPLIER = {
  min: 2.0,
  max: 4.0,
};

/**
 * Default combat configuration
 *
 * NOTE: These are fallback defaults. Actual values are stored in the database
 * (game_settings table) and can be tweaked without code changes.
 *
 * Energy and weapon speed use large values (thousands) to allow fine-grained
 * weapon balancing, similar to MajorMUD's system where weapon speeds ranged
 * from ~700 (fastest daggers) to ~3000 (slow two-handers).
 */
export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  roundIntervalMs: 4000,
  maxAttacksPerRound: 6,
  baseEnergyPerRound: 20000,  // Large base for fine-grained weapon speed balancing
};

/**
 * Combat level base energy multipliers (fallback defaults)
 * Actual values stored in game_settings.combat_level_multipliers
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
 * Combat level base accuracy bonus (fallback defaults)
 * Actual values stored in game_settings.combat_level_accuracy_bonus
 */
export const COMBAT_LEVEL_ACCURACY_BONUS: Record<number, number> = {
  1: 0,
  2: 10,
  3: 20,
  4: 35,
  5: 50,
};

/**
 * Default weapon speed if none specified (fallback default)
 * Actual value stored in game_settings.combat_default_weapon_speed
 *
 * Weapon speeds are balanced against 20000 base energy:
 * - Level 1 (0.6 multiplier): 12000 effective energy
 * - Level 5 (1.15 multiplier): 23000 effective energy
 *
 * Target attack counts at level 1:
 * - Fast daggers (4000): ~3 attacks
 * - Standard swords (6500-7500): ~2 attacks
 * - Slow 2H axes (9500): ~1 attack
 *
 * 7500 is a reasonable default for weapons without a specified speed
 */
export const DEFAULT_WEAPON_SPEED = 7500;

/**
 * Encumbrance baseline (50% = no modifier)
 */
export const ENCUMBRANCE_BASELINE = 0.5;

// ============================================================================
// Dodge System (MajorMUD-style)
// ============================================================================

/**
 * Dodge calculation factors (MajorMUD-style)
 *
 * Dodge is a class skill - only classes with dodge_bonus > 0 can dodge.
 * Currently Ninja and Mystic have +25% base dodge, but any class can
 * potentially have dodge if configured.
 *
 * Formula:
 *   baseDodge = classDodgeBonus + raceDodgeBonus + equipmentDodgeBonus
 *   statDodge = floor(agility / 10) * 2 + floor(charm / 10) * 1
 *   totalDodge = baseDodge + statDodge
 *
 * Then apply soft cap at 52% with diminishing returns.
 * Finally factor in attacker accuracy to get effective dodge.
 */
export interface DodgeFactors {
  classDodgeBonus: number;      // Class base dodge (e.g., 25 for Ninja/Mystic)
  raceDodgeBonus: number;       // Race base dodge (e.g., 10 for Halfling)
  agility: number;              // AGI stat: +2% per 10 points
  charm: number;                // CHA stat: +1% per 10 points
  equipmentDodgeBonus: number;  // Total dodge bonus from equipment
  attackerAccuracy: number;     // Attacker's accuracy (reduces dodge effectiveness)
}

/**
 * Dodge soft cap (MajorMUD-style)
 * Beyond 52%, diminishing returns apply harshly
 */
export const DODGE_SOFT_CAP = 52;

/**
 * Dodge stat contribution rates (MajorMUD-style)
 * Agility has twice the impact of Charm
 */
export const DODGE_STAT_CONTRIBUTION = {
  agilityPer10: 2,   // +2% dodge per 10 AGI
  charmPer10: 1,     // +1% dodge per 10 CHA
};

/**
 * Minimum attacker accuracy for dodge to work
 * If attacker accuracy <= this value, dodge chance is 0
 */
export const DODGE_MIN_ATTACKER_ACCURACY = 8;
