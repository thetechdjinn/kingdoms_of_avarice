# Area Generation Plan

## Vision

Build an AI-assisted tool for generating complete game areas — rooms, NPCs, items, doors, factions, and drop tables — that match a defined theme. The generated content is exported as portable data files that can be loaded into any PostgreSQL instance, replacing all hardcoded seed data. When the game is distributed, it ships with data files rather than embedded SQL. Anyone setting up their own server configures their database and loads the provided data files to populate the world.

---

## Goals

1. **AI-Assisted Content Creation** — Use AI to generate room names, descriptions, NPC personalities, item flavor text, and other creative content that matches an area's theme and tone.

2. **Theme Consistency** — Each area has a defined theme (dark forest, dwarven mine, coastal village, etc.) and all generated content — room descriptions, NPC names, item lore, faction names — should feel cohesive within that theme.

3. **Eliminate Hardcoded Seed Data** — All current seed data (rooms, NPCs, items, spells, actions, status effects) will eventually be replaced by curated game data generated through this tool and the existing editors. The `migrate.ts` seed functions become a thing of the past.

4. **Portable Data Files** — Game content lives in JSON files that are loaded into PostgreSQL at setup time. The schema (tables, indexes, constraints) remains in code. The content (rooms, items, NPCs) lives in data files. Anyone distributing or self-hosting the game provides the data files separately from the application.

5. **Iterative Workflow** — The tool should support generating a rough draft, reviewing and editing in the existing web editors, then exporting the polished result. AI gets you 80% of the way; human curation finishes it.

---

## Current State

### What Exists Today

**Seed Data (hardcoded in migrate.ts and SQL files):**
- 7 rooms in the "Silverton" area (Town Square, North Road, Merchant District, etc.)
- 1 hostile NPC: serpentine warrior (City Gates)
- 1 merchant NPC: Goran (Merchant District)
- Items via `seed_items.sql`
- Spells via `seed_spells.sql`
- Actions via `seed_actions.sql`
- 2 factions: Silverton Merchants Guild, Silverton City Guard
- 1 drop table: serpentine warrior loot

**Import/Export Already Supported:**

| Data Type | Export | Import | Unique Key |
|-----------|--------|--------|------------|
| Items | Yes | Yes (merge by name) | name |
| NPCs | Yes | Yes (merge by name) | name (case-insensitive) |
| Spells | Yes | Yes (merge by mnemonic) | mnemonic |
| Status Effects | Yes | Yes (merge by ID) | id |
| Actions | Yes | Yes (merge by command) | command |
| Rooms | No | No | — |
| Drop Tables | No | No | — |
| Factions | No | No | — |
| Doors | No | No | — |

**Key Gap:** Rooms, drop tables, factions, and doors have no import/export. These must be added before area generation can produce loadable data files.

### Room Data Model

Each room has:
- `name` (VARCHAR 100) — Display name
- `description` (TEXT) — Full room description
- `area` (VARCHAR 100) — Area/zone grouping string
- `terrain` (VARCHAR 20) — indoor, outdoor, underground, water, etc.
- `features` (JSONB) — Training, respawn, bank configuration
- Exits via `room_exits` table (direction + destination room ID)
- Optional doors via `doors` table (locks, triggers, hidden passages)

An "area" is simply the string value in the `rooms.area` column. There is no separate areas table.

---

## Designer-AI Workflow

The area generation tool is NOT a single button that creates a finished area. It is a multi-step conversation between the designer and the AI. The designer provides creative direction, the AI proposes detailed plans, the designer approves or adjusts, and only then does generation happen.

```
Brief → AI Proposals → Designer Review → Approved Checklist → Generation → Editor Polish
```

The key principle: **nothing is generated until it's approved**. The AI expands a short brief into detailed checklists. The designer checks off what they want, modifies what's close, and rejects what doesn't fit. This prevents wasted generation and gives the designer control without requiring them to specify every detail upfront.

---

### Step 1: The Designer's Brief

The designer provides a short creative brief. This should be low-effort — a paragraph or a few bullet points is enough. The AI will ask clarifying questions and fill in gaps.

