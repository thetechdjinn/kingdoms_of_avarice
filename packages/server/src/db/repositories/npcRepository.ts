import { query, withTransaction } from '../index.js';
import { NpcTemplate, NpcAttack, NpcSpell } from '@koa/shared';
import * as npcSpellRepo from './npcSpellRepository.js';
import type pg from 'pg';

// Database row types
interface DbNpcTemplate {
  id: number;
  name: string;
  description: string | null;
  spawn_room_id: number | null;
  health: number;
  max_health: number;
  hostile: boolean;
  respawn_time: number | null;
  level: number;
  experience_reward: number;
  max_mana: number;
  base_accuracy: number;
  base_defense: number;
  base_crit_chance: number;
  base_dodge: number;
  damage_reduction: number;
  traits: string[] | null;
  flee_enabled: boolean;
  flee_hp_percent: number;
  call_for_help_chance: number;
  max_active: number;
  interactable: boolean;
  allowed_areas: string[] | null;
  roam_enabled: boolean;
  roam_interval: number;
  roam_chance: number;
  drop_table_id: number | null;
  essence_reward: number;
  essence_class: string | null;
  leave_corpse: boolean;
  corpse_duration: number;
  augmentations: string[] | null;
  enter_room_message: string | null;
  exit_room_message: string | null;
  spawn_message: string | null;
  primary_faction_id: number | null;
  merchant_enabled: boolean;
  proper_name: boolean;
  spell_power: number;
}

interface DbNpcAttack {
  id: number;
  npc_id: number;
  attack_type: string;
  name: string;
  min_damage: number;
  max_damage: number;
  attacks_per_round: number;
  percentage: number;
  hit_message: string | null;
  miss_message: string | null;
  hit_verb: string;
  hit_verb_3p: string;
  miss_verb: string;
  miss_verb_3p: string;
}

interface DbNpcInstance {
  id: number;
  npc_id: number;
  current_room_id: number;
  current_health: number;
  current_mana: number;
  augmentation: string | null;
  spawned_at: Date;
}

export interface DbDropTableEntry {
  id: number;
  drop_table_id: number;
  item_template_id: number | null;
  drop_chance: number;
  min_quantity: number;
  max_quantity: number;
  currency_min: number;
  currency_max: number;
}

// Convert DB row to shared NpcAttack
function dbToAttack(row: DbNpcAttack): NpcAttack {
  return {
    id: row.id,
    npcId: row.npc_id,
    attackType: row.attack_type,
    name: row.name,
    minDamage: row.min_damage,
    maxDamage: row.max_damage,
    attacksPerRound: row.attacks_per_round,
    percentage: row.percentage,
    hitMessage: row.hit_message,
    missMessage: row.miss_message,
    hitVerb: row.hit_verb,
    hitVerb3p: row.hit_verb_3p,
    missVerb: row.miss_verb,
    missVerb3p: row.miss_verb_3p,
  };
}

// Convert DB row to shared NpcTemplate (attacks and spells added separately)
function dbToTemplate(row: DbNpcTemplate, attacks: NpcAttack[], spells: NpcSpell[] = []): NpcTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    spawnRoomId: row.spawn_room_id,
    health: row.health,
    maxHealth: row.max_health,
    hostile: row.hostile,
    respawnTime: row.respawn_time,
    level: row.level,
    experienceReward: row.experience_reward,
    maxMana: row.max_mana,
    baseAccuracy: row.base_accuracy,
    baseDefense: row.base_defense,
    baseCritChance: row.base_crit_chance,
    baseDodge: row.base_dodge,
    damageReduction: row.damage_reduction,
    traits: row.traits || [],
    fleeEnabled: row.flee_enabled,
    fleeHpPercent: row.flee_hp_percent,
    callForHelpChance: row.call_for_help_chance,
    maxActive: row.max_active,
    interactable: row.interactable,
    allowedAreas: row.allowed_areas || [],
    roamEnabled: row.roam_enabled,
    roamInterval: row.roam_interval,
    roamChance: row.roam_chance,
    dropTableId: row.drop_table_id,
    essenceReward: row.essence_reward,
    essenceClass: row.essence_class,
    leaveCorpse: row.leave_corpse,
    corpseDuration: row.corpse_duration,
    augmentations: row.augmentations || [],
    enterRoomMessage: row.enter_room_message,
    exitRoomMessage: row.exit_room_message,
    spawnMessage: row.spawn_message,
    primaryFactionId: row.primary_faction_id,
    merchantEnabled: row.merchant_enabled,
    properName: row.proper_name,
    spellPower: row.spell_power ?? 0,
    attacks,
    spells,
  };
}

