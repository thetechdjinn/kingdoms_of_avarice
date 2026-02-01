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

      // Run actions schema
      const actionsSchemaPath = join(sqlDir, 'schema_actions.sql');
      const actionsSchema = readFileSync(actionsSchemaPath, 'utf-8');
      await client.query(actionsSchema);

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

      // Add case-insensitive unique index on mnemonic (for existing databases)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_spells_mnemonic_lower ON spells(LOWER(mnemonic))
      `);

      // Add CHECK constraints for scaling stat columns (for existing databases)
      // Drop and recreate constraints to ensure they exist
      await client.query(`
        ALTER TABLE spells DROP CONSTRAINT IF EXISTS spells_damage_scaling_stat_check
      `);
      await client.query(`
        ALTER TABLE spells ADD CONSTRAINT spells_damage_scaling_stat_check
        CHECK (damage_scaling_stat IS NULL OR damage_scaling_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma'))
      `);
      await client.query(`
        ALTER TABLE spells DROP CONSTRAINT IF EXISTS spells_healing_scaling_stat_check
      `);
      await client.query(`
        ALTER TABLE spells ADD CONSTRAINT spells_healing_scaling_stat_check
        CHECK (healing_scaling_stat IS NULL OR healing_scaling_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma'))
      `);

      // Add base_stats column to race_definitions (for existing databases)
      await client.query(`
        ALTER TABLE race_definitions ADD COLUMN IF NOT EXISTS base_stats JSONB DEFAULT '{}'
      `);

      // Add CP system columns to characters table (for existing databases)
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS unspent_cp INTEGER DEFAULT 100
      `);
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS cp_spent JSONB DEFAULT '{}'
      `);

      // Add appearance columns to characters table (for existing databases)
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT 'male'
      `);
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS hair VARCHAR(100)
      `);
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS eye_color VARCHAR(50)
      `);

      // Update column default for existing databases that had 'neutral' as default
      await client.query(`
        ALTER TABLE characters ALTER COLUMN gender SET DEFAULT 'male'
      `);

      // Update existing characters with neutral or null gender to male
      await client.query(`
        UPDATE characters SET gender = 'male' WHERE gender IS NULL OR gender = 'neutral'
      `);

      // Add new class fields (combat_level, magic_level, etc.)
      await client.query(`
        ALTER TABLE class_definitions ADD COLUMN IF NOT EXISTS combat_level INTEGER DEFAULT 3
      `);
      await client.query(`
        ALTER TABLE class_definitions ADD COLUMN IF NOT EXISTS magic_level INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE class_definitions ADD COLUMN IF NOT EXISTS magic_school VARCHAR(50)
      `);
      await client.query(`
        ALTER TABLE class_definitions ADD COLUMN IF NOT EXISTS stealth BOOLEAN DEFAULT FALSE
      `);
      await client.query(`
        ALTER TABLE class_definitions ADD COLUMN IF NOT EXISTS special_abilities JSONB DEFAULT '[]'
      `);
      // Migrate thievery=true to special_abilities before dropping column
      // This preserves any custom classes that had thievery enabled
      // Only run if thievery column still exists (makes migration idempotent)
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'class_definitions' AND column_name = 'thievery'
          ) THEN
            UPDATE class_definitions
            SET special_abilities = special_abilities || '["lockpicking", "traps", "pickpocket"]'::jsonb
            WHERE thievery = true
            AND NOT (special_abilities @> '"lockpicking"');
          END IF;
        END $$;
      `);
      // Drop deprecated thievery column (abilities now in special_abilities)
      await client.query(`
        ALTER TABLE class_definitions DROP COLUMN IF EXISTS thievery
      `);

      // Add crit_bonus column to class_definitions (MajorMUD-style class crit bonuses)
      await client.query(`
        ALTER TABLE class_definitions ADD COLUMN IF NOT EXISTS crit_bonus INTEGER DEFAULT 0
      `);

      // Add dodge_bonus column to class_definitions (MajorMUD-style class dodge - Ninja/Mystic get 25)
      await client.query(`
        ALTER TABLE class_definitions ADD COLUMN IF NOT EXISTS dodge_bonus INTEGER DEFAULT 0
      `);

      // Add dodge_bonus column to race_definitions (MajorMUD-style race dodge - Halfling gets 10)
      await client.query(`
        ALTER TABLE race_definitions ADD COLUMN IF NOT EXISTS dodge_bonus INTEGER DEFAULT 0
      `);

      // Add terrain column to rooms (for movement speed modifiers)
      await client.query(`
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS terrain VARCHAR(20) DEFAULT 'indoor'
      `);

      // Add features column to rooms (for training rooms, portals, etc.)
      await client.query(`
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'
      `);

      // Migrate status_effect_definitions from dice notation to damage/healing ranges
      // Check if old columns exist and migrate if needed
      const oldDiceColumnsCheck = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'status_effect_definitions'
        AND column_name = 'tick_damage'
        AND data_type = 'character varying'
      `);
      if (oldDiceColumnsCheck.rows.length > 0) {
        console.log('Migrating status effect definitions from dice notation to ranges...');
        // Add new columns
        await client.query(`
          ALTER TABLE status_effect_definitions
          ADD COLUMN IF NOT EXISTS tick_damage_min INTEGER,
          ADD COLUMN IF NOT EXISTS tick_damage_max INTEGER,
          ADD COLUMN IF NOT EXISTS tick_healing_min INTEGER,
          ADD COLUMN IF NOT EXISTS tick_healing_max INTEGER
        `);
        // Convert existing dice notation to ranges (e.g., '2d6' -> min=2, max=12)
        // Dice notation 'NdM' means roll N dice with M sides each
        // min = N (all dice roll 1), max = N * M (all dice roll max)
        await client.query(`
          UPDATE status_effect_definitions
          SET tick_damage_min = NULLIF(SPLIT_PART(tick_damage, 'd', 1), '')::INTEGER,
              tick_damage_max = NULLIF(SPLIT_PART(tick_damage, 'd', 1), '')::INTEGER * NULLIF(SPLIT_PART(tick_damage, 'd', 2), '')::INTEGER
          WHERE tick_damage IS NOT NULL AND tick_damage LIKE '%d%'
        `);
        await client.query(`
          UPDATE status_effect_definitions
          SET tick_healing_min = NULLIF(SPLIT_PART(tick_healing, 'd', 1), '')::INTEGER,
              tick_healing_max = NULLIF(SPLIT_PART(tick_healing, 'd', 1), '')::INTEGER * NULLIF(SPLIT_PART(tick_healing, 'd', 2), '')::INTEGER
          WHERE tick_healing IS NOT NULL AND tick_healing LIKE '%d%'
        `);
        // Drop old columns
        await client.query(`
          ALTER TABLE status_effect_definitions
          DROP COLUMN IF EXISTS tick_damage,
          DROP COLUMN IF EXISTS tick_healing
        `);
        console.log('Status effect definitions migrated to range-based damage/healing');
      }

      // Add last_name column to characters (for existing databases)
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_name VARCHAR(50)
      `);

      // Add currency columns to characters table (for existing databases)
      // Note: gold column already exists
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS copper INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS silver INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS platinum INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS runic INTEGER DEFAULT 0
      `);

      // Migrate item_instances location_id from players.id to characters.id
      // For items with location_type 'player' or 'equipped', update location_id
      // to point to the player's first character instead of the player account

      // First, delete orphaned items belonging to players with no characters
      // These items would become inaccessible after migration
      await client.query(`
        DELETE FROM item_instances ii
        WHERE ii.location_type IN ('player', 'equipped')
          AND EXISTS (SELECT 1 FROM players p WHERE p.id = ii.location_id)
          AND NOT EXISTS (SELECT 1 FROM characters c WHERE c.player_id = ii.location_id)
      `);

      // Now migrate remaining items to the player's first character
      await client.query(`
        WITH player_first_char AS (
          SELECT DISTINCT ON (player_id) player_id, id AS character_id
          FROM characters
          ORDER BY player_id, id
        )
        UPDATE item_instances ii
        SET location_id = pfc.character_id
        FROM player_first_char pfc
        WHERE ii.location_type IN ('player', 'equipped')
          AND ii.location_id = pfc.player_id
          AND EXISTS (SELECT 1 FROM players p WHERE p.id = ii.location_id)
      `);

      // Purge old classes and races to reseed with new MajorMUD data
      // Check if we need to reseed by looking for old-style class IDs
      const oldClassCheck = await client.query(`
        SELECT COUNT(*) FROM class_definitions WHERE class_id LIKE '%_01'
      `);
      if (parseInt(oldClassCheck.rows[0].count) > 0) {
        console.log('Purging old-style class and race definitions...');
        // Delete old classes (those with _01 suffix or old IDs)
        await client.query(`DELETE FROM class_definitions`);
        // Delete old races (those with _01 suffix or old IDs)
        await client.query(`DELETE FROM race_definitions`);
        console.log('Old class and race definitions purged');
      }

      // NOTE: Old weapon speed scaling migrations removed.
      // The MajorMUD-style formula now uses a fixed 1000 base energy pool with
      // weapon cost reduction based on level and combat rating.
      // Weapon speeds should now be in the 800-2000 range (dagger ~900, greatsword ~1800).

      // Add missing door columns (for existing databases created before full door schema)
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS auto_close_seconds INTEGER DEFAULT 120
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS has_lock BOOLEAN DEFAULT FALSE
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS key_item_tag VARCHAR(100)
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS auto_lock_seconds INTEGER
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS pick_difficulty INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS bash_difficulty INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS trigger_text VARCHAR(100)
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS passage_message_self TEXT
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS passage_message_room TEXT
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS item_display_name VARCHAR(100)
      `);

      // Add temporary portal columns to doors (for existing databases)
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS spawn_trigger_text VARCHAR(100)
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS duration_seconds INTEGER
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS appear_message TEXT
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS disappear_message TEXT
      `);

      // Add constraints for temporary portal data integrity
      await client.query(`
        ALTER TABLE doors DROP CONSTRAINT IF EXISTS doors_duration_seconds_check
      `);
      await client.query(`
        ALTER TABLE doors ADD CONSTRAINT doors_duration_seconds_check
        CHECK (duration_seconds IS NULL OR duration_seconds > 0)
      `);
      await client.query(`
        ALTER TABLE doors DROP CONSTRAINT IF EXISTS temporary_portal_requires_spawn_trigger
      `);
      await client.query(`
        ALTER TABLE doors ADD CONSTRAINT temporary_portal_requires_spawn_trigger
        CHECK (is_temporary = FALSE OR spawn_trigger_text IS NOT NULL)
      `);

      // Add display_name column to doors (player-facing name separate from internal name)
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)
      `);

      // Add permission columns to doors (Phase 10 - for existing databases)
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS required_level INTEGER
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS required_classes TEXT[]
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS required_quest_flag VARCHAR(100)
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS required_item_tag VARCHAR(100)
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS denial_message TEXT
      `);

      // Add stealth_modifier column to item_templates (Stealth System Phase 6)
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS stealth_modifier INTEGER DEFAULT 0
      `);

      // Add tool_data column to item_templates (Lockpicking System Phase 5)
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS tool_data JSONB
      `);

      // Lockpicking System Phase 1: Migrate pick_difficulty to min/max range
      // First add the new columns
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS pick_difficulty_min INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS pick_difficulty_max INTEGER DEFAULT 0
      `);
      // Migrate existing pick_difficulty values to both min and max
      // (doors with old single value get that value for both, meaning skill must match exactly)
      const hasOldPickDifficulty = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'doors' AND column_name = 'pick_difficulty'
      `);
      if (hasOldPickDifficulty.rows.length > 0) {
        await client.query(`
          UPDATE doors
          SET pick_difficulty_min = pick_difficulty,
              pick_difficulty_max = pick_difficulty
          WHERE pick_difficulty_min = 0 AND pick_difficulty_max = 0 AND pick_difficulty > 0
        `);
        await client.query(`
          ALTER TABLE doors DROP COLUMN IF EXISTS pick_difficulty
        `);
      }

      // Seed default game settings (only if they don't exist)
      await client.query(`
        INSERT INTO game_settings (key, value) VALUES
          ('max_characters_per_player', '3'),
          ('ip_access_mode', '"blocklist"'),
          ('combat_base_energy', '20000'),
          ('combat_default_weapon_speed', '7500'),
          ('combat_max_attacks_per_round', '6'),
          ('combat_round_interval_ms', '4000'),
          ('combat_unarmed_speed', '4500'),
          ('combat_level_multipliers', '{"1": 0.6, "2": 0.75, "3": 0.9, "4": 1.0, "5": 1.15}'),
          ('combat_level_accuracy_bonus', '{"1": 0, "2": 10, "3": 20, "4": 35, "5": 50}'),
          ('currency_runic_name', '"runic"'),
          ('currency_copper_per_enc', '25'),
          ('currency_silver_per_enc', '25'),
          ('currency_gold_per_enc', '15'),
          ('currency_platinum_per_enc', '10'),
          ('currency_runic_per_enc', '4'),
          ('training_base_cost', '28'),
          ('training_cost_multiplier', '1.8'),
          ('initial_character_points', '100')
        ON CONFLICT (key) DO NOTHING
      `);
      // NOTE: Never update existing game_settings values - respect user configuration

      // Seed currency item templates (required for drop/get currency commands)
      // Only insert if they don't already exist
      const currencyTemplates = [
        { name: 'copper coins', short_desc: 'copper farthings', long_desc: "The copper farthings look like they've been around forever.", keywords: ['copper', 'coins', 'farthings', 'money', 'currency'], weight: 4, base_value: 1 },
        { name: 'silver coins', short_desc: 'silver nobles', long_desc: 'The silver nobles glitter with use.', keywords: ['silver', 'coins', 'nobles', 'money', 'currency'], weight: 4, base_value: 10 },
        { name: 'gold coins', short_desc: 'gold crowns', long_desc: 'The gold crowns are rustic and used.', keywords: ['gold', 'coins', 'crowns', 'money', 'currency'], weight: 7, base_value: 100 },
        { name: 'platinum coins', short_desc: 'platinum pieces', long_desc: 'The platinum pieces shine as though they were new.', keywords: ['platinum', 'coins', 'pieces', 'money', 'currency'], weight: 10, base_value: 1000 },
        { name: 'runic coins', short_desc: 'runic coins', long_desc: 'The runic coins glitter like nothing you have ever seen before.', keywords: ['runic', 'coins', 'money', 'currency'], weight: 25, base_value: 100000 },
      ];
      for (const ct of currencyTemplates) {
        const exists = await client.query('SELECT 1 FROM item_templates WHERE LOWER(name) = LOWER($1)', [ct.name]);
        if (exists.rows.length === 0) {
          await client.query(
            `INSERT INTO item_templates (name, short_desc, long_desc, keywords, weight, size, base_value, item_type, flags, max_stack)
             VALUES ($1, $2, $3, $4, $5, 1, $6, 'currency', '{"takeable": true, "stackable": true}', 9999999)`,
            [ct.name, ct.short_desc, ct.long_desc, ct.keywords, ct.weight, ct.base_value]
          );
        }
      }
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

  // Check if actions already exist
  const actionCheck = await getPool().query('SELECT COUNT(*) FROM actions');
  const actionsExist = parseInt(actionCheck.rows[0].count) > 0;

  if (actionsExist) {
    console.log('Action seed data already exists, skipping actions...');
  } else {
    await seedActions();
  }
}

