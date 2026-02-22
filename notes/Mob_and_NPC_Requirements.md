# Mob and NPC Design Document

**Status:** Draft — requirements being actively refined.

## Rules and Considerations

- We need to evaluate everything to ensure we do not design something that is not possible to implement or comes with too much technical debt or complexity.
- We need to evaluate existing code to ensure compatibility or determine if change is required and if so, evaluate the impact of the change.
- We need to evaluate the impact of the design on the player experience.
- We need to evaluate the impact of the design on the game balance.
- We need to evaluate the impact of the design on the game's performance.
- We need to evaluate the impact of the design on the game's scalability.
- We need to evaluate the impact of the design on the game's maintainability.
- We need to evaluate the impact of the design on the game's security.
- We need to evaluate the impact of the design on the ability to create game content.

## Core Decision

**Mobs and NPCs are the same game object type.** This avoids complexity of managing two different systems. Behavioral differences (hostile, merchant, quest-giver) are driven by configuration, not separate types.

## Design Documents

Each area has been broken into its own document for focused review and development:

| # | Document | Description |
|---|----------|-------------|
| 1 | [Entity Model and Stats](mob_npc/01_Entity_Model_and_Stats.md) | Stat blocks, attack definitions, traits, abilities, name augmentation |
| 2 | [Combat System](mob_npc/02_Combat_System.md) | CombatEntity interface, initiative, hostile initiation, aggression, combat abilities |
| 3 | [AI and Interaction](mob_npc/03_AI_and_Interaction.md) | AI personality envelope, safety layers, budgets, NPC conversation system, action intents |
| 4 | [Spawning and World](mob_npc/04_Spawning_and_World.md) | Spawn rooms, respawn queue, roaming, movement/pathing, death/corpse, world sleep |
| 5 | [Economy and Factions](mob_npc/05_Economy_and_Factions.md) | Faction system, merchant pricing/haggling, loot/drop tables, currency |
| 6 | [Progression and Experience](mob_npc/06_Progression_and_Experience.md) | XP distribution, level gap rules, group bonuses, essence, balancing |
| 7 | [Social Systems](mob_npc/07_Social_Systems.md) | Messaging channels (gossip, auction, broadcast, telepath, shout), group/party system |
| 8 | [Content Tooling](mob_npc/08_Content_Tooling.md) | Editors, testing framework, balance tools |

## Development Phases

Each phase should have no blockers from incomplete prior phases.

| Phase | Scope | Dependencies | Documents |
|-------|-------|-------------|-----------|
| **1** | CombatEntity interface — refactor combat to be entity-agnostic | None | [2](mob_npc/02_Combat_System.md) |
| **2** | Entity data model, repository, static spawn system | Phase 1 | [1](mob_npc/01_Entity_Model_and_Stats.md), [4](mob_npc/04_Spawning_and_World.md) |
| **3** | Mob combat AI (target selection, basic melee, flee, call for help) | Phase 1-2 | [2](mob_npc/02_Combat_System.md) |
| **4** | Loot tables, XP/essence distribution | Phase 3 | [5](mob_npc/05_Economy_and_Factions.md), [6](mob_npc/06_Progression_and_Experience.md) |
| **5** | Faction system, merchant pricing | Phase 2 | [5](mob_npc/05_Economy_and_Factions.md) |
| **6** | Mob roaming, pathing, world sleep | Phase 2 | [4](mob_npc/04_Spawning_and_World.md) |
| **7** | NPC interaction, AI dialogue | Phase 2, 5 | [3](mob_npc/03_AI_and_Interaction.md) |
| **8** | Social systems (messaging, groups) | Phase 1 | [7](mob_npc/07_Social_Systems.md) |
| **9** | Content editors and tooling | Phase 2-4 | [8](mob_npc/08_Content_Tooling.md) |
