# Quest System Guide

[← Back to Documentation](README.md)

This guide covers the quest system in Kingdoms of Avarice — designing, creating, and managing step-based quests using the Quest Editor and in-game admin commands.

## Overview

Quests are linear sequences of **steps**, each triggered by a specific in-game event. Players discover, accept, progress through, and complete quests to earn rewards. Quests are one-time per character (with admin reset capability).

### Key Concepts

- **Step-based workflow**: Each quest is an ordered list of steps. The first step's trigger starts the quest; the last step's completion finishes it.
- **Three trigger types**: `talk` (directed speech to an NPC), `kill` (defeat a specific NPC type), `visit` (enter a specific room).
- **Hidden future steps**: Players only see completed steps and the current objective — never what comes next.
- **Quest flags**: Completing a quest can set a flag that unlocks doors or enables other game content.

## Quest Editor

Access via **Developer > Quest Editor** from any editor page, or navigate directly to `/quest-editor.html`.

### Creating a Quest

1. Click **+ New Quest**
2. Fill in the five tabs:

#### Basic Tab

| Field | Description |
| ----- | ----------- |
| Tag | Unique identifier (auto-generated from name if blank) |
| Name | Display name shown to players |
| Description | Quest description shown in the quest journal |
| Quest Giver NPC ID | The NPC template that offers this quest |
| Sort Order | Controls quest priority when multiple quests share an NPC |
| Quest Flag | Flag set on completion (used for door access, prerequisites) |
| Enabled | Whether the quest is active in the game |

#### Requirements Tab

| Field | Description |
| ----- | ----------- |
| Min/Max Level | Level range the player must be within |
| Required Races | Comma-separated race names (empty = any) |
| Required Classes | Comma-separated class names (empty = any) |
| Required Faction ID | Faction the player must have reputation with |
| Min/Max Reputation | Required reputation range for the faction |
| Prerequisite Quest IDs | Comma-separated quest IDs that must be completed first |

#### Steps Tab

Each step defines one objective the player must complete. Steps are processed in order.

| Field | Description |
| ----- | ----------- |
| Description | What appears in the player's quest journal |
| Trigger Type | `talk`, `kill`, or `visit` |
| Required Count | How many times the trigger must fire (mainly for `kill`) |
| NPC ID | NPC template ID for `talk` or `kill` triggers |
| Room ID | Room ID for `visit` triggers |
| Item Template ID | Item the player must have (for `talk` collect/deliver quests) |
| Trigger Text | Keyword the player must say (for `talk` triggers) |
| Consume Item | Whether the trigger item is removed on step completion |
| Completion Dialogue | NPC speech when the step completes — hints at the next objective |
| In-Progress Dialogue | NPC speech if the player talks before completing the step |
| Step XP/Essence/Currency | Intermediate rewards given on step completion |

Use the arrow buttons to reorder steps, or **Remove** to delete a step.

#### Rewards Tab

Final rewards granted when the entire quest is completed:

| Field | Description |
| ----- | ----------- |
| XP Reward | Experience points |
| Essence Reward | Essence (class-gated currency) |
| Currency Reward | Copper farthings |
| Item Rewards | Items granted (template ID + quantity) |
| Faction Rewards | Reputation changes (faction ID + amount) |

#### Dialogue Tab

| Field | Description |
| ----- | ----------- |
| Denial Dialogue | NPC says this if the player doesn't meet requirements |
| Completed Dialogue | NPC says this if the player already completed the quest |

### Import/Export

- **Export**: Download all quests as JSON
- **Import**: Upload a JSON file; enable "Merge" to update existing quests by tag

## Trigger Types

### Talk Trigger

The player uses directed speech to an NPC: `>npc_name keyword`

- Set the **NPC ID** to the quest giver or relevant NPC
- Set **Trigger Text** to the keyword the player must say
- Optionally set **Item Template ID** for collect/deliver mechanics — the player must have the item in inventory
- If **Consume Item** is checked, the item is removed when the step completes

**Example**: Player must bring an iron key to the Elder and say "deliver key":
- Trigger Type: `talk`
- NPC ID: Elder's template ID
- Item Template ID: iron key's template ID
- Trigger Text: `deliver key`
- Consume Item: checked

### Kill Trigger

The player must defeat a specific NPC type a certain number of times.

