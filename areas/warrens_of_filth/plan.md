# Warrens of Filth

> **Status:** BRIEF
> **Level Range:** 3-4 (first quest area for new players)
> **Room Count:** Defined by ASCII map (see Layout section)
> **Connected To:** Arindale Sewer (accessed from near-entrance sewer tunnels)
> **Area String:** `Warrens of Filth` (separate area from the sewer — used to contain NPC roaming)

---

## Brief

**Theme:** A vermin-infested rat territory that has overtaken a section of the sewer. This isn't a civilized space repurposed — it's been claimed by animals. Walls gnawed through, tunnels burrowed into the earth alongside the stonework, nesting material clogging drainage channels, bones and refuse piled in corners. The rats here aren't normal city vermin — they're larger, more aggressive, organized around a dominant alpha: Retchtail, the Rat King.

**Tone:** Claustrophobic, dirty, and physically threatening. The ceilings are low, the passages are tight, and the footing is treacherous. The smell is overpowering — rotting food, animal waste, wet fur. Sounds are close and constant: scratching, chittering, things moving just out of sight. This should feel like crawling into something's home where you are not welcome and not the biggest thing here.

**Key Ideas:**

- **First quest destination for low-level players** — likely the earliest quest players receive that sends them into the sewer. "Clear out the rats" or "kill the Rat King" is a classic for a reason. Should be located near the sewer entrances so new players don't have to navigate deep into the sewer to find it.
- **Separate area from the sewer** — uses its own area string (`Warrens of Filth`) so warren rats don't roam into the general sewer. Regular sewer rats use the sewer area string; warren rats are bigger, meaner, and stay in their territory.
- A claustrophobic sub-dungeon with branching burrows, dead-end nesting chambers, and a long filthy tunnel loop. Players should be able to clear it in one session.
- **Claustrophobic layout** — narrow passages, low ceilings, rooms that feel cramped. Not a grid — organic tunnels that branch and twist. Some passages might require crawling (flavor, not a mechanic).
- **Retchtail, the Rat King** — the boss. Not a king on a throne but a scavenger lord in a massive, tangled nest. Retchtail is a biological horror — bloated, scarred, surrounded by his brood. He's described as "Retchtail, the Rat King" (proper name, with title as description). Boss room is **Retchtail's Lair**.
- **Retchtail's Lair** — the deepest room. Not a throne room — a massive nest. Think a room-sized tangle of shredded cloth, bones, stolen objects, matted fur, and filth, with Retchtail at its center. The nest itself is the terrain — uneven, unstable, crunching underfoot.
- **Escalating vermin density** — outer rooms have scattered rats and signs of infestation. Mid rooms have more aggressive packs. The lair itself is the worst of it.

**Layout Ideas:**

- Entered from the Arindale Sewer through a section of tunnel where the stonework has been gnawed and burrowed through. The transition should be obvious — clean-ish sewer stone gives way to crumbling, chewed walls and the stench of vermin.
- Passages should feel organic and irregular — not straight corridors but winding burrows through and around the original sewer infrastructure.
- Rooms get smaller and more claustrophobic as you go deeper toward the lair.
- A few dead-end rooms with nesting chambers or refuse piles (places where rats congregate — good for encounters).
- **Retchtail's Lair** at the deepest point. Larger than the surrounding rooms — a chamber the rats have hollowed out over time, now dominated by the massive nest.
- Possible loop or alternate path so players aren't forced into a single-file corridor the entire way (allows retreating and re-engaging).

**Connection Points:**

- **Arindale Sewer → Warrens entrance** — located in the near-entrance section of the sewer, not deep. Players should find this relatively early when exploring the sewer. The entrance is a gnawed-open section of wall or a collapsed drain that opens into the warrens.

**Lore/Backstory:**

