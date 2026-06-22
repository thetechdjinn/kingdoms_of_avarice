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

/** pg.QueryResult-like shape so existing callers keep using `.rows` / `.rowCount`. */
export interface QueryResultLike<T> {
  rows: T[];
  rowCount: number;
  lastInsertRowid?: number | bigint;
}

/**
 * The threaded transaction client. It exposes a pg-style `.query()` so the two
 * call patterns in the codebase both work unchanged:
 *   - `query(sql, params, client)` — module function, client threaded (most repos)
 *   - `client.query(sql, params)`  — direct pg-style on the client (legacy sites)
 * Both run on the same open transaction.
 */
export interface TursoExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResultLike<T>>;
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

/**
 * Mirror what the pg driver did for jsonb/array columns: parse JSON-looking
 * string values back into objects/arrays on read. We only attempt strings that
 * begin with `{` or `[` (object/array JSON); scalar-jsonb (numbers, quoted
 * strings like game_settings.value) is left as-is for callers that parse it
 * themselves (e.g. settingsRepository.parseJsonbValue). Non-JSON text (names,
 * descriptions) is returned untouched.
 */
function maybeParseJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  const c = value.charCodeAt(0);
  if (c !== 0x7b /* { */ && c !== 0x5b /* [ */) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function execOn<T>(db: Database, text: string, params?: unknown[]): Promise<QueryResultLike<T>> {
  const stmt = await db.prepare(text);
  // Former Postgres array columns (text[]) are stored as JSON TEXT. SQLite can't
  // bind a JS array, so JSON-encode any array param here (a single, uniform seam
  // for every write path). Already-stringified JSON args pass through untouched.
  const args = (params ?? []).map((p) => (Array.isArray(p) ? JSON.stringify(p) : p));
  if (stmt.reader) {
    const rows = (await stmt.all(...args)) as Record<string, unknown>[];
    // Deserialize jsonb/array columns (pg auto-parsed these; the Turso driver
    // returns raw TEXT, so do it here uniformly).
    for (const row of rows) {
      for (const key in row) row[key] = maybeParseJson(row[key]);
    }
    return { rows: rows as T[], rowCount: rows.length };
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
  // Inside a transaction: delegate to the threaded client (same open tx).
  if (txClient) return txClient.query<T>(text, params);

  const start = Date.now();
  const result = await execOn<T>(await getClient(), text, params);
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
    // Adapter exposing pg-style .query() that runs on this open transaction.
    const client: TursoExecutor = {
      query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => execOn<T>(db, text, params),
    };
    try {
      const result = await fn(client);
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
