# Combat System Integration

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## Current State

The combat system currently operates on `AuthenticatedSocket`. NPCs and Mobs do not have an `AuthenticatedSocket`. We must create a new interface that supports both players and NPCs / Mobs.

- Refactoring will be required to support this.
- NPCs and Mobs will require their own action / decision loops separate from the player command queue.
- This will be a large refactor and should be Phase 1.

## CombatEntity Interface

- `CombatEntity` should be an interface that is implemented by both players and NPCs / Mobs.
- It should allow abstraction of the differences of the underlying players, mobs, and NPCs so that interactions and combat are consistent.
- A review of how player interactions are currently implemented will be required to determine the best way to implement this.

## Combat Initiative

Initiative determines the **order** of combatants within a combat round. It has **no effect** on combat energy (energy determines how many swings per turn — these are separate concerns).

- All initiatives must be rolled before a combat round starts (d100 roll).
- If a player walks into a room with a hostile mob, the mob will automatically engage the player and initiative is rolled for that mob.
- When a player engages the mob (providing it's before the initial combat round), initiative is rolled for that player.
- If a combat round occurs before combat is engaged, the player or mob is added to the end of the combat queue rather than rolling initiative.
- If a player, NPC, or Mob re-engages in combat, their initiative order is lost and they move to the end of the queue.
  - Re-engage means: re-attacking, attacking a different target, casting a combat-breaking spell and re-engaging — anything that disrupts an entity's engaged combat.
- Disruptive actions (like stunning) break combat. When re-engaging after a stun, the entity moves to the end of the initiative queue.
- Effects that slow a combatant cause a negative initiative modifier (e.g., a -15 slow debuff means the d100 roll has -15 applied).
- Surprise attacks (backstab) resolve before any initiative combat order. The attacker remains at the top of the initiative queue unless they break combat.
- If a Mob / NPC target is eliminated or combat breaks, the mob selects its next target **randomly** from remaining combatants in the room.

## Hostile Mob Combat Initiation

- Hostile mobs initiate combat immediately when in the same room as a player.
- If the combat round starts before a player initiates combat, the player does not get an initiative roll — they are placed behind the mob in the combat queue.
- If there are multiple hostile mobs in the same room as a player, they **all** initiate combat immediately and initiative is rolled for each. This is intentional — area difficulty is balanced by mob density and roaming behavior, making it more likely only 1-2 mobs occupy a room at any time.
- Stealth prevents aggro: if a player enters a room while sneaking or hidden (and doesn't fail the check), the mob does not detect them. Mobs with **see-invisible** bypass this — see-invisible covers both sneaking and hidden states.

## Mob / NPC Aggression

Aggression is a property of the mob / NPC that dictates how it reacts to players, both in combat and out of combat.

### In Combat Aggression (Deferred)

In-combat aggro (threat tables, target switching based on damage) will not be supported at this time. Target selection is random when a mob's current target dies. Future implementation may include:
- Threat-based target selection
- Damage-driven aggro switching
- Taunt mechanics

### Aggression Out of Combat

Based on player reputation with the mob's faction:
- The player gets higher / lower prices for goods.
- The player gets more / less money for selling an item.
- NPC may not offer to sell items, or may refuse to sell higher quality items.
- NPC may refuse to talk to a player.
- NPC may attack the player.

## Mob / NPC Abilities (Combat)

### Call for Help

- If a mob is outnumbered, it will roll a 50% chance to call for help from mobs in adjacent rooms.
- Call for help text is configurable per mob template.
- Any mob in an adjacent room will respond by moving into the combat room and engaging, unless it is already in combat.
- Chaining is naturally prevented: a mob must be in combat to call for help, and a responding mob moves to the combat room rather than calling from its own room. This means calls cannot cascade through a dungeon.

### Flee

- If a mob drops below 20% HP (configurable), it can roll to flee.
- Fleeing is a **configurable trait** that can be toggled on/off per template.
- A fleeing mob runs at least 3 rooms away and must stay within its allowed roaming areas.

### Stealth and Backstab

- Mobs with the stealth trait can hide in rooms as a movement action.
- Mobs can backstab players if they are in stealth mode or hidden and have the backstab ability.
- Mobs cannot sneak or hide while in combat.

## Mob Behavior Logic

This is not AI — it is deterministic if/then game logic that coordinates when each ability fires. Each mob has a behavioral state that determines its actions:

| State | Behavior | Transitions |
|-------|----------|-------------|
| **Idle** | Roam on timer, respect movement rules | Player enters room (hostile mob) → **Combat** |
| **Combat** | Attack current target, use abilities | Target dies → select random new target; No targets → **Idle**; HP < flee threshold + has flee trait → **Fleeing**; Outnumbered → 50% chance call for help |
| **Fleeing** | Move away from combat room (3+ rooms) | Reached 3 rooms away → **Returning** |
| **Returning** | Move back toward spawn room within allowed areas | Reached allowed area → **Idle** |

This state machine ensures abilities don't fire in isolation — a mob won't try to call for help while fleeing, or roam while in combat. Each tick, the mob checks its current state and executes the appropriate behavior.

## Other Combat Considerations

- Mobs and NPCs utilize the same combat round system as players (4000ms rounds).
- The initiative system determines processing order within each round.
- The energy system (1000 + DEX bonus, weapon speed costs) determines how many swings per round — unchanged from the current player system.
