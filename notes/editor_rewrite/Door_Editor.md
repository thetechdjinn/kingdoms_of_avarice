# Door Editor

This is the design document for the rewrite of the Door Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Layout

Three-panel: door list (left, 280px), tabbed form (center, max-width 800px), preview
with connection diagram (right, 300px).

## Door List Panel

Status: Good filtering, room dropdown scaling issue.

View toggle between "Doors" and "Room Exits". Filters: area dropdown, room dropdown,
type dropdown, search input. Shows door count.

### View Toggle (Doors / Room Exits)

Status: Good

> **Claude:** The Room Exits view is a smart feature. It shows all exits in the game and
> whether they have doors, with a quick "+ Door" button to create one. This is often a
> better workflow than creating doors from scratch. No changes needed.

### Area Filter

Status: Good. Dynamically populated from room data.

### Room Filter

Status: Scaling issue.

Dropdown populated with all rooms, filtered by selected area.

> **Claude:** Same scaling issue as the Room Editor's exit target dropdown. With 250+
> rooms per area, this dropdown becomes unwieldy. Replace with SearchableSelect. The
> area filter helps narrow it down, but within an area you're still scrolling.

### Type Filter

Status: Good. 5 hardcoded door types.

> **Claude:** Door types are fundamental and unlikely to change. Hardcoding is fine here.

### Search

Status: Good. Filters by name or description.

## Basic Tab

### Door Name

Status: Good

Internal name for editor use. Text input, required.

> **Claude:** Hint says "internal, for editors" which is clear. No changes needed.

### Door Type

Status: Good

Dropdown: open_passageway, physical, special, triggered_passageway, temporary_portal.
Changing the type shows/hides relevant tabs.

> **Claude:** The type-driven tab visibility is well implemented. The mapping is:
> - open_passageway: Basic, Rooms only
> - physical: Basic, Rooms, State, Locks, Permissions
> - special: Basic, Rooms, Triggers, Permissions
> - triggered_passageway: Basic, Rooms, Triggers, Permissions
> - temporary_portal: Basic, Rooms, Triggers, Portal, Permissions
>
> Same suggestion as Item/Spell editors: show the active door type in the tab area
> or as a header so you know what type you're editing without switching back to Basic.

### Display Name

Status: Good

Optional. Shown to players. Blank defaults to "door to the [direction]".

> **Claude:** Good auto-default behavior. Hint could mention the default:
> "Leave blank to use 'door to the [direction]' automatically."

### Description

Status: Good. Textarea, 3 rows.

### Hidden Checkbox

Status: Good. Hides door from exit listing.

## Rooms Tab

### Entry Room / Exit Room

Status: **Critical scaling issue.**

Two room select dropdowns populated with ALL rooms, formatted as "[Area] Name (#id)".
Sorted by area then name.

> **Claude:** This is the same critical issue as the Room Editor exit target and the
> Room Filter above. With 600+ rooms, both dropdowns are unusable. Replace with
> SearchableSelect. This is the Door Editor's #1 priority fix.
>
> The sorting by area-then-name is good and should be preserved in the SearchableSelect
> (group results by area).

### Entry Direction / Exit Direction

Status: Good. 10-direction dropdown (N/S/E/W/Up/Down/NE/NW/SE/SW).

> **Claude:** Exit direction can be empty for one-way doors. This is clearly indicated
> with "(leave empty for one-way)" hint. Good UX.

## State Tab (Physical doors only)

### Default State

Status: Good. Dropdown: open, closed, locked.

### Auto-Reset Seconds

Status: Good. Number input, 0 = no auto-reset.

> **Claude:** Good for doors that should re-lock after a time. Hint could mention
> common values: "e.g., 300 = 5 minutes, 0 = never resets."

## Locks Tab (Physical doors only)

### Has Lock Checkbox

Status: Good. Toggles visibility of lock options below.

### Key Item Tag

Status: Needs improvement.

Freeform text that must match an item's key_tag exactly.

> **Claude:** Replace freeform text with a SearchableSelect dropdown filtered to items
> that have a `key_tag` set (item type "key" or any item with `flags.key_tag`). Show
> item name + key tag value so the developer can see both. This eliminates typos and
> makes it discoverable — you can see all available keys in the game. A typo in the
> current text field means the key silently won't work with no indication of why.

### Pick Difficulty Min / Max

Status: Good

> **Claude:** The hint text is helpful: "Skill below min = auto-fail, skill at/above
> max = auto-success. 500+ = unpickable." The code auto-swaps min/max if entered
> backwards, which is a nice touch.
>
> `[PROPOSED]` Add preset quick-fill buttons for common difficulty ranges:
> - Easy Lock (30-60 pick, 100 bash)
> - Standard Lock (60-100 pick, 200 bash)
> - Hard Lock (100-150 pick, 300 bash)
> - Master Lock (150-250 pick, 400 bash)
> - Unpickable (500+, 500+)
>
> These fill in the values as a starting point — the number fields remain fully
> editable so the developer can adjust after selecting a preset.

