/**
 * libSQL (Turso) database connection layer — PARALLEL to the pg module.
 *
 * Phase 2.1 of the memory-first + Turso migration. This module exposes the
 * SAME surface as `db/index.ts` (query / getClient / withTransaction /
 * closePool / testConnection) but backed by an embedded libSQL file instead of
 * PostgreSQL. The pg module is still the live one — this is stood up alongside
 * it so the two can coexist behind a feature flag during the migration. The
 * cutover (delete pg, move this to db/index.ts) happens in Phase 2.7.
 *
 * Result shape is mapped to look pg-like ({ rows, rowCount }) so that callers
 * of query()/withTransaction() do not have to change when we switch over.
 *
 * NOT YET WIRED INTO THE APP. Importing this module has no effect until the
 * Phase 2.7 cutover (or a feature-flag dispatch added in a later 2.x step).
 *
 * VERIFIED (local libSQL spike, Phase 2.1):
 *  - pg-style `$1, $2` placeholders bind correctly when given a positional
 *    `args` array (libSQL maps `$N` positionally). Repos do NOT need a
 *    placeholder rewrite. `RETURNING` works. The result mapping below is
 *    correct for SELECT (rows.length), INSERT...RETURNING (rows present,
 *    rowsAffected 0), and UPDATE/DELETE (rowsAffected).
 *
 * Still to validate in Phase 2.5/2.6:
 *  - JSONB/array operators, casts, and other pg-isms (see the 2.5 table in
 *    notes/Memory_First_And_Turso_Implementation_Plan.md).
 */

import { createClient, type Client, type Transaction, type InValue } from '@libsql/client';

let client: Client | null = null;

/**
 * Lazily create (and memoize) the libSQL client. Pragmas are fired once on
 * first use; libSQL queues them ahead of the first real query.
 */
export function getClient(): Client {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_URL ?? 'file:./data.db',
    });
    // Fire-and-forget pragmas. WAL + NORMAL is the standard embedded config;
    // foreign_keys must be enabled per-connection in SQLite.
    void client.execute('PRAGMA journal_mode = WAL');
    void client.execute('PRAGMA synchronous = NORMAL');
    void client.execute('PRAGMA foreign_keys = ON');
  }
  return client;
}

/**
 * Anything that can run a statement: the base client or an open transaction.
 * This is the libSQL analogue of pg's `PoolClient` parameter threaded through
 * the repositories for transactional work.
 */
export type TursoExecutor = Client | Transaction;

/**
 * pg.QueryResult-like shape so existing callers keep using `.rows` / `.rowCount`.
 */
export interface QueryResultLike<T> {
  rows: T[];
  rowCount: number;
  /** libSQL-only extra: rowid of the last INSERT, when available. */
  lastInsertRowid?: bigint;
}

/**
 * Run a SQL statement. Mirrors `db/index.ts` query(): optional params and an
 * optional transaction executor (the libSQL equivalent of pg's `client` param).
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
  txClient?: TursoExecutor
): Promise<QueryResultLike<T>> {
  const executor = txClient ?? getClient();
  const start = Date.now();
  const result = await executor.execute({ sql: text, args: (params ?? []) as InValue[] });
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query (libsql)', { text: text.substring(0, 50), duration, rows: result.rows.length });
  }

  return {
    rows: result.rows as unknown as T[],
    // SELECT → number of rows; INSERT/UPDATE/DELETE → affected rows.
    rowCount: result.rows.length > 0 ? result.rows.length : result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid,
  };
}

/**
 * Verify the database is reachable. Parallel to the pg testConnection().
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getClient().execute('SELECT 1');
    console.log('Database connection successful (libsql)');
    return true;
  } catch (error) {
    console.error('Database connection failed (libsql):', error);
    return false;
  }
}

/**
 * Close the libSQL client. Parallel to the pg closePool().
 */
export async function closePool(): Promise<void> {
  if (client) {
    client.close();
    client = null;
  }
}

/**
 * Execute a function within a write transaction. Mirrors `db/index.ts`
 * withTransaction(): the callback receives an executor it must thread into
 * query() calls (as the third arg) so they run inside the transaction.
 */
export async function withTransaction<T>(
  fn: (txClient: Transaction) => Promise<T>
): Promise<T> {
  const tx = await getClient().transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Ignore rollback errors to avoid masking the original error.
    }
    throw error;
  }
}
