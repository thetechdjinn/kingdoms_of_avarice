/**
 * Command Queue System Types
 *
 * Defines the interfaces for the command queue system with dynamic action delays.
 * This system allows players to queue commands that execute sequentially with
 * configurable delays based on action type and player state.
 */

// ============================================================================
// Core Action Configuration
// ============================================================================

/**
 * Configuration for a single action type (move, attack, cast, etc.)
 */
export interface ActionConfig {
  /** Base delay in milliseconds before next action can execute */
  baseDelay: number;
  /** Categories of modifiers that affect this action's delay */
  modifierCategories: string[];
  /** Whether this action can be interrupted mid-execution */
  canInterrupt: boolean;
  /** Whether to clear the queue if this action fails/is interrupted */
  clearQueueOnFail: boolean;
  /** If true, this action bypasses the queue entirely (instant execution) */
  bypassQueue?: boolean;
  /** If true, this is a priority command that executes immediately but affects readyAt */
  priority?: boolean;
  /** If true, this action can only be used during combat */
  combatOnly?: boolean;
  /** Combat-specific behavior configuration */
  combatBehavior?: CombatBehavior;
}

/**
 * Combat-specific behavior for actions
 */
export interface CombatBehavior {
  /** Whether using this action initiates auto-attack */
  startsAutoAttack?: boolean;
  /** Whether this action can only be used while in combat */
  onlyInCombat?: boolean;
  /** Whether this action uses the combat round timer */
  usesCombatRound?: boolean;
  /** Whether this action can be interrupted by taking damage */
  interruptibleByDamage?: boolean;
  /** Other abilities that share a cooldown with this one */
  sharedCooldownWith?: string[];
}

// ============================================================================
// Delay Modifiers
// ============================================================================

/**
 * A modifier that affects action delay
 */
export interface DelayModifier {
  type: 'delay';
  /** Which actions this modifier affects ('all' for global) */
  actions: string[];
  /** Multiplier applied to delay (< 1 = faster, > 1 = slower) */
  multiplier: number;
}

/**
 * A modifier that affects a character stat
 */
export interface StatModifier {
  type: 'stat';
  stat: string;
  modifier: number;
}

export type Modifier = DelayModifier | StatModifier;

// ============================================================================
// Interrupt System
// ============================================================================

/**
 * Configuration for an interrupt trigger
 */
export interface InterruptTrigger {
  /** Which action types this trigger can interrupt */
  interrupts: string[];
  /** Probability of interrupt succeeding (0.0 to 1.0) */
  chance: number;
  /** Message sent to player when interrupted */
  message: string;
  /** If true, clears the entire queue on interrupt */
  clearsQueue?: boolean;
}

/**
 * How delay is handled when an action is interrupted
 */
export interface DelayBehavior {
  /** How the delay is calculated after interrupt */
  delayMode: 'full' | 'partial' | 'fixed' | 'replace' | 'cancel';
  /** Fixed delay in ms (for 'fixed' and 'replace' modes) */
  delayMs?: number;
  /** Percentage of original delay to apply (for 'partial' mode) */
  delayPercent?: number;
}

// ============================================================================
// Queue Configuration
// ============================================================================

/**
 * Configuration for queue bypass behavior
 */
export interface QueueBypassConfig {
  /** Whether queue bypass is enabled */
  enabled: boolean;
  /** Commands that always bypass the queue */
  bypassCommands: string[];
  /** If true, any action with baseDelay: 0 bypasses the queue */
  zeroDelayBypass: boolean;
}

/**
 * Configuration for the command queue
 */
export interface QueueConfig {
  /** Maximum number of commands allowed in queue */
  maxSize: number;
  /** Message shown when queue is full */
  overflowMessage: string;
  /** Cooldown in ms before showing overflow message again */
  overflowCooldownMs: number;
  /** Events that cause the queue to be cleared */
  clearEvents: string[];
  /** Commands that execute immediately regardless of queue state */
  priorityCommands: string[];
}

// ============================================================================
// Interrupt Resistance
// ============================================================================

/**
 * A source of interrupt resistance
 */
