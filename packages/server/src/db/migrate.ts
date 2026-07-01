/**
 * Database migration runner (Turso / libSQL).
 *
 * Phase 2.4 cutover: replaces the old PostgreSQL migration runner (base schema
 * files + ~1400 lines of incremental ALTER/UPDATE migrations). The Turso schema
 * is consolidated into a single idempotent script (`turso/schema.sql`,
 * CREATE TABLE IF NOT EXISTS), generated from the post-migration Postgres state,
 * so no historical migration replay is needed.
 *
 * Responsibilities:
 *   1. Connect and apply the consolidated schema.
 *   2. Seed INFRASTRUCTURE data not covered by `npm run data:import`:
 *      roles, default game_settings, and currency item templates.
 *
 * All game CONTENT (rooms, items, npcs, spells, factions, drop tables, quests,
 * etc.) is loaded separately by `npm run data:import`. The one-time data
 * conversions the pg runner performed are no-ops here: a fresh Turso DB is
 * seeded from already-final exported data.
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root when running standalone
const envPath = join(__dirname, '..', '..', '..', '..', '.env');
dotenv.config({ path: envPath });

// Resolve the SQL dir whether running from src (tsx) or dist (compiled)
const sqlDir = __dirname.replace(/dist[\\/]db$/, 'src/db');

import { randomBytes } from 'node:crypto';
import { Role } from '@koa/shared';
import { query, getClient, testConnection } from './index.js';
import * as roleRepo from './repositories/roleRepository.js';
import * as playerRepo from './repositories/playerRepository.js';

export async function runMigrations(): Promise<void> {
  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot run migrations: database connection failed');
    return;
  }

  // 1. Apply the consolidated schema (idempotent).
  const schema = readFileSync(join(sqlDir, 'turso', 'schema.sql'), 'utf-8');
  const db = await getClient();
  await db.exec(schema);
  console.log('Database migrations completed successfully');

  // 2. Seed infrastructure data.
  await roleRepo.initializeRoles();
  console.log('Roles initialized');
  await seedGameSettings();
  await seedCurrencyTemplates();
  await seedBootstrapAdmin();
}

/**
 * Tiered first-admin bootstrap. Runs once, only when the players table is empty
 * (a fresh database), so an operator is never locked out of a new install.
 *
 *   - Configured mode: BOOTSTRAP_ADMIN_USERNAME + BOOTSTRAP_ADMIN_PASSWORD set
 *     (the docker-compose / persistent path) -> seed exactly that admin.
 *   - Zero-config mode: neither set (the `docker run` ephemeral path) -> create
 *     `admin` with a RANDOM password printed to the logs. No land-grab window
 *     and no baked-in default credential; even if the port is exposed, the
 *     secret only exists in the operator's container logs.
 *
 * Either way the account gets PLAYER + ADMIN (skipping the PENDING approval
 * gate) so the operator can log in immediately and provision their own named
 * admin via Admin > Users. On a populated DB this is a no-op.
 */
async function seedBootstrapAdmin(): Promise<void> {
  const playerCount = await playerRepo.getPlayerCount();
  if (playerCount > 0) return; // Existing install — never touch it.

  const envUser = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const envPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  // Partial config is almost certainly a mistake — warn and fall back.
  if (Boolean(envUser) !== Boolean(envPass)) {
    console.warn(
      '[Bootstrap] Both BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD are ' +
        'required to set a configured admin; only one was provided. Falling back to a generated admin.'
    );
  }

  const configured = Boolean(envUser && envPass);
  const username = configured ? (envUser as string) : 'admin';
  const password = configured ? (envPass as string) : generateAdminPassword();

  try {
    const player = await playerRepo.createPlayer({ username, password });
    // assignRole returns false (rather than throwing) on failure, so check both:
    // an admin created without the ADMIN role would lock the operator out while
    // the success banner below still prints.
    const playerOk = await roleRepo.assignRole(player.id, Role.PLAYER);
    const adminOk = await roleRepo.assignRole(player.id, Role.ADMIN);
    if (!playerOk || !adminOk) {
      console.error(
        `[Bootstrap] Created '${username}' but failed to grant roles (player=${playerOk}, admin=${adminOk}). ` +
          'Grant admin manually with: npx tsx src/db/create-admin.ts ' + username
      );
      return;
    }
  } catch (err) {
    console.error(`[Bootstrap] Failed to create the first admin account '${username}':`, err);
    return;
  }

  if (configured) {
    console.log(`[Bootstrap] Created configured admin account '${username}' from BOOTSTRAP_ADMIN_USERNAME.`);
    if (password.length < 8) {
      console.warn(
        '[Bootstrap] BOOTSTRAP_ADMIN_PASSWORD is shorter than 8 characters. ' +
          'Use a stronger password and rotate it after first login.'
      );
    }
  } else {
    printGeneratedAdminBanner(username, password);
  }
}

