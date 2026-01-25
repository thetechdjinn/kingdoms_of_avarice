# Drop to the Ground & Purgatory Feature Specification

## Overview

This document specifies two related features for handling player death:
1. **Drop to the Ground** - A near-death state allowing recovery
2. **Purgatory** - A death state requiring revival or respawn

## Player State Flow

```
ALIVE (HP > 0)
    ↓ (damage reduces HP to 0 or below)
DROPPED (HP <= 0 but > max negative threshold)
    ↓ (HP falls below max negative threshold)
PURGATORY (dead)
    ↓ (revive spell OR respawn command)
ALIVE (HP > 0)
```

---

## Feature 1: Drop to the Ground

### Trigger Conditions
- Player HP reaches 0 or below
- Player HP remains above the maximum negative threshold (configurable, e.g., -35)

### Game Settings Required
- **Maximum Negative HP**: Configurable threshold (e.g., -35). When HP falls below this, player dies.
- **Natural Healing Interval**: Configurable tick rate (currently hardcoded ~5 seconds). Needs to be added to game settings.

### Dropped State Behavior

#### HP Tick Mechanics
- **Not Aided**: Player loses 1 HP every natural healing tick
- **Aided**: Player gains 1 HP every natural healing tick until HP reaches +1
- **Combat While Aided**: If attacked again after being aided, player resumes losing 1 HP per tick (must be aided again)

#### Recovery Conditions
- **Via Aid + Time**: Once HP ticks up to +1, player can act normally
- **Via Healing Spell**: If healing brings HP above 0, player can act immediately

#### Death Condition
- HP falls below the maximum negative threshold → Player dies → Enters Purgatory

### Aid Command
- **Syntax**: `aid <player>`
- **Requirements**: None (basic skill all players have, no bandages required)
- **Restrictions**: Cannot aid yourself (you cannot interact with the world while dropped)
- **Execution**: Instantaneous, cannot be interrupted
- **Combat Impact**: Does not break or disrupt combat
- **Repeat Usage**: Can aid same player multiple times (no additional effect if already aided)

### Allowed Actions While Dropped
- `look` - Room, players, objects (all look variations)
- `inventory` - View own inventory
- `who` - See online players
- `say` / talking - Communicate with players in room
- Future: All messaging methods

### Restricted Actions While Dropped
- All combat actions
- All movement
- All item manipulation (pick up, drop, use, etc.)
- All spellcasting
- Cannot quit/logout via command

### Disconnect Handling
- If player force-disconnects (closes browser, loses connection) while dropped:
  - Player dies immediately
  - Player respawns in designated respawn room
  - Items drop at death location

### Display
- Room "Also here" shows: `PlayerName (on the ground)`

### Combat Continuation
- Combat remains engaged when target drops to the ground
- NPCs/Players continue attacking until:
  - Target is dead (HP below max negative threshold), OR
  - Attacker chooses new target, OR
  - Combat otherwise ends naturally
- Dropped players CAN be targeted by new attackers (players or NPCs)

### Items While Dropped
- Items remain on player while dropped
- Items CAN be stolen via thievery skills

---

## Feature 2: Purgatory

### Trigger Condition
- Player HP falls below maximum negative threshold (death)

### Purgatory State Behavior

#### Location
- Player exists in the room where they died
- Player can see room events
- Player appears in room as: `PlayerName (dead)`

#### Item Drop on Death
- ALL items drop to the ground in death room
- ALL currency drops to the ground in death room
- **Exception**: No-Drop items remain on player

#### Allowed Actions in Purgatory
- Same as Dropped state:
  - `look` - Room, players, objects
  - `inventory` - View own inventory (will be mostly empty)
  - `who` - See online players
  - `say` / talking - Communicate with players in room
- `respawn` - Manually respawn at designated respawn room

#### Restricted Actions in Purgatory
- All actions restricted while Dropped
- CANNOT be healed (healing spells have no effect)
- Can ONLY be revived via "Revive the Dead" spell (not yet implemented)

### Revival (Future)
- Requires "Revive the Dead" spell (not yet implemented)
- Caster must be in same room as dead player
- On revival: Player returns to life at death location
- Player must manually retrieve dropped items/currency

### Respawn
- Player types `respawn` command
- Player appears at designated respawn room
- Items/currency remain on ground at death location

### Disconnect Handling
- If player disconnects while in Purgatory:
  - On reconnect: Player automatically respawns at respawn room
- If server restarts while player in Purgatory:
  - Player automatically respawns at respawn room

### Duration
- No time limit
- Player can remain in Purgatory indefinitely until:
  - They type `respawn`
  - They are revived (future)
  - They disconnect (triggers auto-respawn on reconnect)
  - Server restarts (triggers auto-respawn)

---

## Bug Fix: Death from Non-Melee Sources

### Current Bug
- Only melee combat triggers death
- DoT effects (e.g., Doom spell) stop at 0 HP instead of continuing/killing
- Player ends up at 0 HP and starts resting, never drops or dies

### Required Fix
- ALL damage sources must trigger drop/death checks:
  - Melee combat damage
  - Spell damage (direct)
  - DoT effects (Doom, Poison, Bleed, etc.)
  - Environmental damage (if any)
  - Any future damage types

### DoT Behavior When Dropped
- DoT effects continue while player is dropped
- DoT damage continues ticking down HP
- If DoT reduces HP below max negative threshold → death
- DoT expires normally based on duration (may expire before killing player)

### Implementation Approach
- Centralize all HP modification through a single function
- That function handles drop/death state transitions
- All damage sources use this centralized function

---

## Database/State Changes Required

### Player State Fields (new or modified)
- `is_dropped: boolean` - Player is in dropped state
- `is_dead: boolean` - Player is in purgatory state
- `is_aided: boolean` - Player has been aided (affects tick direction)
- `death_room_id: number` - Room where player died (for purgatory location)

### Game Settings (new)
- `max_negative_hp: number` - Death threshold (e.g., -35)
- `natural_healing_interval: number` - Tick rate in milliseconds (e.g., 5000)

---

## Summary of Display States

| State | "Also here" Display | Can Act | HP Behavior |
|-------|---------------------|---------|-------------|
| Alive | `PlayerName` | Yes | Natural regen |
| Dropped (not aided) | `PlayerName (on the ground)` | Limited | -1 per tick |
| Dropped (aided) | `PlayerName (on the ground)` | Limited | +1 per tick |
| Purgatory | `PlayerName (dead)` | Very Limited | N/A (dead) |
