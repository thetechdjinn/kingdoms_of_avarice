// Item system types for Kingdoms of Avarice

// Item rarity levels
export enum ItemRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  LIMITED = 'limited',
  UNIQUE = 'unique',
  QUEST = 'quest',
}

// Equipment slot enum
export enum EquipmentSlot {
  // Armor slots
  HEAD = 'head',
  FACE = 'face',
  NECK = 'neck',
  BACK = 'back',
  BODY = 'body',
  ARMS = 'arms',
  HANDS = 'hands',
  WRIST_LEFT = 'wrist_left',
  WRIST_RIGHT = 'wrist_right',
  FINGER_LEFT = 'finger_left',
  FINGER_RIGHT = 'finger_right',
  WAIST = 'waist',
  LEGS = 'legs',
  FEET = 'feet',
  // Combat slots
  MAIN_HAND = 'main_hand',
  OFF_HAND = 'off_hand',
  HELD = 'held',
}

// Item type classification
export enum ItemType {
  WEAPON = 'weapon',
  ARMOR = 'armor',
  CONTAINER = 'container',
  CONSUMABLE = 'consumable',
  KEY = 'key',
  LIGHT = 'light',
  TOOL = 'tool',
  CURRENCY = 'currency',
  MISC = 'misc',
}

// Location types for item instances
export enum ItemLocationType {
  ROOM = 'room',
  PLAYER = 'player',
  EQUIPPED = 'equipped',
  CONTAINER = 'container',
  NPC = 'npc',
}

// Item condition
export enum ItemCondition {
  PRISTINE = 'pristine',
  GOOD = 'good',
  WORN = 'worn',
  DAMAGED = 'damaged',
  BROKEN = 'broken',
}

// Damage types
export enum DamageType {
  SLASHING = 'slashing',
  PIERCING = 'piercing',
  BLUDGEONING = 'bludgeoning',
  FIRE = 'fire',
  ICE = 'ice',
  LIGHTNING = 'lightning',
  POISON = 'poison',
  HOLY = 'holy',
  UNHOLY = 'unholy',
}

// Attack verbs for weapon combat messages
export interface AttackVerbs {
  hit: string;       // 1st person: "chop", "slash", "stab"
  miss: string;      // 1st person: "swing at", "thrust at"
  hit_3p: string;    // 3rd person: "chops", "slashes", "stabs"
  miss_3p: string;   // 3rd person: "swings at", "thrusts at"
}

// Default attack verbs by damage type
export const DEFAULT_ATTACK_VERBS: Record<DamageType, AttackVerbs> = {
  [DamageType.SLASHING]: { hit: 'slash', miss: 'swing at', hit_3p: 'slashes', miss_3p: 'swings at' },
  [DamageType.PIERCING]: { hit: 'stab', miss: 'thrust at', hit_3p: 'stabs', miss_3p: 'thrusts at' },
  [DamageType.BLUDGEONING]: { hit: 'smash', miss: 'swing at', hit_3p: 'smashes', miss_3p: 'swings at' },
  [DamageType.FIRE]: { hit: 'burn', miss: 'swing at', hit_3p: 'burns', miss_3p: 'swings at' },
  [DamageType.ICE]: { hit: 'freeze', miss: 'swing at', hit_3p: 'freezes', miss_3p: 'swings at' },
  [DamageType.LIGHTNING]: { hit: 'shock', miss: 'swing at', hit_3p: 'shocks', miss_3p: 'swings at' },
  [DamageType.POISON]: { hit: 'strike', miss: 'swing at', hit_3p: 'strikes', miss_3p: 'swings at' },
  [DamageType.HOLY]: { hit: 'smite', miss: 'swing at', hit_3p: 'smites', miss_3p: 'swings at' },
  [DamageType.UNHOLY]: { hit: 'curse', miss: 'swing at', hit_3p: 'curses', miss_3p: 'swings at' },
};

// Unarmed attack verbs
export const UNARMED_ATTACK_VERBS: AttackVerbs = {
  hit: 'punch', miss: 'swing at', hit_3p: 'punches', miss_3p: 'swings at'
};

