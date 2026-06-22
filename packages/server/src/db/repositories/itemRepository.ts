import type { DbClient } from '../index.js';
import { query, withTransaction } from '../index.js';
import { parseArrayColumn } from '../arrayColumn.js';
import {
  ItemTemplate,
  ItemInstance,
  ItemDisplay,
  ItemType,
  ItemLocationType,
  ItemCondition,
  EquipmentSlot,
  ItemFlags,
  ItemRarity,
  WeaponData,
  ArmorData,
  ConsumableData,
  LightData,
  ToolData,
  ItemRequirements,
  StatModifiers,
  ItemCustomData,
} from '@koa/shared';

// Common SELECT clause for template columns when joining with instances
const TEMPLATE_COLUMNS = `it.name, it.short_desc, it.long_desc, it.room_desc, it.keywords,
        it.weight, it.size, it.base_value, it.item_type, it.equipment_slot,
        it.flags, it.max_stack, it.container_capacity, it.container_weight_limit,
        it.weapon_data, it.armor_data, it.consumable_data, it.light_data, it.tool_data,
        it.requirements, it.stat_modifiers, it.stealth_modifier,
        it.spellcasting_modifier, it.lockpicking_modifier, it.perception_modifier,
        it.critical_chance_modifier, it.magic_resistance_modifier, it.trap_modifier,
        it.ac_modifier, it.damage_resistance_modifier, it.dodge_modifier,
        it.damage_modifier, it.energy_modifier, it.speed_modifier,
        it.defense_modifier, it.healing_modifier, it.vision_modifier,
        it.effect_slots, it.base_effects, it.rarity, it.max_in_world`;

// Database row types
interface DbItemTemplate {
  id: number;
  name: string;
  short_desc: string;
  long_desc: string | null;
  room_desc: string | null;
  keywords: string[];
  weight: number;
  size: number;
  base_value: number;
  item_type: string;
  equipment_slot: string | null;
  flags: ItemFlags;
  max_stack: number;
  container_capacity: number | null;
  container_weight_limit: number | null;
  weapon_data: WeaponData | null;
  armor_data: ArmorData | null;
  consumable_data: ConsumableData | null;
  light_data: LightData | null;
  tool_data: ToolData | null;
  requirements: ItemRequirements | null;
  stat_modifiers: StatModifiers | null;
  stealth_modifier: number | null;
  spellcasting_modifier: number | null;
  lockpicking_modifier: number | null;
  perception_modifier: number | null;
  critical_chance_modifier: number | null;
  magic_resistance_modifier: number | null;
  trap_modifier: number | null;
  ac_modifier: number | null;
  damage_resistance_modifier: number | null;
  dodge_modifier: number | null;
  damage_modifier: number | null;
  energy_modifier: number | null;
  speed_modifier: number | null;
  defense_modifier: number | null;
  healing_modifier: number | null;
  vision_modifier: number | null;
  effect_slots: number;
  base_effects: unknown | null;
  rarity: string | null;
  max_in_world: number | null;
  created_at: Date;
  updated_at: Date;
}

interface DbItemInstance {
  id: number;
  template_id: number;
  location_type: string;
  location_id: number;
  equipped_slot: string | null;
  quantity: number;
  condition: string;
  charges_remaining: number | null;
  fuel_remaining: number | null;
  is_lit: boolean;
  custom_data: ItemCustomData;
  created_at: Date;
  updated_at: Date;
}

