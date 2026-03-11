import type pg from 'pg';
import { query, withTransaction } from '../index.js';
import type {
  Quest,
  QuestStep,
  QuestTriggerType,
  QuestStatus,
  QuestItemReward,
  QuestFactionReward,
  CharacterQuest,
  CharacterQuestProgress,
} from '@koa/shared';

// Database row types
interface DbQuest {
  id: number;
  tag: string;
  name: string;
  description: string | null;
  quest_giver_npc_id: number | null;
  min_level: number;
  max_level: number | null;
  required_races: string[] | null;
  required_classes: string[] | null;
  required_faction_id: number | null;
  required_faction_min: number | null;
  required_faction_max: number | null;
  required_quest_ids: number[];
  xp_reward: number;
  essence_reward: number;
  currency_reward: string; // BIGINT comes as string from pg
  item_rewards: QuestItemReward[] | string;
  faction_rewards: QuestFactionReward[] | string;
  quest_flag: string | null;
  denial_dialogue: string | null;
  completed_dialogue: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

interface DbQuestStep {
  id: number;
  quest_id: number;
  step_order: number;
  trigger_type: string;
  trigger_npc_id: number | null;
  trigger_item_template_id: number | null;
  trigger_room_id: number | null;
  trigger_text: string | null;
  required_count: number;
  consume_item: boolean;
  description: string;
  completion_dialogue: string | null;
  in_progress_dialogue: string | null;
  step_xp_reward: number;
  step_essence_reward: number;
  step_currency_reward: string; // BIGINT comes as string from pg
  step_item_rewards: QuestItemReward[] | string;
  step_faction_rewards: QuestFactionReward[] | string;
}

interface DbCharacterQuest {
  id: number;
  character_id: number;
  quest_id: number;
  status: string;
  current_step: number;
  started_at: Date;
  completed_at: Date | null;
}

interface DbCharacterQuestProgress {
  id: number;
  character_id: number;
  quest_step_id: number;
  current_count: number;
}

// JSONB parsing helpers
function parseJsonb<T>(value: T[] | string | null, fallback: T[]): T[] {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

// Row converters
function dbToStep(row: DbQuestStep): QuestStep {
  return {
    id: row.id,
    questId: row.quest_id,
    stepOrder: row.step_order,
    triggerType: row.trigger_type as QuestTriggerType,
    triggerNpcId: row.trigger_npc_id,
    triggerItemTemplateId: row.trigger_item_template_id,
    triggerRoomId: row.trigger_room_id,
    triggerText: row.trigger_text,
    requiredCount: row.required_count,
    consumeItem: row.consume_item,
    description: row.description,
    completionDialogue: row.completion_dialogue,
    inProgressDialogue: row.in_progress_dialogue,
    stepXpReward: row.step_xp_reward,
    stepEssenceReward: row.step_essence_reward,
    stepCurrencyReward: Number(row.step_currency_reward),
    stepItemRewards: parseJsonb(row.step_item_rewards, []),
    stepFactionRewards: parseJsonb(row.step_faction_rewards, []),
  };
}

function dbToQuest(row: DbQuest, steps: QuestStep[]): Quest {
  return {
    id: row.id,
    tag: row.tag,
    name: row.name,
    description: row.description,
    questGiverNpcId: row.quest_giver_npc_id,
    minLevel: row.min_level,
    maxLevel: row.max_level,
    requiredRaces: row.required_races,
    requiredClasses: row.required_classes,
    requiredFactionId: row.required_faction_id,
    requiredFactionMin: row.required_faction_min,
    requiredFactionMax: row.required_faction_max,
    requiredQuestIds: row.required_quest_ids ?? [],
    xpReward: row.xp_reward,
    essenceReward: row.essence_reward,
    currencyReward: Number(row.currency_reward),
    itemRewards: parseJsonb(row.item_rewards, []),
    factionRewards: parseJsonb(row.faction_rewards, []),
    questFlag: row.quest_flag,
    denialDialogue: row.denial_dialogue,
    completedDialogue: row.completed_dialogue,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    steps,
  };
}

function dbToCharacterQuest(row: DbCharacterQuest): CharacterQuest {
  return {
    characterId: row.character_id,
    questId: row.quest_id,
    status: row.status as QuestStatus,
    currentStep: row.current_step,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

// ============================================================================
// Quest Definition Queries
// ============================================================================

export async function getAllQuests(): Promise<Quest[]> {
  const questResult = await query<DbQuest>(
    'SELECT * FROM quests ORDER BY sort_order, id'
  );
  const stepResult = await query<DbQuestStep>(
    'SELECT * FROM quest_steps ORDER BY quest_id, step_order'
  );

  // Group steps by quest_id
  const stepsByQuest = new Map<number, QuestStep[]>();
  for (const row of stepResult.rows) {
    const step = dbToStep(row);
    const existing = stepsByQuest.get(step.questId) ?? [];
    existing.push(step);
    stepsByQuest.set(step.questId, existing);
  }

  return questResult.rows.map(row =>
    dbToQuest(row, stepsByQuest.get(row.id) ?? [])
  );
}

export async function getQuestById(id: number): Promise<Quest | null> {
  const questResult = await query<DbQuest>(
    'SELECT * FROM quests WHERE id = $1', [id]
  );
  if (!questResult.rows[0]) return null;

  const stepResult = await query<DbQuestStep>(
    'SELECT * FROM quest_steps WHERE quest_id = $1 ORDER BY step_order', [id]
  );

  return dbToQuest(questResult.rows[0], stepResult.rows.map(dbToStep));
}

export async function getQuestByTag(tag: string): Promise<Quest | null> {
  const questResult = await query<DbQuest>(
    'SELECT * FROM quests WHERE tag = $1', [tag]
  );
  if (!questResult.rows[0]) return null;

  const stepResult = await query<DbQuestStep>(
    'SELECT * FROM quest_steps WHERE quest_id = $1 ORDER BY step_order',
    [questResult.rows[0].id]
  );

  return dbToQuest(questResult.rows[0], stepResult.rows.map(dbToStep));
}

// ============================================================================
// Character Quest State
// ============================================================================

export async function getActiveQuests(characterId: number): Promise<CharacterQuest[]> {
  const result = await query<DbCharacterQuest>(
    `SELECT * FROM character_quests
     WHERE character_id = $1 AND status = 'active'
     ORDER BY started_at`,
    [characterId]
  );
  return result.rows.map(dbToCharacterQuest);
}

export async function getCompletedQuestIds(characterId: number): Promise<number[]> {
  const result = await query<{ quest_id: number }>(
    `SELECT quest_id FROM character_quests
     WHERE character_id = $1 AND status = 'completed'`,
    [characterId]
  );
  return result.rows.map(row => row.quest_id);
}

export async function getCharacterQuest(
  characterId: number,
  questId: number
): Promise<CharacterQuest | null> {
  const result = await query<DbCharacterQuest>(
    'SELECT * FROM character_quests WHERE character_id = $1 AND quest_id = $2',
    [characterId, questId]
  );
  return result.rows[0] ? dbToCharacterQuest(result.rows[0]) : null;
}

export async function startQuest(
  characterId: number,
  questId: number
): Promise<CharacterQuest> {
  const result = await query<DbCharacterQuest>(
    `INSERT INTO character_quests (character_id, quest_id, status, current_step)
     VALUES ($1, $2, 'active', 1)
     RETURNING *`,
    [characterId, questId]
  );
  return dbToCharacterQuest(result.rows[0]);
}

export async function advanceStep(
  characterId: number,
  questId: number,
  nextStep: number
): Promise<void> {
  await query(
    `UPDATE character_quests SET current_step = $3
     WHERE character_id = $1 AND quest_id = $2`,
    [characterId, questId, nextStep]
  );
}

export async function completeQuest(
  characterId: number,
  questId: number
): Promise<void> {
  await query(
    `UPDATE character_quests
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP
     WHERE character_id = $1 AND quest_id = $2`,
    [characterId, questId]
  );
}

export async function resetQuest(
  characterId: number,
  questId: number,
  questFlag?: string | null
): Promise<void> {
  await withTransaction(async (client) => {
    // Delete kill progress for all steps in this quest
    await client.query(
      `DELETE FROM character_quest_progress
       WHERE character_id = $1
         AND quest_step_id IN (SELECT id FROM quest_steps WHERE quest_id = $2)`,
      [characterId, questId]
    );

    // Delete the quest record
    await client.query(
      'DELETE FROM character_quests WHERE character_id = $1 AND quest_id = $2',
      [characterId, questId]
    );

    // Delete any quest flag granted by this quest
    if (questFlag) {
      await client.query(
        'DELETE FROM character_quest_flags WHERE character_id = $1 AND flag = $2',
        [characterId, questFlag]
      );
    }
  });
}

// ============================================================================
// Kill Progress
// ============================================================================

export async function getQuestProgress(
  characterId: number,
  questStepId: number
): Promise<number> {
  const result = await query<DbCharacterQuestProgress>(
    `SELECT current_count FROM character_quest_progress
     WHERE character_id = $1 AND quest_step_id = $2`,
    [characterId, questStepId]
  );
  return result.rows[0]?.current_count ?? 0;
}

export async function incrementQuestProgress(
  characterId: number,
  questStepId: number
): Promise<number> {
  const result = await query<DbCharacterQuestProgress>(
    `INSERT INTO character_quest_progress (character_id, quest_step_id, current_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (character_id, quest_step_id)
     DO UPDATE SET current_count = character_quest_progress.current_count + 1
     RETURNING current_count`,
    [characterId, questStepId]
  );
  return result.rows[0].current_count;
}

// ============================================================================
// Quest Flags
// ============================================================================

export async function hasQuestFlag(
  characterId: number,
  flag: string
): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM character_quest_flags WHERE character_id = $1 AND flag = $2',
    [characterId, flag]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setQuestFlag(
  characterId: number,
  flag: string
): Promise<void> {
  await query(
    `INSERT INTO character_quest_flags (character_id, flag)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [characterId, flag]
  );
}

export async function deleteQuestFlag(
  characterId: number,
  flag: string
): Promise<void> {
  await query(
    'DELETE FROM character_quest_flags WHERE character_id = $1 AND flag = $2',
    [characterId, flag]
  );
}

// ============================================================================
// Quest Definition CRUD (for editor/API)
// ============================================================================

export interface CreateQuestInput {
  tag: string;
  name: string;
  description?: string | null;
  questGiverNpcId?: number | null;
  minLevel?: number;
  maxLevel?: number | null;
  requiredRaces?: string[] | null;
  requiredClasses?: string[] | null;
  requiredFactionId?: number | null;
  requiredFactionMin?: number | null;
  requiredFactionMax?: number | null;
  requiredQuestIds?: number[];
  xpReward?: number;
  essenceReward?: number;
  currencyReward?: number;
  itemRewards?: QuestItemReward[];
  factionRewards?: QuestFactionReward[];
  questFlag?: string | null;
  denialDialogue?: string | null;
  completedDialogue?: string | null;
  enabled?: boolean;
  sortOrder?: number;
}

export interface CreateStepInput {
  questId: number;
  stepOrder: number;
  triggerType: QuestTriggerType;
  triggerNpcId?: number | null;
  triggerItemTemplateId?: number | null;
  triggerRoomId?: number | null;
  triggerText?: string | null;
  requiredCount?: number;
  consumeItem?: boolean;
  description: string;
  completionDialogue?: string | null;
  inProgressDialogue?: string | null;
  stepXpReward?: number;
  stepEssenceReward?: number;
  stepCurrencyReward?: number;
  stepItemRewards?: QuestItemReward[];
  stepFactionRewards?: QuestFactionReward[];
}

export async function createQuest(
  input: CreateQuestInput,
  client?: pg.PoolClient
): Promise<Quest> {
  const result = await query<DbQuest>(
    `INSERT INTO quests (
      tag, name, description, quest_giver_npc_id,
      min_level, max_level, required_races, required_classes,
      required_faction_id, required_faction_min, required_faction_max,
      required_quest_ids, xp_reward, essence_reward, currency_reward,
      item_rewards, faction_rewards, quest_flag,
      denial_dialogue, completed_dialogue, enabled, sort_order
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    RETURNING *`,
    [
      input.tag, input.name, input.description ?? null, input.questGiverNpcId ?? null,
      input.minLevel ?? 1, input.maxLevel ?? null, input.requiredRaces ?? null, input.requiredClasses ?? null,
      input.requiredFactionId ?? null, input.requiredFactionMin ?? null, input.requiredFactionMax ?? null,
      input.requiredQuestIds ?? [], input.xpReward ?? 0, input.essenceReward ?? 0, input.currencyReward ?? 0,
      JSON.stringify(input.itemRewards ?? []), JSON.stringify(input.factionRewards ?? []), input.questFlag ?? null,
      input.denialDialogue ?? null, input.completedDialogue ?? null, input.enabled ?? true, input.sortOrder ?? 0,
    ],
    client
  );
  return dbToQuest(result.rows[0], []);
}

export async function updateQuest(
  id: number,
  input: Partial<CreateQuestInput>,
  client?: pg.PoolClient
): Promise<Quest | null> {
  const existing = await getQuestById(id);
  if (!existing) return null;

  const result = await query<DbQuest>(
    `UPDATE quests SET
      tag = COALESCE($1, tag),
      name = COALESCE($2, name),
      description = $3,
      quest_giver_npc_id = $4,
      min_level = COALESCE($5, min_level),
      max_level = $6,
      required_races = $7,
      required_classes = $8,
      required_faction_id = $9,
      required_faction_min = $10,
      required_faction_max = $11,
      required_quest_ids = COALESCE($12, required_quest_ids),
      xp_reward = COALESCE($13, xp_reward),
      essence_reward = COALESCE($14, essence_reward),
      currency_reward = COALESCE($15, currency_reward),
      item_rewards = COALESCE($16, item_rewards),
      faction_rewards = COALESCE($17, faction_rewards),
      quest_flag = $18,
      denial_dialogue = $19,
      completed_dialogue = $20,
      enabled = COALESCE($21, enabled),
      sort_order = COALESCE($22, sort_order),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $23
    RETURNING *`,
    [
      input.tag ?? null, input.name ?? null,
      input.description !== undefined ? input.description : existing.description,
      input.questGiverNpcId !== undefined ? input.questGiverNpcId : existing.questGiverNpcId,
      input.minLevel ?? null, input.maxLevel !== undefined ? input.maxLevel : existing.maxLevel,
      input.requiredRaces !== undefined ? input.requiredRaces : existing.requiredRaces,
      input.requiredClasses !== undefined ? input.requiredClasses : existing.requiredClasses,
      input.requiredFactionId !== undefined ? input.requiredFactionId : existing.requiredFactionId,
      input.requiredFactionMin !== undefined ? input.requiredFactionMin : existing.requiredFactionMin,
      input.requiredFactionMax !== undefined ? input.requiredFactionMax : existing.requiredFactionMax,
      input.requiredQuestIds ?? null, input.xpReward ?? null, input.essenceReward ?? null, input.currencyReward ?? null,
      input.itemRewards ? JSON.stringify(input.itemRewards) : null,
      input.factionRewards ? JSON.stringify(input.factionRewards) : null,
      input.questFlag !== undefined ? input.questFlag : existing.questFlag,
      input.denialDialogue !== undefined ? input.denialDialogue : existing.denialDialogue,
      input.completedDialogue !== undefined ? input.completedDialogue : existing.completedDialogue,
      input.enabled ?? null, input.sortOrder ?? null, id,
    ],
    client
  );

  if (!result.rows[0]) return null;

  const stepResult = await query<DbQuestStep>(
    'SELECT * FROM quest_steps WHERE quest_id = $1 ORDER BY step_order', [id], client
  );
  return dbToQuest(result.rows[0], stepResult.rows.map(dbToStep));
}

export async function deleteQuest(id: number): Promise<boolean> {
  const result = await query('DELETE FROM quests WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function replaceSteps(
  questId: number,
  steps: CreateStepInput[],
  client?: pg.PoolClient
): Promise<QuestStep[]> {
  await query('DELETE FROM quest_steps WHERE quest_id = $1', [questId], client);

  const created: QuestStep[] = [];
  for (const step of steps) {
    const result = await query<DbQuestStep>(
      `INSERT INTO quest_steps (
        quest_id, step_order, trigger_type, trigger_npc_id, trigger_item_template_id,
        trigger_room_id, trigger_text, required_count, consume_item,
        description, completion_dialogue, in_progress_dialogue,
        step_xp_reward, step_essence_reward, step_currency_reward,
        step_item_rewards, step_faction_rewards
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        questId, step.stepOrder, step.triggerType, step.triggerNpcId ?? null,
        step.triggerItemTemplateId ?? null, step.triggerRoomId ?? null, step.triggerText ?? null,
        step.requiredCount ?? 1, step.consumeItem ?? true,
        step.description, step.completionDialogue ?? null, step.inProgressDialogue ?? null,
        step.stepXpReward ?? 0, step.stepEssenceReward ?? 0, step.stepCurrencyReward ?? 0,
        JSON.stringify(step.stepItemRewards ?? []), JSON.stringify(step.stepFactionRewards ?? []),
      ],
      client
    );
    created.push(dbToStep(result.rows[0]));
  }
  return created;
}
