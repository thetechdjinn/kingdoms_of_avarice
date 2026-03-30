/**
 * Unit tests for combatCalculations module
 *
 * Tests the core MajorMUD-style combat formulas:
 * - Weapon cost / speed divisor
 * - Energy per round
 * - Accuracy and defense
 * - Critical hit and dodge chances
 * - Miss chance (squared ratio)
 * - Damage calculation
 * - Dice string parsing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttackResult } from '@koa/shared';
import {
  calculateEffectiveWeaponCost,
  calculateRoundEnergy,
  calculateSwings,
  calculateAccuracy,
  calculateDefense,
  calculateEncumbranceCritBonus,
  calculateCritChance,
  calculateDodgeChance,
  canDodge,
  calculateMissChance,
  resolveAttack,
  calculateDamage,
  parseDiceString,
  executeCombatRound,
  DEFAULT_RUNTIME_CONFIG,
  SPEED_DIVISOR_BASE,
  BASE_ENERGY_POOL,
  ENERGY_PER_DEX_ABOVE_50,
} from './combatCalculations.js';

// ============================================================================
// Weapon Cost (Speed Divisor)
// ============================================================================

describe('calculateEffectiveWeaponCost', () => {
  it('reduces cost as character level increases', () => {
    const costLvl1 = calculateEffectiveWeaponCost(5000, 1, 3);
    const costLvl10 = calculateEffectiveWeaponCost(5000, 10, 3);
    expect(costLvl10).toBeLessThan(costLvl1);
  });

  it('reduces cost as combat level increases', () => {
    const costCombat1 = calculateEffectiveWeaponCost(5000, 5, 1);
    const costCombat5 = calculateEffectiveWeaponCost(5000, 5, 5);
    expect(costCombat5).toBeLessThan(costCombat1);
  });

  it('produces integer result (floor)', () => {
    const cost = calculateEffectiveWeaponCost(5000, 3, 2);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it('handles level 1 combat 1 (minimum)', () => {
    const cost = calculateEffectiveWeaponCost(5000, 1, 1);
    // Speed divisor = 1.558 + 0.073 + 0.007 + 0.035 = 1.673
    // 5000 / 1.673 ≈ 2988
    expect(cost).toBeGreaterThan(2900);
    expect(cost).toBeLessThan(3100);
  });

  it('interaction: combat matters more at high levels', () => {
    // At level 1, difference between combat 1 and 5
    const lowLevelDiff = calculateEffectiveWeaponCost(5000, 1, 1) - calculateEffectiveWeaponCost(5000, 1, 5);
    // At level 10, difference between combat 1 and 5
    const highLevelDiff = calculateEffectiveWeaponCost(5000, 10, 1) - calculateEffectiveWeaponCost(5000, 10, 5);
    // The level-combat interaction means combat level matters more at higher character levels
    expect(highLevelDiff).toBeGreaterThan(lowLevelDiff);
  });
});

// ============================================================================
// Round Energy
// ============================================================================

describe('calculateRoundEnergy', () => {
  it('returns base energy at 50 DEX 50% encumbrance', () => {
    const energy = calculateRoundEnergy({
      combatLevel: 3,
      characterLevel: 5,
      dexterity: 50,
      encumbranceRatio: 0.5,
    });
    // DEX=50 → 0 bonus. Enc=50% → 1.0x modifier. Result = 1000
    expect(energy).toBe(BASE_ENERGY_POOL);
  });

  it('adds DEX bonus above 50', () => {
    const energy = calculateRoundEnergy({
      combatLevel: 3,
      characterLevel: 5,
      dexterity: 70,
      encumbranceRatio: 0.5,
    });
    // DEX bonus = (70-50) * 5 = 100. Total = 1100. Enc=1.0x → 1100
    expect(energy).toBe(BASE_ENERGY_POOL + 20 * ENERGY_PER_DEX_ABOVE_50);
  });

  it('no DEX bonus below 50', () => {
    const energy = calculateRoundEnergy({
      combatLevel: 3,
      characterLevel: 5,
      dexterity: 30,
      encumbranceRatio: 0.5,
    });
    expect(energy).toBe(BASE_ENERGY_POOL);
  });

  it('encumbrance 0% gives 1.5x bonus', () => {
    const energy = calculateRoundEnergy({
      combatLevel: 3,
      characterLevel: 5,
      dexterity: 50,
      encumbranceRatio: 0.0,
    });
    expect(energy).toBe(Math.floor(BASE_ENERGY_POOL * 1.5));
  });

  it('encumbrance 100% gives 0.5x penalty', () => {
    const energy = calculateRoundEnergy({
      combatLevel: 3,
      characterLevel: 5,
      dexterity: 50,
      encumbranceRatio: 1.0,
    });
    expect(energy).toBe(Math.floor(BASE_ENERGY_POOL * 0.5));
  });

  it('floors the result', () => {
    const energy = calculateRoundEnergy({
      combatLevel: 3,
      characterLevel: 5,
      dexterity: 51,
      encumbranceRatio: 0.33,
    });
    expect(Number.isInteger(energy)).toBe(true);
  });
});

// ============================================================================
// Swings
// ============================================================================

describe('calculateSwings', () => {
  it('divides energy by weapon speed', () => {
    const result = calculateSwings(1000, 200);
    expect(result.swings).toBe(5);
    expect(result.remainingEnergy).toBe(0);
  });

  it('returns remaining energy', () => {
    const result = calculateSwings(1050, 200);
    expect(result.swings).toBe(5);
    expect(result.remainingEnergy).toBe(50);
  });

  it('caps at maxAttacksPerRound', () => {
    const result = calculateSwings(100000, 100);
    expect(result.swings).toBe(DEFAULT_RUNTIME_CONFIG.maxAttacksPerRound);
  });

  it('converts excess attacks to bonus crit chance', () => {
    const maxAttacks = DEFAULT_RUNTIME_CONFIG.maxAttacksPerRound;
    // Give enough energy for maxAttacks + 3
    const speed = 100;
    const energy = speed * (maxAttacks + 3);
    const result = calculateSwings(energy, speed);
    expect(result.swings).toBe(maxAttacks);
    expect(result.bonusCritChance).toBe(3);
  });

  it('returns 0 swings for 0 energy', () => {
    const result = calculateSwings(0, 200);
    expect(result.swings).toBe(0);
  });

  it('prevents division by zero with weaponSpeed of 0', () => {
    // Should use min speed of 1
    const result = calculateSwings(100, 0);
    expect(result.swings).toBeGreaterThan(0);
  });
});

// ============================================================================
// Accuracy
// ============================================================================

describe('calculateAccuracy', () => {
  const baseFactors = {
    characterLevel: 5,
    combatLevel: 3,
    dexterity: 50,
    intelligence: 50,
    charisma: 50,
    equipmentBonus: 0,
    spellModifier: 0,
    encumbrancePenalty: 0,
    isBlind: false,
  };

  it('increases with character level', () => {
    const acc1 = calculateAccuracy({ ...baseFactors, characterLevel: 1 });
    const acc10 = calculateAccuracy({ ...baseFactors, characterLevel: 10 });
    expect(acc10).toBeGreaterThan(acc1);
  });

  it('increases with dexterity', () => {
    const accLow = calculateAccuracy({ ...baseFactors, dexterity: 30 });
    const accHigh = calculateAccuracy({ ...baseFactors, dexterity: 80 });
    expect(accHigh).toBeGreaterThan(accLow);
  });

  it('applies blind penalty (default)', () => {
    const normal = calculateAccuracy(baseFactors);
    const blind = calculateAccuracy({ ...baseFactors, isBlind: true });
    expect(blind).toBe(normal - 10);
  });

  it('applies configurable blind penalty', () => {
    const normal = calculateAccuracy(baseFactors);
    const blind25 = calculateAccuracy({ ...baseFactors, isBlind: true, blindPenaltyValue: 25 });
    expect(blind25).toBe(normal - 25);
  });

  it('applies encumbrance penalty', () => {
    const normal = calculateAccuracy(baseFactors);
    const encumbered = calculateAccuracy({ ...baseFactors, encumbrancePenalty: 5 });
    expect(encumbered).toBe(normal - 5);
  });

  it('adds equipment and spell bonuses', () => {
    const base = calculateAccuracy(baseFactors);
    const boosted = calculateAccuracy({ ...baseFactors, equipmentBonus: 10, spellModifier: 5 });
    expect(boosted).toBe(base + 15);
  });

  it('has minimum of 1', () => {
    const acc = calculateAccuracy({
      ...baseFactors,
      characterLevel: 1,
      combatLevel: 1,
      dexterity: 1,
      intelligence: 1,
      charisma: 1,
      encumbrancePenalty: 999,
    });
    expect(acc).toBe(1);
  });
});

// ============================================================================
// Defense
// ============================================================================

describe('calculateDefense', () => {
  it('sums armor class, perception, and bonuses', () => {
    const def = calculateDefense({
      armorClass: 20,
      perception: 10,
      shadow: 0,
      equipmentBonus: 5,
      spellModifier: 3,
    });
    expect(def).toBe(38);
  });

  it('adds +10 for shadow > 0', () => {
    const noShadow = calculateDefense({ armorClass: 20, perception: 10, shadow: 0, equipmentBonus: 0, spellModifier: 0 });
    const withShadow = calculateDefense({ armorClass: 20, perception: 10, shadow: 5, equipmentBonus: 0, spellModifier: 0 });
    expect(withShadow).toBe(noShadow + 10);
  });

  it('has minimum of 1', () => {
    const def = calculateDefense({ armorClass: 0, perception: 0, shadow: 0, equipmentBonus: 0, spellModifier: 0 });
    expect(def).toBe(1);
  });
});

// ============================================================================
// Encumbrance Crit Bonus
// ============================================================================

describe('calculateEncumbranceCritBonus', () => {
  it('returns 20 for very light encumbrance', () => {
    expect(calculateEncumbranceCritBonus(0.0)).toBe(20);
    expect(calculateEncumbranceCritBonus(0.1)).toBe(20);
  });

  it('returns 10 for medium encumbrance', () => {
    expect(calculateEncumbranceCritBonus(0.4)).toBe(10);
    expect(calculateEncumbranceCritBonus(0.65)).toBe(10);
  });

  it('returns 0 for heavy encumbrance', () => {
    expect(calculateEncumbranceCritBonus(0.7)).toBe(0);
    expect(calculateEncumbranceCritBonus(1.0)).toBe(0);
  });
});

// ============================================================================
// Crit Chance
// ============================================================================

describe('calculateCritChance', () => {
  const baseFactors = {
    characterLevel: 10,
    intelligence: 60,
    dexterity: 50,
    charisma: 50,
    classCritBonus: 0,
    weaponCritModifier: 0,
    equipmentCritBonus: 0,
    encumbranceRatio: 0.5,
  };

  it('increases with intelligence above 50', () => {
    const low = calculateCritChance({ ...baseFactors, intelligence: 50 });
    const high = calculateCritChance({ ...baseFactors, intelligence: 80 });
    expect(high).toBeGreaterThan(low);
  });

  it('applies class crit bonus', () => {
    const base = calculateCritChance(baseFactors);
    const ninja = calculateCritChance({ ...baseFactors, classCritBonus: 10 });
    expect(ninja).toBeGreaterThan(base);
  });

  it('applies soft cap at 37% with diminishing returns', () => {
    // Stack everything to exceed 37
    const result = calculateCritChance({
      characterLevel: 100,
      intelligence: 200,
      dexterity: 200,
      charisma: 200,
      classCritBonus: 20,
      weaponCritModifier: 10,
      equipmentCritBonus: 10,
      encumbranceRatio: 0.0,
    });
    // Should be above 37 but below what it would be without diminishing returns
    expect(result).toBeGreaterThan(37);
    expect(result).toBeLessThanOrEqual(60);
  });

  it('returns base 3% for minimum stats', () => {
    const result = calculateCritChance({
      characterLevel: 1,
      intelligence: 10,
      dexterity: 10,
      charisma: 10,
      classCritBonus: 0,
      weaponCritModifier: 0,
      equipmentCritBonus: 0,
      encumbranceRatio: 1.0,
    });
    expect(result).toBe(3);
  });

  it('increases with charisma above 50 (no negative)', () => {
    const base = calculateCritChance({ ...baseFactors, charisma: 50 });
    const high = calculateCritChance({ ...baseFactors, charisma: 100 });
    expect(high).toBeGreaterThan(base);
    // Below 50 should not reduce crit below base
    const low = calculateCritChance({ ...baseFactors, charisma: 10 });
    expect(low).toBe(base);
  });

  it('accepts optional critSoftCap parameter', () => {
    const factors = { ...baseFactors, classCritBonus: 30, intelligence: 100 };
    const defaultCap = calculateCritChance(factors);
    const customCap = calculateCritChance(factors, 20);
    // With a lower soft cap, more diminishing returns kick in
    expect(customCap).toBeLessThan(defaultCap);
  });
});

// ============================================================================
// Dodge
// ============================================================================

describe('calculateDodgeChance', () => {
  it('returns 0 if no dodge capability', () => {
    const result = calculateDodgeChance({
      classDodgeBonus: 0,
      raceDodgeBonus: 0,
      equipmentDodgeBonus: 0,
      agility: 80,
      charm: 80,
      attackerAccuracy: 50,
    });
    expect(result).toBe(0);
  });

  it('calculates dodge for a dodge-capable class', () => {
    const result = calculateDodgeChance({
      classDodgeBonus: 25,
      raceDodgeBonus: 0,
      equipmentDodgeBonus: 0,
      agility: 60,
      charm: 50,
      attackerAccuracy: 50,
    });
    expect(result).toBeGreaterThan(0);
  });

  it('increases with agility', () => {
    const base = { classDodgeBonus: 20, raceDodgeBonus: 0, equipmentDodgeBonus: 0, charm: 50, attackerAccuracy: 50 };
    const lowAgi = calculateDodgeChance({ ...base, agility: 30 });
    const highAgi = calculateDodgeChance({ ...base, agility: 80 });
    expect(highAgi).toBeGreaterThan(lowAgi);
  });

  it('returns 0 for very low attacker accuracy', () => {
    const result = calculateDodgeChance({
      classDodgeBonus: 25,
      raceDodgeBonus: 0,
      equipmentDodgeBonus: 0,
      agility: 80,
      charm: 80,
      attackerAccuracy: 0,
    });
    expect(result).toBe(0);
  });

  it('caps at 90%', () => {
    const result = calculateDodgeChance({
      classDodgeBonus: 100,
      raceDodgeBonus: 50,
      equipmentDodgeBonus: 50,
      agility: 200,
      charm: 200,
      attackerAccuracy: 1,
    });
    expect(result).toBeLessThanOrEqual(90);
  });
});

describe('canDodge', () => {
  it('returns true when any dodge bonus exists', () => {
    expect(canDodge(25, 0, 0)).toBe(true);
    expect(canDodge(0, 5, 0)).toBe(true);
    expect(canDodge(0, 0, 10)).toBe(true);
  });

  it('returns false when no dodge bonus', () => {
    expect(canDodge(0, 0, 0)).toBe(false);
  });
});

// ============================================================================
// Miss Chance
// ============================================================================

describe('calculateMissChance', () => {
  it('returns ~50% when accuracy equals defense', () => {
    const miss = calculateMissChance(100, 100);
    expect(miss).toBeCloseTo(0.5, 2);
  });

  it('returns ~20% when accuracy is double defense', () => {
    const miss = calculateMissChance(200, 100);
    expect(miss).toBeCloseTo(0.2, 2);
  });

  it('returns ~80% when defense is double accuracy', () => {
    const miss = calculateMissChance(100, 200);
    expect(miss).toBeCloseTo(0.8, 2);
  });

  it('clamps to minimum 5%', () => {
    const miss = calculateMissChance(10000, 1);
    expect(miss).toBe(0.05);
  });

  it('clamps to maximum 95%', () => {
    const miss = calculateMissChance(1, 10000);
    expect(miss).toBe(0.95);
  });

  it('handles 0 values (uses minimum 1)', () => {
    const miss = calculateMissChance(0, 0);
    expect(miss).toBeCloseTo(0.5, 2);
  });
});

// ============================================================================
// resolveAttack (uses RNG, test with seeded random)
// ============================================================================

describe('resolveAttack', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('can return HIT', () => {
    // Force no dodge, no miss, no crit
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)  // dodge roll → fails (99 >= any dodge chance)
      .mockReturnValueOnce(0.99)  // miss roll → hit (0.99 > typical miss chance)
      .mockReturnValueOnce(0.99); // crit roll → no crit (99 >= typical crit)
    expect(resolveAttack(100, 50, 5, 10)).toBe(AttackResult.HIT);
  });

  it('can return MISS', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)  // dodge roll → fails
      .mockReturnValueOnce(0.01); // miss roll → miss (very low)
    expect(resolveAttack(50, 100, 5, 10)).toBe(AttackResult.MISS);
  });

  it('can return CRITICAL', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)   // dodge roll → fails
      .mockReturnValueOnce(0.99)   // miss roll → hit
      .mockReturnValueOnce(0.001); // crit roll → critical (0.1 < 50)
    expect(resolveAttack(100, 50, 50, 10)).toBe(AttackResult.CRITICAL);
  });

  it('can return DODGE', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.001); // dodge roll → dodge (0.1 < 50)
    expect(resolveAttack(100, 50, 5, 50)).toBe(AttackResult.DODGE);
  });

  it('checks dodge before accuracy', () => {
    // Even with perfect accuracy, dodge can still avoid
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.001); // dodge succeeds
    expect(resolveAttack(99999, 1, 5, 50)).toBe(AttackResult.DODGE);
  });

  it('skips dodge check when dodgeChance is 0', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)   // miss roll
      .mockReturnValueOnce(0.99);  // crit roll
    expect(resolveAttack(100, 50, 5, 0)).toBe(AttackResult.HIT);
    // Only 2 calls (miss + crit), no dodge check
    expect(randomSpy).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Damage
// ============================================================================

describe('calculateDamage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates normal hit damage between min and max', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const dmg = calculateDamage(5, 15, false, 2.0, 0);
    expect(dmg).toBeGreaterThanOrEqual(5);
    expect(dmg).toBeLessThanOrEqual(15);
  });

  it('critical hits deal max damage plus a normal roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const dmg = calculateDamage(5, 20, true, 2.0, 0);
    // Crit = maxDamage + roll(min..max). With random=0.5: bonus = 5 + floor(0.5*16) = 13
    // Total = 20 + 13 = 33
    expect(dmg).toBeGreaterThanOrEqual(25); // 20 + 5
    expect(dmg).toBeLessThanOrEqual(40);    // 20 + 20
  });

  it('applies damage reduction', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const noArmor = calculateDamage(10, 20, false, 2.0, 0);
    const withArmor = calculateDamage(10, 20, false, 2.0, 5);
    expect(withArmor).toBe(noArmor - 5);
  });

  it('minimum damage is 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const dmg = calculateDamage(1, 1, false, 2.0, 100);
    expect(dmg).toBe(1);
  });
});

// ============================================================================
// Dice String Parser
// ============================================================================

describe('parseDiceString', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses basic dice notation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = parseDiceString('2d6');
    expect(result.min).toBe(2);   // 2 dice * 1
    expect(result.max).toBe(12);  // 2 dice * 6
    expect(result.roll).toBeGreaterThanOrEqual(2);
    expect(result.roll).toBeLessThanOrEqual(12);
  });

  it('parses dice with positive modifier', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = parseDiceString('1d8+3');
    expect(result.min).toBe(4);  // 1 + 3
    expect(result.max).toBe(11); // 8 + 3
  });

  it('parses dice with negative modifier', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = parseDiceString('3d6-2');
    expect(result.min).toBe(Math.max(1, 3 - 2)); // min is clamped to 1
    expect(result.max).toBe(16); // 18 - 2
  });

  it('returns 1d4 for invalid notation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = parseDiceString('invalid');
    expect(result.min).toBe(1);
    expect(result.max).toBe(4);
  });

  it('clamps min to at least 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const result = parseDiceString('1d4-10');
    expect(result.min).toBe(1); // Would be -9 without clamp
  });
});

// ============================================================================
// executeCombatRound
// ============================================================================

describe('executeCombatRound', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('produces the correct number of swings', () => {
    // All hits, no crits
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = executeCombatRound(
      'Attacker', 'Defender',
      100, 50,     // accuracy >> defense
      1000, 0,     // energy, carried
      250,         // weapon speed → 4 swings
      0,           // no crit
      5, 10,       // damage range
      2.0, 0,      // crit mult, DR
    );
    expect(result.swings.length).toBe(4);
    expect(result.totalDamage).toBeGreaterThan(0);
  });

  it('stops attacking if defender HP reaches 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = executeCombatRound(
      'Attacker', 'Defender',
      100, 50,
      10000, 0,
      100,
      0,
      50, 100,      // high damage
      2.0, 0,
      DEFAULT_RUNTIME_CONFIG,
      10,           // defender only has 10 HP
    );
    // Should stop before using all swings
    expect(result.swings.length).toBeLessThan(DEFAULT_RUNTIME_CONFIG.maxAttacksPerRound);
    expect(result.totalDamage).toBeGreaterThanOrEqual(10);
  });

  it('returns remaining energy', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = executeCombatRound(
      'Attacker', 'Defender',
      100, 50,
      550, 0,
      200,
      0,
      5, 10,
      2.0, 0,
    );
    // 550 / 200 = 2 swings, 150 remaining
    expect(result.remainingEnergy).toBe(150);
  });

  it('includes carried energy', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = executeCombatRound(
      'Attacker', 'Defender',
      100, 50,
      200, 300,    // 200 base + 300 carried = 500
      250,         // 500 / 250 = 2 swings
      0,
      5, 10,
      2.0, 0,
    );
    expect(result.swings.length).toBe(2);
  });
});
