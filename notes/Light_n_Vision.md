# Light & Vision System

## Overview

Rooms have a negative darkness value (0 to -500). Characters have a positive vision value built from race base vision, equipment, spells, and status effects. These are summed together. If the result is greater than 0, the character can see. If it's 0 or below, they can't.

**Example:** A room at -170 darkness. A human with normal vision (+100) holding a lit torch (+100): -170 + 100 + 100 = +30. Positive, so they can see. Without the torch: -170 + 100 = -70. Negative, so they can't see.

---

## Core Mechanic

```
netVision = room.darkness_level + effectiveVision

effectiveVision = raceBaseVision + lightSourceBonus + statusEffectVision
```

| Net Vision | Result    | Description                                              |
|------------|-----------|----------------------------------------------------------|
| > 0        | Can see   | Normal play. See everything.                             |
| <= 0       | Can't see | No room info. Accuracy penalty in combat. Search auto-fails. |

---

## Room Darkness Level

Stored as `darkness_level` INTEGER on the rooms table (already exists, currently unused). Range: **0 to -500**.

- **0**: Bright. Full daylight, well-lit interior.
- **-1 to -75**: Dim. Dusk, heavy shade, candlelit rooms.
- **-76 to -150**: Dark. Unlit interior, shallow caves.
- **-151 to -250**: Very Dark. Deep caves, sealed chambers.
- **-251 to -400**: Pitch Black. Sealed tombs, deep underground.
- **-401 to -500**: Abyssal. Supernatural void, magical darkness zones.

These labels are for display in the room name tag (e.g., "[Dark]") and editor context. The actual mechanic is purely numeric.

### Darkness Tag Display

When a player enters a room with darkness < 0 and they can see (net > 0), show a tag after the room name:

| darkness_level  | Tag            |
|-----------------|----------------|
| 0               | (none)         |
| -1 to -75       | [Dim]          |
| -76 to -150     | [Dark]         |
| -151 to -250    | [Very Dark]    |
| -251 to -400    | [Pitch Black]  |
| -401 to -500    | [Abyssal]      |

### Editor Changes

The room editor already has `min="-500" max="0"` on the darkness input. Changes needed:
- Remove the "(NYI)" badge
- Keep the numeric input as-is (the range is correct)
- Add label text showing the current band name (e.g., typing -120 shows "Dark" next to the input)
- Update server-side validation in `routes/rooms.ts` to enforce -500 to 0 (currently validates 0-10, which is wrong)

---

## Character Vision

### Race Base Vision

The `base_vision` trait already exists on races, stored as `{ id: 'base_vision', value: N }`. The editor has a dropdown with presets. The existing values are:

| Preset       | Current Value | Meaning                                       |
|--------------|---------------|-----------------------------------------------|
| Normal       | 100           | Standard human vision. Can see in rooms down to -100 darkness. |
| Low-Light    | 150           | Elven/cat-like. Can see in rooms down to -150. |
| Darkvision   | 200           | Underground races. Can see in rooms down to -200. |
| Blindsight   | 300           | Supernatural. Can see in rooms down to -300.  |

These values are already correct for the numeric system. A room at -170 is invisible to a Normal (100) character but visible to a Darkvision (200) character.

### Editor Update for Base Vision

Replace the preset-only dropdown with a **number input** and a legend below it showing reference values:

```
Base Vision: [___170___]
  100 = Normal | 150 = Low-Light | 200 = Darkvision | 300 = Blindsight
```

Any value can be entered. The legend is informational only.

### Consolidate night_vision / dark_vision Traits

Currently races have BOTH `base_vision` and separate `night_vision` (values 25-80) or `dark_vision` (value 200) traits. These are redundant and confusing.

**Resolution:** Remove `night_vision` and `dark_vision` traits entirely. Their intent is already captured by `base_vision`. Update race seed data so that `base_vision` is the single source of truth for racial vision.

### Proposed Race Vision Values

