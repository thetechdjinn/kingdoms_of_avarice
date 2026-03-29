/**
 * Combat Loop Module
 *
 * Manages the global combat timer and processes combat rounds for all players.
 * Uses CombatEntity interface so both players and NPCs can participate.
 */

import { MessageType, AttackResult, SpellScalingStat, SpellType, SpellTargetType, AttackVerbs, calculateSpellcasting } from '@koa/shared';
import { AuthenticatedSocket, sendVitals as sendPlayerVitals } from './socket.js';
import type { CombatEntity } from './combatEntity.js';
import { isPlayerEntity, getEntityRoomId } from './combatEntity.js';
import { getAllNpcInstances, getNpcInstance, getNpcsInRoom, resetNpcBehaviorState, getWorldRef } from './npcManager.js';
import type { NpcCombatInstance } from './npcManager.js';
import { processNpcBehavior } from './npcBehavior.js';
import { setSpellCooldown } from './npcSpellAI.js';
import type { NpcSpellSelection } from './npcSpellAI.js';
import { selectNpcAttack } from './combatStatProvider.js';
import { processNpcDeath } from './npcDeathHandler.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { colors } from '../utils/colors.js';
import { withNpcName, withNpcNameCapitalized, withNpcNamePossessive } from '../utils/textFormat.js';
import {
  calculateRoundEnergy,
  calculateAccuracy,
  calculateDefense,
  calculateCritChance,
  calculateDodgeChance,
  calculateEffectiveWeaponCost,
  executeCombatRound,
  resolveAttack,
  calculateDamage,
  RuntimeCombatConfig,
  toRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
} from './combatCalculations.js';
import { getCombatSettings, getBlindAccuracyPenalty } from '../db/repositories/settingsRepository.js';
import { entityCanSee } from './vision.js';
import { clearCombatState, breakCasterCombat } from './combatCommands.js';
import {
  applyDamage,
  initializeDroppedState,
  initializeDeadState,
  formatDroppedMessage,
  formatDeathMessage,
} from './damageHandler.js';
import { getCombatStats, getCombatStatsWithDodge } from './combatStatProvider.js';
import { getEquipmentCombatStats } from './combatStats.js';
import { applyEffect, applyEffectToEntity, getEffectDefinition, hasEffect, getEffectModifiers } from './statusEffects.js';
import {
  sendCombatMessage,
  sendEntityVitals,
  broadcastCombatToRoom,
  resolveCombatTarget,
  initializeCombatMessaging,
} from './combatMessaging.js';

/**
 * Get character stat value based on spell scaling stat
 * Maps spell stat names to character stat property names
 */
export function getStatValueForScaling(
  stats: { strength: number; dexterity: number; intelligence: number; constitution: number; wisdom: number; charisma: number },
  scalingStat: SpellScalingStat | null
): number {
  if (!scalingStat || scalingStat === SpellScalingStat.NONE) return 0;

  switch (scalingStat) {
    case SpellScalingStat.STRENGTH:
      return stats.strength;
    case SpellScalingStat.AGILITY:
      return stats.dexterity;  // Agility maps to dexterity
    case SpellScalingStat.CONSTITUTION:
      return stats.constitution;  // Health/vitality
    case SpellScalingStat.INTELLECT:
      return stats.intelligence;  // Intellect maps to intelligence
    case SpellScalingStat.WISDOM:
      return stats.wisdom;
    case SpellScalingStat.CHARISMA:
      return stats.charisma;
    case SpellScalingStat.INTELLECT_WISDOM:
      return Math.floor((stats.intelligence + stats.wisdom) / 2);
    default:
      return 0;
  }
}

/**
 * Calculate scaled min/max values for a spell based on caster level and stats.
 *
 * Level scaling: based on caster levels ABOVE the spell's level requirement,
 *   capped at maxScalingLevel additional levels. scalingPerLevel is a decimal
 *   (0.02 = 2% per level above requirement).
 *
 * Stat scaling: scalingFactor is a decimal (0.02 = 2% per 10 stat points).
 *
 * Both bonuses are additive — they sum into one multiplier applied to the base.
 */
export function calculateSpellScaling(
  baseMin: number,
  baseMax: number,
  casterLevel: number,
  scalingPerLevel: number | null,
  statValue: number,
  scalingFactor: number | null,
  maxScalingLevel?: number | null,
  spellLevelRequired?: number,
): { min: number; max: number } {
  let bonus = 0;

  // Level scaling: levels above the spell's requirement, capped at maxScalingLevel
  if (scalingPerLevel && scalingPerLevel > 0) {
    const spellLevel = spellLevelRequired ?? 1;
    const levelsAbove = Math.max(0, casterLevel - spellLevel);
    const cappedLevels = (maxScalingLevel != null && maxScalingLevel > 0)
      ? Math.min(levelsAbove, maxScalingLevel)
      : levelsAbove;
    bonus += cappedLevels * scalingPerLevel;
  }

  // Stat scaling: % increase per 10 stat points
  if (scalingFactor && scalingFactor > 0 && statValue > 0) {
    const statTiers = Math.floor(statValue / 10);
    bonus += statTiers * scalingFactor;
  }

  const multiplier = 1 + bonus;
  const min = Math.max(1, Math.floor(baseMin * multiplier));
  const max = Math.max(1, Math.floor(baseMax * multiplier));

  return { min, max };
}

/**
 * Check if a spell fizzles. Returns true if the spell succeeds.
 *
 * Formula: roll(1-100) <= (spellcastingAbility + castDifficulty)
 * - Positive difficulty = easier (adds to SP, e.g., Magic Missile +15)
 * - Negative difficulty = harder (subtracts from SP, e.g., DOOM -50)
 * - Difficulty 100 = item-cast, always succeeds
 * - 3% auto-fizzle on rolls 98-100 (unless difficulty >= 100)
 */
export function spellCastSucceeds(castDifficulty: number, spellcastingAbility: number): boolean {
  // Item-cast spells (difficulty 100+) never fizzle
  if (castDifficulty >= 100) return true;

  const roll = Math.floor(Math.random() * 100) + 1;

  // 3% automatic failure on any non-item spell
  if (roll >= 98) return false;

  const castChance = spellcastingAbility + castDifficulty;
  return roll <= castChance;
}

/**
 * Get room darkness level from world reference.
 * Returns 0 (bright) if world or room not found.
 */
function getRoomDarkness(roomId: number): number {
  const world = getWorldRef();
  if (!world) return 0;
  const room = world.getRoom(roomId);
  return room?.darkness_level ?? 0;
}

const DEFAULT_COMBAT_ROUND_MS = 4000;
const parsedRoundMs = parseInt(process.env.COMBAT_ROUND_MS || '', 10);
const COMBAT_ROUND_MS = Number.isFinite(parsedRoundMs) && parsedRoundMs > 0
  ? parsedRoundMs
  : DEFAULT_COMBAT_ROUND_MS;

// Default combat values
const DEFAULT_CRIT_MULTIPLIER = 2.0;
const DEFAULT_PERCEPTION = 0;
const DEFAULT_SHADOW = 0;

let combatInterval: NodeJS.Timeout | null = null;
let combatRoundInProgress = false;
let connectedPlayersRef: Map<number, AuthenticatedSocket>;

/**
 * Start the global combat loop
 * Called during server initialization
 */
export function startCombatLoop(connectedPlayers: Map<number, AuthenticatedSocket>): void {
  if (combatInterval) {
    console.log('[Combat] Combat loop already running');
    return;
  }

  connectedPlayersRef = connectedPlayers;
  // Initialize the messaging module with the player map and canonical sendVitals
  initializeCombatMessaging(connectedPlayers as Map<number, CombatEntity>, sendPlayerVitals);
  combatInterval = setInterval(() => {
    // Prevent overlapping async rounds (processCombatRound uses await internally)
    if (combatRoundInProgress) return;
    combatRoundInProgress = true;
    processCombatRound().finally(() => {
      combatRoundInProgress = false;
    });
  }, COMBAT_ROUND_MS);
  console.log(`[Combat] Started combat loop (${COMBAT_ROUND_MS}ms rounds)`);
}

