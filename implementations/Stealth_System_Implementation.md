# Stealth System Implementation

## Overview

Implement a complete stealth system allowing characters with stealth abilities to hide, sneak, and perform backstab attacks. Based on MajorMUD mechanics with configurable balance settings.

**Reference Documents:**
- `notes/Stealth_Implementation_Plan.md` - Core mechanics design
- `notes/Backstab_Formula_Mockup.md` - Damage formula and balance tables

---

## Phase 1: Foundation - Secondary Stats & Game Settings

**Goal:** Add the derived stats (Stealth, Perception) and backstab configuration to the database and character system.

### 1.1 Database Changes

- [x] Add backstab settings to `game_settings` table:
  - [x] `backstab_base_min_multiplier` (default: 2.0)
  - [x] `backstab_base_max_multiplier` (default: 3.0)
  - [x] `backstab_level_bonus_min` (default: 0.20)
  - [x] `backstab_level_bonus_max` (default: 0.50)
- [x] Create migration file for new settings (using dynamic settings - no migration needed)

### 1.2 Secondary Stat Calculations

- [x] Create `packages/server/src/game/stats/secondaryStats.ts`:
  - [x] `calculateStealth(character)` function
    - Dex × 0.25 + Int × 0.1 + Cha × 0.25 per 10 points
    - Threshold bonuses (+1 each at 60, 75, 90 for Dex/Int/Cha)
    - Level bonus (+1 per level)
    - Racial stealth bonus (+1 if race has stealth)
    - Class stealth bonus (+1 if class has stealth)
  - [x] `calculatePerception(character)` function
    - Int × 0.6 + Will × 0.2 + Cha × 0.1 per 10 points

### 1.3 Character Model Updates

- [x] Add stealth trait checking to race/class definitions
  - [x] `hasStealth` - derived from race OR class having stealth trait (via `characterHasStealth()`)
  - [x] `hasRacialStealth` - race has stealth trait (via `getStealthCapability()`)
  - [x] `hasClassStealth` - class has stealth trait (via `getStealthCapability()`)
- [x] Expose `stealth` and `perception` as computed properties on character (via `calculateStealth()` and `calculatePerception()`)

### 1.4 Settings Repository Updates

- [x] Add getters for backstab settings in `settingsRepository.ts`
- [x] Add backstab settings to admin settings API endpoint

### 1.5 Admin Settings UI

- [x] Add "Backstab Configuration" section to Admin > Settings tab
  - [x] BASE_MIN_MULTIPLIER input (range: 1.0-5.0)
  - [x] BASE_MAX_MULTIPLIER input (range: 1.5-6.0)
  - [x] LEVEL_BONUS_MIN input (range: 0.0-1.0)
  - [x] LEVEL_BONUS_MAX input (range: 0.0-2.0)

### 1.6 Testing

- [ ] Verify stealth calculation matches design doc examples
- [ ] Verify perception calculation
- [ ] Verify settings save and load correctly
- [ ] Test settings hot-reload without server restart

**Files Modified:**
| File | Changes |
|------|---------|
| `packages/server/src/db/migrations/` | New migration for backstab settings |
| `packages/server/src/db/repositories/settingsRepository.ts` | Add backstab setting getters |
| `packages/server/src/game/stats/secondaryStats.ts` | New file - stat calculations |
| `packages/client/src/admin.ts` | Add backstab settings UI |
| `packages/client/admin.html` | Add backstab settings section |

---

## Phase 2: Stealth State Management

**Goal:** Characters can enter/exit sneaking and hidden states.

### 2.1 State Storage

- [x] Add stealth state to character in-memory state:
  - [x] `stealthMode`: `'none'` | `'sneaking'` | `'hidden'` (added to AuthenticatedSocket)
  - [x] Added `StealthMode` type to shared types
- [x] Ensure state resets on logout/disconnect (automatic - socket destroyed on disconnect)

### 2.2 State Machine

- [x] Create `packages/server/src/game/stealth/stealthState.ts`:
  - [x] `canEnterStealth(character, room)` - validation checks
  - [x] `canEnterSneak(character, room)` - sneak-specific validation
  - [x] `setStealthMode(character, mode)` - state transitions
  - [x] `breakStealth(character, reason)` - forced exit with message
  - [x] Helper functions: `isHidden()`, `isSneaking()`, `isStealthing()`, `isInCombat()`

### 2.3 Hide Command

