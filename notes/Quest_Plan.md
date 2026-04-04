# Quest System Design

**Status:** Draft — requirements being actively refined.

## Overview

A step-based quest workflow system where players discover, accept, progress through, and complete quests. Each quest is a linear sequence of steps, each triggered by a specific in-game event. Quests are one-time per character (with admin reset capability), can have level/race/class/faction prerequisites, and reward items, XP, essence, currency, and faction reputation.

## Core Concepts

### Quest = Ordered Workflow of Steps

A quest is a named sequence of **steps** (minimum 1). Each step has:

- A **trigger type** — what event completes this step (talk to NPC, kill mob, visit room)
- A **trigger target** — the specific NPC, item, or room involved
- An optional **trigger text** — for speech-based triggers (e.g., "ask about the crystal key")
- A **description** — journal text shown to the player for the current step only
- A **completion_dialogue** — narrative text displayed when the step completes, which also serves as the player's hint for what to do next (see Step Guidance below)
- Optional **step rewards** — intermediate rewards given when the step completes (item appears in inventory, etc.)

The **first step's trigger** is what starts the quest. The **last step's completion** finishes the quest and grants final rewards.

### Step Guidance and Hints

When a step completes, the `completion_dialogue` tells the player what happened narratively and hints (or explicitly tells) them what to do next. Key NPC names and trigger phrases are **highlighted** in the output so the player knows exactly what to type.

**Example flow:**

1. Player says `>elder ask about the crystal` — triggers step 1.
2. The system displays step 1's `completion_dialogue`:
   ```
   Elder Maren leans in close and whispers, "The crystal key was lost
   deep in the Ironwood Forest. Seek out Bob the Builder — he knows
   the old paths. Tell him: ask about crystal key"
   ```
   In the actual output, `Bob the Builder` would be highlighted in magenta (`{npc}`) and `ask about crystal key` would be highlighted in yellow (`{yellow}`) so the player knows those are actionable phrases to use with directed speech.
3. The player's quest journal updates to show only: the completed step and the current objective.

The quest designer controls exactly how much or how little guidance to give. Some quests may spell it out explicitly; others may give only a vague hint and let the player figure it out.

### Hidden Future Steps

**Players never see steps beyond their current one.** The quest journal shows:
- Completed steps (marked as done)
- The current active step (with description and any progress like "3/5 rats killed")
- Nothing else — the total number of steps is hidden

This preserves discovery and prevents players from "reading ahead" in the quest. The player learns what comes next only when they complete the current step and the next step's guidance is revealed.

### One-Time Completion

Each character can complete a quest exactly once. The `character_quests` table enforces a UNIQUE constraint on `(character_id, quest_id)`. A quest reset is simply deleting the character's rows from `character_quests` and `character_quest_progress`.

### Quest States

```
[not started] → ACTIVE → COMPLETED
```

- **Not started**: No row in `character_quests`. Player may discover the quest by talking to an NPC, reading a bulletin board, etc.
- **Active**: Row exists with `status = 'active'`. Player is working through steps.
- **Completed**: Row exists with `status = 'completed'`. Quest is done; rewards granted.

No abandonment in v1. Once started, the player completes it.

## Prerequisites

A quest can require any combination of:

| Prerequisite | Description |
|---|---|
| `min_level` | Character must be at least this level |
| `max_level` | Character must be at most this level (NULL = no cap) |
| `required_races` | Character must be one of these races (NULL = any) |
| `required_classes` | Character must be one of these classes (NULL = any) |
| `required_faction_id` | A faction the character must have standing with |
| `required_faction_min` | Minimum reputation with the required faction |
| `required_faction_max` | Maximum reputation with the required faction (NULL = no cap) |
| `required_quest_ids` | Array of quest IDs that must ALL be completed first (AND logic) |
| `required_quest_tags` | Array of quest tags that must ALL be completed first (AND logic, preferred over IDs) |

Prerequisites are checked when a player attempts to **start** the quest (i.e., triggers the first step). If they don't meet the requirements, the quest giver NPC responds with a `denial_dialogue` (e.g., "You are not yet experienced enough for this task.").

## Trigger Types

Each quest step is completed by one of these event types:

