# Door System Guide

This guide covers the door system in Kingdoms of Avarice, including door types, configuration options, and common design patterns.

## Prerequisites

**Required Role:** Developer or Admin

Door creation and editing requires the **Developer** or **Admin** role. Access the Door Editor from the Developer dropdown menu.

## Table of Contents

1. [Understanding Doors vs Room Exits](#understanding-doors-vs-room-exits)
2. [Door Types](#door-types)
3. [Door Editor Overview](#door-editor-overview)
4. [Configuration Options](#configuration-options)
5. [Common Design Patterns](#common-design-patterns)
6. [Permission System](#permission-system)
7. [Best Practices](#best-practices)

---

## Understanding Doors vs Room Exits

The game has two separate systems for connecting rooms:

### Room Exits

Room exits are simple directional connections stored in the `room_exits` table. They define basic navigation:

- Player types "north" → moves to the connected room
- No mechanics (no locks, no triggers, no restrictions)
- Always passable
- Created in the Room Editor

### Doors

Doors are an **overlay system** that adds mechanics on top of room exits:

- Can be opened, closed, locked
- Can require triggers (special commands to pass)
- Can have level, class, or item requirements
- Can be hidden from the exits list
- Created in the Door Editor

**Key Concept:** When a player tries to move in a direction, the game first checks if there's a door. If a door exists, its rules apply. If no door exists, the normal room exit is used.

### When to Use Each

| Use Room Exit When... | Use Door When... |
|----------------------|------------------|
| Simple passage between rooms | Need open/close/lock mechanics |
| No restrictions needed | Need level or class restrictions |
| Always accessible | Need hidden passages |
| Standard directional movement | Need triggered passages (special commands) |
| | Need temporary/spawnable portals |

---

## Door Types

### Open Passageway

The simplest door type. Functionally similar to a room exit but allows you to:
- Add a description when players look at it
- Set it as hidden (won't show in exits list)
- Add permission requirements

**Use for:** Passages that need descriptions or restrictions but no physical door mechanics.

### Physical Door

A traditional door that can be opened, closed, and locked.

**Features:**
- Default state: open, closed, or locked
- Auto-close timer (door closes automatically after X seconds)
- Lock mechanics:
  - Key item requirement
  - Pick difficulty (0-500+, where 500+ is unpickable)
  - Bash difficulty (0-500+, where 500+ is unbashable)
  - Auto-lock timer

**Use for:** Building entrances, dungeon doors, locked gates, prison cells.

### Special Door

A passage activated by examining or interacting with an object.

**Features:**
- Trigger text (what player types to use it)
- Custom passage messages
- Item display name (shown on "Also here:" line)
- Can be hidden

**Use for:** Secret passages behind bookcases, hidden switches, puzzle elements.

### Triggered Passageway

A passage that requires a specific command to traverse.

**Features:**
- Trigger text (required command)
- Custom passage messages
- Can be hidden from normal exit list

**Use for:** Climbing ropes, crawling through holes, swimming across rivers, entering portals.

**Example triggers:**
- "climb rope"
- "crawl hole"
- "swim across"
- "enter portal"
- "go manhole"

### Temporary Portal

A portal that must be spawned before use and disappears after a duration.

**Features:**
- Spawn trigger text (phrase to create the portal)
- Duration (how long portal stays open)
- Appear/disappear messages
- Item display name

**Use for:** Magical portals, summoned gateways, time-limited shortcuts, spell-created passages.

---

## Accessing Door Editing

There are two ways to edit doors:

### From the Room Editor (Recommended for Room-Specific Work)

When editing a room, you'll see a **Doors** section below the Exits section. This shows all doors connected to the current room.

- **Click any door** to open it in the Door Editor
- **"+ New Door for This Room"** creates a new door with the entry room pre-filled
- **"Open Door Editor"** link takes you to the full Door Editor

This is the fastest workflow when you're working on a specific room and want to add or edit its doors without searching through all doors in the game.

### From the Door Editor (For Bulk Door Management)

Access the Door Editor directly from the Developer menu for:
- Viewing/filtering all doors in the game
- Working with doors across multiple rooms
- Bulk door management

---

## Door Editor Overview

### View Modes

The Door Editor has two view modes:

**Doors View:**
- Lists all doors in the game
- Filter by area, room, type, or search text
- Click a door to edit it

**Room Exits View:**
- Lists all room exits from the room system
- Shows which exits already have doors
- Quick "+ Door" button to create a door from an existing exit

### Creating Doors

**Method 1: New Door Button**
1. Click "+ New Door"
2. Enter a name
3. Configure entry room and direction
4. Set door type and options
5. Save

**Method 2: From Room Exit**
1. Switch to "Room Exits" view
2. Find the exit you want to add a door to
3. Click "+ Door"
4. Enter a name
5. The door is created with entry/exit pre-configured
6. Edit additional options as needed

**Method 3: From Room Editor**
1. Open the Room Editor and select a room
2. In the Doors section, click "+ New Door for This Room"
3. Enter a door name
4. The door is created with the entry room pre-filled
5. Configure remaining settings in the Door Editor

### URL Parameters

The Door Editor supports URL parameters for integration with other tools:

| Parameter | Example | Description |
|-----------|---------|-------------|
| `doorId` | `?doorId=123` | Opens with door #123 selected |
| `newDoorForRoom` | `?newDoorForRoom=456` | Creates a new door for room #456 |

These parameters are used automatically when clicking doors or buttons in the Room Editor.

### Filters

- **Area:** Filter doors by the area their connected rooms are in
- **Room:** Filter doors connected to a specific room
- **Type:** Filter by door type
- **Search:** Text search in door names and descriptions

---

## Configuration Options

### Basic Settings (All Door Types)

| Field | Description |
|-------|-------------|
| Name | Internal name (shown in editor, used in some messages) |
| Door Type | Determines available options and behavior |
| Description | Shown when player looks at the door |
| Hidden | If true, door is not shown in the room's exit list |

### Room Connection

| Field | Description |
|-------|-------------|
| Entry Room | The room where this door's "front" is |
| Entry Direction | The direction from entry room (north, south, etc.) |
| Exit Room | The destination room when using the door |
| Exit Direction | The direction the door appears from in the exit room |

**Understanding Exit Room vs Exit Direction:**

- **Exit Room** determines WHERE the door takes you (the destination)
- **Exit Direction** determines WHETHER the door appears from the destination side

**Configuration Options:**

| Exit Room | Exit Direction | Behavior |
|-----------|----------------|----------|
| Set | Set | Two-way door: appears and works from both sides |
| Set | None | One-way with destination: works from entry side, doesn't appear from exit side |
| None | N/A | Broken: door has no destination, players get "leads nowhere" error |

**Important:** For triggered passageways with a normal return exit, you typically want:
- Exit Room: Set (so the door knows where to send you)
- Exit Direction: None (so the door doesn't appear from the other side)
- Then add a normal room exit from the destination back

### State Settings (Physical Doors)

| Field | Description |
|-------|-------------|
| Default State | Initial state: open, closed, or locked |
| Auto-Close | Seconds until door automatically closes (0 = never) |

### Lock Settings (Physical Doors)

| Field | Description |
|-------|-------------|
| Has Lock | Enable lock mechanics |
| Key Item Tag | Item tag that can unlock this door |
| Auto-Lock | Seconds until door automatically locks after unlock (0 = never) |
| Pick Difficulty | Lockpicking difficulty (0-500+, 500+ = unpickable) |
| Bash Difficulty | Bashing difficulty (0-500+, 500+ = unbashable) |

### Trigger Settings (Special, Triggered Passageway, Temporary Portal)

| Field | Description |
|-------|-------------|
| Trigger Text | Command player types to use passage |
| Passage Message (Self) | Message shown to the player using the passage |
| Passage Message (Room) | Message shown to others in the room (use {player} for name) |
| Item Display Name | How the door appears on "Also here:" line |

### Portal Settings (Temporary Portal)

| Field | Description |
|-------|-------------|
| Spawn Trigger Text | Phrase to speak/type to create the portal |
| Duration | Seconds the portal remains open |
| Appear Message | Message when portal spawns |
| Disappear Message | Message when portal expires |

### Permission Settings (All Except Open Passageway)

| Field | Description |
|-------|-------------|
| Required Level | Minimum character level to use door |
| Required Classes | Comma-separated list of classes that can use door |
| Required Quest Flag | Quest flag that must be set |
| Required Item Tag | Item that must be in inventory (not consumed) |
| Denial Message | Custom message when permission check fails |

---

## Common Design Patterns

### Pattern 1: Standard Two-Way Door

A normal door between two rooms.

```
Room A ←──[Door]──→ Room B
```

**Setup:**
- Entry Room: Room A
- Entry Direction: east
- Exit Room: Room B
- Exit Direction: west
- Door Type: Physical
- Default State: closed

### Pattern 2: One-Way Triggered Entry, Normal Exit

Player uses special command to enter, but exits normally. Classic example: manhole.

```
Street ──[go manhole]──→ Sewer
Street ←────[up]──────── Sewer (normal room exit)
```

**Setup for the triggered door:**
- Entry Room: Street
- Entry Direction: down
- **Exit Room: Sewer** (the destination - must be set!)
- **Exit Direction: None** (so the door doesn't appear from Sewer side)
- Door Type: Triggered Passageway
- Trigger Text: "go manhole"
- Hidden: true (optional - hides "down" from exits list on Street side)

**The return path:** Create a normal room exit from Sewer going "up" to Street in the Room Editor.

**Common mistake:** Setting Exit Room to "None" instead of setting Exit Direction to "None". If Exit Room is not set, the door has no destination and players get "The passage leads nowhere."

**Why this works:**
1. Exit Room tells the door WHERE to send the player (Sewer)
2. Exit Direction being None means the door doesn't appear from Sewer's side
3. The normal room exit handles the return trip independently

### Pattern 3: Asymmetric Doors (Different Types Each Way)

Different door types for each direction.

```
Room A ──[triggered]──→ Room B
Room A ←──[physical]─── Room B
```

**Setup:** Create two separate one-way doors:

**Door 1 (A to B):**
- Entry Room: Room A
- Entry Direction: east
- Exit Room: None (one-way)
- Door Type: Triggered Passageway
- Trigger Text: "climb rope"

**Door 2 (B to A):**
- Entry Room: Room B
- Entry Direction: west
- Exit Room: None (one-way)
- Door Type: Physical
- Default State: closed

### Pattern 4: Hidden Secret Passage

A passage that doesn't appear in the room's exit list.

**Setup:**
- Door Type: Special or Triggered Passageway
- Hidden: true
- Trigger Text: "push brick" or "pull lever"
- Item Display Name: (leave empty to be completely invisible)

Players must discover the trigger through room descriptions, hints, or exploration.

### Pattern 5: Level-Gated Area

An area only accessible to higher-level characters.

**Setup:**
- Door Type: Physical (or any type)
- Required Level: 10
- Denial Message: "The ancient wards prevent those below level 10 from passing."

### Pattern 6: Class-Restricted Guild Hall

Only certain classes can enter.

**Setup:**
- Door Type: Physical
- Required Classes: warrior, paladin, berserker
- Denial Message: "Only members of the Warriors' Guild may enter."

### Pattern 7: Key-Locked Door

Requires a specific item to unlock.

**Setup:**
- Door Type: Physical
- Default State: locked
- Has Lock: true
- Key Item Tag: brass_key
- Pick Difficulty: 100 (or 500+ if unpickable)
- Bash Difficulty: 200 (or 500+ if unbashable)

The player needs an item with `key_tag: "brass_key"` in their inventory.

### Pattern 8: Temporary Summoned Portal

A portal that appears when triggered and disappears after time.

**Setup:**
- Door Type: Temporary Portal
- Entry Room: Summoning Chamber
- Entry Direction: portal (custom direction)
- Exit Room: Destination
- Spawn Trigger Text: "speak friend and enter"
- Duration: 60 (seconds)
- Trigger Text: "enter portal"
- Appear Message: "A shimmering portal tears open in the air!"
- Disappear Message: "The portal wavers and collapses into nothing."
- Item Display Name: "A shimmering portal"

### Pattern 9: Puzzle Door (Item Required to Pass)

Door that requires carrying a specific item.

**Setup:**
- Door Type: Physical or Triggered Passageway
- Required Item Tag: guild_badge
- Denial Message: "The magical barrier blocks your path. Perhaps you need proper identification."

Note: The item is checked but not consumed.

### Pattern 10: Quest-Gated Content

Door that only opens after completing a quest.

**Setup:**
- Door Type: Any
- Required Quest Flag: defeated_dragon
- Denial Message: "The spirits of this place do not yet recognize you as worthy."

---

## Permission System

Doors can have multiple permission requirements. All requirements must be met to pass.

### Requirement Types

1. **Level Requirement**
   - Player must be at least the specified level
   - Set to 0 or leave empty for no level requirement

2. **Class Requirement**
   - Player must be one of the listed classes
   - Comma-separated list: "warrior, paladin, berserker"
   - Leave empty for no class requirement

3. **Quest Flag Requirement**
   - Player must have a specific quest flag set
   - Used for story progression gates

4. **Item Tag Requirement**
   - Player must have an item with the specified tag in inventory
   - Item is NOT consumed when passing through
   - Use for keys, badges, tokens, etc.

### Denial Messages

When a player fails a permission check, they see either:
- Your custom denial message (if set)
- A generic "You cannot pass through here." message

**Tips for denial messages:**
- Be thematic and immersive
- Give hints about what's needed (without being too explicit)
- Different messages for different doors add flavor

---

## Best Practices

### Naming Conventions

- Use descriptive names: "Blacksmith Shop Front Door" not "Door 47"
- Include location context for easier filtering
- Be consistent across your world

### Performance Considerations

- Doors are loaded per-room, so thousands of doors won't impact performance
- Use filters in the editor to manage large numbers of doors
- Group related doors by area for easier management

### Design Tips

1. **Don't over-use doors.** Simple passages don't need door objects. Only add doors when you need mechanics.

2. **Hidden doors need hints.** If a passage is hidden, ensure the room description or nearby clues hint at its existence.

3. **Test both directions.** Always verify the player experience from both sides of a door.

4. **Consider failure states.** What happens when a player fails a permission check? Is there an alternative path?

5. **Use denial messages.** Custom denial messages improve immersion over generic failures.

6. **Document complex setups.** For elaborate multi-door puzzles, keep notes on how they work.

### Common Mistakes

1. **Confusing Exit Room with Exit Direction.** Exit Room is the destination; Exit Direction controls whether the door appears from that side. For a one-way triggered passageway, set Exit Room (destination) but leave Exit Direction as None.

2. **Setting Exit Room to None for "one-way" doors.** This creates a door with no destination. Players get "The passage leads nowhere." Instead, set Exit Room to the destination and Exit Direction to None.

3. **Forgetting the return path.** When using a one-way door configuration, remember to create a normal room exit for the return trip in the Room Editor.

4. **Overlapping doors.** Two doors in the same direction from the same room will conflict. Only one door per room+direction.

5. **Impossible requirements.** Don't create doors that require items or quest flags that don't exist.

6. **Hidden but not triggerable.** A hidden door with no trigger text is effectively a wall.

---

## Troubleshooting

### "A door already exists in that direction"

Each room can only have one door per direction. Either:
- Delete the existing door first
- Use a different direction
- Edit the existing door instead

### "The passage leads nowhere"

The door has no destination set:
- **Fix:** Set Exit Room to the destination room
- **Note:** Exit Direction can be None (for one-way behavior), but Exit Room must be set

### Door not appearing in game

Check:
- Is the door marked as Hidden?
- Is the door's entry room correct?
- Does the room exit actually exist for that direction?
- For triggered passageways: they intentionally don't appear in "Obvious exits" - use the trigger text

### Trigger text not working

Check:
- Is the trigger text exactly what you're typing? (case-insensitive but must match exactly)
- Are you in the Entry Room? (triggers only work from the entry side)
- Did you save the door after making changes? (doors are reloaded on save)
- For temporary portals: has the portal been spawned first?

### Can't pass through door

Check:
- Is the door locked? (Physical doors)
- Is the trigger text correct? (Triggered types)
- Do you meet all permission requirements?
- Is the door state "closed" and you need to "open" it first?

### Door works one way but not the other

This is likely intentional (one-way door). If not:
- Check that Exit Room is set
- Check that Exit Direction is set
- Verify no conflicting door exists on the other side

### Return exit not showing in "Obvious exits"

If you set up a one-way triggered passageway:
- The door's Exit Direction should be None (so the door doesn't appear from the exit side)
- Create a normal room exit in the Room Editor for the return path
- The return path is independent of the door
