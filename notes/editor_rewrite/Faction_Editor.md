# Faction Editor

This is the design document for the rewrite of the Faction Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Overview

The simplest data editor in the project. Manages factions (organizations that NPCs
belong to). Factions drive merchant pricing through player reputation.

## Layout

Three-panel: faction list (left, 280px), single form (center), preview (right).

> **Claude:** Like the Action Editor, the three-panel layout may be overkill for 3
> fields. Consider a tighter layout during design phase.

## Faction List Panel

Status: Good. Name/type search.

## Form Fields

### Name

Status: Good. Text input, required.

### Type

Status: **Cosmetic only — not used in game logic.**

Dropdown: city, tribal, merchant, guild.

> **Claude:** Faction type is stored and validated but no game code checks it. A "city"
> faction behaves identically to a "merchant" faction. It's purely an organizational
> label in the editor.
>
> Options:
> 1. Keep as-is for categorization (useful for filtering/organizing in the editor)
> 2. Remove if it adds confusion without value
>
> Leaning toward keep — it helps the developer remember what kind of organization this
> is, and could drive behavior in the future (e.g., city factions affect city guard
> aggro, guild factions unlock guild halls). But it should be noted as "(organizational
> label — does not affect gameplay)" in the editor.
>
> The four types are hardcoded in the HTML and in a DB CHECK constraint. If new types
> are needed, both must be updated. Low priority since faction types rarely change.

### Description

Status: Good. Textarea, 4 rows.

## Preview Panel

Status: Good. Shows faction name, type, ID.

## Creation Flow

Status: Good. No prompt() — clears form for new entry.

## Missing Features

> **Claude:**
>
> - `[PROPOSED]` Show which NPCs belong to this faction (reverse lookup). The most
>   useful addition — currently you have to check each NPC's merchant tab to find its
>   faction.
> - `[PROPOSED]` Show which quests reference this faction (faction reputation rewards).
> - `[PROPOSED]` Duplicate function (missing, unlike other editors). Add for consistency.
> - `[PROPOSED]` Import/Export (missing). Add for consistency.
> - `[PROPOSED]` Player reputation viewer — show all players and their reputation with
>   this faction. Low priority but useful for debugging/balancing.

## Help Section

> **Claude:** Help documentation should cover:
> - What factions are used for (merchant pricing based on player reputation)
> - How reputation affects prices (1% discount per 10 positive rep, 2% surcharge per
>   10 negative rep, refuse at -50)
> - How factions connect to NPCs (set on the NPC Editor's Merchant tab)
> - How players earn/lose reputation (quests, future: actions)
> - What the type field means (organizational label, no gameplay effect currently)