**Required inputs (the minimum):**

| Input | Description | Example |
|-------|-------------|---------|
| **Area Name** | What this zone is called | "The Wraithwood" |
| **Theme** | 1-2 sentences describing the vibe | "Dark corrupted forest. Ancient trees twisted by necromantic magic." |
| **Level Range** | Target player levels for this area | 8-15 |
| **Room Count** | Approximate number of rooms | ~20 |

**Optional inputs (designer provides if they have opinions):**

| Input | Description | Example |
|-------|-------------|---------|
| **Tone** | Emotional feel of descriptions | "Ominous, foreboding, occasional beauty in the decay" |
| **Key Landmarks** | Specific places the designer wants to exist | "A ruined shrine, a dead river crossing" |
| **Layout Ideas** | How rooms should connect | "Branching paths from a central clearing" |
| **NPC Ideas** | Specific creatures or characters | "Undead, corrupted wildlife, one hermit merchant" |
| **Special Features** | Training rooms, banks, locked areas | "Locked passage to the shrine" |
| **Connection Points** | How this area links to existing areas | "Connects to Silverton's City Gates" |
| **Lore Notes** | Backstory the AI should weave in | "Cursed 100 years ago by a banished necromancer" |

The less the designer provides, the more the AI proposes. A designer who just says "dark forest, level 8-15, 20 rooms" gets a full slate of AI suggestions. A designer who provides detailed landmark descriptions gets proposals that respect those specifics.

---

### Step 2: AI Expands the Brief into Proposals

The AI takes the brief and produces a set of **proposal checklists** organized by category. Each proposal is a concrete suggestion the designer can approve, modify, or reject. The AI should also surface creative options the designer may not have considered.

#### 2A: Room Proposals

The AI proposes a list of rooms with names, one-line summaries, terrain, and how they connect. This is the skeleton of the area.

```
ROOM PROPOSALS (20 rooms)

 #  Name                        Summary                                    Terrain
─────────────────────────────────────────────────────────────────────────────────────
 1. Edge of the Wraithwood      Transition from civilized lands             outdoor
 2. Twisted Pathway             Gnarled trees, barely visible path          outdoor
 3. Central Clearing            Open space, ancient stone circle            outdoor
 4. The Whispering Hollow       Depression in the earth, cold air rises     outdoor
 5. Fungal Grotto               Bioluminescent mushrooms, damp stone       underground
 6. Dead River Crossing         Dry riverbed, crumbling stone bridge        outdoor
 7. Blighted Thicket            Dense thorny undergrowth, animal bones      outdoor
 8. The Hermit's Camp           Makeshift shelter, fire pit, supplies       outdoor
 9. Collapsed Watchtower        Ruined tower, vines, partial upper floor    outdoor
10. Shrine Approach             Cracked flagstone path, iron gate ahead     outdoor
11. Shrine of Forgotten Bones   Desecrated altar, strange carvings          indoor
    ...

LAYOUT:
    [City Gates] -- south -- [1. Edge of the Wraithwood]
                                    |
                                  north
                                    |
                              [2. Twisted Pathway]
                               /          \
                            east          north
                             /              \
                  [6. Dead River]    [3. Central Clearing]
                                     /     |      \
                                  west   down     east
                                   /       |        \
                          [7. Thicket] [4. Hollow] [10. Shrine Approach]
                                           |              |
                                         down           north
                                           |              |
                                    [5. Fungal Grotto] [11. Shrine]
```

Designer reviews and can:
- Rename rooms
- Remove rooms they don't want
- Add rooms they want that the AI missed
- Change connections
- Flag rooms for special features ("make #8 a training room", "make #3 the respawn point")

#### 2B: Points of Interest

The AI proposes environmental details and interactable objects placed in specific rooms. These become part of room descriptions or future interactive elements.

