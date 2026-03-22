/**
 * Status Effects Manager
 *
 * Manages temporary buffs, debuffs, and damage-over-time effects on characters.
 * Effects are stored in memory during play and persisted to database on changes.
 */

import {
  StatusEffectDefinition,
  StatusEffectCategory,
  StackingBehavior,
  ActiveStatusEffect,
  EffectModifiers,
} from '@koa/shared';
import * as statusEffectRepo from '../db/repositories/statusEffectRepository.js';
import * as effectDefRepo from '../db/repositories/statusEffectDefinitionRepository.js';
import { AuthenticatedSocket } from './socket.js';
import type { CombatEntity } from './combatEntity.js';
import { colors } from '../utils/colors.js';
import { MessageType } from '@koa/shared';
import { handleInterruptTrigger } from './interruptHandler.js';
import {
  applyDamage,
  initializeDroppedState,
  initializeDeadState,
  isPlayerDropped,
  isPlayerDead,
  formatDroppedMessage,
  formatDeathMessage,
} from './damageHandler.js';
import { getPlayerLocation } from './adminCommands.js';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Roll a random integer between min and max (inclusive).
 * Used for damage/healing ranges instead of dice notation.
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Random integer in the range [min, max]
 */
function rollRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// Effect-to-Interrupt Mapping
// ============================================================================

/**
 * Maps effect IDs to interrupt trigger types.
 * When these effects are applied, they trigger the corresponding interrupt.
 */
const EFFECT_INTERRUPT_TRIGGERS: Record<string, string> = {
  stunned: 'stun',
  silenced: 'silence',
  knockdown: 'knockdown',
  // Note: 'bash' is triggered directly by the bash ability, not by an effect
};

// ============================================================================
// Effect Registry - Loaded from database with fallback to defaults
// ============================================================================
//
// STATUS EFFECT REFERENCE
// =======================
//
// This section documents all available status effects and their modifiers.
//
// MODIFIER TYPES:
// ---------------
// - accuracyModifier:  Additive bonus/penalty to hit chance (e.g., +10 = +10% hit)
// - defenseModifier:   Additive bonus/penalty to defense (e.g., +15 = +15 defense)
// - damageModifier:    Percentage change to damage dealt (e.g., +15 = +15% damage)
// - energyModifier:    Percentage change to attack energy (e.g., +25 = +25% energy)
// - speedModifier:     Percentage change to action delays:
//                      - Negative = FASTER (e.g., -20 = 20% faster actions)
//                      - Positive = SLOWER (e.g., +50 = 50% slower actions)
//
// SPEED MODIFIER STACKING RULES:
// ------------------------------
// Speed modifiers use category-based stacking to prevent abuse:
//
// - Speed BUFFS (negative speedModifier, e.g., hasted):
//   Rule: "bestOnly" - Only the strongest speed buff applies
//   Example: Hasted (-20%) + another haste (-15%) = -20% (best one wins)
//
// - Speed DEBUFFS (positive speedModifier, e.g., slowed):
//   Rule: "worstOnly" - Only the strongest speed debuff applies
//   Example: Slowed (+50%) + another slow (+30%) = +50% (worst one wins)
//
// - Combined: If you have both buffs and debuffs, they ADD together
//   Example: Hasted (-20%) + Slowed (+50%) = +30% slower overall
//
// SPECIAL FLAGS:
// --------------
// - blocksRegen:     Prevents natural HP/mana regeneration
// - blocksMovement:  Prevents all movement commands
// - isBlind:         Applies blind penalty in combat calculations
//
// STACKING BEHAVIORS:
// -------------------
// - REPLACE:  New application completely replaces the old effect
// - REFRESH:  New application resets duration but doesn't stack values
// - STACK:    Multiple applications stack (up to maxStacks), multiplying effects
//
// ============================================================================

/**
 * Runtime cache of effect definitions loaded from the database.
 * This is populated by loadEffectDefinitions() on server startup.
 */
let loadedDefinitions: Map<string, StatusEffectDefinition> = new Map();
let definitionsInitialized = false;

