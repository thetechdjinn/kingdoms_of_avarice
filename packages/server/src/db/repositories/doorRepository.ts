import { query } from '../index.js';
import { Door, DoorType, DoorState, DoorData } from '@koa/shared';

// Database row type (snake_case from PostgreSQL)
interface DbDoor {
  id: number;
  name: string;
  display_name: string | null;
  door_type: string;
  description: string | null;
  entry_room_id: number;
  entry_direction: string;
  exit_room_id: number | null;
  exit_direction: string | null;
  default_state: string;
  auto_reset_seconds: number | null;
  has_lock: boolean;
  key_item_tag: string | null;
  pick_difficulty_min: number;
  pick_difficulty_max: number;
  bash_difficulty: number;
  is_hidden: boolean;
  trigger_text: string | null;
  passage_message_self: string | null;
  passage_message_room: string | null;
  passage_message_arrival: string | null;
  item_display_name: string | null;
  is_temporary: boolean;
  spawn_trigger_text: string | null;
  duration_seconds: number | null;
  appear_message: string | null;
  disappear_message: string | null;
  required_level: number | null;
  max_level: number | null;
  required_classes: string[] | null;
  required_quest_flag: string | null;
  required_item_tag: string | null;
  denial_message: string | null;
  created_at: Date;
  updated_at: Date;
}

// Convert database row to Door interface (snake_case to camelCase)
function dbToDoor(row: DbDoor): Door {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    doorType: row.door_type as DoorType,
    description: row.description,
    entryRoomId: row.entry_room_id,
    entryDirection: row.entry_direction,
    exitRoomId: row.exit_room_id,
    exitDirection: row.exit_direction,
    defaultState: row.default_state as DoorState,
    autoResetSeconds: row.auto_reset_seconds,
    hasLock: row.has_lock,
    keyItemTag: row.key_item_tag,
    pickDifficultyMin: row.pick_difficulty_min,
    pickDifficultyMax: row.pick_difficulty_max,
    bashDifficulty: row.bash_difficulty,
    isHidden: row.is_hidden,
    triggerText: row.trigger_text,
    passageMessageSelf: row.passage_message_self,
    passageMessageRoom: row.passage_message_room,
    passageMessageArrival: row.passage_message_arrival,
    itemDisplayName: row.item_display_name,
    isTemporary: row.is_temporary,
    spawnTriggerText: row.spawn_trigger_text,
    durationSeconds: row.duration_seconds,
    appearMessage: row.appear_message,
    disappearMessage: row.disappear_message,
    requiredLevel: row.required_level,
    maxLevel: row.max_level,
    requiredClasses: row.required_classes,
    requiredQuestFlag: row.required_quest_flag,
    requiredItemTag: row.required_item_tag,
    denialMessage: row.denial_message,
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
    displayName: door.displayName,
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
  displayName?: string | null;
  doorType: DoorType;
  description?: string;
  entryRoomId: number;
  entryDirection: string;
  exitRoomId?: number | null;
  exitDirection?: string | null;
  defaultState?: DoorState;
  autoResetSeconds?: number | null;
  hasLock?: boolean;
  keyItemTag?: string;
  pickDifficultyMin?: number;
  pickDifficultyMax?: number;
  bashDifficulty?: number;
  isHidden?: boolean;
  triggerText?: string;
  passageMessageSelf?: string;
  passageMessageRoom?: string;
  passageMessageArrival?: string;
  itemDisplayName?: string;
  isTemporary?: boolean;
  spawnTriggerText?: string;
  durationSeconds?: number | null;
  appearMessage?: string;
  disappearMessage?: string;
  requiredLevel?: number | null;
  maxLevel?: number | null;
  requiredClasses?: string[] | null;
  requiredQuestFlag?: string | null;
  requiredItemTag?: string | null;
  denialMessage?: string | null;
}

