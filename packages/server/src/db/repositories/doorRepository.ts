import { query } from '../index.js';
import { Door, DoorType, DoorState, DoorData } from '@koa/shared';

// Database row type (snake_case from PostgreSQL)
interface DbDoor {
  id: number;
  name: string;
  door_type: string;
  description: string | null;
  entry_room_id: number;
  entry_direction: string;
  exit_room_id: number | null;
  exit_direction: string | null;
  default_state: string;
  auto_close_seconds: number | null;
  has_lock: boolean;
  key_item_tag: string | null;
  auto_lock_seconds: number | null;
  is_hidden: boolean;
  trigger_text: string | null;
  passage_message_self: string | null;
  passage_message_room: string | null;
  item_display_name: string | null;
  created_at: Date;
  updated_at: Date;
}

// Convert database row to Door interface (snake_case to camelCase)
function dbToDoor(row: DbDoor): Door {
  return {
    id: row.id,
    name: row.name,
    doorType: row.door_type as DoorType,
    description: row.description,
    entryRoomId: row.entry_room_id,
    entryDirection: row.entry_direction,
    exitRoomId: row.exit_room_id,
    exitDirection: row.exit_direction,
    defaultState: row.default_state as DoorState,
    autoCloseSeconds: row.auto_close_seconds,
    hasLock: row.has_lock,
    keyItemTag: row.key_item_tag,
    autoLockSeconds: row.auto_lock_seconds,
    isHidden: row.is_hidden,
    triggerText: row.trigger_text,
    passageMessageSelf: row.passage_message_self,
    passageMessageRoom: row.passage_message_room,
    itemDisplayName: row.item_display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Convert Door to DoorData for client (with direction from perspective of a room)
export function doorToDoorData(door: Door, fromRoomId: number, currentState?: DoorState): DoorData {
  // Determine direction based on which side of the door we're viewing from
  const isEntryRoom = door.entryRoomId === fromRoomId;
  const direction = isEntryRoom ? door.entryDirection : (door.exitDirection ?? door.entryDirection);

  return {
    id: door.id,
    name: door.name,
    doorType: door.doorType,
    direction,
    state: currentState ?? door.defaultState,
    isHidden: door.isHidden,
    triggerText: door.triggerText,
    itemDisplayName: door.itemDisplayName,
    hasLock: door.hasLock,
  };
}

// ============================================================================
// Read Operations
// ============================================================================

export async function getDoorById(id: number): Promise<Door | null> {
  const result = await query<DbDoor>(
    'SELECT * FROM doors WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToDoor(result.rows[0]) : null;
}

export async function getAllDoors(): Promise<Door[]> {
  const result = await query<DbDoor>(
    'SELECT * FROM doors ORDER BY id'
  );
  return result.rows.map(dbToDoor);
}

/**
 * Get all doors connected to a room (either as entry or exit)
 */
export async function getDoorsByRoomId(roomId: number): Promise<Door[]> {
  const result = await query<DbDoor>(
    `SELECT * FROM doors
     WHERE entry_room_id = $1 OR exit_room_id = $1
     ORDER BY id`,
    [roomId]
  );
  return result.rows.map(dbToDoor);
}

/**
 * Get doors where this room is the entry side
 */
export async function getDoorsFromRoom(roomId: number): Promise<Door[]> {
  const result = await query<DbDoor>(
    'SELECT * FROM doors WHERE entry_room_id = $1 ORDER BY id',
    [roomId]
  );
  return result.rows.map(dbToDoor);
}

/**
 * Get doors where this room is the exit side (for two-way doors)
 */
export async function getDoorsToRoom(roomId: number): Promise<Door[]> {
  const result = await query<DbDoor>(
    'SELECT * FROM doors WHERE exit_room_id = $1 ORDER BY id',
    [roomId]
  );
  return result.rows.map(dbToDoor);
}

/**
 * Get a door by room and direction
 * Checks both entry and exit directions for the room
 */
export async function getDoorByRoomAndDirection(
  roomId: number,
  direction: string
): Promise<Door | null> {
  const result = await query<DbDoor>(
    `SELECT * FROM doors
     WHERE (entry_room_id = $1 AND entry_direction = $2)
        OR (exit_room_id = $1 AND exit_direction = $2)
     LIMIT 1`,
    [roomId, direction.toLowerCase()]
  );
  return result.rows[0] ? dbToDoor(result.rows[0]) : null;
}

/**
 * Get the destination room ID when passing through a door from a specific room
 */
export function getDoorDestination(door: Door, fromRoomId: number): number | null {
  if (door.entryRoomId === fromRoomId) {
    return door.exitRoomId;
  }
  if (door.exitRoomId === fromRoomId) {
    return door.entryRoomId;
  }
  return null;
}

// ============================================================================
// Write Operations
// ============================================================================

export interface CreateDoorInput {
  name: string;
  doorType: DoorType;
  description?: string;
  entryRoomId: number;
  entryDirection: string;
  exitRoomId?: number;
  exitDirection?: string;
  defaultState?: DoorState;
  autoCloseSeconds?: number | null;
  hasLock?: boolean;
  keyItemTag?: string;
  autoLockSeconds?: number | null;
  isHidden?: boolean;
  triggerText?: string;
  passageMessageSelf?: string;
  passageMessageRoom?: string;
  itemDisplayName?: string;
}

export async function createDoor(input: CreateDoorInput): Promise<Door> {
  const result = await query<DbDoor>(
    `INSERT INTO doors (
      name, door_type, description,
      entry_room_id, entry_direction,
      exit_room_id, exit_direction,
      default_state, auto_close_seconds,
      has_lock, key_item_tag, auto_lock_seconds,
      is_hidden,
      trigger_text, passage_message_self, passage_message_room,
      item_display_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      input.name,
      input.doorType,
      input.description ?? null,
      input.entryRoomId,
      input.entryDirection.toLowerCase(),
      input.exitRoomId ?? null,
      input.exitDirection?.toLowerCase() ?? null,
      input.defaultState ?? DoorState.CLOSED,
      input.autoCloseSeconds === undefined ? 120 : input.autoCloseSeconds,
      input.hasLock ?? false,
      input.keyItemTag ?? null,
      input.autoLockSeconds ?? null,
      input.isHidden ?? false,
      input.triggerText ?? null,
      input.passageMessageSelf ?? null,
      input.passageMessageRoom ?? null,
      input.itemDisplayName ?? null,
    ]
  );
  return dbToDoor(result.rows[0]);
}

export async function updateDoor(
  id: number,
  updates: Partial<CreateDoorInput>
): Promise<Door | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.doorType !== undefined) {
    setClauses.push(`door_type = $${paramIndex++}`);
    values.push(updates.doorType);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.entryRoomId !== undefined) {
    setClauses.push(`entry_room_id = $${paramIndex++}`);
    values.push(updates.entryRoomId);
  }
  if (updates.entryDirection !== undefined) {
    setClauses.push(`entry_direction = $${paramIndex++}`);
    values.push(updates.entryDirection.toLowerCase());
  }
  if (updates.exitRoomId !== undefined) {
    setClauses.push(`exit_room_id = $${paramIndex++}`);
    values.push(updates.exitRoomId);
  }
  if (updates.exitDirection !== undefined) {
    setClauses.push(`exit_direction = $${paramIndex++}`);
    values.push(updates.exitDirection?.toLowerCase() ?? null);
  }
  if (updates.defaultState !== undefined) {
    setClauses.push(`default_state = $${paramIndex++}`);
    values.push(updates.defaultState);
  }
  if (updates.autoCloseSeconds !== undefined) {
    setClauses.push(`auto_close_seconds = $${paramIndex++}`);
    values.push(updates.autoCloseSeconds);
  }
  if (updates.hasLock !== undefined) {
    setClauses.push(`has_lock = $${paramIndex++}`);
    values.push(updates.hasLock);
  }
  if (updates.keyItemTag !== undefined) {
    setClauses.push(`key_item_tag = $${paramIndex++}`);
    values.push(updates.keyItemTag);
  }
  if (updates.autoLockSeconds !== undefined) {
    setClauses.push(`auto_lock_seconds = $${paramIndex++}`);
    values.push(updates.autoLockSeconds);
  }
  if (updates.isHidden !== undefined) {
    setClauses.push(`is_hidden = $${paramIndex++}`);
    values.push(updates.isHidden);
  }
  if (updates.triggerText !== undefined) {
    setClauses.push(`trigger_text = $${paramIndex++}`);
    values.push(updates.triggerText);
  }
  if (updates.passageMessageSelf !== undefined) {
    setClauses.push(`passage_message_self = $${paramIndex++}`);
    values.push(updates.passageMessageSelf);
  }
  if (updates.passageMessageRoom !== undefined) {
    setClauses.push(`passage_message_room = $${paramIndex++}`);
    values.push(updates.passageMessageRoom);
  }
  if (updates.itemDisplayName !== undefined) {
    setClauses.push(`item_display_name = $${paramIndex++}`);
    values.push(updates.itemDisplayName);
  }

  if (setClauses.length === 0) {
    return getDoorById(id);
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await query<DbDoor>(
    `UPDATE doors SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] ? dbToDoor(result.rows[0]) : null;
}

export async function deleteDoor(id: number): Promise<boolean> {
  const result = await query('DELETE FROM doors WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Get all doors for multiple rooms at once (efficient for loading many rooms)
 */
export async function getDoorsByRoomIds(roomIds: number[]): Promise<Map<number, Door[]>> {
  if (roomIds.length === 0) {
    return new Map();
  }

  const result = await query<DbDoor>(
    `SELECT * FROM doors
     WHERE entry_room_id = ANY($1) OR exit_room_id = ANY($1)
     ORDER BY id`,
    [roomIds]
  );

  // Group doors by room ID (a door may appear for both entry and exit rooms)
  const doorsByRoom = new Map<number, Door[]>();
  for (const roomId of roomIds) {
    doorsByRoom.set(roomId, []);
  }

  for (const row of result.rows) {
    const door = dbToDoor(row);

    // Add to entry room's list
    if (doorsByRoom.has(door.entryRoomId)) {
      doorsByRoom.get(door.entryRoomId)!.push(door);
    }

    // Add to exit room's list (if it's a two-way door)
    if (door.exitRoomId && doorsByRoom.has(door.exitRoomId)) {
      doorsByRoom.get(door.exitRoomId)!.push(door);
    }
  }

  return doorsByRoom;
}