// Convert database row to ItemTemplate
function dbToTemplate(row: DbItemTemplate): ItemTemplate {
  return {
    id: row.id,
    name: row.name,
    short_desc: row.short_desc,
    long_desc: row.long_desc ?? undefined,
    room_desc: row.room_desc ?? undefined,
    keywords: parseArrayColumn(row.keywords),
    weight: row.weight,
    size: row.size,
    base_value: row.base_value,
    item_type: row.item_type as ItemType,
    equipment_slot: row.equipment_slot as EquipmentSlot | undefined,
    flags: row.flags,
    max_stack: row.max_stack,
    container_capacity: row.container_capacity ?? undefined,
    container_weight_limit: row.container_weight_limit ?? undefined,
    weapon_data: row.weapon_data ?? undefined,
    armor_data: row.armor_data ?? undefined,
    consumable_data: row.consumable_data ?? undefined,
    light_data: row.light_data ?? undefined,
    tool_data: row.tool_data ?? undefined,
    requirements: row.requirements ?? undefined,
    stat_modifiers: row.stat_modifiers ?? undefined,
    stealth_modifier: row.stealth_modifier ?? undefined,
    spellcasting_modifier: row.spellcasting_modifier ?? undefined,
    lockpicking_modifier: row.lockpicking_modifier ?? undefined,
    perception_modifier: row.perception_modifier ?? undefined,
    critical_chance_modifier: row.critical_chance_modifier ?? undefined,
    magic_resistance_modifier: row.magic_resistance_modifier ?? undefined,
    trap_modifier: row.trap_modifier ?? undefined,
    ac_modifier: row.ac_modifier ?? undefined,
    damage_resistance_modifier: row.damage_resistance_modifier ?? undefined,
    dodge_modifier: row.dodge_modifier ?? undefined,
    damage_modifier: row.damage_modifier ?? undefined,
    energy_modifier: row.energy_modifier ?? undefined,
    speed_modifier: row.speed_modifier ?? undefined,
    defense_modifier: row.defense_modifier ?? undefined,
    healing_modifier: row.healing_modifier ?? undefined,
    vision_modifier: row.vision_modifier ?? undefined,
    effect_slots: row.effect_slots,
    base_effects: row.base_effects ?? undefined,
    rarity: (row.rarity as ItemRarity) ?? undefined,
    max_in_world: row.max_in_world ?? undefined,
  };
}

// Convert joined row to ItemTemplate (uses template_id from instance as the template's id)
function dbJoinedToTemplate(row: DbItemInstance & DbItemTemplate): ItemTemplate {
  return {
    id: row.template_id, // Use template_id since row.id is the instance id
    name: row.name,
    short_desc: row.short_desc,
    long_desc: row.long_desc ?? undefined,
    room_desc: row.room_desc ?? undefined,
    keywords: parseArrayColumn(row.keywords),
    weight: row.weight,
    size: row.size,
    base_value: row.base_value,
    item_type: row.item_type as ItemType,
    equipment_slot: row.equipment_slot as EquipmentSlot | undefined,
    flags: row.flags,
    max_stack: row.max_stack,
    container_capacity: row.container_capacity ?? undefined,
    container_weight_limit: row.container_weight_limit ?? undefined,
    weapon_data: row.weapon_data ?? undefined,
    armor_data: row.armor_data ?? undefined,
    consumable_data: row.consumable_data ?? undefined,
    light_data: row.light_data ?? undefined,
    tool_data: row.tool_data ?? undefined,
    requirements: row.requirements ?? undefined,
    stat_modifiers: row.stat_modifiers ?? undefined,
    stealth_modifier: row.stealth_modifier ?? undefined,
    spellcasting_modifier: row.spellcasting_modifier ?? undefined,
    lockpicking_modifier: row.lockpicking_modifier ?? undefined,
    perception_modifier: row.perception_modifier ?? undefined,
    critical_chance_modifier: row.critical_chance_modifier ?? undefined,
    magic_resistance_modifier: row.magic_resistance_modifier ?? undefined,
    trap_modifier: row.trap_modifier ?? undefined,
    ac_modifier: row.ac_modifier ?? undefined,
    damage_resistance_modifier: row.damage_resistance_modifier ?? undefined,
    dodge_modifier: row.dodge_modifier ?? undefined,
    damage_modifier: row.damage_modifier ?? undefined,
    energy_modifier: row.energy_modifier ?? undefined,
    speed_modifier: row.speed_modifier ?? undefined,
    defense_modifier: row.defense_modifier ?? undefined,
    healing_modifier: row.healing_modifier ?? undefined,
    vision_modifier: row.vision_modifier ?? undefined,
    effect_slots: row.effect_slots,
    base_effects: row.base_effects ?? undefined,
    rarity: (row.rarity as ItemRarity) ?? undefined,
    max_in_world: row.max_in_world ?? undefined,
  };
}

