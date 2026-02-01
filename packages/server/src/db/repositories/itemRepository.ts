import { query } from '../index.js';
import {
  ItemTemplate,
  ItemInstance,
  ItemDisplay,
  ItemType,
  ItemLocationType,
  ItemCondition,
  EquipmentSlot,
  ItemFlags,
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
        it.requirements, it.stat_modifiers, it.stealth_modifier, it.effect_slots, it.base_effects`;

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
  effect_slots: number;
  base_effects: unknown | null;
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
    keywords: row.keywords,
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
    effect_slots: row.effect_slots,
    base_effects: row.base_effects ?? undefined,
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
    keywords: row.keywords,
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
    effect_slots: row.effect_slots,
    base_effects: row.base_effects ?? undefined,
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
    custom_data: row.custom_data,
  };
}

// ============================================================================
// Template Operations
// ============================================================================

export async function getTemplateById(id: number): Promise<ItemTemplate | null> {
  const result = await query<DbItemTemplate>(
    'SELECT * FROM item_templates WHERE id = $1',
    [id]
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
  effect_slots?: number;
  base_effects?: unknown;
}

export async function createTemplate(input: CreateTemplateInput): Promise<ItemTemplate> {
  const result = await query<DbItemTemplate>(
    `INSERT INTO item_templates (
      name, short_desc, long_desc, room_desc, keywords,
      weight, size, base_value, item_type, equipment_slot,
      flags, max_stack, container_capacity, container_weight_limit,
      weapon_data, armor_data, consumable_data, light_data, tool_data,
      requirements, stat_modifiers, stealth_modifier, effect_slots, base_effects
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24
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
      input.effect_slots ?? 0,
      input.base_effects ? JSON.stringify(input.base_effects) : null,
    ]
  );
  return dbToTemplate(result.rows[0]);
}

export async function deleteTemplate(id: number): Promise<boolean> {
  const result = await query('DELETE FROM item_templates WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getTemplateByName(name: string): Promise<ItemTemplate | null> {
  const result = await query<DbItemTemplate>(
    'SELECT * FROM item_templates WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0] ? dbToTemplate(result.rows[0]) : null;
}

export async function updateTemplate(id: number, updates: Partial<CreateTemplateInput>): Promise<ItemTemplate | null> {
  const existing = await getTemplateById(id);
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
      effect_slots = COALESCE($23, effect_slots),
      base_effects = COALESCE($24, base_effects),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $25
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
      updates.effect_slots ?? null,
      updates.base_effects ? JSON.stringify(updates.base_effects) : null,
      id,
    ]
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
  custom_data?: ItemCustomData;
}

export async function createInstance(input: CreateInstanceInput): Promise<ItemInstance> {
  const result = await query<DbItemInstance>(
    `INSERT INTO item_instances (
      template_id, location_type, location_id, equipped_slot,
      quantity, condition, charges_remaining, fuel_remaining, custom_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      input.template_id,
      input.location_type,
      input.location_id,
      input.equipped_slot ?? null,
      input.quantity ?? 1,
      input.condition ?? ItemCondition.PRISTINE,
      input.charges_remaining ?? null,
      input.fuel_remaining ?? null,
      JSON.stringify(input.custom_data ?? {}),
    ]
  );
  
  const instance = result.rows[0];
  const template = await getTemplateById(instance.template_id);
  return dbToInstance(instance, template ?? undefined);
}

export async function updateInstanceLocation(
  instanceId: number,
  locationType: ItemLocationType,
  locationId: number,
  equippedSlot?: EquipmentSlot
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET location_type = $1, location_id = $2, equipped_slot = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [locationType, locationId, equippedSlot ?? null, instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateInstanceQuantity(
  instanceId: number,
  quantity: number
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET quantity = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [quantity, instanceId]
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
       AND (it.flags->>'stackable')::boolean = true
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

export async function deleteInstance(id: number): Promise<boolean> {
  const result = await query('DELETE FROM item_instances WHERE id = $1', [id]);
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
         OR EXISTS (SELECT 1 FROM unnest(it.keywords) kw WHERE LOWER(kw) LIKE $2)
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
         OR EXISTS (SELECT 1 FROM unnest(it.keywords) kw WHERE LOWER(kw) LIKE $2)
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
         OR EXISTS (SELECT 1 FROM unnest(it.keywords) kw WHERE LOWER(kw) LIKE $2)
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

export async function updateInstanceCondition(
  instanceId: number,
  condition: ItemCondition
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET condition = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [condition, instanceId]
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
       AND (it.flags->>'hidden')::boolean = true
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
     SET custom_data = COALESCE(custom_data, '{}'::jsonb) || '{"revealed": true}'::jsonb, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}

// Update custom_data for an item instance (for enchantments, etc.)
export async function updateInstanceCustomData(
  instanceId: number,
  customData: ItemCustomData
): Promise<boolean> {
  const result = await query(
    `UPDATE item_instances 
     SET custom_data = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [JSON.stringify(customData), instanceId]
  );
  return (result.rowCount ?? 0) > 0;
}
