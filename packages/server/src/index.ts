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
import { setupProgressionRoutes } from './routes/progression.js';
import { setupCharacterRoutes } from './routes/characters.js';
import { setupProfileRoutes } from './routes/profile.js';
import { setupAdminRoutes } from './routes/admin.js';
import { setupSpellRoutes } from './routes/spells.js';
import { setupStatusEffectDefinitionRoutes } from './routes/statusEffectDefinitions.js';
import { setupDoorRoutes } from './routes/doors.js';
import { setupGameSocket, initializeGameWorld } from './game/socket.js';
import { stopCharacterSaveLoop } from './game/characterSaveLoop.js';
import { testConnection } from './db/index.js';
import { runMigrations, seedInitialData } from './db/migrate.js';
import { ipAccessMiddleware } from './middleware/ipAccess.js';
import { startDnsResolver } from './services/dnsResolver.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Limit JSON payload size to prevent DOS attacks
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// IP access control middleware (runs on all API requests)
app.use('/api', ipAccessMiddleware);

// Serve documentation files
const docsPath = join(__dirname, '..', '..', '..', 'Documentation');
app.use('/docs', express.static(docsPath));

setupAuthRoutes(app);
setupRoomRoutes(app);
setupItemRoutes(app);
setupProgressionRoutes(app);
setupCharacterRoutes(app);
setupProfileRoutes(app);
setupAdminRoutes(app);
setupSpellRoutes(app);
setupStatusEffectDefinitionRoutes(app);
setupDoorRoutes(app);

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
    // Start DNS resolver for hostname-based IP access rules
    startDnsResolver();
  } else {
    console.warn('Running without database - using in-memory storage');
    setDatabaseMode(false);
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);

// Graceful shutdown handler
function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Stop periodic save loop
  stopCharacterSaveLoop();

  // Close HTTP server (stops accepting new connections)
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
