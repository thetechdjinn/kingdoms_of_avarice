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

import { pool as getPool, testConnection } from './index.js';
import * as roleRepo from './repositories/roleRepository.js';

export async function runMigrations(): Promise<void> {
  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot run migrations: database connection failed');
    return;
  }

  try {
    const schemaPath = join(sqlDir, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    await getPool().query(schema);
    
    // Add brief_mode column if it doesn't exist (for existing databases)
    await getPool().query(`
      ALTER TABLE players ADD COLUMN IF NOT EXISTS brief_mode BOOLEAN DEFAULT FALSE
    `);
    
    // Add current_room_id column if it doesn't exist (for existing databases)
    await getPool().query(`
      ALTER TABLE players ADD COLUMN IF NOT EXISTS current_room_id INTEGER DEFAULT 1
    `);
    
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
    
    // Ensure all item names are lowercase
    await normalizeItemNames();
  } catch (error) {
    console.error('Failed to seed items:', error);
    // Don't throw - items are optional, game can run without them
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
