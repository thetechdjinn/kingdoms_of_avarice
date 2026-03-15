/**
 * Dotenv preload — must be the first import in index.ts.
 *
 * ESM hoists all static imports, so this module's top-level code runs
 * before any other module reads process.env. Loads .env from the
 * monorepo root (two levels above packages/server/).
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });
