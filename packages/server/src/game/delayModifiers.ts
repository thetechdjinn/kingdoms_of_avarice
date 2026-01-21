/**
 * Delay Modifiers Module
 *
 * Extracts and applies delay modifiers from status effects with proper stacking rules.
 * Supports action-specific modifiers and category-based stacking (bestOnly, worstOnly, etc.)
 *
 * ## How Speed Modifiers Work
 *
 * Speed modifiers are expressed as percentages that modify action delays:
 * - **Negative values = FASTER** (e.g., -20 means 20% faster, delay × 0.8)
 * - **Positive values = SLOWER** (e.g., +50 means 50% slower, delay × 1.5)
 *
 * ## Stacking Rules
 *
 * To prevent abuse (e.g., stacking 10 haste spells), speed modifiers use
 * category-based stacking rules:
 *
 * ### Speed Buffs (speedBuff category) - Rule: "bestOnly"
 * Only the strongest speed buff applies. Multiple haste effects don't stack.
 *
 * Example:
 * - Hasted (-20%) + Minor Haste (-10%) + Speed Potion (-15%)
 * - Result: -20% (only the best buff applies)
 *
 * ### Speed Debuffs (speedDebuff category) - Rule: "worstOnly"
 * Only the strongest speed debuff applies. Multiple slow effects don't stack.
 *
 * Example:
 * - Slowed (+50%) + Chilled (+30%) + Exhausted (+20%)
 * - Result: +50% (only the worst debuff applies)
 *
 * ### Combined Buffs and Debuffs
 * After applying category rules, the results ADD together:
 *
 * Example:
 * - Hasted (-20%) + Slowed (+50%)
 * - Speed buff result: -20% (best buff)
 * - Speed debuff result: +50% (worst debuff)
 * - Final: -20% + 50% = +30% slower overall
 *
 * ## Delay Calculation
 *
 * The final delay multiplier is: 1 + (totalModifier / 100)
 *
 * Examples:
 * - No effects: multiplier = 1.0 (normal speed)
 * - Hasted (-20%): multiplier = 0.8 (20% faster)
 * - Slowed (+50%): multiplier = 1.5 (50% slower)
 * - Hasted + Slowed (+30%): multiplier = 1.3 (30% slower)
 *
 * Minimum multiplier is capped at 0.1 (cannot go faster than 10x normal speed).
 */

import type { AuthenticatedSocket } from './socket.js';
import { getEffectDefinition } from './statusEffects.js';
import { getCommandQueueConfig } from '../config/commandQueueConfig.js';

/**
 * A delay modifier extracted from a status effect
 */
export interface DelayModifier {
  /** Source effect ID */
  effectId: string;
  /** Modifier value as percentage: -20 = 20% faster, +50 = 50% slower */
  value: number;
  /** Stacking category (e.g., 'speedBuff', 'speedDebuff') */
  category?: string;
  /** Actions this modifier affects (empty = all actions) */
  affectsActions?: string[];
}

/**
 * Extract all delay modifiers from a player's active status effects
 *
 * @param player - The player to check
 * @returns Array of delay modifiers from active effects
 */
export function extractDelayModifiers(player: AuthenticatedSocket): DelayModifier[] {
  const modifiers: DelayModifier[] = [];

  if (!player.activeEffects) {
    return modifiers;
  }

  const now = Date.now();

  for (const [effectId, effect] of player.activeEffects) {
    // Skip expired effects
    if (effect.expiresAt <= now) {
      continue;
    }

    const definition = getEffectDefinition(effectId);
    if (!definition || !definition.speedModifier) {
      continue;
    }

    // Determine stacking category based on effect type
    // Negative speedModifier = faster (buff), Positive = slower (debuff)
    const category = definition.speedModifier < 0 ? 'speedBuff' : 'speedDebuff';

    // Multiply by stacks for stackable effects
    const modifierValue = definition.speedModifier * effect.stacks;

    modifiers.push({
      effectId,
      value: modifierValue,
      category,
      affectsActions: definition.affectsActions,
    });
  }

  return modifiers;
}

/**
 * Apply stacking rules to a set of modifiers and return the final multiplier
 *
 * Stacking rules from config:
 * - haste: bestOnly (speedBuff category)
 * - slow: worstOnly (speedDebuff category)
 *
 * @param modifiers - Array of delay modifiers
 * @param actionType - The action type being performed (for action-specific filtering)
 * @returns Final delay multiplier (< 1 = faster, > 1 = slower)
 */
