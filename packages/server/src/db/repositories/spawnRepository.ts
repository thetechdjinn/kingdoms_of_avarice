import { query } from '../index.js';
import { RoomSpawn } from '@koa/shared';

// Database row type
interface DbRoomSpawn {
  id: number;
  room_id: number;
  npc_id: number;
  max_active: number;
  respawn_seconds: number;
}

// Extended row type with joined names (for API responses)
interface DbRoomSpawnWithNames extends DbRoomSpawn {
  room_name: string | null;
  npc_name: string | null;
}

export interface RoomSpawnWithNames extends RoomSpawn {
  roomName: string | null;
  npcName: string | null;
}

function dbToRoomSpawn(row: DbRoomSpawn): RoomSpawn {
  return {
    id: row.id,
    roomId: row.room_id,
    npcId: row.npc_id,
    maxActive: row.max_active,
    respawnSeconds: row.respawn_seconds,
  };
}

function dbToRoomSpawnWithNames(row: DbRoomSpawnWithNames): RoomSpawnWithNames {
  return {
    ...dbToRoomSpawn(row),
    roomName: row.room_name,
    npcName: row.npc_name,
  };
}

/**
 * Get all spawn configs (for npcManager initialization).
 */
export async function getAllSpawns(): Promise<RoomSpawn[]> {
  const result = await query<DbRoomSpawn>('SELECT * FROM room_spawns ORDER BY id');
  return result.rows.map(dbToRoomSpawn);
}

/**
 * Get spawn configs for a room (with NPC names joined).
 */
export async function getSpawnsByRoom(roomId: number): Promise<RoomSpawnWithNames[]> {
  const result = await query<DbRoomSpawnWithNames>(
    `SELECT rs.*, r.name AS room_name, n.name AS npc_name
     FROM room_spawns rs
     LEFT JOIN rooms r ON r.id = rs.room_id
     LEFT JOIN npcs n ON n.id = rs.npc_id
     WHERE rs.room_id = $1
     ORDER BY n.name`,
    [roomId]
  );
  return result.rows.map(dbToRoomSpawnWithNames);
}

/**
 * Get spawn configs for an NPC template (with room names joined).
 */
export async function getSpawnsByNpc(npcId: number): Promise<RoomSpawnWithNames[]> {
  const result = await query<DbRoomSpawnWithNames>(
    `SELECT rs.*, r.name AS room_name, n.name AS npc_name
     FROM room_spawns rs
     LEFT JOIN rooms r ON r.id = rs.room_id
     LEFT JOIN npcs n ON n.id = rs.npc_id
     WHERE rs.npc_id = $1
     ORDER BY r.name`,
    [npcId]
  );
  return result.rows.map(dbToRoomSpawnWithNames);
}

/**
 * Get a single spawn config by ID.
 */
export async function getSpawnById(id: number): Promise<RoomSpawn | null> {
  const result = await query<DbRoomSpawn>('SELECT * FROM room_spawns WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return dbToRoomSpawn(result.rows[0]);
}

/**
 * Create a new spawn config.
 */
export async function createSpawn(input: {
  roomId: number;
  npcId: number;
  maxActive?: number;
  respawnSeconds?: number;
}): Promise<RoomSpawn> {
  const result = await query<DbRoomSpawn>(
    `INSERT INTO room_spawns (room_id, npc_id, max_active, respawn_seconds)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.roomId, input.npcId, input.maxActive ?? 1, input.respawnSeconds ?? 60]
  );
  return dbToRoomSpawn(result.rows[0]);
}

/**
 * Update a spawn config. Only provided fields are updated.
 */
export async function updateSpawn(
  id: number,
  input: { maxActive?: number; respawnSeconds?: number }
): Promise<RoomSpawn | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.maxActive !== undefined) {
    setClauses.push(`max_active = $${paramIndex++}`);
    values.push(input.maxActive);
  }
  if (input.respawnSeconds !== undefined) {
    setClauses.push(`respawn_seconds = $${paramIndex++}`);
    values.push(input.respawnSeconds);
  }

  if (setClauses.length === 0) return getSpawnById(id);

  values.push(id);
  const result = await query<DbRoomSpawn>(
    `UPDATE room_spawns SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  if (result.rows.length === 0) return null;
  return dbToRoomSpawn(result.rows[0]);
}

/**
 * Delete a spawn config.
 */
export async function deleteSpawn(id: number): Promise<boolean> {
  const result = await query('DELETE FROM room_spawns WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Upsert a spawn config (insert or update on conflict).
 * Used by data import for idempotent merge.
 */
export async function upsertSpawn(input: {
  roomId: number;
  npcId: number;
  maxActive?: number;
  respawnSeconds?: number;
}): Promise<RoomSpawn> {
  const result = await query<DbRoomSpawn>(
    `INSERT INTO room_spawns (room_id, npc_id, max_active, respawn_seconds)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (room_id, npc_id) DO UPDATE SET
       max_active = EXCLUDED.max_active,
       respawn_seconds = EXCLUDED.respawn_seconds
     RETURNING *`,
    [input.roomId, input.npcId, input.maxActive ?? 1, input.respawnSeconds ?? 60]
  );
  return dbToRoomSpawn(result.rows[0]);
}

/**
 * Delete all spawn configs for a room.
 */
export async function deleteSpawnsByRoom(roomId: number): Promise<number> {
  const result = await query('DELETE FROM room_spawns WHERE room_id = $1', [roomId]);
  return result.rowCount ?? 0;
}
