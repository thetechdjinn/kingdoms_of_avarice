/**
 * Dropped State Manager
 *
 * Manages the tick loop for players in the "dropped" state.
 * - Players who are not aided lose 1 HP per tick (bleeding out)
 * - Players who are aided gain 1 HP per tick (recovering)
 * - If HP drops below death threshold, player dies
 * - If HP rises above 0, player recovers
 */

import { MessageType } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { getDroppedTickIntervalMs, getMaxNegativeHpPercent } from '../db/repositories/settingsRepository.js';
import {
  isPlayerDropped,
  isPlayerDead,
  isPlayerAided,
  clearDeathState,
  initializeDeadState,
  formatDeathMessage,
} from './damageHandler.js';
import { colors } from '../utils/colors.js';
import { checkHostileAggro } from './npcManager.js';

let droppedStateTimer: NodeJS.Timeout | null = null;
let droppedStateTickInProgress = false;

// Reference to connected players and utility functions
let connectedPlayersRef: Map<number, AuthenticatedSocket>;
let sendMessageRef: (socket: AuthenticatedSocket, type: MessageType, message: string) => void;
let sendVitalsRef: (socket: AuthenticatedSocket) => void;
let broadcastToRoomRef: (roomId: number, message: string, excludePlayerId?: number) => void;

/**
 * Start the dropped state processing loop
 * Called during server initialization
 */
export async function startDroppedStateLoop(
  connectedPlayers: Map<number, AuthenticatedSocket>,
  sendMessage: (socket: AuthenticatedSocket, type: MessageType, message: string) => void,
  sendVitals: (socket: AuthenticatedSocket) => void,
  broadcastToRoom: (roomId: number, message: string, excludePlayerId?: number) => void
): Promise<void> {
  // Store references
  connectedPlayersRef = connectedPlayers;
  sendMessageRef = sendMessage;
  sendVitalsRef = sendVitals;
  broadcastToRoomRef = broadcastToRoom;

  // Get tick interval from settings
  const tickIntervalMs = await getDroppedTickIntervalMs();

  if (droppedStateTimer) {
    clearInterval(droppedStateTimer);
  }

  droppedStateTimer = setInterval(() => {
    // Prevent overlapping async executions
    if (droppedStateTickInProgress) {
      return;
    }
    droppedStateTickInProgress = true;

    processDroppedStateTick()
      .catch((error) => {
        console.error('[DroppedState] Error processing tick:', error);
      })
      .finally(() => {
        droppedStateTickInProgress = false;
      });
  }, tickIntervalMs);

  console.log(`[DroppedState] Started dropped state processing loop (every ${tickIntervalMs}ms)`);
}

/**
 * Stop the dropped state processing loop
 * Called during server shutdown
 */
export function stopDroppedStateLoop(): void {
  if (droppedStateTimer) {
    clearInterval(droppedStateTimer);
    droppedStateTimer = null;
    console.log('[DroppedState] Stopped dropped state processing loop');
  }
}

/**
 * Process a single tick for all dropped players
 */
async function processDroppedStateTick(): Promise<void> {
  if (!connectedPlayersRef) return;

  const negativePercent = await getMaxNegativeHpPercent();

  for (const [, socket] of connectedPlayersRef) {
    // Only process dropped (not dead) players
    if (!isPlayerDropped(socket)) {
      continue;
    }


    const maxHp = socket.vitals.maxHp;
    const deathThreshold = -Math.floor(maxHp * negativePercent / 100);
    const roomId = getPlayerLocation(socket.playerId);

    if (isPlayerAided(socket)) {
      // Aided: recover 1 HP per tick
      socket.vitals.hp += 1;
      sendVitalsRef(socket);

      // Check for recovery (HP > 0)
      if (socket.vitals.hp > 0) {
        // Player has recovered!
        clearDeathState(socket);
        sendMessageRef(socket, MessageType.SYSTEM, colors.boldGreen('You regain consciousness and rise to your feet!'));
        broadcastToRoomRef(roomId, `${socket.username} regains consciousness and stands up.`, socket.playerId);
        sendVitalsRef(socket);

        // Check for hostile NPCs now that the player is back on their feet
        setImmediate(() => checkHostileAggro(roomId, socket));
      }
    } else {
      // Not aided: bleed 1 HP per tick
      socket.vitals.hp -= 1;
      sendVitalsRef(socket);

      // Show bleed message to player and room
      sendMessageRef(socket, MessageType.SYSTEM, colors.red('You are bleeding out...'));
      broadcastToRoomRef(roomId, colors.red(`${socket.username} is bleeding out...`), socket.playerId);

      // Check for death (HP below threshold)
      if (socket.vitals.hp <= deathThreshold) {
        // Player has died from bleeding out
        initializeDeadState(socket, roomId);

        // Drop all items on death
        try {
          const { dropAllItemsOnDeath } = await import('./itemCommands.js');
          await dropAllItemsOnDeath(socket.characterId!, roomId);
        } catch (error) {
          console.error('[DroppedState] Failed to drop items on death:', error);
        }

        // Send death messages
        sendMessageRef(socket, MessageType.SYSTEM, formatDeathMessage());
        broadcastToRoomRef(roomId, colors.boldRed(`${socket.username} has bled out and died!`), socket.playerId);
        sendVitalsRef(socket);
      }
    }
  }
}

/**
 * Handle disconnect while in dropped state
 * Called when a player disconnects while dropped
 */
export async function handleDroppedDisconnect(socket: AuthenticatedSocket): Promise<void> {
  if (!isPlayerDropped(socket)) return;

  const roomId = getPlayerLocation(socket.playerId);

  // Transition to dead state
  initializeDeadState(socket, roomId);

  // Drop items
  try {
    const { dropAllItemsOnDeath } = await import('./itemCommands.js');
    await dropAllItemsOnDeath(socket.characterId!, roomId);
  } catch (error) {
    console.error('[DroppedState] Failed to drop items on disconnect death:', error);
  }

  // Broadcast death
  broadcastToRoomRef(roomId, colors.boldRed(`${socket.username} has died!`), socket.playerId);
}