/**
 * Stop the global combat loop
 * Called during server shutdown
 */
export function stopCombatLoop(): void {
  if (combatInterval) {
    clearInterval(combatInterval);
    combatInterval = null;
    combatRoundInProgress = false;
    console.log('[Combat] Stopped combat loop');
  }
}

/**
 * Weapon info for combat messages
 */
interface WeaponInfo {
  name: string;
  verbs: AttackVerbs;
  hitMessage?: string | null;
  missMessage?: string | null;
}

/**
 * Format a swing result into combat message text
 */
interface SwingEntity {
  name: string;
  isProperName: boolean;
}

function formatSwingMessage(
  result: AttackResult,
  damage: number,
  attackerEntity: SwingEntity,
  defenderEntity: SwingEntity,
  isAttacker: boolean,
  isDefender: boolean,
  weapon?: WeaponInfo
): string {
  // Subject form: sentence-start capitalized article ("A serpentine warrior" / "Bob")
  const atkSubject = isAttacker ? 'You' : withNpcNameCapitalized(attackerEntity.name, attackerEntity.isProperName);
  const defSubject = isDefender ? 'You' : withNpcNameCapitalized(defenderEntity.name, defenderEntity.isProperName);
  // Object form: lowercase article ("a serpentine warrior" / "Bob" / "you")
  const defObject = isDefender ? 'you' : withNpcName(defenderEntity.name, defenderEntity.isProperName);
  // Possessive (lowercase for mid-sentence observer messages): "the serpentine warrior's" / "Bob's" / "Your"
  const atkPossessive = isAttacker ? 'Your' : withNpcNamePossessive(attackerEntity.name, attackerEntity.isProperName, false);
  // Inline possessive for isDefender: "the serpentine warrior's" / "Bob's"
  const atkInlinePossessive = attackerEntity.isProperName ? `${attackerEntity.name}'s` : `the ${attackerEntity.name}'s`;

  // Get attack verbs from weapon or use defaults
  const hitVerb1p = weapon?.verbs.hit || 'hit';
  const hitVerb3p = weapon?.verbs.hit_3p || 'hits';
  const missVerb1p = weapon?.verbs.miss || 'swing at';
  const missVerb3p = weapon?.verbs.miss_3p || 'swings at';

  // Format weapon name for miss messages
  const weaponName = weapon?.name || 'fists';
  const isUnarmed = weaponName === 'fists';

  // Custom message helper: replace placeholders
  // Supports: {attacker}/{name}, {defender}/{target}, {damage}
  const applyCustomMessage = (template: string): string => {
    const attacker = isAttacker ? 'You' : atkSubject;
    const defender = isDefender ? 'you' : defObject;
    return template
      .replace(/\{attacker\}/g, attacker)
      .replace(/\{name\}/g, attacker)
      .replace(/\{defender\}/g, defender)
      .replace(/\{target\}/g, defender)
      .replace(/\{damage\}/g, damage.toString());
  };

  switch (result) {
    case AttackResult.CRITICAL:
    case AttackResult.HIT: {
      // Custom hit message overrides the generated text
      if (weapon?.hitMessage) {
        const prefix = result === AttackResult.CRITICAL ? `${colors.combatCritical('*CRITICAL*')} ` : '';
        return prefix + applyCustomMessage(weapon.hitMessage);
      }
      const isCrit = result === AttackResult.CRITICAL;
      const critPrefix = isCrit ? `${colors.combatCritical('critically')} ` : '';
      const punctuation = isCrit ? '!' : '.';
      if (isAttacker) {
        return `You ${critPrefix}${colors.combatHit(hitVerb1p)} ${colors.combatDefender(defObject)} for ${colors.combatDamage(damage.toString())} damage${punctuation}`;
      } else if (isDefender) {
        return `${colors.combatAttacker(atkSubject)} ${critPrefix}${colors.combatHit(hitVerb3p)} you for ${colors.combatDamage(damage.toString())} damage${punctuation}`;
      }
      return `${colors.combatAttacker(atkSubject)} ${critPrefix}${colors.combatHit(hitVerb3p)} ${colors.combatDefender(defObject)} for ${colors.combatDamage(damage.toString())} damage${punctuation}`;
    }

    case AttackResult.MISS:
      // Custom miss message overrides the generated text
      if (weapon?.missMessage) {
        return applyCustomMessage(weapon.missMessage);
      }
      if (isUnarmed) {
        if (isAttacker) {
          return `You ${colors.combatMiss(missVerb1p)} ${colors.combatDefender(defObject)}, but miss.`;
        } else if (isDefender) {
          return `${colors.combatAttacker(atkSubject)} ${colors.combatMiss(missVerb3p)} you, but misses.`;
        }
        return `${colors.combatAttacker(atkSubject)} ${colors.combatMiss(missVerb3p)} ${colors.combatDefender(defObject)}, but misses.`;
      } else {
        if (isAttacker) {
          return `You ${colors.combatMiss(missVerb1p)} ${colors.combatDefender(defObject)} with your ${colors.item(weaponName)}, but miss.`;
        } else if (isDefender) {
          return `${colors.combatAttacker(atkSubject)} ${colors.combatMiss(missVerb3p)} you with their ${colors.item(weaponName)}, but misses.`;
        }
        return `${colors.combatAttacker(atkSubject)} ${colors.combatMiss(missVerb3p)} ${colors.combatDefender(defObject)} with their ${colors.item(weaponName)}, but misses.`;
      }

    case AttackResult.DODGE:
      if (isAttacker) {
        return `${colors.combatDefender(defSubject)} ${colors.combatDodge('dodges')} your attack.`;
      } else if (isDefender) {
        return `You ${colors.combatDodge('dodge')} ${colors.combatAttacker(atkInlinePossessive)} attack!`;
      }
      return `${colors.combatDefender(defSubject)} ${colors.combatDodge('dodges')} ${atkPossessive} attack.`;

    case AttackResult.PARRY:
      if (isDefender) {
        return `You ${colors.combatDodge('parry')} ${colors.combatAttacker(atkInlinePossessive)} attack!`;
      }
      return `${colors.combatDefender(defSubject)} ${colors.combatDodge('parries')} ${atkPossessive} attack.`;

    case AttackResult.BLOCK:
      if (isDefender) {
        return `You ${colors.combatDodge('block')} ${colors.combatAttacker(atkInlinePossessive)} attack!`;
      }
      return `${colors.combatDefender(defSubject)} ${colors.combatDodge('blocks')} ${atkPossessive} attack.`;

    default:
      return isAttacker ? `You attack ${defObject}.` : `${atkSubject} attacks ${defObject}.`;
  }
}

/**
 * Process spell combat for a single attacker
 * Returns true if combat should continue, false if combat was broken
 */
