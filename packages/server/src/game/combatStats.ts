/**
 * Combat Stats Module
 *
 * Calculates combat-relevant stats from equipped items and character data.
 * Used by the combat loop to get actual weapon damage, armor class, etc.
 */

import {
  ItemInstance,
  EquipmentSlot,
  ItemType,
  WeaponData,
  StatModifiers,
  AttackVerbs,
  DamageType,
  DEFAULT_ATTACK_VERBS,
  UNARMED_ATTACK_VERBS,
} from '@koa/shared';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import { getCombatSettings, getCurrencyEncumbranceSettings } from '../db/repositories/settingsRepository.js';

// ============================================================================
// EQUIPMENT STATS CACHE (invalidated on equip/unequip/drop/pickup)
// ============================================================================

const equipmentCache = new Map<number, { stats: EquipmentCombatStats; cachedAt: number }>();
const EQUIPMENT_CACHE_TTL = 30_000; // 30 seconds fallback TTL

/** Invalidate a character's cached equipment stats. Call on equip/unequip/drop/pickup. */
export function invalidateEquipmentCache(characterId: number): void {
  equipmentCache.delete(characterId);
}

/** Clear all equipment caches. */
export function clearEquipmentCache(): void {
  equipmentCache.clear();
}

/**
 * Weapon stats used in combat calculations
 */
export interface WeaponStats {
  minDamage: number;
  maxDamage: number;
  attackSpeed: number;
  critModifier: number;
  damageType: string;
  weaponName: string;
  attackVerbs: AttackVerbs;
}

/**
 * Armor stats used in combat calculations
 */
export interface ArmorStats {
  totalArmorClass: number;
  damageReduction: number;
}

/**
 * Modifier bonuses aggregated from all equipped items
 */
export interface EquipmentModifiers {
  acBonus: number;
  damageResistanceBonus: number;
  dodgeBonus: number;
  damageModifier: number;
  energyModifier: number;
  speedModifier: number;
  defenseBonus: number;
  healingModifier: number;
  criticalChanceBonus: number;
  magicResistanceBonus: number;
  spellcastingBonus: number;
}

/**
 * All combat-relevant stats derived from equipment
 */
export interface EquipmentCombatStats {
  weapon: WeaponStats;
  armor: ArmorStats;
  statModifiers: StatModifiers;
  modifiers: EquipmentModifiers;
  totalWeight: number;
}

// Default weapon stats when unarmed (fallback values)
// Actual unarmed_speed and default_weapon_speed loaded from game_settings
const DEFAULT_UNARMED_SPEED = 4500;
const DEFAULT_WEAPON_SPEED = 7500;

function getDefaultWeaponStats(unarmedSpeed: number = DEFAULT_UNARMED_SPEED): WeaponStats {
  return {
    minDamage: 1,             // Unarmed min damage
    maxDamage: 4,             // Unarmed max damage
    attackSpeed: unarmedSpeed, // Fists are fast (lower = faster)
    critModifier: 0,          // No bonus crit from fists
    damageType: 'bludgeoning',
    weaponName: 'fists',
    attackVerbs: UNARMED_ATTACK_VERBS,
  };
}

// Default armor stats when unarmored
const DEFAULT_ARMOR: ArmorStats = {
  totalArmorClass: 10,      // Base unarmored AC
  damageReduction: 0,
};

/**
 * Get weapon stats from an equipped main hand item
 *
 * @param weapon - The equipped weapon item (or undefined if unarmed)
 * @param unarmedSpeed - Speed for unarmed combat (from settings)
 * @param defaultSpeed - Default speed for weapons without attack_speed (from settings)
 */
function getWeaponStats(
  weapon: ItemInstance | undefined,
  unarmedSpeed: number = DEFAULT_UNARMED_SPEED,
  defaultSpeed: number = DEFAULT_WEAPON_SPEED
): WeaponStats {
  if (!weapon?.template?.weapon_data) {
    return getDefaultWeaponStats(unarmedSpeed);
  }

  const weaponData = weapon.template.weapon_data as WeaponData;
  const damageType = weaponData.damage_type || DamageType.BLUDGEONING;

  // Resolve attack verbs: custom > damage-type default > unarmed
  const attackVerbs = weaponData.attack_verbs
    || DEFAULT_ATTACK_VERBS[damageType as DamageType]
    || UNARMED_ATTACK_VERBS;

  return {
    minDamage: weaponData.min_damage ?? 1,
    maxDamage: weaponData.max_damage ?? 4,
    attackSpeed: weaponData.attack_speed ?? defaultSpeed,
    critModifier: weaponData.crit_modifier ?? 0,
    damageType,
    weaponName: weapon.template.name,
    attackVerbs,
  };
}