/**
 * Fallback effect definitions used when database is unavailable.
 * These are also used to seed the database on first run.
 *
 * EFFECT SUMMARY TABLE:
 * =====================
 *
 * BUFFS (beneficial effects):
 * ---------------------------
 * | Effect      | What It Does                                        |
 * |-------------|-----------------------------------------------------|
 * | blessed     | +10 accuracy (better hit chance)                    |
 * | shielded    | +15 defense (harder to hit)                         |
 * | hasted      | -20% action delay (faster), +25% attack energy      |
 * | strengthened| +15% damage dealt                                   |
 *
 * DEBUFFS (harmful effects):
 * --------------------------
 * | Effect      | What It Does                                        |
 * |-------------|-----------------------------------------------------|
 * | cursed      | -10 accuracy, -10 defense                           |
 * | slowed      | +50% action delay (slower), -25% attack energy      |
 * | blinded     | Combat blind penalty (severe accuracy reduction)    |
 *
 * DAMAGE OVER TIME (periodic damage):
 * -----------------------------------
 * | Effect      | What It Does                                        |
 * |-------------|-----------------------------------------------------|
 * | poisoned    | 1-4 damage/tick, blocks regen, stacks up to 3x      |
 * | burning     | 1-6 damage/tick                                     |
 *
 * HEALING OVER TIME (periodic healing):
 * -------------------------------------
 * | Effect      | What It Does                                        |
 * |-------------|-----------------------------------------------------|
 * | regenerating| 1-6 healing/tick (silent, no spam messages)         |
 *
 * CONTROL (movement/action restrictions):
 * ---------------------------------------
 * | Effect      | What It Does                                        |
 * |-------------|-----------------------------------------------------|
 * | entangled   | Cannot move, +100% action delay, -50% attack energy |
 *
 */