async function processSpellCombat(
  attacker: CombatEntity,
  targets: Set<number>,
  deferredRewards: Array<() => Promise<void>> = []
): Promise<boolean> {
  if (!attacker.combatState.activeSpell) return false;

  const spell = attacker.combatState.activeSpell;
  const attackerRoomId = getEntityRoomId(attacker);

  // Check if we have enough mana
  if ((attacker.vitals.resource ?? 0) < spell.manaCost) {
    // Not enough mana - break combat
    sendCombatMessage(attacker, MessageType.SYSTEM, colors.red(`You don't have enough mana to cast ${spell.spellName}!`));
    sendCombatMessage(attacker, MessageType.SYSTEM, colors.yellow('*COMBAT OFF*'));

    // Clear combat state
    clearCombatState(attacker, connectedPlayersRef);
    return false;
  }

  // Vision check: targeted offensive spells fail when caster can't see.
  // Self-buffs are cast via spellCommands.ts handleBuffSpell() and bypass this check.
  const spellRoomDarkness = getRoomDarkness(attackerRoomId);
  if (!await entityCanSee(attacker, spellRoomDarkness)) {
    sendCombatMessage(attacker, MessageType.OUTPUT, colors.red('You can\'t see well enough to target your spell!'));
    return true; // combat continues but spell does nothing this round (mana NOT consumed)
  }

  // Deduct mana
  attacker.vitals.resource = (attacker.vitals.resource ?? 0) - spell.manaCost;
  sendEntityVitals(attacker);

  // Fizzle check — mana is consumed even on fizzle (3% auto-fizzle + difficulty check)
  if (isPlayerEntity(attacker)) {
    const playerSocket = attacker as unknown as AuthenticatedSocket;
    const classDef = await progressionRepo.getClassById(playerSocket.characterClass);
    const raceDef = await progressionRepo.getRaceById(playerSocket.characterRace);
    const raceBaseStats = {
      intelligence: raceDef?.base_stats?.intellect?.min ?? 40,
      wisdom: raceDef?.base_stats?.wisdom?.min ?? 40,
      charisma: raceDef?.base_stats?.charisma?.min ?? 40,
    };
    const equipment = await getEquipmentCombatStats(attacker.characterId!);
    const effectMods = getEffectModifiers(attacker);
    const spellcastingBonus = equipment.modifiers.spellcastingBonus + effectMods.spellcastingModifier;
    const spellcasting = calculateSpellcasting(
      classDef?.magic_level ?? 0, classDef?.magic_school,
      attacker.characterStats, raceBaseStats, attacker.characterLevel,
      spellcastingBonus,
    );
    if (!spellCastSucceeds(spell.castDifficulty, spellcasting)) {
      const fizzleMsg = spell.fizzleMessage || `Your ${spell.spellName} fizzles!`;
      sendCombatMessage(attacker, MessageType.OUTPUT, colors.red(fizzleMsg));
      const roomFizzle = spell.fizzleMessageRoom
        ? spell.fizzleMessageRoom.replace(/\{name\}/g, withNpcNameCapitalized(attacker.entityName, attacker.isProperName))
        : `${withNpcNameCapitalized(attacker.entityName, attacker.isProperName)}'s spell fizzles!`;
      broadcastCombatToRoom(attackerRoomId, roomFizzle, [attacker.entityId]);
      return true; // combat continues, spell just failed this round
    }
  }

  // Validate damage values
  if (!spell.minDamage || !spell.maxDamage || spell.minDamage <= 0 || spell.maxDamage <= 0) {
    return true; // no damage defined, skip but continue combat
  }

  // Calculate scaled damage range
  const statValue = getStatValueForScaling(attacker.characterStats, spell.damageScalingStat);
  const scaled = calculateSpellScaling(
    spell.minDamage, spell.maxDamage,
    attacker.characterLevel,
    spell.scalingPerLevel,
    statValue,
    spell.damageScalingFactor,
    spell.maxScalingLevel,
    spell.levelRequired,
  );

  const hitsPerCast = spell.hitsPerCast || 1;

  // Process each target
  for (const targetId of targets) {
    const target = resolveCombatTarget(targetId);
    if (!target) {
      targets.delete(targetId);
      continue;
    }

    // Check if target is still in the same room
    const targetRoomId = getEntityRoomId(target);
    if (targetRoomId !== attackerRoomId) {
      targets.delete(targetId);
      sendCombatMessage(attacker, MessageType.SYSTEM, `${withNpcNameCapitalized(target.entityName, target.isProperName)} is no longer here.`);
      continue;
    }

    const defName = withNpcName(target.entityName, target.isProperName);
    const atkName = withNpcNameCapitalized(attacker.entityName, attacker.isProperName);

    // Roll and apply each hit individually
    let targetDied = false;
    for (let hit = 0; hit < hitsPerCast; hit++) {
      if (target.vitals.hp <= 0) break;

      const hitDamage = Math.floor(Math.random() * (scaled.max - scaled.min + 1)) + scaled.min;
      const dmgStr = colors.combatDamage(hitDamage.toString());

      const attackerMsg = spell.hitMessageSelf
        ? spell.hitMessageSelf.replace(/\{target\}/g, defName).replace(/\{damage\}/g, dmgStr)
        : `You cast ${colors.cyan(spell.spellName)} at ${colors.combatDefender(defName)} for ${dmgStr} damage!`;
      const defenderMsg = spell.hitMessageTarget
        ? spell.hitMessageTarget.replace(/\{name\}/g, atkName).replace(/\{damage\}/g, dmgStr)
        : `${colors.combatAttacker(atkName)} casts ${colors.cyan(spell.spellName)} at you for ${dmgStr} damage!`;
      const roomMsg = spell.hitMessageRoom
        ? spell.hitMessageRoom.replace(/\{name\}/g, atkName).replace(/\{target\}/g, defName).replace(/\{damage\}/g, dmgStr)
        : `${colors.combatAttacker(atkName)} casts ${colors.cyan(spell.spellName)} at ${colors.combatDefender(defName)} for ${dmgStr} damage!`;

      sendCombatMessage(attacker, MessageType.OUTPUT, attackerMsg);
      sendCombatMessage(target, MessageType.OUTPUT, defenderMsg);
      broadcastCombatToRoom(attackerRoomId, roomMsg, [attacker.entityId, targetId]);

      const damageResult = await applyDamage(target, hitDamage, 'spell');

      if (damageResult.stateChange === 'dropped') {
        if (!isPlayerEntity(target)) {
          await handleEntityDeath(target, attacker, attackerRoomId, deferredRewards);
        } else {
          await handleEntityDropped(target, attacker, attackerRoomId);
        }
        targetDied = true;
        break;
      } else if (damageResult.stateChange === 'death') {
        await handleEntityDeath(target, attacker, attackerRoomId, deferredRewards);
        targetDied = true;
        break;
      } else {
        sendEntityVitals(target);
      }
    }

    // Apply status effect if the spell has one (e.g., burning, poisoned)
    if (!targetDied && spell.statusEffect && spell.effectDuration && target.vitals.hp > 0) {
      const effectDurationMs = spell.effectDuration * 1000;
      if (isPlayerEntity(target)) {
        await applyEffect(target as unknown as AuthenticatedSocket, spell.statusEffect, effectDurationMs, spell.spellId);
      } else {
        applyEffectToEntity(target, spell.statusEffect, effectDurationMs, spell.spellId);
      }
    }
  }

  return true;
}

/**
 * Process combat for a single attacker against their targets
 */