/**
 * Load all NPC templates with their attacks.
 * Two queries (templates + all attacks), merged in JS.
 */
export async function getAllTemplates(): Promise<NpcTemplate[]> {
  const templateResult = await query<DbNpcTemplate>('SELECT * FROM npcs ORDER BY id');
  const attackResult = await query<DbNpcAttack>('SELECT * FROM npc_attacks ORDER BY npc_id, id');

  // Group attacks by npc_id
  const attacksByNpc = new Map<number, NpcAttack[]>();
  for (const row of attackResult.rows) {
    const npcId = row.npc_id;
    if (!attacksByNpc.has(npcId)) {
      attacksByNpc.set(npcId, []);
    }
    attacksByNpc.get(npcId)!.push(dbToAttack(row));
  }

  // Load all NPC spells grouped by npc_id
  const spellsByNpc = await npcSpellRepo.getAllNpcSpells();

  return templateResult.rows.map(row =>
    dbToTemplate(row, attacksByNpc.get(row.id) || [], spellsByNpc.get(row.id) || [])
  );
}

/**
 * Load a single NPC template by ID.
 * Optional client parameter for use within an existing transaction.
 */
export async function getTemplateById(id: number, client?: pg.PoolClient): Promise<NpcTemplate | null> {
  const templateResult = await query<DbNpcTemplate>('SELECT * FROM npcs WHERE id = $1', [id], client);
  if (templateResult.rows.length === 0) return null;

  const attackResult = await query<DbNpcAttack>(
    'SELECT * FROM npc_attacks WHERE npc_id = $1 ORDER BY id',
    [id],
    client
  );

  const spells = await npcSpellRepo.getSpellsForNpc(id, client);

  return dbToTemplate(
    templateResult.rows[0],
    attackResult.rows.map(dbToAttack),
    spells
  );
}

/**
 * Get attacks for a template.
 */
export async function getAttacksForTemplate(npcId: number): Promise<NpcAttack[]> {
  const result = await query<DbNpcAttack>(
    'SELECT * FROM npc_attacks WHERE npc_id = $1 ORDER BY id',
    [npcId]
  );
  return result.rows.map(dbToAttack);
}

/**
 * Load all NPC instances for startup.
 */
export async function getAllInstances(): Promise<DbNpcInstance[]> {
  const result = await query<DbNpcInstance>('SELECT * FROM npc_instances');
  return result.rows;
}

/**
 * Batch upsert NPC instances for periodic persistence.
 */
export async function saveInstances(instances: {
  id: number;
  npcId: number;
  currentRoomId: number;
  currentHealth: number;
  currentMana: number;
  augmentation: string | null;
}[]): Promise<void> {
  if (instances.length === 0) return;

  await withTransaction(async (client) => {
    for (const inst of instances) {
      await client.query(
        `INSERT INTO npc_instances (id, npc_id, current_room_id, current_health, current_mana, augmentation)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           current_room_id = EXCLUDED.current_room_id,
           current_health = EXCLUDED.current_health,
           current_mana = EXCLUDED.current_mana,
           augmentation = EXCLUDED.augmentation`,
        [inst.id, inst.npcId, inst.currentRoomId, inst.currentHealth, inst.currentMana, inst.augmentation]
      );
    }
  });
}

/**
 * Delete an NPC instance from the database.
 */
export async function deleteInstance(instanceId: number): Promise<void> {
  await query('DELETE FROM npc_instances WHERE id = $1', [instanceId]);
}

/**
 * Create a new NPC instance in the database.
 */
