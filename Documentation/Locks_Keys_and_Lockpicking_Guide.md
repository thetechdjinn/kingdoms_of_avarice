# Locks, Keys, and Lockpicking Guide

This guide covers the complete lock and key system in Kingdoms of Avarice, including physical locks, keys, lockpicking mechanics, and door bashing.

## Table of Contents

1. [Overview](#overview)
2. [Lock System](#lock-system)
3. [Keys](#keys)
4. [Lockpicking](#lockpicking)
5. [Bashing Doors](#bashing-doors)
6. [Item Editor: Creating Keys and Lockpicks](#item-editor-creating-keys-and-lockpicks)
7. [Door Editor: Configuring Locks](#door-editor-configuring-locks)
8. [Best Practices](#best-practices)

---

## Overview

The lock system provides multiple ways to secure and bypass doors:

| Method | Requirements | Effect |
|--------|--------------|--------|
| **Key** | Matching key item | Clean unlock, optional consumption |
| **Lockpicking** | Lockpicking ability + lockpicks | Skill-based, may break lockpicks |
| **Bashing** | Strength | Brute force, always succeeds above threshold |

---

## Lock System

### Lock Components

Physical doors can have locks with these properties:

| Property | Description | Range |
|----------|-------------|-------|
| **Has Lock** | Enables lock mechanics | true/false |
| **Key Item Tag** | Tag that matching keys must have | string |
| **Pick Difficulty Min** | Minimum skill needed for any chance | 0-500+ |
| **Pick Difficulty Max** | Skill needed for guaranteed success | 0-500+ |
| **Bash Difficulty** | Strength needed to bash open | 0-500+ |
| **Auto-Lock** | Seconds until door re-locks | 0 = never |

### Door States

Locked doors cycle through these states:

```
LOCKED ──[unlock/pick/bash]──> CLOSED ──[open]──> OPEN
   ^                              │
   └────────[auto-lock]───────────┘
```

### Difficulty Ranges

Locks use a difficulty range (min-max) for lockpicking:

- **Skill < Min**: Always fails (too difficult)
- **Skill >= Max**: Always succeeds (trivial)
- **Min <= Skill < Max**: Random roll determines success

**Example:**
- Door with pick difficulty 20-40
- Character with lockpicking skill 30
- Roll 1-40: if roll <= 30, success

### Difficulty Guidelines

| Difficulty | Description | Example |
|------------|-------------|---------|
| 0-20 | Trivial | Simple padlock |
| 21-40 | Easy | Basic door lock |
| 41-60 | Moderate | Quality lock |
| 61-80 | Hard | Masterwork lock |
| 81-100 | Very Hard | Bank vault |
| 101-150 | Expert | Royal treasury |
| 151-200 | Master | Ancient magical locks |
| 200+ | Near Impossible | Legendary locks |
| 500+ | Unpickable | Cannot be picked |

---

## Keys

### How Keys Work

Keys are items with a `key_tag` flag that matches a door's `key_item_tag`:

1. Player types `use <key> <direction>` to unlock, or `lock <direction>` to lock
2. System finds the key by keyword in player's inventory
3. System checks if the key's `key_tag` matches the door's `key_item_tag`
4. If they match, door is unlocked/locked
5. Key may be consumed based on its flags

**Unlocking a door:**
```
use crusty key north     - Use "crusty key" to unlock door to the north
use cru n                - Partial match also works
```

**Locking a door:**
```
lock north               - Lock the door (requires matching key in inventory)
```

### Key Flags

| Flag | Type | Description |
|------|------|-------------|
| `key_tag` | string | Tag that must match door's `key_item_tag` |
| `consumeOnUse` | boolean | If true, key is always destroyed after use |
| `consumeChance` | number | Percentage (1-100) chance key breaks after use |

### Key Consumption Behavior

| Configuration | Behavior | Message |
|---------------|----------|---------|
| No consume flags | Key is permanent | (none) |
| `consumeOnUse: true` | Always consumed | "Your [key] crumbles to dust." |
| `consumeChance: 50` | 50% chance to break | "Your [key] breaks!" |
| Both set | `consumeOnUse` takes priority | "Your [key] crumbles to dust." |

### Key Examples

**Permanent Key:**
```
Name: brass key
Type: key
Flags:
  key_tag: blacksmith_shop
  takeable: true
```

**Single-Use Magic Key:**
```
Name: enchanted skeleton key
Type: key
Flags:
  key_tag: dungeon_cells
  consumeOnUse: true
  takeable: true
```

**Fragile Key:**
```
Name: rusty iron key
Type: key
Flags:
  key_tag: old_gate
  consumeChance: 25
  takeable: true
  stackable: true
```

---

## Lockpicking

### Who Can Pick Locks

Characters can pick locks if they have:
- A **class** with `thievery: true` or `lockpicking` in special abilities
- A **race** with the `picklocks` or `lockpicking` trait

**Classes with lockpicking:** Thief, Bard, Gypsy, Ninja (and similar)
**Races with lockpicking:** Gnome

### Lockpicking Skill Calculation

```
Base         = +1 if race has trait, +1 if class has ability
Level Bonus  = level * 1
DEX Bonus    = floor(dexterity / 10) * 2.5
INT Bonus    = floor(intelligence / 10) * 1
Item Bonus   = lockpick quality (1-5)
─────────────────────────────────────────
Total        = floor(sum of all bonuses)
```

**Example:**
- Level 10 Gnome Thief
- DEX 45, INT 30
- Using quality 3 lockpicks

```
Base:        2 (race + class)
Level:      10
DEX:        10 (45/10 = 4 → 4 * 2.5)
INT:         3 (30/10 = 3 → 3 * 1)
Lockpicks:   3
────────────────
Total:      28
```

### Lockpicks (Tool Items)

Lockpicks are **Tool** type items with these properties:

| Property | Range | Description |
|----------|-------|-------------|
| Quality | 1-5 | Bonus added to lockpicking skill |
| Durability | 1-101 | Break threshold (101 = unbreakable) |

### Lockpick Durability

On a **failed** pick attempt:
1. Roll 1-100
2. If roll > durability, lockpick breaks
3. One lockpick is consumed from the stack

On a **successful** pick attempt:
- Lockpicks never break

**Durability examples:**
- Durability 30: 70% break chance on failure
- Durability 70: 30% break chance on failure
- Durability 101: Never breaks (unbreakable)

### Standard Lockpick Sets

| Name | Quality | Durability | Value | Notes |
|------|---------|------------|-------|-------|
| crude lockpicks | +1 | 30 | 25cp | Cheap, breaks often |
| basic lockpicks | +2 | 50 | 100cp | Common |
| quality lockpicks | +3 | 70 | 500cp | Reliable |
| masterwork lockpicks | +4 | 90 | 2000cp | Professional |
| thieves' guild lockpicks | +5 | 101 | 10000cp | Unbreakable, rare |

### Pick Command

```
pick <direction>
```

**Requirements:**
- Character has lockpicking ability (class or race)
- Has lockpicks in inventory
- Door is locked and has a lock

**Outcomes:**
- Success: Door unlocks, lockpicks intact
- Failure: Door stays locked, lockpicks may break

### Debug Command

Staff can check lockpicking skill breakdown:
```
@lockpicking [player]
```

---

## Bashing Doors

### Bash Mechanics

Bashing uses raw strength to break through locked doors:

```
Bash Stat = Strength + (Level * 0.5)
```

**Outcomes:**
- Bash stat >= difficulty: Door opens (unlocks and opens)
- Bash stat < difficulty: "The door holds firm"

### Bash Command

```
bash <direction>
```

**Notes:**
- Always works if strength is high enough
- No skill or items required
- Louder than lockpicking (may alert NPCs in future)
- Some doors may be unbashable (difficulty 500+)

---

## Item Editor: Creating Keys and Lockpicks

### Creating a Key

1. Open the **Item Editor**
2. Click **+ New Item**
3. Set **Type** to **Key**
4. Fill in basic info (name, description, keywords)
5. Go to **Type Data** tab
6. Set the **Key Tag** (must match door's key_item_tag)
7. Optionally enable **Consume On Use** or set **Break Chance %**
8. Save

### Creating Lockpicks

1. Open the **Item Editor**
2. Click **+ New Item**
3. Set **Type** to **Tool**
4. Fill in basic info
5. Go to **Type Data** tab
6. Set **Tool Type** to **Lockpick**
7. Set **Quality** (1-5)
8. Set **Durability** (1-101)
9. Go to **Flags** tab
10. Enable **Stackable** and **Takeable**
11. Save

---

## Door Editor: Configuring Locks

### Adding a Lock to a Door

1. Open the **Door Editor**
2. Select or create a **Physical** door
3. Enable **Has Lock**
4. Set the **Key Item Tag** (matching key's key_tag)
5. Set **Pick Difficulty Min** and **Max**
6. Set **Bash Difficulty**
7. Optionally set **Auto-Lock** timer
8. Set **Default State** to **Locked**
9. Save

### Lock Configuration Examples

**Simple Lock (pickable, bashable, keyed):**
```
Has Lock: true
Key Item Tag: shop_key
Pick Difficulty: 20-40
Bash Difficulty: 60
```

**High Security (hard to pick, unbashable):**
```
Has Lock: true
Key Item Tag: vault_key
Pick Difficulty: 100-150
Bash Difficulty: 500 (unbashable)
```

**Unpickable (key only):**
```
Has Lock: true
Key Item Tag: master_key
Pick Difficulty: 500-500 (unpickable)
Bash Difficulty: 500 (unbashable)
```

**No Key (pick or bash only):**
```
Has Lock: true
Key Item Tag: (empty)
Pick Difficulty: 40-60
Bash Difficulty: 80
```

---

## Best Practices

### Key Design

1. **Use descriptive key_tags:** `castle_dungeon_key` not `key1`
2. **Match key rarity to content:** Rare keys for rare areas
3. **Consider consumption:** Single-use keys add tension
4. **Stack fragile keys:** Set `stackable: true` for keys with break chance

### Lock Design

1. **Use difficulty ranges:** Min 20, Max 40 is more interesting than flat 30
2. **Scale with area level:** Higher level areas = harder locks
3. **Provide alternatives:** Most locks should have key OR pick OR bash options
4. **Reserve unpickable for story:** Only use 500+ for plot-critical doors

### Lockpick Economy

1. **Cheap lockpicks break often:** Creates resource management
2. **Quality costs more:** Skill vs money trade-off
3. **Unbreakable is rare:** Thieves' guild rewards, quest items

### Balance Tips

| Player Level | Suggested Pick Difficulty |
|--------------|---------------------------|
| 1-5 | 10-30 |
| 6-10 | 25-50 |
| 11-15 | 40-70 |
| 16-20 | 60-100 |
| 21-30 | 80-130 |
| 31+ | 100-200 |

---

## Related Documentation

- [Door System Guide](Door_System_Guide.md) - Complete door configuration
- [Item Editor Guide](Item_Editor_Guide.md) - Creating items
- [Progression System Guide](Progression_System_Guide.md) - Class and race abilities