async function processAttackerCombat(
  attacker: CombatEntity,
  targets: Set<number>,
  combatConfig: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG
): Promise<void> {
  if (!connectedPlayersRef) return;

  // Players require characterId; NPCs don't (Phase 2)
  if (isPlayerEntity(attacker) && !attacker.characterId) return;

  // Collect deferred reward callbacks (XP/essence) to send after COMBAT OFF
  const deferredRewards: Array<() => Promise<void>> = [];

  // Check if using spell combat
  if (attacker.combatState.combatAction === 'spell' && attacker.combatState.activeSpell) {
    const combatContinues = await processSpellCombat(attacker, targets, deferredRewards);
    if (!combatContinues) {
      // Flush deferred rewards even when combat breaks (kill may have occurred)
      for (const reward of deferredRewards) {
        await reward();
      }
      return; // Combat was broken due to no mana
    }
    // If no targets remain after spell combat, end combat
    if (attacker.combatState.targets.size === 0) {
      attacker.regenState.inCombat = false;
      attacker.combatState.combatAction = 'melee';
      attacker.combatState.activeSpell = null;
      sendCombatMessage(attacker, MessageType.SYSTEM, colors.yellow('*COMBAT OFF*'));
    }
    // Flush deferred rewards (XP, essence) after combat state is resolved
    for (const reward of deferredRewards) {
      await reward();
    }
    return;
  }

  // Get attacker's combat stats via the provider
  const attackerStats = await getCombatStats(attacker);

  // Calculate attacker's energy for this round
  const energyFactors = {
    combatLevel: attacker.combatLevel,
    characterLevel: attacker.characterLevel,
    dexterity: attackerStats.effectiveDex,
    encumbranceRatio: attackerStats.encumbranceRatio,
  };

  // Apply energy modifier from status effects and equipment
  const energyMultiplier = 1 + ((attackerStats.effectModifiers.energyModifier + attackerStats.equipmentEnergyModifier) / 100);
  const roundEnergy = Math.floor(calculateRoundEnergy(energyFactors, combatConfig) * energyMultiplier);

  // Determine if attacker can see (room darkness + effective vision)
  const attackerRoomDarkness = getRoomDarkness(getEntityRoomId(attacker));
  const attackerCanSee = await entityCanSee(attacker, attackerRoomDarkness);
  const blindPenaltyValue = !attackerCanSee ? await getBlindAccuracyPenalty() : undefined;

  // Calculate attacker's accuracy with equipment and status effect bonuses
  const accuracyFactors = {
    characterLevel: attacker.characterLevel,
    combatLevel: attacker.combatLevel,
    dexterity: attackerStats.effectiveDex,
    intelligence: attackerStats.effectiveInt,
    charisma: attackerStats.effectiveCha,
    equipmentBonus: attackerStats.equipmentAccuracyBonus,
    spellModifier: attackerStats.effectModifiers.accuracyModifier,
    encumbrancePenalty: attackerStats.encumbranceRatio > 0.75 ? Math.floor((attackerStats.encumbranceRatio - 0.75) * 40) : 0,
    isBlind: !attackerCanSee,
    blindPenaltyValue,
  };

  const attackerAccuracy = calculateAccuracy(accuracyFactors, combatConfig);

  // Get weapon data from stat snapshot
  const baseWeaponSpeed = attackerStats.weapon.attackSpeed;
  const weaponMinDamage = attackerStats.weapon.minDamage;
  const weaponMaxDamage = attackerStats.weapon.maxDamage;

  // Calculate effective weapon cost (MajorMUD-style: level and combat reduce weapon cost)
  const effectiveWeaponCost = calculateEffectiveWeaponCost(
    baseWeaponSpeed,
    attacker.characterLevel,
    attacker.combatLevel
  );

  // Debug logging for swing calculations (enable with COMBAT_DEBUG=true in .env)
  if (process.env.COMBAT_DEBUG === 'true') {
    console.log(`[Combat Debug] ${attacker.entityName}: Level=${attacker.characterLevel}, Combat=${attacker.combatLevel}, STR=${attackerStats.effectiveStr}, DEX=${attackerStats.effectiveDex}, Weight=${attackerStats.totalWeight}, MaxCap=${attackerStats.effectiveStr * 48}, Enc=${(attackerStats.encumbranceRatio * 100).toFixed(1)}%, BaseSpeed=${baseWeaponSpeed}, EffectiveCost=${effectiveWeaponCost}, RoundEnergy=${roundEnergy}, ExpectedSwings=${Math.floor(roundEnergy / effectiveWeaponCost)}`);
  }

  // Calculate crit chance using MajorMUD-style formula
  const critFactors = {
    characterLevel: attacker.characterLevel,
    intelligence: attackerStats.effectiveInt,
    dexterity: attackerStats.effectiveDex,
    classCritBonus: attackerStats.classCritBonus,
    weaponCritModifier: attackerStats.weapon.critModifier,
    equipmentCritBonus: attackerStats.equipmentCritBonus,
    encumbranceRatio: attackerStats.encumbranceRatio,
  };
  const baseCritChance = calculateCritChance(critFactors) + attackerStats.effectModifiers.criticalChanceModifier;
  const critMultiplier = DEFAULT_CRIT_MULTIPLIER;

  const attackerRoomId = getEntityRoomId(attacker);

  // Process each target
  for (const targetId of targets) {
    const target = resolveCombatTarget(targetId);
    if (!target) {
      // Target disconnected, remove from targets
      targets.delete(targetId);
      continue;
    }

    // Check if target is still in the same room
    const targetRoomId = getEntityRoomId(target);
    if (targetRoomId !== attackerRoomId) {
      // Target left the room, remove from targets
      targets.delete(targetId);
      sendCombatMessage(attacker, MessageType.SYSTEM, `${withNpcNameCapitalized(target.entityName, target.isProperName)} is no longer here.`);
      continue;
    }

    // Get defender's combat stats via the provider
    // Players require characterId; NPCs will have pre-computed stats (Phase 2)
    if (isPlayerEntity(target) && !target.characterId) continue;
    const defenderStats = await getCombatStatsWithDodge(target);

    // Calculate defender's defense from equipped armor and status effects
    const defenseFactors = {
      armorClass: defenderStats.armor.totalArmorClass,
      perception: DEFAULT_PERCEPTION,  // TODO: Add perception stat to characters
      shadow: DEFAULT_SHADOW,          // TODO: Add shadow stat to characters
      equipmentBonus: defenderStats.equipmentDefenseBonus,
      spellModifier: defenderStats.effectModifiers.defenseModifier,
    };

    const targetDefense = calculateDefense(defenseFactors);

    // Apply damage modifier from status effects and equipment to weapon damage range
    const damageMultiplier = 1 + ((attackerStats.effectModifiers.damageModifier + attackerStats.equipmentDamageModifier) / 100);
    const minDamage = Math.max(1, Math.floor(weaponMinDamage * damageMultiplier));
    const maxDamage = Math.max(1, Math.floor(weaponMaxDamage * damageMultiplier));

    // Calculate defender's dodge chance (MajorMUD-style)
    let defenderDodgeChance = 0;
    if (defenderStats.classDodgeBonus > 0 || defenderStats.raceDodgeBonus > 0 || defenderStats.equipmentDodgeBonus > 0) {
      const dodgeFactors = {
        classDodgeBonus: defenderStats.classDodgeBonus,
        raceDodgeBonus: defenderStats.raceDodgeBonus,
        agility: defenderStats.effectiveDex,
        charm: defenderStats.effectiveCha,
        equipmentDodgeBonus: defenderStats.equipmentDodgeBonus,
        attackerAccuracy,
      };

      defenderDodgeChance = calculateDodgeChance(dodgeFactors) + defenderStats.effectModifiers.dodgeModifier;
    }

    // Execute combat round with actual equipment stats
    // Pass defender's current HP to stop combat when they reach 0
    const combatResult = executeCombatRound(
      attacker.entityName,
      target.entityName,
      attackerAccuracy,
      targetDefense,
      roundEnergy,
      attacker.combatState.carriedEnergy,
      effectiveWeaponCost,
      baseCritChance,
      minDamage,
      maxDamage,
      critMultiplier,
      defenderStats.armor.damageReduction,
      combatConfig,
      target.vitals.hp,
      defenderDodgeChance
    );

    // Update carried energy for next round
    attacker.combatState.carriedEnergy = combatResult.remainingEnergy;

    // Send combat messages
    const attackerMessages: string[] = [];
    const defenderMessages: string[] = [];
    const roomMessages: string[] = [];

    // Build weapon info for combat messages
    const weaponInfo: WeaponInfo = {
      name: attackerStats.weapon.weaponName,
      verbs: attackerStats.weapon.attackVerbs,
    };

    const atkEntity: SwingEntity = { name: attacker.entityName, isProperName: attacker.isProperName };
    const defEntity: SwingEntity = { name: target.entityName, isProperName: target.isProperName };

    for (const swing of combatResult.swings) {
      attackerMessages.push(formatSwingMessage(
        swing.result, swing.damage, atkEntity, defEntity, true, false, weaponInfo
      ));
      defenderMessages.push(formatSwingMessage(
        swing.result, swing.damage, atkEntity, defEntity, false, true, weaponInfo
      ));
      roomMessages.push(formatSwingMessage(
        swing.result, swing.damage, atkEntity, defEntity, false, false, weaponInfo
      ));
    }

    // Send messages to attacker
    if (attackerMessages.length > 0) {
      sendCombatMessage(attacker, MessageType.OUTPUT, attackerMessages.join('\r\n'));
    }

    // Send messages to defender
    if (defenderMessages.length > 0) {
      sendCombatMessage(target, MessageType.OUTPUT, defenderMessages.join('\r\n'));
    }

    // Broadcast to room (excluding attacker and defender)
    if (roomMessages.length > 0) {
      broadcastCombatToRoom(attackerRoomId, roomMessages.join('\r\n'), [attacker.entityId, targetId]);
    }

    // Apply damage to target using centralized handler
    if (combatResult.totalDamage > 0) {
      const damageResult = await applyDamage(target, combatResult.totalDamage, 'melee');

      // Handle state changes (dropped/death send vitals with updated status)
      if (damageResult.stateChange === 'dropped') {
        if (!isPlayerEntity(target)) {
          // NPCs die immediately at 0 HP — skip dropped state
          await handleEntityDeath(target, attacker, attackerRoomId, deferredRewards);
        } else {
          await handleEntityDropped(target, attacker, attackerRoomId);
        }
      } else if (damageResult.stateChange === 'death') {
        await handleEntityDeath(target, attacker, attackerRoomId, deferredRewards);
      } else {
        // Only send vitals here if no state change — dropped/death handlers send their own
        sendEntityVitals(target);
      }
    }
  }

  // If no targets remain, clear combat state
  if (attacker.combatState.targets.size === 0) {
    attacker.regenState.inCombat = false;
    sendCombatMessage(attacker, MessageType.SYSTEM, colors.yellow('*COMBAT OFF*'));
  }

  // Flush deferred rewards (XP, essence) after combat state is resolved
  for (const reward of deferredRewards) {
    await reward();
  }
}

