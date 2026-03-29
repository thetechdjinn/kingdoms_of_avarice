/**
 * Combat Stat Provider
 *
 * Extracts the stat-gathering logic from combat.ts into entity-aware functions.
 * For players: performs equipment lookup + class/race lookup (existing behavior).
 * For NPCs (Phase 2): will return pre-computed values from the NPC template.
 *
 * Dodge bonuses require an extra DB round-trip (character + race lookup) that is
 * only useful for defenders. To avoid wasted queries on attackers every round,
 * dodge data is fetched lazily via getCombatStatsWithDodge().
 */

import { EffectModifiers } from '@koa/shared';
import type { CombatEntity } from './combatEntity.js';
import { isPlayerEntity } from './combatEntity.js';
import { getEffectModifiers } from './statusEffects.js';
import {
  getEquipmentCombatStats,
  calculateEncumbranceRatio,
  getEquipmentAccuracyBonus,
  WeaponStats,
  ArmorStats,
} from './combatStats.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import { getNpcInstance } from './npcManager.js';
import type { NpcCombatInstance } from './npcManager.js';
import type { NpcAttack } from '@koa/shared';

/**
 * Combat-relevant derived stats for a single entity.
 * Computed once per combat round, then used by the combat loop.
 *
 * classDodgeBonus / raceDodgeBonus are only populated when fetched via
 * getCombatStatsWithDodge() (defender path). They default to 0.
 */
export interface CombatStatSnapshot {
  effectiveDex: number;
  effectiveInt: number;
  effectiveStr: number;
  effectiveCha: number;
  encumbranceRatio: number;
  equipmentAccuracyBonus: number;
  weapon: WeaponStats;
  armor: ArmorStats;
  classCritBonus: number;
  classDodgeBonus: number;
  raceDodgeBonus: number;
  effectModifiers: EffectModifiers;
  totalWeight: number;
  equipmentDodgeBonus: number;
  equipmentCritBonus: number;
  equipmentDamageModifier: number;
  equipmentEnergyModifier: number;
  equipmentSpeedModifier: number;
  equipmentDefenseBonus: number;
  equipmentHealingModifier: number;
  equipmentMagicResistBonus: number;
}

/**
 * Gather combat stats for an entity (attacker path).
 * Fetches equipment, effective stats, crit bonus, and effect modifiers.
 * Does NOT fetch dodge bonuses (saves 2 DB queries per attacker per round).
 */
export async function getCombatStats(entity: CombatEntity): Promise<CombatStatSnapshot> {
  if (isPlayerEntity(entity)) {
    return getPlayerCombatStats(entity, false);
  }

  return getNpcCombatStats(entity);
}

/**
 * Gather combat stats for an entity including dodge bonuses (defender path).
 * Use this when the entity needs classDodgeBonus and raceDodgeBonus populated.
 */
export async function getCombatStatsWithDodge(entity: CombatEntity): Promise<CombatStatSnapshot> {
  if (isPlayerEntity(entity)) {
    return getPlayerCombatStats(entity, true);
  }

  return getNpcCombatStats(entity);
}

/**
 * Get combat stats for a player entity by reading equipment and progression data.
 *
 * @param includeDodge When true, also fetches character/race data for dodge bonuses.
 *                     When false, classDodgeBonus and raceDodgeBonus are left at 0.
 */
async function getPlayerCombatStats(entity: CombatEntity, includeDodge: boolean): Promise<CombatStatSnapshot> {
  // Get equipment stats (weapon, armor, stat modifiers, weight)
  const equipment = await getEquipmentCombatStats(entity.characterId!);

  // Get status effect modifiers (needed before stat calculations)
  const effectModifiers = getEffectModifiers(entity);

  // Calculate effective stats with equipment + status effect modifiers
  const effectiveDex = entity.characterStats.dexterity + (equipment.statModifiers.dexterity || 0) + effectModifiers.dexterityModifier;
  const effectiveInt = entity.characterStats.intelligence + (equipment.statModifiers.intelligence || 0) + effectModifiers.intelligenceModifier;
  const effectiveStr = entity.characterStats.strength + (equipment.statModifiers.strength || 0) + effectModifiers.strengthModifier;
  const effectiveCha = entity.characterStats.charisma + (equipment.statModifiers.charisma || 0) + effectModifiers.charismaModifier;

  // Calculate encumbrance from actual inventory weight
  const encumbranceRatio = calculateEncumbranceRatio(equipment.totalWeight, effectiveStr);

  // Equipment accuracy bonus
  const equipmentAccuracyBonus = getEquipmentAccuracyBonus(equipment.statModifiers);

  // Get class crit bonus (always needed) and optionally dodge bonus
  let classCritBonus = 0;
  let classDodgeBonus = 0;
  let raceDodgeBonus = 0;

  if (entity.characterId) {
    const progression = await progressionRepo.getCharacterProgression(entity.characterId);
    if (progression) {
      const classDef = await progressionRepo.getClassById(progression.class_id);
      classCritBonus = classDef?.crit_bonus ?? 0;
      if (includeDodge) {
        classDodgeBonus = classDef?.dodge_bonus ?? 0;
      }
    }

    // Race dodge bonus requires character + race lookup — only fetch when needed
    if (includeDodge) {
      const character = await characterRepo.findCharacterById(entity.characterId);
      if (character) {
        const raceDef = await progressionRepo.getRaceById(character.race);
        raceDodgeBonus = raceDef?.dodge_bonus ?? 0;
      }
    }
  }

  return {
    effectiveDex,
    effectiveInt,
    effectiveStr,
    effectiveCha,
    encumbranceRatio,
    equipmentAccuracyBonus,
    weapon: equipment.weapon,
    armor: equipment.armor,
    classCritBonus,
    classDodgeBonus,
    raceDodgeBonus,
    effectModifiers,
    totalWeight: equipment.totalWeight,
    equipmentDodgeBonus: equipment.modifiers.dodgeBonus,
    equipmentCritBonus: equipment.modifiers.criticalChanceBonus,
    equipmentDamageModifier: equipment.modifiers.damageModifier,
    equipmentEnergyModifier: equipment.modifiers.energyModifier,
    equipmentSpeedModifier: equipment.modifiers.speedModifier,
    equipmentDefenseBonus: equipment.modifiers.defenseBonus,
    equipmentHealingModifier: equipment.modifiers.healingModifier,
    equipmentMagicResistBonus: equipment.modifiers.magicResistanceBonus,
  };
}

