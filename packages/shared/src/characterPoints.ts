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
