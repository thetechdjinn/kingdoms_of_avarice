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
import type { CombatEntity } from '../combatEntity.js';
import { getPlayerLocation } from '../adminCommands.js';
import { colors } from '../../utils/colors.js';
import { characterHasStealth } from '../stats/secondaryStats.js';

// ============================================================================
// STEALTH STATE CHECKS
// ============================================================================

/**
 * Check if a character is currently in combat
 */
export function isInCombat(entity: CombatEntity): boolean {
  return entity.combatState.targets.size > 0 || entity.regenState.inCombat;
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
  | 'rest'           // Player sat down to rest
  | 'manual';        // Player manually exited stealth

/**
 * Break message with color information
 */
interface BreakStealthMessage {
  text: string;
  isWarning: boolean;  // true = red (danger/warning), false = yellow (neutral action)
}

/**
 * Get the message to display when stealth is broken
 *
 * Messages are categorized by semantic meaning:
 * - Warnings (red): External forces breaking your cover (attacked, discovered, failed)
 * - Neutral (yellow): Voluntary or combat-initiated actions
 */
function getBreakStealthMessage(reason: StealthBreakReason): BreakStealthMessage {
  switch (reason) {
    case 'attack':
      // Neutral - you chose to attack
      return { text: 'You emerge from the shadows!', isWarning: false };
    case 'attacked':
      // Warning - external threat
      return { text: 'You have been spotted!', isWarning: true };
    case 'spell_cast':
      // Warning - action has consequence
      return { text: 'Casting a spell breaks your cover!', isWarning: true };
    case 'social_action':
      // Warning - action has consequence
      return { text: 'Your action reveals your presence!', isWarning: true };
    case 'movement_failed':
      // Warning - failed stealth check
      return { text: 'You make a sound as you enter the room!', isWarning: true };
    case 'searched':
      // Warning - someone found you
      return { text: 'You have been discovered!', isWarning: true };
    case 'aoe_hit':
      // Warning - external spell effect
      return { text: 'The spell reveals your position!', isWarning: true };
    case 'rest':
      // Neutral - voluntary action
      return { text: 'You settle down to rest, abandoning your stealth.', isWarning: false };
    case 'manual':
      // Neutral - voluntary exit
      return { text: 'You step out of the shadows.', isWarning: false };
    default:
      return { text: 'You are no longer hidden.', isWarning: false };
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
  const { text, isWarning } = getBreakStealthMessage(reason);

  // Clear stealth mode
  socket.stealthMode = 'none';

  // Notify the player - red for warnings, yellow for neutral actions
  const coloredMessage = isWarning ? colors.red(text) : colors.yellow(text);
  sendMessage(socket, MessageType.OUTPUT, coloredMessage);

  // Notify the room if requested
  // For attacks, notify even if sneaking (not just hidden)
  // For other reasons, only notify if player was hidden
  if (notifyRoom && (wasHidden || reason === 'attack')) {
    const roomId = getPlayerLocation(socket.playerId);
    broadcastToRoom(
      roomId,
      colors.red(`${socket.username} emerges from the shadows!`),
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
