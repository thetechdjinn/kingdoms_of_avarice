# MUD Command Queue & Action Delay System Architecture

## Overview

This document describes the architecture for a command queue system with dynamic action delays, inspired by classic MUDs like MajorMUD. The system allows players to type commands rapidly while the game processes them sequentially with appropriate delays based on action type and player state.

### Key Principles

- **Non-blocking input**: Players can always type commands, regardless of current action state
- **FIFO processing**: Commands execute in the order received
- **Dynamic delays**: Action delays are calculated based on multiple factors (encumbrance, status effects, equipment, terrain, etc.)
- **Data-driven configuration**: All delays and modifiers are configurable without code changes
- **Extensible modifier system**: New delay modifiers can be added without modifying core logic

---

## TypeScript Interface Definitions

For TypeScript implementations, use these interface definitions:

```typescript
// Core action configuration
interface ActionConfig {
  baseDelay: number;
  modifierCategories: string[];
  canInterrupt: boolean;
  clearQueueOnFail: boolean;
  bypassQueue?: boolean;
  priority?: boolean;
  combatOnly?: boolean;
  combatBehavior?: CombatBehavior;
}

interface CombatBehavior {
  startsAutoAttack?: boolean;
  onlyInCombat?: boolean;
  usesCombatRound?: boolean;
  interruptibleByDamage?: boolean;
  sharedCooldownWith?: string[];
}

// Delay modifiers
interface DelayModifier {
  type: 'delay';
  actions: string[] | ['all'];
  multiplier: number;
}

interface StatModifier {
  type: 'stat';
  stat: string;
  modifier: number;
}

type Modifier = DelayModifier | StatModifier;

// Status effects
interface StatusEffect {
  id: string;
  name: string;
  duration: number;
  modifiers: Modifier[];
  interruptTrigger?: InterruptTrigger;
}

// Interrupt system
interface InterruptTrigger {
  interrupts: string[];
  chance: number;
  message: string;
  clearsQueue?: boolean;
}

interface DelayBehavior {
  delayMode: 'full' | 'partial' | 'fixed' | 'replace' | 'cancel';
  delayMs?: number;
  delayPercent?: number;
}

// Queue bypass configuration
interface QueueBypassConfig {
  enabled: boolean;
  bypassCommands: string[];
  zeroDelayBypass: boolean;
}

// Interrupt resistance configuration
interface InterruptResistanceConfig {
  sources: Record<string, InterruptResistanceSource>;
  minimumChance: number;
}

interface InterruptResistanceSource {
  type: 'skill' | 'equipment' | 'buff';
  slot?: string;
  reduction: number;
  reductionPerLevel?: number;
  maxReduction?: number;
  duration?: number;
}

// Player state
interface PlayerState {
  commandQueue: string[];
  readyAt: number;
  currentAction: CurrentAction | null;
  cooldowns: Record<string, { readyAt: number }>;
  statusEffects: StatusEffect[];
  inCombat: boolean;
  carriedWeight: number;
  maxCarryWeight: number;
}

interface CurrentAction {
  command: string;
  type: string;
  startedAt: number;
  completesAt: number;
  canInterrupt: boolean;
}

// Queue configuration
interface QueueConfig {
  maxSize: number;
  overflowMessage: string;
  overflowCooldownMs: number;
  clearEvents: string[];
  priorityCommands: string[];
}

// Timing configuration
interface TimingConfig {
  tickRateMs: number;
  alignToTicks: boolean;
  playerProcessingOrder: 'shuffle' | 'idOrder' | 'readyAtOrder' | 'roundRobin';
}

// Cooldown configuration
interface CooldownConfig {
  cooldownMs: number;
  sharedCooldownGroup: string | null;
  startOnUse: boolean;        // Default: true (if startOnComplete is false/undefined)
  startOnComplete?: boolean;  // Default: false. At least one must be true.
}

// Encumbrance curve
interface EncumbranceCurvePoint {
  percent: number;
  multiplier: number;
}

interface EncumbranceConfig {
  affectsActions: string[];
  curve: EncumbranceCurvePoint[];
  interpolation: 'linear' | 'step' | 'smooth';
  overEncumbered: {
    threshold: number;
    blocksAction: boolean;
    message: string;
  };
}

// Combat configuration
interface CombatConfig {
  model: 'pureDelay' | 'roundBased' | 'hybrid';
  roundDurationMs: number;
  autoAttack: boolean;
  queuePausedDuringCombat: boolean;
  allowedCommandsInCombat: string[];
  exitCombatCommands: string[];
  combatDelayModifier: number;
  exitConditions: CombatExitConditions;
}

interface CombatExitConditions {
  targetDies: boolean;
  allEnemiesDefeated: boolean;
  playerDies: boolean;
  playerMovesAway: boolean;
  timeout?: {
    enabled: boolean;
    durationMs: number;
  };
}

// Alias configuration
interface AliasConfig {
  [alias: string]: string;
}

// Master configuration
interface GameConfig {
  actions: Record<string, ActionConfig>;
  queue: QueueConfig;
  queueBypass: QueueBypassConfig;
  timing: TimingConfig;
  combat: CombatConfig;
  encumbrance: EncumbranceConfig;
  cooldowns: {
    abilities: Record<string, CooldownConfig>;
    groups: Record<string, { description: string; triggersCooldownFor?: string[] }>;
  };
  terrain: {
    affectsActions: string[];
    types: Record<string, { multiplier: number; description: string }>;
  };
  weaponSpeed: {
    affectsActions: string[];
    types: Record<string, { multiplier: number }>;
    default: number;
  };
  aliases: AliasConfig;
  interruptTriggers: Record<string, InterruptTrigger>;
  interruptDelayBehavior: Record<string, DelayBehavior>;
  interruptResistance: InterruptResistanceConfig;
  stackingRules: Record<string, StackingRule>;
}

interface StackingRule {
  rule: 'multiplicative' | 'additive' | 'bestOnly' | 'worstOnly' | 'capped';
  category?: string;
  cap?: { min: number; max: number };
}
```

---

## Core Components

### 1. Command Queue

Each player maintains their own command queue that stores pending commands.

```
┌─────────────────────────────────────────────────────────────┐
│                        Player                               │
├─────────────────────────────────────────────────────────────┤
│  commandQueue: ["north", "north", "look", "get sword"]      │
│  readyAt: timestamp (when next command can execute)         │
│  state: { encumbrance, statusEffects, equipment, ... }      │
└─────────────────────────────────────────────────────────────┘
```

#### Queue Properties

| Property | Type | Description |
|----------|------|-------------|
| `commandQueue` | Array | FIFO queue of pending command strings |
| `readyAt` | Timestamp | When the player can execute their next command |
| `maxQueueSize` | Number | Maximum commands allowed in queue (configurable, recommend 10-20) |

#### Queue Behaviors

- **Always Accept Input**: Input handler pushes to queue immediately without blocking
- **Queue Limits**: Reject commands when queue exceeds `maxQueueSize` (see Queue Overflow Handling below)
- **Queue Clearing**: Certain events clear the queue (death, stun, teleport, disconnect)
- **Priority Commands**: Some commands bypass the queue (quit, recall)

#### Queue Overflow Handling

When a player's command queue reaches its maximum size, additional commands are rejected and the player receives feedback. This prevents macro abuse and encourages natural play pacing.

**Behavior:**
1. Player submits a command
2. System checks if `commandQueue.length >= maxQueueSize`
3. If at capacity:
   - **Discard the command** (it is NOT added to the queue)
   - Send overflow message to player
   - The command is lost and must be retyped once the queue has room
4. If not at capacity: add command to queue normally

