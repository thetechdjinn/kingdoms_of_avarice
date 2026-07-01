# Database Setup

[← Back to Documentation](README.md)

Kingdoms of Avarice uses **Turso / libSQL** (the `@tursodatabase/database` engine) backed by a **local embedded SQLite file**. There is no database server to install, no Docker, no users, and no network configuration. The database is a single file on disk (default: `./data.db`).

---

## Quick Start

### 1. Configure your `.env` file (optional)

Create a `.env` file in the project root. The database path is optional and defaults to `./data.db`:

```env
# Local Turso/libSQL file. Optional — defaults to ./data.db. This is a LOCAL
# file, NOT Turso Cloud.
TURSO_PATH=./data.db

JWT_SECRET=pick-any-random-string-here
```

### 2. Run setup

```bash
npm run setup
```

This installs dependencies, builds, applies the schema, and imports game data. The database file is created automatically on first run.

That's it. There is no server to start or stop.

---

## How it works

- **Engine**: `@tursodatabase/database` (the Rust libSQL/Turso engine), a local embedded SQLite database. The connection layer lives in `packages/server/src/db/turso/index.ts` and exposes a `query` / `getClient` / `withTransaction` / `closePool` / `testConnection` surface that the repositories use unchanged.
- **Schema**: a single consolidated, idempotent script at `packages/server/src/db/turso/schema.sql` (all `CREATE TABLE IF NOT EXISTS`). Applied by `npm run migrate`.
- **Migration runner**: `packages/server/src/db/migrate.ts` applies the schema and seeds infrastructure data (roles, default `game_settings`, currency item templates).
- **Game content** (rooms, items, NPCs, spells, factions, drop tables, quests, etc.) loads separately via `npm run data:import` from the JSON files in `data/`.
- **Concurrency**: a single shared connection with WAL journaling; transactions are serialized by an in-process mutex. Foreign keys are enabled via `PRAGMA foreign_keys = ON`.

The migrate step is idempotent and skipped automatically if the database is already imported, so it is safe to re-run.

---

## First Admin Account (bootstrap)

A brand-new database has no users, so the startup migration creates the **first admin** automatically. This happens only once, when the `players` table is empty, and is a no-op on any existing database. There are two modes:

**Configured (recommended for persistent / production / docker-compose):** set both env vars and that exact admin is seeded.

```env
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=your-strong-password
```

**Zero-config (ephemeral / `docker run` with no env):** if the vars are not set, an `admin` account is created with a **random password printed to the server logs**. Look for a banner like:

```
======================================================================
  Kingdoms of Avarice - no admin configured, so one was generated:

      username: admin
      password: BXYu-HiNb-kXZ8-TKMg
  ...
======================================================================
```

In Docker, read it with `docker logs <container>`. The generated account is recreated with a new password on every fresh database, so it suits throwaway/ephemeral instances. Even if the port is exposed, the password exists only in your logs (no land-grab window, no baked-in default credential).

In both modes the bootstrap account gets the `player` + `admin` roles (it skips the pending-approval gate), so you can log in immediately. From there you can register your own account under any name and promote it via **Admin > Users**, then stop using the bootstrap account.

> Alternative: `cd packages/server && npx tsx src/db/create-admin.ts <username>` promotes an already-registered account to admin (useful for recovery or granting admin to additional users).

---

## Resetting the Database

The database is just a file, so a full reset is: delete it and re-run setup.

```bash
rm -f data.db          # delete the local database file (path = TURSO_PATH)
npm run migrate        # recreate the schema + seed infrastructure data
npm run data:import    # reimport all game content from data/
```

> Note: `data.db` is gitignored. To target a different file, set `TURSO_PATH` and delete that path instead.

---

## Troubleshooting

### "Failed locking file '.../data.db'. File is locked by another process"

- The dev server (or another process) already has the database open. Stop the running server before running migrate/import or any standalone script that opens the same file.

### Schema or "no such table" errors

- Run `npm run migrate` to (re)apply the consolidated schema. If problems persist, reset the database (see above).

### Want a clean slate

- `rm -f data.db && npm run migrate && npm run data:import`. No server, user, or permission setup is involved.

---

[← Back to Documentation](README.md)