/**
 * Handle entity dropping to the ground (HP <= 0, but above death threshold)
 * Entity is incapacitated but can be saved by allies
 */
async function handleEntityDropped(
  victim: CombatEntity,
  attacker: CombatEntity | null,
  roomId: number
): Promise<void> {
  if (!connectedPlayersRef) return;

  // Initialize dropped state
  initializeDroppedState(victim, roomId);

  // Clear combat state for victim (they can't fight while dropped)
  clearCombatState(victim, connectedPlayersRef);

  // Broadcast dropped message
  sendCombatMessage(victim, MessageType.SYSTEM, formatDroppedMessage());

  if (attacker) {
    sendCombatMessage(attacker, MessageType.SYSTEM, colors.boldGreen(`${withNpcNameCapitalized(victim.entityName, victim.isProperName)} collapses to the ground!`));
    broadcastCombatToRoom(
      roomId,
      colors.boldRed(`${withNpcNameCapitalized(victim.entityName, victim.isProperName)} collapses to the ground!`),
      [victim.entityId, attacker.entityId]
    );
  } else {
    // No attacker (DoT, environmental, etc.)
    broadcastCombatToRoom(
      roomId,
      colors.boldRed(`${withNpcNameCapitalized(victim.entityName, victim.isProperName)} collapses to the ground!`),
      [victim.entityId]
    );
  }

  sendEntityVitals(victim);
}

/**
 * Handle actual entity death (HP below death threshold)
 * For players: enters purgatory state, drops all items, must respawn
 * For NPCs (Phase 2): will handle loot drops and despawn
 */
async function handleEntityDeath(
  victim: CombatEntity,
  attacker: CombatEntity | null,
  roomId: number,
  deferredRewards: Array<() => Promise<void>> = []
): Promise<void> {
  if (!connectedPlayersRef) return;

  // Initialize dead state
  initializeDeadState(victim, roomId);

  // Snapshot all players who had this victim targeted BEFORE clearing combat state,
  // because clearCombatState removes the victim from everyone's target lists.
  // Only include players in the same room — players who left mid-fight don't get rewards.
  const combatParticipants: CombatEntity[] = [];
  if (!isPlayerEntity(victim)) {
    for (const [, socket] of connectedPlayersRef) {
      if (socket.combatState.targets.has(victim.entityId) && getEntityRoomId(socket) === roomId) {
        combatParticipants.push(socket);
      }
    }
    if (attacker && isPlayerEntity(attacker) && !combatParticipants.includes(attacker)) {
      combatParticipants.push(attacker);
    }
  }

  // Clear combat state for victim
  clearCombatState(victim, connectedPlayersRef);

  // Player-specific death behavior (item drops, purgatory messages)
  if (isPlayerEntity(victim) && victim.characterId) {
    // Drop all items on death
    try {
      const { dropAllItemsOnDeath } = await import('./itemCommands.js');
      await dropAllItemsOnDeath(victim.characterId, roomId);
    } catch (error) {
      console.error('[Combat] Failed to drop items on death:', error);
    }

    // Broadcast death message
    sendCombatMessage(victim, MessageType.SYSTEM, formatDeathMessage());

    if (attacker) {
      sendCombatMessage(attacker, MessageType.SYSTEM, colors.boldGreen(`You have slain ${withNpcName(victim.entityName, victim.isProperName)}!`));
      broadcastCombatToRoom(
        roomId,
        colors.boldRed(`${withNpcNameCapitalized(victim.entityName, victim.isProperName)} has been slain by ${withNpcName(attacker.entityName, attacker.isProperName)}!`),
        [victim.entityId, attacker.entityId]
      );
    } else {
      broadcastCombatToRoom(
        roomId,
        colors.boldRed(`${withNpcNameCapitalized(victim.entityName, victim.isProperName)} has died!`),
        [victim.entityId]
      );
    }
  } else if (!isPlayerEntity(victim)) {
    // NPC death: send slain message FIRST, then process loot/rewards
    if (attacker) {
      sendCombatMessage(attacker, MessageType.SYSTEM, colors.boldGreen(`You have slain ${withNpcName(victim.entityName, victim.isProperName)}!`));
      broadcastCombatToRoom(
        roomId,
        colors.boldRed(`${withNpcNameCapitalized(victim.entityName, victim.isProperName)} has been slain by ${withNpcName(attacker.entityName, attacker.isProperName)}!`),
        [victim.entityId, attacker.entityId]
      );
    } else {
      broadcastCombatToRoom(
        roomId,
        colors.boldRed(`${withNpcNameCapitalized(victim.entityName, victim.isProperName)} has died!`),
        [victim.entityId]
      );
    }

    // Process loot drops, despawn, respawn queue (XP/essence deferred)
    try {
      await processNpcDeath(victim as NpcCombatInstance, attacker, roomId, connectedPlayersRef, deferredRewards, combatParticipants);
    } catch (error) {
      console.error('[Combat] Failed to process NPC death:', error);
    }
  }

  sendEntityVitals(victim);
}

// Export for use by droppedStateManager, statusEffects (DoT deaths), and scroll damage
export { handleEntityDeath as handleActualDeath, handleEntityDropped as handleActualDropped };

/**
 * Process NPC spell combat.
 * Handles all spell types: OFFENSIVE, HEALING, BUFF, DEBUFF.
 * Called when the NPC behavior AI selects a spell instead of melee.
 */
async function processNpcSpellCombat(
  npc: NpcCombatInstance,
  selection: NpcSpellSelection,
  players: Map<number, AuthenticatedSocket>,
  _combatConfig: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG
): Promise<void> {
  if (!players) return;
  if (npc.vitals.hp <= 0) return;

  // Silenced NPCs cannot cast (safety net — AI already checks this)
  if (hasEffect(npc, 'silenced')) return;

  const spell = selection.npcSpell.spell;
  const npcRoomId = npc.currentRoomId;

  // Safety net: mana check (AI already filtered, but guard against races)
  if (npc.currentMana < spell.manaCost) return;

  // Deduct mana
  npc.currentMana -= spell.manaCost;
  npc.vitals.resource = npc.currentMana;

  // Telegraph message (broadcast to room before the spell fires)
  if (spell.telegraphMessage) {
    const msg = spell.telegraphMessage.replace(/\{name\}/g, npc.entityName);
    broadcastCombatToRoom(npcRoomId, colors.yellow(msg), []);
  }

  // Collect deferred rewards for kills caused by offensive spells
  const deferredRewards: Array<() => Promise<void>> = [];

  // Branch by spell type
  switch (spell.spellType) {
    case SpellType.OFFENSIVE: {
      await processNpcOffensiveSpell(npc, spell, npcRoomId, players, deferredRewards);
      break;
    }

    case SpellType.HEALING: {
      processNpcHealingSpell(npc, spell, npcRoomId);
      break;
    }

    case SpellType.BUFF: {
      processNpcBuffSpell(npc, spell, npcRoomId);
      break;
    }

    case SpellType.DEBUFF: {
      await processNpcDebuffSpell(npc, spell, npcRoomId, players);
      break;
    }

    default:
      break;
  }

  // Set cooldown
  setSpellCooldown(npc, selection.npcSpell.spellId, selection.npcSpell.cooldownRounds);

  // Send NPC vitals update (mana change)
  sendEntityVitals(npc);

  // If all targets are dead/gone, reset behavior
  if (npc.combatState.targets.size === 0) {
    resetNpcBehaviorState(npc);
  }

  // Flush deferred rewards
  for (const reward of deferredRewards) {
    await reward();
  }
}

