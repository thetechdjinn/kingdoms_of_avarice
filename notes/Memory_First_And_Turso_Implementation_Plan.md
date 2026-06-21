# Memory-First Refactor + Turso Migration Plan

Two intertwined projects. Phase 1 (memory-first) lands first because it shrinks the surface area of writes Phase 2 (Turso) has to port. Decisions already made:

- **Order**: memory-first first, then Turso.
- **Migration runner**: squash to a single current-state schema for libSQL; no historical migration replay.
- **Data preservation**: dev only — characters/items wiped and re-seeded.

Related docs: [[Memory_First_Architecture]], [[Turso_Migration_Notes]].

---

## Phase 1 — Memory-First Refactor

Goal: extend the proven `characterSaveLoop` pattern (HP/mana/room) to cover every gameplay write that doesn't need durability. After Phase 1, the only direct-to-DB writes during gameplay are: logout flush, quest completions, XP/essence awards, item creation/destruction, and admin commands.

### 1.1 — Extend `AuthenticatedSocket` with cached state + dirty tracking

**Files**: `packages/server/src/game/socket.ts` (interface), `packages/server/src/game/types.ts` if interfaces live there.

Add to the socket interface:

```typescript
pocket: { copper: number; silver: number; gold: number; platinum: number; runic: number };
bankBalance: number;
inventory: ItemInstance[];
dirty: Set<'pocket' | 'bank' | 'room' | 'inventory'>;
```

Initialize on login (`socket.ts:339-345` area) from the existing character/item repo queries.

### 1.2 — Wrap state mutations in helpers that mark dirty

Create `packages/server/src/game/sessionState.ts` with helpers:

```typescript
addPocket(socket, type, amount)     // mutates socket.pocket, sets dirty
addBank(socket, delta)               // mutates socket.bankBalance, sets dirty
setRoom(socket, roomId)              // mutates playerLocations + sets dirty
markInventoryDirty(socket, instanceId)
```

This is the single seam every refactored call site uses. No call site should write `socket.pocket.gold = x` directly.

### 1.3 — Route currency writes through the session state

**Files (refactor)**:
- `packages/server/src/game/bankCommands.ts:95-100, 133-134, 155-157, 199-206, 239-243, 260-267` — replace `addCurrency`/`addBankBalance` direct calls with `sessionState.addPocket` + `sessionState.addBank`. Drop the `withTransaction` wrapper (no longer needed — pocket↔bank atomicity is now in-memory).
- `packages/server/src/game/merchantCommands.ts:367, 480` — replace with `sessionState.addPocket`.
- `packages/server/src/game/itemCommands.ts:3667` — currency item pickup → `sessionState.addPocket`.

**Stays direct** (no change):
- `packages/server/src/game/adminCommands.ts:1023` — admin `currency` command. Admin actions stay synchronous for audit clarity.
- `packages/server/src/game/questManager.ts:475, 516` — quest currency rewards. Quest completions are irreversible milestones.

### 1.4 — Route movement writes through the session state

**Files (refactor)** — remove direct `updateCharacterRoom` calls:
- `packages/server/src/game/commands.ts:1198` (follower follow)
- `packages/server/src/game/commands.ts:1309` (movement directional)
- `packages/server/src/game/commands.ts:2207` (portal)
- `packages/server/src/game/commands.ts:3435` (respawn)
- `packages/server/src/game/itemCommands.ts:2733` (transfer)
- `packages/server/src/game/socket.ts:448` (login default-room fallback)

Each call site already calls `setPlayerLocation(playerId, newRoomId)` — keep that, drop the `updateCharacterRoom`. Save loop already writes location, so this is pure deletion.

**Stays direct**:
- `packages/server/src/game/socket.ts:301` — auto-respawn on login if dead. Necessary for login consistency.
- `packages/server/src/game/adminCommands.ts:422, 1298, 1380` — admin goto/teleport/revive.

### 1.5 — Session-cached inventory with per-item dirty tracking

The biggest piece. Items have identity (instance IDs), can change quantity, can move between containers, can be created/destroyed.