```
POINTS OF INTEREST

 Room                      Feature                 Description
───────────────────────────────────────────────────────────────────────────
 Central Clearing          Ancient Stone Circle     Moss-covered standing stones arranged
                                                    in a circle. Faint runes still glow at dusk.
 Shrine of Forgotten Bones Desecrated Altar         Cracked black stone altar, dark stains.
                                                    Bone fragments embedded in the surface.
 The Whispering Hollow     Frozen Spring            Water that never freezes but is ice-cold.
                                                    Drinking restores a small amount of mana.
 Collapsed Watchtower      Carved Warning           Scratched into the stone: "Turn back.
                                                    She still watches."
 Dead River Crossing       Crumbling Bridge         Stone bridge with missing sections. Safe
                                                    to cross but looks treacherous.
 Fungal Grotto             Glowing Mushrooms        Bioluminescent fungi casting pale blue
                                                    light. Some are harvestable.
```

Designer reviews and can:
- Approve features for inclusion in room descriptions
- Flag features as interactable vs purely descriptive
- Suggest additional features
- Move features between rooms

#### 2C: NPC Roster

The AI proposes all NPCs for the area — hostiles, merchants, and ambient creatures — with role, level, and spawn location.

```
NPC ROSTER

 Name                  Role        Level  Spawn Room              Behavior
─────────────────────────────────────────────────────────────────────────────────
 blighted wolf         hostile     8      Blighted Thicket        roams, calls for help
 shade wisp            hostile     9      The Whispering Hollow   stationary, caster
 wraithwood stalker    hostile     11     Twisted Pathway         roams, flees at 15%
 bone revenant         hostile     13     Shrine Approach         stationary, tough
 the hollow guardian   hostile     15     Fungal Grotto           boss, spells, no flee
 corrupted deer        passive     6      Edge of the Wraithwood  roams, ambient
 Maren                 merchant    10     The Hermit's Camp       proper name, hermit

SUGGESTED ATTACK STYLES:
 - blighted wolf: bite (physical), rabid frenzy (2 attacks/round, 20% weight)
 - shade wisp: spectral touch (magic), life drain (mana cost, 30% weight)
 - wraithwood stalker: claw slash, venomous strike (poison damage)
 - bone revenant: heavy slam (high damage, slow), bone spike (ranged)
 - the hollow guardian: crushing blow, necrotic wave (AoE magic), dark mending (self-heal)

SUGGESTED SPELLS:
 - shade wisp: Enervation (debuff, -defense), cast always, priority 30
 - the hollow guardian: Dark Mending (heal, hp_below 40%), Bone Shield (buff, combat_start)
```

Designer reviews and can:
- Adjust NPC levels to fit the area's difficulty curve
- Change which rooms NPCs spawn in
- Add or remove NPCs
- Modify behavior (make something roam that was stationary, etc.)
- Approve or adjust attack/spell suggestions

#### 2D: Item and Loot Proposals

The AI proposes items found in the area — both NPC drops and items that could stock a merchant.

```
ITEM PROPOSALS

 Name                    Type        Slot        Stats                   Found Via
──────────────────────────────────────────────────────────────────────────────────────
 blighted fang           weapon      main_hand   3-6 piercing, spd 8    blighted wolf drop
 shade wisp essence      consumable  —           restores 20 mana       shade wisp drop
 wraithwood bark shield  armor       off_hand    AC 4, DR 1             wraithwood stalker drop
 revenant bone blade     weapon      main_hand   6-10 slashing, spd 10  bone revenant drop
 hollow guardian's skull misc        —           trophy/quest item       boss drop (100%)
 bone key                key         —           unlocks shrine gate     bone revenant drop (25%)
 dried rations           consumable  —           food, heals 10 HP      Maren's shop
 herbal poultice         consumable  —           heals 30 HP            Maren's shop
 tattered leather armor  armor       body        AC 3                   Maren's shop
 antivenom vial          consumable  —           cures poisoned          Maren's shop

DROP TABLE PROPOSALS:
 - blighted wolf:     75% chance 5-15 copper; 20% blighted fang
 - shade wisp:        50% chance 10-25 copper; 15% shade wisp essence
 - wraithwood stalker: 80% chance 15-40 copper; 10% wraithwood bark shield
 - bone revenant:     90% chance 20-60 copper; 8% revenant bone blade; 25% bone key
 - hollow guardian:   100% chance 50-150 copper; 100% hollow guardian's skull; 15% revenant bone blade
```