- The rats have always been in the sewer, but this colony has grown unusually large and aggressive. Something about Retchtail — his size, his dominance — has drawn the vermin together into a territorial swarm.
- The city has noticed: more rats on the streets, damage to stored food, a shopkeeper bitten badly. Someone in Arindale will want this dealt with (quest hook).
- Retchtail himself is just a very large, very old, very mean rat. No magic, no curse — just nature at its most unpleasant. He's survived down here longer than anything else and the colony follows him because he's the biggest and most vicious.

---

## Rooms

<!-- AI fills this section with room proposals. Designer reviews and sets status tags. -->

| #   | Status | Name | Summary | Terrain | Notes |
| --- | ------ | ---- | ------- | ------- | ----- |
|     |        |      |         |         |       |

### Layout

```
WARRENS OF FILTH

Legend: [EN] = Entrance (from Arindale Sewer >>WF)
       B = Bone Heap          L = Retchtail's Lair (boss)
       N = Nesting Chamber    P = Refuse Pit
       F = Filthy Tunnel      S = Scratched Corridor
       C = Collapsed Drain    G = Feeding Ground
       J = Burrow Junction    * = Standard room

                           *---*---*---*
                           |   |       |
                   B   *---*   *   S---*---F
                   |   |           |       |
           *---*---*   *   C---S---S---S   F---F
           |           |       |       |       |
    [EN]---*---*---*---J---S---S---S---S---N   F---F---F---F
                       |               |   |               |
                       *---*---*---*---S---N   *---*---*---F
                       |           |           |           |
                       *   *---*---*---G       *   L---*   F
                       |   |       |           |       |   |
                       *---*   P---*---F       *---*---*   F
                                       |                   |
                                       F---F---F---F---F---F
```

**Room key:**

| Code | Name               | Description                                                                               |
| ---- | ------------------ | ----------------------------------------------------------------------------------------- |
| [EN] | Entrance           | Gnawed opening from the Arindale Sewer. Sewer stone gives way to crumbling, chewed walls. |
| J    | Burrow Junction    | Major crossroads. Tunnels branch in every direction. Chittering echoes from all of them.  |
| B    | Bone Heap          | Dead end. Pile of small bones — birds, cats, other rats. Picked clean.                    |
| S    | Scratched Corridor | Claw marks gouge the walls. The stench thickens. Rats scurry ahead of you.                |
| N    | Nesting Chamber    | Shredded cloth and matted fur line the walls. Smaller nests — not the main one.           |
| C    | Collapsed Drain    | A caved-in drainage pipe. Rats pour through gaps in the rubble.                           |
| G    | Feeding Ground     | Gnawed crates and torn sacks — stolen food stores dragged down from the city above.       |
| P    | Refuse Pit         | Sunken chamber filled with rotting food and waste. The colony's dump.                     |
| F    | Filthy Tunnel      | Slick with grime, half-chewed debris underfoot. The deepest, foulest passages.            |
| L    | Retchtail's Lair   | A massive tangled nest of cloth, bones, stolen objects, matted fur. Retchtail waits here. |
| \*   | Standard room      | Generic warren rooms — low ceilings, tight passages, vermin everywhere.                   |

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

| Status | Location | Direction | Type | Lock | Key/Trigger | Notes |
| ------ | -------- | --------- | ---- | ---- | ----------- | ----- |
|        |          |           |      |      |             |       |

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

### The Rat King's Warren

> **Status:** PENDING
> **Type:** active

**Setup:**

A priest in the Arindale Cathedral has lost his ring. He found rat droppings where the ring had been and suspects one of the increasingly bold sewer rats stole it. The rats have been a growing problem — more of them, larger, bolder than normal. He believes a rat took his ring down into the sewers and asks the player to find it and return it, offering a reward.

The priest mentions a way into the sewers: in the Halls of the Dead beneath the cathedral, there is a crack in the old stonework that leads down into the sewer tunnels. ("There is a crack in the wall of the lower halls — I've heard scratching on the other side. The rats must be coming through there. Use `go crack` and you'll find yourself in the sewers beneath the city.")

