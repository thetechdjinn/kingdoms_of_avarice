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
  EssenceEvent,
  TalentDefinition,
} from '@koa/shared';
import {
  registerClass,
  setProgressionTable,
  registerEssenceEvent,
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
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
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
 * Load all essence events
 */
export function loadEssenceEvents(): EssenceEvent[] {
  const events = loadJsonFile<EssenceEvent[]>('essence_events.json');
  for (const event of events) {
    registerEssenceEvent(event);
  }
  console.log(`[Progression] Loaded ${events.length} essence events`);
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
 * Force reseed classes and races with updated stat data
 * Uses update instead of delete+create to preserve any custom data
 */
async function forceReseedClassesAndRaces(): Promise<void> {
  try {
    // Check if classes need updating (missing wisdom/charm)
    const existingClasses = await progressionRepo.getAllClasses();
    if (existingClasses.length > 0) {
      const firstClass = existingClasses[0];
      if (firstClass.base_stats && !('wisdom' in firstClass.base_stats)) {
        console.log('[Progression] Updating classes with new stat format...');
        const seedClasses = loadJsonFile<ClassDefinition[]>('classes.json');
        const seedMap = new Map(seedClasses.map(c => [c.class_id, c]));
        
        // Update existing classes with new stats from seed data
        for (const cls of existingClasses) {
          const seedData = seedMap.get(cls.class_id);
          if (seedData?.base_stats) {
            await progressionRepo.updateClass(cls.class_id, { base_stats: seedData.base_stats });
          }
        }
        console.log(`[Progression] Updated ${existingClasses.length} classes with 6-stat format`);
      }
    }

    // Check if races need updating (missing wisdom/charm)
    const existingRaces = await progressionRepo.getAllRaces();
    if (existingRaces.length > 0) {
      const firstRace = existingRaces[0];
      if (firstRace.stat_modifiers && !('wisdom' in firstRace.stat_modifiers)) {
        console.log('[Progression] Updating races with new stat format...');
        const seedRaces = loadJsonFile<RaceDefinition[]>('races.json');
        const seedMap = new Map(seedRaces.map(r => [r.race_id, r]));
        
        // Update existing races with new stats from seed data
        for (const race of existingRaces) {
          const seedData = seedMap.get(race.race_id);
          if (seedData?.stat_modifiers) {
            await progressionRepo.updateRace(race.race_id, { stat_modifiers: seedData.stat_modifiers });
          }
        }
        console.log(`[Progression] Updated ${existingRaces.length} races with 6-stat format`);
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
    const existingEvents = await progressionRepo.getAllEssenceEvents();
    console.log(`[Progression] Found ${existingEvents.length} existing events`);
    if (existingEvents.length === 0) {
      const events = loadJsonFile<EssenceEvent[]>('essence_events.json');
      for (const event of events) {
        await progressionRepo.createEssenceEvent(event);
      }
      console.log(`[Progression] Seeded ${events.length} essence events`);
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
  loadEssenceEvents();
  loadTalents();
  
  // Force reseed if stats are outdated
  await forceReseedClassesAndRaces();
  
  // Seed database if empty
  await seedDatabaseIfEmpty();
  
  console.log('[Progression] Progression system initialized');
}