Designer reviews and can:
- Adjust item stats
- Change drop chances
- Add or remove items
- Decide what the merchant stocks
- Flag items as quest-related

#### 2E: Door and Passage Proposals

The AI proposes doors, locks, and hidden passages.

```
DOOR PROPOSALS

 Location                  Direction  Type       Lock         Key/Trigger
──────────────────────────────────────────────────────────────────────────────
 Shrine Approach → Shrine  north      physical   locked       bone key
 Central Clearing → ???    down       triggered  hidden       "examine stones"
 Collapsed Watchtower      up         physical   closed       (no lock, just closed)
```

#### 2F: Quest Hook Proposals

The AI proposes story threads that tie the area together. These aren't implemented as a quest system (which doesn't exist yet) but they inform room descriptions, item placement, NPC dialogue, and give the area narrative purpose.

```
QUEST HOOK PROPOSALS

1. THE BONE KEY
   Setup:    The shrine is locked behind an iron gate. The bone revenant carries the key.
   Flow:     Kill revenants until bone key drops → use key on shrine gate → enter shrine
   Payoff:   Boss fight in the shrine, unique boss drop
   Affects:  bone key item, shrine door, bone revenant drop table

2. THE HERMIT'S REQUEST
   Setup:    Maren asks players to retrieve glowing mushrooms from the Fungal Grotto.
   Flow:     Speak to Maren → collect mushrooms → return to Maren
   Payoff:   Maren restocks rare antivenom, gives discount
   Affects:  Maren's dialogue responses, mushroom harvestable item, merchant stock
   Note:     Requires a quest/task system to fully implement. For now, can be flavor
             text in Maren's responses with manual item placement.

3. THE WATCHER'S WARNING
   Setup:    Carved warning in the watchtower references "she" — a necromancer.
   Flow:     Environmental storytelling only. Sets up a future deeper area.
   Payoff:   Lore breadcrumb for a future dungeon below the Wraithwood.
   Affects:  Room descriptions in watchtower, shrine carvings

4. THE DEAD RIVER
   Setup:    The river dried up when the curse hit. Old fishing village ruins nearby.
   Flow:     Environmental. Could become a future restoration quest.
   Payoff:   Worldbuilding. Explains why the bridge exists over a dry riverbed.
   Affects:  Room descriptions at Dead River Crossing
```

Quest hooks influence everything else:
- Room descriptions reference quest elements naturally
- NPC dialogue responses include quest-relevant keywords
- Item placement and drop tables serve the quest flow
- Doors and locks create the quest gates

The designer reviews and can:
- Approve hooks that should influence generation
- Reject hooks that feel forced
- Propose their own quest ideas
- Mark hooks as "future" (flavor text only) vs "active" (needs items/doors/NPCs)

#### 2G: Faction Proposals

```
FACTION PROPOSALS

 Name                    Type     Description
──────────────────────────────────────────────────────────────────────────
 Wraithwood Outcasts     tribal   Exiles and hermits living in the cursed forest.
                                  Distrustful of outsiders but trade with those who
                                  prove themselves.

 NPC Affiliations:
  - Maren → Wraithwood Outcasts (primary faction)

 Reputation Effects:
  - Killing blighted wolves/stalkers near Maren: small positive rep (future)
  - Attacking Maren: large negative rep
```

---

### Step 3: Designer Review and Approval

The designer works through each proposal category and marks items:

- **Approved** — Generate as proposed
- **Modified** — Generate with the noted changes (designer writes the change)
- **Rejected** — Do not generate
- **Deferred** — Good idea but save for later (not generated now)

The AI can also be asked follow-up questions during review:
- "Give me 3 alternative names for the Fungal Grotto"
- "Make the shade wisp tougher, it should be a mini-boss"
- "I want a hidden room off the shrine, add it to the layout"
- "What if the hermit isn't a merchant but a quest giver?"

