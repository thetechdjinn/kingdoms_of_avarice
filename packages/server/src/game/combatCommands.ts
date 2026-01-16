/**
 * Combat Commands Module
 *
 * Handles player-initiated combat commands like attack, flee, etc.
 */

import { MessageType } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket, broadcastToRoom } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';

/**
 * Find a player in the same room by name (case-insensitive partial match)
 */
function findPlayerInRoom(
  targetName: string,
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  excludePlayerId: number
): AuthenticatedSocket | null {
  const lowerTarget = targetName.toLowerCase();

  for (const [playerId, socket] of connectedPlayers) {
    if (playerId === excludePlayerId) continue;
    if (getPlayerLocation(playerId) !== roomId) continue;

    const playerName = socket.username.toLowerCase();
    if (playerName === lowerTarget || playerName.startsWith(lowerTarget)) {
      return socket;
    }
  }

  return null;
}

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

  // Find the target player
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId);

  if (!target) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // Check if already attacking this target
  if (socket.combatState.targets.has(target.playerId)) {
    return { type: MessageType.SYSTEM, message: `You are already attacking ${target.username}!` };
  }

  // Add target to attacker's target list
  socket.combatState.targets.add(target.playerId);

  // Set both players' combat flags
  socket.regenState.inCombat = true;
  target.regenState.inCombat = true;

  // Clear resting state for both players
  socket.regenState.enhancedRegen.clear();
  target.regenState.enhancedRegen.clear();

  // Broadcast to the room
  broadcastToRoom(
    currentRoomId,
    `${colors.combatAttacker(socket.username)} attacks ${colors.combatDefender(target.username)}!`,
    socket.playerId
  );

  // Notify the target
  const targetMessage = {
    type: MessageType.OUTPUT,
    payload: `${colors.combatAttacker(socket.username)} attacks you!`,
    timestamp: Date.now(),
  };
  target.send(JSON.stringify(targetMessage));

  return {
    type: MessageType.OUTPUT,
    message: `You attack ${colors.combatDefender(target.username)}!`,
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
 * Clear combat state for a player
 *
 * Removes all targets and clears combat flag.
 * Also updates opponents' combat states if they're no longer in combat.
 */
export function clearCombatState(
  socket: AuthenticatedSocket,
  connectedPlayers: Map<number, AuthenticatedSocket>
): void {
  // Clear this player's targets
  socket.combatState.targets.clear();
  socket.combatState.energy = 0;
  socket.combatState.carriedEnergy = 0;

  // Check if any other players were targeting this player
  // and update their combat state
  for (const [, otherSocket] of connectedPlayers) {
    if (otherSocket.combatState.targets.has(socket.playerId)) {
      otherSocket.combatState.targets.delete(socket.playerId);

      // If they have no more targets, they're out of combat
      if (otherSocket.combatState.targets.size === 0) {
        otherSocket.regenState.inCombat = false;
      }
    }
  }

  // This player is no longer in combat
  socket.regenState.inCombat = false;
}

/**
 * Check if a player is in combat
 */
export function isInCombat(socket: AuthenticatedSocket): boolean {
  return socket.combatState.targets.size > 0;
}

/**
 * Get the names of all targets a player is attacking
 */
export function getTargetNames(
  socket: AuthenticatedSocket,
  connectedPlayers: Map<number, AuthenticatedSocket>
): string[] {
  const names: string[] = [];
  for (const targetId of socket.combatState.targets) {
    const target = connectedPlayers.get(targetId);
    if (target) {
      names.push(target.username);
    }
  }
  return names;
}
