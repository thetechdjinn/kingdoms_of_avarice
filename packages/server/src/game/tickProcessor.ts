/**
 * Tick Processor for Command Queue System
 *
 * Handles the processing of queued commands, including:
 * - Alias resolution
 * - Delay calculation
 * - Queue bypass detection
 * - Priority command handling
 * - Integration with existing command processing
 */

import { MessageType } from '@koa/shared';
import type { AuthenticatedSocket } from './socket.js';
import { GameWorld } from './world.js';
import { processCommand } from './commands.js';
import {
  getCommandQueueConfig,
  getActionConfig,
  getDefaultActionConfig,
  resolveAlias,
  shouldBypassQueue,
  isPriorityCommand,
  clampDelay,
  getEncumbranceMultiplier,
  getTerrainMultiplier,
} from '../config/commandQueueConfig.js';
import { enqueueCommand, setPlayerReadyAt } from './gameLoop.js';
import { getEquipmentCombatStats, calculateEncumbranceRatio } from './combatStats.js';
import { getPlayerLocation } from './adminCommands.js';
import { getEffectModifiers } from './statusEffects.js';

// References set during initialization
let gameWorldRef: GameWorld | null = null;
let connectedPlayersRef: Map<number, AuthenticatedSocket> | null = null;
let sendMessageFn: ((ws: AuthenticatedSocket, type: MessageType, payload: string) => void) | null = null;
let sendVitalsFn: ((ws: AuthenticatedSocket) => void) | null = null;

/**
 * Initialize the tick processor with required references
 */
export function initializeTickProcessor(
  gameWorld: GameWorld,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  sendMessage: (ws: AuthenticatedSocket, type: MessageType, payload: string) => void,
  sendVitals: (ws: AuthenticatedSocket) => void
): void {
  gameWorldRef = gameWorld;
  connectedPlayersRef = connectedPlayers;
  sendMessageFn = sendMessage;
  sendVitalsFn = sendVitals;
}

/**
 * Extract the command name (first word) from a command string
 */
function getCommandName(command: string): string {
  return command.trim().split(/\s+/)[0].toLowerCase();
}

/**
 * Map a command to its action type for delay calculation
 * This maps command names to action categories defined in config
 */
function getActionTypeForCommand(commandName: string): string {
  // Movement commands
  const movementCommands = ['north', 'south', 'east', 'west', 'up', 'down',
    'northeast', 'northwest', 'southeast', 'southwest', 'n', 's', 'e', 'w', 'u', 'd',
    'ne', 'nw', 'se', 'sw'];
  if (movementCommands.includes(commandName)) {
    return 'move';
  }

  // Combat commands
  const combatCommands = ['kill', 'attack', 'k', 'hit'];
  if (combatCommands.includes(commandName)) {
    return 'attack';
  }

  // Spell casting
  if (commandName === 'cast' || commandName === 'c') {
    return 'cast';
  }

  // Item manipulation
  if (commandName === 'get' || commandName === 'take' || commandName === 'pickup') {
    return 'get';
  }
  if (commandName === 'drop') {
    return 'drop';
  }

  // Information commands (typically bypass queue)
  const infoCommands = ['look', 'l', 'inventory', 'i', 'equipment', 'eq',
    'score', 'sc', 'stat', 'who', 'help', '?'];
  if (infoCommands.includes(commandName)) {
    return commandName === 'l' ? 'look' :
           commandName === 'i' ? 'inventory' :
           commandName === 'eq' ? 'equipment' :
           commandName === 'sc' ? 'score' :
           commandName;
  }

  // Communication
  if (commandName === 'say' || commandName === 'yell' || commandName === 'whisper') {
    return 'say';
  }

  // Combat abilities
  if (commandName === 'bash') {
    return 'bash';
  }

  // Default: use the command name itself as the action type
  return commandName;
}

/**
 * Calculate the delay for an action based on player state and modifiers
 */
