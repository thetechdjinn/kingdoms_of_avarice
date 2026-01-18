import pg from 'pg';
import { query } from '../index.js';
import {
  ClassDefinition,
  RaceDefinition,
  AbilityDefinition,
  TalentDefinition,
  GameEvent,
  LevelRequirement,
  ClassAbilityMapping,
  CharacterProgression,
  ThematicTag,
  AbilityType,
} from '@koa/shared';

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
  thievery: boolean;
  special_abilities: string[] | null;
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
  created_at: Date;
  updated_at: Date;
}

interface DbAbilityDefinition {
  id: number;
  ability_id: string;
  display_name: string;
  description: string | null;
  ability_type: string;
  emitted_tags: string[];
  resource_cost: number;
  resource_type: string | null;
  cooldown: number;
  effect_data: Record<string, unknown> | null;
  requirements: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface DbTalentDefinition {
  id: number;
  talent_id: string;
  display_name: string;
  description: string | null;
  class_restriction: string | null;
  essence_cost: number;
  prerequisite_level: number;
  prerequisite_talents: string[];
  effect_modifiers: Record<string, number> | null;
  grants_ability: string | null;
  tree_tier: number;
  tree_position: number;
  created_at: Date;
  updated_at: Date;
}

interface DbGameEvent {
  id: number;
  event_id: string;
  display_name: string | null;
  description: string | null;
  emitted_tags: string[];
  base_essence_value: number;
  base_xp_value: number;
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

interface DbClassAbility {
  id: number;
  class_id: string;
  ability_id: string;
  required_level: number;
  auto_learn: boolean;
  training_cost: number;
}

interface DbCharacterProgression {
  id: number;
  character_id: number;
  class_id: string;
  std_xp: number;
  essence_earned_this_level: number;
  essence_wallet: number;
  total_essence_earned: number;
  unlocked_talents: string[];
  learned_abilities: string[];
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
    thievery: row.thievery ?? false,
    special_abilities: row.special_abilities ?? [],
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
  };
}

function dbToAbilityDefinition(row: DbAbilityDefinition): AbilityDefinition {
  return {
    ability_id: row.ability_id,
    display_name: row.display_name,
    description: row.description ?? undefined,
    ability_type: row.ability_type as AbilityType,
    emitted_tags: row.emitted_tags as ThematicTag[],
    resource_cost: row.resource_cost,
    resource_type: row.resource_type ?? undefined,
    cooldown: row.cooldown,
    effect_data: row.effect_data ?? undefined,
    requirements: row.requirements as AbilityDefinition['requirements'] ?? undefined,
  };
}

function dbToTalentDefinition(row: DbTalentDefinition): TalentDefinition {
  return {
    talent_id: row.talent_id,
    display_name: row.display_name,
    description: row.description ?? undefined,
    class_restriction: row.class_restriction ?? undefined,
    essence_cost: row.essence_cost,
    prerequisite_level: row.prerequisite_level,
    prerequisite_talents: row.prerequisite_talents,
    effect_modifiers: row.effect_modifiers ?? undefined,
    grants_ability: row.grants_ability ?? undefined,
  };
}

function dbToGameEvent(row: DbGameEvent): GameEvent {
  return {
    event_id: row.event_id,
    display_name: row.display_name ?? undefined,
    emitted_tags: row.emitted_tags as ThematicTag[],
    base_essence_value: row.base_essence_value,
    base_xp_value: row.base_xp_value,
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
    unlocked_talents: row.unlocked_talents,
    learned_abilities: row.learned_abilities,
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
  const result = await query<DbClassDefinition>(
    'SELECT * FROM class_definitions WHERE class_id = $1',
    [classId]
  );
  return result.rows[0] ? dbToClassDefinition(result.rows[0]) : null;
}

export async function createClass(classDef: ClassDefinition & { resource_type?: string; playable?: boolean }): Promise<ClassDefinition> {
  const result = await query<DbClassDefinition>(
    `INSERT INTO class_definitions (
      class_id, display_name, description, essence_multiplier,
      subscribed_tags, talent_tree_id, resource_type, playable,
      combat_level, magic_level, magic_school, stealth, thievery, special_abilities
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      classDef.thievery ?? false,
      classDef.special_abilities ?? [],
    ]
  );
  return dbToClassDefinition(result.rows[0]);
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
  if (updates.thievery !== undefined) {
    setClauses.push(`thievery = $${paramIndex++}`);
    values.push(updates.thievery);
  }
  if (updates.special_abilities !== undefined) {
    setClauses.push(`special_abilities = $${paramIndex++}`);
    values.push(updates.special_abilities);
  }

  if (setClauses.length === 0) return getClassById(classId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(classId);

  const result = await query<DbClassDefinition>(
    `UPDATE class_definitions SET ${setClauses.join(', ')} WHERE class_id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] ? dbToClassDefinition(result.rows[0]) : null;
}

export async function deleteClass(classId: string): Promise<boolean> {
  const result = await query('DELETE FROM class_definitions WHERE class_id = $1', [classId]);
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
  const result = await query<DbRaceDefinition>(
    'SELECT * FROM race_definitions WHERE race_id = $1',
    [raceId]
  );
  return result.rows[0] ? dbToRaceDefinition(result.rows[0]) : null;
}

export async function createRace(raceDef: RaceDefinition): Promise<RaceDefinition> {
  const result = await query<DbRaceDefinition>(
    `INSERT INTO race_definitions (
      race_id, display_name, description, stat_modifiers, base_stats,
      traits, allowed_classes, playable
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    ]
  );
  return dbToRaceDefinition(result.rows[0]);
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

  if (setClauses.length === 0) return getRaceById(raceId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(raceId);

  const result = await query<DbRaceDefinition>(
    `UPDATE race_definitions SET ${setClauses.join(', ')} WHERE race_id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] ? dbToRaceDefinition(result.rows[0]) : null;
}

export async function deleteRace(raceId: string): Promise<boolean> {
  const result = await query('DELETE FROM race_definitions WHERE race_id = $1', [raceId]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// ABILITY DEFINITIONS
// ============================================================================

export async function getAllAbilities(): Promise<AbilityDefinition[]> {
  const result = await query<DbAbilityDefinition>(
    'SELECT * FROM ability_definitions ORDER BY display_name'
  );
  return result.rows.map(dbToAbilityDefinition);
}

export async function getAbilitiesByType(abilityType: AbilityType): Promise<AbilityDefinition[]> {
  const result = await query<DbAbilityDefinition>(
    'SELECT * FROM ability_definitions WHERE ability_type = $1 ORDER BY display_name',
    [abilityType]
  );
  return result.rows.map(dbToAbilityDefinition);
}

export async function getAbilityById(abilityId: string): Promise<AbilityDefinition | null> {
  const result = await query<DbAbilityDefinition>(
    'SELECT * FROM ability_definitions WHERE ability_id = $1',
    [abilityId]
  );
  return result.rows[0] ? dbToAbilityDefinition(result.rows[0]) : null;
}

export async function createAbility(abilityDef: AbilityDefinition): Promise<AbilityDefinition> {
  const result = await query<DbAbilityDefinition>(
    `INSERT INTO ability_definitions (
      ability_id, display_name, description, ability_type,
      emitted_tags, resource_cost, resource_type, cooldown,
      effect_data, requirements
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      abilityDef.ability_id,
      abilityDef.display_name,
      abilityDef.description ?? null,
      abilityDef.ability_type,
      abilityDef.emitted_tags ?? [],
      abilityDef.resource_cost ?? 0,
      abilityDef.resource_type ?? null,
      abilityDef.cooldown ?? 0,
      abilityDef.effect_data ? JSON.stringify(abilityDef.effect_data) : null,
      abilityDef.requirements ? JSON.stringify(abilityDef.requirements) : null,
    ]
  );
  return dbToAbilityDefinition(result.rows[0]);
}

export async function updateAbility(abilityId: string, updates: Partial<AbilityDefinition>): Promise<AbilityDefinition | null> {
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
  if (updates.ability_type !== undefined) {
    setClauses.push(`ability_type = $${paramIndex++}`);
    values.push(updates.ability_type);
  }
  if (updates.emitted_tags !== undefined) {
    setClauses.push(`emitted_tags = $${paramIndex++}`);
    values.push(updates.emitted_tags);
  }
  if (updates.resource_cost !== undefined) {
    setClauses.push(`resource_cost = $${paramIndex++}`);
    values.push(updates.resource_cost);
  }
  if (updates.resource_type !== undefined) {
    setClauses.push(`resource_type = $${paramIndex++}`);
    values.push(updates.resource_type);
  }
  if (updates.cooldown !== undefined) {
    setClauses.push(`cooldown = $${paramIndex++}`);
    values.push(updates.cooldown);
  }
  if (updates.effect_data !== undefined) {
    setClauses.push(`effect_data = $${paramIndex++}`);
    values.push(updates.effect_data ? JSON.stringify(updates.effect_data) : null);
  }
  if (updates.requirements !== undefined) {
    setClauses.push(`requirements = $${paramIndex++}`);
    values.push(updates.requirements ? JSON.stringify(updates.requirements) : null);
  }

  if (setClauses.length === 0) return getAbilityById(abilityId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(abilityId);

  const result = await query<DbAbilityDefinition>(
    `UPDATE ability_definitions SET ${setClauses.join(', ')} WHERE ability_id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] ? dbToAbilityDefinition(result.rows[0]) : null;
}

export async function deleteAbility(abilityId: string): Promise<boolean> {
  const result = await query('DELETE FROM ability_definitions WHERE ability_id = $1', [abilityId]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// TALENT DEFINITIONS
// ============================================================================

export async function getAllTalents(): Promise<TalentDefinition[]> {
  const result = await query<DbTalentDefinition>(
    'SELECT * FROM talent_definitions ORDER BY tree_tier, tree_position'
  );
  return result.rows.map(dbToTalentDefinition);
}

export async function getTalentsByClass(classId: string): Promise<TalentDefinition[]> {
  const result = await query<DbTalentDefinition>(
    'SELECT * FROM talent_definitions WHERE class_restriction = $1 OR class_restriction IS NULL ORDER BY tree_tier, tree_position',
    [classId]
  );
  return result.rows.map(dbToTalentDefinition);
}

export async function getTalentById(talentId: string): Promise<TalentDefinition | null> {
  const result = await query<DbTalentDefinition>(
    'SELECT * FROM talent_definitions WHERE talent_id = $1',
    [talentId]
  );
  return result.rows[0] ? dbToTalentDefinition(result.rows[0]) : null;
}

export async function createTalent(talentDef: TalentDefinition & { tree_tier?: number; tree_position?: number }): Promise<TalentDefinition> {
  const result = await query<DbTalentDefinition>(
    `INSERT INTO talent_definitions (
      talent_id, display_name, description, class_restriction,
      essence_cost, prerequisite_level, prerequisite_talents,
      effect_modifiers, grants_ability, tree_tier, tree_position
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      talentDef.talent_id,
      talentDef.display_name,
      talentDef.description ?? null,
      talentDef.class_restriction ?? null,
      talentDef.essence_cost,
      talentDef.prerequisite_level ?? 1,
      talentDef.prerequisite_talents ?? [],
      talentDef.effect_modifiers ?? null,
      talentDef.grants_ability ?? null,
      talentDef.tree_tier ?? 1,
      talentDef.tree_position ?? 0,
    ]
  );
  return dbToTalentDefinition(result.rows[0]);
}

export async function updateTalent(talentId: string, updates: Partial<TalentDefinition>): Promise<TalentDefinition | null> {
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
  if (updates.class_restriction !== undefined) {
    setClauses.push(`class_restriction = $${paramIndex++}`);
    values.push(updates.class_restriction);
  }
  if (updates.essence_cost !== undefined) {
    setClauses.push(`essence_cost = $${paramIndex++}`);
    values.push(updates.essence_cost);
  }
  if (updates.prerequisite_level !== undefined) {
    setClauses.push(`prerequisite_level = $${paramIndex++}`);
    values.push(updates.prerequisite_level);
  }
  if (updates.prerequisite_talents !== undefined) {
    setClauses.push(`prerequisite_talents = $${paramIndex++}`);
    values.push(updates.prerequisite_talents ? JSON.stringify(updates.prerequisite_talents) : null);
  }
  if (updates.effect_modifiers !== undefined) {
    setClauses.push(`effect_modifiers = $${paramIndex++}`);
    values.push(updates.effect_modifiers ? JSON.stringify(updates.effect_modifiers) : null);
  }
  if (updates.grants_ability !== undefined) {
    setClauses.push(`grants_ability = $${paramIndex++}`);
    values.push(updates.grants_ability);
  }

  if (setClauses.length === 0) return getTalentById(talentId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(talentId);

  const result = await query<DbTalentDefinition>(
    `UPDATE talent_definitions SET ${setClauses.join(', ')} WHERE talent_id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] ? dbToTalentDefinition(result.rows[0]) : null;
}

export async function deleteTalent(talentId: string): Promise<boolean> {
  const result = await query('DELETE FROM talent_definitions WHERE talent_id = $1', [talentId]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// GAME EVENTS
// ============================================================================

export async function getAllGameEvents(): Promise<GameEvent[]> {
  const result = await query<DbGameEvent>(
    'SELECT * FROM game_events ORDER BY event_id'
  );
  return result.rows.map(dbToGameEvent);
}

export async function getGameEventById(eventId: string): Promise<GameEvent | null> {
  const result = await query<DbGameEvent>(
    'SELECT * FROM game_events WHERE event_id = $1',
    [eventId]
  );
  return result.rows[0] ? dbToGameEvent(result.rows[0]) : null;
}

export async function createGameEvent(event: GameEvent): Promise<GameEvent> {
  const result = await query<DbGameEvent>(
    `INSERT INTO game_events (
      event_id, display_name, emitted_tags, base_essence_value, base_xp_value
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [
      event.event_id,
      event.display_name ?? null,
      event.emitted_tags,
      event.base_essence_value,
      event.base_xp_value ?? 0,
    ]
  );
  return dbToGameEvent(result.rows[0]);
}

export async function updateGameEvent(eventId: string, updates: Partial<GameEvent>): Promise<GameEvent | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.display_name !== undefined) {
    setClauses.push(`display_name = $${paramIndex++}`);
    values.push(updates.display_name);
  }
  if (updates.emitted_tags !== undefined) {
    setClauses.push(`emitted_tags = $${paramIndex++}`);
    values.push(updates.emitted_tags);
  }
  if (updates.base_essence_value !== undefined) {
    setClauses.push(`base_essence_value = $${paramIndex++}`);
    values.push(updates.base_essence_value);
  }
  if (updates.base_xp_value !== undefined) {
    setClauses.push(`base_xp_value = $${paramIndex++}`);
    values.push(updates.base_xp_value);
  }

  if (setClauses.length === 0) return getGameEventById(eventId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(eventId);

  const result = await query<DbGameEvent>(
    `UPDATE game_events SET ${setClauses.join(', ')} WHERE event_id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] ? dbToGameEvent(result.rows[0]) : null;
}

export async function deleteGameEvent(eventId: string): Promise<boolean> {
  const result = await query('DELETE FROM game_events WHERE event_id = $1', [eventId]);
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

// ============================================================================
// CLASS ABILITIES
// ============================================================================

export async function getClassAbilities(classId: string): Promise<ClassAbilityMapping[]> {
  const result = await query<DbClassAbility>(
    'SELECT * FROM class_abilities WHERE class_id = $1 ORDER BY required_level',
    [classId]
  );
  return result.rows.map((row) => ({
    class_id: row.class_id,
    ability_id: row.ability_id,
    required_level: row.required_level,
    auto_learn: row.auto_learn,
    training_cost: row.training_cost,
  }));
}

export async function addClassAbility(mapping: ClassAbilityMapping): Promise<ClassAbilityMapping> {
  const result = await query<DbClassAbility>(
    `INSERT INTO class_abilities (class_id, ability_id, required_level, auto_learn, training_cost)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (class_id, ability_id) DO UPDATE SET
       required_level = EXCLUDED.required_level,
       auto_learn = EXCLUDED.auto_learn,
       training_cost = EXCLUDED.training_cost
     RETURNING *`,
    [
      mapping.class_id,
      mapping.ability_id,
      mapping.required_level,
      mapping.auto_learn,
      mapping.training_cost ?? 0,
    ]
  );
  return {
    class_id: result.rows[0].class_id,
    ability_id: result.rows[0].ability_id,
    required_level: result.rows[0].required_level,
    auto_learn: result.rows[0].auto_learn,
    training_cost: result.rows[0].training_cost,
  };
}

export async function removeClassAbility(classId: string, abilityId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM class_abilities WHERE class_id = $1 AND ability_id = $2',
    [classId, abilityId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// CHARACTER PROGRESSION
// ============================================================================

export async function getCharacterProgression(characterId: number): Promise<CharacterProgression | null> {
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
  return result.rows[0] ? dbToCharacterProgressionWithLevel(result.rows[0]) : null;
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
  if (updates.unlocked_talents !== undefined) {
    setClauses.push(`unlocked_talents = $${paramIndex++}`);
    values.push(JSON.stringify(updates.unlocked_talents ?? []));
  }
  if (updates.learned_abilities !== undefined) {
    setClauses.push(`learned_abilities = $${paramIndex++}`);
    values.push(JSON.stringify(updates.learned_abilities ?? []));
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
  return result.rows[0] ? dbToCharacterProgressionWithLevel(result.rows[0]) : null;
}
