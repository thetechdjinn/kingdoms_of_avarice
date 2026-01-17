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
}

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
}