export const EFFECT_REGISTRY: Record<string, StatusEffectDefinition> = {
  // =========================================================================
  // BUFFS - Beneficial effects that help the player
  // =========================================================================

  /**
   * BLESSED
   * -------
   * A divine blessing that improves combat accuracy.
   *
   * Effect: +10 accuracy modifier (additive to hit chance)
   * Stacking: REFRESH (reapplying resets duration, doesn't stack bonus)
   */
  blessed: {
    id: 'blessed',
    name: 'Blessed',
    description: 'Divine favor improves your accuracy.',
    category: StatusEffectCategory.BUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    accuracyModifier: 10,
    wearOffMessage: 'The blessing fades.',
  },

  /**
   * SHIELDED
   * --------
   * A magical barrier that improves defense.
   *
   * Effect: +15 defense modifier (additive to defense rating)
   * Stacking: REFRESH (reapplying resets duration, doesn't stack bonus)
   */
  shielded: {
    id: 'shielded',
    name: 'Shielded',
    description: 'A magical barrier protects you.',
    category: StatusEffectCategory.BUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    defenseModifier: 15,
    wearOffMessage: 'Your magical shield dissipates.',
  },

  /**
   * HASTED
   * ------
   * Magical speed enhancement that reduces action delays.
   *
   * Effects:
   * - speedModifier: -20 (20% FASTER actions - movement, combat, spells)
   * - energyModifier: +25 (25% more attack energy per round)
   *
   * Speed Stacking: Uses "bestOnly" rule - if you have multiple haste effects,
   * only the strongest one applies. Hasted (-20%) + Minor Haste (-10%) = -20%
   *
   * Stacking: REFRESH (reapplying resets duration, doesn't stack bonus)
   */
  hasted: {
    id: 'hasted',
    name: 'Hasted',
    description: 'Your movements are quickened.',
    category: StatusEffectCategory.BUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    energyModifier: 25,
    speedModifier: -20,
    wearOffMessage: 'Your movements return to normal.',
  },

  /**
   * STRENGTHENED
   * ------------
   * Magical strength enhancement that increases damage output.
   *
   * Effect: +15% damage dealt (percentage modifier)
   * Stacking: REFRESH (reapplying resets duration, doesn't stack bonus)
   */
  strengthened: {
    id: 'strengthened',
    name: 'Strengthened',
    description: 'Magical strength enhances your blows.',
    category: StatusEffectCategory.BUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    damageModifier: 15,
    wearOffMessage: 'The surge of strength fades.',
  },

  // =========================================================================
  // DEBUFFS - Harmful effects that hinder the player
  // =========================================================================

  /**
   * CURSED
   * ------
   * A dark curse that weakens combat effectiveness.
   *
   * Effects:
   * - accuracyModifier: -10 (harder to hit enemies)
   * - defenseModifier: -10 (easier to be hit)
   *
   * Stacking: REFRESH (reapplying resets duration, doesn't stack penalty)
   */
  cursed: {
    id: 'cursed',
    name: 'Cursed',
    description: 'A dark curse weakens you.',
    category: StatusEffectCategory.DEBUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    accuracyModifier: -10,
    defenseModifier: -10,
  },

  /**
   * SLOWED
   * ------
   * Magical slowness that increases action delays.
   *
   * Effects:
   * - speedModifier: +50 (50% SLOWER actions - movement, combat, spells)
   * - energyModifier: -25 (25% less attack energy per round)
   *
   * Speed Stacking: Uses "worstOnly" rule - if you have multiple slow effects,
   * only the strongest one applies. Slowed (+50%) + Minor Slow (+30%) = +50%
   *
   * Combined with Haste: Hasted (-20%) + Slowed (+50%) = +30% slower overall
   *
   * Stacking: REFRESH (reapplying resets duration, doesn't stack penalty)
   */
  slowed: {
    id: 'slowed',
    name: 'Slowed',
    description: 'Your movements are sluggish.',
    category: StatusEffectCategory.DEBUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    energyModifier: -25,
    speedModifier: 50,
  },

  /**
   * BLINDED
   * -------
   * Unable to see clearly, severely impacting combat.
   *
   * Effect: isBlind flag triggers blind penalty in combat calculations
   * (typically a large accuracy penalty and inability to target enemies)
   *
   * Stacking: REFRESH (reapplying resets duration)
   */
  blinded: {
    id: 'blinded',
    name: 'Blinded',
    description: 'You cannot see clearly.',
    category: StatusEffectCategory.DEBUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    isBlind: true,
  },

  // =========================================================================
  // DAMAGE OVER TIME (DoT) - Periodic damage effects
  // =========================================================================

  /**
   * POISONED
   * --------
   * Poison damage that ticks periodically and can stack.
   *
   * Effects:
   * - tickDamage: 1-4 per tick (multiplied by stack count)
   * - blocksRegen: true (prevents natural HP regeneration)
   *
   * Stacking: STACK up to 3 times
   * - 1 stack: 1-4 damage per tick
   * - 2 stacks: 2-8 damage per tick
   * - 3 stacks: 3-12 damage per tick
   *
   * Each new poison application adds a stack AND refreshes duration.
   */
  poisoned: {
    id: 'poisoned',
    name: 'Poisoned',
    description: 'Poison courses through your veins.',
    category: StatusEffectCategory.DOT,
    stackingBehavior: StackingBehavior.STACK,
    maxStacks: 3,
    tickDamageMin: 1,
    tickDamageMax: 4,
    tickMessage: 'You feel sick.',
    wearOffMessage: 'The poison fades from your system.',
    blocksRegen: true,
  },

  /**
   * BURNING
   * -------
   * Fire damage that ticks periodically.
   *
   * Effect: tickDamage: 1-6 per tick
   * Stacking: REFRESH (reapplying resets duration, doesn't stack damage)
   */
  burning: {
    id: 'burning',
    name: 'Burning',
    description: 'You are on fire!',
    category: StatusEffectCategory.DOT,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    tickDamageMin: 1,
    tickDamageMax: 6,
    tickMessage: 'You are burning!',
    wearOffMessage: 'The flames die out.',
  },

  // =========================================================================
  // HEALING OVER TIME (HoT) - Periodic healing effects
  // =========================================================================

  /**
   * REGENERATING
   * ------------
   * Magical regeneration that heals periodically.
   *
   * Effect: tickHealing: 1-6 per tick
   * Silent: true (no spam messages, healing happens quietly)
   * Stacking: REFRESH (reapplying resets duration, doesn't stack healing)
   */
  regenerating: {
    id: 'regenerating',
    name: 'Regenerating',
    description: 'Your wounds heal rapidly.',
    category: StatusEffectCategory.HOT,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    tickHealingMin: 1,
    tickHealingMax: 6,
    silentTick: true,
    wearOffMessage: 'Your regeneration fades.',
  },

  // =========================================================================
  // CONTROL - Movement and action restrictions
  // =========================================================================

  /**
   * ENTANGLED
   * ---------
   * Vines or roots that completely restrict movement and slow actions.
   *
   * Effects:
   * - blocksMovement: true (cannot use any movement commands)
   * - speedModifier: +100 (100% slower actions - doubled delay)
   * - energyModifier: -50 (50% less attack energy per round)
   *
   * Stacking: REFRESH (reapplying resets duration, doesn't stack penalty)
   *
   * Note: While entangled, you cannot move but can still attack and cast
   * spells (at greatly reduced effectiveness due to energy/speed penalties).
   */
  entangled: {
    id: 'entangled',
    name: 'Entangled',
    description: 'Vines restrict your movement.',
    category: StatusEffectCategory.CONTROL,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    blocksMovement: true,
    energyModifier: -50,
    speedModifier: 100,
  },
};

/**
 * Get an effect definition by ID.
 * First checks the database-loaded definitions, then falls back to the code registry.
 */