### `talk` — Speak to an NPC

The player uses directed speech (`>npc_name message`) with the trigger text matching a keyword or phrase. This is the most common trigger for starting and ending quests.

**Hook point:** `handleDirectedSpeech()` in `commands.ts`. After existing merchant keyword handling, check for quest triggers on the targeted NPC.

**Example flow:**
1. Player: `>elder ask about the lost artifact`
2. System checks: Is there an active quest step (or startable quest) for this NPC with keyword match "lost artifact"?
3. If yes: complete the step, show dialogue, advance quest state.

**Also handles `collect` and `deliver` patterns.** When a `talk` step has a `trigger_item_template_id` set, the system also checks the player's inventory for that item when the trigger text matches. If the player has the required item, the step completes and the item is consumed. If they don't have it, the NPC can respond with an in-progress hint ("Have you found the crystal key yet?"). This eliminates the need for separate `collect`/`deliver` trigger types with fragile hooks — see Lazy Inventory Checks below.

### `kill` — Defeat a Specific NPC/Mob

The player (or their group) kills a specific NPC template. Can require a count (e.g., "Kill 5 sewer rats").

**Hook point:** `processNpcDeath()` in `npcDeathHandler.ts`. After XP/loot distribution, check if any participating player has an active quest step targeting this NPC template.

**Tracking:** `character_quest_progress.current_count` increments on each qualifying kill. Step completes when `current_count >= required_count`.

**Group credit:** All group members in the same room who participated in combat get credit (same participant list as XP distribution). Each player has their own `character_quest_progress` row, so there is no contention — Node.js processes participants sequentially in the single-threaded event loop.

### `visit` — Enter a Specific Room

The player enters a specific room. Useful for exploration quests.

**Hook point:** `handleMove()` in `commands.ts` (after successful movement). Check if the destination room matches any active quest step.

**Design note:** Quest designers should ensure the previous step takes place in a different location than the visit target, so the player naturally has to travel there. A visit step whose target is the same room the player is already in is a quest design flaw.

### `interact` — Use a Room Feature or Object (Future)

Placeholder for future interactive objects (pull a lever, read a tome, open a chest). Not implemented in v1 but the schema supports adding new trigger types.

## Lazy Inventory Checks (Collect and Deliver)

Rather than hooking into every item acquisition path in the codebase (handleGet, loot distribution, handleBuy, etc.), the quest system uses **lazy inventory checks** at the point of NPC interaction.

**How it works:**

A `talk` step can optionally specify a `trigger_item_template_id`. When the player says the trigger text to the NPC:
1. The system matches the trigger text (keyword check)
2. If `trigger_item_template_id` is set, it also scans the player's inventory for that item
3. If both match: step completes, item is consumed (removed from inventory)
4. If text matches but item is missing: NPC responds with `in_progress_dialogue` ("You don't seem to have the crystal key yet...")

**Why this approach:**
- **Zero fragility** — no hooks scattered across 4+ files that break when new item acquisition paths are added
- **Natural gameplay** — the player talks to the NPC and the NPC checks their bag, just like MajorMUD
- **Simpler trigger types** — only 3 active types needed (`talk`, `kill`, `visit`) instead of 5
- **Item source doesn't matter** — whether the player found the item on the ground, bought it, got it from a mob drop, or received it from another quest step, the check works the same

**For "go collect X" quests:** The step description tells the player what to find. The player acquires the item however they can. When they return to the NPC and use the trigger text, the NPC checks their inventory and advances the quest.

## NPC Quest Dialogue Behavior

When a player uses directed speech with a quest-related NPC, the system checks quest state and responds appropriately:

| Player's Quest State | NPC Behavior |
|---|---|
| **Quest not started, prerequisites met** | NPC responds to trigger text, starts the quest. Shows step 1 `completion_dialogue` with hints. |
| **Quest not started, prerequisites NOT met** | NPC responds with `denial_dialogue` ("You're not experienced enough...") or does not respond. |
| **Quest active, current step matches this NPC** | NPC processes the trigger (text match, optional item check). Advances quest on success. |
| **Quest active, current step does NOT involve this NPC** | NPC does **not** respond to quest-related text. The player's quest log tells them what to do. |
| **Quest already completed** | NPC responds with `completed_dialogue` if configured (e.g., "Thank you again, hero."), or does not respond to quest text at all. |

