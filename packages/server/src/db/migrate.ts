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

      // Run quests schema (depends on npcs, item_templates, rooms, factions, characters)
      const questsSchemaPath = join(sqlDir, 'schema_quests.sql');
      const questsSchema = readFileSync(questsSchemaPath, 'utf-8');
      await client.query(questsSchema);

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

      // Add darkness_level column to rooms (luminance system)
      await client.query(`
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS darkness_level INTEGER DEFAULT 0
      `);

      // Add tag column to rooms (portable string identifier for export/import)
      await client.query(`
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tag VARCHAR(100)
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_tag ON rooms(tag) WHERE tag IS NOT NULL
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

      // Bank balance stored in copper (BIGINT for large amounts)
      // Practical JS limit: ~9 quadrillion copper (~90 billion runic) via Number.MAX_SAFE_INTEGER
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS bank_balance BIGINT NOT NULL DEFAULT 0
      `);

      // Migrate item_instances location_id from players.id to characters.id
      // For items with location_type 'player' or 'equipped', update location_id
      // to point to the player's first character instead of the player account.
      // One-time migration: uses a flag to prevent re-running on subsequent startups,
      // which would corrupt data due to player/character ID overlap.
      const itemMigrationFlag = await client.query(
        `SELECT 1 FROM game_settings WHERE key = 'item_location_migrated'`
      );
      if (itemMigrationFlag.rows.length === 0) {
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

        await client.query(
          `INSERT INTO game_settings (key, value) VALUES ('item_location_migrated', 'true') ON CONFLICT (key) DO NOTHING`
        );
      }

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
      // Note: auto_close_seconds, auto_lock_seconds, and pick_difficulty are NOT re-added here
      // because they are superseded by auto_reset_seconds and pick_difficulty_min/max below.
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS has_lock BOOLEAN DEFAULT FALSE
      `);
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS key_item_tag VARCHAR(100)
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
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS passage_message_arrival TEXT
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
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS max_level INTEGER
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

      // Add combat modifier columns to item_templates
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS stealth_modifier INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS spellcasting_modifier INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS lockpicking_modifier INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS perception_modifier INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS critical_chance_modifier INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS magic_resistance_modifier INTEGER DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS trap_modifier INTEGER DEFAULT 0
      `);

      // Add tool_data column to item_templates (Lockpicking System Phase 5)
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS tool_data JSONB
      `);

      // NPC combat stats (Phase 2: Mob Combat)
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS max_mana INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS base_accuracy INTEGER DEFAULT 50`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS base_defense INTEGER DEFAULT 50`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS base_crit_chance INTEGER DEFAULT 5`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS base_dodge INTEGER DEFAULT 5`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS damage_reduction INTEGER DEFAULT 0`);

      // NPC traits & behavior
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS traits TEXT[] DEFAULT '{}'`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS flee_enabled BOOLEAN DEFAULT FALSE`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS flee_hp_percent INTEGER DEFAULT 20`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS call_for_help_chance INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS max_active INTEGER DEFAULT 1`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS interactable BOOLEAN DEFAULT FALSE`);

      // NPC spawning & movement
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS allowed_areas TEXT[] DEFAULT '{}'`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS roam_enabled BOOLEAN DEFAULT FALSE`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS roam_interval INTEGER DEFAULT 60`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS roam_chance INTEGER DEFAULT 10`);

      // NPC loot
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS drop_table_id INTEGER`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS essence_reward INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS essence_class VARCHAR(50)`);

      // NPC corpse
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS leave_corpse BOOLEAN DEFAULT FALSE`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS corpse_duration INTEGER DEFAULT 300`);

      // NPC name augmentation
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS augmentation_enabled BOOLEAN DEFAULT FALSE`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS augmentations TEXT[] DEFAULT '{}'`);
      // Clear augmentations on templates where augmentation_enabled was false,
      // since the runtime now derives "enabled" from augmentations being non-empty.
      await client.query(`UPDATE npcs SET augmentations = '{}' WHERE augmentation_enabled = FALSE AND augmentations != '{}'`);

      // NPC room messages
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS enter_room_message TEXT`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS exit_room_message TEXT`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS spawn_message TEXT`);

      // NPC instance columns
      await client.query(`ALTER TABLE npc_instances ADD COLUMN IF NOT EXISTS current_mana INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE npc_instances ADD COLUMN IF NOT EXISTS augmentation VARCHAR(100)`);

      // Drop table: allowed_denominations column (Phase 5: Loot/Drop Table System)
      await client.query(`
        ALTER TABLE drop_table_entries ADD COLUMN IF NOT EXISTS allowed_denominations TEXT[] DEFAULT '{copper,silver,gold,platinum,runic}'
      `);

      // Phase 5: One-shot migration of drop_table_entries currency values from gold to copper.
      // Old behavior treated currency_min/currency_max as gold-coin counts.
      // New behavior treats them as copper amounts. Multiply existing non-zero values by 100.
      // Uses a game_settings flag to ensure this only runs once.
      const migrationFlag = await client.query(
        `SELECT 1 FROM game_settings WHERE key = 'drop_table_currency_migrated'`
      );
      if (migrationFlag.rows.length === 0) {
        await client.query(`
          UPDATE drop_table_entries
          SET currency_min = currency_min * 100,
              currency_max = currency_max * 100
          WHERE (currency_min > 0 OR currency_max > 0)
        `);
        await client.query(
          `INSERT INTO game_settings (key, value) VALUES ('drop_table_currency_migrated', 'true') ON CONFLICT (key) DO NOTHING`
        );
      }

      // Unified auto-reset timer: Replace auto_close_seconds + auto_lock_seconds with auto_reset_seconds
      await client.query(`
        ALTER TABLE doors ADD COLUMN IF NOT EXISTS auto_reset_seconds INTEGER DEFAULT 120
      `);
      // Migrate data only if old columns still exist (first run only)
      const hasAutoClose = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'doors' AND column_name = 'auto_close_seconds'
      `);
      if (hasAutoClose.rows.length > 0) {
        // Prefer auto_lock_seconds (if set), else use auto_close_seconds
        await client.query(`
          UPDATE doors
          SET auto_reset_seconds = COALESCE(auto_lock_seconds, auto_close_seconds)
          WHERE auto_lock_seconds IS NOT NULL OR (auto_close_seconds IS NOT NULL AND auto_close_seconds != 120)
        `);
        await client.query(`
          ALTER TABLE doors DROP COLUMN IF EXISTS auto_close_seconds
        `);
        await client.query(`
          ALTER TABLE doors DROP COLUMN IF EXISTS auto_lock_seconds
        `);
      }

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

      // Merchant System: Add rarity and max_in_world to item_templates
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS rarity VARCHAR(20) DEFAULT 'common'
      `);
      await client.query(`
        ALTER TABLE item_templates ADD COLUMN IF NOT EXISTS max_in_world INTEGER
      `);

      // Merchant System: Add merchant_enabled to npcs, create merchant_inventory
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS merchant_enabled BOOLEAN DEFAULT FALSE`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS merchant_inventory (
          id SERIAL PRIMARY KEY,
          npc_template_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
          item_template_id INTEGER NOT NULL REFERENCES item_templates(id) ON DELETE CASCADE,
          max_stock INTEGER NOT NULL DEFAULT 10,
          current_stock INTEGER NOT NULL DEFAULT 10,
          restock_chance INTEGER NOT NULL DEFAULT 100 CHECK (restock_chance >= 1 AND restock_chance <= 100),
          UNIQUE(npc_template_id, item_template_id)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_merchant_inventory_npc ON merchant_inventory(npc_template_id)`);

      // Add stock constraints (safe to re-run: checks IF NOT EXISTS via constraint name)
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchant_inventory_max_stock_check') THEN
            ALTER TABLE merchant_inventory ADD CONSTRAINT merchant_inventory_max_stock_check CHECK (max_stock >= 0);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchant_inventory_current_stock_check') THEN
            ALTER TABLE merchant_inventory ADD CONSTRAINT merchant_inventory_current_stock_check CHECK (current_stock >= 0 AND current_stock <= max_stock);
          END IF;
        END $$
      `);

      // Faction System: Create factions, npc_factions, and player_faction_reputation tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS factions (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          description TEXT,
          faction_type VARCHAR(50) NOT NULL DEFAULT 'merchant' CHECK (faction_type IN ('city', 'tribal', 'merchant', 'guild')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS npc_factions (
          id SERIAL PRIMARY KEY,
          npc_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
          faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
          UNIQUE(npc_id, faction_id)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS player_faction_reputation (
          id SERIAL PRIMARY KEY,
          character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
          reputation INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(character_id, faction_id)
        )
      `);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS primary_faction_id INTEGER REFERENCES factions(id)`);
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS proper_name BOOLEAN DEFAULT FALSE`);
      // Goran is a proper noun — set proper_name for existing installs
      await client.query(`UPDATE npcs SET proper_name = TRUE WHERE LOWER(name) IN ('goran the weaponsmith', 'goran') AND proper_name = FALSE`);
      // Fix Goran's health column (was missing from original seed)
      await client.query(`UPDATE npcs SET health = max_health WHERE LOWER(name) IN ('goran the weaponsmith', 'goran') AND health IS NULL`);
      // Rename Goran the Weaponsmith -> Goran
      await client.query(`UPDATE npcs SET name = 'goran' WHERE LOWER(name) = 'goran the weaponsmith'`);

      // Indexes for faction tables
      await client.query(`CREATE INDEX IF NOT EXISTS idx_npc_factions_npc ON npc_factions(npc_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_npc_factions_faction ON npc_factions(faction_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_player_faction_rep_character ON player_faction_reputation(character_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_player_faction_rep_faction ON player_faction_reputation(faction_id)`);

      // NPC spell casting
      await client.query(`ALTER TABLE npcs ADD COLUMN IF NOT EXISTS spell_power INTEGER DEFAULT 0`);

      // Spell saving throw fields
      await client.query(`ALTER TABLE spells ADD COLUMN IF NOT EXISTS telegraph_message TEXT`);
      await client.query(`ALTER TABLE spells ADD COLUMN IF NOT EXISTS save_stat VARCHAR(20)`);
      await client.query(`ALTER TABLE spells ADD COLUMN IF NOT EXISTS save_difficulty INTEGER DEFAULT 0`);
      await client.query(`
        ALTER TABLE spells DROP CONSTRAINT IF EXISTS spells_save_stat_check
      `);
      await client.query(`
        ALTER TABLE spells ADD CONSTRAINT spells_save_stat_check
        CHECK (save_stat IS NULL OR save_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma'))
      `);

      // NPC spell assignments (junction table linking NPCs to spells with AI parameters)
      await client.query(`
        CREATE TABLE IF NOT EXISTS npc_spells (
          id SERIAL PRIMARY KEY,
          npc_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
          spell_id INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
          priority INTEGER NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
          cast_chance INTEGER NOT NULL DEFAULT 100 CHECK (cast_chance >= 1 AND cast_chance <= 100),
          condition_type VARCHAR(50) NOT NULL DEFAULT 'any',
          condition_value INTEGER NOT NULL DEFAULT 0,
          cooldown_rounds INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_rounds >= 0),
          UNIQUE(npc_id, spell_id)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_npc_spells_npc ON npc_spells(npc_id)`);

      // Merchant Responses: keyword-triggered NPC responses for directed speech
      await client.query(`
        CREATE TABLE IF NOT EXISTS merchant_responses (
          id SERIAL PRIMARY KEY,
          npc_template_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
          trigger_keywords TEXT[] NOT NULL,
          response TEXT NOT NULL
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_merchant_responses_npc ON merchant_responses(npc_template_id)`);

      // Seed default factions
      await client.query(`
        INSERT INTO factions (name, description, faction_type) VALUES
          ('Arindale Merchants Guild', 'The trade guild of Arindale, controlling commerce in the city.', 'merchant'),
          ('Arindale City Guard', 'The city guard of Arindale, maintaining order and justice.', 'city')
        ON CONFLICT (name) DO NOTHING
      `);

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
          ('initial_character_points', '100'),
          ('blind_accuracy_penalty', '10')
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

      // One-time migration: copy characters.experience into character_progression.std_xp
      // This syncs legacy XP earned before the progression system was wired up.
      const xpMigrationFlag = await client.query(
        `SELECT 1 FROM game_settings WHERE key = 'xp_to_std_xp_migrated'`
      );
      if (xpMigrationFlag.rows.length === 0) {
        await client.query(`
          UPDATE character_progression cp
          SET std_xp = c.experience
          FROM characters c
          WHERE cp.character_id = c.id
            AND c.experience > 0
            AND cp.std_xp = 0
        `);
        await client.query(
          `INSERT INTO game_settings (key, value) VALUES ('xp_to_std_xp_migrated', 'true') ON CONFLICT (key) DO NOTHING`
        );
        console.log('Migrated characters.experience to character_progression.std_xp');
      }

      // ================================================================
      // Phase 1: Remove dead progression features (abilities, talents, events)
      // ================================================================
      const phase1Flag = await client.query(
        `SELECT 1 FROM game_settings WHERE key = 'phase1_remove_abilities_talents_events'`
      );
      if (phase1Flag.rows.length === 0) {
        // Drop tables in dependency order (children first)
        await client.query(`DROP TABLE IF EXISTS character_activity_tracker CASCADE`);
        await client.query(`DROP TABLE IF EXISTS class_abilities CASCADE`);
        await client.query(`DROP TABLE IF EXISTS talent_definitions CASCADE`);
        await client.query(`DROP TABLE IF EXISTS ability_definitions CASCADE`);
        await client.query(`DROP TABLE IF EXISTS game_events CASCADE`);

        // Drop columns from character_progression
        await client.query(`
          ALTER TABLE character_progression
          DROP COLUMN IF EXISTS learned_abilities,
          DROP COLUMN IF EXISTS unlocked_talents
        `);

        await client.query(
          `INSERT INTO game_settings (key, value) VALUES ('phase1_remove_abilities_talents_events', 'true') ON CONFLICT (key) DO NOTHING`
        );
        console.log('Phase 1: Dropped abilities, talents, events tables and columns');
      }

      // Add speed_modifier column to status_effect_definitions
      await client.query(`
        ALTER TABLE status_effect_definitions
        ADD COLUMN IF NOT EXISTS speed_modifier INTEGER DEFAULT 0
      `);

      // Remove legacy gold_min/gold_max columns from npcs (replaced by drop tables)
      await client.query(`
        ALTER TABLE npcs
        DROP COLUMN IF EXISTS gold_min,
        DROP COLUMN IF EXISTS gold_max
      `);

      // Remove mana_cost from npc_attacks (melee attacks don't cost mana; spells have their own mana_cost)
      await client.query(`
        ALTER TABLE npc_attacks
        DROP COLUMN IF EXISTS mana_cost
      `);

      // Fix npc_attacks column defaults to match repository code
      await client.query(`
        ALTER TABLE npc_attacks
          ALTER COLUMN hit_verb SET DEFAULT 'hits',
          ALTER COLUMN hit_verb_3p SET DEFAULT 'hits',
          ALTER COLUMN miss_verb SET DEFAULT 'misses',
          ALTER COLUMN miss_verb_3p SET DEFAULT 'misses'
      `);
      // Fix any existing rows that have the old defaults
      await client.query(`
        UPDATE npc_attacks SET hit_verb = 'hits' WHERE hit_verb = 'hit'
      `);
      await client.query(`
        UPDATE npc_attacks SET miss_verb = 'misses' WHERE miss_verb = 'swing at'
      `);
      await client.query(`
        UPDATE npc_attacks SET miss_verb_3p = 'misses' WHERE miss_verb_3p = 'swings at'
      `);

      // Add enabled column to npcs table
      await client.query(`
        ALTER TABLE npcs
        ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE
      `);

      // Add armor_type_restrictions to class_definitions
      await client.query(`
        ALTER TABLE class_definitions
        ADD COLUMN IF NOT EXISTS armor_type_restrictions TEXT[] DEFAULT '{}'
      `);

      // Migrate weight_class → armor_type in item_templates armor_data JSONB
      // light → leather, medium → chainmail, heavy → platemail
      await client.query(`
        UPDATE item_templates
        SET armor_data = armor_data - 'weight_class' || jsonb_build_object('armor_type',
          CASE armor_data->>'weight_class'
            WHEN 'light' THEN 'leather'
            WHEN 'medium' THEN 'chainmail'
            WHEN 'heavy' THEN 'platemail'
            ELSE armor_data->>'weight_class'
          END
        )
        WHERE armor_data IS NOT NULL AND armor_data ? 'weight_class'
      `);

      // Unify class trait system: rename special_abilities → traits, merge stealth boolean
      const hasTraitsCol = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'class_definitions' AND column_name = 'traits'
      `);
      if (hasTraitsCol.rows.length === 0) {
        // Merge stealth=true into special_abilities before renaming
        await client.query(`
          UPDATE class_definitions
          SET special_abilities = COALESCE(special_abilities, '[]'::jsonb) || '["stealth"]'::jsonb
          WHERE stealth = TRUE AND NOT (COALESCE(special_abilities, '[]'::jsonb) @> '"stealth"')
        `);

        // Rename special_abilities → traits (JSONB → TEXT[])
        // Convert JSONB array to TEXT array and create new column
        await client.query(`
          ALTER TABLE class_definitions ADD COLUMN traits TEXT[] DEFAULT '{}'
        `);
        await client.query(`
          UPDATE class_definitions
          SET traits = ARRAY(SELECT jsonb_array_elements_text(special_abilities))
          WHERE special_abilities IS NOT NULL AND special_abilities != '[]'::jsonb
        `);
        await client.query(`
          ALTER TABLE class_definitions DROP COLUMN IF EXISTS special_abilities
        `);
        await client.query(`
          ALTER TABLE class_definitions DROP COLUMN IF EXISTS stealth
        `);
      }

      // Normalize race trait IDs: picklocks → lockpicking
      await client.query(`
        UPDATE race_definitions
        SET traits = (
          SELECT jsonb_agg(
            CASE
              WHEN elem->>'id' = 'picklocks' THEN jsonb_set(elem, '{id}', '"lockpicking"')
              ELSE elem
            END
          )
          FROM jsonb_array_elements(traits::jsonb) AS elem
        )
        WHERE traits @> '[{"id": "picklocks"}]'::jsonb
      `);

      // Normalize NPC trait IDs: see-invisible → see_hidden
      await client.query(`
        UPDATE npcs
        SET traits = array_replace(traits, 'see-invisible', 'see_hidden')
        WHERE 'see-invisible' = ANY(traits)
      `);

      // Add expanded status effect modifier columns
      const expandedModifierCols = [
        'critical_chance_modifier', 'dodge_modifier', 'magic_resistance', 'healing_received',
        'perception_modifier', 'stealth_modifier', 'spellcasting_modifier', 'lockpicking_modifier',
        'strength_modifier', 'dexterity_modifier', 'constitution_modifier',
        'intelligence_modifier', 'wisdom_modifier', 'charisma_modifier',
        'max_hp_modifier', 'max_mana_modifier',
      ];
      for (const col of expandedModifierCols) {
        await client.query(`
          ALTER TABLE status_effect_definitions
          ADD COLUMN IF NOT EXISTS ${col} INTEGER DEFAULT 0
        `);
      }
      // Add expanded flag columns
      const expandedFlagCols = ['blocks_casting', 'blocks_combat', 'blocks_stealth'];
      for (const col of expandedFlagCols) {
        await client.query(`
          ALTER TABLE status_effect_definitions
          ADD COLUMN IF NOT EXISTS ${col} BOOLEAN DEFAULT FALSE
        `);
      }

      // ================================================================
      // Spell system rework: dice notation → min/max ranges
      // ================================================================
      const hasMinDamage = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'spells' AND column_name = 'min_damage'
      `);
      if (hasMinDamage.rows.length === 0) {
        // Add new columns
        await client.query(`
          ALTER TABLE spells
          ADD COLUMN min_damage INTEGER,
          ADD COLUMN max_damage INTEGER,
          ADD COLUMN min_healing INTEGER,
          ADD COLUMN max_healing INTEGER,
          ADD COLUMN hits_per_cast INTEGER NOT NULL DEFAULT 1,
          ADD COLUMN scaling_per_level DECIMAL(4,3),
          ADD COLUMN cast_difficulty INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN fizzle_message TEXT,
          ADD COLUMN hit_message_self TEXT,
          ADD COLUMN hit_message_target TEXT,
          ADD COLUMN hit_message_room TEXT
        `);

        // Migrate damage_dice → min_damage/max_damage
        // Parse "NdS+M" format: min = N + M, max = N*S + M
        // Only update rows where regex matches (skip malformed data)
        await client.query(`
          UPDATE spells
          SET min_damage = GREATEST(1,
            m[1]::int + COALESCE(m[3]::int, 0)
          ),
          max_damage = GREATEST(1,
            m[1]::int * m[2]::int + COALESCE(m[3]::int, 0)
          )
          FROM (
            SELECT id, regexp_match(damage_dice, '^(\\d+)d(\\d+)([+-]\\d+)?$') AS m
            FROM spells WHERE damage_dice IS NOT NULL
          ) AS parsed
          WHERE spells.id = parsed.id AND parsed.m IS NOT NULL
        `);

        // Migrate healing_dice → min_healing/max_healing
        await client.query(`
          UPDATE spells
          SET min_healing = GREATEST(1,
            m[1]::int + COALESCE(m[3]::int, 0)
          ),
          max_healing = GREATEST(1,
            m[1]::int * m[2]::int + COALESCE(m[3]::int, 0)
          )
          FROM (
            SELECT id, regexp_match(healing_dice, '^(\\d+)d(\\d+)([+-]\\d+)?$') AS m
            FROM spells WHERE healing_dice IS NOT NULL
          ) AS parsed
          WHERE spells.id = parsed.id AND parsed.m IS NOT NULL
        `);

        // Convert scaling factors from flat-bonus format to per-10-stat percentage
        // Old: 0.50 meant floor(stat * 0.50) flat bonus
        // New: 0.02 means 2% increase per 10 stat points
        // Approximate conversion: old_factor / 25 gives similar magnitude
        await client.query(`
          UPDATE spells
          SET damage_scaling_factor = ROUND(damage_scaling_factor / 25, 3)
          WHERE damage_scaling_factor IS NOT NULL AND damage_scaling_factor > 0
        `);
        await client.query(`
          UPDATE spells
          SET healing_scaling_factor = ROUND(healing_scaling_factor / 25, 3)
          WHERE healing_scaling_factor IS NOT NULL AND healing_scaling_factor > 0
        `);

        // Drop old columns
        await client.query(`
          ALTER TABLE spells
          DROP COLUMN IF EXISTS damage_dice,
          DROP COLUMN IF EXISTS healing_dice
        `);

        console.log('Spell system migrated: dice notation → min/max ranges');
      }

      // Add max_scaling_level column to spells (caps level scaling at a specific caster level)
      await client.query(`ALTER TABLE spells ADD COLUMN IF NOT EXISTS max_scaling_level INTEGER`);

      // Add vision_modifier column to status_effect_definitions (light & vision system)
      await client.query(`
        ALTER TABLE status_effect_definitions ADD COLUMN IF NOT EXISTS vision_modifier INTEGER DEFAULT 0
      `);

      // Add vision_level column to npcs (how well NPCs see in darkness, default 100 = normal)
      await client.query(`
        ALTER TABLE npcs ADD COLUMN IF NOT EXISTS vision_level INTEGER DEFAULT 100
      `);

      // One-time: consolidate night_vision/dark_vision → base_vision on race_definitions
      const visionMigDone = await client.query(
        `SELECT 1 FROM game_settings WHERE key = 'migration_race_base_vision' LIMIT 1`
      );
      if (visionMigDone.rows.length === 0) {
        // Map night_vision/dark_vision values to base_vision values per race
        const visionMap: Record<string, number> = {
          human: 100, half_elf: 100, halfling: 100, half_ogre: 100, kang: 100,
          elf: 150, dark_elf: 150, half_orc: 150, nekojin: 150, goblin: 150,
          dwarf: 170, gnome: 170,
          gaunt_one: 200,
        };
        for (const [raceId, value] of Object.entries(visionMap)) {
          // Remove night_vision and dark_vision traits, add base_vision if not present
          await client.query(`
            UPDATE race_definitions
            SET traits = (
              SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
              FROM jsonb_array_elements(traits::jsonb) AS elem
              WHERE elem->>'id' NOT IN ('night_vision', 'dark_vision')
            )
            WHERE race_id = $1
              AND (traits @> '[{"id": "night_vision"}]'::jsonb OR traits @> '[{"id": "dark_vision"}]'::jsonb)
          `, [raceId]);
          // Add base_vision if missing
          await client.query(`
            UPDATE race_definitions
            SET traits = traits::jsonb || $1::jsonb
            WHERE race_id = $2
              AND NOT traits::jsonb @> '[{"id": "base_vision"}]'::jsonb
          `, [JSON.stringify([{ id: 'base_vision', value }]), raceId]);
        }
        await client.query(
          `INSERT INTO game_settings (key, value) VALUES ('migration_race_base_vision', '"done"')`
        );
        console.log('  Migrated race traits: night_vision/dark_vision → base_vision');
      }

      // Add is_lit column to item_instances
      await client.query(`
        ALTER TABLE item_instances ADD COLUMN IF NOT EXISTS is_lit BOOLEAN DEFAULT FALSE
      `);

      // One-time: migrate light_data JSONB from {radius} to {vision_bonus}
      const lightMigDone = await client.query(
        `SELECT 1 FROM game_settings WHERE key = 'migration_light_vision_bonus' LIMIT 1`
      );
      if (lightMigDone.rows.length === 0) {
        // Rename radius → vision_bonus and set correct values for existing templates
        await client.query(`
          UPDATE item_templates
          SET light_data = light_data - 'radius' || jsonb_build_object('vision_bonus',
            CASE
              WHEN (light_data->>'radius')::int <= 2 THEN 100
              WHEN (light_data->>'radius')::int <= 3 THEN 175
              ELSE (light_data->>'radius')::int * 50
            END
          )
          WHERE light_data IS NOT NULL
            AND light_data ? 'radius'
            AND NOT light_data ? 'vision_bonus'
            AND jsonb_typeof(light_data->'radius') = 'number'
        `);
        await client.query(
          `INSERT INTO game_settings (key, value) VALUES ('migration_light_vision_bonus', '"done"')`
        );
        console.log('  Migrated light_data: radius → vision_bonus');
      }

      // Add initial_training_complete flag to characters
      await client.query(`
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS initial_training_complete BOOLEAN DEFAULT FALSE
      `);
      // Mark existing characters (level > 1 or cp_spent has any non-zero values) as training-complete
      await client.query(`
        UPDATE characters SET initial_training_complete = TRUE
        WHERE initial_training_complete = FALSE
          AND (level > 1 OR cp_spent != '{}'::jsonb OR unspent_cp < 100)
      `);

      // One-time: set darkness_level = -120 on underground/dark rooms
      const darknessMigDone = await client.query(
        `SELECT 1 FROM game_settings WHERE key = 'migration_room_darkness' LIMIT 1`
      );
      if (darknessMigDone.rows.length === 0) {
        await client.query(`
          UPDATE rooms SET darkness_level = -120
          WHERE darkness_level = 0
            AND (
              area IN (
                'Arindale Sewer',
                'Warrens of Filth',
                'The Iridescent Menagerie',
                'Sanctum of the Damned',
                'The Thieves Guild',
                'Hearthstead Wilds'
              )
              OR tag LIKE 'cathedral_crypt_%'
              OR tag = 'cathedral_halls_dead'
            )
            AND (terrain = 'underground' OR tag LIKE 'cathedral_crypt_%' OR tag = 'cathedral_halls_dead')
        `);
        await client.query(
          `INSERT INTO game_settings (key, value) VALUES ('migration_room_darkness', '"done"')`
        );
        console.log('  Set darkness_level = -120 on underground rooms');
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

/**
 * Convert item base_value from gold to copper (multiply by 100).
 * Must run AFTER seedInitialData so freshly seeded items also get converted.
 * Uses a game_settings flag to ensure this only runs once.
 */
export async function ensureCopperConversion(): Promise<void> {
  await withTransaction(async (client) => {
    // Atomically claim the migration via INSERT ... ON CONFLICT DO NOTHING RETURNING.
    // If we get a row back, we inserted the flag first and should run the migration.
    // If no row, another transaction already claimed it. This prevents the race where
    // two concurrent startups both read "no flag" and double-multiply values.
    const claimed = await client.query(
      `INSERT INTO game_settings (key, value) VALUES ('item_base_value_copper_migrated', 'true') ON CONFLICT (key) DO NOTHING RETURNING key`
    );
    if (claimed.rows.length === 0) return;

    await client.query(`
      UPDATE item_templates
      SET base_value = base_value * 100
      WHERE item_type != 'currency'
        AND base_value > 0
    `);
    console.log('Item base_value copper conversion completed');
  });
}

/**
 * Legacy seed function - no longer needed.
 * All game data is now managed via npm run data:export / data:import.
 * Infrastructure data (game_settings, currency templates, roles) is handled in runMigrations().
 * Kept as a no-op for backward compatibility with callers.
 */
export async function seedInitialData(): Promise<void> {
  // No-op: game data is imported via npm run data:import
}

// Legacy seed functions (seedRooms, seedItems, seedSpells, seedStatusEffectDefinitions,
// seedActions, seedNpcs, seedMerchant, normalizeItemNames) have been removed.
// All game data is now managed via npm run data:export / data:import.
// Infrastructure data (game_settings, currency templates, roles) is seeded in runMigrations().

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => ensureCopperConversion())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
