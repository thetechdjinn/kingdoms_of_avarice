import { query } from '../index.js';

export type IpAccessMode = 'allowlist' | 'blocklist';

export interface GameSettings {
  max_characters_per_player: number;
  ip_access_mode: IpAccessMode;
}

interface DbSetting {
  key: string;
  value: unknown;
  updated_at: Date;
}

/**
 * Parse a JSONB value, handling both pre-parsed objects and JSON strings
 */
function parseJsonbValue<T>(value: unknown): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value as T;
}

/**
 * Get a single setting value by key
 */
export async function getSetting<T>(key: string): Promise<T | null> {
  const result = await query<DbSetting>(
    'SELECT value FROM game_settings WHERE key = $1',
    [key]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return parseJsonbValue<T>(result.rows[0].value);
}

/**
 * Set a setting value
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await query(
    `INSERT INTO game_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

/**
 * Get all settings as a typed object
 */
export async function getAllSettings(): Promise<GameSettings> {
  const result = await query<DbSetting>('SELECT key, value FROM game_settings');

  const settings: Partial<GameSettings> = {};

  for (const row of result.rows) {
    if (row.key === 'max_characters_per_player') {
      settings.max_characters_per_player = parseJsonbValue<number>(row.value);
    } else if (row.key === 'ip_access_mode') {
      settings.ip_access_mode = parseJsonbValue<IpAccessMode>(row.value);
    }
  }

  // Return with defaults for any missing values
  return {
    max_characters_per_player: settings.max_characters_per_player ?? 3,
    ip_access_mode: settings.ip_access_mode ?? 'blocklist',
  };
}

/**
 * Get the global max characters per player setting
 */
export async function getMaxCharactersPerPlayer(): Promise<number> {
  const value = await getSetting<number>('max_characters_per_player');
  return value ?? 3;
}

/**
 * Get the IP access mode (allowlist or blocklist)
 */
export async function getIpAccessMode(): Promise<IpAccessMode> {
  const value = await getSetting<IpAccessMode>('ip_access_mode');
  return value ?? 'blocklist';
}
