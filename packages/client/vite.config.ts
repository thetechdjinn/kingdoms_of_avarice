import { defineConfig, Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to serve additional HTML files and documentation in dev mode
function multiPagePlugin(): Plugin {
  const htmlFiles = ['editor.html', 'item-editor.html', 'spell-editor.html', 'status-editor.html', 'progression-editor.html', 'admin.html', 'docs.html'];
  const docsPath = resolve(__dirname, '..', '..', 'Documentation');

  return {
    name: 'multi-page-plugin',
    configureServer(server) {
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
      },
    },
  },
  appType: 'mpa', // Disable SPA fallback to index.html
  server: {
    port: 3000,
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
