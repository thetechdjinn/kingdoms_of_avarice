/**
 * Shared currency denomination utilities for wallet operations.
 * Used by bankCommands and merchantCommands.
 */

import type { Currency } from '@koa/shared';

/** Copper value per denomination unit */
export const DENOMINATION_COPPER_VALUE: Record<string, number> = {
  copper: 1,
  silver: 10,
  gold: 100,
  platinum: 1000,
  runic: 100000,
};

/** Denomination order from lowest to highest for wallet deduction */
export const DENOMINATIONS_LOW_TO_HIGH: { field: keyof Currency; copperValue: number }[] = [
  { field: 'copper', copperValue: 1 },
  { field: 'silver', copperValue: 10 },
  { field: 'gold', copperValue: 100 },
  { field: 'platinum', copperValue: 1000 },
  { field: 'runic', copperValue: 100000 },
];

/**
 * Calculate which coins to remove from a wallet to cover a copper amount.
 * Deducts from lowest denominations first, making change from higher ones as needed.
 * Caller must verify totalWealth >= copperAmount before calling.
 *
 * Returns deduction pairs: positive values are coins spent, negative values are change returned.
 */
export function deductCopperFromWallet(
  currency: Currency,
  copperAmount: number
): [keyof Currency, number][] {
  const wallet: Record<keyof Currency, number> = {
    copper: currency.copper ?? 0,
    silver: currency.silver ?? 0,
    gold: currency.gold ?? 0,
    platinum: currency.platinum ?? 0,
    runic: currency.runic ?? 0,
  };

  let remaining = copperAmount;
  const spent: Record<keyof Currency, number> = { copper: 0, silver: 0, gold: 0, platinum: 0, runic: 0 };

  // Pass 1: consume from lowest denominations first
  for (const { field, copperValue } of DENOMINATIONS_LOW_TO_HIGH) {
    if (remaining <= 0) break;
    const canSpend = Math.min(wallet[field], Math.floor(remaining / copperValue));
    if (canSpend > 0) {
      spent[field] += canSpend;
      wallet[field] -= canSpend;
      remaining -= canSpend * copperValue;
    }
  }

  // Pass 2: if there's still a remainder, break a higher coin
  if (remaining > 0) {
    for (const { field, copperValue } of DENOMINATIONS_LOW_TO_HIGH) {
      if (wallet[field] > 0 && copperValue >= remaining) {
        spent[field] += 1;
        const change = copperValue - remaining;
        wallet[field] -= 1;
        remaining = 0;

        let changeLeft = change;
        for (let i = DENOMINATIONS_LOW_TO_HIGH.length - 1; i >= 0; i--) {
          const lower = DENOMINATIONS_LOW_TO_HIGH[i];
          if (lower.copperValue <= changeLeft) {
            const changeCoins = Math.floor(changeLeft / lower.copperValue);
            if (changeCoins > 0) {
              spent[lower.field] -= changeCoins;
              changeLeft -= changeCoins * lower.copperValue;
            }
          }
        }
        break;
      }
    }
  }

  return (Object.entries(spent) as [keyof Currency, number][]).filter(([, qty]) => qty !== 0);
}
