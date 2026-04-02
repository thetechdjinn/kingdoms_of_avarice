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

## How Quest Output Works

Quest event output (starting a quest, completing a step, finishing a quest) shows **only the dialogue text you write**. The system never injects headers, borders, labels, reward summaries, or any other formatting around your text. You control the entire player experience through your prose.

When a step completes, the player sees exactly what you put in the **Completion Dialogue** field, rendered with color markup and word-wrapped to 80 characters. Nothing else.

Rewards (XP, essence, currency, items, faction reputation) are granted silently behind the scenes. If you want the player to know an NPC handed them a pouch of gold, you write that into the narrative. The player can always check their inventory or use the `quest` command to see status.

### Color Markup

All dialogue fields support inline color tags to highlight key words. The syntax is:

```
{colorName}highlighted text{/}
```

Untagged text renders in **cyan** by default. Use tags only for words that need to stand out.

**Available colors:** `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, `gold`, `boldCyan`, `boldGreen`, `boldYellow`, `boldRed`, `boldWhite`, `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightCyan`, `brightWhite`, `bold`, `item`, `npc`, `player`, `system`, `error`

**Example** (what you write in the Completion Dialogue field):

```
Elder Maren whispers, "The ruby was stolen from the cathedral
vault. Seek out {boldCyan}Bob the Builder{/} in the Ironwood
District. Tell him: {boldYellow}ask about the ruby{/}."
```

The player sees this in cyan with "Bob the Builder" in bold cyan and "ask about the ruby" in bold yellow, so they know the NPC to find and the phrase to say.

### Variables

Use `{name}` to insert the player's character name into dialogue text:

```
"Ah, {name}, I've been expecting you. I have a task that
requires someone of your talents."
```

If the character's name is "Aldric", the player sees: "Ah, Aldric, I've been expecting you..."

Variables are replaced before color processing, so you can combine them with color tags: `{boldCyan}{name}{/}` renders the player's name in bold cyan.

| Variable | Description |
| -------- | ----------- |
| `{name}` | The player's character name |

**Tips:**
- Use `{boldCyan}` for NPC names the player needs to find
- Use `{boldYellow}` for trigger phrases the player needs to say
- Use `{item}` for item names
- Use `{gold}` for currency references
- Use `{name}` to address the player by name
- Tags are case-insensitive: `{BoldCyan}` and `{boldcyan}` both work
- `{/}` closes the current color and returns to cyan
- The Dialogue tab and step Completion Dialogue fields have a live color preview below the text area

## Quest Editor

Access via **Developer > Quest Editor** from any editor page, or navigate directly to `/quest-editor.html`.

### Creating a Quest

1. Click **+ New Quest**
2. Fill in the five tabs:

#### Basic Tab

| Field | Description |
| ----- | ----------- |
| Tag | Unique identifier for the quest (e.g., `arindale_lost_ruby`). Must be unique across all quests. |
| Name | Display name shown to players in their quest journal |
| Description | Quest description shown in the quest journal summary |
| Quest Giver NPC | The NPC that offers this quest. Type to search by name. |
| Sort Order | Controls quest priority when multiple quests are available from the same NPC (lower = checked first) |
| Quest Flag | A string flag granted to the character on completion (e.g., `sewer_access`). Used for door requirements and quest prerequisites. |
| Enabled | Whether the quest is active in the game. Disabled quests cannot be started. |

#### Requirements Tab

Prerequisites the player must meet before the quest can be started. All conditions must be met (AND logic).

| Field | Description |
| ----- | ----------- |
| Min Level | Player must be at least this level (default: 1) |
| Max Level | Player must be at most this level (empty = no cap) |
| Required Races | Comma-separated race names the player must be (empty = any race) |
| Required Classes | Comma-separated class names the player must be (empty = any class) |
| Required Faction ID | A faction the player must have reputation with |
| Min/Max Reputation | The reputation range required with the above faction |
| Prerequisite Quest IDs | Comma-separated quest IDs that must ALL be completed first |

If the player doesn't meet requirements and talks to the quest giver, the NPC responds with the **Denial Dialogue** from the Dialogue tab.

#### Steps Tab

Each step defines one objective the player must complete. Steps are processed in order. The first step's trigger starts the quest. The last step's completion finishes it.

**Trigger fields:**

| Field | Description |
| ----- | ----------- |
| Description | What appears in the player's quest journal as the current objective |
| Trigger Type | How the step is completed: `talk` (say something to an NPC), `kill` (defeat an NPC type), or `visit` (enter a room) |
| Required Count | How many times the trigger must fire. Only meaningful for `kill` (e.g., "kill 5 rats"). |
| NPC | The NPC involved. For `talk`: the NPC the player speaks to. For `kill`: the NPC type to defeat. Type to search by name. |
| Visit Room ID | For `visit` triggers only: the room ID the player must enter. |
| Required Item | For `talk` triggers only: an item template ID the player must have in inventory when they say the trigger text. Used for collect/deliver quests (e.g., "bring the key to the Elder"). |
| Trigger Text | For `talk` triggers only: the keyword or phrase the player must include in directed speech (e.g., `ask about the ruby`). Case-insensitive substring match. |
| Consume Item | If a Required Item is set, whether to remove it from inventory when the step completes. |

**Dialogue fields:**

| Field | Description |
| ----- | ----------- |
| Completion Dialogue | The narrative text shown to the player when this step completes. This is the core of the quest experience. Write it as prose that tells the player what happened and hints at what to do next. Supports `{color}` tags. See the live preview below the text area. |
| In-Progress Dialogue | What the NPC says if the player talks to them but hasn't met the step requirements yet (e.g., "Have you found the crystal key yet?"). Only used for `talk` triggers with a Required Item. |

**Step rewards:**

| Field | Description |
| ----- | ----------- |
| Step XP / Essence / Currency | Intermediate rewards granted silently when the step completes |

Step rewards are granted silently. If an NPC hands the player a key mid-quest, write that into the Completion Dialogue ("He hands you a rusty iron key") and set a step item reward so the item appears in their inventory.

Use the arrow buttons to reorder steps, or **Remove** to delete a step.

#### Rewards Tab

Final rewards granted silently when the entire quest is completed:

| Field | Description |
| ----- | ----------- |
| XP Reward | Experience points |
| Essence Reward | Essence |
| Currency Reward | Copper farthings (converted to denominations in inventory) |
| Item Rewards | Items placed in inventory (template ID + quantity) |
| Faction Rewards | Reputation adjustments (faction ID + amount, can be negative) |

These are granted behind the scenes. Write the narrative in the final step's Completion Dialogue to describe what the player receives.

#### Dialogue Tab

Quest-level dialogue shown in specific situations. Supports `{color}` tags with live preview.

| Field | Description |
| ----- | ----------- |
| Denial Dialogue | NPC says this when a player tries to start the quest but doesn't meet the requirements. E.g., "You are not yet experienced enough for this task." |
| Completed Dialogue | NPC says this if the player talks to the quest giver after the quest is already done. E.g., "Thank you again for your help." Leave empty if the NPC should not respond. |

### Import/Export

- **Export**: Download all quests as JSON
- **Import**: Upload a JSON file; enable "Merge" to update existing quests by tag

## Trigger Types

### Talk Trigger

The player uses directed speech to an NPC: `>npc_name keyword`

- Set the **NPC** to the quest giver or relevant NPC (type to search by name)
- Set **Trigger Text** to the keyword the player must say
- Optionally set **Required Item** for collect/deliver mechanics: the player must have this item in inventory when they say the trigger text. If they don't have it, the NPC responds with the In-Progress Dialogue instead.
- If **Consume Item** is checked, the required item is removed from inventory when the step completes

**Example**: Player must bring an iron key to the Elder and say "deliver key":
- Trigger Type: `talk`
- NPC: Elder Maren (search by name)
- Required Item: iron key's template ID
- Trigger Text: `deliver key`
- Consume Item: checked
- Completion Dialogue: `Elder Maren takes the key and nods. "This will open the way to the crypt."`
- In-Progress Dialogue: `Elder Maren looks at you expectantly. "Have you found the key yet?"`

### Kill Trigger

The player must defeat a specific NPC type a certain number of times.

- Set **NPC** to the target NPC template (type to search by name)
- Set **Required Count** for how many kills are needed
- Progress is tracked automatically and shown to the player as `(3/5)` after each kill

### Visit Trigger

The player must enter a specific room.

- Set **Visit Room ID** to the target room's ID
- Triggers immediately when the player enters the room
- Design tip: make sure the previous step takes place somewhere else so the player has to travel

## Designing Quest Flow

The Completion Dialogue is the entire player experience. There are no system-generated headers like "New Quest:" or "Quest Complete!" and no automatic reward summaries. You write everything the player reads.

**Design tips:**
- Use `{boldCyan}NPC Name{/}` to highlight NPCs the player needs to find
- Use `{boldYellow}trigger phrase{/}` to highlight what the player needs to say
- Some quests can be explicit ("Go tell {boldCyan}Bob{/}: {boldYellow}ask about the crystal{/}"); others can be vague for exploration
- Players never see future steps, so the completion dialogue is their only guide to what comes next
- For the final step, write a satisfying conclusion. If the quest grants items or gold, describe the NPC giving them something. The actual reward is granted silently.
- Test your quest in-game to see how the color markup and word wrapping look at 80 characters

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
| `@quest start <player> <quest_tag>` | Force-start a quest for a player |
| `@quest advance <player> <quest_tag>` | Advance a player to the next step |
| `@quest complete <player> <quest_tag>` | Force-complete a quest for a player |
| `@quest reset <player> <quest_tag>` | Reset a quest (clear progress and flags) |
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
