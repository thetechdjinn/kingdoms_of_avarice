import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { isHidden } from './stealth/stealthState.js';

/**
 * Find a player in the same room by name (case-insensitive partial match)
 * Excludes the searching player from results
 *
 * @param targetName - Name to search for (partial match supported)
 * @param roomId - Room to search in
 * @param connectedPlayers - Map of all connected players
 * @param excludePlayerId - Player ID to exclude from search (usually the searcher)
 * @param canSeeHidden - If false, hidden players are not findable (default: false)
 */
export function findPlayerInRoom(
  targetName: string,
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  excludePlayerId: number,
  canSeeHidden: boolean = false
): AuthenticatedSocket | null {
  const lowerTarget = targetName.trim().toLowerCase();
  if (!lowerTarget) return null;

  for (const [playerId, socket] of connectedPlayers) {
    if (playerId === excludePlayerId) continue;
    if (getPlayerLocation(playerId) !== roomId) continue;

    // Hidden players can only be found if searcher can see hidden
    if (isHidden(socket) && !canSeeHidden) {
      continue;
    }

    const playerName = socket.username.toLowerCase();
    if (playerName === lowerTarget || playerName.startsWith(lowerTarget)) {
      return socket;
    }
  }

  return null;
}
