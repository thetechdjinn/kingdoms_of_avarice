/**
 * Combat Loop Module
 *
 * Manages the global combat timer and processes combat rounds for all players.
 * Uses CombatEntity interface so both players and NPCs can participate.
 */

import { MessageType, AttackResult, SpellScalingStat, SpellType, SpellTargetType, AttackVerbs } from '@koa/shared';
import { AuthenticatedSocket, sendVitals as sendPlayerVitals } from './socket.js';
import type { CombatEntity } from './combatEntity.js';
import { isPlayerEntity, getEntityRoomId } from './combatEntity.js';
import { getAllNpcInstances, getNpcInstance, getNpcsInRoom, resetNpcBehaviorState } from './npcManager.js';
import type { NpcCombatInstance } from './npcManager.js';
import { processNpcBehavior } from './npcBehavior.js';
import { setSpellCooldown } from './npcSpellAI.js';
import type { NpcSpellSelection } from './npcSpellAI.js';
import { selectNpcAttack } from './combatStatProvider.js';
import { processNpcDeath } from './npcDeathHandler.js';
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
  parseDiceString,
  RuntimeCombatConfig,
  toRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
} from './combatCalculations.js';
import { getCombatSettings } from '../db/repositories/settingsRepository.js';
import { clearCombatState } from './combatCommands.js';
import {
  applyDamage,
  initializeDroppedState,
  initializeDeadState,
  formatDroppedMessage,
  formatDeathMessage,
} from './damageHandler.js';
import { getCombatStats, getCombatStatsWithDodge } from './combatStatProvider.js';
import { applyEffect, applyEffectToEntity, getEffectDefinition, hasEffect } from './statusEffects.js';
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
function getStatValueForScaling(
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
    default:
      return 0;
  }
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

  switch (result) {
    case AttackResult.CRITICAL:
      if (isAttacker) {
        return `You ${colors.combatCritical('critically')} ${colors.combatHit(hitVerb1p)} ${colors.combatDefender(defObject)} for ${colors.combatDamage(damage.toString())} damage!`;
      } else if (isDefender) {
        return `${colors.combatAttacker(atkSubject)} ${colors.combatCritical('critically')} ${colors.combatHit(hitVerb3p)} you for ${colors.combatDamage(damage.toString())} damage!`;
      }
      return `${colors.combatAttacker(atkSubject)} ${colors.combatCritical('critically')} ${colors.combatHit(hitVerb3p)} ${colors.combatDefender(defObject)} for ${colors.combatDamage(damage.toString())} damage!`;

    case AttackResult.HIT:
      if (isAttacker) {
        return `You ${colors.combatHit(hitVerb1p)} ${colors.combatDefender(defObject)} for ${colors.combatDamage(damage.toString())} damage.`;
      } else if (isDefender) {
        return `${colors.combatAttacker(atkSubject)} ${colors.combatHit(hitVerb3p)} you for ${colors.combatDamage(damage.toString())} damage.`;
      }
      return `${colors.combatAttacker(atkSubject)} ${colors.combatHit(hitVerb3p)} ${colors.combatDefender(defObject)} for ${colors.combatDamage(damage.toString())} damage.`;

    case AttackResult.MISS:
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

  // Deduct mana
  attacker.vitals.resource = (attacker.vitals.resource ?? 0) - spell.manaCost;
  sendEntityVitals(attacker);

  // Parse spell damage dice
  const { min: minDamage, max: maxDamage } = parseDiceString(spell.damageDice);

  // Calculate scaling bonus from caster's stats
  let scalingBonus = 0;
  if (spell.damageScalingStat && spell.damageScalingFactor) {
    const statValue = getStatValueForScaling(attacker.characterStats, spell.damageScalingStat);
    scalingBonus = Math.floor(statValue * spell.damageScalingFactor);
  }

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

    // Roll spell damage (no miss chance for spells - they always hit) + scaling bonus
    const baseDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
    const damage = baseDamage + scalingBonus;

    // Send spell messages
    const attackerMsg = `You cast ${colors.cyan(spell.spellName)} at ${colors.combatDefender(withNpcName(target.entityName, target.isProperName))} for ${colors.combatDamage(damage.toString())} damage!`;
    const defenderMsg = `${colors.combatAttacker(withNpcNameCapitalized(attacker.entityName, attacker.isProperName))} casts ${colors.cyan(spell.spellName)} at you for ${colors.combatDamage(damage.toString())} damage!`;
    const roomMsg = `${colors.combatAttacker(withNpcNameCapitalized(attacker.entityName, attacker.isProperName))} casts ${colors.cyan(spell.spellName)} at ${colors.combatDefender(withNpcName(target.entityName, target.isProperName))} for ${colors.combatDamage(damage.toString())} damage!`;

    sendCombatMessage(attacker, MessageType.OUTPUT, attackerMsg);
    sendCombatMessage(target, MessageType.OUTPUT, defenderMsg);
    broadcastCombatToRoom(attackerRoomId, roomMsg, [attacker.entityId, targetId]);

    // Apply damage using centralized handler
    const damageResult = await applyDamage(target, damage, 'spell');

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

  // Apply energy modifier from status effects
  const energyMultiplier = 1 + (attackerStats.effectModifiers.energyModifier / 100);
  const roundEnergy = Math.floor(calculateRoundEnergy(energyFactors, combatConfig) * energyMultiplier);

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
    isBlind: attackerStats.effectModifiers.isBlind,
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

  // Debug logging for swing calculations
  console.log(`[Combat Debug] ${attacker.entityName}: Level=${attacker.characterLevel}, Combat=${attacker.combatLevel}, STR=${attackerStats.effectiveStr}, DEX=${attackerStats.effectiveDex}, Weight=${attackerStats.totalWeight}, MaxCap=${attackerStats.effectiveStr * 48}, Enc=${(attackerStats.encumbranceRatio * 100).toFixed(1)}%, BaseSpeed=${baseWeaponSpeed}, EffectiveCost=${effectiveWeaponCost}, RoundEnergy=${roundEnergy}, ExpectedSwings=${Math.floor(roundEnergy / effectiveWeaponCost)}`);

  // Calculate crit chance using MajorMUD-style formula
  const critFactors = {
    characterLevel: attacker.characterLevel,
    intelligence: attackerStats.effectiveInt,
    dexterity: attackerStats.effectiveDex,
    classCritBonus: attackerStats.classCritBonus,
    weaponCritModifier: attackerStats.weapon.critModifier,
    equipmentCritBonus: 0, // TODO: Add equipment crit bonuses when implemented
    encumbranceRatio: attackerStats.encumbranceRatio,
  };
  const baseCritChance = calculateCritChance(critFactors);
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
      equipmentBonus: defenderStats.equipmentAccuracyBonus,
      spellModifier: defenderStats.effectModifiers.defenseModifier,
    };

    const targetDefense = calculateDefense(defenseFactors);

    // Apply damage modifier from status effects to weapon damage range
    const damageMultiplier = 1 + (attackerStats.effectModifiers.damageModifier / 100);
    const minDamage = Math.max(1, Math.floor(weaponMinDamage * damageMultiplier));
    const maxDamage = Math.max(1, Math.floor(weaponMaxDamage * damageMultiplier));

    // Calculate defender's dodge chance (MajorMUD-style)
    let defenderDodgeChance = 0;
    if (defenderStats.classDodgeBonus > 0 || defenderStats.raceDodgeBonus > 0) {
      // TODO: Add equipment dodge bonus when implemented on items
      const equipmentDodgeBonus = 0;

      const dodgeFactors = {
        classDodgeBonus: defenderStats.classDodgeBonus,
        raceDodgeBonus: defenderStats.raceDodgeBonus,
        agility: defenderStats.effectiveDex,
        charm: defenderStats.effectiveCha,
        equipmentDodgeBonus,
        attackerAccuracy,
      };

      defenderDodgeChance = calculateDodgeChance(dodgeFactors);
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
      await processNpcDeath(victim as NpcCombatInstance, attacker, roomId, connectedPlayersRef, deferredRewards);
    } catch (error) {
      console.error('[Combat] Failed to process NPC death:', error);
    }
  }

  sendEntityVitals(victim);
}

