# Game Data

Portable JSON data files that populate the game database. These files are the distributable game content. Anyone setting up a new server loads these into their PostgreSQL instance via `npm run data:import`.

## Structure

```
data/
  _manifest.json              # Load order for all data files
  global/                     # Game-wide data (not area-specific)
    spells.json               # Spell definitions
    status_effects.json       # Status effect definitions
    actions.json              # Social action definitions
    items.json                # Item templates (weapons, armor, consumables, etc.)
    factions.json             # Faction definitions
    drop_tables.json          # Drop tables and entries
    progression/              # Character progression system
      classes.json            # Class definitions
      races.json              # Race definitions
      abilities.json          # Ability definitions
      talents.json            # Talent definitions
      game_events.json        # Game event definitions
      progression_table.json  # Level/XP requirements
      class_abilities.json    # Class-ability mappings
  areas/                      # Per-area content
    arindale/
      rooms.json              # Rooms with exits, features, and doors
      npcs.json               # NPC templates with attacks, spells, merchant data
    arindale_sewer/
      rooms.json
      npcs.json
    ...
```

## Commands

```bash
npm run data:export    # Export all game content from database to data/ as JSON
npm run data:import    # Import game content from data/ into database (upsert)
```

## Workflow

### For new installations

```bash
npm run setup          # Installs deps, builds, migrates, and imports all game data
```

Or manually:

```bash
npm install
npm run build:shared
npm run migrate        # Creates tables and seeds infrastructure (settings, roles)
npm run data:import    # Populates all game content from these JSON files
```

### For content creators

1. Create or modify content using the in-game editors (Room, Item, NPC, Door, etc.)
2. Balance and test in-game
3. Export finalized content: `npm run data:export`
4. Commit the updated `data/` files to git
5. These files become the canonical game world for all installations

### How export works

- **Overwrites** existing JSON files completely with current database state
- Deleted content will not appear in the export
- Groups rooms and NPCs by area into separate folders
- Converts database IDs to portable references (room tags, item names, etc.)

### How import works

- **Upserts** all data (creates new records, updates existing ones)
- Doors are synced per room (stale doors removed)
- NPC attacks and spells are fully replaced on each import
- Does NOT delete items, NPCs, or spells missing from the import
- Infrastructure data (game_settings, currency templates, roles) is handled by migrations, not import