**Important:** Commands that arrive when the queue is full are permanently discarded. They do not wait or get added later—the player must re-enter them after the queue drains.

**Configuration:**

```json
{
  "queue": {
    "maxSize": 15,
    "overflowMessage": "Why don't you slow down a few seconds?",
    "overflowCooldownMs": 1000
  }
}
```

| Setting | Type | Description |
|---------|------|-------------|
| `maxSize` | Number | Maximum commands allowed in queue |
| `overflowMessage` | String | Message sent to player when queue is full |
| `overflowCooldownMs` | Number | Optional cooldown before showing message again (prevents message spam) |

**Example Implementation Logic:**

```
function onPlayerInput(player, command):
    if player.commandQueue.length >= settings.queue.maxSize:
        // Command is DISCARDED - not queued, not saved, not deferred
        if canShowOverflowMessage(player):
            sendToPlayer(player, settings.queue.overflowMessage)
            player.lastOverflowMessageTime = now()
        return  // Exit without adding to queue - command is lost
    
    player.commandQueue.push(command)

function canShowOverflowMessage(player):
    if settings.queue.overflowCooldownMs == 0:
        return true
    return now() - player.lastOverflowMessageTime >= settings.queue.overflowCooldownMs
```

**Design Notes:**
- The overflow message is configurable to match your game's tone and style
- The optional cooldown prevents spamming the player with repeated messages if they keep typing rapidly
- Consider logging overflow events to identify potential bot/macro abuse

---

### 2. Game Loop

The game loop is responsible for processing command queues for all players.

#### Tick-Based Approach (Recommended)

```
┌──────────────────────────────────────────────────────────────┐
│                      Main Game Loop                          │
│                   (runs every ~100ms)                        │
├──────────────────────────────────────────────────────────────┤
│  1. Get current timestamp                                    │
│  2. For each connected player:                               │
│     a. If queue is not empty AND currentTime >= readyAt:     │
│        - Dequeue next command                                │
│        - Execute command                                     │
│        - Calculate delay based on action + player state      │
│        - Set readyAt = currentTime + calculatedDelay         │
│  3. Process other game systems (NPC AI, respawns, etc.)      │
│  4. Sleep until next tick                                    │
└──────────────────────────────────────────────────────────────┘
```

#### Why Tick-Based?

- Predictable timing across all players
- Easier synchronization for multiplayer interactions
- Simpler combat round management
- Traditional MUD approach with abundant documentation

#### Tick Alignment

The design uses `readyAt` timestamps with a tick-based loop. When `readyAt` falls between ticks, actions execute on the next tick boundary.

**Behavior:**
- Delays are effectively rounded UP to the next tick boundary
- With a 100ms tick rate, a 350ms delay executes at 400ms
- This slight latency is acceptable for MUDs and simplifies implementation

**Configuration:**
```json
{
  "timing": {
    "tickRateMs": 100,
    "alignToTicks": true
  }
}
```

**Alternative - Precise Timing:**
If sub-tick precision is needed, set `alignToTicks: false` and use timer-based execution per player. This adds complexity and is generally unnecessary for MUDs.

```
┌─────────────────────────────────────────────────────────────┐
│              Tick Alignment Example                         │
├─────────────────────────────────────────────────────────────┤
│  Tick:    0    100    200    300    400    500    600       │
│           │     │      │      │      │      │      │        │
│  Action delay: 350ms                                        │
│  Started at: t=0                                            │
│  readyAt: t=350                                             │
│  Executes at: t=400 (next tick after readyAt)               │
└─────────────────────────────────────────────────────────────┘
```

#### Player Processing Order

When multiple players are ready on the same tick, processing order can affect outcomes (e.g., two players attacking each other simultaneously).

**Strategies:**

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| `shuffle` | Random order each tick | Fair, unpredictable | Non-deterministic replays |
| `idOrder` | Consistent by player ID | Deterministic | Advantage to lower IDs |
| `readyAtOrder` | Earlier readyAt first | Rewards faster actions | Tiny timing advantages |
| `roundRobin` | Rotate starting position | Fair over time | More complex |

**Recommended:** `shuffle` for fairness, or `roundRobin` if determinism is needed.

```json
{
  "timing": {
    "tickRateMs": 100,
    "alignToTicks": true,
    "playerProcessingOrder": "shuffle"
  }
}
```

---

### 3. Delay Calculator

The delay calculator computes action delays dynamically based on registered modifiers.

#### Calculation Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Base Delay  │ ──▶ │ Action-Specific │ ──▶ │ Global          │
│ (from data) │     │ Modifiers       │     │ Modifiers       │
└─────────────┘     └─────────────────┘     └─────────────────┘
                                                    │
                                                    ▼
                                            ┌─────────────────┐
                                            │ Final Delay     │
                                            │ (clamped)       │
                                            └─────────────────┘
```

#### Formula

```
finalDelay = baseDelay × modifier₁ × modifier₂ × ... × modifierₙ
finalDelay = clamp(finalDelay, MIN_DELAY, MAX_DELAY)
```

---

## Combat Round Integration

MUDs handle combat in different ways. This section clarifies how the command queue integrates with combat.

### Combat Models

| Model | Description | Queue Behavior |
|-------|-------------|----------------|
| **Pure Delay** | Attacks are commands with delays | Attack queues like any command |
| **Round-Based** | Combat runs on fixed intervals | Separate system, queue paused |
| **Hybrid** | Commands queue, resolve on rounds | Queue feeds into round resolution |

### Recommended: Hybrid Approach

The hybrid model provides the best balance of responsiveness and classic MUD feel.

**How it Works:**
1. Player enters `attack goblin` - command enters queue
2. When command executes, player enters "combat state" with target
3. Combat system auto-attacks on round intervals while in combat
4. Additional commands (skills, spells) still use the queue
5. Exiting combat (target dies, recall, etc.) returns to normal queue processing

```
┌─────────────────────────────────────────────────────────────┐
│                  Hybrid Combat Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Queue: [attack goblin] [bash] [cast heal]                  │
│              │                                              │
│              ▼                                              │
│  "attack goblin" executes                                   │
│              │                                              │
│              ▼                                              │
│  Player enters combat state                                 │
│  ┌─────────────────────────────────┐                       │
│  │  Combat Round Timer (2000ms)    │                       │
│  │  - Auto-attack on each round    │                       │
│  │  - Queue still processes        │──▶ "bash" executes    │
│  │  - Commands affect combat       │──▶ "cast heal" executes│
│  └─────────────────────────────────┘                       │
│              │                                              │
│              ▼                                              │
│  Combat ends (target dies / recall)                         │
│              │                                              │
│              ▼                                              │
│  Return to normal queue processing                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Combat Configuration

```json
{
  "combat": {
    "model": "hybrid",
    "roundDurationMs": 2000,
    "autoAttack": true,
    "queuePausedDuringCombat": false,
    "allowedCommandsInCombat": ["attack", "cast", "use", "say"],
    "exitCombatCommands": ["recall"],
    "combatDelayModifier": 1.0,
    "exitConditions": {
      "targetDies": true,
      "allEnemiesDefeated": true,
      "playerDies": true,
      "playerMovesAway": true,
      "timeout": {
        "enabled": false,
        "durationMs": 30000
      }
    }
  }
}
```

| Setting | Description |
|---------|-------------|
| `model` | Combat model: "pureDelay", "roundBased", or "hybrid" |
| `roundDurationMs` | Duration of each combat round |
| `autoAttack` | Whether player auto-attacks each round |
| `queuePausedDuringCombat` | If true, queue only processes combat commands |
| `allowedCommandsInCombat` | Commands that can execute during combat |
| `exitCombatCommands` | Commands that allow voluntary exit from combat |
| `combatDelayModifier` | Global modifier to delays while in combat |
| `exitConditions` | Automatic conditions that end combat (see below) |

