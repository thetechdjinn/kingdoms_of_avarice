/**
 * Game Loop for Command Queue Processing
 *
 * Implements a tick-based game loop that processes command queues for all
 * connected players. The loop runs at a configurable tick rate and processes
 * commands in a fair order based on configuration.
 */

import { getCommandQueueConfig } from '../config/commandQueueConfig.js';
import type { AuthenticatedSocket } from './socket.js';

// Game loop state
let gameLoopTimer: NodeJS.Timeout | null = null;
let gameLoopRunning = false;
let tickInProgress = false; // Prevents overlapping tick processing
let tickCount = 0;
let lastTickTime = 0;
let tickOverrunCount = 0;

// Round-robin state for player processing
let roundRobinIndex = 0;

// Reference to connected players (set during initialization)
let connectedPlayersRef: Map<number, AuthenticatedSocket> | null = null;

// Callback for starting an action (calculates delay, sets currentAction)
type StartActionProcessor = (player: AuthenticatedSocket, command: string) => Promise<void>;
let startActionProcessor: StartActionProcessor | null = null;

// Callback for executing a completed action
type CommandProcessor = (player: AuthenticatedSocket, command: string) => Promise<void>;
let commandProcessor: CommandProcessor | null = null;

/**
 * Shuffle an array in place using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Get players in processing order based on configuration
 */
function getPlayersInProcessingOrder(): AuthenticatedSocket[] {
  if (!connectedPlayersRef) {
    return [];
  }

  const config = getCommandQueueConfig();
  const players = Array.from(connectedPlayersRef.values());

  switch (config.timing.playerProcessingOrder) {
    case 'shuffle':
      return shuffleArray([...players]);

    case 'idOrder':
      return players.sort((a, b) => a.playerId - b.playerId);

    case 'readyAtOrder':
      return players.sort((a, b) => a.queueState.readyAt - b.queueState.readyAt);

    case 'roundRobin':
      // Rotate the starting position each tick
      const rotated = [...players];
      if (rotated.length > 0) {
        roundRobinIndex = roundRobinIndex % rotated.length;
        const before = rotated.slice(0, roundRobinIndex);
        const after = rotated.slice(roundRobinIndex);
        roundRobinIndex = (roundRobinIndex + 1) % rotated.length;
        return [...after, ...before];
      }
      return rotated;

    default:
      return players;
  }
}

/**
 * Process a single game tick
 */
async function processTick(): Promise<void> {
  // Prevent overlapping tick processing
  if (tickInProgress) {
    return;
  }
  tickInProgress = true;

  try {
    const tickStartTime = Date.now();
    tickCount++;

    const config = getCommandQueueConfig();
    const players = getPlayersInProcessingOrder();

    let commandsProcessed = 0;

    for (const player of players) {
      // First, check if there's a pending action that's ready to complete
      if (player.queueState.currentAction) {
        if (tickStartTime >= player.queueState.currentAction.completesAt) {
          // Action is ready to execute
          const action = player.queueState.currentAction;
          player.queueState.currentAction = null;

          if (commandProcessor) {
            try {
              await commandProcessor(player, action.command);
              commandsProcessed++;
            } catch (error) {
              console.error(`[GameLoop] Error executing command for player ${player.playerId}:`, error);
            }
          }
        }
        // Don't process queue while an action is pending
        continue;
      }

      // No current action - check if we can start a new one from the queue
      if (player.queueState.commandQueue.length === 0) {
        continue;
      }

      // Check if player is ready to start a new action
      if (tickStartTime < player.queueState.readyAt) {
        continue;
      }

      // Dequeue the next command and start it
      const command = player.queueState.commandQueue.shift();
      if (command && startActionProcessor) {
        try {
          await startActionProcessor(player, command);
        } catch (error) {
          console.error(`[GameLoop] Error starting command for player ${player.playerId}:`, error);
        }
      }
    }

    // Track tick duration and warn on overruns
    const tickDuration = Date.now() - tickStartTime;
    if (tickDuration > config.timing.tickRateMs) {
      tickOverrunCount++;
      if (tickOverrunCount % 100 === 1) {
        console.warn(
          `[GameLoop] Tick overrun #${tickOverrunCount}: took ${tickDuration}ms ` +
          `(target: ${config.timing.tickRateMs}ms, commands: ${commandsProcessed})`
        );
      }
    }

    lastTickTime = tickStartTime;
  } finally {
    tickInProgress = false;
  }
}

