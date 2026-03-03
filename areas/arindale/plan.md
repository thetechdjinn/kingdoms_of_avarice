# Arindale

> **Status:** BRIEF
> **Level Range:** 1-5 (starting town, safe zone)
> **Room Count:** ~200-250
> **Connected To:** First town — other areas will connect outward from here

---

## Brief

**Theme:** A proper city and the first place players experience. Arindale is the central hub — where players train, shop, bank, heal, and prepare before venturing into the dangerous world beyond its walls. It is a safe zone. There are no hostile mobs inside the city. Town guards patrol the streets and will deal with anyone considered evil or with very bad faction standing.

**Tone:**

**Key Ideas:**

- Safe zone — no hostile mobs within city limits
- Town guards enforce order (hostile only to evil-aligned or very low-faction players)
- ~200-250 rooms making up a full city with districts, streets, and buildings

**Layout Ideas:**

- Grid layout with town square in the center
- Town square is the central hub with the bank nearby
- Three city gates: east, south, and west
- North side has three exits:
  - A path leading to the starting area (level 5 limited)
  - A port where you can take a boat
  - A castle where the King of the Kingdom resides

**Lore/Backstory:**

---

## Street Grid

The city is built on a grid of named streets. Streets don't fill every possible space — there are gaps between them where buildings, courtyards, and alleys sit. This leaves room for future expansion without restructuring the map.

### Street Names

**East-West Streets (north to south):**

1. **Harbor Road** — runs along the northern waterfront
2. **Marshal Street** — passes through the military and civic quarter
3. **Main Street** — the primary thoroughfare; runs from East Gate through Town Square
4. **Cloister Court** — passes the cathedral and residential areas
5. **Southwall Road** — runs along the inside of the southern city wall

**North-South Streets (west to east):**

1. **Westwall Street** — runs along the inside of the western city wall
2. **Market Street** — through the heart of the shopping district
3. **King's Road** — the central north-south avenue; leads to the castle
4. **Cathedral Lane** — past the cathedral and into residential areas
5. **Eastwall Street** — runs along the inside of the eastern city wall

### Intersections and Town Square

**Town Square** sits at the intersection of **Main Street** and **King's Road** — the dead center of the grid. It's a larger open area (multiple rooms) rather than a single intersection room.

Each street intersection is a shared room where two streets cross. Players navigate between intersections along street segments.

### Spacing

Streets are separated by **3 rooms** between intersections. This gives a **17 × 17 grid**:

- Each street segment (between two intersections): 3 rooms
- 5 × 5 grid = 25 intersections
- 20 E/W segments × 3 rooms = 60 street rooms
- 20 N/S segments × 3 rooms = 60 street rooms
- **~145 rooms** for streets and intersections alone

The remaining budget goes to buildings, interiors, underground areas, gates, walls, and the castle approach. Total room count is flexible — we can add rooms as needed.

### Street Grid Map

```
     Westwall    Market     King's     Cathedral   Eastwall
        St         St        Road         Ln          St
        |          |          |           |           |
  HR --[+]-o-o-o-[+]-o-o-o-[+]-o-o-o--[+]-o-o-o--[+]-- Harbor Road
        |          |          |           |           |
        o          o          o           o           o
        o          o          o           o           o
        o          o          o           o           o
        |          |          |           |           |
  MS --[+]-o-o-o-[+]-o-o-o-[+]-o-o-o--[+]-o-o-o--[+]-- Marshal Street
        |          |          |           |           |
        o          o          o           o           o
        o          o          o           o           o
        o          o          o           o           o
        |          |          |           |           |
 [WG]--[+]-o-o-o-[+]-o-o-o-[TS]-o-o-o-[+]-o-o-o--[+]--[EG] Main Street
        |          |          |           |           |
        o          o          o           o           o
        o          o          o           o           o
        o          o          o           o           o
        |          |          |           |           |
  CC --[+]-o-o-o-[+]-o-o-o-[+]-o-o-o--[+]-o-o-o--[+]-- Cloister Court
        |          |          |           |           |
        o          o          o           o           o
        o          o          o           o           o
        o          o          o           o           o
        |          |          |           |           |
  SR --[+]-o-o-o-[+]-o-o-o-[+]-o-o-o--[+]-o-o-o--[+]-- Southwall Road
                   |          |
                  [SG] South Gate

  [+] = intersection    o = street room    [TS] = Town Square
  [WG] = West Gate      [EG] = East Gate   [SG] = South Gate
```