**Exit Conditions:**

Combat ends automatically when any of these conditions occur (if enabled):

| Condition | Description |
|-----------|-------------|
| `targetDies` | The player's current target is killed |
| `allEnemiesDefeated` | All engaged enemies are dead or have disengaged |
| `playerDies` | The player dies |
| `playerMovesAway` | The player successfully moves to another room |
| `timeout` | No combat actions for specified duration (optional) |

The `exitCombatCommands` list specifies commands that allow *voluntary* exit (like `recall`). These are separate from automatic exit conditions.

### Combat Actions vs Regular Actions

Some commands behave differently in combat:

```json
{
  "actions": {
    "attack": {
      "baseDelay": 2000,
      "combatBehavior": {
        "startsAutoAttack": true,
        "onlyInCombat": false,
        "usesCombatRound": true
      }
    },
    "bash": {
      "baseDelay": 3000,
      "combatBehavior": {
        "onlyInCombat": true,
        "usesCombatRound": true,
        "sharedCooldownWith": ["kick", "trip"]
      }
    },
    "cast": {
      "baseDelay": 3000,
      "combatBehavior": {
        "onlyInCombat": false,
        "usesCombatRound": false,
        "interruptibleByDamage": true
      }
    }
  }
}
```

---

## Modifier System

The modifier system allows flexible, extensible delay calculations without hardcoding.

### Modifier Types

#### Action-Specific Modifiers

Applied only to specific action types.

| Modifier | Applies To | Description |
|----------|------------|-------------|
| `encumbrance` | move | Weight carried affects movement speed |
| `terrain` | move | Room terrain type affects movement |
| `armor` | move | Heavy armor slows movement |
| `weaponSpeed` | attack | Weapon type determines attack speed |
| `spellComplexity` | cast | Higher level spells take longer |
| `skillLevel` | various | Higher skill = faster execution |

#### Global Modifiers

Applied to all actions.

| Modifier | Description |
|----------|-------------|
| `haste` | Magical speed increase (reduces all delays) |
| `slow` | Magical speed decrease (increases all delays) |
| `stunned` | Severely increased delays or blocked actions |
| `paralyzed` | Cannot perform most actions |
| `encumberedMovement` | Over 100% = cannot move |

### Modifier Registration

Modifiers are registered with the delay calculator and associated with action types.

```
DelayCalculator
├── modifiers
│   ├── move: [encumbrance, terrain, armor, boots]
│   ├── attack: [weaponSpeed, skill, stance]
│   ├── cast: [spellLevel, focus, interruption]
│   ├── global: [haste, slow, stun]
```

### Modifier Priority

Modifiers can have priority values to control application order. Lower priority executes first.

| Priority | Use Case |
|----------|----------|
| 0-99 | Base modifiers (encumbrance, terrain) |
| 100-199 | Equipment modifiers (armor, weapons) |
| 200-299 | Skill/stat modifiers |
| 300-399 | Temporary effects (buffs/debuffs) |
| 400+ | Override effects (stun, paralyze) |

---

## Status Effect Integration

Status effects that modify delays should integrate with the modifier system.

### Status Effect Structure

```
StatusEffect {
  id: string
  name: string
  duration: number (ms or ticks)
  modifiers: [
    { type: "delay", actions: ["all"], multiplier: 1.5 },
    { type: "delay", actions: ["move"], multiplier: 2.0 },
    { type: "stat", stat: "strength", modifier: -5 }
  ]
}
```

### Example Status Effects

#### Haste

```
{
  "id": "haste",
  "name": "Haste",
  "duration": 60000,
  "modifiers": [
    { "type": "delay", "actions": ["all"], "multiplier": 0.5 }
  ]
}
```

#### Slow

```
{
  "id": "slow",
  "name": "Slow",
  "duration": 30000,
  "modifiers": [
    { "type": "delay", "actions": ["all"], "multiplier": 2.0 }
  ]
}
```

#### Weighted Boots Curse

```
{
  "id": "weighted_boots_curse",
  "name": "Weighted Boots",
  "duration": 120000,
  "modifiers": [
    { "type": "delay", "actions": ["move"], "multiplier": 1.75 },
    { "type": "delay", "actions": ["attack"], "multiplier": 1.25 }
  ]
}
```

#### Battle Frenzy

```
{
  "id": "battle_frenzy",
  "name": "Battle Frenzy",
  "duration": 45000,
  "modifiers": [
    { "type": "delay", "actions": ["attack"], "multiplier": 0.7 },
    { "type": "delay", "actions": ["cast"], "multiplier": 1.5 }
  ]
}
```

---

## Data Configuration

All delays and modifiers should be defined in configuration files.

### Action Definitions

```json
{
  "actions": {
    "move": {
      "baseDelay": 300,
      "modifierCategories": ["encumbrance", "terrain", "armor", "status"],
      "canInterrupt": false,
      "clearQueueOnFail": false
    },
    "attack": {
      "baseDelay": 2000,
      "modifierCategories": ["weaponSpeed", "skill", "stance", "status"],
      "canInterrupt": true,
      "clearQueueOnFail": false
    },
    "cast": {
      "baseDelay": 3000,
      "modifierCategories": ["spellLevel", "focus", "status"],
      "canInterrupt": true,
      "clearQueueOnFail": true
    },
    "look": {
      "baseDelay": 0,
      "modifierCategories": [],
      "canInterrupt": false,
      "clearQueueOnFail": false,
      "bypassQueue": true
    },
    "get": {
      "baseDelay": 100,
      "modifierCategories": ["status"],
      "canInterrupt": false,
      "clearQueueOnFail": false
    },
    "drop": {
      "baseDelay": 100,
      "modifierCategories": ["status"],
      "canInterrupt": false,
      "clearQueueOnFail": false
    },
    "say": {
      "baseDelay": 0,
      "modifierCategories": [],
      "canInterrupt": false,
      "clearQueueOnFail": false,
      "bypassQueue": true
    }
  }
}
```

### Zero-Delay and Queue Bypass

Commands with `baseDelay: 0` or `bypassQueue: true` are handled specially for responsiveness:

```json
{
  "queueBypass": {
    "enabled": true,
    "bypassCommands": ["look", "say", "who", "score", "inventory"],
    "zeroDelayBypass": true
  }
}
```

| Setting | Description |
|---------|-------------|
| `bypassCommands` | Commands that always skip the queue |
| `zeroDelayBypass` | If true, any command with baseDelay: 0 bypasses queue |

### bypassQueue vs priorityCommands

These two mechanisms serve different purposes:

| Mechanism | Purpose | Behavior |
|-----------|---------|----------|
| `bypassQueue` | Instant info commands | Executes immediately, does NOT affect `readyAt`, does NOT consume action |
| `priorityCommands` | Urgent actions when busy | Executes immediately, DOES affect `readyAt`, DOES consume action |

**bypassQueue** is for zero-impact informational commands like `look`, `inventory`, or `say`. These don't interfere with the player's action state—you can look around while swinging a sword.

**priorityCommands** is for urgent actions that must execute even when the player has pending actions. These are real actions that affect game state (like `recall` teleporting you away or `quit` disconnecting).

### Input Processing Pseudocode