export interface InterruptResistanceSource {
  type: 'skill' | 'equipment' | 'buff';
  /** Equipment slot (for equipment type) */
  slot?: string;
  /** Flat reduction to interrupt chance */
  reduction: number;
  /** Reduction per skill level (for skill type) */
  reductionPerLevel?: number;
  /** Maximum reduction from this source */
  maxReduction?: number;
  /** Duration in ms (for buff type) */
  duration?: number;
}

/**
 * Configuration for interrupt resistance
 */
export interface InterruptResistanceConfig {
  /** Named sources of interrupt resistance */
  sources: Record<string, InterruptResistanceSource>;
  /** Minimum interrupt chance (floor) */
  minimumChance: number;
}

// ============================================================================
// Timing Configuration
// ============================================================================

/**
 * Configuration for game loop timing
 */
export interface TimingConfig {
  /** How often the game loop runs in ms */
  tickRateMs: number;
  /** Whether to align action execution to tick boundaries */
  alignToTicks: boolean;
  /** How to order player processing each tick */
  playerProcessingOrder: 'shuffle' | 'idOrder' | 'readyAtOrder' | 'roundRobin';
}

// ============================================================================
// Cooldown System
// ============================================================================

/**
 * Configuration for an ability cooldown
 */
export interface CooldownConfig {
  /** Cooldown duration in ms */
  cooldownMs: number;
  /** Shared cooldown group (null for individual cooldown) */
  sharedCooldownGroup: string | null;
  /** Whether cooldown starts when ability is used (default: true) */
  startOnUse: boolean;
  /** Whether cooldown starts when ability completes (default: false) */
  startOnComplete?: boolean;
}

/**
 * A cooldown group that affects multiple abilities
 */
export interface CooldownGroup {
  description: string;
  /** Abilities that trigger this group's cooldown */
  triggersCooldownFor?: string[];
}

// ============================================================================
// Encumbrance Configuration
// ============================================================================

/**
 * A point on the encumbrance curve
 */
export interface EncumbranceCurvePoint {
  /** Encumbrance percentage (0-100+) */
  percent: number;
  /** Delay multiplier at this point */
  multiplier: number;
}

/**
 * Configuration for encumbrance effects
 */
export interface EncumbranceConfig {
  /** Actions affected by encumbrance */
  affectsActions: string[];
  /** Points defining the encumbrance curve */
  curve: EncumbranceCurvePoint[];
  /** How to interpolate between curve points */
  interpolation: 'linear' | 'step' | 'smooth';
  /** Configuration for over-encumbered state */
  overEncumbered: {
    /** Threshold percentage that triggers over-encumbered */
    threshold: number;
    /** Whether over-encumbered blocks the action entirely */
    blocksAction: boolean;
    /** Message shown when action is blocked */
    message: string;
  };
}

// ============================================================================
// Combat Configuration
// ============================================================================

/**
 * Conditions that cause combat to end
 */
export interface CombatExitConditions {
  /** Combat ends when target dies */
  targetDies: boolean;
  /** Combat ends when all enemies are defeated */
  allEnemiesDefeated: boolean;
  /** Combat ends when player dies */
  playerDies: boolean;
  /** Combat ends when player moves to another room */
  playerMovesAway: boolean;
  /** Optional timeout configuration */
  timeout?: {
    enabled: boolean;
    durationMs: number;
  };
}

/**
 * Configuration for combat integration
 */
export interface CombatQueueConfig {
  /** Combat model to use */
  model: 'pureDelay' | 'roundBased' | 'hybrid';
  /** Duration of each combat round in ms */
  roundDurationMs: number;
  /** Whether player auto-attacks each round */
  autoAttack: boolean;
  /** Whether the queue is paused during combat */
  queuePausedDuringCombat: boolean;
  /** Commands allowed during combat */
  allowedCommandsInCombat: string[];
  /** Commands that can exit combat */
  exitCombatCommands: string[];
  /** Global delay modifier during combat */
  combatDelayModifier: number;
  /** Conditions that end combat */
  exitConditions: CombatExitConditions;
}

// ============================================================================
// Terrain Configuration
// ============================================================================

/**
 * Configuration for terrain-based delay modifiers
 */
