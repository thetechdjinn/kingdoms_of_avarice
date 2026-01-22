# Character Training Plan

## Overview

The following is a plan for character training and the different aspects of it.

**Reference:** See `@notes/MajorMUD_terminal_train_screen_example.jpg` for an example of the ANSI-style training form interface.

## Training to a New Level

### Room Requirements

There are two aspects to training a character.

1. Training from Level A to Level B.
2. Training stats earned when you leveled up.

To actually train from one level to another. You must be in a room that allows training for your specific level and class.

Some rooms will allow training of multiple or even all different classes, but maybe level limited.

For instance, here are a few different ways things can be configured:

1. All classes can train in room A, but only from level 2 to level 10.
2. Only a specific class can train in room A, but only from level 2 to level 10.
3. A Class Quest Level. A room where a quest ends and you level up. It's for a specific class and specific level.
4. You must defeat a specific monster to level up. This might be class / level specific or for all classes and levels.

**NOTE:** Quest completion and monster defeat requirements can be tracked via the Game Events system.

### Training Requirements

To train from one level to the next, the player must:

1. **Experience**: Have earned enough experience points for the target level.
2. **Essence**: Meet the essence requirements for the target level (see `@notes/Character_Points.md`).
3. **Room**: Be in a training room that allows their class and target level.
4. **Payment**: Pay the training cost in gold.

### Training Cost Formula

Training costs increase exponentially. The formula is:

```
cost_to_level_N = ceil(base_cost * multiplier^(N-2))
```

Where:
- `base_cost` = Cost to train from level 1 to level 2 (configurable, default: 28 copper)
- `multiplier` = Growth rate per level (configurable, default: 1.8)

**Example costs with default values:**

| Level | Calculation | Cost |
|-------|-------------|------|
| 2 | 28 × 1.8⁰ | 28 copper |
| 3 | 28 × 1.8¹ | 51 copper |
| 4 | 28 × 1.8² | 91 copper |
| 5 | 28 × 1.8³ | 164 copper |
| 10 | 28 × 1.8⁸ | 3,068 copper |
| 20 | 28 × 1.8¹⁸ | ~29 gold |

**NOTE:** The base cost and multiplier should be configurable in the Administrative Game Settings panel.

#### For Training Rooms

Since training requires specific rooms. New features must be added to rooms to support this. It should be determined the best
way to incorporate this. For note, we may also have specific commands that can only be run in rooms in the future. (ie, train, quests, etc) There could also be rooms with portals in them that you would need to type "go portal" or something similar to enter.

### Training Stats

When training stats, you must be in a training room, but it can be **any** training room regardless of that room's class or level restrictions. The room's class/level requirements only apply to level-up training, not stat training.

The reason stat training requires a training room is that to change a player's last name, or attributes like hair or eye color, you must be in a training room to enter the ANSI form that allows you to change those attributes.

#### Stat Training Rules

1. You can only change your last name, not your first name.
2. You cannot change your class or race. That requires a new character or rerolling your current character.
3. You can change your hair style, and eye color.
4. You can only add points to your stats, you may not subtract points that were already assigned.
5. If you haven't saved your character, you can reassign points you haven't yet saved. (ie, you add 5 points, but before you save, you can take them back and assign them to a different stat.)

#### Stat Cost Rules

The cost of raising stats is based on the rules found in @notes/Character_Points.md and should be implemented in the same way.

## Character Creation Integration

When a new character is created, the existing character creation flow remains the same (name, race, class selection). However, immediately after creation, the player is placed into the training form with **100 Character Points (CP)** to assign to their base stats.

This allows players to customize their starting stats at character creation using the same interface they will use for training later. The character is not playable until they complete this initial stat assignment and save.

### Initial CP Assignment

- New characters receive 100 CP to distribute
- Stats start at race/class base values
- Players use the training form to allocate points
- Must SAVE to finalize the character and enter the game
- If they EXIT without saving, the character creation is cancelled

## Training Form Interface

The training interface should be an ANSI-style form similar to the MajorMUD example (see reference image). This form is used both for initial character creation stat assignment and for training existing characters. Key elements:

### Form Layout

- **Character Info** (read-only): Given Name, Race, Class
- **Editable Fields**: Family Name (last name only)
- **Stats**: Display each stat with min/max range and current value
  - Stats that can be increased should be highlighted
  - Show the point cost to increase each stat
- **Physical Attributes**: Hair Length, Hair Colour, Eye Colour
  - Use space bar or similar to toggle between available choices
- **Point Cost Chart**: Display the escalating cost structure
  - 1st 10 points above base: 1 CP each
  - 2nd 10 points above base: 2 CP each
  - 3rd 10 points above base: 3 CP each
  - And so on...
- **CP Counter**: Show remaining character points to spend
- **Exit Options**: SAVE (commit changes) or EXIT (discard changes)

### Form Behavior

1. Nothing is saved until the player explicitly chooses SAVE
2. Players can reassign points freely before saving
3. After saving, stat points cannot be reduced (only increased in future sessions)
4. The form should be accessible via a `train` command when in a training room

## Administrative Settings

The following settings should be configurable in the Admin Game Settings panel:

| Setting | Description | Default |
|---------|-------------|---------|
| `training_base_cost` | Cost in copper to train from level 1 to 2 | 28 |
| `training_cost_multiplier` | Multiplier applied per level | 1.8 |
| `initial_character_points` | CP granted at character creation | 100 |