export async function createInstance(
  npcId: number,
  roomId: number,
  health: number,
  mana: number = 0,
  augmentation: string | null = null
): Promise<number> {
  const result = await query<{ id: number }>(
    `INSERT INTO npc_instances (npc_id, current_room_id, current_health, current_mana, augmentation)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [npcId, roomId, health, mana, augmentation]
  );
  return result.rows[0].id;
}

/**
 * Get drop table entries for a drop table.
 */
export async function getDropTableEntries(dropTableId: number): Promise<DbDropTableEntry[]> {
  const result = await query<DbDropTableEntry>(
    'SELECT * FROM drop_table_entries WHERE drop_table_id = $1 ORDER BY id',
    [dropTableId]
  );
  return result.rows;
}

// ============================================================================
// NPC TEMPLATE WRITE OPERATIONS
// ============================================================================

export interface CreateNpcTemplateInput {
  name: string;
  description?: string | null;
  spawnRoomId?: number | null;
  maxHealth?: number;
  hostile?: boolean;
  respawnTime?: number | null;
  level?: number;
  experienceReward?: number;
  maxMana?: number;
  baseAccuracy?: number;
  baseDefense?: number;
  baseCritChance?: number;
  baseDodge?: number;
  damageReduction?: number;
  traits?: string[];
  fleeEnabled?: boolean;
  fleeHpPercent?: number;
  callForHelpChance?: number;
  maxActive?: number;
  interactable?: boolean;
  allowedAreas?: string[];
  roamEnabled?: boolean;
  roamInterval?: number;
  roamChance?: number;
  dropTableId?: number | null;
  essenceReward?: number;
  essenceClass?: string | null;
  leaveCorpse?: boolean;
  corpseDuration?: number;
  augmentations?: string[];
  enterRoomMessage?: string | null;
  exitRoomMessage?: string | null;
  spawnMessage?: string | null;
  primaryFactionId?: number | null;
  merchantEnabled?: boolean;
  properName?: boolean;
  spellPower?: number;
}

export interface CreateNpcAttackInput {
  name: string;
  attackType?: string;
  minDamage?: number;
  maxDamage?: number;
  attacksPerRound?: number;
  percentage?: number;
  hitMessage?: string | null;
  missMessage?: string | null;
  hitVerb?: string;
  hitVerb3p?: string;
  missVerb?: string;
  missVerb3p?: string;
}

/**
 * Create a new NPC template.
 * Optional client parameter for use within an existing transaction.
 */
export async function createTemplate(input: CreateNpcTemplateInput, client?: pg.PoolClient): Promise<NpcTemplate> {
  const maxHealth = input.maxHealth ?? 100;
  const result = await query<{ id: number }>(
    `INSERT INTO npcs (
      name, description, spawn_room_id, health, max_health, hostile, respawn_time,
      level, experience_reward, max_mana,
      base_accuracy, base_defense, base_crit_chance, base_dodge, damage_reduction,
      traits, flee_enabled, flee_hp_percent, call_for_help_chance,
      max_active, interactable, allowed_areas, roam_enabled, roam_interval, roam_chance,
      drop_table_id, essence_reward, essence_class,
      leave_corpse, corpse_duration, augmentations,
      enter_room_message, exit_room_message, spawn_message,
      primary_faction_id, merchant_enabled, proper_name, spell_power
    ) VALUES (
      $1, $2, $3, $4, $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24,
      $25, $26, $27,
      $28, $29, $30,
      $31, $32, $33,
      $34, $35, $36, $37
    ) RETURNING id`,
    [
      input.name,
      input.description ?? null,
      input.spawnRoomId ?? null,
      maxHealth,
      input.hostile ?? true,
      input.respawnTime ?? null,
      input.level ?? 1,
      input.experienceReward ?? 0,
      input.maxMana ?? 0,
      input.baseAccuracy ?? 50,
      input.baseDefense ?? 50,
      input.baseCritChance ?? 5,
      input.baseDodge ?? 5,
      input.damageReduction ?? 0,
      input.traits ?? [],
      input.fleeEnabled ?? false,
      input.fleeHpPercent ?? 20,
      input.callForHelpChance ?? 0,
      input.maxActive ?? 1,
      input.interactable ?? false,
      input.allowedAreas ?? [],
      input.roamEnabled ?? false,
      input.roamInterval ?? 60,
      input.roamChance ?? 10,
      input.dropTableId ?? null,
      input.essenceReward ?? 0,
      input.essenceClass ?? null,
      input.leaveCorpse ?? false,
      input.corpseDuration ?? 300,
      input.augmentations ?? [],
      input.enterRoomMessage ?? null,
      input.exitRoomMessage ?? null,
      input.spawnMessage ?? null,
      input.primaryFactionId ?? null,
      input.merchantEnabled ?? false,
      input.properName ?? false,
      input.spellPower ?? 0,
    ],
    client
  );

  const template = await getTemplateById(result.rows[0].id, client);
  return template!;
}

/**
 * Update an NPC template. Only provided fields are updated.
 * Optional client parameter for use within an existing transaction.
 */
export async function updateTemplate(id: number, input: Partial<CreateNpcTemplateInput>, client?: pg.PoolClient): Promise<NpcTemplate | null> {
  const existing = await getTemplateById(id, client);
  if (!existing) return null;

  // Map input fields to DB columns
  const fieldMap: Record<string, { column: string; value: unknown }> = {};

  if (input.name !== undefined) fieldMap.name = { column: 'name', value: input.name };
  if (input.description !== undefined) fieldMap.description = { column: 'description', value: input.description };
  if (input.spawnRoomId !== undefined) fieldMap.spawnRoomId = { column: 'spawn_room_id', value: input.spawnRoomId };
  if (input.maxHealth !== undefined) {
    fieldMap.maxHealth = { column: 'max_health', value: input.maxHealth };
    fieldMap.health = { column: 'health', value: input.maxHealth };
  }
  if (input.hostile !== undefined) fieldMap.hostile = { column: 'hostile', value: input.hostile };
  if (input.respawnTime !== undefined) fieldMap.respawnTime = { column: 'respawn_time', value: input.respawnTime };
  if (input.level !== undefined) fieldMap.level = { column: 'level', value: input.level };
  if (input.experienceReward !== undefined) fieldMap.experienceReward = { column: 'experience_reward', value: input.experienceReward };
  if (input.maxMana !== undefined) fieldMap.maxMana = { column: 'max_mana', value: input.maxMana };
  if (input.baseAccuracy !== undefined) fieldMap.baseAccuracy = { column: 'base_accuracy', value: input.baseAccuracy };
  if (input.baseDefense !== undefined) fieldMap.baseDefense = { column: 'base_defense', value: input.baseDefense };
  if (input.baseCritChance !== undefined) fieldMap.baseCritChance = { column: 'base_crit_chance', value: input.baseCritChance };
  if (input.baseDodge !== undefined) fieldMap.baseDodge = { column: 'base_dodge', value: input.baseDodge };
  if (input.damageReduction !== undefined) fieldMap.damageReduction = { column: 'damage_reduction', value: input.damageReduction };
  if (input.traits !== undefined) fieldMap.traits = { column: 'traits', value: input.traits };
  if (input.fleeEnabled !== undefined) fieldMap.fleeEnabled = { column: 'flee_enabled', value: input.fleeEnabled };
  if (input.fleeHpPercent !== undefined) fieldMap.fleeHpPercent = { column: 'flee_hp_percent', value: input.fleeHpPercent };
  if (input.callForHelpChance !== undefined) fieldMap.callForHelpChance = { column: 'call_for_help_chance', value: input.callForHelpChance };
  if (input.maxActive !== undefined) fieldMap.maxActive = { column: 'max_active', value: input.maxActive };
  if (input.interactable !== undefined) fieldMap.interactable = { column: 'interactable', value: input.interactable };
  if (input.allowedAreas !== undefined) fieldMap.allowedAreas = { column: 'allowed_areas', value: input.allowedAreas };
  if (input.roamEnabled !== undefined) fieldMap.roamEnabled = { column: 'roam_enabled', value: input.roamEnabled };
  if (input.roamInterval !== undefined) fieldMap.roamInterval = { column: 'roam_interval', value: input.roamInterval };
  if (input.roamChance !== undefined) fieldMap.roamChance = { column: 'roam_chance', value: input.roamChance };
  if (input.dropTableId !== undefined) fieldMap.dropTableId = { column: 'drop_table_id', value: input.dropTableId };
  if (input.essenceReward !== undefined) fieldMap.essenceReward = { column: 'essence_reward', value: input.essenceReward };
  if (input.essenceClass !== undefined) fieldMap.essenceClass = { column: 'essence_class', value: input.essenceClass };
  if (input.leaveCorpse !== undefined) fieldMap.leaveCorpse = { column: 'leave_corpse', value: input.leaveCorpse };
  if (input.corpseDuration !== undefined) fieldMap.corpseDuration = { column: 'corpse_duration', value: input.corpseDuration };
  if (input.augmentations !== undefined) fieldMap.augmentations = { column: 'augmentations', value: input.augmentations };
  if (input.enterRoomMessage !== undefined) fieldMap.enterRoomMessage = { column: 'enter_room_message', value: input.enterRoomMessage };
  if (input.exitRoomMessage !== undefined) fieldMap.exitRoomMessage = { column: 'exit_room_message', value: input.exitRoomMessage };
  if (input.spawnMessage !== undefined) fieldMap.spawnMessage = { column: 'spawn_message', value: input.spawnMessage };
  if (input.primaryFactionId !== undefined) fieldMap.primaryFactionId = { column: 'primary_faction_id', value: input.primaryFactionId };
  if (input.merchantEnabled !== undefined) fieldMap.merchantEnabled = { column: 'merchant_enabled', value: input.merchantEnabled };
  if (input.properName !== undefined) fieldMap.properName = { column: 'proper_name', value: input.properName };
  if (input.spellPower !== undefined) fieldMap.spellPower = { column: 'spell_power', value: input.spellPower };

  const entries = Object.values(fieldMap);
  if (entries.length === 0) return existing;

  const setClauses = entries.map((e, i) => `${e.column} = $${i + 1}`);
  const values = entries.map(e => e.value);
  values.push(id);

  await query(
    `UPDATE npcs SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
    values,
    client
  );

  return getTemplateById(id, client);
}

