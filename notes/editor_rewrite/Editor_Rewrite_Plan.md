# Editor Rewrite Plan

This plan covers a comprehensive editor overhaul: removing dead features, upgrading Express,
redesigning editor UIs for quality and scalability, and fixing navigation so editors don't
kick players out of the game.

We will use the frontend-design skill, Figma MCP, and other design tools to ensure the
editors are production-quality, not just functional. Each editor will be reviewed individually
and redesigned as needed.

---

## Phase 1: Remove Dead Progression Features (Abilities, Talents, Events)

These three systems were built speculatively and have zero gameplay integration. No player
can learn abilities, unlock talents, or trigger events. The data exists in the DB and is
editable in the progression editor, but nothing reads it during gameplay.

### 1A: Remove Events

**Database:**
- Drop `game_events` table
- Drop `character_activity_tracker` table
- Remove from `schema_progression.sql`
- Migration to drop tables

**Server:**
- `progressionRepository.ts` - Remove: `getGameEventById()`, `getAllGameEvents()`,
  `createGameEvent()`, `updateGameEvent()`, `deleteGameEvent()`
- `progression.ts` - Remove: `processGameEvent()`, `registerGameEvent()`, event registration
  in loader
- `routes/progression.ts` - Remove all `/api/progression/events/*` endpoints
- Remove `data/game_events.json` seed data
- Remove event export/import from data export system

**Client:**
- `progression-editor.ts` - Remove Events tab logic
- `progression-editor.html` - Remove Events tab and panel

### 1B: Remove Abilities

**Database:**
- Drop `ability_definitions` table
- Drop `class_abilities` table
- Remove `learned_abilities` column from `character_progression`
- Remove from `schema_progression.sql`
- Migration to drop tables/columns

**Server:**
- `progressionRepository.ts` - Remove: `getAbilityById()`, `getAllAbilities()`,
  `getAbilitiesByType()`, `createAbility()`, `updateAbility()`, `deleteAbility()`,
  `getClassAbilities()`, `addClassAbility()`, `removeClassAbility()`
- `routes/progression.ts` - Remove all `/api/progression/abilities/*` endpoints
- Remove `data/abilities.json` seed data
- Remove ability export/import from data export system

**Client:**
- `progression-editor.ts` - Remove Abilities tab logic
- `progression-editor.html` - Remove Abilities tab and panel

### 1C: Remove Talents

**Database:**
- Drop `talent_definitions` table
- Remove `unlocked_talents` column from `character_progression`
- Remove from `schema_progression.sql`
- Migration to drop tables/columns

**Server:**
- `progressionRepository.ts` - Remove: `getTalentById()`, `getAllTalents()`,
  `getTalentsByClass()`, `createTalent()`, `updateTalent()`, `deleteTalent()`
- `routes/progression.ts` - Remove all `/api/progression/talents/*` endpoints
- Remove `data/talents.json` seed data
- Remove talent export/import from data export system

**Client:**
- `progression-editor.ts` - Remove Talents tab logic
- `progression-editor.html` - Remove Talents tab and panel

### 1D: Clean Up Shared Types

- Remove ability, talent, and event type definitions from `packages/shared/src/types.ts`
- Remove any related enums (AbilityType, etc.)

**After Phase 1, the progression editor has only two tabs: Classes and Races.**

---

## Phase 2: Express 5 Migration

Bundled here since we are already touching all route files and editors. The codebase uses
zero deprecated Express 4 patterns, so this is a version bump plus type updates.

### 2A: Package Updates

- Update `packages/server/package.json`: `express` from `^4.18.2` to `^5.1.0`
- Update `@types/express` to v5-compatible version
- Check `cookie-parser` compatibility with Express 5
- Run `npm install`

### 2B: Verify and Fix

- Express 5 returns promises from `res.render()` and route handlers; verify async handlers
  don't need adjustment (current code uses `async (req, res)` everywhere, should be fine)
- Express 5 changes path matching slightly (no more optional regex groups); verify all 154
  routes still match correctly
- Test all API endpoints via editors
- Test WebSocket upgrade (uses raw HTTP server, not Express routing, so should be unaffected)

### 2C: Update CLAUDE.md

- Update any Express version references in project documentation

---

## Phase 3: Editor Navigation Fix (Open in New Window)

Currently, clicking an editor link from the game navigates away from the game tab, which
closes the WebSocket and disconnects the player. Editors should open in a new window/tab
so the player stays in-game while editing.

### 3A: Editor Links Open in New Tab

- Add `target="_blank"` to all editor links in the game's nav bar (`index.html`)
- Add `target="_blank"` to editor links in `hub.html` nav dropdown (Developer Tools)
- Editors already share auth via httpOnly JWT cookie, so no session changes needed

### 3B: Editor Nav Bar Adjustments

- Editor nav bars currently have a "Game" link pointing to `/` which would navigate away
- Change the "Game" link in editor nav bars to also open in a new tab, or remove it entirely
  since the game is already running in another tab
- Cross-editor links (e.g., Room Editor linking to Item Editor) should stay in the same
  editor tab (no `target="_blank"` for editor-to-editor navigation)

### 3C: Verify No Side Effects

- Confirm WebSocket stays alive when new tab opens (it will, since the game tab is untouched)
- Confirm multiple editor tabs can coexist without conflicts (they should, since editors use
  independent REST API calls with no shared client-side state)

---

## Phase 4: Editor UI Audit and Redesign

Go through every editor individually. For each one, review the current layout, identify
UX problems, and redesign using the frontend-design skill and Figma MCP for mockups.
The goal is production-quality editor UIs, not just functional forms.

**IMPORTANT:** No editor implementation begins until its layout and UI have been designed
using the frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups
must be produced and reviewed for each editor before any code is written.

### Editors to Review

Each editor below needs individual assessment. We will evaluate them one at a time and
document specific redesign decisions per editor before implementation.

**Current editor list:**