export function getEffectDefinition(effectId: string): StatusEffectDefinition | null {
  // Check loaded definitions first (from database)
  const loaded = loadedDefinitions.get(effectId);
  if (loaded) {
    return loaded;
  }
  // Fall back to code registry
  return EFFECT_REGISTRY[effectId] ?? null;
}

/**
 * Initialize effect definitions from the database.
 * Called during server startup.
 */
export async function initializeEffectDefinitions(): Promise<void> {
  try {
    const definitions = await effectDefRepo.getAllDefinitions();
    loadedDefinitions = new Map(definitions.map(d => [d.id, d]));
    definitionsInitialized = true;
    console.log(`[StatusEffects] Loaded ${loadedDefinitions.size} effect definitions from database`);
  } catch (error) {
    console.error('[StatusEffects] Failed to load effect definitions from database, using fallback:', error);
    // Use the code registry as fallback
    loadedDefinitions = new Map(Object.entries(EFFECT_REGISTRY));
    definitionsInitialized = true;
  }
}

/**
 * Reload effect definitions from the database.
 * Called when definitions are updated via the API.
 */
export async function reloadEffectDefinitions(): Promise<void> {
  await initializeEffectDefinitions();
}

/**
 * Get all available effect IDs (for use by spell editor)
 */
export function getAllEffectIds(): string[] {
  if (definitionsInitialized && loadedDefinitions.size > 0) {
    return Array.from(loadedDefinitions.keys());
  }
  return Object.keys(EFFECT_REGISTRY);
}

// ============================================================================
// Effect Application and Management
// ============================================================================

/**
 * Apply a status effect to a character.
 * Handles stacking behavior and persists to database.
 */
export async function applyEffect(
  socket: AuthenticatedSocket,
  effectId: string,
  durationMs: number,
  sourceSpellId?: number
): Promise<{ success: boolean; message: string }> {
  const definition = getEffectDefinition(effectId);
  if (!definition) {
    return { success: false, message: `Unknown effect: ${effectId}` };
  }

  const now = Date.now();
  const expiresAt = now + durationMs;

  // Initialize activeEffects map if needed
  if (!socket.activeEffects) {
    socket.activeEffects = new Map();
  }

  const existing = socket.activeEffects.get(effectId);

  let effect: ActiveStatusEffect;

  if (existing) {
    // Effect already exists - handle based on stacking behavior
    switch (definition.stackingBehavior) {
      case StackingBehavior.REPLACE:
        // Replace completely
        effect = {
          definitionId: effectId,
          appliedAt: now,
          expiresAt,
          stacks: 1,
          sourceSpellId,
        };
        break;

      case StackingBehavior.REFRESH:
        // Reset duration but keep other properties
        effect = {
          ...existing,
          expiresAt,
          sourceSpellId: sourceSpellId ?? existing.sourceSpellId,
        };
        break;

      case StackingBehavior.STACK:
        // Add a stack (up to max)
        const newStacks = Math.min(existing.stacks + 1, definition.maxStacks);
        effect = {
          ...existing,
          stacks: newStacks,
          expiresAt, // Also refresh duration on stack
          sourceSpellId: sourceSpellId ?? existing.sourceSpellId,
        };
        break;

      default:
        effect = {
          definitionId: effectId,
          appliedAt: now,
          expiresAt,
          stacks: 1,
          sourceSpellId,
        };
    }
  } else {
    // New effect
    effect = {
      definitionId: effectId,
      appliedAt: now,
      expiresAt,
      stacks: 1,
      sourceSpellId,
    };
  }

  // Store in memory
  socket.activeEffects.set(effectId, effect);

  // Persist to database
  await statusEffectRepo.saveEffect(socket.characterId!, effect);

  // Update legacy isPoisoned flag for regen system compatibility
  if (effectId === 'poisoned') {
    socket.regenState.isPoisoned = true;
  }

  // Check if this effect should trigger an interrupt
  const interruptTrigger = EFFECT_INTERRUPT_TRIGGERS[effectId];
  if (interruptTrigger) {
    handleInterruptTrigger(socket, interruptTrigger);
  }

  const stackInfo = effect.stacks > 1 ? ` (${effect.stacks} stacks)` : '';
  return {
    success: true,
    message: `You are now ${colors.yellow(definition.name)}${stackInfo}!`,
  };
}

/**
 * Apply a status effect to a CombatEntity (NPC-compatible).
 * Same stacking logic as applyEffect() but:
 * - Skips DB persistence (NPCs are in-memory only)
 * - Skips legacy isPoisoned flag (NPC regen doesn't use it)
 * - Skips interrupt triggers (NPCs don't have player interrupt mechanics)
 */
