import { query } from '../index.js';
import { parseArrayColumn } from '../arrayColumn.js';
import {
  CraftingRecipe,
  RecipeIngredient,
  CraftingSkill,
  Enchantment,
  EnchantmentEffect,
  StatModifiers,
  ItemType,
  AppliedEnchantment,
} from '@koa/shared';

// ============================================================================
// Database Row Types
// ============================================================================

interface DbCraftingRecipe {
  id: number;
  result_template_id: number;
  result_quantity: number;
  name: string;
  description: string | null;
  skill_type: string | null;
  skill_level: number;
  ingredients: RecipeIngredient[];
  tools_required: number[] | null;
  created_at: Date;
}

interface DbEnchantment {
  id: number;
  name: string;
  description: string | null;
  skill_type: string;
  skill_level: number;
  applicable_types: string[];
  stat_modifiers: StatModifiers | null;
  special_effects: EnchantmentEffect[] | null;
  mana_cost: number;
  reagents: RecipeIngredient[] | null;
  created_at: Date;
}

// ============================================================================
// Conversion Functions
// ============================================================================

function dbToRecipe(row: DbCraftingRecipe): CraftingRecipe {
  return {
    id: row.id,
    result_template_id: row.result_template_id,
    result_quantity: row.result_quantity,
    name: row.name,
    description: row.description ?? undefined,
    skill_type: row.skill_type as CraftingSkill | undefined,
    skill_level: row.skill_level,
    ingredients: row.ingredients,
    tools_required: row.tools_required ?? undefined,
  };
}

function dbToEnchantment(row: DbEnchantment): Enchantment {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    skill_type: row.skill_type,
    skill_level: row.skill_level,
    applicable_types: parseArrayColumn<ItemType>(row.applicable_types),
    stat_modifiers: row.stat_modifiers ?? undefined,
    special_effects: row.special_effects ?? undefined,
    mana_cost: row.mana_cost,
    reagents: row.reagents ?? undefined,
  };
}

// ============================================================================
// Recipe Operations
// ============================================================================

export async function getRecipeById(id: number): Promise<CraftingRecipe | null> {
  const result = await query<DbCraftingRecipe>(
    'SELECT * FROM crafting_recipes WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToRecipe(result.rows[0]) : null;
}

export async function getAllRecipes(): Promise<CraftingRecipe[]> {
  const result = await query<DbCraftingRecipe>(
    'SELECT * FROM crafting_recipes ORDER BY skill_type, skill_level, name'
  );
  return result.rows.map(dbToRecipe);
}

export async function getRecipesBySkill(skillType: CraftingSkill): Promise<CraftingRecipe[]> {
  const result = await query<DbCraftingRecipe>(
    'SELECT * FROM crafting_recipes WHERE skill_type = $1 ORDER BY skill_level, name',
    [skillType]
  );
  return result.rows.map(dbToRecipe);
}

export async function getRecipeByName(name: string): Promise<CraftingRecipe | null> {
  const result = await query<DbCraftingRecipe>(
    'SELECT * FROM crafting_recipes WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0] ? dbToRecipe(result.rows[0]) : null;
}

export async function searchRecipes(keyword: string): Promise<CraftingRecipe[]> {
  const result = await query<DbCraftingRecipe>(
    `SELECT * FROM crafting_recipes 
     WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1
     ORDER BY skill_level, name`,
    [`%${keyword.toLowerCase()}%`]
  );
  return result.rows.map(dbToRecipe);
}

// ============================================================================
// Enchantment Operations
// ============================================================================

export async function getEnchantmentById(id: number): Promise<Enchantment | null> {
  const result = await query<DbEnchantment>(
    'SELECT * FROM enchantments WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToEnchantment(result.rows[0]) : null;
}

export async function getAllEnchantments(): Promise<Enchantment[]> {
  const result = await query<DbEnchantment>(
    'SELECT * FROM enchantments ORDER BY skill_level, name'
  );
  return result.rows.map(dbToEnchantment);
}

export async function getEnchantmentByName(name: string): Promise<Enchantment | null> {
  const result = await query<DbEnchantment>(
    'SELECT * FROM enchantments WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0] ? dbToEnchantment(result.rows[0]) : null;
}

export async function getEnchantmentsForItemType(itemType: ItemType): Promise<Enchantment[]> {
  const result = await query<DbEnchantment>(
    `SELECT * FROM enchantments 
     WHERE EXISTS (SELECT 1 FROM json_each(applicable_types) WHERE value = $1) OR applicable_types IS NULL OR applicable_types = '[]' OR json_array_length(applicable_types) = 0
     ORDER BY skill_level, name`,
    [itemType]
  );
  return result.rows.map(dbToEnchantment);
}

// ============================================================================
// Helper Functions
// ============================================================================

// Create an AppliedEnchantment from an Enchantment
export function createAppliedEnchantment(enchantment: Enchantment): AppliedEnchantment {
  return {
    enchantment_id: enchantment.id,
    name: enchantment.name,
    stat_modifiers: enchantment.stat_modifiers,
    special_effects: enchantment.special_effects,
  };
}
