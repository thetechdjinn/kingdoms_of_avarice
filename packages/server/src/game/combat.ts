/**
 * Combat Loop Module
 *
 * Manages the global combat timer and processes combat rounds for all players.
 */

import { MessageType, GameMessage, AttackResult, SpellScalingStat, AttackVerbs } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { getEffectModifiers, hasEffect } from './statusEffects.js';
import {
  calculateRoundEnergy,
  calculateAccuracy,
  calculateDefense,
  calculateCritChance,
  calculateDodgeChance,
  calculateEffectiveWeaponCost,
  executeCombatRound,
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
  isPlayerDropped,
  isPlayerDead,
  formatDroppedMessage,
  formatDeathMessage,
} from './damageHandler.js';
import {
  getEquipmentCombatStats,
  calculateEncumbranceRatio,
  getEquipmentAccuracyBonus,
} from './combatStats.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { getRespawnRoomId } from '../services/respawnService.js';

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

// Default combat values (used when equipment/stats not yet implemented)
// TODO: Replace these with actual equipment/stat lookups in Phase 3
const DEFAULT_ENCUMBRANCE_RATIO = 0.5;  // 50% encumbrance baseline
const DEFAULT_EQUIPMENT_BONUS = 0;
const DEFAULT_SPELL_MODIFIER = 0;
const DEFAULT_WEAPON_SPEED = 7500;
const DEFAULT_UNARMED_DAMAGE = '1d6';
const DEFAULT_BASE_CRIT_CHANCE = 5;     // 5% base crit chance
const DEFAULT_CRIT_MULTIPLIER = 2.0;
const DEFAULT_ARMOR_CLASS = 10;
const DEFAULT_PERCEPTION = 0;
const DEFAULT_SHADOW = 0;
const DEFAULT_DAMAGE_REDUCTION = 0;

let combatInterval: NodeJS.Timeout | null = null;
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
  combatInterval = setInterval(processCombatRound, COMBAT_ROUND_MS);
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
    console.log('[Combat] Stopped combat loop');
  }
}

/**
 * Send a message to a specific socket
 */
function sendToSocket(socket: AuthenticatedSocket, type: MessageType, payload: string): void {
  const message: GameMessage = { type, payload, timestamp: Date.now() };
  socket.send(JSON.stringify(message));
}

/**
 * Send vitals update to a socket
 */
function sendVitals(socket: AuthenticatedSocket): void {
  const message: GameMessage = {
    type: MessageType.VITALS,
    payload: JSON.stringify(socket.vitals),
    timestamp: Date.now(),
  };
  socket.send(JSON.stringify(message));
}

/**
 * Broadcast a message to all players in a room except one
 */