// Convert database row to ItemInstance
function dbToInstance(row: DbItemInstance, template?: ItemTemplate): ItemInstance {
  return {
    id: row.id,
    template_id: row.template_id,
    template,
    location_type: row.location_type as ItemLocationType,
    location_id: row.location_id,
    equipped_slot: row.equipped_slot as EquipmentSlot | undefined,
    quantity: row.quantity,
    condition: row.condition as ItemCondition,
    charges_remaining: row.charges_remaining ?? undefined,
    fuel_remaining: row.fuel_remaining ?? undefined,
    is_lit: row.is_lit || false,
    custom_data: row.custom_data,
  };
}

// ============================================================================
// Template Operations
// ============================================================================

export async function getTemplateById(id: number, client?: DbClient): Promise<ItemTemplate | null> {
  const result = await query<DbItemTemplate>(
    'SELECT * FROM item_templates WHERE id = $1',
    [id],
    client
  );
  return result.rows[0] ? dbToTemplate(result.rows[0]) : null;
}

export async function getAllTemplates(): Promise<ItemTemplate[]> {
  const result = await query<DbItemTemplate>(
    'SELECT * FROM item_templates ORDER BY id'
  );
  return result.rows.map(dbToTemplate);
}

export async function getTemplatesByType(itemType: ItemType): Promise<ItemTemplate[]> {
  const result = await query<DbItemTemplate>(
    'SELECT * FROM item_templates WHERE item_type = $1 ORDER BY id',
    [itemType]
  );
  return result.rows.map(dbToTemplate);
}

export interface CreateTemplateInput {
  name: string;
  short_desc: string;
  long_desc?: string;
  room_desc?: string;
  keywords: string[];
  weight?: number;
  size?: number;
  base_value?: number;
  item_type: ItemType;
  equipment_slot?: EquipmentSlot;
  flags?: ItemFlags;
  max_stack?: number;
  container_capacity?: number;
  container_weight_limit?: number;
  weapon_data?: WeaponData;
  armor_data?: ArmorData;
  consumable_data?: ConsumableData;
  light_data?: LightData;
  tool_data?: ToolData;
  requirements?: ItemRequirements;
  stat_modifiers?: StatModifiers;
  stealth_modifier?: number;
  spellcasting_modifier?: number;
  lockpicking_modifier?: number;
  perception_modifier?: number;
  critical_chance_modifier?: number;
  magic_resistance_modifier?: number;
  trap_modifier?: number;
  ac_modifier?: number;
  damage_resistance_modifier?: number;
  dodge_modifier?: number;
  damage_modifier?: number;
  energy_modifier?: number;
  speed_modifier?: number;
  defense_modifier?: number;
  healing_modifier?: number;
  vision_modifier?: number;
  effect_slots?: number;
  base_effects?: unknown;
  rarity?: ItemRarity;
  max_in_world?: number;
}

