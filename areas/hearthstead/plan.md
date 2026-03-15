# Hearthstead

> **Status:** BRIEF
> **Level Range:** 1-3 (new player starting zone)
> **Room Count:** 89 (43 hamlet/loop/road + 46 wilds)
> **Connected To:** Arindale (room 36, Harbor Road — northeast exit, via river crossing)
> **Area Strings:** `Hearthstead` (hamlet, approach, road — safe zone), `Hearthstead Loop` (battle loop — monsters roam), `Hearthstead Wilds` (quest area north of loop via `go path` — monsters roam)

---

## Brief

**Theme:** A tiny coastal hamlet just outside Arindale's walls — the first place new players experience before making their way to the city. This is where all characters begin. The hamlet sits on a bluff northeast of Arindale, past a river crossing. It's a quiet, safe settlement with a handful of buildings along a single street, encircled by a loop trail through fields and light woodland where wildlife and minor threats give new players their first taste of combat.

**Tone:** Welcoming, modest, and tutorial-like without feeling artificial. The hamlet should feel like a real (if tiny) place — not a theme park. Descriptions should be warm and grounded. The combat loop shifts to slightly more tense and wild, but never threatening — this is the shallow end of the pool.

**Key Ideas:**

- **Safe hamlet** — No hostile NPCs anywhere in the village itself. This is a true safe zone. Uses the `Hearthstead` area string.
- **New player spawn point** — The respawn room for brand new characters is here. This is the first room a player ever sees. It should set the tone for the whole game.
- **Combat loop encircles the hamlet** — The loop trail fully surrounds the hamlet using varied directions (NE, NW, SE, SW — not a bland square). To reach Arindale, players must walk through at least one room of the loop. Uses the `Hearthstead Loop` area string so monsters roam the loop but never enter the hamlet.
- **River crossing to Arindale** — The road from Hearthstead to Arindale passes through a river. Players type `swim river` from either riverbank to cross. This prevents brand new players from stumbling into Arindale before they're oriented. The river is described in the rooms on both banks.
- **Triggered passage to Hearthstead Wilds** — One room on the north side of the loop has a triggered passage (`go path`) leading to the Hearthstead Wilds quest area. The Wilds uses its own `Hearthstead Wilds` area string, separate from the loop, so monsters in each area stay contained.
- **Five vendors along one street:**
  1. **Armor merchant** — padded armor (starter-tier light armor)
  2. **Weapons merchant** — basic starter weapons
  3. **Spell merchant** — basic starter spells
  4. **Inn / Tavern** — 3 rooms (common room, middle room, back room)
  5. **Healer** — cures and basic healing

**Layout Ideas:**

- **Road from Arindale:** 3 rooms northeast from Arindale room 36 to the south riverbank (the 3rd room is the riverbank). Type `swim river` to cross. ~3 rooms northeast from the north riverbank to the loop. The road curves north at the end to approach the loop from the south.
- **Battle loop:** 25 rooms forming a full ring around the hamlet. Uses all 8 compass directions and is spatially consistent (Euclidean). The far north side has the `go path` trigger to the future battle area.
- **Hamlet:** A single street running north from the loop crossing, with vendors branching off to the sides. The spawn point (S) is on the street with armor (A) and weapons (W) shops directly off it. Spell shop (E), inn (I), and healer (H) are on the street above. 4 rooms from the loop crossing to the spawn point.

**Connection Points:**

- **Arindale room 36 (Harbor Road)** — northeast exit from room 36 starts the road. 3 northeast steps reach the south riverbank (R). `swim river` crosses to the north bank (N). 2 more rooms northeast reach L, which connects south to the road via one path room. From L, 4 rooms northeast/north into the hamlet reach the spawn point.
- **Hearthstead Wilds** — accessed via `go path` from G (north-side loop room). Uses `Hearthstead Wilds` area string (separate from `Hearthstead Loop`). A larger quest zone with a proper dungeon and boss for levels 1-3+. Map is in this same plan file.

**Lore/Backstory:**

