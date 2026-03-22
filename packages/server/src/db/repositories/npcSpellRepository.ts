import { query, withTransaction } from '../index.js';
import { NpcSpell, Spell, SpellType, SpellTargetType, SpellScalingStat } from '@koa/shared';
import type pg from 'pg';

// Database row from JOIN of npc_spells + spells
interface DbNpcSpellRow {
  id: number;
  npc_id: number;
  spell_id: number;
  priority: number;
  cast_chance: number;
  condition_type: string;
  condition_value: number;
  cooldown_rounds: number;
  // Joined spell columns (prefixed with s_)
  s_name: string;
  s_mnemonic: string;
  s_description: string | null;
  s_spell_type: string;
  s_target_type: string;
  s_mana_cost: number;
  s_min_damage: number | null;
  s_max_damage: number | null;
  s_min_healing: number | null;
  s_max_healing: number | null;
  s_hits_per_cast: number;
  s_status_effect: string | null;
  s_effect_duration: number | null;
  s_level_required: number;
  s_class_restrictions: string[] | null;
  s_is_attack_spell: boolean;
  s_scaling_per_level: string | null;
  s_max_scaling_level: number | null;
  s_damage_scaling_stat: string | null;
  s_damage_scaling_factor: string | null;
  s_healing_scaling_stat: string | null;
  s_healing_scaling_factor: string | null;
  s_cast_difficulty: number;
  s_fizzle_message: string | null;
  s_hit_message_self: string | null;
  s_hit_message_target: string | null;
  s_hit_message_room: string | null;
  s_telegraph_message: string | null;
  s_save_stat: string | null;
  s_save_difficulty: number;
}

const NPC_SPELL_JOIN_SQL = `
  SELECT
    ns.id, ns.npc_id, ns.spell_id,
    ns.priority, ns.cast_chance, ns.condition_type, ns.condition_value, ns.cooldown_rounds,
    s.name AS s_name, s.mnemonic AS s_mnemonic, s.description AS s_description,
    s.spell_type AS s_spell_type, s.target_type AS s_target_type, s.mana_cost AS s_mana_cost,
    s.min_damage AS s_min_damage, s.max_damage AS s_max_damage,
    s.min_healing AS s_min_healing, s.max_healing AS s_max_healing,
    s.hits_per_cast AS s_hits_per_cast,
    s.status_effect AS s_status_effect, s.effect_duration AS s_effect_duration,
    s.level_required AS s_level_required, s.class_restrictions AS s_class_restrictions,
    s.is_attack_spell AS s_is_attack_spell,
    s.scaling_per_level AS s_scaling_per_level, s.max_scaling_level AS s_max_scaling_level,
    s.damage_scaling_stat AS s_damage_scaling_stat, s.damage_scaling_factor AS s_damage_scaling_factor,
    s.healing_scaling_stat AS s_healing_scaling_stat, s.healing_scaling_factor AS s_healing_scaling_factor,
    s.cast_difficulty AS s_cast_difficulty, s.fizzle_message AS s_fizzle_message,
    s.hit_message_self AS s_hit_message_self, s.hit_message_target AS s_hit_message_target,
    s.hit_message_room AS s_hit_message_room,
    s.telegraph_message AS s_telegraph_message, s.save_stat AS s_save_stat, s.save_difficulty AS s_save_difficulty
  FROM npc_spells ns
  JOIN spells s ON ns.spell_id = s.id
`;