/**
 * Delete an NPC template. FK CASCADE handles attacks + instances.
 */
export async function deleteTemplate(id: number): Promise<boolean> {
  const result = await query('DELETE FROM npcs WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Replace all attacks for an NPC template.
 * Deletes existing attacks and inserts new ones within a transaction.
 * When an external client is provided, uses it directly (caller manages the transaction).
 */
export async function replaceAttacks(npcId: number, attacks: CreateNpcAttackInput[], externalClient?: pg.PoolClient): Promise<NpcAttack[]> {
  const doWork = async (client: pg.PoolClient) => {
    await client.query('DELETE FROM npc_attacks WHERE npc_id = $1', [npcId]);

    const results: NpcAttack[] = [];
    for (const atk of attacks) {
      const result = await client.query<DbNpcAttack>(
        `INSERT INTO npc_attacks (
          npc_id, name, attack_type, min_damage, max_damage,
          attacks_per_round, percentage,
          hit_message, miss_message,
          hit_verb, hit_verb_3p, miss_verb, miss_verb_3p
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          npcId,
          atk.name,
          atk.attackType ?? 'melee',
          atk.minDamage ?? 1,
          atk.maxDamage ?? 5,
          atk.attacksPerRound ?? 1,
          atk.percentage ?? 100,
          atk.hitMessage ?? null,
          atk.missMessage ?? null,
          atk.hitVerb ?? 'hits',
          atk.hitVerb3p ?? 'hits',
          atk.missVerb ?? 'misses',
          atk.missVerb3p ?? 'misses',
        ]
      );
      results.push(dbToAttack(result.rows[0]));
    }

    return results;
  };

  if (externalClient) {
    return doWork(externalClient);
  }
  return withTransaction(doWork);
}
