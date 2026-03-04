import pg from 'pg';
import { query, withTransaction } from '../index.js';
import { RoomFeatures, RoomTrainingConfig, RoomRespawnConfig } from '@koa/shared';

export interface DbRoom {
  id: number;
  name: string;
  description: string | null;
  area: string | null;
  terrain: string | null;
  features: RoomFeatures;
  tag: string | null;
}

export interface DbRoomExit {
  id: number;
  from_room_id: number;
  to_room_id: number;
  direction: string;
}

export interface RoomWithExits extends DbRoom {
  exits: Map<string, number>;
}

export interface CreateRoomInput {
  name: string;
  description?: string;
  area?: string;
  terrain?: string;
  features?: RoomFeatures;
  tag?: string | null;
}

export interface CreateExitInput {
  fromRoomId: number;
  toRoomId: number;
  direction: string;
}

export async function getAllRooms(): Promise<DbRoom[]> {
  const result = await query<DbRoom>('SELECT * FROM rooms ORDER BY id');
  return result.rows;
}

export async function getRoomById(id: number): Promise<DbRoom | null> {
  const result = await query<DbRoom>('SELECT * FROM rooms WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getRoomByTag(tag: string): Promise<DbRoom | null> {
  const result = await query<DbRoom>('SELECT * FROM rooms WHERE tag = $1', [tag]);
  return result.rows[0] || null;
}

export async function getIdToTagMap(): Promise<Map<number, string>> {
  const result = await query<{ id: number; tag: string }>('SELECT id, tag FROM rooms WHERE tag IS NOT NULL');
  const map = new Map<number, string>();
  for (const row of result.rows) {
    map.set(row.id, row.tag);
  }
  return map;
}

export async function getTagToIdMap(): Promise<Map<string, number>> {
  const result = await query<{ id: number; tag: string }>('SELECT id, tag FROM rooms WHERE tag IS NOT NULL');
  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.tag, row.id);
  }
  return map;
}

export async function getRoomExits(roomId: number): Promise<DbRoomExit[]> {
  const result = await query<DbRoomExit>(
    'SELECT * FROM room_exits WHERE from_room_id = $1',
    [roomId]
  );
  return result.rows;
}

export async function getAllExits(): Promise<DbRoomExit[]> {
  const result = await query<DbRoomExit>('SELECT * FROM room_exits');
  return result.rows;
}

export async function getRoomWithExits(id: number): Promise<RoomWithExits | null> {
  const room = await getRoomById(id);
  if (!room) return null;

  const exits = await getRoomExits(id);
  const exitMap = new Map<string, number>();
  for (const exit of exits) {
    exitMap.set(exit.direction, exit.to_room_id);
  }

  return { ...room, exits: exitMap };
}

export async function getAllRoomsWithExits(): Promise<RoomWithExits[]> {
  const rooms = await getAllRooms();
  const allExits = await getAllExits();

  const exitsByRoom = new Map<number, Map<string, number>>();
  for (const exit of allExits) {
    if (!exitsByRoom.has(exit.from_room_id)) {
      exitsByRoom.set(exit.from_room_id, new Map());
    }
    exitsByRoom.get(exit.from_room_id)!.set(exit.direction, exit.to_room_id);
  }

  return rooms.map(room => ({
    ...room,
    exits: exitsByRoom.get(room.id) || new Map(),
  }));
}

