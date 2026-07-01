# Memory-First Refactor — Write Site Checklist

Every DB write site found in the audit, grouped by what they touch. For each row, the recommendation is **MEMORY-FIRST** (cache + flush via `flushPlayer`) or **DIRECT** (synchronous DB write — but still routes through `flushPlayer` to drain everything else dirty alongside).

## Phase 1 — what actually shipped (verification, 1.9)

> The tables further down describe the *aspirational* full plan. This section is
> the source of truth for what landed. Several MEM rows below were intentionally
> **not** implemented (see 1.5b deferral and XP note).

**Memory-first and verified (static review + type-check + 339 unit tests green):**
- **Vitals (HP/mana)** — MEM. Marked dirty every save tick; flushed by `flushPlayer`.
- **Room/location** — MEM (1.4). Movement updates the in-memory `playerLocations`
  map; `updateCharacterRoom` direct calls removed from the gameplay paths.
- **Pocket currency** — MEM (1.3) via `sessionState.addPocket`. Direct writers
  (currency pickup, merchant) use the hybrid pattern (direct DB write + cache
  mirror, no dirty mark).
- **Bank balance** — MEM (1.3) via `sessionState.addBank`.
- **Fuel (lit torches)** — DEFERRED-IN-MEMORY (1.5a), but localized in
  `fuelManager`, NOT via `socket.inventory`/`flushPlayer`. Per-tick fuel writes
  eliminated; live fuel persisted only on burn-ending transitions. `is_lit`
  stays a direct write. See the 1.5 implementation-status block in
  [[Memory_First_And_Turso_Implementation_Plan]].

**Stays DIRECT, verified correct (1.8):**
- XP/essence (`awardProgression`) — direct; read synchronously by level-up and
  quest triggers. NOT the deferred "hybrid" the table below imagines.
- Quest completion / flags / step completion — direct milestones.
- Quest + admin currency rewards — direct DB write **plus** cache mirror via
  `syncRecipientPocket` / `socket.pocket` write. **This was a bug fixed in 1.8**:
  before the fix these clobbered an online player's pocket on the next flush.
- Admin commands, character create/delete, training — direct.

**Flush trigger points, verified wired:**
- Periodic save tick → `flushPlayer` per player (`characterSaveLoop`).
- Logout (WebSocket close) → `flushPlayer` (`socket.ts`).
- **Graceful shutdown (SIGTERM/SIGINT) → `flushAllConnectedPlayers` (1.9)** —
  was MISSING; added in 1.9 so a clean shutdown drains pocket/bank/vitals/room.

**NOT implemented (deferred / out of scope for Phase 1):**
- Inventory location/quantity/create/destroy memory-first (1.5b) — items remain
  fully DB-backed. `socket.inventory` is loaded on login but not yet a write path.
- Status-effects memory-first — `markEffectsDirty` exists but is unused; effects
  still persist via their repo. `flushPlayer` does not drain an 'effects' field.

**Live smoke tests to run against a dev server (local Turso / libSQL dev DB):**
login shows cached pocket/bank; move N rooms and
confirm one batched write per tick; bank deposit/withdraw reflects immediately;
quest currency reward shows immediately AND survives a later pocket change;
`@currency` grant survives a later pocket change; light a torch, confirm no
per-tick fuel writes, extinguish persists remaining fuel; SIGTERM flushes all
connected players (watch for the `[Shutdown] Flushed N` log line).

## Core invariant (applies to every row below)

**Every flush — periodic save tick, logout, graceful shutdown, quest completion, level-up, or any direct-write trigger — drains the player's entire dirty state in a single transaction.** See [[Memory_First_Architecture]] for the full rule. This means a "DIRECT" classification below does NOT mean "writes ONLY its own field" — it means "triggers `flushPlayer` immediately rather than waiting for the next save tick." Either way, all dirty state lands together atomically.

The practical difference between MEM and DIR is just *when* the flush fires:
- **MEM** = flush waits for the next save tick (or whichever DIR/logout/shutdown trigger happens first)
- **DIR** = flush fires immediately at the event itself (low-latency durability for milestones)

## Decisions locked in

1. **XP / essence awards**: Hybrid. Accumulate in memory; flush on level-up, quest step/completion, save tick, or logout.
2. **Status effects**: persist current state and time-remaining on logout. Restored on next login.
3. **Inventory writes**: default MEM (atomic flush handles consolidation/destruction safely). DIR reserved for player-perceived milestones (quest rewards, rare drops worth distinguishing).

Legend:
- **Freq** = rough rate during 50-player typical play
- **Stakes** = what loses if the in-memory value vanishes (server crash before next save tick)
- **Rec** = MEM (memory-first) or DIR (direct)

---