export async function createTemplate(input: CreateTemplateInput, client?: DbClient): Promise<ItemTemplate> {
  const result = await query<DbItemTemplate>(
    `INSERT INTO item_templates (
      name, short_desc, long_desc, room_desc, keywords,
      weight, size, base_value, item_type, equipment_slot,
      flags, max_stack, container_capacity, container_weight_limit,
      weapon_data, armor_data, consumable_data, light_data, tool_data,
      requirements, stat_modifiers, stealth_modifier,
      spellcasting_modifier, lockpicking_modifier, perception_modifier,
      critical_chance_modifier, magic_resistance_modifier, trap_modifier,
      ac_modifier, damage_resistance_modifier, dodge_modifier,
      damage_modifier, energy_modifier, speed_modifier,
      defense_modifier, healing_modifier, vision_modifier,
      effect_slots, base_effects, rarity, max_in_world
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18, $19,
      $20, $21, $22,
      $23, $24, $25, $26, $27, $28,
      $29, $30, $31, $32, $33, $34,
      $35, $36, $37,
      $38, $39, $40, $41
    ) RETURNING *`,
    [
      input.name,
      input.short_desc,
      input.long_desc ?? null,
      input.room_desc ?? null,
      input.keywords,
      input.weight ?? 0,
      input.size ?? 1,
      input.base_value ?? 0,
      input.item_type,
      input.equipment_slot ?? null,
      JSON.stringify(input.flags ?? {}),
      input.max_stack ?? 1,
      input.container_capacity ?? null,
      input.container_weight_limit ?? null,
      input.weapon_data ? JSON.stringify(input.weapon_data) : null,
      input.armor_data ? JSON.stringify(input.armor_data) : null,
      input.consumable_data ? JSON.stringify(input.consumable_data) : null,
      input.light_data ? JSON.stringify(input.light_data) : null,
      input.tool_data ? JSON.stringify(input.tool_data) : null,
      input.requirements ? JSON.stringify(input.requirements) : null,
      input.stat_modifiers ? JSON.stringify(input.stat_modifiers) : null,
      input.stealth_modifier ?? 0,
      input.spellcasting_modifier ?? 0,
      input.lockpicking_modifier ?? 0,
      input.perception_modifier ?? 0,
      input.critical_chance_modifier ?? 0,
      input.magic_resistance_modifier ?? 0,
      input.trap_modifier ?? 0,
      input.ac_modifier ?? 0,
      input.damage_resistance_modifier ?? 0,
      input.dodge_modifier ?? 0,
      input.damage_modifier ?? 0,
      input.energy_modifier ?? 0,
      input.speed_modifier ?? 0,
      input.defense_modifier ?? 0,
      input.healing_modifier ?? 0,
      input.vision_modifier ?? 0,
      input.effect_slots ?? 0,
      input.base_effects ? JSON.stringify(input.base_effects) : null,
      input.rarity ?? 'common',
      input.max_in_world ?? null,
    ],
    client
  );
  return dbToTemplate(result.rows[0]);
}