This is iterative. The designer may go back and forth several times before approving.

---

### Step 4: Generation from Approved Checklist

Once all proposals are approved, the AI generates the full data:

1. **Room descriptions** — Full 2-4 sentence descriptions for each approved room, weaving in approved points of interest and quest hooks
2. **NPC templates** — Complete stat blocks, attacks, spells, behavior config for each approved NPC
3. **Item templates** — Full item definitions with stats, descriptions, keywords
4. **Drop tables** — Linked to NPCs with approved drop chances
5. **Doors** — Full door definitions with lock config
6. **Factions** — Faction definitions with NPC affiliations
7. **Merchant config** — Inventory, stock levels, keyword responses

The output is structured JSON matching the data file format, ready for import.

---

### Step 5: Editor Polish

Generated content is imported into the web editors for final tweaks:

- Adjust room descriptions for flow and consistency
- Tune NPC stats after playtesting
- Balance drop rates and item power
- Fix any AI quirks in naming or descriptions

---

### What the AI Needs to Generate Well

For the AI to produce good proposals, it needs context about the game systems:

**Stat Reference Tables** (provided to the AI as context):

| Level Range | HP | Accuracy | Defense | Damage/Round | XP Reward |
|-------------|-----|----------|---------|-------------|-----------|
| 1-3 | 15-40 | 35-50 | 25-40 | 3-10 | 15-50 |
| 4-7 | 40-80 | 45-60 | 35-50 | 8-20 | 40-120 |
| 8-12 | 70-150 | 55-70 | 45-60 | 15-35 | 100-300 |
| 13-18 | 120-250 | 65-80 | 55-70 | 25-55 | 250-600 |
| 19-25 | 200-400 | 75-90 | 65-80 | 40-80 | 500-1200 |

**Currency Reference** (copper per level range):

| Level Range | Gold Drop (min-max) | Merchant Item Values |
|-------------|--------------------|--------------------|
| 1-3 | 1-10 copper | 5-50 copper |
| 4-7 | 5-30 copper | 20-200 copper |
| 8-12 | 15-80 copper | 50-500 copper |
| 13-18 | 30-200 copper | 100-1500 copper |
| 19-25 | 50-500 copper | 300-5000 copper |

**Item Stat Reference** (damage/AC per level range):

| Level Range | Weapon Min-Max | Armor AC | Speed |
|-------------|---------------|----------|-------|
| 1-3 | 1-4 to 2-6 | 1-3 | 8-12 |
| 4-7 | 2-6 to 4-9 | 2-5 | 7-11 |
| 8-12 | 4-8 to 6-12 | 4-8 | 6-10 |
| 13-18 | 6-10 to 8-16 | 6-12 | 5-9 |
| 19-25 | 8-14 to 12-24 | 10-18 | 4-8 |

These tables should be refined as the game matures and can be provided as part of the AI's system prompt during generation.

**Game System Constraints** (rules the AI must follow):
- Item names are lowercase, no articles ("blighted fang" not "A Blighted Fang")
- NPC common noun names are lowercase ("bone revenant" not "Bone Revenant")
- NPC proper names use title case ("Maren" not "maren")
- Room names use title case ("The Whispering Hollow")
- Room descriptions are 2-4 sentences, present tense, second person perspective avoided
- Exits should be mentioned naturally in descriptions ("A path continues north")
- Available terrain types: indoor, outdoor, underground, water, road
- Available directions: north, south, east, west, up, down, northeast, northwest, southeast, southwest

**ASCII Map Conformance (ABSOLUTE RULE):**
- The ASCII map in `areas/<area_name>/plan.md` is the authoritative source of truth for every area's room layout
- Seed data MUST exactly match the ASCII map: same room count, same connections, same labeled room types
- Every node in the ASCII map (labeled or `*`) becomes exactly one room. Every `---` or `|` connector becomes a bidirectional exit pair
- After any change to seed data, re-verify against the ASCII map. If the map needs to change, update the map FIRST, then update the seed
- When building a new area seed, always parse or trace the ASCII map first — count every room and every connection before writing code
- This rule is non-negotiable. No rooms may be added, removed, or reconnected without updating the ASCII map first