function parseDecimal(val: string | null): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function dbToNpcSpell(row: DbNpcSpellRow): NpcSpell {
  const spell: Spell = {
    id: row.spell_id,
    name: row.s_name,
    mnemonic: row.s_mnemonic,
    description: row.s_description ?? '',
    spellType: row.s_spell_type as SpellType,
    targetType: row.s_target_type as SpellTargetType,
    manaCost: row.s_mana_cost,
    minDamage: row.s_min_damage,
    maxDamage: row.s_max_damage,
    minHealing: row.s_min_healing,
    maxHealing: row.s_max_healing,
    hitsPerCast: row.s_hits_per_cast ?? 1,
    statusEffect: row.s_status_effect,
    effectDuration: row.s_effect_duration,
    levelRequired: row.s_level_required,
    classRestrictions: row.s_class_restrictions ?? [],
    isAttackSpell: row.s_is_attack_spell,
    scalingPerLevel: parseDecimal(row.s_scaling_per_level),
    maxScalingLevel: row.s_max_scaling_level,
    damageScalingStat: row.s_damage_scaling_stat as SpellScalingStat | null,
    damageScalingFactor: parseDecimal(row.s_damage_scaling_factor),
    healingScalingStat: row.s_healing_scaling_stat as SpellScalingStat | null,
    healingScalingFactor: parseDecimal(row.s_healing_scaling_factor),
    castDifficulty: row.s_cast_difficulty ?? 0,
    fizzleMessage: row.s_fizzle_message,
    hitMessageSelf: row.s_hit_message_self,
    hitMessageTarget: row.s_hit_message_target,
    hitMessageRoom: row.s_hit_message_room,
    telegraphMessage: row.s_telegraph_message,
    saveStat: row.s_save_stat as SpellScalingStat | null,
    saveDifficulty: row.s_save_difficulty ?? 0,
  };

  return {
    id: row.id,
    npcId: row.npc_id,
    spellId: row.spell_id,
    priority: row.priority,
    castChance: row.cast_chance,
    conditionType: row.condition_type,
    conditionValue: row.condition_value,
    cooldownRounds: row.cooldown_rounds,
    spell,
  };
}

/**
 * Get all spells assigned to a specific NPC template.
 */
export async function getSpellsForNpc(npcId: number, client?: pg.PoolClient): Promise<NpcSpell[]> {
  const result = await query<DbNpcSpellRow>(
    `${NPC_SPELL_JOIN_SQL} WHERE ns.npc_id = $1 ORDER BY ns.priority DESC, ns.id`,
    [npcId],
    client
  );
  return result.rows.map(dbToNpcSpell);
}

/**
 * Get all NPC spells grouped by npc_id.
 * Used by getAllTemplates() to batch-load spells for all NPCs.
 */
export async function getAllNpcSpells(): Promise<Map<number, NpcSpell[]>> {
  const result = await query<DbNpcSpellRow>(
    `${NPC_SPELL_JOIN_SQL} ORDER BY ns.npc_id, ns.priority DESC, ns.id`
  );

  const map = new Map<number, NpcSpell[]>();
  for (const row of result.rows) {
    const npcId = row.npc_id;
    if (!map.has(npcId)) {
      map.set(npcId, []);
    }
    map.get(npcId)!.push(dbToNpcSpell(row));
  }
  return map;
}

export interface CreateNpcSpellInput {
  spellId: number;
  priority?: number;
  castChance?: number;
  conditionType?: string;
  conditionValue?: number;
  cooldownRounds?: number;
}

/**
 * Replace all spell assignments for an NPC template.
 * Deletes existing and inserts new within a transaction.
 * When an external client is provided, uses it directly (caller manages the transaction).
 */
export async function replaceSpells(npcId: number, spells: CreateNpcSpellInput[], externalClient?: pg.PoolClient): Promise<NpcSpell[]> {
  const doWork = async (client: pg.PoolClient) => {
    await client.query('DELETE FROM npc_spells WHERE npc_id = $1', [npcId]);

    for (const sp of spells) {
      await client.query(
        `INSERT INTO npc_spells (
          npc_id, spell_id, priority, cast_chance, condition_type, condition_value, cooldown_rounds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          npcId,
          sp.spellId,
          sp.priority ?? 50,
          sp.castChance ?? 100,
          sp.conditionType ?? 'any',
          sp.conditionValue ?? 0,
          sp.cooldownRounds ?? 0,
        ]
      );
    }

    // Re-fetch with joined spell data
    const result = await client.query<DbNpcSpellRow>(
      `${NPC_SPELL_JOIN_SQL} WHERE ns.npc_id = $1 ORDER BY ns.priority DESC, ns.id`,
      [npcId]
    );
    return result.rows.map(dbToNpcSpell);
  };

  if (externalClient) {
    return doWork(externalClient);
  }
  return withTransaction(doWork);
}
