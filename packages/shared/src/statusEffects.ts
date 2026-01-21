// Status Effects System for Kingdoms of Avarice
// Tracks temporary buffs, debuffs, and damage-over-time effects on characters

/**
 * Categories of status effects for grouping and display
 */
export enum StatusEffectCategory {
  BUFF = 'buff',       // Beneficial effects (bless, shield, haste)
  DEBUFF = 'debuff',   // Harmful effects (curse, slow, blind)
  DOT = 'dot',         // Damage over time (poison, burning)
  HOT = 'hot',         // Healing over time (regeneration)
  CONTROL = 'control', // Movement/action restrictions (entangle, stun)
}

/**
 * How effects interact when reapplied
 */
export enum StackingBehavior {
  REPLACE = 'replace',   // New effect replaces old completely
  REFRESH = 'refresh',   // Reset duration but don't stack values
  STACK = 'stack',       // Multiple instances can stack (up to maxStacks)
}

/**
 * Effect definition - defines the behavior and modifiers for an effect type.
 * These are stored in a code registry, not the database.
 */
export interface StatusEffectDefinition {
  id: string;              // Unique identifier (e.g., 'blessed', 'poisoned')
  name: string;            // Display name
  description: string;
  category: StatusEffectCategory;
  stackingBehavior: StackingBehavior;
  maxStacks: number;       // Max stacks if STACK behavior (default 1)

  // Combat modifiers (additive)
  accuracyModifier?: number;   // +/- to accuracy
  defenseModifier?: number;    // +/- to defense
  energyModifier?: number;     // % change to attack energy
  damageModifier?: number;     // % change to damage dealt

  // Speed modifier (affects command queue delays)
  speedModifier?: number;      // % change to action delays (-20 = 20% faster, +50 = 50% slower)

  // Periodic effects (DoT/HoT)
  tickDamage?: string;         // Dice notation for damage per tick (e.g., "1d4")
  tickHealing?: string;        // Dice notation for healing per tick

  // Tick messages (for DoT/HoT effects)
  tickMessage?: string;        // Custom message on tick (e.g., "You feel sick.")
  silentTick?: boolean;        // If true, don't show any tick message (for passive effects)
  wearOffMessage?: string;     // Custom message when effect expires

  // Special flags
  blocksRegen?: boolean;       // Prevents natural regeneration
  blocksMovement?: boolean;    // Prevents movement commands
  isBlind?: boolean;           // Triggers blind penalty in combat calculations
}

/**
 * Active effect instance on a character.
 * Stored in memory and persisted to database.
 */
export interface ActiveStatusEffect {
  definitionId: string;        // References StatusEffectDefinition.id
  appliedAt: number;           // Timestamp when applied (ms since epoch)
  expiresAt: number;           // Timestamp when it expires (ms since epoch)
  stacks: number;              // Current stack count
  sourceSpellId?: number;      // Which spell created this effect
}

/**
 * Aggregated modifiers from all active effects on a character.
 * Used by combat calculations.
 */
export interface EffectModifiers {
  accuracyModifier: number;
  defenseModifier: number;
  energyModifier: number;      // Percentage (e.g., 25 means +25%)
  damageModifier: number;      // Percentage (e.g., -10 means -10%)
  speedModifier: number;       // Percentage (e.g., -20 means 20% faster, +50 means 50% slower)
  blocksRegen: boolean;
  blocksMovement: boolean;
  isBlind: boolean;
}

/**
 * Database row representation for character_status_effects table
 */
export interface DbStatusEffect {
  id: number;
  character_id: number;
  effect_id: string;
  stacks: number;
  applied_at: Date;
  expires_at: Date;
  source_spell_id: number | null;
}