- Hearthstead has existed for generations as a waypoint for travelers arriving at Arindale by the coastal road from the northeast. It's too small to have its own wall or garrison — it relies on Arindale's proximity for protection.
- New characters are travelers who have just arrived here, perhaps by ship or overland route, and are making their way to Arindale to seek their fortune.
- The wildlife on the outskirts has grown bolder recently (foreshadowing the larger threat in the future battle area). Farmers complain about aggressive animals raiding their fields. This plants the seed for future quest hooks.

---

## Rooms

<!-- AI fills this section with room proposals. Designer reviews and sets status tags. -->

| #   | Status | Name | Summary | Terrain | Notes |
| --- | ------ | ---- | ------- | ------- | ----- |
|     |        |      |         |         |       |

### Layout

<!-- ASCII map of the area. This is the authoritative source of truth for room count and connectivity. -->

```
HEARTHSTEAD — Complete Area Map (89 rooms)

Legend:  * = generic room
        L = Loop crossing             S = Spawn point
        A = Armor shop                W = Weapon shop
        E = Spell shop                H = Healer
        I = Inn/Tavern room           R = South Riverbank
        N = North Riverbank           G = Go path trigger (go path north → Wilds)
        C = Cave Entrance             B = Bear's Lair (boss room)
        K = Goblin's Den (corrupted goblin mini-boss)
   [Arindale] = Arindale map room (not part of this area)

  Area Strings:
    Hearthstead       = hamlet (inside loop), approach (NE of L), road (south of L). Safe — no monsters.
    Hearthstead Loop  = outer loop ring (including L and G). Monsters roam here.
    Hearthstead Wilds = all rooms north of G (forest + cave). Monsters roam here.

North ^

                  B
                 /
                *     *---*
                |    /     \
                *   *       *
                 \ / \      |
                  *   *     *
                  |   |      \
                  *   *       *---K
                   \   \     /
                    *   *   *
                     \ / \   \
                      C   *---*
                      |
                      *
                      |
                  *---*
                   \ / \
                    *   *
                   / \ / \
              *---*---*---*---*
                  |   |   |
                  *   *   *
                 /   / \   \
                *   *---*   *
                 \   \ /   /
                  *---*---*
                  |       |
                  *       *
                   \     /
                    *   *
                     \ /
                      *
                      |
                      G
                      |
                      *
                     / \
            *---*---*   *---*---*
           /                     \
          *           H       I   *
         /            |       |   |
        *         E---*---I---I   *
        |             |           |
        *         A---S---W       *
         \            |          /
          *           *         *
          |           |        /
          *---*       *       *
               \     /        |
                *   *         *
                 \ /          |
                  L---*---*---*
                  |
                  *
                 /
                *
               /
              N
              |
              R
             /
            *
           /
          *
         /
    [Arindale]
```

### Room Features

<!-- Special rooms: training, respawn, bank, etc. -->

| Room      | Feature | Config                      |
| --------- | ------- | --------------------------- |
| S (Spawn) | respawn | New character arrival point |

---

## Points of Interest

<!-- Environmental details, interactable objects, flavor elements placed in rooms -->

| Status | Room | Feature | Description | Interactable? |
| ------ | ---- | ------- | ----------- | ------------- |
|        |      |         |             |               |

---

## NPCs

### Hostile Mobs

<!-- Combat loop creatures only. Level 1-2, simple attacks, teach new players combat basics. -->
<!-- Spawn in Hearthstead Loop area string rooms (loop + L) and Hearthstead Wilds (quest area) -->

| Status | Name | Level | Spawn Room | Behavior | Notes |
| ------ | ---- | ----- | ---------- | -------- | ----- |
|        |      |       |            |          |       |

### Merchants / Friendly NPCs

| Status    | Name | Level | Spawn Room | Role             | Notes                          |
| --------- | ---- | ----- | ---------- | ---------------- | ------------------------------ |
| [PENDING] | TBD  | —     | A          | Armor merchant   | Padded armor, starter tier     |
| [PENDING] | TBD  | —     | W          | Weapons merchant | Basic starter weapons          |
| [PENDING] | TBD  | —     | E          | Spell merchant   | Basic starter spells           |
| [PENDING] | TBD  | —     | I1         | Innkeeper        | Runs the inn, sells food/drink |
| [PENDING] | TBD  | —     | H          | Healer           | Cures ailments, basic healing  |