// Item flags
export interface ItemFlags {
  takeable?: boolean;
  hidden?: boolean;
  no_drop?: boolean;
  stackable?: boolean;
  cursed?: boolean;
  two_handed?: boolean;
  throwable?: boolean;
  /** Tag that identifies this item as a key for doors with matching key_item_tag */
  key_tag?: string;
  /** If true, key is always consumed after successful use */
  consumeOnUse?: boolean;
  /** Percentage chance (1-100) that key breaks after use. Only checked if consumeOnUse is false */
  consumeChance?: number;
}

// Weapon data
export interface WeaponData {
  min_damage: number;
  max_damage: number;
  damage_type: DamageType;
  attack_speed?: number;
  crit_modifier?: number;
  range?: 'melee' | 'ranged' | 'thrown';
  skill_type?: string;
  attack_verbs?: AttackVerbs;
  allows_backstab?: boolean; // Whether this weapon can be used for backstab (default true for one-handed)
  backstab_accuracy?: number; // Bonus accuracy for backstab attacks
  backstab_min_damage_bonus?: number; // Bonus to backstab minimum damage
  backstab_max_damage_bonus?: number; // Bonus to backstab maximum damage
}

// Armor types (determines which classes can equip)
export type ArmorType = 'robe' | 'leather' | 'chainmail' | 'scalemail' | 'platemail';

// Armor data
export interface ArmorData {
  armor_class: number;
  damage_resistance?: number; // Flat damage reduction (the "/3" in "50/3" AC display)
  armor_type?: ArmorType;
  resistances?: Partial<Record<DamageType, number>>;
}

// Consumable data
export interface ConsumableData {
  charges?: number;
  effect_type: string;
  effect_value: number;
  duration?: number;
}

// Light source data
export interface LightData {
  vision_bonus: number;    // Vision points added when lit (e.g., torch: 100, lantern: 175)
  fuel_max?: number;       // Maximum fuel (e.g., torch: 180, lantern: 720)
  fuel_rate?: number;      // Fuel consumed per game tick (default 1)
}

// Tool data (lockpicks, etc.)
export interface ToolData {
  toolType: 'lockpick';
  quality: number;      // 1-5, adds to lockpicking skill
  durability: number;   // 1-101, break threshold (101+ = never break)
}

// Requirements to use/equip
export interface ItemRequirements {
  level?: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  constitution?: number;
  class?: string[];
  race?: string[];
}

// Stat modifiers when equipped
export interface StatModifiers {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  max_health?: number;
  max_mana?: number;
}

// Custom data for item instances (future extensibility)
export interface ItemCustomData {
  enchantments?: unknown[];
  glyphs?: unknown[];
  enhancements?: unknown[];
  custom_name?: string;
  creator?: string;
  bound_to?: number;
  revealed?: boolean; // For hidden items that have been found via search
}

// Item template (blueprint)
export interface ItemTemplate {
  id: number;
  name: string;              // The item name (e.g., "sparkling ruby", "iron sword")
  short_desc?: string;       // DEPRECATED - use name instead
  long_desc?: string;        // Detailed description shown when examining
  room_desc?: string;        // DEPRECATED - use name instead
  keywords: string[];
  weight: number;
  size: number;
  base_value: number;
  item_type: ItemType;
  equipment_slot?: EquipmentSlot;
  flags: ItemFlags;
  max_stack: number;
  container_capacity?: number;
  container_weight_limit?: number;
  weapon_data?: WeaponData;
  armor_data?: ArmorData;
  consumable_data?: ConsumableData;
  light_data?: LightData;
  tool_data?: ToolData;
  requirements?: ItemRequirements;
  stat_modifiers?: StatModifiers;
  stealth_modifier?: number;           // Bonus/penalty to stealth when equipped (negative for heavy armor)
  spellcasting_modifier?: number;      // Bonus/penalty to spellcasting ability
  lockpicking_modifier?: number;       // Bonus/penalty to lockpicking skill
  perception_modifier?: number;        // Bonus/penalty to perception (detect hidden)
  critical_chance_modifier?: number;    // Bonus/penalty to critical hit chance
  magic_resistance_modifier?: number;  // Bonus/penalty to magic resistance
  trap_modifier?: number;              // Bonus/penalty to trap detection/disarm
  effect_slots: number;
  base_effects?: unknown;
  rarity?: ItemRarity;        // Item rarity tier (default: common)
  max_in_world?: number;      // Maximum instances allowed in the world (undefined = unlimited)
}

