/**
 * Turso (local embedded) database connection layer — PARALLEL to the pg module.
 *
 * Phase 2 of the memory-first + Turso migration. Backed by the new Rust Turso
 * engine via `@tursodatabase/database`, running on a LOCAL embedded file
 * (default `./data.db`). This is local-only — there is no Turso Cloud / remote
 * URL here by design.
 *
 * Exposes the SAME surface as `db/index.ts` (query / getClient / withTransaction
 * / closePool / testConnection) with a pg-like result shape ({ rows, rowCount })
 * so callers of query()/withTransaction() do not change at cutover (Phase 2.7).
 *
 * VERIFIED against @tursodatabase/database 0.6.1:
 *  - pg-style `$1, $2` placeholders bind positionally with spread args.
 *  - `RETURNING` works; `.reader` distinguishes row-returning statements from
 *    write-only ones (used to map rowCount correctly).
 *  - json1 (`->>`, `json_each`, `json_extract`, `json_patch`), AUTOINCREMENT,
 *    triggers, partial/expression indexes, and ON CONFLICT/excluded all work.
 *  - Known gap: `ORDER BY` inside aggregate functions is not supported yet, so
 *    repository queries must avoid `json_group_array(... ORDER BY ...)`.
 *
 * CONCURRENCY MODEL: a single shared connection. `withTransaction` serializes
 * transactions against each other with an in-process mutex so a BEGIN..COMMIT
 * block is never interleaved with another transaction. Non-transactional
 * `query()` calls run directly (the driver serializes individual statements).
 * This is sufficient because the memory-first refactor (Phase 1) made gameplay
 * DB writes infrequent and batched; contention is minimal for a local dev DB.
 */

import { connect, type Database } from '@tursodatabase/database';

let dbPromise: Promise<Database> | null = null;

/**
 * Lazily open (and memoize) the local Turso database connection.
 * Path is a LOCAL FILE — `TURSO_PATH` env or `./data.db`. Never a cloud URL.
 */
export function getClient(): Promise<Database> {
  if (!dbPromise) {
    const path = process.env.TURSO_PATH ?? './data.db';
    dbPromise = (async () => {
      const db = await connect(path);
      await db.exec('PRAGMA journal_mode = WAL');
      await db.exec('PRAGMA foreign_keys = ON');
      return db;
    })();
  }
  return dbPromise;
}

/**
 * The threaded transaction client is just the (single) connection: statements
 * prepared on it during an open BEGIN..COMMIT run inside that transaction.
 */
export type TursoExecutor = Database;

/** pg.QueryResult-like shape so existing callers keep using `.rows` / `.rowCount`. */
export interface QueryResultLike<T> {
  rows: T[];
  rowCount: number;
  lastInsertRowid?: number | bigint;
}

// In-process mutex used to keep transactions from overlapping on the shared
// connection. Resolves in FIFO order.
let txLock: Promise<unknown> = Promise.resolve();
function withTxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = txLock.then(fn, fn);
  // Keep the chain alive regardless of success/failure, without leaking rejections.
  txLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function execOn<T>(db: Database, text: string, params?: unknown[]): Promise<QueryResultLike<T>> {
  const stmt = await db.prepare(text);
  const args = (params ?? []) as unknown[];
  if (stmt.reader) {
    const rows = (await stmt.all(...args)) as T[];
    return { rows, rowCount: rows.length };
  }
  const info = await stmt.run(...args);
  return { rows: [], rowCount: info.changes ?? 0, lastInsertRowid: info.lastInsertRowid };
}

/**
 * Run a SQL statement. Mirrors `db/index.ts` query(): optional params and an
 * optional transaction executor (third arg). When a `txClient` is supplied the
 * statement runs directly on it (already inside the caller's transaction and
 * lock); otherwise it runs on the shared connection.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
  txClient?: TursoExecutor
): Promise<QueryResultLike<T>> {
  const start = Date.now();
  const result = txClient
    ? await execOn<T>(txClient, text, params)
    : await execOn<T>(await getClient(), text, params);

  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query (turso)', { text: text.substring(0, 50), duration: Date.now() - start, rows: result.rowCount });
  }
  return result;
}

/** Verify the database is reachable. Parallel to the pg testConnection(). */
export async function testConnection(): Promise<boolean> {
  try {
    const db = await getClient();
    const stmt = await db.prepare('SELECT 1');
    await stmt.all();
    console.log('Database connection successful (turso)');
    return true;
  } catch (error) {
    console.error('Database connection failed (turso):', error);
    return false;
  }
}

/** Close the connection. Parallel to the pg closePool(). */
export async function closePool(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}

/**
 * Execute a function within a transaction. Mirrors `db/index.ts`
 * withTransaction(): the callback receives an executor it threads into query()
 * calls (third arg) so they run inside the transaction. Transactions are
 * serialized against each other on the shared connection.
 */
export async function withTransaction<T>(
  fn: (txClient: TursoExecutor) => Promise<T>
): Promise<T> {
  return withTxLock(async () => {
    const db = await getClient();
    await db.exec('BEGIN');
    try {
      const result = await fn(db);
      await db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        await db.exec('ROLLBACK');
      } catch {
        // Ignore rollback errors to avoid masking the original error.
      }
      throw error;
    }
  });
}
