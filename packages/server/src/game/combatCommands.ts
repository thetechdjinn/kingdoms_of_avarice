/**
 * Combat Commands Module
 *
 * Handles player-initiated combat commands like attack, flee, etc.
 */

import { MessageType } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket, broadcastToRoom, sendVitals } from './socket.js';
import type { CombatEntity } from './combatEntity.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { findPlayerInRoom } from './playerUtils.js';
import { isStealthing, breakStealth } from './stealth/stealthState.js';
import { getAllNpcInstances, findNpcInRoom, getNpcInstance, resetNpcBehaviorState, setMerchantHostile } from './npcManager.js';
import type { NpcCombatInstance } from './npcManager.js';

/**
 * Handle the attack command
 *
 * Usage: attack <player>
 *
 * Initiates combat with another player in the same room.
 * The attacker is added to the target's "attacked by" list and
 * the target is added to the attacker's "targets" list.
 */
export function handleAttack(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Attack who?' };
  }

  const targetName = args.join(' ');
  const currentRoomId = getPlayerLocation(socket.playerId);

  // Find the target player (respects stealth - can't attack what you can't see)
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId, socket.canSeeHidden);

  if (target) {
    // Attacking a player
    // Check if already attacking this target
    if (socket.combatState.targets.has(target.playerId)) {
      return { type: MessageType.SYSTEM, message: `You are already attacking ${target.username}!` };
    }

    // Break stealth when initiating combat
    if (isStealthing(socket)) {
      breakStealth(socket, 'attack', true);
    }

    // Break target's stealth if they're hidden (they've been spotted)
    if (isStealthing(target)) {
      breakStealth(target, 'attacked', true);
    }

    // Add target to attacker's target list
    socket.combatState.targets.add(target.playerId);

    // Set both players' combat flags
    socket.regenState.inCombat = true;
    target.regenState.inCombat = true;

    // Clear resting state for both players
    socket.regenState.enhancedRegen.clear();
    target.regenState.enhancedRegen.clear();

    // Cancel meditation for both players if they were meditating
    if (socket.exitTimer) {
      clearTimeout(socket.exitTimer);
      socket.exitTimer = undefined;
    }
    if (target.exitTimer) {
      clearTimeout(target.exitTimer);
      target.exitTimer = undefined;
    }

    // Update vitals to reflect status change (removes resting/meditating from statline)
    sendVitals(socket);
    sendVitals(target);

    // Broadcast to room (exclude attacker and target - they get personalized messages)
    broadcastToRoom(
      currentRoomId,
      `${colors.combatAttacker(socket.username)} moves to attack ${colors.combatDefender(target.username)}.`,
      [socket.playerId, target.playerId]
    );

    // Notify the target
    const targetMessage = {
      type: MessageType.OUTPUT,
      payload: `${colors.combatAttacker(socket.username)} moves to attack you!`,
      timestamp: Date.now(),
    };
    target.send(JSON.stringify(targetMessage));

    return {
      type: MessageType.OUTPUT,
      message: colors.yellow('*COMBAT ENGAGED*'),
    };
  }

  // No player found — check NPCs
  const npcTarget = findNpcInRoom(targetName, currentRoomId);

  if (!npcTarget) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // Check if NPC is already dead
  if (npcTarget.vitals.hp <= 0) {
    return { type: MessageType.ERROR, message: `${npcTarget.entityName} is already dead.` };
  }

  // Check if already attacking this NPC
  if (socket.combatState.targets.has(npcTarget.entityId)) {
    return { type: MessageType.SYSTEM, message: `You are already attacking ${npcTarget.entityName}!` };
  }

  // Break stealth when initiating combat
  if (isStealthing(socket)) {
    breakStealth(socket, 'attack', true);
  }

  // Add NPC to attacker's target list and vice versa
  socket.combatState.targets.add(npcTarget.entityId);
  npcTarget.combatState.targets.add(socket.playerId);

  // Set combat flags
  socket.regenState.inCombat = true;
  npcTarget.regenState.inCombat = true;
  npcTarget.behaviorState = 'combat';

  // If attacking a merchant, mark them as hostile to this player
  if (npcTarget.template.merchantEnabled && socket.characterId) {
    setMerchantHostile(socket.characterId, npcTarget.template.id);
  }

  // Clear resting state for attacker
  socket.regenState.enhancedRegen.clear();

  // Cancel meditation if meditating
  if (socket.exitTimer) {
    clearTimeout(socket.exitTimer);
    socket.exitTimer = undefined;
  }

  sendVitals(socket);

  // Broadcast to room
  broadcastToRoom(
    currentRoomId,
    `${colors.combatAttacker(socket.username)} moves to attack ${colors.combatDefender(npcTarget.entityName)}.`,
    socket.playerId
  );

  return {
    type: MessageType.OUTPUT,
    message: colors.yellow('*COMBAT ENGAGED*'),
  };
}

/**
 * Handle the break command
 *
 * Usage: break (or bre, brea)
 *
 * Breaks out of combat, clearing all targets.
 */
export function handleBreak(
  socket: AuthenticatedSocket,
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  // Check if in combat
  if (socket.combatState.targets.size === 0) {
    return { type: MessageType.ERROR, message: 'You are not in combat!' };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);

  // Clear combat state
  clearCombatState(socket, connectedPlayers);

  // Broadcast to room
  broadcastToRoom(
    currentRoomId,
    colors.yellow(`${socket.username} breaks off combat.`),
    socket.playerId
  );

  return {
    type: MessageType.OUTPUT,
    message: colors.yellow('*COMBAT OFF*'),
  };
}