function broadcastToRoomExcept(
  roomId: number,
  message: string,
  excludePlayerIds: number[]
): void {
  if (!connectedPlayersRef) return;

  const gameMessage: GameMessage = {
    type: MessageType.OUTPUT,
    payload: message,
    timestamp: Date.now(),
  };

  for (const [playerId, socket] of connectedPlayersRef) {
    if (!excludePlayerIds.includes(playerId) && getPlayerLocation(playerId) === roomId) {
      socket.send(JSON.stringify(gameMessage));
    }
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
function formatSwingMessage(
  result: AttackResult,
  damage: number,
  attackerName: string,
  defenderName: string,
  isAttacker: boolean,
  isDefender: boolean,
  weapon?: WeaponInfo
): string {
  const attacker = isAttacker ? 'You' : attackerName;
  const defender = isDefender ? 'you' : defenderName;
  const attackerPossessive = isAttacker ? 'Your' : `${attackerName}'s`;

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
        return `You ${colors.combatCritical('critically')} ${colors.combatHit(hitVerb1p)} ${colors.combatDefender(defenderName)} for ${colors.combatDamage(damage.toString())} damage!`;
      } else if (isDefender) {
        return `${colors.combatAttacker(attackerName)} ${colors.combatCritical('critically')} ${colors.combatHit(hitVerb3p)} you for ${colors.combatDamage(damage.toString())} damage!`;
      }
      return `${attackerName} critically ${hitVerb3p} ${defenderName} for ${damage} damage!`;

    case AttackResult.HIT:
      if (isAttacker) {
        return `You ${colors.combatHit(hitVerb1p)} ${colors.combatDefender(defenderName)} for ${colors.combatDamage(damage.toString())} damage.`;
      } else if (isDefender) {
        return `${colors.combatAttacker(attackerName)} ${colors.combatHit(hitVerb3p)} you for ${colors.combatDamage(damage.toString())} damage.`;
      }
      return `${attackerName} ${hitVerb3p} ${defenderName} for ${damage} damage.`;

    case AttackResult.MISS:
      if (isUnarmed) {
        // Unarmed: "You swing at Goblin, but miss."
        if (isAttacker) {
          return `You ${colors.combatMiss(missVerb1p)} ${colors.combatDefender(defenderName)}, but miss.`;
        } else if (isDefender) {
          return `${colors.combatAttacker(attackerName)} ${colors.combatMiss(missVerb3p)} you, but misses.`;
        }
        return `${attackerName} ${missVerb3p} ${defenderName}, but misses.`;
      } else {
        // Armed: "You swing your battle axe at Goblin, but miss."
        if (isAttacker) {
          return `You ${colors.combatMiss(missVerb1p)} ${colors.combatDefender(defenderName)} with your ${colors.item(weaponName)}, but miss.`;
        } else if (isDefender) {
          return `${colors.combatAttacker(attackerName)} ${colors.combatMiss(missVerb3p)} you with their ${colors.item(weaponName)}, but misses.`;
        }
        return `${attackerName} ${missVerb3p} ${defenderName} with their ${colors.item(weaponName)}, but misses.`;
      }

    case AttackResult.DODGE:
      if (isAttacker) {
        return `${colors.combatDefender(defenderName)} ${colors.combatDodge('dodges')} your attack.`;
      } else if (isDefender) {
        return `You ${colors.combatDodge('dodge')} ${colors.combatAttacker(attackerName)}'s attack!`;
      }
      return `${defenderName} dodges ${attackerPossessive} attack.`;

    case AttackResult.PARRY:
      if (isDefender) {
        return `You ${colors.combatDodge('parry')} ${colors.combatAttacker(attackerName)}'s attack!`;
      }
      return `${defenderName} parries ${attackerPossessive} attack.`;

    case AttackResult.BLOCK:
      if (isDefender) {
        return `You ${colors.combatDodge('block')} ${colors.combatAttacker(attackerName)}'s attack!`;
      }
      return `${defenderName} blocks ${attackerPossessive} attack.`;

    default:
      return `${attacker} attacks ${defender}.`;
  }
}

/**
 * Process spell combat for a single attacker
 * Returns true if combat should continue, false if combat was broken
 */
