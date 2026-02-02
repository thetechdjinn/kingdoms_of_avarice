/**
 * Stealth Check Module
 *
 * Handles stealth vs perception rolls for detecting hidden characters.
 *
 * Based on MajorMUD mechanics - see notes/Stealth_Implementation_Plan.md
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StealthCheckResult {
  detected: boolean;
  stealthValue: number;
  perceptionValue: number;
  roll: number;
  threshold: number;
  margin: number; // Positive = detected, Negative = hidden remained
}

export interface CumulativeDetectionResult {
  detected: boolean;
  detectedBy?: string; // Username of who detected (if any)
  results: Array<{
    observerName: string;
    result: StealthCheckResult;
  }>;
}

// ============================================================================
// STEALTH CHECK MECHANICS
// ============================================================================

/**
 * Roll a stealth check: observer's perception vs sneaker's stealth
 *
 * Formula:
 * - Roll 1d100
 * - Threshold = 50 + (perception - stealth)
 * - If roll <= threshold, detected
 *
 * Higher perception makes detection easier (increases threshold)
 * Higher stealth makes detection harder (decreases threshold)
 *
 * @param stealthValue - The hidden character's total stealth
 * @param perceptionValue - The observer's total perception
 * @returns StealthCheckResult with detection outcome and details
 */
export function rollStealthCheck(
  stealthValue: number,
  perceptionValue: number
): StealthCheckResult {
  // Validate inputs - ensure they're finite numbers, default to 0 if invalid
  const stealth = Number.isFinite(stealthValue) ? Math.max(0, stealthValue) : 0;
  const perception = Number.isFinite(perceptionValue) ? Math.max(0, perceptionValue) : 0;

  // Roll 1d100 (1-100)
  const roll = Math.floor(Math.random() * 100) + 1;

  // Calculate threshold
  // Base 50 + perception advantage/disadvantage
  // threshold = 50 + (perception - stealth)
  // If perception > stealth: easier to detect (higher threshold)
  // If stealth > perception: harder to detect (lower threshold)
  const threshold = Math.min(99, Math.max(1, 50 + (perception - stealth)));

  // Detected if roll is at or below threshold
  const detected = roll <= threshold;

  // Margin shows how close the check was
  // Positive/zero = detected, Negative = remained hidden
  const margin = threshold - roll;

  return {
    detected,
    stealthValue: stealth,
    perceptionValue: perception,
    roll,
    threshold,
    margin,
  };
}

/**
 * Check if a sneaking/hidden character is detected by any observer in the room
 *
 * Each observer gets an independent perception check against the sneaker's stealth.
 * The more observers, the higher the chance of detection (cumulative).
 *
 * @param stealthValue - The hidden character's total stealth
 * @param observers - Array of observers with name and perception value
 * @returns CumulativeDetectionResult with overall outcome and individual results
 */
export function rollCumulativeDetection(
  stealthValue: number,
  observers: Array<{ name: string; perception: number }>
): CumulativeDetectionResult {
  const results: CumulativeDetectionResult['results'] = [];
  let detected = false;
  let detectedBy: string | undefined;

  for (const observer of observers) {
    const result = rollStealthCheck(stealthValue, observer.perception);
    results.push({
      observerName: observer.name,
      result,
    });

    // Record first detection (outcome decided, but continue loop to collect all results for logging)
    if (result.detected && !detected) {
      detected = true;
      detectedBy = observer.name;
    }
  }

  return {
    detected,
    detectedBy,
    results,
  };
}

/**
 * Calculate the probability of detection given stealth and perception values
 * Useful for debugging and balance testing
 *
 * @param stealthValue - The hidden character's total stealth
 * @param perceptionValue - The observer's total perception
 * @returns Detection probability as a decimal (0-1)
 */
export function getDetectionProbability(
  stealthValue: number,
  perceptionValue: number
): number {
  // Validate inputs - ensure they're finite numbers, default to 0 if invalid
  const stealth = Number.isFinite(stealthValue) ? Math.max(0, stealthValue) : 0;
  const perception = Number.isFinite(perceptionValue) ? Math.max(0, perceptionValue) : 0;

  const threshold = Math.min(99, Math.max(1, 50 + (perception - stealth)));
  return threshold / 100;
}

/**
 * Calculate cumulative detection probability with multiple observers
 *
 * @param stealthValue - The hidden character's total stealth
 * @param perceptionValues - Array of perception values for each observer
 * @returns Detection probability as a decimal (0-1)
 */
export function getCumulativeDetectionProbability(
  stealthValue: number,
  perceptionValues: number[]
): number {
  // P(detected) = 1 - P(undetected by all)
  // P(undetected by all) = P(miss1) * P(miss2) * ... * P(missN)
  let undetectedProbability = 1;

  for (const perception of perceptionValues) {
    const detectionProb = getDetectionProbability(stealthValue, perception);
    undetectedProbability *= (1 - detectionProb);
  }

  return 1 - undetectedProbability;
}