This serves two purposes: it gives the player the quest AND reveals the hidden sewer entrance in the Halls of the Dead — a passage that is not obvious from the room's exits and is only hinted at in the room description.

**Flow:**

1. Player receives quest from the priest in the Cathedral — find his stolen ring in the sewers
2. Player learns about the `go crack` passage in the Halls of the Dead (or can use any manhole if they already know about them)
3. Player enters the Arindale Sewer
4. Player searches the sewer near the entrance areas for the Warrens of Filth entrance (>>WF) — it's located near the central hub, not deep in the sewer
5. Player enters the Warrens and fights through increasingly dense packs of warren rats
6. Player explores dead-end branches (Bone Heap, Nesting Chambers, Collapsed Drain) and works toward the deepest section
7. Player reaches Retchtail's Lair and kills Retchtail, the Rat King
8. Retchtail drops the **Priest's Ring** (quest item) — the ring is in the nest, stolen along with other shiny objects
9. Player returns the ring to the priest at the Cathedral

**Payoff:**

- Experience and currency reward from the priest
- Whatever other loot Retchtail drops (TBD in drop tables)
- Knowledge of the `go crack` sewer entrance for future use
- Possible reputation gain with the Cathedral / city faction
- The quest establishes the sewer as an explorable area and encourages players to go deeper

**Affects:**

- **Arindale Cathedral** — a priest NPC gives the quest. Needs quest dialogue.
- **Halls of the Dead** — the `go crack` passage is mentioned by the priest. The room description should have a subtle mention of the crack but it should NOT appear as a visible exit. Players learn about it from the priest or by carefully reading the room description.
- **Arindale Sewer (central area)** — the Warrens entrance (>>WF) is near the central hub, accessible to low-level players
- **Warrens of Filth (all rooms)** — the quest dungeon
- **Retchtail's Lair** — kill objective room. Retchtail drops the Priest's Ring.
- **NPCs:** Cathedral priest (quest giver), Retchtail (kill target, drops ring)
- **Items:** Priest's Ring (quest item — dropped by Retchtail, returned to priest)

**Quest system notes (for future implementation):**

- Retrieve quest: accept → enter sewers → find warrens → kill Retchtail → loot ring → return ring to priest
- This is intended as the first sewer quest for new players (level 3-4)
- The `go crack` reveal is important — it introduces a hidden passage mechanic and gives evil-aligned players knowledge of the escape route
- The priest's dialogue should feel like a worried man asking for help, not issuing orders
- The ring being in Retchtail's nest ties into the lore — rats hoard shiny objects. The nest description in the lair already mentions "stolen objects"

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

### Area Boundary Design

This area uses a separate area string (`Warrens of Filth`) from the Arindale Sewer. Warren rats are contained here — they don't roam into the general sewer tunnels. Regular sewer rats are separate NPCs using the `Arindale Sewer` area string.

### Boss Design: Retchtail, the Rat King

- **Proper name:** Yes — "Retchtail" is a proper name. Displays as "Retchtail, the Rat King" in descriptions.
- **Not magical** — Retchtail is a natural horror. Bloated, scarred, vicious. No spells, no curses. Just the biggest, meanest rat in the sewer.
- **Lair as terrain** — Retchtail's Lair is defined by the massive nest. Room description should emphasize the nest itself as the dominant feature — a room-sized tangle of shredded cloth, bones, stolen objects, matted fur, and filth.
- **Level:** ~4-5 (mini-boss for a level 3-4 quest)

### Relationship to Arindale Sewer

This area is sub-zone #2 in the Arindale Sewer plan. It is physically connected to the sewer but logically separate. Should be placed near the sewer entrances since it targets the lowest-level players. The sewer plan file (`areas/arindale_sewer/plan.md`) references this area and its entrance point. Design both together to ensure the transition from sewer stone to gnawed burrow feels natural.
