/**
 * Door system types and interfaces
 *
 * Doors provide various ways to connect rooms with different mechanics:
 * - Open passageways (simple exits)
 * - Physical doors (can be opened/closed/locked)
 * - Special doors (appear as items, use text triggers)
 * - Triggered passageways (hidden exits)
 * - Temporary portals (appear/disappear based on triggers)
 */

/**
 * The type of door determines its behavior and display
 */
export enum DoorType {
  /** Simple exit with no door - just a passageway */
  OPEN_PASSAGEWAY = 'open_passageway',
  /** Standard door that can be opened/closed and optionally locked */
  PHYSICAL = 'physical',
  /** Appears as an item in room, uses text trigger to pass through */
  SPECIAL = 'special',
  /** Hidden exit activated by text trigger */
  TRIGGERED_PASSAGEWAY = 'triggered_passageway',
  /** Temporary door that appears when triggered and expires after duration */
  TEMPORARY_PORTAL = 'temporary_portal',
}

/**
 * Current state of a physical door
 */
export enum DoorState {
  /** Door is open - players can pass through */
  OPEN = 'open',
  /** Door is closed but not locked - players must open it first */
  CLOSED = 'closed',
  /** Door is closed and locked - requires key, picking, or bashing */
  LOCKED = 'locked',
}

/**
 * Core door data stored in the database
 */
export interface Door {
  id: number;
  /** Display name of the door (e.g., "wooden door", "iron gate") */
  name: string;
  /** Type determines behavior and display rules */
  doorType: DoorType;
  /** Description shown when player looks at the door */
  description: string | null;

  // Connection data
  /** Room where the door entry side is located */
  entryRoomId: number;
  /** Direction from entry room (e.g., "north", "up") */
  entryDirection: string;
  /** Room where the door exit side is located (null = one-way door) */
  exitRoomId: number | null;
  /** Direction from exit room back to entry room (null = one-way door) */
  exitDirection: string | null;

  // State (for physical doors)
  /** The state the door resets to (on server restart or after events) */
  defaultState: DoorState;
  /** Seconds until door auto-closes after being opened (null = no auto-close) */
  autoCloseSeconds: number | null;

  // Lock properties (for physical doors)
  /** Whether this door has a lock */
  hasLock: boolean;
  /** Tag that matches an item's key_tag in flags to unlock this door */
  keyItemTag: string | null;
  /** Seconds until door auto-locks after being unlocked (null = no auto-lock) */
  autoLockSeconds: number | null;
  /** Difficulty to pick lock (0-500+, 500+ = unpickable). Success: roll(0-100) + lockpicking >= difficulty */
  pickDifficulty: number;
  /** Difficulty to bash door (0-500+, 500+ = unbashable). Failed bash deals 1-2% max HP damage */
  bashDifficulty: number;

  // Visibility
  /** If true, door doesn't appear on "Obvious exits" line */
  isHidden: boolean;

  // Trigger text
  /** Text player types to activate/pass through (e.g., "go portal", "climb rope") */
  triggerText: string | null;

  // Passage messages
  /** Message shown to player when passing through (e.g., "You crawl through the hole.") */
  passageMessageSelf: string | null;
  /** Message shown to room when player passes through (e.g., "{player} crawls through the hole.") */
  passageMessageRoom: string | null;

  // Special door display
  /** How the door appears on "Also here:" line (for special doors) */
  itemDisplayName: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Door data as returned to clients (camelCase, minimal fields)
 */
export interface DoorData {
  id: number;
  name: string;
  doorType: DoorType;
  /** Direction of this door from the current room's perspective */
  direction: string;
  state: DoorState | null;
  isHidden: boolean;
  triggerText: string | null;
  itemDisplayName: string | null;
  /** Whether this door has a lock (client may show different UI) */
  hasLock: boolean;
}