// Item instance (actual object in game)
export interface ItemInstance {
  id: number;
  template_id: number;
  template?: ItemTemplate;
  location_type: ItemLocationType;
  location_id: number;
  equipped_slot?: EquipmentSlot;
  quantity: number;
  condition: ItemCondition;
  charges_remaining?: number;
  fuel_remaining?: number;
  is_lit: boolean;
  custom_data: ItemCustomData;
}

// Simplified item for room/inventory display
export interface ItemDisplay {
  instance_id: number;
  name: string;
  short_desc: string;
  room_desc?: string;
  quantity: number;
  condition: ItemCondition;
}

// Helper to get display name with quantity
export function getItemDisplayName(item: ItemDisplay): string {
  if (item.quantity > 1) {
    return `${item.short_desc} (x${item.quantity})`;
  }
  return item.short_desc;
}

// Helper to check if a slot is a paired slot (wrists, fingers)
export function isPairedSlot(slot: EquipmentSlot): boolean {
  return [
    EquipmentSlot.WRIST_LEFT,
    EquipmentSlot.WRIST_RIGHT,
    EquipmentSlot.FINGER_LEFT,
    EquipmentSlot.FINGER_RIGHT,
  ].includes(slot);
}

// Helper to get the alternate paired slot
export function getAlternatePairedSlot(slot: EquipmentSlot): EquipmentSlot | null {
  switch (slot) {
    case EquipmentSlot.WRIST_LEFT:
      return EquipmentSlot.WRIST_RIGHT;
    case EquipmentSlot.WRIST_RIGHT:
      return EquipmentSlot.WRIST_LEFT;
    case EquipmentSlot.FINGER_LEFT:
      return EquipmentSlot.FINGER_RIGHT;
    case EquipmentSlot.FINGER_RIGHT:
      return EquipmentSlot.FINGER_LEFT;
    default:
      return null;
  }
}

// Slots blocked by two-handed weapons
export const TWO_HANDED_BLOCKED_SLOTS = [
  EquipmentSlot.OFF_HAND,
  EquipmentSlot.HELD,
];

// ============================================================================
// CRAFTING SYSTEM
// ============================================================================

// Crafting skill types
export enum CraftingSkill {
  BLACKSMITHING = 'blacksmithing',
  ALCHEMY = 'alchemy',
  TAILORING = 'tailoring',
  LEATHERWORKING = 'leatherworking',
  WOODWORKING = 'woodworking',
  JEWELCRAFTING = 'jewelcrafting',
}

// Ingredient for a recipe
export interface RecipeIngredient {
  template_id: number;
  quantity: number;
}

// Crafting recipe
export interface CraftingRecipe {
  id: number;
  result_template_id: number;
  result_quantity: number;
  name: string;
  description?: string;
  skill_type?: CraftingSkill;
  skill_level: number;
  ingredients: RecipeIngredient[];
  tools_required?: number[]; // template_ids
}

// ============================================================================
// ENCHANTING SYSTEM
// ============================================================================

// Enchantment definition
export interface Enchantment {
  id: number;
  name: string;
  description?: string;
  skill_type: string;
  skill_level: number;
  applicable_types: ItemType[];
  stat_modifiers?: StatModifiers;
  special_effects?: EnchantmentEffect[];
  mana_cost: number;
  reagents?: RecipeIngredient[];
}

// Special enchantment effects
export interface EnchantmentEffect {
  type: string; // 'fire_damage', 'lifesteal', 'speed', etc.
  value: number;
  chance?: number; // proc chance (0-100)
  duration?: number; // for timed effects
}

// Applied enchantment on an item instance
export interface AppliedEnchantment {
  enchantment_id: number;
  name: string;
  stat_modifiers?: StatModifiers;
  special_effects?: EnchantmentEffect[];
}
