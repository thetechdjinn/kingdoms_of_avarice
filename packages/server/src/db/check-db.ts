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

async function check() {
  const rooms = await pool.query('SELECT * FROM rooms ORDER BY id');
  console.log('ROOMS:');
  console.table(rooms.rows);
  
  const exits = await pool.query('SELECT * FROM room_exits ORDER BY from_room_id, direction');
  console.log('EXITS:');
  console.table(exits.rows);
  
  await pool.end();
}

check();
