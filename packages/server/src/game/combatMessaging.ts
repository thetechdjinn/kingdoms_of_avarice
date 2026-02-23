/**
 * Combat Messaging Abstraction
 *
 * Entity-aware wrappers for sending combat messages. Player entities get
 * WebSocket messages; NPC entities are silently skipped (they don't have clients).
 *
 * Phase 2 can add NPC-specific behavior here (e.g., AI state updates on damage).
 */

import { MessageType, GameMessage } from '@koa/shared';
import { CombatEntity, isPlayerEntity } from './combatEntity.js';
import { getPlayerLocation } from './adminCommands.js';
import type { AuthenticatedSocket } from './socket.js';

// Lazy references set during initialization to avoid circular imports.
// IMPORTANT: This map is shared with combat.ts (typed as Map<number, AuthenticatedSocket>
// there). This module must only READ from it — never .set() into it — to preserve
// type safety across the two references.
let connectedPlayersRef: ReadonlyMap<number, CombatEntity> | null = null;
let sendVitalsFn: ((socket: AuthenticatedSocket) => void) | null = null;

/**
 * Initialize the messaging module with a reference to connected players
 * and the canonical sendVitals function (which computes player status).
 * Called during server startup from the combat loop initialization.
 */
export function initializeCombatMessaging(
  connectedPlayers: ReadonlyMap<number, CombatEntity>,
  sendVitals: (socket: AuthenticatedSocket) => void
): void {
  connectedPlayersRef = connectedPlayers;
  sendVitalsFn = sendVitals;
}

/**
 * Send a message to a combat entity.
 * Players get a WebSocket message; NPCs are silently skipped.
 */
export function sendCombatMessage(entity: CombatEntity, type: MessageType, payload: string): void {
  if (!isPlayerEntity(entity)) {
    return; // NPCs don't have WebSocket clients
  }
  // entity is a player socket — it has .send()
  const socket = entity as CombatEntity & { send: (data: string) => void };
  const message: GameMessage = { type, payload, timestamp: Date.now() };
  socket.send(JSON.stringify(message));
}

/**
 * Send a vitals update to a combat entity.
 * For players, delegates to the canonical sendVitals from socket.ts which
 * computes the status field (dropped/dead/resting/stealth/etc.).
 * NPCs are silently skipped.
 */
export function sendEntityVitals(entity: CombatEntity): void {
  if (!isPlayerEntity(entity)) {
    return; // NPCs don't have WebSocket clients
  }
  if (sendVitalsFn) {
    sendVitalsFn(entity as unknown as AuthenticatedSocket);
  }
}

/**
 * Broadcast a combat message to all players in a room, excluding specific entity IDs.
 * Wraps the existing broadcastToRoom pattern but accepts entity IDs (player or NPC).
 */
export function broadcastCombatToRoom(
  roomId: number,
  message: string,
  excludeEntityIds: number[]
): void {
  if (!connectedPlayersRef) return;

  const gameMessage: GameMessage = {
    type: MessageType.OUTPUT,
    payload: message,
    timestamp: Date.now(),
  };

  for (const [playerId, socket] of connectedPlayersRef) {
    if (!isPlayerEntity(socket)) continue;
    if (excludeEntityIds.includes(playerId)) continue;
    if (getPlayerLocation(playerId) !== roomId) continue;

    const ws = socket as CombatEntity & { send: (data: string) => void };
    ws.send(JSON.stringify(gameMessage));
  }
}

/**
 * Resolve a combat target by entity ID.
 * Phase 1: Only looks up players from connectedPlayers.
 * Phase 2: Will also check the NPC instance map.
 */
export function resolveCombatTarget(entityId: number): CombatEntity | undefined {
  if (!connectedPlayersRef) return undefined;

  // Phase 1: Players only
  return connectedPlayersRef.get(entityId);
}
