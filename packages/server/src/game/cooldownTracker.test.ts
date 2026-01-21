/**
 * Unit tests for cooldownTracker module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the config module
vi.mock('../config/commandQueueConfig.js', () => ({
  getCooldownConfig: vi.fn(),
  getCooldownGroup: vi.fn(),
}));

import {
  isOnCooldown,
  getRemainingCooldown,
  startCooldown,
  clearCooldown,
  clearAllCooldowns,
  formatAbilityName,
  getCooldownMessage,
} from './cooldownTracker.js';
import { getCooldownConfig, getCooldownGroup } from '../config/commandQueueConfig.js';
import type { AuthenticatedSocket } from './socket.js';

// Helper to create a mock player with queue state
function createMockPlayer(overrides: Partial<AuthenticatedSocket['queueState']> = {}): AuthenticatedSocket {
  return {
    queueState: {
      commandQueue: [],
      readyAt: 0,
      currentAction: null,
      cooldowns: {},
      lastOverflowMessageTime: 0,
      ...overrides,
    },
  } as AuthenticatedSocket;
}

describe('cooldownTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(10000); // Set current time to 10000ms
  });

  describe('isOnCooldown', () => {
    it('returns false when ability has no cooldown set', () => {
      const player = createMockPlayer();
      vi.mocked(getCooldownConfig).mockReturnValue(undefined);

      expect(isOnCooldown(player, 'bash')).toBe(false);
    });

    it('returns true when ability is on cooldown', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 15000 }, // Ready in 5 seconds
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue(undefined);

      expect(isOnCooldown(player, 'bash')).toBe(true);
    });

    it('returns false when ability cooldown has expired', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 5000 }, // Was ready 5 seconds ago
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue(undefined);

      expect(isOnCooldown(player, 'bash')).toBe(false);
    });

    it('returns true when shared cooldown group is active', () => {
      const player = createMockPlayer({
        cooldowns: {
          meleeSpecial: { readyAt: 15000 },
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue({
        cooldownMs: 8000,
        sharedCooldownGroup: 'meleeSpecial',
        startOnUse: true,
      });

      expect(isOnCooldown(player, 'bash')).toBe(true);
    });
  });

  describe('getRemainingCooldown', () => {
    it('returns 0 when ability is ready', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 5000 }, // Expired
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue(undefined);

      expect(getRemainingCooldown(player, 'bash')).toBe(0);
    });

    it('returns remaining time when ability is on cooldown', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 15000 }, // 5 seconds remaining
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue(undefined);

      expect(getRemainingCooldown(player, 'bash')).toBe(5000);
    });

    it('returns maximum of individual and group cooldown', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 12000 }, // 2 seconds remaining
          meleeSpecial: { readyAt: 18000 }, // 8 seconds remaining
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue({
        cooldownMs: 8000,
        sharedCooldownGroup: 'meleeSpecial',
        startOnUse: true,
      });

      expect(getRemainingCooldown(player, 'bash')).toBe(8000);
    });
  });

  describe('startCooldown', () => {
    it('does nothing when no config exists for ability', () => {
      const player = createMockPlayer();
      vi.mocked(getCooldownConfig).mockReturnValue(undefined);

      startCooldown(player, 'unknownAbility', 'use');

      expect(player.queueState.cooldowns).toEqual({});
    });

    it('starts cooldown in "use" mode when startOnUse is true', () => {
      const player = createMockPlayer();
      vi.mocked(getCooldownConfig).mockReturnValue({
        cooldownMs: 8000,
        sharedCooldownGroup: null,
        startOnUse: true,
      });

      startCooldown(player, 'bash', 'use');

      expect(player.queueState.cooldowns.bash).toEqual({ readyAt: 18000 });
    });

    it('does not start cooldown in "use" mode when startOnUse is false', () => {
      const player = createMockPlayer();
      vi.mocked(getCooldownConfig).mockReturnValue({
        cooldownMs: 5000,
        sharedCooldownGroup: null,
        startOnUse: false,
        startOnComplete: true,
      });

      startCooldown(player, 'heal', 'use');

      expect(player.queueState.cooldowns.heal).toBeUndefined();
    });

    it('starts cooldown in "complete" mode when startOnComplete is true', () => {
      const player = createMockPlayer();
      vi.mocked(getCooldownConfig).mockReturnValue({
        cooldownMs: 5000,
        sharedCooldownGroup: null,
        startOnUse: false,
        startOnComplete: true,
      });

      startCooldown(player, 'heal', 'complete');

      expect(player.queueState.cooldowns.heal).toEqual({ readyAt: 15000 });
    });

    it('does not start cooldown in "complete" mode when startOnComplete is false', () => {
      const player = createMockPlayer();
      vi.mocked(getCooldownConfig).mockReturnValue({
        cooldownMs: 5000,
        sharedCooldownGroup: null,
        startOnUse: true,
        startOnComplete: false,
      });

      startCooldown(player, 'bash', 'complete');

      expect(player.queueState.cooldowns.bash).toBeUndefined();
    });

    it('triggers shared cooldown group', () => {
      const player = createMockPlayer();
      vi.mocked(getCooldownConfig).mockImplementation((ability: string) => {
        if (ability === 'bash') {
          return {
            cooldownMs: 8000,
            sharedCooldownGroup: 'meleeSpecial',
            startOnUse: true,
          };
        }
        if (ability === 'kick') {
          return {
            cooldownMs: 6000,
            sharedCooldownGroup: 'meleeSpecial',
            startOnUse: true,
          };
        }
        return undefined;
      });
      vi.mocked(getCooldownGroup).mockReturnValue({
        description: 'Shared cooldown for melee special attacks',
        triggersCooldownFor: ['bash', 'kick', 'trip'],
      });

      startCooldown(player, 'bash', 'use');

      // Bash cooldown
      expect(player.queueState.cooldowns.bash).toEqual({ readyAt: 18000 });
      // Group cooldown
      expect(player.queueState.cooldowns.meleeSpecial).toEqual({ readyAt: 18000 });
      // Kick gets its own cooldown duration
      expect(player.queueState.cooldowns.kick).toEqual({ readyAt: 16000 });
    });
  });

  describe('clearCooldown', () => {
    it('clears individual cooldown', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 15000 },
          kick: { readyAt: 12000 },
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue(undefined);

      clearCooldown(player, 'bash');

      expect(player.queueState.cooldowns.bash).toBeUndefined();
      expect(player.queueState.cooldowns.kick).toBeDefined();
    });

    it('clears group cooldown when ability has shared group', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 15000 },
          meleeSpecial: { readyAt: 15000 },
        },
      });
      vi.mocked(getCooldownConfig).mockReturnValue({
        cooldownMs: 8000,
        sharedCooldownGroup: 'meleeSpecial',
        startOnUse: true,
      });

      clearCooldown(player, 'bash');

      expect(player.queueState.cooldowns.bash).toBeUndefined();
      expect(player.queueState.cooldowns.meleeSpecial).toBeUndefined();
    });
  });

  describe('clearAllCooldowns', () => {
    it('clears all cooldowns', () => {
      const player = createMockPlayer({
        cooldowns: {
          bash: { readyAt: 15000 },
          kick: { readyAt: 12000 },
          meleeSpecial: { readyAt: 15000 },
        },
      });

      clearAllCooldowns(player);

      expect(player.queueState.cooldowns).toEqual({});
    });
  });

  describe('formatAbilityName', () => {
    it('capitalizes first letter', () => {
      expect(formatAbilityName('bash')).toBe('Bash');
      expect(formatAbilityName('fireball')).toBe('Fireball');
    });

    it('handles single character', () => {
      expect(formatAbilityName('a')).toBe('A');
    });
  });

  describe('getCooldownMessage', () => {
    it('returns formatted cooldown message', () => {
      expect(getCooldownMessage('bash')).toBe('Bash is not ready yet!');
      expect(getCooldownMessage('heal')).toBe('Heal is not ready yet!');
    });
  });
});