export async function createDoor(input: CreateDoorInput): Promise<Door> {
  const result = await query<DbDoor>(
    `INSERT INTO doors (
      name, display_name, door_type, description,
      entry_room_id, entry_direction,
      exit_room_id, exit_direction,
      default_state, auto_reset_seconds,
      has_lock, key_item_tag,
      pick_difficulty_min, pick_difficulty_max, bash_difficulty,
      is_hidden,
      trigger_text, passage_message_self, passage_message_room, passage_message_arrival,
      item_display_name,
      is_temporary, spawn_trigger_text, duration_seconds,
      appear_message, disappear_message,
      required_level, max_level, required_classes, required_quest_flag,
      required_item_tag, denial_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
    RETURNING *`,
    [
      input.name,
      input.displayName ?? null,
      input.doorType,
      input.description ?? null,
      input.entryRoomId,
      input.entryDirection.toLowerCase(),
      input.exitRoomId ?? null,
      input.exitDirection?.toLowerCase() ?? null,
      input.defaultState ?? DoorState.CLOSED,
      input.autoResetSeconds === undefined ? 120 : input.autoResetSeconds,
      input.hasLock ?? false,
      input.keyItemTag ?? null,
      input.pickDifficultyMin ?? 0,
      input.pickDifficultyMax ?? 0,
      input.bashDifficulty ?? 0,
      input.isHidden ?? false,
      input.triggerText ?? null,
      input.passageMessageSelf ?? null,
      input.passageMessageRoom ?? null,
      input.passageMessageArrival ?? null,
      input.itemDisplayName ?? null,
      input.isTemporary ?? false,
      input.spawnTriggerText ?? null,
      input.durationSeconds ?? null,
      input.appearMessage ?? null,
      input.disappearMessage ?? null,
      input.requiredLevel ?? null,
      input.maxLevel ?? null,
      input.requiredClasses ?? null,
      input.requiredQuestFlag ?? null,
      input.requiredItemTag ?? null,
      input.denialMessage ?? null,
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
  if (updates.displayName !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    values.push(updates.displayName);
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
  if (updates.autoResetSeconds !== undefined) {
    setClauses.push(`auto_reset_seconds = $${paramIndex++}`);
    values.push(updates.autoResetSeconds);
  }
  if (updates.hasLock !== undefined) {
    setClauses.push(`has_lock = $${paramIndex++}`);
    values.push(updates.hasLock);
  }
  if (updates.keyItemTag !== undefined) {
    setClauses.push(`key_item_tag = $${paramIndex++}`);
    values.push(updates.keyItemTag);
  }
  if (updates.pickDifficultyMin !== undefined) {
    setClauses.push(`pick_difficulty_min = $${paramIndex++}`);
    values.push(updates.pickDifficultyMin);
  }
  if (updates.pickDifficultyMax !== undefined) {
    setClauses.push(`pick_difficulty_max = $${paramIndex++}`);
    values.push(updates.pickDifficultyMax);
  }
  if (updates.bashDifficulty !== undefined) {
    setClauses.push(`bash_difficulty = $${paramIndex++}`);
    values.push(updates.bashDifficulty);
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
  if (updates.passageMessageArrival !== undefined) {
    setClauses.push(`passage_message_arrival = $${paramIndex++}`);
    values.push(updates.passageMessageArrival);
  }
  if (updates.itemDisplayName !== undefined) {
    setClauses.push(`item_display_name = $${paramIndex++}`);
    values.push(updates.itemDisplayName);
  }
  if (updates.isTemporary !== undefined) {
    setClauses.push(`is_temporary = $${paramIndex++}`);
    values.push(updates.isTemporary);
  }
  if (updates.spawnTriggerText !== undefined) {
    setClauses.push(`spawn_trigger_text = $${paramIndex++}`);
    values.push(updates.spawnTriggerText);
  }
  if (updates.durationSeconds !== undefined) {
    setClauses.push(`duration_seconds = $${paramIndex++}`);
    values.push(updates.durationSeconds);
  }
  if (updates.appearMessage !== undefined) {
    setClauses.push(`appear_message = $${paramIndex++}`);
    values.push(updates.appearMessage);
  }
  if (updates.disappearMessage !== undefined) {
    setClauses.push(`disappear_message = $${paramIndex++}`);
    values.push(updates.disappearMessage);
  }
  if (updates.requiredLevel !== undefined) {
    setClauses.push(`required_level = $${paramIndex++}`);
    values.push(updates.requiredLevel);
  }
  if (updates.maxLevel !== undefined) {
    setClauses.push(`max_level = $${paramIndex++}`);
    values.push(updates.maxLevel);
  }
  if (updates.requiredClasses !== undefined) {
    setClauses.push(`required_classes = $${paramIndex++}`);
    values.push(updates.requiredClasses);
  }
  if (updates.requiredQuestFlag !== undefined) {
    setClauses.push(`required_quest_flag = $${paramIndex++}`);
    values.push(updates.requiredQuestFlag);
  }
  if (updates.requiredItemTag !== undefined) {
    setClauses.push(`required_item_tag = $${paramIndex++}`);
    values.push(updates.requiredItemTag);
  }
  if (updates.denialMessage !== undefined) {
    setClauses.push(`denial_message = $${paramIndex++}`);
    values.push(updates.denialMessage);
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
