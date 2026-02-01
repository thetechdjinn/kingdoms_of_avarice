# Lockpicking System Implementation Plan

## Overview

Implement the lockpicking system as designed in `notes/Locks_Keys_and_Lockpicking.md`. The current codebase has a basic `pick` command; this plan extends it to match the full design.

## Current State

- **Pick command exists** at `commands.ts:1212-1323`
- **Simplified skill calc**: `(INT+DEX)/2 + level*2`
- **Class-only check**: `thievery` or `lockpicking` special ability
- **Gnome has `picklocks` trait** but it's not used
- **Keys work** via `key_tag` matching

---

## Phase 1: Lock Difficulty Range

**Goal**: Change lock difficulty from single value to min/max range.

**Files to modify**:
- `packages/shared/src/doors.ts` - Add `pickDifficultyMin`, `pickDifficultyMax` to Door interface
- `packages/server/src/db/schema.sql` - Add columns `pick_difficulty_min`, `pick_difficulty_max`
- `packages/server/src/db/repositories/doorRepository.ts` - Update mapping
- `packages/server/src/db/migrate.ts` - Migration for existing doors
- `packages/client/src/door-editor.ts` - Update UI for min/max fields

**Acceptance criteria**:
- Doors can have difficulty range (min-max)
- Existing doors migrated: `min=pickDifficulty`, `max=pickDifficulty`
- Door editor shows both fields

---

## Phase 2: Range-Based Roll Mechanics

**Goal**: Update pick command to use difficulty range.

**Files to modify**:
- `packages/server/src/game/commands.ts` - Update `handlePickDoor` logic

**New logic**:
- If skill >= max difficulty → 100% success
- If skill < min difficulty → 100% fail
- Otherwise → roll within range, succeed if roll <= skill

**Acceptance criteria**:
- Auto-succeed when skill >= max
- Auto-fail when skill < min
- Roll messages show range context

---

## Phase 3: Race Trait Check

**Goal**: Allow races with `picklocks` trait to pick locks.

**Files to modify**:
- `packages/server/src/game/commands.ts` - Update `characterHasLockpickingAbility()`

**Logic**:
- Check class: `thievery=true` OR `lockpicking` in `special_abilities`
- Check race: has trait `id="picklocks"` or `id="lockpicking"`
- Either grants ability

**Acceptance criteria**:
- Gnome can pick locks regardless of class
- Thief/Bard/Gypsy/Ninja can pick locks
- Fighter without picklocks trait cannot

---

## Phase 4: Skill Calculation Refactor

**Goal**: Implement design doc formula with breakdown.

**Files to modify**:
- `packages/server/src/game/stats/secondaryStats.ts` - Add `calculateLockpicking()` function
- `packages/server/src/game/commands.ts` - Import and use new function

**Formula**:
```
base = +1 if race has trait, +1 if class has ability
levelBonus = level * 1
dexBonus = floor(dexterity / 10) * 2.5
intBonus = floor(intelligence / 10) * 1
total = floor(base + levelBonus + dexBonus + intBonus + itemBonus)
```

**Acceptance criteria**:
- Formula matches design doc
- Returns breakdown for debugging
- Add `@lockpicking [player]` debug command (MODERATOR+)

---

## Phase 5: Lockpick Item Type

**Goal**: Add TOOL item type for lockpicks.

**Files to modify**:
- `packages/shared/src/items.ts` - Add `ItemType.TOOL`, `ToolData` interface
- `packages/server/src/db/schema.sql` - Add `tool_data` JSONB column
- `packages/server/src/db/repositories/itemRepository.ts` - Handle tool_data
- `packages/client/src/item-editor.ts` - Add tool editor section
- `packages/client/item-editor.html` - Add tool type option and data section
- `packages/server/src/db/migrate.ts` - Add migration for tool_data column
- `packages/server/src/db/seed_items.sql` - Add sample lockpick sets

