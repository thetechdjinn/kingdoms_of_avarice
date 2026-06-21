# Memory-First Architecture

## Direction

Game-loop state lives in memory. The database is a durability backstop, not the source of truth during play. Most "writes" are actually periodic snapshots of in-memory state; only durability-critical events touch the DB directly.

This direction is already partially implemented (HP/mana/room via the 60-second character save loop). The plan is to extend it.

## What's already memory-first

- **HP, mana, current room** — held in `socket.vitals` and in-memory player location; flushed to DB by `characterSaveLoop.ts` every 60 seconds (configurable via `getCharacterSaveIntervalMs`).
- **Combat state** — combat targets, regen state, behavior state on NPCs all live in `combatState` / `regenState` maps; never persisted between server runs.
- **NPC instances** — `npcManager.ts` keeps all live NPC combat instances in memory; corpses, behavior, room indexing are all in-memory.

## What should move to memory-first

| State | Currently | Target |
|---|---|---|
| Player movement (`current_room_id`) | Real-time write on every room change | Held in memory; flushed on save tick |
| Bank balance | Real-time write on every deposit/withdraw | Held in memory; flushed on save tick + on logout |
| Pocket currency | Real-time write on every transaction | Held in memory; flushed on save tick + on logout |
| Inventory state during session | Mostly real-time | Track changes in memory; flush periodically |

## What stays direct-to-DB

Writes that must survive a crash are kept synchronous to the database. These are infrequent and tolerate any throughput ceiling without trouble.

- **Player logout** — full state flush (vitals, room, inventory, currency, bank, equipment positions). Must be durable before the session ends.
- **Quest completions** — player-visible milestones; losing one after a crash would be felt strongly.
- **Rare gains and losses** — high-value drops, large currency swings, training point spends, character creation/deletion. Things players would notice missing.
- **Item creation/destruction events** — when a new item instance enters or leaves the world (rare drops, crafted items, destroyed gear). Lost item instances are very hard to reconstruct.
- **Account / role / admin changes** — never lose these.

## Why this fits the codebase

- The character save loop pattern is already proven and trusted.
- It collapses N small "during play" writes into 1 batched write per player per interval, well below any reasonable DB throughput ceiling.
- It removes most of the multi-statement transaction surface (`withTransaction` is needed less often), simplifying any future DB driver swap.
- It makes the choice of DB engine almost orthogonal — SQLite, libSQL, Postgres, or even an embedded KV store would all comfortably handle the resulting write volume.

## Trade-off to acknowledge

A crash loses up to N seconds of in-memory state. Already accepted for HP/mana (N=60s). Extending to bank/movement/inventory accepts the same window for those.

Mitigations if the window feels too wide:
- Reduce save interval (more writes, less loss).
- Promote specific high-stakes events back to direct-write (already the rule for quest completions and rare item changes).
- Add a synchronous flush hook for graceful shutdown (server stop, deploy).

## Implementation guidelines for future work

When adding a new system that wants to persist state, default to memory-first unless one of these is true:

1. Losing the state on a crash would be player-visible in a way that damages trust (rare items, quest progress, real-money-adjacent state).
2. The state is read by other server processes or external systems.
3. The write rate is genuinely low (≤1/minute per actor) — in which case the indirection isn't worth the complexity.

For everything else: keep it in memory, hook it into the save loop, and let durability ride on the periodic snapshot.
