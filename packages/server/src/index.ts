import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
const envPath = join(__dirname, '..', '..', '..', '.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn('Could not load .env file:', envPath);
}
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import { setupAuthRoutes, setDatabaseMode } from './routes/auth.js';
import { setupRoomRoutes } from './routes/rooms.js';
import { setupItemRoutes } from './routes/items.js';
import { setupGameSocket, initializeGameWorld } from './game/socket.js';
import { testConnection } from './db/index.js';
import { runMigrations, seedInitialData } from './db/migrate.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cookieParser());

setupAuthRoutes(app);
setupRoomRoutes(app);
setupItemRoutes(app);

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/game' });
setupGameSocket(wss);

async function start() {
  // Test database connection and run migrations
  const dbConnected = await testConnection();
  if (dbConnected) {
    await runMigrations();
    await seedInitialData();
    setDatabaseMode(true);
    await initializeGameWorld();
  } else {
    console.warn('Running without database - using in-memory storage');
    setDatabaseMode(false);
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);
