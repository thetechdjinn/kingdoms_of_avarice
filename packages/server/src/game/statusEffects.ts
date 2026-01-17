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
import { parseDiceString } from './combatCalculations.js';
import { AuthenticatedSocket } from './socket.js';
import { colors } from '../utils/colors.js';
import { MessageType } from '@koa/shared';

// ============================================================================
// Effect Registry - Loaded from database with fallback to defaults
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
 */
export const EFFECT_REGISTRY: Record<string, StatusEffectDefinition> = {
  // === BUFFS ===
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
  hasted: {
    id: 'hasted',
    name: 'Hasted',
    description: 'Your movements are quickened.',
    category: StatusEffectCategory.BUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    energyModifier: 25, // +25% attack energy
    wearOffMessage: 'Your movements return to normal.',
  },
  strengthened: {
    id: 'strengthened',
    name: 'Strengthened',
    description: 'Magical strength enhances your blows.',
    category: StatusEffectCategory.BUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    damageModifier: 15, // +15% damage
    wearOffMessage: 'The surge of strength fades.',
  },

  // === DEBUFFS (for future use with NPCs) ===
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
  slowed: {
    id: 'slowed',
    name: 'Slowed',
    description: 'Your movements are sluggish.',
    category: StatusEffectCategory.DEBUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    energyModifier: -25, // -25% attack energy
  },
  blinded: {
    id: 'blinded',
    name: 'Blinded',
    description: 'You cannot see clearly.',
    category: StatusEffectCategory.DEBUFF,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    isBlind: true,
  },

  // === DAMAGE OVER TIME ===
  poisoned: {
    id: 'poisoned',
    name: 'Poisoned',
    description: 'Poison courses through your veins.',
    category: StatusEffectCategory.DOT,
    stackingBehavior: StackingBehavior.STACK,
    maxStacks: 3,
    tickDamage: '1d4',
    tickMessage: 'You feel sick.',
    wearOffMessage: 'The poison fades from your system.',
    blocksRegen: true,
  },
  burning: {
    id: 'burning',
    name: 'Burning',
    description: 'You are on fire!',
    category: StatusEffectCategory.DOT,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    tickDamage: '1d6',
    tickMessage: 'You are burning!',
    wearOffMessage: 'The flames die out.',
  },

  // === HEALING OVER TIME ===
  regenerating: {
    id: 'regenerating',
    name: 'Regenerating',
    description: 'Your wounds heal rapidly.',
    category: StatusEffectCategory.HOT,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    tickHealing: '1d6',
    silentTick: true,  // Passive healing - no spam
    wearOffMessage: 'Your regeneration fades.',
  },

  // === CONTROL ===
  entangled: {
    id: 'entangled',
    name: 'Entangled',
    description: 'Vines restrict your movement.',
    category: StatusEffectCategory.CONTROL,
    stackingBehavior: StackingBehavior.REFRESH,
    maxStacks: 1,
    blocksMovement: true,
    energyModifier: -50, // -50% attack energy
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

  const stackInfo = effect.stacks > 1 ? ` (${effect.stacks} stacks)` : '';
  return {
    success: true,
    message: `You are now ${colors.yellow(definition.name)}${stackInfo}!`,
  };
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
export function hasEffect(socket: AuthenticatedSocket, effectId: string): boolean {
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
export function getEffectModifiers(socket: AuthenticatedSocket): EffectModifiers {
  const modifiers: EffectModifiers = {
    accuracyModifier: 0,
    defenseModifier: 0,
    energyModifier: 0,
    damageModifier: 0,
    blocksRegen: false,
    blocksMovement: false,
    isBlind: false,
  };

  if (!socket.activeEffects) {
    return modifiers;
  }

  const now = Date.now();

  for (const [, effect] of socket.activeEffects) {
    // Skip expired effects
    if (effect.expiresAt <= now) {
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

    // Boolean flags don't stack - any one effect sets them
    if (definition.blocksRegen) modifiers.blocksRegen = true;
    if (definition.blocksMovement) modifiers.blocksMovement = true;
    if (definition.isBlind) modifiers.isBlind = true;
  }

  return modifiers;
}

/**
 * Check if any active effect blocks regeneration
 */
export function shouldBlockRegen(socket: AuthenticatedSocket): boolean {
  return getEffectModifiers(socket).blocksRegen;
}

/**
 * Check if any active effect blocks movement
 */
export function shouldBlockMovement(socket: AuthenticatedSocket): boolean {
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

    // Process DoT damage
    if (definition.tickDamage) {
      const damageResult = parseDiceString(definition.tickDamage);
      const totalDamage = damageResult.roll * effect.stacks;

      socket.vitals.hp = Math.max(0, socket.vitals.hp - totalDamage);
      vitalsChanged = true;

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

      // Check for death from DoT
      if (socket.vitals.hp <= 0) {
        sendMessage(
          socket,
          MessageType.SYSTEM,
          colors.red('You have been slain!')
        );
        // Death handling will be done by the caller
      }
    }

    // Process HoT healing
    if (definition.tickHealing) {
      const healResult = parseDiceString(definition.tickHealing);
      const totalHealing = healResult.roll * effect.stacks;

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
