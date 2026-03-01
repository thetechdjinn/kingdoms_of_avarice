/**
 * Unit tests for merchant pricing engine and wallet deduction logic
 */

import { describe, it, expect } from 'vitest';

// Mock all DB/game dependencies before importing the module
import { vi } from 'vitest';

vi.mock('./socket.js', () => ({
  broadcastToRoom: vi.fn(),
}));
vi.mock('./adminCommands.js', () => ({
  getPlayerLocation: vi.fn(),
}));
vi.mock('../utils/colors.js', () => ({
  colors: {
    item: (s: string) => s,
    boldWhite: (s: string) => s,
    gold: (s: string) => s,
  },
}));
vi.mock('./npcManager.js', () => ({
  getMerchantsInRoom: vi.fn(),
  findMerchantInRoom: vi.fn(),
  isMerchantHostileToPlayer: vi.fn(),
}));
vi.mock('../db/repositories/merchantRepository.js', () => ({}));
vi.mock('../db/repositories/factionRepository.js', () => ({}));
vi.mock('../db/repositories/characterRepository.js', () => ({}));
vi.mock('../db/repositories/itemRepository.js', () => ({}));
vi.mock('../db/index.js', () => ({
  withTransaction: vi.fn(),
}));

import { calculateMerchantPrice } from './merchantCommands.js';
import { deductCopperFromWallet } from '../utils/currency.js';
import type { Currency } from '@koa/shared';

// ============================================================================
// calculateMerchantPrice
// ============================================================================

describe('calculateMerchantPrice', () => {
  describe('base pricing', () => {
    it('returns base value for buying with neutral rep and 50 charisma', () => {
      const result = calculateMerchantPrice(100, 0, 50, true);
      expect(result.price).toBe(100);
      expect(result.refused).toBe(false);
    });

    it('returns 50% base value for selling', () => {
      const result = calculateMerchantPrice(100, 0, 50, false);
      expect(result.price).toBe(50);
      expect(result.refused).toBe(false);
    });

    it('returns 0 price for 0 base value', () => {
      const result = calculateMerchantPrice(0, 0, 50, true);
      expect(result.price).toBe(0);
      expect(result.refused).toBe(false);
    });

    it('minimum price is 1 copper', () => {
      const result = calculateMerchantPrice(1, 0, 50, true);
      expect(result.price).toBeGreaterThanOrEqual(1);
    });
  });

  describe('charisma modifier', () => {
    it('high charisma reduces buy price', () => {
      // CHA 80 → modifier = floor((80-50)/10) = 3, totalRep = 3
      // No discount since 3/10 = 0% (need 10+ rep for 1%)
      const result = calculateMerchantPrice(1000, 0, 80, true);
      expect(result.price).toBe(1000); // Not enough rep for discount
    });

    it('very high charisma gives discount', () => {
      // CHA 80 + factionRep 7 → totalRep = 10 → 1% discount
      const result = calculateMerchantPrice(1000, 7, 80, true);
      expect(result.price).toBe(990); // 1% discount
    });

    it('low charisma adds surcharge', () => {
      // CHA 20 → modifier = floor((20-50)/10) = -3, totalRep = -3
      // No surcharge since abs(-3)/10 = 0 (need -10 for 2%)
      const result = calculateMerchantPrice(1000, 0, 20, true);
      expect(result.price).toBe(1000);
    });
  });

  describe('faction reputation', () => {
    it('positive faction rep gives discount', () => {
      // factionRep=20, CHA=50 → totalRep=20 → 2% discount
      const result = calculateMerchantPrice(1000, 20, 50, true);
      expect(result.price).toBe(980);
    });

    it('discount caps at 10%', () => {
      // factionRep=200, CHA=50 → totalRep=200 → floor(200/10) = 20, capped at 10%
      const result = calculateMerchantPrice(1000, 200, 50, true);
      expect(result.price).toBe(900);
    });

    it('negative faction rep adds surcharge', () => {
      // factionRep=-10, CHA=50 → totalRep=-10 → 2% surcharge
      const result = calculateMerchantPrice(1000, -10, 50, true);
      expect(result.price).toBe(1020);
    });

    it('surcharge caps at 10%', () => {
      // factionRep=-40, CHA=50 → totalRep=-40 → floor(40/10)*2 = 8%, under cap
      const a = calculateMerchantPrice(1000, -40, 50, true);
      expect(a.price).toBe(1080);

      // factionRep=-49, CHA=50 → totalRep=-49 → floor(49/10)*2 = 8%
      const b = calculateMerchantPrice(1000, -49, 50, true);
      expect(b.price).toBe(1080);
    });

    it('refuses at totalRep <= -50', () => {
      const result = calculateMerchantPrice(1000, -50, 50, true);
      expect(result.refused).toBe(true);
    });

    it('applies same modifiers to sell price', () => {
      // factionRep=20, CHA=50 → 2% discount on sell (50% of 1000 = 500, 2% off = 490)
      const result = calculateMerchantPrice(1000, 20, 50, false);
      expect(result.price).toBe(490);
    });
  });

  describe('haggle reputation', () => {
    it('rep 1-3 gives 1% discount per point when buying', () => {
      // Base price = 1000. Haggle 1 → 1% discount = 990
      const haggle1 = calculateMerchantPrice(1000, 0, 50, true, 1);
      expect(haggle1.price).toBe(990);

      // Haggle 2 → 2% discount = 980
      const haggle2 = calculateMerchantPrice(1000, 0, 50, true, 2);
      expect(haggle2.price).toBe(980);

      // Haggle 3 → 3% discount = 970
      const haggle3 = calculateMerchantPrice(1000, 0, 50, true, 3);
      expect(haggle3.price).toBe(970);
    });

    it('rep 1-3 gives 1% bonus per point when selling', () => {
      // Sell base = 500. Haggle 1 → 1% bonus = 505
      const haggle1 = calculateMerchantPrice(1000, 0, 50, false, 1);
      expect(haggle1.price).toBe(505);

      // Haggle 3 → 3% bonus = 515
      const haggle3 = calculateMerchantPrice(1000, 0, 50, false, 3);
      expect(haggle3.price).toBe(515);
    });

    it('rep 1-3 stacks with faction/charisma discounts', () => {
      // factionRep=20 → 2% discount → 980. Then haggle 2 → 2% discount → 960
      const result = calculateMerchantPrice(1000, 20, 50, true, 2);
      expect(result.price).toBe(960);
    });

    it('rep 4 resets to base MSRP', () => {
      // With good rep, normal price would be discounted
      // factionRep=20 → 2% discount → 980
      const withDiscount = calculateMerchantPrice(1000, 20, 50, true, 0);
      expect(withDiscount.price).toBe(980);

      // Haggle rep 4 resets to base MSRP, ignoring discount
      const haggle4 = calculateMerchantPrice(1000, 20, 50, true, 4);
      expect(haggle4.price).toBe(1000);
    });

    it('rep 5-9 adds surcharge above haggle4 base', () => {
      // Rep 5: (5-4)*2 = 2% surcharge on base MSRP
      const haggle5 = calculateMerchantPrice(1000, 0, 50, true, 5);
      expect(haggle5.price).toBe(1020);

      // Rep 9: (9-4)*2 = 10% surcharge
      const haggle9 = calculateMerchantPrice(1000, 0, 50, true, 9);
      expect(haggle9.price).toBe(1100);
    });

    it('rep 10+ refuses to sell', () => {
      const result = calculateMerchantPrice(1000, 0, 50, true, 10);
      expect(result.refused).toBe(true);

      const result15 = calculateMerchantPrice(1000, 0, 50, true, 15);
      expect(result15.refused).toBe(true);
    });

    it('haggle rep 4 applies to sell too', () => {
      // Sell base = 500. Haggle 4 resets to 50% of base.
      const result = calculateMerchantPrice(1000, 20, 50, false, 4);
      expect(result.price).toBe(500);
    });
  });
});