### Passive / Ambient

| Status | Name | Level | Spawn Room | Notes |
| ------ | ---- | ----- | ---------- | ----- |
|        |      |       |            |       |

### NPC Attacks

<!-- Attack definitions for each hostile NPC -->

#### [NPC Name]

| Status | Attack Name | Type | Min-Max Dmg | Atk/Round | Weight% | Mana | Hit Verb |
| ------ | ----------- | ---- | ----------- | --------- | ------- | ---- | -------- |
|        |             |      |             |           |         |      |          |

### NPC Spells

<!-- Spell assignments for spellcaster NPCs -->

#### [NPC Name]

| Status | Spell | Priority | Cast% | Condition | Value | Cooldown | Notes |
| ------ | ----- | -------- | ----- | --------- | ----- | -------- | ----- |
|        |       |          |       |           |       |          |       |

---

## Items

### Weapons

| Status | Name | Slot | Min-Max Dmg | Speed | Type | Found Via |
| ------ | ---- | ---- | ----------- | ----- | ---- | --------- |
|        |      |      |             |       |      |           |

### Armor

| Status | Name | Slot | AC  | DR  | Weight Class | Found Via |
| ------ | ---- | ---- | --- | --- | ------------ | --------- |
|        |      |      |     |     |              |           |

### Consumables

| Status | Name | Effect | Value | Found Via |
| ------ | ---- | ------ | ----- | --------- |
|        |      |        |       |           |

### Keys / Quest Items

| Status | Name | Purpose | Found Via |
| ------ | ---- | ------- | --------- |
|        |      |         |           |

---

## Drop Tables

<!-- One table per NPC that drops loot -->

### [NPC Name] Loot

| Status | Item | Drop% | Qty | Currency (copper) | Denominations |
| ------ | ---- | ----- | --- | ----------------- | ------------- |
|        |      |       |     |                   |               |

---

## Doors and Passages

| Status    | Location            | Direction | Type      | Lock | Key/Trigger  | Notes                                                                                                                |
| --------- | ------------------- | --------- | --------- | ---- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| [PENDING] | R (south riverbank) | n/a       | triggered | —    | `swim river` | Crosses river to N. Bidirectional — works from either bank. Prevents new players from reaching Arindale until ready. |
| [PENDING] | N (north riverbank) | n/a       | triggered | —    | `swim river` | Crosses river to R. Bidirectional pair with above.                                                                   |
| [PENDING] | G (north loop)      | north     | triggered | —    | `go path`    | Leads to Hearthstead Wilds quest area. Crosses area string boundary (Loop → Wilds).                                  |

---

## Factions

| Status | Name | Type | Description |
| ------ | ---- | ---- | ----------- |
|        |      |      |             |

### NPC Affiliations

| NPC | Faction | Role |
| --- | ------- | ---- |
|     |         |      |

---

## Quest Hooks

<!-- Story threads that tie the area together. Mark as "active" (needs items/NPCs/doors) or "flavor" (description only). -->

### [Quest Name]

> **Status:** [PENDING]
> **Type:** active | flavor

**Setup:**

**Flow:**

**Payoff:**

**Affects:** (which rooms, NPCs, items, doors does this touch?)

---

## Merchant Inventory

### Armor Merchant

| Status | Item | Max Stock | Restock% | Notes                            |
| ------ | ---- | --------- | -------- | -------------------------------- |
|        |      |           |          | Padded armor only — starter tier |

### Weapons Merchant

| Status | Item | Max Stock | Restock% | Notes                 |
| ------ | ---- | --------- | -------- | --------------------- |
|        |      |           |          | Basic starter weapons |

### Spell Merchant

| Status | Item | Max Stock | Restock% | Notes                |
| ------ | ---- | --------- | -------- | -------------------- |
|        |      |           |          | Basic starter spells |

### Innkeeper

| Status | Item | Max Stock | Restock% | Notes                              |
| ------ | ---- | --------- | -------- | ---------------------------------- |
|        |      |           |          | Food, drink, possibly room tickets |

### Merchant Responses