---

## Area Plan Files

Before any tooling or code exists, we can start designing areas now using markdown plan files. Each area gets its own folder with a plan file that evolves through conversation between the designer and AI. When a plan is approved, the generated data files go into a separate `data/` directory that ships with the game.

### Why Markdown First

- No tooling required — start designing today
- Easy to iterate — edit text, not JSON schemas
- Version controlled — git tracks every revision
- Readable — anyone can review an area plan without understanding the codebase
- Convertible — when the data loader exists, approved plans become the spec for JSON generation

### Directory Structure

Three directories at the project root, each with a distinct role:

```
notes/area_generation/              # Process docs and reference (you are here)
  Area_Generation_Plan.md           # This file
  README.md                         # Quick-start guide

areas/                              # Area design plans
  _template/                        # Blank template — copy to start a new area
    plan.md
  silverton/                        # One folder per area
    plan.md                         # Design plan (rooms, NPCs, items, quests)
    notes.md                        # Optional freeform design notes
  wraithwood/
    plan.md

data/                               # Exported game data for database import
  _manifest.json                    # Load order for all data files
  global/                           # Game-wide data (spells, effects, actions)
    spells.json
    status_effects.json
    actions.json
  areas/                            # Per-area exported data
    silverton/
      rooms.json
      npcs.json
      items.json
      ...
```

**`areas/`** is where design happens. Plans, proposals, notes, iteration.

**`data/`** is where finished content lives. JSON files ready for database import. This is what ships with the game.

### Area Plan Lifecycle

Each area plan file goes through these stages:

```
BRIEF → PROPOSALS → REVIEW → APPROVED → GENERATED
```

**BRIEF** — Designer writes initial concept (theme, level range, room count, ideas). Can be a few sentences or detailed bullets.

**PROPOSALS** — AI expands the brief into detailed sections: rooms, NPCs, items, doors, quests, factions. Each item is marked with a status tag.

**REVIEW** — Designer works through proposals, marking each item. Items can go back and forth multiple times.

**APPROVED** — All sections reviewed and marked. The plan is the source of truth for what gets built.

**GENERATED** — Content has been created in the editors or exported to data files. Plan file is kept as documentation.

### Status Tags

Every proposed item gets a status tag that the designer sets:

| Tag | Meaning |
|-----|---------|
| `[APPROVED]` | Build as described |
| `[MODIFIED]` | Build with the noted changes (change written inline) |
| `[REJECTED]` | Do not build |
| `[DEFERRED]` | Good idea, save for a future pass |
| `[PENDING]` | Not yet reviewed |
| `[NEEDS DISCUSSION]` | Designer has questions, needs AI input |

### Working Process

1. Designer creates a new area folder and copies `areas/_template/plan.md`
2. Designer fills in the Brief section with whatever they have in mind
3. In a Claude Code conversation, designer says "expand the brief for [area name]"
4. AI reads the plan file, fills in proposal sections, marks everything `[PENDING]`
5. Designer reviews in their editor or asks Claude to walk through it
6. Designer sets status tags, writes modification notes
7. AI can be asked to regenerate rejected items, adjust proposals, add detail
8. Repeat steps 5-7 until all items are `[APPROVED]` or `[MODIFIED]`
9. When ready, AI generates the actual game data (JSON or direct editor input) from the approved plan

---

## Data File Format

### Principles

1. **JSON format** — Human-readable, editable, works with existing import endpoints
2. **One file per data type** — Rooms, NPCs, items, etc. each get their own file
3. **Self-contained areas** — An area's data files contain everything needed for that area
4. **ID-independent** — Files use names/references rather than numeric IDs, since IDs are assigned at load time
5. **Order-aware loading** — Some data has dependencies (NPCs reference rooms, drop tables reference items). The loader handles ordering.

### File Structure