async function processSpellCombat(
  attacker: AuthenticatedSocket,
  targets: Set<number>
): Promise<boolean> {
  if (!connectedPlayersRef) return false;
  if (!attacker.combatState.activeSpell) return false;

  const spell = attacker.combatState.activeSpell;
  const attackerRoomId = getPlayerLocation(attacker.playerId);

  // Check if we have enough mana
  if ((attacker.vitals.resource ?? 0) < spell.manaCost) {
    // Not enough mana - break combat
    sendToSocket(attacker, MessageType.SYSTEM, colors.red(`You don't have enough mana to cast ${spell.spellName}!`));
    sendToSocket(attacker, MessageType.SYSTEM, colors.yellow('*COMBAT OFF*'));

    // Clear combat state
    clearCombatState(attacker, connectedPlayersRef);
    return false;
  }

  // Deduct mana
  attacker.vitals.resource = (attacker.vitals.resource ?? 0) - spell.manaCost;
  sendVitals(attacker);

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
    const target = connectedPlayersRef.get(targetId);
    if (!target) {
      targets.delete(targetId);
      continue;
    }

    // Check if target is still in the same room
    const targetRoomId = getPlayerLocation(targetId);
    if (targetRoomId !== attackerRoomId) {
      targets.delete(targetId);
      sendToSocket(attacker, MessageType.SYSTEM, `${target.username} is no longer here.`);
      continue;
    }

    // Roll spell damage (no miss chance for spells - they always hit) + scaling bonus
    const baseDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
    const damage = baseDamage + scalingBonus;

    // Send spell messages
    const attackerMsg = `You cast ${colors.cyan(spell.spellName)} at ${colors.combatDefender(target.username)} for ${colors.combatDamage(damage.toString())} damage!`;
    const defenderMsg = `${colors.combatAttacker(attacker.username)} casts ${colors.cyan(spell.spellName)} at you for ${colors.combatDamage(damage.toString())} damage!`;
    const roomMsg = `${attacker.username} casts ${spell.spellName} at ${target.username} for ${damage} damage!`;

    sendToSocket(attacker, MessageType.OUTPUT, attackerMsg);
    sendToSocket(target, MessageType.OUTPUT, defenderMsg);
    broadcastToRoomExcept(attackerRoomId, roomMsg, [attacker.playerId, targetId]);

    // Apply damage using centralized handler
    const damageResult = await applyDamage(target, damage, 'spell');
    sendVitals(target);

    // Handle state changes
    if (damageResult.stateChange === 'dropped') {
      await handlePlayerDropped(target, attacker, attackerRoomId);
    } else if (damageResult.stateChange === 'death') {
      await handleActualDeath(target, attacker, attackerRoomId);
    }
  }

  return true;
}

/**
 * Process combat for a single attacker against their targets
 */
