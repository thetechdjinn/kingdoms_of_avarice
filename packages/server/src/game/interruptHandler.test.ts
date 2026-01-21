/**
 * Unit tests for interruptHandler module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../config/commandQueueConfig.js', () => ({
  getCommandQueueConfig: vi.fn(),
  getInterruptTrigger: vi.fn(),
  getInterruptDelayBehavior: vi.fn(),
}));

vi.mock('../utils/colors.js', () => ({
  colors: {
    yellow: (text: string) => text,
  },
}));

import {
  handleInterruptTrigger,
  canBeInterrupted,
  getInterruptibleActions,
  initializeInterruptHandler,
} from './interruptHandler.js';
import {
  getCommandQueueConfig,
  getInterruptTrigger,
  getInterruptDelayBehavior,
} from '../config/commandQueueConfig.js';
import type { AuthenticatedSocket } from './socket.js';
import { MessageType } from '@koa/shared';

// Default config
const defaultConfig = {
  interruptResistance: {
    minimumChance: 0.1,
    sources: {},
  },
};

// Helper to create mock player with queue state
function createMockPlayer(
  currentAction: AuthenticatedSocket['queueState']['currentAction'] = null,
  queueOverrides: Partial<AuthenticatedSocket['queueState']> = {}
): AuthenticatedSocket {
  return {
    playerId: 1,
    queueState: {
      commandQueue: [],
      readyAt: 0,
      currentAction,
      cooldowns: {},
      lastOverflowMessageTime: 0,
      ...queueOverrides,
    },
  } as AuthenticatedSocket;
}

describe('interruptHandler', () => {
  let mockSendMessage: (ws: AuthenticatedSocket, type: MessageType, payload: string) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    vi.mocked(getCommandQueueConfig).mockReturnValue(defaultConfig as any);

    // Initialize with mock sendMessage
    mockSendMessage = vi.fn();
    initializeInterruptHandler(mockSendMessage);
  });

  describe('handleInterruptTrigger', () => {
    it('returns not interrupted when no trigger config exists', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue(undefined);

      const result = handleInterruptTrigger(player, 'unknownTrigger');

      expect(result.interrupted).toBe(false);
      expect(result.queueCleared).toBe(false);
    });

    it('returns not interrupted when player has no current action', () => {
      const player = createMockPlayer(null);
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'Interrupted!',
      });

      const result = handleInterruptTrigger(player, 'bash');

      expect(result.interrupted).toBe(false);
    });

    it('returns not interrupted when current action cannot be interrupted', () => {
      const player = createMockPlayer({
        command: 'north',
        type: 'move',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: false, // Movement cannot be interrupted
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['move'],
        chance: 1.0,
        message: 'Interrupted!',
      });

      const result = handleInterruptTrigger(player, 'bash');

      expect(result.interrupted).toBe(false);
    });

    it('returns not interrupted when trigger does not affect action type', () => {
      const player = createMockPlayer({
        command: 'attack goblin',
        type: 'attack',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'], // Only affects cast, not attack
        chance: 1.0,
        message: 'Interrupted!',
      });

      const result = handleInterruptTrigger(player, 'silence');

      expect(result.interrupted).toBe(false);
    });

    it('successfully interrupts with 100% chance', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'Your concentration is broken!',
      });
      vi.mocked(getInterruptDelayBehavior).mockReturnValue(undefined);

      const result = handleInterruptTrigger(player, 'takeDamage');

      expect(result.interrupted).toBe(true);
      expect(result.message).toBe('Your concentration is broken!');
      expect(player.queueState.currentAction).toBeNull();
      expect(mockSendMessage).toHaveBeenCalledWith(
        player,
        MessageType.SYSTEM,
        'Your concentration is broken!'
      );
    });

    it('clears queue when trigger has clearsQueue: true', () => {
      const player = createMockPlayer(
        {
          command: 'cast fireball',
          type: 'cast',
          startedAt: 8000,
          completesAt: 11000,
          canInterrupt: true,
        },
        { commandQueue: ['north', 'look', 'cast heal'] }
      );
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'You are stunned!',
        clearsQueue: true,
      });
      vi.mocked(getInterruptDelayBehavior).mockReturnValue(undefined);

      const result = handleInterruptTrigger(player, 'stun');

      expect(result.interrupted).toBe(true);
      expect(result.queueCleared).toBe(true);
      expect(player.queueState.commandQueue).toEqual([]);
    });

    it('applies partial delay behavior', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000, // 3000ms delay
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'Interrupted!',
      });
      vi.mocked(getInterruptDelayBehavior).mockReturnValue({
        delayMode: 'partial',
        delayPercent: 0.5,
      });

      const result = handleInterruptTrigger(player, 'takeDamage');

      // Original delay was 3000ms, partial at 50% = 1500ms from now (10000)
      expect(result.newReadyAt).toBe(11500);
      expect(player.queueState.readyAt).toBe(11500);
    });

    it('applies fixed delay behavior', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'Knocked down!',
      });
      vi.mocked(getInterruptDelayBehavior).mockReturnValue({
        delayMode: 'fixed',
        delayMs: 2000,
      });

      const result = handleInterruptTrigger(player, 'knockdown');

      expect(result.newReadyAt).toBe(12000); // now (10000) + 2000
      expect(player.queueState.readyAt).toBe(12000);
    });

    it('applies cancel delay behavior (no delay)', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'Silenced!',
      });
      vi.mocked(getInterruptDelayBehavior).mockReturnValue({
        delayMode: 'cancel',
      });

      const result = handleInterruptTrigger(player, 'silence');

      expect(result.newReadyAt).toBe(10000); // now, no delay
      expect(player.queueState.readyAt).toBe(10000);
    });

    it('respects interrupt chance with random roll', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 0.5, // 50% chance
        message: 'Interrupted!',
      });

      // Mock Math.random to return value > 0.5 (fail)
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.6);

      const result = handleInterruptTrigger(player, 'takeDamage');

      expect(result.interrupted).toBe(false);

      mockRandom.mockRestore();
    });

    it('always uses minimum interrupt chance', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 0.05, // Very low chance
        message: 'Interrupted!',
      });
      vi.mocked(getInterruptDelayBehavior).mockReturnValue(undefined);

      // Mock random to return 0.09 (above 0.05 but below 0.1 minimum)
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.09);

      const result = handleInterruptTrigger(player, 'takeDamage');

      // Should succeed because minimum chance is 0.1 and roll is 0.09
      expect(result.interrupted).toBe(true);

      mockRandom.mockRestore();
    });
  });

  describe('canBeInterrupted', () => {
    it('returns false when no trigger config', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue(undefined);

      expect(canBeInterrupted(player, 'unknownTrigger')).toBe(false);
    });

    it('returns false when no current action', () => {
      const player = createMockPlayer(null);
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'Interrupted!',
      });

      expect(canBeInterrupted(player, 'bash')).toBe(false);
    });

    it('returns false when action cannot be interrupted', () => {
      const player = createMockPlayer({
        command: 'north',
        type: 'move',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: false,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['move'],
        chance: 1.0,
        message: 'Interrupted!',
      });

      expect(canBeInterrupted(player, 'bash')).toBe(false);
    });

    it('returns true when all conditions met', () => {
      const player = createMockPlayer({
        command: 'cast fireball',
        type: 'cast',
        startedAt: 8000,
        completesAt: 11000,
        canInterrupt: true,
      });
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast'],
        chance: 1.0,
        message: 'Interrupted!',
      });

      expect(canBeInterrupted(player, 'takeDamage')).toBe(true);
    });
  });

  describe('getInterruptibleActions', () => {
    it('returns empty array when no trigger config', () => {
      vi.mocked(getInterruptTrigger).mockReturnValue(undefined);

      expect(getInterruptibleActions('unknownTrigger')).toEqual([]);
    });

    it('returns list of interruptible actions', () => {
      vi.mocked(getInterruptTrigger).mockReturnValue({
        interrupts: ['cast', 'attack'],
        chance: 1.0,
        message: 'Interrupted!',
      });

      expect(getInterruptibleActions('bash')).toEqual(['cast', 'attack']);
    });
  });
});