A distributed game ships with a `data/` directory:

```
data/
  _manifest.json              # Master list of all data files and load order
  global/
    spells.json               # All spells (global, not area-specific)
    status_effects.json       # All status effects
    actions.json              # All social actions
    classes.json              # Class definitions (future)
    races.json                # Race definitions (future)
  areas/
    silverton/
      rooms.json              # Rooms with exits and features
      doors.json              # Doors, locks, triggers
      npcs.json               # NPC templates with attacks and spells
      items.json              # Item templates
      drop_tables.json        # Drop tables and entries
      factions.json           # Area factions
    wraithwood/
      rooms.json
      doors.json
      npcs.json
      items.json
      drop_tables.json
      factions.json
```

### Manifest File

```json
{
  "version": "1.0",
  "game": "Kingdoms of Avarice",
  "load_order": [
    "global/status_effects.json",
    "global/spells.json",
    "global/actions.json",
    "areas/silverton/items.json",
    "areas/silverton/factions.json",
    "areas/silverton/rooms.json",
    "areas/silverton/doors.json",
    "areas/silverton/drop_tables.json",
    "areas/silverton/npcs.json",
    "areas/wraithwood/items.json",
    "areas/wraithwood/factions.json",
    "areas/wraithwood/rooms.json",
    "areas/wraithwood/doors.json",
    "areas/wraithwood/drop_tables.json",
    "areas/wraithwood/npcs.json"
  ]
}
```

Load order matters because:
- Spells must exist before NPCs reference them
- Items must exist before drop tables reference them
- Rooms must exist before NPCs reference spawn rooms
- Rooms must exist before doors reference entry/exit rooms
- Factions must exist before NPCs reference primary faction

### Reference Resolution

Since IDs are database-assigned, files use **name-based references** that the loader resolves:

```json
{
  "name": "wraith",
  "spawn_room": "@room:The Dead River Crossing",
  "primary_faction": "@faction:Wraithwood Outcasts",
  "drop_table": "@drop_table:wraith loot",
  "spells": [
    { "spell": "@spell:shadow bolt", "priority": 50, "cast_chance": 60 }
  ]
}
```

The `@type:name` syntax tells the loader to look up the ID of the named entity. The loader maintains a name-to-ID map built during the loading process.

### Room File Format

Rooms need special handling because exits reference other rooms by name (not ID):

```json
{
  "version": "1.0",
  "area": "The Wraithwood",
  "rooms": [
    {
      "name": "Edge of the Wraithwood",
      "description": "The trees here are still alive, though their bark is grey and peeling. A faint mist seeps from the forest to the north, carrying the smell of rot and old earth. The road back to civilization lies to the south.",
      "terrain": "outdoor",
      "features": {},
      "exits": {
        "north": "@room:Twisted Pathway",
        "south": "@room:City Gates"
      }
    },
    {
      "name": "Twisted Pathway",
      "description": "Gnarled trees press in from both sides, their branches interlocking overhead to block out the sky. The path is barely visible beneath a carpet of dead leaves. Something moves in the undergrowth.",
      "terrain": "outdoor",
      "features": {},
      "exits": {
        "south": "@room:Edge of the Wraithwood",
        "north": "@room:Central Clearing",
        "east": "@room:The Dead River Crossing"
      }
    }
  ]
}
```

Cross-area room references (like `@room:City Gates` referencing a Silverton room) require that the referenced area is loaded first.

---

## Implementation Phases

### Phase 1: Missing Import/Export

Add import/export to the data types that lack it, using the same patterns as existing systems.

- **Rooms** — Export all rooms with exits. Import with name-based exit resolution within the same file. Support area filtering on export.
- **Drop Tables** — Export tables with entries. Import with item name references.
- **Factions** — Export factions. Import with merge-by-name.
- **Doors** — Export doors with room name references. Import with room/item name resolution.

This phase gives us the ability to fully export and import an area's worth of data.

### Phase 2: Data Loader

Build a CLI tool or server endpoint that loads a set of data files in order, resolving `@type:name` references to database IDs.

