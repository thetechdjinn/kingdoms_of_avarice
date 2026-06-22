/**
 * Database module — Turso (local embedded) backed.
 *
 * Phase 2.7 cutover: this module now delegates to the new Rust Turso engine in
 * ./turso/index.js (local file, no cloud). The historical PostgreSQL (pg)
 * implementation has been removed. The public surface
 * (query / getClient / withTransaction / closePool / testConnection) is
 * unchanged, so repositories need no changes beyond using the neutral
 * `DbClient` type for the threaded transaction client.
 */

export {
  query,
  getClient,
  withTransaction,
  closePool,
  testConnection,
} from './turso/index.js';

import type { TursoExecutor } from './turso/index.js';
export type { TursoExecutor, QueryResultLike } from './turso/index.js';

/**
 * The transaction-client type threaded through repository functions
 * (replaces the former `pg.PoolClient`). It is the Turso connection; statements
 * prepared on it during an open transaction run inside that transaction.
 */
export type DbClient = TursoExecutor;