export function applyEffectToEntity(
  entity: CombatEntity,
  effectId: string,
  durationMs: number,
  sourceSpellId?: number
): { success: boolean; message: string } {
  const definition = getEffectDefinition(effectId);
  if (!definition) {
    return { success: false, message: `Unknown effect: ${effectId}` };
  }

  const now = Date.now();
  const expiresAt = now + durationMs;

  if (!entity.activeEffects) {
    entity.activeEffects = new Map();
  }

  const existing = entity.activeEffects.get(effectId);
  let effect: ActiveStatusEffect;

  if (existing) {
    switch (definition.stackingBehavior) {
      case StackingBehavior.REPLACE:
        effect = {
          definitionId: effectId,
          appliedAt: now,
          expiresAt,
          stacks: 1,
          sourceSpellId,
        };
        break;

      case StackingBehavior.REFRESH:
        effect = {
          ...existing,
          expiresAt,
          sourceSpellId: sourceSpellId ?? existing.sourceSpellId,
        };
        break;

      case StackingBehavior.STACK: {
        const newStacks = Math.min(existing.stacks + 1, definition.maxStacks);
        effect = {
          ...existing,
          stacks: newStacks,
          expiresAt,
          sourceSpellId: sourceSpellId ?? existing.sourceSpellId,
        };
        break;
      }

      default:
        effect = {
          definitionId: effectId,
          appliedAt: now,
          expiresAt,
          stacks: 1,
          sourceSpellId,
        };
    }
  } else {
    effect = {
      definitionId: effectId,
      appliedAt: now,
      expiresAt,
      stacks: 1,
      sourceSpellId,
    };
  }

  entity.activeEffects.set(effectId, effect);

  const stackInfo = effect.stacks > 1 ? ` (${effect.stacks} stacks)` : '';
  return {
    success: true,
    message: `${definition.name}${stackInfo}`,
  };
}

/**
 * Process status effect ticks for an NPC.
 * Handles DoT damage, HoT healing, and effect expiration.
 * Returns true if the NPC died from DoT damage.
 */
export function processNpcEffectsTick(npc: CombatEntity): {
  died: boolean;
  damaged: boolean;
} {
  if (!npc.activeEffects || npc.activeEffects.size === 0) {
    return { died: false, damaged: false };
  }

  const now = Date.now();
  const expiredEffects: string[] = [];
  let damaged = false;

  for (const [effectId, effect] of npc.activeEffects) {
    // Check for expiration
    if (effect.expiresAt <= now) {
      expiredEffects.push(effectId);
      // Update poisoned flag immediately on expiry
      if (effect.definitionId === 'poisoned') {
        npc.regenState.isPoisoned = false;
      }
      continue;
    }

    const definition = getEffectDefinition(effect.definitionId);
    if (!definition) continue;

    // Process DoT damage
    if (definition.tickDamageMin !== undefined && definition.tickDamageMax !== undefined) {
      if (npc.vitals.hp <= 0) continue;

      const baseDamage = rollRange(definition.tickDamageMin, definition.tickDamageMax);
      const totalDamage = baseDamage * effect.stacks;

      npc.vitals.hp -= totalDamage;
      damaged = true;

      if (npc.vitals.hp <= 0) {
        npc.vitals.hp = 0;
        // Clean up all effects and regen flags on death
        npc.activeEffects.clear();
        npc.regenState.isPoisoned = false;
        return { died: true, damaged: true };
      }
    }

    // Process HoT healing (only if alive)
    if (definition.tickHealingMin !== undefined && definition.tickHealingMax !== undefined && npc.vitals.hp > 0) {
      const baseHealing = rollRange(definition.tickHealingMin, definition.tickHealingMax);
      const totalHealing = baseHealing * effect.stacks;
      npc.vitals.hp = Math.min(npc.vitals.maxHp, npc.vitals.hp + totalHealing);
    }
  }

  // Remove expired effects
  for (const effectId of expiredEffects) {
    npc.activeEffects.delete(effectId);
  }

  return { died: false, damaged };
}

/**
 * Remove a status effect from a character
 */
export async function removeEffect(
  socket: AuthenticatedSocket,
  effectId: string
): Promise<boolean> {
  if (!socket.activeEffects) {
    return false;
  }

  const removed = socket.activeEffects.delete(effectId);

  if (removed) {
    // Remove from database
    await statusEffectRepo.removeEffect(socket.characterId!, effectId);

    // Update legacy isPoisoned flag
    if (effectId === 'poisoned') {
      socket.regenState.isPoisoned = false;
    }
  }

  return removed;
}

