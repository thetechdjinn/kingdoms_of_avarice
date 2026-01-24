import { query } from '../index.js';

export type EntryType = 'ip' | 'hostname';
export type ListType = 'allow' | 'block';

/**
 * Normalize an IP address by stripping IPv6-mapped IPv4 prefix
 * e.g., '::ffff:192.168.1.100' becomes '192.168.1.100'
 */
function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

export interface IpAccessEntry {
  id: number;
  entry: string;
  entry_type: EntryType;
  resolved_ips: string[] | null;
  resolved_at: Date | null;
  list_type: ListType;
  reason: string | null;
  created_by: number | null;
  created_at: Date;
}

interface DbIpAccess {
  id: number;
  entry: string;
  entry_type: string;
  resolved_ips: string[] | null;
  resolved_at: Date | null;
  list_type: string;
  reason: string | null;
  created_by: number | null;
  created_at: Date;
}

/**
 * Get all IP access entries
 */
export async function getAllEntries(): Promise<IpAccessEntry[]> {
  const result = await query<DbIpAccess>(
    'SELECT * FROM ip_access ORDER BY created_at DESC'
  );
  return result.rows.map(toIpAccessEntry);
}

/**
 * Get all entries of a specific list type
 */
export async function getEntriesByListType(listType: ListType): Promise<IpAccessEntry[]> {
  const result = await query<DbIpAccess>(
    'SELECT * FROM ip_access WHERE list_type = $1 ORDER BY created_at DESC',
    [listType]
  );
  return result.rows.map(toIpAccessEntry);
}

/**
 * Get all hostname entries (for DNS resolution)
 */
export async function getHostnameEntries(): Promise<IpAccessEntry[]> {
  const result = await query<DbIpAccess>(
    'SELECT * FROM ip_access WHERE entry_type = $1',
    ['hostname']
  );
  return result.rows.map(toIpAccessEntry);
}

/**
 * Check if an IP is in the allow list (either directly or via resolved hostname)
 * Handles both raw and IPv6-mapped IPv4 addresses
 */
export async function isIpAllowed(ip: string): Promise<boolean> {
  const normalized = normalizeIp(ip);
  // Check both the original IP and the normalized version
  const ipsToCheck = ip !== normalized ? [ip, normalized] : [ip];

  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM ip_access
       WHERE list_type = 'allow'
       AND (
         (entry_type = 'ip' AND entry = ANY($1))
         OR (entry_type = 'hostname' AND (
           $1 && resolved_ips
         ))
       )
     ) as exists`,
    [ipsToCheck]
  );
  return result.rows[0].exists;
}

/**
 * Check if an IP is in the block list (either directly or via resolved hostname)
 * Handles both raw and IPv6-mapped IPv4 addresses
 */
export async function isIpBlocked(ip: string): Promise<boolean> {
  const normalized = normalizeIp(ip);
  // Check both the original IP and the normalized version
  const ipsToCheck = ip !== normalized ? [ip, normalized] : [ip];

  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM ip_access
       WHERE list_type = 'block'
       AND (
         (entry_type = 'ip' AND entry = ANY($1))
         OR (entry_type = 'hostname' AND (
           $1 && resolved_ips
         ))
       )
     ) as exists`,
    [ipsToCheck]
  );
  return result.rows[0].exists;
}

/**
 * Get entry by ID
 */
export async function getEntryById(id: number): Promise<IpAccessEntry | null> {
  const result = await query<DbIpAccess>(
    'SELECT * FROM ip_access WHERE id = $1',
    [id]
  );
  return result.rows.length > 0 ? toIpAccessEntry(result.rows[0]) : null;
}

/**
 * Create a new IP access entry
 */
export async function createEntry(
  entry: string,
  entryType: EntryType,
  listType: ListType,
  reason?: string,
  createdBy?: number,
  resolvedIps?: string[]
): Promise<IpAccessEntry> {
  const result = await query<DbIpAccess>(
    `INSERT INTO ip_access (entry, entry_type, list_type, reason, created_by, resolved_ips, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6::TEXT[], CASE WHEN $6 IS NOT NULL THEN NOW() ELSE NULL END)
     RETURNING *`,
    [
      entry,
      entryType,
      listType,
      reason || null,
      createdBy || null,
      resolvedIps || null,
    ]
  );
  return toIpAccessEntry(result.rows[0]);
}

/**
 * Update resolved IPs for a hostname entry
 */
export async function updateResolvedIps(id: number, resolvedIps: string[]): Promise<void> {
  await query(
    `UPDATE ip_access SET resolved_ips = $1, resolved_at = NOW() WHERE id = $2`,
    [resolvedIps, id]
  );
}

/**
 * Delete an IP access entry
 */
export async function deleteEntry(id: number): Promise<boolean> {
  const result = await query('DELETE FROM ip_access WHERE id = $1', [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Check if an entry already exists (case-insensitive for hostnames)
 */
export async function entryExists(entry: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM ip_access WHERE LOWER(entry) = LOWER($1)) as exists',
    [entry]
  );
  return result.rows[0].exists;
}

function toIpAccessEntry(row: DbIpAccess): IpAccessEntry {
  return {
    id: row.id,
    entry: row.entry,
    entry_type: row.entry_type as EntryType,
    resolved_ips: row.resolved_ips,
    resolved_at: row.resolved_at,
    list_type: row.list_type as ListType,
    reason: row.reason,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}
