/**
 * Interrupt Handler Module
 *
 * Handles interrupting actions that are currently being executed.
 * Actions marked with canInterrupt: true can be cancelled mid-execution
 * by certain game events (bash, stun, silence, etc.)
 */

import { MessageType } from '@koa/shared';
import type { AuthenticatedSocket } from './socket.js';
import {
  getCommandQueueConfig,
  getInterruptTrigger,
  getInterruptDelayBehavior,
} from '../config/commandQueueConfig.js';
import { colors } from '../utils/colors.js';

// Reference to sendMessage function, set during initialization
let sendMessageFn: ((ws: AuthenticatedSocket, type: MessageType, payload: string) => void) | null = null;

/**
 * Initialize the interrupt handler with required references
 */
export function initializeInterruptHandler(
  sendMessage: (ws: AuthenticatedSocket, type: MessageType, payload: string) => void
): void {
  sendMessageFn = sendMessage;
}

/**
 * Result of an interrupt attempt
 */
export interface InterruptResult {
  /** Whether the interrupt was successful */
  interrupted: boolean;
  /** Message sent to the player (if any) */
  message?: string;
  /** Whether the queue was cleared */
  queueCleared: boolean;
  /** The new readyAt time (if delay was applied) */
  newReadyAt?: number;
}

/**
 * Calculate interrupt resistance from all sources
 * Returns a value between 0 and 1 representing total resistance
 */
function calculateInterruptResistance(player: AuthenticatedSocket): number {
  const config = getCommandQueueConfig();
  let totalResistance = 0;

  // TODO: Implement resistance from skills when skill system exists
  // const concentrationSkill = player.skills?.concentration ?? 0;
  // const skillSource = config.interruptResistance.sources['skill_concentration'];
  // if (skillSource && skillSource.reductionPerLevel) {
  //   const skillReduction = Math.min(
  //     concentrationSkill * skillSource.reductionPerLevel,
  //     skillSource.maxReduction ?? 1.0
  //   );
  //   totalResistance += skillReduction;
  // }

  // TODO: Implement resistance from equipment when equipment effects exist
  // TODO: Implement resistance from buffs when buff system integration exists

  return Math.min(totalResistance, 0.9); // Cap total resistance at 90%
}

/**
 * Apply delay behavior after an interrupt
 * Returns the new readyAt timestamp
 */
function applyDelayBehavior(
  player: AuthenticatedSocket,
  triggerType: string
): number {
  const config = getCommandQueueConfig();
  const behavior = getInterruptDelayBehavior(triggerType);
  const now = Date.now();

  if (!behavior) {
    // Default: no additional delay
    return now;
  }

  const currentAction = player.queueState.currentAction;
  const originalDelay = currentAction
    ? currentAction.completesAt - currentAction.startedAt
    : 0;

  switch (behavior.delayMode) {
    case 'full':
      // Apply full original delay from now
      return now + originalDelay;

    case 'partial':
      // Apply percentage of original delay from now
      const partialDelay = originalDelay * (behavior.delayPercent ?? 0.5);
      return now + partialDelay;

    case 'fixed':
      // Apply fixed delay from now
      return now + (behavior.delayMs ?? 0);

    case 'replace':
      // Replace with fixed delay (ignoring original)
      return now + (behavior.delayMs ?? 0);

    case 'cancel':
      // No delay penalty
      return now;

    default:
      return now;
  }
}

/**
 * Handle an interrupt trigger for a player
 *
 * @param player - The player being interrupted
 * @param triggerType - The type of interrupt trigger (bash, stun, silence, etc.)
 * @returns InterruptResult indicating what happened
 */
export function handleInterruptTrigger(
  player: AuthenticatedSocket,
  triggerType: string
): InterruptResult {
  const config = getCommandQueueConfig();
  const trigger = getInterruptTrigger(triggerType);

  // No trigger config for this type
  if (!trigger) {
    return { interrupted: false, queueCleared: false };
  }

  // Check if player has an interruptible action in progress
  const currentAction = player.queueState.currentAction;
  if (!currentAction) {
    return { interrupted: false, queueCleared: false };
  }

  // Check if this action can be interrupted
  if (!currentAction.canInterrupt) {
    return { interrupted: false, queueCleared: false };
  }

  // Check if this trigger affects the current action type
  if (!trigger.interrupts.includes(currentAction.type)) {
    return { interrupted: false, queueCleared: false };
  }

  // Calculate final interrupt chance with resistance
  const resistance = calculateInterruptResistance(player);
  const finalChance = Math.max(
    trigger.chance - resistance,
    config.interruptResistance.minimumChance
  );

  // Roll for interrupt
  const roll = Math.random();
  if (roll > finalChance) {
    // Interrupt failed (resisted)
    return { interrupted: false, queueCleared: false };
  }

  // Interrupt successful!
  const result: InterruptResult = {
    interrupted: true,
    queueCleared: false,
  };

  // Apply delay behavior BEFORE clearing action (needs originalDelay)
  const newReadyAt = applyDelayBehavior(player, triggerType);
  player.queueState.readyAt = newReadyAt;
  result.newReadyAt = newReadyAt;

  // Clear the current action
  player.queueState.currentAction = null;

  // Clear queue if configured
  if (trigger.clearsQueue) {
    player.queueState.commandQueue = [];
    result.queueCleared = true;
  }

  // Send interrupt message to player
  if (sendMessageFn && trigger.message) {
    sendMessageFn(player, MessageType.SYSTEM, colors.yellow(trigger.message));
    result.message = trigger.message;
  }

  console.log(
    `[InterruptHandler] Player ${player.playerId} interrupted by ${triggerType} ` +
    `(action: ${currentAction.type}, chance: ${(finalChance * 100).toFixed(0)}%, ` +
    `roll: ${(roll * 100).toFixed(0)}%)`
  );

  return result;
}

/**
 * Check if a player's current action can be interrupted by a trigger type
 * Does NOT perform the interrupt, just checks if it's possible
 */
export function canBeInterrupted(
  player: AuthenticatedSocket,
  triggerType: string
): boolean {
  const trigger = getInterruptTrigger(triggerType);
  if (!trigger) return false;

  const currentAction = player.queueState.currentAction;
  if (!currentAction) return false;
  if (!currentAction.canInterrupt) return false;
  if (!trigger.interrupts.includes(currentAction.type)) return false;

  return true;
}

/**
 * Get the list of action types that a trigger can interrupt
 */
export function getInterruptibleActions(triggerType: string): string[] {
  const trigger = getInterruptTrigger(triggerType);
  return trigger?.interrupts ?? [];
}