| Race       | Base Vision | Notes                                    |
|------------|-------------|------------------------------------------|
| Human      | 100         | Normal. Needs light in dark areas.       |
| Half-Elf   | 100         | Normal vision.                           |
| Halfling   | 100         | Normal vision.                           |
| Half-Ogre  | 100         | Normal vision.                           |
| Kang       | 100         | Normal vision.                           |
| Elf        | 150         | Forest-adapted low-light vision.         |
| Dark Elf   | 150         | Underground-adapted low-light vision.    |
| Half-Orc   | 150         | Low-light vision.                        |
| Nekojin    | 150         | Cat-like low-light vision.               |
| Goblin     | 150         | Cave-dwelling low-light vision.          |
| Dwarf      | 170         | Underground heritage, strong low-light.  |
| Gnome      | 170         | Underground heritage, strong low-light.  |
| Gaunt One  | 200         | Supernatural darkvision.                 |

---

## Light Sources (Items)

### Current State
- `ItemType.LIGHT` exists. `LightData { radius, fuel_max, fuel_rate }` defined.
- Torch: radius 2, fuel_max 60, fuel_rate 1. Lantern: radius 3, fuel_max 120, fuel_rate 1.
- `light` and `extinguish` commands exist and track fuel via `fuel_remaining`.
- Commands work (messages, fuel tracking) but have **zero gameplay effect** on vision.

### `use` Command Rework

The `use` command currently special-cases keys by checking if the last arg is a direction. Instead, `use` should be a general dispatcher based on item type:

- `use <key> <direction>` -> unlock door (ItemType.KEY, existing behavior)
- `use <torch>` / `use <lantern>` -> light it (ItemType.LIGHT)
- `use <potion>` -> consume it (ItemType.CONSUMABLE, existing behavior via eat/drink/quaff)

This replaces the standalone `light` command for activating light sources, freeing up `light` as a spell mnemonic. The `light` command can be kept as a deprecated alias or removed.

`extinguish` / `douse` remain as-is for putting out light sources. `remove <torch>` while lit should extinguish it first, then unequip.

### Reworking LightData

The `radius` field name is misleading in a vision-point system. Repurpose it or rename it to represent the **vision bonus** the light source provides when lit:

| Item    | Vision Bonus | fuel_max | fuel_rate       | Duration    |
|---------|-------------|----------|-----------------|-------------|
| Torch   | 100         | 180      | 1 per tick (10s)| 30 minutes  |
| Lantern | 175         | 720      | 1 per tick (10s)| 2 hours     |

- A lit torch gives +100 vision. A human (+100 base) with a lit torch has +200 effective vision. They can see in a room at -170 (-170 + 200 = +30).
- A lit lantern gives +175 vision. A human (+100) with a lit lantern has +275. They can see in rooms down to -275.
- Multiple lit light sources carried by the same player do NOT stack. Use the highest vision bonus among lit items in inventory.
- When you `use` a light source, it auto-equips into the `HELD` equipment slot. Two-handed weapons block this slot, so you can't hold a torch while wielding a two-handed sword.
- Light only benefits the holder. There is no ambient light mechanic; other players in the room do not benefit from your light source. Each player's vision is calculated independently: room darkness + their own effective vision.

### Fuel Consumption

- Fuel burns at `fuel_rate` per game tick (default tick = 10 seconds, was 5s, needs updating)
- Both torch and lantern use `fuel_rate: 1` (1 fuel per tick). At 10s ticks that's 6 fuel per minute.
- When fuel reaches 0, the light goes out: "Your torch sputters and goes out." / "Your lantern flickers and goes dark."
- Permanent light sources (`fuel_max` null/undefined) never run out
- **Fuel persists on the item instance.** The `fuel_remaining` column (already exists) tracks the current fuel of each specific item. Extinguishing a light source preserves its remaining fuel. Relighting it resumes from where it left off.
- A fresh torch starts with `fuel_remaining = null` (unlit). On first `light`, set `fuel_remaining = fuel_max` (180). Each tick it decrements by `fuel_rate`. `extinguish` stops the tick but keeps the current `fuel_remaining` value. `light` again resumes burning from the stored value.
- When fuel hits 0, the item stays in inventory but cannot be relit (out of fuel).