/**
 * Select an attack for an NPC based on weighted percentage selection.
 */
export function selectNpcAttack(npc: NpcCombatInstance): NpcAttack | null {
  const attacks = npc.template.attacks;
  if (attacks.length === 0) return null;

  // Weighted random selection based on percentage
  const totalWeight = attacks.reduce((sum, a) => sum + a.percentage, 0);
  let roll = Math.random() * totalWeight;

  for (const attack of attacks) {
    roll -= attack.percentage;
    if (roll <= 0) return attack;
  }

  return attacks[attacks.length - 1];
}

/**
 * NPC combat stats — reads pre-computed values from the NPC template.
 */
function getNpcCombatStats(entity: CombatEntity): CombatStatSnapshot {
  const npc = getNpcInstance(entity.entityId);
  const effectModifiers = getEffectModifiers(entity);

  if (!npc) {
    // Fallback if NPC not found (shouldn't happen)
    return {
      effectiveDex: entity.characterStats.dexterity,
      effectiveInt: entity.characterStats.intelligence,
      effectiveStr: entity.characterStats.strength,
      effectiveCha: entity.characterStats.charisma,
      encumbranceRatio: 0,
      equipmentAccuracyBonus: 0,
      weapon: {
        minDamage: 1,
        maxDamage: 4,
        attackSpeed: 4500,
        critModifier: 0,
        damageType: 'bludgeoning',
        weaponName: 'fists',
        attackVerbs: { hit: 'hit', hit_3p: 'hits', miss: 'swing at', miss_3p: 'swings at' },
      },
      armor: {
        totalArmorClass: 10,
        damageReduction: 0,
      },
      classCritBonus: 0,
      classDodgeBonus: 0,
      raceDodgeBonus: 0,
      effectModifiers,
      totalWeight: 0,
      equipmentDodgeBonus: 0,
      equipmentCritBonus: 0,
      equipmentDamageModifier: 0,
      equipmentEnergyModifier: 0,
      equipmentSpeedModifier: 0,
      equipmentDefenseBonus: 0,
      equipmentHealingModifier: 0,
      equipmentMagicResistBonus: 0,
    };
  }

  // Select attack for this round
  const attack = selectNpcAttack(npc);

  return {
    effectiveDex: entity.characterStats.dexterity,
    effectiveInt: entity.characterStats.intelligence,
    effectiveStr: entity.characterStats.strength,
    effectiveCha: entity.characterStats.charisma,
    encumbranceRatio: 0,
    equipmentAccuracyBonus: 0,
    weapon: {
      minDamage: attack?.minDamage ?? 1,
      maxDamage: attack?.maxDamage ?? 4,
      attackSpeed: 4500, // NPCs don't use energy system
      critModifier: 0,
      damageType: 'bludgeoning',
      weaponName: attack?.name ?? 'fists',
      attackVerbs: {
        hit: attack?.hitVerb ?? 'hit',
        hit_3p: attack?.hitVerb3p ?? 'hits',
        miss: attack?.missVerb ?? 'swing at',
        miss_3p: attack?.missVerb3p ?? 'swings at',
      },
    },
    armor: {
      totalArmorClass: npc.template.baseDefense,
      damageReduction: npc.template.damageReduction,
    },
    classCritBonus: npc.template.baseCritChance,
    classDodgeBonus: npc.template.baseDodge,
    raceDodgeBonus: 0,
    effectModifiers,
    totalWeight: 0,
    equipmentDodgeBonus: 0,
    equipmentCritBonus: 0,
    equipmentDamageModifier: 0,
    equipmentEnergyModifier: 0,
    equipmentSpeedModifier: 0,
    equipmentDefenseBonus: 0,
    equipmentHealingModifier: 0,
    equipmentMagicResistBonus: 0,
  };
}
