/**
 * Unit tests for NPC aggro stealth checks.
 *
 * Stealthed players (sneaking or hidden) do NOT get aggro'd unless the NPC has see_hidden.
 *
 * These tests exercise the aggro decision logic directly using shouldNpcAggro(),
 * avoiding fragile ESM self-mocking of npcManager internals.
 */

import { describe, it, expect } from 'vitest';
import type { StealthMode, ResourceType, DeathState, PlayerRegenState } from '@koa/shared';
import type { CombatEntity, CombatState } from './combatEntity.js';
import { shouldNpcAggro } from './npcManager.js';

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
  // -- Stealth mode vs aggro --

  it('hostile NPC aggros a non-stealthed player', () => {
    const npc = createMockNpc({ hostile: true });
    const player = createMockPlayer('none');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(true);
  });

  it('hostile NPC does NOT aggro a sneaking player', () => {
    const npc = createMockNpc({ hostile: true });
    const player = createMockPlayer('sneaking');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);
  });

  it('hostile NPC does NOT aggro a hidden player', () => {
    const npc = createMockNpc({ hostile: true });
    const player = createMockPlayer('hidden');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);
  });

  // -- see_hidden bypass --

  it('NPC with see_hidden DOES aggro a sneaking player', () => {
    const npc = createMockNpc({ hostile: true, canSeeHidden: true });
    const player = createMockPlayer('sneaking');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(true);
  });

  it('NPC with see_hidden DOES aggro a hidden player', () => {
    const npc = createMockNpc({ hostile: true, canSeeHidden: true });
    const player = createMockPlayer('hidden');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(true);
  });

  // -- Non-hostile / state checks --

  it('non-hostile NPC does NOT aggro any player', () => {
    const npc = createMockNpc({ hostile: false });
    const player = createMockPlayer('none');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);
  });

  it('dead NPC does NOT aggro', () => {
    const npc = createMockNpc({ hostile: true, hp: 0 });
    const player = createMockPlayer('none');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);
  });

  it('fleeing NPC does NOT aggro', () => {
    const npc = createMockNpc({ hostile: true, behaviorState: 'fleeing' });
    const player = createMockPlayer('none');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);
  });

  it('returning NPC does NOT aggro', () => {
    const npc = createMockNpc({ hostile: true, behaviorState: 'returning' });
    const player = createMockPlayer('none');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);
  });

  it('NPC already in combat does NOT aggro new targets', () => {
    const npc = createMockNpc({ hostile: true });
    npc.combatState.targets.add(999); // already fighting someone
    const player = createMockPlayer('none');
    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);
  });

  // -- Angry merchant --

  it('non-hostile merchant with active hostility DOES aggro', () => {
    const npc = createMockNpc({ hostile: false, merchantEnabled: true });
    const player = createMockPlayer('none');
    expect(shouldNpcAggro(npc as any, player, true)).toBe(true);
  });

  it('angry merchant does NOT aggro a sneaking player', () => {
    const npc = createMockNpc({ hostile: false, merchantEnabled: true });
    const player = createMockPlayer('sneaking');
    expect(shouldNpcAggro(npc as any, player, true)).toBe(false);
  });

  // -- Stealth transition --

  it('hidden player avoids aggro, then gets aggro after becoming visible', () => {
    const npc = createMockNpc({ hostile: true });
    const player = createMockPlayer('hidden');

    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);

    player.stealthMode = 'none' as StealthMode;
    expect(shouldNpcAggro(npc as any, player, false)).toBe(true);
  });

  it('sneaking player avoids aggro, then gets aggro after breaking stealth', () => {
    const npc = createMockNpc({ hostile: true });
    const player = createMockPlayer('sneaking');

    expect(shouldNpcAggro(npc as any, player, false)).toBe(false);

    player.stealthMode = 'none' as StealthMode;
    expect(shouldNpcAggro(npc as any, player, false)).toBe(true);
  });
});
