# Sanctum of the Damned

> **Status:** GENERATED
> **Level Range:** 3-6 (matches Arindale Sewer)
> **Room Count:** 59
> **Connected To:** Arindale Sewer via `sewer_entrance_sanctum` (down/up)
> **Area String:** `Sanctum of the Damned` (separate area from the sewer — used to contain NPC roaming)

---

## Brief

**Theme:** A hidden underground shrine and meeting place for The Disciples of Malachi — a forbidden religious cult operating in secret beneath Arindale. The cult has claimed and converted a section of the old sewer infrastructure into a dark place of worship. What was once a cistern or storage chamber has been draped in black cloth, lined with candles, and consecrated to whatever dark power Malachi serves.

**Tone:** Unsettling and ritualistic. The transition from sewer filth to deliberate, organized darkness is the key shift. The outer rooms still feel like sewer — but cleaner, watched, with signs of human habitation. Deeper in, the architecture changes: carved symbols on the walls, black candles in iron sconces, the smell of incense replacing the smell of waste. The Reliquary of the Obsidian Sun at the heart is genuinely unnerving — a place of power that feels wrong.

**Key Ideas:**

- **Separate area from the sewer** — uses its own area string (`Sanctum of the Damned`) so cult NPCs are contained here and don't roam into the general sewer. This is critical for gameplay: the cult is a localized threat, not a sewer-wide one.
- **~55 rooms** — enough for a meaningful sub-dungeon with an approach, outer chambers, inner sanctum, and the shrine boss room.
- **Cult members as hostile NPCs** — The Disciples of Malachi. Robed cultists, acolytes, enforcers, and a boss in the shrine room.
- **The Reliquary of the Obsidian Sun** — the shrine/boss room. The cult's holiest place. A mini-boss fight here. The room name is "Reliquary of the Obsidian Sun."
- **Sewer-side sentries** — a few cult-affiliated NPCs (scouts, lookouts) may be placed in the sewer area itself near the sanctum entrance, using the sewer area string so they can roam the nearby tunnels. These are the early warning signs that something is different in this part of the sewer.
- **Quest destination** — this is one of the 3 quest sub-zones in the sewer plan. Players will have reasons to seek this place out (quest hooks TBD).

**Layout Ideas:**

- Entered from the Arindale Sewer through a passage that transitions from sewer to sanctum. The entrance should feel like a deliberate threshold — maybe a cleaned section of tunnel, a door disguised as a wall, or a passage behind a waterfall of drainage.
- Outer rooms: converted sewer chambers, guard posts, storage. Still recognizable as sewer infrastructure but repurposed.
- Mid rooms: the cult's living/working space. Meeting rooms, preparation chambers, sleeping quarters.
- Inner rooms: the ritual space. More decorated, more ominous. Leads to the Reliquary.
- **Reliquary of the Obsidian Sun** — the deepest room. The shrine itself. Boss encounter here.
- Possible secondary exit or hidden passage (future expansion hook).

**Connection Points:**

- **Arindale Sewer → Sanctum entrance** — the primary (and initially only) way in. Located somewhere in the mid-to-deep sewer.
- **[FUTURE] Possible secondary exit** — could connect to another part of the sewer or even surface somewhere unexpected. Placeholder only.

**Lore/Backstory:**

- The Disciples of Malachi are a banned cult — outlawed by the city and the cathedral alike. Their worship is forbidden, their practices considered heretical and dangerous.
- They retreated underground when the crackdown came, finding and converting this section of the old sewer into their hidden sanctum.
- Who or what Malachi is — a dark god, a demon, a long-dead sorcerer — is deliberately left vague for now. The cult believes, and that's enough to make them dangerous.
- The Obsidian Sun is their central relic/symbol. What it actually is and what power it holds is TBD (future quest/lore development).

---

## Rooms

<!-- AI fills this section with room proposals. Designer reviews and sets status tags. -->

