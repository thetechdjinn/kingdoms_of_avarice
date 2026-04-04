---
name: quest-builder
description: Design and implement complete quests for Kingdoms of Avarice with narrative dialogue, balanced NPCs, and calibrated rewards
allowed-tools: Agent, Read, Write, Edit, Glob, Grep, Bash(ls:*), Bash(git log:*), Bash(git diff:*)
---

# Quest Builder

Design and implement complete quests for Kingdoms of Avarice, a MajorMUD-inspired web MUD. This skill creates quests that feel like hand-crafted MUD content: narrative-driven, immersive, with no UI chrome. The output includes quest design documents, NPC definitions, drop tables, and quest JSON ready for import.

## Input

$ARGUMENTS

Accepts either:
- A quest concept (free-form description, e.g., "a level 4-6 quest in the sewers about missing merchants")
- A reference to an existing quest plan file in `notes/quest_plans/`
- No argument: ask the user for the concept

## Workflow

### Phase 1: Discovery and Concept

If no concept is provided, ask the user for:
- Theme and narrative hook
- Target level range
- Area (which zone/area of the game)
- Approximate number of steps (2-5 recommended)
- Whether new NPCs/mobs are needed

Gather context by reading:
1. The relevant area plan from `areas/<area>/plan.md` (geography and rooms).
2. Existing NPCs in the area from `data/areas/<area>/npcs.json`.
3. Existing quests by checking `notes/quest_plans/` for other quest plans.
4. The progression table from `data/global/progression/progression_table.json`.
5. Existing factions from `data/global/factions.json`.
6. The room data from `data/areas/<area>/rooms.json` for room IDs and tags.

### Phase 2: Quest Design Document

Create `notes/quest_plans/<quest_tag>.md` using the Quest Plan Template below. This document is the source of truth for the quest design.

Present the design doc to the user for review before proceeding to implementation. Do NOT proceed to Phase 3 until the user approves or requests changes.

### Phase 3: NPC Creation

For each new NPC needed:

**Quest Giver NPCs** (talk-to NPCs):
- `interactable: true`, `hostile: false`
- `properName: true` for named characters
- Include a 2-4 sentence MUD-style description
- Add thematic `spawnMessage` and room messages
- Optionally add `npcResponses` for ambient dialogue keywords

**Kill Target NPCs** (mobs to fight):
- Use the `/balance-npc` skill to generate balanced stat blocks. Provide: target level, archetype, combat style, difficulty, and theme.
- Create a drop table for each new mob.
- Add thematic augmentations if appropriate (e.g., ["fierce", "scarred", "young"]).

**Output NPC JSON** matching the `data/areas/*/npcs.json` export format.

### Phase 4: Quest Definition

Build the quest JSON matching the schema below. Follow these rules:

1. **Dialogue uses color markup**: NPC/mob names in `{npc}` (magenta), trigger phrases in `{yellow}`, items in `{item}`, locations in `{location}` (cyan).
2. **Completion dialogue hints at the next step**: The player should know what to do next from reading the dialogue.
3. **Trigger text must match what the dialogue suggests**: If completion dialogue says "ask about the crystal key", the next step's `triggerText` should be "crystal key".
4. **Kill steps with `requiredCount > 1`** should have `inProgressDialogue` that acknowledges partial progress.
5. **The last step's `completionDialogue`** wraps up the narrative. It should convey rewards through flavor text, not numbers.
6. **`denialDialogue`** is shown when the player doesn't meet prerequisites. Keep it short and in-character.
7. **`completedDialogue`** is shown when the player talks to the quest giver after completing the quest. A brief acknowledgment.

### Phase 5: Output

Produce the following artifacts:

1. **Quest design document** (already created in Phase 2, updated with any changes from review).
2. **NPC JSON blocks** for new NPCs, matching the data export format.
3. **Drop table JSON blocks** for new mobs.
4. **Quest definition JSON** as a REST API payload for `POST /api/quests` or for import.

Present all output to the user. Do NOT write to data files or call APIs unless the user explicitly asks.

## Quest Schema Reference

