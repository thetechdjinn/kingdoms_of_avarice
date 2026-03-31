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
  speed_modifier: number;
  armor_class_modifier: number;
  damage_reduction_modifier: number;
  critical_chance_modifier: number;
  dodge_modifier: number;
  magic_resistance: number;
  healing_received: number;
  perception_modifier: number;
  stealth_modifier: number;
  spellcasting_modifier: number;
  lockpicking_modifier: number;
  strength_modifier: number;
  dexterity_modifier: number;
  constitution_modifier: number;
  intelligence_modifier: number;
  wisdom_modifier: number;
  charisma_modifier: number;
  max_hp_modifier: number;
  max_mana_modifier: number;
  vision_modifier: number;
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
  blocks_casting: boolean;
  blocks_combat: boolean;
  blocks_stealth: boolean;
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
    speedModifier: row.speed_modifier,
    armorClassModifier: row.armor_class_modifier,
    damageReductionModifier: row.damage_reduction_modifier,
    criticalChanceModifier: row.critical_chance_modifier,
    dodgeModifier: row.dodge_modifier,
    magicResistance: row.magic_resistance,
    healingReceived: row.healing_received,
    perceptionModifier: row.perception_modifier,
    stealthModifier: row.stealth_modifier,
    spellcastingModifier: row.spellcasting_modifier,
    lockpickingModifier: row.lockpicking_modifier,
    strengthModifier: row.strength_modifier,
    dexterityModifier: row.dexterity_modifier,
    constitutionModifier: row.constitution_modifier,
    intelligenceModifier: row.intelligence_modifier,
    wisdomModifier: row.wisdom_modifier,
    charismaModifier: row.charisma_modifier,
    maxHpModifier: row.max_hp_modifier,
    maxManaModifier: row.max_mana_modifier,
    visionModifier: row.vision_modifier,
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
    blocksCasting: row.blocks_casting,
    blocksCombat: row.blocks_combat,
    blocksStealth: row.blocks_stealth,
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
  speedModifier?: number;
  armorClassModifier?: number;
  damageReductionModifier?: number;
  criticalChanceModifier?: number;
  dodgeModifier?: number;
  magicResistance?: number;
  healingReceived?: number;
  perceptionModifier?: number;
  stealthModifier?: number;
  spellcastingModifier?: number;
  lockpickingModifier?: number;
  strengthModifier?: number;
  dexterityModifier?: number;
  constitutionModifier?: number;
  intelligenceModifier?: number;
  wisdomModifier?: number;
  charismaModifier?: number;
  maxHpModifier?: number;
  maxManaModifier?: number;
  visionModifier?: number;
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
  blocksCasting?: boolean;
  blocksCombat?: boolean;
  blocksStealth?: boolean;
}

/**
 * Create a new status effect definition
 */