// Export for use by droppedStateManager and statusEffects (DoT deaths)
export { handleEntityDeath as handleActualDeath };

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
  // No damage dice means this offensive spell has no direct damage component — skip
  if (!spell.damageDice) return;

  const { min: minDmg, max: maxDmg } = parseDiceString(spell.damageDice);
  const isAoE = spell.targetType === SpellTargetType.ROOM;

  // NPC scaling uses template.spellPower as the universal stat value
  let scalingBonus = 0;
  if (spell.damageScalingFactor) {
    scalingBonus = Math.floor(npc.template.spellPower * spell.damageScalingFactor);
  }

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

    // Roll damage
    const baseDamage = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
    const damage = baseDamage + scalingBonus;

    // Per-target message
    sendCombatMessage(target, MessageType.OUTPUT,
      `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)} at you for ${colors.combatDamage(damage.toString())} damage!`
    );

    // Single-target: also broadcast to room observers
    if (!isAoE) {
      broadcastCombatToRoom(npcRoomId,
        `${colors.combatAttacker(withNpcNameCapitalized(npc.entityName, npc.isProperName))} casts ${colors.cyan(spell.name)} at ${colors.combatDefender(withNpcName(target.entityName, target.isProperName))} for ${colors.combatDamage(damage.toString())} damage!`,
        [targetId]
      );
    }

    // Apply damage
    const damageResult = await applyDamage(target, damage, 'spell');

    if (damageResult.stateChange === 'dropped') {
      if (!isPlayerEntity(target)) {
        await handleEntityDeath(target, npc, npcRoomId, deferredRewards);
      } else {
        await handleEntityDropped(target, npc, npcRoomId);
      }
    } else if (damageResult.stateChange === 'death') {
      await handleEntityDeath(target, npc, npcRoomId, deferredRewards);
    } else {
      sendEntityVitals(target);
    }

    // Apply status effect if the spell has one (e.g., burning, poisoned)
    if (spell.statusEffect && spell.effectDuration && target.vitals.hp > 0) {
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
  const { min: minHeal, max: maxHeal } = parseDiceString(spell.healingDice || '1d8');

  // NPC scaling uses template.spellPower
  let scalingBonus = 0;
  if (spell.healingScalingFactor) {
    scalingBonus = Math.floor(npc.template.spellPower * spell.healingScalingFactor);
  }

  // Helper to heal a single NPC
  const healTarget = (target: NpcCombatInstance) => {
    const baseHeal = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;
    const healAmount = baseHeal + scalingBonus;
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

  // Deduct mana for the attack
  if (attack.manaCost > 0) {
    npc.currentMana -= attack.manaCost;
    if (npc.vitals.resource !== undefined) {
      npc.vitals.resource = npc.currentMana;
    }
  }

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
    isBlind: npcStats.effectModifiers.isBlind,
  };
  const npcAccuracy = calculateAccuracy(accuracyFactors, combatConfig);

  // Calculate crit chance
  const critFactors = {
    characterLevel: npc.characterLevel,
    intelligence: npcStats.effectiveInt,
    dexterity: npcStats.effectiveDex,
    classCritBonus: npc.template.baseCritChance,
    weaponCritModifier: 0,
    equipmentCritBonus: 0,
    encumbranceRatio: 0,
  };
  const baseCritChance = calculateCritChance(critFactors);

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
  };

  // Process each target for each attack-per-round
  for (const targetId of new Set(npc.combatState.targets)) {
    const target = resolveCombatTarget(targetId);
    if (!target) {
      npc.combatState.targets.delete(targetId);
      continue;
    }

    // Skip targets already dead (killed earlier this round by another attacker)
    if (target.vitals.hp <= 0) {
      npc.combatState.targets.delete(targetId);
      continue;
    }

    // Check if target is still in the same room
    const targetRoomId = getEntityRoomId(target);
    if (targetRoomId !== npcRoomId) {
      npc.combatState.targets.delete(targetId);
      continue;
    }

    // Get defender stats
    const defenderStats = await getCombatStatsWithDodge(target);
    const defenseFactors = {
      armorClass: defenderStats.armor.totalArmorClass,
      perception: DEFAULT_PERCEPTION,
      shadow: DEFAULT_SHADOW,
      equipmentBonus: defenderStats.equipmentAccuracyBonus,
      spellModifier: defenderStats.effectModifiers.defenseModifier,
    };
    const targetDefense = calculateDefense(defenseFactors);

    // Calculate dodge chance
    let defenderDodgeChance = 0;
    if (defenderStats.classDodgeBonus > 0 || defenderStats.raceDodgeBonus > 0) {
      const dodgeFactors = {
        classDodgeBonus: defenderStats.classDodgeBonus,
        raceDodgeBonus: defenderStats.raceDodgeBonus,
        agility: defenderStats.effectiveDex,
        charm: defenderStats.effectiveCha,
        equipmentDodgeBonus: 0,
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

    // Collect all player attackers who have targets
    const playerAttackers: CombatEntity[] = [];
    for (const [, socket] of connectedPlayersRef) {
      if (socket.combatState.targets.size > 0) {
        playerAttackers.push(socket);
      }
    }

    // Collect NPC attackers who have targets
    const npcAttackers: NpcCombatInstance[] = [];
    for (const npc of getAllNpcInstances()) {
      if (npc.combatState.targets.size > 0 && npc.vitals.hp > 0) {
        npcAttackers.push(npc);
      }
    }

    // Process combat for each player attacker (await all before NPC attacks
    // so that kills take effect before NPCs get their turn)
    for (const attacker of playerAttackers) {
      try {
        await processAttackerCombat(attacker, attacker.combatState.targets, combatConfig);
      } catch (error) {
        console.error(`[Combat] Error processing combat for ${attacker.entityName}:`, error);
      }
    }

    // Process combat for each NPC attacker (behavior check first)
    for (const npc of npcAttackers) {
      try {
        const action = processNpcBehavior(npc, connectedPlayersRef);
        if (action.type === 'spell') {
          try {
            await processNpcSpellCombat(npc, action.spell, connectedPlayersRef, combatConfig);
            // Between-round spells are a bonus action — NPC still gets melee
            if (action.spell.selectionType === 'between_round' && npc.vitals.hp > 0 && npc.combatState.targets.size > 0) {
              await processNpcAttackerCombat(npc, combatConfig);
            }
          } catch (error) {
            console.error(`[Combat] Error processing NPC spell for ${npc.entityName}:`, error);
          }
        } else if (action.type === 'attack') {
          try {
            await processNpcAttackerCombat(npc, combatConfig);
          } catch (error) {
            console.error(`[Combat] Error processing NPC combat for ${npc.entityName}:`, error);
          }
        }
      } catch (error) {
        console.error(`[Combat] Error processing NPC behavior for ${npc.entityName}:`, error);
      }
    }

    // Decrement spell cooldowns and increment round counters for combat NPCs
    for (const npc of npcAttackers) {
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
