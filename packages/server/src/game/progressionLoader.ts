// ============================================================================
// PROGRESSION DATA LOADER
// Loads class, event, and progression data from JSON files
// Seeds the database if tables are empty
// ============================================================================

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ClassDefinition,
  RaceDefinition,
  AbilityDefinition,
  LevelRequirement,
  GameEvent,
  TalentDefinition,
} from '@koa/shared';
import {
  registerClass,
  setProgressionTable,
  registerGameEvent,
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
  console.log(`[Progression] Loaded progression table with ${table.length} levels`);
  return table;
}

/**
 * Load all game events
 */
export function loadGameEvents(): GameEvent[] {
  const events = loadJsonFile<GameEvent[]>('game_events.json');
  for (const event of events) {
    registerGameEvent(event);
  }
  console.log(`[Progression] Loaded ${events.length} game events`);
  return events;
}

/**
 * Load all talent definitions (for future use)
 */
export function loadTalents(): TalentDefinition[] {
  const talents = loadJsonFile<TalentDefinition[]>('talents.json');
  console.log(`[Progression] Loaded ${talents.length} talent definitions`);
  return talents;
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
    
    // Seed abilities if empty
    const existingAbilities = await progressionRepo.getAllAbilities();
    console.log(`[Progression] Found ${existingAbilities.length} existing abilities`);
    if (existingAbilities.length === 0) {
      const abilities = loadJsonFile<AbilityDefinition[]>('abilities.json');
      for (const ability of abilities) {
        await progressionRepo.createAbility(ability);
      }
      console.log(`[Progression] Seeded ${abilities.length} abilities`);
    }
    
    // Seed talents if empty
    const existingTalents = await progressionRepo.getAllTalents();
    console.log(`[Progression] Found ${existingTalents.length} existing talents`);
    if (existingTalents.length === 0) {
      const talents = loadJsonFile<TalentDefinition[]>('talents.json');
      for (const talent of talents) {
        await progressionRepo.createTalent(talent);
      }
      console.log(`[Progression] Seeded ${talents.length} talents`);
    }
    
    // Seed events if empty
    const existingEvents = await progressionRepo.getAllGameEvents();
    console.log(`[Progression] Found ${existingEvents.length} existing events`);
    if (existingEvents.length === 0) {
      const events = loadJsonFile<GameEvent[]>('game_events.json');
      for (const event of events) {
        await progressionRepo.createGameEvent(event);
      }
      console.log(`[Progression] Seeded ${events.length} game events`);
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
 * Initialize all progression data
 */
export async function initializeProgressionData(): Promise<void> {
  console.log('[Progression] Initializing progression system...');
  
  // Load into in-memory service
  loadClasses();
  loadProgressionTable();
  loadGameEvents();
  // Note: Talents are DB-only for now, no in-memory registration needed
  
  // Force reseed if stats are outdated
  await forceReseedRaces();
  
  // Seed database if empty
  await seedDatabaseIfEmpty();
  
  console.log('[Progression] Progression system initialized');
}
