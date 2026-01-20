import { query } from '../index.js';

export type IpAccessMode = 'allowlist' | 'blocklist';

export interface GameSettings {
  max_characters_per_player: number;
  ip_access_mode: IpAccessMode;
}

/**
 * Combat-related settings stored in the database
 * These can be tweaked without code changes for balance tuning
 */
export interface CombatSettings {
  base_energy: number;
  default_weapon_speed: number;
  max_attacks_per_round: number;
  round_interval_ms: number;
  unarmed_speed: number;
  level_multipliers: Record<string, number>;
  level_accuracy_bonus: Record<string, number>;
}

// Default combat settings (used as fallbacks if DB values missing)
const DEFAULT_COMBAT_SETTINGS: CombatSettings = {
  base_energy: 20000,
  default_weapon_speed: 7500,
  max_attacks_per_round: 6,
  round_interval_ms: 4000,
  unarmed_speed: 4500,
  level_multipliers: { '1': 0.6, '2': 0.75, '3': 0.9, '4': 1.0, '5': 1.15 },
  level_accuracy_bonus: { '1': 0, '2': 10, '3': 20, '4': 35, '5': 50 },
};

// Cache for combat settings (refreshed periodically)
let combatSettingsCache: CombatSettings | null = null;
let combatSettingsCacheTime: number = 0;
const COMBAT_SETTINGS_CACHE_TTL = 60000; // 1 minute cache

/**
 * Parse a JSONB value, handling both pre-parsed objects and JSON strings.
 * Falls back to returning the raw string if JSON parsing fails (for legacy data).
 */
function parseJsonbValue<T>(value: unknown): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      // If JSON parsing fails, return the raw string (handles legacy unquoted values)
      return value as T;
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
 * Validate that a value is a valid Record<string, number>
 */
function isValidRecordStringNumber(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const key in value) {
    if (typeof key !== 'string' || typeof (value as Record<string, unknown>)[key] !== 'number') return false;
  }
  return true;
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

// ============================================================================
// COMBAT SETTINGS
// ============================================================================

/**
 * Get all combat settings with caching
 * Settings are cached for 1 minute to avoid DB hits on every combat round
 */
export async function getCombatSettings(): Promise<CombatSettings> {
  const now = Date.now();

  // Return cached settings if still valid
  if (combatSettingsCache && (now - combatSettingsCacheTime) < COMBAT_SETTINGS_CACHE_TTL) {
    return combatSettingsCache;
  }

  // Fetch all combat settings from DB in parallel
  const [
    baseEnergy,
    defaultSpeed,
    maxAttacks,
    roundInterval,
    unarmedSpeed,
    levelMults,
    levelAccuracy,
  ] = await Promise.all([
    getSetting<number>('combat_base_energy'),
    getSetting<number>('combat_default_weapon_speed'),
    getSetting<number>('combat_max_attacks_per_round'),
    getSetting<number>('combat_round_interval_ms'),
    getSetting<number>('combat_unarmed_speed'),
    getSetting<Record<string, number>>('combat_level_multipliers'),
    getSetting<Record<string, number>>('combat_level_accuracy_bonus'),
  ]);

  const settings: CombatSettings = { ...DEFAULT_COMBAT_SETTINGS };

  if (typeof baseEnergy === 'number' && baseEnergy > 0) {
    settings.base_energy = baseEnergy;
  }
  if (typeof defaultSpeed === 'number' && defaultSpeed > 0) {
    settings.default_weapon_speed = defaultSpeed;
  }
  if (typeof maxAttacks === 'number' && maxAttacks > 0) {
    settings.max_attacks_per_round = maxAttacks;
  }
  if (typeof roundInterval === 'number' && roundInterval > 0) {
    settings.round_interval_ms = roundInterval;
  }
  if (typeof unarmedSpeed === 'number' && unarmedSpeed > 0) {
    settings.unarmed_speed = unarmedSpeed;
  }
  if (isValidRecordStringNumber(levelMults)) {
    settings.level_multipliers = levelMults;
  }
  if (isValidRecordStringNumber(levelAccuracy)) {
    settings.level_accuracy_bonus = levelAccuracy;
  }

  // Update cache
  combatSettingsCache = settings;
  combatSettingsCacheTime = now;

  return settings;
}

/**
 * Clear the combat settings cache (call after updating settings)
 */
export function clearCombatSettingsCache(): void {
  combatSettingsCache = null;
  combatSettingsCacheTime = 0;
}

/**
 * Get the combat level energy multiplier for a given combat level
 */
export async function getCombatLevelMultiplier(combatLevel: number): Promise<number> {
  const settings = await getCombatSettings();
  return settings.level_multipliers[String(combatLevel)] ?? 1.0;
}

/**
 * Get the combat level accuracy bonus for a given combat level
 */
export async function getCombatLevelAccuracyBonus(combatLevel: number): Promise<number> {
  const settings = await getCombatSettings();
  return settings.level_accuracy_bonus[String(combatLevel)] ?? 0;
}

/**
 * Update a single combat setting
 */
export async function setCombatSetting(
  key: keyof CombatSettings,
  value: number | Record<string, number>
): Promise<void> {
  const dbKey = `combat_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
  await setSetting(dbKey, value);
  clearCombatSettingsCache();
}

/**
 * Get all settings as a raw key-value object (for admin editor)
 * Returns all settings from the database with their actual values
 */
export async function getAllSettingsRaw(): Promise<Record<string, unknown>> {
  const result = await query<{ key: string; value: unknown }>('SELECT key, value FROM game_settings');

  const settings: Record<string, unknown> = {};

  for (const row of result.rows) {
    try {
      settings[row.key] = parseJsonbValue(row.value);
    } catch (err) {
      console.error(`Failed to parse setting "${row.key}":`, err);
      // Store raw value if parsing fails
      settings[row.key] = row.value;
    }
  }

  return settings;
}
