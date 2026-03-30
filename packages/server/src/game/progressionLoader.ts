// ============================================================================
// PROGRESSION DATA LOADER
// Loads class and progression data from JSON files
// Seeds the database if tables are empty
// ============================================================================

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ClassDefinition,
  RaceDefinition,
  LevelRequirement,
} from '@koa/shared';
import {
  registerClass,
  setProgressionTable,
} from './progression.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');

/**
 * Load JSON file and parse it
 */
function loadJsonFile<T>(filename: string): T {
  const filePath = join(DATA_DIR, filename);
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load progression data from ${filename}: ${message}`);
  }
}

/**
 * Load all class definitions
 */
export function loadClasses(): ClassDefinition[] {
  const classes = loadJsonFile<ClassDefinition[]>('classes.json');
  for (const classDef of classes) {
    registerClass(classDef);
  }
  console.log(`[Progression] Loaded ${classes.length} class definitions`);
  return classes;
}

/**
 * Load the progression table
 */
export function loadProgressionTable(): LevelRequirement[] {
  const table = loadJsonFile<LevelRequirement[]>('progression_table.json');
  setProgressionTable(table);
  console.log(`[Progression] Loaded progression table with ${table.length} levels (from JSON fallback)`);
  return table;
}

/**
 * Load the progression table from the database (authoritative source).
 * Falls back to JSON file if DB is empty.
 * Used at startup after DB is ready, and by @reload progression.
 */
export async function loadProgressionTableFromDb(): Promise<LevelRequirement[]> {
  const table = await progressionRepo.getProgressionTable();
  if (table.length > 0) {
    setProgressionTable(table);
    console.log(`[Progression] Loaded progression table with ${table.length} levels (from database)`);
    return table;
  }
  // Fall back to JSON file if DB table is empty
  return loadProgressionTable();
}

/**
 * One-time migration: Update classes that have the old default combat_level (3)
 * but should have a different value according to the JSON.
 * Only updates classes still at the default - preserves user customizations.
 */
async function migrateClassCombatLevels(): Promise<void> {
  try {
    const existingClasses = await progressionRepo.getAllClasses();
    if (existingClasses.length === 0) return;

    const seedClasses = loadJsonFile<ClassDefinition[]>('classes.json');
    const seedMap = new Map(seedClasses.map(c => [c.class_id, c]));

    let updatedCount = 0;
    for (const cls of existingClasses) {
      const seedData = seedMap.get(cls.class_id);
      if (!seedData) continue;

      // Only update combat_level if class has the migration default (3) but JSON says differently
      // This preserves user customizations - only fixes combat_level, leaves other fields untouched
      if (cls.combat_level === 3 && seedData.combat_level !== 3) {
        await progressionRepo.updateClass(cls.class_id, {
          combat_level: seedData.combat_level,
        });
        console.log(`[Progression] Migrated ${cls.display_name}: combat_level ${cls.combat_level} -> ${seedData.combat_level}`);
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`[Progression] Migrated ${updatedCount} class(es) to correct combat levels`);
    }
  } catch (error) {
    console.warn('[Progression] Could not migrate class combat levels:', error);
  }
}

/**
 * Force reseed races with updated data (base_stats min/max format)
 * Uses update instead of delete+create to preserve any custom data
 */
async function forceReseedRaces(): Promise<void> {
  try {
    // Check if races need updating to new base_stats format (with min/max ranges)
    const existingRaces = await progressionRepo.getAllRaces();
    if (existingRaces.length > 0) {
      const firstRace = existingRaces[0];
      // Check if using old stat_modifiers format instead of new base_stats format
      const needsUpdate = !firstRace.base_stats ||
        !firstRace.base_stats.strength ||
        typeof firstRace.base_stats.strength !== 'object' ||
        !('min' in firstRace.base_stats.strength);

      if (needsUpdate) {
        console.log('[Progression] Updating races with new base_stats format (min/max ranges)...');
        const seedRaces = loadJsonFile<RaceDefinition[]>('races.json');
        const seedMap = new Map(seedRaces.map(r => [r.race_id, r]));

        // Update existing races with new base_stats from seed data
        for (const race of existingRaces) {
          const seedData = seedMap.get(race.race_id);
          if (seedData?.base_stats) {
            await progressionRepo.updateRace(race.race_id, {
              base_stats: seedData.base_stats,
              traits: seedData.traits,
            });
          }
        }

        // Add any new races that don't exist
        for (const seedRace of seedRaces) {
          const exists = existingRaces.some(r => r.race_id === seedRace.race_id);
          if (!exists) {
            await progressionRepo.createRace(seedRace);
            console.log(`[Progression] Added new race: ${seedRace.display_name}`);
          }
        }

        console.log(`[Progression] Updated races with base_stats min/max format`);
      }
    }
  } catch (error) {
    console.warn('[Progression] Could not force reseed:', error);
  }
}

/**
 * Seed the database with JSON data if tables are empty
 */
async function seedDatabaseIfEmpty(): Promise<void> {
  try {
    // Seed classes if empty
    const existingClasses = await progressionRepo.getAllClasses();
    console.log(`[Progression] Found ${existingClasses.length} existing classes`);
    if (existingClasses.length === 0) {
      const classes = loadJsonFile<ClassDefinition[]>('classes.json');
      for (const cls of classes) {
        await progressionRepo.createClass(cls);
      }
      console.log(`[Progression] Seeded ${classes.length} classes`);
    }
    
    // Seed races if empty
    const existingRaces = await progressionRepo.getAllRaces();
    console.log(`[Progression] Found ${existingRaces.length} existing races`);
    if (existingRaces.length === 0) {
      const races = loadJsonFile<RaceDefinition[]>('races.json');
      for (const race of races) {
        await progressionRepo.createRace(race);
      }
      console.log(`[Progression] Seeded ${races.length} races`);
    }
    
    // Seed progression table if empty
    const existingLevels = await progressionRepo.getProgressionTable();
    console.log(`[Progression] Found ${existingLevels.length} existing levels`);
    if (existingLevels.length === 0) {
      const levels = loadJsonFile<LevelRequirement[]>('progression_table.json');
      for (const level of levels) {
        await progressionRepo.setLevelRequirement(level);
      }
      console.log(`[Progression] Seeded ${levels.length} level requirements`);
    }
  } catch (error) {
    console.warn('[Progression] Could not seed database (may not be connected):', error);
  }
}

/**
 * One-time migration: Update class HP fields (hp_adj, hp_per_level_min, hp_per_level_max)
 * and race base_hp from seed data. Only updates rows still at defaults.
 */
async function migrateHpFields(): Promise<void> {
  try {
    const existingClasses = await progressionRepo.getAllClasses();
    if (existingClasses.length === 0) return;

    const seedClasses = loadJsonFile<ClassDefinition[]>('classes.json');
    const seedClassMap = new Map(seedClasses.map(c => [c.class_id, c]));

    let classUpdates = 0;
    for (const cls of existingClasses) {
      const seed = seedClassMap.get(cls.class_id);
      if (!seed) continue;
      // Only update if still at column defaults (hp_adj=0, min=4, max=7)
      if (cls.hp_adj === 0 && cls.hp_per_level_min === 4 && cls.hp_per_level_max === 7) {
        if (seed.hp_adj !== 0 || seed.hp_per_level_min !== 4 || seed.hp_per_level_max !== 7) {
          await progressionRepo.updateClass(cls.class_id, {
            hp_adj: seed.hp_adj,
            hp_per_level_min: seed.hp_per_level_min,
            hp_per_level_max: seed.hp_per_level_max,
          });
          classUpdates++;
        }
      }
    }

    const existingRaces = await progressionRepo.getAllRaces();
    const seedRaces = loadJsonFile<RaceDefinition[]>('races.json');
    const seedRaceMap = new Map(seedRaces.map(r => [r.race_id, r]));

    let raceUpdates = 0;
    for (const race of existingRaces) {
      const seed = seedRaceMap.get(race.race_id);
      if (!seed) continue;
      // Only update if still at column default (base_hp=26)
      if (race.base_hp === 26 && seed.base_hp !== undefined && seed.base_hp !== 26) {
        await progressionRepo.updateRace(race.race_id, { base_hp: seed.base_hp });
        raceUpdates++;
      }
    }

    if (classUpdates > 0 || raceUpdates > 0) {
      console.log(`[Progression] Migrated HP fields: ${classUpdates} class(es), ${raceUpdates} race(s)`);
    }
  } catch (error) {
    console.warn('[Progression] Could not migrate HP fields:', error);
  }
}

/**
 * Initialize all progression data
 */
export async function initializeProgressionData(): Promise<void> {
  console.log('[Progression] Initializing progression system...');

  // Load classes from JSON (these are static)
  loadClasses();

  // One-time migration: update class combat levels if they all have the old default value
  await migrateClassCombatLevels();

  // One-time migration: backfill HP fields from seed data
  await migrateHpFields();

  // Force reseed races if stats are outdated
  await forceReseedRaces();

  // Seed database if empty (uses JSON as seed source)
  await seedDatabaseIfEmpty();

  // Load progression table from DB (authoritative source after import).
  // Falls back to JSON file if DB table is empty.
  await loadProgressionTableFromDb();

  console.log('[Progression] Progression system initialized');
}