- [x] Implement `hide` command in new `stealthCommands.ts`:
  - [x] Check character has stealth ability
  - [ ] Fail if monsters/NPCs in room (TODO: NPCs not implemented yet)
  - [x] Fail if currently in combat
  - [x] Make stealth roll (player doesn't see result)
  - [x] Success output: `"Attempting to hide..."`
  - [x] Failure output: `"Attempting to hide... You don't think you are hidden."`
  - [x] Set state to `hidden` on success, `none` on failure

### 2.4 Sneak Command

- [x] Implement `sneak` command:
  - [x] Check character has stealth ability
  - [x] Fail if currently in combat
  - [ ] Fail if hostile NPCs have already engaged (TODO: NPCs not implemented yet)
  - [x] Make stealth roll
  - [x] Output: `"Attempting to sneak..."`
  - [x] Set state to `sneaking`

### 2.5 Room Display Updates

- [x] Modify room description to exclude hidden players
- [x] Sneaking players shown normally in room
- [x] Add indicator for self when hidden/sneaking (via vitals status: 'hidden' or 'sneaking')

### 2.6 Command Registration

- [x] Add `hide` and `sneak` to command processor
- [x] Add aliases: `sn` for sneak
- [x] Add `visible` / `vis` command to voluntarily exit stealth

### 2.7 Testing

- [ ] Test hide success/failure messages
- [ ] Test sneak command activation
- [ ] Verify hidden players not visible in room
- [ ] Verify state persists across room commands
- [ ] Verify state resets on logout

**Files Modified:**
| File | Changes |
|------|---------|
| `packages/shared/src/index.ts` | Added StealthMode type and updated PlayerStatus |
| `packages/server/src/game/socket.ts` | Added stealthMode to AuthenticatedSocket, updated sendVitals |
| `packages/server/src/game/stealth/stealthState.ts` | New file - state management |
| `packages/server/src/game/stealth/stealthCommands.ts` | New file - hide/sneak/visible commands |
| `packages/server/src/game/commands.ts` | Register new commands, filter hidden players in room display |

---

## Phase 3: Detection & Search

**Goal:** Players can detect hidden characters; perception checks work.

### 3.1 Stealth Check System

- [x] Create `packages/server/src/game/stealth/stealthCheck.ts`:
  - [x] `rollStealthCheck(sneakerStealth, observerPerception)` → boolean
  - [x] Factor in number of observers (cumulative detection chance via `rollCumulativeDetection`)
  - [x] Return detailed result for logging/debugging (`StealthCheckResult` type)

### 3.2 Search Command Enhancement

- [x] Enhance existing `search` command:
  - [x] For each hidden character in room:
    - [x] Roll perception vs stealth
    - [x] If found: reveal character, break their stealth
    - [x] Output: `"You spot <player> hiding in the shadows!"`
  - [x] Continue finding hidden items (existing functionality)
  - [x] Base output: `"You search the area..."`

### 3.3 See Hidden Trait

- [x] Add `seeHidden` trait definition to race/class system (already existed in Phase 1)
- [x] Characters with `seeHidden`:
  - [x] Automatically see hidden players in room description (with "(hidden)" indicator)
  - [x] No search required
- [ ] Add `seeHidden` to relevant monster definitions (future - when NPCs/monsters implemented)

### 3.4 Testing

- [ ] Test search finding hidden players
- [ ] Test search miss (high stealth vs low perception)
- [ ] Test multiple hidden players in room
- [ ] Verify seeHidden trait works

**Files Modified:**
| File | Changes |
|------|---------|
| `packages/server/src/game/stealth/stealthCheck.ts` | New file - stealth vs perception check mechanics |
| `packages/server/src/game/itemCommands.ts` | Enhanced search command to find hidden players |
| `packages/server/src/game/commands.ts` | Updated room display functions to support seeHidden trait |
| `packages/server/src/game/stats/secondaryStats.ts` | Already had `raceCanSeeHidden()` from Phase 1 |

---

## Phase 4: Stealth Movement

**Goal:** Sneaking movement works correctly with all detection rules.

### 4.1 Movement Integration

- [x] Modify movement handler to check `stealthMode`:
  - [x] If `sneaking`:
    - [x] Show `"Sneaking..."` on room exit
    - [x] Roll stealth vs each occupant's perception on enter
    - [x] Failure: `"You make a sound as you enter the room!"` (red)
    - [x] Success: Enter silently (no announcement to others)
  - [x] If `hidden`:
    - [x] Auto-transition to `sneaking` on move attempt
    - [x] Then proceed with sneaking logic

### 4.2 Stealth Breaking Events

- [x] Break stealth and notify when:
  - [x] Failed movement detection check
  - [ ] Attacked by another player/NPC (TODO: Target side - when NPC attacks)
  - [x] Casting a spell
  - [x] Using a social action targeting another player
  - [ ] Hit by AoE spell in room (TODO: Future - no AoE spells yet)
  - [x] Engaging in combat (attacking someone)

### 4.3 Encumbrance Integration

- [x] Modify stealth calculation to include encumbrance penalty:
  - [x] None (0-17%): 0 penalty
  - [x] Light (18-33%): 0 penalty
  - [x] Medium (34-67%): -10 stealth
  - [x] Heavy (68%+): -25 stealth
- [x] Recalculate stealth when encumbrance changes (calculated on-the-fly during movement checks)

### 4.4 Room Announcement Filtering

- [x] When player enters room sneaking successfully:
  - [x] Do not broadcast arrival message to room
- [x] When player leaves room sneaking:
  - [x] Do not broadcast departure message to room
  - [x] Show "Sneaking..." only to the sneaking player

### 4.5 Testing

- [ ] Test successful sneak into empty room
- [ ] Test successful sneak into occupied room
- [ ] Test failed sneak detection
- [ ] Test stealth break on attack
- [ ] Test stealth break on spell cast
- [ ] Test stealth break on social action
- [ ] Test encumbrance penalties
- [ ] Test hidden → sneaking transition on move

**Files Modified:**
| File | Changes |
|------|---------|
| `packages/server/src/game/commands.ts` | Added stealth movement logic to `handleMove()`, added `getObserversInRoom()` and `calculatePlayerStealth()` helpers |
| `packages/server/src/game/combatCommands.ts` | Added stealth break on attack initiation |
| `packages/server/src/game/spellCommands.ts` | Added stealth break on spell cast |
| `packages/server/src/game/actionCommands.ts` | Added stealth break on targeted social action |
| `packages/server/src/game/stats/secondaryStats.ts` | Encumbrance penalty already implemented via `getEncumbrancePenalty()` |

---

## Phase 5: Backstab Combat

**Goal:** Backstab attacks work with proper damage and accuracy calculations.

### 5.1 Weapon Template Updates

- [x] Add to `item_templates` table:
  - [x] `backstab_accuracy` modifier (in weapon_data JSONB)
- [x] Update item editor to show backstab accuracy field
- [x] Add validation: backstab only with one-handed weapons

### 5.2 Backstab Accuracy Formula

- [x] Create `packages/server/src/game/combat/backstabAccuracy.ts`:
  - [x] Attacker accuracy = Base stats + Stealth + BS-specific accuracy bonuses
  - [x] Defender defense = (AC / 2) + (Perception / 2)
  - [x] Secondary AC ignored for backstabs
  - [x] `rollBackstabHit(attacker, defender)` → boolean

### 5.3 Backstab Damage Formula

- [x] Create `packages/server/src/game/combat/backstabDamage.ts`:
  - [x] Get effective weapon max (weapon max + strength bonus)
  - [x] Calculate using hardcoded multipliers (2.0-4.0x, +0.5-1.0 per level):
    ```
    backstabMin = (effectiveMax × BASE_MIN_MULTIPLIER) + (level × LEVEL_BONUS_MIN)
    backstabMax = (effectiveMax × BASE_MAX_MULTIPLIER) + (level × LEVEL_BONUS_MAX)
    ```
  - [x] Roll between min and max
  - [x] Equipment bonuses added after multiplier calculation

### 5.4 Backstab Command

- [x] Implement `backstab <target>` command:
  - [x] Aliases: `bs`
  - [x] Validation:
    - [x] Character has stealth ability
    - [x] Character is sneaking or hidden
    - [x] Weapon equipped is one-handed
    - [x] Target exists and is visible
    - [x] Target is not already in combat with attacker (no re-backstab mid-fight)
  - [x] On attempt:
    - [x] Roll accuracy check
    - [x] If hit: Calculate and apply damage
    - [x] If miss: No damage
    - [x] Both cases: Break stealth, engage combat
  - [x] Combat messages:
    - [x] Hit: `"You backstab <target> for <damage> damage!"`
    - [x] Miss: `"You attempt to backstab <target> but miss!"`
    - [x] Target sees: `"<attacker> lunges at you from the shadows!"`

### 5.5 Combat Engagement Rules

- [x] Cannot `hide` or `sneak` while in combat
- [x] Error message: `"You may not hide right now!"` / `"You may not sneak right now!"`
- [x] Must break combat (flee or target dies) before re-entering stealth
- [x] Even after combat ends, cannot sneak if another entity has engaged you

### 5.6 Testing

- [ ] Test backstab hit with various weapons
- [ ] Test backstab miss
- [ ] Test damage formula at levels 1, 20, 40
- [ ] Test strength bonus cascade into backstab damage
- [ ] Test one-handed weapon restriction
- [ ] Test combat engagement prevents sneaking
- [ ] Verify stealth breaks after backstab attempt

**Files Modified:**
| File | Changes |
|------|---------|
| `packages/shared/src/items.ts` | Added backstab_accuracy to WeaponData interface |
| `packages/shared/src/progression.ts` | Added backstab_accuracy_bonus to ClassDefinition |
| `packages/server/src/db/schema_progression.sql` | Added backstab_accuracy_bonus column |
| `packages/server/src/db/migrate.ts` | Added migration for backstab_accuracy_bonus |
| `packages/server/src/db/repositories/progressionRepository.ts` | Load backstab_accuracy_bonus |
| `packages/server/src/game/combat/backstabAccuracy.ts` | New file - accuracy calculation |
| `packages/server/src/game/combat/backstabDamage.ts` | New file - damage calculation |
| `packages/server/src/game/stealth/stealthCommands.ts` | Added handleBackstab command |
| `packages/server/src/game/commands.ts` | Registered backstab/bs command |
| `packages/client/src/item-editor.ts` | Added backstab accuracy field to weapon data |
| `packages/client/item-editor.html` | Added backstab accuracy input |

---

## Phase 6: Equipment Integration

**Goal:** Equipment modifiers affect stealth and backstab stats.

### 6.1 Item Template Updates

- [x] Add fields to `item_templates` table:
  - [x] `stealth_modifier` (can be negative for heavy armor)
  - [x] `backstab_min_damage_bonus` (in weapon_data JSONB)
  - [x] `backstab_max_damage_bonus` (in weapon_data JSONB)
- [x] Create migration for new columns (migrate.ts and schema.sql updated)

### 6.2 Stat Aggregation

- [x] Create `getEquipmentStealthModifier(equippedItems)`:
  - [x] Sum all equipped items' stealth modifiers
- [x] Integrate into stealth commands:
  - [x] handleHide uses equipment stealth modifier
  - [x] handleSneak uses equipment stealth modifier
  - [x] handleBackstab uses equipment stealth modifier
- [x] Create `getBackstabDamageBonuses(equippedItems)`:
  - [x] Get backstab damage bonuses from main-hand weapon
- [x] Integrate into `calculateBackstabDamage()`:
  - [x] Add equipment bonuses to min/max

### 6.3 Item Editor Updates

- [x] Add stealth modifier field to item editor (in Modifiers tab)
- [x] Add backstab min/max damage bonus fields (in Weapon Data section)
- [x] Show fields for armor and weapons

### 6.4 Item Display Updates

- [x] Show stealth modifier in item info/examine
- [x] Show backstab modifiers in item info/examine
- [x] Format: `Stealth: +5` or `Stealth: -10`
- [x] Format: `Backstab: Accuracy +5, Damage +2 to +5`

### 6.5 Seed Data

- [x] Add stealth modifiers to existing armor:
  - [x] Heavy armor: negative values (Iron Helm: -5, Chainmail: -10)
  - [x] Light armor: small negative or zero (Leather Vest: -2, others: 0)
  - [x] Special stealth gear: positive (Shadow Cloak: +5, Silent Boots: +3)
- [x] Add backstab modifiers to weapons:
  - [x] Swords: negative accuracy (Rusty: -10, Steel: -5)
  - [x] Daggers: positive bonuses (Iron Dagger: +5 acc, +2 to +4 dmg; Assassin's Stiletto: +15 acc, +5 to +10 dmg)

### 6.6 Testing

- [ ] Verify equipment stealth modifiers apply
- [ ] Verify heavy armor reduces stealth significantly
- [ ] Verify backstab damage bonuses from equipment apply
- [ ] Test swapping equipment updates stats correctly

**Files Modified:**
| File | Changes |
|------|---------|
| `packages/shared/src/items.ts` | Added stealth_modifier to ItemTemplate, backstab damage bonuses to WeaponData |
| `packages/server/src/db/schema.sql` | Added stealth_modifier column |
| `packages/server/src/db/migrate.ts` | Added migration for stealth_modifier |
| `packages/server/src/db/repositories/itemRepository.ts` | Updated CRUD for stealth_modifier |
| `packages/server/src/game/stats/secondaryStats.ts` | Added getEquipmentStealthModifier, getBackstabDamageBonuses |
| `packages/server/src/game/combat/backstabDamage.ts` | Added equipment bonus parameter |
| `packages/server/src/game/stealth/stealthCommands.ts` | Integrated equipment modifiers |
| `packages/server/src/game/itemCommands.ts` | Updated formatItemExamine for new fields |
| `packages/server/src/game/adminCommands.ts` | Updated @iteminfo for new fields |
| `packages/client/src/item-editor.ts` | Added new fields to interface and load/save |
| `packages/client/item-editor.html` | Added new form inputs |
| `packages/server/src/db/seed_items.sql` | Added stealth modifiers and backstab bonuses to items |

---

## Phase 7: Polish & Balance

**Goal:** Final touches, testing commands, documentation, edge cases.

### 7.1 Class-Specific Backstab Accuracy

- [x] Add `backstab_accuracy_bonus` field to ClassDefinition (Phase 5)
- [x] Integrate into backstab accuracy calculation (Phase 5)
- [ ] Set values for specific classes:
  - [ ] Thief: +15 (highest)
  - [ ] Ninja: +10
  - [ ] Ranger: +5
  - [ ] Others with stealth: +0

### 7.2 Staff Testing Commands

- [ ] `@stealth [player]` - Show stealth/perception breakdown (MODERATOR+)
  - [ ] Base from stats
  - [ ] Threshold bonuses
  - [ ] Level bonus
  - [ ] Racial/class bonus
  - [ ] Equipment modifier
  - [ ] Encumbrance penalty
  - [ ] Final total
- [ ] `@setstealth <none|sneaking|hidden> [player]` - Force state (DEVELOPER+)
- [ ] `@backstab <target>` - Test backstab without stealth requirement (DEVELOPER+)

### 7.3 Help Documentation

- [ ] Add to `help` command output:
  - [ ] `hide` - Attempt to hide in the shadows
  - [ ] `sneak` - Attempt to move stealthily
  - [ ] `backstab <target>` - Attack from hiding (one-handed weapons only)
  - [ ] `search` - Search for hidden players and items
- [ ] Add `help stealth` subcommand with detailed mechanics

### 7.4 Balance Testing Checklist

- [ ] Verify damage values match design doc at levels 1, 20, 40
- [ ] Test with Tier 1-5 weapons from design doc
- [ ] Confirm strength bonus cascades correctly
- [ ] Test config changes apply without restart
- [ ] Stress test at extreme levels (60+, 80+)
- [ ] Verify no integer overflow at high values

### 7.5 Edge Cases

- [ ] Target dies during backstab resolution
- [ ] Backstab target that's already in combat with someone else
- [ ] Two players backstab each other simultaneously
- [ ] Backstab while target is casting
- [ ] Disconnect while hidden/sneaking (state cleanup)
- [ ] Server restart while players hidden (state restoration?)

### 7.6 Message Polish

- [ ] Review all stealth-related messages for consistency
- [ ] Ensure color coding matches game conventions:
  - [ ] Red for stealth break warnings
  - [ ] Combat colors for backstab damage
- [ ] Add flavor text variations for backstab hits

### 7.7 Final Documentation

- [x] Update CLAUDE.md with new commands (done in Phase 5)
- [ ] Document stealth system in code comments
- [ ] Add backstab settings to admin documentation

**Files Modified:**
| File | Changes |
|------|---------|
| `packages/server/src/game/adminCommands.ts` | Add testing commands |
| `packages/server/src/game/commands.ts` | Update help text |
| `CLAUDE.md` | Document new commands and system |

---

## Dependency Graph

```
Phase 1 (Foundation)
    │
    ▼
Phase 2 (States) ◄──────────────┐
    │                           │
    ▼                           │
Phase 3 (Detection)             │
    │                           │
    ▼                           │
Phase 4 (Movement)              │
    │                           │
    ▼                           │
Phase 5 (Backstab) ─────────────┘
    │
    ▼
Phase 6 (Equipment)
    │
    ▼
Phase 7 (Polish)
```

---

## Estimated Scope Per Phase

| Phase | New Files | Modified Files | Complexity |
|-------|-----------|----------------|------------|
| 1     | 1-2       | 4-5            | Low        |
| 2     | 2         | 3-4            | Medium     |
| 3     | 1         | 2-3            | Medium     |
| 4     | 0         | 4-5            | Medium     |
| 5     | 2         | 5-6            | High       |
| 6     | 0         | 5-6            | Medium     |
| 7     | 0         | 3-4            | Low        |

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | **Complete** | Secondary stats and backstab settings implemented |
| Phase 2 | **Complete** | Stealth state management, hide/sneak commands implemented |
| Phase 3 | **Complete** | Detection & search mechanics implemented |
| Phase 4 | **Complete** | Stealth movement, encumbrance penalties, stealth breaking events |
| Phase 5 | **Complete** | Backstab combat with accuracy/damage formulas |
| Phase 6 | **Complete** | Equipment integration (stealth modifiers, backstab bonuses) |
| Phase 7 | Not Started | Polish & balance |

---

## Session Notes

_Use this section to track progress, decisions, and blockers between development sessions._

### Session Log

| Date | Phase | Work Done | Next Steps |
|------|-------|-----------|------------|
| 2026-01-30 | Phase 1 | Created secondaryStats.ts with stealth/perception calculations. Added BackstabSettings to settingsRepository with caching. Updated admin UI with backstab configuration section. Added validation to admin routes. | Manual testing of settings and stat calculations. |
| 2026-01-30 | Phase 2 | Implemented stealth state management. Added StealthMode type to shared. Added stealthMode to AuthenticatedSocket. Created stealthState.ts with validation, state transitions, and stealth breaking. Created stealthCommands.ts with hide/sneak/visible commands. Updated room display to filter hidden players. Updated sendVitals to show hidden/sneaking status. | Manual testing of hide/sneak commands. NPC checks deferred until NPCs are implemented. |
| 2026-01-30 | Phase 3 | Created stealthCheck.ts with stealth vs perception roll mechanics. Enhanced search command to find hidden players (perception vs stealth roll). Updated room display functions (getOtherPlayersInRoom, getPlayersInRoom) to support seeHidden trait - races with see_hidden trait now see hidden players marked with "(hidden)". | Manual testing of search command and seeHidden trait. Monster seeHidden deferred until NPCs are implemented. |
| 2026-01-31 | Phase 4 | Implemented stealth movement in handleMove() - hidden auto-transitions to sneaking, shows "Sneaking..." message, rolls cumulative detection vs observers on room entry, suppresses announcements on success, breaks stealth on failure. Added getObserversInRoom() and calculatePlayerStealth() helpers. Added stealth breaking to combat (handleAttack), spell casting (handleSpellCommand), and targeted social actions (handleActionCommand). Encumbrance penalty already integrated via getEncumbrancePenalty(). | Manual testing of sneak movement. AoE spell stealth break and NPC attack stealth break deferred. |
| 2026-01-31 | Phase 5 | Created backstabAccuracy.ts with hit formula (DEX/10 + INT/20 + CHA*1.2/10 + Stealth + weapon/class bonuses vs AC/2 + Perception/2). Created backstabDamage.ts with multiplier formula (2-4x weapon max + level bonuses). Implemented handleBackstab command with validations (stealth ability, stealth state, one-handed weapon, target checks). Added backstab_accuracy to WeaponData interface. Added backstab_accuracy_bonus to ClassDefinition for class-specific bonuses. Updated item editor with backstab accuracy field. Combat engagement rules enforce no stealth while in combat. | Manual testing of backstab mechanics. Phase 6 next. |
| 2026-01-31 | Phase 6 | Implemented equipment integration for stealth system. Added stealth_modifier column to item_templates (schema + migration). Extended WeaponData with backstab_min_damage_bonus and backstab_max_damage_bonus. Created getEquipmentStealthModifier() and getBackstabDamageBonuses() aggregation functions. Updated stealthCommands.ts to use equipment modifiers in hide/sneak/backstab. Updated calculateBackstabDamage() to accept equipment bonuses. Updated item editor UI (HTML + TypeScript) with new fields. Updated examine and @iteminfo to display new modifiers. Added seed data examples: stealth modifiers for armor (-10 to +5), backstab bonuses for daggers (+5 to +15 accuracy, +2 to +10 damage). | Manual testing of equipment modifiers. Phase 7 (Polish & Balance) next. |
