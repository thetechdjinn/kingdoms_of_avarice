import { query } from '../index.js';

export type IpAccessMode = 'allowlist' | 'blocklist';

export interface GameSettings {
  max_characters_per_player: number;
  ip_access_mode: IpAccessMode;
}

/**
 * Parse a JSONB value, handling both pre-parsed objects and JSON strings
 */
function parseJsonbValue<T>(value: unknown): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(`Failed to parse JSON value: ${value}`);
    }
  }
  return value as T;
}

/**
 * Validate that a value is a valid positive integer for character limit
 */
function isValidCharacterLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validate that a value is a valid IP access mode
 */
function isValidIpAccessMode(value: unknown): value is IpAccessMode {
  return value === 'allowlist' || value === 'blocklist';
}

/**
 * Get a single setting value by key
 */
export async function getSetting<T>(key: string): Promise<T | null> {
  const result = await query<{ value: unknown }>(
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
  const result = await query<{ key: string; value: unknown }>('SELECT key, value FROM game_settings');

  const settings: Partial<GameSettings> = {};

  for (const row of result.rows) {
    if (row.key === 'max_characters_per_player') {
      const parsed = parseJsonbValue<number>(row.value);
      if (isValidCharacterLimit(parsed)) {
        settings.max_characters_per_player = parsed;
      }
    } else if (row.key === 'ip_access_mode') {
      const parsed = parseJsonbValue<IpAccessMode>(row.value);
      if (isValidIpAccessMode(parsed)) {
        settings.ip_access_mode = parsed;
      }
    }
  }

  // Return with defaults for any missing or invalid values
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
  if (isValidCharacterLimit(value)) {
    return value;
  }
  return 3;
}

/**
 * Get the IP access mode (allowlist or blocklist)
 */
export async function getIpAccessMode(): Promise<IpAccessMode> {
  const value = await getSetting<IpAccessMode>('ip_access_mode');
  if (isValidIpAccessMode(value)) {
    return value;
  }
  return 'blocklist';
}
