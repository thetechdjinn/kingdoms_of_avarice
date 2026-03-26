import pg from 'pg';
import { query } from '../index.js';
import { Character, CharacterStats, Gender, Currency } from '@koa/shared';
import { getClassById } from './progressionRepository.js';
import { getDefaultStartingRoomId } from './settingsRepository.js';

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
  bank_balance: number;
  unspent_cp: number;
  cp_spent: Record<string, number>;
  initial_training_complete: boolean;
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
    warrior: 30,
    paladin: 28,
    cleric: 25,
    ranger: 25,
    thief: 20,
    mage: 15,
  };
  return (baseHealth[characterClass.toLowerCase()] || 20) + constitution * 2;
}

function calculateInitialMana(intelligence: number, wisdom: number, characterClass: string, resourceType: string): number {
  // Classes with no resource type get 0 mana
  if (!resourceType || resourceType === 'none') {
    return 0;
  }

  const baseMana: Record<string, number> = {
    mage: 30,
    cleric: 20,
    paladin: 15,
    ranger: 10,
    thief: 5,
  };
  const normalized = characterClass.toLowerCase();
  const base = baseMana[normalized] || 10;
  // Clerics and Paladins scale with wisdom, others with intelligence
  if (normalized === 'cleric' || normalized === 'paladin') {
    return base + wisdom;
  }
  return base + intelligence;
}

export async function createCharacter(input: CreateCharacterInput, client?: pg.PoolClient): Promise<DbCharacter> {
  const maxHealth = calculateInitialHealth(input.stats.constitution, input.characterClass);
  const classDef = await getClassById(input.characterClass);
  const resourceType = classDef?.resource_type ?? 'none';
  const maxMana = calculateInitialMana(input.stats.intelligence, input.stats.wisdom, input.characterClass, resourceType);
  const startingRoomId = await getDefaultStartingRoomId() ?? 1;

  const result = await query<DbCharacter>(
    `INSERT INTO characters (
      player_id, name, last_name, race, class,
      health, max_health, mana, max_mana,
      strength, intelligence, dexterity, constitution, wisdom, charisma,
      current_room_id, gold, unspent_cp, cp_spent,
      gender, hair, eye_color
    ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7, $8, $9, $10, $11, $12, $13, $14, 100, 100, '{}', $15, $16, $17)
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
      startingRoomId,
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
  | 'last_name' | 'hair' | 'eye_color'
  | 'current_room_id'
  | 'initial_training_complete';

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

/**
 * Add currency to a character's wallet (atomically increment)
 */
export async function addCurrency(
  characterId: number,
  currencyField: keyof Currency,
  amount: number,
  client?: pg.PoolClient
): Promise<void> {
  await query(
    `UPDATE characters SET ${currencyField} = COALESCE(${currencyField}, 0) + $1 WHERE id = $2`,
    [amount, characterId],
    client
  );
}

/**
 * Get a character's bank balance (in copper).
 * Note: BIGINT is returned as string by pg; parseInt is safe up to Number.MAX_SAFE_INTEGER
 * (~9 quadrillion copper). All arithmetic stays in Postgres BIGINT space.
 */
export async function getBankBalance(characterId: number, client?: pg.PoolClient): Promise<number> {
  const result = await query<{ bank_balance: string }>(
    'SELECT COALESCE(bank_balance, 0) AS bank_balance FROM characters WHERE id = $1',
    [characterId],
    client
  );
  return result.rows[0] ? parseInt(result.rows[0].bank_balance, 10) || 0 : 0;
}

/**
 * Atomically add to a character's bank balance (negative for withdrawals).
 * Returns true if the update succeeded, false if insufficient funds for withdrawals.
 */
export async function addBankBalance(
  characterId: number,
  amount: number,
  client?: pg.PoolClient
): Promise<boolean> {
  if (amount >= 0) {
    // Deposit: always succeeds
    await query(
      'UPDATE characters SET bank_balance = COALESCE(bank_balance, 0) + $1 WHERE id = $2',
      [amount, characterId],
      client
    );
    return true;
  } else {
    // Withdrawal: only succeed if balance is sufficient
    const result = await query(
      'UPDATE characters SET bank_balance = COALESCE(bank_balance, 0) + $1 WHERE id = $2 AND COALESCE(bank_balance, 0) >= $3',
      [amount, characterId, Math.abs(amount)],
      client
    );
    return (result.rowCount ?? 0) > 0;
  }
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
