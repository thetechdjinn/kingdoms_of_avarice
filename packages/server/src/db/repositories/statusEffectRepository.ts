import { query } from '../index.js';
import { ActiveStatusEffect, DbStatusEffect } from '@koa/shared';

// Convert database row to ActiveStatusEffect interface
function dbToActiveEffect(row: DbStatusEffect): ActiveStatusEffect {
  return {
    definitionId: row.effect_id,
    appliedAt: new Date(row.applied_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    stacks: row.stacks,
    sourceSpellId: row.source_spell_id ?? undefined,
  };
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Get all active (non-expired) status effects for a character
 */
export async function getActiveEffects(characterId: number): Promise<ActiveStatusEffect[]> {
  const result = await query<DbStatusEffect>(
    `SELECT * FROM character_status_effects
     WHERE character_id = $1 AND datetime(expires_at) > datetime('now')
     ORDER BY applied_at`,
    [characterId]
  );
  return result.rows.map(dbToActiveEffect);
}

/**
 * Get a specific effect for a character
 */
export async function getEffect(characterId: number, effectId: string): Promise<ActiveStatusEffect | null> {
  const result = await query<DbStatusEffect>(
    `SELECT * FROM character_status_effects
     WHERE character_id = $1 AND effect_id = $2`,
    [characterId, effectId]
  );
  return result.rows[0] ? dbToActiveEffect(result.rows[0]) : null;
}

/**
 * Check if a character has a specific effect (active, non-expired)
 */
export async function hasEffect(characterId: number, effectId: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM character_status_effects
      WHERE character_id = $1 AND effect_id = $2 AND datetime(expires_at) > datetime('now')
    ) as exists`,
    [characterId, effectId]
  );
  return result.rows[0]?.exists ?? false;
}

// ============================================================================
// Mutation Operations
// ============================================================================

/**
 * Save (upsert) a status effect for a character.
 * If the effect already exists, it will be updated.
 */
export async function saveEffect(
  characterId: number,
  effect: ActiveStatusEffect
): Promise<ActiveStatusEffect> {
  const result = await query<DbStatusEffect>(
    `INSERT INTO character_status_effects (
      character_id, effect_id, stacks, applied_at, expires_at, source_spell_id
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (character_id, effect_id)
    DO UPDATE SET
      stacks = EXCLUDED.stacks,
      applied_at = EXCLUDED.applied_at,
      expires_at = EXCLUDED.expires_at,
      source_spell_id = EXCLUDED.source_spell_id
    RETURNING *`,
    [
      characterId,
      effect.definitionId,
      effect.stacks,
      new Date(effect.appliedAt).toISOString(),
      new Date(effect.expiresAt).toISOString(),
      effect.sourceSpellId ?? null,
    ]
  );
  return dbToActiveEffect(result.rows[0]);
}

/**
 * Update the stacks and/or expiration time for an existing effect
 */
export async function updateEffect(
  characterId: number,
  effectId: string,
  updates: { stacks?: number; expiresAt?: number }
): Promise<ActiveStatusEffect | null> {
  const setClauses: string[] = [];
  const values: (string | number)[] = [characterId, effectId];
  let paramIndex = 3;

  if (updates.stacks !== undefined) {
    setClauses.push(`stacks = $${paramIndex++}`);
    values.push(updates.stacks);
  }

  if (updates.expiresAt !== undefined) {
    setClauses.push(`expires_at = $${paramIndex++}`);
    values.push(new Date(updates.expiresAt).toISOString());
  }

  if (setClauses.length === 0) {
    return getEffect(characterId, effectId);
  }

  const result = await query<DbStatusEffect>(
    `UPDATE character_status_effects
     SET ${setClauses.join(', ')}
     WHERE character_id = $1 AND effect_id = $2
     RETURNING *`,
    values
  );
  return result.rows[0] ? dbToActiveEffect(result.rows[0]) : null;
}

/**
 * Remove a specific effect from a character
 */
export async function removeEffect(characterId: number, effectId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM character_status_effects
     WHERE character_id = $1 AND effect_id = $2`,
    [characterId, effectId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Remove all expired effects for a character
 */
export async function removeExpiredEffects(characterId: number): Promise<number> {
  const result = await query(
    `DELETE FROM character_status_effects
     WHERE character_id = $1 AND datetime(expires_at) <= datetime('now')`,
    [characterId]
  );
  return result.rowCount ?? 0;
}

/**
 * Remove all effects from a character (e.g., on death)
 */
export async function removeAllEffects(characterId: number): Promise<number> {
  const result = await query(
    `DELETE FROM character_status_effects WHERE character_id = $1`,
    [characterId]
  );
  return result.rowCount ?? 0;
}
