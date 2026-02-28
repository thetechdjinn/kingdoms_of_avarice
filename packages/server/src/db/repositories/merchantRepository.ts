import pg from 'pg';
import { query } from '../index.js';
import { MerchantInventoryEntry, ItemTemplate, ItemRarity } from '@koa/shared';

// Database row types
interface DbMerchantInventory {
  id: number;
  npc_template_id: number;
  item_template_id: number;
  max_stock: number;
  current_stock: number;
  restock_chance: number;
}

function dbToEntry(row: DbMerchantInventory): MerchantInventoryEntry {
  return {
    id: row.id,
    npcTemplateId: row.npc_template_id,
    itemTemplateId: row.item_template_id,
    maxStock: row.max_stock,
    currentStock: row.current_stock,
    restockChance: row.restock_chance,
  };
}

// ============================================================================
// Inventory CRUD
// ============================================================================

export async function getInventoryForTemplate(npcTemplateId: number): Promise<MerchantInventoryEntry[]> {
  const result = await query<DbMerchantInventory>(
    'SELECT * FROM merchant_inventory WHERE npc_template_id = $1 ORDER BY id',
    [npcTemplateId]
  );
  return result.rows.map(dbToEntry);
}

export async function getInventoryEntry(id: number): Promise<MerchantInventoryEntry | null> {
  const result = await query<DbMerchantInventory>(
    'SELECT * FROM merchant_inventory WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToEntry(result.rows[0]) : null;
}

export interface InventoryWithTemplate extends MerchantInventoryEntry {
  itemTemplate: ItemTemplate;
}

/**
 * Get inventory entries with their item template data for display in list/buy/sell.
 */
export async function getInventoryWithTemplates(npcTemplateId: number): Promise<InventoryWithTemplate[]> {
  const result = await query<DbMerchantInventory & {
    item_name: string;
    item_short_desc: string;
    item_long_desc: string | null;
    item_keywords: string[];
    item_weight: number;
    item_size: number;
    item_base_value: number;
    item_type: string;
    item_equipment_slot: string | null;
    item_flags: Record<string, unknown>;
    item_max_stack: number;
    item_weapon_data: unknown | null;
    item_armor_data: unknown | null;
    item_consumable_data: unknown | null;
    item_light_data: unknown | null;
    item_tool_data: unknown | null;
    item_requirements: unknown | null;
    item_stat_modifiers: unknown | null;
    item_stealth_modifier: number | null;
    item_effect_slots: number;
    item_base_effects: unknown | null;
    item_rarity: string | null;
    item_max_in_world: number | null;
  }>(
    `SELECT mi.*,
      it.name as item_name, it.short_desc as item_short_desc, it.long_desc as item_long_desc,
      it.keywords as item_keywords, it.weight as item_weight, it.size as item_size,
      it.base_value as item_base_value, it.item_type as item_type,
      it.equipment_slot as item_equipment_slot, it.flags as item_flags,
      it.max_stack as item_max_stack,
      it.weapon_data as item_weapon_data, it.armor_data as item_armor_data,
      it.consumable_data as item_consumable_data, it.light_data as item_light_data,
      it.tool_data as item_tool_data,
      it.requirements as item_requirements, it.stat_modifiers as item_stat_modifiers,
      it.stealth_modifier as item_stealth_modifier, it.effect_slots as item_effect_slots,
      it.base_effects as item_base_effects, it.rarity as item_rarity, it.max_in_world as item_max_in_world
     FROM merchant_inventory mi
     JOIN item_templates it ON mi.item_template_id = it.id
     WHERE mi.npc_template_id = $1
     ORDER BY it.name`,
    [npcTemplateId]
  );

  return result.rows.map(row => ({
    ...dbToEntry(row),
    itemTemplate: {
      id: row.item_template_id,
      name: row.item_name,
      short_desc: row.item_short_desc,
      long_desc: row.item_long_desc ?? undefined,
      keywords: row.item_keywords,
      weight: row.item_weight,
      size: row.item_size,
      base_value: row.item_base_value,
      item_type: row.item_type as ItemTemplate['item_type'],
      equipment_slot: row.item_equipment_slot as ItemTemplate['equipment_slot'],
      flags: row.item_flags as ItemTemplate['flags'],
      max_stack: row.item_max_stack,
      weapon_data: row.item_weapon_data as ItemTemplate['weapon_data'],
      armor_data: row.item_armor_data as ItemTemplate['armor_data'],
      consumable_data: row.item_consumable_data as ItemTemplate['consumable_data'],
      light_data: row.item_light_data as ItemTemplate['light_data'],
      tool_data: row.item_tool_data as ItemTemplate['tool_data'],
      requirements: row.item_requirements as ItemTemplate['requirements'],
      stat_modifiers: row.item_stat_modifiers as ItemTemplate['stat_modifiers'],
      stealth_modifier: row.item_stealth_modifier ?? undefined,
      effect_slots: row.item_effect_slots,
      base_effects: row.item_base_effects ?? undefined,
      rarity: (row.item_rarity as ItemRarity) ?? undefined,
      max_in_world: row.item_max_in_world ?? undefined,
    },
  }));
}

export interface CreateInventoryInput {
  npcTemplateId: number;
  itemTemplateId: number;
  maxStock?: number;
  currentStock?: number;
  restockChance?: number;
}

export async function createInventoryEntry(input: CreateInventoryInput): Promise<MerchantInventoryEntry> {
  const maxStock = input.maxStock ?? 10;
  const result = await query<DbMerchantInventory>(
    `INSERT INTO merchant_inventory (npc_template_id, item_template_id, max_stock, current_stock, restock_chance)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.npcTemplateId,
      input.itemTemplateId,
      maxStock,
      input.currentStock ?? maxStock,
      input.restockChance ?? 100,
    ]
  );
  return dbToEntry(result.rows[0]);
}

export async function updateInventoryEntry(
  id: number,
  updates: Partial<{ maxStock: number; currentStock: number; restockChance: number }>
): Promise<MerchantInventoryEntry | null> {
  const existing = await getInventoryEntry(id);
  if (!existing) return null;

  const result = await query<DbMerchantInventory>(
    `UPDATE merchant_inventory SET
      max_stock = COALESCE($1, max_stock),
      current_stock = COALESCE($2, current_stock),
      restock_chance = COALESCE($3, restock_chance)
    WHERE id = $4
    RETURNING *`,
    [
      updates.maxStock ?? null,
      updates.currentStock ?? null,
      updates.restockChance ?? null,
      id,
    ]
  );
  return result.rows[0] ? dbToEntry(result.rows[0]) : null;
}

export async function deleteInventoryEntry(id: number): Promise<boolean> {
  const result = await query('DELETE FROM merchant_inventory WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllInventoryForTemplate(npcTemplateId: number): Promise<number> {
  const result = await query(
    'DELETE FROM merchant_inventory WHERE npc_template_id = $1',
    [npcTemplateId]
  );
  return result.rowCount ?? 0;
}

// ============================================================================
// Stock Management
// ============================================================================

/**
 * Decrement stock by 1 for a merchant inventory entry.
 * Returns false if out of stock.
 */
export async function decrementStock(id: number, client?: pg.PoolClient): Promise<boolean> {
  const q = client ? client.query.bind(client) : (sql: string, params: unknown[]) => query(sql, params);
  const result = await q(
    `UPDATE merchant_inventory SET current_stock = current_stock - 1
     WHERE id = $1 AND current_stock > 0`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Increment stock by 1, up to max_stock.
 */
export async function incrementStock(id: number, client?: pg.PoolClient): Promise<boolean> {
  const result = await query(
    `UPDATE merchant_inventory SET current_stock = LEAST(current_stock + 1, max_stock)
     WHERE id = $1`,
    [id],
    client
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Find an inventory entry for a specific NPC template and item template.
 */
export async function findInventoryEntry(
  npcTemplateId: number,
  itemTemplateId: number,
  client?: pg.PoolClient
): Promise<MerchantInventoryEntry | null> {
  const result = await query<DbMerchantInventory>(
    'SELECT * FROM merchant_inventory WHERE npc_template_id = $1 AND item_template_id = $2',
    [npcTemplateId, itemTemplateId],
    client
  );
  return result.rows[0] ? dbToEntry(result.rows[0]) : null;
}

// ============================================================================
// Restock Logic
// ============================================================================

/**
 * Process hourly restock for all merchant inventories.
 * Common items auto-restock. Non-common items roll against restock_chance.
 */
export async function processRestock(): Promise<number> {
  // Auto-restock common rarity items to max
  await query(`
    UPDATE merchant_inventory mi
    SET current_stock = mi.max_stock
    FROM item_templates it
    WHERE mi.item_template_id = it.id
      AND mi.current_stock < mi.max_stock
      AND (it.rarity IS NULL OR it.rarity = 'common')
  `);

  // Roll for non-common items
  const nonCommonResult = await query<DbMerchantInventory & { rarity: string | null }>(
    `SELECT mi.*, it.rarity
     FROM merchant_inventory mi
     JOIN item_templates it ON mi.item_template_id = it.id
     WHERE mi.current_stock < mi.max_stock
       AND it.rarity IS NOT NULL
       AND it.rarity != 'common'`
  );

  let restocked = 0;
  for (const row of nonCommonResult.rows) {
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll <= row.restock_chance) {
      await query(
        `UPDATE merchant_inventory SET current_stock = LEAST(current_stock + 1, max_stock) WHERE id = $1`,
        [row.id]
      );
      restocked++;
    }
  }

  return restocked;
}

/**
 * Get all merchant template IDs (for NPC manager helpers).
 */
export async function getAllMerchantTemplateIds(): Promise<number[]> {
  const result = await query<{ id: number }>(
    `SELECT id FROM npcs WHERE merchant_enabled = true`
  );
  return result.rows.map(r => r.id);
}