**ToolData interface**:
```typescript
interface ToolData {
  toolType: 'lockpick';
  quality: number;      // 1-5, adds to skill
  durability: number;   // 1-101, break threshold
}
```

**Sample lockpicks to seed** (with base_value in copper for shop sales):

| Name | Quality | Durability | Cost (copper) | Notes |
|------|---------|------------|---------------|-------|
| crude lockpicks | 1 | 30 | 25 | Cheap, breaks often |
| basic lockpicks | 2 | 50 | 100 | Common |
| quality lockpicks | 3 | 70 | 500 | Reliable |
| masterwork lockpicks | 4 | 90 | 2000 | Professional grade |
| thieves' guild lockpicks | 5 | 101 | 10000 | Unbreakable, rare |

**Acceptance criteria**:
- Can create lockpick items in editor
- Quality and durability stored correctly
- Sample lockpicks seeded with appropriate base_value for shop pricing
- All lockpicks are stackable and takeable

---

## Phase 6: Require Lockpicks

**Goal**: Must have lockpicks to attempt picking.

**Files to modify**:
- `packages/server/src/game/commands.ts` - Check for lockpicks in `handlePickDoor`
- `packages/server/src/game/stats/secondaryStats.ts` - Accept item bonus parameter
- `packages/server/src/db/repositories/itemRepository.ts` - Helper to find best lockpick

**Logic**:
- Find lockpick tool in inventory
- Use highest quality if multiple
- Add quality bonus to skill
- Error if no lockpicks: "You don't have any lockpicks."

**Acceptance criteria**:
- Cannot pick without lockpicks
- Quality adds to skill (+1 to +5)
- Uses best available lockpick

---

## Phase 7: Lockpick Durability

**Goal**: Lockpicks can break on failed attempts.

**Files to modify**:
- `packages/server/src/game/commands.ts` - Add durability check on failure

**Logic**:
- On success: never break
- On failure: roll 1-100
  - If roll > durability → break
  - Durability 101+ → never break
- Delete or reduce quantity by 1

**Acceptance criteria**:
- Success never breaks
- Failure rolls durability check
- Break message shown
- Stackable lockpicks reduce by 1

---

## Phase 8: Consumable Keys (Optional)

**Goal**: Keys can be consumed on use.

**Files to modify**:
- `packages/shared/src/items.ts` - Add `consumeOnUse`, `consumeChance` to ItemFlags
- `packages/server/src/game/commands.ts` - Update unlock to consume keys
- `packages/client/src/item-editor.ts` - Add consume options for keys

**Acceptance criteria**:
- `consumeOnUse: true` destroys key after use
- `consumeChance: 50` = 50% break chance
- Regular keys unchanged

---

## Phase Summary

| Phase | Description | Complexity |
|-------|-------------|------------|
| 1 | Lock Difficulty Range | Small |
| 2 | Range-Based Roll Mechanics | Small |
| 3 | Race Trait Check | Small |
| 4 | Skill Calculation Refactor | Medium |
| 5 | Lockpick Item Type | Medium |
| 6 | Require Lockpicks | Medium |
| 7 | Lockpick Durability | Small |
| 8 | Consumable Keys | Small (Optional) |

---

## Verification

After each phase:
1. Run `npm run build` to verify TypeScript compiles
2. Run `npm run migrate` to apply DB changes
3. Test in-game:
   - Phase 1-2: Create door with difficulty range, test picking
   - Phase 3: Test Gnome picking with non-thief class
   - Phase 4: Use `@lockpicking` command to verify formula
   - Phase 5-7: Create lockpicks in editor, test picking and breaking
   - Phase 8: Test consumable keys

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/server/src/game/commands.ts:1159-1323` | Pick command handler |
| `packages/server/src/game/stats/secondaryStats.ts` | Skill calculations |
| `packages/shared/src/doors.ts` | Door interface |
| `packages/shared/src/items.ts` | Item types |
| `packages/server/src/game/data/races.json` | Race traits |
| `packages/server/src/game/data/classes.json` | Class abilities |