async function calculateDelay(player: AuthenticatedSocket, actionType: string): Promise<number> {
  const config = getCommandQueueConfig();
  const actionConfig = getActionConfig(actionType) || getDefaultActionConfig();

  let delay = actionConfig.baseDelay;

  // If no base delay, skip modifier calculations
  if (delay === 0) {
    return 0;
  }

  // Check if this action is affected by encumbrance
  if (config.encumbrance.affectsActions.includes(actionType)) {
    const strength = player.characterStats?.strength || 10;

    // Get equipment stats to calculate total weight
    const equipmentStats = await getEquipmentCombatStats(player.playerId);
    const encumbranceRatio = calculateEncumbranceRatio(equipmentStats.totalWeight, strength);
    const encumbrancePercent = encumbranceRatio * 100;

    // Check for over-encumbered (blocks action entirely)
    if (encumbrancePercent >= config.encumbrance.overEncumbered.threshold) {
      // Return a very high delay to effectively block the action
      // The caller should check for this and show the blocked message
      return Infinity;
    }

    // Apply encumbrance multiplier
    const encumbranceMultiplier = getEncumbranceMultiplier(encumbrancePercent);
    delay *= encumbranceMultiplier;
  }

  // Check if this action is affected by terrain
  if (config.terrain.affectsActions.includes(actionType) && gameWorldRef) {
    const roomId = getPlayerLocation(player.playerId);
    const room = gameWorldRef.getRoom(roomId);
    if (room?.terrain) {
      const terrainMultiplier = getTerrainMultiplier(room.terrain);
      delay *= terrainMultiplier;
    }
  }

  // Apply status effect modifiers
  const effectModifiers = getEffectModifiers(player);

  // Check if movement is blocked by a status effect
  if (actionType === 'move' && effectModifiers.blocksMovement) {
    return Infinity;
  }

  // Apply speed modifier from status effects
  // speedModifier is a percentage: -20 = 20% faster, +50 = 50% slower
  if (effectModifiers.speedModifier !== 0) {
    const speedMultiplier = 1 + (effectModifiers.speedModifier / 100);
    delay *= Math.max(0.1, speedMultiplier); // Minimum 10% of base delay
  }

  return clampDelay(delay);
}

/**
 * Start an action from the queue - calculates delay and sets currentAction
 * The action will execute after the delay completes
 */
export async function startQueuedAction(
  player: AuthenticatedSocket,
  command: string
): Promise<void> {
  // Resolve alias first
  const resolvedCommand = resolveAlias(command);
  const commandName = getCommandName(resolvedCommand);
  const actionType = getActionTypeForCommand(commandName);

  // Check if movement is blocked by status effects before calculating delay
  if (actionType === 'move') {
    const effectModifiers = getEffectModifiers(player);
    if (effectModifiers.blocksMovement) {
      if (sendMessageFn) {
        sendMessageFn(player, MessageType.ERROR, 'You cannot move!');
      }
      return;
    }
  }

  // Get action configuration
  const actionConfig = getActionConfig(actionType) || getDefaultActionConfig();

  // Calculate delay for this action
  const delay = await calculateDelay(player, actionType);
  const now = Date.now();

  // Check if action is blocked (e.g., over-encumbered)
  if (delay === Infinity) {
    const config = getCommandQueueConfig();
    if (sendMessageFn) {
      sendMessageFn(player, MessageType.ERROR, config.encumbrance.overEncumbered.message);
    }
    return;
  }

  // If no delay, execute immediately
  if (delay === 0) {
    await executeQueuedCommand(player, resolvedCommand);
    return;
  }

  // Set up the pending action with completion time
  player.queueState.currentAction = {
    command: resolvedCommand,
    type: actionType,
    startedAt: now,
    completesAt: now + delay,
    canInterrupt: actionConfig.canInterrupt,
  };
}

/**
 * Execute a command and send response to player
 * Centralized command execution to avoid code duplication
 */
