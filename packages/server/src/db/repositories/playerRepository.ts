import pg from 'pg';
import { query } from '../index.js';
import bcrypt from 'bcrypt';

export interface Player {
  id: number;
  username: string;
  password_hash: string;
  email: string | null;
  max_characters: number | null;  // NULL = use global default
  created_at: Date;
  last_login: Date | null;
  brief_mode: boolean;
  current_room_id: number;
}

export interface CreatePlayerInput {
  username: string;
  password: string;
  email?: string;
}

export async function createPlayer(input: CreatePlayerInput): Promise<Player> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  
  const result = await query<Player>(
    `INSERT INTO players (username, password_hash, email)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.username, passwordHash, input.email || null]
  );
  
  return result.rows[0];
}

export async function findPlayerByUsername(username: string): Promise<Player | null> {
  const result = await query<Player>(
    'SELECT * FROM players WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  
  return result.rows[0] || null;
}

export async function findPlayerById(id: number): Promise<Player | null> {
  const result = await query<Player>(
    'SELECT * FROM players WHERE id = $1',
    [id]
  );
  
  return result.rows[0] || null;
}

export async function validatePassword(player: Player, password: string): Promise<boolean> {
  return bcrypt.compare(password, player.password_hash);
}

export async function updateLastLogin(playerId: number): Promise<void> {
  await query(
    'UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
    [playerId]
  );
}

export async function playerExists(username: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM players WHERE LOWER(username) = LOWER($1)) as exists',
    [username]
  );
  
  return result.rows[0].exists;
}

export async function getBriefMode(playerId: number): Promise<boolean> {
  const result = await query<{ brief_mode: boolean }>(
    'SELECT brief_mode FROM players WHERE id = $1',
    [playerId]
  );
  return result.rows[0]?.brief_mode ?? false;
}

export async function setBriefMode(playerId: number, briefMode: boolean): Promise<void> {
  await query(
    'UPDATE players SET brief_mode = $1 WHERE id = $2',
    [briefMode, playerId]
  );
}

export async function getCurrentRoomId(playerId: number): Promise<number> {
  const result = await query<{ current_room_id: number }>(
    'SELECT current_room_id FROM players WHERE id = $1',
    [playerId]
  );
  return result.rows[0]?.current_room_id ?? 1;
}

export async function setCurrentRoomId(playerId: number, roomId: number): Promise<void> {
  await query(
    'UPDATE players SET current_room_id = $1 WHERE id = $2',
    [roomId, playerId]
  );
}

export async function updateEmail(playerId: number, email: string | null): Promise<void> {
  await query(
    'UPDATE players SET email = $1 WHERE id = $2',
    [email, playerId]
  );
}

export async function updatePassword(playerId: number, newPassword: string): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await query(
    'UPDATE players SET password_hash = $1 WHERE id = $2',
    [passwordHash, playerId]
  );
}

export async function getMaxCharacters(playerId: number, client?: pg.PoolClient): Promise<number | null> {
  const result = await query<{ max_characters: number | null }>(
    'SELECT max_characters FROM players WHERE id = $1',
    [playerId],
    client
  );
  return result.rows[0]?.max_characters ?? null;
}

export async function setMaxCharacters(playerId: number, maxCharacters: number | null): Promise<void> {
  await query(
    'UPDATE players SET max_characters = $1 WHERE id = $2',
    [maxCharacters, playerId]
  );
}

export interface PlayerSummary {
  id: number;
  username: string;
  email: string | null;
  max_characters: number | null;
  created_at: Date;
  last_login: Date | null;
}

export async function getAllPlayers(): Promise<PlayerSummary[]> {
  const result = await query<PlayerSummary>(
    'SELECT id, username, email, max_characters, created_at, last_login FROM players ORDER BY username'
  );
  return result.rows;
}
