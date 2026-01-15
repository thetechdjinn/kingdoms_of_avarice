import { ResourceRegenConfig, VitalsData, PlayerRegenState } from '@koa/shared';

// Interface for the socket with vitals and regen state
// This is a minimal interface that AuthenticatedSocket implements
export interface RegenCapableSocket {
  vitals: VitalsData;
  regenState: PlayerRegenState;
}

// Registry of all resource regeneration configs
const regenConfigs: Map<string, ResourceRegenConfig> = new Map();

// Active timers for each resource
const regenTimers: Map<string, NodeJS.Timeout> = new Map();

// Shutdown flag to prevent race conditions during timer cleanup
let isShuttingDown = false;

// References to connected players and sendVitals function (set during initialization)
// Using generic types to allow any socket that implements RegenCapableSocket
let connectedPlayersRef: Map<number, RegenCapableSocket> | null = null;
let sendVitalsFn: ((socket: RegenCapableSocket) => void) | null = null;

/**
 * Register a new resource for regeneration
 */
export function registerRegenResource(config: ResourceRegenConfig): void {
  regenConfigs.set(config.resourceKey, config);
  console.log(`[Regen] Registered resource: ${config.resourceKey} (${config.baseRegenPercent}% base, ${config.enhancedRegenPercent}% enhanced, ${config.tickIntervalMs}ms tick)`);
}

/**
 * Unregister a resource from regeneration
 */
export function unregisterRegenResource(resourceKey: string): void {
  // Stop the timer if running
  const timer = regenTimers.get(resourceKey);
  if (timer) {
    clearInterval(timer);
    regenTimers.delete(resourceKey);
  }
  regenConfigs.delete(resourceKey);
  console.log(`[Regen] Unregistered resource: ${resourceKey}`);
}

/**
 * Get the current config for a resource
 */
export function getRegenConfig(resourceKey: string): ResourceRegenConfig | undefined {
  return regenConfigs.get(resourceKey);
}

/**
 * Get all registered resource configs
 */
export function getAllRegenConfigs(): ResourceRegenConfig[] {
  return Array.from(regenConfigs.values());
}

/**
 * Get the current and max value for a resource from player vitals
 */
function getResourceValues(vitals: VitalsData, resourceKey: string): { current: number; max: number } | null {
  switch (resourceKey) {
    case 'health':
      return { current: vitals.hp, max: vitals.maxHp };
    case 'mana':
      if (vitals.resource !== undefined && vitals.maxResource !== undefined) {
        return { current: vitals.resource, max: vitals.maxResource };
      }
      return null;
    default:
      // Future resources can be added here
      return null;
  }
}

/**
 * Set the current value for a resource in player vitals
 */
function setResourceValue(vitals: VitalsData, resourceKey: string, value: number): void {
  switch (resourceKey) {
    case 'health':
      vitals.hp = value;
      break;
    case 'mana':
      vitals.resource = value;
      break;
    // Future resources can be added here
  }
}

/**
 * Process regeneration tick for a specific resource
 */
function processRegenTick(config: ResourceRegenConfig): void {
  // Check shutdown flag to prevent race conditions
  if (isShuttingDown || !connectedPlayersRef || !sendVitalsFn) {
    return;
  }

  for (const [, socket] of connectedPlayersRef) {
    // Skip sockets without proper regenState (safety check)
    if (!socket.regenState) {
      continue;
    }

    const values = getResourceValues(socket.vitals, config.resourceKey);
    if (!values) {
      continue; // Resource not applicable to this player
    }

    const { current, max } = values;

    // Skip if already at max
    if (current >= max) {
      continue;
    }

    // No regeneration while poisoned
    if (socket.regenState.isPoisoned) {
      continue;
    }

    // Check if regen applies in combat
    if (socket.regenState.inCombat && !config.regenInCombat) {
      continue;
    }

    // Determine regen rate
    // Enhanced rate only if: has enhanced regen for this resource AND not in combat
    const hasEnhanced = socket.regenState.enhancedRegen.has(config.resourceKey);
    const canUseEnhanced = hasEnhanced && !socket.regenState.inCombat;
    const regenPercent = canUseEnhanced ? config.enhancedRegenPercent : config.baseRegenPercent;

    // Calculate regen amount (percentage of max, minimum 1)
    const regenAmount = Math.max(1, Math.ceil(max * regenPercent / 100));
    const newValue = Math.min(current + regenAmount, max);

    // Only update and send vitals if value changed
    if (newValue !== current) {
      setResourceValue(socket.vitals, config.resourceKey, newValue);
      sendVitalsFn(socket);
    }
  }
}

/**
 * Start regeneration loops for all registered resources
 */
export function startRegenLoops<T extends RegenCapableSocket>(
  connectedPlayers: Map<number, T>,
  sendVitals: (socket: T) => void
): void {
  // Clear shutdown flag when starting
  isShuttingDown = false;

  // Store references with type assertions (safe because T extends RegenCapableSocket)
  connectedPlayersRef = connectedPlayers as Map<number, RegenCapableSocket>;
  sendVitalsFn = sendVitals as (socket: RegenCapableSocket) => void;

  // Start a timer for each registered resource
  for (const [resourceKey, config] of regenConfigs) {
    // Clear any existing timer
    const existingTimer = regenTimers.get(resourceKey);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Create new timer
    const timer = setInterval(() => {
      processRegenTick(config);
    }, config.tickIntervalMs);

    regenTimers.set(resourceKey, timer);
    console.log(`[Regen] Started ${resourceKey} regeneration loop (every ${config.tickIntervalMs}ms)`);
  }
}

/**
 * Stop all regeneration loops
 */
export function stopRegenLoops(): void {
  // Set shutdown flag first to prevent race conditions
  isShuttingDown = true;

  for (const [resourceKey, timer] of regenTimers) {
    clearInterval(timer);
    console.log(`[Regen] Stopped ${resourceKey} regeneration loop`);
  }
  regenTimers.clear();
  connectedPlayersRef = null;
  sendVitalsFn = null;
}

/**
 * Initialize default resource regeneration configs
 * Called on server startup
 */
export function initializeDefaultRegenConfigs(): void {
  // Mana regeneration
  registerRegenResource({
    resourceKey: 'mana',
    tickIntervalMs: Number(process.env.MANA_TICK_INTERVAL_MS) || 5000,
    baseRegenPercent: Number(process.env.MANA_REGEN_BASE_PERCENT) || 2,
    enhancedRegenPercent: Number(process.env.MANA_REGEN_ENHANCED_PERCENT) || 5,
    regenInCombat: true,
  });

  // Health regeneration
  registerRegenResource({
    resourceKey: 'health',
    tickIntervalMs: Number(process.env.HEALTH_TICK_INTERVAL_MS) || 5000,
    baseRegenPercent: Number(process.env.HEALTH_REGEN_BASE_PERCENT) || 1,
    enhancedRegenPercent: Number(process.env.HEALTH_REGEN_ENHANCED_PERCENT) || 3,
    regenInCombat: true,
  });
}
