# Spawning and World Management

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## Spawn Rooms

- Mobs should have spawn rooms.
  - Spawn rooms can be set to how many of those mobs can exist at the same time.
    - Room #X is a Serpentine Warrior spawn room.
    - Room #X can spawn up to X Serpentine Warriors to exist at the same time.
    - If one Serpentine Warrior is defeated, the next Serpentine Warrior will spawn at a designated spawn time.
    - Mobs should not respawn immediately, there should be a designated spawn time / loop. This prevents camping / scripting a single room.

## Maximum Mobs for an Area

The maximum mobs for an area should be controlled by the respawn rooms.

**Example:**

- Room X can respawn up to 6 Serpentine Warriors at the same time.
- Room Y can respawn up to 4 Serpentine Sorcerers at the same time.
- Room Z can respawn up to 3 Serpentine Druids at the same time.
- Room W can respawn up to 1 Serpentine Witchdoctor (boss) at a time.
- For a total of 14 mobs in the area.

## Respawn Queue

- Mobs should not respawn immediately. This prevents camping / scripting a single room.
- When a mob dies, an entry is added to the respawn queue with a scheduled respawn time.
  - Example: Serpentine Warrior dies with a 4 minute (240 seconds) respawn time. Entry added with current time + 4 minutes.
  - The mob respawns at its designated spawn room when the timer expires and the entry is removed from the queue.
- Spawn rate / time is configurable per mob type. Standard mobs may respawn every 5 minutes, bosses every 15 minutes.
- When a NPC / Mob spawns, it uses their room entry text (e.g., "A serpentine warrior slithers into the room.") unless the mob is hidden or sneaking at spawn.

## Persistence

- Current mobs / NPCs are stored in memory.
- Mobs / NPCs are serialized and saved to the database periodically (configurable, default 5 minutes).
  - Serialized data is minimal: **mob template ID and current room only**. When unserializing, the game spawns a fresh mob from the template with base stats in the stored room.
- On game startup, mobs / NPCs are loaded from the database. Any missing mobs (below the spawn room caps) are added to the respawn queue with their designated spawn time.

## Roaming

- Mobs should move around the areas they are assigned to.
- Mobs have an **`allowed_areas`** list that defines their roaming boundaries, rather than being locked to a single area string. This handles dungeons with multiple sub-areas and transition rooms.
- Mobs move from room to room randomly but cannot leave their allowed areas.
- Random movement occurs on a configurable interval (default: every 60 seconds).
- Random movement can be disabled per template.
- Movement uses a random roll of 1-100 with a configurable threshold:
  - Example: A 10% chance of moving uses a threshold of 91. The roll must be >= 91 to trigger movement.
- When selecting a destination, the mob only considers exits that lead to rooms within its allowed areas. If no valid exits exist, the mob stays put.
- Mobs and NPCs can be **pinned** to a specific location (no roaming).
- In the future, mobs may leave their area to chase a player, but must return. This is not required at this time.

## Movement and Pathing

- Mobs can move between rooms, limited to their allowed areas.
- Mobs and NPCs respect closed doors and walls.
- Mobs and NPCs in combat can follow fleeing players.
- Mob movements are announced to the room unless the mob is moving silently (stealth trait).
- Mobs can be hidden from players (stealth trait).
- Mobs can have **see-invisible** as a toggleable trait (covers both sneaking and hidden players).
- Mobs can have **stealth** as a toggleable trait, enabling backstab if conditions are met.
- Mobs cannot sneak or hide while in combat.

## Death and Corpse Mechanics

- When an NPC or flagged mob dies, a **corpse item** is created and placed in the room.
  - The corpse is a room item (like a statue) — it can be examined but is not a container and cannot be picked up.
  - The corpse has a configurable duration before it decays (default 5 minutes).
  - Corpse behavior is controlled by a `leave_corpse` boolean + `corpse_duration` on the template, not by entity type.
- Primary reason for corpses: if a quest or merchant NPC dies, the corpse notifies other players why the NPC is unavailable.
- Not required for standard mobs unless flagged (quests, boss monsters with long respawn times).
- Looting has nothing to do with corpses. When a mob dies, loot appears on the ground for anyone to pick up.

## World Sleep / Performance When Empty

- The world sleeps when there are no players online.
- An area sleeps when no players are in the area.
- When sleeping, area state is frozen — **status effects do not tick**, mobs do not act, no state changes occur.
- Exception: mob spawn timers continue to tick during sleep so mobs are ready when players arrive.
- If all mobs have spawned, the area sleeps completely (including spawn timers).
- Once fully asleep, the area does not save state until a player arrives.
- **Wake trigger**: An area wakes **instantly** when a player enters it, or potentially when a player enters a room with an exit to the sleeping area. Players should see a fully populated area immediately.
