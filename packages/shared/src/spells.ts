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
  damageDice: string | null;
  healingDice: string | null;
  statusEffect: string | null;
  effectDuration: number | null;
  levelRequired: number;
  classRestrictions: string[];
  isAttackSpell: boolean;
  // Stat scaling - adds bonus damage/healing based on character stats
  damageScalingStat: SpellScalingStat | null;  // Which stat scales damage
  damageScalingFactor: number | null;           // % of stat added to damage (e.g., 0.5 = 50%)
  healingScalingStat: SpellScalingStat | null;  // Which stat scales healing
  healingScalingFactor: number | null;          // % of stat added to healing
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
  damageDice: string;
  // Scaling info for combat calculations
  damageScalingStat: SpellScalingStat | null;
  damageScalingFactor: number | null;
  // Status effect to apply on hit
  statusEffect: string | null;
  effectDuration: number | null;
}
