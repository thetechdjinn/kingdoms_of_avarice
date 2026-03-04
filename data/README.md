# Game Data

> **Status: Planned** — The data loader and JSON export pipeline have not been built yet. Currently, game data is seeded via TypeScript files in `packages/server/src/db/` (e.g., `npm run seed:arindale`).

Portable JSON data files that will populate the game database. These files are the intended distributable game content — anyone setting up a server will load these into their PostgreSQL instance.

## Planned Structure

```
data/
  _manifest.json          # Load order for all data files
  global/                 # Game-wide data (not area-specific)
    spells.json           # Spell definitions
    status_effects.json   # Status effect definitions
    actions.json          # Social action definitions
  areas/                  # Per-area content
    arindale/
      rooms.json          # Rooms with exits and features
      doors.json          # Doors, locks, triggers
      npcs.json           # NPC templates with attacks and spells
      items.json          # Item templates
      drop_tables.json    # Drop tables and entries
      factions.json       # Faction definitions
```

## Loading Data (Not Yet Implemented)

```bash
npm run load-data          # Load all data files per manifest (planned)
```

## Workflow

1. Design area in `areas/[name]/plan.md`
2. Generate or manually create content via web editors
3. Export finalized content to `data/areas/[name]/`
4. Data files are checked into git as the canonical game world