### Bash Difficulty

Status: Good. Number input, 500+ = unbashable.

## Triggers Tab (Special, Triggered Passageway, Temporary Portal)

### Trigger Text

Status: Good

What the player types to use the passage (e.g., "go portal", "climb rope").

### Passage Message (Self) / (Room)

Status: Good

Self message and room message with {player} placeholder for room message.

### Item Display Name

Status: Good. Only shown for special/temporary_portal.

Shown in "Also here:" room listing. Lets the passage appear as an interactable object.

## Portal Tab (Temporary Portal only)

### Spawn Trigger Text

Status: Good. What a player says to create the portal.

### Duration

Status: Good. Seconds the portal exists, default 60.

### Appear / Disappear Messages

Status: Good. Room messages when portal spawns and despawns.

## Permissions Tab (All types except Open Passageway)

### Min Level / Max Level

Status: Good. 0 = no restriction.

> **Claude:** Validation exists: max must be >= min. Good.

### Required Classes

Status: Needs improvement.

Comma-separated text field.

> **Claude:** Same issue everywhere. Replace with dynamic toggle buttons from class
> API, same pattern as Spell Editor and Progression Editor. Selected classes show as
> highlighted buttons.

### Required Quest Flag

Status: Good

Text field matching a quest's flag value. This is a string reference.

> **Claude:** Could use autocomplete from existing quest flags, but quest flags are
> simple strings and there aren't many. Low priority.

### Required Item Tag

Status: Good

Item tag required to pass (not consumed). Text field.

> **Claude:** Same autocomplete concern as Key Item Tag above. Could populate from
> known item tags. Low priority.

### Denial Message

Status: Good. Custom message when permission check fails.

## Preview Panel

Status: Good

Shows door name, type badge (color-coded per type), description, properties, and a
connection diagram showing entry room → direction → exit room.

> **Claude:** The connection diagram is a nice visual that no other editor has. It
> clearly shows the spatial relationship. The type-specific color coding (green for
> open passageway, brown for physical, purple for special, teal for triggered, salmon
> for portal) helps identify door types at a glance. No changes needed.

## Creation Flow

Status: Needs improvement.

"+ New Door" uses prompt() for the name. Creates as physical door with first room and
north direction as defaults.

"+ Door" from Room Exits view also uses prompt() but pre-fills a better default name
and auto-sets entry/exit rooms and directions including reverse direction.

> **Claude:** The Room Exits creation flow is actually good — it has context (knows
> which rooms and directions). The standalone "+ New Door" is weaker since it defaults
> to arbitrary values.
>
> Both currently use `window.prompt()` — the browser's plain built-in dialog box that
> pops up asking for text input. It can't be styled, has no validation feedback, and
> feels dated. Replace with a styled modal or inline form within the editor. The Room
> Exits variant should pre-fill the room/direction fields in the modal.

## Duplicate

Status: Good. Prompts for new name, copies all form data.

## Import/Export

Status: **Missing.**

> **Claude:** No import/export functionality. Add for consistency with other editors.
> Doors are structural data that should be exportable for backup and environment
> migration.

## Missing Features

> **Claude:**
>
> - `[PROPOSED]` Lock difficulty presets (Easy/Standard/Hard/Master/Unpickable) as
>   quick-fill buttons. See Locks tab section above.
>> - `[PROPOSED]` Show which keys fit this door (reverse lookup from items with matching
>   key_tag). Useful for verifying a key exists before setting a lock.
> - `[PROPOSED]` Required Item Tag (in Permissions tab) should use the same key item
>   SearchableSelect or at minimum autocomplete from known item tags.

## Help Section

> **Claude:** Help documentation should cover:
> - **How to create manhole-style one-way triggered doors:** A common pattern is a
>   triggered passageway in one direction (e.g., "go manhole" drops you into the sewer)
>   but the return path is a normal passage with no door. To set this up: create a
>   triggered_passageway door, set the entry room and direction, leave the exit room
>   empty (one-way), set the trigger text (e.g., "go manhole"). The exit from the sewer
>   back up uses a normal room exit with no door attached. This creates the asymmetric
>   "special entrance, normal exit" pattern used for manholes, secret passages, and
>   trap doors.
>
> Additional help topics:
> - What each door type does and when to use it
>   - open_passageway: always open, no interactions
>   - physical: standard door with state (open/closed/locked), locks, bash
>   - special: hidden passage activated by trigger text
>   - triggered_passageway: like special but with manhole-style entrance
>   - temporary_portal: player-created portal with duration
> - How lock difficulty ranges work (min/max, auto-fail/auto-success thresholds)
> - How key tags connect items to doors
> - How trigger text works (what the player types)
> - How passage messages are displayed (self vs room, {player} placeholder)
> - How permissions layer (level, class, quest, item checks)
> - How auto-reset works on physical doors
> - How one-way doors work (empty exit room/direction)
> - How temporary portals spawn and despawn
