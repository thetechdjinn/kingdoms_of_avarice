# Progression System Guide

The Mastery Exchange & Progression System (MEPS) is a data-driven class progression system that supports dual-track advancement through Standard XP and Essence.

## Overview

### Dual-Resource Progression

Characters advance using two parallel resources:

- **Standard XP (Std-XP)**: Linear progression earned from all activities. Required for level-up eligibility.
- **Essence**: Class-specific currency earned from activities matching your class's thematic tags. Used for leveling and purchasing talents.

### Key Concepts

- **Thematic Tags**: Content-agnostic identifiers (e.g., `melee`, `arcane`, `stealth`) that connect events to classes
- **Essence Multiplier**: Higher values mean more essence required to level (used for hybrid classes)
- **Diminishing Returns**: Repeated activities yield less essence over time
- **Talents**: Purchasable upgrades using accumulated essence

## Architecture

### Data Flow

```
Game Event → Emits Tags → Matches Class Tags → Awards Essence
                      ↓
              Activity Tracker → Applies Diminishing Returns
```

### Files

| File                                                           | Purpose                             |
| -------------------------------------------------------------- | ----------------------------------- |
| `packages/shared/src/progression.ts`                           | Shared TypeScript types and helpers |
| `packages/server/src/game/progression.ts`                      | Server-side progression logic       |
| `packages/server/src/game/progressionLoader.ts`                | JSON data file loader               |
| `packages/server/src/game/progressionCommands.ts`              | Admin @ commands                    |
| `packages/server/src/routes/progression.ts`                    | REST API routes                     |
| `packages/server/src/db/repositories/progressionRepository.ts` | Database access                     |
| `packages/server/src/db/schema_progression.sql`                | Database schema                     |
| `packages/server/src/game/data/*.json`                         | Sample content data                 |

## Content Creation

### Using the Editor

Access the Progression Editor at `/progression-editor.html` (requires Developer role).

The editor has two tabs:

- **Classes**: Define playable and NPC classes
- **Races**: Define playable and NPC races

### Using Admin Commands

All progression commands require Developer or Admin role.

#### Class Commands

| Command                                 | Description        |
| --------------------------------------- | ------------------ |
| `@classes`                              | List all classes   |
| `@classinfo <id>`                       | Show class details |
| `@createclass <id> <name> [multiplier]` | Create a new class |
| `@editclass <id> <field> <value>`       | Edit a class field |
| `@deleteclass <id>`                     | Delete a class     |

**Editable fields**: `name`, `desc`, `multiplier`, `tags`, `crit_bonus`, `dodge_bonus`, `hp_adj`, `hp_per_level_min`, `hp_per_level_max`

Example:

```
@createclass monk_01 Monk 1.5
@editclass monk_01 tags melee,holy,protection
@editclass monk_01 desc A martial artist channeling inner power.
@editclass monk_01 crit_bonus 10
@editclass monk_01 dodge_bonus 25
```

**Combat bonuses:**
- `crit_bonus`: Flat % bonus to critical hit chance (e.g., Ninja/Mystic: +10%)
- `dodge_bonus`: Enables dodge ability with base % (e.g., Ninja/Mystic: +25%)

**HP fields:**
- `hp_adj`: Flat HP added at character creation (e.g., Warrior: +4, Mage: +0)
- `hp_per_level_min`: Minimum HP gained per level (e.g., Warrior: 6, Mage: 3)
- `hp_per_level_max`: Maximum HP gained per level (e.g., Warrior: 10, Mage: 6)

#### Race Commands

| Command                          | Description       |
| -------------------------------- | ----------------- |
| `@races`                         | List all races    |
| `@raceinfo <id>`                 | Show race details |
| `@createrace <id> <name>`        | Create a new race |
| `@editrace <id> <field> <value>` | Edit a race field |
| `@deleterace <id>`               | Delete a race     |

**Editable fields**: `name`, `desc`, `playable`, `stats`, `traits`, `dodge_bonus`, `base_hp`

Example:

```
@createrace orc_01 Orc
@editrace orc_01 stats {"strength": 2, "constitution": 1, "intelligence": -2}
@editrace orc_01 traits base_vision,intimidating
@editrace orc_01 dodge_bonus 10
```

