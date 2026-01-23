/**
 * Door State Manager
 *
 * Manages runtime door states in memory. Door states reset to their default
 * values on server restart. This is intentional as per the design doc:
 * - Simpler implementation
 * - Most MUD scenarios accept state resets
 * - Avoids database complexity for every door state change
 */

import { Door, DoorState, DoorType, DoorData } from '@koa/shared';
import * as doorRepo from '../db/repositories/doorRepository.js';

// Track initialization state
let initialized = false;

// Current state of all doors in memory
// Key: door ID, Value: current state
const doorStates = new Map<number, DoorState>();

// Door definitions loaded from database
// Key: door ID, Value: Door object
const doorsById = new Map<number, Door>();

// Doors indexed by room ID for fast lookup
// Key: room ID, Value: array of Door objects
const doorsByRoomId = new Map<number, Door[]>();

// Active auto-close timers for open doors
// Key: door ID, Value: NodeJS.Timeout
const autoCloseTimers = new Map<number, NodeJS.Timeout>();

// Callback for broadcasting messages to rooms (set during initialization)
// This avoids circular dependency with socket.ts
let broadcastCallback: ((roomId: number, message: string) => void) | null = null;

/**
 * Initialize the door state manager by loading all doors from the database
 * Call this during server startup after database connection is established
 * @param broadcast - Callback function to broadcast messages to a room (avoids circular dependency)
 */
export async function initializeDoorStates(
  broadcast?: (roomId: number, message: string) => void
): Promise<void> {
  const allDoors = await doorRepo.getAllDoors();

  // Clear any existing timers
  for (const timer of autoCloseTimers.values()) {
    clearTimeout(timer);
  }
  autoCloseTimers.clear();

  doorStates.clear();
  doorsById.clear();
  doorsByRoomId.clear();

  // Set the broadcast callback
  if (broadcast) {
    broadcastCallback = broadcast;
  }

  for (const door of allDoors) {
    // Store door definition
    doorsById.set(door.id, door);

    // Initialize to default state
    doorStates.set(door.id, door.defaultState);

    // Index by entry room
    if (!doorsByRoomId.has(door.entryRoomId)) {
      doorsByRoomId.set(door.entryRoomId, []);
    }
    doorsByRoomId.get(door.entryRoomId)!.push(door);

    // Index by exit room (for two-way doors)
    if (door.exitRoomId) {
      if (!doorsByRoomId.has(door.exitRoomId)) {
        doorsByRoomId.set(door.exitRoomId, []);
      }
      doorsByRoomId.get(door.exitRoomId)!.push(door);
    }
  }

  initialized = true;
  console.log(`Door state manager initialized with ${allDoors.length} doors`);
}

/**
 * Reload a specific door from the database (after edits)
 */
