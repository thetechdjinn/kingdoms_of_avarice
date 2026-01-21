/**
 * Unit tests for gameLoop module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the config module
vi.mock('../config/commandQueueConfig.js', () => ({
  getCommandQueueConfig: vi.fn(),
}));

import {
  startGameLoop,
  stopGameLoop,
  isGameLoopRunning,
  getGameLoopStats,
  enqueueCommand,
  clearPlayerQueue,
  getQueueSize,
  isPlayerReady,
  setPlayerReadyAt,
  getTimeUntilReady,
} from './gameLoop.js';
import { getCommandQueueConfig } from '../config/commandQueueConfig.js';
import type { AuthenticatedSocket } from './socket.js';

// Default config
const defaultConfig = {
  timing: {
    tickRateMs: 100,
    alignToTicks: true,
    playerProcessingOrder: 'shuffle',
  },
  queue: {
    maxSize: 15,
    overflowMessage: 'Slow down!',
    overflowCooldownMs: 1000,
    clearEvents: ['death', 'teleport', 'stun', 'disconnect'],
    priorityCommands: ['quit', 'recall'],
  },
};

// Helper to create mock player
function createMockPlayer(
  playerId: number,
  queueOverrides: Partial<AuthenticatedSocket['queueState']> = {}
): AuthenticatedSocket {
  return {
    playerId,
    queueState: {
      commandQueue: [],
      readyAt: 0,
      currentAction: null,
      cooldowns: {},
      lastOverflowMessageTime: 0,
      ...queueOverrides,
    },
  } as AuthenticatedSocket;
}

describe('gameLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    vi.mocked(getCommandQueueConfig).mockReturnValue(defaultConfig as any);
  });

  afterEach(() => {
    stopGameLoop();
    vi.useRealTimers();
  });

  describe('enqueueCommand', () => {
    it('adds command to queue', () => {
      const player = createMockPlayer(1);

      const result = enqueueCommand(player, 'north');

      expect(result).toBe(true);
      expect(player.queueState.commandQueue).toEqual(['north']);
    });

    it('adds multiple commands to queue', () => {
      const player = createMockPlayer(1);

      enqueueCommand(player, 'north');
      enqueueCommand(player, 'look');
      enqueueCommand(player, 'get sword');

      expect(player.queueState.commandQueue).toEqual(['north', 'look', 'get sword']);
    });

    it('returns false when queue is full', () => {
      const existingCommands = Array(15).fill('wait');
      const player = createMockPlayer(1, { commandQueue: existingCommands });

      const result = enqueueCommand(player, 'north');

      expect(result).toBe(false);
      expect(player.queueState.commandQueue.length).toBe(15);
    });

    it('respects configured maxSize', () => {
      vi.mocked(getCommandQueueConfig).mockReturnValue({
        ...defaultConfig,
        queue: { ...defaultConfig.queue, maxSize: 5 },
      } as any);

      const existingCommands = Array(5).fill('wait');
      const player = createMockPlayer(1, { commandQueue: existingCommands });

      const result = enqueueCommand(player, 'north');

      expect(result).toBe(false);
    });
  });

  describe('clearPlayerQueue', () => {
    it('clears command queue', () => {
      const player = createMockPlayer(1, { commandQueue: ['north', 'look'] });

      clearPlayerQueue(player);

      expect(player.queueState.commandQueue).toEqual([]);
    });

    it('clears current action', () => {
      const player = createMockPlayer(1, {
        commandQueue: ['north'],
        currentAction: {
          command: 'cast fireball',
          type: 'cast',
          startedAt: 8000,
          completesAt: 11000,
          canInterrupt: true,
        },
      });

      clearPlayerQueue(player);

      expect(player.queueState.currentAction).toBeNull();
      expect(player.queueState.commandQueue).toEqual([]);
    });
  });

  describe('getQueueSize', () => {
    it('returns 0 for empty queue', () => {
      const player = createMockPlayer(1);

      expect(getQueueSize(player)).toBe(0);
    });

    it('returns correct size', () => {
      const player = createMockPlayer(1, { commandQueue: ['a', 'b', 'c'] });

      expect(getQueueSize(player)).toBe(3);
    });
  });

  describe('isPlayerReady', () => {
    it('returns true when readyAt is in the past', () => {
      const player = createMockPlayer(1, { readyAt: 5000 });

      expect(isPlayerReady(player)).toBe(true);
    });

    it('returns true when readyAt equals current time', () => {
      const player = createMockPlayer(1, { readyAt: 10000 });

      expect(isPlayerReady(player)).toBe(true);
    });

    it('returns false when readyAt is in the future', () => {
      const player = createMockPlayer(1, { readyAt: 15000 });

      expect(isPlayerReady(player)).toBe(false);
    });
  });

  describe('setPlayerReadyAt', () => {
    it('sets readyAt timestamp', () => {
      const player = createMockPlayer(1);

      setPlayerReadyAt(player, 15000);

      expect(player.queueState.readyAt).toBe(15000);
    });
  });

  describe('getTimeUntilReady', () => {
    it('returns 0 when already ready', () => {
      const player = createMockPlayer(1, { readyAt: 5000 });

      expect(getTimeUntilReady(player)).toBe(0);
    });

    it('returns remaining time when not ready', () => {
      const player = createMockPlayer(1, { readyAt: 15000 });

      expect(getTimeUntilReady(player)).toBe(5000);
    });
  });

  describe('game loop lifecycle', () => {
    it('starts in stopped state', () => {
      expect(isGameLoopRunning()).toBe(false);
    });

    it('starts when startGameLoop is called', () => {
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      const startProcessor = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor, executeProcessor);

      expect(isGameLoopRunning()).toBe(true);
    });

    it('stops when stopGameLoop is called', () => {
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      const startProcessor = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor, executeProcessor);
      stopGameLoop();

      expect(isGameLoopRunning()).toBe(false);
    });

    it('restarts if already running', () => {
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      const startProcessor1 = vi.fn();
      const startProcessor2 = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor1, executeProcessor);
      startGameLoop(connectedPlayers, startProcessor2, executeProcessor);

      expect(isGameLoopRunning()).toBe(true);
    });
  });

  describe('getGameLoopStats', () => {
    it('returns stats when not running', () => {
      const stats = getGameLoopStats();

      expect(stats.running).toBe(false);
      expect(stats.tickCount).toBe(0);
      expect(stats.connectedPlayers).toBe(0);
    });

    it('returns stats when running', () => {
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      connectedPlayers.set(1, createMockPlayer(1));
      connectedPlayers.set(2, createMockPlayer(2));

      startGameLoop(connectedPlayers, vi.fn(), vi.fn());

      const stats = getGameLoopStats();

      expect(stats.running).toBe(true);
      expect(stats.connectedPlayers).toBe(2);
    });
  });

  describe('tick processing', () => {
    it('processes commands from queue when player is ready', async () => {
      const player = createMockPlayer(1, {
        commandQueue: ['north'],
        readyAt: 0, // Ready now
      });
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      connectedPlayers.set(1, player);

      const startProcessor = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor, executeProcessor);

      // Advance time to trigger a tick
      await vi.advanceTimersByTimeAsync(100);

      expect(startProcessor).toHaveBeenCalledWith(player, 'north');
      expect(player.queueState.commandQueue).toEqual([]);
    });

    it('does not process queue when player is not ready', async () => {
      const player = createMockPlayer(1, {
        commandQueue: ['north'],
        readyAt: 20000, // Not ready yet
      });
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      connectedPlayers.set(1, player);

      const startProcessor = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor, executeProcessor);

      // Advance time to trigger a tick
      await vi.advanceTimersByTimeAsync(100);

      expect(startProcessor).not.toHaveBeenCalled();
      expect(player.queueState.commandQueue).toEqual(['north']);
    });

    it('executes current action when it completes', async () => {
      const player = createMockPlayer(1, {
        currentAction: {
          command: 'cast fireball',
          type: 'cast',
          startedAt: 5000,
          completesAt: 10000, // Completes now
          canInterrupt: true,
        },
      });
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      connectedPlayers.set(1, player);

      const startProcessor = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor, executeProcessor);

      // Advance time to trigger a tick
      await vi.advanceTimersByTimeAsync(100);

      expect(executeProcessor).toHaveBeenCalledWith(player, 'cast fireball');
      expect(player.queueState.currentAction).toBeNull();
    });

    it('does not process queue while action is pending', async () => {
      const player = createMockPlayer(1, {
        commandQueue: ['north'],
        readyAt: 0,
        currentAction: {
          command: 'cast fireball',
          type: 'cast',
          startedAt: 5000,
          completesAt: 15000, // Not yet complete
          canInterrupt: true,
        },
      });
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      connectedPlayers.set(1, player);

      const startProcessor = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor, executeProcessor);

      // Advance time to trigger a tick
      await vi.advanceTimersByTimeAsync(100);

      // Should not start new action or execute the pending one
      expect(startProcessor).not.toHaveBeenCalled();
      expect(executeProcessor).not.toHaveBeenCalled();
      expect(player.queueState.commandQueue).toEqual(['north']);
    });

    it('processes multiple players per tick', async () => {
      const player1 = createMockPlayer(1, {
        commandQueue: ['north'],
        readyAt: 0,
      });
      const player2 = createMockPlayer(2, {
        commandQueue: ['south'],
        readyAt: 0,
      });
      const connectedPlayers = new Map<number, AuthenticatedSocket>();
      connectedPlayers.set(1, player1);
      connectedPlayers.set(2, player2);

      const startProcessor = vi.fn();
      const executeProcessor = vi.fn();

      startGameLoop(connectedPlayers, startProcessor, executeProcessor);

      // Advance time to trigger a tick
      await vi.advanceTimersByTimeAsync(100);

      expect(startProcessor).toHaveBeenCalledTimes(2);
      expect(executeProcessor).not.toHaveBeenCalled();
      expect(player1.queueState.commandQueue).toEqual([]);
      expect(player2.queueState.commandQueue).toEqual([]);
    });
  });
});
