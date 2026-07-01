// Copy non-TS runtime assets into dist/ after `tsc`.
//
// tsc only emits compiled .js and does NOT copy data/config files. Several
// modules read these at runtime relative to their compiled location (e.g.
// progressionLoader reads dist/game/data/*.json, commandQueueConfig reads
// dist/config/commandQueue.json), so a compiled build (Docker image, `npm
// start`) breaks without them. This mirrors src/ -> dist/ for those assets.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Paths relative to both src/ and dist/. May be a file or a directory.
const assets = ['config/commandQueue.json', 'game/data'];

let copied = 0;
for (const rel of assets) {
  const from = join(serverRoot, 'src', rel);
  const to = join(serverRoot, 'dist', rel);
  if (!existsSync(from)) {
    console.warn(`[copy-assets] source missing, skipped: src/${rel}`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[copy-assets] copied ${rel}`);
  copied++;
}
console.log(`[copy-assets] done (${copied} asset path(s) copied).`);