export async function reloadDoor(doorId: number): Promise<Door | null> {
  const door = await doorRepo.getDoorById(doorId);

  if (!door) {
    // Door was deleted - remove from all indexes
    const oldDoor = doorsById.get(doorId);
    if (oldDoor) {
      doorsById.delete(doorId);
      doorStates.delete(doorId);

      // Cancel any active timer for this door
      cancelAutoCloseTimer(doorId);

      // Remove from room index
      const entryDoors = doorsByRoomId.get(oldDoor.entryRoomId);
      if (entryDoors) {
        doorsByRoomId.set(
          oldDoor.entryRoomId,
          entryDoors.filter((d) => d.id !== doorId)
        );
      }
      if (oldDoor.exitRoomId) {
        const exitDoors = doorsByRoomId.get(oldDoor.exitRoomId);
        if (exitDoors) {
          doorsByRoomId.set(
            oldDoor.exitRoomId,
            exitDoors.filter((d) => d.id !== doorId)
          );
        }
      }
    }
    return null;
  }

  // Update or add the door
  const oldDoor = doorsById.get(doorId);
  doorsById.set(doorId, door);

  // If door didn't exist or rooms changed, update room index
  if (!oldDoor) {
    // New door - initialize state and add to room index
    doorStates.set(doorId, door.defaultState);

    if (!doorsByRoomId.has(door.entryRoomId)) {
      doorsByRoomId.set(door.entryRoomId, []);
    }
    doorsByRoomId.get(door.entryRoomId)!.push(door);

    if (door.exitRoomId) {
      if (!doorsByRoomId.has(door.exitRoomId)) {
        doorsByRoomId.set(door.exitRoomId, []);
      }
      doorsByRoomId.get(door.exitRoomId)!.push(door);
    }
  } else if (
    oldDoor.entryRoomId !== door.entryRoomId ||
    oldDoor.exitRoomId !== door.exitRoomId
  ) {
    // Room associations changed - rebuild index for affected rooms
    // This is rare, so a simple rebuild is acceptable

    // Remove from old rooms
    const oldEntryDoors = doorsByRoomId.get(oldDoor.entryRoomId);
    if (oldEntryDoors) {
      doorsByRoomId.set(
        oldDoor.entryRoomId,
        oldEntryDoors.filter((d) => d.id !== doorId)
      );
    }
    if (oldDoor.exitRoomId) {
      const oldExitDoors = doorsByRoomId.get(oldDoor.exitRoomId);
      if (oldExitDoors) {
        doorsByRoomId.set(
          oldDoor.exitRoomId,
          oldExitDoors.filter((d) => d.id !== doorId)
        );
      }
    }

    // Add to new rooms
    if (!doorsByRoomId.has(door.entryRoomId)) {
      doorsByRoomId.set(door.entryRoomId, []);
    }
    doorsByRoomId.get(door.entryRoomId)!.push(door);

    if (door.exitRoomId) {
      if (!doorsByRoomId.has(door.exitRoomId)) {
        doorsByRoomId.set(door.exitRoomId, []);
      }
      doorsByRoomId.get(door.exitRoomId)!.push(door);
    }
  } else {
    // Just update the door object in place in the room arrays
    const entryDoors = doorsByRoomId.get(door.entryRoomId);
    if (entryDoors) {
      const idx = entryDoors.findIndex((d) => d.id === doorId);
      if (idx >= 0) entryDoors[idx] = door;
    }
    if (door.exitRoomId) {
      const exitDoors = doorsByRoomId.get(door.exitRoomId);
      if (exitDoors) {
        const idx = exitDoors.findIndex((d) => d.id === doorId);
        if (idx >= 0) exitDoors[idx] = door;
      }
    }
  }

  // If door is currently open and autoCloseSeconds changed, restart timer
  const currentState = doorStates.get(doorId);
  if (currentState === DoorState.OPEN) {
    if (oldDoor && oldDoor.autoCloseSeconds !== door.autoCloseSeconds) {
      // Timer settings changed - restart with new duration
      startAutoCloseTimer(door);
    }
  }

  return door;
}

// ============================================================================
// State Queries
// ============================================================================

/**
 * Get the current state of a door
 */
export function getDoorState(doorId: number): DoorState | null {
  return doorStates.get(doorId) ?? null;
}

/**
 * Get a door by its ID
 */
export function getDoor(doorId: number): Door | null {
  return doorsById.get(doorId) ?? null;
}

/**
 * Get all doors in a room (both entry and exit side)
 */
export function getDoorsInRoom(roomId: number): Door[] {
  return doorsByRoomId.get(roomId) ?? [];
}

/**
 * Get a door by room and direction
 */
export function getDoorByRoomAndDirection(
  roomId: number,
  direction: string
): Door | null {
  const doors = doorsByRoomId.get(roomId);
  if (!doors) return null;

  const normalizedDir = direction.toLowerCase();
  return (
    doors.find((door) => {
      if (door.entryRoomId === roomId && door.entryDirection === normalizedDir) {
        return true;
      }
      if (door.exitRoomId === roomId && door.exitDirection === normalizedDir) {
        return true;
      }
      return false;
    }) ?? null
  );
}

/**
 * Get the direction of a door from a specific room's perspective
 */
export function getDoorDirection(door: Door, fromRoomId: number): string | null {
  if (door.entryRoomId === fromRoomId) {
    return door.entryDirection;
  }
  if (door.exitRoomId === fromRoomId) {
    return door.exitDirection;
  }
  return null;
}

/**
 * Get doors as DoorData for client with current states
 */
export function getDoorsDataForRoom(roomId: number): DoorData[] {
  const doors = getDoorsInRoom(roomId);
  return doors.map((door) => {
    const currentState = getDoorState(door.id);
    return doorRepo.doorToDoorData(door, roomId, currentState ?? undefined);
  });
}

// ============================================================================
// State Mutations
// ============================================================================

/**
 * Set the state of a door
 * Returns true if state was changed, false if door doesn't exist
 */
export function setDoorState(doorId: number, state: DoorState): boolean {
  if (!doorsById.has(doorId)) {
    return false;
  }
  doorStates.set(doorId, state);
  return true;
}

/**
 * Start the auto-close timer for a door
 */