async function processAttackerCombat(
  attacker: AuthenticatedSocket,
  targets: Set<number>,
  combatConfig: RuntimeCombatConfig = DEFAULT_RUNTIME_CONFIG
): Promise<void> {
  if (!connectedPlayersRef) return;
  if (!attacker.characterId) return;

  // Check if using spell combat
  if (attacker.combatState.combatAction === 'spell' && attacker.combatState.activeSpell) {
    const combatContinues = await processSpellCombat(attacker, targets);
    if (!combatContinues) {
      return; // Combat was broken due to no mana
    }
    // If no targets remain after spell combat, end combat
    if (attacker.combatState.targets.size === 0) {
      attacker.regenState.inCombat = false;
      attacker.combatState.combatAction = 'melee';
      attacker.combatState.activeSpell = null;
      sendToSocket(attacker, MessageType.SYSTEM, colors.yellow('*COMBAT OFF*'));
    }
    return;
  }

  // Get attacker's equipment stats
  const attackerEquipment = await getEquipmentCombatStats(attacker.characterId!);

  // Calculate effective stats with equipment modifiers
  const effectiveDex = attacker.characterStats.dexterity + (attackerEquipment.statModifiers.dexterity || 0);
  const effectiveInt = attacker.characterStats.intelligence + (attackerEquipment.statModifiers.intelligence || 0);
  const effectiveStr = attacker.characterStats.strength + (attackerEquipment.statModifiers.strength || 0);

  // Calculate encumbrance from actual inventory weight
  const encumbranceRatio = calculateEncumbranceRatio(attackerEquipment.totalWeight, effectiveStr);

  // Calculate attacker's energy for this round
  const energyFactors = {
    combatLevel: attacker.combatLevel,
    characterLevel: attacker.characterLevel,
    dexterity: effectiveDex,
    encumbranceRatio,
  };

  // Get attacker's status effect modifiers
  const attackerEffectMods = getEffectModifiers(attacker);

  // Apply energy modifier from status effects
  const energyMultiplier = 1 + (attackerEffectMods.energyModifier / 100);
  const roundEnergy = Math.floor(calculateRoundEnergy(energyFactors, combatConfig) * energyMultiplier);

  // Calculate attacker's accuracy with equipment and status effect bonuses
  const equipmentAccuracyBonus = getEquipmentAccuracyBonus(attackerEquipment.statModifiers);
  const accuracyFactors = {
    characterLevel: attacker.characterLevel,
    combatLevel: attacker.combatLevel,
    dexterity: effectiveDex,
    intelligence: effectiveInt,
    charisma: attacker.characterStats.charisma + (attackerEquipment.statModifiers.charisma || 0),
    equipmentBonus: equipmentAccuracyBonus,
    spellModifier: attackerEffectMods.accuracyModifier,
    encumbrancePenalty: encumbranceRatio > 0.75 ? Math.floor((encumbranceRatio - 0.75) * 40) : 0,
    isBlind: attackerEffectMods.isBlind,
  };

  const attackerAccuracy = calculateAccuracy(accuracyFactors, combatConfig);

  // Get weapon data from equipped weapon
  const baseWeaponSpeed = attackerEquipment.weapon.attackSpeed;
  const weaponMinDamage = attackerEquipment.weapon.minDamage;
  const weaponMaxDamage = attackerEquipment.weapon.maxDamage;

  // Calculate effective weapon cost (MajorMUD-style: level and combat reduce weapon cost)
  const effectiveWeaponCost = calculateEffectiveWeaponCost(
    baseWeaponSpeed,
    attacker.characterLevel,
    attacker.combatLevel
  );

  // Debug logging for swing calculations
  console.log(`[Combat Debug] ${attacker.username}: Level=${attacker.characterLevel}, Combat=${attacker.combatLevel}, STR=${effectiveStr}, DEX=${effectiveDex}, Weight=${attackerEquipment.totalWeight}, MaxCap=${effectiveStr * 48}, Enc=${(encumbranceRatio * 100).toFixed(1)}%, BaseSpeed=${baseWeaponSpeed}, EffectiveCost=${effectiveWeaponCost}, RoundEnergy=${roundEnergy}, ExpectedSwings=${Math.floor(roundEnergy / effectiveWeaponCost)}`);

  // Get class crit bonus (MajorMUD-style: some classes get flat crit bonuses)
  let classCritBonus = 0;
  if (attacker.characterId) {
    const progression = await progressionRepo.getCharacterProgression(attacker.characterId);
    if (progression) {
      const classDef = await progressionRepo.getClassById(progression.class_id);
      classCritBonus = classDef?.crit_bonus ?? 0;
    }
  }

  // Calculate crit chance using MajorMUD-style formula
  const critFactors = {
    characterLevel: attacker.characterLevel,
    intelligence: effectiveInt,
    dexterity: effectiveDex,
    classCritBonus,
    weaponCritModifier: attackerEquipment.weapon.critModifier,
    equipmentCritBonus: 0, // TODO: Add equipment crit bonuses when implemented
    encumbranceRatio,
  };
  const baseCritChance = calculateCritChance(critFactors);
  const critMultiplier = DEFAULT_CRIT_MULTIPLIER; // Now unused but kept for API compatibility

  const attackerRoomId = getPlayerLocation(attacker.playerId);

  // Process each target
  for (const targetId of targets) {
    const target = connectedPlayersRef.get(targetId);
    if (!target) {
      // Target disconnected, remove from targets
      targets.delete(targetId);
      continue;
    }

    // Check if target is still in the same room
    const targetRoomId = getPlayerLocation(targetId);
    if (targetRoomId !== attackerRoomId) {
      // Target left the room, remove from targets
      targets.delete(targetId);
      sendToSocket(attacker, MessageType.SYSTEM, `${target.username} is no longer here.`);
      continue;
    }

    // Get defender's equipment stats (skip if no character selected)
    if (!target.characterId) continue;
    const defenderEquipment = await getEquipmentCombatStats(target.characterId);
    const defenderEquipmentBonus = getEquipmentAccuracyBonus(defenderEquipment.statModifiers);

    // Get defender's status effect modifiers
    const defenderEffectMods = getEffectModifiers(target);

    // Calculate defender's defense from equipped armor and status effects
    const defenseFactors = {
      armorClass: defenderEquipment.armor.totalArmorClass,
      perception: DEFAULT_PERCEPTION,  // TODO: Add perception stat to characters
      shadow: DEFAULT_SHADOW,          // TODO: Add shadow stat to characters
      equipmentBonus: defenderEquipmentBonus,
      spellModifier: defenderEffectMods.defenseModifier,
    };

    const targetDefense = calculateDefense(defenseFactors);

    // Apply damage modifier from status effects to weapon damage range
    const damageMultiplier = 1 + (attackerEffectMods.damageModifier / 100);
    const minDamage = Math.max(1, Math.floor(weaponMinDamage * damageMultiplier));
    const maxDamage = Math.max(1, Math.floor(weaponMaxDamage * damageMultiplier));

    // Calculate defender's dodge chance (MajorMUD-style)
    // Dodge is a class skill - only classes with dodge_bonus > 0 can dodge
    let defenderDodgeChance = 0;
    if (target.characterId) {
      // Use progressionRepo for class (consistent with attacker), characterRepo for race
      const defenderProgression = await progressionRepo.getCharacterProgression(target.characterId);
      const defenderCharacter = await characterRepo.findCharacterById(target.characterId);
      if (defenderProgression && defenderCharacter) {
        const defenderClassDef = await progressionRepo.getClassById(defenderProgression.class_id);
        const defenderRaceDef = await progressionRepo.getRaceById(defenderCharacter.race);

        const classDodgeBonus = defenderClassDef?.dodge_bonus ?? 0;
        const raceDodgeBonus = defenderRaceDef?.dodge_bonus ?? 0;

        // Only calculate dodge if defender has any dodge bonus
        if (classDodgeBonus > 0 || raceDodgeBonus > 0) {
          // Get defender's effective stats for dodge calculation
          const defenderDex = target.characterStats.dexterity + (defenderEquipment.statModifiers.dexterity || 0);
          const defenderCha = target.characterStats.charisma + (defenderEquipment.statModifiers.charisma || 0);

          // TODO: Add equipment dodge bonus when implemented on items
          const equipmentDodgeBonus = 0;

          const dodgeFactors = {
            classDodgeBonus,
            raceDodgeBonus,
            agility: defenderDex, // DEX maps to Agility
            charm: defenderCha, // CHA maps to Charm
            equipmentDodgeBonus,
            attackerAccuracy, // Attacker's accuracy reduces dodge effectiveness
          };

          defenderDodgeChance = calculateDodgeChance(dodgeFactors);
        }
      }
    }

    // Execute combat round with actual equipment stats
    // Pass defender's current HP to stop combat when they reach 0
    const combatResult = executeCombatRound(
      attacker.username,
      target.username,
      attackerAccuracy,
      targetDefense,
      roundEnergy,
      attacker.combatState.carriedEnergy,
      effectiveWeaponCost,
      baseCritChance,
      minDamage,
      maxDamage,
      critMultiplier,
      defenderEquipment.armor.damageReduction,
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
      name: attackerEquipment.weapon.weaponName,
      verbs: attackerEquipment.weapon.attackVerbs,
    };

    for (const swing of combatResult.swings) {
      attackerMessages.push(formatSwingMessage(
        swing.result, swing.damage, attacker.username, target.username, true, false, weaponInfo
      ));
      defenderMessages.push(formatSwingMessage(
        swing.result, swing.damage, attacker.username, target.username, false, true, weaponInfo
      ));
      roomMessages.push(formatSwingMessage(
        swing.result, swing.damage, attacker.username, target.username, false, false, weaponInfo
      ));
    }

    // Send messages to attacker
    if (attackerMessages.length > 0) {
      sendToSocket(attacker, MessageType.OUTPUT, attackerMessages.join('\r\n'));
    }

    // Send messages to defender
    if (defenderMessages.length > 0) {
      sendToSocket(target, MessageType.OUTPUT, defenderMessages.join('\r\n'));
    }

    // Broadcast to room (excluding attacker and defender)
    if (roomMessages.length > 0) {
      broadcastToRoomExcept(attackerRoomId, roomMessages.join('\r\n'), [attacker.playerId, targetId]);
    }

    // Apply damage to target using centralized handler
    if (combatResult.totalDamage > 0) {
      const damageResult = await applyDamage(target, combatResult.totalDamage, 'melee');
      sendVitals(target);

      // Handle state changes
      if (damageResult.stateChange === 'dropped') {
        await handlePlayerDropped(target, attacker, attackerRoomId);
      } else if (damageResult.stateChange === 'death') {
        await handleActualDeath(target, attacker, attackerRoomId);
      }
    }
  }

  // If no targets remain, clear combat state
  if (attacker.combatState.targets.size === 0) {
    attacker.regenState.inCombat = false;
    sendToSocket(attacker, MessageType.SYSTEM, colors.yellow('*COMBAT OFF*'));
  }
}

