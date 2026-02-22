# Content Tooling

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## Mob / NPC Editor

- A **tabbed interface** covering: base stats, attack definitions (with message templates), drop tables, faction assignments, spawn room configuration, roaming rules, AI personality envelope, traits, abilities, and name augmentations.
- Should be integrated with existing editors and tooling (room editor, item editor, etc.).
- Support **base templates** for faster creation — create a base mob type, then duplicate and update specific stats, names, descriptions, and drop tables for variants.

## Drop Table Editor

- A standalone editor for creating and managing drop tables.
- Add/remove items with drop percentages, currency ranges, and denomination flags.
- Once a drop table is created, it can be assigned/referenced by one or more mob templates.
- Include a **drop simulation** feature to validate the drop table produces expected results.

## AI Personality Editor

- Author and test the personality envelope: role, knowledge scope, personality traits, allowed actions.
- System prompt editor with AI guardrail configuration.
- **Test conversation panel** — developers can chat with the NPC's AI configuration and verify behavior before deploying.

## Testing Framework

- A **sandbox room** where developers can spawn mobs/NPCs for testing.
- Combat can be simulated or disabled in the sandbox room.
- The sandbox room is configured as a default allowed roaming area for any mob, so spawned test mobs don't cause roaming issues.
- The existing `@spawn` admin command can spawn a mob in the sandbox for testing.

## Balance Preview

- The mob editor should display calculated **effective DPS** (damage per second based on attack definitions and speed) and **effective HP** (accounting for AC).
- This allows content creators to compare mobs against expected player power at a given level.
- Full balancing tools will be designed after the core systems are built.

## Bulk Operations (Deferred)

- Batch editing of multiple mob templates (e.g., increase all Serpentine mob HP by 10%) is deferred as a future feature to limit project scope.
