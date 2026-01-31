/**
 * Stealth State Management Module
 *
 * Handles stealth state transitions (none/sneaking/hidden) and validation
 * for characters with stealth abilities.
 *
 * Based on MajorMUD mechanics - see notes/Stealth_Implementation_Plan.md
 */

import { StealthMode, MessageType } from '@koa/shared';
import { AuthenticatedSocket, broadcastToRoom, sendMessage, sendVitals } from '../socket.js';
import { getPlayerLocation } from '../adminCommands.js';
import { colors } from '../../utils/colors.js';
import { characterHasStealth } from '../stats/secondaryStats.js';

// ============================================================================
// STEALTH STATE CHECKS
// ============================================================================

/**
 * Check if a character is currently in combat
 */
export function isInCombat(socket: AuthenticatedSocket): boolean {
  return socket.combatState.targets.size > 0 || socket.regenState.inCombat;
}

/**
 * Check if a character is currently hidden
 */
export function isHidden(socket: AuthenticatedSocket): boolean {
  return socket.stealthMode === 'hidden';
}

/**
 * Check if a character is currently sneaking
 */
export function isSneaking(socket: AuthenticatedSocket): boolean {
  return socket.stealthMode === 'sneaking';
}

/**
 * Check if a character is in any stealth mode (hidden or sneaking)
 */
export function isStealthing(socket: AuthenticatedSocket): boolean {
  return socket.stealthMode !== 'none';
}

/**
 * Get the current stealth mode of a character
 */
export function getStealthMode(socket: AuthenticatedSocket): StealthMode {
  return socket.stealthMode;
}

// ============================================================================
// STEALTH VALIDATION
// ============================================================================

export interface StealthValidation {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate if a character can enter stealth mode
 *
 * Checks:
 * - Character has stealth ability (from race or class)
 * - Not currently in combat
 * - Not currently dead or dropped
 */
export async function canEnterStealth(
  socket: AuthenticatedSocket,
  race: string,
  characterClass: string
): Promise<StealthValidation> {
  // Check if character has stealth capability
  const hasStealth = await characterHasStealth(race, characterClass);
  if (!hasStealth) {
    return {
      allowed: false,
      reason: 'You do not have stealth abilities.',
    };
  }

  // Check if in combat (MajorMUD-style message)
  if (isInCombat(socket)) {
    return {
      allowed: false,
      reason: 'You may not hide right now!',
    };
  }

  // Check if dead or dropped
  if (socket.deathState?.isDead) {
    return {
      allowed: false,
      reason: 'You cannot hide while dead.',
    };
  }
  if (socket.deathState?.isDropped) {
    return {
      allowed: false,
      reason: 'You cannot hide while on the ground.',
    };
  }

  return { allowed: true };
}

/**
 * Validate if a character can enter sneak mode specifically
 * (Same checks as canEnterStealth, but with sneak-specific messages)
 */
export async function canEnterSneak(
  socket: AuthenticatedSocket,
  race: string,
  characterClass: string
): Promise<StealthValidation> {
  // Check if character has stealth capability
  const hasStealth = await characterHasStealth(race, characterClass);
  if (!hasStealth) {
    return {
      allowed: false,
      reason: 'You do not have stealth abilities.',
    };
  }

  // Check if in combat (MajorMUD-style message)
  if (isInCombat(socket)) {
    return {
      allowed: false,
      reason: 'You may not sneak right now!',
    };
  }

  // Check if dead or dropped
  if (socket.deathState?.isDead) {
    return {
      allowed: false,
      reason: 'You cannot sneak while dead.',
    };
  }
  if (socket.deathState?.isDropped) {
    return {
      allowed: false,
      reason: 'You cannot sneak while on the ground.',
    };
  }

  return { allowed: true };
}

// ============================================================================
// STEALTH STATE TRANSITIONS
// ============================================================================

/**
 * Set the stealth mode for a character
 * Does not perform validation - use canEnterStealth first
 */
export function setStealthMode(socket: AuthenticatedSocket, mode: StealthMode): void {
  socket.stealthMode = mode;
  // Update vitals to reflect new stealth status
  sendVitals(socket);
}

/**
 * Clear stealth mode (set to 'none')
 */
export function clearStealthMode(socket: AuthenticatedSocket): void {
  socket.stealthMode = 'none';
  sendVitals(socket);
}

// ============================================================================
// STEALTH BREAKING
// ============================================================================

/**
 * Reasons why stealth can be broken
 */
export type StealthBreakReason =
  | 'attack'         // Player attacked someone
  | 'attacked'       // Player was attacked
  | 'spell_cast'     // Player cast a spell
  | 'social_action'  // Player used a social action targeting someone
  | 'movement_failed'// Player failed a sneak movement check
  | 'searched'       // Player was found by search
  | 'aoe_hit'        // Player was hit by an AoE spell
  | 'manual';        // Player manually exited stealth

/**
 * Get the message to display when stealth is broken
 */
function getBreakStealthMessage(reason: StealthBreakReason): string {
  switch (reason) {
    case 'attack':
      return 'You emerge from the shadows to attack!';
    case 'attacked':
      return 'You have been spotted!';
    case 'spell_cast':
      return 'Casting a spell breaks your cover!';
    case 'social_action':
      return 'Your action reveals your presence!';
    case 'movement_failed':
      return 'You make a sound as you enter the room!';
    case 'searched':
      return 'You have been discovered!';
    case 'aoe_hit':
      return 'The spell reveals your position!';
    case 'manual':
      return 'You step out of the shadows.';
    default:
      return 'You are no longer hidden.';
  }
}

/**
 * Break stealth mode and notify the player
 *
 * @param socket - The player's socket
 * @param reason - Why stealth was broken
 * @param notifyRoom - If true, also notify players in the room
 */
export function breakStealth(
  socket: AuthenticatedSocket,
  reason: StealthBreakReason,
  notifyRoom: boolean = false
): void {
  // Only break if actually in stealth
  if (socket.stealthMode === 'none') {
    return;
  }

  const wasHidden = socket.stealthMode === 'hidden';
  const message = getBreakStealthMessage(reason);

  // Clear stealth mode
  socket.stealthMode = 'none';

  // Notify the player (red for warnings)
  sendMessage(socket, MessageType.OUTPUT, colors.red(message));

  // Notify the room if requested and player was hidden
  if (notifyRoom && wasHidden) {
    const roomId = getPlayerLocation(socket.playerId);
    broadcastToRoom(
      roomId,
      colors.green(`${colors.red(socket.username)} emerges from the shadows!`),
      socket.playerId
    );
  }

  // Update vitals to reflect cleared stealth status
  sendVitals(socket);
}

/**
 * Break stealth silently (no message to player)
 * Used when stealth naturally ends (e.g., logout cleanup)
 */
export function breakStealthSilent(socket: AuthenticatedSocket): void {
  socket.stealthMode = 'none';
}
