/**
 * Character Points (CP) System
 *
 * CP is used to raise character stats above their racial base values.
 * The cost to raise a stat increases in tiers based on how many points
 * have already been spent on that stat.
 */

// Stat names used in the CP system
export type CPStatName = 'strength' | 'agility' | 'constitution' | 'intellect' | 'wisdom' | 'charisma';

export const CP_STAT_NAMES: CPStatName[] = [
  'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma'
];

// Abbreviations for display
export const CP_STAT_ABBREVIATIONS: Record<CPStatName, string> = {
  strength: 'STR',
  agility: 'AGI',
  constitution: 'CON',
  intellect: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

// Default starting CP for new characters
export const DEFAULT_STARTING_CP = 100;

// CP cost tiers: points 1-10 cost 1 CP each, 11-20 cost 2 CP each, etc.
export const CP_TIER_SIZE = 10;

// CP earned per level by level range (MajorMUD-style progression)
// Levels 1-10: 10 CP, Levels 11-20: 15 CP, etc.
export const CP_PER_LEVEL_BASE = 10;
export const CP_PER_LEVEL_INCREMENT = 5;
export const CP_LEVEL_TIER_SIZE = 10;

/**
 * Calculate CP earned for reaching a specific level
 *
 * Level ranges and CP earned:
 * - Levels 1-10: 10 CP per level
 * - Levels 11-20: 15 CP per level
 * - Levels 21-30: 20 CP per level
 * - Levels 31-40: 25 CP per level
 * - Levels 41-50: 30 CP per level
 * - Levels 51-60: 35 CP per level
 * - Levels 61-70: 40 CP per level
 * - Levels 71-80: 45 CP per level
 * - And so on...
 *
 * @param level - The level being reached (1-based)
 * @returns CP earned for that level
 */
export function getCpEarnedForLevel(level: number): number {
  if (level < 1) return 0;

  // Tier 0 (levels 1-10): 10 CP
  // Tier 1 (levels 11-20): 15 CP
  // Tier 2 (levels 21-30): 20 CP
  // etc.
  const tier = Math.floor((level - 1) / CP_LEVEL_TIER_SIZE);
  return CP_PER_LEVEL_BASE + tier * CP_PER_LEVEL_INCREMENT;
}

/**
 * Calculate total CP earned from level 1 to a target level
 *
 * @param targetLevel - The level to calculate total CP for
 * @returns Total CP earned across all levels
 */
export function getTotalCpEarnedToLevel(targetLevel: number): number {
  let total = 0;
  for (let level = 1; level <= targetLevel; level++) {
    total += getCpEarnedForLevel(level);
  }
  return total;
}

/**
 * Calculate the CP cost to raise a stat by 1 point
 *
 * @param pointsAlreadySpent - How many CP points already spent on this stat
 * @returns The CP cost for the next point
 */
export function getCPCostForNextPoint(pointsAlreadySpent: number): number {
  // Tier 0 (points 1-10): costs 1 CP
  // Tier 1 (points 11-20): costs 2 CP
  // Tier 2 (points 21-30): costs 3 CP
  // etc.
  const tier = Math.floor(pointsAlreadySpent / CP_TIER_SIZE);
  return tier + 1;
}

/**
 * Calculate total CP cost to raise a stat by a given amount
 *
 * @param currentPointsSpent - Current points already spent on this stat
 * @param pointsToAdd - How many additional points to add
 * @returns Total CP cost
 */
export function getTotalCPCost(currentPointsSpent: number, pointsToAdd: number): number {
  let totalCost = 0;
  for (let i = 0; i < pointsToAdd; i++) {
    totalCost += getCPCostForNextPoint(currentPointsSpent + i);
  }
  return totalCost;
}

/**
 * Calculate how many stat points can be purchased with available CP
 *
 * @param currentPointsSpent - Current points already spent on this stat
 * @param availableCP - How much CP is available to spend
 * @returns Maximum points that can be purchased
 */
export function getMaxPointsAffordable(currentPointsSpent: number, availableCP: number): number {
  let points = 0;
  let spent = 0;

  while (true) {
    const nextCost = getCPCostForNextPoint(currentPointsSpent + points);
    if (spent + nextCost > availableCP) {
      break;
    }
    spent += nextCost;
    points++;
  }

  return points;
}

/**
 * Race base stat definition with min/max ranges
 */
export interface RaceStatRange {
  min: number;  // Starting value (racial base)
  max: number;  // Maximum achievable through CP
}

export interface RaceBaseStats {
  strength: RaceStatRange;
  agility: RaceStatRange;
  constitution: RaceStatRange;
  intellect: RaceStatRange;
  wisdom: RaceStatRange;
  charisma: RaceStatRange;
}

/**
 * Racial trait definition
 */
export interface RacialTrait {
  id: string;
  value: number | boolean;
}

// Note: RaceDefinition is in progression.ts to avoid circular dependencies

/**
 * Character's CP allocation state
 */
export interface CPSpent {
  strength?: number;
  agility?: number;
  constitution?: number;
  intellect?: number;
  wisdom?: number;
  charisma?: number;
}

/**
 * Calculate current stat value from base + CP spent
 *
 * @param baseStat - The racial base stat (min value)
 * @param pointsSpent - CP points invested in this stat
 * @returns Current stat value
 */
export function calculateCurrentStat(baseStat: number, pointsSpent: number): number {
  return baseStat + pointsSpent;
}

/**
 * Check if a stat can be raised further
 *
 * @param currentValue - Current stat value
 * @param maxValue - Maximum allowed by race
 * @param availableCP - Available CP to spend
 * @param currentPointsSpent - Points already spent on this stat
 * @returns Whether the stat can be raised
 */
export function canRaiseStat(
  currentValue: number,
  maxValue: number,
  availableCP: number,
  currentPointsSpent: number
): boolean {
  if (currentValue >= maxValue) {
    return false;
  }
  const costForNext = getCPCostForNextPoint(currentPointsSpent);
  return availableCP >= costForNext;
}

// ============================================================================
// TRAINING COST FORMULA (Level-up currency costs)
// ============================================================================

// Maximum level for training cost calculation (prevents overflow)
const MAX_TRAINING_LEVEL = 100;

/**
 * Calculate the currency cost to train to a target level.
 * Uses exponential scaling: cost_to_level_N = ceil(baseCost * multiplier^(N-2))
 *
 * Level 2 costs baseCost (multiplier^0 = 1)
 * Level 3 costs baseCost * multiplier^1
 * Level 4 costs baseCost * multiplier^2
 * etc.
 *
 * @param targetLevel - The level to train to (must be >= 2, capped at MAX_TRAINING_LEVEL)
 * @param baseCost - Base cost in copper for training to level 2 (default 28)
 * @param multiplier - Exponential multiplier per level (default 1.8)
 * @returns Cost in copper to train to the target level, or 0 if targetLevel < 2
 */
export function calculateTrainingCost(
  targetLevel: number,
  baseCost: number = 28,
  multiplier: number = 1.8
): number {
  // Validate inputs
  if (!Number.isFinite(targetLevel) || !Number.isFinite(baseCost) || !Number.isFinite(multiplier)) {
    return 0;
  }

  if (targetLevel < 2) {
    return 0;
  }

  // Cap at max level to prevent numeric overflow
  const cappedLevel = Math.min(targetLevel, MAX_TRAINING_LEVEL);

  // Ensure positive values
  const safeCost = Math.max(1, baseCost);
  const safeMultiplier = Math.max(1, multiplier);

  // cost_to_level_N = ceil(baseCost * multiplier^(N-2))
  const exponent = cappedLevel - 2;
  const cost = Math.ceil(safeCost * Math.pow(safeMultiplier, exponent));

  // Final safety check for infinity/NaN
  if (!Number.isFinite(cost)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return cost;
}

/**
 * Calculate total currency cost to train from current level to target level
 *
 * @param currentLevel - Current character level
 * @param targetLevel - Target level to train to
 * @param baseCost - Base cost in copper for training to level 2
 * @param multiplier - Exponential multiplier per level
 * @returns Total cost in copper for all level-ups
 */
export function calculateTotalTrainingCost(
  currentLevel: number,
  targetLevel: number,
  baseCost: number = 28,
  multiplier: number = 1.8
): number {
  if (targetLevel <= currentLevel) {
    return 0;
  }

  let total = 0;
  for (let level = currentLevel + 1; level <= targetLevel; level++) {
    total += calculateTrainingCost(level, baseCost, multiplier);
  }
  return total;
}

/**
 * Format a copper amount as a readable currency string
 * Conversion: 10 copper = 1 silver, 10 silver = 1 gold, 10 gold = 1 platinum
 *
 * @param copperAmount - Amount in copper farthings
 * @returns Formatted string like "5 gold 3 silver 2 copper" or just "25 copper"
 */
export function formatCurrency(copperAmount: number): string {
  if (copperAmount <= 0) {
    return '0 copper';
  }

  let remaining = copperAmount;
  const parts: string[] = [];

  // Platinum (1000 copper)
  const platinum = Math.floor(remaining / 1000);
  if (platinum > 0) {
    parts.push(`${platinum} platinum`);
    remaining = remaining % 1000;
  }

  // Gold (100 copper)
  const gold = Math.floor(remaining / 100);
  if (gold > 0) {
    parts.push(`${gold} gold`);
    remaining = remaining % 100;
  }

  // Silver (10 copper)
  const silver = Math.floor(remaining / 10);
  if (silver > 0) {
    parts.push(`${silver} silver`);
    remaining = remaining % 10;
  }

  // Copper
  if (remaining > 0 || parts.length === 0) {
    parts.push(`${remaining} copper`);
  }

  return parts.join(' ');
}