- Read manifest file
- Process files in declared order
- Build name-to-ID map as entities are created
- Resolve cross-references using the map
- Report errors for unresolved references
- Idempotent: skip entities that already exist (merge-by-name)

This replaces the hardcoded seed functions in `migrate.ts`.

### Phase 3: Seed Data Migration

Convert all existing seed data from `migrate.ts` and SQL files into the data file format.

- Export current Silverton area data using Phase 1 endpoints
- Export global data (spells, effects, actions)
- Verify the data loader can recreate the world from files alone
- Remove seed functions from `migrate.ts` (schema-only migrations remain)

### Phase 4: AI Area Generation

Build the AI-assisted generation workflow. This is where the creative tooling lives.

- **Area Definition Input** — Structured form or freeform prompt describing the area
- **Room Generation** — AI generates room names, descriptions, terrain, and an exit graph
- **NPC Generation** — AI generates NPC templates with stats, attacks, spells, behavior
- **Item Generation** — AI generates themed items and drop tables
- **Door Generation** — AI generates locked/hidden doors with keys
- **Faction Generation** — AI generates area factions

The AI output is structured JSON matching the data file format. It goes through review in the existing editors before being finalized.

#### AI Integration Options

The AI generation could be:

1. **Offline/External** — A separate script or tool that calls an AI API (Claude, etc.), generates JSON files, which are then imported through the web editors. Simplest approach, no changes to the game server.

2. **Built into the Editor** — A "Generate Area" button in a new editor page that calls an AI API from the server, shows the results for review, and saves directly. More integrated but requires API key management and server-side AI calls.

3. **CLI Tool** — A command-line tool that takes an area definition file, calls the AI, and outputs data files. Good for batch generation and scripting.

Option 1 (offline/external) is the most practical starting point. The generation script can be a standalone Node/TypeScript tool in the repository that outputs files compatible with the data loader.

### Phase 5: World Building

Use the complete toolchain (AI generation + editors + data files) to build out the actual game world. This is the content creation phase, not a code phase.

- Generate and refine areas
- Balance NPC stats and rewards across level ranges
- Create interconnected area maps
- Build faction relationships
- Test the full player experience
- Package final data files for distribution

---

## Distribution Model

When the game is distributed:

```
kingdoms-of-avarice/
  packages/
    client/          # Frontend code
    server/          # Backend code (schema migrations, game logic)
    shared/          # Shared types
  data/
    _manifest.json   # Load order
    global/          # Spells, effects, actions
    areas/           # Per-area content files
  .env.example       # Database config template
  README.md          # Setup instructions
```

### Setup Flow

1. Clone the repository
2. Set up PostgreSQL and configure `.env`
3. Run `npm run migrate` — Creates tables, indexes, constraints (no content)
4. Run `npm run load-data` — Reads `data/_manifest.json`, loads all data files into the database
5. Run `npm run dev` — Start the game

### Custom Content

Server operators can:
- Replace `data/` with their own content files
- Add new areas by adding files and updating the manifest
- Use the web editors to modify loaded content
- Export modified content back to data files for redistribution

---

## Open Questions

1. **AI Model Choice** — Which AI API for generation? Claude API is the natural choice given the toolchain, but should the tool support multiple providers?

2. **Room Layout Visualization** — How do we display the generated room graph for review? ASCII art? A simple canvas-based map in the browser? Text list?

3. **Cross-Area Exits** — How do we handle exits that connect two separately generated areas? Likely a manual step where the designer links border rooms after both areas exist.

4. **Stat Balancing** — Should the AI be given a reference table of stat ranges per level, or should it learn from existing content? A reference table is more predictable.

5. **Version Control for Data Files** — Should data files be checked into git? Probably yes for the canonical game world, with `.gitignore` patterns for local customizations.

6. **Incremental Loading** — Should the data loader support loading a single area without reloading everything? Useful for adding new areas to a running server.

7. **Data File Validation** — Should there be a validation step that checks data files for errors (broken references, missing fields, stat ranges) before loading?