function startAutoCloseTimer(door: Door): void {
  // Cancel any existing timer
  cancelAutoCloseTimer(door.id);

  // Only start timer if auto-close is enabled
  if (door.autoCloseSeconds === null || door.autoCloseSeconds <= 0) {
    return;
  }

  const doorId = door.id;
  const timer = setTimeout(() => {
    autoCloseTimers.delete(doorId);
    // Fetch fresh door data to avoid stale references if door was edited
    const currentDoor = doorsById.get(doorId);
    if (currentDoor) {
      autoCloseDoor(currentDoor);
    }
  }, door.autoCloseSeconds * 1000);

  autoCloseTimers.set(door.id, timer);
}

/**
 * Cancel the auto-close timer for a door
 */
function cancelAutoCloseTimer(doorId: number): void {
  const timer = autoCloseTimers.get(doorId);
  if (timer) {
    clearTimeout(timer);
    autoCloseTimers.delete(doorId);
  }
}

/**
 * Called when auto-close timer expires
 * For doors with locks, this will auto-LOCK the door (not just close)
 */
function autoCloseDoor(door: Door): void {
  const currentState = doorStates.get(door.id);
  if (currentState !== DoorState.OPEN) {
    // Door was already closed (manually or otherwise)
    return;
  }

  // For doors with locks, auto-lock instead of just closing
  const newState = door.hasLock ? DoorState.LOCKED : DoorState.CLOSED;
  const actionVerb = door.hasLock ? 'locked' : 'closed';

  doorStates.set(door.id, newState);

  // Broadcast to both rooms with consistent message format
  if (broadcastCallback) {
    const entryMessage = `The ${door.name} to the ${door.entryDirection} just ${actionVerb}.`;
    broadcastCallback(door.entryRoomId, entryMessage);

    if (door.exitRoomId && door.exitDirection) {
      const exitMessage = `The ${door.name} to the ${door.exitDirection} just ${actionVerb}.`;
      broadcastCallback(door.exitRoomId, exitMessage);
    }
  }
}

/**
 * Open a door (set state to OPEN)
 * Only works for physical doors that are closed (not locked).
 * Locked doors must be unlocked first before opening.
 */
export function openDoor(doorId: number): boolean {
  const door = doorsById.get(doorId);
  if (!door || door.doorType !== DoorType.PHYSICAL) {
    return false;
  }
  const currentState = doorStates.get(doorId);
  if (currentState === DoorState.OPEN) {
    return false; // Already open
  }
  if (currentState === DoorState.LOCKED) {
    return false; // Must unlock first
  }
  doorStates.set(doorId, DoorState.OPEN);

  // Start auto-close timer
  startAutoCloseTimer(door);

  return true;
}

/**
 * Close a door (set state to CLOSED)
 * Only works for physical doors that are open
 */
export function closeDoor(doorId: number): boolean {
  const door = doorsById.get(doorId);
  if (!door || door.doorType !== DoorType.PHYSICAL) {
    return false;
  }
  const currentState = doorStates.get(doorId);
  if (currentState !== DoorState.OPEN) {
    return false; // Not open
  }
  doorStates.set(doorId, DoorState.CLOSED);

  // Cancel auto-close timer since door was manually closed
  cancelAutoCloseTimer(doorId);

  return true;
}

/**
 * Lock a door (set state to LOCKED)
 * Only works for physical doors with locks that are currently closed
 */
export function lockDoor(doorId: number): boolean {
  const door = doorsById.get(doorId);
  if (!door || door.doorType !== DoorType.PHYSICAL) {
    return false;
  }
  if (!door.hasLock) {
    return false; // Door doesn't have a lock
  }
  const currentState = doorStates.get(doorId);
  if (currentState !== DoorState.CLOSED) {
    return false; // Can only lock a closed door
  }
  doorStates.set(doorId, DoorState.LOCKED);
  return true;
}

/**
 * Unlock a door (set state to CLOSED, not OPEN)
 * Only works for physical doors with locks that are currently locked
 * Note: This just unlocks - caller should call openDoor() separately if player wants to open it
 */
export function unlockDoor(doorId: number): boolean {
  const door = doorsById.get(doorId);
  if (!door || door.doorType !== DoorType.PHYSICAL) {
    return false;
  }
  if (!door.hasLock) {
    return false; // Door doesn't have a lock
  }
  const currentState = doorStates.get(doorId);
  if (currentState !== DoorState.LOCKED) {
    return false; // Can only unlock a locked door
  }
  doorStates.set(doorId, DoorState.CLOSED);
  return true;
}