**Strategy**:
- `socket.inventory: ItemInstance[]` loaded on login via `itemRepo.getCharacterInventory(characterId)`.
- Add `socket.dirtyItems: Map<number, 'location' | 'quantity' | 'both'>` for tracking which item instances need flushing.
- Item read paths (`look`, `inventory`, `equipment`) read from `socket.inventory`, not DB.
- Quantity/location changes mutate `socket.inventory` and update `dirtyItems`.

**Files (refactor)** — replace direct `updateInstanceLocation`/`updateInstanceQuantity` with in-memory mutation + dirty mark:
- `packages/server/src/game/itemCommands.ts:216, 270, 278, 342, 350, 365, 421, 544, 552` — get/drop quantity & location updates.
- `packages/server/src/game/fuelManager.ts:152, 156` — fuel tick. Lit-torch state can flush via save loop; deferral here saves writes for active torches.

**Stays direct** (creation/destruction are high-stakes irreversible events):
- `createInstance` callers: `itemCommands.ts:290, 365, 564`, `merchantCommands.ts:371`, `npcDeathHandler.ts:258, 288`, `questManager.ts:484, 525`.
- `deleteInstance` callers: `itemCommands.ts:213, 268, 339, 419, 542`, `merchantCommands.ts:474`, `questManager.ts:172`.

When a direct create/delete happens, ALSO update `socket.inventory` to keep memory in sync.

### 1.6 — Extend the save tick

**File**: `packages/server/src/game/characterSaveLoop.ts:128-173`.

Replace `processSaveTick` body to: for each connected player, check `socket.dirty` set, build a single `updateCharacterStats` payload covering only dirty fields, then flush dirty item instances. Wrap the whole player flush in a single transaction so partial writes can't leave the DB in a torn state. Clear dirty flags on success.

`updateCharacterStats` already accepts the needed fields (`gold`, `copper`, `silver`, `platinum`, `runic`, `current_room_id`, `health`, `mana`); add `bank_balance` to its `UpdatableCharacterFields` type (`characterRepository.ts:180`).

### 1.7 — Extend the logout flush

**File**: `packages/server/src/game/socket.ts:599-659` (close handler).

Today it flushes vitals + room. Extend to flush every dirty field on the disconnecting socket — pocket, bank, dirty inventory items. Reuse the save-tick flush helper so there's one code path.

Add a graceful-shutdown hook that flushes every connected player before exit (server stop, deploy). The current shutdown does not do this.

### 1.8 — Verify writes that stay direct

Quick audit pass to confirm the "stays direct" list is correct. Document in code comments on each direct-write call site WHY it stays direct so future refactors don't accidentally defer them:

- `progression.ts:200-206, 225-231` — `awardXp`/`awardEssence`. Quest triggers and level-up checks read these synchronously; deferring creates race conditions.
- `questManager.ts:475-525` — quest progression. Irreversible milestones.
- Admin commands — synchronous for audit clarity.
- Item create/destroy — high-stakes irreversibility.

### 1.9 — Verification

Smoke test in this order:
1. Login → see cached pocket/bank/inventory values match DB.
2. Move 10 rooms, wait <60s, check no DB writes; wait for tick, confirm one write.
3. Bank deposit 100g, withdraw 50g, check `socket.pocket` and `socket.bankBalance` reflect immediately; DB updates on next tick.
4. Pick up item, drop item, check `socket.inventory` reflects immediately; DB updates on next tick.
5. Disconnect mid-action; reconnect; verify last-tick state is intact.
6. Kill server with `SIGTERM`; verify graceful flush ran.
7. Combat with NPC kill; verify XP write happens immediately (not deferred).
8. Complete a quest; verify quest write happens immediately.

---

## Phase 2 — Turso Migration

Goal: replace `pg` with `@libsql/client`, swap PostgreSQL for an embedded libSQL file. Schema is squashed to one fresh CREATE script; no historical migrations replayed.

### 2.1 — Install libSQL, set up parallel module

**Files (new)**:
- Install `@libsql/client` as a dependency.
- Create `packages/server/src/db/turso/index.ts` — parallel module exposing the same surface as `db/index.ts` (`query`, `getClient`, `withTransaction`, `closePool`), backed by libSQL.

