# Kingdoms of Avarice - Door Implementation Plan

Kingdoms of Avarice will support multiple types of doors.  These doors will provide more game based functionality and game dynamics.

## Types of Doors

- Open Passageways
- A standard physical door
- Special Doors.  

### Open Passageways

- No door shown in the room.  Just an exit. 

### Standard Physical Door

These are your standard doors. 

- Can be opened and closed.
- Flag to enable locks on the door
  - A specific key (item) that can be used to unlock the door.
  - Locks will have a settable picking difficulty that includes unpickable setting.
  - Support bash difficulty and support unbashable setting.
  - A setting for how long before the door re-locks after being unlocked, picked, bashed open.

### Special Doors

These appear as an item in the room, but not on the Obvious exits line.

Example: Whirling Vortex, Gaseous Portal, Portcullis, Magic Barrier, a rope

- Appear as an item in the room on the "Also here:" line.
- Require specific text to be said by player to trigger it.  (go portal, go vortex, climb rope, climb ladder)
- Cannot be moved or picked up.
- Have a description if looked at.

#### Special Doors Extended - A Temporary Portal

These are exactly like the Special Doors because they are. The main difference is they must be triggered in some way before they 
appear.  For instance, a spell is cast and the portal appears.   The portals are not permanent and disappear after a set period
of time.

- Must be triggered in some form.  A quest, a spell, special text said in the room.
- Exist for a limited time.  After they expire, they disappear and must be retriggered.
- Once triggered, they appear on the "Also here:" line in the room until they expire.
- Require specific text to be said by a player to trigger the passageway.  (go portal, go fire, go vortex, go hole)
- Cannot be moved or picked up.
- Have a description if looked at.

### Special Doors Extended 2 - Triggered Passageway

These passageway do not show on obvious exits line, but could be noted in the room description.  They may
also be part of a quest and the quest provides details on where the triggered passage way is and how it's
triggered.

