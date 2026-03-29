/**
 * Unit tests for HP, Mana, and Spellcasting formulas.
 *
 * Validates against confirmed MajorMUD reference data from
 * notes/Health_and_Mana_Correction.md
 */

import { describe, it, expect } from 'vitest';
import {
  calculateStartingHp,
  getConBreakpointBonus,
  getRaceHpPerLevelBonus,
  rollLevelUpHp,
  calculateSpellcasting,
} from '@koa/shared';
import { spellCastSucceeds } from './combat.js';

// ============================================================================
// Phase 1: HP System
// ============================================================================

describe('getConBreakpointBonus', () => {
  it('returns 0 below 70', () => {
    expect(getConBreakpointBonus(40)).toBe(0);
    expect(getConBreakpointBonus(50)).toBe(0);
    expect(getConBreakpointBonus(69)).toBe(0);
  });

  it('returns 1 at 70-84', () => {
    expect(getConBreakpointBonus(70)).toBe(1);
    expect(getConBreakpointBonus(75)).toBe(1);
    expect(getConBreakpointBonus(84)).toBe(1);
  });

  it('returns 2 at 85-99', () => {
    expect(getConBreakpointBonus(85)).toBe(2);
    expect(getConBreakpointBonus(90)).toBe(2);
    expect(getConBreakpointBonus(99)).toBe(2);
  });

  it('returns 3 at 100+', () => {
    expect(getConBreakpointBonus(100)).toBe(3);
    expect(getConBreakpointBonus(120)).toBe(3);
    expect(getConBreakpointBonus(150)).toBe(3);
  });
});

describe('calculateStartingHp', () => {
  // Goblin Mage: race base 26, race CON 40, class hp_adj 0
  describe('Goblin Mage (base 26, CON base 40, adj 0)', () => {
    const raceBaseHp = 26;
    const raceBaseCon = 40;
    const classHpAdj = 0;

    it.each([
      [40, 26], [45, 28], [50, 31], [55, 33],
      [60, 36], [65, 38], [70, 42], [75, 44],
      [80, 47],
    ])('CON %i → %i HP', (con, expected) => {
      expect(calculateStartingHp(raceBaseHp, raceBaseCon, classHpAdj, con)).toBe(expected);
    });
  });

  // Half-Ogre Warrior: race base 37, race CON 60, class hp_adj 4
  // Plan shows base 41 (37 + 4) then CON scaling from 60
  describe('Half-Ogre Warrior (base 37, CON base 60, adj 4)', () => {
    const raceBaseHp = 37;
    const raceBaseCon = 60;
    const classHpAdj = 4;

    it.each([
      [60, 41], [65, 43], [70, 47], [75, 49],
      [80, 52], [85, 55], [90, 58], [95, 60],
      [100, 64],
    ])('CON %i → %i HP', (con, expected) => {
      expect(calculateStartingHp(raceBaseHp, raceBaseCon, classHpAdj, con)).toBe(expected);
    });
  });

  // Other confirmed baselines
  it('Human Warrior (CON 40) → 30 HP', () => {
    expect(calculateStartingHp(26, 40, 4, 40)).toBe(30);
  });

  it('Dark Elf Paladin (CON 30) → 23 HP', () => {
    expect(calculateStartingHp(20, 30, 3, 30)).toBe(23);
  });

  it('Human Thief (CON 40) → 27 HP', () => {
    expect(calculateStartingHp(26, 40, 1, 40)).toBe(27);
  });

  it('Halfling Thief (CON 40) → 26 HP', () => {
    expect(calculateStartingHp(25, 40, 1, 40)).toBe(26);
  });
});

describe('getRaceHpPerLevelBonus', () => {
  it('returns +1 for Half-Ogre hp_per_level trait', () => {
    const traits = [{ id: 'hp_per_level', value: 1 }];
    expect(getRaceHpPerLevelBonus(traits)).toBe(1);
  });

  it('returns -1 for Halfling hp_per_level trait', () => {
    const traits = [{ id: 'hp_per_level', value: -1 }];
    expect(getRaceHpPerLevelBonus(traits)).toBe(-1);
  });

  it('returns 0 for races without the trait', () => {
    expect(getRaceHpPerLevelBonus([])).toBe(0);
    expect(getRaceHpPerLevelBonus([{ id: 'mana_bonus', value: 10 }])).toBe(0);
    expect(getRaceHpPerLevelBonus(undefined)).toBe(0);
  });
});