**Key rule:** NPCs only respond to quest text when it's relevant to the player's current state. No "have you done X yet?" nagging from NPCs the player isn't supposed to be talking to — that's what the quest log is for.

## Quest Items and Death

Quest items (flagged as `no_drop` on the `item_templates` table) have special behavior during the death system:

- **When a player dies:** All normal items and currency are dropped. Items flagged `no_drop` are **retained** — the player keeps them through death.
- **When a player respawns:** They appear at the respawn room (Hall of the Dead) with only their no-drop quest items. Everything else was dropped at the death location.
- **Rationale:** Losing a quest item to death would permanently block quest progress unless the item can be re-acquired. Retaining quest items prevents this frustration while still making death punishing (all other gear and currency is lost).

**Schema change required:** Add `no_drop BOOLEAN DEFAULT FALSE` to the `item_templates` table. The death handler in the existing code checks this flag and skips dropping items where `no_drop = true`.

## Rewards

### Quest Completion Rewards

Granted when the **final step** is completed:

| Reward Type | Description |
|---|---|
| `xp_reward` | Flat XP amount added to the character |
| `essence_reward` | Essence added to the character's wallet |
| `currency_reward` | Copper amount added to inventory (displayed as denominations) |
| `faction_rewards` | JSONB array of `{ faction_id, amount }` — reputation adjustments |
| `item_rewards` | JSONB array of `{ item_template_id, quantity }` — items placed in inventory |
| `quest_flag` | A string flag stored on the character (used by doors, future content gates) |

### Per-Step Rewards (Optional)

Any step can also grant rewards on completion. This allows intermediate rewards like:
- Receiving a key item mid-quest ("The elder hands you an ancient map")
- Getting partial XP for reaching a milestone
- A faction reputation bump for an intermediate action

Per-step rewards use the same JSONB pattern: `step_item_rewards` and `step_faction_rewards` columns on the `quest_steps` table.

### Quest Flags and Doors

The existing `doors.required_quest_flag` column stores a `VARCHAR(100)`. Convention: use the quest's `tag` field (e.g., `"lost_artifact_complete"`). When a quest completes that has a matching `quest_flag` value, the flag is stored in a `character_quest_flags` table. The door permission check in `doorStateManager.ts` queries this table.

## Database Schema

### `quests` — Quest Definitions

