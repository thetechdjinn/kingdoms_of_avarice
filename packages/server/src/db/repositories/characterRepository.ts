import pg from 'pg';
import { query } from '../index.js';
import { Character, CharacterStats, Gender, Currency } from '@koa/shared';

export interface DbCharacter {
  id: number;
  player_id: number;
  name: string;
  last_name: string | null;
  race: string;
  class: string;
  level: number;
  experience: number;
  health: number;
  max_health: number;
  mana: number;
  max_mana: number;
  strength: number;
  intelligence: number;
  dexterity: number;
  constitution: number;
  wisdom: number;
  charisma: number;
  current_room_id: number;
  gold: number;
  // Currency fields (nullable for characters created before migration)
  copper: number | null;
  silver: number | null;
  platinum: number | null;
  runic: number | null;
  unspent_cp: number;
  cp_spent: Record<string, number>;
  // Appearance fields
  gender: string | null;
  hair: string | null;
  eye_color: string | null;
  created_at: Date;
}

export interface CreateCharacterInput {
  playerId: number;
  name: string;
  lastName?: string;
  race: string;
  characterClass: string;
  stats: CharacterStats;
  // Appearance fields
  gender?: string;
  hair?: string;
  eyeColor?: string;
}

function calculateInitialHealth(constitution: number, characterClass: string): number {
  const baseHealth: Record<string, number> = {
    Warrior: 30,
    Paladin: 28,
    Cleric: 25,
    Ranger: 25,
    Rogue: 20,
    Mage: 15,
  };
  return (baseHealth[characterClass] || 20) + constitution * 2;
}

function calculateInitialMana(intelligence: number, wisdom: number, characterClass: string): number {
  const baseMana: Record<string, number> = {
    Mage: 30,
    Cleric: 20,
    Paladin: 15,
    Ranger: 10,
    Warrior: 0,
    Rogue: 5,
  };
  const base = baseMana[characterClass] || 0;
  // Clerics and Paladins scale with wisdom, others with intelligence
  if (characterClass === 'Cleric' || characterClass === 'Paladin') {
    return base + wisdom;
  }
  return base + intelligence;
}

export async function createCharacter(input: CreateCharacterInput, client?: pg.PoolClient): Promise<DbCharacter> {
  const maxHealth = calculateInitialHealth(input.stats.constitution, input.characterClass);
  const maxMana = calculateInitialMana(input.stats.intelligence, input.stats.wisdom, input.characterClass);

  const result = await query<DbCharacter>(
    `INSERT INTO characters (
      player_id, name, last_name, race, class,
      health, max_health, mana, max_mana,
      strength, intelligence, dexterity, constitution, wisdom, charisma,
      current_room_id, gold, unspent_cp, cp_spent,
      gender, hair, eye_color
    ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7, $8, $9, $10, $11, $12, $13, 1, 100, 100, '{}', $14, $15, $16)
    RETURNING *`,
    [
      input.playerId,
      input.name,
      input.lastName || null,
      input.race,
      input.characterClass,
      maxHealth,
      maxMana,
      input.stats.strength,
      input.stats.intelligence,
      input.stats.dexterity,
      input.stats.constitution,
      input.stats.wisdom,
      input.stats.charisma,
      input.gender || 'male',
      input.hair || null,
      input.eyeColor || null,
    ],
    client
  );

  return result.rows[0];
}

export async function findCharactersByPlayerId(playerId: number): Promise<DbCharacter[]> {
  const result = await query<DbCharacter>(
    'SELECT * FROM characters WHERE player_id = $1 ORDER BY created_at DESC',
    [playerId]
  );
  
  return result.rows;
}

export async function findCharacterById(id: number): Promise<DbCharacter | null> {
  const result = await query<DbCharacter>(
    'SELECT * FROM characters WHERE id = $1',
    [id]
  );
  
  return result.rows[0] || null;
}

export async function findCharacterByName(name: string): Promise<DbCharacter | null> {
  const result = await query<DbCharacter>(
    'SELECT * FROM characters WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  
  return result.rows[0] || null;
}

export async function characterNameExists(name: string, client?: pg.PoolClient): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM characters WHERE LOWER(name) = LOWER($1)) as exists',
    [name],
    client
  );

  return result.rows[0].exists;
}

export async function updateCharacterRoom(characterId: number, roomId: number): Promise<void> {
  await query(
    'UPDATE characters SET current_room_id = $1 WHERE id = $2',
    [roomId, characterId]
  );
}

// Fields that can be updated via updateCharacterStats
type UpdatableCharacterFields =
  | 'health' | 'mana' | 'experience' | 'level' | 'gold'
  | 'copper' | 'silver' | 'platinum' | 'runic'
  | 'strength' | 'intelligence' | 'dexterity' | 'constitution' | 'wisdom' | 'charisma'
  | 'unspent_cp' | 'cp_spent' | 'max_health' | 'max_mana'
  | 'last_name' | 'hair' | 'eye_color';

