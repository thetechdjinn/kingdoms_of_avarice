# Arindale Sewer

> **Status:** BRIEF
> **Level Range:** 3-6
> **Room Count:** Defined by ASCII map (see Layout section)
> **Connected To:** Arindale (multiple street manholes, Halls of the Dead crack)

---

## Brief

**Theme:** A medieval city sewer system beneath Arindale. Stone-lined drainage tunnels, brick archways, flowing waste channels, and forgotten passages. A functional piece of city infrastructure that has become home to vermin, outcasts, and things that prefer the dark. Deeper sections show signs of older construction — remnants of whatever stood here before Arindale was built.

**Tone:** Dark, damp, and oppressive. The air is thick with the smell of decay and stagnant water. Echoes carry strangely through the tunnels. There are pockets of relative safety near the manhole entrances where light filters down from above, but the deeper you go the more hostile and forgotten it becomes. Not horror — just the grim, practical ugliness of a place built to carry away what the city doesn't want to see.

**Key Ideas:**

- **General exploration area for levels 3-6** — the first real combat zone players encounter after the safety of Arindale. Difficulty should ramp as players move deeper/further from entrances.
- **Multiple entrance manholes** from various Arindale streets — players can drop in from several points across the city grid, not just Town Square.
- **Halls of the Dead escape route** — a crack in the wall of the Halls of the Dead (cathedral crypt) connects to the sewer, giving evil-aligned players a way out of the city without passing through guard-patrolled streets. "go crack" command.
- **Thieves Guild entrance (placeholder)** — somewhere in the deeper sewer there is a hidden or guarded passage leading to the Thieves Guild. The guild itself is a separate area designed later, but the sewer should be designed with this connection point in mind. The surrounding sewer rooms should feel like a lead-up — more human activity, signs of organized presence, watchful eyes.
- **Interesting sub-sections for quests** — the sewer isn't just uniform tunnels. There should be distinct sections/zones within it that can serve as quest destinations: a flooded section, a rat nest, a collapsed area, an old cistern, a smuggler's cache, etc.
- **Level progression through geography** — areas near manhole entrances are level 3 territory (rats, small vermin). Mid-sewer is level 4-5 (larger creatures, undead, thugs). Deep sewer near the thieves guild approach is level 5-6 (organized criminals, tougher monsters).

**Layout Ideas:**

- The sewer does NOT need to be spatially exact compared to Arindale above. Manhole exits and the Halls of the Dead crack should land in roughly the same general area of the sewer as their corresponding surface location (e.g., cathedral/Halls of the Dead is lower-east Arindale, so the crack exit should be in the lower-east sewer). But the sewer layout is its own thing — this flexibility gives us room to design interesting spaces without being locked to the street grid.
- **General sewer tunnels are the core of the area** — winding, interconnecting passages that form the bulk of the room count. These are `Arindale Sewer` area rooms where players explore, fight general sewer mobs (rats, slimes, etc.), and discover the entrances to the quest sub-zones. The tunnels should loop and interconnect so there are multiple paths between points — not a single corridor. Good for wandering and grinding.
- **All manhole entrances and the Halls of the Dead crack exit into general sewer rooms** — players never drop directly into a quest sub-zone. They always land in the general sewer network and must navigate from there to find the sub-zone entrances. This keeps the sub-zones feeling like discoveries, not destinations you teleport to.
- Main trunk tunnels form the connective tissue, with smaller lateral tunnels branching off. Hub rooms at major junctions serve as navigation landmarks.
- **The general sewer itself is both the connective tissue AND a quest zone.** It connects all the sub-zones and manholes, but also hosts its own quest content. Specific designed sections of the general sewer (blockages, flooded passages, collapsed tunnels) support quests like "What is clogging up the sewers?" — players investigate and resolve problems within the sewer infrastructure itself, not just in the branching sub-zones.
- **3 distinct quest sub-zones** branch off from the general sewer tunnels. Each has its own area string and character. Players find these by exploring the general sewer:
  1. **Sanctum of the Damned** — A hidden shrine and meeting place for "The Disciples of Malachi," a forbidden religious cult. Accessed from the sewer but uses its own area string (`Sanctum of the Damned`) to contain NPC roaming. Cult members fight here; the boss room is the **Reliquary of the Obsidian Sun** (the shrine itself). Some cult NPCs may be placed in the sewer-side approach as scouts/sentries using the sewer area, but the bulk of the cult stays within the sanctum area boundary.
  2. **Warrens of Filth** — A claustrophobic, vermin-infested rat territory. The first quest destination for low-level players. Tight crawlspaces, gnawed-through walls, filth, and the overwhelming stench of vermin. The boss is **Retchtail, the Rat King** — not royalty but a biological horror, a scavenger lord ruling from a massive tangled nest. Boss room: **Retchtail's Lair**. Uses its own area string (`Warrens of Filth`) to contain NPC roaming. Should be near the sewer entrances since it targets the lowest-level players (level 3-4).
  3. **The Iridescent Menagerie** — A secret underground laboratory and creature pen belonging to **Master Silas Quint**, the brilliant but unhinged alchemist who owns the alchemy shop in Arindale. Filled with mutated creatures, failed experiments, glowing reagents, and alchemical hazards. The quest here doesn't necessarily end in killing Silas — he yields and offers the player something valuable instead (introduces alchemy to the game). Uses its own area string (`The Iridescent Menagerie`) to contain NPC roaming. Ties directly to the Arindale alchemist shop above.
