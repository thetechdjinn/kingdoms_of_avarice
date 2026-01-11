import { query } from '../index.js';
import { Character, CharacterStats } from '@koa/shared';

export interface DbCharacter {
  id: number;
  player_id: number;
  name: string;
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
  current_room_id: number;
  gold: number;
  created_at: Date;
}

export interface CreateCharacterInput {
  playerId: number;
  name: string;
  race: string;
  characterClass: string;
  stats: CharacterStats;
}

function calculateInitialHealth(constitution: number, characterClass: string): number {
  const baseHealth: Record<string, number> = {
    Warrior: 30,
    Cleric: 25,
    Ranger: 25,
    Rogue: 20,
    Mage: 15,
  };
  return (baseHealth[characterClass] || 20) + constitution * 2;
}

function calculateInitialMana(intelligence: number, characterClass: string): number {
  const baseMana: Record<string, number> = {
    Mage: 30,
    Cleric: 20,
    Ranger: 10,
    Warrior: 0,
    Rogue: 5,
  };
  return (baseMana[characterClass] || 0) + intelligence;
}

export async function createCharacter(input: CreateCharacterInput): Promise<DbCharacter> {
  const maxHealth = calculateInitialHealth(input.stats.constitution, input.characterClass);
  const maxMana = calculateInitialMana(input.stats.intelligence, input.characterClass);
  
  const result = await query<DbCharacter>(
    `INSERT INTO characters (
      player_id, name, race, class, 
      health, max_health, mana, max_mana,
      strength, intelligence, dexterity, constitution,
      current_room_id, gold
    ) VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $7, $8, $9, $10, 1, 100)
    RETURNING *`,
    [
      input.playerId,
      input.name,
      input.race,
      input.characterClass,
      maxHealth,
      maxMana,
      input.stats.strength,
      input.stats.intelligence,
      input.stats.dexterity,
      input.stats.constitution,
    ]
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

export async function characterNameExists(name: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM characters WHERE LOWER(name) = LOWER($1)) as exists',
    [name]
  );
  
  return result.rows[0].exists;
}

export async function updateCharacterRoom(characterId: number, roomId: number): Promise<void> {
  await query(
    'UPDATE characters SET current_room_id = $1 WHERE id = $2',
    [roomId, characterId]
  );
}

export async function updateCharacterStats(
  characterId: number,
  updates: Partial<Pick<DbCharacter, 'health' | 'mana' | 'experience' | 'level' | 'gold'>>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
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

export function toSharedCharacter(dbChar: DbCharacter): Character {
  return {
    id: dbChar.id,
    name: dbChar.name,
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
    },
    gold: dbChar.gold,
  };
}
