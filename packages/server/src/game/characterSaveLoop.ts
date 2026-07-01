/**
 * Periodic Character Save Loop
 *
 * Drains connected players' dirty cached state to the database at a
 * configurable interval. Each tick calls flushPlayer for every connected
 * socket, which writes only fields marked dirty (vitals/room/pocket/bank,
 * later inventory and effects) in a single transaction per player.
 *
 * For the duration of the memory-first refactor transition, this tick
 * explicitly marks vitals and room dirty on every player so they save
 * every tick (preserving prior behavior). Later phases move vitals and
 * room to event-driven dirty marking, at which point these explicit
 * marks can be removed and the tick will only write when something has
 * actually changed.
 */

import { getCharacterSaveIntervalMs } from '../db/repositories/settingsRepository.js';
import { markVitalsDirty, markRoomDirty, flushPlayer, type SessionSocket } from './sessionState.js';

// Save loop accepts any socket that satisfies the SessionSocket shape
// (AuthenticatedSocket structurally fits).
type SaveCapableSocket = SessionSocket;

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
 * Flush every connected player's dirty state once, immediately.
 *
 * Used by the graceful-shutdown hook (SIGTERM/SIGINT): the periodic loop is
 * stopped first, then this drains whatever accrued since the last tick so a
 * clean shutdown never loses pocket/bank/vitals/room changes. Mirrors the
 * per-player flush in processSaveTick (marks vitals + room dirty for parity).
 * Errors are isolated per-player so one failure doesn't block the rest.
 *
 * Returns the number of players successfully flushed.
 */
export async function flushAllConnectedPlayers(): Promise<number> {
  if (!connectedPlayersRef || connectedPlayersRef.size === 0) {
    return 0;
  }

  let flushed = 0;
  for (const [playerId, socket] of connectedPlayersRef) {
    if (!socket.characterId) continue;
    try {
      markVitalsDirty(socket);
      markRoomDirty(socket);
      await flushPlayer(socket);
      flushed++;
    } catch (error) {
      console.error(`[CharacterSave] Shutdown flush failed for player ${playerId}:`, error);
    }
  }
  return flushed;
}

/**
 * Process a single save tick.
 *
 * INVARIANT (memory-first architecture):
 * Every flush — this tick, logout close handler, graceful shutdown, quest
 * completion, level-up, or any other direct-write trigger — MUST drain the
 * player's entire dirty state in a single transaction via the central
 * `flushPlayer(socket)` helper. A direct-write code path that writes one
 * field without also flushing everything else dirty creates torn-state risk
 * on crash and breaks the atomicity guarantee.
 *
 * See notes/Memory_First_Architecture.md for the full rule.
 *
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
        // Transition: mark vitals + room dirty unconditionally so they save
        // every tick (matching the prior behavior). Cached fields that the
        // gameplay code now marks dirty itself (pocket, bank) are picked up
        // automatically by flushPlayer.
        markVitalsDirty(socket);
        markRoomDirty(socket);
        await flushPlayer(socket);
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
