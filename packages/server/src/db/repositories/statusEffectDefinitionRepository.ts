import { query, withTransaction } from '../index.js';
import type pg from 'pg';
import {
  StatusEffectDefinition,
  StatusEffectCategory,
  StackingBehavior,
} from '@koa/shared';

// Database row type for status_effect_definitions table
interface DbStatusEffectDefinition {
  id: string;
  name: string;
  description: string | null;
  category: string;
  stacking_behavior: string;
  max_stacks: number;
  accuracy_modifier: number;
  defense_modifier: number;
  energy_modifier: number;
  damage_modifier: number;
  tick_damage_min: number | null;
  tick_damage_max: number | null;
  tick_healing_min: number | null;
  tick_healing_max: number | null;
  tick_message: string | null;
  silent_tick: boolean;
  wear_off_message: string | null;
  blocks_regen: boolean;
  blocks_movement: boolean;
  is_blind: boolean;
  created_at: Date;
  updated_at: Date;
}

// Convert database row to StatusEffectDefinition interface
function dbToDefinition(row: DbStatusEffectDefinition): StatusEffectDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category as StatusEffectCategory,
    stackingBehavior: row.stacking_behavior as StackingBehavior,
    maxStacks: row.max_stacks,
    accuracyModifier: row.accuracy_modifier,
    defenseModifier: row.defense_modifier,
    energyModifier: row.energy_modifier,
    damageModifier: row.damage_modifier,
    tickDamageMin: row.tick_damage_min ?? undefined,
    tickDamageMax: row.tick_damage_max ?? undefined,
    tickHealingMin: row.tick_healing_min ?? undefined,
    tickHealingMax: row.tick_healing_max ?? undefined,
    tickMessage: row.tick_message ?? undefined,
    silentTick: row.silent_tick,
    wearOffMessage: row.wear_off_message ?? undefined,
    blocksRegen: row.blocks_regen,
    blocksMovement: row.blocks_movement,
    isBlind: row.is_blind,
  };
}

// ============================================================================
// Status Effect Definition Operations
// ============================================================================

/**
 * Get a status effect definition by its ID
 * IDs are normalized to lowercase for case-insensitive lookup
 */
export async function getDefinitionById(id: string): Promise<StatusEffectDefinition | null> {
  const result = await query<DbStatusEffectDefinition>(
    'SELECT * FROM status_effect_definitions WHERE id = $1',
    [id.toLowerCase()]
  );
  return result.rows[0] ? dbToDefinition(result.rows[0]) : null;
}

/**
 * Get all status effect definitions
 */
export async function getAllDefinitions(): Promise<StatusEffectDefinition[]> {
  const result = await query<DbStatusEffectDefinition>(
    'SELECT * FROM status_effect_definitions ORDER BY category, name'
  );
  return result.rows.map(dbToDefinition);
}

/**
 * Get all status effect definitions by category
 */
export async function getDefinitionsByCategory(category: StatusEffectCategory): Promise<StatusEffectDefinition[]> {
  const result = await query<DbStatusEffectDefinition>(
    'SELECT * FROM status_effect_definitions WHERE category = $1 ORDER BY name',
    [category]
  );
  return result.rows.map(dbToDefinition);
}

/**
 * Get all effect IDs (for spell editor dropdowns)
 */
export async function getAllEffectIds(): Promise<string[]> {
  const result = await query<{ id: string }>(
    'SELECT id FROM status_effect_definitions ORDER BY category, name'
  );
  return result.rows.map(row => row.id);
}

// ============================================================================
// CRUD Operations (for editor)
// ============================================================================

export interface CreateDefinitionInput {
  id: string;
  name: string;
  description?: string;
  category: StatusEffectCategory;
  stackingBehavior: StackingBehavior;
  maxStacks?: number;
  accuracyModifier?: number;
  defenseModifier?: number;
  energyModifier?: number;
  damageModifier?: number;
  tickDamageMin?: number;
  tickDamageMax?: number;
  tickHealingMin?: number;
  tickHealingMax?: number;
  tickMessage?: string;
  silentTick?: boolean;
  wearOffMessage?: string;
  blocksRegen?: boolean;
  blocksMovement?: boolean;
  isBlind?: boolean;
}