/**
 * Check if a character has a specific effect (active, non-expired)
 */
export function hasEffect(socket: CombatEntity, effectId: string): boolean {
  if (!socket.activeEffects) {
    return false;
  }

  const effect = socket.activeEffects.get(effectId);
  if (!effect) {
    return false;
  }

  // Check if expired
  return effect.expiresAt > Date.now();
}

/**
 * Get the combined modifiers from all active effects
 */
export function getEffectModifiers(socket: CombatEntity): EffectModifiers {
  const modifiers: EffectModifiers = {
    accuracyModifier: 0,
    defenseModifier: 0,
    energyModifier: 0,
    damageModifier: 0,
    speedModifier: 0,
    criticalChanceModifier: 0,
    dodgeModifier: 0,
    magicResistance: 0,
    healingReceived: 0,
    perceptionModifier: 0,
    stealthModifier: 0,
    spellcastingModifier: 0,
    lockpickingModifier: 0,
    strengthModifier: 0,
    dexterityModifier: 0,
    constitutionModifier: 0,
    intelligenceModifier: 0,
    wisdomModifier: 0,
    charismaModifier: 0,
    maxHpModifier: 0,
    maxManaModifier: 0,
    blocksRegen: false,
    blocksMovement: false,
    isBlind: false,
    blocksCasting: false,
    blocksCombat: false,
    blocksStealth: false,
  };

  if (!socket.activeEffects) {
    return modifiers;
  }

  const now = Date.now();
  const expiredIds: string[] = [];

  for (const [effectId, effect] of socket.activeEffects) {
    // Track expired effects for cleanup
    if (effect.expiresAt <= now) {
      expiredIds.push(effectId);
      continue;
    }

    const definition = getEffectDefinition(effect.definitionId);
    if (!definition) {
      continue;
    }

    // Multiply modifiers by stack count for stackable effects
    const stackMultiplier = effect.stacks;

    modifiers.accuracyModifier += (definition.accuracyModifier ?? 0) * stackMultiplier;
    modifiers.defenseModifier += (definition.defenseModifier ?? 0) * stackMultiplier;
    modifiers.energyModifier += (definition.energyModifier ?? 0) * stackMultiplier;
    modifiers.damageModifier += (definition.damageModifier ?? 0) * stackMultiplier;
    modifiers.speedModifier += (definition.speedModifier ?? 0) * stackMultiplier;
    modifiers.criticalChanceModifier += (definition.criticalChanceModifier ?? 0) * stackMultiplier;
    modifiers.dodgeModifier += (definition.dodgeModifier ?? 0) * stackMultiplier;
    modifiers.magicResistance += (definition.magicResistance ?? 0) * stackMultiplier;
    modifiers.healingReceived += (definition.healingReceived ?? 0) * stackMultiplier;
    modifiers.perceptionModifier += (definition.perceptionModifier ?? 0) * stackMultiplier;
    modifiers.stealthModifier += (definition.stealthModifier ?? 0) * stackMultiplier;
    modifiers.spellcastingModifier += (definition.spellcastingModifier ?? 0) * stackMultiplier;
    modifiers.lockpickingModifier += (definition.lockpickingModifier ?? 0) * stackMultiplier;
    modifiers.strengthModifier += (definition.strengthModifier ?? 0) * stackMultiplier;
    modifiers.dexterityModifier += (definition.dexterityModifier ?? 0) * stackMultiplier;
    modifiers.constitutionModifier += (definition.constitutionModifier ?? 0) * stackMultiplier;
    modifiers.intelligenceModifier += (definition.intelligenceModifier ?? 0) * stackMultiplier;
    modifiers.wisdomModifier += (definition.wisdomModifier ?? 0) * stackMultiplier;
    modifiers.charismaModifier += (definition.charismaModifier ?? 0) * stackMultiplier;
    modifiers.maxHpModifier += (definition.maxHpModifier ?? 0) * stackMultiplier;
    modifiers.maxManaModifier += (definition.maxManaModifier ?? 0) * stackMultiplier;

    // Boolean flags don't stack - any one effect sets them
    if (definition.blocksRegen) modifiers.blocksRegen = true;
    if (definition.blocksMovement) modifiers.blocksMovement = true;
    if (definition.isBlind) modifiers.isBlind = true;
    if (definition.blocksCasting) modifiers.blocksCasting = true;
    if (definition.blocksCombat) modifiers.blocksCombat = true;
    if (definition.blocksStealth) modifiers.blocksStealth = true;
  }

  // Clean up expired effects to prevent memory bloat
  for (const id of expiredIds) {
    socket.activeEffects.delete(id);
  }

  return modifiers;
}