| # | Status | Name | Summary | Terrain | Notes |
|---|--------|------|---------|---------|-------|
| | | | | | |

### Layout

```
SANCTUM OF THE DAMNED (~55 rooms)

Legend: [EN] = Entrance (from Arindale Sewer >>SD)
       R = Reliquary of the Obsidian Sun (boss room)
       G = Guard Post          H = Cult Hallway
       h = Quarters Hallway    Q = Quarters (‖ = door, unlocked)
       S = Storage
       A = Altar Room          M = Meeting Hall
       P = Preparation Chamber L = Scriptorium
       O = Cult Leader's Office
       q = Cult Leader's Quarters
       T = Threshold           * = Standard room

                                   Q   Q   Q
                                   ‖   ‖   ‖
           S   S   H---H---H---H---h---h---h
           |   |   |       |           |
   *---*---*---*   H   A---H---H---H---M
   |           |   |           |
[EN]---*---T---T---G---H---H---H---H---*---*
                   |       |       |       |
                   T   S---H---H---H---*---*
                   |       |   |   |       |
                   *---*---H   A   H   O---*
                   |       |       |   |   |
                   *   *---H---H---H   q   R
                   |   |       |   |
                   *---*---*   L   P
```

**Room key:**

| Code | Name | Description |
|------|------|-------------|
| [EN] | Entrance | Where the sewer gives way to swept stone and the smell of incense. |
| * | Standard room | Outer rooms — still sewer-like but cleaner, watched. Signs of habitation. |
| T | Threshold | Transition rooms. Sewer stone yields to draped cloth, carved symbols, candlelight. |
| G | Guard Post | Cultist sentries stationed here. Weapons ready, watching the approach. |
| S | Storage | Supplies, stolen goods, ritual materials. Crates stamped with city merchant marks. |
| H | Cult Hallway | Cleaned corridors draped in black cloth. Iron sconces hold dark candles. Symbols on the walls. |
| h | Quarters Hallway | Corridor lined with doors. Robes hang from pegs between doorways. |
| Q | Quarters | Individual sleeping chambers off the hallway. Cots, personal effects. Doors without locks (‖). |
| M | Meeting Hall | Large chamber with a long table. Maps, documents, cult hierarchy discussions. |
| A | Altar Room | Smaller ritual spaces. Dark stains on stone slabs. Candles arranged in patterns. |
| P | Preparation Chamber | Where cultists prepare for rituals. Robes, paint, ceremonial blades, incense burners. |
| L | Scriptorium | Shelves of forbidden texts, copied scriptures, records of cult activities. |
| O | Cult Leader's Office | Private chamber of the cult's leader. Desk, records, plans. Adjacent to the Reliquary. |
| q | Cult Leader's Quarters | Personal sleeping chamber. More comfortable than the common quarters. Between the office and the Reliquary. |
| R | Reliquary of the Obsidian Sun | The innermost shrine. The cult's holiest place. Boss encounter. |

**Zone progression:**

- **Outer (*, T, G, S)** — Sewer transition into the cult's perimeter. Guard posts and storage. Still recognizable as converted sewer infrastructure.
- **Mid (H, h, Q, M, S)** — The cult's living space. Quarters hallway branches north with individual rooms behind unlocked doors. Meeting hall and storage branch off corridors.
- **Inner (H, A, P, L)** — Ritual territory. Altar rooms, preparation chamber, and scriptorium each branch off hallway corridors as side rooms — not inline.
- **Core (R)** — Reliquary of the Obsidian Sun at the deepest point, southeast corner. Whatever the Obsidian Sun is, it's here.

**Design principle:** H (cult hallways) form the corridors. All named rooms (Q, M, A, P, L, S) branch off hallways as side rooms with a single entrance — they are destinations, not throughways.

### Room Features

<!-- Special rooms: training, respawn, bank, etc. -->

| Room | Feature | Config |
|------|---------|--------|
| | | |

---

## Points of Interest

<!-- Environmental details, interactable objects, flavor elements placed in rooms -->