export async function deleteTemplate(id: number): Promise<boolean> {
  const result = await query('DELETE FROM item_templates WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getTemplateByName(name: string, client?: DbClient): Promise<ItemTemplate | null> {
  const result = await query<DbItemTemplate>(
    'SELECT * FROM item_templates WHERE LOWER(name) = LOWER($1)',
    [name],
    client
  );
  return result.rows[0] ? dbToTemplate(result.rows[0]) : null;
}

export async function updateTemplate(id: number, updates: Partial<CreateTemplateInput>, client?: DbClient): Promise<ItemTemplate | null> {
  const existing = await getTemplateById(id, client);
  if (!existing) return null;

  const result = await query<DbItemTemplate>(
    `UPDATE item_templates SET
      name = COALESCE($1, name),
      short_desc = COALESCE($2, short_desc),
      long_desc = COALESCE($3, long_desc),
      room_desc = COALESCE($4, room_desc),
      keywords = COALESCE($5, keywords),
      weight = COALESCE($6, weight),
      size = COALESCE($7, size),
      base_value = COALESCE($8, base_value),
      item_type = COALESCE($9, item_type),
      equipment_slot = COALESCE($10, equipment_slot),
      flags = COALESCE($11, flags),
      max_stack = COALESCE($12, max_stack),
      container_capacity = COALESCE($13, container_capacity),
      container_weight_limit = COALESCE($14, container_weight_limit),
      weapon_data = COALESCE($15, weapon_data),
      armor_data = COALESCE($16, armor_data),
      consumable_data = COALESCE($17, consumable_data),
      light_data = COALESCE($18, light_data),
      tool_data = COALESCE($19, tool_data),
      requirements = COALESCE($20, requirements),
      stat_modifiers = COALESCE($21, stat_modifiers),
      stealth_modifier = COALESCE($22, stealth_modifier),
      spellcasting_modifier = COALESCE($23, spellcasting_modifier),
      lockpicking_modifier = COALESCE($24, lockpicking_modifier),
      perception_modifier = COALESCE($25, perception_modifier),
      critical_chance_modifier = COALESCE($26, critical_chance_modifier),
      magic_resistance_modifier = COALESCE($27, magic_resistance_modifier),
      trap_modifier = COALESCE($28, trap_modifier),
      ac_modifier = COALESCE($29, ac_modifier),
      damage_resistance_modifier = COALESCE($30, damage_resistance_modifier),
      dodge_modifier = COALESCE($31, dodge_modifier),
      damage_modifier = COALESCE($32, damage_modifier),
      energy_modifier = COALESCE($33, energy_modifier),
      speed_modifier = COALESCE($34, speed_modifier),
      defense_modifier = COALESCE($35, defense_modifier),
      healing_modifier = COALESCE($36, healing_modifier),
      vision_modifier = COALESCE($37, vision_modifier),
      effect_slots = COALESCE($38, effect_slots),
      base_effects = COALESCE($39, base_effects),
      rarity = COALESCE($40, rarity),
      max_in_world = $41,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $42
    RETURNING *`,
    [
      updates.name ?? null,
      updates.short_desc ?? null,
      updates.long_desc ?? null,
      updates.room_desc ?? null,
      updates.keywords ?? null,
      updates.weight ?? null,
      updates.size ?? null,
      updates.base_value ?? null,
      updates.item_type ?? null,
      updates.equipment_slot ?? null,
      updates.flags ? JSON.stringify(updates.flags) : null,
      updates.max_stack ?? null,
      updates.container_capacity ?? null,
      updates.container_weight_limit ?? null,
      updates.weapon_data ? JSON.stringify(updates.weapon_data) : null,
      updates.armor_data ? JSON.stringify(updates.armor_data) : null,
      updates.consumable_data ? JSON.stringify(updates.consumable_data) : null,
      updates.light_data ? JSON.stringify(updates.light_data) : null,
      updates.tool_data ? JSON.stringify(updates.tool_data) : null,
      updates.requirements ? JSON.stringify(updates.requirements) : null,
      updates.stat_modifiers ? JSON.stringify(updates.stat_modifiers) : null,
      updates.stealth_modifier ?? null,
      updates.spellcasting_modifier ?? null,
      updates.lockpicking_modifier ?? null,
      updates.perception_modifier ?? null,
      updates.critical_chance_modifier ?? null,
      updates.magic_resistance_modifier ?? null,
      updates.trap_modifier ?? null,
      updates.ac_modifier ?? null,
      updates.damage_resistance_modifier ?? null,
      updates.dodge_modifier ?? null,
      updates.damage_modifier ?? null,
      updates.energy_modifier ?? null,
      updates.speed_modifier ?? null,
      updates.defense_modifier ?? null,
      updates.healing_modifier ?? null,
      updates.vision_modifier ?? null,
      updates.effect_slots ?? null,
      updates.base_effects ? JSON.stringify(updates.base_effects) : null,
      updates.rarity ?? null,
      updates.max_in_world !== undefined ? (updates.max_in_world ?? null) : existing.max_in_world ?? null,
      id,
    ],
    client
  );
  return result.rows[0] ? dbToTemplate(result.rows[0]) : null;
}

export async function getAllInstances(): Promise<ItemInstance[]> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     ORDER BY ii.id`
  );
  
  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

// ============================================================================
// Instance Operations
// ============================================================================

export async function getInstanceById(id: number): Promise<ItemInstance | null> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.id = $1`,
    [id]
  );
  
  if (!result.rows[0]) return null;
  
  const row = result.rows[0];
  const template = dbJoinedToTemplate(row);
  return dbToInstance(row as DbItemInstance, template);
}

export async function getInstancesInRoom(roomId: number): Promise<ItemInstance[]> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'room' AND ii.location_id = $1
     ORDER BY ii.id`,
    [roomId]
  );
  
  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

export async function getCharacterInventory(characterId: number): Promise<ItemInstance[]> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'player' AND ii.location_id = $1
     ORDER BY it.name`,
    [characterId]
  );

  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

/** @deprecated Use getCharacterInventory instead */
export const getPlayerInventory = getCharacterInventory;