/**
 * Create a new status effect definition
 */
export async function createDefinition(input: CreateDefinitionInput): Promise<StatusEffectDefinition> {
  const result = await query<DbStatusEffectDefinition>(
    `INSERT INTO status_effect_definitions (
      id, name, description, category, stacking_behavior, max_stacks,
      accuracy_modifier, defense_modifier, energy_modifier, damage_modifier,
      tick_damage_min, tick_damage_max, tick_healing_min, tick_healing_max,
      tick_message, silent_tick, wear_off_message,
      blocks_regen, blocks_movement, is_blind
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    RETURNING *`,
    [
      input.id.toLowerCase(),
      input.name,
      input.description || null,
      input.category,
      input.stackingBehavior,
      input.maxStacks ?? 1,
      input.accuracyModifier ?? 0,
      input.defenseModifier ?? 0,
      input.energyModifier ?? 0,
      input.damageModifier ?? 0,
      input.tickDamageMin ?? null,
      input.tickDamageMax ?? null,
      input.tickHealingMin ?? null,
      input.tickHealingMax ?? null,
      input.tickMessage || null,
      input.silentTick ?? false,
      input.wearOffMessage || null,
      input.blocksRegen ?? false,
      input.blocksMovement ?? false,
      input.isBlind ?? false,
    ]
  );
  return dbToDefinition(result.rows[0]);
}

/**
 * Update an existing status effect definition
 */
export async function updateDefinition(id: string, input: Partial<CreateDefinitionInput>): Promise<StatusEffectDefinition | null> {
  const existing = await getDefinitionById(id);
  if (!existing) return null;

  const updated = {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    stackingBehavior: input.stackingBehavior ?? existing.stackingBehavior,
    maxStacks: input.maxStacks ?? existing.maxStacks,
    accuracyModifier: input.accuracyModifier ?? existing.accuracyModifier,
    defenseModifier: input.defenseModifier ?? existing.defenseModifier,
    energyModifier: input.energyModifier ?? existing.energyModifier,
    damageModifier: input.damageModifier ?? existing.damageModifier,
    tickDamageMin: input.tickDamageMin !== undefined ? input.tickDamageMin : existing.tickDamageMin,
    tickDamageMax: input.tickDamageMax !== undefined ? input.tickDamageMax : existing.tickDamageMax,
    tickHealingMin: input.tickHealingMin !== undefined ? input.tickHealingMin : existing.tickHealingMin,
    tickHealingMax: input.tickHealingMax !== undefined ? input.tickHealingMax : existing.tickHealingMax,
    tickMessage: input.tickMessage !== undefined ? input.tickMessage : existing.tickMessage,
    silentTick: input.silentTick !== undefined ? input.silentTick : existing.silentTick,
    wearOffMessage: input.wearOffMessage !== undefined ? input.wearOffMessage : existing.wearOffMessage,
    blocksRegen: input.blocksRegen !== undefined ? input.blocksRegen : existing.blocksRegen,
    blocksMovement: input.blocksMovement !== undefined ? input.blocksMovement : existing.blocksMovement,
    isBlind: input.isBlind !== undefined ? input.isBlind : existing.isBlind,
  };

  const result = await query<DbStatusEffectDefinition>(
    `UPDATE status_effect_definitions SET
      name = $1, description = $2, category = $3, stacking_behavior = $4, max_stacks = $5,
      accuracy_modifier = $6, defense_modifier = $7, energy_modifier = $8, damage_modifier = $9,
      tick_damage_min = $10, tick_damage_max = $11, tick_healing_min = $12, tick_healing_max = $13,
      tick_message = $14, silent_tick = $15, wear_off_message = $16,
      blocks_regen = $17, blocks_movement = $18, is_blind = $19, updated_at = NOW()
    WHERE id = $20
    RETURNING *`,
    [
      updated.name,
      updated.description || null,
      updated.category,
      updated.stackingBehavior,
      updated.maxStacks,
      updated.accuracyModifier,
      updated.defenseModifier,
      updated.energyModifier,
      updated.damageModifier,
      updated.tickDamageMin ?? null,
      updated.tickDamageMax ?? null,
      updated.tickHealingMin ?? null,
      updated.tickHealingMax ?? null,
      updated.tickMessage || null,
      updated.silentTick,
      updated.wearOffMessage || null,
      updated.blocksRegen,
      updated.blocksMovement,
      updated.isBlind,
      id.toLowerCase(),
    ]
  );
  return result.rows[0] ? dbToDefinition(result.rows[0]) : null;
}