### Quest Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Display name |
| `tag` | string | auto | Unique slug, auto-generated from name if omitted |
| `description` | string | no | Journal description, supports color markup |
| `questGiverNpcId` | number | no | FK to NPC template (resolve by name at import) |
| `minLevel` | number | no | Default 1 |
| `maxLevel` | number | no | Optional ceiling |
| `requiredRaces` | string[] | no | Race name filter |
| `requiredClasses` | string[] | no | Class name filter |
| `requiredFactionId` | number | no | FK to faction |
| `requiredFactionMin` | number | no | Min reputation required |
| `requiredFactionMax` | number | no | Max reputation gate |
| `requiredQuestIds` | number[] | no | Prerequisite quest IDs |
| `requiredQuestTags` | string[] | no | Prerequisite quest tags (preferred over IDs) |
| `xpReward` | number | no | Default 0 |
| `essenceReward` | number | no | Default 0 |
| `currencyReward` | number | no | In copper, default 0 |
| `itemRewards` | array | no | `[{itemTemplateId, quantity}]` |
| `factionRewards` | array | no | `[{factionId, amount}]` |
| `questFlag` | string | no | Persistent flag granted on completion |
| `denialDialogue` | string | no | Shown when prerequisites not met |
| `completedDialogue` | string | no | Shown on re-talk after completion |
| `enabled` | boolean | no | Default true |
| `sortOrder` | number | no | Default 0 |
| `steps` | array | yes | Ordered list of QuestStep objects |

### QuestStep Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `stepOrder` | number | yes | 1-based, sequential |
| `triggerType` | string | yes | `talk`, `kill`, or `visit` |
| `triggerNpcId` | number | conditional | Required for `talk` and `kill` |
| `triggerItemTemplateId` | number | no | For item-based triggers |
| `triggerRoomId` | number | conditional | Required for `visit` |
| `triggerText` | string | conditional | Keyword for `talk` triggers |
| `requiredCount` | number | no | Default 1; >1 only for `kill` |
| `consumeItem` | boolean | no | Default true |
| `description` | string | yes | Player-facing journal text |
| `completionDialogue` | string | no | NPC dialogue on step completion |
| `inProgressDialogue` | string | no | NPC dialogue while step active |
| `stepXpReward` | number | no | Per-step XP |
| `stepEssenceReward` | number | no | Per-step essence |
| `stepCurrencyReward` | number | no | Per-step currency (copper) |
| `stepItemRewards` | array | no | Per-step item rewards |
| `stepFactionRewards` | array | no | Per-step faction rep changes |

### Trigger Types

- **talk**: Player says `>npc_name trigger_text` to the quest giver NPC. Requires `triggerNpcId` and `triggerText`.
- **kill**: Player kills `requiredCount` of the specified NPC. Requires `triggerNpcId`.
- **visit**: Player enters the specified room. Requires `triggerRoomId`.

## Color Markup Reference

Quest dialogue fields support inline color markup: `{colorName}text{/}`.

### Standard Quest Dialogue Colors

| Element | Tag | Color | Purpose |
|---------|-----|-------|---------|
| Base text | (none) | Green | Narration, default dialogue |
| NPC/mob names | `{npc}` | Magenta | Who the player interacts with |
| Keywords/triggers | `{yellow}` | Yellow | Action phrases, things to say/do |
| Locations | `{location}` | Cyan | Places to go |
| Items | `{item}` | Bright blue | Item names |
| Currency | `{gold}` | Bright yellow | Currency references |
| Danger | `{red}` | Red | Warnings, threats |
| Emphasis | `{bold}` | Bold white | General emphasis |
| Subdued | `{gray}` | Gray | Parenthetical, aside |

### Other Available Colors

`red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`/`grey`, `gold`, `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightCyan`, `brightWhite`, `boldCyan`, `boldGreen`, `boldYellow`, `boldRed`, `boldWhite`, `npc`, `player`, `system`, `error`, `location`

### Variables

- `{name}` inserts the player's character name.
- `{/}` closes the current color and returns to base.

### Dialogue Conventions

- Never use em dashes. Use periods, commas, colons, or semicolons.
- Write in second person present tense for action: "She hands you a worn map."
- Keep paragraphs short (2-4 sentences). Dialogue wraps at 70 characters with 4-space left indent.
- Quest completion dialogue conveys rewards through flavor text, not numbers.
- `inProgressDialogue` is a short NPC response when the player returns without finishing the step.
- `denialDialogue` is shown when prerequisites are not met. Keep it brief and in-character.
- `completedDialogue` is shown on re-talk after the quest is done. A brief acknowledgment.

## Reward Calibration

### Progression Table