## Movement

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Directional movement (n/s/e/w/u/d) | `commands.ts:1309` | ~5/sec | Player re-spawns in last-saved room on crash | MEM |
| Follower auto-move | `commands.ts:1198` | ~2/sec | Same as above | MEM |
| Portal entry | `commands.ts:2207` | ~0.1/sec | Same as above | MEM |
| Death respawn | `commands.ts:3435` | rare | Player respawns at last-saved room | MEM |
| Item transfer (e.g. ride mount) | `itemCommands.ts:2733` | rare | Same | MEM |
| Login default-room fallback | `socket.ts:448` | rare | First login only | MEM |
| Auto-respawn on login if dead | `socket.ts:301` | rare | Login consistency — must be durable | **DIR** |
| Admin `@goto` | `adminCommands.ts:422` | rare | Audit clarity | **DIR** |
| Admin `@teleport` | `adminCommands.ts:1380` | rare | Audit clarity | **DIR** |
| Admin `@revive` (teleports to respawn room) | `adminCommands.ts:1298` | rare | Audit clarity | **DIR** |

## Pocket currency

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Bank deposit (5 variants) | `bankCommands.ts:95-100, 133-134, 155-157` | ~0.1/sec | Crash loses up to 60s of pocket changes | MEM |
| Bank withdraw (3 variants) | `bankCommands.ts:199-206, 239-243, 260-267` | ~0.1/sec | Same | MEM |
| Merchant sale (gain) | `merchantCommands.ts:367` | ~0.5/sec | Same | MEM |
| Merchant purchase (loss) | `merchantCommands.ts:480` | ~0.3/sec | Same | MEM |
| Pickup currency item from ground | `itemCommands.ts:3667` | ~0.2/sec | Same | MEM |
| Quest step currency reward | `questManager.ts:475` | rare | Quest completion — irreversible milestone | **DIR** |
| Quest completion currency reward | `questManager.ts:516` | rare | Same | **DIR** |
| Admin `@currency` grant | `adminCommands.ts:1023` | rare | Audit clarity | **DIR** |

## Bank balance

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Bank deposit | `bankCommands.ts:95-100, 133-134, 155-157` | ~0.1/sec | Crash loses up to 60s | MEM |
| Bank withdraw | `bankCommands.ts:199-206, 239-243, 260-267` | ~0.1/sec | Same | MEM |

Note: bank deposit/withdraw is currently wrapped in `withTransaction` because pocket↔bank atomicity matters. Going memory-first, both sides move together in memory — atomicity is in-process. The save tick still wraps its flush in a transaction so the persisted state can't tear.

## Inventory — location changes (item moves)

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| `get` item into inventory | `itemCommands.ts:216` | ~1/sec | Crash loses last 60s of pickups | MEM |
| `get` split (remainder to inventory) | `itemCommands.ts:270` | rare | Same | MEM |
| `drop` item to room | `itemCommands.ts:342, 421` | ~0.5/sec | Same | MEM |
| `drop` split (new stack in room) | `itemCommands.ts:365, 544` | rare | Same | MEM |
| Fuel tick (lit torch state) | `fuelManager.ts:152, 156` | ~0.1/sec | Torch state reverts to last save | MEM |

## Inventory — quantity changes

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| `get` partial stack | `itemCommands.ts:278` | rare | Same | MEM |
| `drop` partial stack | `itemCommands.ts:350, 552` | rare | Same | MEM |

## Inventory — creation (new item instances)

Atomic flush handles rollback safely (a crash rolls back the create AND the linked currency/quantity change together). DIR remains for milestones the player will remember even after a crash — losing them feels broken.

| Site | File:Line | Freq | Rec |
|---|---|---|---|
| `get` split creates remainder stack | `itemCommands.ts:290, 365` | rare | **MEM** (rollback returns ground stack untouched) |
| `drop` split creates new stack | `itemCommands.ts:564` | rare | **MEM** |
| Merchant purchase (item to player) | `merchantCommands.ts:371` | ~0.3/sec | **MEM** (paired with currency loss in same tx) |
| NPC death loot drop | `npcDeathHandler.ts:258, 288` | ~0.5/sec | **MEM** (rollback returns NPC alive too) |
| Quest step item reward | `questManager.ts:484` | rare | **DIR** (milestone — player remembers the reward) |
| Quest completion item reward | `questManager.ts:525` | rare | **DIR** (milestone) |

## Inventory — destruction (item instance deletes)

Atomic flush handles consolidation/destruction safely (a crash rolls back the delete AND its paired update together).

| Site | File:Line | Freq | Rec |
|---|---|---|---|
| Stack consolidation on pickup | `itemCommands.ts:213, 339, 419` | ~0.5/sec | **MEM** (paired with `addToInstanceQuantity`) |
| Stack consolidation on drop | `itemCommands.ts:268, 542` | rare | **MEM** (paired with `addToInstanceQuantity`) |
| Consumable use (potion/food) | various | ~0.5/sec | **MEM** (paired with vitals change) |
| Merchant purchase consumes player's item | `merchantCommands.ts:474` | ~0.3/sec | **MEM** (paired with currency gain) |
| Quest step consumes item | `questManager.ts:172` | rare | **DIR** (milestone — quest step completing) |

The atomic transaction invariant means duplication is impossible: any code path that writes a `deleteInstance` flushes its paired update in the same transaction. Either both land or both roll back.

