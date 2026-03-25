import { query } from '../index.js';

export type IpAccessMode = 'allowlist' | 'blocklist';

export interface GameSettings {
  max_characters_per_player: number;
  ip_access_mode: IpAccessMode;
  max_negative_hp_percent: number;
  dropped_tick_interval_ms: number;
  backstab_base_min_multiplier: number;
  backstab_base_max_multiplier: number;
  backstab_level_bonus_min: number;
  backstab_level_bonus_max: number;
  health_tick_interval_ms: number;
  mana_tick_interval_ms: number;
  health_regen_base_percent: number;
  health_regen_enhanced_percent: number;
  mana_regen_base_percent: number;
  mana_regen_enhanced_percent: number;
  blind_accuracy_penalty: number;
}

// ============================================================================
// VALIDATION RANGES (single source of truth for validation)
// ============================================================================

export const BACKSTAB_SETTING_RANGES = {
  backstab_base_min_multiplier: { min: 1.0, max: 5.0, default: 2.0 },
  backstab_base_max_multiplier: { min: 1.5, max: 6.0, default: 3.0 },
  backstab_level_bonus_min: { min: 0.0, max: 1.0, default: 0.20 },
  backstab_level_bonus_max: { min: 0.0, max: 2.0, default: 0.50 },
} as const;

export type BackstabSettingKey = keyof typeof BACKSTAB_SETTING_RANGES;

export type RegenSettingKey = 'health_tick_interval_ms' | 'mana_tick_interval_ms' |
  'health_regen_base_percent' | 'health_regen_enhanced_percent' |
  'mana_regen_base_percent' | 'mana_regen_enhanced_percent';

/**
 * Validate a backstab setting value against its defined range
 */
export function isValidBackstabSetting(key: string, value: number): boolean {
  const range = BACKSTAB_SETTING_RANGES[key as BackstabSettingKey];
  if (!range) return false;
  return typeof value === 'number' && !isNaN(value) && value >= range.min && value <= range.max;
}

export interface RegenSettings {
  health_tick_interval_ms: number;
  mana_tick_interval_ms: number;
  health_regen_base_percent: number;
  health_regen_enhanced_percent: number;
  mana_regen_base_percent: number;
  mana_regen_enhanced_percent: number;
}

const DEFAULT_REGEN_SETTINGS: RegenSettings = {
  health_tick_interval_ms: 5000,
  mana_tick_interval_ms: 5000,
  health_regen_base_percent: 1,
  health_regen_enhanced_percent: 3,
  mana_regen_base_percent: 2,
  mana_regen_enhanced_percent: 5,
};

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
 * Training-related settings stored in the database
 * These control level-up costs and initial character points
 */
export interface TrainingSettings {
  training_base_cost: number;      // Base cost in copper to train to level 2
  training_cost_multiplier: number; // Exponential multiplier per level
  initial_character_points: number; // CP given to new characters
}

// Default training settings (used as fallbacks if DB values missing)
const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  training_base_cost: 28,
  training_cost_multiplier: 1.8,
  initial_character_points: 100,
};

// Cache for training settings
let trainingSettingsCache: TrainingSettings | null = null;
let trainingSettingsCacheTime: number = 0;
const TRAINING_SETTINGS_CACHE_TTL = 60000; // 1 minute cache