| Editor | File | Current State | Notes |
|--------|------|---------------|-------|
| Room Editor | editor.html/ts | Three-panel (list, form, preview) | Largest editor, most complex |
| Item Editor | item-editor.html/ts | Three-panel | Many item types with different fields |
| NPC Editor | npc-editor.html/ts | Three-panel, 7 tabs | Most tabs of any editor |
| Spell Editor | spell-editor.html/ts | Three-panel | Moderate complexity |
| Status Effect Editor | status-editor.html/ts | Three-panel | Moderate complexity |
| Progression Editor | progression-editor.html/ts | Multi-section | Classes and Races only after Phase 1 |
| Door Editor | door-editor.html/ts | Three-panel | Room selection scaling issue |
| Action Editor | action-editor.html/ts | Three-panel | Social actions, relatively simple |
| Drop Table Editor | drop-table-editor.html/ts | Three-panel, 2 tabs | Has drop simulation feature |
| Faction Editor | faction-editor.html/ts | Three-panel | Relatively simple |
| Quest Editor | quest-editor.html/ts | Three-panel | Quest steps, triggers, rewards |
| Admin Panel | admin.html/ts | Tabbed (Users, IP, Settings) | Not a game data editor |
| Hub Page | index.html | Landing page | Navigation entry point |

### Per-Editor Review Process

For each editor:
1. Read the current HTML/TS/CSS to understand what it does
2. Identify UX issues (scaling dropdowns, layout problems, missing features)
3. Design improved layout using frontend-design skill / Figma MCP
4. Document the redesign decisions in this plan (add a subsection per editor)
5. Implement

### Cross-Cutting Concerns (Apply to All Editors)

These improvements apply across every editor and should be built as shared components:

**Searchable Select Component:**
- Build `packages/client/src/components/searchable-select.ts`
- Text input with filtered dropdown panel
- Client-side filtering for collections under ~500 items
- Optional API-backed search for larger collections (rooms, items)
- Keyboard navigation (arrow keys, enter, escape)
- Accessible (ARIA combobox pattern)
- No external dependencies (vanilla TypeScript)

**List Panel Filtering:**
- Every editor's left-side entity list needs a text filter input at the top
- Filter by name, ID, or type depending on the editor
- Simple client-side filtering on keyup (data already loaded)

**Consistent Design Language:**
- Shared CSS variables, spacing, typography across all editors
- Consistent button styles, form layouts, tab patterns
- Dark theme that matches the game's terminal aesthetic (or a clean light theme for editing)

---

## 4.1: Room Editor (editor.html/ts/css)

The largest and most complex editor. Three-panel layout: room list (left, 280px),
form (center, flex), map canvas (right, 350px).

### Current Features

- Room list panel with area filter dropdown
- Form: name, area (with datalist autocomplete), terrain dropdown, description textarea
- Collapsible sections: Training Room, Bank, Respawn Point settings
- Exits: list current exits, add exit with direction + area filter + target room select +
  two-way checkbox
- Doors: read-only list with links to door editor
- Map canvas: two modes (Room view shows immediate neighbors, Area view shows all rooms in
  area via BFS layout)