export async function getCharacterEquipped(characterId: number): Promise<ItemInstance[]> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'equipped' AND ii.location_id = $1
     ORDER BY ii.equipped_slot`,
    [characterId]
  );

  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

/** @deprecated Use getCharacterEquipped instead */
export const getPlayerEquipped = getCharacterEquipped;

export interface CreateInstanceInput {
  template_id: number;
  location_type: ItemLocationType;
  location_id: number;
  equipped_slot?: EquipmentSlot;
  quantity?: number;
  condition?: ItemCondition;
  charges_remaining?: number;
  fuel_remaining?: number;
  is_lit?: boolean;
  custom_data?: ItemCustomData;
}

/**
 * Count all existing instances of an item template in the world.
 */
export async function countWorldInstances(templateId: number, client?: DbClient): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM item_instances WHERE template_id = $1',
    [templateId],
    client
  );
  return parseInt(result.rows[0].count, 10);
}

export async function createInstance(input: CreateInstanceInput, client?: DbClient): Promise<ItemInstance> {
  // Auto-initialize charges from template if not explicitly provided
  // Fuel stays null — it's initialized on first light (use command)
  const template = await getTemplateById(input.template_id, client);
  if (!template) {
    throw new Error(`Cannot create instance: template ${input.template_id} not found`);
  }
  const charges = input.charges_remaining
    ?? template.consumable_data?.charges
    ?? null;

  const result = await query<DbItemInstance>(
    `INSERT INTO item_instances (
      template_id, location_type, location_id, equipped_slot,
      quantity, condition, charges_remaining, fuel_remaining, is_lit, custom_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      input.template_id,
      input.location_type,
      input.location_id,
      input.equipped_slot ?? null,
      input.quantity ?? 1,
      input.condition ?? ItemCondition.PRISTINE,
      charges,
      input.fuel_remaining ?? null,
      input.is_lit ?? false,
      JSON.stringify(input.custom_data ?? {}),
    ],
    client
  );

  const instance = result.rows[0];
  return dbToInstance(instance, template ?? undefined);
}

export async function updateInstanceLocation(
  instanceId: number,
  locationType: ItemLocationType,
  locationId: number,
  equippedSlot?: EquipmentSlot,
  client?: DbClient
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances
     SET location_type = $1, location_id = $2, equipped_slot = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [locationType, locationId, equippedSlot ?? null, instanceId],
    client
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateInstanceQuantity(
  instanceId: number,
  quantity: number,
  client?: DbClient
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances
     SET quantity = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [quantity, instanceId],
    client
  );
  return (result.rowCount ?? 0) > 0;
}

// Find an existing stackable item instance at a location
export async function findStackableInstance(
  templateId: number,
  locationType: ItemLocationType,
  locationId: number,
  condition?: ItemCondition
): Promise<ItemInstance | null> {
  const params: (number | string)[] = [templateId, locationType, locationId];
  let conditionClause = '';
  
  if (condition) {
    conditionClause = 'AND ii.condition = $4';
    params.push(condition);
  }
  
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.template_id = $1
       AND ii.location_type = $2
       AND ii.location_id = $3
       AND it.flags->>'stackable' IN (1, 'true')
       AND (it.max_stack IS NULL OR it.max_stack <= 0 OR ii.quantity < it.max_stack)
       ${conditionClause}
     ORDER BY ii.id
     LIMIT 1`,
    params
  );
  
  if (!result.rows[0]) return null;
  
  const row = result.rows[0];
  const template = dbJoinedToTemplate(row);
  return dbToInstance(row as DbItemInstance, template);
}

// Add quantity to an existing instance (for stacking)
export async function addToInstanceQuantity(
  instanceId: number,
  addQuantity: number
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [addQuantity, instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteInstance(id: number, client?: DbClient): Promise<boolean> {
  const result = await query('DELETE FROM item_instances WHERE id = $1', [id], client);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Item Matching (for commands like "get sword")
// ============================================================================

export async function findItemsInRoomByKeyword(
  roomId: number,
  keyword: string
): Promise<ItemInstance[]> {
  const searchTerm = keyword.toLowerCase();
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'room' 
       AND ii.location_id = $1
       AND (
         LOWER(it.name) LIKE $2
         OR EXISTS (SELECT 1 FROM json_each(it.keywords) WHERE LOWER(value) LIKE $2)
       )
     ORDER BY ii.id`,
    [roomId, `${searchTerm}%`]
  );
  
  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

