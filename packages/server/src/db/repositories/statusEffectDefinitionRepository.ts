import { query } from '../index.js';
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
  tick_damage: string | null;
  tick_healing: string | null;
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
    tickDamage: row.tick_damage ?? undefined,
    tickHealing: row.tick_healing ?? undefined,
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
  tickDamage?: string;
  tickHealing?: string;
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
      tick_damage, tick_healing, tick_message, silent_tick, wear_off_message,
      blocks_regen, blocks_movement, is_blind
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
      input.tickDamage || null,
      input.tickHealing || null,
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
    tickDamage: input.tickDamage !== undefined ? input.tickDamage : existing.tickDamage,
    tickHealing: input.tickHealing !== undefined ? input.tickHealing : existing.tickHealing,
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
      tick_damage = $10, tick_healing = $11, tick_message = $12, silent_tick = $13, wear_off_message = $14,
      blocks_regen = $15, blocks_movement = $16, is_blind = $17, updated_at = NOW()
    WHERE id = $18
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
      updated.tickDamage || null,
      updated.tickHealing || null,
      updated.tickMessage || null,
      updated.silentTick,
      updated.wearOffMessage || null,
      updated.blocksRegen,
      updated.blocksMovement,
      updated.isBlind,
      id,
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
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Check if a status effect definition exists
 */
export async function definitionExists(id: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM status_effect_definitions WHERE id = $1',
    [id]
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
 * Import definitions from JSON (upsert)
 */
export async function importDefinitions(definitions: StatusEffectDefinition[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const def of definitions) {
    const exists = await definitionExists(def.id);
    if (exists) {
      await updateDefinition(def.id, def);
      updated++;
    } else {
      await createDefinition({
        id: def.id,
        name: def.name,
        description: def.description,
        category: def.category,
        stackingBehavior: def.stackingBehavior,
        maxStacks: def.maxStacks,
        accuracyModifier: def.accuracyModifier,
        defenseModifier: def.defenseModifier,
        energyModifier: def.energyModifier,
        damageModifier: def.damageModifier,
        tickDamage: def.tickDamage,
        tickHealing: def.tickHealing,
        tickMessage: def.tickMessage,
        silentTick: def.silentTick,
        wearOffMessage: def.wearOffMessage,
        blocksRegen: def.blocksRegen,
        blocksMovement: def.blocksMovement,
        isBlind: def.isBlind,
      });
      created++;
    }
  }

  return { created, updated };
}