```sql
CREATE TABLE IF NOT EXISTS quests (
    id SERIAL PRIMARY KEY,
    tag VARCHAR(100) UNIQUE NOT NULL,          -- Unique string identifier (e.g., "arindale_lost_artifact")
    name VARCHAR(200) NOT NULL,                -- Display name ("The Lost Artifact")
    description TEXT,                          -- Quest journal summary
    quest_giver_npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,

    -- Prerequisites
    min_level INTEGER DEFAULT 1,
    max_level INTEGER,                         -- NULL = no cap
    required_races TEXT[],                     -- NULL = any race
    required_classes TEXT[],                   -- NULL = any class
    required_faction_id INTEGER REFERENCES factions(id) ON DELETE SET NULL,
    required_faction_min INTEGER,              -- NULL = no minimum
    required_faction_max INTEGER,              -- NULL = no maximum
    required_quest_ids INTEGER[] DEFAULT '{}', -- Quest IDs that must be completed first (AND logic)
    required_quest_tags TEXT[] DEFAULT '{}',    -- Quest tags that must be completed first (AND logic)

    -- Completion rewards
    xp_reward INTEGER DEFAULT 0,
    essence_reward INTEGER DEFAULT 0,
    currency_reward BIGINT DEFAULT 0,          -- Copper farthings
    item_rewards JSONB DEFAULT '[]',           -- [{"item_template_id": 5, "quantity": 1}, ...]
    faction_rewards JSONB DEFAULT '[]',        -- [{"faction_id": 3, "amount": 25}, ...]
    quest_flag VARCHAR(100),                   -- Flag granted on completion (for doors, etc.)

    -- Dialogue
    denial_dialogue TEXT,                      -- Shown when prerequisites not met
    completed_dialogue TEXT,                   -- Shown when player talks to giver after quest is done (NULL = no response)

    -- Metadata
    enabled BOOLEAN DEFAULT TRUE,              -- Can be disabled without deleting
    sort_order INTEGER DEFAULT 0,              -- For ordering in quest lists / editors
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `quest_steps` — Ordered Steps Within a Quest

```sql
CREATE TABLE IF NOT EXISTS quest_steps (
    id SERIAL PRIMARY KEY,
    quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,               -- 1-based ordering

    -- Trigger definition
    trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('talk', 'kill', 'visit')),
    trigger_npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,           -- For talk, kill
    trigger_item_template_id INTEGER REFERENCES item_templates(id) ON DELETE SET NULL, -- For talk w/ item check (lazy collect/deliver)
    trigger_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,         -- For visit
    trigger_text VARCHAR(200),                 -- Keyword/phrase for talk triggers
    required_count INTEGER DEFAULT 1,          -- For kill (kill 5 rats)
    consume_item BOOLEAN DEFAULT TRUE,         -- If trigger_item_template_id is set, remove item on completion?

    -- Display
    description TEXT NOT NULL,                 -- Journal text for the CURRENT step: "Find the crystal key and return it to Bob"
    completion_dialogue TEXT,                  -- Narrative text shown when this step completes; serves as hint/guidance for next step
    in_progress_dialogue TEXT,                 -- Shown when player talks to step NPC but hasn't met requirements (e.g., missing item)

    -- Per-step rewards (optional)
    step_xp_reward INTEGER DEFAULT 0,
    step_essence_reward INTEGER DEFAULT 0,
    step_currency_reward BIGINT DEFAULT 0,
    step_item_rewards JSONB DEFAULT '[]',      -- [{"item_template_id": 5, "quantity": 1}, ...]
    step_faction_rewards JSONB DEFAULT '[]',   -- [{"faction_id": 3, "amount": 10}, ...]

    -- Constraints
    UNIQUE(quest_id, step_order)
);
```

### `character_quests` — Per-Character Quest State

```sql
CREATE TABLE IF NOT EXISTS character_quests (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    current_step INTEGER NOT NULL DEFAULT 1,   -- Which step_order the player is on
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    UNIQUE(character_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_character_quests_char ON character_quests(character_id);
CREATE INDEX IF NOT EXISTS idx_character_quests_active ON character_quests(character_id, status) WHERE status = 'active';
```

### `character_quest_progress` — Kill Counting

```sql
CREATE TABLE IF NOT EXISTS character_quest_progress (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    quest_step_id INTEGER NOT NULL REFERENCES quest_steps(id) ON DELETE CASCADE,
    current_count INTEGER DEFAULT 0,

    UNIQUE(character_id, quest_step_id)
);
```

### `character_quest_flags` — Completed Quest Flags (for Doors, etc.)

```sql
CREATE TABLE IF NOT EXISTS character_quest_flags (
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    flag VARCHAR(100) NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (character_id, flag)
);
```

### Schema Change to Existing Table

```sql
-- Add no_drop flag to item_templates for quest items
ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS no_drop BOOLEAN DEFAULT FALSE;
```

**Total: 4 new tables + 1 column on existing table.** The three separate reward tables from the earlier draft have been replaced with JSONB columns on `quests` and `quest_steps`, validated at cache load time.

## Integration Points (Hooks)

The quest system uses only **3 hooks** into existing code, consistent with the codebase's direct-call architecture.

### Hook 1: Directed Speech → Quest Trigger Check

**Location:** `commands.ts` → `handleDirectedSpeech()`

After the existing merchant keyword check, add quest trigger evaluation:

```
if NPC has associated quests (via questNpcIndex):
  for each quest:
    check player's quest state vs. this NPC + trigger text
    handle according to NPC Quest Dialogue Behavior table above
    if step matched and requirements met: advance quest, show dialogue
```

This single hook handles quest starts, talk triggers, and lazy collect/deliver checks.

### Hook 2: NPC Death → Kill Quest Progress

**Location:** `npcDeathHandler.ts` → `processNpcDeath()`

After XP/essence distribution:

```
for each player who participated in the kill:
  check if player has active quest step with trigger_type='kill' and trigger_npc_id=dead NPC's template
  if yes: increment progress count
  if current_count >= required_count: complete step, advance quest
```

### Hook 3: Room Entry → Visit Quest Progress

**Location:** `commands.ts` → `handleMove()` (after successful room transition)

```
after player enters new room:
  check if player has active quest step with trigger_type='visit' and trigger_room_id=new room
  if yes: complete step
```

Quest designers should ensure the prior step is in a different location than the visit target.

### Hook 4: Door Permission → Quest Flag Check

**Location:** `doorStateManager.ts` → permission check function

```
if door has required_quest_flag:
  check character_quest_flags table for matching flag
  if not found: deny access with denial_message
```

### Hook 5: Death Handler → No-Drop Item Preservation

**Location:** Death/item drop logic (existing death handler code)

```
when dropping player items on death:
  skip items where item_template.no_drop = true
```

## In-Game Commands

### Player Commands

| Command | Alias | Description |
|---|---|---|
| `quest` | `qu` | List active quests with current step summary |
| `quest log` | `qu log` | Detailed quest journal — completed steps + current step only |
| `quest info <name>` | `qu info` | View a specific quest's details and progress |

### Admin/Developer Commands

| Command | Description |
|---|---|
| `@quest list` | List all quest definitions |
| `@quest info <id\|tag>` | Show full quest definition with all steps |
| `@quest reset <player> <quest_tag>` | Reset a player's quest (delete progress, flags; future: remove quest items) |
| `@quest complete <player> <quest_tag>` | Force-complete a quest for a player |
| `@quest start <player> <quest_tag>` | Force-start a quest for a player |
| `@quest advance <player> <quest_tag>` | Advance to next step |
| `@quest reload` | Reload quest definitions from DB |

## Quest Display Format

### Designer Text Only

Quest event output (start, step completion, quest completion) shows **only** the dialogue text written by the quest designer. The system never injects headers, borders, labels, reward summaries, or any other chrome. The designer controls the entire player experience through their prose.

Rewards (XP, essence, currency, items, faction rep) are granted silently. The designer writes the narrative to convey what the player receives (e.g., "She hands you a small pouch").

The `quest` and `quest log` commands are the only place where structured status information appears, and only when the player explicitly asks for it.

### Color Markup

All dialogue fields support inline color markup using `{color}text{/}` tags. See the **Color Markup Reference** section below for full details.

### Quest Start Message

When the first step triggers, only the step's `completionDialogue` is shown:

```
Elder Maren leans in close and whispers, "The artifact
was stolen and taken to the Sunken Crypt. Seek out
Bob the Builder in the Ironwood District. Tell him:
ask about the artifact. He will know what to do."
```

(In-game, "Bob the Builder" and "ask about the artifact" would be highlighted with color tags.)

### Step Completion Message

When a step completes, only that step's `completionDialogue` is shown:

```
The tomb guardian crumbles to dust, revealing a hidden
passage behind the altar. Search the guardian's chamber
for the artifact.
```

### Quest Completion Message

When the final step completes, only that step's `completionDialogue` is shown. Rewards are granted silently:

```
Elder Maren takes the artifact and holds it to the
light. "You have done a great service to the cathedral.
This will not be forgotten." She reaches into her robes
and produces a small pouch. "Take this, with my
gratitude."
```

### Quest List (`quest`)

Player-initiated command showing active quests with current objective. Displays a bordered list with quest names, current step descriptions, and kill progress where applicable.

### Quest Log (`quest log`)

Player-initiated command showing quest details for the active quest. Displays a bordered panel with quest description, completed steps (marked with checkmarks), and the current step. Future steps are hidden. Rewards are not shown.

## Color Markup Reference

Quest dialogue fields (`completionDialogue`, `inProgressDialogue`, `denialDialogue`, `completedDialogue`) support inline color markup.

### Syntax

```
{colorName}highlighted text{/}
```

- `{color}` opens a color span. `{/}` closes it back to the base color (green).
- Tags are case-insensitive: `{Cyan}` and `{cyan}` both work.
- Nesting is not supported. Opening a new color tag implicitly closes the previous one.
- Unclosed tags auto-close at end of text. Unrecognized tag names are left as literal text.

### Available Colors

| Tag | Description |
|---|---|
| `red` | Red |
| `green` | Green |
| `yellow` | Yellow |
| `blue` | Blue |
| `magenta` | Magenta |
| `cyan` | Cyan |
| `white` | White |
| `gray` / `grey` | Gray |
| `gold` | Bright yellow |
| `brightRed` | Bright red |
| `brightGreen` | Bright green |
| `brightYellow` | Bright yellow |
| `brightBlue` | Bright blue |
| `brightCyan` | Bright cyan |
| `brightWhite` | Bright white |
| `bold` | Bold white |
| `boldCyan` | Bold cyan |
| `boldGreen` | Bold green |
| `boldYellow` | Bold yellow |
| `boldRed` | Bold red |
| `boldWhite` | Bold white |
| `item` | Bright blue (item highlight) |
| `npc` | Magenta (NPC/mob names) |
| `player` | Bright cyan (player highlight) |
| `system` | Yellow (system text) |
| `error` | Red (error text) |
| `location` | Cyan (location/place names) |

### Base Color

All untagged text renders in **green** by default (MajorMUD style). Color tags are only needed for words that should stand out from the base.

### Quest Dialogue Color Conventions

| Element | Tag | Color | Purpose |
|---------|-----|-------|---------|
| Base text | (none) | Green | Narration, default dialogue |
| NPC/mob names | `{npc}` | Magenta | Who the player interacts with |
| Keywords/triggers | `{yellow}` | Yellow | Action phrases, things to say/do |
| Locations | `{location}` | Cyan | Places to go |
| Items | `{item}` | Bright blue | Item names |

Dialogue is rendered with a 4-space left indent and 70-character wrap width, visually distinct from standard game output.

### Example

What the designer writes in the `completionDialogue` field:

```
Elder Maren whispers, "Seek out {npc}Bob the Builder{/} in the
{location}Ironwood District{/}. Tell him: {yellow}ask about the artifact{/}."
```

What the player sees (green base with magenta NPC name, cyan location, yellow trigger phrase, indented 4 spaces):

```
    Elder Maren whispers, "Seek out Bob the Builder in the
    Ironwood District. Tell him: ask about the artifact."
```

### Variables

Use `{name}` to insert the player's character name into dialogue. Variables are replaced before color processing, so `{boldCyan}{name}{/}` renders the name in bold cyan.

| Variable | Description |
|---|---|
| `{name}` | The player's character name |

### Quest Editor

The Dialogue tab in the quest editor shows a color tag legend with available colors. Each dialogue textarea has a live color preview below it that approximates the in-game output. Step completion dialogue fields also have live previews. `{name}` is shown as "PlayerName" in the preview.

## File Structure

Following existing codebase patterns:

```
packages/server/src/
  db/
    repositories/
      questRepository.ts        -- Quest definition CRUD, character quest state
    schema_quests.sql            -- Quest tables (loaded by migrate.ts)
  game/
    questCommands.ts             -- Player quest commands (quest, quest log, etc.)
    questManager.ts              -- Core quest logic: trigger checking, step advancement, rewards
  services/
    questService.ts              -- Higher-level quest operations (start, advance, complete, reset)

packages/shared/src/
  quest.ts                       -- Shared quest types and interfaces (or added to index.ts)
```

### Key Interfaces (Shared)

```typescript
export type QuestTriggerType = 'talk' | 'kill' | 'visit';
export type QuestStatus = 'active' | 'completed';

export interface Quest {
  id: number;
  tag: string;
  name: string;
  description: string | null;
  questGiverNpcId: number | null;
  minLevel: number;
  maxLevel: number | null;
  requiredRaces: string[] | null;
  requiredClasses: string[] | null;
  requiredFactionId: number | null;
  requiredFactionMin: number | null;
  requiredFactionMax: number | null;
  requiredQuestIds: number[];
  requiredQuestTags: string[];
  xpReward: number;
  essenceReward: number;
  currencyReward: number;
  itemRewards: QuestItemReward[];
  factionRewards: QuestFactionReward[];
  questFlag: string | null;
  denialDialogue: string | null;
  completedDialogue: string | null;
  enabled: boolean;
  sortOrder: number;
  steps: QuestStep[];
}

export interface QuestStep {
  id: number;
  questId: number;
  stepOrder: number;
  triggerType: QuestTriggerType;
  triggerNpcId: number | null;
  triggerItemTemplateId: number | null;
  triggerRoomId: number | null;
  triggerText: string | null;
  requiredCount: number;
  consumeItem: boolean;
  description: string;
  completionDialogue: string | null;
  inProgressDialogue: string | null;
  stepXpReward: number;
  stepEssenceReward: number;
  stepCurrencyReward: number;
  stepItemRewards: QuestItemReward[];
  stepFactionRewards: QuestFactionReward[];
}

export interface QuestItemReward {
  itemTemplateId: number;
  quantity: number;
}

export interface QuestFactionReward {
  factionId: number;
  amount: number;
}

export interface CharacterQuest {
  characterId: number;
  questId: number;
  status: QuestStatus;
  currentStep: number;
  startedAt: Date;
  completedAt: Date | null;
}
```

## Runtime Architecture

### Quest Definition Cache

Quest definitions are loaded from the database into an in-memory cache on server startup (following the same pattern as NPC templates, item templates, merchant responses, etc.):

```typescript
// questManager.ts
const questCache = new Map<number, Quest>();       // by ID
const questTagIndex = new Map<string, Quest>();     // by tag
const questNpcIndex = new Map<number, Quest[]>();   // NPC template ID → quests where NPC is giver/step target
```

The cache is rebuilt on `@quest reload` or `@reload quests` / `@reload all`.

JSONB reward columns are parsed and validated at load time. Invalid item/faction IDs are logged as warnings.

### Trigger Evaluation Flow

When a potential quest trigger event occurs:

```
1. Look up quests associated with the trigger source (NPC, room)
2. For each matching quest:
   a. Is the quest enabled?
   b. Has the character already completed it?
      - Yes + talk trigger: show completed_dialogue if configured, otherwise skip
      - Yes + other trigger: skip
   c. Does the character have it active?
      - Yes: Is the current step's trigger matched?
        - For talk: check trigger text match + optional item check
        - For kill: check NPC template match, increment count
        - For visit: check room match
        - If matched and requirements met: advance step
        - If talk matched but item missing: show in_progress_dialogue
      - No: Is this the first step's trigger?
        - Check prerequisites → start quest or show denial_dialogue
3. If advancing/starting:
   a. Update character_quests / character_quest_progress in DB
   b. Grant step rewards (if any)
   c. If final step completed: grant quest rewards, set status='completed', set quest flag
   d. Send quest update messages to player
```

### Group Quest Credit

For `kill` triggers: all group members in the same room who participated in combat get credit (same participant list as XP distribution in `npcDeathHandler.ts`). Each group member's individual quest progress is updated independently.

For all other triggers: only the player who performed the action gets credit (talked to NPC, entered room).

## Quest Editor (Future)

A web-based quest editor following the pattern of the existing room editor, item editor, etc. Entry point: `quest-editor.html`.

Features:
- Create/edit quest definitions with a visual step builder
- Drag-and-drop step reordering
- NPC/item/room pickers (dropdown selects loaded from existing data)
- Prerequisite configuration
- Reward configuration (JSONB editor for item/faction rewards)
- Enable/disable toggle
- Test quest flow (simulate triggers)

This is lower priority than the game-side implementation. Quests can initially be managed via direct database inserts or a seed script, following the area data pattern.

## Admin Quest Reset

Resetting a quest for a character:

```sql
-- Delete all progress for this character + quest
DELETE FROM character_quest_progress
WHERE character_id = $1
  AND quest_step_id IN (SELECT id FROM quest_steps WHERE quest_id = $2);

-- Delete the character's quest record
DELETE FROM character_quests
WHERE character_id = $1 AND quest_id = $2;

-- Delete any quest flags granted by this quest
DELETE FROM character_quest_flags
WHERE character_id = $1
  AND flag = (SELECT quest_flag FROM quests WHERE id = $2);
```

This cleanly resets the character to a "never started" state for that quest.

**Future enhancement:** Also look up items granted by the quest's step rewards and completion rewards, and remove matching items from the character's inventory. Deferred for now — admins can manually remove items if needed.

## Implementation Phases

### Phase 1: Schema and Repository Layer

- Create `schema_quests.sql` with all quest tables
- Add `no_drop` column to `item_templates`
- Add migration loading in `migrate.ts`
- Create `questRepository.ts` with full CRUD:
  - Quest definitions (get, getAll, getByTag, getByNpcId)
  - Quest steps (get by quest, get by quest + step_order)
  - Character quest state (get active, get completed, start, advance, complete, reset)
  - Character quest progress (get, atomic increment, reset)
  - Character quest flags (get, set, check, delete)
- Add shared types to `packages/shared/src/`

### Phase 2: Quest Manager (Core Logic)

- Create `questManager.ts` with:
  - Quest cache loading, JSONB parsing/validation, and indexing
  - `checkQuestTrigger(characterId, triggerType, triggerData)` — main entry point
  - `canStartQuest(characterId, quest)` — prerequisite checking
  - `startQuest(characterId, quest)` — create active quest record
  - `advanceQuestStep(characterId, quest)` — progress to next step
  - `completeQuest(characterId, quest)` — finalize, grant rewards, set flags
  - `grantStepRewards(characterId, step)` — intermediate rewards
  - Reward distribution helpers (XP, essence, currency, items, faction rep)

### Phase 3: Game Hooks

- Hook `handleDirectedSpeech()` for `talk` triggers (including lazy item checks)
- Hook `processNpcDeath()` for `kill` triggers
- Hook `handleMove()` for `visit` triggers
- Hook door permission check for quest flag gates
- Hook death handler to preserve `no_drop` items

### Phase 4: Player Commands

- Create `questCommands.ts` with `quest`, `quest log`, `quest info`
- Register commands in `commands.ts`
- Add quest display formatting (colors, word wrap, box drawing)
- Hidden future steps — only show completed + current
- Add to `help` output

### Phase 5: Admin Commands

- Add `@quest` admin commands to `adminCommands.ts`
- Quest reset, force-start, force-complete, advance, list, info
- Add `@reload quests` support

### Phase 6: Quest Editor (Future)

- Create `quest-editor.html` entry point
- Visual quest builder UI
- Step editor with trigger configuration
- JSONB reward editors
- Quest testing tools

## Resolved Design Decisions

| Decision | Resolution |
|---|---|
| Quest abandonment | No abandonment in v1. Once started, finish it. |
| Timed quests | Deferred to v2. |
| Collect/deliver mechanism | Lazy inventory checks via `talk` trigger with `trigger_item_template_id`. No scattered hooks. |
| Quest items through death | No-drop items survive death. Player respawns with only quest items. |
| Quest item cleanup on reset | Future enhancement. For now, admin manually removes items. |
| Reward storage | JSONB columns on `quests` and `quest_steps` instead of separate tables. |
| Quest chains AND vs OR | AND-only in v1. All `required_quest_ids` must be completed. |
| Multiple active quests | No limit. |
| Group sharing for non-kill steps | No. Each player progresses independently except kill credit. |
| NPC response when on wrong step | NPC does not respond. Quest log tells player what to do. |
| Visit step design | Quest designer responsibility — prior step should be in a different location than the visit target. |
| Kill count in groups | No concurrency concern — Node.js single-threaded, each player has their own progress row. |

## Compatibility Notes

- **NPC system**: Quest givers are standard NPCs with `interactable: true`. The existing `interactable` boolean on NPC templates already supports this.
- **Faction system**: Quest prerequisites and rewards use the existing `factions` and `player_faction_reputation` tables via `factionRepository.ts`.
- **Door system**: The existing `required_quest_flag` column on `doors` is already designed for this exact use case.
- **Progression system**: The existing `complete_class_quest` game event in `game_events.json` can be emitted on quest completion for essence/XP through the MEPS system alongside flat rewards.
- **Directed speech**: The `>npc message` syntax is already the primary NPC interaction mechanism. Quest triggers plug directly into `handleDirectedSpeech()`.
- **Data export/import**: Quest definitions should be included in the `npm run data:export` / `npm run data:import` workflow.