**Combat bonuses:**
- `dodge_bonus`: Racial dodge bonus % (e.g., Halfling: +10%)

**HP fields:**
- `base_hp`: Race base HP at character creation (e.g., Human: 26, Half-Ogre: 37)

#### Ability Commands

| Command                             | Description                                |
| ----------------------------------- | ------------------------------------------ |
| `@abilities [type]`                 | List abilities (optionally filter by type) |
| `@abilityinfo <id>`                 | Show ability details                       |
| `@createability <id> <type> <name>` | Create a new ability                       |
| `@editability <id> <field> <value>` | Edit an ability field                      |
| `@deleteability <id>`               | Delete an ability                          |

**Types**: `skill`, `spell`, `technique`, `passive`

**Editable fields**: `name`, `desc`, `type`, `cost`, `resource`, `cooldown`, `tags`

Example:

```
@createability fireball_01 spell Fireball
@editability fireball_01 cost 25
@editability fireball_01 resource mana
@editability fireball_01 tags arcane,fire,damage
```

#### Talent Commands

| Command                            | Description                               |
| ---------------------------------- | ----------------------------------------- |
| `@talents [class]`                 | List talents (optionally filter by class) |
| `@talentinfo <id>`                 | Show talent details                       |
| `@createtalent <id> <cost> <name>` | Create a new talent                       |
| `@edittalent <id> <field> <value>` | Edit a talent field                       |
| `@deletetalent <id>`               | Delete a talent                           |

**Editable fields**: `name`, `desc`, `class`, `cost`, `level`, `prereqs`, `ability`

Example:

```
@createtalent power_strike_01 150 Power Strike
@edittalent power_strike_01 class warrior_01
@edittalent power_strike_01 level 5
@edittalent power_strike_01 ability power_strike_ability
```

#### Event Commands

| Command                                 | Description             |
| --------------------------------------- | ----------------------- |
| `@events`                               | List all essence events |
| `@eventinfo <id>`                       | Show event details      |
| `@createevent <id> <essence> <tags...>` | Create a new event      |
| `@editevent <id> <field> <value>`       | Edit an event field     |
| `@deleteevent <id>`                     | Delete an event         |

**Editable fields**: `name`, `essence`, `xp`, `tags`

Example:

```
@createevent kill_dragon 500 melee,combat,epic
@editevent kill_dragon xp 1000
@editevent kill_dragon name Slay Dragon
```

#### Class Ability Mapping

| Command                                             | Description                |
| --------------------------------------------------- | -------------------------- |
| `@classabilities <class>`                           | List abilities for a class |
| `@addclassability <class> <ability> [level] [auto]` | Add ability to class       |
| `@removeclassability <class> <ability>`             | Remove ability from class  |

Example:

```
@addclassability warrior_01 power_strike_01 5
@addclassability mage_01 fireball_01 3 auto
@classabilities warrior_01
```

## Thematic Tags

Tags are the bridge between game events and class progression. When an event occurs, it emits tags. Classes that subscribe to matching tags earn essence.

### Common Tags

| Tag           | Description                     |
| ------------- | ------------------------------- |
| `melee`       | Close-range physical combat     |
| `ranged`      | Distance attacks (bows, thrown) |
| `arcane`      | Magical/mystical actions        |
| `holy`        | Divine/religious actions        |
| `unholy`      | Dark/necromantic actions        |
| `stealth`     | Sneaking, hiding, ambushing     |
| `subterfuge`  | Deception, lockpicking, theft   |
| `protection`  | Defending, shielding, tanking   |
| `nature`      | Wilderness, animals, plants     |
| `crafting`    | Creating items, enchanting      |
| `social`      | Diplomacy, persuasion, trade    |
| `exploration` | Discovery, travel, mapping      |

### Custom Tags

You can define any custom tags. Just use them consistently in both events and class subscriptions.

## Essence Economy

### Earning Essence

1. Player performs an action (kills monster, casts spell, etc.)
2. System fires an essence event with tags
3. If player's class subscribes to any matching tags, essence is awarded
4. Diminishing returns apply based on activity count