// Cache for character save settings
let characterSaveIntervalCache: number | null = null;
let characterSaveIntervalCacheTime: number = 0;
const CHARACTER_SAVE_CACHE_TTL = 60000; // 1 minute cache
const DEFAULT_CHARACTER_SAVE_INTERVAL_MS = 60000; // 60 seconds default

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
    const parsed = parseJsonbValue<unknown>(row.value);

    switch (row.key) {
      case 'max_characters_per_player':
        if (isValidCharacterLimit(parsed as number)) {
          settings.max_characters_per_player = parsed as number;
        }
        break;
      case 'ip_access_mode':
        if (isValidIpAccessMode(parsed)) {
          settings.ip_access_mode = parsed;
        }
        break;
      case 'max_negative_hp_percent':
        if (typeof parsed === 'number' && parsed > 0 && parsed <= 100) {
          settings.max_negative_hp_percent = parsed;
        }
        break;
      case 'dropped_tick_interval_ms':
        if (typeof parsed === 'number' && parsed >= 1000 && parsed <= 30000) {
          settings.dropped_tick_interval_ms = parsed;
        }
        break;
      case 'backstab_base_min_multiplier':
      case 'backstab_base_max_multiplier':
      case 'backstab_level_bonus_min':
      case 'backstab_level_bonus_max':
        if (isValidBackstabSetting(row.key, parsed as number)) {
          settings[row.key as BackstabSettingKey] = parsed as number;
        }
        break;
      case 'health_tick_interval_ms':
      case 'mana_tick_interval_ms':
        if (typeof parsed === 'number' && parsed >= 1000 && parsed <= 60000) {
          settings[row.key as RegenSettingKey] = parsed;
        }
        break;
      case 'health_regen_base_percent':
      case 'health_regen_enhanced_percent':
      case 'mana_regen_base_percent':
      case 'mana_regen_enhanced_percent':
        if (typeof parsed === 'number' && parsed >= 0 && parsed <= 100) {
          settings[row.key as RegenSettingKey] = parsed;
        }
        break;
      case 'blind_accuracy_penalty':
        if (typeof parsed === 'number' && parsed >= 1 && parsed <= 50) {
          settings.blind_accuracy_penalty = parsed;
        }
        break;
    }
  }

  // Return with defaults for any missing or invalid values
  return {
    max_characters_per_player: settings.max_characters_per_player ?? 3,
    ip_access_mode: settings.ip_access_mode ?? 'blocklist',
    max_negative_hp_percent: settings.max_negative_hp_percent ?? 50,
    dropped_tick_interval_ms: settings.dropped_tick_interval_ms ?? 5000,
    backstab_base_min_multiplier: settings.backstab_base_min_multiplier ?? BACKSTAB_SETTING_RANGES.backstab_base_min_multiplier.default,
    backstab_base_max_multiplier: settings.backstab_base_max_multiplier ?? BACKSTAB_SETTING_RANGES.backstab_base_max_multiplier.default,
    backstab_level_bonus_min: settings.backstab_level_bonus_min ?? BACKSTAB_SETTING_RANGES.backstab_level_bonus_min.default,
    backstab_level_bonus_max: settings.backstab_level_bonus_max ?? BACKSTAB_SETTING_RANGES.backstab_level_bonus_max.default,
    health_tick_interval_ms: settings.health_tick_interval_ms ?? DEFAULT_REGEN_SETTINGS.health_tick_interval_ms,
    mana_tick_interval_ms: settings.mana_tick_interval_ms ?? DEFAULT_REGEN_SETTINGS.mana_tick_interval_ms,
    health_regen_base_percent: settings.health_regen_base_percent ?? DEFAULT_REGEN_SETTINGS.health_regen_base_percent,
    health_regen_enhanced_percent: settings.health_regen_enhanced_percent ?? DEFAULT_REGEN_SETTINGS.health_regen_enhanced_percent,
    mana_regen_base_percent: settings.mana_regen_base_percent ?? DEFAULT_REGEN_SETTINGS.mana_regen_base_percent,
    mana_regen_enhanced_percent: settings.mana_regen_enhanced_percent ?? DEFAULT_REGEN_SETTINGS.mana_regen_enhanced_percent,
    blind_accuracy_penalty: settings.blind_accuracy_penalty ?? 10,
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

/**
 * Get the customizable name for runic currency
 * Defaults to "runic" if not set
 */
export async function getRunicName(): Promise<string> {
  const value = await getSetting<string>('currency_runic_name');
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return 'runic';
}

/**
 * Currency encumbrance settings
 */
export interface CurrencyEncumbranceSettings {
  copperPerEnc: number;
  silverPerEnc: number;
  goldPerEnc: number;
  platinumPerEnc: number;
  runicPerEnc: number;
}

// Default currency encumbrance values
const DEFAULT_CURRENCY_ENCUMBRANCE: CurrencyEncumbranceSettings = {
  copperPerEnc: 25,
  silverPerEnc: 25,
  goldPerEnc: 15,
  platinumPerEnc: 10,
  runicPerEnc: 4,
};

// Cache for currency encumbrance settings
let currencyEncumbranceCache: CurrencyEncumbranceSettings | null = null;
let currencyEncumbranceCacheTime: number = 0;
const CURRENCY_ENCUMBRANCE_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get currency encumbrance settings with caching
 */
export async function getCurrencyEncumbranceSettings(): Promise<CurrencyEncumbranceSettings> {
  const now = Date.now();

  // Return cached settings if still valid
  if (currencyEncumbranceCache && (now - currencyEncumbranceCacheTime) < CURRENCY_ENCUMBRANCE_CACHE_TTL) {
    return currencyEncumbranceCache;
  }

  // Fetch all currency settings from DB in parallel
  const [copper, silver, gold, platinum, runic] = await Promise.all([
    getSetting<number>('currency_copper_per_enc'),
    getSetting<number>('currency_silver_per_enc'),
    getSetting<number>('currency_gold_per_enc'),
    getSetting<number>('currency_platinum_per_enc'),
    getSetting<number>('currency_runic_per_enc'),
  ]);

  const settings: CurrencyEncumbranceSettings = {
    copperPerEnc: (typeof copper === 'number' && copper > 0) ? copper : DEFAULT_CURRENCY_ENCUMBRANCE.copperPerEnc,
    silverPerEnc: (typeof silver === 'number' && silver > 0) ? silver : DEFAULT_CURRENCY_ENCUMBRANCE.silverPerEnc,
    goldPerEnc: (typeof gold === 'number' && gold > 0) ? gold : DEFAULT_CURRENCY_ENCUMBRANCE.goldPerEnc,
    platinumPerEnc: (typeof platinum === 'number' && platinum > 0) ? platinum : DEFAULT_CURRENCY_ENCUMBRANCE.platinumPerEnc,
    runicPerEnc: (typeof runic === 'number' && runic > 0) ? runic : DEFAULT_CURRENCY_ENCUMBRANCE.runicPerEnc,
  };

  // Update cache
  currencyEncumbranceCache = settings;
  currencyEncumbranceCacheTime = now;

  return settings;
}

/**
 * Clear the currency encumbrance settings cache (call after updating settings)
 */
export function clearCurrencyEncumbranceCache(): void {
  currencyEncumbranceCache = null;
  currencyEncumbranceCacheTime = 0;
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

// ============================================================================
// TRAINING SETTINGS
// ============================================================================

/**
 * Get all training settings with caching
 * Settings are cached for 1 minute to avoid DB hits during training operations
 */
export async function getTrainingSettings(): Promise<TrainingSettings> {
  const now = Date.now();

  // Return cached settings if still valid
  if (trainingSettingsCache && (now - trainingSettingsCacheTime) < TRAINING_SETTINGS_CACHE_TTL) {
    return trainingSettingsCache;
  }

  // Fetch all training settings from DB in parallel
  const [baseCost, multiplier, initialCp] = await Promise.all([
    getSetting<number>('training_base_cost'),
    getSetting<number>('training_cost_multiplier'),
    getSetting<number>('initial_character_points'),
  ]);

  const settings: TrainingSettings = { ...DEFAULT_TRAINING_SETTINGS };

  if (typeof baseCost === 'number' && baseCost > 0) {
    settings.training_base_cost = baseCost;
  }
  if (typeof multiplier === 'number' && multiplier > 0) {
    settings.training_cost_multiplier = multiplier;
  }
  if (typeof initialCp === 'number' && initialCp >= 0) {
    settings.initial_character_points = initialCp;
  }

  // Update cache
  trainingSettingsCache = settings;
  trainingSettingsCacheTime = now;

  return settings;
}

/**
 * Clear the training settings cache (call after updating settings)
 */
export function clearTrainingSettingsCache(): void {
  trainingSettingsCache = null;
  trainingSettingsCacheTime = 0;
}

// ============================================================================
// CHARACTER SAVE SETTINGS
// ============================================================================

/**
 * Get the character auto-save interval in milliseconds.
 * This controls how often connected players' vitals (HP, mana) are
 * automatically saved to the database.
 *
 * Default: 60000ms (60 seconds)
 * Valid range: 10000ms (10s) to 600000ms (10min)
 */
export async function getCharacterSaveIntervalMs(): Promise<number> {
  const now = Date.now();

  // Return cached value if still valid
  if (characterSaveIntervalCache !== null && (now - characterSaveIntervalCacheTime) < CHARACTER_SAVE_CACHE_TTL) {
    return characterSaveIntervalCache;
  }

  // Fetch from database
  const value = await getSetting<number>('character_save_interval_ms');

  // Validate and use default if invalid
  let interval = DEFAULT_CHARACTER_SAVE_INTERVAL_MS;
  if (typeof value === 'number' && value >= 10000 && value <= 600000) {
    interval = value;
  }

  // Update cache
  characterSaveIntervalCache = interval;
  characterSaveIntervalCacheTime = now;

  return interval;
}

/**
 * Clear the character save settings cache (call after updating settings)
 */
export function clearCharacterSaveSettingsCache(): void {
  characterSaveIntervalCache = null;
  characterSaveIntervalCacheTime = 0;
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

// ============================================================================
// RESPAWN SETTINGS
// ============================================================================

/**
 * Get a room ID setting by key, validating it is a positive integer.
 * Returns null if not configured or invalid.
 */
async function getRoomIdSetting(key: string): Promise<number | null> {
  const value = await getSetting<number>(key);
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  return null;
}

/**
 * Get the default respawn room ID.
 * This is used as a fallback when a player dies in an area with no designated
 * respawn room. Returns null if not configured (will fall back to Room 1).
 */
export async function getDefaultRespawnRoomId(): Promise<number | null> {
  return getRoomIdSetting('default_respawn_room_id');
}

/**
 * Get the default starting room ID for new characters.
 * Returns null if not configured (will fall back to Room 1).
 */
export async function getDefaultStartingRoomId(): Promise<number | null> {
  return getRoomIdSetting('default_starting_room_id');
}

// ============================================================================
// DEATH MECHANIC SETTINGS
// ============================================================================

// Default death settings
const DEFAULT_MAX_NEGATIVE_HP_PERCENT = 50;  // 50% of maxHp for death threshold
const DEFAULT_DROPPED_TICK_INTERVAL_MS = 5000; // 5 seconds between bleed/recovery ticks

// Cache for death settings
let deathSettingsCache: { maxNegativeHpPercent: number; droppedTickIntervalMs: number } | null = null;
let deathSettingsCacheTime: number = 0;
const DEATH_SETTINGS_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get the maximum negative HP percentage threshold for death.
 * When a player's HP falls below -(maxHp * percent / 100), they die.
 * Default: 50 (at 100 maxHp, death occurs at -50 HP)
 */
export async function getMaxNegativeHpPercent(): Promise<number> {
  const now = Date.now();

  if (deathSettingsCache && (now - deathSettingsCacheTime) < DEATH_SETTINGS_CACHE_TTL) {
    return deathSettingsCache.maxNegativeHpPercent;
  }

  const value = await getSetting<number>('max_negative_hp_percent');
  const result = (typeof value === 'number' && value > 0 && value <= 100)
    ? value
    : DEFAULT_MAX_NEGATIVE_HP_PERCENT;

  // Update cache
  if (!deathSettingsCache) {
    deathSettingsCache = { maxNegativeHpPercent: result, droppedTickIntervalMs: DEFAULT_DROPPED_TICK_INTERVAL_MS };
  } else {
    deathSettingsCache.maxNegativeHpPercent = result;
  }
  deathSettingsCacheTime = now;

  return result;
}

/**
 * Get the interval between dropped state ticks in milliseconds.
 * During each tick, dropped players either lose HP (bleeding) or gain HP (if aided).
 * Default: 5000ms (5 seconds)
 * Valid range: 1000ms (1s) to 30000ms (30s)
 */
export async function getDroppedTickIntervalMs(): Promise<number> {
  const now = Date.now();

  if (deathSettingsCache && (now - deathSettingsCacheTime) < DEATH_SETTINGS_CACHE_TTL) {
    return deathSettingsCache.droppedTickIntervalMs;
  }

  const value = await getSetting<number>('dropped_tick_interval_ms');
  const result = (typeof value === 'number' && value >= 1000 && value <= 30000)
    ? value
    : DEFAULT_DROPPED_TICK_INTERVAL_MS;

  // Update cache
  if (!deathSettingsCache) {
    deathSettingsCache = { maxNegativeHpPercent: DEFAULT_MAX_NEGATIVE_HP_PERCENT, droppedTickIntervalMs: result };
  } else {
    deathSettingsCache.droppedTickIntervalMs = result;
  }
  deathSettingsCacheTime = now;

  return result;
}

/**
 * Clear the death settings cache (call after updating settings)
 */
export function clearDeathSettingsCache(): void {
  deathSettingsCache = null;
  deathSettingsCacheTime = 0;
}

// ============================================================================
// BACKSTAB SETTINGS
// ============================================================================

/**
 * Backstab-related settings stored in the database
 * These control backstab damage calculations and can be tweaked for balance
 */
export interface BackstabSettings {
  base_min_multiplier: number;   // Multiplier for minimum backstab damage (default: 2.0)
  base_max_multiplier: number;   // Multiplier for maximum backstab damage (default: 3.0)
  level_bonus_min: number;       // Flat bonus to min damage per level (default: 0.20)
  level_bonus_max: number;       // Flat bonus to max damage per level (default: 0.50)
}

// Default backstab settings (derived from centralized ranges)
const DEFAULT_BACKSTAB_SETTINGS: BackstabSettings = {
  base_min_multiplier: BACKSTAB_SETTING_RANGES.backstab_base_min_multiplier.default,
  base_max_multiplier: BACKSTAB_SETTING_RANGES.backstab_base_max_multiplier.default,
  level_bonus_min: BACKSTAB_SETTING_RANGES.backstab_level_bonus_min.default,
  level_bonus_max: BACKSTAB_SETTING_RANGES.backstab_level_bonus_max.default,
};

// Cache for backstab settings
let backstabSettingsCache: BackstabSettings | null = null;
let backstabSettingsCacheTime: number = 0;
const BACKSTAB_SETTINGS_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get all backstab settings with caching
 * Settings are cached for 1 minute to avoid DB hits during combat
 */
export async function getBackstabSettings(): Promise<BackstabSettings> {
  const now = Date.now();

  // Return cached settings if still valid
  if (backstabSettingsCache && (now - backstabSettingsCacheTime) < BACKSTAB_SETTINGS_CACHE_TTL) {
    return backstabSettingsCache;
  }

  // Fetch all backstab settings from DB in parallel
  const [baseMinMult, baseMaxMult, levelBonusMin, levelBonusMax] = await Promise.all([
    getSetting<number>('backstab_base_min_multiplier'),
    getSetting<number>('backstab_base_max_multiplier'),
    getSetting<number>('backstab_level_bonus_min'),
    getSetting<number>('backstab_level_bonus_max'),
  ]);

  const settings: BackstabSettings = { ...DEFAULT_BACKSTAB_SETTINGS };

  // Validate and apply each setting using centralized validation
  if (isValidBackstabSetting('backstab_base_min_multiplier', baseMinMult as number)) {
    settings.base_min_multiplier = baseMinMult as number;
  }
  if (isValidBackstabSetting('backstab_base_max_multiplier', baseMaxMult as number)) {
    settings.base_max_multiplier = baseMaxMult as number;
  }
  if (isValidBackstabSetting('backstab_level_bonus_min', levelBonusMin as number)) {
    settings.level_bonus_min = levelBonusMin as number;
  }
  if (isValidBackstabSetting('backstab_level_bonus_max', levelBonusMax as number)) {
    settings.level_bonus_max = levelBonusMax as number;
  }

  // Update cache
  backstabSettingsCache = settings;
  backstabSettingsCacheTime = now;

  return settings;
}

/**
 * Clear the backstab settings cache (call after updating settings)
 */
export function clearBackstabSettingsCache(): void {
  backstabSettingsCache = null;
  backstabSettingsCacheTime = 0;
}

// ============================================================================
// BLIND ACCURACY PENALTY
// ============================================================================

const DEFAULT_BLIND_ACCURACY_PENALTY = 10;

let blindAccuracyCache: number | null = null;
let blindAccuracyCacheTime: number = 0;
const BLIND_ACCURACY_CACHE_TTL = 60000;

/**
 * Get the blind accuracy penalty (applied when a combatant cannot see).
 * Stored as a positive number (1-50), applied as a subtraction in accuracy calc.
 * Default: 10
 */
export async function getBlindAccuracyPenalty(): Promise<number> {
  const now = Date.now();

  if (blindAccuracyCache !== null && (now - blindAccuracyCacheTime) < BLIND_ACCURACY_CACHE_TTL) {
    return blindAccuracyCache;
  }

  const value = await getSetting<number>('blind_accuracy_penalty');
  const result = (typeof value === 'number' && value >= 1 && value <= 50)
    ? value
    : DEFAULT_BLIND_ACCURACY_PENALTY;

  blindAccuracyCache = result;
  blindAccuracyCacheTime = now;

  return result;
}

/**
 * Clear the blind accuracy penalty cache (call after updating settings)
 */
export function clearBlindAccuracyCache(): void {
  blindAccuracyCache = null;
  blindAccuracyCacheTime = 0;
}

// ============================================================================
// REGENERATION SETTINGS
// ============================================================================

let regenSettingsCache: RegenSettings | null = null;
let regenSettingsCacheTime: number = 0;
const REGEN_SETTINGS_CACHE_TTL = 60000;

export async function getRegenSettings(): Promise<RegenSettings> {
  const now = Date.now();

  if (regenSettingsCache && (now - regenSettingsCacheTime) < REGEN_SETTINGS_CACHE_TTL) {
    return regenSettingsCache;
  }

  const allSettings = await getAllSettings();

  const settings: RegenSettings = {
    health_tick_interval_ms: allSettings.health_tick_interval_ms,
    mana_tick_interval_ms: allSettings.mana_tick_interval_ms,
    health_regen_base_percent: allSettings.health_regen_base_percent,
    health_regen_enhanced_percent: allSettings.health_regen_enhanced_percent,
    mana_regen_base_percent: allSettings.mana_regen_base_percent,
    mana_regen_enhanced_percent: allSettings.mana_regen_enhanced_percent,
  };

  regenSettingsCache = settings;
  regenSettingsCacheTime = now;

  return settings;
}

export function clearRegenSettingsCache(): void {
  regenSettingsCache = null;
  regenSettingsCacheTime = 0;
}