Don't delete the pg code yet. Both modules coexist behind a feature flag so we can switch back during smoke testing. The flag goes away in Phase 2.7.

### 2.2 — Generate consolidated libSQL schema

**Files (new)**:
- `packages/server/src/db/turso/schema.sql` — one consolidated CREATE script reflecting the current Postgres schema, with these substitutions:

| Postgres | libSQL |
|---|---|
| `SERIAL`/`BIGSERIAL` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `JSONB` columns | `TEXT` |
| `TEXT[]` columns | `TEXT` (JSON-encoded arrays) |
| `BIGINT` | `INTEGER` (SQLite INTEGER is 64-bit) |
| `BOOLEAN` | `INTEGER` (0/1; node code already coerces) |
| `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | `TEXT DEFAULT CURRENT_TIMESTAMP` |
| `TIMESTAMP WITH TIME ZONE` / `TIMESTAMPTZ` | `TEXT` (ISO 8601) |
| `GIN` indexes | drop them; if a hot path needs one, add an expression index on `json_extract` |
| PL/pgSQL `updated_at` trigger (`schema_status_effect_definitions.sql:72-85`) | SQLite `CREATE TRIGGER ... AFTER UPDATE` syntax |
| Partial indexes | unchanged (libSQL supports them) |
| `CHECK` constraints | unchanged |
| `FOREIGN KEY` | unchanged (requires `PRAGMA foreign_keys = ON`) |

Source the consolidated script by dumping the current dev DB structure with `pg_dump --schema-only`, then translating with the substitutions above. Manual review pass to catch anything `pg_dump` emits that's pg-specific.

### 2.3 — Port the database connection layer

**File**: `packages/server/src/db/turso/index.ts`.

```typescript
import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = createClient({ url: process.env.TURSO_URL ?? 'file:./data.db' });
    // Async PRAGMAs run on first query; fire-and-forget here is fine
    client.execute('PRAGMA journal_mode = WAL');
    client.execute('PRAGMA synchronous = NORMAL');
    client.execute('PRAGMA foreign_keys = ON');
  }
  return client;
}

export async function query<T>(sql: string, params?: unknown[], txClient?: TransactionClient) {
  const executor = txClient ?? getClient();
  const result = await executor.execute({ sql, args: params ?? [] });
  // Translate libSQL result shape to pg.QueryResult-like shape so callers don't change
  return { rows: result.rows as T[], rowCount: result.rows.length };
}

export async function withTransaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
  const tx = await getClient().transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