/**
 * Start the game loop
 */
export function startGameLoop(
  connectedPlayers: Map<number, AuthenticatedSocket>,
  startProcessor: StartActionProcessor,
  executeProcessor: CommandProcessor
): void {
  // If already running, stop first to ensure clean state
  if (gameLoopRunning) {
    console.warn('[GameLoop] Game loop already running, restarting with new configuration');
    stopGameLoop();
  }

  connectedPlayersRef = connectedPlayers;
  startActionProcessor = startProcessor;
  commandProcessor = executeProcessor;

  const config = getCommandQueueConfig();
  const tickRate = config.timing.tickRateMs;

  gameLoopRunning = true;
  tickCount = 0;
  tickOverrunCount = 0;
  lastTickTime = Date.now();

  console.log(`[GameLoop] Starting game loop with ${tickRate}ms tick rate`);

  // Use setInterval for consistent timing
  gameLoopTimer = setInterval(() => {
    // Prevent overlapping tick processing
    processTick().catch((error) => {
      console.error('[GameLoop] Unhandled error in tick processing:', error);
    });
  }, tickRate);
}

/**
 * Stop the game loop
 */
export function stopGameLoop(): void {
  if (gameLoopTimer) {
    clearInterval(gameLoopTimer);
    gameLoopTimer = null;
  }
  gameLoopRunning = false;
  tickInProgress = false;
  connectedPlayersRef = null;
  startActionProcessor = null;
  commandProcessor = null;
  console.log(`[GameLoop] Stopped after ${tickCount} ticks (${tickOverrunCount} overruns)`);
}

/**
 * Check if the game loop is running
 */
export function isGameLoopRunning(): boolean {
  return gameLoopRunning;
}

/**
 * Get game loop statistics
 */
export function getGameLoopStats(): {
  running: boolean;
  tickCount: number;
  tickOverrunCount: number;
  lastTickTime: number;
  connectedPlayers: number;
} {
  return {
    running: gameLoopRunning,
    tickCount,
    tickOverrunCount,
    lastTickTime,
    connectedPlayers: connectedPlayersRef?.size ?? 0,
  };
}

/**
 * Add a command to a player's queue
 * Returns true if command was added, false if queue is full
 */
export function enqueueCommand(player: AuthenticatedSocket, command: string): boolean {
  const config = getCommandQueueConfig();

  if (player.queueState.commandQueue.length >= config.queue.maxSize) {
    return false;
  }

  player.queueState.commandQueue.push(command);
  return true;
}

/**
 * Clear a player's command queue
 */
export function clearPlayerQueue(player: AuthenticatedSocket): void {
  player.queueState.commandQueue = [];
  player.queueState.currentAction = null;
}

/**
 * Get the number of commands in a player's queue
 */
export function getQueueSize(player: AuthenticatedSocket): number {
  return player.queueState.commandQueue.length;
}

/**
 * Check if a player is ready to execute their next command
 */
export function isPlayerReady(player: AuthenticatedSocket): boolean {
  return Date.now() >= player.queueState.readyAt;
}

/**
 * Set the player's ready time (when they can next execute a command)
 */
export function setPlayerReadyAt(player: AuthenticatedSocket, readyAt: number): void {
  player.queueState.readyAt = readyAt;
}

/**
 * Get the time until a player can execute their next command
 */
export function getTimeUntilReady(player: AuthenticatedSocket): number {
  const now = Date.now();
  const readyAt = player.queueState.readyAt;
  return readyAt > now ? readyAt - now : 0;
}
