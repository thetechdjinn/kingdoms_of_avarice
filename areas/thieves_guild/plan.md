# The Thieves Guild

> **Status:** BRIEF
> **Level Range:** 3-6
> **Room Count:** ~7
> **Connected To:** Arindale Sewer (accessed via secret passage below the sewer floor)
> **Area String:** `The Thieves Guild` (separate area from the sewer — used to contain NPC roaming)

---

## Brief

**Theme:** A hidden underground headquarters for Arindale's organized thieves, located beneath the sewer level. This isn't a squalid hideout — it's an established operation. The guild has been here long enough to carve out proper rooms, install doors, set up supply lines, and create a functioning underground community of criminals. The descent from the sewer through the secret passage makes it clear this is a different world — below the filth, below the city's awareness, in tunnels and chambers that no city map has ever recorded.

**Tone:** Dangerous but civilized. Unlike the sewer's decay and the sub-zones' hostility, the guild has order. There are guards, but they follow rules. There are merchants, but they deal in stolen goods and contraband. The air is cleaner than the sewer — ventilation shafts have been carved. Lanterns hang from iron hooks. There are even comfortable quarters. The threat here isn't monsters — it's people who are very good at violence and very protective of their secrets. You're tolerated if you belong, and dead if you don't.

**Key Ideas:**

- **Below the sewer** — physically one level deeper than the sewer tunnels. The secret passage descends through a broken conduit in the sewer floor, down carved steps or a ladder, into the guild's territory. This vertical separation is important — the guild isn't just hidden behind a wall, it's on a different level entirely.
- **Secret entrance via "honest men knock"** — the sewer-side room contains a broken water conduit (large pipe, cracked open, seemingly impassable). The command `honest men knock` triggers entry. The player whispers the secret phrase and a pipe shifts to expose a small entrance. Players need to discover or be told about the passphrase.
- **Not purely hostile** — this is a key design point. The guild has both hostile and friendly NPCs depending on context. Guards may attack on sight initially, but quest progression or faction standing could change that. Some areas of the guild may become accessible as safe zones (merchants, trainers, quest givers) once the player has proven themselves.
- **Thief class connection** — this is the natural home for thief-oriented gameplay. Lockpicking trainers, stealth trainers, poison merchants, fences for stolen goods. Players with the thief class or stealth abilities should find this place especially useful.
- **Quest hub potential** — the guild can serve as both a quest destination (early: "find the thieves guild") and a quest source (later: jobs from the guild, contracts, heists). The initial design should support both uses.
- **Faction-gated access** — deeper parts of the guild may require faction standing with the thieves. Outer rooms (entry hall, guard posts) are encountered first. Inner rooms (guild master, specialized merchants, training) require trust.

**Layout Ideas:**

- **Entry shaft** — the passage from the sewer conduit descends (stairs, ladder, or carved slope) into an antechamber. This is the transition space — sewer above, guild below. Guards here.
- **Outer guild** — guard posts, a holding cell for intruders, storage rooms. This is where unwelcome visitors are stopped. Functional, utilitarian.
- **Common areas** — the guild's public spaces. A tavern or gathering hall, notice boards with contracts, a fence/merchant. Where guild members socialize and do business.
- **Inner guild** — training rooms, the guild master's quarters, specialized merchants, a vault or treasury. Access restricted by faction or quest progress.
- **Back passages** — escape routes, hidden exits, secret rooms. A guild of thieves would have multiple ways out. Some may connect to other parts of the sewer or surface locations (future expansion).

**Connection Points:**

- **Arindale Sewer → The Thieves Guild** — via `honest men knock` in the south tunnels of the sewer. The sewer room at T (sewer_entrance_tg) contains the broken conduit. The passage goes south into the guild's entry shaft. Return north is a normal visible exit.
- **[FUTURE] Possible surface exit** — a hidden passage up to somewhere in Arindale (an alley, a basement, a warehouse). Would give guild members a way to the surface without going through the sewer. Not built yet.
- **[FUTURE] Possible deeper passage** — the guild may have access to even deeper underground areas. Placeholder only.

**Lore/Backstory:**

- The Thieves Guild has operated in Arindale for generations. They've moved locations several times — always staying one step ahead of the city guard. This current headquarters beneath the sewer has been their home for decades.
- The guild discovered the natural cavities below the sewer level and expanded them into a proper headquarters. The broken conduit entrance was engineered — they cracked it open from below and made it look like natural decay.
- The guild isn't just thieves — it's an organized criminal enterprise. Smuggling, fencing, information brokering, contract work. They have rules, hierarchy, and a code. Betrayal is punished by death.
- The guild master's identity and name are TBD. They should be a proper-named NPC with a significant role in future quest lines.
- The city guard knows the guild exists but has never found the entrance. The thieves' approach tunnels in the sewer (the >>TG area) are deliberately confusing to prevent anyone from stumbling onto the conduit entrance by accident.

---

## Rooms

<!-- AI fills this section with room proposals. Designer reviews and sets status tags. -->

| #   | Status | Name | Summary | Terrain | Notes |
| --- | ------ | ---- | ------- | ------- | ----- |
|     |        |      |         |         |       |

### Layout

```
THE THIEVES GUILD (7 rooms)

Legend:
   [EN] = Entry (from sewer conduit above)
   O = Guild Master's Office (locked door)
   S = Storage
   M = Merchant
   G = The Hollow
   P = Passage
   F = Foyer

      [EN]      S   O
        |       |   ‖ (locked door)
        *---F---P---G
                |
                M
```