export async function updateCharacterStats(
  characterId: number,
  updates: Partial<Record<UpdatableCharacterFields, unknown>>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      // Handle JSONB fields specially
      if (key === 'cp_spent') {
        setClauses.push(`${key} = $${paramIndex}::jsonb`);
        values.push(JSON.stringify(value));
      } else {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return;

  values.push(characterId);
  await query(
    `UPDATE characters SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function deleteCharacter(characterId: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM characters WHERE id = $1',
    [characterId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getCharacterCount(playerId: number, client?: pg.PoolClient): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) FROM characters WHERE player_id = $1',
    [playerId],
    client
  );
  return parseInt(result.rows[0].count, 10);
}

export function toSharedCharacter(dbChar: DbCharacter): Character {
  return {
    id: dbChar.id,
    name: dbChar.name,
    lastName: dbChar.last_name || undefined,
    race: dbChar.race,
    class: dbChar.class,
    level: dbChar.level,
    experience: dbChar.experience,
    health: dbChar.health,
    maxHealth: dbChar.max_health,
    mana: dbChar.mana,
    maxMana: dbChar.max_mana,
    stats: {
      strength: dbChar.strength,
      intelligence: dbChar.intelligence,
      dexterity: dbChar.dexterity,
      constitution: dbChar.constitution,
      wisdom: dbChar.wisdom,
      charisma: dbChar.charisma,
    },
    currency: {
      copper: dbChar.copper ?? 0,
      silver: dbChar.silver ?? 0,
      gold: dbChar.gold ?? 0,
      platinum: dbChar.platinum ?? 0,
      runic: dbChar.runic ?? 0,
    },
    gender: (dbChar.gender as Gender) || 'male',
    hair: dbChar.hair || undefined,
    eyeColor: dbChar.eye_color || undefined,
  };
}

/**
 * Convert DB character to shared Character with display names for class/race
 */
export async function toSharedCharacterWithDisplayNames(dbChar: DbCharacter): Promise<Character> {
  const { getClassById, getRaceById } = await import('./progressionRepository.js');

  const classDef = await getClassById(dbChar.class);
  const raceDef = await getRaceById(dbChar.race);

  return {
    id: dbChar.id,
    name: dbChar.name,
    lastName: dbChar.last_name || undefined,
    race: raceDef?.display_name || dbChar.race,
    class: classDef?.display_name || dbChar.class,
    level: dbChar.level,
    experience: dbChar.experience,
    health: dbChar.health,
    maxHealth: dbChar.max_health,
    mana: dbChar.mana,
    maxMana: dbChar.max_mana,
    stats: {
      strength: dbChar.strength,
      intelligence: dbChar.intelligence,
      dexterity: dbChar.dexterity,
      constitution: dbChar.constitution,
      wisdom: dbChar.wisdom,
      charisma: dbChar.charisma,
    },
    currency: {
      copper: dbChar.copper ?? 0,
      silver: dbChar.silver ?? 0,
      gold: dbChar.gold ?? 0,
      platinum: dbChar.platinum ?? 0,
      runic: dbChar.runic ?? 0,
    },
    gender: (dbChar.gender as Gender) || 'male',
    hair: dbChar.hair || undefined,
    eyeColor: dbChar.eye_color || undefined,
  };
}

// ============================================================================
// Admin Functions
// ============================================================================

export interface UpdateCharacterAdminInput {
  name?: string;
  race?: string;
  class?: string;
  level?: number;
  experience?: number;
  health?: number;
  max_health?: number;
  mana?: number;
  max_mana?: number;
  strength?: number;
  intelligence?: number;
  dexterity?: number;
  constitution?: number;
  wisdom?: number;
  charisma?: number;
  current_room_id?: number;
  gold?: number;
  // Currency fields
  copper?: number;
  silver?: number;
  platinum?: number;
  runic?: number;
  // Character Points (CP) system
  unspent_cp?: number;
  cp_spent?: Record<string, number>;
}

/**
 * Update character fields (admin only)
 * Allows updating any field including name, race, class
 */
export async function updateCharacterAdmin(
  characterId: number,
  updates: UpdateCharacterAdminInput
): Promise<DbCharacter | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<keyof UpdateCharacterAdminInput, string> = {
    name: 'name',
    race: 'race',
    class: 'class',
    level: 'level',
    experience: 'experience',
    health: 'health',
    max_health: 'max_health',
    mana: 'mana',
    max_mana: 'max_mana',
    strength: 'strength',
    intelligence: 'intelligence',
    dexterity: 'dexterity',
    constitution: 'constitution',
    wisdom: 'wisdom',
    charisma: 'charisma',
    current_room_id: 'current_room_id',
    gold: 'gold',
    copper: 'copper',
    silver: 'silver',
    platinum: 'platinum',
    runic: 'runic',
    unspent_cp: 'unspent_cp',
    cp_spent: 'cp_spent',
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    const value = updates[key as keyof UpdateCharacterAdminInput];
    if (value !== undefined) {
      setClauses.push(`${dbField} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    // No updates requested, return the current character
    const result = await query<DbCharacter>('SELECT * FROM characters WHERE id = $1', [characterId]);
    return result.rows[0] || null;
  }

  values.push(characterId);
  const result = await query<DbCharacter>(
    `UPDATE characters SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0] || null;
}