## Progression — XP and essence (Hybrid)

| Site | File:Line | Freq | Rec |
|---|---|---|---|
| `awardXp` (NPC kills, quest steps/completion) | `progression.ts:200-206`, callers in `npcDeathHandler.ts:137`, `questManager.ts:469, 510` | ~3/sec | **HYBRID** |
| `awardEssence` | `progression.ts:225-231`, callers in `npcDeathHandler.ts:181`, `questManager.ts` | ~1/sec | **HYBRID** |

XP and essence accumulate in the in-memory `characterProgressions` map. The DB flush fires on any of: level-up, quest step completion, quest final completion, save tick, logout, shutdown. Routine kill-XP defers to the save tick; meaningful milestones flush immediately.

## Progression — level changes

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Level up (triggered by XP threshold inside `awardXp`) | `progression.ts` (inside award flow) | rare | Player feels they "lost" a level on crash | **DIR** |

Level-ups are once-per-many-kills. Direct write is fine.

## Status effects (poison, regen buffs, etc.)

Persist current state and time-remaining on logout. Effects resume on next login from the persisted timestamp.

| Site | File:Line | Freq | Rec |
|---|---|---|---|
| Apply effect | `schema_status_effects.sql` writes via repo | ~1/sec | **MEM** (flushes on tick/logout with `expires_at`) |
| Expire effect | repo delete | ~1/sec | **MEM** (atomic with the apply/cleanup it pairs with) |
| Effect tick (in-memory only) | n/a | ~1/sec per effect | **no DB write** — in-memory ticking; only flushed state matters |

Session-state extension: add `socket.statusEffects: ActiveEffect[]` with `expires_at` timestamps. Tick locally; the save tick / logout flush snapshots the current list.

## Quests — progression state

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Step progress increment (kill X mobs) | `questManager.ts` step update | ~0.5/sec | Crash loses progress within a step | MEM |
| Step completion | `questManager.ts:469-484` | rare | Player thinks they completed but didn't | **DIR** |
| Quest completion | `questManager.ts:510-525` | rare | Irreversible milestone | **DIR** |
| Quest abandonment | `questManager.ts` (if exists) | rare | Quest state inconsistent | **DIR** |

## NPC instance state

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Create NPC instance (spawn) | `npcManager.ts:449` | ~0.05/sec | NPC vanishes on crash, respawn re-creates | leave DIR (already low freq) |
| Delete NPC instance (despawn) | `npcManager.ts:329, 373, 631, 670, 1039` | ~0.1/sec | NPC re-appears on crash, despawn re-deletes | leave DIR |

NPC instances already live in memory (`npcManager`); DB writes are for cold-start restoration. Low enough rate that no deferral is needed.

## Character creation / deletion / training

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Character create | repo `createCharacter` | very rare | Lost character on crash | **DIR** |
| Character delete | repo `deleteCharacter` | very rare | Character reappears | **DIR** |
| Training (CP spend) | `trainingCommands.ts:241, 402, 555, 564` | very rare | Player loses spent CP — feel-bad | **DIR** |
| Admin stat edits | `adminCommands.ts:1200, 1260, 1294` | very rare | Audit clarity | **DIR** |

## Logout / shutdown flush points (all MUST be DIR)

| Site | File:Line | What it flushes |
|---|---|---|
| WebSocket close handler | `socket.ts:599-659` | Current: vitals + room. **Extend to**: pocket, bank, inventory dirty flags |
| Graceful shutdown (new) | needs implementation | Flush every connected player before exit |

---

## Final scope summary

**Memory-first refactor scope** (after decisions locked in):
- Movement: 6 sites refactored, 4 kept direct (admin commands + dead-login respawn)
- Pocket currency: 5 sites refactored, 3 kept direct (quest rewards + admin)
- Bank balance: 6 sites refactored
- Inventory location/quantity: 11 sites refactored
- Inventory create: 4 sites refactored, 2 kept direct (quest rewards)
- Inventory destroy: 4 sites refactored, 1 kept direct (quest turn-in)
- Fuel ticks: 2 sites refactored
- Status effects: all writes refactored to session-state with logout snapshot
- XP/essence: hybrid (memory + opportunistic flush at milestones)
- Quest step progress increment: 1 site refactored (final step completion stays direct)

**Always direct** (milestone or audit):
- Quest step/final completion
- Level-up
- Character create/delete
- Training (CP spend)
- All admin commands
- Logout flush itself
- Auto-respawn on dead login

Cross-cutting changes:
- `AuthenticatedSocket` interface (cached state + dirty flags + status effects)
- `sessionState.ts` (new — mutation helpers + `flushPlayer`)
- `characterSaveLoop.ts` (extended tick — calls `flushPlayer` per socket)
- `socket.ts` close handler (calls `flushPlayer` once)
- New graceful-shutdown hook (calls `flushPlayer` for every socket)
- Every direct-write trigger (quest completion, level-up, etc.) calls `flushPlayer` opportunistically to drain everything else dirty alongside its own write