**Room list:**

| #   | Name                  | Summary                                                                                      |
| --- | --------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Entry Shaft           | Ladder up to sewer conduit. Cramped, damp, carved stone. Transition room.                    |
| 2   | The Foyer             | First real guild room. Guard post. Lanterns, a heavy door behind you.                        |
| 3   | Guild Hallway         | Four-way junction. West to foyer, north to storage, south to merchant, east to The Hollow.   |
| 4   | The Hollow            | Common room. Rough tables, stolen candelabras, dice games, barrel of wine. Guild social hub. |
| 5   | Dusty Storeroom       | Crates, barrels, stolen goods stacked on shelves. Guild supplies.                            |
| 6   | Merchant's Alcove     | A carved-out niche with a counter and locked display cases. The guild fence operates here.   |
| 7   | Guild Master's Office | Behind a locked door north of The Hollow. Desk, maps, ledgers, locked strongbox.             |

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

| Status | Location                  | Direction | Type                  | Lock   | Key/Trigger          | Notes                                                                |
| ------ | ------------------------- | --------- | --------------------- | ------ | -------------------- | -------------------------------------------------------------------- |
| DONE   | Sewer conduit room (T)    | south     | triggered_passageway  | none   | `honest men knock`   | One-way hidden passage into guild. Return via normal north exit.     |
| DONE   | The Hollow → Office       | north     | physical              | locked | pick 100-150         | Guild Master's door. Bash 200. Auto-resets 5 min.                    |

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

### Finding the Guild

> **Status:** PENDING
> **Type:** active

**Setup:**

The universal trainer in Arindale recognizes when a player is a thief (or similar class). During training or conversation, the trainer mentions the Thieves Guild — tells the player that if they want proper equipment and connections for their line of work, they need to find the guild. The trainer doesn't know exactly where it is, but knows it's somewhere deep in the sewers beneath the city. ("If you want to make a real living in this trade, you'll need to find the guild. They're down in the sewers somewhere — deep. Look for a broken conduit. That's all I know.")

This is a class-gated quest hint — only thief-type classes get this information from the trainer.

**Flow:**

1. Player trains with the universal trainer as a thief (or similar class)
2. Trainer mentions the Thieves Guild and hints at its location — deep in the sewers, look for a broken conduit
3. Player enters the Arindale Sewer through any manhole
4. Player must search the deep south tunnels to find the Thieves Guild approach area — the tunnels here are cleaner, more maintained, with torch sconces and bootprints
5. Player finds the room with the broken conduit (T) and uses `honest men knock` to enter
6. Player enters The Thieves Guild

**Payoff:**

- Access to the guild merchant — lockpicks, underworld tools, thief-specific armor and weapons
- Access to the guild master for future thief quests and contracts
- The Hollow as a social hub for thief-class players
- Potential faction standing with the Thieves Guild
- A home base for thief-oriented gameplay

**Affects:**

- **Arindale (universal trainer)** — the trainer gives the class-gated hint. Needs dialogue that triggers only for thief-type classes.
- **Arindale Sewer (south tunnels)** — the Thieves Guild approach area near >>TG has cleaner tunnels, torch sconces, bootprints as proximity clues
- **>>TG room** — the broken conduit room. Room description emphasizes the conduit as a notable feature without being obvious it's an entrance.
- **The Thieves Guild (all rooms)** — the destination

**Quest system notes (for future implementation):**

- This is more of a discovery/exploration quest than a combat quest — finding the guild IS the objective
- Class-gated: only thief-type classes receive the hint from the trainer. Other classes may stumble on the conduit through exploration but won't have been told what to look for
- The trainer's hint is vague — "deep in the sewers, broken conduit." The player still has to search
- Future quests from the guild master can expand from here — contracts, heists, reputation building

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

This area uses a separate area string (`The Thieves Guild`) from the Arindale Sewer. Guild NPCs are contained here — they don't roam into the sewer tunnels. The sewer-side approach tunnels (the >>TG section near the conduit entrance) use the `Arindale Sewer` area string and may have a few lookout/scout NPCs that hint at organized activity.

### Vertical Separation

The guild is physically below the sewer level. The `honest men knock` passage goes south into the guild — the vertical separation is implied by the room descriptions rather than using up/down directions. Return is a normal north exit from the entry shaft.

### Entrance Design: The Broken Conduit

The sewer room at T (sewer_entrance_tg) describes a large, cracked water conduit (pipe) partially embedded in the floor. It looks like structural damage — a broken piece of infrastructure. The `honest men knock` passphrase triggers the hidden entrance. The room description should NOT make it obvious this is an entrance. Players discover the passphrase through quests, NPCs, or exploration.

### Relationship to Arindale Sewer

This area is reached from the south tunnels of the Arindale Sewer, at the >>TG marker on the sewer map. The sewer plan file (`areas/arindale_sewer/plan.md`) references this area and the approach tunnels leading to it. The approach tunnels (cleaner, torch sconces, bootprints) are part of the sewer area and serve as the lead-up — see the "Thieves Guild Approach" section in the sewer plan.

### Relationship to Arindale

The guild has been operating beneath Arindale for generations. Future connections may link the guild directly to surface locations (a warehouse, an alley, a basement) via hidden passages. These would be designed when the surface-side quest content is built.