| Status | Keywords | Response |
| ------ | -------- | -------- |
|        |          |          |

---

## Designer Notes

- **`swim river` passage** — Bidirectional trigger at the river crossing. Type `swim river` from either R or N to cross. Room descriptions on both banks should prominently describe the river so the command feels natural. This is the gate that keeps brand new players in Hearthstead until they discover the command.
- **`go path` passage** — Triggered exit on the north side of the loop (G). Leads to the future larger battle area. The room description should hint at a hidden trail or overgrown path leading north into wilder territory.
- **Three area strings** — `Hearthstead` for the safe hamlet (12 rooms inside the loop) AND the 6 road rooms (no monsters on the road or in town). `Hearthstead Loop` for the battle loop (25 rooms including L and G). `Hearthstead Wilds` for the quest area north of G (separate area, monsters don't cross into the loop). Monsters roam within their own area string but cannot enter `Hearthstead` rooms. These boundaries are critical.
- **Respawn behavior** — Only brand new characters spawn at S (spawn point). After dying, players respawn at Arindale's Halls of the Dead. Hearthstead is an arrival point, not a death recovery point.
- **Arindale room 36 modification** — When this area is built, room 36 in Arindale needs a new northeast exit added pointing to P1. Room 36's description may need a small update to mention the path leading northeast.
- **Armor is padded only** — The armor merchant sells padded (starter-tier, lightest) armor. Appropriate for level 1 characters.
- **Hearthstead Wilds** — The quest area connects north from G via `go path`. Uses its own `Hearthstead Wilds` area string, separate from `Hearthstead Loop`, so monsters in each zone stay contained. Map and details are in this same plan file below the main Hearthstead sections.
- **Loop terrain variety** — The 25 loop rooms should have distinct terrain/flavor: meadow, forest edge, rocky outcrop, stream crossing, overgrown field, etc. This keeps the grind loop visually interesting as players circle it repeatedly. The loop is large enough to support varied sub-areas (e.g., wooded stretch on the west, open fields on the east).
- **Loop is Euclidean** — The battle loop is spatially consistent. All compass directions derived from the ASCII map connectors (`/` = NE/SW, `\` = NW/SE, `|` = N/S, `---` = E/W) form a valid 2D grid with no coordinate conflicts.

---

---

# Hearthstead Wilds

> **Status:** BRIEF
> **Level Range:** 1-3
> **Room Count:** 46
> **Connected To:** Hearthstead Loop (G room, via `go path` south)
> **Area String:** `Hearthstead Wilds`

---

## Brief

**Theme:** A dense, winding forest north of Hearthstead that has become strangely hostile. The trails branch and reconverge through varied woodland terrain — mossy ravines, fern groves, clearings, and thickets — before reaching a cave at the back of the wilds. The cave is home to a corrupted bear whose sickness has been spreading through the wildlife, driving aggressive animals toward the hamlet.

**Tone:** Unsettling but not horror. The forest is beautiful in places but clearly wrong — animal carcasses, sickly vegetation, an unnatural stillness. The deeper you go, the more evidence of corruption. The cave is dark and oppressive, with bones and claw marks. The boss fight is a sick, aggressive bear — pitiable as much as dangerous.

**Key Ideas:**

- **Winding forest with multiple paths** — The forest branches at the entrance and offers 2-3 routes that weave and reconnect through a mesh of trails. Players can explore different paths each time. Dead-end rooms reward exploration with loot or quest clues.
- **Environmental storytelling** — Rooms progressively show more signs of corruption: healthy forest at the entrance → wilting plants → dead animals → corrupted vegetation → cave with bones and filth.
- **Cave at the back** — A roughly linear cave (~9 rooms) with small side chambers. The main path leads to the Bear's Lair. Side rooms contain quest evidence (sickly animal remains, strange growths).
- **Quest-driven area** — The primary reason to explore here is "The Woodcutter's Warning" quest from the Hearthstead Inn. Without the quest, the area is still explorable for grinding and loot.

**Layout:**

- **Entry (E)** — Connects south to G on the Hearthstead Loop via `go path`. Single room transitioning from loop to forest.
- **Forest (26 rooms)** — Branching trails that fork, cross, and reconverge. A hub row of 5 E/W rooms spans the middle of the forest with dead-end scenic rooms at each end. Multiple loops give players route variety.
- **Cave (9 rooms)** — Entered via C (Cave Entrance). Main path zigzags NW through 7 rooms to B (Bear's Lair). Two dead-end side chambers branch off for exploration.

**Lore/Backstory:**

- The forest has always been home to wildlife — deer, rabbits, foxes, the occasional bear. Woodcutters from Hearthstead work the edges regularly.
- Recently, something has sickened the bear deep in the cave. A corrupted growth or tainted water source (left intentionally vague for future expansion) has driven the bear mad.
- The bear's aggression has rippled outward: it drives smaller predators from their territory, those predators push prey animals toward the hamlet, and some of the wildlife exposed to the corruption has become sickly and aggressive.
- The woodcutters noticed it first — trees clawed up, animal remains, an unnatural quiet in the deep forest. They stopped going past the first clearing.

---

## Quest: The Woodcutter's Warning

> **Status:** [PENDING]
> **Type:** active

**Setup:** At the Hearthstead Inn (I1, the common room), a woodcutter NPC tells the player about the forest growing dangerous. Wildlife has been behaving strangely — aggressive, sickly, pushing toward the hamlet. He hasn't dared go deep enough to find the cause, but something in the back of the forest is wrong. He asks the player to investigate and bring back evidence.

**Flow:**

1. Player speaks to the woodcutter at the Inn → receives quest context
2. Player enters Hearthstead Wilds via `go path` from G
3. Player explores the forest, fighting aggressive wildlife along the trails
4. Player finds environmental clues in dead-end rooms (corrupted vegetation, sick animal remains)
5. Player reaches the Cave Entrance (C) and enters the cave
6. Player navigates to the Bear's Lair (B) and defeats the corrupted bear
7. Player collects a quest item from the bear (e.g., "corrupted claw" or "strange growth")
8. Player returns to the woodcutter at the Inn with the evidence

**Payoff:** The woodcutter thanks the player. Rewards TBD (copper, XP, possibly a unique low-level item or faction rep). The woodcutter's dialogue changes to reflect the quest completion.

**Affects:** Woodcutter NPC (Inn I1), quest evidence items in dead-end rooms, corrupted bear boss (B), quest reward item from bear drop table.

---

## Rooms

| #   | Status | Name                   | Summary                                 | Terrain     | Notes                   |
| --- | ------ | ---------------------- | --------------------------------------- | ----------- | ----------------------- |
| 1   |        | Overgrown Trailhead    | Entry from the loop, dense brush        | outdoor     | Connects south to G     |
| 2   |        | Shaded Path            | Trail under canopy, fork ahead          | outdoor     |                         |
| 3   |        | Mossy Fork             | West fork, damp mossy ground            | outdoor     |                         |
| 4   |        | Fern-Lined Fork        | East fork, tall ferns                   | outdoor     |                         |
| 5   |        | Dense Undergrowth      | Thick brush, hard to see far            | outdoor     |                         |
| 6   |        | Birch Stand            | Cluster of birch trees, peeling bark    | outdoor     |                         |
| 7   |        | Mossy Ravine           | Shallow ravine with moss-covered rocks  | outdoor     |                         |
| 8   |        | Woodland Crossing      | Trails cross here, trampled earth       | outdoor     |                         |
| 9   |        | Bramble Thicket        | Dense thorny bushes, narrow passage     | outdoor     |                         |
| 10  |        | Twisted Oaks           | Gnarled old oaks, unusual shapes        | outdoor     |                         |
| 11  |        | Stream Crossing        | Shallow stream, stepping stones         | outdoor     |                         |
| 12  |        | Sunlit Glade           | Small clearing, dappled sunlight        | outdoor     |                         |
| 13  |        | Tangled Briars         | Wall of thorny briars, narrow gap       | outdoor     |                         |
| 14  |        | Rocky Outcrop          | Exposed rock, elevated view             | outdoor     |                         |
| 15  |        | Wildflower Meadow      | Open meadow amid the trees              | outdoor     |                         |
| 16  |        | Fallen Log Crossing    | Massive fallen tree forms a bridge      | outdoor     |                         |
| 17  |        | Scenic Overlook        | Western dead end, view of the coast     | outdoor     | Dead end — flavor/loot  |
| 18  |        | Western Clearing       | Wide clearing, old stumps               | outdoor     |                         |
| 19  |        | Forest Heart           | Central hub, largest clearing           | outdoor     |                         |
| 20  |        | Eastern Clearing       | Clearing with wildflower patches        | outdoor     |                         |
| 21  |        | Abandoned Campsite     | Eastern dead end, old fire pit          | outdoor     | Dead end — quest clue   |
| 22  |        | Narrowing Trail (West) | Trail narrows, forest thickens          | outdoor     |                         |
| 23  |        | Narrowing Trail (East) | Trail narrows, sick vegetation          | outdoor     |                         |
| 24  |        | Trail Convergence      | Paths merge, signs of animal distress   | outdoor     |                         |
| 25  |        | Forest Edge            | Trees thin, rocky ground, cave ahead    | outdoor     |                         |
| 26  |        | Gaping Cave Mouth      | Dark opening in the hillside            | outdoor     | C — cave entrance       |
| 27  |        | East Passage           | Narrow passage branching east near C    | underground |                         |
| 28  |        | Damp Alcove            | Dripping dead-end nook, animal remains  | underground | Dead end — quest clue   |
| 29  |        | Dripping Passage       | Main path from C, wet stone walls       | underground |                         |
| 30  |        | Underground Junction   | Passages branch in several directions   | underground |                         |
| 31  |        | Fungal Tunnel          | Bioluminescent fungi on the walls       | underground |                         |
| 32  |        | Winding Tunnel         | Main path twists deeper, claw marks     | underground |                         |
| 33  |        | Stone Chamber          | Wider space, rubble and old bones       | underground |                         |
| 34  |        | Claw-Marked Passage    | Deep scratches, leads east toward K     | underground |                         |
| 35  |        | Overgrown Path         | Side trail, nearly hidden by brush      | outdoor     | Forest room (off rm 24) |
| 36  |        | Goblin's Den           | Foul-smelling chamber, crude furnishing | underground | K — mini-boss, dead end |
| 37  |        | Dark Corridor          | Low ceiling, stale air                  | underground |                         |
| 38  |        | Dripping Chamber       | Water pools on the uneven floor         | underground |                         |
| 39  |        | Bone-Littered Tunnel   | Gnawed bones scattered in the passage   | underground | Quest clue              |
| 40  |        | Narrow Squeeze         | Walls close in, must turn sideways      | underground |                         |
| 41  |        | Crossroads             | Paths cross, scuff marks on stone       | underground |                         |
| 42  |        | Deep Tunnel            | Air grows thick, smell of animal musk   | underground |                         |
| 43  |        | Rocky Descent          | Rough downward slope, loose stones      | underground |                         |
| 44  |        | Upper Chamber          | Larger space, old claw marks on ceiling | underground |                         |
| 45  |        | Collapsed Side Passage | Partially caved-in tunnel, debris       | underground |                         |
| 46  |        | Bear's Lair            | Large chamber, nest of debris and bones | underground | B — boss room, dead end |

### Layout

<!-- Wilds rooms are shown in the unified ASCII map above (north of G). -->

### Room Features

| Room | Feature | Config                              |
| ---- | ------- | ----------------------------------- |
| K    | boss    | Corrupted goblin mini-boss encounter |
| B    | boss    | Corrupted bear encounter             |

---

## Points of Interest

| Status    | Room | Feature             | Description                                                   | Interactable? |
| --------- | ---- | ------------------- | ------------------------------------------------------------- | ------------- |
| [PENDING] | 21   | Old Fire Pit        | Cold ashes, a bedroll, empty waterskin. Abandoned hastily.    | No            |
| [PENDING] | 17   | Coastal View        | Through the trees, a glimpse of the sea and Arindale's walls. | No            |
| [PENDING] | 28   | Sick Animal Remains | Carcass of a fox, matted fur, strange discoloration.          | Yes — quest   |
| [PENDING] | 39   | Gnawed Bones        | Pile of bones — deer, rabbits, something larger. Claw marks.  | Yes — quest   |
| [PENDING] | 25   | Claw-Marked Trees   | Deep gouges in the bark. Whatever made these is large.        | No            |
| [PENDING] | 46   | Corrupted Nest      | Matted fur, bones, and a strange dark growth on the walls.    | Yes — quest   |

---

## NPCs

### Hostile Mobs

<!-- Forest mobs: levels 1-2 throughout the forest trails. Cave mobs: levels 2-3. Boss: level 3. -->

| Status    | Name             | Level | Spawn Room      | Behavior             | Notes                       |
| --------- | ---------------- | ----- | --------------- | -------------------- | --------------------------- |
| [PENDING] | TBD (forest mob) | 1-2   | Forest rooms    | roams, basic attacks | Sickly wildlife, low threat |
| [PENDING] | TBD (forest mob) | 1-2   | Forest rooms    | roams, basic attacks | Aggressive animal variant   |
| [PENDING] | TBD (cave mob)   | 2-3   | Cave rooms      | stationary           | Cave-dwelling creature      |
| [PENDING] | corrupted goblin | 2-3   | K (Goblin's Den)| mini-boss, no flee   | Mini-boss, guards east cave |
| [PENDING] | corrupted bear   | 3     | B (Bear's Lair) | boss, no flee        | Quest boss, drops evidence  |

### Merchants / Friendly NPCs

| Status    | Name       | Level | Spawn Room | Role      | Notes                                  |
| --------- | ---------- | ----- | ---------- | --------- | -------------------------------------- |
| [PENDING] | Woodcutter | —     | I1 (Inn)   | Quest NPC | Gives "The Woodcutter's Warning" quest |

---

## Items

### Quest Items

| Status    | Name           | Purpose                                     | Found Via           |
| --------- | -------------- | ------------------------------------------- | ------------------- |
| [PENDING] | corrupted claw | Evidence for the woodcutter — quest turn-in | Corrupted bear drop |

---

## Drop Tables

### Corrupted Bear Loot

| Status    | Item           | Drop% | Qty | Currency (copper) | Denominations |
| --------- | -------------- | ----- | --- | ----------------- | ------------- |
| [PENDING] | corrupted claw | 100   | 1   | 20-60             | copper,silver |

---

## Designer Notes

- **Entry connection** — Room 1 (Overgrown Trailhead) connects south to G on the Hearthstead Loop via `go path`. This is a triggered passage: from G type `go path` to reach the trailhead, from the trailhead go south to return to G. In the unified map, the trailhead is the `*` directly above G.
- **Forest layout** — The forest fans out from the trailhead through branching diagonal paths, creating a woven mesh. Players have 2-3 route options through the forest at any point. Dead-end rooms (17 Scenic Overlook, 21 Abandoned Campsite) reward exploration.
- **Cave layout** — 20 rooms with two main branches from C. The western branch is the main path winding NW to B (Bear's Lair). The eastern branch leads through a network of tunnels to K (Goblin's Den, corrupted goblin mini-boss). The branches interconnect at several points, giving players multiple routes. Dead-end rooms (28 Damp Alcove, 39 Bone-Littered Tunnel) contain quest clues.
- **Terrain transition** — Forest rooms use terrain `outdoor`. Cave rooms (26-34) use terrain `underground`. Room 26 (Cave Entrance) can be either — it's the mouth of the cave, still open to the sky.
- **Quest evidence placement** — Rooms 28 (sick animal remains), 39 (gnawed bones), and 46 (corrupted nest in bear's lair) contain environmental clues. The mandatory quest item (corrupted claw) drops from the bear in room 46.
- **Difficulty ramp** — Forest mobs are level 1-2 (sickly but not dangerous). Cave mobs are level 2-3 (tougher in the dark). Corrupted goblin at K is level 2-3 (mini-boss, east branch). Corrupted bear at B is level 3 (main boss, no flee, quest fight).
- **Map is Euclidean** — All 46 Wilds room coordinates are unique. The entire 89-room map is shown in the unified ASCII map above.
