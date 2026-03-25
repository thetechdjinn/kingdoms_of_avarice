/**
 * Arindale City & Sewer Seed Script
 *
 * Generates ~620 rooms for the Arindale starting city, sewer, and sub-zones.
 * Run: npx tsx packages/server/src/db/seed-arindale.ts
 * Or:  npm run seed:arindale
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import { pool as getPool, withTransaction } from './index.js';
import { RoomDef, ExitDef, DoorDef, Direction } from './arindale/types.js';
import { generateGrid } from './arindale/grid.js';
import { getMarketDistrict } from './arindale/districts/market.js';
import { getCathedralDistrict } from './arindale/districts/cathedral.js';
import { getGarrisonDistrict } from './arindale/districts/garrison.js';
import { getHarborDistrict } from './arindale/districts/harbor.js';
import { getParkDistrict } from './arindale/districts/park.js';
import { getResidentialDistrict } from './arindale/districts/residential.js';
import { getWallsDistrict } from './arindale/districts/walls.js';
import { getCentralHub } from './sewer/sections/central_hub.js';
import { getNorthTunnels } from './sewer/sections/north_tunnels.js';
import { getWestTunnels } from './sewer/sections/west_tunnels.js';
import { getEastTunnels } from './sewer/sections/east_tunnels.js';
import { getSouthTunnels } from './sewer/sections/south_tunnels.js';
import { getCrossConnections } from './sewer/sections/cross_connections.js';
import { getWarrens } from './warrens/warrens.js';
import { getThievesGuild } from './thieves-guild/thieves-guild.js';
import { getIridescentMenagerie } from './menagerie/menagerie.js';
import { getSanctumOfTheDamned } from './sanctum/sanctum.js';
import { getHearthstead } from './hearthstead/hearthstead.js';

// ── Collect all data ─────────────────────────────────────────────────

function collectAll(): { rooms: RoomDef[]; exits: ExitDef[]; doors: DoorDef[] } {
  const grid = generateGrid();
  const districts = [
    getMarketDistrict(),
    getCathedralDistrict(),
    getGarrisonDistrict(),
    getHarborDistrict(),
    getParkDistrict(),
    getResidentialDistrict(),
    getWallsDistrict(),
  ];

  const sewerSections = [
    getCentralHub(),
    getNorthTunnels(),
    getWestTunnels(),
    getEastTunnels(),
    getSouthTunnels(),
    getCrossConnections(),
  ];

  const subZones = [
    getWarrens(),
    getThievesGuild(),
    getIridescentMenagerie(),
    getSanctumOfTheDamned(),
    getHearthstead(),
  ];

  const rooms = [...grid.rooms];
  const exits = [...grid.exits];
  const doors: DoorDef[] = [];

  for (const d of [...districts, ...sewerSections, ...subZones]) {
    rooms.push(...d.rooms);
    exits.push(...d.exits);
    if (d.doors) doors.push(...d.doors);
  }

  return { rooms, exits, doors };
}

// ── Validation ───────────────────────────────────────────────────────

function validate(rooms: RoomDef[], exits: ExitDef[], doors: DoorDef[]): void {
  console.log('\n=== Pre-insert validation ===');

  // Tag uniqueness
  const tags = new Set<string>();
  const dupes: string[] = [];
  for (const r of rooms) {
    if (tags.has(r.tag)) dupes.push(r.tag);
    tags.add(r.tag);
  }
  if (dupes.length > 0) {
    throw new Error(`Duplicate room tags: ${dupes.join(', ')}`);
  }
  console.log(`  Tags: ${tags.size} unique (OK)`);

  // All exit/door tags resolve
  const missingExitTags: string[] = [];
  for (const e of exits) {
    if (!tags.has(e.fromTag)) missingExitTags.push(`exit.fromTag=${e.fromTag}`);
    if (!tags.has(e.toTag)) missingExitTags.push(`exit.toTag=${e.toTag}`);
  }
  for (const d of doors) {
    if (!tags.has(d.entryTag)) missingExitTags.push(`door.entryTag=${d.entryTag}`);
    if (d.exitTag && !tags.has(d.exitTag)) missingExitTags.push(`door.exitTag=${d.exitTag}`);
    // Ensure exitTag and exitDirection are provided as a pair (both or neither)
    if ((d.exitTag && !d.exitDirection) || (!d.exitTag && d.exitDirection)) {
      throw new Error(
        `Door '${d.name}' at ${d.entryTag} has mismatched exit pair: ` +
        `exitTag=${d.exitTag ?? 'undefined'}, exitDirection=${d.exitDirection ?? 'undefined'} ` +
        `(must provide both or neither)`
      );
    }
  }
  if (missingExitTags.length > 0) {
    throw new Error(`Unresolved tags:\n  ${missingExitTags.join('\n  ')}`);
  }
  console.log(`  Exit/door tag references: all resolved (OK)`);

  // No duplicate directions per room
  const dirMap = new Map<string, Set<string>>();
  for (const e of exits) {
    if (!dirMap.has(e.fromTag)) dirMap.set(e.fromTag, new Set());
    const dirs = dirMap.get(e.fromTag)!;
    if (dirs.has(e.direction)) {
      throw new Error(`Duplicate direction '${e.direction}' from room '${e.fromTag}'`);
    }
    dirs.add(e.direction);
  }
  console.log(`  Direction uniqueness: OK`);

  // Bidirectional exit check (every A→dir→B should have B→reverse→A)
  const REVERSE: Record<Direction, Direction> = {
    north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up',
    northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest',
  };
  const exitSet = new Set(exits.map(e => `${e.fromTag}:${e.direction}:${e.toTag}`));
  const missingReverse: string[] = [];
  for (const e of exits) {
    const rev = `${e.toTag}:${REVERSE[e.direction]}:${e.fromTag}`;
    if (!exitSet.has(rev)) {
      missingReverse.push(`${e.fromTag} → ${e.direction} → ${e.toTag} (no reverse)`);
    }
  }
  if (missingReverse.length > 0) {
    console.warn(`  WARNING: ${missingReverse.length} exits missing reverse:\n    ${missingReverse.join('\n    ')}`);
  } else {
    console.log(`  Bidirectional exits: all paired (OK)`);
  }

  // Room count in expected range
  if (rooms.length < 200 || rooms.length > 800) {
    console.warn(`  WARNING: Room count ${rooms.length} outside expected range (200-800)`);
  } else {
    console.log(`  Room count: ${rooms.length} (OK)`);
  }

  // Check required features exist
  const hasRespawn = rooms.some(r => r.features && (r.features as Record<string, unknown>).respawn);
  const hasBank = rooms.some(r => r.features && (r.features as Record<string, unknown>).bank);
  const hasTraining = rooms.some(r => r.features && (r.features as Record<string, unknown>).training);
  if (!hasRespawn) throw new Error('No respawn room found');
  if (!hasBank) throw new Error('No bank room found');
  if (!hasTraining) throw new Error('No training room found');
  console.log(`  Required features: respawn, bank, training (OK)`);

  console.log(`\n  Totals: ${rooms.length} rooms, ${exits.length} exits, ${doors.length} doors\n`);
}

// ── Cleanup ──────────────────────────────────────────────────────────

async function cleanup(client: import('pg').PoolClient): Promise<void> {
  console.log('Cleaning up old data...');

  // NPCs must be deleted because they have spawn_room_id FK to rooms,
  // and rooms are renumbered on each seed run.
  // Drop tables, factions, and player reputation are NOT deleted —
  // they have no FK dependency on rooms and should survive re-seeding.
  await client.query('DELETE FROM npc_spells');
  await client.query('DELETE FROM npc_attacks');
  await client.query('DELETE FROM npc_instances');
  await client.query('DELETE FROM merchant_responses');
  await client.query('DELETE FROM merchant_inventory');
  await client.query('DELETE FROM npc_factions');
  await client.query('DELETE FROM npcs');
  await client.query('DELETE FROM doors');
  await client.query('DELETE FROM room_exits');
  // Delete room-located items only
  await client.query(`DELETE FROM item_instances WHERE location_type = 'room'`);
  await client.query('DELETE FROM rooms');

  // Reset sequences
  await client.query("SELECT setval('rooms_id_seq', 1, false)");
  await client.query("SELECT setval('room_exits_id_seq', 1, false)");
  await client.query("SELECT setval('doors_id_seq', 1, false)");
  await client.query("SELECT setval('npcs_id_seq', 1, false)");
  await client.query("SELECT setval('npc_attacks_id_seq', 1, false)");
  await client.query("SELECT setval('npc_instances_id_seq', 1, false)");

  console.log('  Old data cleaned.');
}

// ── Insert ───────────────────────────────────────────────────────────

async function insertAll(
  client: import('pg').PoolClient,
  rooms: RoomDef[],
  exits: ExitDef[],
  doors: DoorDef[]
): Promise<void> {
  console.log('Inserting Arindale + Sewer data...');

  // Bulk insert rooms and build tag→id map
  const tagToId = new Map<string, number>();

  // Insert rooms in batches of 50 for performance
  const BATCH = 50;
  for (let i = 0; i < rooms.length; i += BATCH) {
    const batch = rooms.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const r = batch[j];
      const base = j * 7;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
      values.push(
        r.name,
        r.description,
        r.area ?? 'Arindale',
        r.terrain ?? 'indoor',
        r.darkness_level ?? 0,
        JSON.stringify(r.features ?? {}),
        r.tag,
      );
    }

    const result = await client.query(
      `INSERT INTO rooms (name, description, area, terrain, darkness_level, features, tag)
       VALUES ${placeholders.join(', ')}
       RETURNING id`,
      values
    );

    for (let j = 0; j < batch.length; j++) {
      tagToId.set(batch[j].tag, result.rows[j].id);
    }
  }

  console.log(`  Inserted ${rooms.length} rooms.`);

  // Insert exits in batches
  let exitCount = 0;
  for (let i = 0; i < exits.length; i += BATCH) {
    const batch = exits.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const e = batch[j];
      const fromId = tagToId.get(e.fromTag);
      const toId = tagToId.get(e.toTag);
      if (!fromId || !toId) {
        throw new Error(`Exit tag resolution failed: ${e.fromTag} → ${e.toTag}`);
      }
      const base = j * 3;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      values.push(fromId, toId, e.direction);
    }

    await client.query(
      `INSERT INTO room_exits (from_room_id, to_room_id, direction)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    exitCount += batch.length;
  }

  console.log(`  Inserted ${exitCount} exits.`);

  // Insert doors
  for (const d of doors) {
    const entryId = tagToId.get(d.entryTag);
    const exitId = d.exitTag ? tagToId.get(d.exitTag) : null;
    if (!entryId) {
      throw new Error(`Door tag resolution failed: entryTag=${d.entryTag}`);
    }
    if (d.exitTag && !exitId) {
      throw new Error(`Door tag resolution failed: exitTag=${d.exitTag}`);
    }

    await client.query(
      `INSERT INTO doors (
        name, door_type, entry_room_id, entry_direction,
        exit_room_id, exit_direction, default_state,
        auto_reset_seconds, has_lock, key_item_tag,
        pick_difficulty_min, pick_difficulty_max, bash_difficulty,
        denial_message, required_item_tag,
        is_hidden, trigger_text, passage_message_self, passage_message_room
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        d.name,
        d.doorType,
        entryId,
        d.entryDirection,
        exitId ?? null,
        d.exitDirection ?? null,
        d.defaultState,
        d.autoResetSeconds ?? 120,
        d.hasLock ?? false,
        d.keyItemTag ?? null,
        d.pickDifficultyMin ?? 0,
        d.pickDifficultyMax ?? 0,
        d.bashDifficulty ?? 0,
        d.denialMessage ?? null,
        d.requiredItemTag ?? null,
        d.isHidden ?? false,
        d.triggerText ?? null,
        d.passageMessageSelf ?? null,
        d.passageMessageRoom ?? null,
      ]
    );
  }

  console.log(`  Inserted ${doors.length} doors.`);

  // ── Post-insert: game settings and character positions ─────────────

  // Find key rooms
  const hallsDeadId = tagToId.get('cathedral_halls_dead');
  const hearthsteadCenterId = tagToId.get('hs_hamlet_s');

  if (!hallsDeadId) throw new Error('Halls of the Dead room not found');
  if (!hearthsteadCenterId) throw new Error('Hearthstead Village Center room not found');

  // Set default respawn room (Hall of the Dead — fallback for areas without their own)
  await client.query(
    `INSERT INTO game_settings (key, value) VALUES ('default_respawn_room_id', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [String(hallsDeadId)]
  );

  // Set default starting room for new characters (Hearthstead Village Center)
  await client.query(
    `INSERT INTO game_settings (key, value) VALUES ('default_starting_room_id', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [String(hearthsteadCenterId)]
  );

  // Move all characters to Hearthstead Village Center
  await client.query('UPDATE characters SET current_room_id = $1', [hearthsteadCenterId]);
  await client.query('UPDATE players SET current_room_id = $1', [hearthsteadCenterId]);

  // Set arindale_seeded flag
  await client.query(
    `INSERT INTO game_settings (key, value) VALUES ('arindale_seeded', 'true')
     ON CONFLICT (key) DO UPDATE SET value = 'true'`
  );

  // Re-seed factions for Arindale
  await client.query(`
    INSERT INTO factions (name, description, faction_type) VALUES
      ('Arindale Merchants Guild', 'The trade guild of Arindale, controlling commerce in the city.', 'merchant'),
      ('Arindale City Guard', 'The city guard of Arindale, maintaining order and justice.', 'city')
    ON CONFLICT (name) DO NOTHING
  `);

  console.log(`  Hearthstead Village Center ID: ${hearthsteadCenterId}`);
  console.log(`  Halls of the Dead ID: ${hallsDeadId}`);
  console.log(`  All characters moved to Hearthstead Village Center.`);
  console.log(`  Default starting room set to Hearthstead Village Center.`);
  console.log(`  Default respawn set to Halls of the Dead.`);
}

// ── Post-insert verification ─────────────────────────────────────────

async function verify(client: import('pg').PoolClient): Promise<void> {
  console.log('\n=== Post-insert verification ===');

  const roomCount = await client.query('SELECT COUNT(*) FROM rooms');
  const exitCount = await client.query('SELECT COUNT(*) FROM room_exits');
  const doorCount = await client.query('SELECT COUNT(*) FROM doors');

  console.log(`  Rooms: ${roomCount.rows[0].count}`);
  console.log(`  Exits: ${exitCount.rows[0].count}`);
  console.log(`  Doors: ${doorCount.rows[0].count}`);

  // Check for orphaned exits (referencing non-existent rooms)
  const orphaned = await client.query(`
    SELECT re.id, re.from_room_id, re.to_room_id
    FROM room_exits re
    LEFT JOIN rooms r1 ON re.from_room_id = r1.id
    LEFT JOIN rooms r2 ON re.to_room_id = r2.id
    WHERE r1.id IS NULL OR r2.id IS NULL
  `);
  if (orphaned.rows.length > 0) {
    console.error(`  ERROR: ${orphaned.rows.length} orphaned exits found!`);
  } else {
    console.log(`  Orphaned exits: 0 (OK)`);
  }

  // Check for island rooms (rooms with no exits)
  const islands = await client.query(`
    SELECT r.id, r.name
    FROM rooms r
    LEFT JOIN room_exits re ON r.id = re.from_room_id
    WHERE re.id IS NULL
  `);
  if (islands.rows.length > 0) {
    console.warn(`  WARNING: ${islands.rows.length} rooms with no outgoing exits:`);
    for (const r of islands.rows) {
      console.warn(`    Room ${r.id}: ${r.name}`);
    }
  } else {
    console.log(`  Island rooms: 0 (OK)`);
  }

  // Verify features
  const respawn = await client.query(`SELECT id, name FROM rooms WHERE features->'respawn'->>'enabled' = 'true'`);
  const bank = await client.query(`SELECT id, name FROM rooms WHERE features->'bank'->>'enabled' = 'true'`);
  const training = await client.query(`SELECT id, name FROM rooms WHERE features->'training'->>'enabled' = 'true'`);

  console.log(`  Respawn rooms: ${respawn.rows.map(r => `${r.id} (${r.name})`).join(', ')}`);
  console.log(`  Bank rooms: ${bank.rows.map(r => `${r.id} (${r.name})`).join(', ')}`);
  console.log(`  Training rooms: ${training.rows.map(r => `${r.id} (${r.name})`).join(', ')}`);

  console.log('\n=== Arindale seed complete ===\n');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Safety guard: require explicit flag to run in production
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_CONFIRM) {
    console.error('ERROR: Refusing to run seed in production without SEED_CONFIRM=1');
    process.exit(1);
  }

  console.log('=== Arindale City & Sewer Seed ===\n');

  const { rooms, exits, doors } = collectAll();

  // Pre-insert validation
  validate(rooms, exits, doors);

  // Run everything in a single transaction
  await withTransaction(async (client) => {
    await cleanup(client);
    await insertAll(client, rooms, exits, doors);
    await verify(client);
  });

  const pool = getPool();
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
