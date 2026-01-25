/**
 * Centralized Damage Handler
 *
 * Manages all damage application and state transitions for the drop-to-ground
 * and purgatory death mechanics. This module is the single source of truth
 * for handling damage that could result in state changes.
 */

import { MessageType, DeathState } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { getMaxNegativeHpPercent } from '../db/repositories/settingsRepository.js';
import { colors } from '../utils/colors.js';

export type DamageSource = 'melee' | 'spell' | 'dot' | 'environmental';

export type StateChange = 'none' | 'dropped' | 'death';

export interface DamageResult {
  damage: number;
  newHp: number;
  stateChange: StateChange;
  previousState: 'normal' | 'dropped' | 'aided';
}

/**
 * Apply damage to a player with proper state transitions.
 *
 * This is the ONLY function that should be used to apply damage that could
 * kill a player. It handles:
 * - Allowing HP to go negative (unlike the old Math.max(0, hp - damage))
 * - Transitioning from normal to dropped state
 * - Transitioning from dropped to death (purgatory)
 * - Resetting aided status when attacked
 *
 * @param socket The player socket to damage
 * @param damage Amount of damage to apply
 * @param source What caused the damage (for messaging purposes)
 * @returns DamageResult with new HP and any state change
 */
export async function applyDamage(
  socket: AuthenticatedSocket,
  damage: number,
  _source: DamageSource
): Promise<DamageResult> {
  const previousHp = socket.vitals.hp;
  const maxHp = socket.vitals.maxHp;

  // Calculate death threshold: -(maxHp * percent / 100)
  const negativePercent = await getMaxNegativeHpPercent();
  const deathThreshold = -Math.floor(maxHp * negativePercent / 100);

  // Apply damage (allow negative HP)
  const newHp = previousHp - damage;
  socket.vitals.hp = newHp;

  // Determine previous state
  let previousState: 'normal' | 'dropped' | 'aided' = 'normal';
  if (socket.deathState?.isDropped) {
    previousState = socket.deathState.isAided ? 'aided' : 'dropped';
  }

  // If player was aided and is being attacked, cancel aided status
  if (socket.deathState?.isAided) {
    socket.deathState.isAided = false;
  }

  // Determine state change
  let stateChange: StateChange = 'none';

  // Already dead - no further state changes
  if (socket.deathState?.isDead) {
    return {
      damage,
      newHp,
      stateChange: 'none',
      previousState,
    };
  }

  // Check for death (HP at or below death threshold)
  if (newHp <= deathThreshold) {
    stateChange = 'death';
  }
  // Check for dropped state (HP at or below 0, above death threshold, not already dropped)
  else if (newHp <= 0 && !socket.deathState?.isDropped) {
    stateChange = 'dropped';
  }

  return {
    damage,
    newHp,
    stateChange,
    previousState,
  };
}

/**
 * Initialize the dropped state for a player.
 * Called when a player's HP drops to 0 or below (but above death threshold).
 */
export function initializeDroppedState(
  socket: AuthenticatedSocket,
  roomId: number
): void {
  socket.deathState = {
    isDropped: true,
    isAided: false,
    isDead: false,
    deathRoomId: roomId,
    droppedAt: Date.now(),
  };
}

/**
 * Initialize the dead (purgatory) state for a player.
 * Called when a player's HP drops below the death threshold.
 */
export function initializeDeadState(
  socket: AuthenticatedSocket,
  roomId: number
): void {
  socket.deathState = {
    isDropped: false,
    isAided: false,
    isDead: true,
    deathRoomId: roomId,
    droppedAt: undefined,
  };
}

/**
 * Clear the death state, returning player to normal.
 * Called when player respawns or is healed above 0 HP.
 */
export function clearDeathState(socket: AuthenticatedSocket): void {
  socket.deathState = null;
}

/**
 * Check if a player is in the dropped state (on the ground, not dead).
 */
export function isPlayerDropped(socket: AuthenticatedSocket): boolean {
  return socket.deathState?.isDropped === true && !socket.deathState?.isDead;
}

/**
 * Check if a player is dead (in purgatory).
 */
export function isPlayerDead(socket: AuthenticatedSocket): boolean {
  return socket.deathState?.isDead === true;
}

/**
 * Check if a player has been aided (stabilized by another player).
 */
export function isPlayerAided(socket: AuthenticatedSocket): boolean {
  return socket.deathState?.isAided === true;
}

/**
 * Set the aided status for a dropped player.
 */
export function setPlayerAided(socket: AuthenticatedSocket, aided: boolean): void {
  if (socket.deathState?.isDropped) {
    socket.deathState.isAided = aided;
  }
}

/**
 * Get the death room ID where player died/dropped.
 */
export function getDeathRoomId(socket: AuthenticatedSocket): number | undefined {
  return socket.deathState?.deathRoomId;
}

/**
 * Format the dropped state message for the player.
 */
export function formatDroppedMessage(): string {
  return colors.boldRed('You collapse to the ground!') + '\r\n' +
    colors.yellow('You are bleeding out. Someone must aid you, or you will die.');
}

/**
 * Format the death message for the player.
 */
export function formatDeathMessage(): string {
  return colors.boldRed('You have died!') + '\r\n' +
    colors.gray('Your belongings scatter across the ground.') + '\r\n' +
    colors.yellow('Type "respawn" to return to life at a safe location.');
}
