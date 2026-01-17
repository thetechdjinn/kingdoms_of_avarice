import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root when running standalone
const envPath = join(__dirname, '..', '..', '..', '..', '.env');
dotenv.config({ path: envPath });

// SQL files are in src/db, not dist/db
const sqlDir = __dirname.replace(/dist[\\\/]db$/, 'src/db');

import { pool as getPool, testConnection, withTransaction } from './index.js';
import * as roleRepo from './repositories/roleRepository.js';

export async function runMigrations(): Promise<void> {
  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot run migrations: database connection failed');
    return;
  }

  try {
    await withTransaction(async (client) => {
      const schemaPath = join(sqlDir, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');

      await client.query(schema);

      // Run progression schema
      const progressionSchemaPath = join(sqlDir, 'schema_progression.sql');
      const progressionSchema = readFileSync(progressionSchemaPath, 'utf-8');
      await client.query(progressionSchema);

      // Run spells schema
      const spellsSchemaPath = join(sqlDir, 'schema_spells.sql');
      const spellsSchema = readFileSync(spellsSchemaPath, 'utf-8');
      await client.query(spellsSchema);

      // Run status effect definitions schema (must be before status_effects due to FK)
      const statusEffectDefsSchemaPath = join(sqlDir, 'schema_status_effect_definitions.sql');
      const statusEffectDefsSchema = readFileSync(statusEffectDefsSchemaPath, 'utf-8');
      await client.query(statusEffectDefsSchema);

      // Run status effects schema (depends on status_effect_definitions)
      const statusEffectsSchemaPath = join(sqlDir, 'schema_status_effects.sql');
      const statusEffectsSchema = readFileSync(statusEffectsSchemaPath, 'utf-8');
      await client.query(statusEffectsSchema);

      // Add brief_mode column if it doesn't exist (for existing databases)
      await client.query(`
        ALTER TABLE players ADD COLUMN IF NOT EXISTS brief_mode BOOLEAN DEFAULT FALSE
      `);

      // Add current_room_id column if it doesn't exist (for existing databases)
      await client.query(`
        ALTER TABLE players ADD COLUMN IF NOT EXISTS current_room_id INTEGER DEFAULT 1
      `);

      // Add wisdom and charisma columns to characters table (for existing databases)
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS wisdom INTEGER NOT NULL DEFAULT 10
      `);
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS charisma INTEGER NOT NULL DEFAULT 10
      `);

      // Add max_characters column to players table (for existing databases)
      await client.query(`
        ALTER TABLE players ADD COLUMN IF NOT EXISTS max_characters INTEGER
      `);

      // Remove UNIQUE constraint from email if it exists (allow NULL and duplicates for now)
      await client.query(`
        ALTER TABLE players DROP CONSTRAINT IF EXISTS players_email_key
      `);

      // Add spell stat scaling columns (for existing databases)
      await client.query(`
        ALTER TABLE spells ADD COLUMN IF NOT EXISTS damage_scaling_stat VARCHAR(20)
      `);
      await client.query(`
        ALTER TABLE spells ADD COLUMN IF NOT EXISTS damage_scaling_factor DECIMAL(4,2)
      `);
      await client.query(`
        ALTER TABLE spells ADD COLUMN IF NOT EXISTS healing_scaling_stat VARCHAR(20)
      `);
      await client.query(`
        ALTER TABLE spells ADD COLUMN IF NOT EXISTS healing_scaling_factor DECIMAL(4,2)
      `);

      // Seed default game settings
      await client.query(`
        INSERT INTO game_settings (key, value) VALUES
          ('max_characters_per_player', '3'),
          ('ip_access_mode', '"blocklist"')
        ON CONFLICT (key) DO NOTHING
      `);
    });

    console.log('Database migrations completed successfully');

    // Initialize roles
    await roleRepo.initializeRoles();
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function seedInitialData(): Promise<void> {
  // Check if rooms already exist
  const roomCheck = await getPool().query('SELECT COUNT(*) FROM rooms');
  const roomsExist = parseInt(roomCheck.rows[0].count) > 0;
  
  if (roomsExist) {
    console.log('Room seed data already exists, skipping rooms...');
  } else {
    await seedRooms();
  }

  // Check if item templates already exist
  const itemCheck = await getPool().query('SELECT COUNT(*) FROM item_templates');
  const itemsExist = parseInt(itemCheck.rows[0].count) > 0;

  if (itemsExist) {
    console.log('Item seed data already exists, skipping items...');
  } else {
    await seedItems();
  }

  // Check if spells already exist
  const spellCheck = await getPool().query('SELECT COUNT(*) FROM spells');
  const spellsExist = parseInt(spellCheck.rows[0].count) > 0;

  if (spellsExist) {
    console.log('Spell seed data already exists, skipping spells...');
  } else {
    await seedSpells();
  }

  // Check if status effect definitions already exist
  const effectDefCheck = await getPool().query('SELECT COUNT(*) FROM status_effect_definitions');
  const effectDefsExist = parseInt(effectDefCheck.rows[0].count) > 0;

  if (effectDefsExist) {
    console.log('Status effect definitions already exist, skipping...');
  } else {
    await seedStatusEffectDefinitions();
  }
}

async function seedRooms(): Promise<void> {

  console.log('Seeding initial room data...');

  // Insert rooms
  await getPool().query(`
    INSERT INTO rooms (id, name, description, area) VALUES
    (1, 'Town Square', 'You stand in the center of a bustling town square. A weathered stone fountain bubbles quietly in the center. Merchants hawk their wares from wooden stalls, and townsfolk hurry about their daily business.', 'Silverton'),
    (2, 'North Road', 'A cobblestone road stretches northward toward the city gates. Guards in polished armor stand watch at their posts.', 'Silverton'),
    (3, 'Merchant District', 'Colorful awnings shade the entrances to various shops. The smell of fresh bread mingles with the scent of leather and metal.', 'Silverton'),
    (4, 'Temple Steps', 'Marble steps lead up to an imposing temple dedicated to the old gods. Incense smoke drifts from within.', 'Silverton'),
    (5, 'The Rusty Blade Tavern', 'A warm glow emanates from this well-worn tavern. The sound of laughter and clinking mugs spills out into the street.', 'Silverton'),
    (6, 'City Gates', 'Massive iron-bound wooden gates mark the boundary between civilization and the wilderness beyond. A guard eyes you warily.', 'Silverton')
  `);

  // Reset sequence to max id so next insert gets id 7
  await getPool().query(`SELECT setval('rooms_id_seq', (SELECT MAX(id) FROM rooms))`);

  // Insert room exits
  await getPool().query(`
    INSERT INTO room_exits (from_room_id, to_room_id, direction) VALUES
    (1, 2, 'north'),
    (1, 3, 'east'),
    (1, 4, 'south'),
    (1, 5, 'west'),
    (2, 1, 'south'),
    (2, 6, 'north'),
    (3, 1, 'west'),
    (4, 1, 'north'),
    (5, 1, 'east'),
    (6, 2, 'south')
  `);

  console.log('Room seed data inserted successfully');
}

async function seedItems(): Promise<void> {
  console.log('Seeding initial item data...');

  try {
    const seedPath = join(sqlDir, 'seed_items.sql');
    const seedSql = readFileSync(seedPath, 'utf-8');
    await getPool().query(seedSql);
    console.log('Item seed data inserted successfully');
    
    // Note: normalizeItemNames is called in the main execution chain after seeding
  } catch (error) {
    console.error('Failed to seed items:', error);
    // Don't throw - items are optional, game can run without them
  }
}

async function seedSpells(): Promise<void> {
  console.log('Seeding initial spell data...');

  try {
    const seedPath = join(sqlDir, 'seed_spells.sql');
    const seedSql = readFileSync(seedPath, 'utf-8');
    await getPool().query(seedSql);
    console.log('Spell seed data inserted successfully');
  } catch (error) {
    console.error('Failed to seed spells:', error);
    // Don't throw - spells are optional, game can run without them
  }
}

async function seedStatusEffectDefinitions(): Promise<void> {
  console.log('Seeding default status effect definitions...');

  try {
    // Seed the default status effect definitions from code registry
    await getPool().query(`
      INSERT INTO status_effect_definitions (
        id, name, description, category, stacking_behavior, max_stacks,
        accuracy_modifier, defense_modifier, energy_modifier, damage_modifier,
        tick_damage, tick_healing, tick_message, silent_tick, wear_off_message,
        blocks_regen, blocks_movement, is_blind
      ) VALUES
      ('blessed', 'Blessed', 'Divine favor grants improved accuracy', 'buff', 'refresh', 1,
       10, 0, 0, 0,
       NULL, NULL, NULL, TRUE, 'The divine blessing fades.',
       FALSE, FALSE, FALSE),
      ('shielded', 'Shielded', 'A magical barrier provides extra protection', 'buff', 'refresh', 1,
       0, 15, 0, 0,
       NULL, NULL, NULL, TRUE, 'Your magical shield dissipates.',
       FALSE, FALSE, FALSE),
      ('hasted', 'Hasted', 'Magical speed increases combat energy regeneration', 'buff', 'refresh', 1,
       0, 0, 25, 0,
       NULL, NULL, NULL, TRUE, 'The haste spell wears off.',
       FALSE, FALSE, FALSE),
      ('empowered', 'Empowered', 'Raw magical power increases damage dealt', 'buff', 'refresh', 1,
       0, 0, 0, 20,
       NULL, NULL, NULL, TRUE, 'The empowerment fades.',
       FALSE, FALSE, FALSE),
      ('cursed', 'Cursed', 'A dark curse hampers combat effectiveness', 'debuff', 'refresh', 1,
       -10, -10, 0, 0,
       NULL, NULL, NULL, TRUE, 'The curse lifts.',
       FALSE, FALSE, FALSE),
      ('weakened', 'Weakened', 'Magical weakness reduces damage dealt', 'debuff', 'refresh', 1,
       0, 0, 0, -25,
       NULL, NULL, NULL, TRUE, 'Your strength returns.',
       FALSE, FALSE, FALSE),
      ('blinded', 'Blinded', 'Unable to see, suffering major accuracy penalties', 'debuff', 'refresh', 1,
       0, 0, 0, 0,
       NULL, NULL, NULL, TRUE, 'Your vision clears.',
       FALSE, FALSE, TRUE),
      ('poisoned', 'Poisoned', 'Venom courses through your veins', 'dot', 'refresh', 1,
       0, 0, 0, 0,
       '1d4', NULL, 'The poison burns through your veins.', FALSE, 'The poison runs its course.',
       TRUE, FALSE, FALSE),
      ('burning', 'Burning', 'Magical flames sear your flesh', 'dot', 'refresh', 1,
       0, 0, 0, 0,
       '1d6', NULL, 'The flames sear your flesh!', FALSE, 'The flames die out.',
       FALSE, FALSE, FALSE),
      ('regenerating', 'Regenerating', 'Healing magic mends your wounds over time', 'hot', 'refresh', 1,
       0, 0, 0, 0,
       NULL, '1d6', 'Healing energy flows through you.', FALSE, 'The regeneration effect fades.',
       FALSE, FALSE, FALSE),
      ('entangled', 'Entangled', 'Magical vines restrict your movement', 'control', 'refresh', 1,
       0, -5, 0, 0,
       NULL, NULL, 'The vines tighten around you.', FALSE, 'The vines wither and release you.',
       FALSE, TRUE, FALSE)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('Status effect definitions seeded successfully');
  } catch (error) {
    console.error('Failed to seed status effect definitions:', error);
  }
}

async function normalizeItemNames(): Promise<void> {
  // Convert all item names to lowercase for consistency
  await getPool().query(`UPDATE item_templates SET name = LOWER(name)`);
  await getPool().query(`UPDATE item_templates SET short_desc = LOWER(short_desc)`);
  console.log('Item names normalized to lowercase');
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => seedInitialData())
    .then(() => normalizeItemNames())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