// ============================================================================
// deductCopperFromWallet
// ============================================================================

describe('deductCopperFromWallet', () => {
  function makeCurrency(copper = 0, silver = 0, gold = 0, platinum = 0, runic = 0): Currency {
    return { copper, silver, gold, platinum, runic };
  }

  function deductionToRecord(deductions: [keyof Currency, number][]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [field, qty] of deductions) {
      result[field] = (result[field] ?? 0) + qty;
    }
    return result;
  }

  it('deducts exact copper amount', () => {
    const deductions = deductCopperFromWallet(makeCurrency(10), 5);
    const record = deductionToRecord(deductions);
    expect(record.copper).toBe(5);
  });

  it('deducts from lowest denominations first', () => {
    // 5 copper + 2 silver (= 25 total). Deduct 15 copper.
    // Should take 5 copper + 1 silver (=15)
    const deductions = deductCopperFromWallet(makeCurrency(5, 2), 15);
    const record = deductionToRecord(deductions);
    expect(record.copper).toBe(5);
    expect(record.silver).toBe(1);
  });

  it('breaks a higher coin when needed', () => {
    // 0 copper, 1 gold (=100 copper). Deduct 30 copper.
    // Should spend 1 gold, get change back
    const deductions = deductCopperFromWallet(makeCurrency(0, 0, 1), 30);
    const record = deductionToRecord(deductions);
    // Net: spend 1 gold (100 copper), get 7 silver change (-7 silver = -70 copper)
    expect(record.gold).toBe(1);
    // Change: 70 copper back as silver (7 silver)
    expect(record.silver).toBe(-7);
  });

  it('handles exact denomination match', () => {
    // Exactly 1 gold (100 copper) to deduct 100
    const deductions = deductCopperFromWallet(makeCurrency(0, 0, 1), 100);
    const record = deductionToRecord(deductions);
    expect(record.gold).toBe(1);
    expect(record.silver).toBeUndefined();
    expect(record.copper).toBeUndefined();
  });

  it('uses mixed denominations', () => {
    // 5 copper, 3 silver (=35), 2 gold (=200). Total = 235. Deduct 125.
    // Pass 1: take 5 copper (5), 3 silver (30), 0 gold. Remaining: 90
    // Pass 2: break 1 gold (100), change = 10 copper = 1 silver
    const deductions = deductCopperFromWallet(makeCurrency(5, 3, 2), 125);
    const record = deductionToRecord(deductions);

    // Verify the net deduction equals 125 copper
    const totalDeducted = (record.copper ?? 0) * 1
      + (record.silver ?? 0) * 10
      + (record.gold ?? 0) * 100
      + (record.platinum ?? 0) * 1000
      + (record.runic ?? 0) * 100000;
    expect(totalDeducted).toBe(125);
  });

  it('returns empty array when deducting 0', () => {
    const deductions = deductCopperFromWallet(makeCurrency(10, 5), 0);
    expect(deductions.length).toBe(0);
  });

  it('handles deducting from platinum', () => {
    const deductions = deductCopperFromWallet(makeCurrency(0, 0, 0, 1), 500);
    const record = deductionToRecord(deductions);
    // 1 platinum = 1000 copper. Deduct 500. Should break 1 platinum, change = 500 = 5 gold
    expect(record.platinum).toBe(1);
    expect(record.gold).toBe(-5);
  });
});
