import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../../.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function restore() {
  // Restore the original exits that were deleted
  const exits = [
    { from: 1, to: 2, dir: 'north' },
    { from: 1, to: 3, dir: 'east' },
    { from: 1, to: 4, dir: 'south' },
    { from: 1, to: 5, dir: 'west' },
    { from: 2, to: 1, dir: 'south' },
    { from: 2, to: 6, dir: 'north' },
    { from: 3, to: 1, dir: 'west' },
    { from: 4, to: 1, dir: 'north' },
    { from: 5, to: 1, dir: 'east' },
    { from: 6, to: 2, dir: 'south' },
  ];

  for (const exit of exits) {
    try {
      await pool.query(
        'INSERT INTO room_exits (from_room_id, to_room_id, direction) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [exit.from, exit.to, exit.dir]
      );
      console.log(`Restored exit: Room ${exit.from} -> ${exit.dir} -> Room ${exit.to}`);
    } catch (error) {
      console.error(`Failed to restore exit ${exit.from} -> ${exit.dir}:`, error);
    }
  }

  // Show final state
  const result = await pool.query('SELECT * FROM room_exits ORDER BY from_room_id, direction');
  console.log('\nFinal exits:');
  console.table(result.rows);

  await pool.end();
}

restore();