### Game Tick Rate

The `Dropped Tick Interval` game setting has been changed from 5000ms to 10000ms (10 seconds) via admin menu. Fuel consumption piggybacks on this tick rate. Already editable in Admin > Settings.

### Regen Tick Rates (Separate Issue)

Health and mana regeneration use their own tick intervals, currently hardcoded as env vars in `regeneration.ts`:
- `HEALTH_TICK_INTERVAL_MS` (default 5000ms)
- `MANA_TICK_INTERVAL_MS` (default 5000ms)
- Also `HEALTH_REGEN_BASE_PERCENT` (1%), `HEALTH_REGEN_ENHANCED_PERCENT` (3%), `MANA_REGEN_BASE_PERCENT` (2%), `MANA_REGEN_ENHANCED_PERCENT` (5%)

These need to be moved to admin game settings (like `Dropped Tick Interval`) so they are editable at runtime without env vars or server restarts. The regen system should read from `settingsRepository` instead of `process.env`.

### Rename or Extend LightData

Consider renaming `radius` to `vision_bonus` in `LightData` to be explicit. If `radius` must be preserved for future spatial light mechanics, add `vision_bonus` as a separate field. For now, repurpose `radius` since it's unused.

Update seed items:
```sql
-- Torch: vision_bonus 100 (was radius 2)
-- Lantern: vision_bonus 175 (was radius 3)
```

Update the item editor to show this as "Vision Bonus" instead of "Radius", remove NYI badges on light fields.

---

## Spells

### New Spell: Darkvision (Buff)

| Field          | Value                                   |
|----------------|-----------------------------------------|
| Name           | Darkvision                              |
| Mnemonic       | darkvision                              |
| Type           | buff                                    |
| Target         | self (or ally)                          |
| Mana Cost      | TBD                                     |
| Duration       | TBD                                     |
| Effect         | Applies `darkvision` status effect      |
| Schools        | mage, priest, druid                     |

The `darkvision` status effect: `visionModifier: +100`. A human (+100 base) with Darkvision active has +200 effective vision, equivalent to carrying a permanent torch or having racial darkvision.

### New Spell: Light (Buff)

| Field          | Value                                   |
|----------------|-----------------------------------------|
| Name           | Light                                   |
| Mnemonic       | light                                   |
| Type           | buff                                    |
| Target         | self                                    |
| Mana Cost      | TBD                                     |
| Duration       | TBD                                     |
| Effect         | Applies `magical_light` status effect   |
| Schools        | mage, priest                            |

The `magical_light` status effect: `visionModifier: +150`. Acts like carrying an invisible lantern. Visible to others in the room ("X is surrounded by a soft glow.").

### New Spell: Darkness (Debuff)

| Field          | Value                                   |
|----------------|-----------------------------------------|
| Name           | Darkness                                |
| Mnemonic       | darkness                                |
| Type           | debuff                                  |
| Target         | enemy (player or NPC)                   |
| Mana Cost      | TBD                                     |
| Duration       | TBD                                     |
| Effect         | Applies `magical_darkness` status effect|
| Schools        | mage                                    |