### Diminishing Returns

The default yield curve:

| Activity Count | Yield Multiplier |
| -------------- | ---------------- |
| 1-20           | 100%             |
| 21-50          | 50%              |
| 51+            | 10%              |

Activity counts reset on level-up or region change.

### Spending Essence

Essence can be spent on:

- **Leveling up**: Requires both Std-XP and Essence thresholds
- **Talents**: Purchase permanent upgrades and abilities

## Database Schema

The progression system uses these tables:

- `class_definitions` - Class templates
- `race_definitions` - Race templates
- `ability_definitions` - Skill/spell definitions
- `talent_definitions` - Purchasable talents
- `essence_events` - Event-to-tag mappings
- `progression_table` - XP/Essence requirements per level
- `class_abilities` - Which abilities each class can learn
- `character_progression` - Per-character progression state
- `character_activity_tracker` - Diminishing returns tracking

Run `schema_progression.sql` to create these tables.

## API Reference

All endpoints require Developer role authentication.

### Classes

- `GET /api/progression/classes` - List all classes
- `GET /api/progression/classes/playable` - List playable classes (no auth required)
- `GET /api/progression/classes/:id` - Get class by ID
- `POST /api/progression/classes` - Create class
- `PUT /api/progression/classes/:id` - Update class
- `DELETE /api/progression/classes/:id` - Delete class
- `GET /api/progression/classes/:id/abilities` - Get class abilities
- `POST /api/progression/classes/:id/abilities` - Add class ability
- `DELETE /api/progression/classes/:id/abilities/:abilityId` - Remove class ability

### Races

- `GET /api/progression/races` - List all races
- `GET /api/progression/races/playable` - List playable races (no auth required)
- `GET /api/progression/races/:id` - Get race by ID
- `POST /api/progression/races` - Create race
- `PUT /api/progression/races/:id` - Update race
- `DELETE /api/progression/races/:id` - Delete race

### Abilities

- `GET /api/progression/abilities` - List all abilities
- `GET /api/progression/abilities/type/:type` - List by type
- `GET /api/progression/abilities/:id` - Get ability by ID
- `POST /api/progression/abilities` - Create ability
- `PUT /api/progression/abilities/:id` - Update ability
- `DELETE /api/progression/abilities/:id` - Delete ability

### Talents

- `GET /api/progression/talents` - List all talents
- `GET /api/progression/talents/class/:classId` - List by class
- `GET /api/progression/talents/:id` - Get talent by ID
- `POST /api/progression/talents` - Create talent
- `PUT /api/progression/talents/:id` - Update talent
- `DELETE /api/progression/talents/:id` - Delete talent

### Events

- `GET /api/progression/events` - List all events
- `GET /api/progression/events/:id` - Get event by ID
- `POST /api/progression/events` - Create event
- `PUT /api/progression/events/:id` - Update event
- `DELETE /api/progression/events/:id` - Delete event

### Progression Table

- `GET /api/progression/levels` - Get level requirements
- `POST /api/progression/levels` - Set level requirement

## Sample Data

The system includes sample JSON data files in `packages/server/src/game/data/`:

- `classes.json` - 15 classes with combat levels, magic schools, and bonuses
- `races.json` - 14 races with stat ranges, traits, and combat bonuses
- `progression_table.json` - Level 1-10 requirements
- `essence_events.json` - Combat, exploration, and social events
- `talents.json` - Sample talents for each class

This data is loaded on server startup for testing.

### Classes with Combat Bonuses

| Class    | Crit Bonus | Dodge Bonus | Notes                    |
|----------|------------|-------------|--------------------------|
| Ninja    | +10%       | +25%        | High crit and dodge      |
| Mystic   | +10%       | +25%        | High crit and dodge      |
| Others   | +0%        | +0%         | Standard combat          |

### Races with Dodge Bonus

| Race     | Dodge Bonus | Notes                         |
|----------|-------------|-------------------------------|
| Halfling | +10%        | Natural evasiveness           |
| Others   | +0%         | No racial dodge bonus         |

For full details on dodge and crit mechanics, see [Combat Energy System](Combat_Energy_System.md).