```
function onPlayerInput(player, input):
    // Step 1: Resolve aliases
    resolvedCommand = resolveAlias(input)
    commandName = resolvedCommand.split(" ")[0]
    
    // Step 2: Check for bypass commands (instant, no impact on action state)
    if commandName in settings.queueBypass.bypassCommands:
        executeCommand(player, resolvedCommand)
        return  // Does not affect readyAt or queue
    
    actionConfig = getActionConfig(commandName)
    
    // Step 3: Check for zero-delay bypass
    if settings.queueBypass.zeroDelayBypass AND actionConfig.baseDelay == 0:
        executeCommand(player, resolvedCommand)
        return  // Does not affect readyAt or queue
    
    // Step 4: Check for priority commands (urgent, bypasses queue but affects state)
    if commandName in settings.queue.priorityCommands:
        executeCommand(player, resolvedCommand)
        delay = calculateDelay(player, actionConfig)
        player.readyAt = now() + delay
        return  // Bypassed queue but consumed action
    
    // Step 5: Normal queue processing
    if player.commandQueue.length >= settings.queue.maxSize:
        if canShowOverflowMessage(player):
            sendToPlayer(player, settings.queue.overflowMessage)
            player.lastOverflowMessageTime = now()
        return  // Command discarded
    
    player.commandQueue.push(resolvedCommand)
```

**Example Scenarios:**

| Command | Type | Result |
|---------|------|--------|
| `look` | bypassQueue | Executes instantly, player can still attack on next tick |
| `inventory` | bypassQueue | Executes instantly, no delay added |
| `recall` | priorityCommand | Executes instantly, sets readyAt, teleports player |
| `quit` | priorityCommand | Executes instantly, disconnects player |
| `north` | normal | Added to queue, waits for readyAt |
| `attack goblin` | normal | Added to queue, waits for readyAt |

### Encumbrance Curve

```json
{
  "encumbrance": {
    "affectsActions": ["move"],
    "curve": [
      { "percent": 0, "multiplier": 0.70 },
      { "percent": 25, "multiplier": 0.85 },
      { "percent": 50, "multiplier": 1.00 },
      { "percent": 75, "multiplier": 1.35 },
      { "percent": 90, "multiplier": 1.80 },
      { "percent": 100, "multiplier": 2.50 }
    ],
    "interpolation": "linear",
    "overEncumbered": {
      "threshold": 100,
      "blocksAction": true,
      "message": "You are too encumbered to move!"
    }
  }
}
```

**Curve Interpolation:**

The curve defines discrete points. Values between points are interpolated.

```
function getEncumbranceMultiplier(encumbrancePercent):
    curve = settings.encumbrance.curve
    
    // Handle edge cases
    if encumbrancePercent <= curve[0].percent:
        return curve[0].multiplier
    if encumbrancePercent >= curve[last].percent:
        return curve[last].multiplier
    
    // Find bracketing points
    for i = 0 to curve.length - 2:
        lower = curve[i]
        upper = curve[i + 1]
        
        if encumbrancePercent >= lower.percent AND encumbrancePercent < upper.percent:
            // Linear interpolation between points
            range = upper.percent - lower.percent
            position = (encumbrancePercent - lower.percent) / range
            return lower.multiplier + (upper.multiplier - lower.multiplier) * position
    
    // Fallback (should not reach)
    return 1.0

// Example calculations:
// encumbrancePercent = 60%
// Bracketed by: { percent: 50, multiplier: 1.00 } and { percent: 75, multiplier: 1.35 }
// range = 75 - 50 = 25
// position = (60 - 50) / 25 = 0.4
// result = 1.00 + (1.35 - 1.00) * 0.4 = 1.00 + 0.14 = 1.14
```

**Interpolation Modes:**

| Mode | Description |
|------|-------------|
| `linear` | Straight line between points (recommended for most cases) |
| `step` | Use lower point's value until reaching next point (no smoothing) |
| `smooth` | Catmull-Rom spline interpolation for gradual curve transitions |

**When to use each mode:**
- `linear` - Default choice, predictable and easy to understand
- `step` - When you want discrete thresholds (e.g., "below 50% = fast, above 50% = slow")
- `smooth` - When transitions should feel natural without sharp inflection points

### Terrain Modifiers

```json
{
  "terrain": {
    "affectsActions": ["move"],
    "types": {
      "road": { "multiplier": 0.8, "description": "Well-maintained path" },
      "grass": { "multiplier": 1.0, "description": "Open grassland" },
      "forest": { "multiplier": 1.2, "description": "Dense trees slow progress" },
      "swamp": { "multiplier": 1.6, "description": "Murky water and mud" },
      "mountain": { "multiplier": 1.4, "description": "Rocky, steep terrain" },
      "sand": { "multiplier": 1.3, "description": "Loose, shifting sand" },
      "ice": { "multiplier": 1.1, "description": "Slippery frozen surface" },
      "underwater": { "multiplier": 2.0, "description": "Resistance of water" }
    }
  }
}
```

### Weapon Speed Modifiers

```json
{
  "weaponSpeed": {
    "affectsActions": ["attack"],
    "types": {
      "dagger": { "multiplier": 0.6 },
      "shortSword": { "multiplier": 0.8 },
      "longSword": { "multiplier": 1.0 },
      "battleAxe": { "multiplier": 1.2 },
      "greatSword": { "multiplier": 1.4 },
      "warHammer": { "multiplier": 1.5 }
    },
    "default": 1.0
  }
}
```

### Global Settings

```json
{
  "delaySettings": {
    "minDelay": 50,
    "maxDelay": 10000,
    "tickRate": 100
  },
  "queue": {
    "maxSize": 15,
    "overflowMessage": "Why don't you slow down a few seconds?",
    "overflowCooldownMs": 1000,
    "clearEvents": ["death", "teleport", "stun", "disconnect"],
    "priorityCommands": ["quit", "recall"]
  }
}
```

---

## Implementation Considerations

### Race/Class Modifiers

Races and classes may have innate speed modifiers.

```json
{
  "races": {
    "elf": {
      "modifiers": [
        { "action": "move", "terrain": "forest", "multiplier": 0.8 }
      ]
    },
    "dwarf": {
      "modifiers": [
        { "action": "move", "terrain": "mountain", "multiplier": 0.9 },
        { "action": "move", "terrain": "underground", "multiplier": 0.85 }
      ]
    }
  },
  "classes": {
    "rogue": {
      "modifiers": [
        { "action": "move", "multiplier": 0.9 },
        { "action": "backstab", "multiplier": 0.8 }
      ]
    },
    "warrior": {
      "modifiers": [
        { "action": "attack", "multiplier": 0.95 }
      ]
    }
  }
}
```

### Stacking Rules

Define how multiple modifiers of the same type stack.

| Stacking Rule | Description |
|---------------|-------------|
| `multiplicative` | All modifiers multiply together (0.8 × 0.9 = 0.72) |
| `additive` | Modifiers add to base (1.0 + (-0.2) + (-0.1) = 0.7) |
| `bestOnly` | Only the best modifier applies |
| `worstOnly` | Only the worst modifier applies |
| `capped` | Multiplicative but capped at min/max |

```json
{
  "stackingRules": {
    "haste": { "rule": "bestOnly", "category": "speedBuff" },
    "slow": { "rule": "worstOnly", "category": "speedDebuff" },
    "encumbrance": { "rule": "multiplicative" },
    "terrain": { "rule": "multiplicative" },
    "equipment": { "rule": "multiplicative", "cap": { "min": 0.5, "max": 2.0 } }
  }
}
```

### Queue Events

Events that can affect the command queue.

| Event | Queue Action | Description |
|-------|--------------|-------------|
| Death | Clear | Player dies, all pending commands discarded |
| Stun | Clear | Player stunned, cannot act |
| Teleport | Clear | Location change invalidates movement commands |
| Disconnect | Clear | Player disconnects |
| Interrupt | Clear Current | Current action interrupted, queue remains |
| Silence | Filter | Remove spell commands from queue |

