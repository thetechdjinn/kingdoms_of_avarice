/**
 * Helper for reading former PostgreSQL array columns (text[] / integer[]) which
 * are stored as JSON-encoded TEXT under Turso/SQLite.
 *
 * Write paths bind JS arrays which the DB wrapper JSON-encodes (see
 * db/turso/index.ts execOn). On read, the column comes back as a JSON string;
 * use this to turn it back into a JS array. Falls back to comma-split for any
 * legacy/coerced value so it degrades gracefully.
 */
export function parseArrayColumn<T = string>(value: unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '' || s === '{}' || s === '[]') return [];
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        // fall through to CSV handling
      }
    }
    // Legacy/coerced fallback: Postgres `{a,b}` literal or bare CSV `a,b`.
    return s.replace(/^\{|\}$/g, '').split(',').filter(Boolean) as unknown as T[];
  }
  return [];
}
