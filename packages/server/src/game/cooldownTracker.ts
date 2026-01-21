/**
 * Cooldown Tracker Module
 *
 * Manages ability cooldowns separate from action delays.
 * Supports individual ability cooldowns and shared cooldown groups.
 *
 * ## Cooldown Start Modes
 *
 * Abilities can be configured to start their cooldown at different times:
 *
 * - **startOnUse** ('use' mode): Cooldown begins immediately when the ability
 *   is initiated, before it completes. If the ability is interrupted, the
 *   cooldown is still active. Use this for abilities where you want to prevent
 *   spam attempts (e.g., bash, kick).
 *
 * - **startOnComplete** ('complete' mode): Cooldown begins only after the
 *   ability successfully finishes. If the ability is interrupted, no cooldown
 *   is applied and the player can retry immediately. Use this for abilities
 *   where failure shouldn't penalize the player (e.g., healing spells).
 *
 * ## Examples
 *
 * ```
 * bash:  startOnUse=true  -> Interrupted bash still triggers 8s cooldown
 * heal:  startOnComplete=true -> Interrupted heal has no cooldown penalty
 * ```
 *
 * For instant abilities (no cast time), both modes effectively trigger at
 * the same moment, so the config flags determine which one applies.
 */

import type { AuthenticatedSocket } from './socket.js';
import {
  getCooldownConfig,
  getCooldownGroup,
} from '../config/commandQueueConfig.js';

/**
 * Check if an ability is currently on cooldown for a player
 *
 * @param player - The player to check
 * @param abilityName - The ability name (e.g., 'bash', 'kick', 'heal')
 * @returns true if the ability is on cooldown, false if ready
 */
export function isOnCooldown(player: AuthenticatedSocket, abilityName: string): boolean {
  const now = Date.now();

  // Check ability's own cooldown
  const abilityCooldown = player.queueState.cooldowns[abilityName];
  if (abilityCooldown && abilityCooldown.readyAt > now) {
    return true;
  }

  // Check shared cooldown group
  const cooldownConfig = getCooldownConfig(abilityName);
  if (cooldownConfig?.sharedCooldownGroup) {
    const groupCooldown = player.queueState.cooldowns[cooldownConfig.sharedCooldownGroup];
    if (groupCooldown && groupCooldown.readyAt > now) {
      return true;
    }
  }

  return false;
}

/**
 * Get the remaining cooldown time for an ability in milliseconds
 *
 * @param player - The player to check
 * @param abilityName - The ability name
 * @returns Remaining cooldown in ms, or 0 if ready
 */
export function getRemainingCooldown(player: AuthenticatedSocket, abilityName: string): number {
  const now = Date.now();
  let maxRemaining = 0;

  // Check ability's own cooldown
  const abilityCooldown = player.queueState.cooldowns[abilityName];
  if (abilityCooldown && abilityCooldown.readyAt > now) {
    maxRemaining = Math.max(maxRemaining, abilityCooldown.readyAt - now);
  }

  // Check shared cooldown group
  const cooldownConfig = getCooldownConfig(abilityName);
  if (cooldownConfig?.sharedCooldownGroup) {
    const groupCooldown = player.queueState.cooldowns[cooldownConfig.sharedCooldownGroup];
    if (groupCooldown && groupCooldown.readyAt > now) {
      maxRemaining = Math.max(maxRemaining, groupCooldown.readyAt - now);
    }
  }

  return maxRemaining;
}

/**
 * Start the cooldown for an ability
 * Also triggers shared cooldown group if configured
 *
 * The cooldown only starts if the ability's config allows it for the given mode:
 * - 'use': Only triggers if config has startOnUse=true (ability initiated)
 * - 'complete': Only triggers if config has startOnComplete=true (ability finished)
 *
 * For instant abilities, callers should invoke both modes; the config flags
 * determine which one actually starts the cooldown.
 *
 * @param player - The player using the ability
 * @param abilityName - The ability name (e.g., spell mnemonic or skill name)
 * @param mode - 'use' when ability starts, 'complete' when ability finishes
 */
export function startCooldown(
  player: AuthenticatedSocket,
  abilityName: string,
  mode: 'use' | 'complete' = 'use'
): void {
  const cooldownConfig = getCooldownConfig(abilityName);
  if (!cooldownConfig) {
    // No cooldown configured for this ability
    return;
  }

  // Check if we should start cooldown in this mode
  if (mode === 'use' && !cooldownConfig.startOnUse) {
    return;
  }
  if (mode === 'complete' && !cooldownConfig.startOnComplete) {
    return;
  }

  const now = Date.now();
  const readyAt = now + cooldownConfig.cooldownMs;

  // Set ability's own cooldown
  player.queueState.cooldowns[abilityName] = { readyAt };

  // Handle shared cooldown group
  if (cooldownConfig.sharedCooldownGroup) {
    const groupName = cooldownConfig.sharedCooldownGroup;
    const group = getCooldownGroup(groupName);

    // Set group cooldown
    player.queueState.cooldowns[groupName] = { readyAt };

    // Trigger cooldown for all abilities in the group
    if (group?.triggersCooldownFor) {
      for (const otherAbility of group.triggersCooldownFor) {
        if (otherAbility !== abilityName) {
          // Use the other ability's configured cooldown, not the triggering ability's
          const otherConfig = getCooldownConfig(otherAbility);
          if (otherConfig) {
            const otherReadyAt = now + otherConfig.cooldownMs;
            player.queueState.cooldowns[otherAbility] = { readyAt: otherReadyAt };
          }
        }
      }
    }
  }

  console.log(
    `[CooldownTracker] Started cooldown for ${abilityName} ` +
    `(${cooldownConfig.cooldownMs}ms, group: ${cooldownConfig.sharedCooldownGroup ?? 'none'})`
  );
}

/**
 * Clear a specific cooldown for a player (admin/debug use)
 *
 * @param player - The player
 * @param abilityName - The ability to clear cooldown for
 */
export function clearCooldown(player: AuthenticatedSocket, abilityName: string): void {
  delete player.queueState.cooldowns[abilityName];

  // Also clear group cooldown if applicable
  const cooldownConfig = getCooldownConfig(abilityName);
  if (cooldownConfig?.sharedCooldownGroup) {
    delete player.queueState.cooldowns[cooldownConfig.sharedCooldownGroup];
  }
}

/**
 * Clear all cooldowns for a player (e.g., on death or level up)
 *
 * @param player - The player
 */
export function clearAllCooldowns(player: AuthenticatedSocket): void {
  player.queueState.cooldowns = {};
}

/**
 * Get a formatted display name for an ability (capitalize first letter)
 *
 * @param abilityName - The ability name (e.g., 'bash')
 * @returns Formatted name (e.g., 'Bash')
 */
export function formatAbilityName(abilityName: string): string {
  return abilityName.charAt(0).toUpperCase() + abilityName.slice(1);
}

/**
 * Get the cooldown message for an ability that's not ready
 *
 * @param abilityName - The ability name
 * @returns Message like "Bash is not ready yet!"
 */
export function getCooldownMessage(abilityName: string): string {
  return `${formatAbilityName(abilityName)} is not ready yet!`;
}