- **Thieves Guild Approach** — a section of the deeper general sewer that serves as the lead-up to the Thieves Guild entrance. Uses the `Arindale Sewer` area string (it's part of the sewer, not a separate area). Signs of organized human activity, dead drops, deliberately confusing tunnels, watchers. Part of a future thieves quest line. The guild entrance itself is a placeholder for the separate Thieves Guild area.
- Non-Euclidean layout is acceptable in the deeper/older sections and within quest sub-zones where tunnels twist and the original grid breaks down.

**Connection Points:**

- **Town Square manhole** → down ("go manhole") — drops into a general sewer room near the center of the network. NOT into a quest sub-zone.
- **Additional street manholes** (3-5 total across Arindale) — placed at key street intersections or district boundaries. Each drops into a different general sewer room, giving players multiple entry/exit points. All manholes land in general sewer tunnels, never directly in sub-zones. Exact Arindale rooms TBD when we design the sewer layout.
- **Halls of the Dead → Sewer** — "go crack" from the Halls of the Dead respawn room. Exits into a general sewer room in the lower-east section of the sewer (matching the cathedral's surface position). NOT into a quest sub-zone. This is the evil-aligned player's escape route.
- **[FUTURE] Sewer → East Road (Y)** — an exit on the far east of the sewer that leads to the East Road outside the city. This is the evil-aligned escape route: die → respawn in Halls of the Dead → "go crack" into sewer → navigate sewer → exit via east road → freedom without passing through guard-patrolled streets. Will be connected when an area outside the walls exists.
- **[FUTURE] Sewer → Outside the City Walls (D)** — the Drain Outflow at the far north of the sewer. A drainage tunnel that exits outside Arindale's walls near the harbor. Future connection point.
- **[FUTURE] Sewer → Thieves Guild (T)** — a hidden passage in the deep south sewer leading to the Thieves Guild (separate area). Placeholder room designed now to support this future connection.

**Lore/Backstory:**

- The sewer system was built when Arindale was founded (or possibly inherited from an older settlement). The main trunk lines are solid stone construction — functional and enduring.
- Over the centuries, sections have collapsed, been flooded, or been quietly repurposed by those who prefer to operate out of the city's sight.
- The city guard occasionally sends patrols into the near-surface sections but has largely given up on the deeper tunnels. Whatever lives down there is considered someone else's problem.
- Rumors in the city speak of a thieves guild operating somewhere beneath the streets, but the guard has never found an entrance. The guild likes it that way.

---

## Rooms

<!-- AI fills this section with room proposals. Designer reviews and sets status tags. -->

| #   | Status | Name | Summary | Terrain | Notes |
| --- | ------ | ---- | ------- | ------- | ----- |
|     |        |      |         |         |       |

### Layout

#### Unified Sewer Map

All rooms below use area string `Arindale Sewer`. Sub-zone entrances (>>)
lead to separate areas. The map is the authoritative source for room layout —
every room and connection shown must exist in the seed data. No two rooms
share a position and all connections follow cardinal directions.

```
ARINDALE SEWER

Legend:  * = general sewer room
        K = Manhole: Harbor Rd / King's Rd   C = Manhole: Town Square
        M = Manhole: West Wall / Main St     G = Manhole: East Wall / Main St
        O = Manhole: South Wall / King's Rd  D = Drain Outflow (future)
        F = Flooded section (NW cluster)     B = Blockage section (quest)
        S = Sanctum of the Damned entrance   W = Warrens of Filth entrance
        I = Iridescent Menagerie entrance    T = Thieves Guild entrance
        H = Halls of the Dead crack          E = Dead End
        Y = Future East Road Exit

North ^

           D
           |
       *---*---*---*---*---K---*---*---*---*---*---*---*---*---*---*---*---*
       |       |       |   |           |   |   |   |   |   |       |       |
       *   *---*   F---*   *   S---*---*   *   *   *   *   *   *---*   *---*
       |   |       |   |   |           |   |   |   |   |   |   |       |
       *   *   F---F   *---*---*---*---*---*---*---*---*---*   *   *---*---*
       |   |       |   |   |   |   |   |   |   |   |       |   |   |       |
       *   *   F---F   *   *   *   *   *   *   *   *       *   *   *       W
       |   |   |       |   |   |   |   |   |   |   |       |   |   |
       *---*   *   *---*---*---*---*   *---*---*---*---*   *---*---*
               |   |       |       |       |       |   |
       M---*---*---*---*---C---*---*---*---*---*---G   *---*---*
       |   |   |   |       |       |       |       |       |   |
       *   *   *   *       *       *   *---*       *   *---*   *
       |   |   |   |       |       |   |           |   |       |
   I---*   *   *---*       *       *   *       *---*   *   *---*
       |       |           |       |   |       |       |   |
       *   *---*       *---*       *   *   *---*   *---H   *
           |           |           |   |   |       |       |
           *       *---*   *---*---*   *---*---*   *---*   *
                   |       |       |           |   |       |
                   *---*---O   B---*           *---*---*---*---Y
                   |   |       |   |
                   *   *---*   *   *
                   |       |   |   |
                   *---*   *---*   *
                       |           |
                       *---*   *---*
                           |   |
                           T   E
```

K: Manhole->Harbor Road / King's Road Intersection
M: Manhole->West Wall / Main Street Intersection
G: Manhole->East Wall / Main Street Intersection
C: Manhole->Town Square Intersection
O: Manhole->South Wall / King's Road Intersection
T: Thieves Guild Entrance
B: Blockage Section
D: Drain Outflow
H: Hall of Dead / Secret Passage to Sewers
F: Flooded Sewer Section
I: Iridescent Menagerie Entrance
S: Sanctum of the Damned Entrance
W: Warrens of Filth
E: Dead End
Y: Future East Road Exit / For Evil players leaving city without guards attacking

**Section descriptions:**

- **Central Hub (C)** — Town Square manhole lands here. Light from grates above.
  Junction between all major tunnel sections. Safest area, level 3 mobs.

- **North Tunnels (K)** — Harbor manhole (K) lands here. Damp, waterfront seepage.
  Flooded Section (F cluster, NW) blocks direct paths — part of the sewer quest.
  Drain Outflow (D) at the very north — future connection point outside the walls.
  Sanctum of the Damned entrance (S) in the upper-east, marked by incense and
  carved symbols. Eastern branch extends into drainage tunnels beneath the harbor
  district. Western branch curves south through older tunnels to connect with the
  Market manhole area, creating a large loop for exploration. Level 3-4 mobs.

- **West Tunnels (M)** — Market manhole (M) lands here. Older brick, strange stains
  from alchemy runoff. Iridescent Menagerie entrance (I) glows faintly behind
  a false wall, west of the manhole. Level 3-5 mobs.

- **East Tunnels (G)** — Garrison manhole (G) lands here. Heavy cathedral foundations
  in the walls. Halls of the Dead crack (H) enters lower-east. Warrens of Filth
  entrance (W) on the far east. Level 4-5 mobs.

- **South Tunnels (O)** — Southwall manhole (O) lands here. Deepest, darkest section.
  Blockage (B) is the other half of the sewer quest. Thieves Guild entrance (T) at
  the very bottom — cleaner tunnels, torch sconces, bootprints. Dead End (E) at
  the bottom-east. Future East Road Exit (Y, far east) is the evil-aligned escape
  route outside the walls without passing through guards. Level 5-6 mobs.

#### Structural Overview

The sewer is divided into 5 interconnecting sections. All rooms use area string
`Arindale Sewer`. Sub-zones branch off via clearly marked entrances into their
own area strings. The sections form a rough ring with the Central Hub at the
center, allowing multiple paths between any two points.

```
SURFACE REFERENCE (Arindale above, for manhole placement):

     Col 0       Col 1       Col 2       Col 3       Col 4
    Westwall    Market St   King's Rd   Cathedral   Eastwall

Row 0  Harbor Rd ──────────[K]──────────────────────────────
       Park                  │            Garrison
Row 1  ─────────────────── Marshal St ─────────────────[G]──
                             │
Row 2  ──────────[M]──────[C]@──────────────────── E.Gate
       Market               │            Cathedral
Row 3  ─────────────────── Cloister ───────────────────[H]──
                             │            (underground)
Row 4  ────────────────────[O]──────────────────── S.Gate
       Southwall

K/M/C/G/O = Manholes    H = Halls of the Dead crack
D = Drain Outflow (north sewer)    Y = Future East Road Exit (east sewer)
```

```
SEWER NETWORK SCHEMATIC (not to scale):

         ┌─────────────────────────────┐
         │      NORTH TUNNELS          │
         │      K (Harbor manhole)     │
         │      D (Drain Outflow)      │
         │      F (Flooded Section)    │
         │      S (>>Sanctum)          │
         └────────┬──────────┬─────────┘
                  │          │
    ┌─────────────┴──┐  ┌───┴──────────────┐
    │ WEST TUNNELS   │  │  EAST TUNNELS    │
    │ M (Market MH)  │  │  G (Garrison MH) │
    │ I (>>Menagerie)│  │  H (Halls crack) │
    └──────┬─────────┘  │  W (>>Warrens)   │
           │            └───┬──────────────┘
    ┌──────┴────────────────┴──────┐
    │      CENTRAL HUB             │
    │      C (Town Square MH)      │
    └──────┬───────────────────────┘
           │
    ┌──────┴───────────────────────┐
    │      SOUTH TUNNELS           │
    │      O (Southwall MH)        │
    │      B (Blockage Section)    │
    │      T (>>Thieves Guild)     │
    │      E (Dead End)            │
    │      Y (Future East Rd Exit) │
    └──────────────────────────────┘

Connections form a ring: N↔W, W↔C, C↔E, E↔N (upper ring)
                         W↔C, C↔S, S↔E (lower paths)
Multiple paths between any two sections.
```

#### Manhole Mapping

| Manhole     | Arindale Surface Room              | Sewer Landing Section | Command    |
| ----------- | ---------------------------------- | --------------------- | ---------- |
| Town Square | Town Square (int_2_2)              | Central Hub           | go manhole |
| Harbor      | Harbor Rd & King's Rd (int_0_2)    | North Tunnels         | go manhole |
| Market      | Market St & Main St (int_2_1)      | West Tunnels          | go manhole |
| Garrison    | Marshal St & Eastwall (int_1_4)    | East Tunnels          | go manhole |
| Southwall   | Southwall Rd & King's Rd (int_4_2) | South Tunnels         | go manhole |

| Special Entry     | Arindale Room        | Sewer Landing Section     | Command  |
| ----------------- | -------------------- | ------------------------- | -------- |
| Halls of the Dead | cathedral_halls_dead | East Tunnels (lower-east) | go crack |

| Placeholder Exit   | Sewer Section             | Destination        | Notes                                     |
| ------------------ | ------------------------- | ------------------ | ----------------------------------------- |
| Drain Outflow (D)  | North Tunnels (far north) | Outside city walls | Future connection point                   |
| East Road Exit (Y) | South/East (far east)     | East Road          | Future — evil escape route without guards |

#### Sub-Zone Entrances

| Sub-Zone               | Map | Sewer Section           | Reasoning                                         |
| ---------------------- | --- | ----------------------- | ------------------------------------------------- |
| Warrens of Filth       | W   | East Tunnels (far east) | Accessible early, near garrison manhole           |
| Iridescent Menagerie   | I   | West Tunnels            | Beneath market district where the alchemy shop is |
| Sanctum of the Damned  | S   | North Tunnels           | Hidden in the northern tunnels near the harbor    |
| Thieves Guild Approach | T   | South Tunnels (deep)    | Deepest section, hardest to find                  |

#### Quest Areas Within the General Sewer

**Flooded Section (F)** (North Tunnels — NW cluster)
A section of the north tunnels that is partially or fully flooded. Something
upstream is blocking the normal drainage flow. Part of the "what's clogging
the sewers" quest. Players may need to clear debris, fight whatever is nesting
in the blockage, or find an alternate route around. The flooding creates a
different feel from the rest of the sewer — water up to waist height, submerged
passages, things moving beneath the surface.

**Blockage Section (B)** (South Tunnels)
A major obstruction in the south tunnels — collapsed stonework, accumulated
debris, or something deliberately placed. This is the other half of the sewer
quest. The blockage may be connected to the Thieves Guild — they could be
deliberately redirecting water flow or blocking city maintenance access to
protect their approach routes.

**Thieves Guild Approach (T)** (South Tunnels)
The deepest part of the south tunnels. The tunnels here are cleaner, more
maintained. Torch sconces appear in the walls. Fresh bootprints in the grime.
Dead-end branches that are actually lookout posts. The layout is deliberately
confusing — wrong turns, loops that circle back. At the end, a dead-end wall
that will become the Thieves Guild entrance when that area is built.

**Dead End (E)** (South Tunnels)
The bottom-east terminus of the south tunnels. A passage that simply ends —
collapsed or never completed. May hint at deeper construction below.

### Room Features

<!-- Special rooms: training, respawn, bank, etc. -->

| Room | Feature | Config |
| ---- | ------- | ------ |
|      |         |        |

---

## Points of Interest

<!-- Environmental details, interactable objects, flavor elements placed in rooms -->

| Status | Room | Feature | Description | Interactable? |
| ------ | ---- | ------- | ----------- | ------------- |
|        |      |         |             |               |

---

## NPCs

### Hostile Mobs

| Status | Name | Level | Spawn Room | Behavior | Notes |
| ------ | ---- | ----- | ---------- | -------- | ----- |
|        |      |       |            |          |       |

### Merchants / Friendly NPCs

| Status | Name | Level | Spawn Room | Role | Notes |
| ------ | ---- | ----- | ---------- | ---- | ----- |
|        |      |       |            |      |       |

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

| Status | Location               | Direction | Type   | Lock | Key/Trigger  | Notes                                                                     |
| ------ | ---------------------- | --------- | ------ | ---- | ------------ | ------------------------------------------------------------------------- |
|        | T room (south tunnels) | down      | secret | none | `go conduit` | Broken conduit in floor — descends to The Thieves Guild below sewer level |

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

### The Clogged Sewers

> **Status:** PENDING
> **Type:** active

**Setup:**

The **notice board** in Town Square has a posting from the mayor about flooding in parts of the city — drains backing up, water pooling in the streets near certain districts. The notice directs concerned citizens to speak with the mayor.

When the player speaks with the mayor, he explains that the city's sewer system is failing. Water isn't draining properly, and the maintenance crews he's sent down haven't come back (or came back too scared to continue). Something is blocking the flow in the deep sewers, and the flooding is getting worse. On top of that, there are reports of flooded sections in the upper tunnels that didn't used to be there. He needs someone to go down, find the cause, and clear it.

**Flow:**

1. Player sees the notice on the Town Square bulletin board and speaks with the mayor
2. Player enters the Arindale Sewer through any manhole
3. Player finds the **Flooded Section (F)** in the north tunnels — water up to waist height, submerged passages, things moving beneath the surface. This is a symptom of the blockage, not the cause.
4. Player must navigate or find a way around the flooded section
5. Player searches deeper — into the south tunnels — to find the **Blockage (B)**
6. The blockage is a major obstruction — collapsed stonework, accumulated debris, or something deliberately placed. Whatever is nesting in or around the blockage must be fought
7. Player clears the blockage (kill enemies, interact with the obstruction)
8. The flooding may subside (or this could be flavor — the sewer starts draining properly again)
9. Player returns to the mayor to report success

**Payoff:**

- Experience and currency reward from the mayor
- Loot from whatever is nesting in the blockage (TBD)
- Opens up previously flooded/blocked areas for further exploration
- The player has now explored both the north and south tunnels — exposing them to a large section of the sewer and potentially discovering other sub-zone entrances along the way

**Affects:**

- **Town Square (notice board)** — bulletin board posting about flooding. Same board as the cultist bounty — the board serves as a central quest discovery point.
- **Arindale (mayor)** — the mayor gives the quest details and reward. Same NPC as the cultist quest.
- **Arindale Sewer (north tunnels)** — Flooded Section (F) rooms need flooded descriptions and possibly water-based enemies
- **Arindale Sewer (south tunnels)** — Blockage (B) rooms need obstruction descriptions and enemies guarding/nesting in the blockage
- **NPCs:** Mayor (quest giver), flooded section enemies (TBD), blockage enemies (TBD)

**Quest system notes (for future implementation):**

- Two-objective quest: investigate the flooding (F) then find and clear the blockage (B)
- The flooded section and the blockage are on opposite ends of the sewer — this forces the player to traverse the full map, discovering sub-zone entrances and sewer geography along the way
- The blockage may be connected to the Thieves Guild — they could be deliberately redirecting water flow to protect their approach routes. This is a lore hook, not necessarily something the player discovers during this quest
- The notice board in Town Square is a reusable quest discovery mechanism — multiple quests can be posted there

---

## Merchant Inventory

### [Merchant Name]

| Status | Item | Max Stock | Restock% | Notes |
| ------ | ---- | --------- | -------- | ----- |
|        |      |           |          |       |

### Merchant Responses

| Status | Keywords | Response |
| ------ | -------- | -------- |
|        |          |          |

---

## Designer Notes

### Future Connections (do not build yet, design around these)

1. **Thieves Guild entrance (T)** — A secret passage in the deep south sewer tunnels leading down to The Thieves Guild (separate area, below the sewer level). The sewer room at T contains a large broken water conduit partially embedded in the floor. Players enter via `go conduit` — the passage descends below the sewer floor into the guild's entry shaft. The surrounding sewer rooms (the Thieves Guild Approach section) serve as the lead-up: cleaner tunnels, torch sconces, bootprints, deliberately confusing layout. See `areas/thieves_guild/plan.md` for the guild area plan.

2. **East Road Exit (Y, far east)** — An exit on the far east side of the sewer leading to the East Road outside the city. This is the evil-aligned escape route: die → respawn in Halls of the Dead → "go crack" into sewer → navigate sewer → exit via east road → freedom without passing through guard-patrolled streets. For now, leave as a dead-end room marked as the future connection point.

3. **Drain Outflow (D, far north)** — A drainage outflow at the very north of the sewer, above the Harbor manhole. Exits outside Arindale's walls near the harbor/waterfront. Future connection point — could lead to docks, harbor exterior, or coastal areas when those are built.

4. **Deeper dungeon** — The sewer could eventually have a "down" passage leading to something even deeper beneath the city (ancient ruins, catacombs, etc.). Not planned yet, but worth leaving a suggestive room description in the deepest part of the sewer.

### Design Principles

- **Spatial flexibility** — the sewer is loosely beneath Arindale but not a 1:1 mirror. Manholes and the Halls of the Dead crack land in the general area of their surface counterpart (Town Square manhole = central sewer, cathedral crack = lower-east sewer), but the sewer layout is free to be whatever makes the best gameplay.
- **Multiple entry points keep the sewer accessible** — players shouldn't have to walk across the entire city to reach a manhole. 4-6 manholes spread across Arindale districts means you're never far from a sewer entrance.
- **General sewer is both backbone AND quest zone** — the bulk of the rooms are general sewer tunnels (area string `Arindale Sewer`). These are winding, interconnecting passages with loops and multiple paths between points. Good for grinding, exploring, and discovering sub-zone entrances. All manholes and the Halls of the Dead crack exit into general sewer rooms — never directly into a sub-zone. The general sewer also hosts its own quest content — designed sections like blockages, flooded passages, and collapsed tunnels that support sewer-infrastructure quests (e.g., "What is clogging up the sewers?").
- **Level ramp by depth/distance** — near manholes = level 3, mid-sewer = level 4-5, deep sewer = level 5-6. Players naturally learn to go deeper as they level.
- **3 quest sub-zones + Thieves Guild Approach + general sewer quests** — three sub-zones (Sanctum/S, Warrens/W, Menagerie/I) branch off from the general sewer with their own area strings. The Thieves Guild Approach (T) is part of the general sewer itself (uses `Arindale Sewer` area string). The general sewer also has its own designed quest sections. See sub-zone list in Layout Ideas above.
- **Sub-zone area boundaries** — the three branching sub-zones use separate area strings so their NPCs don't roam into the general sewer. A few sentry NPCs near sub-zone entrances may use the sewer area string to serve as lead-in encounters. See `areas/sanctum_of_the_damned/plan.md` for the pattern. The Thieves Guild Approach uses the sewer area string since it's part of the sewer.
- **The Halls of the Dead crack is a one-way escape feel** — easy to find from the crypt side (it's obvious to someone looking for a way out), but from the sewer side it's just another crack in the wall in a dark passage. Evil players learn the route; good players might stumble on it but it's not a main thoroughfare.