export async function createDefinition(input: CreateDefinitionInput): Promise<StatusEffectDefinition> {
  const result = await query<DbStatusEffectDefinition>(
    `INSERT INTO status_effect_definitions (
      id, name, description, category, stacking_behavior, max_stacks,
      accuracy_modifier, defense_modifier, energy_modifier, damage_modifier, speed_modifier,
      armor_class_modifier, damage_reduction_modifier,
      critical_chance_modifier, dodge_modifier, magic_resistance, healing_received,
      perception_modifier, stealth_modifier, spellcasting_modifier, lockpicking_modifier,
      strength_modifier, dexterity_modifier, constitution_modifier,
      intelligence_modifier, wisdom_modifier, charisma_modifier,
      max_hp_modifier, max_mana_modifier, vision_modifier,
      tick_damage_min, tick_damage_max, tick_healing_min, tick_healing_max,
      tick_message, silent_tick, wear_off_message,
      blocks_regen, blocks_movement, is_blind, blocks_casting, blocks_combat, blocks_stealth
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43)
    RETURNING *`,
    [
      input.id.toLowerCase(), input.name, input.description || null,
      input.category, input.stackingBehavior, input.maxStacks ?? 1,
      input.accuracyModifier ?? 0, input.defenseModifier ?? 0,
      input.energyModifier ?? 0, input.damageModifier ?? 0, input.speedModifier ?? 0,
      input.armorClassModifier ?? 0, input.damageReductionModifier ?? 0,
      input.criticalChanceModifier ?? 0, input.dodgeModifier ?? 0,
      input.magicResistance ?? 0, input.healingReceived ?? 0,
      input.perceptionModifier ?? 0, input.stealthModifier ?? 0,
      input.spellcastingModifier ?? 0, input.lockpickingModifier ?? 0,
      input.strengthModifier ?? 0, input.dexterityModifier ?? 0, input.constitutionModifier ?? 0,
      input.intelligenceModifier ?? 0, input.wisdomModifier ?? 0, input.charismaModifier ?? 0,
      input.maxHpModifier ?? 0, input.maxManaModifier ?? 0, input.visionModifier ?? 0,
      input.tickDamageMin ?? null, input.tickDamageMax ?? null,
      input.tickHealingMin ?? null, input.tickHealingMax ?? null,
      input.tickMessage || null, input.silentTick ?? false, input.wearOffMessage || null,
      input.blocksRegen ?? false, input.blocksMovement ?? false, input.isBlind ?? false,
      input.blocksCasting ?? false, input.blocksCombat ?? false, input.blocksStealth ?? false,
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

  // Merge input with existing values — use ?? for numbers (0 is valid), !== undefined for nullable
  const u = {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    stackingBehavior: input.stackingBehavior ?? existing.stackingBehavior,
    maxStacks: input.maxStacks ?? existing.maxStacks,
    accuracyModifier: input.accuracyModifier ?? existing.accuracyModifier,
    defenseModifier: input.defenseModifier ?? existing.defenseModifier,
    energyModifier: input.energyModifier ?? existing.energyModifier,
    damageModifier: input.damageModifier ?? existing.damageModifier,
    speedModifier: input.speedModifier ?? existing.speedModifier,
    armorClassModifier: input.armorClassModifier ?? existing.armorClassModifier,
    damageReductionModifier: input.damageReductionModifier ?? existing.damageReductionModifier,
    criticalChanceModifier: input.criticalChanceModifier ?? existing.criticalChanceModifier,
    dodgeModifier: input.dodgeModifier ?? existing.dodgeModifier,
    magicResistance: input.magicResistance ?? existing.magicResistance,
    healingReceived: input.healingReceived ?? existing.healingReceived,
    perceptionModifier: input.perceptionModifier ?? existing.perceptionModifier,
    stealthModifier: input.stealthModifier ?? existing.stealthModifier,
    spellcastingModifier: input.spellcastingModifier ?? existing.spellcastingModifier,
    lockpickingModifier: input.lockpickingModifier ?? existing.lockpickingModifier,
    strengthModifier: input.strengthModifier ?? existing.strengthModifier,
    dexterityModifier: input.dexterityModifier ?? existing.dexterityModifier,
    constitutionModifier: input.constitutionModifier ?? existing.constitutionModifier,
    intelligenceModifier: input.intelligenceModifier ?? existing.intelligenceModifier,
    wisdomModifier: input.wisdomModifier ?? existing.wisdomModifier,
    charismaModifier: input.charismaModifier ?? existing.charismaModifier,
    maxHpModifier: input.maxHpModifier ?? existing.maxHpModifier,
    maxManaModifier: input.maxManaModifier ?? existing.maxManaModifier,
    visionModifier: input.visionModifier ?? existing.visionModifier,
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
    blocksCasting: input.blocksCasting !== undefined ? input.blocksCasting : existing.blocksCasting,
    blocksCombat: input.blocksCombat !== undefined ? input.blocksCombat : existing.blocksCombat,
    blocksStealth: input.blocksStealth !== undefined ? input.blocksStealth : existing.blocksStealth,
  };

  const result = await query<DbStatusEffectDefinition>(
    `UPDATE status_effect_definitions SET
      name=$1, description=$2, category=$3, stacking_behavior=$4, max_stacks=$5,
      accuracy_modifier=$6, defense_modifier=$7, energy_modifier=$8, damage_modifier=$9, speed_modifier=$10,
      armor_class_modifier=$11, damage_reduction_modifier=$12,
      critical_chance_modifier=$13, dodge_modifier=$14, magic_resistance=$15, healing_received=$16,
      perception_modifier=$17, stealth_modifier=$18, spellcasting_modifier=$19, lockpicking_modifier=$20,
      strength_modifier=$21, dexterity_modifier=$22, constitution_modifier=$23,
      intelligence_modifier=$24, wisdom_modifier=$25, charisma_modifier=$26,
      max_hp_modifier=$27, max_mana_modifier=$28, vision_modifier=$29,
      tick_damage_min=$30, tick_damage_max=$31, tick_healing_min=$32, tick_healing_max=$33,
      tick_message=$34, silent_tick=$35, wear_off_message=$36,
      blocks_regen=$37, blocks_movement=$38, is_blind=$39,
      blocks_casting=$40, blocks_combat=$41, blocks_stealth=$42, updated_at=NOW()
    WHERE id = $43
    RETURNING *`,
    [
      u.name, u.description || null, u.category, u.stackingBehavior, u.maxStacks,
      u.accuracyModifier, u.defenseModifier, u.energyModifier, u.damageModifier, u.speedModifier,
      u.armorClassModifier, u.damageReductionModifier,
      u.criticalChanceModifier, u.dodgeModifier, u.magicResistance, u.healingReceived,
      u.perceptionModifier, u.stealthModifier, u.spellcastingModifier, u.lockpickingModifier,
      u.strengthModifier, u.dexterityModifier, u.constitutionModifier,
      u.intelligenceModifier, u.wisdomModifier, u.charismaModifier,
      u.maxHpModifier, u.maxManaModifier, u.visionModifier,
      u.tickDamageMin ?? null, u.tickDamageMax ?? null, u.tickHealingMin ?? null, u.tickHealingMax ?? null,
      u.tickMessage || null, u.silentTick, u.wearOffMessage || null,
      u.blocksRegen, u.blocksMovement, u.isBlind,
      u.blocksCasting, u.blocksCombat, u.blocksStealth,
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
            speed_modifier = $10,
            armor_class_modifier = $11, damage_reduction_modifier = $12,
            critical_chance_modifier = $13, dodge_modifier = $14,
            magic_resistance = $15, healing_received = $16,
            perception_modifier = $17, stealth_modifier = $18, spellcasting_modifier = $19, lockpicking_modifier = $20,
            strength_modifier = $21, dexterity_modifier = $22, constitution_modifier = $23,
            intelligence_modifier = $24, wisdom_modifier = $25, charisma_modifier = $26,
            max_hp_modifier = $27, max_mana_modifier = $28, vision_modifier = $29,
            tick_damage_min = $30, tick_damage_max = $31, tick_healing_min = $32, tick_healing_max = $33,
            tick_message = $34, silent_tick = $35, wear_off_message = $36,
            blocks_regen = $37, blocks_movement = $38, is_blind = $39,
            blocks_casting = $40, blocks_combat = $41, blocks_stealth = $42, updated_at = NOW()
          WHERE id = $43`,
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
            def.speedModifier ?? 0,
            def.armorClassModifier ?? 0,
            def.damageReductionModifier ?? 0,
            def.criticalChanceModifier ?? 0,
            def.dodgeModifier ?? 0,
            def.magicResistance ?? 0,
            def.healingReceived ?? 0,
            def.perceptionModifier ?? 0,
            def.stealthModifier ?? 0,
            def.spellcastingModifier ?? 0,
            def.lockpickingModifier ?? 0,
            def.strengthModifier ?? 0,
            def.dexterityModifier ?? 0,
            def.constitutionModifier ?? 0,
            def.intelligenceModifier ?? 0,
            def.wisdomModifier ?? 0,
            def.charismaModifier ?? 0,
            def.maxHpModifier ?? 0,
            def.maxManaModifier ?? 0,
            def.visionModifier ?? 0,
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
            def.blocksCasting ?? false,
            def.blocksCombat ?? false,
            def.blocksStealth ?? false,
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
            speed_modifier,
            armor_class_modifier, damage_reduction_modifier,
            critical_chance_modifier, dodge_modifier,
            magic_resistance, healing_received,
            perception_modifier, stealth_modifier, spellcasting_modifier, lockpicking_modifier,
            strength_modifier, dexterity_modifier, constitution_modifier,
            intelligence_modifier, wisdom_modifier, charisma_modifier,
            max_hp_modifier, max_mana_modifier, vision_modifier,
            tick_damage_min, tick_damage_max, tick_healing_min, tick_healing_max,
            tick_message, silent_tick, wear_off_message,
            blocks_regen, blocks_movement, is_blind,
            blocks_casting, blocks_combat, blocks_stealth
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43)`,
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
            def.speedModifier ?? 0,
            def.armorClassModifier ?? 0,
            def.damageReductionModifier ?? 0,
            def.criticalChanceModifier ?? 0,
            def.dodgeModifier ?? 0,
            def.magicResistance ?? 0,
            def.healingReceived ?? 0,
            def.perceptionModifier ?? 0,
            def.stealthModifier ?? 0,
            def.spellcastingModifier ?? 0,
            def.lockpickingModifier ?? 0,
            def.strengthModifier ?? 0,
            def.dexterityModifier ?? 0,
            def.constitutionModifier ?? 0,
            def.intelligenceModifier ?? 0,
            def.wisdomModifier ?? 0,
            def.charismaModifier ?? 0,
            def.maxHpModifier ?? 0,
            def.maxManaModifier ?? 0,
            def.visionModifier ?? 0,
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
            def.blocksCasting ?? false,
            def.blocksCombat ?? false,
            def.blocksStealth ?? false,
          ]
        );
        created++;
      }
    }

    return { created, updated };
  });
}