/**
 * Get eligible player IDs in a room for AoE targeting.
 * Skips training-mode, dead, and dropped players.
 */
function getEligiblePlayersInRoom(
  roomId: number,
  players: Map<number, AuthenticatedSocket>
): number[] {
  const ids: number[] = [];
  for (const [playerId, socket] of players) {
    if (socket.isTraining) continue;
    if (getEntityRoomId(socket) !== roomId) continue;
    if (socket.vitals.hp <= 0) continue;
    ids.push(playerId);
  }
  return ids;
}

/**
 * Process an NPC offensive spell — deals damage to combat targets.
 * Replaces melee for the round (in_round timing).
 */
async function processNpcOffensiveSpell(
  npc: NpcCombatInstance,
  spell: NpcSpellSelection['npcSpell']['spell'],
  npcRoomId: number,
  players: Map<number, AuthenticatedSocket>,
  deferredRewards: Array<() => Promise<void>>
): Promise<void> {
  // No damage means this offensive spell has no direct damage component — skip
  if (!spell.minDamage || !spell.maxDamage) return;

  // NPCs never fizzle — they always cast successfully.
  // Magic resistance (reducing effect on target) will be a separate system.

  // NPC scaling uses template.spellPower as the universal stat value
  const scaled = calculateSpellScaling(
    spell.minDamage, spell.maxDamage,
    npc.characterLevel,
    spell.scalingPerLevel,
    npc.template.spellPower,
    spell.damageScalingFactor,
    spell.maxScalingLevel,
    spell.levelRequired,
  );
  const isAoE = spell.targetType === SpellTargetType.ROOM;
  const hitsPerCast = spell.hitsPerCast || 1;

  // Determine targets
  const targetIds: number[] = isAoE
    ? getEligiblePlayersInRoom(npcRoomId, players)
    : [...npc.combatState.targets];

  // AoE: single room broadcast before per-target damage
  if (isAoE && targetIds.length > 0) {
    broadcastCombatToRoom(
      npcRoomId,
      `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)}!`,
      targetIds // exclude targets — they get individual messages
    );
  }

  for (const targetId of targetIds) {
    const target = resolveCombatTarget(targetId);
    if (!target || target.vitals.hp <= 0) {
      npc.combatState.targets.delete(targetId);
      continue;
    }

    if (getEntityRoomId(target) !== npcRoomId) {
      npc.combatState.targets.delete(targetId);
      continue;
    }

    const atkName = withNpcNameCapitalized(npc.entityName, npc.isProperName);
    const defName = withNpcName(target.entityName, target.isProperName);

    // Roll and apply each hit individually
    let targetDied = false;
    for (let hit = 0; hit < hitsPerCast; hit++) {
      // Stop if target is dead/dropped
      if (target.vitals.hp <= 0) break;

      const hitDamage = Math.floor(Math.random() * (scaled.max - scaled.min + 1)) + scaled.min;
      sendCombatMessage(target, MessageType.OUTPUT,
        `${colors.combatAttacker(atkName)} casts ${colors.cyan(spell.name)} at you for ${colors.combatDamage(hitDamage.toString())} damage!`
      );

      if (!isAoE) {
        broadcastCombatToRoom(npcRoomId,
          `${colors.combatAttacker(atkName)} casts ${colors.cyan(spell.name)} at ${colors.combatDefender(defName)} for ${colors.combatDamage(hitDamage.toString())} damage!`,
          [targetId]
        );
      }

      const damageResult = await applyDamage(target, hitDamage, 'spell');

      if (damageResult.stateChange === 'dropped') {
        if (!isPlayerEntity(target)) {
          await handleEntityDeath(target, npc, npcRoomId, deferredRewards);
        } else {
          await handleEntityDropped(target, npc, npcRoomId);
        }
        targetDied = true;
        break;
      } else if (damageResult.stateChange === 'death') {
        await handleEntityDeath(target, npc, npcRoomId, deferredRewards);
        targetDied = true;
        break;
      } else {
        sendEntityVitals(target);
      }
    }

    // Apply status effect if the spell has one (e.g., burning, poisoned)
    if (!targetDied && spell.statusEffect && spell.effectDuration && target.vitals.hp > 0) {
      const effectDurationMs = spell.effectDuration * 1000;
      if (isPlayerEntity(target)) {
        await applyEffect(target as unknown as AuthenticatedSocket, spell.statusEffect, effectDurationMs, spell.id);
      } else {
        applyEffectToEntity(target, spell.statusEffect, effectDurationMs, spell.id);
      }
    }
  }
}

/**
 * Process an NPC healing spell — heals self (and optionally room NPCs).
 * Between-round timing: bonus action alongside melee.
 */
function processNpcHealingSpell(
  npc: NpcCombatInstance,
  spell: NpcSpellSelection['npcSpell']['spell'],
  npcRoomId: number
): void {
  const baseMin = spell.minHealing ?? 1;
  const baseMax = spell.maxHealing ?? 8;
  const scaled = calculateSpellScaling(
    baseMin, baseMax,
    npc.characterLevel,
    spell.scalingPerLevel,
    npc.template.spellPower,
    spell.healingScalingFactor,
    spell.maxScalingLevel,
    spell.levelRequired,
  );

  // Helper to heal a single NPC
  const healTarget = (target: NpcCombatInstance) => {
    const healAmount = Math.floor(Math.random() * (scaled.max - scaled.min + 1)) + scaled.min;
    const oldHp = target.vitals.hp;
    target.vitals.hp = Math.min(target.vitals.hp + healAmount, target.vitals.maxHp);
    const actualHeal = target.vitals.hp - oldHp;

    // Apply HoT effect if spell has one
    if (spell.statusEffect && spell.effectDuration) {
      applyEffectToEntity(target, spell.statusEffect, spell.effectDuration * 1000, spell.id);
    }

    return actualHeal;
  };

  if (spell.targetType === SpellTargetType.ROOM) {
    // AoE heal: all living NPCs in room — single room broadcast
    const roomNpcs = getNpcsInRoom(npcRoomId).filter(n => n.vitals.hp > 0);
    let anyHealed = false;
    for (const ally of roomNpcs) {
      if (healTarget(ally) > 0) anyHealed = true;
    }
    if (anyHealed) {
      broadcastCombatToRoom(
        npcRoomId,
        `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)}! Nearby allies are bathed in healing light!`,
        []
      );
    }
  } else {
    // Self-heal only
    const healed = healTarget(npc);
    if (healed > 0) {
      broadcastCombatToRoom(
        npcRoomId,
        `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)} and recovers ${colors.green(healed.toString())} HP!`,
        []
      );
    }
  }
}

/**
 * Process an NPC buff spell — applies status effect to self (and optionally room NPCs).
 * Between-round timing: bonus action alongside melee.
 */
