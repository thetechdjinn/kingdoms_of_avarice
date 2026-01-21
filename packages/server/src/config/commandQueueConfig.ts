/**
 * Command Queue Configuration Loader
 *
 * Loads and validates the command queue configuration from JSON.
 * Provides typed access to all configuration settings.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type {
  CommandQueueConfig,
  ActionConfig,
  QueueConfig,
  QueueBypassConfig,
  TimingConfig,
  CombatQueueConfig,
  EncumbranceConfig,
  TerrainConfig,
  DelaySettings,
  AliasConfig,
  InterruptTrigger,
  DelayBehavior,
  InterruptResistanceConfig,
  StackingRule,
  CooldownConfig,
  CooldownGroup,
} from '@koa/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Singleton configuration instance
let config: CommandQueueConfig | null = null;

/**
 * Load the command queue configuration from the JSON file
 */
function loadConfig(): CommandQueueConfig {
  const configPath = join(__dirname, 'commandQueue.json');

  try {
    const rawData = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(rawData) as CommandQueueConfig;
    validateConfig(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load command queue config: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate the configuration structure
 */
function validateConfig(cfg: CommandQueueConfig): void {
  // Validate required top-level sections exist
  const requiredSections = [
    'actions',
    'queue',
    'queueBypass',
    'timing',
    'combat',
    'encumbrance',
    'cooldowns',
    'terrain',
    'delaySettings',
    'aliases',
    'interruptTriggers',
    'interruptDelayBehavior',
    'interruptResistance',
    'stackingRules',
  ] as const;

  for (const section of requiredSections) {
    if (!(section in cfg)) {
      throw new Error(`Missing required configuration section: ${section}`);
    }
    const value = cfg[section as keyof CommandQueueConfig];
    if (value === null || typeof value !== 'object') {
      throw new Error(`Configuration section '${section}' must be an object`);
    }
  }

  // Validate timing config
  if (cfg.timing.tickRateMs < 10 || cfg.timing.tickRateMs > 1000) {
    throw new Error(`Invalid tickRateMs: ${cfg.timing.tickRateMs}. Must be between 10 and 1000.`);
  }

  // Validate queue config
  if (cfg.queue.maxSize < 1 || cfg.queue.maxSize > 100) {
    throw new Error(`Invalid queue maxSize: ${cfg.queue.maxSize}. Must be between 1 and 100.`);
  }

  // Validate delay settings
  if (cfg.delaySettings.minDelay < 0) {
    throw new Error(`Invalid minDelay: ${cfg.delaySettings.minDelay}. Must be non-negative.`);
  }
  if (cfg.delaySettings.maxDelay < cfg.delaySettings.minDelay) {
    throw new Error(`maxDelay (${cfg.delaySettings.maxDelay}) must be >= minDelay (${cfg.delaySettings.minDelay})`);
  }

  // Validate encumbrance interpolation
  const validInterpolations = ['linear', 'step', 'smooth'];
  if (!validInterpolations.includes(cfg.encumbrance.interpolation)) {
    throw new Error(
      `Invalid encumbrance interpolation: '${cfg.encumbrance.interpolation}'. ` +
      `Must be one of: ${validInterpolations.join(', ')}`
    );
  }

  // Validate encumbrance curve is sorted by percent ascending
  if (cfg.encumbrance.curve.length > 1) {
    for (let i = 1; i < cfg.encumbrance.curve.length; i++) {
      if (cfg.encumbrance.curve[i].percent <= cfg.encumbrance.curve[i - 1].percent) {
        throw new Error(
          `Encumbrance curve must be sorted by percent ascending. ` +
          `Found ${cfg.encumbrance.curve[i - 1].percent} before ${cfg.encumbrance.curve[i].percent}`
        );
      }
    }
  }

  // Validate actions have required fields
  for (const [actionName, action] of Object.entries(cfg.actions)) {
    if (typeof action.baseDelay !== 'number' || action.baseDelay < 0) {
      throw new Error(`Action '${actionName}' has invalid baseDelay: ${action.baseDelay}`);
    }
    if (typeof action.canInterrupt !== 'boolean') {
      throw new Error(`Action '${actionName}' missing canInterrupt boolean`);
    }
    if (typeof action.clearQueueOnFail !== 'boolean') {
      throw new Error(`Action '${actionName}' missing clearQueueOnFail boolean`);
    }
  }

  // Validate interrupt triggers reference valid delay behaviors
  for (const triggerName of Object.keys(cfg.interruptTriggers)) {
    if (!(triggerName in cfg.interruptDelayBehavior)) {
      console.warn(`[CommandQueueConfig] Warning: Interrupt trigger '${triggerName}' has no delay behavior defined`);
    }
  }

  console.log('[CommandQueueConfig] Configuration validated successfully');
}

/**
 * Get the command queue configuration (loads on first call)
 */
export function getCommandQueueConfig(): CommandQueueConfig {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

/**
 * Reload the configuration from disk (for hot-reloading)
 */
export function reloadCommandQueueConfig(): CommandQueueConfig {
  config = loadConfig();
  return config;
}

/**
 * Get configuration for a specific action
 */
export function getActionConfig(actionType: string): ActionConfig | undefined {
  const cfg = getCommandQueueConfig();
  return cfg.actions[actionType];
}

/**
 * Get the default action config for unknown actions
 */
export function getDefaultActionConfig(): ActionConfig {
  return {
    baseDelay: 100,
    modifierCategories: ['status'],
    canInterrupt: false,
    clearQueueOnFail: false,
  };
}

/**
 * Resolve a command alias to its full form
 */
export function resolveAlias(input: string): string {
  const cfg = getCommandQueueConfig();
  const parts = input.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  if (command in cfg.aliases) {
    const resolved = cfg.aliases[command];
    return args ? `${resolved} ${args}` : resolved;
  }

  return input;
}

/**
 * Check if a command should bypass the queue
 */
export function shouldBypassQueue(command: string): boolean {
  const cfg = getCommandQueueConfig();

  if (!cfg.queueBypass.enabled) {
    return false;
  }

  const commandName = command.trim().split(/\s+/)[0].toLowerCase();

  // Check explicit bypass list
  if (cfg.queueBypass.bypassCommands.includes(commandName)) {
    return true;
  }

  // Check if zero-delay bypass is enabled and action has zero delay
  if (cfg.queueBypass.zeroDelayBypass) {
    const actionConfig = getActionConfig(commandName);
    if (actionConfig?.baseDelay === 0) {
      return true;
    }
    if (actionConfig?.bypassQueue) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a command is a priority command
 */
export function isPriorityCommand(command: string): boolean {
  const cfg = getCommandQueueConfig();
  const commandName = command.trim().split(/\s+/)[0].toLowerCase();
  return cfg.queue.priorityCommands.includes(commandName);
}

/**
 * Get the terrain delay multiplier for a terrain type
 */
export function getTerrainMultiplier(terrainType: string): number {
  const cfg = getCommandQueueConfig();
  const terrain = cfg.terrain.types[terrainType];
  return terrain?.multiplier ?? 1.0;
}

/**
 * Get the encumbrance delay multiplier using curve interpolation
 */
export function getEncumbranceMultiplier(encumbrancePercent: number): number {
  const cfg = getCommandQueueConfig();
  const { curve, interpolation } = cfg.encumbrance;

  if (curve.length === 0) {
    return 1.0;
  }

  // Handle edge cases
  if (encumbrancePercent <= curve[0].percent) {
    return curve[0].multiplier;
  }
  if (encumbrancePercent >= curve[curve.length - 1].percent) {
    return curve[curve.length - 1].multiplier;
  }

  // Find bracketing points
  for (let i = 0; i < curve.length - 1; i++) {
    const lower = curve[i];
    const upper = curve[i + 1];

    if (encumbrancePercent >= lower.percent && encumbrancePercent < upper.percent) {
      const range = upper.percent - lower.percent;
      const position = (encumbrancePercent - lower.percent) / range;

      switch (interpolation) {
        case 'step':
          // Step: use lower value until reaching upper point
          return lower.multiplier;
        case 'smooth':
          // Smoothstep interpolation for gradual transitions
          const smoothPosition = position * position * (3 - 2 * position);
          return lower.multiplier + (upper.multiplier - lower.multiplier) * smoothPosition;
        case 'linear':
        default:
          // Linear interpolation
          return lower.multiplier + (upper.multiplier - lower.multiplier) * position;
      }
    }
  }

  // Fallback (should not reach)
  return 1.0;
}

/**
 * Check if an action can be used only in combat
 */
export function isCombatOnlyAction(actionType: string): boolean {
  const actionConfig = getActionConfig(actionType);
  return actionConfig?.combatOnly === true || actionConfig?.combatBehavior?.onlyInCombat === true;
}

/**
 * Get cooldown configuration for an ability
 */
export function getCooldownConfig(abilityName: string): CooldownConfig | undefined {
  const cfg = getCommandQueueConfig();
  return cfg.cooldowns.abilities[abilityName];
}

/**
 * Get cooldown group configuration
 */
export function getCooldownGroup(groupName: string): CooldownGroup | undefined {
  const cfg = getCommandQueueConfig();
  return cfg.cooldowns.groups[groupName];
}

/**
 * Get interrupt trigger configuration
 */
export function getInterruptTrigger(triggerName: string): InterruptTrigger | undefined {
  const cfg = getCommandQueueConfig();
  return cfg.interruptTriggers[triggerName];
}

/**
 * Get delay behavior for an interrupt type
 */
export function getInterruptDelayBehavior(triggerName: string): DelayBehavior | undefined {
  const cfg = getCommandQueueConfig();
  return cfg.interruptDelayBehavior[triggerName];
}

/**
 * Clamp a delay value to the configured min/max
 */
export function clampDelay(delay: number): number {
  const cfg = getCommandQueueConfig();
  return Math.max(cfg.delaySettings.minDelay, Math.min(cfg.delaySettings.maxDelay, delay));
}

// Export commonly accessed config sections
export {
  CommandQueueConfig,
  ActionConfig,
  QueueConfig,
  QueueBypassConfig,
  TimingConfig,
  CombatQueueConfig,
  EncumbranceConfig,
  TerrainConfig,
  DelaySettings,
  AliasConfig,
  InterruptTrigger,
  DelayBehavior,
  InterruptResistanceConfig,
  StackingRule,
  CooldownConfig,
  CooldownGroup,
};
