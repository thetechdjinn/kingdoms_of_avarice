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

async function fixSequence() {
  try {
    await pool.query(`SELECT setval('rooms_id_seq', (SELECT MAX(id) FROM rooms))`);
    console.log('Rooms sequence reset successfully');
    
    await pool.query(`SELECT setval('room_exits_id_seq', (SELECT COALESCE(MAX(id), 0) FROM room_exits))`);
    console.log('Room exits sequence reset successfully');
    
    await pool.end();
  } catch (error) {
    console.error('Failed to fix sequence:', error);
    await pool.end();
    process.exit(1);
  }
}

fixSequence();