describe('rollLevelUpHp', () => {
  // We can't test exact random rolls, but we can test the range bounds

  it('Warrior CON < 70, no race bonus: range 6-10', () => {
    for (let i = 0; i < 100; i++) {
      const hp = rollLevelUpHp(6, 10, 60, 0);
      expect(hp).toBeGreaterThanOrEqual(6);
      expect(hp).toBeLessThanOrEqual(10);
    }
  });

  it('Warrior CON 70, no race bonus: range 7-11 (breakpoint +1)', () => {
    for (let i = 0; i < 100; i++) {
      const hp = rollLevelUpHp(6, 10, 70, 0);
      expect(hp).toBeGreaterThanOrEqual(7);
      expect(hp).toBeLessThanOrEqual(11);
    }
  });

  it('Warrior CON 100, no race bonus: range 9-13 (breakpoint +3)', () => {
    for (let i = 0; i < 100; i++) {
      const hp = rollLevelUpHp(6, 10, 100, 0);
      expect(hp).toBeGreaterThanOrEqual(9);
      expect(hp).toBeLessThanOrEqual(13);
    }
  });

  it('Half-Ogre Warrior CON 70: range 8-12 (breakpoint +1, race +1)', () => {
    for (let i = 0; i < 100; i++) {
      const hp = rollLevelUpHp(6, 10, 70, 1);
      expect(hp).toBeGreaterThanOrEqual(8);
      expect(hp).toBeLessThanOrEqual(12);
    }
  });

  it('Halfling Thief CON < 70: range 3-6 (race -1)', () => {
    for (let i = 0; i < 100; i++) {
      const hp = rollLevelUpHp(4, 7, 60, -1);
      expect(hp).toBeGreaterThanOrEqual(3);
      expect(hp).toBeLessThanOrEqual(6);
    }
  });

  it('Mage CON 100, no race bonus: range 6-9 (breakpoint +3)', () => {
    for (let i = 0; i < 100; i++) {
      const hp = rollLevelUpHp(3, 6, 100, 0);
      expect(hp).toBeGreaterThanOrEqual(6);
      expect(hp).toBeLessThanOrEqual(9);
    }
  });
});

// ============================================================================
// Phase 2: Mana System
// ============================================================================

describe('Mana formulas (flat by magic level)', () => {
  // These are implicitly tested through the characterRepository integration,
  // but we document the expected values here for reference.

  it('magic level 3 base mana = 12', () => {
    // baseMana = magicLevel * 2 + 6 = 3*2+6 = 12
    expect(3 * 2 + 6).toBe(12);
  });

  it('magic level 2 base mana = 10', () => {
    expect(2 * 2 + 6).toBe(10);
  });

  it('magic level 1 base mana = 8', () => {
    expect(1 * 2 + 6).toBe(8);
  });

  it('Elf/Half-Elf mana bonus = +10', () => {
    // Elf Mage: 12 + 10 = 22 starting mana
    expect(12 + 10).toBe(22);
  });

  it('mana per level: magic 3 = +6, magic 2 = +4, magic 1 = +2', () => {
    expect(3 * 2).toBe(6);
    expect(2 * 2).toBe(4);
    expect(1 * 2).toBe(2);
  });

  // Verified progression from plan
  it('Human Mage mana progression: L1=12, L2=18, L3=24, L4=30, L5=36', () => {
    const base = 12;
    const perLevel = 6;
    for (let lv = 1; lv <= 5; lv++) {
      expect(base + (lv - 1) * perLevel).toBe([12, 18, 24, 30, 36][lv - 1]);
    }
  });

  it('Human Cleric mana progression: L1=10, L2=14, L3=18, L4=22, L5=26', () => {
    const base = 10;
    const perLevel = 4;
    for (let lv = 1; lv <= 5; lv++) {
      expect(base + (lv - 1) * perLevel).toBe([10, 14, 18, 22, 26][lv - 1]);
    }
  });

  it('Human Paladin mana progression: L1=8, L2=10, L3=12, L4=14, L5=16', () => {
    const base = 8;
    const perLevel = 2;
    for (let lv = 1; lv <= 5; lv++) {
      expect(base + (lv - 1) * perLevel).toBe([8, 10, 12, 14, 16][lv - 1]);
    }
  });

  it('Human Mystic kai progression: L1=0, L2=1, L3=2, L4=3, L5=4', () => {
    const base = 0;
    const perLevel = 1;
    for (let lv = 1; lv <= 5; lv++) {
      expect(base + (lv - 1) * perLevel).toBe([0, 1, 2, 3, 4][lv - 1]);
    }
  });
});

