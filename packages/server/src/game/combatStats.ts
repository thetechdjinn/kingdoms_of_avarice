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

/**
 * Weapon stats used in combat calculations
 */
export interface WeaponStats {
  damageDice: string;
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
 * All combat-relevant stats derived from equipment
 */
export interface EquipmentCombatStats {
  weapon: WeaponStats;
  armor: ArmorStats;
  statModifiers: StatModifiers;
  totalWeight: number;
}

// Default weapon stats when unarmed
const DEFAULT_WEAPON: WeaponStats = {
  damageDice: '1d4',        // Unarmed damage
  attackSpeed: 8,           // Fists are fast
  critModifier: 0,          // No bonus crit from fists
  damageType: 'bludgeoning',
  weaponName: 'fists',
  attackVerbs: UNARMED_ATTACK_VERBS,
};

// Default armor stats when unarmored
const DEFAULT_ARMOR: ArmorStats = {
  totalArmorClass: 10,      // Base unarmored AC
  damageReduction: 0,
};

/**
 * Get weapon stats from an equipped main hand item
 */
function getWeaponStats(weapon: ItemInstance | undefined): WeaponStats {
  if (!weapon?.template?.weapon_data) {
    return DEFAULT_WEAPON;
  }

  const weaponData = weapon.template.weapon_data as WeaponData;
  const damageType = weaponData.damage_type || DamageType.BLUDGEONING;

  // Resolve attack verbs: custom > damage-type default > unarmed
  const attackVerbs = weaponData.attack_verbs
    || DEFAULT_ATTACK_VERBS[damageType as DamageType]
    || UNARMED_ATTACK_VERBS;

  return {
    damageDice: weaponData.damage_dice || '1d4',
    attackSpeed: weaponData.attack_speed ?? 10,
    critModifier: weaponData.crit_modifier ?? 0,
    damageType,
    weaponName: weapon.template.name,
    attackVerbs,
  };
}

/**
 * Calculate total armor class from all equipped armor pieces
 */
function calculateArmorStats(equippedItems: ItemInstance[]): ArmorStats {
  let totalAC = 10; // Base AC
  let damageReduction = 0;

  for (const item of equippedItems) {
    if (item.template?.item_type === ItemType.ARMOR && item.template.armor_data) {
      const armorData = item.template.armor_data;
      // Add armor class on top of base 10
      totalAC += armorData.armor_class || 0;

      // Future: could calculate damage reduction from heavy armor
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
 * Get all combat-relevant stats for a player from their equipment
 *
 * @param playerId - The player's character ID (used for item lookup)
 * @returns Equipment combat stats including weapon, armor, and modifiers
 */
export async function getEquipmentCombatStats(playerId: number): Promise<EquipmentCombatStats> {
  // Fetch equipped items and inventory in parallel
  const [equipped, inventory] = await Promise.all([
    itemRepo.getPlayerEquipped(playerId),
    itemRepo.getPlayerInventory(playerId),
  ]);

  // Find main hand weapon
  const mainHandWeapon = equipped.find(
    item => item.equipped_slot === EquipmentSlot.MAIN_HAND
  );

  return {
    weapon: getWeaponStats(mainHandWeapon),
    armor: calculateArmorStats(equipped),
    statModifiers: calculateStatModifiers(equipped),
    totalWeight: calculateTotalWeight(inventory, equipped),
  };
}

/**
 * Calculate encumbrance ratio based on weight and strength
 *
 * @param totalWeight - Total weight being carried
 * @param strength - Character's strength stat
 * @returns Encumbrance ratio (0.0 = empty, 0.5 = baseline, 1.0 = max capacity)
 */
export function calculateEncumbranceRatio(totalWeight: number, strength: number): number {
  // Base carrying capacity: 50 + (strength * 2) pounds
  // A character with 50 STR can carry 150 pounds at baseline (50% encumbrance)
  const maxCapacity = 50 + (strength * 2);
  const baselineCapacity = maxCapacity * 0.5; // 50% of max is the baseline

  if (totalWeight <= 0) return 0;
  if (totalWeight >= maxCapacity) return 1.0;

  // Return ratio where 0.5 = baseline capacity
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
