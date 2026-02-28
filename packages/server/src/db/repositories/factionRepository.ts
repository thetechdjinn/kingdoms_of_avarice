import { query, withTransaction } from '../index.js';
import { Faction, FactionType, PlayerFactionReputation } from '@koa/shared';

// Database row types
interface DbFaction {
  id: number;
  name: string;
  description: string | null;
  faction_type: string;
  created_at: Date;
  updated_at: Date;
}

interface DbPlayerFactionReputation {
  id: number;
  character_id: number;
  faction_id: number;
  reputation: number;
  updated_at: Date;
}

function dbToFaction(row: DbFaction): Faction {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    factionType: row.faction_type as FactionType,
  };
}

// ============================================================================
// Faction CRUD
// ============================================================================

export async function getAllFactions(): Promise<Faction[]> {
  const result = await query<DbFaction>('SELECT * FROM factions ORDER BY id');
  return result.rows.map(dbToFaction);
}

export async function getFactionById(id: number): Promise<Faction | null> {
  const result = await query<DbFaction>('SELECT * FROM factions WHERE id = $1', [id]);
  return result.rows[0] ? dbToFaction(result.rows[0]) : null;
}

export async function getFactionByName(name: string): Promise<Faction | null> {
  const result = await query<DbFaction>(
    'SELECT * FROM factions WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0] ? dbToFaction(result.rows[0]) : null;
}

export interface CreateFactionInput {
  name: string;
  description?: string | null;
  factionType?: FactionType;
}

export async function createFaction(input: CreateFactionInput): Promise<Faction> {
  const result = await query<DbFaction>(
    `INSERT INTO factions (name, description, faction_type)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.name, input.description ?? null, input.factionType ?? FactionType.MERCHANT]
  );
  return dbToFaction(result.rows[0]);
}

export async function updateFaction(id: number, input: Partial<CreateFactionInput>): Promise<Faction | null> {
  const existing = await getFactionById(id);
  if (!existing) return null;

  const result = await query<DbFaction>(
    `UPDATE factions SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      faction_type = COALESCE($3, faction_type),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *`,
    [
      input.name ?? null,
      input.description !== undefined ? input.description : null,
      input.factionType ?? null,
      id,
    ]
  );
  return result.rows[0] ? dbToFaction(result.rows[0]) : null;
}

export async function deleteFaction(id: number): Promise<boolean> {
  const result = await query('DELETE FROM factions WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// NPC-Faction Associations
// ============================================================================

export async function getNpcFactions(npcId: number): Promise<Faction[]> {
  const result = await query<DbFaction>(
    `SELECT f.* FROM factions f
     JOIN npc_factions nf ON nf.faction_id = f.id
     WHERE nf.npc_id = $1
     ORDER BY f.name`,
    [npcId]
  );
  return result.rows.map(dbToFaction);
}

export async function setNpcFactions(npcId: number, factionIds: number[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM npc_factions WHERE npc_id = $1', [npcId]);
    for (const factionId of factionIds) {
      await client.query(
        'INSERT INTO npc_factions (npc_id, faction_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [npcId, factionId]
      );
    }
  });
}

// ============================================================================
// Player Reputation
// ============================================================================

export async function getPlayerReputation(characterId: number, factionId: number): Promise<number> {
  const result = await query<DbPlayerFactionReputation>(
    'SELECT * FROM player_faction_reputation WHERE character_id = $1 AND faction_id = $2',
    [characterId, factionId]
  );
  return result.rows[0]?.reputation ?? 0;
}

export async function getAllPlayerReputations(characterId: number): Promise<PlayerFactionReputation[]> {
  const result = await query<DbPlayerFactionReputation>(
    'SELECT * FROM player_faction_reputation WHERE character_id = $1',
    [characterId]
  );
  return result.rows.map(row => ({
    characterId: row.character_id,
    factionId: row.faction_id,
    reputation: row.reputation,
  }));
}

export async function setPlayerReputation(characterId: number, factionId: number, reputation: number): Promise<void> {
  await query(
    `INSERT INTO player_faction_reputation (character_id, faction_id, reputation)
     VALUES ($1, $2, $3)
     ON CONFLICT (character_id, faction_id)
     DO UPDATE SET reputation = $3, updated_at = CURRENT_TIMESTAMP`,
    [characterId, factionId, reputation]
  );
}

export async function adjustPlayerReputation(characterId: number, factionId: number, amount: number): Promise<number> {
  const result = await query<DbPlayerFactionReputation>(
    `INSERT INTO player_faction_reputation (character_id, faction_id, reputation)
     VALUES ($1, $2, $3)
     ON CONFLICT (character_id, faction_id)
     DO UPDATE SET reputation = player_faction_reputation.reputation + $3, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [characterId, factionId, amount]
  );
  return result.rows[0]?.reputation ?? 0;
}