- Area management modal (rename areas)
- Toast notifications for save/error feedback
- Fresh data fetch on room selection (doesn't trust cache)

### What Works Well

- Clean API-driven architecture with proper state management
- Fresh data fetching on selection avoids stale form issues
- Collapsible sections keep complexity hidden until needed
- Bidirectional exit checkbox is intuitive
- Area datalist for room area field (type to create new areas)
- Map visualization is useful for spatial orientation
- Terminal-aesthetic dark theme fits the project

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` Replace exit target room `<select>` with SearchableSelect component.
  Currently renders ALL rooms as `<option>` elements. Will choke at 500+ rooms.
- `[PROPOSED]` Add search/filter input to room list panel. Currently must scroll the
  entire list to find a room. Filter by name or ID.
- `[PROPOSED]` Training class checkboxes need search/filter or multi-select component
  if class count grows beyond ~20.
- `[PROPOSED]` Respawn area checkboxes same issue as training classes at scale.
- `[PROPOSED]` Area filter dropdowns (room list + exit target) will need SearchableSelect
  at 50+ areas.

**UX Problems:**

- `[PROPOSED]` Replace `prompt()` dialogs with inline modals for "New Room" and "Rename
  Area". Browser prompts feel dated and can't be styled or validated.
- `[PROPOSED]` Two separate area filters (room list vs exit target) cause confusion. Consider
  linking them or making the distinction clearer visually.
- `[PROPOSED]` Door management is read-only here; must navigate to door editor for any
  changes. Consider inline door creation/editing or at minimum open door editor in a new
  tab (ties into Phase 3).
- `[PROPOSED]` Delete exit always sends `bidirectional=true`. Should offer the option to
  delete one-way, matching the "two-way" checkbox on creation.
- `[PROPOSED]` "New Room" should be an inline form at the top of the form panel instead of
  a prompt. Pre-fill area from current filter.

**Map Canvas:**

- `[PROPOSED]` Area view BFS layout overlaps nodes in complex graphs. Consider zoom/pan
  controls so users can navigate dense areas.
- `[PROPOSED]` Room name labels truncate at 10 characters. Hard to identify rooms in area
  view. Show full name on hover/tooltip.
- `[PROPOSED]` No click interaction on map nodes. Clicking a room on the map should select
  it in the editor.

**Missing Features:**

- `[PROPOSED]` Room duplication: copy a room's settings (area, terrain, features) to a new
  room. Useful for creating similar rooms in a district.
- `[PROPOSED]` Batch area assignment: select multiple rooms and change their area at once.
- `[PROPOSED]` Orphan detection: highlight rooms with no exits (disconnected from the world).
- `[PROPOSED]` Exit validation: warn if an exit direction already exists when adding a new
  exit in that direction.

**Deferred (probably not needed this pass):**

- `[DEFERRED]` Undo/redo stack. Nice to have but adds significant complexity.
- `[DEFERRED]` Room templates (save/load room configurations). Low priority until room
  creation volume justifies it.
- `[DEFERRED]` Collaborative editing / locking. Only needed with multiple simultaneous devs.
- `[DEFERRED]` Integrate ANSI map generator output into the editor. Currently a separate
  CLI tool.

---

## 4.2: Item Editor (item-editor.html/ts/css)

Three-panel layout: item list (left, 200px), tabbed form (center, flex), preview + spawn
panel (right, 300px).

### Current Features

- Item list with type filter dropdown and name search input
- 5-tab form: Basic, Type Data, Requirements, Modifiers, Flags
- Type-driven form sections: weapon, armor, container, consumable, light, tool, key, misc
  each show/hide relevant fields when item type changes
- Weapon tab includes attack verbs (hit/miss 1p/3p) and backstab modifiers
- Preview panel shows formatted item summary with denomination-converted value
- Spawn panel: spawn item into a room by ID + quantity
- Import/Export JSON with merge option
- Duplicate item function
- Sticky Save/Duplicate/Delete buttons at bottom of form

### What Works Well

- Type-driven visibility keeps form manageable across 8 item types
- Weapon verb customization (hit/miss messages) is unique and powerful
- Preview panel gives instant visual feedback
- Spawn-in-editor for quick testing
- Rarity + max-in-world system
- Comprehensive equipment slots (18 options)
- Search + type filter work well together

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` List panel re-renders all items on every keystroke. Add debounce or
  virtual scrolling for 500+ items.

**UX Problems:**

- `[PROPOSED]` Class/race requirement fields use comma-separated text. Replace with
  SearchableSelect multi-select (same component as Room Editor). Prevents typos like
  "warrior" vs "Warrior".
- `[PROPOSED]` "New Item" uses `prompt()`. Replace with inline creation form or modal.
- `[PROPOSED]` Room description vs short description vs long description guidance is vague.
  Add inline help text clarifying when each is shown in-game.
- `[PROPOSED]` Keyword field is freeform text. Consider tag-input component (type, press
  enter to add as chip, click X to remove).
- `[PROPOSED]` Spawn panel room ID is raw number input. Should use SearchableSelect for
  room selection.
- `[PROPOSED]` No unsaved changes warning. Easy to lose work by clicking another item.

**Missing Features:**

- `[PROPOSED]` Show which drop tables reference this item (reverse lookup). Helps devs
  understand where items come from.
- `[PROPOSED]` Show which merchants sell this item (reverse lookup from merchant inventory).

**Deferred:**

- `[DEFERRED]` Item set bonuses. Not needed until set mechanic is designed.
- `[DEFERRED]` Enchantment/affix system. Future feature, not for this pass.
- `[DEFERRED]` Item inheritance/templates. Low priority.

---

## 4.3: Spell Editor (spell-editor.html/ts/css)

Three-panel layout: spell list (left), tabbed form (center), preview (right, 300px).

### Current Features

- Spell list with type filter (offensive/healing/buff/debuff/utility) and search (name,
  mnemonic, description)
- 3-tab form: Basic, Effects, Requirements
- Type-driven sections: damage (offensive), healing (healing), status effects (buff/debuff)
- Damage/healing dice notation (e.g., "1d6+2") with stat scaling (percentage-based)
- Class restriction with quick-select buttons (6 hardcoded classes) + text field,
  bidirectionally synced
- Mnemonic field (2-10 chars, unique identifier for casting)
- Telegraph message with {name} placeholder
- Preview panel shows formatted spell summary
- Import/Export with merge, duplicate function

### What Works Well

- Quick-select class buttons are superior to comma-separated text
- Color-coded type badges (red/green/blue/purple/orange) in list
- Level-based sorting makes progression clear
- Bidirectional sync between buttons and text field is polished
- Mnemonic constraints (length, unique) prevent bad data
- Scaling formula clearly displayed in preview

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` List re-renders fully on every keystroke. Same debounce/virtual scrolling
  need as Item Editor at 300+ spells.

**UX Problems:**

- `[PROPOSED]` Scaling percentage field shows "50" meaning "50% bonus". Confusing. Add
  suffix label "%" or reword as "Scaling: 50% of [stat]".
- `[PROPOSED]` Status effect field is freeform text referencing effect IDs. Should be
  SearchableSelect populated from status effect definitions. Prevents referencing
  non-existent effects.
- `[PROPOSED]` Class quick-select buttons are hardcoded to 6 classes. Should be dynamically
  populated from the class definitions API.
- `[PROPOSED]` No spell uniqueness check for mnemonic on the client. Only the server
  rejects duplicates. Add client-side check.
- `[PROPOSED]` "New Spell" uses two prompts (name + mnemonic). Replace with inline form.

**Missing Features:**

- `[PROPOSED]` Show which NPCs can cast this spell (reverse lookup from NPC spell
  assignments). Helps balance.
- `[PROPOSED]` Show which classes get this spell and at what level (reverse lookup from
  class spell lists if applicable).

**Deferred:**

- `[DEFERRED]` Spell trees/leveling (spell upgrades at higher levels).
- `[DEFERRED]` Cooldown system. Not in current combat design.
- `[DEFERRED]` Spell components/reagents. Future feature.
- `[DEFERRED]` Damage type for spells (fire/ice/holy). Needs resistance system first.

---

## 4.4: Status Effect Editor (status-editor.html/ts/css)

Three-panel layout: effect list (left), tabbed form (center, max-width 800px),
preview (right, 300px).

### Current Features

- Effect list with category filter (buff/debuff/dot/hot/control) and search (name, id,
  description)
- 4-tab form: Basic, Modifiers, Periodic, Flags
- Effect ID is immutable after creation (good practice, prevents broken references)
- Stacking behavior: replace/refresh/stack, with conditional max-stacks field
- Combat modifiers: accuracy, defense, energy%, damage%
- Periodic effects: tick damage range (min-max), tick healing range, tick message,
  wear-off message, silent tick option
- Flags: blocks regeneration, blocks movement, is blind
- Category color-coding in list and preview
- Import/Export with merge by effect ID

### What Works Well

- Immutable IDs prevent accidental reference breakage
- Conditional max-stacks field (only shows for "stack" behavior) reduces clutter
- Range inputs for tick damage/healing are clear
- Category-based filtering is logical
- Flags section is straightforward with good hint text
- Preview shows complete effect summary

### Issues and Proposed Improvements

**UX Problems:**

- `[PROPOSED]` Energy/damage modifier fields show raw numbers but hints say "%". Clarify
  whether 50 means +50% or +0.50. Add "%" suffix to input.
- `[PROPOSED]` Tick damage range uses cramped "min - max" inline layout. Use two labeled
  fields ("Min Damage" / "Max Damage") for clarity.
- `[PROPOSED]` "New Effect" uses two prompts (ID + name). Replace with inline form that
  validates ID format in real-time.
- `[PROPOSED]` No preview of actual tick output. Add "Preview tick message" that shows
  what the player would see each tick.

**Missing Features:**

- `[PROPOSED]` Show which spells apply this effect (reverse lookup). Critical for
  understanding effect usage.
- `[PROPOSED]` Show which NPCs have this effect as innate or via spells.

**Deferred:**

- `[DEFERRED]` Effect chains (poison expires -> triggers weakness). Needs design.
- `[DEFERRED]` Partial immunity / resistance integration. Needs resistance system.
- `[DEFERRED]` Diminishing returns on reapplication. Future PvP concern.

---

## 4.5: NPC Editor (npc-editor.html/ts/css)

Three-panel layout: NPC list (left, ~280px), tabbed form (center, max-width 800px),
preview + spawn panel (right, 300px). The most complex editor after Room Editor.

### Current Features

- NPC list with name search
- 8-tab form: Basic, Combat, Behavior, Rewards, Appearance, Attacks, Spells, Merchant
- Basic: name, level, description, spawn room, respawn time, max active, hostile/proper
  name/interactable flags
- Combat: HP, mana, spell power, accuracy, defense, crit%, dodge%, damage reduction%
- Behavior: flee settings, call-for-help, traits (comma-separated), roam settings, allowed
  areas
- Rewards: XP, essence (with class gate), gold min/max, drop table select
- Appearance: name augmentations, enter/exit/spawn messages with placeholders, corpse settings
- Attacks: dynamic list of attack definitions (name, type, damage, percentage, verbs,
  messages)
- Spells: dynamic list of spell assignments (spell select, priority, cast chance, condition,
  cooldown)
- Merchant: enable toggle, faction select, inventory table (add items, stock/restock
  settings), price calculator, keyword responses
- Preview panel shows calculated balance metrics (effective HP, per-attack DPS, total DPS)
- Spawn button in preview panel
- Import/Export with merge, duplicate function

### What Works Well

- Balance preview (effective HP, DPS calculations) is excellent for game design
- Attack verb customization matches weapon system
- Spell condition system (hp_below, mana_above, combat_start, etc.) is flexible
- Merchant tab integrates inventory, pricing, and responses in one place
- Price calculator lets devs test haggling/faction modifiers
- Dynamic attack/spell row management works smoothly

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` Spell select dropdown renders ALL spells for EACH spell row. With 5 NPC
  spells and 200 game spells, that's 1000 option elements. Replace with SearchableSelect.
- `[PROPOSED]` Merchant item select dropdown renders ALL item templates. Replace with
  SearchableSelect.
- `[PROPOSED]` NPC list has no filter beyond name search. Add level range filter, hostile
  filter, merchant filter.

**UX Problems:**

- `[PROPOSED]` Traits field is comma-separated text ("stealth, see_hidden"). Should be
  checkbox or multi-select from known traits.
- `[PROPOSED]` Allowed areas field is comma-separated text. Should be multi-select from
  known areas.
- `[PROPOSED]` Spawn Room ID is raw number. Should be SearchableSelect for rooms.
- `[PROPOSED]` Essence Class is freeform text. Should be SearchableSelect from class list.
- `[PROPOSED]` Attack percentage across all attacks should sum to 100% or less. Add
  validation showing total percentage with warning if over 100.
- `[PROPOSED]` Merchant inventory inline editing saves immediately to API on blur. Should
  batch changes and save with the main Save button.

**Missing Features:**

- `[PROPOSED]` Show which rooms this NPC spawns in and roams through.
- `[PROPOSED]` Show which quests reference this NPC as quest giver or kill target.

**Deferred:**

- `[DEFERRED]` NPC dialogue tree editor. Major feature, separate effort.
- `[DEFERRED]` NPC patrol path editor (visual route on map). Needs map integration.

---

## 4.6: Drop Table Editor (drop-table-editor.html/ts/css)

Three-panel layout: table list (left, ~280px), tabbed form (center), simulation panel
(right, 300px).

### Current Features

- Table list with name/ID search
- 2-tab form: Details, Entries
- Details: name, description
- Entries: dynamic list of entry rows, each with item template ID (number), drop chance%,
  min/max quantity, currency min/max (copper), allowed denomination checkboxes (5 types)
- Right panel: drop simulation (run N iterations client-side, shows avg drops/kill, avg
  currency/kill, item frequency table)
- Duplicate function

### What Works Well

- Drop simulation is unique and very useful for balance testing
- Denomination checkboxes with enforcement (at least one required) is smart
- Entry management (add/remove) is clean
- Simulation results table is clear and informative

### Issues and Proposed Improvements

**UX Problems:**

- `[PROPOSED]` Item template ID is a raw number input. Devs must know IDs by heart. Replace
  with SearchableSelect that shows item name + ID.
- `[PROPOSED]` No validation that item template ID exists. Could reference deleted items.
  Add existence check on save or blur.
- `[PROPOSED]` Denomination checkboxes could use "All" / "None" toggle buttons.

**Missing Features:**

- `[PROPOSED]` Show which NPCs use this drop table (reverse lookup). Critical for
  understanding where loot comes from.
- `[PROPOSED]` Show item names inline in entry rows instead of just IDs.

**Deferred:**

- `[DEFERRED]` Server-side simulation using actual game RNG. Client-side is good enough.
- `[DEFERRED]` Weighted visualization (pie chart of drop distribution).

---

## 4.7: Faction Editor (faction-editor.html/ts/css)

Three-panel layout: faction list (left, 280px), single form (center), preview (right).

### Current Features

- Faction list with name/type search
- Simple form (no tabs): name, type (city/tribal/merchant/guild), description
- Live preview showing faction summary
- Create, save, delete functions

### What Works Well

- Simple and focused. The faction concept is straightforward and the editor matches.
- Search works well for the expected scale.

### Issues and Proposed Improvements

**UX Problems:**

- `[PROPOSED]` Faction type dropdown is hardcoded to 4 options. If new types are added,
  requires code change. Consider making types configurable or at least fetched from server.
- `[PROPOSED]` No duplicate function (unlike other editors). Add for consistency.

**Missing Features:**

- `[PROPOSED]` Show which NPCs belong to this faction (reverse lookup).
- `[PROPOSED]` Show which quests reference this faction (faction reputation rewards).
- `[PROPOSED]` Import/Export for consistency with other editors.

**Deferred:**

- `[DEFERRED]` Faction relationship/alliance graph. Needs design.
- `[DEFERRED]` Player reputation tracking UI. Needs player-facing integration.

---

## 4.8: Door Editor (door-editor.html/ts/css)

Three-panel layout: door list (left, 280px), tabbed form (center), preview with connection
diagram (right, 300px).

### Current Features

- Door list with area filter, room filter, type filter, and text search
- View toggle: "Doors" (list doors) and "Room Exits" (list exits, create doors from them)
- 7-tab form: Basic, Rooms, State, Locks, Triggers, Portal, Permissions
- Tabs show/hide based on door type (physical, triggered_passageway, special, temporary_portal,
  open_passageway)
- Room selection dropdowns for entry/exit rooms (populated from all rooms)
- Lock settings: key tag, pick difficulty range, bash difficulty
- Trigger settings: trigger text, passage messages (self/room), item display name
- Portal settings: spawn trigger, duration, appear/disappear messages
- Permissions: level range, required classes, quest flag, item tag, denial message
- Preview shows connection diagram (entry room -> direction -> exit room)
- Create door from exit shortcut in Room Exits view

### What Works Well

- Type-conditional tab visibility prevents confusion (only relevant tabs shown)
- Connection diagram in preview is clear and intuitive
- Room Exits view for quick door creation from existing exits is smart
- Comprehensive filtering (area + room + type + search)
- Lock/trigger/portal/permission separation is well organized

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` Entry/exit room dropdowns render ALL rooms. Same critical issue as Room
  Editor exit target. Replace with SearchableSelect.
- `[PROPOSED]` Room filter dropdown in list panel has same scaling issue.

**UX Problems:**

- `[PROPOSED]` "New Door" uses `prompt()`. Replace with inline form or modal.
- `[PROPOSED]` Required classes field is comma-separated text. Replace with multi-select.
- `[PROPOSED]` Key Item Tag and Required Item Tag are freeform text. Should validate against
  known item tags or at least autocomplete from existing items.
- `[PROPOSED]` Pick difficulty min/max has no guidance on what values are reasonable. Add
  inline hint with range examples (e.g., "50-80 = easy, 100-120 = moderate, 150+ = hard").

**Missing Features:**

- `[PROPOSED]` Bulk door creation from exits: "create physical doors for all exits in
  [area]" instead of one at a time.
- `[PROPOSED]` Lock difficulty presets: "Easy Lock", "Standard Lock", "Master Lock" buttons
  that fill in pick/bash values.

**Deferred:**

- `[DEFERRED]` Visual door placement on map. Needs map integration.

---

## 4.9: Action Editor (action-editor.html/ts/css)

Three-panel layout: action list (left, ~250px), single form (center), preview (right,
~300px).

### Current Features

- Action list with name/description search
- Single form (no tabs): command, description, no-target messages (self + room), with-target
  messages (self + target + room, all three required to enable targeting)
- Live preview showing how messages appear to different audiences
- Placeholder reference ({player}, {target}) in preview panel
- Import/Export with merge, duplicate function

### What Works Well

- Live preview is excellent. Developers see exactly what each audience receives.
- Targeting toggle (all three fields required) is smart implicit validation.
- Simple form matches simple data. No unnecessary complexity.
- Placeholder reference prevents syntax errors.

### Issues and Proposed Improvements

**UX Problems:**

- `[PROPOSED]` Duplicate appends "_copy" to command. Should auto-increment ("wave_2") or
  let user provide name.
- `[PROPOSED]` No duplicate command detection. Creating "wave" when it already exists only
  fails on server save. Add client-side check.
- `[PROPOSED]` No message length guidance. Some actions have long prose, others are terse.
  Add character count or style hint.

**Missing Features:**

- `[PROPOSED]` Action categories/tags (emote, combat, roleplay). Would help organize the
  in-game `help actions` output.
- `[PROPOSED]` Command aliases (e.g., "wave" and "wave hand" trigger same action).

**Deferred:**

- `[DEFERRED]` Conditional messages (different text when sneaking, in combat, etc.).
- `[DEFERRED]` Multi-target actions. Future feature.

---

## 4.10: Progression Editor (progression-editor.html/ts/css)

Two-panel layout per tab: entity list (left, 300px), form (right, flex). No preview panel.
Top-level tabs in navbar switch between entity types.

**After Phase 1, only Classes and Races tabs remain.**

### Current Features

- Classes: class ID (immutable), display name, description, essence multiplier, resource type
  (mana/kai/rage/focus/none), playable flag, subscribed tags, combat & magic section (combat
  level, magic level, magic school, special ability checkboxes, crit/dodge bonus), class
  abilities section (add/remove abilities with level requirement and auto-learn flag)
- Races: race ID (immutable), display name, description, playable flag, dodge bonus%, base
  stats (6 stats with min/max ranges), special ability checkboxes (stealth, lockpicking,
  see hidden), traits (comma-separated), allowed classes (comma-separated)
- No preview panel for either tab

### What Works Well

- Immutable IDs after creation (same good pattern as Status Effect Editor)
- Stat range inputs (min/max) for races are clear
- Special ability checkboxes are intuitive
- Class ability management (add/remove inline) is efficient
- Resource type dropdown covers known resource systems

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` No search in entity lists. Add search/filter for classes and races.
  Not critical now (~10-20 of each) but good practice.

**UX Problems:**

- `[PROPOSED]` No preview panel. Add a preview showing how the class/race appears in
  character creation (description, stats, abilities).
- `[PROPOSED]` Allowed classes field on races is comma-separated text. Should be multi-select
  from known classes.
- `[PROPOSED]` Traits field on races is comma-separated text. Should be tag-input or
  multi-select from known traits.
- `[PROPOSED]` Class abilities section references ability definitions which will be removed
  in Phase 1. This section needs to be redesigned or removed. Discuss what replaces it.
- `[PROPOSED]` Stat defaults (min 40, max 100) are unexplained. Add inline help explaining
  what min/max represent and reasonable ranges.
- `[PROPOSED]` Magic school dropdown is hardcoded. Should be dynamic if new schools are
  added.
- `[PROPOSED]` No import/export. Add for consistency with other editors.

**Missing Features:**

- `[PROPOSED]` Show which characters use this class/race (count). Helps assess impact of
  changes.
- `[PROPOSED]` Balance comparison: side-by-side view of two classes or two races to compare
  stats, abilities, bonuses.

**Deferred:**

- `[DEFERRED]` Progression path visualization (level -> ability unlock tree).
- `[DEFERRED]` Stat calculator showing final stats for a race+class combination.

---

## 4.11: Quest Editor (quest-editor.html/ts/css)

Three-panel layout: quest list (left, 280px), tabbed form (center), preview (right).

### Current Features

- Quest list with name/tag search
- 5-tab form: Basic, Requirements, Steps, Rewards, Dialogue
- Basic: quest tag, name, description, quest giver NPC ID, sort order, quest flag, enabled
- Requirements: min/max level, required races/classes (comma-separated), required faction ID,
  faction rep range, prerequisite quest IDs
- Steps: dynamic step cards with trigger type, trigger NPC/item/room ID, trigger text,
  required count, consume item flag, description, completion/in-progress dialogue, per-step
  rewards (XP, essence, currency, items, faction rep)
- Rewards: completion-level XP, essence, currency, item rewards (template ID + quantity),
  faction rewards (faction ID + amount)
- Dialogue: denial dialogue, completed dialogue
- Preview panel shows formatted quest summary
- Import/Export with merge, duplicate function

### What Works Well

- Step card system handles complex multi-step quests
- Per-step rewards allow granular progression feedback
- Trigger types cover common quest patterns
- Quest flag system integrates with door permissions
- Preview shows complete quest summary
- Sort order field allows manual quest sequencing
- Enabled flag for staging quests before release

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` Quest list has no filter beyond search. Add filters: enabled/disabled,
  level range, quest giver NPC.

**UX Problems:**

- `[PROPOSED]` NPC ID, Item ID, Room ID, Faction ID fields are all raw numbers. Replace
  with SearchableSelect components showing names. This is the editor's biggest UX problem.
- `[PROPOSED]` Required races/classes are comma-separated text. Replace with multi-select.
- `[PROPOSED]` Prerequisite quest IDs are comma-separated numbers. Replace with
  SearchableSelect showing quest names.
- `[PROPOSED]` Trigger type is a freeform string. Should be a controlled dropdown of
  valid types.
- `[PROPOSED]` Per-step item/faction rewards use raw IDs and are hard to see in the UI.
  Make them visible and use SearchableSelect for IDs.
- `[PROPOSED]` Step reordering uses only up/down buttons. Consider drag-and-drop for
  large quest chains.

**Missing Features:**

- `[PROPOSED]` Prerequisite chain visualization: show quest dependency graph.
- `[PROPOSED]` Quest giver reverse lookup: show all quests given by a specific NPC.
- `[PROPOSED]` Step templates: "Kill N mobs", "Collect N items", "Visit room" presets
  that pre-fill trigger type and fields.

**Deferred:**

- `[DEFERRED]` Branching quests (step dependencies within a quest).
- `[DEFERRED]` Dialogue tree integration (per-step NPC dialogue).

---

## 4.12: Admin Panel (admin.html/ts/css)

Single-page tabbed layout: Users, IP Access, Settings. Max-width 1000px, centered.

### Current Features

- Users tab: pending approval list (approve button per user), all players table (username,
  email, editable max characters, save button per row)
- IP Access tab: add entry form (IP/hostname, type, allow/block, reason), current entries
  table with color-coded badges and delete buttons
- Settings tab: individual settings with per-setting save buttons (max characters, IP mode,
  death mechanics, backstab config)
- Toast notifications for feedback

### What Works Well

- Clean tab layout for distinct admin concerns
- One-click approval flow is simple
- Color-coded badges (IP/hostname, allow/block) are clear
- Per-setting descriptions explain what each setting does
- Range constraints on inputs prevent invalid values

### Issues and Proposed Improvements

**Scaling / Performance:**

- `[PROPOSED]` Players table renders ALL players with no pagination. Will break at 100+
  players. Add pagination and search/filter (by username, email, role).
- `[PROPOSED]` Pending approval list has no pagination. Add if registration volume grows.
- `[PROPOSED]` IP entries table has no pagination. Add for large blocklists.

**UX Problems:**

- `[PROPOSED]` Per-setting save buttons are tedious. Group related settings and add a
  single "Save Section" or "Save All" button.
- `[PROPOSED]` No sorting on players table. Add sort by username, role, character count.
- `[PROPOSED]` No role management. Can't change player roles (PLAYER -> MODERATOR, etc.)
  from the admin panel. Currently requires CLI (`create-admin.ts`).
- `[PROPOSED]` Settings feedback uses a single shared message element. Multiple saves
  overwrite each other. Use toast notifications per save.

**Missing Features:**

- `[PROPOSED]` Role assignment from admin panel. Dropdown per player row to change role.
- `[PROPOSED]` Player search/filter by role, registration date, last login.
- `[PROPOSED]` Bulk approval: select multiple pending users and approve at once.
- `[PROPOSED]` IP list import/export (CSV or JSON) for backup.
- `[PROPOSED]` Test IP access: input an IP, see if it would be allowed/blocked under
  current rules.
- `[PROPOSED]` Settings groups: collapsible sections for Death Mechanics, Backstab Config,
  etc. instead of one long list.

**Deferred:**

- `[DEFERRED]` Audit log: who changed which setting and when.
- `[DEFERRED]` Ban/suspend player action. Needs design.
- `[DEFERRED]` Session management (view/force logout active sessions).

---

## 4.13: Hub Page (index.html / main.ts)

Multi-container layout: hub landing with "Enter Game" button, character select/create,
profile page. Role-based nav links to editors and admin.

### Current Features

- Hub landing: welcome message, large "Enter Game" button
- Character select: card layout showing name, level, race, class with delete button
- Character creation form: first/last name, race/class dropdowns (class filtered by race's
  allowed classes), gender, hair, eye color, live stat preview
- Profile page: username (read-only), email (editable), password change, character slot
  display
- Nav: Developer dropdown (DEVELOPER+), Admin link (ADMIN), profile, logout

### What Works Well

- Character card layout with clear visual hierarchy
- Live stat preview during character creation helps decision-making
- Class filtering by race prevents invalid combinations
- Character limit enforcement (hide create button at limit)
- Simple hub landing focuses the user on one action

### Issues and Proposed Improvements

**UX Problems:**

- `[PROPOSED]` Delete confirmation says "this character" without showing the character's
  name. Include name in confirmation dialog.
- `[PROPOSED]` No character sort order. Add sort by level, name, or last played.
- `[PROPOSED]` No "last played" display on character cards. Helps pick the right character.
- `[PROPOSED]` Stats preview shows numbers but no explanation of what each stat does.
  Add tooltip or expandable info per stat.
- `[PROPOSED]` Hair/eye color dropdowns are long lists. Consider visual color swatches
  instead of text-only dropdown.

**Scaling:**

- `[PROPOSED]` Character list has no pagination. At high character limits (or admin view)
  this could grow. Low priority since per-player limits are small.

**Missing Features:**

- `[PROPOSED]` Character level progress: show XP bar or "X/Y to next level" on cards.
- `[PROPOSED]` "Last played" timestamp on character cards.
- `[PROPOSED]` Random appearance button during character creation (fills hair/eye/gender
  randomly).

**Deferred:**

- `[DEFERRED]` Character appearance preview (ASCII art or visual render).
- `[DEFERRED]` Recommended builds / class guides during creation.
- `[DEFERRED]` Two-factor authentication.
- `[DEFERRED]` Account deletion.

---

## Cross-Cutting Observations

All editors share these patterns that should be addressed as shared components:

1. **Every editor re-implements auth checking, toast notifications, modal dialogs, tab
   switching, and list panel rendering.** A shared component library would eliminate massive
   duplication.
2. **`prompt()` dialogs** are used for entity creation in Room, Item, Spell, Status Effect,
   Door, and NPC editors. All should migrate to inline forms or modals.
3. **Comma-separated text fields** for classes, races, areas, traits, etc. appear in 7+
   editors. A shared tag-input or multi-select component would fix all of them.
4. **Raw ID inputs** for rooms, items, NPCs, factions, quests appear in Quest, NPC, Drop
   Table, and Item editors. SearchableSelect with name display would fix all.
5. **No unsaved changes detection** in any editor. A shared change-tracking utility would
   protect against accidental data loss.
6. **No import/export** in Progression, Door, or Faction editors. Add for consistency.
7. **List panels have no pagination**. All load everything into DOM. Shared virtual list
   component would scale all editors.

---

## Phase 5: Future Considerations (Not Planned Yet)

These are things identified during analysis that may be addressed later:

- **Virtual scrolling for list panels** - If entity counts exceed ~2000, even filtered DOM
  lists will be slow. At that point, consider virtual scrolling or server-side pagination.
- **Database abstraction layer** - If multi-DB support (PostgreSQL + SQLite) is desired,
  evaluate Drizzle ORM or Knex. See conversation notes from 2026-03-20.
- **Cache combat stat DB lookups** - `combatStatProvider.ts` reads class/race dodge bonuses
  from DB on every defender hit. Should be cached at login/level-up. (Also tracked in TODO.md.)

---

## Implementation Phases

Ordered so that backend/game changes land before the editors that depend on them.
Each phase notes whether the game is broken during implementation.

---

### Phase 1: Remove Dead Code (Abilities, Talents, Events)
**Game breakage: NONE** — removing unused systems.

- Drop ability_definitions, talent_definitions, game_events, character_activity_tracker tables
- Remove learned_abilities, unlocked_talents columns from character_progression
- Remove class_abilities table and class abilities section from Progression Editor
- Remove all related repository functions, API endpoints, shared types, seed data
- Remove Events, Abilities, Talents tabs from Progression Editor
- Progression Editor left with Classes and Races tabs only

---

### Phase 2: Express 5 Migration
**Game breakage: NONE** — no deprecated patterns used.

- Update express to ^5.1.0, update @types/express
- Verify cookie-parser compatibility
- Test all 154 routes and WebSocket upgrade
- Quick, low-risk modernization

---

### Phase 3: Quick Bug Fixes (No UI Changes)
**Game breakage: NONE** — fixing things that are already broken or wrong.

These are code-only fixes that don't require editor changes. Do them now so the game
is in better shape before the UI rewrite.

- Fix crit modifier input min="1" → allow 0 and negatives (item-editor.html)
- Fix "wear" command to delegate to "wield" for weapons (itemCommands.ts)
- Fix telegraph messages for player spell casting (spellCommands.ts)
- Fix player offensive spells not applying status effects (spellCommands.ts + combat.ts)
- Fix NPC between-round spells + full melee in same round (combat.ts)
- Fix Wisdom and Charisma missing from item stat modifiers (item-editor.html)
- Fix speed_modifier missing from status effect editor (status-editor.html)
- Remove weapon Range field from editor (unused, no ranged combat)
- Remove short_desc and room_desc from item editor (unused)
- Remove max_stack from item editor (weight limits stacking)
- Remove goldMin/goldMax from NPC editor (migrate to drop tables first)
- Remove mana cost from NPC attack rows (melee attacks don't use mana)

---

### Phase 4: Editor Navigation Fix (New Tabs)
**Game breakage: NONE** — UX only.

- Add target="_blank" to all editor links in game nav bar
- Adjust editor nav bars (Game link opens in new tab or removed)
- Verify WebSocket stays alive, multiple editor tabs coexist

---

### Phase 5: Schema Changes + Game Logic (Backend Foundation)
**Game breakage: BRIEF** — migrations add new columns/tables, game code updated to use
them. Deploy schema + code together. Existing data unaffected (new columns have defaults).

**5A: Armor Type System**
- Rename weight_class → armor_type on item_templates (Robe/Leather/Chainmail/Scalemail/Platemail)
- Add armor_type_restrictions column to class definitions
- Add armor type check to handleWield()/handleWear()
- *Dependency: Must land before Item Editor and Progression Editor UI rewrites*

**5B: Item Requirements Enforcement**
- Add checks to handleWield()/handleWear(): level, stats, class, race, armor type
- No schema change needed (fields already exist, just unenforced)
- *Dependency: Armor type system (5A) for the armor type check*

**5C: Backstab Weapon Flag**
- Add allows_backstab column to item_templates weapon_data
- Update backstab check in stealthCommands.ts
- *No dependencies*

**5D: Spell System Rework**
- Replace damageDice/healingDice with minDamage/maxDamage and minHealing/maxHealing
- Replace stat-based scaling with level-based scaling (scalingPerLevel + maxScaling)
- Add hitsPerCast field to spells
- Add castDifficulty and fizzleMessage fields to spells
- Add custom spell messages (hit/fizzle/resist × self/target/room) to spells
- Update processSpellCombat() and processNpcSpellCombat() for all changes
- *Dependency: Must land before Spell Editor UI rewrite*
- **Game breakage: YES during this sub-phase.** Existing spell data uses dice notation
  which must be migrated to min/max. Write a migration script that converts dice to
  ranges (e.g., "1d6+2" → min 3, max 8). Deploy migration + code together.

**5E: NPC Changes**
- Add enabled column to npcs table (default true)
- Update spawn system to skip disabled templates
- Migrate goldMin/goldMax to drop table entries, then remove columns
- *Dependency: Drop table currency separation (5F) for gold migration*

**5F: Drop Table Currency Separation**
- Add currency drop fields to drop_tables table (or restructure entries)
- Separate currency from item entries in the data model
- *No dependencies*

**5G: Unified Trait System**
- Create trait_definitions table (id, display_name, description, is_numeric,
  applicable_to: race/class/both)
- Migrate existing hardcoded special abilities and traits to this table
- Update race/class loading to use unified trait definitions
- *Dependency: Must land before Progression Editor UI rewrite*

**5H: Status Effect Expanded Modifiers**
- Add new modifier columns to status_effect_definitions: magic_resistance, stealth,
  spellcasting, lockpicking, critical_chance, dodge, healing_received, perception,
  plus stat modifiers (str/dex/con/int/wis/cha/max_hp/max_mana)
- Add new flag columns: blocks_casting, blocks_combat, blocks_stealth
- Update getEffectModifiers() to aggregate new fields
- Update combat calculations to apply new modifiers
- *Dependency: Must land before Status Effect Editor UI rewrite*

---

### Phase 6: Shared UI Components
**Game breakage: NONE** — client-only, no gameplay changes.

Build the reusable components that all editors will use. These must be ready before
individual editor rewrites begin.

- **SearchableSelect** — filterable dropdown with keyboard nav, single/multi-select,
  grouping support. Replaces all raw ID inputs and oversized `<select>` elements.
- **ChipTagInput** — type to search, select adds as chip with X to remove. For classes,
  races, areas, traits, keywords.
- **Shared modal/dialog** — replaces all prompt() calls. Styled, validatable, accessible.
- **Shared toast notifications** — already exists but should be extracted to shared module.
- **Shared tab component** — consistent tab behavior across all editors.
- **Shared list panel** — search/filter input, sortable, with debounce. Replaces per-editor
  list rendering.
- **Shared auth check** — single module for role verification and nav setup.

---

### Phase 7: Editor UI Rewrites
**Game breakage: NONE** — client-only. Old editors replaced with new ones.

Design each editor in Figma (figma-remote-mcp) + frontend-design plugin before coding.
Editors can be rewritten in any order since Phase 5 backend changes are already in place.
Suggested order (simplest first to establish patterns, complex last):

1. **Action Editor** — simplest, good for proving shared components
2. **Faction Editor** — simple, tests SearchableSelect in reverse lookups
3. **Status Effect Editor** — moderate, tests expanded modifiers form
4. **Drop Table Editor** — moderate, tests currency separation + item SearchableSelect
5. **Spell Editor** — moderate-complex, tests type-specific Effects tab + messages
6. **Door Editor** — moderate, tests room SearchableSelect heavily
7. **Item Editor** — complex, tests type-driven form + many field changes
8. **Progression Editor** — complex, tests unified trait system + toggle buttons
9. **Room Editor** — complex, tests map canvas + SearchableSelect + respawn UX
10. **Quest Editor** — most SearchableSelect instances, tests step management
11. **NPC Editor** — most complex, 8 tabs, tests everything
12. **Admin Panel** — separate concern, pagination + role management
13. **Hub / Player UI** — full redesign in Figma

---

### Phase 8: Future Systems (Not Yet Scheduled)

These are game systems identified during the editor audit that aren't part of the
editor rewrite but are tracked in TODO.md:

- Luminance / darkness system (rooms, races, light items)
- Magic resistance system (derived stat from WIS/CON/items, reduces spell damage,
  resists debuffs)
- Spell difficulty / fizzle system (cast difficulty vs spellcasting ability)
- Consumable duration (DoT/HoT from potions)
- Armor/weapon weight penalties (heavy armor affects movement/dodge/stealth)
- Fuel consumption for light sources
- Dynamic terrain types (DB-driven instead of hardcoded)
- Combat stat caching (remove DB reads during combat)
- Periodic mana tick (drain/restore) on status effects — schema: tickManaMin/tickManaMax
  columns on status_effect_definitions, tick processor logic mirrors tickDamage/tickHealing

---

### Breakage Summary

| Phase | Game Broken? | Duration | Risk |
|-------|-------------|----------|------|
| 1: Remove dead code | No | - | None |
| 2: Express 5 | No | - | Low |
| 3: Bug fixes | No | - | Low |
| 4: Editor nav fix | No | - | None |
| 5A: Armor types | Brief | Deploy together | Low |
| 5B: Item requirements | No | - | Low |
| 5C: Backstab flag | No | - | Low |
| 5D: Spell rework | **Yes** | Migration required | **Medium** |
| 5E: NPC changes | Brief | Gold migration | Low |
| 5F: Drop table currency | No | - | Low |
| 5G: Unified traits | Brief | Data migration | Low |
| 5H: Effect modifiers | No | New columns only | Low |
| 6: Shared components | No | - | None |
| 7: Editor rewrites | No | - | None |

**The only real breakage point is Phase 5D (Spell Rework)** — existing spells use dice
notation ("1d6+2") which must be converted to min/max ranges. A migration script handles
this, but spell data is temporarily in flux during deployment. Test thoroughly on a
staging environment before deploying to production.