export interface TerrainConfig {
  /** Actions affected by terrain */
  affectsActions: string[];
  /** Terrain types and their modifiers */
  types: Record<string, { multiplier: number; description: string }>;
}

// ============================================================================
// Weapon Speed Configuration
// ============================================================================

/**
 * Configuration for weapon-based delay modifiers
 */
export interface WeaponSpeedConfig {
  /** Actions affected by weapon speed */
  affectsActions: string[];
  /** Weapon types and their modifiers */
  types: Record<string, { multiplier: number }>;
  /** Default multiplier for unknown weapons */
  default: number;
}

// ============================================================================
// Delay Settings
// ============================================================================

/**
 * Global delay settings
 */
export interface DelaySettings {
  /** Minimum delay in ms (floor) */
  minDelay: number;
  /** Maximum delay in ms (ceiling) */
  maxDelay: number;
}

// ============================================================================
// Alias Configuration
// ============================================================================

/**
 * Built-in command aliases
 */
export type AliasConfig = Record<string, string>;

// ============================================================================
// Stacking Rules
// ============================================================================

/**
 * How modifiers of the same type stack
 */
export interface StackingRule {
  /** Stacking rule to apply */
  rule: 'multiplicative' | 'additive' | 'bestOnly' | 'worstOnly' | 'capped';
  /** Category for grouping (for bestOnly/worstOnly) */
  category?: string;
  /** Min/max cap (for capped rule) */
  cap?: { min: number; max: number };
}

// ============================================================================
// Master Configuration
// ============================================================================

/**
 * Complete command queue configuration
 */
export interface CommandQueueConfig {
  /** Action definitions */
  actions: Record<string, ActionConfig>;
  /** Queue settings */
  queue: QueueConfig;
  /** Queue bypass settings */
  queueBypass: QueueBypassConfig;
  /** Timing settings */
  timing: TimingConfig;
  /** Combat integration settings */
  combat: CombatQueueConfig;
  /** Encumbrance settings */
  encumbrance: EncumbranceConfig;
  /** Cooldown settings */
  cooldowns: {
    abilities: Record<string, CooldownConfig>;
    groups: Record<string, CooldownGroup>;
  };
  /** Terrain settings */
  terrain: TerrainConfig;
  /** Weapon speed settings */
  weaponSpeed: WeaponSpeedConfig;
  /** Global delay settings */
  delaySettings: DelaySettings;
  /** Command aliases */
  aliases: AliasConfig;
  /** Interrupt trigger configurations */
  interruptTriggers: Record<string, InterruptTrigger>;
  /** Delay behavior per interrupt type */
  interruptDelayBehavior: Record<string, DelayBehavior>;
  /** Interrupt resistance configuration */
  interruptResistance: InterruptResistanceConfig;
  /** Modifier stacking rules */
  stackingRules: Record<string, StackingRule>;
}

// ============================================================================
// Player Queue State
// ============================================================================

/**
 * Currently executing action
 */
export interface CurrentAction {
  /** The full command string */
  command: string;
  /** The action type (move, attack, cast, etc.) */
  type: string;
  /** Timestamp when action started */
  startedAt: number;
  /** Timestamp when action will complete */
  completesAt: number;
  /** Whether this action can be interrupted */
  canInterrupt: boolean;
}

/**
 * Cooldown state for an ability
 */
export interface CooldownState {
  /** Timestamp when cooldown ends */
  readyAt: number;
}

/**
 * Player's command queue state (runtime, not persisted)
 */
export interface PlayerQueueState {
  /** Pending commands in FIFO order */
  commandQueue: string[];
  /** Timestamp when player can execute next command */
  readyAt: number;
  /** Currently executing action (if any) */
  currentAction: CurrentAction | null;
  /** Cooldown state per ability/group */
  cooldowns: Record<string, CooldownState>;
  /** Timestamp of last overflow message */
  lastOverflowMessageTime: number;
}

/**
 * Initialize a new player queue state with default values
 */
export function createPlayerQueueState(): PlayerQueueState {
  return {
    commandQueue: [],
    readyAt: 0,
    currentAction: null,
    cooldowns: {},
    lastOverflowMessageTime: 0,
  };
}
