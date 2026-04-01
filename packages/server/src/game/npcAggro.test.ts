/**
 * Unit tests for NPC aggro stealth checks.
 *
 * Verifies that hostile NPCs do NOT aggro players who are
 * sneaking or hidden (unless the NPC has see_hidden).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StealthMode, ResourceType, DeathState, PlayerRegenState } from '@koa/shared';
import type { CombatEntity, CombatState } from './combatEntity.js';

// --------------------------------------------------------------------------
// Mock npcManager internals so checkHostileAggro can run in isolation
// --------------------------------------------------------------------------

// We'll store the NPC list that getNpcsInRoom returns
let mockNpcsInRoom: any[] = [];

vi.mock('./combatEntity.js', () => ({
  NPC_ID_OFFSET: 1_000_000,
  isPlayerEntity: () => true,
  getEntityRoomId: () => 1,
}));

vi.mock('./combatMessaging.js', () => ({
  sendCombatMessage: vi.fn(),
  broadcastCombatToRoom: vi.fn(),
}));

vi.mock('../utils/colors.js', () => ({
  colors: { boldRed: (t: string) => t },
}));

vi.mock('../utils/textFormat.js', () => ({
  withNpcNameCapitalized: (n: string) => n,
}));

vi.mock('../db/repositories/npcRepository.js', () => ({}));
vi.mock('../db/repositories/spawnRepository.js', () => ({}));
vi.mock('../db/repositories/merchantRepository.js', () => ({}));
vi.mock('../db/repositories/npcResponseRepository.js', () => ({}));
vi.mock('../services/doorStateManager.js', () => ({}));
vi.mock('./statusEffects.js', () => ({
  processNpcEffectsTick: vi.fn(),
  getEffectDefinition: vi.fn(),
}));
vi.mock('./vision.js', () => ({
  calculateNpcEffectiveVision: () => 100,
  canSee: () => true,
}));
vi.mock('./world.js', () => ({}));
vi.mock('./socket.js', () => ({}));

// Mock getNpcsInRoom at the module level via self-import spy
vi.mock('./npcManager.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getNpcsInRoom: () => mockNpcsInRoom,
    isMerchantHostileToPlayer: () => false,
    setMerchantHostile: vi.fn(),
  };
});

import { checkHostileAggro } from './npcManager.js';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function createMockNpc(overrides: Partial<{
  hostile: boolean;
  canSeeHidden: boolean;
  inCombat: boolean;
  hp: number;
  behaviorState: string;
  merchantEnabled: boolean;
}> = {}) {
  return {
    entityId: 1_000_001,
    entityName: 'test mob',
    isProperName: false,
    template: {
      hostile: overrides.hostile ?? true,
      merchantEnabled: overrides.merchantEnabled ?? false,
      name: 'test mob',
    },
    canSeeHidden: overrides.canSeeHidden ?? false,
    vitals: { hp: overrides.hp ?? 100 },
    combatState: { targets: new Set() } as unknown as CombatState,
    behaviorState: overrides.behaviorState ?? 'idle',
    regenState: { inCombat: false, enhancedRegen: new Map() } as unknown as PlayerRegenState,
    templateId: 1,
  };
}

function createMockPlayer(stealthMode: StealthMode = 'none') {
  return {
    entityId: 1,
    entityName: 'TestPlayer',
    isProperName: true,
    entityType: 'player',
    stealthMode,
    vitals: { hp: 100, maxHp: 100, resource: 50, maxResource: 50, resourceType: 'mana' as ResourceType },
    combatState: { targets: new Set() } as unknown as CombatState,
    characterLevel: 1,
    characterStats: { strength: 10, intelligence: 10, dexterity: 10, constitution: 10, wisdom: 10, charisma: 10 },
    combatLevel: 1,
    activeEffects: new Map(),
    deathState: { isDead: false, isDropped: false } as DeathState,
    regenState: { inCombat: false, enhancedRegen: new Map() } as unknown as PlayerRegenState,
    isTraining: false,
  } as unknown as CombatEntity;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('NPC aggro stealth checks', () => {
  beforeEach(() => {
    mockNpcsInRoom = [];
  });

  it('hostile NPC aggros a non-stealthed player', () => {
    const npc = createMockNpc({ hostile: true });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('none');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(1);
    expect(npc.combatState.targets.has(player.entityId)).toBe(true);
  });

  it('hostile NPC does NOT aggro a sneaking player', () => {
    const npc = createMockNpc({ hostile: true });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('sneaking');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(0);
  });

  it('hostile NPC does NOT aggro a hidden player', () => {
    const npc = createMockNpc({ hostile: true });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('hidden');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(0);
  });

  it('NPC with see_hidden DOES aggro a sneaking player', () => {
    const npc = createMockNpc({ hostile: true, canSeeHidden: true });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('sneaking');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(1);
  });

  it('NPC with see_hidden DOES aggro a hidden player', () => {
    const npc = createMockNpc({ hostile: true, canSeeHidden: true });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('hidden');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(1);
  });

  it('non-hostile NPC does NOT aggro any player', () => {
    const npc = createMockNpc({ hostile: false });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('none');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(0);
  });

  it('dead NPC does NOT aggro', () => {
    const npc = createMockNpc({ hostile: true, hp: 0 });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('none');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(0);
  });

  it('fleeing NPC does NOT aggro', () => {
    const npc = createMockNpc({ hostile: true, behaviorState: 'fleeing' });
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('none');

    checkHostileAggro(1, player);

    expect(npc.combatState.targets.size).toBe(0);
  });

  it('NPC already in combat does NOT aggro new targets', () => {
    const npc = createMockNpc({ hostile: true });
    npc.combatState.targets.add(999); // already fighting someone
    mockNpcsInRoom = [npc];
    const player = createMockPlayer('none');

    checkHostileAggro(1, player);

    // Should still only have the original target
    expect(npc.combatState.targets.size).toBe(1);
    expect(npc.combatState.targets.has(player.entityId)).toBe(false);
  });

  it('multiple hostile NPCs all aggro a visible player', () => {
    const npc1 = createMockNpc({ hostile: true });
    const npc2 = createMockNpc({ hostile: true });
    npc2.entityId = 1_000_002;
    mockNpcsInRoom = [npc1, npc2];
    const player = createMockPlayer('none');

    checkHostileAggro(1, player);

    expect(npc1.combatState.targets.has(player.entityId)).toBe(true);
    expect(npc2.combatState.targets.has(player.entityId)).toBe(true);
  });

  it('multiple hostile NPCs all skip a sneaking player', () => {
    const npc1 = createMockNpc({ hostile: true });
    const npc2 = createMockNpc({ hostile: true });
    npc2.entityId = 1_000_002;
    mockNpcsInRoom = [npc1, npc2];
    const player = createMockPlayer('sneaking');

    checkHostileAggro(1, player);

    expect(npc1.combatState.targets.size).toBe(0);
    expect(npc2.combatState.targets.size).toBe(0);
  });

  it('idle hostile NPC aggros when called again after player becomes visible', () => {
    const npc1 = createMockNpc({ hostile: true });
    const npc2 = createMockNpc({ hostile: true });
    npc2.entityId = 1_000_002;
    mockNpcsInRoom = [npc1, npc2];

    // Player sneaks in — no aggro
    const player = createMockPlayer('sneaking');
    checkHostileAggro(1, player);
    expect(npc1.combatState.targets.size).toBe(0);
    expect(npc2.combatState.targets.size).toBe(0);

    // Player breaks stealth (e.g., attacks npc1 manually, which sets npc1 in combat)
    player.stealthMode = 'none' as StealthMode;
    npc1.combatState.targets.add(player.entityId); // npc1 already fighting
    npc1.behaviorState = 'combat';

    // checkHostileAggro is called again (e.g., from combat initiation)
    checkHostileAggro(1, player);

    // npc1 already in combat — no double-add
    expect(npc1.combatState.targets.size).toBe(1);
    // npc2 should now aggro the visible player
    expect(npc2.combatState.targets.has(player.entityId)).toBe(true);
  });
});
