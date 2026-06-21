# Memory-First Refactor — Write Site Checklist

Every DB write site found in the audit, grouped by what they touch. For each row, the recommendation is **MEMORY-FIRST** (cache + flush via save tick) or **DIRECT** (synchronous DB write). Reason and frequency are listed so the trade-off is explicit.

Review and override any recommendation before implementation begins.

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

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| `get` split creates remainder stack | `itemCommands.ts:290, 365` | rare | New stack vanishes — confusing for player | **DIR** |
| `drop` split creates new stack | `itemCommands.ts:564` | rare | Same | **DIR** |
| Merchant purchase (item to player) | `merchantCommands.ts:371` | ~0.3/sec | Spent money for a vanishing item — feel-bad | **DIR** |
| NPC death loot drop | `npcDeathHandler.ts:258, 288` | ~0.5/sec | Loot vanishes on crash — feel-bad | **DIR** |
| Quest step item reward | `questManager.ts:484` | rare | Irreversible milestone | **DIR** |
| Quest completion item reward | `questManager.ts:525` | rare | Same | **DIR** |

## Inventory — destruction (item instance deletes)

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| `drop` consumes entire stack from inventory | `itemCommands.ts:213, 419` | ~0.3/sec | Item reappears on crash — duplication exploit | **DIR** |
| `get` consumes entire stack from room | `itemCommands.ts:268, 339, 542` | ~0.3/sec | Same — players could re-pick up | **DIR** |
| Merchant purchase (consume player's item) | `merchantCommands.ts:474` | ~0.3/sec | Same | **DIR** |
| Quest step consumes item | `questManager.ts:172` | rare | Quest mechanics break | **DIR** |

**Decision needed**: inventory deletes are the duplication-exploit risk if deferred. Recommend keeping them DIR. Alternative: queue deletes in memory but write the delete log to a small append-only "ledger" table — still serializes, but is one batch per save tick.

## Progression — XP and essence

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| `awardXp` (called by NPC kills, quest steps/completion) | `progression.ts:200-206`, callers in `npcDeathHandler.ts:137`, `questManager.ts:469, 510` | ~3/sec | Crash loses up to 60s of XP — annoying but recoverable | **? — see below** |
| `awardEssence` | `progression.ts:225-231`, callers in `npcDeathHandler.ts:181`, `questManager.ts` | ~1/sec | Same | **? — see below** |

**Decision needed**: the audit recommended DIR because quest triggers and level-up checks read XP synchronously. But those reads already come from the in-memory `characterProgressions` map (`progression.ts:25`), not the DB — so deferring the DB write doesn't actually break them. Going MEM here would cut ~4 writes/sec to one batched write per tick.

Possible paths:
- **A: All MEM** — XP/essence flushes with the save tick. Crash loses up to 60s of progression.
- **B: DIR** — keep today's behavior. Simple and safe.
- **C: Hybrid** — XP/essence accumulates in memory; flush on level-up, quest completion, save tick, or logout. Best of both but more code.

## Progression — level changes

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Level up (triggered by XP threshold inside `awardXp`) | `progression.ts` (inside award flow) | rare | Player feels they "lost" a level on crash | **DIR** |

Level-ups are once-per-many-kills. Direct write is fine.

## Status effects (poison, regen buffs, etc.)

| Site | File:Line | Freq | Stakes | Rec |
|---|---|---|---|---|
| Apply effect | `schema_status_effects.sql` writes via repo | ~1/sec | Effect doesn't carry over crash — already happens on restart | **? — see below** |
| Expire effect | repo delete | ~1/sec | Same | **? — see below** |

**Decision needed**: most MUDs clear effects on logout. Do we want persisted effects across sessions, or are they purely session-scoped? If session-scoped: stop writing them to DB at all. If session-scoped is acceptable, this is a free win (~2 writes/sec eliminated).

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

## Summary of decisions needed

Three areas have an open question rather than a clear recommendation:

1. **XP / essence awards**: A (all MEM), B (DIR), or C (hybrid — flush on level-up, quest completion, save tick, logout)?
2. **Status effects**: session-scoped (stop persisting) or persistent across sessions?
3. **Inventory destruction (`deleteInstance`)**: keep DIR (safest, prevents dup exploits) or move to MEM with append-only delete ledger?

Everything else has a clear recommendation; flag any individual row you want to override.

## What gets touched if recommendations stand

**Memory-first refactor scope**:
- Movement: 6 sites refactored, 4 kept direct
- Pocket currency: 5 sites refactored, 3 kept direct
- Bank balance: 6 sites refactored
- Inventory location/quantity: 11 sites refactored
- Inventory create/destroy: 0 refactored (all stay direct under current recommendation)
- Fuel ticks: 2 sites refactored
- Quest step progress: 1 site refactored

Plus the cross-cutting changes:
- `AuthenticatedSocket` interface (cached state + dirty flags)
- `sessionState.ts` (new — mutation helpers)
- `characterSaveLoop.ts` (extended tick)
- `socket.ts` close handler (extended flush)
- New graceful-shutdown hook
