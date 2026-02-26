/**
 * NPC Behavior State Machine
 *
 * Central module for NPC AI decision-making during combat rounds.
 * Handles target re-selection, flee behavior, call for help,
 * and return-to-spawn pathfinding.
 */

import { MessageType } from '@koa/shared';
import type { AuthenticatedSocket } from './socket.js';
import type { NpcCombatInstance } from './npcManager.js';
import {
  getNpcsInRoom,
  getValidNpcExits,
  moveNpc,
  resetNpcBehaviorState,
  isRoomInAllowedArea,
  canNpcPassDirection,
  getWorldRef,
  isPlayerTargetedByAnyNpc,
  isNpcDebugEnabled,
} from './npcManager.js';
import { getPlayerLocation } from './adminCommands.js';
import { isPlayerEntity } from './combatEntity.js';
import { sendCombatMessage, broadcastCombatToRoom, resolveCombatTarget } from './combatMessaging.js';
import { clearCombatState } from './combatCommands.js';
import { colors } from '../utils/colors.js';

// ============================================================================
// TARGET SELECTION
// ============================================================================

/**
 * Select a random living, non-dropped player in the NPC's room.
 * Respects stealth: hidden players the NPC can't see are skipped.
 * Returns the player's entityId or null if no valid target exists.
 */