The `magical_darkness` status effect: `visionModifier: -100`. Target's effective vision drops by 100. A human in a room at -50 goes from net +50 (can see) to net -50 (can't see). A human with a torch in a -130 room goes from net +70 (can see) to net -30 (can't see). The spell effectively negates one light source worth of vision.

### New Spell: Blindness (Debuff)

| Field          | Value                                   |
|----------------|-----------------------------------------|
| Name           | Blindness                               |
| Mnemonic       | blindness                               |
| Type           | debuff                                  |
| Target         | enemy                                   |
| Mana Cost      | TBD                                     |
| Duration       | TBD                                     |
| Effect         | Applies `blinded` status effect         |
| Schools        | mage, priest                            |

The `blinded` status effect: `isBlind: true` (already exists as a flag) AND `visionModifier: -9999`. Completely blind regardless of other bonuses. Even a Gaunt One (+300) with a lantern (+150) and Darkvision spell (+100) = +550 - 9999 = deeply negative. Cannot see anything.

---

## Status Effect Changes

### New Field: `visionModifier`

Add `visionModifier?: number` to `StatusEffectDefinition`. Positive values improve vision, negative values reduce it. Aggregated by `getEffectModifiers()` just like other modifiers.

### New/Updated Effects

| Effect ID          | Category | visionModifier | Other Flags | Notes                         |
|--------------------|----------|----------------|-------------|-------------------------------|
| `darkvision`       | buff     | +100           |             | See +100 deeper into darkness |
| `magical_light`    | buff     | +150           |             | Glow visible to others, ambient light |
| `magical_darkness` | debuff   | -100           |             | Suppresses vision by 100      |
| `blinded`          | debuff   | -9999          | isBlind     | Total blindness               |

### Integration with `getEffectModifiers()`

The existing `getEffectModifiers()` aggregates all active effect modifiers. Add `visionModifier` to its output. Multiple vision effects stack additively (Darkvision +100 and Magical Darkness -100 cancel out).

---

## Combat Integration

Combat penalties are based on whether the character can see (net > 0) or can't (net <= 0).

### Can't See Penalties

| Aspect       | Effect                                                    |
|--------------|-----------------------------------------------------------|
| Accuracy     | Flat penalty from admin game setting (default -10). Currently hardcoded in `combatCalculations.ts`, move to settings. |
| Perception   | Drops to 0. Search auto-fails. Cannot find hidden players/items. |
| Flee         | Random direction (cannot choose)                          |
| Backstab     | Auto-succeeds accuracy check against blind targets        |
| Spellcasting | Targeted offensive spells fail. Self-buffs and room-AoE work regardless. |
| Stealth      | If the searcher can't see, search auto-fails (perception 0). |

---

## Room Display Changes

### `look` Command

The `look` command and room entry display check net vision:

```typescript
function canSee(socket: AuthenticatedSocket, roomDarkness: number): boolean {
  const effective = calculateEffectiveVision(socket);
  return (roomDarkness + effective) > 0;
}
```

**Can see (net > 0):** Normal display (no change from current behavior). Darkness band tag appended to room name if darkness < 0.

**Can't see (net <= 0):**
```
The room is very dark - you can't see anything!
```
If the room's darkness_level is below -300:
```
The room is pitch black - you can't see anything!
```
- Single line, replaces room name, description, exits, and "Also here" entirely
- No other output

---

## Area Darkness Assignments

All surface/lit rooms: **darkness 0**.

All dark rooms (underground, caves, crypts, unlit interiors): **darkness -120**.

This creates a clean racial split:
- **Can see without light (+150 or higher):** Elf, Dark Elf, Half-Orc, Nekojin, Goblin, Dwarf, Gnome, Gaunt One
- **Need a light source (+100):** Human, Half-Elf, Halfling, Half-Ogre, Kang (100 + 100 torch = 200, net +80 in -120 room)

Pitch black rooms (below -120) don't exist yet. They'll be used for special cases in future content where even darkvision races need light or magic.

---

## Gameplay Scenarios

All dark rooms are -120. These examples show how the numbers interact:

**Human in the sewers (no light):**
Room: -120. Vision: +100. Net: -20. Can't see.

**Human in the sewers with a torch:**
Room: -120. Vision: +100 + 100 (torch). Net: +80. Can see.

**Elf in the sewers (no light):**
Room: -120. Vision: +150. Net: +30. Can see. Elves navigate the sewers without light.

**Dwarf in the sewers (no light):**
Room: -120. Vision: +170. Net: +50. Can see. Dwarves see even better.

**Gaunt One anywhere dark (no light):**
Room: -120. Vision: +200. Net: +80. Can see easily.

**Human hit with Darkness spell (-100) in the sewers with torch:**
Room: -120. Vision: +100 + 100 (torch) - 100 (darkness). Net: -20. Can't see. Spell negates the torch.

**Elf hit with Darkness spell (-100) in the sewers:**
Room: -120. Vision: +150 - 100 (darkness). Net: -70. Can't see. Even elves go blind.

**Anyone hit with Blindness:**
Vision: whatever - 9999. Net: deeply negative. Can't see.

**Future pitch black room example:**
Room: -250. Elf: +150, net -100. Can't see. Dwarf: +170, net -80. Can't see. Dwarf + torch: +170 + 100 = +270, net +20. Can see. Even darkvision races would need light.

---

## Implementation Phases

### Phase 1: Foundation (Types, Migrations, Editors, Regen Settings)

**Goal:** All data structures, shared types, DB schema, and editor UI in place. No gameplay logic yet.

**Depends on:** Nothing.

1. **Shared types:**
   - Add `visionModifier?: number` to `StatusEffectDefinition`
   - Rename `radius` to `vision_bonus` in `LightData` (shared)
   - Add `vision_level?: number` to NPC template shared type
2. **DB migrations:**
   - Add `vision_modifier` column to `status_effect_definitions` table
   - Add `vision_level` column to `npcs` table (default 100)
3. **Status effect wiring:**
   - Wire `visionModifier` into `getEffectModifiers()` aggregation
   - Wire `isBlind` flag: if any active effect has `isBlind`, treat as visionModifier -9999
4. **Room editor:**
   - Fix `darkness_level` validation in `routes/rooms.ts` (-500 to 0, currently validates 0-10)
   - Remove "(NYI)" badge from darkness input
   - Add band label next to input (shows "Dark", "Very Dark", etc. based on value)
5. **Status effect editor:**
   - Add Vision Modifier number field
6. **Progression editor:**
   - Replace base_vision dropdown with number input + legend
   - Legend: `100 = Normal | 150 = Low-Light | 200 = Darkvision | 300 = Blindsight`
7. **Item editor:**
   - Show "Vision Bonus" instead of "Radius" for light sources
   - Remove NYI badges on light fields
8. **Room data export/import:**
   - Include `darkness_level` in room JSON roundtrip (`data:export` / `data:import`)
9. **Regen settings (unrelated to vision but bundled here):**
   - Move env vars to admin game settings: Health Tick Interval (default 5000ms), Mana Tick Interval (default 5000ms), Health Regen Base % (1%), Health Regen Enhanced % (3%), Mana Regen Base % (2%), Mana Regen Enhanced % (5%)
   - `regeneration.ts` reads from `settingsRepository` instead of `process.env`
   - Regen loops reinitialize on `@reload settings`

### Phase 2: Race Vision + Room Darkness Data

**Goal:** Races have correct base_vision values. Underground rooms have darkness_level set. No gameplay effect yet (vision calc not wired).

**Depends on:** Phase 1 (editor changes, shared types).

1. **Race vision consolidation:**
   - Remove `night_vision` and `dark_vision` traits from race definitions
   - `base_vision` is the sole vision source
   - Update race seed data (races.json) with proposed values
2. **Room darkness values:**
   - Set `darkness_level = -120` on all underground/dark rooms (Cathedral Crypt, Sewers, Warrens, Menagerie, Sanctum, Thieves Guild, Hearthstead Cave)
   - Write update script to set darkness on existing DB rooms by area/terrain
3. **Seed item updates:**
   - Torch: vision_bonus 100, fuel_max 180
   - Lantern: vision_bonus 175, fuel_max 720

### Phase 3: Vision Calculation + Room Display

**Goal:** Characters experience darkness. Look command shows darkness tags or "can't see" message. This is when darkness goes live.

**Depends on:** Phase 1 (visionModifier wired in getEffectModifiers), Phase 2 (race base_vision values set, rooms have darkness_level).

1. **Vision utility:**
   - Create `calculateEffectiveVision(socket)`:
     - Read race `base_vision` trait value
     - Aggregate `visionModifier` from active status effects
     - Check HELD slot for lit light source, add its `vision_bonus`
     - Return total
   - Create `canSee(effectiveVision, roomDarkness)` helper (net > 0)
2. **Room display:**
   - Update `getRoomData()` to include `darkness_level`
   - Modify `look` command and room entry display:
     - Can see (net > 0): normal display, darkness band tag on room name
     - Can't see (net <= 0): "The room is very dark - you can't see anything!" (or "pitch black" if below -300)
   - Single line replaces room name, description, exits, "Also here"
3. **Blind interaction rules:**
   - Movement: works normally, player just can't see exits
   - Inventory commands work: `inventory`, `equipment`, `use`, `drop`, `remove`, `look at` own items
   - Room interaction fails: `get` from room, `look at` room contents, `search`
4. **NPC vision:**
   - `calculateEffectiveVision` for NPCs uses their template `vision_level`
   - NPCs with sufficient vision for their room fight normally

### Phase 4: Light Source Mechanics

**Goal:** Torches and lanterns provide vision bonus. Fuel burns down. `use` command dispatches by item type.

**Depends on:** Phase 3 (calculateEffectiveVision checks HELD slot for light source).

1. **`use` command rework:**
   - Dispatch by item type: KEY -> unlock door, LIGHT -> light it, CONSUMABLE -> consume
   - `use <light source>` auto-equips to HELD slot and lights it
   - Frees up `light` as a spell mnemonic
2. **Lit state tracking:**
   - Add `is_lit` boolean to item instances (or sign convention on fuel_remaining)
   - Fresh item: `fuel_remaining = null`. First `use`: set `fuel_remaining = fuel_max`, mark lit.
3. **Fuel consumption:**
   - Fuel tick piggybacks on 10s dropped state tick interval
   - Iterates connected players, checks HELD slot for lit light source, decrements fuel by `fuel_rate`
   - When fuel = 0: auto-extinguish with message ("Your torch sputters and goes out!"), re-display room if now blind
4. **Extinguish behavior:**
   - `extinguish` / `douse`: mark unlit, preserve `fuel_remaining`
   - `drop` while lit: auto-extinguish first, preserve fuel
   - `remove` while lit: extinguish first, then unequip
   - Fuel = 0: item stays in inventory, cannot be relit
5. **Refuel mechanic:**
   - `refuel <lantern>` using oil flask consumable (new seed item)

### Phase 5: Combat Integration

**Goal:** Darkness affects combat. Blind accuracy penalty. Search fails. Backstab/flee/spell restrictions.

**Depends on:** Phase 3 (canSee function exists, vision calculation works).

1. **Admin game setting:**
   - "Blind Accuracy Penalty" (default -10), replaces hardcoded value in `combatCalculations.ts`
2. **Combat effects when can't see:**
   - Accuracy: flat penalty from setting applied in `calculateAccuracy()`
   - Perception: drops to 0, search auto-fails, can't find hidden players/items
   - Backstab: auto-succeeds accuracy check against targets who can't see
   - Flee: random direction when character can't see
   - Spellcasting: targeted offensive spells fail, self-buffs and room-AoE still work

---

## Resolved Design Decisions

All decisions embedded in the phase details above. Summary:

- **Vision is binary:** net > 0 = can see, net <= 0 = can't see. No partial vision.
- **No ambient light:** Each player's vision is independent. Other players' lights don't help you.
- **No room fixtures:** Room darkness_level is the sole room-side value.
- **No light attracting enemies.**
- **HELD slot required:** Light sources must be equipped in HELD slot to provide vision.
- **Dropping lit light:** Auto-extinguishes, preserves remaining fuel.
- **Movement while blind:** Works normally, player just can't see exits. Only flee randomizes.
- **Interaction while blind:** Inventory commands work. Room interaction (get, look at room, search) fails.
- **NPC vision:** `vision_level` on template (default 100). Dark-dwelling NPCs get higher values.
- **Blind accuracy penalty:** Admin game setting, default -10.
- **Perception when blind:** Drops to 0. Search auto-fails.
- **Fuel ticks:** Piggyback on 10s dropped state tick. Extinguish preserves fuel.
- **Spells:** Created via editors (data-driven), not hardcoded. visionModifier on status effects enables this.
- **Base vision editor:** Number input with informational legend, not preset buttons.