- Have a flag making them not visible (doesn't show on obvious exits line)
- Triggered via text. (go passage, go hole, Valar Morghulis)
- Special text to be displayed when the passage is triggered (You crawl through the hole, Player crawls through the hole)


## Door Operations

The doors will support different operations and functions.  Below we will better describe them.

### Open and Close

Physical doors will have the ability to open and close them.  When a door is closed, players cannot pass through
the door.   They will have to first open it.

**NOTE:** Doors with Locks and Doors without Locks automatically close with a different room message.

- Doors will default to closed.
- If a door is open, it will automatically close after a specified amount of time. (default 2 minutes)
- When a door's timer times out.  A message will be sent to the room that the door closed.
- A door can be trapped. (for future use as traps are not implemented yet)

When a door closes, it will tell the room:  "The door to the [direction] just closed.

#### Closed Doors

If a players tries to pass through a closed door, they will bump into the door.

- You run into the door to the [direction]!
- Playername runs into the door to the [direction]!

### Door Locks

Doors will have a flag to enable a "lock".  If the lock is enabled, this will enable other attributes for the lock.

**NOTE:** Doors with Locks and Doors without Locks automatically close with a different room message.

- A specific key (item) that has an attribute that allows it to unlock that door. (possibly a tag that matches that door)
- A lockpicking difficulty setting that includes a value that makes it impossible to pick.
	- Lockpicking difficulty will also apply to spells that have the ability to open locks.
- A bash door difficulty setting that includes a value that makes it impossible to bash the door open.
- If a door is open, it will automatically close (lock) after a specified amount of time. (default 2 minutes)
- When a door's timer times out.  A message will be sent to the room that the door "locked."

When a door locks, it will tell the room:  "The door to the [direction] just locked.

**NOTE:** Bashed open doors are just open, not broken.  They will close like a door opened or picked.

### Triggered Passageway

To pass through a triggered passageway, you must say the correct words.

Example:

Player says: go hole
Players slips through a small hole and vanishes.

Triggered passageways do not show up as an obvious exit.

#### One-Way Triggered Passageway Pattern

For passages that should be hidden on one side but visible on the other (e.g., manholes, secret entrances), use a **one-way door + normal room exit** combination:

1. **Create a one-way triggered passageway** — set `entryTag`/`entryDirection` only, omit `exitTag`/`exitDirection`. The door handles movement from the hidden side via trigger text (e.g., `go manhole`). The door is hidden (`isHidden: true`) so it doesn't appear on the obvious exits line.

2. **Create a normal room exit** for the return path — add a standard `room_exit` from the destination back to the entry room (e.g., sewer room → street room, direction `up`). This shows as a visible obvious exit and allows normal direction-based movement.

**Result:** From the street, players see no "down" exit — they must know to type `go manhole`. From the sewer, players see "up" as a normal exit and can type `up` to climb back to the street.

**Example (sewer manhole):**
```
// One-way door: street → sewer (hidden, requires trigger text)
Door: {
  doorType: 'triggered_passageway',
  entryTag: 'town_square',
  entryDirection: 'down',
  isHidden: true,
  triggerText: 'go manhole',
  // No exitTag/exitDirection — one-way only
}

// Normal room exit: sewer → street (visible, walkable)
Exit: { fromTag: 'sewer_hub', toTag: 'town_square', direction: 'up' }
```

### Triggered Opening Doors

Some doors will not be available unless triggered.  These can include spells or spoken word triggers.

Example:

Player_1 says, "Valar Morghulis"
A portal appears out of thin air!

Up from Temple Steps
Also here: a whirling vortex, Player_1, Player_2
Obvious exits: down

Triggered Doors do not show up as an Obvious exit, they do show up on the Also here: line until they expire.

Triggered doors are temporary.  Once triggered a timer will begin and once the timer expires, the door will vanish and must be 
retriggered for it to reappear.   While the door is not active, it cannot be used.

Once the door is triggered and appears.  A second spoken word can be use to pass through it. (ie, "go portal")

The terms used to make it appear and to pass through it will be configurable via the door editor.

## Door Architecture

### Two-Way vs One-Way Doors

A door is represented as a single object that defines up to two exits (entry and exit rooms). This approach ensures consistency - when a door's state changes (opened, closed, locked), both sides reflect that change automatically.

- **Two-way door**: Both the entry room and exit room are specified. Players can traverse the door from either direction.
- **One-way door**: Only the entry room is specified (exit room is omitted). Players can only pass through in one direction. Useful for trapdoors, slides, or magical portals that deposit you somewhere you can't return from.

Example: A trapdoor in a dungeon floor. The entry room is the upper level, and the exit room leads to a pit below. Players fall through but cannot climb back up through the same door.

### Door State Persistence

Door states (open/closed/locked) need to be tracked. Two approaches to consider:

1. **In-memory only**: Door states reset on server restart. Simpler implementation, but players may exploit server restarts to bypass locked doors.
2. **Database-persisted**: Door states survive server restarts. More complex but maintains world consistency.

**Recommendation**: Start with in-memory state management. Doors reset to their default state (closed/locked) on server restart. This is acceptable for most MUD scenarios and avoids the complexity of tracking every door state change in the database.

Temporary portals should always be in-memory only since they are inherently transient.

### Permission System

Doors can have optional restrictions that limit who can use them.

- **Level requirement**: Minimum character level to pass through.
- **Class restriction**: Only certain classes can use the door (e.g., a thieves' guild entrance).
- **Quest flag**: Requires completion of a specific quest before the door becomes usable.
- **Faction standing**: Requires a certain reputation level with a faction.
- **Item requirement**: Must have a specific item in inventory (different from a key - the item is not consumed).

When a player fails a permission check, a configurable denial message is displayed:
- "The guard blocks your path. You are not welcome here."
- "The magical barrier repels you. Only those who have proven themselves may enter."

**NOTE**: Permission checks occur *before* lock checks. A player who doesn't meet permission requirements cannot even attempt to pick or bash the door.

---

## Phased Development Plan

This implementation is broken into small, focused phases to minimize context window usage and keep code reviews manageable. Each phase should be completable in a single session and results in a testable increment.

---

### Phase 1: Database Schema & Enums ✓ COMPLETE

**Goal**: Establish the data foundation for doors.

**Tasks**:
- [x] Create `DoorType` enum in shared package (OPEN_PASSAGEWAY, PHYSICAL, SPECIAL, TRIGGERED_PASSAGEWAY, TEMPORARY_PORTAL)
- [x] Create `DoorState` enum in shared package (OPEN, CLOSED, LOCKED)
- [x] Create `doors` table migration with core fields:
  - `id`, `name`, `door_type`, `description`
  - `entry_room_id`, `entry_direction`, `exit_room_id`, `exit_direction`
  - `default_state` (for physical doors)
  - `is_hidden` (doesn't appear on obvious exits)
  - `trigger_text` (text to activate/pass through)
  - `passage_message_self`, `passage_message_room`
  - `item_display_name` (for special doors on "Also here:" line)
- [x] Create `Door` interface in shared package
- [x] Create `DoorData` interface for client-side data

**Files Changed**: 3 files
- `packages/shared/src/doors.ts` (NEW)
- `packages/shared/src/index.ts` (MODIFIED - added export)
- `packages/server/src/db/schema.sql` (MODIFIED - added doors table + indexes)

**Acceptance**: ✓ Migration runs successfully, types compile

---

### Phase 2: Door Repository & Room Integration

**Goal**: Load doors with rooms and display them.

**Tasks**:
- [ ] Create `doorRepository.ts` with basic CRUD operations
- [ ] Modify `roomRepository.ts` to join and include doors when loading rooms
- [ ] Update `RoomData` interface to include doors array
- [ ] Modify room display logic to show doors on "Obvious exits" line (physical doors show state: "north (closed)")

**Files Changed**: ~3-4 files
**Acceptance**: Rooms load with door data, physical doors show on exits line with state

---

### Phase 3: Physical Doors - Open/Close Commands

**Goal**: Players can open and close doors.

**Tasks**:
- [ ] Add `open <direction>` command handler
- [ ] Add `close <direction>` command handler
- [ ] Update door state in memory when opened/closed
- [ ] Broadcast state change to both rooms connected by the door
- [ ] Block movement through closed doors with "bump" message

**Files Changed**: ~2-3 files
**Acceptance**: Player can open door, walk through, close it. Other players see state changes.

---

### Phase 4: Auto-Close Timer ✓ COMPLETE

**Goal**: Doors automatically close after a period of time.

**Tasks**:
- [x] Add `auto_close_seconds` column to doors table (nullable, default 120)
- [x] Create door timer service to track open doors
- [x] When door opens, register timer
- [x] When timer expires, close door and broadcast to room
- [x] Cancel timer if door is manually closed

**Files Changed**: 5 files
- `packages/server/src/db/schema.sql` (MODIFIED - added auto_close_seconds column)
- `packages/shared/src/doors.ts` (MODIFIED - added autoCloseSeconds to Door interface)
- `packages/server/src/db/repositories/doorRepository.ts` (MODIFIED - added autoCloseSeconds handling)
- `packages/server/src/services/doorStateManager.ts` (MODIFIED - added timer system)
- `packages/server/src/game/socket.ts` (MODIFIED - pass broadcast callback to doorStateManager)

**Acceptance**: ✓ Open a door, wait for configured time (default 2 minutes), door closes automatically with room message

---

### Phase 5: Door Locks - Basic Locking ✓ COMPLETE

**Goal**: Doors can be locked and unlocked.

**Tasks**:
- [x] Add lock columns to doors table:
  - `has_lock` (boolean)
  - `key_item_tag` (string, matches item tag)
  - `auto_lock_seconds` (nullable)
- [x] Add `unlock <direction>` command - checks for key in inventory
- [x] Add `lock <direction>` command - checks for key in inventory
- [x] Modify auto-close to auto-lock for locked doors
- [x] Update "bump" message for locked vs just closed doors

**Files Changed**: 6 files
- `packages/server/src/db/schema.sql` (MODIFIED - added lock columns)
- `packages/shared/src/doors.ts` (MODIFIED - added hasLock, keyItemTag, autoLockSeconds to Door interface)
- `packages/shared/src/items.ts` (MODIFIED - added key_tag to ItemFlags interface)
- `packages/server/src/db/repositories/doorRepository.ts` (MODIFIED - added lock field handling)
- `packages/server/src/services/doorStateManager.ts` (MODIFIED - added lockDoor, unlockDoor, auto-lock logic)
- `packages/server/src/game/commands.ts` (MODIFIED - added lock/unlock commands)

**Acceptance**: ✓ Door with lock requires key to unlock. Auto-relocks after timer expires.

---

### Phase 6: Lock Mechanics - Pick & Bash ✓ COMPLETE

**Goal**: Alternative ways to bypass locks.

#### Lockpicking Mechanics

**Requirements:**
- Player must have the "lockpicking" ability (class/skill requirement)
- Player's lockpicking stat is calculated from multiple sources:
  - Base stats: Intellect, Dexterity
  - Character level
  - Race or class lockpicking bonuses
  - Equipment bonuses
  - Quest completion bonuses

**Success Formula:**
```
roll = random(0-100)
if roll == 0:
    automatic failure (fumble)
else:
    total = roll + player_lockpicking_stat
    if total >= lock_difficulty:
        success
    else:
        failure
```

**Difficulty Guidelines:**
- Easy lock: 50-75
- Medium lock: 76-125
- Hard lock: 126-200
- Very hard lock: 201-350
- Impossible (unpickable): 500+ (ensures no player can ever pick it)

**Future Enhancement:** Lockpick items that:
- Provide bonus to lockpicking ability
- Have a chance to break on use
- Better quality picks = more expensive, higher bonus, lower break chance

#### Bash Mechanics

**Requirements:**
- Player's bash ability calculated from strength and possibly other factors

**Success Formula:**
- Similar roll-based system comparing bash stat vs door bash_difficulty

**Failure Consequences:**
- Failed bash attempts deal damage to the player
- Damage: Random 1-2% of player's max HP
- This represents injury from slamming into a solid door

**Tasks**:
- [x] Add columns: `pick_difficulty` (INTEGER, 0-500+), `bash_difficulty` (INTEGER, 0-500+)
- [x] Add `pick <direction>` command with lockpicking skill check
- [x] Add `bash <direction>` command with strength-based check
- [x] Implement lockpicking ability check (player must have ability)
- [x] Failed pick/bash attempts broadcast to room
- [x] Failed bash attempts deal 1-2% max HP damage to player
- [x] Successful pick/bash opens door (starts auto-close/lock timer)
- [x] Handle roll of 0 as automatic failure for picking

**Files Changed**: 4 files
- `packages/server/src/db/schema.sql` (add pick_difficulty, bash_difficulty columns)
- `packages/server/src/db/migrate.ts` (add ALTER TABLE for existing databases)
- `packages/shared/src/doors.ts` (add pickDifficulty, bashDifficulty to Door interface)
- `packages/server/src/db/repositories/doorRepository.ts` (handle new fields)
- `packages/server/src/game/commands.ts` (add pick/bash command handlers)

**Acceptance**: ✓ All criteria met
- Player with lockpicking ability can attempt to pick locks
- Pick success based on roll + lockpicking stat vs difficulty
- Roll of 0 always fails (fumble)
- Player can bash doors, taking damage on failure
- Both actions broadcast to room
- Successful pick/bash opens door and starts auto-close/lock timer

---

### Phase 7: Special Doors ✓ COMPLETE

**Goal**: Doors that appear as items and use text triggers.

**Tasks**:
- [x] Add `item_display_name` column (how it appears on "Also here" line) - Already in schema from Phase 1
- [x] Modify room display to show special doors on "Also here" line
- [x] Implement text trigger parsing for special doors (e.g., "go portal", "climb rope")
- [x] Add `look <door>` support to view door description
- [x] Ensure special doors don't appear on "Obvious exits"

**Display Order**: Special doors always appear **first** in the "Also here:" line, before other players. This ensures consistent, predictable display order.

**Files Changed**: 3 files
- `packages/server/src/services/doorStateManager.ts` (MODIFIED - added findSpecialDoorByTrigger, findSpecialDoorByDisplayName)
- `packages/server/src/game/commands.ts` (MODIFIED - added handleSpecialDoorTrigger, handleLookAtSpecialDoor, trigger text handling)
- `packages/server/src/game/world.ts` (existing code already handles special door display order correctly)

**Acceptance**: ✓ All criteria met
- Special door shows on "Also here:" line with itemDisplayName
- Special doors appear first before players in "Also here:" line
- Player types trigger text (e.g., "go portal") and passes through
- Custom passage messages shown to player and room
- Player can look at special doors to see description
- Special doors do not appear on "Obvious exits" line

---

### Phase 8: Triggered Passageways ✓ COMPLETE

**Goal**: Hidden exits activated by text.

**Tasks**:
- [x] Ensure `is_hidden` flag works (door not shown anywhere)
- [x] Implement trigger text parsing for hidden passages
- [x] Display custom passage messages (self and room)
- [x] Triggered passageways work like normal exits once triggered

**Files Changed**: 1 file
- `packages/server/src/game/world.ts` (MODIFIED - exclude TRIGGERED_PASSAGEWAY from obvious exits)

**Note**: Most Phase 8 functionality was already implemented in Phase 7:
- `findSpecialDoorByTrigger()` in doorStateManager.ts handles TRIGGERED_PASSAGEWAY
- `handleSpecialDoorTrigger()` in commands.ts handles passage with custom messages
- `canPassThrough()` in doorStateManager.ts allows triggered passageways

**Acceptance**: ✓ All criteria met
- Hidden passage not visible on "Obvious exits" or "Also here:" lines
- Player types trigger text and passes through
- Custom passage messages displayed to player and room

---

### Phase 9: Temporary Portals ✓ COMPLETE

**Goal**: Doors that appear temporarily when triggered.

**Tasks**:
- [x] Add columns: `is_temporary`, `spawn_trigger_text`, `duration_seconds`
- [x] Add portal spawn tracking (in-memory map of active portals)
- [x] When spawn trigger spoken, portal appears and timer starts
- [x] Portal shows on "Also here" line while active
- [x] When timer expires, portal disappears with room broadcast
- [x] Inactive portals cannot be used

**Files Changed**: 7 files
- `packages/server/src/db/schema.sql` (MODIFIED - added is_temporary, spawn_trigger_text, duration_seconds, appear_message, disappear_message columns)
- `packages/shared/src/doors.ts` (MODIFIED - added isTemporary, spawnTriggerText, durationSeconds, appearMessage, disappearMessage to Door interface)
- `packages/server/src/db/repositories/doorRepository.ts` (MODIFIED - added new field handling in DbDoor, dbToDoor, CreateDoorInput, createDoor, updateDoor)
- `packages/server/src/db/migrate.ts` (MODIFIED - added ALTER TABLE for existing databases)
- `packages/server/src/services/doorStateManager.ts` (MODIFIED - added activePortals map, portalExpirationTimers, isPortalActive, spawnPortal, despawnPortal, findPortalBySpawnTrigger, updated canPassThrough/findSpecialDoorByTrigger/findSpecialDoorByDisplayName for portal active checks, portal cleanup on door delete)
- `packages/server/src/game/commands.ts` (MODIFIED - added handlePortalSpawn function, spawn trigger check in processCommand)
- `packages/server/src/game/world.ts` (MODIFIED - updated formatRoomDescription to only show active temporary portals)

**Acceptance**: ✓ All criteria met
- Player speaks spawn trigger text (e.g., "Valar Morghulis")
- Portal appears in room with broadcast message (custom or default)
- Portal shows on "Also here:" line while active
- Player can use trigger text (e.g., "go portal") to pass through
- Player can look at active portal to see description
- Inactive portals are not visible and cannot be used
- Portal vanishes after duration_seconds with room broadcast (custom or default)
- Custom appear_message and disappear_message supported for thematic portals

---

### Phase 10: Permission System ✓ COMPLETE

**Goal**: Restrict door access based on player attributes.

**Tasks**:
- [x] Add columns: `required_level`, `required_classes`, `required_quest_flag`, `required_item_tag`, `denial_message`
- [x] Create permission check function
- [x] Apply permission check before any door interaction (open, close, unlock, lock, pick, bash, pass through, portal spawn)
- [x] Display denial message on failed permission check

**Files Changed**: 6 files
- `packages/server/src/db/schema.sql` (MODIFIED - added permission columns)
- `packages/shared/src/doors.ts` (MODIFIED - added requiredLevel, requiredClasses, requiredQuestFlag, requiredItemTag, denialMessage to Door interface)
- `packages/server/src/db/repositories/doorRepository.ts` (MODIFIED - added DbDoor fields, dbToDoor mapping, CreateDoorInput fields, createDoor/updateDoor handling)
- `packages/server/src/db/migrate.ts` (MODIFIED - added ALTER TABLE for existing databases)
- `packages/server/src/services/doorStateManager.ts` (MODIFIED - added PermissionCheckCharacter interface, PermissionCheckResult interface, checkDoorPermissions function, doorHasPermissionRequirements helper)
- `packages/server/src/game/commands.ts` (MODIFIED - added playerHasItemWithTag, checkDoorPermissionsForPlayer, permission checks in handleMove, handleDoorAction, handleUnlockDoor, handleLockDoor, handlePickDoor, handleBashDoor, handleSpecialDoorTrigger, handlePortalSpawn)

**Acceptance**: ✓ All criteria met
- Doors can have level requirements (requiredLevel)
- Doors can have class restrictions (requiredClasses array)
- Doors can have quest flag requirements (requiredQuestFlag - placeholder for future quest system)
- Doors can have item requirements (requiredItemTag - uses key_tag field)
- Custom denial messages supported (denialMessage)
- Permission checks occur BEFORE lock checks per design doc
- Players who don't meet requirements cannot even attempt to pick or bash

---

### Phase 11: Door Editor Integration ✓ COMPLETE

**Goal**: Builders can create and edit doors.

**Tasks**:
- [x] Design door editor UI (standalone page following existing editor patterns)
- [x] Implement door CRUD API endpoints
- [x] Build editor form with all door attributes
- [x] Add door linking UI (select entry/exit rooms with area grouping)
- [x] Add tab-based interface with type-specific sections
- [x] Add connection preview diagram
- [x] Add Door Editor link to Developer menu across all pages

**Files Changed**: 16 files
- `packages/server/src/routes/doors.ts` (NEW - CRUD API endpoints with validation)
- `packages/server/src/index.ts` (MODIFIED - registered door routes)
- `packages/client/door-editor.html` (NEW - editor HTML with tabbed form)
- `packages/client/src/door-editor.css` (NEW - editor-specific styles)
- `packages/client/src/door-editor.ts` (NEW - editor TypeScript logic)
- `packages/client/vite.config.ts` (MODIFIED - added door-editor entry point)
- `packages/client/index.html` (MODIFIED - added Door Editor to nav menus)
- `packages/client/editor.html` (MODIFIED - added Door Editor to nav)
- `packages/client/item-editor.html` (MODIFIED - added Door Editor to nav)
- `packages/client/spell-editor.html` (MODIFIED - added Door Editor to nav)
- `packages/client/status-editor.html` (MODIFIED - added Door Editor to nav)
- `packages/client/progression-editor.html` (MODIFIED - added Door Editor to nav)
- `packages/client/swing-calculator.html` (MODIFIED - added Door Editor to nav)
- `packages/client/admin.html` (MODIFIED - added Door Editor to nav)
- `packages/client/game-settings-editor.html` (MODIFIED - added Door Editor to nav)
- `packages/client/user-editor.html` (MODIFIED - added Door Editor to nav)

**Acceptance**: ✓ All criteria met
- Builder can create all door types through the editor
- Type-specific tabs show/hide based on door type selection
- Room dropdowns populated from API with area grouping
- Connection diagram shows entry/exit room relationship
- Full CRUD operations (create, read, update, delete, duplicate)
- Filter by door type and search by name/description
- Door Editor accessible from Developer menu on all pages

---

## Phase Dependencies

```
Phase 1 (Schema)
    │
    v
Phase 2 (Repository/Room Integration)
    │
    ├──────────────────────┬─────────────────────┐
    v                      v                     v
Phase 3 (Open/Close)    Phase 7 (Special)    Phase 8 (Triggered)
    │                      │                     │
    v                      v                     v
Phase 4 (Auto-Close)    Phase 9 (Temp Portals)  │
    │                      │                     │
    v                      └──────────┬──────────┘
Phase 5 (Locks)                       │
    │                                 │
    v                                 │
Phase 6 (Pick/Bash)                   │
    │                                 │
    └──────────────┬──────────────────┘
                   v
            Phase 10 (Permissions)
                   │
                   v
            Phase 11 (Editor)
```

**Note**: Phases 3-6 (physical doors) and Phases 7-9 (special/triggered doors) can be developed in parallel by different developers if desired.

