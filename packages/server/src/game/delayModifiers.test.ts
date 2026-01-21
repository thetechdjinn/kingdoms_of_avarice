/**
 * Unit tests for delayModifiers module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('./statusEffects.js', () => ({
  getEffectDefinition: vi.fn(),
}));

vi.mock('../config/commandQueueConfig.js', () => ({
  getCommandQueueConfig: vi.fn(),
}));

import {
  extractDelayModifiers,
  applyStackingRules,
  getStatusEffectDelayMultiplier,
  getDelayModifierDescriptions,
  type DelayModifier,
} from './delayModifiers.js';
import { getEffectDefinition } from './statusEffects.js';
import { getCommandQueueConfig } from '../config/commandQueueConfig.js';
import type { AuthenticatedSocket } from './socket.js';

// Default config with stacking rules
const defaultConfig = {
  stackingRules: {
    haste: { rule: 'bestOnly', category: 'speedBuff' },
    slow: { rule: 'worstOnly', category: 'speedDebuff' },
    encumbrance: { rule: 'multiplicative' },
    equipment: { rule: 'multiplicative', cap: { min: 0.5, max: 2.0 } },
  },
};

// Helper to create mock player with active effects
function createMockPlayer(
  effects: Map<string, { expiresAt: number; stacks: number }> = new Map()
): AuthenticatedSocket {
  return {
    activeEffects: effects,
  } as AuthenticatedSocket;
}

describe('delayModifiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    vi.mocked(getCommandQueueConfig).mockReturnValue(defaultConfig as any);
  });

  describe('extractDelayModifiers', () => {
    it('returns empty array when player has no active effects', () => {
      const player = createMockPlayer();
      player.activeEffects = undefined as any;

      const modifiers = extractDelayModifiers(player);

      expect(modifiers).toEqual([]);
    });

    it('returns empty array when all effects are expired', () => {
      const effects = new Map([
        ['hasted', { expiresAt: 5000, stacks: 1 }], // Expired
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockReturnValue({
        id: 'hasted',
        name: 'Hasted',
        speedModifier: -20,
      } as any);

      const modifiers = extractDelayModifiers(player);

      expect(modifiers).toEqual([]);
    });

    it('extracts speed modifier from active effect', () => {
      const effects = new Map([
        ['hasted', { expiresAt: 20000, stacks: 1 }],
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockReturnValue({
        id: 'hasted',
        name: 'Hasted',
        speedModifier: -20,
      } as any);

      const modifiers = extractDelayModifiers(player);

      expect(modifiers).toEqual([
        {
          effectId: 'hasted',
          value: -20,
          category: 'speedBuff',
          affectsActions: undefined,
        },
      ]);
    });

    it('multiplies modifier by stacks', () => {
      const effects = new Map([
        ['slowed', { expiresAt: 20000, stacks: 2 }],
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockReturnValue({
        id: 'slowed',
        name: 'Slowed',
        speedModifier: 25,
      } as any);

      const modifiers = extractDelayModifiers(player);

      expect(modifiers).toEqual([
        {
          effectId: 'slowed',
          value: 50, // 25 * 2 stacks
          category: 'speedDebuff',
          affectsActions: undefined,
        },
      ]);
    });

    it('categorizes buffs and debuffs correctly', () => {
      const effects = new Map([
        ['hasted', { expiresAt: 20000, stacks: 1 }],
        ['slowed', { expiresAt: 20000, stacks: 1 }],
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockImplementation((id: string) => {
        if (id === 'hasted') {
          return { id: 'hasted', name: 'Hasted', speedModifier: -20 } as any;
        }
        if (id === 'slowed') {
          return { id: 'slowed', name: 'Slowed', speedModifier: 50 } as any;
        }
        return null;
      });

      const modifiers = extractDelayModifiers(player);

      const hastedMod = modifiers.find(m => m.effectId === 'hasted');
      const slowedMod = modifiers.find(m => m.effectId === 'slowed');

      expect(hastedMod?.category).toBe('speedBuff');
      expect(slowedMod?.category).toBe('speedDebuff');
    });

    it('skips effects without speedModifier', () => {
      const effects = new Map([
        ['blessed', { expiresAt: 20000, stacks: 1 }],
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockReturnValue({
        id: 'blessed',
        name: 'Blessed',
        accuracyModifier: 10,
        // No speedModifier
      } as any);

      const modifiers = extractDelayModifiers(player);

      expect(modifiers).toEqual([]);
    });
  });

  describe('applyStackingRules', () => {
    it('returns 1.0 when no modifiers', () => {
      const result = applyStackingRules([]);

      expect(result).toBe(1.0);
    });

    it('applies bestOnly rule for speed buffs', () => {
      const modifiers: DelayModifier[] = [
        { effectId: 'hasted', value: -20, category: 'speedBuff' },
        { effectId: 'minor_haste', value: -10, category: 'speedBuff' },
        { effectId: 'speed_potion', value: -15, category: 'speedBuff' },
      ];

      const result = applyStackingRules(modifiers);

      // Best buff is -20, so multiplier = 1 + (-20/100) = 0.8
      expect(result).toBe(0.8);
    });

    it('applies worstOnly rule for speed debuffs', () => {
      const modifiers: DelayModifier[] = [
        { effectId: 'slowed', value: 50, category: 'speedDebuff' },
        { effectId: 'chilled', value: 30, category: 'speedDebuff' },
        { effectId: 'exhausted', value: 20, category: 'speedDebuff' },
      ];

      const result = applyStackingRules(modifiers);

      // Worst debuff is +50, so multiplier = 1 + (50/100) = 1.5
      expect(result).toBe(1.5);
    });

    it('combines best buff and worst debuff', () => {
      const modifiers: DelayModifier[] = [
        { effectId: 'hasted', value: -20, category: 'speedBuff' },
        { effectId: 'slowed', value: 50, category: 'speedDebuff' },
      ];

      const result = applyStackingRules(modifiers);

      // Best buff = -20, worst debuff = +50
      // Total = -20 + 50 = +30
      // Multiplier = 1 + (30/100) = 1.3
      expect(result).toBe(1.3);
    });

    it('filters by action type', () => {
      const modifiers: DelayModifier[] = [
        { effectId: 'battle_frenzy', value: -30, category: 'speedBuff', affectsActions: ['attack'] },
        { effectId: 'hasted', value: -20, category: 'speedBuff' }, // Global (no affectsActions)
      ];

      // For attack action, both should apply but bestOnly takes the best
      const attackResult = applyStackingRules(modifiers, 'attack');
      expect(attackResult).toBe(0.7); // -30% = 0.7 multiplier

      // For move action, only hasted applies
      const moveResult = applyStackingRules(modifiers, 'move');
      expect(moveResult).toBe(0.8); // -20% = 0.8 multiplier
    });

    it('enforces minimum multiplier of 0.1', () => {
      const modifiers: DelayModifier[] = [
        { effectId: 'mega_haste', value: -95, category: 'speedBuff' },
      ];

      const result = applyStackingRules(modifiers);

      expect(result).toBe(0.1); // Capped at 0.1, not 0.05
    });

    it('handles additive stacking for uncategorized modifiers', () => {
      const modifiers: DelayModifier[] = [
        { effectId: 'effect1', value: 10 },
        { effectId: 'effect2', value: 15 },
      ];

      const result = applyStackingRules(modifiers);

      // 10 + 15 = 25, multiplier = 1.25
      expect(result).toBe(1.25);
    });
  });

  describe('getStatusEffectDelayMultiplier', () => {
    it('returns 1.0 when player has no speed effects', () => {
      const player = createMockPlayer(new Map());
      vi.mocked(getEffectDefinition).mockReturnValue(null);

      const result = getStatusEffectDelayMultiplier(player);

      expect(result).toBe(1.0);
    });

    it('calculates multiplier from active effects', () => {
      const effects = new Map([
        ['hasted', { expiresAt: 20000, stacks: 1 }],
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockReturnValue({
        id: 'hasted',
        name: 'Hasted',
        speedModifier: -20,
      } as any);

      const result = getStatusEffectDelayMultiplier(player);

      expect(result).toBe(0.8);
    });

    it('passes action type to stacking rules', () => {
      const effects = new Map([
        ['battle_frenzy', { expiresAt: 20000, stacks: 1 }],
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockReturnValue({
        id: 'battle_frenzy',
        name: 'Battle Frenzy',
        speedModifier: -30,
        affectsActions: ['attack'],
      } as any);

      // Should apply to attack
      const attackResult = getStatusEffectDelayMultiplier(player, 'attack');
      expect(attackResult).toBe(0.7);

      // Should not apply to move
      const moveResult = getStatusEffectDelayMultiplier(player, 'move');
      expect(moveResult).toBe(1.0);
    });
  });

  describe('getDelayModifierDescriptions', () => {
    it('returns empty array when no modifiers', () => {
      const player = createMockPlayer(new Map());

      const descriptions = getDelayModifierDescriptions(player);

      expect(descriptions).toEqual([]);
    });

    it('returns formatted descriptions', () => {
      const effects = new Map([
        ['hasted', { expiresAt: 20000, stacks: 1 }],
        ['slowed', { expiresAt: 20000, stacks: 1 }],
      ]);
      const player = createMockPlayer(effects);
      vi.mocked(getEffectDefinition).mockImplementation((id: string) => {
        if (id === 'hasted') {
          return { id: 'hasted', name: 'Hasted', speedModifier: -20 } as any;
        }
        if (id === 'slowed') {
          return { id: 'slowed', name: 'Slowed', speedModifier: 50 } as any;
        }
        return null;
      });

      const descriptions = getDelayModifierDescriptions(player);

      expect(descriptions).toContain('Hasted: -20% faster');
      expect(descriptions).toContain('Slowed: +50% slower');
    });
  });
});