/**
 * Delete a status effect definition
 */
export async function deleteDefinition(id: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM status_effect_definitions WHERE id = $1',
    [id.toLowerCase()]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Check if a status effect definition exists
 */
export async function definitionExists(id: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM status_effect_definitions WHERE id = $1',
    [id.toLowerCase()]
  );
  return parseInt(result.rows[0].count) > 0;
}

// ============================================================================
// Export/Import Operations
// ============================================================================

/**
 * Export all definitions as JSON
 */
export async function exportDefinitions(): Promise<StatusEffectDefinition[]> {
  return getAllDefinitions();
}

/**
 * Import definitions from JSON (upsert) - wrapped in a transaction for atomicity
 */
export async function importDefinitions(definitions: StatusEffectDefinition[]): Promise<{ created: number; updated: number }> {
  return withTransaction(async (client: pg.PoolClient) => {
    let created = 0;
    let updated = 0;

    for (const def of definitions) {
      const normalizedId = def.id.toLowerCase();

      // Check if exists within transaction
      const existsResult = await client.query(
        'SELECT 1 FROM status_effect_definitions WHERE id = $1',
        [normalizedId]
      );
      const exists = existsResult.rows.length > 0;

      if (exists) {
        // Update within transaction
        await client.query(
          `UPDATE status_effect_definitions SET
            name = $1, description = $2, category = $3, stacking_behavior = $4, max_stacks = $5,
            accuracy_modifier = $6, defense_modifier = $7, energy_modifier = $8, damage_modifier = $9,
            tick_damage_min = $10, tick_damage_max = $11, tick_healing_min = $12, tick_healing_max = $13,
            tick_message = $14, silent_tick = $15, wear_off_message = $16,
            blocks_regen = $17, blocks_movement = $18, is_blind = $19, updated_at = NOW()
          WHERE id = $20`,
          [
            def.name,
            def.description || null,
            def.category,
            def.stackingBehavior,
            def.maxStacks ?? 1,
            def.accuracyModifier ?? 0,
            def.defenseModifier ?? 0,
            def.energyModifier ?? 0,
            def.damageModifier ?? 0,
            def.tickDamageMin ?? null,
            def.tickDamageMax ?? null,
            def.tickHealingMin ?? null,
            def.tickHealingMax ?? null,
            def.tickMessage || null,
            def.silentTick ?? false,
            def.wearOffMessage || null,
            def.blocksRegen ?? false,
            def.blocksMovement ?? false,
            def.isBlind ?? false,
            normalizedId,
          ]
        );
        updated++;
      } else {
        // Create within transaction
        await client.query(
          `INSERT INTO status_effect_definitions (
            id, name, description, category, stacking_behavior, max_stacks,
            accuracy_modifier, defense_modifier, energy_modifier, damage_modifier,
            tick_damage_min, tick_damage_max, tick_healing_min, tick_healing_max,
            tick_message, silent_tick, wear_off_message,
            blocks_regen, blocks_movement, is_blind
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            normalizedId,
            def.name,
            def.description || null,
            def.category,
            def.stackingBehavior,
            def.maxStacks ?? 1,
            def.accuracyModifier ?? 0,
            def.defenseModifier ?? 0,
            def.energyModifier ?? 0,
            def.damageModifier ?? 0,
            def.tickDamageMin ?? null,
            def.tickDamageMax ?? null,
            def.tickHealingMin ?? null,
            def.tickHealingMax ?? null,
            def.tickMessage || null,
            def.silentTick ?? false,
            def.wearOffMessage || null,
            def.blocksRegen ?? false,
            def.blocksMovement ?? false,
            def.isBlind ?? false,
          ]
        );
        created++;
      }
    }

    return { created, updated };
  });
}