---

## Interrupt System

Some actions can be interrupted before they complete. This section defines how interrupts work.

### What is an Interruptable Action?

Actions marked with `canInterrupt: true` can be cancelled mid-execution by certain game events. Typically these are actions with longer delays where something could realistically disrupt them.

| Action | Interruptable | Rationale |
|--------|---------------|-----------|
| `cast` | Yes | Concentration can be broken |
| `attack` | Yes | Can be parried, dodged, or disrupted |
| `move` | No | Movement is instantaneous once started |
| `look` | No | Instant action |
| `get` | No | Too fast to interrupt |

### Interrupt Triggers

Interrupts are triggered by specific game events. Each trigger can be configured with which action types it affects.

```json
{
  "interruptTriggers": {
    "takeDamage": {
      "interrupts": ["cast"],
      "chance": 0.75,
      "message": "Your concentration is broken!"
    },
    "bash": {
      "interrupts": ["cast", "attack"],
      "chance": 1.0,
      "message": "You are knocked off balance!"
    },
    "stun": {
      "interrupts": ["cast", "attack"],
      "chance": 1.0,
      "message": "You are stunned!",
      "clearsQueue": true
    },
    "knockdown": {
      "interrupts": ["cast", "attack"],
      "chance": 1.0,
      "message": "You are knocked to the ground!"
    },
    "silence": {
      "interrupts": ["cast"],
      "chance": 1.0,
      "message": "You have been silenced!"
    },
    "forcedMovement": {
      "interrupts": ["cast", "attack"],
      "chance": 1.0,
      "message": "You are forced to move!"
    }
  }
}
```

| Trigger | Typical Source | Affected Actions |
|---------|----------------|------------------|
| `takeDamage` | Any incoming damage | Spellcasting |
| `bash` | Shield bash ability | Casting, attacking |
| `stun` | Stun effects, head trauma | All interruptable |
| `knockdown` | Trip, sweep attacks | Casting, attacking |
| `silence` | Silence spell | Spellcasting only |
| `forcedMovement` | Push, pull, fear effects | Casting, attacking |

### Interrupt Chance

Interrupts can have a probability rather than being guaranteed. This allows for:
- Damage having a chance to break concentration rather than always doing so
- Skills or equipment that reduce interrupt chance
- Spells that protect against interruption

```json
{
  "interruptResistance": {
    "sources": {
      "skill_concentration": {
        "type": "skill",
        "reductionPerLevel": 0.02,
        "maxReduction": 0.5
      },
      "item_focus_crystal": {
        "type": "equipment",
        "slot": "held",
        "reduction": 0.25
      },
      "spell_iron_mind": {
        "type": "buff",
        "reduction": 0.5,
        "duration": 60000
      }
    },
    "minimumChance": 0.1
  }
}
```

**Interrupt Chance Calculation:**
```
finalChance = baseInterruptChance - resistanceFromSkills - resistanceFromEquipment - resistanceFromBuffs
finalChance = max(finalChance, minimumChance)
```

### Action State Model

To support interrupts, actions need to track their execution state.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Action Lifecycle                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   QUEUED ──▶ EXECUTING ──▶ COMPLETED                           │
│                  │                                              │
│                  │ (interrupt event)                            │
│                  ▼                                              │
│             INTERRUPTED                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Action States:**

| State | Description |
|-------|-------------|
| `QUEUED` | Waiting in command queue |
| `EXECUTING` | Currently being performed, delay timer running |
| `COMPLETED` | Finished successfully, effects applied |
| `INTERRUPTED` | Cancelled before completion, effects NOT applied |

**Player State for Tracking:**

```
Player {
  commandQueue: []           // Pending commands (QUEUED state)
  currentAction: {           // Action in EXECUTING state
    command: "cast fireball goblin",
    type: "cast",
    startedAt: timestamp,
    completesAt: timestamp,
    canInterrupt: true
  }
  readyAt: timestamp         // When next action can begin
}
```

### Interrupt Resolution

When an interrupt trigger occurs:

```
function handleInterruptTrigger(player, trigger):
    // Check if player has an action in progress
    if player.currentAction == null:
        return  // Nothing to interrupt
    
    // Check if the current action can be interrupted by this trigger
    if player.currentAction.type not in trigger.interrupts:
        return  // This action type not affected
    
    if not player.currentAction.canInterrupt:
        return  // Action is not interruptable
    
    // Calculate interrupt chance with resistance
    baseChance = trigger.chance
    resistance = calculateInterruptResistance(player)
    finalChance = max(baseChance - resistance, settings.minimumInterruptChance)
    
    // Roll for interrupt
    if random() > finalChance:
        return  // Resisted the interrupt
    
    // Interrupt succeeds
    interruptAction(player, trigger)
```

### Delay Behavior on Interrupt

When an action is interrupted, the system must decide what happens to the delay. This is configurable per trigger type.

```json
{
  "interruptDelayBehavior": {
    "takeDamage": {
      "delayMode": "partial",
      "delayPercent": 0.5,
      "description": "Consume 50% of original delay"
    },
    "bash": {
      "delayMode": "fixed",
      "delayMs": 1500,
      "description": "Recovery time after being bashed"
    },
    "stun": {
      "delayMode": "replace",
      "delayMs": 3000,
      "description": "Stun duration replaces action delay"
    },
    "silence": {
      "delayMode": "cancel",
      "description": "No delay penalty, next action can proceed"
    }
  }
}
```

**Delay Modes:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `full` | Original action delay still applies | Punishing; prevents interrupt-spam exploits |
| `partial` | Percentage of original delay applies | Balance between punishment and fairness |
| `fixed` | Specific delay replaces remaining time | Consistent recovery time (e.g., knockdown) |
| `replace` | New delay completely replaces action delay | Status effects with their own duration |
| `cancel` | No delay; ready for next action immediately | Lenient; used for soft interrupts |

**Example Implementation:**

```
function interruptAction(player, trigger):
    action = player.currentAction
    now = currentTime()
    
    // Send interrupt message
    sendToPlayer(player, trigger.message)
    
    // Action effects do NOT apply (spell doesn't cast, attack doesn't hit)
    player.currentAction = null
    
    // Calculate new readyAt based on delay mode
    behavior = settings.interruptDelayBehavior[trigger.type]
    
    switch behavior.delayMode:
        case "full":
            // Keep original completesAt time
            player.readyAt = action.completesAt
            
        case "partial":
            originalDelay = action.completesAt - action.startedAt
            remainingDelay = originalDelay * behavior.delayPercent
            player.readyAt = now + remainingDelay
            
        case "fixed":
            player.readyAt = now + behavior.delayMs
            
        case "replace":
            player.readyAt = now + behavior.delayMs
            
        case "cancel":
            player.readyAt = now  // Ready immediately
    
    // Optionally clear the queue (for stuns, etc.)
    if trigger.clearsQueue:
        player.commandQueue = []
```

### Queue Behavior on Interrupt

The `clearQueueOnFail` property in action definitions controls whether the command queue is cleared when that action type is interrupted.

```json
{
  "actions": {
    "cast": {
      "baseDelay": 3000,
      "canInterrupt": true,
      "clearQueueOnFail": true
    }
  }
}
```

| Setting | Behavior | Rationale |
|---------|----------|-----------|
| `clearQueueOnFail: true` | Queue cleared on interrupt | Prevents "spam cast until one works" |
| `clearQueueOnFail: false` | Queue preserved, next command runs | More forgiving, commands still execute |

Additionally, certain interrupt triggers (like `stun`) may force-clear the queue regardless of this setting via the `clearsQueue` property on the trigger.

