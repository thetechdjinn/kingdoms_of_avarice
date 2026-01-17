/**
 * Combat Loop Module
 *
 * Manages the global combat timer and processes combat rounds for all players.
 */

import { MessageType, GameMessage, AttackResult } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { getEffectModifiers, hasEffect } from './statusEffects.js';
import {
  calculateRoundEnergy,
  calculateAccuracy,
  calculateDefense,
  executeCombatRound,
  parseDiceString,
} from './combatCalculations.js';
import { clearCombatState } from './combatCommands.js';
import {
  getEquipmentCombatStats,
  calculateEncumbranceRatio,
  getEquipmentAccuracyBonus,
} from './combatStats.js';
import * as characterRepo from '../db/repositories/characterRepository.js';

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
const DEFAULT_WEAPON_SPEED = 10;
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
 * Format a swing result into combat message text
 */
function formatSwingMessage(
  result: AttackResult,
  damage: number,
  attackerName: string,
  defenderName: string,
  isAttacker: boolean,
  isDefender: boolean
): string {
  const attacker = isAttacker ? 'You' : attackerName;
  const defender = isDefender ? 'you' : defenderName;
  const attackerPossessive = isAttacker ? 'Your' : `${attackerName}'s`;

  switch (result) {
    case AttackResult.CRITICAL:
      if (isAttacker) {
        return `${colors.combatCritical('CRITICAL!')} You hit ${colors.combatDefender(defenderName)} for ${colors.combatDamage(damage.toString())} damage!`;
      } else if (isDefender) {
        return `${colors.combatCritical('CRITICAL!')} ${colors.combatAttacker(attackerName)} hits you for ${colors.combatDamage(damage.toString())} damage!`;
      }
      return `${colors.combatCritical('CRITICAL!')} ${attackerName} hits ${defenderName} for ${damage} damage!`;

    case AttackResult.HIT:
      if (isAttacker) {
        return `${colors.combatHit('You hit')} ${colors.combatDefender(defenderName)} for ${colors.combatDamage(damage.toString())} damage.`;
      } else if (isDefender) {
        return `${colors.combatAttacker(attackerName)} ${colors.combatHit('hits you')} for ${colors.combatDamage(damage.toString())} damage.`;
      }
      return `${attackerName} hits ${defenderName} for ${damage} damage.`;

    case AttackResult.MISS:
      if (isAttacker) {
        return `${colors.combatMiss('You miss')} ${colors.combatDefender(defenderName)}.`;
      } else if (isDefender) {
        return `${colors.combatAttacker(attackerName)} ${colors.combatMiss('misses you')}.`;
      }
      return `${attackerName} misses ${defenderName}.`;

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
    sendToSocket(attacker, MessageType.SYSTEM, 'Combat has ended.');

    // Clear combat state
    clearCombatState(attacker, connectedPlayersRef);
    return false;
  }

  // Deduct mana
  attacker.vitals.resource = (attacker.vitals.resource ?? 0) - spell.manaCost;
  sendVitals(attacker);

  // Parse spell damage dice
  const { min: minDamage, max: maxDamage } = parseDiceString(spell.damageDice);

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

    // Roll spell damage (no miss chance for spells - they always hit)
    const damage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;

    // Send spell messages
    const attackerMsg = `You cast ${colors.cyan(spell.spellName)} at ${colors.combatDefender(target.username)} for ${colors.combatDamage(damage.toString())} damage!`;
    const defenderMsg = `${colors.combatAttacker(attacker.username)} casts ${colors.cyan(spell.spellName)} at you for ${colors.combatDamage(damage.toString())} damage!`;
    const roomMsg = `${attacker.username} casts ${spell.spellName} at ${target.username} for ${damage} damage!`;

    sendToSocket(attacker, MessageType.OUTPUT, attackerMsg);
    sendToSocket(target, MessageType.OUTPUT, defenderMsg);
    broadcastToRoomExcept(attackerRoomId, roomMsg, [attacker.playerId, targetId]);

    // Apply damage
    target.vitals.hp = Math.max(0, target.vitals.hp - damage);
    sendVitals(target);

    // Check for death
    if (target.vitals.hp <= 0) {
      await handlePlayerDeath(target, attacker);
    }
  }

  return true;
}

/**
 * Process combat for a single attacker against their targets
 */