**Dimensions:** 17 rooms east-west × 17 rooms north-south (19 at Main Street with gates)
**North of Harbor Road:** Docks, castle road, port
**Gates:** East Gate (east end of Main Street), West Gate (west end of Main Street), South Gate (south of Southwall Road, between Market St and King's Road). All gates closed until connecting areas are built.

---

## Districts

The city is divided into districts, each occupying a section of the street grid. District boundaries follow the streets — a district covers the blocks between its bounding streets plus the buildings accessible from those blocks.

### 1. Market District — ~50-60 rooms

**Grid Location:** Blocks around the Town Square, primarily south and west — between Main Street and Southwall Road, and between Westwall Street and King's Road.

The commercial heart of Arindale. Shops line the streets near the town square, making this the first area most players explore. The bank sits steps from the square. Shops are accessed by entering doorways off the main streets radiating from the square.

#### Town Square

A single room at the intersection of Main Street and King's Road. Four exits: north, east, south, and west — each leading onto a street. No shops or vendors in the square itself, just the open plaza.

**Future:** A down exit ("go manhole") leading to the sewers beneath the city (separate area).

#### Bank of Arindale

Located one south and one west of Town Square. Single room with the bank feature enabled.

#### Shops

Shops sit off the streets near the square. Most are entered from the street rooms along Main Street, King's Road, Market Street, or Cloister Court.

**Key Locations:**
- **Bladed Weapons Merchant** — swords, daggers, axes (1 room)
- **Blunt Weapons Merchant** — maces, hammers, staves (1 room)
- **Armorer** — heavy armor, multi-room:
  - Body armor room
  - Legs and foot armor room
  - Helms and shields room
- **Leather Merchant** — light armor, 2 rooms:
  - Leather helms and tunics
  - Leather leggings and boots
- **Clothier** — normal clothes and caster robes (1 room)
- **General Store** — basic supplies, torches, rope, rations, containers (1 room)
- **Curio Shop** — oddities, scrolls, misc magical items (1 room)
- **Jeweler** — rings, amulets, necklaces (1 room)
- **Mage Spell Shop** — where mages/casters can purchase arcane spells (1 room, near the square)
- **Alchemist** — potions (healing, mana, buffs, etc.) (1 room)
- **Stable** — buy rides to other cities in the future (1 room)

**Room Ideas:** Shop interiors accessible from street rooms, connecting alleys between Market Street and King's Road, market stalls, the bank interior, street-level apartments above shops.

### 2. Cathedral District — ~40-50 rooms

**Grid Location:** East of King's Road, between Main Street and Southwall Road — centered around the Cathedral Lane / Cloister Court intersection.

The spiritual center of the city. Dominated by a large cathedral with multiple floors and an underground level that descends into the Halls of the Dead — the respawn point for fallen players.

#### Cathedral Interior

Entered from a street room on Cathedral Lane. The interior is a linear path deeper into the building with rooms branching off along the way.

```
[Cathedral Lane] → [Cathedral Entrance] → [Cathedral Nave] → [Nave Passage]
                                                                    |
                              [Priest Healer] ← [Inner Sanctum] ← [Nave Passage contd.]
                                                      |
                         [Holy Items Shop] ← [Chapel Corridor] → [Divine Spell Vendor]
                                                      |
                                                [Crypt Stairs] (down)
                                                      |
                                              [Upper Crypt] → [Crypt Passage] → [Crypt Chamber]
                                                                                      |
                                              [Crypt Alcove] ← [Deep Crypt] ← [Crypt Passage]
                                                                                      |
                                                                              [Crypt Descent] (down)
                                                                                      |
                                                                            [Halls of the Dead] ← RESPAWN
```

**Cathedral (ground level) — ~6-8 rooms:**
- **Cathedral Entrance** — grand arched doorway, transition from street to sacred space
- **Cathedral Nave** — the main hall, vaulted ceiling, rows of pews, stained glass
- **Nave Passage / Inner Sanctum** — deeper into the cathedral, quieter, more solemn
- **Priest Healer** — NPC who can cure ailments or restore HP for a fee
- **Divine Spell Vendor** — where priests/clerics can buy divine spells
- **Holy Items Shop** — holy water, prayer beads, blessed items (magic and non-magic)

**Crypt (below cathedral) — ~5-7 rooms:**
- **Crypt Stairs** — stone steps descending from the chapel corridor
- **Crypt rooms** — a series of mostly empty rooms with stone sarcophagi, wall niches, faded inscriptions, cobwebs, guttering torches. Atmospheric but not threatening — this is a safe zone. Each room should have its own distinct detail (a cracked lid, a carved angel, a pool of candlewax, names worn smooth by time).
- **Crypt Descent** — final room with stairs leading down to the Halls of the Dead

**Halls of the Dead (deep underground) — 1 room:**
- **Halls of the Dead** — the respawn room. Players who die appear here. Solemn, otherworldly, dimly lit. A single exit leads back up through the crypt to the cathedral and the city above.

**Future:** A hidden exit from the Halls of the Dead ("go crack") — a narrow passage leading outside the city walls so evil-aligned players can leave without passing through guard-patrolled streets. Will be added when needed.

#### District Streets and Grounds

The remaining rooms in the Cathedral District are the streets (Cathedral Lane, Cloister Court, and connecting segments), the cathedral exterior (courtyard, graveyard, gardens), and a few ambient buildings or residences for clergy.

**Room Ideas:** Cathedral courtyard with a stone basin, a small graveyard with weathered headstones, clergy residences, a quiet garden behind the cathedral, street rooms along Cathedral Lane with a more solemn character than the market side.

### 3. Garrison District — ~40-50 rooms

**Grid Location:** Northwest quadrant — between Harbor Road and Main Street, west of King's Road. Centered around the Marshal Street / Westwall Street area.

The military and civic center of Arindale. This is where order is maintained — the training grounds, the jail, and the seat of city government.

#### Training Hall

Entered from a street room. An entrance room that then splits two ways:

```
[Marshal Street] → [Training Hall Entrance]
                          |            \
                        (down)       [Training Room]
                          |
                     [Underground] ← future expansion
```

- **Training Hall Entrance** — the main hall where the paths diverge
- **Training Room** — a safe combat room where players can practice fighting without consequence (training feature enabled, no death penalties)
- **Underground** — stairs lead down to a single room. Dead end for now. Future expansion planned.

**Rooms: 3**

#### Sheriff's Office (Jail)

```
[Marshal Street] → [Sheriff's Office] → [Back Office]
                                              |
                                           (down)
                                              |
                    [Cell] ← [Jail Corridor] → [Cell]
                                    |
                    [Cell] ← [Jail Corridor] → [Cell]
                                    |
                    [Cell] ← [Jail Corridor] → [Cell]
```

- **Sheriff's Office** — front room, the law in Arindale
- **Back Office** — a second room with stairs leading down
- **Jail Corridor** — 3 rooms running north-south underground
- **Jail Cells** — 6 cells total (north and south off each corridor room). Each cell has a locked door with strong pick difficulty.

**Rooms: 11** (2 office + 3 corridor + 6 cells)

#### Mayor's Office

- **Mayor's Office** — a single room off a street. Seat of city government.

**Rooms: 1**

#### Guard Barracks

- **Guard Barracks** — 4 rooms. Entered from a street room. Could be laid out as an entrance hall, bunk room, armory, and captain's quarters.

**Rooms: 4**

#### District Streets and Grounds

The remaining rooms in the Garrison District are the streets (Marshal Street, Westwall Street, and connecting segments) and any open areas like a parade ground or courtyard.

**Room Ideas:** Wide streets with a martial feel, a parade ground, notice boards with duty rosters and wanted posters, a courtyard between the barracks and the training hall.

### 4. Harbor District — ~30-40 rooms

**Grid Location:** North of Marshal Street, along and beyond Harbor Road. The waterfront runs along the northern edge of the city.

The northern edge of the city where the docks meet the water. A rougher, more working-class area. The port provides passage to other lands.

#### Tavern

```
[Harbor Road] → [The Tavern] → [Back Room] → [Storage Room]
```

- **The Tavern** — main common room, bar, tables, the social hub of the harbor
- **Back Room** — quieter area, maybe some shady dealings
- **Storage Room** — kegs, crates, supplies

**Rooms: 3**

#### Inn

```
[Harbor Road] → [The Inn] → [Inn Back Room] → [Inn Stairs] (up, requires ticket)
                                                     |
                                              [Upstairs Hallway] → [Guest Rooms...]
```

- **The Inn** — main room, front desk, innkeeper sells room tickets
- **Inn Back Room** — a sitting area or dining room with stairs at the back
- **Inn Stairs** — passage upward, requires a ticket (consumed on use like a key). Players must buy a new ticket from the innkeeper each time they want to go upstairs.
- **Upstairs rooms** — guest rooms for resting. Number TBD based on room budget.

**Rooms: 3+ (ground floor) + upstairs rooms**

#### The Docks

Five dock rooms extending north from Harbor Road. Each is a separate slip along the waterfront.

```
[Harbor Road] → [Dock 1] - [Dock 2] - [Dock 3] - [Dock 4] - [Dock 5]
```

- **Dock 1-5** — each an empty slip for now. Descriptions should vary (different sizes, different conditions, different views). Future: each slip will have a boat that provides travel to another area.

**Rooms: 5**

#### District Streets and Grounds

The remaining rooms are the streets (Harbor Road, connecting segments), warehouse buildings, and waterfront atmosphere.

**Room Ideas:** Warehouse interiors, fish market, dock worker shanties, harbormaster's office, a chandler's shop (rope and sail supplies), weathered alleys between buildings.

### 5. Park District — ~15-20 rooms

**Grid Location:** Northeast quadrant — between Marshal Street and Main Street, east of King's Road to Eastwall Street. An open green space on the quieter side of the city, away from the bustle of the harbor and market.

A large park that gives the city a sense of life beyond commerce and combat. A contrast to the rough docks on the northwest side — this is the gentler face of Arindale's north end.

#### Arindale Park

An open area consuming many rooms with an interesting shape that players can explore. Not a grid — paths curve and branch so it feels organic, like a real park rather than city blocks.

```
                    [Shaded Grove]
                         |
[Main Street] → [Park Entrance] → [Flower Garden] → [Reflecting Pool]
                         |                                  |
                  [Willow Path]                      [Hedge Walk]
                         |                                  |
                  [Small Fountain] ← [Winding Path] ← [Rose Arbor]
                         |
                  [Grand Promenade] → [King's Statue] → [Overlook]
                         |
                  [Mossy Steps] → [Quiet Bench]
```

*(Approximate — exact layout can shift during room generation, but the idea is a non-linear shape with branches and loops)*

**Key Features:**
- **King's Statue** — a large bronze statue of a past king at the park's center, a local landmark
- **Reflecting Pool** — a still pool surrounded by stone benches
- **Small Fountain** — trickling water, mossy stone
- **Flower Garden** — seasonal blooms, color and fragrance
- **Shaded Grove** — old trees, dappled light
- **Overlook** — a slight rise with a view over the park and toward the harbor
- **Quiet Bench** — a tucked-away spot, the kind of room that rewards exploration

Each room should have its own character. The park is where we can get creative with descriptions — no two rooms should feel the same.

**Rooms: ~12-15 park rooms** + a few street rooms on the edges

### 6. Residential District — ~15-20 rooms

**Grid Location:** Southeast — between Main Street and Southwall Road, east of Cathedral Lane to Eastwall Street. Quieter blocks east of the cathedral.

Where the citizens of Arindale live. Quieter streets, homes, and everyday life. Less action but gives the city a sense of being lived-in. Intentionally sparse — leave room for future growth.

#### Homes

Scattered houses accessible from the residential streets. Each is 1-2 rooms — a front room and maybe a back room. Nothing interactive in them for now, but they flesh out the district and provide future hooks (quest NPCs, hidden rooms, new shops).

**Room Ideas:** 4-6 small homes (1-2 rooms each), tree-lined streets, a courtyard, a well or fountain. Keep plenty of street rooms without exits so new doors can be added later as the city grows.

#### Growth Space

This district and the streets throughout the city should have rooms with no side exits — blank walls and closed doors that can become new shops, homes, or passages in future updates. The grid spacing (3 rooms between intersections) ensures there's always room to branch off a street into a new building or alley.

### 7. City Gates & Walls — ~15-20 rooms

Three gates control access to the outside world. Each gate is a single room at the end of a street.

#### Gates

- **East Gate** — east end of Main Street. The main gate into Arindale. Requires a toll to pass (costs money, acts as a soft level gate to keep low-level players from wandering into dangerous areas). **Currently closed** — will connect to an external area when it's built.
- **South Gate** — south of Southwall Road, between Market Street and King's Road. No toll. **Currently closed** — will connect to the next area when it exists.
- **West Gate** — west end of Main Street. No toll. **Currently closed** — will connect to an external area when it's built.

When areas beyond the gates are created, the gate rooms will be updated with exits or doors connecting outward.

**Rooms: 3**

#### Wall Walk

A patrol path along the top of the city walls connecting the gates. Guard towers at intervals.

**Room Ideas:** Wall walk segments between gates, guard towers with views outward, a few rooms per stretch. Good atmospheric filler — views of the countryside, the harbor, the castle in the distance.

**Rooms: ~12-17**

### 8. Castle Approach — ~10-15 rooms

**Grid Location:** North of Harbor Road, continuing up King's Road beyond the docks.

The road leading from the city to the King's castle. A grand avenue that rises north from the harbor toward the castle walls.

```
[Harbor Road / King's Road intersection] → [Castle Road] → ... → [Drawbridge]
```

- **Castle Road** — several rooms forming the grand road north (extension of King's Road). Statues, banners, guard checkpoints.
- **Drawbridge** — the final room. The drawbridge is currently raised, preventing passage to the castle. Dead end for now. Future: the drawbridge lowers to grant access to the castle (separate area).

**Room Ideas:** A wide road with statues of past kings, royal banners, an outer courtyard, guard checkpoints along the way. The road should feel increasingly grand as it approaches the castle.

### District Grid Overview

```
          WEST                    CENTER                   EAST
     ┌─────────────┬──────────────────────┬─────────────────────┐
     │             │                      │                     │
N    │   HARBOR    │    HARBOR DISTRICT   │  CASTLE APPROACH    │
     │   DISTRICT  │    (docks, tavern,   │  (King's Road north)│
     │             │     inn, warehouses) │                     │
     ├─ Harbor Rd ─┼── Harbor Rd ─────────┼── Harbor Rd ────────┤
     │             │                      │                     │
     │  GARRISON   │    GARRISON          │   PARK DISTRICT     │
     │  DISTRICT   │    DISTRICT          │   (gardens, gazebo, │
     │             │                      │    pond, chapel)    │
     ├─ Garrison ──┼── Marshal Street ──────┼── Marshal Street ─────┤
     │             │                      │                     │
     │             │   ╔══════════════╗   │                     │
W.Gate── Main St ──┼── ║ TOWN SQUARE  ║ ──┼── Main St ──────── E.Gate
     │             │   ╚══════════════╝   │                     │
     │   MARKET    │    MARKET DISTRICT   │  CATHEDRAL DISTRICT │
     ├─ Temple ────┼── Cloister Court ────────┼── Cloister Court ───────┤
     │  DISTRICT   │                      │  RESIDENTIAL        │
     │             │                      │  DISTRICT           │
     ├─ Southwall ─┼── Southwall Rd ──────┼── Southwall Rd ─────┤
S    │             │      S.Gate          │                     │
     └─────────────┴──────────────────────┴─────────────────────┘
```

### Approximate Room Budget

| Category | Rooms | Notes |
|----------|-------|-------|
| **Street grid** | **~145** | **25 intersections + 120 mid-street rooms (17×17 grid)** |
| Market District buildings | ~15 | Shops, bank |
| Cathedral District buildings | ~15-20 | Cathedral, crypt, Halls of the Dead, grounds |
| Garrison District buildings | ~19 | Training hall, sheriff/jail, mayor, barracks |
| Harbor District buildings | ~13-16 | Tavern, inn, docks, warehouses |
| Park District | ~12-15 | Park rooms (off-grid organic layout) |
| Residential District | ~8-12 | Homes (1-2 rooms each) |
| City Gates & Walls | ~15-20 | 3 gates + wall walk |
| Castle Approach | ~4-6 | Castle road + drawbridge |
| **Total** | **~250-270** | |

---

## Room Description Guidelines

### Format

- **Length:** 2-4 lines at 80 characters wide. Most rooms should be 3 lines. Reserve 2-line descriptions for simple connecting rooms and 4-line descriptions for important landmarks.
- **Names:** Short and locational — 1-4 words. Street rooms use the street name or "Corner of X and Y" for intersections. Interiors use the building name. Features use a descriptive label.
- **Tense:** Present tense, second person implied. Describe what the player sees and senses right now.
- **Senses:** Lead with sight, weave in sound, smell, or touch where natural. Don't force all senses into every room.

### Overall Tone

Arindale is a living city that feels open, welcoming, and sun-touched. Descriptions should convey warmth and space — wide streets, open sky, light on stone. This is the safe haven players return to, and it should feel like it. Individual districts temper this baseline with their own character, but the city never feels oppressive or threatening.

### Spatial Consistency

Room exits must be geographically consistent. If two different paths through the map lead to the same logical location, they must arrive at the same room. For example, going east-then-south from a street room must not reach a different room than going south-then-east from the same starting point when both paths cover the same geographic distance.

**Rules:**
- Building entrances off adjacent street rooms must not create overlapping or contradictory interior footprints.
- Descriptions must match exit directions — if a room says "a stairway leads north," the exit must be `north`, not `down`.
- Two exits from the same intersection must not both represent the same cardinal direction using different commands (e.g., "north" for docks and "up" for a road that goes north).

**Corner rule:** Never place two buildings at the (1,1) corner position of the same intersection. This means: if a building exits from a street room 1 step from an intersection, no other building should exit from the perpendicular street room that is also 1 step from the same intersection pointing into the same block. The conflict: south-then-west from the intersection reaches one building, but west-then-south reaches a different building — same geographic position, two different rooms.

Fix by either:
- Moving at least one building 2+ steps from the intersection along its street
- Placing the building on the opposite side of its street (e.g., east instead of west)

```
BAD (corner conflict at intersection I):

    I ──east──► ew_1 ──south──► Shop A     (1 east, 1 south)
    I ──south──► ns_1 ──east──► Shop B     (1 south, 1 east)
    Same position, different rooms!

GOOD (moved Shop B 2 steps from intersection):

    I ──east──► ew_1 ──south──► Shop A     (1 east, 1 south)
    I ──south──► ns_1 ──south──► ns_2 ──east──► Shop B   (2 south, 1 east)
    Different positions, no conflict.
```

**Block boundary rule:** Buildings entering from a street must fit within the block interior (3 positions between adjacent streets). A building chain of 4+ rooms in one cardinal direction will overflow onto the adjacent street. Fix by changing direction mid-chain (e.g., east→east→south→east instead of east→east→east→east).

**Exceptions:** Organic/natural areas (parks, forests, caves) may intentionally use non-Euclidean layouts where paths wind and loop without strict grid alignment. This must be explicitly noted in the district file header (e.g., "organic non-grid layout"). Non-Euclidean rooms will show as street overlaps in the map generator but are acceptable when explicitly marked.

### ANSI Map Generation & Validation

The map generator (`npm run map:arindale`) produces `maps/arindale.txt` — a text-based map for spatial validation following MajorMUD conventions (reference: [maps.mud.fyi](https://maps.mud.fyi)).

**Workflow for area changes:**
1. Edit district data (rooms, exits, doors)
2. Run `npm run seed:arindale` to insert into DB
3. Run `npm run map:arindale` to regenerate the map
4. Review the CONFLICTS section at the bottom of the map file
5. Fix any **street overlaps** (building room at a street grid position)
6. Building density overlaps are expected in dense blocks — review but don't necessarily fix

**Map format conventions (from MajorMUD):**
- `*` for generic rooms, `-` for E/W connections, `|` for N/S connections
- Letter codes for important rooms (see legend in generated file)
- `%` marks rooms with up/down access
- Rooms placed on a coordinate grid: intersections at `(col*4, row*4)`, mid-street rooms between
- Buildings placed via BFS from their street entry points into block interiors
- Separate sections for ground level, below ground, and upper level (walls)

**How the generator works:**
1. Imports all room/exit data from district TypeScript files (no DB needed)
2. Places street grid rooms at deterministic coordinates
3. BFS from grid rooms to place building rooms following exit directions
4. Detects position conflicts between rooms on the same level
5. Renders each level as an ASCII map with border and labels
6. Generates room index and conflict report

**Adding new areas:** Create a new generator script (e.g., `generate-map-newarea.ts`) following the same pattern. Each area should have its own map file in `maps/`.

### Variety

Most rooms on a given street will share a consistent feel, but **a few rooms per district should break the pattern** with something memorable — a street performer, a cracked fountain, an alley cat colony, an unusual smell, a building that doesn't match its neighbors, a view between buildings. These give players landmarks and make exploration rewarding. Aim for roughly 1 in 5 rooms having a distinctive detail that sets it apart.

### District Tones and Examples

#### Market District — Bustling, colorful, commercial

Lively and crowded. Sounds of haggling, smells of food and goods, colorful awnings and signs. The energy of trade.

**"Market Street"**
> Colorful awnings shade the storefronts lining both sides of this busy
> street. The scent of fresh bread mingles with the tang of oiled leather
> from a nearby shop. Cobblestones worn smooth by countless footsteps
> stretch ahead beneath strings of faded pennants.

**"Market Street"** *(variant — same street, different room)*
> A fruit cart heaped with bright apples and pears sits at the edge of the
> street where a gap between shops lets in a wedge of afternoon sunlight.
> Shoppers weave around it without breaking stride.

**"Corner of Main Street and Market Street"**
> The city's two busiest streets meet here in a wide intersection busy with
> foot traffic. A weathered signpost points south toward the market stalls
> and west along Main Street toward the town square.

#### Cathedral District — Solemn, reverent, stone and shadow

Quieter than the market. Tall stone architecture, long shadows, the faint scent of incense. A sense of age and gravity.

**"Cathedral Lane"**
> Tall stone buildings cast long shadows across the narrow lane. The air
> carries a faint trace of incense drifting from the cathedral whose spires
> rise above the rooftops to the south. Moss creeps along the base of the
> walls where sunlight seldom reaches.

**"Cathedral Courtyard"**
> A flagstone courtyard opens before the cathedral's arched entrance. A
> stone basin of clear water stands at its center, reflecting the stained
> glass windows above. The bustle of the city feels distant here, muffled
> by the high walls.

#### Garrison District — Orderly, sturdy, martial

Disciplined and no-nonsense. Brick and iron, wide parade grounds, the sound of boots. Clean and well-maintained but not warm.

**"Marshal Street"**
> Sturdy brick buildings with iron-banded doors line this wide street in the
> garrison quarter. A city guard passes with a curt nod, hand resting on the
> pommel of her sword. The clatter of a training yard echoes from somewhere
> to the north.

**"Marshal Street"** *(variant)*
> An iron bulletin board mounted on the barracks wall displays duty rosters
> and wanted notices. The street here is swept clean, the cobblestones laid
> in precise rows that match the military order of the district.

#### Harbor District — Rough, salty, working-class

Weathered wood, salt wind, the creak of rigging, gull cries. More character and grit than the rest of the city. Not dangerous, just lived-in.

**"Harbor Road"**
> Salt wind carries the cries of gulls and the creak of rigging from the
> docks to the north. Weathered timber buildings lean close along the road,
> their paint peeling in the sea air. A fishmonger hawks the morning catch
> from a stall near the curb.

**"The Docks"**
> Heavy rope and barnacled pilings line the waterfront where fishing boats
> and trade vessels rock in their moorings. The planks underfoot are slick
> with spray and smell of brine and old tar.

#### Park District — Peaceful, green, sunlit

Natural and open. Birdsong, rustling leaves, dappled light. The calmest part of the city — a place to breathe.

**"Park Path"**
> A gravel path winds beneath the spreading canopy of ancient oaks. Dappled
> sunlight plays across beds of wildflowers that border the walkway.
> Somewhere nearby, water splashes softly in a fountain.

**"The Gazebo"**
> A whitewashed wooden gazebo stands at the heart of a small clearing,
> its lattice sides threaded with climbing ivy. Benches ring the interior,
> worn smooth by years of use.

#### Residential District — Quiet, homey, everyday

Modest and comfortable. Flower boxes, laundry lines, cats on doorsteps. The sounds of daily life rather than commerce or devotion.

**"Eastwall Street"**
> Modest stone houses with flower boxes in the windows line this quiet
> street. A cat dozes on a sunlit doorstep while laundry dries on a line
> strung between second-floor balconies. The distant sounds of the market
> are a muffled murmur here.

**"Residential Lane"**
> Narrow and unhurried, this lane passes between rows of tidy homes with
> painted shutters and small front gardens. The smell of someone's dinner
> drifts from an open window overhead.

#### City Gates & Walls — Imposing, defensive, open views

Stone and iron, the weight of fortification. But also wide views outward — a sense of the world beyond.

**"East Gate"**
> The massive iron-bound gates of Arindale stand open beneath a stone
> archway carved with the city's crest. Guards in polished mail watch the
> steady flow of travelers passing beneath the raised portcullis. Beyond
> the gate, the road stretches east into the wilds.

**"Southern Wall Walk"**
> The stone walkway atop the city wall offers a broad view south across
> rolling farmland fading into haze. A crenellated parapet lines the outer
> edge while the city's rooftops spread below to the north.

#### Castle Approach — Grand, regal, ascending

Wide and impressive. Pale stone, royal banners, statues. The road rises, offering views back over the city.

**"Castle Road"**
> A broad avenue paved in pale stone leads north toward the castle, flanked
> by tall banners bearing the royal standard. The road rises gradually,
> offering a sweeping view of the harbor below and the city rooftops to
> the south.

---

## Rooms

<!-- AI fills this section with room proposals. Designer reviews and sets status tags. -->

| #   | Status | Name | Summary | Terrain | Notes |
| --- | ------ | ---- | ------- | ------- | ----- |
|     |        |      |         |         |       |

### Layout

<!-- ASCII or text description of how rooms connect -->

```

```

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

### [Quest Name]

> **Status:** [PENDING]
> **Type:** active | flavor

**Setup:**

**Flow:**

**Payoff:**

**Affects:** (which rooms, NPCs, items, doors does this touch?)

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

<!-- Free-form notes, open questions, ideas that don't fit elsewhere -->
