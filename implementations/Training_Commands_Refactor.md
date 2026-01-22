# Training Commands Refactor

## Overview

Simplify training commands from multiple variations to just 2 commands:
- `train` - Level up character (requires class/level-specific training room)
- `train stats` - Allocate CP to stats (requires any training room)

## Current State (Before Refactor)

| Command | Behavior |
|---------|----------|
| `train` | Opens form (in training room) OR shows text status (outside) |
| `train level` | Shows level-up requirements |
| `train level confirm` | Performs level-up |
| `train <stat>` | Text-based stat training (works anywhere) |
| `train <stat> <amount>` | Text-based multi-point training (works anywhere) |

## Target State (After Refactor)

| Command | Behavior |
|---------|----------|
| `train` | Level up character - directly levels up if all requirements met |
| `train stats` | Open ANSI form for CP allocation |

### Requirements

**`train` (Level Up):**
- Must be in a training room
- Room must support character's class (if class restrictions configured)
- Room must support target level (within minLevel/maxLevel range)
- Character must have required XP
- Character must have required essence
- Character must have required currency
- If all requirements met → level up succeeds immediately

**`train stats` (Stat Allocation):**
- Must be in ANY training room (enabled=true)
- No class or level restrictions
- Opens ANSI form for CP allocation

---

## Implementation Phases

### Phase 1: Remove Deprecated Commands

**File:** `packages/server/src/game/trainingCommands.ts`

Remove the following code:
1. Text-based stat training logic (lines ~172-252)
   - Removes `train <stat>` and `train <stat> <amount>` commands
2. `showTrainingStatus()` function (lines ~258-307)
   - No longer needed without text-based training
3. `train level` command handling (lines ~109-132)
   - Will be replaced by direct `train` command

### Phase 2: Implement New Command Structure

**File:** `packages/server/src/game/trainingCommands.ts`

Refactor `handleTrain()` function:

```
handleTrain(socket, args):
  1. Validate character exists
  2. Get current room and check if training room
  3. Parse args for subcommand

  IF args == "stats":
    - Check isTrainingRoom() only (no class/level check)
    - If not training room → error
    - Send TRAINING_FORM to client
    - Return

  IF args == "" (no args, level-up):
    - Check isTrainingRoom()
    - Check canTrainInRoom() with class/level restrictions
    - If room doesn't support class/level → error with reason
    - Check XP requirements
    - Check essence requirements
    - Check currency requirements
    - If any requirement not met → show what's missing
    - If ALL requirements met → perform level-up immediately
    - Return success message with CP earned

  ELSE:
    - Return usage error
```

### Phase 3: Update Messages and Prompts

**File:** `packages/server/src/game/trainingCommands.ts`

1. Update error messages to reference new command structure
2. Update success messages after level-up to suggest `train stats`
3. Remove references to `train level` and `train level confirm`

**File:** `packages/server/src/game/commands.ts`

1. Update help text to show:
   - `train` - Level up your character
   - `train stats` - Allocate character points to stats

### Phase 4: Clean Up Unused Code

**File:** `packages/server/src/game/trainingCommands.ts`

1. Remove STAT_ALIASES constant (no longer needed)
2. Remove STAT_TO_COLUMN constant (only needed for text training)
3. Remove any helper functions only used by removed code
4. Consolidate handleLevelUp logic into main flow

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/server/src/game/trainingCommands.ts` | Major refactor - remove text training, simplify commands |
| `packages/server/src/game/commands.ts` | Update help text |

## Files Unchanged

| File | Reason |
|------|--------|
| `packages/shared/src/index.ts` | Types already support new structure |
| `packages/server/src/db/repositories/roomRepository.ts` | Room functions already correct |
| `packages/client/src/forms/TrainingForm.ts` | Form unchanged |
| `packages/client/src/editor.ts` | Editor logic already supports training config |

## Files with Minor Updates

| File | Change |
|------|--------|
| `packages/client/editor.html` | Update hint text on line 129 to reflect new commands |

Current hint: "When enabled, players can use the 'train' command here to allocate stats and level up."
New hint: "When enabled, players can use 'train' (level up) and 'train stats' (allocate CP) here."

---

## Room System (Already Implemented)

The room system already fully supports training room configuration:

**Database:** `rooms.features` JSONB column stores:
```json
{
  "training": {
    "enabled": true,
    "allowedClasses": ["Warrior", "Paladin"],
    "minLevel": 1,
    "maxLevel": 30
  }
}
```

**Repository Functions:**
- `isTrainingRoom(roomId)` - Returns true if `features.training.enabled === true`
- `canTrainInRoom(roomId, class, level, targetLevel)` - Checks enabled + class + level restrictions

**Room Editor:** Already has UI for:
- Enable/disable training room
- Set min/max level range
- Select allowed classes (checkboxes)

---

## Verification Steps

1. Start dev server: `npm run dev`
2. Log in and enter game
3. Test outside training room:
   - `train` → Error: must be in training room
   - `train stats` → Error: must be in training room
4. Go to Training Hall (or any training room)
5. Test `train stats`:
   - Should open ANSI form regardless of class/level restrictions
6. Test `train` with unmet requirements:
   - Should show what requirements are missing (XP, essence, currency)
7. Test `train` with all requirements met:
   - Should level up immediately and show success message
8. Verify old commands return usage error:
   - `train str` → Error with usage hint
   - `train level` → Error with usage hint
   - `train level confirm` → Error with usage hint