/**
 * Check if any active effect blocks regeneration
 */
export function shouldBlockRegen(socket: CombatEntity): boolean {
  return getEffectModifiers(socket).blocksRegen;
}

/**
 * Check if any active effect blocks movement
 */
export function shouldBlockMovement(socket: CombatEntity): boolean {
  return getEffectModifiers(socket).blocksMovement;
}

// ============================================================================
// Effect Tick Processing
// ============================================================================

/**
 * Process status effect ticks for a character.
 * Handles DoT damage, HoT healing, and effect expiration.
 * Called by the regeneration system every 5 seconds.
 */
export async function processEffectsTick(
  socket: AuthenticatedSocket,
  sendMessage: (socket: AuthenticatedSocket, type: MessageType, message: string) => void,
  sendVitals: (socket: AuthenticatedSocket) => void
): Promise<void> {
  if (!socket.activeEffects || socket.activeEffects.size === 0) {
    return;
  }

  const now = Date.now();
  const expiredEffects: string[] = [];
  let vitalsChanged = false;

  for (const [effectId, effect] of socket.activeEffects) {
    // Check for expiration
    if (effect.expiresAt <= now) {
      expiredEffects.push(effectId);
      continue;
    }

    const definition = getEffectDefinition(effectId);
    if (!definition) {
      continue;
    }

    // Process DoT damage (using min/max range)
    if (definition.tickDamageMin !== undefined && definition.tickDamageMax !== undefined) {
      // Skip DoT processing if player is already dead
      if (isPlayerDead(socket)) {
        continue;
      }

      // Roll random value in range, multiplied by stack count
      const baseDamage = rollRange(definition.tickDamageMin, definition.tickDamageMax);
      const totalDamage = baseDamage * effect.stacks;

      // Apply damage using centralized handler (allows negative HP and state transitions)
      const damageResult = await applyDamage(socket, totalDamage, 'dot');
      vitalsChanged = true;

      // Cancel resting/meditation when taking damage
      const wasResting = socket.regenState.enhancedRegen.size > 0;
      const wasMeditating = !!socket.exitTimer;

      if (wasResting) {
        socket.regenState.enhancedRegen.clear();
      }
      if (wasMeditating) {
        clearTimeout(socket.exitTimer);
        socket.exitTimer = undefined;
      }

      // Notify player if their rest/meditation was interrupted
      if (wasResting || wasMeditating) {
        const action = wasMeditating ? 'meditation' : 'rest';
        sendMessage(socket, MessageType.SYSTEM, colors.yellow(`The damage interrupts your ${action}!`));
      }

      // Show tick message unless silentTick is true
      if (!definition.silentTick) {
        if (definition.tickMessage) {
          // Use custom tick message
          sendMessage(socket, MessageType.SYSTEM, colors.red(definition.tickMessage));
        } else {
          // Default tick message with damage
          const stackInfo = effect.stacks > 1 ? ` (x${effect.stacks})` : '';
          sendMessage(
            socket,
            MessageType.SYSTEM,
            `${colors.red(definition.name)}${stackInfo} deals ${colors.red(totalDamage.toString())} damage!`
          );
        }
      }

      // Handle state changes from DoT damage
      const roomId = getPlayerLocation(socket.playerId);
      if (damageResult.stateChange === 'dropped') {
        initializeDroppedState(socket, roomId);
        sendMessage(socket, MessageType.SYSTEM, formatDroppedMessage());
        // Broadcast to room
        const { broadcastToRoom } = await import('./socket.js');
        broadcastToRoom(roomId, colors.boldRed(`${socket.username} collapses to the ground!`), socket.playerId);
      } else if (damageResult.stateChange === 'death') {
        // Import handleActualDeath from combat to handle death with item dropping
        const { handleActualDeath } = await import('./combat.js');
        await handleActualDeath(socket, null, roomId);
      }
    }

    // Process HoT healing (only if player is still alive to prevent unintended revival)
    if (definition.tickHealingMin !== undefined && definition.tickHealingMax !== undefined && socket.vitals.hp > 0) {
      // Roll random value in range, multiplied by stack count
      const baseHealing = rollRange(definition.tickHealingMin, definition.tickHealingMax);
      const totalHealing = baseHealing * effect.stacks;

      const oldHp = socket.vitals.hp;
      socket.vitals.hp = Math.min(socket.vitals.maxHp, socket.vitals.hp + totalHealing);
      const actualHealing = socket.vitals.hp - oldHp;

      if (actualHealing > 0) {
        vitalsChanged = true;

        // Show tick message unless silentTick is true
        if (!definition.silentTick) {
          if (definition.tickMessage) {
            // Use custom tick message
            sendMessage(socket, MessageType.SYSTEM, colors.green(definition.tickMessage));
          } else {
            // Default tick message with healing amount
            sendMessage(
              socket,
              MessageType.SYSTEM,
              `${colors.green(definition.name)} heals you for ${colors.green(actualHealing.toString())} HP.`
            );
          }
        }
      }
    }
  }

  // Remove expired effects
  for (const effectId of expiredEffects) {
    const definition = getEffectDefinition(effectId);
    socket.activeEffects.delete(effectId);
    await statusEffectRepo.removeEffect(socket.characterId!, effectId);

    // Update legacy isPoisoned flag
    if (effectId === 'poisoned') {
      socket.regenState.isPoisoned = false;
    }

    if (definition) {
      // Use custom wear-off message or default
      const wearOffMsg = definition.wearOffMessage || `${definition.name} has worn off.`;
      sendMessage(
        socket,
        MessageType.SYSTEM,
        colors.gray(wearOffMsg)
      );
    }
  }

  // Send updated vitals if anything changed
  if (vitalsChanged) {
    sendVitals(socket);
  }
}