| Level | XP to Next | Essence (base) |
|-------|-----------|----------------|
| 2 | 300 | 50 |
| 3 | 720 | 100 |
| 4 | 1,400 | 175 |
| 5 | 2,500 | 300 |
| 6 | 4,200 | 500 |
| 7 | 6,900 | 800 |
| 8 | 11,000 | 1,200 |
| 9 | 17,000 | 1,800 |
| 10 | 25,500 | 2,700 |
| 12 | 56,000 | 5,800 |
| 15 | 167,000 | 17,000 |
| 20 | 917,000 | 92,000 |

### Quest Reward Guidelines

A quest should reward **1/6 to 1/2** of the XP needed for the target level's next level-up.

| Level Band | XP to Level | Quest XP Range | Quest Currency (copper) |
|------------|------------|----------------|------------------------|
| 1-2 | 300 | 50-150 | 10-50 |
| 2-3 | 720 | 100-350 | 25-100 |
| 3-4 | 1,400 | 200-700 | 50-200 |
| 4-5 | 2,500 | 400-1,200 | 100-500 |
| 5-6 | 4,200 | 600-2,000 | 200-1,000 |
| 7-8 | 6,900-11,000 | 1,000-3,000 | 500-2,000 |
| 9-10 | 17,000-25,500 | 2,500-8,000 | 1,000-5,000 |

Multi-step quests with kill requirements lean toward the higher end. Short talk-only quests lean lower. Essence rewards should be 10-30% of the base_essence_required for the target level.

## Quest Plan Template

Use this template when creating `notes/quest_plans/<quest_tag>.md`:

```markdown
# Quest: <Display Name>

**Tag:** `<quest_tag>`
**Area:** <area name>
**Target Level:** <min>-<max>
**Steps:** <count>
**Status:** Draft

## Overview

<1-2 paragraph narrative summary of the quest. What is the hook? What does the player do? How does it end?>

## Prerequisites

- Min level: <N>
- Max level: <N or none>
- Required quests: <list or none>
- Required faction: <faction and min rep, or none>
- Required races/classes: <restrictions or none>

## NPCs Involved

| NPC | Role | New/Existing | Location |
|-----|------|-------------|----------|
| <name> | Quest giver | New | <room/area> |
| <name> | Kill target | New | <room/area> |

## Step Breakdown

### Step 1: <title>
- **Trigger:** talk / kill / visit
- **Target:** <NPC name or room>
- **Trigger text:** "<phrase>" (for talk triggers)
- **Required count:** <N> (for kill triggers)
- **Description (journal):** <what the player sees in quest log>
- **Completion dialogue:**
  <full prose with color markup, as the NPC would say it>
- **In-progress dialogue:**
  <what the NPC says if the player returns without completing>
- **Step rewards:** <if any intermediate rewards>

### Step 2: <title>
...

## Final Rewards

- XP: <amount> (rationale: <% of level-up XP>)
- Essence: <amount>
- Currency: <amount in copper> (<display denomination>)
- Items: <list or none>
- Faction: <faction name> +<amount> or none
- Quest flag: `<flag_tag>` or none

## Lore Notes

<How this quest connects to the world, existing factions, NPCs, and other quests. Any future quest hooks this sets up.>

## New NPCs

<For each new NPC, a brief description of their role, personality, and where they spawn. Detailed stat blocks are generated separately by the balance-npc skill.>
```

## NPC JSON Format

New NPCs must match this structure (from the data export format):

```json
{
  "name": "npc name",
  "description": "2-4 sentence description.",
  "health": 100,
  "maxHealth": 100,
  "hostile": false,
  "level": 5,
  "experienceReward": 0,
  "maxMana": 0,
  "baseAccuracy": 50,
  "baseDefense": 50,
  "baseCritChance": 5,
  "baseDodge": 5,
  "damageReduction": 0,
  "traits": [],
  "fleeEnabled": false,
  "fleeHpPercent": 20,
  "callForHelpChance": 0,
  "interactable": true,
  "allowedAreas": [],
  "roamEnabled": false,
  "roamInterval": 60,
  "roamChance": 10,
  "essenceReward": 0,
  "essenceClass": null,
  "leaveCorpse": false,
  "corpseDuration": 300,
  "augmentations": [],
  "enterRoomMessage": null,
  "exitRoomMessage": null,
  "spawnMessage": null,
  "deathMessage": null,
  "merchantEnabled": false,
  "properName": true,
  "spellPower": 0,
  "combatLevel": 1,
  "enabled": true,
  "attacks": []
}
```

For hostile kill-target NPCs, use the `/balance-npc` skill output instead of the template above.