function processNpcBuffSpell(
  npc: NpcCombatInstance,
  spell: NpcSpellSelection['npcSpell']['spell'],
  npcRoomId: number
): void {
  if (!spell.statusEffect) return;

  const durationMs = (spell.effectDuration ?? 60) * 1000;
  const effectDef = getEffectDefinition(spell.statusEffect);
  const effectName = effectDef?.name ?? spell.statusEffect;

  const applyBuff = (target: NpcCombatInstance) => {
    applyEffectToEntity(target, spell.statusEffect!, durationMs, spell.id);
  };

  if (spell.targetType === SpellTargetType.ROOM) {
    // AoE buff: all living NPCs in room
    const roomNpcs = getNpcsInRoom(npcRoomId).filter(n => n.vitals.hp > 0);
    for (const ally of roomNpcs) {
      applyBuff(ally);
    }
    broadcastCombatToRoom(
      npcRoomId,
      `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)}! Nearby allies are ${colors.yellow(effectName)}!`,
      []
    );
  } else {
    // Self-buff
    applyBuff(npc);
    broadcastCombatToRoom(
      npcRoomId,
      `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)} and is ${colors.yellow(effectName)}!`,
      []
    );
  }
}

/**
 * Process an NPC debuff spell — applies status effect to enemy targets.
 * Between-round timing: bonus action alongside melee.
 */
async function processNpcDebuffSpell(
  npc: NpcCombatInstance,
  spell: NpcSpellSelection['npcSpell']['spell'],
  npcRoomId: number,
  players: Map<number, AuthenticatedSocket>
): Promise<void> {
  if (!spell.statusEffect) return;

  const durationMs = (spell.effectDuration ?? 30) * 1000;
  const effectDef = getEffectDefinition(spell.statusEffect);
  const effectName = effectDef?.name ?? spell.statusEffect;

  const isAoE = spell.targetType === SpellTargetType.ROOM;
  const primaryTargetId = npc.combatState.targets.values().next().value;

  // Determine targets
  const targetIds: number[] = isAoE
    ? getEligiblePlayersInRoom(npcRoomId, players)
    : primaryTargetId !== undefined ? [primaryTargetId] : [];

  // AoE: single room broadcast before per-target effects
  const affectedIds: number[] = [];

  for (const targetId of targetIds) {
    const target = resolveCombatTarget(targetId);
    if (!target || target.vitals.hp <= 0) {
      npc.combatState.targets.delete(targetId);
      continue;
    }
    if (getEntityRoomId(target) !== npcRoomId) {
      npc.combatState.targets.delete(targetId);
      continue;
    }

    // Apply effect: use player-aware path for DB persistence, entity path for NPCs
    let applied: { success: boolean; message: string };
    if (isPlayerEntity(target)) {
      applied = await applyEffect(target as unknown as AuthenticatedSocket, spell.statusEffect, durationMs, spell.id);
    } else {
      applied = applyEffectToEntity(target, spell.statusEffect, durationMs, spell.id);
    }

    if (!applied.success) continue;
    affectedIds.push(targetId);

    // Per-target message (only sent when effect was actually applied)
    sendCombatMessage(target, MessageType.OUTPUT,
      `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)} on you! You are ${colors.red(effectName)}!`
    );
    sendEntityVitals(target);

    // Single-target: also broadcast to room observers
    if (!isAoE) {
      broadcastCombatToRoom(npcRoomId,
        `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)} on ${colors.combatDefender(withNpcName(target.entityName, target.isProperName))}!`,
        [targetId]
      );
    }
  }

  // AoE: single room broadcast (exclude affected targets — they got individual messages)
  if (isAoE && affectedIds.length > 0) {
    broadcastCombatToRoom(npcRoomId,
      `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)}! A dark energy fills the room!`,
      affectedIds
    );
  }
}

/**
 * Process combat for a single NPC attacker.
 * NPCs don't use the energy/weapon-speed system — they have static attacksPerRound.
 */
async function processNpcAttackerCombat(
  npc: NpcCombatInstance,
  combatConfig: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG,
  deferredRewards: Array<() => Promise<void>> = []
): Promise<void> {
  if (!connectedPlayersRef) return;

  // Skip if NPC was killed earlier this round
  if (npc.vitals.hp <= 0) return;

  const npcRoomId = npc.currentRoomId;

  // Get NPC's combat stats
  const npcStats = await getCombatStats(npc);

  // Select attack for this round
  const attack = selectNpcAttack(npc);
  if (!attack) return;

  // Determine if NPC can see (room darkness + effective vision)
  const npcRoomDarkness = getRoomDarkness(npcRoomId);
  const npcCanSee = await entityCanSee(npc, npcRoomDarkness);
  const npcBlindPenalty = !npcCanSee ? await getBlindAccuracyPenalty() : undefined;

  // Calculate NPC accuracy
  const accuracyFactors = {
    characterLevel: npc.characterLevel,
    combatLevel: npc.combatLevel,
    dexterity: npcStats.effectiveDex,
    intelligence: npcStats.effectiveInt,
    charisma: npcStats.effectiveCha,
    equipmentBonus: npc.template.baseAccuracy,
    spellModifier: npcStats.effectModifiers.accuracyModifier,
    encumbrancePenalty: 0,
    isBlind: !npcCanSee,
    blindPenaltyValue: npcBlindPenalty,
  };
  const npcAccuracy = calculateAccuracy(accuracyFactors, combatConfig);

  // NPCs only crit if the template explicitly grants a crit chance.
  // When baseCritChance is 0, skip the full calculation (which would add
  // level/stat/encumbrance bonuses that aren't appropriate for NPCs).
  let baseCritChance = 0;
  if (npc.template.baseCritChance > 0) {
    const critFactors = {
      characterLevel: npc.characterLevel,
      intelligence: npcStats.effectiveInt,
      dexterity: npcStats.effectiveDex,
      classCritBonus: npc.template.baseCritChance,
      weaponCritModifier: 0,
      equipmentCritBonus: 0,
      encumbranceRatio: 0,
    };
    baseCritChance = calculateCritChance(critFactors);
  }

  // Apply damage modifier from status effects
  const damageMultiplier = 1 + (npcStats.effectModifiers.damageModifier / 100);
  const minDamage = Math.max(1, Math.floor(attack.minDamage * damageMultiplier));
  const maxDamage = Math.max(1, Math.floor(attack.maxDamage * damageMultiplier));

  // Build weapon info for combat messages
  const weaponInfo: WeaponInfo = {
    name: attack.name,
    verbs: {
      hit: attack.hitVerb,
      hit_3p: attack.hitVerb3p,
      miss: attack.missVerb,
      miss_3p: attack.missVerb3p,
    },
    hitMessage: attack.hitMessage,
    missMessage: attack.missMessage,
  };

  // Pick a single target for this round's attacks. NPCs focus on one enemy at
  // a time rather than splitting attacks across all targets. Prune invalid
  // targets (disconnected, dead, left room) until we find a valid one.
  let target: CombatEntity | null = null;
  for (const targetId of new Set(npc.combatState.targets)) {
    const candidate = resolveCombatTarget(targetId);
    if (!candidate || candidate.vitals.hp <= 0) {
      npc.combatState.targets.delete(targetId);
      continue;
    }
    if (getEntityRoomId(candidate) !== npcRoomId) {
      npc.combatState.targets.delete(targetId);
      continue;
    }
    target = candidate;
    break;
  }

  if (!target) return;

  const targetId = target.entityId;

  // Get defender stats
  const defenderStats = await getCombatStatsWithDodge(target);
  const defenseFactors = {
    armorClass: defenderStats.armor.totalArmorClass,
    perception: DEFAULT_PERCEPTION,
    shadow: DEFAULT_SHADOW,
    equipmentBonus: defenderStats.equipmentDefenseBonus,
    spellModifier: defenderStats.effectModifiers.defenseModifier,
  };
  const targetDefense = calculateDefense(defenseFactors);

  // Calculate dodge chance
  let defenderDodgeChance = 0;
  if (defenderStats.classDodgeBonus > 0 || defenderStats.raceDodgeBonus > 0 || defenderStats.equipmentDodgeBonus > 0) {
    const dodgeFactors = {
      classDodgeBonus: defenderStats.classDodgeBonus,
      raceDodgeBonus: defenderStats.raceDodgeBonus,
      agility: defenderStats.effectiveDex,
      charm: defenderStats.effectiveCha,
      equipmentDodgeBonus: defenderStats.equipmentDodgeBonus,
      attackerAccuracy: npcAccuracy,
    };
    defenderDodgeChance = calculateDodgeChance(dodgeFactors);
  }

  let totalDamage = 0;
  const attackerMessages: string[] = [];
  const defenderMessages: string[] = [];
  const roomMessages: string[] = [];

  // Process each swing for this round
  for (let swing = 0; swing < attack.attacksPerRound; swing++) {
    // Stop attacking if target is already dead
    if (target.vitals.hp <= 0) break;

    const result = resolveAttack(npcAccuracy, targetDefense, baseCritChance, defenderDodgeChance);
    let damage = 0;

    if (result === AttackResult.HIT || result === AttackResult.CRITICAL) {
      damage = calculateDamage(
        minDamage,
        maxDamage,
        result === AttackResult.CRITICAL,
        DEFAULT_CRIT_MULTIPLIER,
        defenderStats.armor.damageReduction
      );
      totalDamage += damage;
    }

    const npcSwingEntity: SwingEntity = { name: npc.entityName, isProperName: npc.isProperName };
    const targetSwingEntity: SwingEntity = { name: target.entityName, isProperName: target.isProperName };
    attackerMessages.push(formatSwingMessage(result, damage, npcSwingEntity, targetSwingEntity, false, false, weaponInfo));
    defenderMessages.push(formatSwingMessage(result, damage, npcSwingEntity, targetSwingEntity, false, true, weaponInfo));
    roomMessages.push(formatSwingMessage(result, damage, npcSwingEntity, targetSwingEntity, false, false, weaponInfo));
  }

  // Send messages to defender (player)
  if (defenderMessages.length > 0) {
    sendCombatMessage(target, MessageType.OUTPUT, defenderMessages.join('\r\n'));
  }

  // Broadcast to room (excluding defender — NPC doesn't need messages)
  if (roomMessages.length > 0) {
    broadcastCombatToRoom(npcRoomId, roomMessages.join('\r\n'), [targetId]);
  }

  // Apply damage
  if (totalDamage > 0) {
    const damageResult = await applyDamage(target, totalDamage, 'melee');

    if (damageResult.stateChange === 'dropped') {
      if (!isPlayerEntity(target)) {
        // NPCs die immediately, skip dropped state
        await handleEntityDeath(target, npc, npcRoomId, deferredRewards);
      } else {
        await handleEntityDropped(target, npc, npcRoomId);
      }
    } else if (damageResult.stateChange === 'death') {
      await handleEntityDeath(target, npc, npcRoomId, deferredRewards);
    } else {
      sendEntityVitals(target);
    }
  }

  // If no targets remain, clear NPC combat state
  if (npc.combatState.targets.size === 0) {
    resetNpcBehaviorState(npc);
  }

  // Flush deferred rewards (XP, essence)
  for (const reward of deferredRewards) {
    await reward();
  }
}

