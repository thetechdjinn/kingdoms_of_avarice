import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';

/**
 * Find a player in the same room by name (case-insensitive partial match)
 * Excludes the searching player from results
 */
export function findPlayerInRoom(
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