async function executeCommandAndRespond(
  player: AuthenticatedSocket,
  command: string
): Promise<void> {
  if (!gameWorldRef || !connectedPlayersRef || !sendMessageFn || !sendVitalsFn) {
    console.error('[TickProcessor] Not initialized');
    return;
  }

  try {
    const response = await processCommand(
      command,
      player,
      gameWorldRef,
      connectedPlayersRef
    );
    sendMessageFn(player, response.type, response.message);
    sendVitalsFn(player);
  } catch (error) {
    console.error(`[TickProcessor] Error processing command '${command}':`, error);
    sendMessageFn(player, MessageType.ERROR, 'An error occurred processing your command.');
  }
}

/**
 * Execute a completed action
 * Called by the game loop when currentAction.completesAt is reached
 */
export async function executeQueuedCommand(
  player: AuthenticatedSocket,
  command: string
): Promise<void> {
  await executeCommandAndRespond(player, command);
}

/**
 * Handle immediate input from a player
 * Determines whether to queue, bypass, or execute as priority
 */
export async function handlePlayerInput(
  player: AuthenticatedSocket,
  rawInput: string
): Promise<void> {
  if (!gameWorldRef || !connectedPlayersRef || !sendMessageFn || !sendVitalsFn) {
    console.error('[TickProcessor] Not initialized');
    return;
  }

  const config = getCommandQueueConfig();

  // Resolve alias
  const resolvedCommand = resolveAlias(rawInput.trim());
  const commandName = getCommandName(resolvedCommand);

  // Check if this command should bypass the queue entirely
  if (shouldBypassQueue(resolvedCommand)) {
    // Execute immediately without affecting readyAt
    await executeCommandAndRespond(player, resolvedCommand);
    return;
  }

  // Check if this is a priority command
  if (isPriorityCommand(resolvedCommand)) {
    const actionType = getActionTypeForCommand(commandName);
    const delay = await calculateDelay(player, actionType);

    // Execute immediately but update readyAt
    await executeCommandAndRespond(player, resolvedCommand);

    // Priority commands affect readyAt (use 0 if blocked by encumbrance)
    setPlayerReadyAt(player, Date.now() + (delay === Infinity ? 0 : delay));
    return;
  }

  // Normal command - add to queue
  const enqueued = enqueueCommand(player, resolvedCommand);

  if (!enqueued) {
    // Queue is full - send overflow message (with cooldown)
    const now = Date.now();
    const timeSinceLastOverflow = now - player.queueState.lastOverflowMessageTime;

    if (timeSinceLastOverflow >= config.queue.overflowCooldownMs) {
      sendMessageFn(player, MessageType.SYSTEM, config.queue.overflowMessage);
      player.queueState.lastOverflowMessageTime = now;
    }
  }
}

/**
 * Clear a player's queue when certain events occur
 */
export function handleQueueClearEvent(
  player: AuthenticatedSocket,
  eventType: string
): void {
  const config = getCommandQueueConfig();

  if (config.queue.clearEvents.includes(eventType)) {
    player.queueState.commandQueue = [];
    player.queueState.currentAction = null;
    console.log(`[TickProcessor] Cleared queue for player ${player.playerId} due to ${eventType}`);
  }
}

/**
 * Check if a player can perform a combat-only action
 */
export function canPerformCombatAction(player: AuthenticatedSocket): boolean {
  // Check if player is in combat based on regenState
  return player.regenState.inCombat;
}

/**
 * Get queue status for a player (for debugging/admin purposes)
 */
export function getPlayerQueueStatus(player: AuthenticatedSocket): {
  queueLength: number;
  readyAt: number;
  timeUntilReady: number;
  currentAction: string | null;
} {
  const now = Date.now();
  return {
    queueLength: player.queueState.commandQueue.length,
    readyAt: player.queueState.readyAt,
    timeUntilReady: Math.max(0, player.queueState.readyAt - now),
    currentAction: player.queueState.currentAction?.command ?? null,
  };
}