// ============================================================================
// Phase 3: Spellcasting / Fizzle
// ============================================================================

describe('calculateSpellcasting', () => {
  // Human race base stats: all 40
  const humanBase = { intelligence: 40, wisdom: 40, charisma: 40 };

  describe('single-stat classes', () => {
    it('Mage (magic 3) INT 40, level 1 → SP 43', () => {
      expect(calculateSpellcasting(3, 'mage', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(43);
    });

    it('Mage (magic 3) INT 80, level 1 → SP 63', () => {
      expect(calculateSpellcasting(3, 'mage', { intelligence: 80, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(63);
    });

    it('Priest (magic 3) WIS 40, level 1 → SP 43', () => {
      expect(calculateSpellcasting(3, 'priest', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(43);
    });

    it('Cleric (magic 2) WIS 40, level 1 → SP 38', () => {
      expect(calculateSpellcasting(2, 'priest', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(38);
    });

    it('Paladin (magic 1) WIS 40, level 1 → SP 33', () => {
      expect(calculateSpellcasting(1, 'priest', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(33);
    });
  });

  describe('SP per level (+2)', () => {
    it('Mage INT 40: level 1 → 43, level 5 → 51, level 10 → 61', () => {
      const stats = { intelligence: 40, wisdom: 40, charisma: 40 };
      expect(calculateSpellcasting(3, 'mage', stats, humanBase, 1)).toBe(43);
      expect(calculateSpellcasting(3, 'mage', stats, humanBase, 5)).toBe(51);
      expect(calculateSpellcasting(3, 'mage', stats, humanBase, 10)).toBe(61);
    });
  });

  describe('magic level 0 returns 0', () => {
    it('Warrior has no spellcasting', () => {
      expect(calculateSpellcasting(0, undefined, { intelligence: 80, wisdom: 80, charisma: 80 }, humanBase, 20)).toBe(0);
    });
  });

  describe('equipment bonus', () => {
    it('adds equipment spellcasting bonus to SP', () => {
      const base = calculateSpellcasting(3, 'mage', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 1);
      const withBonus = calculateSpellcasting(3, 'mage', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 1, 5);
      expect(withBonus - base).toBe(5);
    });
  });

  // Druid verified data from plan
  describe('Druid dual-stat (0.35/point each)', () => {
    it('INT 40, WIS 40 → SP 43', () => {
      expect(calculateSpellcasting(3, 'druid', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(43);
    });

    it('INT 60, WIS 40 → SP 50', () => {
      expect(calculateSpellcasting(3, 'druid', { intelligence: 60, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(50);
    });

    it('INT 80, WIS 40 → SP 57', () => {
      expect(calculateSpellcasting(3, 'druid', { intelligence: 80, wisdom: 40, charisma: 40 }, humanBase, 1)).toBe(57);
    });

    it('INT 40, WIS 60 → SP 50 (symmetric)', () => {
      expect(calculateSpellcasting(3, 'druid', { intelligence: 40, wisdom: 60, charisma: 40 }, humanBase, 1)).toBe(50);
    });

    it('INT 50, WIS 50 → SP 50 (balanced)', () => {
      expect(calculateSpellcasting(3, 'druid', { intelligence: 50, wisdom: 50, charisma: 40 }, humanBase, 1)).toBe(50);
    });

    it('INT 60, WIS 60 → SP 57 (balanced)', () => {
      expect(calculateSpellcasting(3, 'druid', { intelligence: 60, wisdom: 60, charisma: 40 }, humanBase, 1)).toBe(57);
    });

    it('INT 65, WIS 65 → SP 60 (balanced)', () => {
      expect(calculateSpellcasting(3, 'druid', { intelligence: 65, wisdom: 65, charisma: 40 }, humanBase, 1)).toBe(60);
    });
  });

  // Plan examples for fizzle context
  describe('plan fizzle examples', () => {
    it('Level 3 Paladin (magic 1, WIS 40) → SP 37', () => {
      expect(calculateSpellcasting(1, 'priest', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 3)).toBe(37);
    });

    it('Level 22 Mage INT 40 → SP 85', () => {
      expect(calculateSpellcasting(3, 'mage', { intelligence: 40, wisdom: 40, charisma: 40 }, humanBase, 22)).toBe(85);
    });

    it('Level 22 Mage INT 80 → SP 105', () => {
      expect(calculateSpellcasting(3, 'mage', { intelligence: 80, wisdom: 40, charisma: 40 }, humanBase, 22)).toBe(105);
    });

    it('Level 30 Mage INT 80 → SP 121', () => {
      expect(calculateSpellcasting(3, 'mage', { intelligence: 80, wisdom: 40, charisma: 40 }, humanBase, 30)).toBe(121);
    });

    it('Level 40 Mage INT 80 → SP 141', () => {
      expect(calculateSpellcasting(3, 'mage', { intelligence: 80, wisdom: 40, charisma: 40 }, humanBase, 40)).toBe(141);
    });

    it('Level 40 Mage INT 120 → SP 161', () => {
      expect(calculateSpellcasting(3, 'mage', { intelligence: 120, wisdom: 40, charisma: 40 }, humanBase, 40)).toBe(161);
    });
  });
});

describe('spellCastSucceeds', () => {
  it('item-cast (difficulty 100) always succeeds', () => {
    for (let i = 0; i < 100; i++) {
      expect(spellCastSucceeds(100, 0)).toBe(true);
      expect(spellCastSucceeds(100, 50)).toBe(true);
    }
  });

  it('castChance 0 or negative always fails (roll always >= 1)', () => {
    // SP 10, difficulty -50 → castChance = -40. Roll 1-100, need roll <= -40 → impossible
    // (except 3% auto-fizzle is moot since it would fail anyway)
    let anySuccess = false;
    for (let i = 0; i < 500; i++) {
      if (spellCastSucceeds(-50, 10)) anySuccess = true;
    }
    expect(anySuccess).toBe(false);
  });

  it('castChance 97 succeeds ~97% of the time', () => {
    // SP 82, difficulty 15 → castChance = 97
    // Rolls 1-97 pass castChance and are below auto-fizzle threshold (98+), so all succeed.
    // Auto-fizzle only reduces success when castChance > 97.
    let successes = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (spellCastSucceeds(15, 82)) successes++;
    }
    const rate = successes / trials;
    expect(rate).toBeGreaterThan(0.93);
    expect(rate).toBeLessThan(1.0);
  });

  it('positive difficulty makes spells easier', () => {
    // SP 43, difficulty +15 → castChance = 58
    // Rolls 1-58 succeed. Rolls 59-97 fail castChance. Rolls 98-100 auto-fizzle.
    // Auto-fizzle has no additional effect since 98-100 > 58 anyway. Success rate = 58%.
    let successes = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (spellCastSucceeds(15, 43)) successes++;
    }
    const rate = successes / trials;
    expect(rate).toBeGreaterThan(0.52);
    expect(rate).toBeLessThan(0.64);
  });

  it('negative difficulty makes spells harder', () => {
    // SP 85, difficulty -50 → 35% success
    let successes = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (spellCastSucceeds(-50, 85)) successes++;
    }
    const rate = successes / trials;
    // Expected ~35% (rolls 1-35 pass, rolls 98-100 auto-fail)
    expect(rate).toBeGreaterThan(0.29);
    expect(rate).toBeLessThan(0.41);
  });
});