/** Random, readable password (unambiguous alphabet, dash-grouped) for the generated admin. */
function generateAdminPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/l/I
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if ((i + 1) % 4 === 0 && i < bytes.length - 1) out += '-';
  }
  return out; // e.g. "x7Qf-Lp9k-Rm3t-w8Hd"
}

/** Print the generated admin credentials prominently so they're visible in `docker logs`. */
function printGeneratedAdminBanner(username: string, password: string): void {
  const line = '='.repeat(70);
  console.log(
    [
      '',
      line,
      '  Kingdoms of Avarice - no admin configured, so one was generated:',
      '',
      `      username: ${username}`,
      `      password: ${password}`,
      '',
      '  Log in with these, then create your own admin account (any name) via',
      '  Admin > Users. For a persistent/production server, set the env vars',
      '  BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD instead; this',
      '  generated account is recreated with a new password on every fresh DB.',
      line,
      '',
    ].join('\n')
  );
}

/** Seed default game settings (config). Existing values are never overwritten. */
async function seedGameSettings(): Promise<void> {
  await query(`
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
      ('blind_accuracy_penalty', '10'),
      ('crit_soft_cap', '37'),
      ('xp_overcap_percent', '50')
    ON CONFLICT (key) DO NOTHING
  `);
}

/** Seed currency item templates (required for drop/get currency commands). */
async function seedCurrencyTemplates(): Promise<void> {
  const currencyTemplates = [
    { name: 'copper coins', short_desc: 'copper farthings', long_desc: "The copper farthings look like they've been around forever.", keywords: ['copper', 'coins', 'farthings', 'money', 'currency'], weight: 4, base_value: 1 },
    { name: 'silver coins', short_desc: 'silver nobles', long_desc: 'The silver nobles glitter with use.', keywords: ['silver', 'coins', 'nobles', 'money', 'currency'], weight: 4, base_value: 10 },
    { name: 'gold coins', short_desc: 'gold crowns', long_desc: 'The gold crowns are rustic and used.', keywords: ['gold', 'coins', 'crowns', 'money', 'currency'], weight: 7, base_value: 100 },
    { name: 'platinum coins', short_desc: 'platinum pieces', long_desc: 'The platinum pieces shine as though they were new.', keywords: ['platinum', 'coins', 'pieces', 'money', 'currency'], weight: 10, base_value: 1000 },
    { name: 'runic coins', short_desc: 'runic coins', long_desc: 'The runic coins glitter like nothing you have ever seen before.', keywords: ['runic', 'coins', 'money', 'currency'], weight: 25, base_value: 100000 },
  ];
  for (const ct of currencyTemplates) {
    const exists = await query('SELECT 1 FROM item_templates WHERE LOWER(name) = LOWER($1)', [ct.name]);
    if (exists.rows.length === 0) {
      await query(
        `INSERT INTO item_templates (name, short_desc, long_desc, keywords, weight, size, base_value, item_type, flags, max_stack)
         VALUES ($1, $2, $3, $4, $5, 1, $6, 'currency', '{"takeable": true, "stackable": true}', 9999999)`,
        [ct.name, ct.short_desc, ct.long_desc, JSON.stringify(ct.keywords), ct.weight, ct.base_value]
      );
    }
  }
}

/**
 * Legacy no-op. Game data is loaded via `npm run data:import`; infrastructure
 * data is seeded in runMigrations(). Kept for backward compatibility with
 * callers (e.g. server startup).
 */
export async function seedInitialData(): Promise<void> {
  // No-op.
}

/**
 * Legacy no-op. The pg runner multiplied item base_value into copper units once,
 * tracked by a flag. A fresh Turso DB is seeded from already-converted exported
 * data, so this conversion must NOT run. Kept for backward compatibility.
 */
export async function ensureCopperConversion(): Promise<void> {
  // No-op.
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
