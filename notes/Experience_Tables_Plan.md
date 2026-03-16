# Experience Tables Plan

## Decisions Made

### Max Level
- **Level 20** for now. Expand once content exists to support higher levels.

### XP Curve Shape
- Easing exponential: growth ratio starts at ~2.4x and eases down toward ~1.4-1.5x at higher levels
- This means early levels are quick, mid levels require more effort, and high levels push players toward quests and group content

### Base XP Requirements (Agreed)

| Level | XP Required | Growth | ~Mob XP Range | ~Kills (grind) | Zone |
|-------|------------|--------|---------------|----------------|------|
| 2 | 300 | -- | 8-12 | ~30 | Hearthstead Loop |
| 3 | 720 | 2.4x | 15-20 | ~40 | Hearthstead Wilds |
| 4 | 1,400 | 1.9x | 20-30 | ~56 | Wilds Cave / early Arindale |
| 5 | 2,500 | 1.8x | 28-40 | ~74 | Arindale outskirts |
| 6 | 4,200 | 1.7x | 35-55 | ~93 | Arindale Sewer |
| 7+ | TBD | ~1.5-1.65x | scales up | ~40-60+ | deeper zones |

Levels 7-20 have initial extrapolated values in the progression table. Use the Progression Table Editor to tune them as content is built.

### Hearthstead Level Cap
- Door from Arindale to Hearthstead is **max level 5**
- Players at level 6+ cannot return
- Hearthstead is a true starter island

### Dual-Gate Leveling
- All classes share the same base XP table
- Each class also requires **essence** to level (already implemented)
- Essence comes from quests and class-specific activities (e.g., thief backstabs 20 mobs, picks 10 locks)
- Both XP and essence must be met before leveling
- Class `essence_multiplier` adjusts how much essence each class needs
- Essence activity system (requirements like "backstab 20 mobs") is not yet implemented -- future work

### XP Sources
- **Combat kills** are the primary XP source (via `distributeXp()`)
- **Quests** will also award XP (amount TBD per quest)
- Quest XP helps reduce the grind, especially at higher levels
- Non-combat game events (crafting, lockpicking, discovery) are defined but not yet wired up -- future consideration

---

## Hearthstead Mob Economy

### Design Flow
1. **Loop (level 1-2):** Player learns combat. Kills ~30 loop mobs (8-12 XP each) to reach level 2.
2. **Quest start:** Player gets Woodcutter's Warning quest at the Inn, heads to Hearthstead Wilds.
3. **Wilds Forest (level 1-2):** Same tier mobs as loop. Quest steps give additional XP.
4. **Wilds Cave (level 2-3):** Tougher mobs (15-20 XP). Player works toward level 3.
5. **Boss fight:** Corrupted bear at level 3. Completing the quest pushes player to nearly level 4.
6. **Graduation:** Player crosses the river to Arindale at level 3-4. Can return until level 5.

### Mob XP Values (To Be Set)

| Mob | Level | XP Reward | Notes |
|-----|-------|-----------|-------|
| Loop wildlife (sickly animal) | 1 | 8-10 | Easiest mob, first combat |
| Loop wildlife (aggressive variant) | 2 | 10-12 | Slightly tougher |
| Forest mob | 1-2 | 8-12 | Same tier as loop |
| Cave creature | 2-3 | 15-20 | Tougher, underground |
| Corrupted goblin (mini-boss) | 2-3 | 40-60 | One-time meaningful reward |
| Corrupted bear (boss) | 3 | 75-100 | Quest climax |

### Quest XP (To Be Set)

| Quest Step | XP Reward | Notes |
|-----------|-----------|-------|
| Woodcutter's Warning step 1 | TBD | Early quest progression |
| Woodcutter's Warning step 2 | TBD | Mid quest |
| Quest completion (turn-in) | TBD | Significant chunk toward level 3-4 |

### Level Gap Filtering
- `XP_LEVEL_GAP = 5` (current setting)
- A level 5 player fighting a level 1 mob (gap = 4) still gets XP
- A level 7 player fighting a level 1 mob (gap = 6) gets nothing
- This naturally pushes players out of Hearthstead as they outlevel it

---

## Arindale Zone XP Ranges (Future Reference)

As content is built for these zones, mob XP should follow the curve established above:

| Zone | Player Level Range | Expected Mob XP Range |
|------|-------------------|----------------------|
| Arindale outskirts | 4-6 | 28-40 |
| Arindale Sewer | 5-8 | 35-55 |
| Warrens of Filth | 8-12 | 80-150 |
| Iridescent Menagerie | 10-14 | 120-250 |
| Sanctum of the Damned | 12-16 | 200-400 |

These are rough guidelines. Actual values should be tuned using the Progression Table Editor and playtesting.

---

## Technical State

### XP Pipe Fix
NPC kills now feed into the progression system's `std_xp` (the pool checked by level-up).

Code changes (written, not yet committed):
- `progressionRepo.incrementStdXp()` -- atomic DB increment
- `progression.awardXp()` -- in-memory + DB sync
- `distributeXp()` in npcDeathHandler now calls `awardXp()` alongside legacy `characters.experience`

### Progression Table Editor
A web editor has been built at `/progression-table-editor.html` that allows:
- Viewing all levels with XP and essence requirements
- Editing values per level with auto-calculated growth ratios and cumulative totals
- Adding and removing levels
- API: `GET/PUT/DELETE /api/progression-table`

### Implementation Steps Remaining

1. Commit all pending code changes (XP pipe fix, editor, progression table values)
2. Create Hearthstead mobs with the XP values above
3. Set quest XP rewards for The Woodcutter's Warning
4. Playtest the level 1-4 experience at Hearthstead
5. Tune level 7-20 values via the editor as deeper content is built
6. Set the max-level-5 door on the Arindale-to-Hearthstead passage