export async function createRoom(input: CreateRoomInput, client?: pg.PoolClient): Promise<DbRoom> {
  const result = await query<DbRoom>(
    `INSERT INTO rooms (name, description, area, terrain, features, tag)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.name, input.description || null, input.area || null, input.terrain || 'indoor', JSON.stringify(input.features || {}), input.tag || null],
    client
  );
  return result.rows[0];
}

export async function updateRoom(
  id: number,
  updates: Partial<CreateRoomInput>
): Promise<DbRoom | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.area !== undefined) {
    setClauses.push(`area = $${paramIndex++}`);
    values.push(updates.area);
  }
  if (updates.terrain !== undefined) {
    setClauses.push(`terrain = $${paramIndex++}`);
    values.push(updates.terrain);
  }
  if (updates.features !== undefined) {
    setClauses.push(`features = $${paramIndex++}`);
    values.push(JSON.stringify(updates.features));
  }
  if (updates.tag !== undefined) {
    setClauses.push(`tag = $${paramIndex++}`);
    values.push(updates.tag);
  }

  if (setClauses.length === 0) return getRoomById(id);

  values.push(id);
  const result = await query<DbRoom>(
    `UPDATE rooms SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteRoom(id: number): Promise<boolean> {
  const result = await query('DELETE FROM rooms WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function createExit(input: CreateExitInput, client?: pg.PoolClient): Promise<DbRoomExit> {
  const result = await query<DbRoomExit>(
    `INSERT INTO room_exits (from_room_id, to_room_id, direction)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.fromRoomId, input.toRoomId, input.direction],
    client
  );
  return result.rows[0];
}

export async function createBidirectionalExit(
  roomAId: number,
  roomBId: number,
  directionAtoB: string
): Promise<{ forward: DbRoomExit; reverse: DbRoomExit }> {
  const opposites: Record<string, string> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    up: 'down',
    down: 'up',
    northeast: 'southwest',
    northwest: 'southeast',
    southeast: 'northwest',
    southwest: 'northeast',
  };

  const reverseDirection = opposites[directionAtoB] || directionAtoB;

  return withTransaction(async (client) => {
    const forward = await createExit({
      fromRoomId: roomAId,
      toRoomId: roomBId,
      direction: directionAtoB,
    }, client);

    const reverse = await createExit({
      fromRoomId: roomBId,
      toRoomId: roomAId,
      direction: reverseDirection,
    }, client);

    return { forward, reverse };
  });
}

export async function deleteExit(fromRoomId: number, direction: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM room_exits WHERE from_room_id = $1 AND direction = $2',
    [fromRoomId, direction]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteBidirectionalExit(
  fromRoomId: number,
  direction: string
): Promise<boolean> {
  const opposites: Record<string, string> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    up: 'down',
    down: 'up',
    northeast: 'southwest',
    northwest: 'southeast',
    southeast: 'northwest',
    southwest: 'northeast',
  };

  return withTransaction(async (client) => {
    // Get the target room first
    const exitResult = await query<DbRoomExit>(
      'SELECT * FROM room_exits WHERE from_room_id = $1 AND direction = $2',
      [fromRoomId, direction],
      client
    );

    if (exitResult.rows.length === 0) return false;

    const targetRoomId = exitResult.rows[0].to_room_id;
    const reverseDirection = opposites[direction] || direction;

    // Delete both directions atomically
    await query(
      'DELETE FROM room_exits WHERE from_room_id = $1 AND direction = $2',
      [fromRoomId, direction],
      client
    );
    await query(
      'DELETE FROM room_exits WHERE from_room_id = $1 AND direction = $2',
      [targetRoomId, reverseDirection],
      client
    );

    return true;
  });
}

export async function getRoomCount(): Promise<number> {
  const result = await query<{ count: string }>('SELECT COUNT(*) as count FROM rooms');
  return parseInt(result.rows[0].count);
}

// ============================================================================
// ROOM FEATURES
// ============================================================================

/**
 * Get features for a room
 */
export async function getRoomFeatures(roomId: number): Promise<RoomFeatures> {
  const result = await query<{ features: RoomFeatures }>(
    'SELECT features FROM rooms WHERE id = $1',
    [roomId]
  );
  if (result.rows.length === 0) {
    return {};
  }
  return result.rows[0].features || {};
}

/**
 * Update features for a room
 */
export async function updateRoomFeatures(roomId: number, features: RoomFeatures): Promise<void> {
  await query(
    'UPDATE rooms SET features = $1 WHERE id = $2',
    [JSON.stringify(features), roomId]
  );
}

/**
 * Check if a room is a bank room
 */
export async function isBankRoom(roomId: number): Promise<boolean> {
  const features = await getRoomFeatures(roomId);
  return features.bank?.enabled === true;
}

/**
 * Check if a room is a training room
 */
export async function isTrainingRoom(roomId: number): Promise<boolean> {
  const features = await getRoomFeatures(roomId);
  return features.training?.enabled === true;
}

/**
 * Get training configuration for a room
 * Returns null if the room is not a training room
 */
export async function getTrainingConfig(roomId: number): Promise<RoomTrainingConfig | null> {
  const features = await getRoomFeatures(roomId);
  if (!features.training?.enabled) {
    return null;
  }
  return features.training;
}

/**
 * Check if a character can train in a room
 * @param roomId - Room to check
 * @param characterClass - Character's class name
 * @param characterLevel - Character's current level
 * @param targetLevel - Level character wants to train to (optional, defaults to current+1)
 * @returns Object with allowed status and reason if denied
 */
export async function canTrainInRoom(
  roomId: number,
  characterClass: string,
  characterLevel: number,
  targetLevel?: number
): Promise<{ allowed: boolean; reason?: string }> {
  const config = await getTrainingConfig(roomId);

  if (!config) {
    return { allowed: false, reason: 'This is not a training room.' };
  }

  // Check class restriction
  if (config.allowedClasses && config.allowedClasses.length > 0) {
    const classLower = characterClass.toLowerCase();
    const allowedLower = config.allowedClasses.map(c => c.toLowerCase());
    if (!allowedLower.includes(classLower)) {
      return {
        allowed: false,
        reason: `This training room does not accept ${characterClass}s.`,
      };
    }
  }

  // Check level restrictions
  const minLevel = config.minLevel ?? 1;
  const maxLevel = config.maxLevel ?? 999;
  const checkLevel = targetLevel ?? characterLevel + 1;

  if (checkLevel < minLevel) {
    return {
      allowed: false,
      reason: `This training room only accepts characters level ${minLevel} or higher.`,
    };
  }

  if (checkLevel > maxLevel) {
    return {
      allowed: false,
      reason: `This training room only trains characters up to level ${maxLevel}.`,
    };
  }

  return { allowed: true };
}

// ============================================================================
// RESPAWN ROOM FEATURES
// ============================================================================

/**
 * Get the respawn room for a given area.
 * Checks both rooms in the same area AND rooms that list this area in their servedAreas.
 * If multiple rooms are marked as respawn points for the same area,
 * returns the one with the lowest priority value.
 * @param area - The area name to search for respawn rooms
 * @returns The room ID of the respawn room, or null if none exists
 */
export async function getRespawnRoomForArea(area: string): Promise<number | null> {
  // Find respawn rooms that serve this area:
  // 1. Room is in the same area, OR
  // 2. Room's servedAreas array contains this area
  const result = await query<{ id: number; features: RoomFeatures }>(
    `SELECT id, features FROM rooms
     WHERE (features->>'respawn')::jsonb->>'enabled' = 'true'
     AND (
       area = $1
       OR (features->'respawn'->'servedAreas') ? $1
     )
     ORDER BY COALESCE(((features->>'respawn')::jsonb->>'priority')::int, 0) ASC
     LIMIT 1`,
    [area]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
}

/**
 * Get all rooms marked as respawn points (for admin/debugging)
 * @returns Array of rooms with their respawn configurations
 */
export async function getAllRespawnRooms(): Promise<Array<{ id: number; name: string; area: string | null; respawn: RoomRespawnConfig }>> {
  const result = await query<{ id: number; name: string; area: string | null; features: RoomFeatures }>(
    `SELECT id, name, area, features FROM rooms
     WHERE (features->>'respawn')::jsonb->>'enabled' = 'true'
     ORDER BY area, COALESCE(((features->>'respawn')::jsonb->>'priority')::int, 0) ASC`
  );

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    area: row.area,
    respawn: row.features.respawn!,
  }));
}

/**
 * Check if a room is a respawn room
 */
export async function isRespawnRoom(roomId: number): Promise<boolean> {
  const features = await getRoomFeatures(roomId);
  return features.respawn?.enabled === true;
}

/**
 * Get respawn configuration for a room
 * Returns null if the room is not a respawn room
 */
export async function getRespawnConfig(roomId: number): Promise<RoomRespawnConfig | null> {
  const features = await getRoomFeatures(roomId);
  if (!features.respawn?.enabled) {
    return null;
  }
  return features.respawn;
}