export function applyStackingRules(
  modifiers: DelayModifier[],
  actionType?: string
): number {
  const config = getCommandQueueConfig();
  const stackingRules = config.stackingRules;

  // Filter modifiers by action type if specified
  const applicableModifiers = modifiers.filter(mod => {
    if (!mod.affectsActions || mod.affectsActions.length === 0) {
      return true; // Global modifier applies to all actions
    }
    return !actionType || mod.affectsActions.includes(actionType);
  });

  if (applicableModifiers.length === 0) {
    return 1.0;
  }

  // Group modifiers by category
  const byCategory = new Map<string, DelayModifier[]>();
  const uncategorized: DelayModifier[] = [];

  for (const mod of applicableModifiers) {
    if (mod.category) {
      const existing = byCategory.get(mod.category) || [];
      existing.push(mod);
      byCategory.set(mod.category, existing);
    } else {
      uncategorized.push(mod);
    }
  }

  // Calculate final modifier value for each category
  let totalModifier = 0;

  // Process categorized modifiers with stacking rules
  for (const [category, categoryModifiers] of byCategory) {
    // Find the stacking rule for this category
    let rule = 'additive'; // Default
    let ruleCap: { min: number; max: number } | undefined;

    // Check stacking rules for this category
    for (const [ruleName, ruleConfig] of Object.entries(stackingRules)) {
      if (ruleConfig.category === category) {
        rule = ruleConfig.rule;
        ruleCap = ruleConfig.cap;
        break;
      }
    }

    const values = categoryModifiers.map(m => m.value);
    let categoryValue: number;

    switch (rule) {
      case 'bestOnly':
        // For speed buffs, "best" means most negative (fastest)
        categoryValue = Math.min(...values);
        break;

      case 'worstOnly':
        // For speed debuffs, "worst" means most positive (slowest)
        categoryValue = Math.max(...values);
        break;

      case 'multiplicative':
        // Convert percentages to multipliers, multiply, convert back
        let multiplier = 1;
        for (const val of values) {
          multiplier *= (1 + val / 100);
        }
        // Convert back to percentage change
        categoryValue = (multiplier - 1) * 100;
        break;

      case 'additive':
      default:
        // Simply add all values
        categoryValue = values.reduce((sum, val) => sum + val, 0);
        break;
    }

    // Apply cap if specified
    if (ruleCap) {
      const cappedMultiplier = Math.max(ruleCap.min, Math.min(ruleCap.max, 1 + categoryValue / 100));
      categoryValue = (cappedMultiplier - 1) * 100;
    }

    totalModifier += categoryValue;
  }

  // Add uncategorized modifiers (additive by default)
  for (const mod of uncategorized) {
    totalModifier += mod.value;
  }

  // Convert percentage to multiplier
  // totalModifier is percentage: -20 = 20% faster, +50 = 50% slower
  const finalMultiplier = 1 + (totalModifier / 100);

  // Ensure minimum multiplier of 0.1 (90% speed increase cap)
  return Math.max(0.1, finalMultiplier);
}

/**
 * Get the total delay multiplier for a player from all status effects
 * This is the main function called by the delay calculator
 *
 * @param player - The player to check
 * @param actionType - Optional action type for action-specific modifiers
 * @returns Delay multiplier (< 1 = faster, > 1 = slower)
 */
export function getStatusEffectDelayMultiplier(
  player: AuthenticatedSocket,
  actionType?: string
): number {
  const modifiers = extractDelayModifiers(player);
  return applyStackingRules(modifiers, actionType);
}

/**
 * Get a description of active delay modifiers for display
 *
 * @param player - The player to check
 * @returns Array of modifier descriptions
 */
export function getDelayModifierDescriptions(player: AuthenticatedSocket): string[] {
  const modifiers = extractDelayModifiers(player);
  const descriptions: string[] = [];

  for (const mod of modifiers) {
    const definition = getEffectDefinition(mod.effectId);
    if (!definition) continue;

    const sign = mod.value < 0 ? '' : '+';
    const effect = mod.value < 0 ? 'faster' : 'slower';
    descriptions.push(`${definition.name}: ${sign}${mod.value}% ${effect}`);
  }

  return descriptions;
}
