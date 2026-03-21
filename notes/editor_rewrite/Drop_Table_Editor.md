# Drop Table Editor

This is the design document for the rewrite of the Drop Table Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Layout

Three-panel: table list (left, ~280px), tabbed form (center), simulation panel (right,
300px).

## Drop Table List Panel

Status: Good. Name/ID search.

> **Claude:** Simple list with search. Fine for expected scale of drop tables.

## Details Tab

### Name

Status: Good. Text input, required.

### Description

Status: Good. Textarea, 3 rows.

## Currency Drop Section (on Details tab or its own section)

Status: **Redesign. Promote currency to a top-level setting on the drop table.**

Currently currency is mixed in with item entries as just another entry row. This is
confusing — currency is common enough to be its own thing.

> **Claude:** Add a dedicated Currency Drop section to the drop table (either on the
> Details tab or as a visible section above the entries):
>
> - **Enable Currency Drop** checkbox (default unchecked)
> - When enabled, shows:
>   - Drop Chance % (0-100)
>   - Currency Min (copper)
>   - Currency Max (copper)
>   - Allowed Denominations (checkboxes: copper, silver, gold, platinum, runic)
>     with All/None toggle buttons
>
> This is always visible at the top level — one currency drop config per table. If
> enabled, currency rolls once per kill using these values. Simple and clear.
>
> Under the hood this can still be stored as a drop table entry with null
> itemTemplateId (backward compatible), or promoted to columns on the drop table
> itself. Implementation detail for later.

## Entries Tab (Item Drops Only)

Status: **Needs improvement. Entries are now item-only.**

With currency promoted to its own section, entry rows only need item fields.

Each entry row shows:
- Item (SearchableSelect, filterable by item type then searchable by name)
- Drop Chance % (0-100, decimal step 0.1)
- Min Quantity (number)
- Max Quantity (number)
- Remove button

No more currency fields mixed into entry rows.

### Item Selection

Status: **Must improve.**

Currently a raw number input for item template ID. Developer must know IDs.

> **Claude:** Replace with SearchableSelect. Add a type filter (Weapon, Armor,
> Consumable, Key, etc.) to narrow results before searching by name. Show item name,
> type, and base value in the dropdown results. Same pattern as NPC Editor merchant
> inventory.

## Simulation Panel

Status: Good. Unique feature worth keeping.

Iterations input (1-10000), Simulate button. Runs client-side simulation showing:
avg drops/kill, avg currency/kill, total currency, item frequency table with count,
avg/kill, and percentage.

> **Claude:** This is a great balance tool. No other editor has simulation. Keep as-is.
> The simulation runs entirely client-side using the editing entries, so it reflects
> changes before saving.
>
> Could enhance with a visual distribution chart (bar chart of drop rates) during the
> design phase, but the current table output is functional.

## Creation Flow

Status: Good. Creates with name, no prompt() for the table itself.

> **Claude:** Entries are added with an "Add Entry" button that creates a blank row.
> Straightforward, no issues.

## Duplicate

Status: Good. Copies table name + description + all entries.

## Import/Export

Status: **Missing from this editor specifically, but the data is included in NPC
import/export.**

> **Claude:** Drop tables don't have their own import/export. Add for consistency. These
> are reusable data that multiple NPCs can reference — should be independently
> exportable.

## Missing Features

> **Claude:**
>
> - `[PROPOSED]` Show which NPCs use this drop table (reverse lookup). Critical for
>   understanding impact of changes.
> - `[PROPOSED]` Show item names inline in entry rows instead of just IDs (covered by
>   the SearchableSelect redesign above).
> - `[PROPOSED]` Import/Export for drop tables independently.

## Help Section

> **Claude:** Help documentation should cover:
> - How drop chance works (percentage roll per entry, each entry independent)
> - How item quantity rolls work (random between min and max)
> - How currency drops work (copper amount rolled, converted to denominations)
> - What allowed denominations does (filters which coin types spawn)
> - How to set up guaranteed drops (100% chance) vs rare drops (1-5%)
> - How multiple entries interact (each rolls independently, NPC can drop multiple items)
> - That drop tables are reusable — multiple NPCs can reference the same table