function selectRandomTarget(
  npc: NpcCombatInstance,
  connectedPlayers: Map<number, AuthenticatedSocket>
): number | null {
  const candidates: number[] = [];

  for (const [playerId, socket] of connectedPlayers) {
    // Must be in same room
    if (getPlayerLocation(playerId) !== npc.currentRoomId) continue;
    // Skip players in training form
    if (socket.isTraining) continue;
    // Must be alive and not dropped/dead
    if (socket.vitals.hp <= 0) continue;
    if (socket.deathState?.isDropped || socket.deathState?.isDead) continue;
    // Respect stealth
    if (socket.stealthMode === 'hidden' && !npc.canSeeHidden) continue;

    candidates.push(playerId);
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ============================================================================
// CALL FOR HELP
// ============================================================================

/**
 * Count how many players are targeting this NPC.
 */
function countPlayersTargeting(
  npc: NpcCombatInstance,
  connectedPlayers: Map<number, AuthenticatedSocket>
): number {
  let count = 0;
  for (const [, socket] of connectedPlayers) {
    if (socket.combatState.targets.has(npc.entityId)) {
      count++;
    }
  }
  return count;
}

/**
 * Process call for help: summon idle hostile NPCs from adjacent rooms.
 * Returns true if any responder moved in.
 */
function processCallForHelp(
  npc: NpcCombatInstance,
  connectedPlayers: Map<number, AuthenticatedSocket>
): boolean {
  // Broadcast the call
  broadcastCombatToRoom(
    npc.currentRoomId,
    colors.boldRed(`${npc.entityName} calls out for help!`),
    []
  );

  const worldRef = getWorldRef();
  if (!worldRef) return false;

  const room = worldRef.getRoom(npc.currentRoomId);
  if (!room) return false;

  let anyResponded = false;

  // Check each adjacent room for idle hostile NPCs
  for (const [direction, adjacentRoomId] of room.exits) {
    const adjacentNpcs = getNpcsInRoom(adjacentRoomId);
    for (const responder of adjacentNpcs) {
      // Must be alive, idle, hostile, and not already in combat
      if (responder.vitals.hp <= 0) continue;
      if (responder.behaviorState !== 'idle') continue;
      if (!responder.template.hostile) continue;
      if (responder.combatState.targets.size > 0) continue;

      // Check area restriction
      if (!isRoomInAllowedArea(responder, npc.currentRoomId)) continue;

      // Find the actual direction FROM the adjacent room TO the caller's room
      const adjacentRoom = worldRef.getRoom(adjacentRoomId);
      if (!adjacentRoom) continue;
      let moveDir: string | null = null;
      for (const [dir, targetId] of adjacentRoom.exits) {
        if (targetId === npc.currentRoomId) {
          moveDir = dir;
          break;
        }
      }
      if (!moveDir) continue;

      // Check if responder can pass through the door in the actual direction
      if (!canNpcPassDirection(adjacentRoomId, moveDir)) continue;

      // Move responder into caller's room
      moveNpc(responder, moveDir, npc.currentRoomId);

      // Set responder to combat and copy caller's targets
      responder.behaviorState = 'combat';
      responder.regenState.inCombat = true;
      for (const targetId of npc.combatState.targets) {
        responder.combatState.targets.add(targetId);

        // Mark player as in combat but do NOT add responder to player's targets —
        // players must manually choose to attack back.
        const target = resolveCombatTarget(targetId);
        if (target) {
          target.regenState.inCombat = true;
          target.regenState.enhancedRegen.clear();

          // Notify targeted players (debug only)
          if (isNpcDebugEnabled()) {
            sendCombatMessage(target, MessageType.OUTPUT,
              colors.boldRed(`${responder.entityName} attacks you!`)
            );
          }
        }
      }

      // Broadcast to room
      broadcastCombatToRoom(
        npc.currentRoomId,
        colors.boldRed(`${responder.entityName} rushes in to help!`),
        []
      );

      anyResponded = true;
    }
  }

  npc.hasCalledForHelp = true;
  return anyResponded;
}

// ============================================================================
// FLEE BEHAVIOR
// ============================================================================

/**
 * Initiate flee: transition from combat to fleeing state.
 */
function initiateFlee(
  npc: NpcCombatInstance,
  connectedPlayers: Map<number, AuthenticatedSocket>
): void {
  const combatRoom = npc.currentRoomId;

  // Clear NPC's targets (disengage from combat)
  // Note: clearCombatState calls resetNpcBehaviorState which sets idle,
  // so we must set flee state AFTER clearing.
  clearCombatState(npc, connectedPlayers);

  // Now set flee state (overrides the idle set by clearCombatState)
  npc.combatRoomId = combatRoom;
  npc.fleeDistance = 0;
  npc.behaviorState = 'fleeing';

  // Broadcast panic message
  broadcastCombatToRoom(
    npc.currentRoomId,
    colors.boldYellow(`${npc.entityName} panics and attempts to flee!`),
    []
  );

  // Flee up to 3 rooms immediately in one burst
  while (npc.behaviorState === 'fleeing') {
    if (!processFleeMovement(npc, connectedPlayers)) {
      break; // Cornered (back to combat) or transitioned to returning
    }
  }
}

/**
 * Process one step of flee movement.
 * Returns true if the NPC successfully moved.
 */
function processFleeMovement(
  npc: NpcCombatInstance,
  connectedPlayers: Map<number, AuthenticatedSocket>
): boolean {
  const validExits = getValidNpcExits(npc);

  // Prefer exits that don't lead back to the combat room
  let filteredExits = validExits.filter(e => e.roomId !== npc.combatRoomId);
  if (filteredExits.length === 0) {
    filteredExits = validExits; // If all exits lead back, use them anyway
  }

  if (filteredExits.length === 0) {
    // Cornered! Check for players in room
    const target = selectRandomTarget(npc, connectedPlayers);
    if (target !== null) {
      // Turn back to fight
      npc.behaviorState = 'combat';
      npc.regenState.inCombat = true;
      npc.combatState.targets.add(target);

      // Mark player as in combat but do NOT add NPC to player's targets —
      // players must manually choose to attack back.
      const targetEntity = resolveCombatTarget(target);
      if (targetEntity) {
        targetEntity.regenState.inCombat = true;
        targetEntity.regenState.enhancedRegen.clear();
        if (isNpcDebugEnabled()) {
          sendCombatMessage(targetEntity, MessageType.OUTPUT,
            colors.boldRed(`${npc.entityName} attacks you!`)
          );
        }
      }

      if (isNpcDebugEnabled()) {
        broadcastCombatToRoom(
          npc.currentRoomId,
          colors.boldRed(`${npc.entityName} is cornered and turns to fight!`),
          []
        );
      }
    } else {
      // No players and nowhere to go — transition to returning
      npc.behaviorState = 'returning';
    }
    return false;
  }

  // Pick a random exit
  const exit = filteredExits[Math.floor(Math.random() * filteredExits.length)];
  moveNpc(npc, exit.direction, exit.roomId);
  npc.fleeDistance++;

  // After 3 rooms, transition to returning
  if (npc.fleeDistance >= 3) {
    npc.behaviorState = 'returning';
  }

  return true;
}

// ============================================================================
// RETURN BEHAVIOR
// ============================================================================

/**
 * BFS pathfinding: find direction of first step from fromRoomId toward toRoomId.
 * Only traverses exits passable to the NPC (door check + area check).
 * Returns { direction, roomId } for the first step, or null if no path.
 */
function findPathDirection(
  fromRoomId: number,
  toRoomId: number,
  npc: NpcCombatInstance,
  maxDepth: number = 50
): { direction: string; roomId: number } | null {
  const worldRef = getWorldRef();
  if (!worldRef) return null;

  if (fromRoomId === toRoomId) return null;

  // BFS: queue entries are [roomId, firstStepDirection, firstStepRoomId]
  const queue: Array<[number, string, number]> = [];
  const visited = new Set<number>();
  visited.add(fromRoomId);

  // Seed with direct neighbors
  const startRoom = worldRef.getRoom(fromRoomId);
  if (!startRoom) return null;

  for (const [direction, targetRoomId] of startRoom.exits) {
    if (!canNpcPassDirection(fromRoomId, direction)) continue;
    if (!isRoomInAllowedArea(npc, targetRoomId)) continue;
    if (targetRoomId === toRoomId) {
      return { direction, roomId: targetRoomId };
    }
    queue.push([targetRoomId, direction, targetRoomId]);
    visited.add(targetRoomId);
  }

  // BFS loop
  let depth = 0;
  let nextLevelStart = queue.length;
  let idx = 0;

  while (idx < queue.length && depth < maxDepth) {
    if (idx >= nextLevelStart) {
      depth++;
      nextLevelStart = queue.length;
    }

    const [currentRoomId, firstDir, firstRoom] = queue[idx++];
    const room = worldRef.getRoom(currentRoomId);
    if (!room) continue;

    for (const [direction, targetRoomId] of room.exits) {
      if (visited.has(targetRoomId)) continue;
      if (!canNpcPassDirection(currentRoomId, direction)) continue;
      if (!isRoomInAllowedArea(npc, targetRoomId)) continue;

      if (targetRoomId === toRoomId) {
        return { direction: firstDir, roomId: firstRoom };
      }

      visited.add(targetRoomId);
      queue.push([targetRoomId, firstDir, firstRoom]);
    }
  }

  return null; // No path found
}

/**
 * Process one step of return movement.
 * Returns true if the NPC successfully moved.
 */
function processReturnMovement(npc: NpcCombatInstance): boolean {
  const spawnRoomId = npc.template.spawnRoomId;

  // Already at spawn or no spawn room — finalize
  if (!spawnRoomId || npc.currentRoomId === spawnRoomId) {
    finalizeReturn(npc);
    return false;
  }

  // Try BFS path toward spawn
  const step = findPathDirection(npc.currentRoomId, spawnRoomId, npc);
  if (step) {
    moveNpc(npc, step.direction, step.roomId);
    // Check arrival
    if (npc.currentRoomId === spawnRoomId) {
      finalizeReturn(npc);
    }
    return true;
  }

  // No path found — pick a random valid exit as fallback
  const exits = getValidNpcExits(npc);
  if (exits.length > 0) {
    const exit = exits[Math.floor(Math.random() * exits.length)];
    moveNpc(npc, exit.direction, exit.roomId);
    if (npc.currentRoomId === spawnRoomId) {
      finalizeReturn(npc);
    }
    return true;
  }

  // Completely stuck — finalize in place
  finalizeReturn(npc);
  return false;
}

/**
 * Finalize return: reset state and restore full HP/mana.
 */
function finalizeReturn(npc: NpcCombatInstance): void {
  resetNpcBehaviorState(npc);
  npc.vitals.hp = npc.vitals.maxHp;
  npc.currentMana = npc.template.maxMana;
  npc.vitals.resource = npc.template.maxMana;
}

// ============================================================================
// MAIN BEHAVIOR DISPATCH
// ============================================================================

/**
 * Process NPC behavior for one combat round tick.
 *
 * Returns 'attack' if the NPC should execute its normal attack this round,
 * or 'skip' if it took another action (fled, returned, etc.) instead.
 */
export function processNpcBehavior(
  npc: NpcCombatInstance,
  connectedPlayers: Map<number, AuthenticatedSocket>
): 'attack' | 'skip' {
  // Skip if NPC was killed earlier this round (stale reference in attackers list)
  if (npc.vitals.hp <= 0) return 'skip';

  switch (npc.behaviorState) {
    case 'idle':
      // Safety: idle NPCs shouldn't be in the behavior loop
      return 'skip';

    case 'combat':
      return processCombatBehavior(npc, connectedPlayers);

    case 'fleeing':
      // Safety fallback: flee is normally fully resolved in initiateFlee().
      // If still fleeing here, take one more step.
      processFleeMovement(npc, connectedPlayers);
      return 'skip';

    case 'returning':
      processReturnMovement(npc);
      return 'skip';

    default:
      return 'skip';
  }
}

/**
 * Process behavior for an NPC in combat state.
 * Handles stale target cleanup, re-targeting, flee checks, and call-for-help.
 */
function processCombatBehavior(
  npc: NpcCombatInstance,
  connectedPlayers: Map<number, AuthenticatedSocket>
): 'attack' | 'skip' {
  // Clean stale targets (dead, left room, disconnected)
  const droppedPlayerIds: number[] = [];
  for (const targetId of new Set(npc.combatState.targets)) {
    const target = resolveCombatTarget(targetId);
    if (!target) {
      npc.combatState.targets.delete(targetId);
      continue;
    }
    // Target dead or dropped
    if (target.vitals.hp <= 0) {
      npc.combatState.targets.delete(targetId);
      if (isPlayerEntity(target)) droppedPlayerIds.push(targetId);
      continue;
    }
    // Target left room or is in training form
    if (isPlayerEntity(target)) {
      const targetSocket = connectedPlayers.get(target.entityId);
      if (getPlayerLocation(target.entityId) !== npc.currentRoomId ||
          targetSocket?.isTraining) {
        npc.combatState.targets.delete(targetId);
        droppedPlayerIds.push(targetId);
        continue;
      }
    }
  }

  // For players removed from this NPC's targets: if no other NPC targets them
  // and they have no targets of their own, take them out of combat.
  for (const playerId of droppedPlayerIds) {
    const player = connectedPlayers.get(playerId);
    if (player && player.combatState.targets.size === 0 && !isPlayerTargetedByAnyNpc(playerId)) {
      player.regenState.inCombat = false;
    }
  }

  // If no targets remain, try to find new ones
  if (npc.combatState.targets.size === 0) {
    const newTarget = selectRandomTarget(npc, connectedPlayers);
    if (newTarget !== null) {
      // Re-target
      npc.combatState.targets.add(newTarget);
      npc.regenState.inCombat = true;

      // Mark player as in combat but do NOT add NPC to player's targets —
      // players must manually choose to attack back.
      const targetEntity = resolveCombatTarget(newTarget);
      if (targetEntity) {
        targetEntity.regenState.inCombat = true;
        targetEntity.regenState.enhancedRegen.clear();

        // Broadcast re-targeting
        sendCombatMessage(targetEntity, MessageType.OUTPUT,
          colors.boldRed(`${npc.entityName} turns to attack you!`)
        );
        broadcastCombatToRoom(
          npc.currentRoomId,
          colors.boldRed(`${npc.entityName} turns to attack ${targetEntity.entityName}!`),
          [targetEntity.entityId]
        );
      }
    } else {
      // No targets at all — exit combat
      resetNpcBehaviorState(npc);
      return 'skip';
    }
  }

  // Check flee condition
  if (npc.template.fleeEnabled) {
    const hpPercent = (npc.vitals.hp / npc.vitals.maxHp) * 100;
    if (hpPercent <= npc.template.fleeHpPercent) {
      initiateFlee(npc, connectedPlayers);
      return 'skip';
    }
  }

  // Check call for help (does not consume the round — NPC still attacks)
  if (!npc.hasCalledForHelp && npc.template.callForHelpChance > 0) {
    const playersTargeting = countPlayersTargeting(npc, connectedPlayers);
    if (playersTargeting > 1) {
      const roll = Math.random() * 100;
      if (roll < npc.template.callForHelpChance) {
        processCallForHelp(npc, connectedPlayers);
      }
    }
  }

  return 'attack';
}