### Example Interrupt Scenario

**Setup:**
- Player is casting "Fireball" (3 second cast time)
- Cast started at t=0, would complete at t=3000ms
- At t=1500ms, player takes damage

**Resolution:**
```
t=0ms      Player starts casting Fireball
           currentAction = { type: "cast", completesAt: 3000 }
           
t=1500ms   Player takes damage
           Trigger: takeDamage (interrupts: ["cast"], chance: 0.75)
           Player has no interrupt resistance
           Roll: 0.42 (less than 0.75, interrupt succeeds)
           
           Message: "Your concentration is broken!"
           Fireball does NOT cast (no damage, no mana consumed)
           
           Delay mode: "partial" at 50%
           Original delay: 3000ms
           New delay: 3000 * 0.5 = 1500ms from now
           player.readyAt = 1500 + 1500 = 3000ms
           
t=3000ms   Player can execute next command in queue
```

---

## Example: Complete Delay Calculation

### Scenario

A player with the following state attempts to move north:

- Encumbrance: 75%
- Terrain: Swamp
- Has "Slow" status effect
- Race: Human (no modifier)
- Wearing plate armor

### Calculation

```
Base Move Delay:           300ms

Encumbrance (75%):         × 1.35
Terrain (swamp):           × 1.60
Slow status effect:        × 2.00
Plate armor:               × 1.20
Race (human):              × 1.00

Final Calculation:
300 × 1.35 × 1.60 × 2.00 × 1.20 × 1.00 = 1,555.2ms

Clamped Result:            1,555ms
```

The player will be able to execute their next command in approximately 1.5 seconds.

---

## Cooldown System

Some abilities have cooldowns independent of action delays. A warrior's "Berserk" ability might be usable once per 60 seconds, regardless of how fast they attack. This system handles those cooldowns separately from the command queue.

### Cooldown vs Delay

| Concept | Description | Example |
|---------|-------------|---------|
| **Delay** | Time until next command can execute | 2 second attack swing |
| **Cooldown** | Time until a specific ability can be used again | 60 second Berserk cooldown |

A player can have zero delay (ready to act) but still have abilities on cooldown.

### Cooldown Configuration

```json
{
  "cooldowns": {
    "abilities": {
      "berserk": {
        "cooldownMs": 60000,
        "sharedCooldownGroup": null,
        "startOnUse": true
      },
      "bash": {
        "cooldownMs": 8000,
        "sharedCooldownGroup": "meleeSpecial",
        "startOnUse": true
      },
      "kick": {
        "cooldownMs": 6000,
        "sharedCooldownGroup": "meleeSpecial",
        "startOnUse": true
      },
      "heal": {
        "cooldownMs": 5000,
        "sharedCooldownGroup": "healing",
        "startOnUse": false,
        "startOnComplete": true
      }
    },
    "groups": {
      "meleeSpecial": {
        "description": "Shared cooldown for melee special attacks",
        "triggersCooldownFor": ["bash", "kick", "trip", "disarm"]
      },
      "healing": {
        "description": "Shared cooldown for healing abilities"
      }
    }
  }
}
```

**Cooldown Timing Options:**

| Setting | Default | Description |
|---------|---------|-------------|
| `startOnUse` | `true` | Cooldown begins when ability is initiated |
| `startOnComplete` | `false` | Cooldown begins when ability finishes |

**Important:** At least one of `startOnUse` or `startOnComplete` must be `true`. If both are `false`, `startOnUse` defaults to `true`.

- **startOnUse: true** - Cooldown starts immediately when the ability is used. If the ability is interrupted, it's still on cooldown. Best for abilities that shouldn't be spammable even if interrupted.
- **startOnComplete: true** - Cooldown starts only after successful completion. If interrupted, the ability can be retried immediately. Best for channeled or interruptible abilities where failure shouldn't penalize the player.

### Cooldown Tracking

```
Player {
  cooldowns: {
    "berserk": { readyAt: timestamp },
    "meleeSpecial": { readyAt: timestamp },  // Group cooldown
    "healing": { readyAt: timestamp }
  }
}
```

### Cooldown Processing

```
function executeAbility(player, ability):
    config = settings.cooldowns.abilities[ability]
    
    // Check individual cooldown
    if player.cooldowns[ability] and now() < player.cooldowns[ability].readyAt:
        remaining = player.cooldowns[ability].readyAt - now()
        sendToPlayer(player, ability + " is on cooldown for " + formatTime(remaining))
        return false
    
    // Check shared group cooldown
    if config.sharedCooldownGroup:
        group = config.sharedCooldownGroup
        if player.cooldowns[group] and now() < player.cooldowns[group].readyAt:
            remaining = player.cooldowns[group].readyAt - now()
            sendToPlayer(player, "That ability type is on cooldown for " + formatTime(remaining))
            return false
    
    // Start cooldown on use (before execution)
    if config.startOnUse:
        startCooldown(player, ability, config)
    
    // Execute the ability
    success = performAbility(player, ability)
    
    // Start cooldown on completion (after execution)
    if config.startOnComplete and success:
        startCooldown(player, ability, config)
    
    return success

function startCooldown(player, ability, config):
    // Set individual cooldown
    player.cooldowns[ability] = { readyAt: now() + config.cooldownMs }
    
    // Set group cooldown if applicable
    if config.sharedCooldownGroup:
        group = config.sharedCooldownGroup
        player.cooldowns[group] = { readyAt: now() + config.cooldownMs }
```

### Cooldown Modifiers

Cooldowns can be modified by equipment, buffs, or skills:

```json
{
  "cooldownModifiers": {
    "equipment": {
      "amulet_of_haste": {
        "abilities": ["all"],
        "reduction": 0.10
      },
      "warriors_belt": {
        "abilities": ["bash", "kick", "trip"],
        "reduction": 0.15
      }
    },
    "buffs": {
      "quickening": {
        "abilities": ["all"],
        "reduction": 0.25,
        "duration": 30000
      }
    },
    "minimumCooldown": 0.25
  }
}
```

---

## Command Aliasing

Players often use abbreviations (e.g., `n` for `north`). This section defines when alias resolution occurs.

### Alias Resolution Order

Aliases are resolved **before** queuing, during input parsing:

```
┌─────────────────────────────────────────────────────────────┐
│                 Input Processing Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Raw Input: "n"                                             │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────┐                                       │
│  │ Alias Resolution │ ──▶ "north"                          │
│  └─────────────────┘                                       │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────┐                                       │
│  │ Command Parsing  │ ──▶ { action: "move", dir: "north" } │
│  └─────────────────┘                                       │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────┐                                       │
│  │ Queue or Bypass  │                                      │
│  └─────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Alias Configuration

```json
{
  "aliases": {
    "n": "north",
    "s": "south",
    "e": "east",
    "w": "west",
    "u": "up",
    "d": "down",
    "ne": "northeast",
    "nw": "northwest",
    "se": "southeast",
    "sw": "southwest",
    "l": "look",
    "i": "inventory",
    "eq": "equipment",
    "sc": "score",
    "k": "kill",
    "c": "cast",
    "ga": "get all",
    "da": "drop all"
  }
}
```

### Alias Processing

```
function resolveAlias(input):
    command = input.split(" ")[0]
    args = input.substring(command.length).trim()
    
    if command in settings.aliases:
        resolved = settings.aliases[command]
        if args:
            return resolved + " " + args
        return resolved
    
    return input