| Status | Room | Feature | Description | Interactable? |
|--------|------|---------|-------------|---------------|
| | | | | |

---

## NPCs

### Hostile Mobs

| Status | Name | Level | Spawn Room | Behavior | Notes |
|--------|------|-------|------------|----------|-------|
| | | | | | |

### Merchants / Friendly NPCs

| Status | Name | Level | Spawn Room | Role | Notes |
|--------|------|-------|------------|------|-------|
| | | | | | |

### Passive / Ambient

| Status | Name | Level | Spawn Room | Notes |
|--------|------|-------|------------|-------|
| | | | | |

### NPC Attacks

<!-- Attack definitions for each hostile NPC -->

#### [NPC Name]

| Status | Attack Name | Type | Min-Max Dmg | Atk/Round | Weight% | Mana | Hit Verb |
|--------|-------------|------|-------------|-----------|---------|------|----------|
| | | | | | | | |

### NPC Spells

<!-- Spell assignments for spellcaster NPCs -->

#### [NPC Name]

| Status | Spell | Priority | Cast% | Condition | Value | Cooldown | Notes |
|--------|-------|----------|-------|-----------|-------|----------|-------|
| | | | | | | | |

---

## Items

### Weapons

| Status | Name | Slot | Min-Max Dmg | Speed | Type | Found Via |
|--------|------|------|-------------|-------|------|-----------|
| | | | | | | |

### Armor

| Status | Name | Slot | AC | DR | Weight Class | Found Via |
|--------|------|------|-----|-----|-------------|-----------|
| | | | | | | |

### Consumables

| Status | Name | Effect | Value | Found Via |
|--------|------|--------|-------|-----------|
| | | | | |

### Keys / Quest Items

| Status | Name | Purpose | Found Via |
|--------|------|---------|-----------|
| | | | |

---

## Drop Tables

<!-- One table per NPC that drops loot -->

### [NPC Name] Loot

| Status | Item | Drop% | Qty | Currency (copper) | Denominations |
|--------|------|-------|-----|-------------------|---------------|
| | | | | | |

---

## Doors and Passages

| Status | Location | Direction | Type | Lock | Key/Trigger | Notes |
|--------|----------|-----------|------|------|-------------|-------|
| | Cult Leader's Office → Quarters | south | door | locked | TBD | Locked door between the leader's office and personal quarters |
| | Quarters Hallway → each Q room | varies | door | unlocked | — | Individual quarter rooms behind unlocked doors |

---

## Factions

| Status | Name | Type | Description |
|--------|------|------|-------------|
| | | | |

### NPC Affiliations

| NPC | Faction | Role |
|-----|---------|------|
| | | |

---

## Quest Hooks

<!-- Story threads that tie the area together. Mark as "active" (needs items/NPCs/doors) or "flavor" (description only). -->

### The Disciples of Malachi

> **Status:** PENDING
> **Type:** active

**Setup:**

A **notice board** in Town Square has a posted bounty: reports of cultist activity in the city, a reward offered, and instructions to speak with the mayor. The notice mentions hooded figures, strange symbols, and that the city guard has been unable to apprehend them. ("REWARD — Cultist activity reported within Arindale. Citizens with information or the means to act are urged to speak with the Mayor.")

When the player speaks with the mayor, he explains the full situation. There has been growing cult activity — hooded figures seen at night, strange symbols scratched on walls, reports of secret meetings. The city guard has tried to apprehend them, but every time they give chase the cultists flee down into the manholes and vanish into the sewers. The guards have followed them down but lose them in the tunnels — the cultists know the sewer layout and the guards don't.

The mayor wants someone to go into the sewers, find where the cult is hiding, and deal with them. He doesn't know the name "Disciples of Malachi" — just that there's a banned cult operating in the city. He can offer a reward and the gratitude of the city.

**Flow:**

