import { defineConfig, Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for IP check results (5 second TTL to avoid hammering the backend)
const ipCheckCache = new Map<string, { allowed: boolean; timestamp: number }>();
const IP_CHECK_CACHE_TTL = 5000;

/**
 * Get client IP from request headers or socket
 */
function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstIp = forwardedValue?.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Check if IP is localhost (always allowed)
 */
function isLocalhost(ip: string): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' ||
         normalized === '127.0.0.1' || normalized.startsWith('127.') || ip === 'localhost';
}

/**
 * Check with backend if IP is allowed
 */
async function checkIpAllowed(clientIp: string): Promise<boolean> {
  // Check cache first
  const cached = ipCheckCache.get(clientIp);
  if (cached && Date.now() - cached.timestamp < IP_CHECK_CACHE_TTL) {
    return cached.allowed;
  }

  try {
    const response = await fetch(`http://localhost:3001/api/ip-check`, {
      headers: { 'X-Forwarded-For': clientIp },
    });
    const data = await response.json();
    const allowed = data.allowed === true;

    // Cache the result
    ipCheckCache.set(clientIp, { allowed, timestamp: Date.now() });
    return allowed;
  } catch (error) {
    // If backend is unavailable, fail open (allow access)
    console.warn('[Vite IP Check] Backend unavailable, allowing access');
    return true;
  }
}

// Plugin to serve additional HTML files and documentation in dev mode
function multiPagePlugin(): Plugin {
  const htmlFiles = ['editor.html', 'item-editor.html', 'spell-editor.html', 'status-editor.html', 'progression-editor.html', 'admin.html', 'docs.html', 'game-settings-editor.html', 'user-editor.html', 'swing-calculator.html', 'door-editor.html', 'action-editor.html', 'npc-editor.html', 'drop-table-editor.html', 'faction-editor.html', 'quest-editor.html', 'progression-table-editor.html'];
  const docsPath = resolve(__dirname, '..', '..', 'Documentation');

  return {
    name: 'multi-page-plugin',
    configureServer(server) {
      // IP access control middleware - runs before all other middleware
      server.middlewares.use(async (req, res, next) => {
        const clientIp = getClientIp(req);

        // Always allow localhost
        if (isLocalhost(clientIp)) {
          return next();
        }

        // Check with backend if IP is allowed
        const allowed = await checkIpAllowed(clientIp);
        if (!allowed) {
          console.log(`[Vite IP Access] Blocked: ${clientIp}`);
          res.statusCode = 403;
          res.setHeader('Content-Type', 'text/html');
          res.end('<html><body><h1>403 Forbidden</h1><p>Access denied. Your IP address is not allowed.</p></body></html>');
          return;
        }

        next();
      });

      // Multi-page and docs serving middleware
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        const urlPath = url.split('?')[0];

        // Serve documentation files from /docs/ path
        if (urlPath.startsWith('/docs/')) {
          const docFileName = urlPath.slice(6); // Remove '/docs/'
          // Validate filename - only allow alphanumeric, underscore, hyphen, and .md extension
          if (/^[a-zA-Z0-9_-]+\.md$/.test(docFileName)) {
            const docFilePath = resolve(docsPath, docFileName);
            if (fs.existsSync(docFilePath)) {
              try {
                const content = fs.readFileSync(docFilePath, 'utf-8');
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.statusCode = 200;
                res.end(content);
                return;
              } catch (e) {
                res.statusCode = 500;
                res.end('Error reading file');
                return;
              }
            }
          }
          res.statusCode = 404;
          res.end('Document not found');
          return;
        }

        // Serve HTML files
        const fileName = urlPath.slice(1);
        if (htmlFiles.includes(fileName)) {
          const filePath = resolve(__dirname, fileName);
          if (fs.existsSync(filePath)) {
            try {
              let html = fs.readFileSync(filePath, 'utf-8');
              html = await server.transformIndexHtml(url, html);
              res.setHeader('Content-Type', 'text/html');
              res.statusCode = 200;
              res.end(html);
              return;
            } catch (e) {
              return next(e);
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [multiPagePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
        itemEditor: resolve(__dirname, 'item-editor.html'),
        spellEditor: resolve(__dirname, 'spell-editor.html'),
        statusEditor: resolve(__dirname, 'status-editor.html'),
        progressionEditor: resolve(__dirname, 'progression-editor.html'),
        admin: resolve(__dirname, 'admin.html'),
        docs: resolve(__dirname, 'docs.html'),
        gameSettingsEditor: resolve(__dirname, 'game-settings-editor.html'),
        userEditor: resolve(__dirname, 'user-editor.html'),
        swingCalculator: resolve(__dirname, 'swing-calculator.html'),
        doorEditor: resolve(__dirname, 'door-editor.html'),
        actionEditor: resolve(__dirname, 'action-editor.html'),
        npcEditor: resolve(__dirname, 'npc-editor.html'),
        dropTableEditor: resolve(__dirname, 'drop-table-editor.html'),
        factionEditor: resolve(__dirname, 'faction-editor.html'),
        questEditor: resolve(__dirname, 'quest-editor.html'),
        progressionTableEditor: resolve(__dirname, 'progression-table-editor.html'),
      },
    },
  },
  appType: 'mpa', // Disable SPA fallback to index.html
  server: {
    port: 3000,
    host: true,
    allowedHosts: true, // Allow all hostnames - we have our own IP-based access control
    hmr: { overlay: false },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/game': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
