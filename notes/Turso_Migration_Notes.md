# Turso / libSQL Migration Notes

Reference for if and when a PostgreSQL → Turso migration is undertaken. The findings below come from prototype testing against `@libsql/client` with local file-backed databases. The prototypes themselves are not preserved — only the verified conclusions.

## Verified compatibility

The following PostgreSQL features work in libSQL with no rewriting:

- `RETURNING` on INSERT / UPDATE / DELETE
- `ON CONFLICT (col) DO UPDATE SET col = excluded.col` (use `excluded.` not `EXCLUDED.`)
- CTEs, partial indexes, CHECK constraints, foreign keys (requires `PRAGMA foreign_keys = ON`)
- Window functions (`ROW_NUMBER() OVER (PARTITION BY …)`)
- **Positional placeholders `$1`, `$2`, `$3`** — libSQL accepts these alongside `?` and `:name`. Existing pg-style queries can run as-is.

## Required rewrites

### `@>` containment on JSON columns — does not exist

libSQL has no `@>` operator. Substitute:

```sql
-- Postgres:
WHERE special_abilities @> '"lockpicking"'

-- libSQL:
WHERE EXISTS (
  SELECT 1 FROM json_each(special_abilities) WHERE value = 'lockpicking'
)
```

For object-array containment:

```sql
-- Postgres:
WHERE traits @> '[{"id":"night_vision"}]'

-- libSQL:
WHERE EXISTS (
  SELECT 1 FROM json_each(traits)
  WHERE json_extract(value, '$.id') = 'night_vision'
)
```

Affected lines in current `migrate.ts`: 190, 905, 938, 1098, 1105.

### `||` for JSON merge — does not exist (it's string concat)

In libSQL, `||` is plain string concatenation. JSON merge requires explicit functions.

| Pattern | PostgreSQL | libSQL |
|---|---|---|
| Object merge | `data \|\| patch` | `json_patch(data, patch)` |
| Remove key + merge | `data - 'k' \|\| patch` | `json_patch(json_remove(data, '$.k'), patch)` |
| Array concat | `arr \|\| '[…]'::jsonb` | `json_each` + `json_group_array` subquery |

Affected lines: 188, 904, 1103, 1127.

### Function renames

Verified one-to-one substitutes:

| PostgreSQL | libSQL |
|---|---|
| `SPLIT_PART(s, 'd', n)` | `substr` + `instr` |
| `DISTINCT ON (col)` | `ROW_NUMBER() OVER (PARTITION BY col)` |
| `jsonb_array_elements_text(col)` | `json_each(col)` |
| `jsonb_build_object(k, v, …)` | `json_object(k, v, …)` |
| `jsonb_agg(x)` | `json_group_array(x)` |
| `jsonb_set(j, '{a}', v)` | `json_set(j, '$.a', v)` — note path syntax differs |

## Schema concerns

- **JSONB columns**: store as TEXT (or BLOB via `jsonb()`). All JSON operators work on TEXT.
- **TEXT[] columns**: store as JSON text and query with `json_each`. Native ARRAY type only exists in the newer Rust Turso Database product (different SDK), not the libSQL fork.
- **TIMESTAMP / TIMESTAMPTZ**: store as ISO 8601 TEXT or INTEGER epoch. SQLite has no timezone-aware type — handle TZ at the application layer.
- **PL/pgSQL trigger** at `schema_status_effect_definitions.sql:73-85` (auto-update `updated_at`): rewrite as a plain SQLite trigger.
- **GIN indexes**: not supported. Replace with expression indexes on `json_extract` for hot paths.

## Concurrency configuration

Required at connection time on every connection:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

Without WAL, throughput is ~40 writes/sec under contention. With WAL, ~230–280 writes/sec.

Given the memory-first architecture direction (see [[Memory_First_Architecture]]), this ceiling is not a practical concern — actual sustained DB write rate during gameplay should stay well under 50/sec.

## Driver swap

- `pg.Pool` → `@libsql/client` `createClient({ url, authToken? })`
- `pg.PoolClient` callback in `withTransaction` → libSQL's `db.transaction()` API has a different shape; the wrapper in `db/index.ts:67` needs reshaping but its callers (which receive a `client` they pass to `query()`) can keep their signatures if the wrapper translates.
- Placeholder syntax: keep `$1, $2, $3` — libSQL accepts it.

## Still unverified

- **`BEGIN CONCURRENT` / MVCC mode**: only available in the newer Rust "Turso Database" product, accessed via a different SDK than `@libsql/client`. Not needed given memory-first direction, but worth knowing it exists if write contention ever becomes a real concern.
- **Embedded replicas**: documented but not tested. Could be useful for local dev (one file) vs. production (managed Turso Cloud).

## Phase 2.1 spike findings (verified against @libsql/client 0.17.4)

Ran a local file-based libSQL spike to retire the biggest feared risk before
the repo audit:

- **pg-style `$1, $2` placeholders bind correctly with a positional `args`
  array.** Both `?` and `$1`/`$2` returned correct rows. libSQL maps `$N`
  positionally, so the ~22 repositories do **NOT** need a placeholder rewrite.
  This was the single largest potential blocker; it is a non-issue.
- **`RETURNING` works** (`INSERT ... RETURNING id` → `[{id:3}]`). Note
  `rowsAffected` is `0` and `lastInsertRowid` is `undefined` when RETURNING is
  used — fine, callers read the returned row.
- **Result-shape mapping confirmed** for the pg-like wrapper in
  `db/turso/index.ts`: SELECT → `rows.length`; INSERT…RETURNING → rows present;
  UPDATE/DELETE → `rowsAffected` (rows empty). The `rowCount` mapping
  (`rows.length > 0 ? rows.length : rowsAffected`) covers all three.

Net effect: Phase 2 is "swap the driver + translate JSONB/array/cast pg-isms,"
not a mechanical rewrite of every query.

## Bottom line

The migration is feasible. The two genuine gotchas are the `@>` and `||` rewrites in `migrate.ts`; everything else is either a one-line function rename or a free pass.

Related: [[Memory_First_Architecture]] — the architectural direction that makes the choice of DB engine largely orthogonal.
