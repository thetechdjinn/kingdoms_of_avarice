// Side-effect import: loads .env from monorepo root before any other modules.
// Must be the very first import so all modules see env vars at load time.
import './env.js';

import './utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import { setupActionRoutes } from './routes/actions.js';
import { setupDropTableRoutes } from './routes/dropTables.js';
import { setupNpcRoutes } from './routes/npcs.js';
import { setupFactionRoutes } from './routes/factions.js';
import { setupMerchantRoutes } from './routes/merchants.js';
import { setupNpcResponseRoutes } from './routes/npcResponses.js';
import { setupQuestRoutes } from './routes/quests.js';
import { setupProgressionTableRoutes } from './routes/progression-table.js';
import { setupDataExportRoutes } from './routes/dataExport.js';
import { setupSpawnRoutes } from './routes/spawns.js';
import { setupGameSocket, initializeGameWorld } from './game/socket.js';
import { stopCharacterSaveLoop, flushAllConnectedPlayers } from './game/characterSaveLoop.js';
import { stopCombatLoop } from './game/combat.js';
import { stopGameLoop } from './game/gameLoop.js';
import { stopRegenLoops } from './game/regeneration.js';
import { stopDroppedStateLoop } from './game/droppedStateManager.js';
import { stopFuelLoop } from './game/fuelManager.js';
import { stopDnsResolver } from './services/dnsResolver.js';
import { testConnection } from './db/index.js';
import { runMigrations, seedInitialData, ensureCopperConversion } from './db/migrate.js';
import { ipAccessMiddleware } from './middleware/ipAccess.js';
import { startDnsResolver } from './services/dnsResolver.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Security headers with CSP configured for game client (inline scripts, WebSocket, same-origin)
//
// HSTS is OFF by default: the container serves plain HTTP on PORT, so emitting
// Strict-Transport-Security would tell browsers to force HTTPS for this host
// (for up to a year) against a server that has no TLS, breaking access. Enable
// it only when a real HTTPS-terminating reverse proxy sits in front by setting
// TRUST_PROXY_TLS=true.
app.use(helmet({
  strictTransportSecurity: process.env.TRUST_PROXY_TLS === 'true',
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Prevent browsers and proxies from caching API responses
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Limit JSON payload size to prevent DOS attacks
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Rate limit auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// IP access control middleware (runs on all API requests)
app.use('/api', ipAccessMiddleware);

// Serve documentation files
const docsPath = join(__dirname, '..', '..', '..', 'Documentation');
app.use('/docs', express.static(docsPath));

// Serve the built client (production / single-container Docker image). In dev,
// Vite serves the client instead and this directory does not exist, so the
// guard skips it. The client uses relative URLs and window.location.host for
// the game WebSocket, so serving it same-origin from the API server Just Works.
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log(`Serving built client from ${clientDist}`);
}

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
setupActionRoutes(app);
setupDropTableRoutes(app);
setupNpcRoutes(app);
setupFactionRoutes(app);
setupMerchantRoutes(app);
setupNpcResponseRoutes(app);
setupQuestRoutes(app);
setupProgressionTableRoutes(app);
setupDataExportRoutes(app);
setupSpawnRoutes(app);

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/game' });
setupGameSocket(wss);

async function start() {
  // Test database connection and run migrations
  const dbConnected = await testConnection();
  if (dbConnected) {
    await runMigrations();
    await seedInitialData();
    await ensureCopperConversion();
    setDatabaseMode(true);
    await initializeGameWorld();
    // Start DNS resolver for hostname-based IP access rules
    startDnsResolver();
  } else {
    console.warn('Running without database - using in-memory storage');
    setDatabaseMode(false);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on 0.0.0.0:${PORT}`);
  });
}

start().catch(console.error);

// Graceful shutdown handler
let isShuttingDown = false;
async function shutdown(signal: string) {
  if (isShuttingDown) return; // ignore repeated signals
  isShuttingDown = true;
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Force exit after 10 seconds if graceful shutdown hangs
  const forceTimer = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  // Stop all game loops and services first so nothing races the final flush.
  stopCharacterSaveLoop();
  stopCombatLoop();
  stopGameLoop();
  stopRegenLoops();
  stopDroppedStateLoop();
  stopFuelLoop();
  stopDnsResolver();

  // MEMORY-FIRST: drain every connected player's dirty cached state (pocket,
  // bank, vitals, room) before exit so a clean shutdown never loses changes
  // accrued since the last save tick.
  try {
    const flushed = await flushAllConnectedPlayers();
    console.log(`[Shutdown] Flushed ${flushed} connected player(s)`);
  } catch (error) {
    console.error('[Shutdown] Error flushing connected players:', error);
  }

  // Close HTTP server (stops accepting new connections)
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
