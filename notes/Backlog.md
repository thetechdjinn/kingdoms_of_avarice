# Backlog

Deferred work items with context, so decisions made under time pressure are not
lost. Ordered roughly by priority.

## 1. Authored-placement discriminator for room items (needs schema migrations first)

**Problem:** the data exporter treats every non-currency `item_instances` row
with `location_type='room'` as authored content. An ordinary item a player
dropped in a room at export time becomes a permanent placement in `data/` and
ships to every deployment. The importer likewise can only reconcile placements
by counting instances per (room, template): quantity/condition edits to an
existing authored placement are never applied, and authored vs player-dropped
instances cannot be told apart. Flagged by two external reviews and our own
audit (2026-08-01).

**Blocked on:** schema-migration machinery. `packages/server/src/db/turso/schema.sql`
is a consolidated idempotent `CREATE TABLE IF NOT EXISTS` script; there is no
mechanism to ALTER existing databases, so a new column cannot reach deployed
DBs. Design needed: versioned migration steps (e.g. a `schema_version` setting
plus ordered ALTER scripts applied by `migrate.ts`), or a `PRAGMA table_info`
column-diff applier.

**Sketch:**
- Add `authored INTEGER DEFAULT 0` (or `placement_tag TEXT`) to `item_instances`.
- Importer marks placements it creates as authored; editors could too.
- Exporter exports only authored instances; reconciliation can then match,
  update, and delete authored placements exactly (full multiset sync) without
  ever touching player drops.

**Workaround until then:** export from a quiesced/clean world. Documented in
`data/README.md` and `Documentation/Database_Setup.md`.

## 2. NPC pursuit when a player flees or leaves combat

`break`/`flee` are one-sided (2026-08-01): mobs keep their targeting until they
lose the player, at which point they give up at their next behavior tick. The
intended future behavior is that mobs chase a fleeing player instead of giving
up. Hook point is marked in `handleFlee` (`combatCommands.ts`) and the
target-left-room cleanup in `npcBehavior.ts` `processCombatBehavior`.

## 3. Boolean normalization in exported JSON

SQLite stores booleans as 0/1 and repositories pass them through raw, so
exported data files say `"playable": 1` where pg-era files said `true`.
Semantically identical through import, but noisy in diffs and a latent hazard
for any `=== true` comparison on DB values. Proper fix: repositories' row
mappers coerce known boolean columns; exporters then emit real booleans.

## 4. Currency encumbrance reads the DB row, not the pocket

`combatStats.calculateCurrencyWeight()` reads the character row, so carried-coin
weight can lag `socket.pocket` between flushes. Read-only, self-correcting, and
stats are TTL-cached; fixing it needs a socket-by-characterId lookup (does not
exist yet) or plumbing the socket through `getCombatStats`.

## 5. Merchant buy/sell: flush dirty state before payment (parity with training)

Training and death drops now call `flushPlayer()` before relative currency
writes so a dirty pocket (e.g. right after a bank withdrawal) can't produce
transiently negative persisted denominations. The merchant buy/sell flow has
the same theoretical exposure but predates the fix and was left unchanged to
limit release risk. Apply the same one-line flush there.

## 6. Repository homes for remaining pipeline SQL

`data-import.ts`/`data-export.ts` issue direct `query()` calls for
`essence_events` and `game_settings` enumeration (no repositories exist for
those shapes; `settingsRepository` exposes only typed getters). If these tables
grow server-side consumers, add repositories and move the pipeline SQL there.
(Enchantments were already moved to `craftingRepository.upsertEnchantment`.)

## 7. Training atomicity beyond the flush

Training payment is deduct → level-up → refund-on-failure. If `performLevelUp`
throws (rather than returning `success: false`) the refund is skipped —
pre-existing gap, shared with the merchant hybrid pattern. A full fix runs
payment and level-up in one transaction, which requires progression writes to
accept a transaction client.
