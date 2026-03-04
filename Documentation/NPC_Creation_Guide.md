# NPC Creation Guide

This guide explains how to create and configure all types of NPCs in Kingdoms of Avarice, including hostile mobs, passive creatures, merchants, and spellcasters.

## Table of Contents

1. [Overview](#overview)
2. [NPC Editor](#npc-editor)
3. [NPC Types](#npc-types)
4. [Basic Tab](#basic-tab)
5. [Combat Tab](#combat-tab)
6. [Behavior Tab](#behavior-tab)
7. [Rewards Tab](#rewards-tab)
8. [Appearance Tab](#appearance-tab)
9. [Attacks Tab](#attacks-tab)
10. [Spells Tab](#spells-tab)
11. [Merchant Tab](#merchant-tab)
12. [Drop Tables](#drop-tables)
13. [Factions](#factions)
14. [Building Common NPC Types](#building-common-npc-types)
15. [In-Game Commands](#in-game-commands)
16. [NPC Behavior States](#npc-behavior-states)
17. [Tips and Best Practices](#tips-and-best-practices)
18. [Troubleshooting](#troubleshooting)

---

## Overview

NPCs are template-based. You define a **template** (the blueprint), and the system spawns **instances** from it. Each instance is an independent copy with its own HP, mana, position, and augmentation. If an NPC dies, the system respawns a new instance from the same template after the configured delay.

Key concepts:

- **Template** - The NPC definition (stats, attacks, behavior, rewards)
- **Instance** - A live copy of a template in the game world
- **Max Active** - How many instances of one template can exist at once
- **Augmentation** - Random name prefix applied per instance (e.g., "fierce serpentine warrior")

---

## NPC Editor

Access the NPC Editor at `/npc-editor.html` (requires Developer or Admin role).

### Features

- **Template List**: Browse, filter, and search all NPC templates
- **Tabbed Editor**: 7 tabs organize all NPC properties
- **Live Preview**: See how the NPC will appear in-game
- **Import/Export**: Backup and share NPC definitions

### Creating an NPC

1. Click **+ New NPC** in the left panel
2. Enter a name for the NPC
3. Configure properties across the 7 tabs
4. Click **Save**
5. Use `@reload mobs` in-game to load changes

---

## NPC Types

There is no explicit "type" field. An NPC's behavior is determined by its configuration. Here are the common archetypes:

| Archetype | Hostile | Merchant | Attacks | Spells | Key Traits |
|-----------|---------|----------|---------|--------|------------|
| **Combat Mob** | Yes | No | Yes | Optional | Hostile, attacks on sight |
| **Spellcaster Mob** | Yes | No | Yes | Yes | Has mana, casts spells in combat |
| **Passive Creature** | No | No | No | No | Ambient flavor, can be killed |
| **Merchant** | No | Yes | Optional | No | Sells items, has inventory |
| **Boss** | Yes | No | Yes | Yes | High stats, multiple attacks, spells |
| **Guard** | Yes | No | Yes | No | Area-locked, calls for help |

---

## Basic Tab

Core identity and spawning configuration.

| Field | Description | Default |
|-------|-------------|---------|
| **Name** | Display name (lowercase for common nouns: "serpentine warrior") | Required |
| **Description** | Text shown when examining the NPC | None |
| **Proper Name** | If checked, name is a proper noun with no article ("Goran" vs "a serpentine warrior") | Off |
| **Level** | NPC level, affects XP eligibility and combat scaling | 1 |
| **Max Health** | Maximum hit points | Required |
| **Max Mana** | Maximum mana for spellcasting (0 = no mana) | 0 |
| **Spawn Room** | Room where the NPC spawns | None |
| **Respawn Time** | Seconds after death before a new instance spawns (empty = no respawn) | None |
| **Max Active** | Maximum simultaneous instances of this template | 1 |
| **Hostile** | Whether the NPC attacks players on sight | Off |

### Name and Article System

- **Common nouns** (proper_name = off): The system adds articles automatically
  - "A serpentine warrior attacks you!"
  - "The serpentine warrior's claw attack hits you!"
  - "You attack the serpentine warrior."
- **Proper nouns** (proper_name = on): No articles added
  - "Goran attacks you!"
  - "Goran's attack hits you!"
  - "You attack Goran."

Use proper names for unique/named NPCs like merchants, bosses, and quest givers. Use common nouns for generic mobs.

---

## Combat Tab

Controls how the NPC performs in combat.

| Field | Description | Default | Range |
|-------|-------------|---------|-------|
| **Base Accuracy** | Chance to hit players | 50 | 0-100+ |
| **Base Defense** | Defense against player attacks | 50 | 0-100+ |
| **Base Crit Chance** | Chance for critical hits | 5 | 0-100 |
| **Base Dodge** | Chance to evade attacks entirely | 5 | 0-100 |
| **Damage Reduction** | Flat damage subtracted from each hit taken | 0 | 0+ |
| **Spell Power** | Multiplier for spell damage/healing scaling | 0 | 0+ |

### Combat Stat Guidelines

- **Accuracy vs Defense**: These oppose each other. A 50 accuracy vs 50 defense NPC is roughly average. Raise accuracy for hard-hitting mobs, raise defense for tanky ones.
- **Crit Chance**: 5% is standard. Bosses might have 10-15%. Going above 20% makes combat feel punishing.
- **Dodge**: Keep low (5-10%) for most mobs. High dodge creates frustrating combat where players miss constantly.
- **Damage Reduction**: Effective against fast, low-damage attackers. A damage reduction of 5 means every hit deals 5 less damage.
- **Spell Power**: Only relevant if the NPC has spells assigned. A value of 1 means standard scaling; 2 means double scaling bonus from stats.

---

## Behavior Tab

Controls how the NPC moves, flees, and interacts with the world.

### Flee Settings

| Field | Description | Default |
|-------|-------------|---------|
| **Flee Enabled** | Whether the NPC can flee combat | Off |
| **Flee HP Percent** | HP threshold to trigger flee (e.g., 20 = flees at 20% HP) | 20 |

When an NPC flees:
1. It moves up to 3 rooms away from combat
2. After 3 rooms, it transitions to "returning" state
3. It pathfinds back to its spawn room via BFS (max 50 rooms)
4. On arrival, it resets to idle with full HP/mana
5. If cornered with no valid exits, it turns and fights

### Call for Help

| Field | Description | Default |
|-------|-------------|---------|
| **Call for Help Chance** | Percent chance to summon nearby allies when attacked by multiple players | 0 |

When triggered:
- Broadcasts "{name} calls out for help!" to the room
- Idle, hostile NPCs in **adjacent rooms** rush in to assist
- Responders inherit the caller's target list
- Only triggers once per combat engagement

### Roaming

| Field | Description | Default |
|-------|-------------|---------|
| **Roam Enabled** | Whether the NPC wanders between rooms | Off |
| **Roam Interval** | Seconds between roam checks | 60 |
| **Roam Chance** | Percent chance to move per check | 10 |
| **Allowed Areas** | Area names the NPC is restricted to (empty = unrestricted) | Empty |

Roaming details:
- Only idle NPCs roam (never during combat, fleeing, or returning)
- NPCs cannot open locked doors while roaming
- If allowed areas are set, NPCs will only roam into rooms with a matching area name
- After roaming into a room, hostile NPCs check for players and aggro if applicable
- Setting roam_interval=60 and roam_chance=10 means roughly a 10% chance to move every 60 seconds

### Allowed Areas

The allowed areas list restricts where an NPC can go during roaming, fleeing, and return-to-spawn pathfinding. Each entry must match a room's `area` field exactly.

- **Empty list**: No restriction, NPC can go anywhere
- **Example**: `["Silverton"]` restricts the NPC to rooms with area "Silverton"
- Affects roaming exits, flee movement, call-for-help responder movement, and return pathfinding

---

## Rewards Tab

What players receive when the NPC is killed.

| Field | Description | Default |
|-------|-------------|---------|
| **Experience Reward** | XP awarded to killers | 0 |
| **Gold Min** | Minimum gold coins dropped (converted to copper internally) | 0 |
| **Gold Max** | Maximum gold coins dropped | 0 |
| **Essence Reward** | Essence points for character progression | 0 |
| **Essence Class** | Class restriction for essence (empty = all classes) | None |
| **Drop Table** | Link to a drop table for random item/currency loot | None |

### XP Distribution

When multiple players participate in a kill:
- Players more than 5 levels above or below the NPC are ineligible
- XP is split proportionally by level (higher level players get slightly more)
- Group bonus: +10% per additional group member (max +40% with 5 others)
- Each player gets at least 1 XP if eligible

### Gold Drops

The gold min/max values represent gold coins. Internally, gold is converted to copper (1 gold = 100 copper) and dropped as physical denomination items in the room. Players pick them up like any other item.

### Essence Distribution

Unlike XP, essence is **not split** - each eligible player gets the full amount. Use the class restriction to gate essence to specific classes (e.g., only Mages get essence from magical creatures).

---

## Appearance Tab

Controls the NPC's visual presentation and messaging.

| Field | Description | Default |
|-------|-------------|---------|
| **Augmentations** | List of random name prefixes (e.g., "fierce", "scarred", "young") | None |
| **Enter Room Message** | Custom message when NPC moves into a room | None |
| **Exit Room Message** | Custom message when NPC leaves a room | None |
| **Spawn Message** | Custom message when NPC first spawns | None |

### Augmentation System

Augmentations add variety to NPC instances. When an NPC spawns, one augmentation is randomly selected from the list, or **no augmentation** is applied. There is always an equal chance of getting no augmentation.

Example with augmentations `["fierce", "scarred", "young"]`:
- 25% chance: "fierce serpentine warrior"
- 25% chance: "scarred serpentine warrior"
- 25% chance: "young serpentine warrior"
- 25% chance: "serpentine warrior" (no augmentation)

The probability is `1 / (count + 1)` for each option, including the no-augmentation outcome.

### Custom Messages

- **Enter Room Message**: Shown to players in a room when the NPC moves in (roaming/returning). Not used for initial spawn.
- **Exit Room Message**: Shown when the NPC leaves a room.
- **Spawn Message**: Shown when the NPC first appears in the world. If not set, the default neutral "appears" message is used.

---

## Attacks Tab

Defines the NPC's melee, ranged, and magical attacks. Every NPC that participates in combat should have at least one attack.

### Attack Fields

| Field | Description | Default |
|-------|-------------|---------|
| **Name** | Display name (e.g., "claw swipe", "venomous bite") | Required |
| **Attack Type** | Flavor category: melee, ranged, or magic | melee |
| **Min Damage** | Minimum damage per hit | 1 |
| **Max Damage** | Maximum damage per hit | 4 |
| **Attacks Per Round** | Number of swings per combat round | 1 |
| **Percentage** | Relative selection weight (see below) | 100 |
| **Mana Cost** | Mana required to use this attack (0 = free) | 0 |
| **Hit Verb / 3rd Person** | Verb for successful hits (e.g., "claw" / "claws") | hit / hits |
| **Miss Verb / 3rd Person** | Verb for misses (e.g., "swing at" / "swings at") | swing at / swings at |
| **Hit Message** | Optional custom message on hit | None |
| **Miss Message** | Optional custom message on miss | None |

### Attack Selection (Weighted Percentage)

The **percentage** field is a relative weight, not an absolute probability. The system sums all affordable attack percentages and rolls against that total.

**Example**: Three attacks with percentages 60, 30, 10:
- Claw (60): 60% chance
- Bite (30): 30% chance
- Poison spit (10): 10% chance

These don't need to add up to 100. The values `6, 3, 1` would produce the same probabilities.

**Mana and Fallback**: If an attack has a mana cost and the NPC can't afford it, that attack is excluded from the pool. The NPC selects from remaining affordable attacks. If no affordable attacks exist, it falls back to free attacks (mana cost 0). An NPC always attacks - it never skips its turn.

### Multiple Attacks Per Round

Setting `attacks_per_round` to 2 or more means the NPC swings that many times when this attack is selected. Each swing rolls damage independently. Use this for multi-hit attacks like "flurry of claws" or "rapid strikes".

---

## Spells Tab

Assigns spells to the NPC with AI-driven casting behavior. Spells must be created in the Spell Editor first, then linked here.

### Spell Assignment Fields

| Field | Description | Default | Range |
|-------|-------------|---------|-------|
| **Spell** | Which spell from the spell library | Required | Dropdown |
| **Priority** | Which spell gets picked when multiple are eligible (lower = higher priority) | 50 | 0-100 |
| **Cast Chance** | Percent chance to actually cast if all conditions pass | 100 | 1-100 |
| **Condition** | When the NPC should consider casting this spell | Always | See below |
| **Condition Value** | Parameter for the condition check | 0 | Varies |
| **Cooldown (Rounds)** | Rounds the spell is locked out after casting | 0 | 0+ |

### How Spell Selection Works

Each combat round, the NPC AI runs two passes:

1. **Pass 1 - Between-round spells**: Heals, buffs, debuffs, DoTs (non-damage offensive spells). If one is selected, the NPC casts the spell AND also gets its melee attack at the end of the round.

2. **Pass 2 - In-round spells**: Offensive spells with damage dice (fireball, lightning bolt, etc.). If one is selected, the NPC casts the spell INSTEAD of its melee attack. The NPC never casts an in-round spell and melees in the same round.

3. **Fallback**: If no spell is selected in either pass, the NPC uses a normal melee attack.

**Spell timing is automatic** - you don't configure it. It's determined by the spell definition:
- Offensive spell with damage dice = **in-round** (replaces melee)
- Everything else (heals, buffs, debuffs, offensive without damage dice) = **between-round** (cast + melee)

### Priority

Priority determines **which spell gets picked** when multiple spells pass their conditions. Lower number = higher priority.

- Priority 10 always beats priority 50
- Tied priorities are broken randomly
- The winner then rolls its cast chance

**Important**: If the winning spell's cast chance roll fails, the NPC does NOT fall through to the next-priority spell. No spell is cast that round. This prevents predictable behavior.

### Cast Chance

Cast chance controls **how often** the spell actually fires when it's the top-priority eligible spell. This adds variety so NPCs don't feel robotic.

- 100% = always casts when eligible
- 75% = casts 3 out of 4 opportunities
- 40% = casts less than half the time, keeping the NPC unpredictable

### Conditions

| Condition | Description | Condition Value |
|-----------|-------------|-----------------|
| **Always** | No prerequisite, always eligible | Ignored |
| **HP Below %** | NPC health is below this percentage | Threshold (0-100) |
| **HP Above %** | NPC health is above this percentage | Threshold (0-100) |
| **Target HP Below %** | Current target's health is below this percentage | Threshold (0-100) |
| **Mana Above %** | NPC mana is above this percentage (requires max mana > 0) | Threshold (0-100) |
| **Missing Effect** | Target does not already have the spell's status effect | Ignored (uses spell's status effect field) |
| **Has Allies** | Number of alive NPCs in the same room (excluding self) meets minimum | Minimum count |
| **Combat Start** | First round of combat only | Ignored |

### Cooldown

Cooldown prevents a spell from being cast again for a number of rounds after use.

- **0** = No cooldown. The spell is eligible every single round.
- **3** = After casting, the spell is locked out for 3 rounds, then available again on round 4.

### NPC Mana

NPCs must have **Max Mana > 0** to cast spells with a mana cost. Mana regenerates at approximately 2% per tick (every 5 seconds) while out of combat. In combat, mana does not regenerate.

If an NPC runs out of mana, it cannot cast spells that have a mana cost and falls back to melee attacks.

---

## Merchant Tab

The Merchant tab appears when **Merchant Enabled** is checked in the Basic tab. Merchants sell items, respond to keywords, and use the faction/reputation system for pricing.

### Enabling Merchant Mode

1. Check **Merchant Enabled** in the Basic tab
2. Optionally set **Hostile** to off (merchants are typically non-hostile)
3. Assign a **Primary Faction** for reputation-based pricing
4. Configure inventory and responses in the Merchant tab

### Merchant Inventory

Each row in the inventory represents one item the merchant sells:

| Field | Description | Default |
|-------|-------------|---------|
| **Item** | Which item template the merchant stocks | Required |
| **Max Stock** | Maximum quantity in inventory | 10 |
| **Current Stock** | Starting inventory count | 10 |
| **Restock Chance** | Percent chance to restock one unit per hour | 100 |

- Stock is tracked per-template, not per-instance. If a merchant dies and respawns, inventory persists.
- Restocking happens once per hour. Each item below max stock has a `restock_chance`% probability of gaining one unit.
- A restock chance of 100% means the item reliably restocks. Lower values create scarcity for rare items.

### Merchant Responses

Keyword-triggered dialogue for when players speak to the merchant using directed speech (`>merchant message`):

| Field | Description |
|-------|-------------|
| **Trigger Keywords** | List of words that trigger this response |
| **Response** | What the merchant says |

Example:
- Keywords: `["sword", "swords", "weapons"]`
- Response: `"I have the finest blades in all of Silverton! Use 'list' to see my wares."`

When a player says `>goran tell me about your swords`, the system checks for keyword matches and the merchant responds.

### Pricing Engine

Merchant prices are modified by faction reputation and charisma:

**Reputation Calculation:**
```
Total Rep = Faction Rep + floor((Charisma - 50) / 10)
```

**Buying from merchant:**
- Positive rep: 1% discount per 10 rep (max 10% discount)
- Negative rep: 2% surcharge per 10 negative rep (max 10% surcharge)
- Below -50 rep: Merchant refuses to sell

**Selling to merchant:**
- Base sell price is 50% of the item's base value
- Same reputation modifiers apply

### Haggling

Players can `haggle` with merchants to try for better prices. Haggling builds a per-player, per-merchant reputation score:

| Haggle Rep | Effect |
|------------|--------|
| 1-3 | 1% price improvement per point |
| 4 | Reset to base price (no faction bonus) |
| 5-9 | +2% surcharge per point above 4 |
| 10+ | Merchant refuses all transactions |

- Haggle reputation decays: 1 point every 5 minutes of real time
- Excessive haggling can make prices worse or cause the merchant to refuse service entirely

### Merchant Hostility

If a player attacks a merchant:
- The merchant becomes hostile to that player for 10 minutes
- During hostility, the merchant refuses all transactions with that player
- Hostility is per-player, per-merchant (other players are unaffected)
- Merchants skip gold and loot drops on death (inventory persists)

### Merchant Player Commands

Players interact with merchants using these commands while in the same room:

| Command | Description |
|---------|-------------|
| `list` | View the merchant's inventory and prices |
| `buy <item> [qty]` | Purchase an item |
| `sell <item> [qty]` | Sell an item to the merchant |
| `price <item>` | Check buy/sell price for an item |
| `haggle` | Attempt to negotiate better prices |
| `>merchant <message>` | Speak to the merchant (triggers keyword responses) |

---

## Drop Tables

Drop tables define random loot and currency that NPCs drop on death. Manage them in the Drop Table Editor at `/drop-table-editor.html`.

### Creating a Drop Table

1. Open the Drop Table Editor
2. Click **+ New Table**
3. Add entries (each is an independent roll)

### Drop Table Entries

Each entry represents one possible drop, rolled independently:

| Field | Description | Default |
|-------|-------------|---------|
| **Item** | Item template to drop (empty = currency only) | None |
| **Drop Chance** | Percent chance this entry drops (0-100) | 100 |
| **Min Quantity** | Minimum items if dropped | 1 |
| **Max Quantity** | Maximum items if dropped | 1 |
| **Currency Min** | Minimum copper to drop (0 = no currency) | 0 |
| **Currency Max** | Maximum copper to drop | 0 |
| **Allowed Denominations** | Which coin types to use for currency drops | All |

### How Drops Work

1. On NPC death, each drop table entry is rolled independently
2. If the roll succeeds (random 0-100 <= drop_chance), the item/currency drops
3. Currency is converted to physical coin items using allowed denominations
4. Items and coins appear in the room for any player to pick up

### Denomination System

Currency drops are converted to physical coins. Allowed denominations control which coin types are used:

| Denomination | Value (copper) |
|--------------|---------------|
| copper | 1 |
| silver | 10 |
| gold | 100 |
| platinum | 1,000 |
| runic | 10,000 |

Example: A drop of 150 copper with allowed denominations `["copper", "silver"]` would drop 15 silver coins (150 copper total). No value is lost — copper is always included as a fallback denomination to prevent silent value loss.

Example: A drop of 35 copper with allowed denominations `["silver"]` would drop 3 silver coins (30 copper) and 5 copper coins (the system always adds copper as a fallback).

If allowed denominations is left empty (all), the system uses the most efficient denomination breakdown.

### Linking a Drop Table to an NPC

In the NPC Editor's Rewards tab, select the drop table from the **Drop Table** dropdown. Each NPC can have one drop table.

---

## Factions

Factions affect merchant pricing through reputation. Manage them in the Faction Editor at `/faction-editor.html`.

### Creating a Faction

1. Open the Faction Editor
2. Click **+ New Faction**
3. Fill in:
   - **Name**: Faction name (e.g., "Silverton Merchants Guild")
   - **Description**: Lore and background
   - **Type**: city, tribal, merchant, or guild

### Linking Factions to NPCs

1. In the NPC Editor's Basic tab, set the **Primary Faction**
2. This determines which faction's reputation affects merchant pricing for that NPC
3. Players build reputation through gameplay interactions with the faction

### Reputation Effects

| Reputation Range | Effect on Merchant Prices |
|-----------------|--------------------------|
| +100 to +10 | Up to 10% discount (1% per 10 rep) |
| +9 to 0 | No modifier |
| -1 to -49 | Up to 10% surcharge (2% per 10 negative rep) |
| -50 and below | Merchant refuses all transactions |

Player charisma also factors in: every 10 points of charisma above 50 adds effective reputation, and every 10 below 50 subtracts it.

---

## Building Common NPC Types

### Basic Combat Mob

A standard hostile creature that attacks on sight:

1. **Basic Tab**: Set name, level, max health, spawn room, respawn time. Check **Hostile**.
2. **Combat Tab**: Set accuracy, defense, dodge appropriate for level.
3. **Rewards Tab**: Set experience reward and gold range.
4. **Attacks Tab**: Add at least one melee attack.

Example - Level 3 rat:
- Name: "giant rat"
- Max Health: 30, Level: 3
- Hostile: On, Respawn Time: 60
- Accuracy: 45, Defense: 35, Dodge: 5
- Experience: 50, Gold: 1-5
- Attack: "bite" (melee, 2-6 damage, 1 attack/round, 100%)

### Spellcaster Mob

A hostile mob that uses spells in combat:

1. **Basic Tab**: Same as combat mob, but set **Max Mana** > 0.
2. **Combat Tab**: Set spell power if using scaling spells.
3. **Attacks Tab**: Add a basic melee attack as fallback.
4. **Spells Tab**: Assign spells with appropriate conditions.

Example - Level 8 dark mage:
- Name: "dark mage"
- Max Health: 60, Max Mana: 100, Level: 8
- Spell Power: 1
- Attack: "staff strike" (melee, 3-8 damage, 100%)
- Spells:
  - Shadow Bolt: Priority 50, Cast Chance 60%, Condition: Always, Cooldown: 0
  - Dark Shield (buff): Priority 20, Cast Chance 80%, Condition: Combat Start, Cooldown: 10
  - Drain Life (heal): Priority 10, Cast Chance 75%, Condition: HP Below 40%, Cooldown: 3

**Reading this configuration**: The mage always tries to self-buff on the first round (priority 20 Combat Start). When hurt below 40%, it prioritizes Drain Life (priority 10). Otherwise, it has a 60% chance to cast Shadow Bolt each round, falling back to its staff attack the other 40% of the time.

### Boss Mob

A powerful enemy with multiple attacks, spells, and tactical behavior:

1. **Basic Tab**: High health, high mana, higher level. Hostile, long respawn.
2. **Combat Tab**: Above-average stats across the board.
3. **Behavior Tab**: Enable flee at low HP, enable call for help.
4. **Rewards Tab**: High XP, good gold, link a generous drop table.
5. **Attacks Tab**: Multiple attacks with varying damage and percentage weights.
6. **Spells Tab**: Multiple spells with different conditions.

Example - Level 15 dragon:
- Max Health: 500, Max Mana: 200, Level: 15
- Respawn: 600 (10 minutes)
- Accuracy: 75, Defense: 70, Crit: 15, Dodge: 10, DR: 8
- Flee Enabled: On, Flee HP: 10%
- Call for Help: 50%
- Attacks:
  - Claw swipe (melee, 10-20, 2 attacks/round, weight 50)
  - Tail sweep (melee, 15-25, 1 attack/round, weight 30)
  - Fire breath (magic, 20-40, 1 attack/round, weight 20, mana cost 15)
- Spells:
  - Flame Shield (buff): Priority 10, 100%, Combat Start, Cooldown: 15
  - Inferno (AoE damage): Priority 40, 50%, HP Above 50%, Cooldown: 5
  - Cauterize (self-heal): Priority 5, 80%, HP Below 30%, Cooldown: 4

### Passive Creature

An ambient NPC that doesn't fight:

1. **Basic Tab**: Set name, level 1, low health. Leave Hostile off.
2. **Rewards Tab**: Minimal or no rewards.
3. No attacks or spells needed.

Example - Ambient deer:
- Name: "deer", Level: 1, Max Health: 10
- Hostile: Off, Respawn: 120
- Experience: 5, Gold: 0
- No attacks (won't fight back)

### Roaming Guard

A hostile NPC that patrols an area and calls for help:

1. **Basic Tab**: Hostile, moderate stats.
2. **Behavior Tab**: Enable roaming with area restriction. Enable call for help.
3. **Attacks Tab**: Standard melee attack.

Example - City guard:
- Name: "city guard", Level: 10, Max Health: 100
- Hostile: On, Respawn: 120
- Roam Enabled: On, Interval: 45, Chance: 20%
- Allowed Areas: ["Silverton"]
- Call for Help: 75%
- Attack: "sword slash" (melee, 8-16, 1/round, 100%)

### Merchant NPC

A non-hostile NPC that sells items:

1. **Basic Tab**: Set a proper name, check **Merchant Enabled**. Leave hostile off. Set primary faction.
2. **Appearance Tab**: Add a spawn message for flavor.
3. **Merchant Tab**: Add inventory items, set stock levels, add keyword responses.

Example - Blacksmith:
- Name: "Brendan the Blacksmith", Proper Name: On
- Merchant Enabled: On, Hostile: Off
- Primary Faction: "Silverton Merchants Guild"
- Spawn Room: Forge (room 10)
- Respawn: 60
- Inventory: iron sword (stock 5), iron shield (stock 3), chain mail (stock 2)
- Responses:
  - Keywords: ["repair", "fix"] - "I don't do repairs, but I can sell you something better!"
  - Keywords: ["discount", "deal"] - "My prices are fair. Take it or leave it."

---

## In-Game Commands

### Staff Commands (Moderator+)

| Command | Description |
|---------|-------------|
| `@goto <room_id>` | Teleport to test NPC spawns |

### Developer Commands

| Command | Description |
|---------|-------------|
| `@reload mobs` | Reload NPC templates from database |
| `@reload droptables` | Reload drop table data |
| `@reload all` | Reload everything |
| `@npcs` | List all active NPC instances |
| `@mobbehavior` | Show detailed NPC state (behavior, roam timers, augmentation) |

### Testing Workflow

1. Create or edit the NPC template in the NPC Editor
2. In-game, run `@reload mobs` to load changes
3. If the NPC has a spawn room, it will appear automatically
4. Use `@npcs` to verify the instance is active
5. Use `@mobbehavior` to monitor behavior state, roam countdowns, and spell cooldowns
6. Kill the NPC and verify rewards (XP, gold, loot drops)
7. Wait for respawn and verify it comes back correctly

---

## NPC Behavior States

NPCs cycle through four behavioral states:

```
                    ┌─────────────────────────────┐
                    │                             │
                    v                             │
SPAWN ──> IDLE ──> COMBAT ──> FLEEING ──> RETURNING
           ^         │                      │
           │         │                      │
           │         v                      │
           │       DEATH ──> RESPAWN ───────┘
           │                                │
           └────────────────────────────────┘
```

| State | Description | Triggers |
|-------|-------------|----------|
| **Idle** | Resting, can roam. HP/mana regenerate. | Spawn, return complete, no targets |
| **Combat** | Fighting players. Selects attacks/spells each round. | Player enters room (hostile), player attacks |
| **Fleeing** | Running away from combat (up to 3 rooms). | HP drops below flee threshold |
| **Returning** | Pathfinding back to spawn room. | Flee complete, cornered with no players |

### Aggro Rules

- Hostile NPCs aggro when a player enters their room
- Hostile NPCs aggro when they roam or spawn into a room with players
- Hidden players (stealth) are skipped unless the NPC has the `see-invisible` trait
- Non-hostile NPCs never initiate combat
- NPCs that are fleeing or returning do not aggro

### Death and Respawn

1. NPC reaches 0 HP and dies immediately (no dropped/bleed-out state like players)
2. XP is distributed to eligible participants
3. Essence is awarded to eligible participants (not split)
4. Gold drops as coin items in the room
5. Drop table entries are rolled and loot appears in the room
6. Instance is removed from the world
7. After `respawn_time` seconds, a new instance spawns at the original spawn room
8. Merchants skip gold and loot drops but still award XP/essence

---

## Tips and Best Practices

### Attack Design

- Always give combat NPCs at least one attack with mana cost 0 as a fallback
- Use the percentage weights to create attack variety without making rare attacks too powerful
- Higher `attacks_per_round` multiplies damage output significantly - use cautiously
- Custom hit/miss verbs add personality ("The serpentine warrior snaps its jaws at you" vs "hits you")

### Spell Configuration

- Set self-healing spells to the lowest priority number (highest priority) with an HP condition
- Use cast chance below 100% to prevent predictable NPC behavior
- Cooldowns prevent spell spam - a heal with cooldown 3 can only fire every 4 rounds
- The "Missing Effect" (`no_effect`) condition prevents NPCs from wasting turns reapplying a debuff that's already active
- `combat_start` is great for opening buffs (shield, haste) that only need to be cast once
- If the cast chance roll fails, the NPC does not try the next spell - it melees instead

### Merchants

- Always use proper names for merchants ("Goran", not "weaponsmith")
- Set a primary faction so reputation-based pricing works
- Keep restock chance at 100% for common items, lower it for rare inventory
- Add keyword responses for common player questions (prices, items, lore)
- Merchants don't drop gold or loot on death - their inventory persists through death/respawn

### Balance

- Scale NPC stats with level - a level 5 mob should be noticeably easier than level 10
- Test XP rewards by checking how many kills it takes to level up at the target level range
- Use the level gap filter to your advantage: set NPC level appropriately so high-level players get no XP from trivial mobs
- Gold drops create inflation - keep amounts reasonable relative to merchant prices

### Roaming

- Long intervals with low chances create realistic wandering patterns
- Short intervals with high chances make NPCs feel hyperactive
- Always set allowed areas for roaming mobs to prevent them wandering into town
- Roaming NPCs that are hostile will aggro players they encounter during their patrol

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| NPC doesn't spawn | Check spawn room is set, max_active > 0, and run `@reload mobs` |
| NPC doesn't attack | Verify at least one attack is defined in the Attacks tab |
| NPC never casts spells | Check max mana > 0, spells are assigned, and conditions can be met |
| Spell always fires | Cast chance is 100% and condition is "Always" - add conditions or lower cast chance |
| NPC won't roam | Check roam enabled, roam chance > 0, and room exits exist within allowed areas |
| NPC roams out of area | Set allowed areas to restrict movement |
| Merchant won't sell | Check merchant enabled, inventory has stock, player isn't hostile, faction rep > -50 |
| No gold drops | Check gold min/max > 0 in Rewards tab. Merchants skip gold drops by design. |
| Drop table items missing | Verify drop table is linked in Rewards tab, entries have drop_chance > 0, and run `@reload droptables` |
| NPC flees but never returns | Check allowed areas aren't blocking the return path, or spawn room is reachable |
| Augmentation never appears | Add augmentation strings to the Appearance tab. Remember there's always a chance of no augmentation. |
| XP not awarded | Player level may be more than 5 levels away from NPC level |
| `@mobbehavior` shows no data | NPC may not be spawned. Check `@npcs` first. |
