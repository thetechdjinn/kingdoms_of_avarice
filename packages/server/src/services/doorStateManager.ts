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

// Active auto-reset timers for doors not at their default state
// Key: door ID, Value: NodeJS.Timeout
const autoResetTimers = new Map<number, NodeJS.Timeout>();

// Active temporary portals (spawned and not yet expired)
// Key: door ID, Value: timestamp when portal was spawned
const activePortals = new Map<number, number>();

// Expiration timers for temporary portals
// Key: door ID, Value: NodeJS.Timeout
const portalExpirationTimers = new Map<number, NodeJS.Timeout>();

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
  for (const timer of autoResetTimers.values()) {
    clearTimeout(timer);
  }
  autoResetTimers.clear();

  // Clear portal expiration timers
  for (const timer of portalExpirationTimers.values()) {
    clearTimeout(timer);
  }
  portalExpirationTimers.clear();
  activePortals.clear();

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

      // Cancel any active timers for this door
      cancelAutoResetTimer(doorId);
      cancelPortalExpirationTimer(doorId);
      activePortals.delete(doorId);

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

  // If door is not at default state and autoResetSeconds changed, restart timer
  const currentState = doorStates.get(doorId);
  if (currentState !== door.defaultState) {
    if (oldDoor && oldDoor.autoResetSeconds !== door.autoResetSeconds) {
      // Timer settings changed - restart with new duration
      startAutoResetTimer(door);
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
 * Start the auto-reset timer for a door
 * Timer fires after autoResetSeconds and resets the door to its defaultState
 */
function startAutoResetTimer(door: Door): void {
  // Cancel any existing timer
  cancelAutoResetTimer(door.id);

  // Only start timer if auto-reset is enabled
  if (door.autoResetSeconds === null || door.autoResetSeconds <= 0) {
    return;
  }

  // Don't start timer if door is already at default state
  const currentState = doorStates.get(door.id);
  if (currentState === door.defaultState) {
    return;
  }

  const doorId = door.id;
  const timer = setTimeout(() => {
    autoResetTimers.delete(doorId);
    // Fetch fresh door data to avoid stale references if door was edited
    const currentDoor = doorsById.get(doorId);
    if (currentDoor) {
      autoResetDoor(currentDoor);
    }
  }, door.autoResetSeconds * 1000);

  autoResetTimers.set(door.id, timer);
}

/**
 * Cancel the auto-reset timer for a door
 */
function cancelAutoResetTimer(doorId: number): void {
  const timer = autoResetTimers.get(doorId);
  if (timer) {
    clearTimeout(timer);
    autoResetTimers.delete(doorId);
  }
}

/**
 * Called when auto-reset timer expires
 * Resets the door to its defaultState and broadcasts the change
 */
function autoResetDoor(door: Door): void {
  const currentState = doorStates.get(door.id);
  if (currentState === door.defaultState) {
    // Door is already at default state
    return;
  }

  doorStates.set(door.id, door.defaultState);

  // Determine verb from default state
  let actionVerb: string;
  switch (door.defaultState) {
    case DoorState.LOCKED:
      actionVerb = 'locked';
      break;
    case DoorState.CLOSED:
      actionVerb = 'closed';
      break;
    case DoorState.OPEN:
      actionVerb = 'opened';
      break;
    default:
      actionVerb = 'reset';
  }

  const doorLabel = door.displayName || 'door';

  // Broadcast to both rooms with consistent message format
  if (broadcastCallback) {
    const entryMessage = `The ${doorLabel} to the ${door.entryDirection} just ${actionVerb}.`;
    broadcastCallback(door.entryRoomId, entryMessage);

    if (door.exitRoomId && door.exitDirection) {
      const exitMessage = `The ${doorLabel} to the ${door.exitDirection} just ${actionVerb}.`;
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

  // Start auto-reset timer (door moved away from default)
  startAutoResetTimer(door);

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

  // If now at default state, cancel timer; otherwise start/restart timer
  if (door.defaultState === DoorState.CLOSED) {
    cancelAutoResetTimer(doorId);
  } else {
    startAutoResetTimer(door);
  }

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

  // If now at default state, cancel timer; otherwise start/restart timer
  if (door.defaultState === DoorState.LOCKED) {
    cancelAutoResetTimer(doorId);
  } else {
    startAutoResetTimer(door);
  }

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

  // If now at default state, cancel timer; otherwise start/restart timer
  if (door.defaultState === DoorState.CLOSED) {
    cancelAutoResetTimer(doorId);
  } else {
    startAutoResetTimer(door);
  }

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
  if (door.doorType === DoorType.SPECIAL || door.doorType === DoorType.TRIGGERED_PASSAGEWAY) {
    return { allowed: true };
  }

  // Temporary portals must be active (spawned and not expired)
  if (door.doorType === DoorType.TEMPORARY_PORTAL) {
    if (door.isTemporary && !isPortalActive(doorId)) {
      return {
        allowed: false,
        reason: 'There is nothing there.',
      };
    }
    return { allowed: true };
  }

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
 * Get count of active auto-reset timers (for debugging)
 */
export function getActiveTimerCount(): number {
  return autoResetTimers.size;
}

/**
 * Check if a door has an active auto-reset timer
 */
export function hasActiveTimer(doorId: number): boolean {
  return autoResetTimers.has(doorId);
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
      // Only match special doors, triggered passageways, and temporary portals
      if (
        door.doorType !== DoorType.SPECIAL &&
        door.doorType !== DoorType.TRIGGERED_PASSAGEWAY &&
        door.doorType !== DoorType.TEMPORARY_PORTAL
      ) {
        return false;
      }

      // Temporary portals must be active to respond to trigger text
      if (door.doorType === DoorType.TEMPORARY_PORTAL && door.isTemporary) {
        if (!activePortals.has(door.id)) return false;
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

      // Temporary portals must be active to be looked at
      if (door.doorType === DoorType.TEMPORARY_PORTAL && door.isTemporary) {
        if (!activePortals.has(door.id)) return false;
      }

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

// ============================================================================
// Temporary Portal Functions
// ============================================================================

/**
 * Check if a temporary portal is currently active (spawned and not expired)
 */
export function isPortalActive(doorId: number): boolean {
  return activePortals.has(doorId);
}

/**
 * Spawn a temporary portal, making it visible and usable
 * Starts the expiration timer based on the door's durationSeconds
 * @returns true if portal was spawned, false if door doesn't exist or isn't a temporary portal
 */
export function spawnPortal(doorId: number): boolean {
  const door = doorsById.get(doorId);
  if (!door) return false;

  // Only temporary portals can be spawned
  if (door.doorType !== DoorType.TEMPORARY_PORTAL || !door.isTemporary) {
    return false;
  }

  // Cancel any existing expiration timer (in case portal is being re-spawned)
  cancelPortalExpirationTimer(doorId);

  // Mark portal as active
  activePortals.set(doorId, Date.now());

  // Start expiration timer if duration is set
  if (door.durationSeconds && door.durationSeconds > 0) {
    startPortalExpirationTimer(door);
  }

  return true;
}

/**
 * Despawn a temporary portal, making it invisible and unusable
 * Called when expiration timer fires or manually
 */
export function despawnPortal(doorId: number): boolean {
  const door = doorsById.get(doorId);
  if (!door) return false;

  if (!activePortals.has(doorId)) {
    return false; // Portal wasn't active
  }

  // Remove from active portals
  activePortals.delete(doorId);

  // Cancel expiration timer
  cancelPortalExpirationTimer(doorId);

  return true;
}

/**
 * Start the expiration timer for a temporary portal
 */
function startPortalExpirationTimer(door: Door): void {
  if (!door.durationSeconds || door.durationSeconds <= 0) return;

  const doorId = door.id;
  const timer = setTimeout(() => {
    portalExpirationTimers.delete(doorId);

    // Fetch fresh door data
    const currentDoor = doorsById.get(doorId);
    if (currentDoor && activePortals.has(doorId)) {
      expirePortal(currentDoor);
    }
  }, door.durationSeconds * 1000);

  portalExpirationTimers.set(doorId, timer);
}

/**
 * Cancel the expiration timer for a portal
 */
function cancelPortalExpirationTimer(doorId: number): void {
  const timer = portalExpirationTimers.get(doorId);
  if (timer) {
    clearTimeout(timer);
    portalExpirationTimers.delete(doorId);
  }
}

/**
 * Called when a portal's expiration timer fires
 */
function expirePortal(door: Door): void {
  // Remove from active portals
  activePortals.delete(door.id);

  // Broadcast disappearance to the room
  if (broadcastCallback) {
    // Use custom disappear message if set, otherwise generate default
    let message: string;
    if (door.disappearMessage) {
      message = door.disappearMessage;
    } else {
      // Use the display name as-is (it already has an article like "a whirling vortex")
      // Capitalize first letter for sentence start
      const portalName = door.itemDisplayName || 'the portal';
      const capitalizedName = portalName.charAt(0).toUpperCase() + portalName.slice(1);
      message = `${capitalizedName} vanishes!`;
    }
    broadcastCallback(door.entryRoomId, message);

    // Also broadcast to exit room if it's a two-way portal
    if (door.exitRoomId) {
      broadcastCallback(door.exitRoomId, message);
    }
  }
}

/**
 * Find a temporary portal by its spawn trigger text
 * Used when a player speaks the spawn phrase
 * @param roomId - The room to search in
 * @param spawnText - The text the player spoke
 * @returns The matching door or null if not found
 */
export function findPortalBySpawnTrigger(
  roomId: number,
  spawnText: string
): Door | null {
  const doors = doorsByRoomId.get(roomId);
  if (!doors) return null;

  const normalizedTrigger = spawnText.toLowerCase().trim();

  // Don't match empty trigger text
  if (!normalizedTrigger) return null;

  return (
    doors.find((door) => {
      // Only match temporary portals with spawn trigger text
      if (
        door.doorType !== DoorType.TEMPORARY_PORTAL ||
        !door.isTemporary ||
        !door.spawnTriggerText
      ) {
        return false;
      }

      // Match spawn trigger text (case-insensitive, trimmed)
      return door.spawnTriggerText.toLowerCase().trim() === normalizedTrigger;
    }) ?? null
  );
}

/**
 * Get count of active temporary portals (for debugging)
 */
export function getActivePortalCount(): number {
  return activePortals.size;
}

/**
 * Get count of portal expiration timers (for debugging)
 */
export function getPortalTimerCount(): number {
  return portalExpirationTimers.size;
}

// ============================================================================
// Permission System (Phase 10)
// ============================================================================

/**
 * Character data needed for permission checks
 */
export interface PermissionCheckCharacter {
  level: number;
  class: string;
  questFlags?: string[];
}

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a character meets the permission requirements to interact with a door
 * This check occurs BEFORE lock checks - a player who doesn't meet requirements
 * cannot even attempt to pick or bash the door.
 *
 * @param door - The door to check permissions for
 * @param character - The character's data (level, class)
 * @param hasRequiredItem - Whether the character has the required item (if any)
 * @returns { allowed: true } or { allowed: false, reason: string }
 */
export function checkDoorPermissions(
  door: Door,
  character: PermissionCheckCharacter,
  hasRequiredItem: boolean = true
): PermissionCheckResult {
  // Check level requirement
  if (door.requiredLevel !== null && character.level < door.requiredLevel) {
    const message =
      door.denialMessage ||
      `You must be at least level ${door.requiredLevel} to use this passage.`;
    return { allowed: false, reason: message };
  }

  // Check class requirement
  if (door.requiredClasses && door.requiredClasses.length > 0) {
    const characterClass = character.class.toLowerCase();
    const allowedClasses = door.requiredClasses.map((c) => c.toLowerCase());
    if (!allowedClasses.includes(characterClass)) {
      const message =
        door.denialMessage || 'Only certain classes may use this passage.';
      return { allowed: false, reason: message };
    }
  }

  // Check quest flag requirement
  if (door.requiredQuestFlag) {
    if (!character.questFlags?.includes(door.requiredQuestFlag)) {
      const message = door.denialMessage || 'You have not completed the required quest.';
      return { allowed: false, reason: message };
    }
  }

  // Check item requirement (item must be in inventory, not consumed)
  if (door.requiredItemTag && !hasRequiredItem) {
    const message =
      door.denialMessage || 'You do not have the required item to use this passage.';
    return { allowed: false, reason: message };
  }

  return { allowed: true };
}

/**
 * Check if a door has any permission requirements
 * Useful for determining if we need to fetch character data for checks
 */
export function doorHasPermissionRequirements(door: Door): boolean {
  return (
    door.requiredLevel !== null ||
    (door.requiredClasses !== null && door.requiredClasses.length > 0) ||
    door.requiredQuestFlag !== null ||
    door.requiredItemTag !== null
  );
}