export async function findItemsInCharacterInventoryByKeyword(
  characterId: number,
  keyword: string
): Promise<ItemInstance[]> {
  const searchTerm = keyword.toLowerCase();
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'player'
       AND ii.location_id = $1
       AND (
         LOWER(it.name) LIKE $2
         OR EXISTS (SELECT 1 FROM json_each(it.keywords) WHERE LOWER(value) LIKE $2)
       )
     ORDER BY ii.id`,
    [characterId, `${searchTerm}%`]
  );

  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

/** @deprecated Use findItemsInCharacterInventoryByKeyword instead */
export const findItemsInInventoryByKeyword = findItemsInCharacterInventoryByKeyword;

// ============================================================================
// Display Helpers
// ============================================================================

export function instanceToDisplay(instance: ItemInstance): ItemDisplay {
  return {
    instance_id: instance.id,
    name: instance.template?.name ?? 'Unknown',
    short_desc: instance.template?.short_desc ?? 'an unknown item',
    room_desc: instance.template?.room_desc,
    quantity: instance.quantity,
    condition: instance.condition,
  };
}

export async function getRoomItemDisplays(roomId: number): Promise<ItemDisplay[]> {
  const instances = await getInstancesInRoom(roomId);
  return instances
    .filter(i => {
      // Hide items that are hidden AND not yet revealed
      if (i.template?.flags?.hidden && !i.custom_data?.revealed) {
        return false;
      }
      return true;
    })
    .map(instanceToDisplay);
}

export async function getInventoryDisplays(characterId: number): Promise<ItemDisplay[]> {
  const instances = await getCharacterInventory(characterId);
  return instances.map(instanceToDisplay);
}

// ============================================================================
// Container Operations
// ============================================================================

export async function getItemsInContainer(containerId: number): Promise<ItemInstance[]> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'container' AND ii.location_id = $1
     ORDER BY it.name`,
    [containerId]
  );
  
  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

export async function findItemsInContainerByKeyword(
  containerId: number,
  keyword: string
): Promise<ItemInstance[]> {
  const searchTerm = keyword.toLowerCase();
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'container' 
       AND ii.location_id = $1
       AND (
         LOWER(it.name) LIKE $2
         OR EXISTS (SELECT 1 FROM json_each(it.keywords) WHERE LOWER(value) LIKE $2)
       )
     ORDER BY ii.id`,
    [containerId, `${searchTerm}%`]
  );
  
  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

export async function getContainerWeight(containerId: number): Promise<number> {
  const items = await getItemsInContainer(containerId);
  return items.reduce((total, item) => {
    const itemWeight = (item.template?.weight ?? 0) * item.quantity;
    return total + itemWeight;
  }, 0);
}

export async function getContainerItemCount(containerId: number): Promise<number> {
  const items = await getItemsInContainer(containerId);
  return items.reduce((total, item) => total + item.quantity, 0);
}

export async function updateInstanceCharges(
  instanceId: number,
  charges: number
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET charges_remaining = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [charges, instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateInstanceFuel(
  instanceId: number,
  fuel: number
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET fuel_remaining = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [fuel, instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateInstanceLitState(
  instanceId: number,
  isLit: boolean
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances
     SET is_lit = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [isLit, instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateInstanceCondition(
  instanceId: number,
  condition: ItemCondition,
  client?: DbClient
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances
     SET condition = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [condition, instanceId],
    client
  );
  return (result.rowCount ?? 0) > 0;
}

// Condition order from best to worst
const CONDITION_ORDER: ItemCondition[] = [
  ItemCondition.PRISTINE,
  ItemCondition.GOOD,
  ItemCondition.WORN,
  ItemCondition.DAMAGED,
  ItemCondition.BROKEN,
];

// Get next worse condition
export function getWorseCondition(current: ItemCondition): ItemCondition | null {
  const currentIndex = CONDITION_ORDER.indexOf(current);
  if (currentIndex === -1) {
    return null; // Invalid condition
  }
  if (currentIndex < CONDITION_ORDER.length - 1) {
    return CONDITION_ORDER[currentIndex + 1];
  }
  return null; // Already broken
}

// Get next better condition (for repair)
export function getBetterCondition(current: ItemCondition): ItemCondition | null {
  const currentIndex = CONDITION_ORDER.indexOf(current);
  if (currentIndex === -1) {
    return null; // Invalid condition
  }
  if (currentIndex > 0) {
    return CONDITION_ORDER[currentIndex - 1];
  }
  return null; // Already pristine
}

// Find hidden items in room
export async function findHiddenItemsInRoom(roomId: number): Promise<ItemInstance[]> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'room' 
       AND ii.location_id = $1
       AND it.flags->>'hidden' IN (1, 'true')
     ORDER BY ii.id`,
    [roomId]
  );
  
  return result.rows.map(row => {
    const template = dbJoinedToTemplate(row);
    return dbToInstance(row as DbItemInstance, template);
  });
}

