import { AuthenticatedSocket } from './socket.js';

const DEFAULT_COMBAT_ROUND_MS = 4000;
const parsedRoundMs = parseInt(process.env.COMBAT_ROUND_MS || '', 10);
const COMBAT_ROUND_MS = Number.isFinite(parsedRoundMs) && parsedRoundMs > 0
  ? parsedRoundMs
  : DEFAULT_COMBAT_ROUND_MS;
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
 * Process a single combat round for all players in combat
 * This is a stub for Phase 1 - full implementation in Phase 3
 */
function processCombatRound(): void {
  if (!connectedPlayersRef) return;

  try {
    // For Phase 1, just log that the timer is working
    // Full combat resolution will be implemented in Phase 3
    for (const [playerId, socket] of connectedPlayersRef) {
      if (socket.combatState.targets.size > 0) {
        console.log(`[Combat] Player ${playerId} (${socket.username}) has ${socket.combatState.targets.size} target(s)`);
      }
    }
  } catch (error) {
    console.error('[Combat] Error processing combat round:', error);
  }
}