/**
 * Process a single combat round for all entities in combat.
 */
async function processCombatRound(): Promise<void> {
  if (!connectedPlayersRef) return;

  try {
    // Load combat settings from database (cached)
    const settings = await getCombatSettings();
    const combatConfig = toRuntimeConfig(settings);

    // Collect all combatants into a unified array
    interface CombatParticipant {
      entity: CombatEntity;
      isNpc: boolean;
    }
    const participants: CombatParticipant[] = [];

    for (const [, socket] of connectedPlayersRef) {
      if (socket.combatState.targets.size > 0) {
        participants.push({ entity: socket, isNpc: false });
      }
    }
    for (const npc of getAllNpcInstances()) {
      if (npc.combatState.targets.size > 0 && npc.vitals.hp > 0) {
        participants.push({ entity: npc, isNpc: true });
      }
    }

    // Sort by combatOrderPosition (ascending), then entityId for stability
    participants.sort((a, b) => {
      const posA = a.entity.combatState.combatOrderPosition;
      const posB = b.entity.combatState.combatOrderPosition;
      if (posA !== posB) return posA - posB;
      return a.entity.entityId - b.entity.entityId;
    });

    // Snapshot which entities had a penalty at round start so we only
    // reset those at round end (not fresh penalties set mid-round by re-engage)
    const penaltyServed = new Set<number>();
    for (const { entity } of participants) {
      if (entity.combatState.combatOrderPosition > 0) {
        penaltyServed.add(entity.entityId);
      }
    }

    // Track NPCs that need to collect cooldown/round updates
    const combatNpcs: NpcCombatInstance[] = [];

    // Track NPCs whose between-round spell defers their melee to end of round
    const deferredMelee: NpcCombatInstance[] = [];

    // Process each participant in combat order
    for (const { entity, isNpc } of participants) {
      try {
        // blocksCombat: stunned/paralyzed entities skip their turn
        if (getEffectModifiers(entity).blocksCombat) {
          continue;
        }

        if (isNpc) {
          const npc = entity as NpcCombatInstance;
          combatNpcs.push(npc);

          const action = processNpcBehavior(npc, connectedPlayersRef);

          if (action.type === 'spell') {
            // Snapshot targets BEFORE spell execution so re-engage uses the
            // pre-spell target set (defensive against future spell types that
            // might remove targets during execution).
            const previousTargets = action.spell.selectionType === 'between_round'
              ? new Set(npc.combatState.targets) : null;

            await processNpcSpellCombat(npc, action.spell, connectedPlayersRef, combatConfig);

            if (previousTargets) {
              // Between-round spell: cast utility then continue melee.
              // Combat break clears offensive state, then auto-re-engage.
              breakCasterCombat(npc);

              // Auto-re-engage: restore targets that are still valid
              for (const targetId of previousTargets) {
                const target = resolveCombatTarget(targetId);
                if (target && target.vitals.hp > 0 && getEntityRoomId(target) === npc.currentRoomId) {
                  npc.combatState.targets.add(targetId);
                }
              }

              // Defer melee to end of round so other participants act first
              if (npc.vitals.hp > 0 && npc.combatState.targets.size > 0) {
                deferredMelee.push(npc);
              }
            }
            // In-round spells (offensive with damage): spell replaces melee
          } else if (action.type === 'attack') {
            await processNpcAttackerCombat(npc, combatConfig);
          }
        } else {
          // Player combat (unchanged logic)
          await processAttackerCombat(entity, entity.combatState.targets, combatConfig);
        }
      } catch (error) {
        console.error(`[Combat] Error processing combat for ${entity.entityName}:`, error);
      }
    }

    // Between-round spell NPCs get their melee swing after all other participants
    for (const npc of deferredMelee) {
      try {
        if (npc.vitals.hp > 0 && npc.combatState.targets.size > 0) {
          await processNpcAttackerCombat(npc, combatConfig);
        }
      } catch (error) {
        console.error(`[Combat] Error processing deferred melee for ${npc.entityName}:`, error);
      }
    }

    // Reset combatOrderPosition only for entities that had a penalty at round start.
    // Fresh penalties set mid-round (e.g. player re-engage between ticks) are preserved
    // so they apply to the next round as intended.
    for (const { entity } of participants) {
      if (penaltyServed.has(entity.entityId)) {
        entity.combatState.combatOrderPosition = 0;
      }
    }

    // Decrement spell cooldowns and increment round counters for combat NPCs
    for (const npc of combatNpcs) {
      if (npc.vitals.hp <= 0 || npc.behaviorState !== 'combat') continue;
      for (const [spellId, remaining] of npc.spellCooldowns) {
        if (remaining <= 1) {
          npc.spellCooldowns.delete(spellId);
        } else {
          npc.spellCooldowns.set(spellId, remaining - 1);
        }
      }
      npc.combatRoundCount++;
    }

    // Process behavior for fleeing/returning NPCs that have no targets
    // (they aren't in the attackers list but still need behavior ticks)
    for (const npc of getAllNpcInstances()) {
      if (npc.vitals.hp <= 0) continue;
      if ((npc.behaviorState === 'fleeing' || npc.behaviorState === 'returning')
          && npc.combatState.targets.size === 0) {
        try {
          processNpcBehavior(npc, connectedPlayersRef);
        } catch (error) {
          console.error(`[Combat] Error processing NPC behavior for ${npc.entityName}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[Combat] Error processing combat round:', error);
  }
}