- Set **NPC ID** to the target NPC template
- Set **Required Count** for how many kills are needed
- Progress is tracked automatically and shown in the quest journal as `(3/5)`

### Visit Trigger

The player must enter a specific room.

- Set **Room ID** to the target room
- Triggers immediately on room entry

## Step Guidance

When a step completes, the `completion_dialogue` tells the player what happened and hints at what to do next. This is the primary mechanism for guiding players through multi-step quests.

**Design tips:**
- Highlight NPC names and trigger keywords in the dialogue so players know what to type
- Some quests can be explicit ("Go tell Bob: ask about the crystal"); others can be vague for exploration
- Players never see future steps, so the completion dialogue is their only guide

## Player Commands

| Command | Description |
| ------- | ----------- |
| `quest` | List active and available quests |
| `quest log` | Show current quest journal with step progress |
| `quest info <name>` | Show details for a specific quest |

## Admin Commands

All require DEVELOPER role or higher.

| Command | Description |
| ------- | ----------- |
| `@quest list` | List all quest definitions |
| `@quest info <id/tag>` | Show quest details including all steps |
| `@quest start <id/tag> [player]` | Force-start a quest for a player |
| `@quest advance <id/tag> [player]` | Advance a player to the next step |
| `@quest complete <id/tag> [player]` | Force-complete a quest for a player |
| `@quest reset <id/tag> [player]` | Reset a quest (clear progress and flags) |
| `@quest reload` | Reload quest cache from database |
| `@reload quests` | Same as above (via general reload) |

## Quest Flags and Doors

When a quest has a **Quest Flag** set (e.g., `sewer_access`), completing the quest grants that flag to the character. Quest flags can be used as door requirements in the Door Editor — only characters with the flag can pass through the door.

## Database Schema

### quests

| Column | Type | Description |
| ------ | ---- | ----------- |
| `id` | SERIAL | Primary key |
| `tag` | VARCHAR | Unique identifier |
| `name` | VARCHAR | Display name |
| `description` | TEXT | Quest description |
| `quest_giver_npc_id` | INTEGER | NPC that offers the quest |
| `min_level` / `max_level` | INTEGER | Level requirements |
| `required_races` / `required_classes` | TEXT[] | Race/class requirements |
| `required_faction_id` | INTEGER | Faction requirement |
| `required_quest_ids` | INTEGER[] | Prerequisite quests |
| `xp_reward` / `essence_reward` / `currency_reward` | INTEGER/BIGINT | Completion rewards |
| `item_rewards` / `faction_rewards` | JSONB | Structured reward data |
| `quest_flag` | VARCHAR | Flag granted on completion |
| `enabled` | BOOLEAN | Whether quest is active |
| `sort_order` | INTEGER | Priority ordering |

### quest_steps

| Column | Type | Description |
| ------ | ---- | ----------- |
| `id` | SERIAL | Primary key |
| `quest_id` | INTEGER | Parent quest (FK) |
| `step_order` | INTEGER | Step sequence number |
| `trigger_type` | VARCHAR | `talk`, `kill`, or `visit` |
| `trigger_npc_id` | INTEGER | Target NPC template |
| `trigger_item_template_id` | INTEGER | Required item |
| `trigger_room_id` | INTEGER | Target room |
| `trigger_text` | VARCHAR | Speech keyword |
| `required_count` | INTEGER | Kill count required |
| `consume_item` | BOOLEAN | Remove item on completion |
| `description` | TEXT | Journal text |
| `completion_dialogue` / `in_progress_dialogue` | TEXT | NPC dialogue |
| `step_xp_reward` / `step_essence_reward` / `step_currency_reward` | INTEGER/BIGINT | Step rewards |
| `step_item_rewards` / `step_faction_rewards` | JSONB | Step reward data |

## API Endpoints

All endpoints require Developer role or higher.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/quests` | List all quests with steps |
| GET | `/api/quests/:id` | Get single quest |
| POST | `/api/quests` | Create quest |
| PUT | `/api/quests/:id` | Update quest (include `steps` array to replace steps) |
| DELETE | `/api/quests/:id` | Delete quest |
| GET | `/api/quests/export` | Export all quests as JSON |
| POST | `/api/quests/import` | Import quests from JSON (`{ quests: [...], merge: true }`) |

---

[← Back to Documentation](README.md)
