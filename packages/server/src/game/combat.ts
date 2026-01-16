/**
 * Combat Loop Module
 *
 * Manages the global combat timer and processes combat rounds for all players.
 */

import { MessageType, GameMessage, AttackResult } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import {
  calculateRoundEnergy,
  calculateAccuracy,
  calculateDefense,
  executeCombatRound,
  parseDiceString,
} from './combatCalculations.js';
import { clearCombatState } from './combatCommands.js';
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
 * Process combat for a single attacker against their targets
 */
async function processAttackerCombat(
  attacker: AuthenticatedSocket,
  targets: Set<number>
): Promise<void> {
  if (!connectedPlayersRef) return;

  // Calculate attacker's energy for this round
  // TODO: Calculate encumbranceRatio from inventory weight in Phase 3
  const energyFactors = {
    combatLevel: attacker.combatLevel,
    characterLevel: attacker.characterLevel,
    dexterity: attacker.characterStats.dexterity,
    encumbranceRatio: DEFAULT_ENCUMBRANCE_RATIO,
  };

  const roundEnergy = calculateRoundEnergy(energyFactors);

  // Calculate attacker's accuracy
  // TODO: Get equipmentBonus and spellModifier from equipped items/buffs in Phase 3
  const accuracyFactors = {
    characterLevel: attacker.characterLevel,
    combatLevel: attacker.combatLevel,
    dexterity: attacker.characterStats.dexterity,
    intelligence: attacker.characterStats.intelligence,
    charisma: attacker.characterStats.charisma,
    equipmentBonus: DEFAULT_EQUIPMENT_BONUS,
    spellModifier: DEFAULT_SPELL_MODIFIER,
    encumbrancePenalty: 0,
    isBlind: false,
  };

  const attackerAccuracy = calculateAccuracy(accuracyFactors);

  // Get weapon data
  // TODO: Get from equipped weapon in Phase 3
  const weaponSpeed = DEFAULT_WEAPON_SPEED;
  const weaponDamage = DEFAULT_UNARMED_DAMAGE;
  const baseCritChance = DEFAULT_BASE_CRIT_CHANCE;
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

    // Calculate defender's defense
    // TODO: Get armorClass, perception, shadow from equipped armor/stats in Phase 3
    const defenseFactors = {
      armorClass: DEFAULT_ARMOR_CLASS,
      perception: DEFAULT_PERCEPTION,
      shadow: DEFAULT_SHADOW,
      equipmentBonus: DEFAULT_EQUIPMENT_BONUS,
      spellModifier: DEFAULT_SPELL_MODIFIER,
    };

    const targetDefense = calculateDefense(defenseFactors);

    // Parse weapon damage dice
    const { min: minDamage, max: maxDamage } = parseDiceString(weaponDamage);

    // Execute combat round
    // TODO: Get damageReduction from armor in Phase 3
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
      DEFAULT_DAMAGE_REDUCTION
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
