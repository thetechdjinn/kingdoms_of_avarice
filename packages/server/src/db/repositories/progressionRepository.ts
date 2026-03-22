import pg from 'pg';
import { query } from '../index.js';
import {
  ClassDefinition,
  RaceDefinition,
  LevelRequirement,
  CharacterProgression,
  ThematicTag,
} from '@koa/shared';

// ============================================================================
// IN-MEMORY CACHES (static data that rarely changes at runtime)
// ============================================================================

const classCache = new Map<string, ClassDefinition>();
const raceCache = new Map<string, RaceDefinition>();
const progressionCache = new Map<number, { data: CharacterProgression; cachedAt: number }>();
const PROGRESSION_CACHE_TTL = 60_000; // 1 minute — invalidated on level up

/** Clear all progression caches. Called by @reload and editor updates. */
export function clearProgressionCaches(): void {
  classCache.clear();
  raceCache.clear();
  progressionCache.clear();
}

/** Invalidate a single character's progression cache (e.g., on level up). */
export function invalidateProgressionCache(characterId: number): void {
  progressionCache.delete(characterId);
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface DbClassDefinition {
  id: number;
  class_id: string;
  display_name: string;
  description: string | null;
  essence_multiplier: string;
  subscribed_tags: string[];
  talent_tree_id: string | null;
  resource_type: string;
  playable: boolean;
  combat_level: number;
  magic_level: number;
  magic_school: string | null;
  stealth: boolean;
  crit_bonus: number;
  dodge_bonus: number;
  special_abilities: string[] | null;
  armor_type_restrictions: string[] | null;
  created_at: Date;
  updated_at: Date;
}

interface DbRaceDefinition {
  id: number;
  race_id: string;
  display_name: string;
  description: string | null;
  stat_modifiers: Record<string, number> | null;
  base_stats: Record<string, { min: number; max: number }> | null;
  traits: Array<string | { id: string; value: number | boolean }> | null;
  allowed_classes: string[] | null;
  playable: boolean;
  dodge_bonus: number;
  created_at: Date;
  updated_at: Date;
}

interface DbLevelRequirement {
  id: number;
  level: number;
  std_xp_required: number;
  base_essence_required: number;
  created_at: Date;
}

interface DbCharacterProgression {
  id: number;
  character_id: number;
  class_id: string;
  std_xp: number;
  essence_earned_this_level: number;
  essence_wallet: number;
  total_essence_earned: number;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// CONVERTERS
// ============================================================================

function dbToClassDefinition(row: DbClassDefinition): ClassDefinition {
  return {
    class_id: row.class_id,
    display_name: row.display_name,
    description: row.description ?? undefined,
    essence_multiplier: parseFloat(row.essence_multiplier),
    subscribed_tags: row.subscribed_tags as ThematicTag[],
    talent_tree_id: row.talent_tree_id ?? undefined,
    resource_type: row.resource_type ?? undefined,
    playable: row.playable,
    combat_level: row.combat_level ?? 1,
    magic_level: row.magic_level ?? 0,
    magic_school: row.magic_school ?? undefined,
    stealth: row.stealth ?? false,
    crit_bonus: row.crit_bonus ?? 0,
    dodge_bonus: row.dodge_bonus ?? 0,
    special_abilities: row.special_abilities ?? [],
    armor_type_restrictions: row.armor_type_restrictions ?? [],
  };
}

function dbToRaceDefinition(row: DbRaceDefinition): RaceDefinition {
  return {
    race_id: row.race_id,
    display_name: row.display_name,
    description: row.description ?? undefined,
    stat_modifiers: row.stat_modifiers ?? undefined,
    // Cast base_stats to RaceBaseStats - DB stores as JSONB which comes back as Record
    base_stats: row.base_stats as unknown as RaceDefinition['base_stats'],
    // Cast traits - can be string[] or RacialTrait[] depending on data
    traits: row.traits as unknown as RaceDefinition['traits'],
    allowed_classes: row.allowed_classes ?? undefined,
    playable: row.playable,
    dodge_bonus: row.dodge_bonus ?? 0,
  };
}

function dbToLevelRequirement(row: DbLevelRequirement): LevelRequirement {
  return {
    level: row.level,
    std_xp_required: row.std_xp_required,
    base_essence_required: row.base_essence_required,
  };
}

function dbToCharacterProgressionWithLevel(row: DbCharacterProgression & { calculated_level?: number }): CharacterProgression {
  return {
    character_id: row.character_id,
    class_id: row.class_id,
    level: row.calculated_level ?? 1,
    std_xp: row.std_xp,
    essence_earned_this_level: row.essence_earned_this_level,
    essence_wallet: row.essence_wallet,
    total_essence_earned: row.total_essence_earned,
  };
}

// ============================================================================
// CLASS DEFINITIONS
// ============================================================================

export async function getAllClasses(): Promise<ClassDefinition[]> {
  const result = await query<DbClassDefinition>(
    'SELECT * FROM class_definitions ORDER BY display_name'
  );
  return result.rows.map(dbToClassDefinition);
}

export async function getPlayableClasses(): Promise<ClassDefinition[]> {
  const result = await query<DbClassDefinition>(
    'SELECT * FROM class_definitions WHERE playable = true ORDER BY display_name'
  );
  return result.rows.map(dbToClassDefinition);
}

export async function getClassById(classId: string): Promise<ClassDefinition | null> {
  const cached = classCache.get(classId);
  if (cached) return cached;

  const result = await query<DbClassDefinition>(
    'SELECT * FROM class_definitions WHERE class_id = $1',
    [classId]
  );
  const classDef = result.rows[0] ? dbToClassDefinition(result.rows[0]) : null;
  if (classDef) classCache.set(classId, classDef);
  return classDef;
}

export async function createClass(classDef: ClassDefinition & { resource_type?: string; playable?: boolean }): Promise<ClassDefinition> {
  const result = await query<DbClassDefinition>(
    `INSERT INTO class_definitions (
      class_id, display_name, description, essence_multiplier,
      subscribed_tags, talent_tree_id, resource_type, playable,
      combat_level, magic_level, magic_school, stealth, crit_bonus, dodge_bonus, special_abilities
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      classDef.class_id,
      classDef.display_name,
      classDef.description ?? null,
      classDef.essence_multiplier,
      classDef.subscribed_tags,
      classDef.talent_tree_id ?? null,
      classDef.resource_type ?? 'none',
      classDef.playable ?? true,
      classDef.combat_level ?? 1,
      classDef.magic_level ?? 0,
      classDef.magic_school ?? null,
      classDef.stealth ?? false,
      classDef.crit_bonus ?? 0,
      classDef.dodge_bonus ?? 0,
      JSON.stringify(classDef.special_abilities ?? []),
    ]
  );
  const created = dbToClassDefinition(result.rows[0]);
  classCache.set(created.class_id, created);
  return created;
}

export async function updateClass(classId: string, updates: Partial<ClassDefinition>): Promise<ClassDefinition | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.display_name !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    values.push(updates.display_name);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.essence_multiplier !== undefined) {
    setClauses.push(`essence_multiplier = $${paramIndex++}`);
    values.push(updates.essence_multiplier);
  }
  if (updates.subscribed_tags !== undefined) {
    setClauses.push(`subscribed_tags = $${paramIndex++}`);
    values.push(updates.subscribed_tags);
  }
  if (updates.talent_tree_id !== undefined) {
    setClauses.push(`talent_tree_id = $${paramIndex++}`);
    values.push(updates.talent_tree_id);
  }
  if (updates.resource_type !== undefined) {
    setClauses.push(`resource_type = $${paramIndex++}`);
    values.push(updates.resource_type);
  }
  if (updates.playable !== undefined) {
    setClauses.push(`playable = $${paramIndex++}`);
    values.push(updates.playable);
  }
  if (updates.combat_level !== undefined) {
    setClauses.push(`combat_level = $${paramIndex++}`);
    values.push(updates.combat_level);
  }
  if (updates.magic_level !== undefined) {
    setClauses.push(`magic_level = $${paramIndex++}`);
    values.push(updates.magic_level);
  }
  if (updates.magic_school !== undefined) {
    setClauses.push(`magic_school = $${paramIndex++}`);
    values.push(updates.magic_school);
  }
  if (updates.stealth !== undefined) {
    setClauses.push(`stealth = $${paramIndex++}`);
    values.push(updates.stealth);
  }
  if (updates.crit_bonus !== undefined) {
    setClauses.push(`crit_bonus = $${paramIndex++}`);
    values.push(updates.crit_bonus);
  }
  if (updates.dodge_bonus !== undefined) {
    setClauses.push(`dodge_bonus = $${paramIndex++}`);
    values.push(updates.dodge_bonus);
  }
  if (updates.special_abilities !== undefined) {
    setClauses.push(`special_abilities = $${paramIndex++}`);
    values.push(JSON.stringify(updates.special_abilities));
  }
  if (updates.armor_type_restrictions !== undefined) {
    setClauses.push(`armor_type_restrictions = $${paramIndex++}`);
    values.push(updates.armor_type_restrictions);
  }

  if (setClauses.length === 0) return getClassById(classId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(classId);

  const result = await query<DbClassDefinition>(
    `UPDATE class_definitions SET ${setClauses.join(', ')} WHERE class_id = $${paramIndex} RETURNING *`,
    values
  );
  const updated = result.rows[0] ? dbToClassDefinition(result.rows[0]) : null;
  if (updated) classCache.set(classId, updated);
  return updated;
}

export async function deleteClass(classId: string): Promise<boolean> {
  const result = await query('DELETE FROM class_definitions WHERE class_id = $1', [classId]);
  classCache.delete(classId);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// RACE DEFINITIONS
// ============================================================================

export async function getAllRaces(): Promise<RaceDefinition[]> {
  const result = await query<DbRaceDefinition>(
    'SELECT * FROM race_definitions ORDER BY display_name'
  );
  return result.rows.map(dbToRaceDefinition);
}

export async function getPlayableRaces(): Promise<RaceDefinition[]> {
  const result = await query<DbRaceDefinition>(
    'SELECT * FROM race_definitions WHERE playable = true ORDER BY display_name'
  );
  return result.rows.map(dbToRaceDefinition);
}

export async function getRaceById(raceId: string): Promise<RaceDefinition | null> {
  const cached = raceCache.get(raceId);
  if (cached) return cached;

  const result = await query<DbRaceDefinition>(
    'SELECT * FROM race_definitions WHERE race_id = $1',
    [raceId]
  );
  const raceDef = result.rows[0] ? dbToRaceDefinition(result.rows[0]) : null;
  if (raceDef) raceCache.set(raceId, raceDef);
  return raceDef;
}

export async function createRace(raceDef: RaceDefinition): Promise<RaceDefinition> {
  const result = await query<DbRaceDefinition>(
    `INSERT INTO race_definitions (
      race_id, display_name, description, stat_modifiers, base_stats,
      traits, allowed_classes, playable, dodge_bonus
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      raceDef.race_id,
      raceDef.display_name,
      raceDef.description ?? null,
      raceDef.stat_modifiers ? JSON.stringify(raceDef.stat_modifiers) : null,
      raceDef.base_stats ? JSON.stringify(raceDef.base_stats) : null,
      raceDef.traits ? JSON.stringify(raceDef.traits) : null,
      raceDef.allowed_classes ? JSON.stringify(raceDef.allowed_classes) : null,
      raceDef.playable ?? true,
      raceDef.dodge_bonus ?? 0,
    ]
  );
  const created = dbToRaceDefinition(result.rows[0]);
  raceCache.set(created.race_id, created);
  return created;
}

export async function updateRace(raceId: string, updates: Partial<RaceDefinition>): Promise<RaceDefinition | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.display_name !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    values.push(updates.display_name);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.stat_modifiers !== undefined) {
    setClauses.push(`stat_modifiers = $${paramIndex++}`);
    values.push(updates.stat_modifiers ? JSON.stringify(updates.stat_modifiers) : null);
  }
  if (updates.base_stats !== undefined) {
    setClauses.push(`base_stats = $${paramIndex++}`);
    values.push(updates.base_stats ? JSON.stringify(updates.base_stats) : null);
  }
  if (updates.traits !== undefined) {
    setClauses.push(`traits = $${paramIndex++}`);
    values.push(updates.traits ? JSON.stringify(updates.traits) : null);
  }
  if (updates.allowed_classes !== undefined) {
    setClauses.push(`allowed_classes = $${paramIndex++}`);
    values.push(updates.allowed_classes ? JSON.stringify(updates.allowed_classes) : null);
  }
  if (updates.playable !== undefined) {
    setClauses.push(`playable = $${paramIndex++}`);
    values.push(updates.playable);
  }
  if (updates.dodge_bonus !== undefined) {
    setClauses.push(`dodge_bonus = $${paramIndex++}`);
    values.push(updates.dodge_bonus);
  }

  if (setClauses.length === 0) return getRaceById(raceId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(raceId);

  const result = await query<DbRaceDefinition>(
    `UPDATE race_definitions SET ${setClauses.join(', ')} WHERE race_id = $${paramIndex} RETURNING *`,
    values
  );
  const updated = result.rows[0] ? dbToRaceDefinition(result.rows[0]) : null;
  if (updated) raceCache.set(raceId, updated);
  return updated;
}

export async function deleteRace(raceId: string): Promise<boolean> {
  const result = await query('DELETE FROM race_definitions WHERE race_id = $1', [raceId]);
  raceCache.delete(raceId);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// PROGRESSION TABLE
// ============================================================================

export async function getProgressionTable(): Promise<LevelRequirement[]> {
  const result = await query<DbLevelRequirement>(
    'SELECT * FROM progression_table ORDER BY level'
  );
  return result.rows.map(dbToLevelRequirement);
}

export async function getLevelRequirement(level: number): Promise<LevelRequirement | null> {
  const result = await query<DbLevelRequirement>(
    'SELECT * FROM progression_table WHERE level = $1',
    [level]
  );
  return result.rows[0] ? dbToLevelRequirement(result.rows[0]) : null;
}

export async function setLevelRequirement(req: LevelRequirement): Promise<LevelRequirement> {
  const result = await query<DbLevelRequirement>(
    `INSERT INTO progression_table (level, std_xp_required, base_essence_required)
     VALUES ($1, $2, $3)
     ON CONFLICT (level) DO UPDATE SET
       std_xp_required = EXCLUDED.std_xp_required,
       base_essence_required = EXCLUDED.base_essence_required
     RETURNING *`,
    [req.level, req.std_xp_required, req.base_essence_required]
  );
  return dbToLevelRequirement(result.rows[0]);
}

export async function deleteLevelRequirement(level: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM progression_table WHERE level = $1',
    [level]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// CHARACTER PROGRESSION
// ============================================================================

export async function getCharacterProgression(characterId: number): Promise<CharacterProgression | null> {
  const now = Date.now();
  const cached = progressionCache.get(characterId);
  if (cached && (now - cached.cachedAt) < PROGRESSION_CACHE_TTL) {
    return cached.data;
  }

  const result = await query<DbCharacterProgression & { calculated_level: number }>(
    `SELECT cp.*,
      COALESCE(
        (SELECT MAX(level) FROM progression_table WHERE std_xp_required <= cp.std_xp),
        1
      ) as calculated_level
     FROM character_progression cp
     WHERE cp.character_id = $1`,
    [characterId]
  );
  const progression = result.rows[0] ? dbToCharacterProgressionWithLevel(result.rows[0]) : null;
  if (progression) {
    progressionCache.set(characterId, { data: progression, cachedAt: now });
  }
  return progression;
}

export async function createCharacterProgression(
  characterId: number,
  classId: string,
  client?: pg.PoolClient
): Promise<CharacterProgression> {
  const result = await query<DbCharacterProgression & { calculated_level: number }>(
    `WITH inserted AS (
      INSERT INTO character_progression (character_id, class_id)
      VALUES ($1, $2)
      RETURNING *
    )
    SELECT inserted.*,
      COALESCE(
        (SELECT MAX(level) FROM progression_table WHERE std_xp_required <= inserted.std_xp),
        1
      ) as calculated_level
    FROM inserted`,
    [characterId, classId],
    client
  );
  return dbToCharacterProgressionWithLevel(result.rows[0]);
}

export async function updateCharacterProgression(
  characterId: number,
  updates: Partial<Omit<CharacterProgression, 'character_id' | 'level'>>
): Promise<CharacterProgression | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.class_id !== undefined) {
    setClauses.push(`class_id = $${paramIndex++}`);
    values.push(updates.class_id);
  }
  if (updates.std_xp !== undefined) {
    setClauses.push(`std_xp = $${paramIndex++}`);
    values.push(updates.std_xp);
  }
  if (updates.essence_earned_this_level !== undefined) {
    setClauses.push(`essence_earned_this_level = $${paramIndex++}`);
    values.push(updates.essence_earned_this_level);
  }
  if (updates.essence_wallet !== undefined) {
    setClauses.push(`essence_wallet = $${paramIndex++}`);
    values.push(updates.essence_wallet);
  }
  if (updates.total_essence_earned !== undefined) {
    setClauses.push(`total_essence_earned = $${paramIndex++}`);
    values.push(updates.total_essence_earned);
  }

  if (setClauses.length === 0) return getCharacterProgression(characterId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(characterId);

  const result = await query<DbCharacterProgression & { calculated_level: number }>(
    `WITH updated AS (
      UPDATE character_progression SET ${setClauses.join(', ')} WHERE character_id = $${paramIndex} RETURNING *
    )
    SELECT updated.*,
      COALESCE(
        (SELECT MAX(level) FROM progression_table WHERE std_xp_required <= updated.std_xp),
        1
      ) as calculated_level
    FROM updated`,
    values
  );
  const progression = result.rows[0] ? dbToCharacterProgressionWithLevel(result.rows[0]) : null;
  // Update cache with fresh data from the write (prevents stale reads)
  if (progression) {
    progressionCache.set(characterId, { data: progression, cachedAt: Date.now() });
  } else {
    progressionCache.delete(characterId);
  }
  return progression;
}

/**
 * Atomically increment essence_wallet and total_essence_earned in the DB.
 * Returns the updated progression, or null if no row matched.
 */
export async function incrementEssenceWallet(
  characterId: number,
  amount: number
): Promise<CharacterProgression | null> {
  const result = await query<DbCharacterProgression & { calculated_level: number }>(
    `WITH updated AS (
      UPDATE character_progression
      SET essence_wallet = essence_wallet + $1,
          total_essence_earned = total_essence_earned + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE character_id = $2
      RETURNING *
    )
    SELECT updated.*,
      COALESCE(
        (SELECT MAX(level) FROM progression_table WHERE std_xp_required <= updated.std_xp),
        1
      ) as calculated_level
    FROM updated`,
    [amount, characterId]
  );
  return result.rows[0] ? dbToCharacterProgressionWithLevel(result.rows[0]) : null;
}

/**
 * Atomically increment std_xp in the DB.
 * Used by awardXp() in progression.ts for combat XP awards.
 */
export async function incrementStdXp(
  characterId: number,
  amount: number
): Promise<CharacterProgression | null> {
  const result = await query<DbCharacterProgression & { calculated_level: number }>(
    `WITH updated AS (
      UPDATE character_progression
      SET std_xp = std_xp + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE character_id = $2
      RETURNING *
    )
    SELECT updated.*,
      COALESCE(
        (SELECT MAX(level) FROM progression_table WHERE std_xp_required <= updated.std_xp),
        1
      ) as calculated_level
    FROM updated`,
    [amount, characterId]
  );
  const progression = result.rows[0] ? dbToCharacterProgressionWithLevel(result.rows[0]) : null;
  if (progression) {
    progressionCache.set(characterId, { data: progression, cachedAt: Date.now() });
  }
  return progression;
}