1. Player receives quest from the mayor in Arindale — find the cult's hideout in the sewers and put a stop to their activities
2. Player enters the Arindale Sewer through any manhole
3. Player must **search the sewers** to find the Sanctum entrance (>>SD) — it's in the east tunnels, mid-to-deep. The mayor doesn't know exactly where the cult is hiding
4. As the player explores the east tunnels, they may encounter cult sentry NPCs (scouts/lookouts using the `Arindale Sewer` area string) who roam the tunnels near the entrance — a sign the player is getting close
5. Player finds the Sanctum entrance and enters the Sanctum of the Damned
6. Player fights through the outer guard posts and cult members
7. Player explores the mid-section — quarters, meeting hall, storage — encountering cultists throughout
8. Player pushes into the inner sanctum — altar rooms, preparation chambers, the scriptorium
9. Player reaches the Reliquary of the Obsidian Sun and defeats the cult boss
10. Player may also find the cult leader's office and quarters (locked door) — notes and documents inside could reveal more about who Malachi is and what the cult is planning (future lore hooks)
11. Player returns to the mayor to report success

**Payoff:**

- Experience and currency reward from the mayor
- Loot from the cult boss and other cultists (TBD in drop tables)
- Possible reputation gain with the city / mayor's faction
- Lore discovery — documents in the cult leader's office hint at what the Obsidian Sun is and who Malachi is (seeds for future quest content)
- If the player has already completed The Iridescent Leak quest, they may recognize the cult symbols from the alchemist's den — connecting the two storylines

**Affects:**

- **Town Square (notice board)** — a bulletin board (immoveable object/point of interest) with a posted bounty about cultist activity. Directs players to the mayor. The board can also hold other quest postings in the future.
- **Arindale (mayor's location)** — the mayor gives the quest. Needs quest dialogue. The mayor is an existing or new NPC.
- **Arindale Sewer (east tunnels)** — cult sentry NPCs near the >>SD entrance use the sewer area string and serve as proximity clues
- **Sanctum of the Damned (all rooms)** — the quest dungeon
- **Reliquary of the Obsidian Sun (R)** — boss encounter room
- **Cult Leader's Office (O)** — lore documents, future quest hooks
- **NPCs:** Mayor (quest giver), cult sentries (sewer area), cult members throughout sanctum, cult boss in Reliquary
- **Items:** Possible cult documents or relics as quest items / lore objects

**Quest system notes (for future implementation):**

- Exploration + kill quest: accept → search sewers → find sanctum → clear cultists → kill boss → return to mayor
- Intended for mid-level sewer players (level 4-5) — harder than the Warrens quest
- The cult sentries in the sewer are important — they serve as breadcrumbs that the player is near the entrance without giving away the exact location
- The cult leader's office documents are a future expansion hook — they can seed quests about Malachi, the Obsidian Sun, and what the cult is ultimately planning
- Cross-reference with The Iridescent Leak quest — if the player found cult symbols in the alchemist's den, the mayor's quest about cult activity ties it together. The quests can be done in any order.

---

## Merchant Inventory

### [Merchant Name]

| Status | Item | Max Stock | Restock% | Notes |
|--------|------|-----------|----------|-------|
| | | | | |

### Merchant Responses

| Status | Keywords | Response |
|--------|----------|----------|
| | | |

---

## Designer Notes

### Area Boundary Design

This area uses a separate area string (`Sanctum of the Damned`) from the Arindale Sewer. This is specifically so cult NPC roaming is contained within the sanctum — they should not wander into the general sewer tunnels.

**Exception:** A few sentry/scout NPCs near the sanctum entrance may use the `Arindale Sewer` area string instead, so they roam the nearby sewer tunnels as early warning encounters. These are sewer-area NPCs thematically tied to the cult, not sanctum-area NPCs.

### Relationship to Arindale Sewer

This area is sub-zone #1 in the Arindale Sewer plan. It is physically connected to the sewer but logically separate. The sewer plan file (`areas/arindale_sewer/plan.md`) references this area and its entrance point. Design both together to ensure the transition feels natural.