// Reveal a hidden item (update its flags in custom_data to mark as found)
export async function revealItem(instanceId: number): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET custom_data = json_patch(COALESCE(custom_data, '{}'), '{"revealed":true}'), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}

// Update custom_data for an item instance (for enchantments, etc.)
export async function updateInstanceCustomData(
  instanceId: number,
  customData: ItemCustomData,
  client?: DbClient
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances
     SET custom_data = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [JSON.stringify(customData), instanceId],
    client
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Stack Operations
// ============================================================================

/**
 * Atomically consume one item from a stack.
 * If quantity > 1, decrements by 1.
 * If quantity = 1, deletes the item.
 * Returns true if the item was consumed, false if item didn't exist.
 */
export async function consumeOneFromStack(instanceId: number): Promise<boolean> {
  return withTransaction(async (client) => {
    // First try to decrement if quantity > 1
    const updateResult = await client.query(
      `UPDATE item_instances
       SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND quantity > 1`,
      [instanceId]
    );

    if ((updateResult.rowCount ?? 0) > 0) {
      return true;
    }

    // If no rows updated, try to delete if quantity = 1
    const deleteResult = await client.query(
      `DELETE FROM item_instances WHERE id = $1 AND quantity = 1`,
      [instanceId]
    );

    return (deleteResult.rowCount ?? 0) > 0;
  });
}

// ============================================================================
// Lockpick Operations
// ============================================================================

/**
 * Find the best lockpick in a character's inventory (highest quality)
 * Returns null if no lockpicks found
 */
export async function findBestLockpickInInventory(characterId: number): Promise<ItemInstance | null> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'player'
       AND ii.location_id = $1
       AND it.item_type = 'tool'
       AND it.tool_data->>'toolType' = 'lockpick'
     ORDER BY CAST(it.tool_data->>'quality' AS INTEGER) DESC
     LIMIT 1`,
    [characterId]
  );

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  const template = dbJoinedToTemplate(row);
  return dbToInstance(row as DbItemInstance, template);
}

/**
 * Find a key with the specified key_tag in a character's inventory
 * Returns null if no matching key found
 */
export async function findKeyWithTag(characterId: number, keyTag: string): Promise<ItemInstance | null> {
  const result = await query<DbItemInstance & DbItemTemplate>(
    `SELECT ii.*, ${TEMPLATE_COLUMNS}
     FROM item_instances ii
     JOIN item_templates it ON ii.template_id = it.id
     WHERE ii.location_type = 'player'
       AND ii.location_id = $1
       AND it.flags->>'key_tag' = $2
     LIMIT 1`,
    [characterId, keyTag]
  );

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  const template = dbJoinedToTemplate(row);
  return dbToInstance(row as DbItemInstance, template);
}