```

Goal: callers of `query()` and `withTransaction()` don't need to change. The result shape is mapped to look pg-like.

### 2.4 — Replace the migration runner

**File**: replace `packages/server/src/db/migrate.ts` body for libSQL mode with a single function that:
1. Reads `db/turso/schema.sql` and executes it (idempotent — uses `CREATE TABLE IF NOT EXISTS`).
2. Calls the existing `data:import` pipeline to load JSON game content.
3. Skips entirely if `IMPORTED` marker row already exists in `game_settings`.

The old PL/pgSQL `migrate.ts` body is deleted in Phase 2.7 — kept around during the transition only if the feature flag points at pg.

### 2.5 — Audit and patch all 22 repositories

For each file in `packages/server/src/db/repositories/`, do a grep + read pass for pg-specific patterns:

| Pattern | Action |
|---|---|
| `$1, $2, $3` | Leave — libSQL accepts these |
| `RETURNING` | Leave — libSQL supports |
| `ON CONFLICT … DO UPDATE` | Verify `excluded.col` (not `EXCLUDED`) |
| `@>` | Rewrite to `EXISTS + json_each + json_extract` |
| `\|\|` on JSONB columns | Rewrite to `json_patch` or `json_each + json_group_array` |
| `jsonb_build_object` | Rewrite to `json_object` |
| `jsonb_agg` | Rewrite to `json_group_array` |
| `jsonb_array_elements_text` | Rewrite to `json_each(col).value` |
| `jsonb_set(col, '{key}', v)` | Rewrite to `json_set(col, '$.key', v)` |
| `::jsonb` / `::INTEGER` etc. casts | Drop or rewrite — libSQL uses different cast syntax (`CAST(x AS INTEGER)`) |
| `NOW()` / `CURRENT_TIMESTAMP` | Mostly works — verify |
| `COALESCE`, `CASE` | No change |
| `SPLIT_PART` | Rewrite to `substr` + `instr` |
| `DISTINCT ON` | Rewrite to `ROW_NUMBER() OVER (PARTITION BY)` |

Repo files are 22 total. Most are simple CRUD with no JSONB operators. The hot spots are likely:
- `progressionRepository.ts` — uses CTEs and possibly JSONB
- `npcRepository.ts` — JSONB-heavy (traits, drop tables)
- `itemRepository.ts` — JSONB columns for weapon_data, armor_data, etc.
- `questRepository.ts` — JSONB for prerequisites/rewards

### 2.6 — Smoke test the libSQL path

With the feature flag pointed at libSQL:

1. Fresh install: `rm data.db && npm run migrate` — schema creates, JSON data imports.
2. Login flow — register, approve, login, character create.
3. Movement + combat — basic gameplay loop.
4. Bank, merchant, items.
5. Quest flow, including completion.
6. Admin commands (give, teleport, currency).
7. Stress test: 50 simulated players, 10 minutes of activity. Verify save loop holds. Verify no errors in logs.

### 2.7 — Cut over and delete pg

Once smoke tests pass:

- Delete `packages/server/src/db/index.ts` (pg version); move `db/turso/index.ts` → `db/index.ts`.
- Delete the old `db/migrate.ts` body; the new libSQL one becomes the canonical migrate.
- Remove `pg` and `@types/pg` from `package.json`.
- Remove feature flag.
- Update `.env.example`: replace `DB_NAME/USER/HOST/PORT/PASSWORD` with `TURSO_URL` (default `file:./data.db`).
- Update `CLAUDE.md` and `Documentation/Database_Setup.md` to describe libSQL setup.

---

## File inventory (every file touched)

**Phase 1 — Memory-first**

Refactored:
- `packages/server/src/game/socket.ts` (interface, login init, logout flush, shutdown hook)
- `packages/server/src/game/characterSaveLoop.ts` (extended save tick)
- `packages/server/src/game/bankCommands.ts` (currency writes → session state)
- `packages/server/src/game/merchantCommands.ts` (currency writes)
- `packages/server/src/game/itemCommands.ts` (currency pickup, inventory mutations)
- `packages/server/src/game/commands.ts` (movement writes removed)
- `packages/server/src/game/fuelManager.ts` (deferred fuel ticks)
- `packages/server/src/db/repositories/characterRepository.ts` (`bank_balance` added to `UpdatableCharacterFields`)

New:
- `packages/server/src/game/sessionState.ts` (the mutation helpers + dirty tracking)

Unchanged (stays direct-write):
- `packages/server/src/game/progression.ts`
- `packages/server/src/game/questManager.ts`
- `packages/server/src/game/adminCommands.ts`
- `packages/server/src/game/npcDeathHandler.ts` (item creation only — currency through session state)

**Phase 2 — Turso**

Replaced:
- `packages/server/src/db/index.ts` (driver swap)
- `packages/server/src/db/migrate.ts` (replaced with libSQL schema runner)
- All `packages/server/src/db/schema*.sql` → consolidated into `packages/server/src/db/schema.sql` (libSQL form)

Audited and patched as needed:
- All 22 files in `packages/server/src/db/repositories/`

Config/docs:
- `package.json` (remove `pg`, add `@libsql/client`)
- `.env.example`
- `CLAUDE.md`
- `Documentation/Database_Setup.md`

---

## Out of scope for this plan

- Real-data migration from Postgres to libSQL (not needed — dev only).
- BEGIN CONCURRENT / Rust Turso Database — not needed given memory-first.
- Turso Cloud deployment — local file is the target; cloud is a later URL swap.
- New gameplay features — refactor and migration only.

---

## Suggested commit cadence

Each numbered step above is roughly one commit. Phase 1 can land before Phase 2 starts. If Phase 1.5 (session-cached inventory) turns out large, split it into "load cache" + "defer location updates" + "defer quantity updates" sub-commits.