/**
 * Handle player dropping to the ground (HP <= 0, but above death threshold)
 * Player is incapacitated but can be saved by allies
 */
async function handlePlayerDropped(
  victim: AuthenticatedSocket,
  attacker: AuthenticatedSocket,
  roomId: number
): Promise<void> {
  if (!connectedPlayersRef) return;

  // Initialize dropped state
  initializeDroppedState(victim, roomId);

  // Clear combat state for victim (they can't fight while dropped)
  clearCombatState(victim, connectedPlayersRef);

  // Broadcast dropped message
  sendToSocket(victim, MessageType.SYSTEM, formatDroppedMessage());
  sendToSocket(attacker, MessageType.SYSTEM, colors.boldGreen(`${victim.username} collapses to the ground!`));
  broadcastToRoomExcept(
    roomId,
    colors.boldRed(`${victim.username} collapses to the ground!`),
    [victim.playerId, attacker.playerId]
  );

  sendVitals(victim);
}

/**
 * Handle actual player death (HP below death threshold)
 * Player enters purgatory state, drops all items, must respawn
 */
async function handleActualDeath(
  victim: AuthenticatedSocket,
  attacker: AuthenticatedSocket | null,
  roomId: number
): Promise<void> {
  if (!connectedPlayersRef) return;

  // Initialize dead state
  initializeDeadState(victim, roomId);

  // Clear combat state for victim
  clearCombatState(victim, connectedPlayersRef);

  // Drop all items on death
  try {
    const { dropAllItemsOnDeath } = await import('./itemCommands.js');
    await dropAllItemsOnDeath(victim.characterId!, roomId);
  } catch (error) {
    console.error('[Combat] Failed to drop items on death:', error);
  }

  // Broadcast death message
  sendToSocket(victim, MessageType.SYSTEM, formatDeathMessage());

  if (attacker) {
    sendToSocket(attacker, MessageType.SYSTEM, colors.boldGreen(`You have slain ${victim.username}!`));
    broadcastToRoomExcept(
      roomId,
      colors.boldRed(`${victim.username} has been slain by ${attacker.username}!`),
      [victim.playerId, attacker.playerId]
    );
  } else {
    // Death without attacker (e.g., from DoT, environmental)
    broadcastToRoomExcept(
      roomId,
      colors.boldRed(`${victim.username} has died!`),
      [victim.playerId]
    );
  }

  sendVitals(victim);
}

// Export for use by droppedStateManager
export { handleActualDeath };

/**
 * Process a single combat round for all players in combat
 */
async function processCombatRound(): Promise<void> {
  if (!connectedPlayersRef) return;

  try {
    // Load combat settings from database (cached)
    const settings = await getCombatSettings();
    const combatConfig = toRuntimeConfig(settings);

    // Collect all attackers who have targets
    const attackers: AuthenticatedSocket[] = [];
    for (const [, socket] of connectedPlayersRef) {
      if (socket.combatState.targets.size > 0) {
        attackers.push(socket);
      }
    }

    // Process combat for each attacker
    for (const attacker of attackers) {
      processAttackerCombat(attacker, attacker.combatState.targets, combatConfig).catch((error) => {
        console.error(`[Combat] Error processing combat for ${attacker.username}:`, error);
      });
    }
  } catch (error) {
    console.error('[Combat] Error processing combat round:', error);
  }
}