/**
 * Handle the flee command
 *
 * Attempts to flee from combat in a random direction.
 * There's a chance of failure based on combat circumstances.
 */
export async function handleFlee(
  socket: AuthenticatedSocket,
  world: { getRoomExits: (roomId: number) => string[] },
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Check if in combat
  if (socket.combatState.targets.size === 0) {
    return { type: MessageType.ERROR, message: 'You are not in combat!' };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);
  const exits = world.getRoomExits(currentRoomId);

  if (exits.length === 0) {
    return { type: MessageType.ERROR, message: 'There is nowhere to flee!' };
  }

  // 25% chance to fail to flee
  if (Math.random() < 0.25) {
    broadcastToRoom(
      currentRoomId,
      `${socket.username} tries to flee but fails!`,
      socket.playerId
    );
    return { type: MessageType.OUTPUT, message: colors.red('You try to flee but fail!') };
  }

  // Pick a random exit
  const randomExit = exits[Math.floor(Math.random() * exits.length)];

  // Clear combat state
  clearCombatState(socket, connectedPlayers);

  // Return a message indicating successful flee
  // The actual movement will be handled by the command processor
  return {
    type: MessageType.SYSTEM,
    message: `FLEE:${randomExit}`, // Special marker for command processor to handle movement
  };
}

/**
 * Clear combat state for an entity.
 *
 * Removes all targets and clears combat flag.
 * Also updates opponents' combat states if they're no longer in combat.
 *
 * Note: Phase 1 only checks the player map for mutual target cleanup.
 * Phase 2 must also check the NPC instance map so that NPCs targeting
 * a dying player (and vice versa) have their combat state cleaned up.
 */
export function clearCombatState(
  entity: CombatEntity,
  connectedPlayers: Map<number, AuthenticatedSocket>
): void {
  // Save targets before clearing (needed to check if they should exit combat)
  const previousTargets = new Set(entity.combatState.targets);

  // Clear this entity's targets
  entity.combatState.targets.clear();
  entity.combatState.energy = 0;
  entity.combatState.carriedEnergy = 0;
  entity.combatState.combatAction = 'melee';
  entity.combatState.activeSpell = null;

  // Check if any other players were targeting this entity
  // and update their combat state
  for (const [, otherSocket] of connectedPlayers) {
    if (otherSocket.combatState.targets.has(entity.entityId)) {
      otherSocket.combatState.targets.delete(entity.entityId);

      // If they have no more targets, they're out of combat
      if (otherSocket.combatState.targets.size === 0) {
        otherSocket.regenState.inCombat = false;
      }
    }
  }

  // Check if any NPCs were targeting this entity
  for (const npc of getAllNpcInstances()) {
    if (npc === entity) continue;
    if (npc.combatState.targets.has(entity.entityId)) {
      npc.combatState.targets.delete(entity.entityId);

      if (npc.combatState.targets.size === 0
          && npc.behaviorState !== 'fleeing' && npc.behaviorState !== 'returning') {
        resetNpcBehaviorState(npc);
      }
    }
  }

  // Also check entities we were targeting - if no one else is targeting them,
  // they should exit combat too (fixes backstab victim staying in combat)
  for (const targetId of previousTargets) {
    // Check players
    const targetSocket = connectedPlayers.get(targetId);
    if (targetSocket) {
      let stillTargeted = false;
      for (const [, otherSocket] of connectedPlayers) {
        if (otherSocket !== entity && otherSocket.combatState.targets.has(targetId)) {
          stillTargeted = true;
          break;
        }
      }
      // Also check if any NPC is still targeting this player
      if (!stillTargeted) {
        for (const npc of getAllNpcInstances()) {
          if (npc !== entity && npc.combatState.targets.has(targetId)) {
            stillTargeted = true;
            break;
          }
        }
      }
      if (!stillTargeted && targetSocket.combatState.targets.size === 0) {
        targetSocket.regenState.inCombat = false;
      }
      continue;
    }

    // Check NPCs we were targeting
    const npcTarget = getNpcInstance(targetId);
    if (npcTarget) {
      let stillTargeted = false;
      for (const [, otherSocket] of connectedPlayers) {
        if (otherSocket !== entity && otherSocket.combatState.targets.has(targetId)) {
          stillTargeted = true;
          break;
        }
      }
      // Also check if any other NPC is still targeting this NPC
      if (!stillTargeted) {
        for (const npc of getAllNpcInstances()) {
          if (npc !== entity && npc.combatState.targets.has(targetId)) {
            stillTargeted = true;
            break;
          }
        }
      }
      if (!stillTargeted && npcTarget.combatState.targets.size === 0
          && npcTarget.behaviorState !== 'fleeing' && npcTarget.behaviorState !== 'returning') {
        resetNpcBehaviorState(npcTarget);
      }
    }
  }

  // This entity is no longer in combat
  entity.regenState.inCombat = false;
}

/**
 * Check if a player is in combat
 */
export function isInCombat(entity: CombatEntity): boolean {
  return entity.combatState.targets.size > 0;
}

/**
 * Get the names of all targets a player is attacking
 */
export function getTargetNames(
  entity: CombatEntity,
  connectedPlayers: Map<number, AuthenticatedSocket>
): string[] {
  const names: string[] = [];
  for (const targetId of entity.combatState.targets) {
    const target = connectedPlayers.get(targetId);
    if (target) {
      names.push(target.username);
    } else {
      // Check NPC targets
      const npc = getNpcInstance(targetId);
      if (npc) {
        names.push(npc.entityName);
      }
    }
  }
  return names;
}