async function processAttackerCombat(
  attacker: AuthenticatedSocket,
  targets: Set<number>
): Promise<void> {
  if (!connectedPlayersRef) return;

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
      sendToSocket(attacker, MessageType.SYSTEM, 'Combat has ended.');
    }
    return;
  }

  // Get attacker's equipment stats
  const attackerEquipment = await getEquipmentCombatStats(attacker.playerId);

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
  const roundEnergy = Math.floor(calculateRoundEnergy(energyFactors) * energyMultiplier);

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

  const attackerAccuracy = calculateAccuracy(accuracyFactors);

  // Get weapon data from equipped weapon
  const weaponSpeed = attackerEquipment.weapon.attackSpeed;
  const weaponDamage = attackerEquipment.weapon.damageDice;
  const baseCritChance = DEFAULT_BASE_CRIT_CHANCE + attackerEquipment.weapon.critModifier;
  const critMultiplier = DEFAULT_CRIT_MULTIPLIER;

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

    // Get defender's equipment stats
    const defenderEquipment = await getEquipmentCombatStats(target.playerId);
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

    // Parse weapon damage dice and apply damage modifier from status effects
    const { min: baseMinDamage, max: baseMaxDamage } = parseDiceString(weaponDamage);
    const damageMultiplier = 1 + (attackerEffectMods.damageModifier / 100);
    const minDamage = Math.max(1, Math.floor(baseMinDamage * damageMultiplier));
    const maxDamage = Math.max(1, Math.floor(baseMaxDamage * damageMultiplier));

    // Execute combat round with actual equipment stats
    const combatResult = executeCombatRound(
      attacker.username,
      target.username,
      attackerAccuracy,
      targetDefense,
      roundEnergy,
      attacker.combatState.carriedEnergy,
      weaponSpeed,
      baseCritChance,
      minDamage,
      maxDamage,
      critMultiplier,
      defenderEquipment.armor.damageReduction
    );

    // Update carried energy for next round
    attacker.combatState.carriedEnergy = combatResult.remainingEnergy;

    // Send combat messages
    const attackerMessages: string[] = [];
    const defenderMessages: string[] = [];
    const roomMessages: string[] = [];

    for (const swing of combatResult.swings) {
      attackerMessages.push(formatSwingMessage(
        swing.result, swing.damage, attacker.username, target.username, true, false
      ));
      defenderMessages.push(formatSwingMessage(
        swing.result, swing.damage, attacker.username, target.username, false, true
      ));
      roomMessages.push(formatSwingMessage(
        swing.result, swing.damage, attacker.username, target.username, false, false
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

    // Apply damage to target
    if (combatResult.totalDamage > 0) {
      target.vitals.hp = Math.max(0, target.vitals.hp - combatResult.totalDamage);
      sendVitals(target);

      // Check for death
      if (target.vitals.hp <= 0) {
        await handlePlayerDeath(target, attacker);
      }
    }
  }

  // If no targets remain, clear combat state
  if (attacker.combatState.targets.size === 0) {
    attacker.regenState.inCombat = false;
    sendToSocket(attacker, MessageType.SYSTEM, 'Combat has ended.');
  }
}

/**
 * Handle player death
 */
async function handlePlayerDeath(
  victim: AuthenticatedSocket,
  killer: AuthenticatedSocket
): Promise<void> {
  if (!connectedPlayersRef) return;

  const roomId = getPlayerLocation(victim.playerId);

  // Broadcast death message
  sendToSocket(victim, MessageType.SYSTEM, colors.boldRed(`You have been slain by ${killer.username}!`));
  sendToSocket(killer, MessageType.SYSTEM, colors.boldGreen(`You have slain ${victim.username}!`));
  broadcastToRoomExcept(
    roomId,
    colors.boldRed(`${victim.username} has been slain by ${killer.username}!`),
    [victim.playerId, killer.playerId]
  );

  // Clear combat state for victim
  clearCombatState(victim, connectedPlayersRef);

  // Respawn victim at room 1 with full HP and mana
  victim.vitals.hp = victim.vitals.maxHp;
  if (victim.vitals.maxResource) {
    victim.vitals.resource = victim.vitals.maxResource;
  }
  sendVitals(victim);

  // Update victim's room in database and memory
  try {
    if (victim.characterId) {
      await characterRepo.updateCharacterRoom(victim.characterId, 1);
    }
  } catch (error) {
    console.error('[Combat] Failed to update death room:', error);
  }

  // Import setPlayerLocation dynamically to avoid circular dependency
  const { setPlayerLocation } = await import('./adminCommands.js');
  setPlayerLocation(victim.playerId, 1);

  sendToSocket(victim, MessageType.SYSTEM, 'You wake up at the starting area...');
}

/**
 * Process a single combat round for all players in combat
 */
function processCombatRound(): void {
  if (!connectedPlayersRef) return;

  try {
    // Collect all attackers who have targets
    const attackers: AuthenticatedSocket[] = [];
    for (const [, socket] of connectedPlayersRef) {
      if (socket.combatState.targets.size > 0) {
        attackers.push(socket);
      }
    }

    // Process combat for each attacker
    for (const attacker of attackers) {
      processAttackerCombat(attacker, attacker.combatState.targets).catch((error) => {
        console.error(`[Combat] Error processing combat for ${attacker.username}:`, error);
      });
    }
  } catch (error) {
    console.error('[Combat] Error processing combat round:', error);
  }
}
