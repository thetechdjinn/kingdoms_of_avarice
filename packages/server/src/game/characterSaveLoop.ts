/**
 * Periodic Character Save Loop
 *
 * Automatically saves connected players' vitals (HP, mana) to the database
 * at a configurable interval to protect against data loss from server crashes.
 *
 * What gets saved each tick:
 * - health: Current HP from socket.vitals.hp
 * - mana: Current mana from socket.vitals.resource
 *
 * These are the same fields saved on disconnect. Other data (room location,
 * items, status effects) is already saved immediately when changed.
 */

import type { WebSocket } from 'ws';
import type { VitalsData } from '@koa/shared';
import * as characterRepo from '../db/repositories/characterRepository.js';
import { getCharacterSaveIntervalMs } from '../db/repositories/settingsRepository.js';

// Minimal socket interface needed for saving
interface SaveCapableSocket extends WebSocket {
  playerId: number;
  characterId?: number;
  vitals: VitalsData;
}

// Module state
let saveInterval: NodeJS.Timeout | null = null;
let connectedPlayersRef: Map<number, SaveCapableSocket> | null = null;
let isSaveInProgress = false;
let isShuttingDown = false;
let currentIntervalMs = 60000; // Default 60 seconds

/**
 * Start the periodic character save loop.
 * Fetches the save interval from settings and begins saving all connected
 * players' vitals at that interval.
 *
 * @param connectedPlayers - Map of connected player sockets
 */
export async function startCharacterSaveLoop<T extends SaveCapableSocket>(
  connectedPlayers: Map<number, T>
): Promise<void> {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }

  connectedPlayersRef = connectedPlayers as Map<number, SaveCapableSocket>;
  isShuttingDown = false;

  // Fetch interval from settings
  try {
    currentIntervalMs = await getCharacterSaveIntervalMs();
  } catch (error) {
    console.error('[CharacterSave] Failed to load save interval, using default 60000ms:', error);
    currentIntervalMs = 60000;
  }

  // Start the save loop
  saveInterval = setInterval(() => {
    processSaveTick().catch((error) => {
      console.error('[CharacterSave] Error in save tick:', error);
    });
  }, currentIntervalMs);

  console.log(`[CharacterSave] Started periodic save loop (every ${currentIntervalMs}ms / ${currentIntervalMs / 1000}s)`);
}

/**
 * Stop the periodic character save loop.
 * Should be called during server shutdown.
 */
export function stopCharacterSaveLoop(): void {
  isShuttingDown = true;
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  connectedPlayersRef = null;
  console.log('[CharacterSave] Stopped periodic save loop');
}

/**
 * Restart the save loop with a new interval.
 * Called when admin changes the save interval setting.
 *
 * @param newIntervalMs - New interval in milliseconds
 */
export function restartCharacterSaveLoopWithNewInterval(newIntervalMs: number): void {
  if (!connectedPlayersRef) {
    console.log('[CharacterSave] Cannot restart - loop not initialized');
    return;
  }

  if (newIntervalMs === currentIntervalMs) {
    return; // No change needed
  }

  console.log(`[CharacterSave] Updating interval from ${currentIntervalMs}ms to ${newIntervalMs}ms`);

  // Stop existing interval
  if (saveInterval) {
    clearInterval(saveInterval);
  }

  // Update current interval
  currentIntervalMs = newIntervalMs;

  // Start new interval
  saveInterval = setInterval(() => {
    processSaveTick().catch((error) => {
      console.error('[CharacterSave] Error in save tick:', error);
    });
  }, currentIntervalMs);

  console.log(`[CharacterSave] Restarted with ${currentIntervalMs}ms interval`);
}

/**
 * Process a single save tick.
 * Iterates through all connected players and saves their vitals to the database.
 * Errors are isolated per-player so one failure doesn't stop other saves.
 */
async function processSaveTick(): Promise<void> {
  // Prevent overlapping saves
  if (isSaveInProgress || isShuttingDown || !connectedPlayersRef) {
    return;
  }

  isSaveInProgress = true;

  try {
    const playerCount = connectedPlayersRef.size;
    if (playerCount === 0) {
      return; // No players to save
    }

    let savedCount = 0;
    let errorCount = 0;

    for (const [playerId, socket] of connectedPlayersRef) {
      // Skip if no character loaded
      if (!socket.characterId) {
        continue;
      }

      try {
        await characterRepo.updateCharacterStats(socket.characterId, {
          health: socket.vitals.hp,
          mana: socket.vitals.resource ?? 0,
        });
        savedCount++;
      } catch (error) {
        errorCount++;
        console.error(`[CharacterSave] Failed to save character ${socket.characterId} (player ${playerId}):`, error);
      }
    }

    // Only log if there were errors (avoid log spam every interval)
    if (errorCount > 0) {
      console.log(`[CharacterSave] Periodic save complete: ${savedCount} saved, ${errorCount} errors`);
    }
  } finally {
    isSaveInProgress = false;
  }
}

/**
 * Get the current save interval in milliseconds.
 * Useful for status/debugging.
 */
export function getCurrentSaveIntervalMs(): number {
  return currentIntervalMs;
}

/**
 * Check if the save loop is currently running.
 */
export function isSaveLoopRunning(): boolean {
  return saveInterval !== null && !isShuttingDown;
}