/**
 * Calculate total armor class and damage resistance from all equipped armor pieces
 * Only equipped items (not inventory) contribute to armor stats
 */
function calculateArmorStats(equippedItems: ItemInstance[]): ArmorStats {
  let totalAC = 10; // Base AC
  let damageReduction = 0;

  for (const item of equippedItems) {
    if (item.template?.item_type === ItemType.ARMOR && item.template.armor_data) {
      const armorData = item.template.armor_data;
      // Add armor class on top of base 10
      totalAC += armorData.armor_class || 0;

      // Sum damage resistance from all armor pieces
      damageReduction += armorData.damage_resistance || 0;
    }
  }

  // If wearing any armor, use the calculated AC
  // Otherwise, keep the base 10
  const hasArmor = equippedItems.some(
    item => item.template?.item_type === ItemType.ARMOR && item.template.armor_data
  );

  return {
    totalArmorClass: hasArmor ? totalAC : 10,
    damageReduction,
  };
}

/**
 * Sum stat modifiers from all equipped items
 */
function calculateStatModifiers(equippedItems: ItemInstance[]): StatModifiers {
  const total: StatModifiers = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
    max_health: 0,
    max_mana: 0,
  };

  for (const item of equippedItems) {
    const mods = item.template?.stat_modifiers;
    if (mods) {
      total.strength = (total.strength || 0) + (mods.strength || 0);
      total.dexterity = (total.dexterity || 0) + (mods.dexterity || 0);
      total.constitution = (total.constitution || 0) + (mods.constitution || 0);
      total.intelligence = (total.intelligence || 0) + (mods.intelligence || 0);
      total.wisdom = (total.wisdom || 0) + (mods.wisdom || 0);
      total.charisma = (total.charisma || 0) + (mods.charisma || 0);
      total.max_health = (total.max_health || 0) + (mods.max_health || 0);
      total.max_mana = (total.max_mana || 0) + (mods.max_mana || 0);
    }
  }

  return total;
}

/**
 * Sum item modifier fields from all equipped items
 */
function calculateEquipmentModifiers(equippedItems: ItemInstance[]): EquipmentModifiers {
  const total: EquipmentModifiers = {
    acBonus: 0,
    damageResistanceBonus: 0,
    dodgeBonus: 0,
    damageModifier: 0,
    energyModifier: 0,
    speedModifier: 0,
    defenseBonus: 0,
    healingModifier: 0,
    criticalChanceBonus: 0,
    magicResistanceBonus: 0,
    spellcastingBonus: 0,
  };

  for (const item of equippedItems) {
    const t = item.template;
    if (!t) continue;
    total.acBonus += t.ac_modifier ?? 0;
    total.damageResistanceBonus += t.damage_resistance_modifier ?? 0;
    total.dodgeBonus += t.dodge_modifier ?? 0;
    total.damageModifier += t.damage_modifier ?? 0;
    total.energyModifier += t.energy_modifier ?? 0;
    total.speedModifier += t.speed_modifier ?? 0;
    total.defenseBonus += t.defense_modifier ?? 0;
    total.healingModifier += t.healing_modifier ?? 0;
    total.criticalChanceBonus += t.critical_chance_modifier ?? 0;
    total.magicResistanceBonus += t.magic_resistance_modifier ?? 0;
    total.spellcastingBonus += t.spellcasting_modifier ?? 0;
  }

  return total;
}

/**
 * Calculate total weight of inventory and equipped items
 */
function calculateTotalWeight(inventory: ItemInstance[], equipped: ItemInstance[]): number {
  let totalWeight = 0;

  for (const item of [...inventory, ...equipped]) {
    const itemWeight = item.template?.weight || 0;
    const quantity = item.quantity || 1;
    totalWeight += itemWeight * quantity;
  }

  return totalWeight;
}

/**
 * Calculate currency weight based on the number of coins
 * Uses configurable encumbrance settings from database
 */