/**
 * Check if a player can pass through a door
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
export function canPassThrough(
  doorId: number,
  fromRoomId: number
): { allowed: boolean; reason?: string } {
  const door = doorsById.get(doorId);
  if (!door) {
    return { allowed: false, reason: 'Door not found.' };
  }

  // Check if door connects from this room
  const isEntryRoom = door.entryRoomId === fromRoomId;
  const isExitRoom = door.exitRoomId === fromRoomId;
  if (!isEntryRoom && !isExitRoom) {
    return { allowed: false, reason: 'This door does not lead from here.' };
  }

  // For one-way doors, can only go from entry side
  if (!door.exitRoomId && !isEntryRoom) {
    return { allowed: false, reason: 'You cannot go that way.' };
  }

  // Get current state
  const state = doorStates.get(doorId);

  // Open passageways are always passable
  if (door.doorType === DoorType.OPEN_PASSAGEWAY) {
    return { allowed: true };
  }

  // Physical doors need to be open
  if (door.doorType === DoorType.PHYSICAL) {
    if (state === DoorState.OPEN) {
      return { allowed: true };
    }
    const direction = isEntryRoom ? door.entryDirection : door.exitDirection;
    if (state === DoorState.LOCKED) {
      return {
        allowed: false,
        reason: `The ${door.name} to the ${direction} is locked!`,
      };
    }
    // Closed - bump into door message
    return {
      allowed: false,
      reason: `You run into the ${door.name} to the ${direction}!`,
    };
  }

  // Special doors and triggered passageways are always passable (no state check needed)
  // Temporary portals will need an "active" check when Phase 9 is implemented
  return { allowed: true };
}

/**
 * Get the destination room when passing through a door
 */
export function getDestinationRoom(doorId: number, fromRoomId: number): number | null {
  const door = doorsById.get(doorId);
  if (!door) return null;

  if (door.entryRoomId === fromRoomId) {
    return door.exitRoomId;
  }
  if (door.exitRoomId === fromRoomId) {
    return door.entryRoomId;
  }
  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get count of loaded doors
 */
export function getDoorCount(): number {
  return doorsById.size;
}

/**
 * Check if door state manager has been initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Get count of active auto-close timers (for debugging)
 */
export function getActiveTimerCount(): number {
  return autoCloseTimers.size;
}

/**
 * Check if a door has an active auto-close timer
 */
export function hasActiveTimer(doorId: number): boolean {
  return autoCloseTimers.has(doorId);
}

/**
 * Find a special door in a room by its trigger text
 * Trigger text matching is case-insensitive
 * @param roomId - The room to search in
 * @param triggerText - The text the player typed (e.g., "go portal", "climb rope")
 * @returns The matching door or null if not found
 */
export function findSpecialDoorByTrigger(
  roomId: number,
  triggerText: string
): Door | null {
  const doors = doorsByRoomId.get(roomId);
  if (!doors) return null;

  const normalizedTrigger = triggerText.toLowerCase().trim();

  // Don't match empty trigger text
  if (!normalizedTrigger) return null;

  return (
    doors.find((door) => {
      // Only match special doors and triggered passageways
      if (
        door.doorType !== DoorType.SPECIAL &&
        door.doorType !== DoorType.TRIGGERED_PASSAGEWAY &&
        door.doorType !== DoorType.TEMPORARY_PORTAL
      ) {
        return false;
      }

      // Must have trigger text defined
      if (!door.triggerText) return false;

      // Match trigger text (case-insensitive)
      return door.triggerText.toLowerCase() === normalizedTrigger;
    }) ?? null
  );
}

/**
 * Find a special door in a room by its display name (for "look" command)
 * Matches against itemDisplayName, case-insensitive partial match from start
 * @param roomId - The room to search in
 * @param targetName - The name the player typed (e.g., "portal", "vortex")
 * @returns The matching door or null if not found
 */
export function findSpecialDoorByDisplayName(
  roomId: number,
  targetName: string
): Door | null {
  const doors = doorsByRoomId.get(roomId);
  if (!doors) return null;

  const normalizedTarget = targetName.toLowerCase().trim();

  // Don't match empty target name
  if (!normalizedTarget) return null;

  return (
    doors.find((door) => {
      // Only match special doors and temporary portals that have a display name
      if (
        (door.doorType !== DoorType.SPECIAL &&
          door.doorType !== DoorType.TEMPORARY_PORTAL) ||
        !door.itemDisplayName
      ) {
        return false;
      }

      // Hidden doors cannot be looked at by name
      if (door.isHidden) return false;

      // Match display name (case-insensitive, partial from start)
      // Remove article if present for matching (e.g., "a whirling vortex" -> "whirling vortex")
      const displayName = door.itemDisplayName.toLowerCase();
      const nameWithoutArticle = displayName
        .replace(/^(a |an |the )/, '')
        .trim();

      return (
        displayName.startsWith(normalizedTarget) ||
        nameWithoutArticle.startsWith(normalizedTarget)
      );
    }) ?? null
  );
}
