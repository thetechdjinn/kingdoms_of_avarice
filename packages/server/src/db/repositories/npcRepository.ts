import { query, withTransaction } from '../index.js';
import { NpcTemplate, NpcAttack } from '@koa/shared';

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
  gold_min: number;
  gold_max: number;
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
  augmentation_enabled: boolean;
  augmentations: string[] | null;
  enter_room_message: string | null;
  exit_room_message: string | null;
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
  mana_cost: number;
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
    manaCost: row.mana_cost,
    hitMessage: row.hit_message,
    missMessage: row.miss_message,
    hitVerb: row.hit_verb,
    hitVerb3p: row.hit_verb_3p,
    missVerb: row.miss_verb,
    missVerb3p: row.miss_verb_3p,
  };
}

// Convert DB row to shared NpcTemplate (attacks added separately)
function dbToTemplate(row: DbNpcTemplate, attacks: NpcAttack[]): NpcTemplate {
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
    goldMin: row.gold_min,
    goldMax: row.gold_max,
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
    augmentationEnabled: row.augmentation_enabled,
    augmentations: row.augmentations || [],
    enterRoomMessage: row.enter_room_message,
    exitRoomMessage: row.exit_room_message,
    attacks,
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

  return templateResult.rows.map(row =>
    dbToTemplate(row, attacksByNpc.get(row.id) || [])
  );
}

/**
 * Load a single NPC template by ID.
 */
export async function getTemplateById(id: number): Promise<NpcTemplate | null> {
  const templateResult = await query<DbNpcTemplate>('SELECT * FROM npcs WHERE id = $1', [id]);
  if (templateResult.rows.length === 0) return null;

  const attackResult = await query<DbNpcAttack>(
    'SELECT * FROM npc_attacks WHERE npc_id = $1 ORDER BY id',
    [id]
  );

  return dbToTemplate(
    templateResult.rows[0],
    attackResult.rows.map(dbToAttack)
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