// ============================================================================
// Persistence and Loading
// ============================================================================

/**
 * Load active effects from database when a character logs in.
 * Also cleans up any expired effects.
 */
export async function loadEffectsFromDb(socket: AuthenticatedSocket): Promise<void> {
  // Initialize the effects map
  socket.activeEffects = new Map();

  // Clean up expired effects in the database
  await statusEffectRepo.removeExpiredEffects(socket.characterId!);

  // Load active effects
  const effects = await statusEffectRepo.getActiveEffects(socket.characterId!);

  for (const effect of effects) {
    socket.activeEffects.set(effect.definitionId, effect);

    // Update legacy isPoisoned flag for regen system compatibility
    if (effect.definitionId === 'poisoned') {
      socket.regenState.isPoisoned = true;
    }
  }

  if (effects.length > 0) {
    console.log(`Loaded ${effects.length} active effect(s) for character ${socket.characterId}`);
  }
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get a formatted list of active effects for display
 */
export function getActiveEffectsDisplay(socket: AuthenticatedSocket): Array<{
  name: string;
  category: StatusEffectCategory;
  remainingMs: number;
  stacks: number;
}> {
  const result: Array<{
    name: string;
    category: StatusEffectCategory;
    remainingMs: number;
    stacks: number;
  }> = [];

  if (!socket.activeEffects) {
    return result;
  }

  const now = Date.now();

  for (const [, effect] of socket.activeEffects) {
    if (effect.expiresAt <= now) {
      continue;
    }

    const definition = getEffectDefinition(effect.definitionId);
    if (!definition) {
      continue;
    }

    result.push({
      name: definition.name,
      category: definition.category,
      remainingMs: effect.expiresAt - now,
      stacks: effect.stacks,
    });
  }

  // Sort by category, then by remaining time
  result.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.remainingMs - b.remainingMs;
  });

  return result;
}

/**
 * Get active effects for any CombatEntity (players and NPCs).
 * Returns display-ready effect info sorted by category then remaining time.
 */
export function getEntityActiveEffects(entity: CombatEntity): Array<{
  name: string;
  category: StatusEffectCategory;
  remainingMs: number;
  stacks: number;
}> {
  const result: Array<{
    name: string;
    category: StatusEffectCategory;
    remainingMs: number;
    stacks: number;
  }> = [];

  if (!entity.activeEffects || entity.activeEffects.size === 0) {
    return result;
  }

  const now = Date.now();

  for (const [, effect] of entity.activeEffects) {
    if (effect.expiresAt <= now) continue;

    const definition = getEffectDefinition(effect.definitionId);
    if (!definition) continue;

    result.push({
      name: definition.name,
      category: definition.category,
      remainingMs: effect.expiresAt - now,
      stacks: effect.stacks,
    });
  }

  result.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.remainingMs - b.remainingMs;
  });

  return result;
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  // Include seconds for consistency with shorter duration formatting
  if (remainingMinutes > 0 && seconds > 0) {
    return `${hours}h ${remainingMinutes}m ${seconds}s`;
  } else if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  } else if (seconds > 0) {
    return `${hours}h ${seconds}s`;
  }
  return `${hours}h`;
}
