# Quest Editor

This is the design document for the rewrite of the Quest Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

**Note:** Quest presentation to the player in-game needs a separate rework. This
document focuses on the editor UI only.

## Layout

Three-panel: quest list (left, 280px), 5-tab form (center), preview (right).

## Quest List Panel

Status: Good. Search by name or tag. Disabled quests shown with muted styling.

## Preview Panel

Status: Good. Shows quest summary: name, tag, enabled status, step count, quest giver,
flag, requirements, steps list, rewards, description. Updates on selection.

---

## Tab 1: Basic

### Quest Tag

Status: Good. Unique identifier used for prerequisite references and quest flags.

### Quest Name

Status: Good. Display name shown to players.

### Quest Description

Status: Good. Textarea.

### Quest Giver NPC

Status: **Needs SearchableSelect.**

Currently a raw number input for NPC template ID.

> **Claude:** Replace with SearchableSelect populated from `/api/npcs`. Show NPC name,
> level, and ID in results. Filterable so developers can find NPCs among potentially
> hundreds of templates. This is the most important fix on this tab.

### Sort Order

Status: Good, needs tooltip.

Number input, default 0.

> **Claude:** Controls which quest takes priority when multiple quests share the same
> NPC. Lower number = checked first when a player talks to the NPC. Only matters when
> one NPC gives multiple quests.
>
> Add tooltip: "Priority when this NPC gives multiple quests. Lower = checked first.
> Only matters if multiple quests share the same quest giver NPC."

### Quest Flag

Status: Good. Text string set on the player when quest completes. Used by door
permissions (Required Quest Flag field on doors).

> **Claude:** Could autocomplete from existing door quest flag fields, but low priority.
> Add hint: "Set on the player when quest completes. Can be checked by door permissions."

### Enabled

Status: Good. Checkbox toggle. Disabled quests don't trigger.

---

## Tab 2: Requirements

### Min Level / Max Level

Status: Good. Max 0 = no limit.

### Required Races / Required Classes

Status: **Needs toggle buttons.**

Comma-separated text fields.

> **Claude:** Same fix as everywhere else. Replace with dynamic toggle buttons from
> class/race API. Selected items show as chips. Empty = all allowed.

### Faction Requirement

Status: **Needs SearchableSelect for faction.**

Faction ID is a raw number. Min/max reputation thresholds are number inputs.

> **Claude:** Replace faction ID with SearchableSelect from `/api/factions`. The
> min/max rep fields are fine as numbers — they define the reputation range the player
> must be within to accept the quest.

### Prerequisite Quest IDs

Status: **Needs SearchableSelect.**

Comma-separated quest IDs.

> **Claude:** Replace with multi-select SearchableSelect populated from quest list.
> Show quest name + tag in results. Selected quests appear as chips with X to remove.
> Currently the developer must know quest IDs by heart.

---

## Tab 3: Steps

Status: **Biggest redesign area. Raw IDs everywhere, step rewards hidden.**

Dynamic step cards with add/remove/reorder (move up/down). Each step has:
- Description (text)
- Trigger Type (select: talk, kill, visit)
- Required Count (number)
- NPC ID (number) — for talk/kill triggers
- Room ID (number) — for visit triggers
- Item Template ID (number) — for item-related triggers
- Trigger Text (text) — keyword for talk triggers
- Consume Item (checkbox)
- Completion Dialogue (textarea)
- In Progress Dialogue (textarea)
- Step XP / Essence / Currency rewards (numbers)
- Step-level item/faction rewards (stored in data attributes, NO UI)

> **Claude:** Issues:
>
> **1. Every entity reference is a raw ID input.** NPC ID, Room ID, Item ID all need
> SearchableSelect. This is the editor's biggest UX problem — designing a multi-step
> quest requires knowing dozens of IDs by heart.
>
> **2. Step-level item and faction rewards exist in the data model but have NO UI.**
> They're stored in `data-stepItemRewards` and `data-stepFactionRewards` JSON attributes
> on the step card but there are no form fields to edit them. The developer can only set
> these via direct API calls or import. Add visible reward fields per step (same pattern
> as quest-level rewards: item ID + quantity rows, faction ID + amount rows).
>
> **3. Trigger type should conditionally show fields.** Currently all fields are visible
> on every step regardless of trigger type. Should follow the Item Editor Type Data
> pattern:
> - Talk trigger: show NPC selector + Trigger Text + Completion/InProgress Dialogue
> - Kill trigger: show NPC selector + Required Count
> - Visit trigger: show Room selector
> - Item pickup (if added): show Item selector + Required Count + Consume checkbox
>
> **4. Step reordering uses up/down buttons.** Works but drag-and-drop would be better
> for long quest chains. Up/down buttons are fine for now.

---

## Tab 4: Rewards

Status: **Item and faction IDs are raw numbers.**

Quest-level completion rewards:
- XP, Essence, Currency (copper) — number inputs, good
- Item Rewards — dynamic rows: Item Template ID (number) + Quantity + Remove
- Faction Rewards — dynamic rows: Faction ID (number) + Rep Amount + Remove

> **Claude:** XP/essence/currency inputs are fine. Item and faction rewards need
> SearchableSelect:
> - Item rewards: SearchableSelect from item templates (same filterable-by-type
>   pattern as other editors)
> - Faction rewards: SearchableSelect from factions
>
> Currently adding a reward defaults to ID=1, Qty=1. The developer then has to change
> the ID to the correct number. With SearchableSelect, they'd pick the actual item/
> faction from a dropdown.

---

## Tab 5: Dialogue

Status: Good.

- Denial Dialogue — shown when player doesn't meet requirements
- Completed Dialogue — shown when player has already finished the quest

> **Claude:** Two simple textareas. No changes needed. Could add placeholder examples
> to guide the developer on what these should say.

---

## Creation Flow

Status: Good. Creates with name + tag, no prompt().

## Duplicate

Status: Good. Appends "_copy" to tag, " (Copy)" to name. Copies all data including
steps.

## Import/Export

Status: Good. JSON with merge by tag.

## Missing Features

> **Claude:**
>
> - `[PROPOSED]` Quest chain visualization — show prerequisite dependencies as a graph.
>   Helps understand quest progression paths.
> - `[PROPOSED]` Quest giver reverse lookup — in the preview, show all quests this NPC
>   gives (helps understand the NPC's quest load and sort order importance).
> - `[PROPOSED]` Step templates — "Kill N mobs", "Visit room", "Talk to NPC" presets
>   that pre-fill trigger type and relevant fields. Speeds up step creation.
> - `[PROPOSED]` Show entity names in preview — currently preview shows raw IDs for
>   NPCs, rooms, items. Should resolve to names.

## Help Section

> **Claude:** Help documentation should cover:
> - How quest triggers work (talk = keyword match, kill = NPC death count, visit = enter
>   room)
> - How sort order affects quest priority per NPC
> - How quest flags connect to door permissions
> - How prerequisite quests work (must be completed before this quest is available)
> - How faction reputation requirements work (min/max range)
> - How step rewards vs quest rewards work (step rewards given per-step completion,
>   quest rewards given on final completion)
> - How the enabled flag works (disabled quests don't trigger)
> - How dialogue fields are used (denial, completion, step completion, in-progress)