async function seedRooms(): Promise<void> {

  console.log('Seeding initial room data...');

  // Insert rooms (including training hall)
  await getPool().query(`
    INSERT INTO rooms (id, name, description, area, features) VALUES
    (1, 'Town Square', 'You stand in the center of a bustling town square. A weathered stone fountain bubbles quietly in the center. Merchants hawk their wares from wooden stalls, and townsfolk hurry about their daily business.', 'Silverton', '{}'),
    (2, 'North Road', 'A cobblestone road stretches northward toward the city gates. Guards in polished armor stand watch at their posts.', 'Silverton', '{}'),
    (3, 'Merchant District', 'Colorful awnings shade the entrances to various shops. The smell of fresh bread mingles with the scent of leather and metal.', 'Silverton', '{}'),
    (4, 'Temple Steps', 'Marble steps lead up to an imposing temple dedicated to the old gods. Incense smoke drifts from within.', 'Silverton', '{}'),
    (5, 'The Rusty Blade Tavern', 'A warm glow emanates from this well-worn tavern. The sound of laughter and clinking mugs spills out into the street.', 'Silverton', '{}'),
    (6, 'City Gates', 'Massive iron-bound wooden gates mark the boundary between civilization and the wilderness beyond. A guard eyes you warily.', 'Silverton', '{}'),
    (7, 'Training Hall', 'A spacious hall with high ceilings and weapon racks lining the walls. Training dummies stand in neat rows, their surfaces showing the marks of countless practice sessions. A grizzled instructor watches newcomers with a critical eye.', 'Silverton', '{"training": {"enabled": true, "minLevel": 1, "maxLevel": 999}}')
  `);

  // Reset sequence to max id so next insert gets id 8
  await getPool().query(`SELECT setval('rooms_id_seq', (SELECT MAX(id) FROM rooms))`);

  // Insert room exits (including training hall connected to town square)
  await getPool().query(`
    INSERT INTO room_exits (from_room_id, to_room_id, direction) VALUES
    (1, 2, 'north'),
    (1, 3, 'east'),
    (1, 4, 'south'),
    (1, 5, 'west'),
    (1, 7, 'up'),
    (2, 1, 'south'),
    (2, 6, 'north'),
    (3, 1, 'west'),
    (4, 1, 'north'),
    (5, 1, 'east'),
    (6, 2, 'south'),
    (7, 1, 'down')
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

    // Normalize item names only for freshly seeded items
    await normalizeItemNames();
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
    // Uses damage/healing ranges instead of dice notation for easier scaling
    await getPool().query(`
      INSERT INTO status_effect_definitions (
        id, name, description, category, stacking_behavior, max_stacks,
        accuracy_modifier, defense_modifier, energy_modifier, damage_modifier,
        tick_damage_min, tick_damage_max, tick_healing_min, tick_healing_max,
        tick_message, silent_tick, wear_off_message,
        blocks_regen, blocks_movement, is_blind
      ) VALUES
      ('blessed', 'Blessed', 'Divine favor grants improved accuracy', 'buff', 'refresh', 1,
       10, 0, 0, 0,
       NULL, NULL, NULL, NULL,
       NULL, TRUE, 'The divine blessing fades.',
       FALSE, FALSE, FALSE),
      ('shielded', 'Shielded', 'A magical barrier provides extra protection', 'buff', 'refresh', 1,
       0, 15, 0, 0,
       NULL, NULL, NULL, NULL,
       NULL, TRUE, 'Your magical shield dissipates.',
       FALSE, FALSE, FALSE),
      ('hasted', 'Hasted', 'Magical speed increases combat energy regeneration', 'buff', 'refresh', 1,
       0, 0, 25, 0,
       NULL, NULL, NULL, NULL,
       NULL, TRUE, 'The haste spell wears off.',
       FALSE, FALSE, FALSE),
      ('empowered', 'Empowered', 'Raw magical power increases damage dealt', 'buff', 'refresh', 1,
       0, 0, 0, 20,
       NULL, NULL, NULL, NULL,
       NULL, TRUE, 'The empowerment fades.',
       FALSE, FALSE, FALSE),
      ('cursed', 'Cursed', 'A dark curse hampers combat effectiveness', 'debuff', 'refresh', 1,
       -10, -10, 0, 0,
       NULL, NULL, NULL, NULL,
       NULL, TRUE, 'The curse lifts.',
       FALSE, FALSE, FALSE),
      ('weakened', 'Weakened', 'Magical weakness reduces damage dealt', 'debuff', 'refresh', 1,
       0, 0, 0, -25,
       NULL, NULL, NULL, NULL,
       NULL, TRUE, 'Your strength returns.',
       FALSE, FALSE, FALSE),
      ('blinded', 'Blinded', 'Unable to see, suffering major accuracy penalties', 'debuff', 'refresh', 1,
       0, 0, 0, 0,
       NULL, NULL, NULL, NULL,
       NULL, TRUE, 'Your vision clears.',
       FALSE, FALSE, TRUE),
      ('poisoned', 'Poisoned', 'Venom courses through your veins', 'dot', 'refresh', 1,
       0, 0, 0, 0,
       1, 4, NULL, NULL,
       'The poison burns through your veins.', FALSE, 'The poison runs its course.',
       TRUE, FALSE, FALSE),
      ('burning', 'Burning', 'Magical flames sear your flesh', 'dot', 'refresh', 1,
       0, 0, 0, 0,
       1, 6, NULL, NULL,
       'The flames sear your flesh!', FALSE, 'The flames die out.',
       FALSE, FALSE, FALSE),
      ('regenerating', 'Regenerating', 'Healing magic mends your wounds over time', 'hot', 'refresh', 1,
       0, 0, 0, 0,
       NULL, NULL, 1, 6,
       'Healing energy flows through you.', FALSE, 'The regeneration effect fades.',
       FALSE, FALSE, FALSE),
      ('entangled', 'Entangled', 'Magical vines restrict your movement', 'control', 'refresh', 1,
       0, -5, 0, 0,
       NULL, NULL, NULL, NULL,
       'The vines tighten around you.', FALSE, 'The vines wither and release you.',
       FALSE, TRUE, FALSE)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('Status effect definitions seeded successfully');
  } catch (error) {
    console.error('Failed to seed status effect definitions:', error);
  }
}

async function seedActions(): Promise<void> {
  console.log('Seeding default action data...');

  try {
    const seedPath = join(sqlDir, 'seed_actions.sql');
    const seedSql = readFileSync(seedPath, 'utf-8');
    await getPool().query(seedSql);
    console.log('Action seed data inserted successfully');
  } catch (error) {
    console.error('Failed to seed actions:', error);
    // Don't throw - actions are optional, game can run without them
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
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
