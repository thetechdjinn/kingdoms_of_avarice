import { query } from '../index.js';

export interface DbRoom {
  id: number;
  name: string;
  description: string | null;
  area: string | null;
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

export async function createRoom(input: CreateRoomInput): Promise<DbRoom> {
  const result = await query<DbRoom>(
    `INSERT INTO rooms (name, description, area)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.name, input.description || null, input.area || null]
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

export async function createExit(input: CreateExitInput): Promise<DbRoomExit> {
  const result = await query<DbRoomExit>(
    `INSERT INTO room_exits (from_room_id, to_room_id, direction)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.fromRoomId, input.toRoomId, input.direction]
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

  const forward = await createExit({
    fromRoomId: roomAId,
    toRoomId: roomBId,
    direction: directionAtoB,
  });

  const reverse = await createExit({
    fromRoomId: roomBId,
    toRoomId: roomAId,
    direction: reverseDirection,
  });

  return { forward, reverse };
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

  // Get the target room first
  const exitResult = await query<DbRoomExit>(
    'SELECT * FROM room_exits WHERE from_room_id = $1 AND direction = $2',
    [fromRoomId, direction]
  );

  if (exitResult.rows.length === 0) return false;

  const targetRoomId = exitResult.rows[0].to_room_id;
  const reverseDirection = opposites[direction] || direction;

  // Delete both directions
  await query(
    'DELETE FROM room_exits WHERE from_room_id = $1 AND direction = $2',
    [fromRoomId, direction]
  );
  await query(
    'DELETE FROM room_exits WHERE from_room_id = $1 AND direction = $2',
    [targetRoomId, reverseDirection]
  );

  return true;
}

export async function getRoomCount(): Promise<number> {
  const result = await query<{ count: string }>('SELECT COUNT(*) as count FROM rooms');
  return parseInt(result.rows[0].count);
}
