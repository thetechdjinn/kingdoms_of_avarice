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

### Phase 5: Door Locks - Basic Locking

**Goal**: Doors can be locked and unlocked.

**Tasks**:
- [ ] Add lock columns to doors table:
  - `has_lock` (boolean)
  - `key_item_tag` (string, matches item tag)
  - `auto_lock_seconds` (nullable)
- [ ] Add `unlock <direction>` command - checks for key in inventory
- [ ] Add `lock <direction>` command - checks for key in inventory
- [ ] Modify auto-close to auto-lock for locked doors
- [ ] Update "bump" message for locked vs just closed doors

**Files Changed**: ~2-3 files
**Acceptance**: Door with lock requires key to unlock. Auto-relocks after timer.

---

### Phase 6: Lock Mechanics - Pick & Bash

**Goal**: Alternative ways to bypass locks.

**Tasks**:
- [ ] Add columns: `pick_difficulty` (0-100, 100=unpickable), `bash_difficulty` (0-100, 100=unbashable)
- [ ] Add `pick <direction>` command with skill check
- [ ] Add `bash <direction>` command with strength/skill check
- [ ] Failed pick/bash attempts broadcast to room
- [ ] Successful pick/bash opens door (starts auto-close/lock timer)

**Files Changed**: ~2-3 files
**Acceptance**: Thief can pick locks, warrior can bash doors (based on difficulty settings)

---

### Phase 7: Special Doors

**Goal**: Doors that appear as items and use text triggers.

**Tasks**:
- [ ] Add `item_display_name` column (how it appears on "Also here" line)
- [ ] Modify room display to show special doors on "Also here" line
- [ ] Implement text trigger parsing for special doors (e.g., "go portal", "climb rope")
- [ ] Add `look <door>` support to view door description
- [ ] Ensure special doors don't appear on "Obvious exits"

**Files Changed**: ~3-4 files
**Acceptance**: Special door shows as item, player types trigger text, passes through

---

### Phase 8: Triggered Passageways

**Goal**: Hidden exits activated by text.

**Tasks**:
- [ ] Ensure `is_hidden` flag works (door not shown anywhere)
- [ ] Implement trigger text parsing for hidden passages
- [ ] Display custom passage messages (self and room)
- [ ] Triggered passageways work like normal exits once triggered

**Files Changed**: ~2 files
**Acceptance**: Hidden passage not visible, player types trigger, passes through with custom message

---

### Phase 9: Temporary Portals

**Goal**: Doors that appear temporarily when triggered.

**Tasks**:
- [ ] Add columns: `is_temporary`, `spawn_trigger_text`, `duration_seconds`
- [ ] Add portal spawn tracking (in-memory map of active portals)
- [ ] When spawn trigger spoken, portal appears and timer starts
- [ ] Portal shows on "Also here" line while active
- [ ] When timer expires, portal disappears with room broadcast
- [ ] Inactive portals cannot be used

**Files Changed**: ~3-4 files
**Acceptance**: Player speaks trigger, portal appears, usable for X seconds, then vanishes

---

### Phase 10: Permission System

**Goal**: Restrict door access based on player attributes.

**Tasks**:
- [ ] Add columns: `required_level`, `required_class`, `required_quest_flag`, `required_item_tag`, `denial_message`
- [ ] Create permission check function
- [ ] Apply permission check before any door interaction (open, pick, bash, pass through)
- [ ] Display denial message on failed permission check

**Files Changed**: ~2-3 files
**Acceptance**: Door with level requirement blocks low-level players with custom message

---

### Phase 11: Door Editor Integration

**Goal**: Builders can create and edit doors.

**Tasks**:
- [ ] Design door editor UI (standalone or room editor extension - TBD)
- [ ] Implement door CRUD API endpoints
- [ ] Build editor form with all door attributes
- [ ] Add door linking UI (select entry/exit rooms)
- [ ] Test full door creation workflow

**Files Changed**: ~4-6 files
**Acceptance**: Builder can create all door types through the editor

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