// Examples:
// "n"           → "north"
// "k goblin"    → "kill goblin"
// "c fireball"  → "cast fireball"
// "look"        → "look" (no alias, unchanged)
```

---

## Anti-Abuse Measures

### Queue Limits

- Maximum queue size prevents macro flooding
- Configurable `maxSize` setting (recommend 10-20 for most games)
- Configurable `overflowMessage` provides player feedback (e.g., "Why don't you slow down a few seconds?")
- Optional `overflowCooldownMs` prevents spamming the rejection message
- Consider shorter limits for PvP scenarios

### Input Rate Limiting

- Track commands per second per player
- Flag or throttle suspicious input rates

### Command Validation

- Validate commands when dequeued, not when queued
- Prevents stale commands from executing incorrectly

### Logging

- Log queue sizes, command rates for analysis
- Helps identify automation/botting

---

## Summary

This architecture provides a flexible, data-driven system for handling command queues and action delays in a MUD. Key features include:

1. **Non-blocking input** that always accepts player commands
2. **Configurable queue limits** with customizable overflow messages (discards excess commands)
3. **Dynamic delays** calculated from multiple configurable modifiers with curve interpolation
4. **Extensible modifier system** supporting encumbrance, terrain, status effects, equipment, race/class bonuses, and more
5. **Comprehensive interrupt system** with configurable triggers, resistance mechanics, and delay behaviors
6. **Combat round integration** supporting pure delay, round-based, or hybrid models
7. **Cooldown system** for abilities with independent recharge times and shared cooldown groups
8. **Command aliasing** for common abbreviations (e.g., `n` for `north`)
9. **Zero-delay queue bypass** for instant commands like look and say
10. **Tick alignment options** for predictable timing behavior
11. **Player processing order strategies** for fair multiplayer interactions
12. **TypeScript interfaces** for type-safe implementations
13. **Data-driven configuration** for easy balancing without code changes
14. **Proper stacking rules** for combining multiple effects
15. **Anti-abuse measures** to maintain fair gameplay

The system can be extended by adding new modifier types, action categories, interrupt triggers, cooldowns, or status effects through configuration alone.

---

## Implementation Plan

This section outlines the phased approach for implementing the command queue system in the Kingdoms of Avarice codebase.

### Phase 1: Core Infrastructure

**Goal:** Establish the foundational queue system and game loop.

#### 1.1 Configuration Files

Create the configuration structure for the command queue system.

**Files to create:**
- `packages/server/src/config/commandQueue.json` - Master configuration file

**Tasks:**
1. Create JSON configuration file with all settings from this document
2. Create TypeScript types in `packages/shared/src/types/commandQueue.ts` matching the interfaces defined above
3. Create configuration loader in `packages/server/src/config/commandQueueConfig.ts`
4. Add validation for configuration at startup

#### 1.2 Player State Extensions

Extend the player state to support command queuing.

**Files to modify:**
- `packages/shared/src/types/index.ts` - Add queue-related types
- `packages/server/src/game/world.ts` - Extend player runtime state

**New player state fields:**
```typescript
interface PlayerQueueState {
  commandQueue: string[];
  readyAt: number;
  currentAction: CurrentAction | null;
  cooldowns: Record<string, { readyAt: number }>;
  lastOverflowMessageTime: number;
}
```

**Tasks:**
1. Define `PlayerQueueState` interface in shared types
2. Add queue state initialization when player connects
3. Add queue state cleanup when player disconnects
4. Persist cooldowns across reconnects (optional, decide based on design)

#### 1.3 Game Loop Refactoring

Implement the tick-based game loop for queue processing.

**Files to create:**
- `packages/server/src/game/gameLoop.ts` - Main game loop
- `packages/server/src/game/tickProcessor.ts` - Per-tick processing logic

**Files to modify:**
- `packages/server/src/game/world.ts` - Integrate game loop
- `packages/server/src/index.ts` - Start game loop on server init

**Tasks:**
1. Create `GameLoop` class with configurable tick rate
2. Implement player iteration with configurable ordering (shuffle/roundRobin)
3. Add queue processing logic per player per tick
4. Integrate with existing game systems (NPC AI, respawns, etc.)
5. Add performance monitoring and tick overrun detection

---

### Phase 2: Command Processing

**Goal:** Implement command queuing, alias resolution, and bypass logic.

#### 2.1 Alias Resolution

Implement the alias system for command shortcuts.

**Files to create:**
- `packages/server/src/game/aliasResolver.ts` - Alias resolution logic

**Tasks:**
1. Create `resolveAlias(input: string): string` function
2. Load aliases from configuration
3. Handle argument passthrough (e.g., `k goblin` → `kill goblin`)
4. Integrate into input processing pipeline

#### 2.2 Input Processing Pipeline

Refactor input handling to support the queue system.

**Files to modify:**
- `packages/server/src/game/socket.ts` - WebSocket message handling
- `packages/server/src/game/commands.ts` - Command execution

**Files to create:**
- `packages/server/src/game/inputProcessor.ts` - Input processing pipeline
- `packages/server/src/game/commandQueue.ts` - Queue management

**Tasks:**
1. Create `InputProcessor` class implementing the pipeline:
   - Alias resolution
   - Bypass command detection
   - Priority command detection
   - Queue overflow handling
2. Create `CommandQueue` class for queue operations:
   - `push(command: string): boolean`
   - `pop(): string | null`
   - `clear(): void`
   - `size(): number`
   - `isFull(): boolean`
3. Modify socket handler to use InputProcessor instead of direct command execution
4. Implement overflow message cooldown logic

#### 2.3 Action Configuration

Map commands to action types with their configurations.

**Files to create:**
- `packages/server/src/game/actionRegistry.ts` - Action type registry

**Tasks:**
1. Create `ActionRegistry` class to look up action configs by command
2. Map existing commands to action types (move, attack, cast, look, get, drop, say)
3. Handle commands that don't map to configured actions (default behavior)

---

### Phase 3: Delay System

**Goal:** Implement dynamic delay calculation with modifiers.

#### 3.1 Delay Calculator

Create the core delay calculation system.

**Files to create:**
- `packages/server/src/game/delayCalculator.ts` - Delay calculation logic
- `packages/server/src/game/modifiers/index.ts` - Modifier registry
- `packages/server/src/game/modifiers/encumbranceModifier.ts`
- `packages/server/src/game/modifiers/terrainModifier.ts`
- `packages/server/src/game/modifiers/statusEffectModifier.ts`
- `packages/server/src/game/modifiers/equipmentModifier.ts`

**Tasks:**
1. Create `DelayCalculator` class with modifier registration
2. Implement base delay lookup from action config
3. Implement modifier chain execution with priority ordering
4. Implement final delay clamping (min/max)
5. Create individual modifier implementations:
   - Encumbrance modifier with curve interpolation
   - Terrain modifier from room data
   - Status effect modifier from player buffs/debuffs
   - Equipment modifier (armor weight, weapon speed)

#### 3.2 Encumbrance Integration

Connect encumbrance calculation to the delay system.

**Files to modify:**
- `packages/server/src/game/world.ts` - Add encumbrance calculation helpers

**Tasks:**
1. Create `calculateEncumbrancePercent(player): number` function
2. Implement curve interpolation (linear, step, smooth)
3. Add over-encumbered blocking logic
4. Connect to delay calculator

#### 3.3 Terrain Integration

Connect room terrain to movement delays.

**Files to modify:**
- `packages/shared/src/types/index.ts` - Add terrain type to room data
- `packages/server/src/db/repositories/roomRepository.ts` - Include terrain in queries

**Tasks:**
1. Add `terrain` field to room schema (if not present)
2. Create migration to add terrain column
3. Update room editor to allow setting terrain type
4. Connect terrain lookup to delay calculator

---

### Phase 4: Combat Integration

**Goal:** Integrate the queue system with combat mechanics.

#### 4.1 Combat State Management

Enhance combat state to work with the queue system.

**Files to modify:**
- `packages/server/src/game/combat.ts` - Combat system

**Tasks:**
1. Add `inCombat` flag to player queue state
2. Implement combat entry when attack command executes
3. Implement combat exit conditions (target dies, player moves, recall, etc.)
4. Add combat round timer separate from command queue
5. Implement auto-attack on combat rounds

#### 4.2 Combat Command Filtering

Filter commands during combat based on configuration.

**Files to modify:**
- `packages/server/src/game/inputProcessor.ts` - Add combat filtering

**Tasks:**
1. Check `allowedCommandsInCombat` when player is in combat
2. Reject disallowed commands with appropriate message
3. Handle `combatOnly` actions (reject if not in combat)

#### 4.3 Combat Delay Modifier

Apply combat-specific delay modifications.

**Tasks:**
1. Add combat delay modifier to delay calculator
2. Apply `combatDelayModifier` from config when in combat

---

### Phase 5: Interrupt System

**Goal:** Implement action interruption mechanics.

#### 5.1 Current Action Tracking

Track the currently executing action for interrupt purposes.

**Files to modify:**
- `packages/server/src/game/commandQueue.ts` - Add current action tracking

**Tasks:**
1. Set `currentAction` when action begins executing
2. Clear `currentAction` when action completes
3. Store action metadata (type, startedAt, completesAt, canInterrupt)

#### 5.2 Interrupt Triggers

Implement interrupt trigger system.

**Files to create:**
- `packages/server/src/game/interruptHandler.ts` - Interrupt processing

**Tasks:**
1. Create `InterruptHandler` class
2. Implement `handleInterruptTrigger(player, triggerType)` function
3. Calculate interrupt chance with resistance
4. Apply delay behavior on successful interrupt
5. Handle queue clearing based on trigger and action config

#### 5.3 Interrupt Integration Points

Connect interrupts to game events.

**Files to modify:**
- `packages/server/src/game/combat.ts` - Trigger interrupts on damage
- Various ability handlers - Trigger interrupts on bash, stun, silence, etc.

**Tasks:**
1. Call interrupt handler when player takes damage
2. Call interrupt handler for bash/stun/knockdown abilities
3. Call interrupt handler for silence effects
4. Call interrupt handler for forced movement

#### 5.4 Interrupt Resistance

Implement interrupt resistance from skills/equipment/buffs.

**Files to create:**
- `packages/server/src/game/interruptResistance.ts` - Resistance calculation

**Tasks:**
1. Calculate resistance from concentration skill (if implemented)
2. Calculate resistance from equipped items
3. Calculate resistance from active buffs
4. Apply minimum interrupt chance

---

### Phase 6: Cooldown System

**Goal:** Implement ability cooldowns separate from action delays.

#### 6.1 Cooldown Tracker

Create cooldown tracking system.

**Files to create:**
- `packages/server/src/game/cooldownTracker.ts` - Cooldown management

**Tasks:**
1. Create `CooldownTracker` class
2. Implement `isOnCooldown(player, ability): boolean`
3. Implement `startCooldown(player, ability): void`
4. Implement `getRemainingCooldown(player, ability): number`
5. Handle shared cooldown groups

#### 6.2 Cooldown Integration

Integrate cooldowns with command execution.

**Files to modify:**
- `packages/server/src/game/commands.ts` - Check cooldowns before execution
- Various ability handlers - Start cooldowns after use

**Tasks:**
1. Check cooldowns before executing abilities
2. Send cooldown remaining message if on cooldown
3. Start cooldown on use or on completion based on config
4. Apply cooldown modifiers from equipment/buffs

---

### Phase 7: Status Effect Integration

**Goal:** Connect status effects to the delay modifier system.

#### 7.1 Status Effect Delay Modifiers

Extract delay modifiers from status effects.

**Files to modify:**
- `packages/server/src/game/modifiers/statusEffectModifier.ts`

**Tasks:**
1. Query player's active status effects
2. Extract delay modifiers from each effect
3. Apply stacking rules for multiple effects
4. Handle action-specific vs global modifiers

#### 7.2 Status Effect Commands

Add commands for testing/debugging status effects.

**Tasks:**
1. Admin command to apply status effects
2. Command to view active status effects with remaining duration
3. Display delay modifiers in effect descriptions

---

### Phase 8: Testing & Polish

**Goal:** Ensure system reliability and good player experience.

#### 8.1 Unit Tests

Create comprehensive test coverage.

**Files to create:**
- `packages/server/src/game/__tests__/commandQueue.test.ts`
- `packages/server/src/game/__tests__/delayCalculator.test.ts`
- `packages/server/src/game/__tests__/interruptHandler.test.ts`
- `packages/server/src/game/__tests__/cooldownTracker.test.ts`
- `packages/server/src/game/__tests__/gameLoop.test.ts`

**Tasks:**
1. Test queue operations (push, pop, overflow, clear)
2. Test delay calculations with various modifier combinations
3. Test interrupt mechanics and resistance
4. Test cooldown tracking and shared groups
5. Test game loop tick processing

#### 8.2 Integration Tests

Test end-to-end command flow.

**Tasks:**
1. Test command queuing through WebSocket
2. Test bypass and priority commands
3. Test combat flow with queue
4. Test interrupt scenarios

#### 8.3 Player Feedback

Implement informative player feedback.

**Tasks:**
1. Show queue status on request (optional command)
2. Show cooldown remaining times
3. Clear feedback for overflow, interrupt, cooldown messages
4. Consider visual queue indicator in client (optional)

#### 8.4 Performance Optimization

Ensure system performs well at scale.

**Tasks:**
1. Profile game loop with many connected players
2. Optimize player iteration and queue processing
3. Monitor tick overruns and adjust if needed
4. Consider batch operations for database updates

---

### Implementation Order Summary

| Phase | Priority | Dependencies | Estimated Complexity |
|-------|----------|--------------|---------------------|
| Phase 1: Core Infrastructure | Critical | None | Medium |
| Phase 2: Command Processing | Critical | Phase 1 | Medium |
| Phase 3: Delay System | Critical | Phase 2 | High |
| Phase 4: Combat Integration | High | Phase 3 | Medium |
| Phase 5: Interrupt System | High | Phase 4 | High |
| Phase 6: Cooldown System | Medium | Phase 2 | Low |
| Phase 7: Status Effect Integration | Medium | Phase 3 | Medium |
| Phase 8: Testing & Polish | Critical | All | Medium |

### Migration Strategy

Since this is a significant change to command handling:

1. **Feature Flag:** Implement behind a feature flag initially
2. **Parallel Operation:** Run old and new systems in parallel for comparison
3. **Gradual Rollout:** Enable for specific test accounts first
4. **Fallback:** Keep ability to disable and revert to old behavior
5. **Monitoring:** Log queue metrics to identify issues

### Configuration Defaults

Start with conservative defaults that can be tuned:

```json
{
  "timing": {
    "tickRateMs": 100,
    "alignToTicks": true,
    "playerProcessingOrder": "shuffle"
  },
  "queue": {
    "maxSize": 15,
    "overflowCooldownMs": 1000
  },
  "delaySettings": {
    "minDelay": 50,
    "maxDelay": 10000
  }
}
```

### Success Criteria

The implementation is complete when:

1. Players can queue multiple commands
2. Commands execute with appropriate delays
3. Delays are modified by encumbrance, terrain, equipment, and status effects
4. Combat integrates seamlessly with the queue
5. Interrupts work correctly during action execution
6. Cooldowns prevent ability spam independently of delays
7. System performs well with expected player load
8. All tests pass
9. No regression in existing functionality
