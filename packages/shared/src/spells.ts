// Spell system types for Kingdoms of Avarice

/**
 * Type of spell effect
 */
export enum SpellType {
  OFFENSIVE = 'offensive',
  HEALING = 'healing',
  BUFF = 'buff',
  DEBUFF = 'debuff',
  UTILITY = 'utility',
}

/**
 * Target type for spells
 */
export enum SpellTargetType {
  SELF = 'self',
  SELF_ALLY = 'self_ally',
  ENEMY = 'enemy',
  ALLY = 'ally',
  ROOM = 'room',
}

/**
 * Character stats that can scale spell effects
 * Also used for other scaling mechanics (HP gains, resistance, etc.)
 */
export enum SpellScalingStat {
  NONE = 'none',
  STRENGTH = 'strength',
  AGILITY = 'agility',
  CONSTITUTION = 'constitution',  // Health/vitality - affects HP gains, damage resistance
  INTELLECT = 'intellect',
  WISDOM = 'wisdom',
  CHARISMA = 'charisma',
  INTELLECT_WISDOM = 'intellect_wisdom',  // Druid dual-stat: avg(INT, WIS)
}

/**
 * Spell definition
 */
export interface Spell {
  id: number;
  name: string;
  mnemonic: string;
  description: string;
  spellType: SpellType;
  targetType: SpellTargetType;
  manaCost: number;
  // Damage (offensive spells)
  minDamage: number | null;
  maxDamage: number | null;
  // Healing (healing spells)
  minHealing: number | null;
  maxHealing: number | null;
  // Multi-hit
  hitsPerCast: number;                          // Number of hits per cast (default 1)
  statusEffect: string | null;
  effectDuration: number | null;
  levelRequired: number;
  classRestrictions: string[];
  isAttackSpell: boolean;
  // Level scaling - % increase to damage/healing per caster level
  scalingPerLevel: number | null;               // e.g., 0.10 = 10% per level
  maxScalingLevel: number | null;               // Cap: scaling stops at this caster level (null = no cap)
  // Stat scaling - % increase per 10 stat points
  damageScalingStat: SpellScalingStat | null;   // Which stat scales damage
  damageScalingFactor: number | null;           // % increase per 10 points (e.g., 0.02 = 2%)
  healingScalingStat: SpellScalingStat | null;  // Which stat scales healing
  healingScalingFactor: number | null;          // % increase per 10 points
  // Fizzle mechanics
  castDifficulty: number;                       // Positive = easier, negative = harder, 100+ = item-cast (never fizzles)
  fizzleMessage: string | null;                 // Custom fizzle message (caster sees)
  fizzleMessageRoom: string | null;             // Custom fizzle message (room sees), supports {name}
  // Custom spell messages (override defaults when set)
  hitMessageSelf: string | null;                // Message to caster on hit
  hitMessageTarget: string | null;              // Message to target on hit
  hitMessageRoom: string | null;                // Message to room on hit
  // NPC spell casting / saving throw fields
  telegraphMessage: string | null;              // Optional preparation message shown before cast
  saveStat: SpellScalingStat | null;            // Stat target rolls to resist (null = no save)
  saveDifficulty: number;                       // Base difficulty for saving throw
}

/**
 * Condition types for NPC spell AI casting decisions
 */
export const NPC_SPELL_CONDITIONS = {
  any: 'Always',
  hp_below: 'HP Below %',
  hp_above: 'HP Above %',
  target_hp_below: 'Target HP Below %',
  mana_above: 'Mana Above %',
  no_effect: 'Missing Effect',
  has_allies: 'Has Allies',
  combat_start: 'Combat Start',
} satisfies Record<string, string>;

/**
 * Valid NPC spell condition type values
 */
export type NpcSpellConditionType = keyof typeof NPC_SPELL_CONDITIONS;

/**
 * Character's learned spell record
 */
export interface CharacterSpell {
  id: number;
  characterId: number;
  spellId: number;
  learnedAt: Date;
}

/**
 * Combat action type - melee attacks or spell casting
 */
export type CombatActionType = 'melee' | 'spell';

/**
 * Active spell casting state during combat
 */
export interface SpellCastingState {
  spellId: number;
  spellName: string;
  mnemonic: string;
  manaCost: number;
  minDamage: number;
  maxDamage: number;
  hitsPerCast: number;
  levelRequired: number;
  // Scaling info for combat calculations
  scalingPerLevel: number | null;
  maxScalingLevel: number | null;
  damageScalingStat: SpellScalingStat | null;
  damageScalingFactor: number | null;
  // Fizzle
  castDifficulty: number;
  fizzleMessage: string | null;
  fizzleMessageRoom: string | null;
  // Custom messages
  hitMessageSelf: string | null;
  hitMessageTarget: string | null;
  hitMessageRoom: string | null;
  // Status effect to apply on hit
  statusEffect: string | null;
  effectDuration: number | null;
}