async function calculateCurrencyWeight(character: characterRepo.DbCharacter | null): Promise<number> {
  if (!character) return 0;

  const encSettings = await getCurrencyEncumbranceSettings();
  return Math.floor((character.copper ?? 0) / encSettings.copperPerEnc) +
    Math.floor((character.silver ?? 0) / encSettings.silverPerEnc) +
    Math.floor((character.gold ?? 0) / encSettings.goldPerEnc) +
    Math.floor((character.platinum ?? 0) / encSettings.platinumPerEnc) +
    Math.floor((character.runic ?? 0) / encSettings.runicPerEnc);
}

/**
 * Get all combat-relevant stats for a player from their equipment
 *
 * @param characterId - The character's ID (used for item lookup)
 * @returns Equipment combat stats including weapon, armor, and modifiers
 */
export async function getEquipmentCombatStats(characterId: number): Promise<EquipmentCombatStats> {
  // Check cache first
  const now = Date.now();
  const cached = equipmentCache.get(characterId);
  if (cached && (now - cached.cachedAt) < EQUIPMENT_CACHE_TTL) {
    return cached.stats;
  }

  // Fetch equipped items, inventory, character data, and combat settings in parallel
  const [equipped, inventory, character, combatSettings] = await Promise.all([
    itemRepo.getCharacterEquipped(characterId),
    itemRepo.getCharacterInventory(characterId),
    characterRepo.findCharacterById(characterId),
    getCombatSettings(),
  ]);

  // Find main hand weapon
  const mainHandWeapon = equipped.find(
    item => item.equipped_slot === EquipmentSlot.MAIN_HAND
  );

  // Calculate total weight including currency
  const itemWeight = calculateTotalWeight(inventory, equipped);
  const currencyWeight = await calculateCurrencyWeight(character);

  const armor = calculateArmorStats(equipped);
  const modifiers = calculateEquipmentModifiers(equipped);

  // Apply equipment modifier bonuses to armor totals
  armor.totalArmorClass += modifiers.acBonus;
  armor.damageReduction += modifiers.damageResistanceBonus;

  const stats: EquipmentCombatStats = {
    weapon: getWeaponStats(
      mainHandWeapon,
      combatSettings.unarmed_speed,
      combatSettings.default_weapon_speed
    ),
    armor,
    statModifiers: calculateStatModifiers(equipped),
    modifiers,
    totalWeight: itemWeight + currencyWeight,
  };

  equipmentCache.set(characterId, { stats, cachedAt: Date.now() });
  return stats;
}

/**
 * Calculate encumbrance ratio based on weight and strength
 *
 * Weight units based on MajorMUD (from Nightmare Redux):
 * - Dagger: 35, Long sword: 90, Greatsword: 150-200
 * - Silk Cape: 50, Great Cloak: 100
 * - Leather armor: 325-400, Chainmail pieces: 150-160
 * - Plate boots: 200, Full plate corselet: 1500
 *
 * Carrying capacity formula derived from MajorMUD data:
 * - Kang, STR 55 = 2640 max capacity (55 × 48 = 2640)
 * - Half-elf, STR 40 = 1920 max capacity (40 × 48 = 1920)
 *
 * @param totalWeight - Total weight being carried (in weight units)
 * @param strength - Character's strength stat
 * @returns Encumbrance ratio (0.0 = empty, 1.0 = max capacity)
 */
export function calculateEncumbranceRatio(totalWeight: number, strength: number): number {
  // MajorMUD formula: MaxCapacity = STR × 48
  const maxCapacity = strength * 48;

  if (totalWeight <= 0) return 0;
  if (maxCapacity <= 0) return 1.0; // Prevent division by zero
  if (totalWeight >= maxCapacity) return 1.0;

  return totalWeight / maxCapacity;
}

/**
 * Get the accuracy bonus from equipment stat modifiers
 * Based on the formula: DEX/10 + INT/20 + CHA/10*1.2
 */
export function getEquipmentAccuracyBonus(statMods: StatModifiers): number {
  const dexBonus = Math.floor((statMods.dexterity || 0) / 10);
  const intBonus = Math.floor((statMods.intelligence || 0) / 20);
  const chaBonus = Math.floor(((statMods.charisma || 0) / 10) * 1.2);

  return dexBonus + intBonus + chaBonus;
}
