/**
 * Unit tests for NPC Spell AI decision layer
 *
 * Tests the three public functions:
 * - evaluateSpellCondition() — 8 condition types with edge cases
 * - selectNpcSpell() — two-pass selection, silenced blocking, empty spells
 * - setSpellCooldown() — cooldown set/skip behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpellType, SpellTargetType } from '@koa/shared';
import type { NpcSpell, Spell } from '@koa/shared';
import type { NpcCombatInstance } from './npcManager.js';
import type { CombatEntity } from './combatEntity.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('./npcManager.js', () => ({
  getNpcsInRoom: vi.fn(() => []),
}));

vi.mock('./statusEffects.js', () => ({
  hasEffect: vi.fn(() => false),
}));

import { getNpcsInRoom } from './npcManager.js';
import { hasEffect } from './statusEffects.js';
import {
  evaluateSpellCondition,
  selectNpcSpell,
  setSpellCooldown,
} from './npcSpellAI.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockSpell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: 1,
    name: 'Test Spell',
    mnemonic: 'test',
    description: 'A test spell',
    spellType: SpellType.OFFENSIVE,
    targetType: SpellTargetType.ENEMY,
    manaCost: 5,
    minDamage: 1,
    maxDamage: 6,
    minHealing: null,
    maxHealing: null,
    hitsPerCast: 1,
    statusEffect: null,
    effectDuration: null,
    levelRequired: 1,
    classRestrictions: [],
    isAttackSpell: true,
    scalingPerLevel: null,
    damageScalingStat: null,
    damageScalingFactor: null,
    healingScalingStat: null,
    healingScalingFactor: null,
    castDifficulty: 0,
    fizzleMessage: null,
    hitMessageSelf: null,
    hitMessageTarget: null,
    hitMessageRoom: null,
    telegraphMessage: null,
    saveStat: null,
    saveDifficulty: 0,
    ...overrides,
  };
}

function createMockNpcSpell(overrides: Partial<Omit<NpcSpell, 'spell'>> & { spell?: Partial<Spell> } = {}): NpcSpell {
  const { spell: spellOverrides, ...npcSpellOverrides } = overrides;
  return {
    id: 1,
    npcId: 1,
    spellId: 1,
    priority: 50,
    castChance: 100,
    conditionType: 'any',
    conditionValue: 0,
    cooldownRounds: 0,
    spell: createMockSpell(spellOverrides),
    ...npcSpellOverrides,
  };
}

function createMockNpc(overrides: Partial<NpcCombatInstance> = {}): NpcCombatInstance {
  return {
    entityId: 1_000_001,
    entityName: 'test npc',
    isProperName: false,
    entityType: 'npc',
    vitals: {
      hp: 100,
      maxHp: 100,
      resource: 20,
      maxResource: 20,
      resourceType: 'mana' as any,
    },
    combatState: {
      targets: new Set(),
      isFighting: false,
    },
    characterLevel: 1,
    characterStats: { strength: 50, agility: 50, constitution: 50, intellect: 50, wisdom: 50, charisma: 50 } as any,
    combatLevel: 1,
    activeEffects: new Map(),
    deathState: null,
    regenState: { inCombat: false } as any,
    stealthMode: 'none' as any,
    canSeeHidden: false,
    templateId: 1,
    template: {
      id: 1,
      name: 'test npc',
      description: null,
      spawnRoomId: 1,
      health: 100,
      maxHealth: 100,
      hostile: true,
      respawnTime: 60,
      level: 1,
      experienceReward: 10,
      maxMana: 20,
      baseAccuracy: 50,
      baseDefense: 50,
      baseCritChance: 5,
      baseDodge: 5,
      damageReduction: 0,
      traits: [],
      fleeEnabled: false,
      fleeHpPercent: 0,
      callForHelpChance: 0,
      maxActive: 1,
      interactable: false,
      allowedAreas: [],
      roamEnabled: false,
      roamInterval: 0,
      roamChance: 0,
      dropTableId: null,
      essenceReward: 0,
      essenceClass: null,
      leaveCorpse: false,
      corpseDuration: 0,
      augmentations: [],
      enterRoomMessage: null,
      exitRoomMessage: null,
      spawnMessage: null,
      primaryFactionId: null,
      merchantEnabled: false,
      properName: false,
      spellPower: 10,
      enabled: true,
      attacks: [],
      spells: [],
    },
    currentRoomId: 1,
    currentMana: 20,
    behaviorState: 'idle',
    augmentation: null,
    dbInstanceId: 1,
    fleeDistance: 0,
    combatRoomId: null,
    hasCalledForHelp: false,
    nextRoamAt: 0,
    spellCooldowns: new Map(),
    combatRoundCount: 0,
    isCorpse: false,
    corpseRemoveAt: 0,
    ...overrides,
  } as NpcCombatInstance;
}

function createMockTarget(overrides: Partial<CombatEntity> = {}): CombatEntity {
  return {
    entityId: 1,
    entityName: 'test player',
    isProperName: true,
    entityType: 'player',
    vitals: {
      hp: 100,
      maxHp: 100,
      resource: 50,
      maxResource: 50,
      resourceType: 'mana' as any,
    },
    combatState: {
      targets: new Set(),
      isFighting: false,
    },
    characterLevel: 1,
    characterStats: { strength: 50, agility: 50, constitution: 50, intellect: 50, wisdom: 50, charisma: 50 } as any,
    combatLevel: 1,
    activeEffects: new Map(),
    deathState: null,
    regenState: { inCombat: false } as any,
    stealthMode: 'none' as any,
    canSeeHidden: false,
    ...overrides,
  } as CombatEntity;
}

// ============================================================================
// evaluateSpellCondition
// ============================================================================

describe('evaluateSpellCondition', () => {
  let npc: NpcCombatInstance;
  let target: CombatEntity;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(hasEffect).mockReturnValue(false);
    vi.mocked(getNpcsInRoom).mockReturnValue([]);
    npc = createMockNpc();
    target = createMockTarget();
  });

  it('"any" always returns true', () => {
    const spell = createMockNpcSpell({ conditionType: 'any' });
    expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
  });

  it('"any" returns true even with null target', () => {
    const spell = createMockNpcSpell({ conditionType: 'any' });
    expect(evaluateSpellCondition(spell, npc, null)).toBe(true);
  });

  // hp_below
  describe('hp_below', () => {
    it('returns true when HP% is below threshold', () => {
      npc.vitals.hp = 40;
      npc.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'hp_below', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });

    it('returns false when HP% is above threshold', () => {
      npc.vitals.hp = 60;
      npc.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'hp_below', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('returns false at exact boundary (strict <)', () => {
      npc.vitals.hp = 50;
      npc.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'hp_below', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });
  });

  // hp_above
  describe('hp_above', () => {
    it('returns true when HP% is above threshold', () => {
      npc.vitals.hp = 60;
      npc.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'hp_above', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });

    it('returns false when HP% is below threshold', () => {
      npc.vitals.hp = 40;
      npc.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'hp_above', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('returns false at exact boundary (strict >)', () => {
      npc.vitals.hp = 50;
      npc.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'hp_above', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });
  });

  // target_hp_below
  describe('target_hp_below', () => {
    it('returns true when target HP% is below threshold', () => {
      target.vitals.hp = 20;
      target.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'target_hp_below', conditionValue: 30 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });

    it('returns false when target HP% is above threshold', () => {
      target.vitals.hp = 80;
      target.vitals.maxHp = 100;
      const spell = createMockNpcSpell({ conditionType: 'target_hp_below', conditionValue: 30 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('returns false when target is null', () => {
      const spell = createMockNpcSpell({ conditionType: 'target_hp_below', conditionValue: 30 });
      expect(evaluateSpellCondition(spell, npc, null)).toBe(false);
    });
  });

  // mana_above
  describe('mana_above', () => {
    it('returns true when mana% is above threshold', () => {
      npc.currentMana = 60;
      npc.template.maxMana = 100;
      const spell = createMockNpcSpell({ conditionType: 'mana_above', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });

    it('returns false when mana% is below threshold', () => {
      npc.currentMana = 30;
      npc.template.maxMana = 100;
      const spell = createMockNpcSpell({ conditionType: 'mana_above', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('returns false when maxMana is 0', () => {
      npc.template.maxMana = 0;
      const spell = createMockNpcSpell({ conditionType: 'mana_above', conditionValue: 50 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });
  });

  // no_effect
  describe('no_effect', () => {
    it('returns true when target lacks the debuff effect', () => {
      vi.mocked(hasEffect).mockReturnValue(false);
      const spell = createMockNpcSpell({
        conditionType: 'no_effect',
        spell: { spellType: SpellType.DEBUFF, statusEffect: 'poison' },
      });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
      expect(hasEffect).toHaveBeenCalledWith(target, 'poison');
    });

    it('returns false when target already has the debuff effect', () => {
      vi.mocked(hasEffect).mockReturnValue(true);
      const spell = createMockNpcSpell({
        conditionType: 'no_effect',
        spell: { spellType: SpellType.DEBUFF, statusEffect: 'poison' },
      });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('checks self for buff spells (not target)', () => {
      vi.mocked(hasEffect).mockReturnValue(false);
      const spell = createMockNpcSpell({
        conditionType: 'no_effect',
        spell: { spellType: SpellType.BUFF, statusEffect: 'shield' },
      });
      evaluateSpellCondition(spell, npc, target);
      expect(hasEffect).toHaveBeenCalledWith(npc, 'shield');
    });

    it('checks self for healing spells (not target)', () => {
      vi.mocked(hasEffect).mockReturnValue(false);
      const spell = createMockNpcSpell({
        conditionType: 'no_effect',
        spell: { spellType: SpellType.HEALING, statusEffect: 'regen' },
      });
      evaluateSpellCondition(spell, npc, target);
      expect(hasEffect).toHaveBeenCalledWith(npc, 'regen');
    });

    it('returns true when spell has no statusEffect', () => {
      const spell = createMockNpcSpell({
        conditionType: 'no_effect',
        spell: { statusEffect: null },
      });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });

    it('returns false for offensive spell when target is null', () => {
      vi.mocked(hasEffect).mockReturnValue(false);
      const spell = createMockNpcSpell({
        conditionType: 'no_effect',
        spell: { spellType: SpellType.OFFENSIVE, statusEffect: 'burn' },
      });
      expect(evaluateSpellCondition(spell, npc, null)).toBe(false);
    });
  });

  // has_allies
  describe('has_allies', () => {
    it('returns true when enough allies are present', () => {
      const ally = createMockNpc({ entityId: 1_000_002 });
      vi.mocked(getNpcsInRoom).mockReturnValue([npc, ally]);
      const spell = createMockNpcSpell({ conditionType: 'has_allies', conditionValue: 1 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });

    it('returns false when alone', () => {
      vi.mocked(getNpcsInRoom).mockReturnValue([npc]);
      const spell = createMockNpcSpell({ conditionType: 'has_allies', conditionValue: 1 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('excludes dead allies from count', () => {
      const deadAlly = createMockNpc({ entityId: 1_000_002, vitals: { hp: 0, maxHp: 100, resourceType: 'mana' as any } });
      vi.mocked(getNpcsInRoom).mockReturnValue([npc, deadAlly]);
      const spell = createMockNpcSpell({ conditionType: 'has_allies', conditionValue: 1 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('returns true when allies exactly match threshold', () => {
      const ally1 = createMockNpc({ entityId: 1_000_002 });
      const ally2 = createMockNpc({ entityId: 1_000_003 });
      vi.mocked(getNpcsInRoom).mockReturnValue([npc, ally1, ally2]);
      const spell = createMockNpcSpell({ conditionType: 'has_allies', conditionValue: 2 });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });
  });

  // combat_start
  describe('combat_start', () => {
    it('returns true on round 0', () => {
      npc.combatRoundCount = 0;
      const spell = createMockNpcSpell({ conditionType: 'combat_start' });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(true);
    });

    it('returns false on round 1+', () => {
      npc.combatRoundCount = 1;
      const spell = createMockNpcSpell({ conditionType: 'combat_start' });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });

    it('returns false on round 5', () => {
      npc.combatRoundCount = 5;
      const spell = createMockNpcSpell({ conditionType: 'combat_start' });
      expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
    });
  });

  // unknown condition
  it('returns false for unknown condition type', () => {
    const spell = createMockNpcSpell({ conditionType: 'unknown_type' });
    expect(evaluateSpellCondition(spell, npc, target)).toBe(false);
  });
});

// ============================================================================
// selectNpcSpell
// ============================================================================

describe('selectNpcSpell', () => {
  let npc: NpcCombatInstance;
  let target: CombatEntity;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.mocked(hasEffect).mockReturnValue(false);
    vi.mocked(getNpcsInRoom).mockReturnValue([]);
    npc = createMockNpc();
    target = createMockTarget();
  });

  it('returns null for empty spells array', () => {
    npc.template.spells = [];
    expect(selectNpcSpell(npc, target)).toBeNull();
  });

  it('returns null when silenced', () => {
    vi.mocked(hasEffect).mockImplementation((_entity, effectId) => effectId === 'silenced');
    npc.template.spells = [createMockNpcSpell()];
    expect(selectNpcSpell(npc, target)).toBeNull();
  });

  it('selects a between-round spell (healing)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const healSpell = createMockNpcSpell({
      spell: { spellType: SpellType.HEALING, minDamage: null, maxDamage: null, minHealing: 1, maxHealing: 8 },
    });
    npc.template.spells = [healSpell];
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.selectionType).toBe('between_round');
  });

  it('selects an in-round spell (offensive with damage)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const offensiveSpell = createMockNpcSpell({
      spell: { spellType: SpellType.OFFENSIVE, minDamage: 2, maxDamage: 12 },
    });
    npc.template.spells = [offensiveSpell];
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.selectionType).toBe('in_round');
  });

  it('prefers between-round over in-round when both available', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const healSpell = createMockNpcSpell({
      spellId: 10,
      spell: { id: 10, spellType: SpellType.HEALING, minDamage: null, maxDamage: null, minHealing: 1, maxHealing: 8 },
    });
    const offensiveSpell = createMockNpcSpell({
      spellId: 20,
      spell: { id: 20, spellType: SpellType.OFFENSIVE, minDamage: 2, maxDamage: 12 },
    });
    npc.template.spells = [healSpell, offensiveSpell];
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.selectionType).toBe('between_round');
    expect(result!.npcSpell.spellId).toBe(10);
  });

  it('skips spell when mana is insufficient', () => {
    npc.currentMana = 3;
    const spell = createMockNpcSpell({
      spell: { manaCost: 100, spellType: SpellType.OFFENSIVE, minDamage: 1, maxDamage: 6 },
    });
    npc.template.spells = [spell];
    expect(selectNpcSpell(npc, target)).toBeNull();
  });

  it('skips spell on cooldown', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const spell = createMockNpcSpell({
      spellId: 5,
      spell: { spellType: SpellType.OFFENSIVE, minDamage: 1, maxDamage: 6 },
    });
    npc.template.spells = [spell];
    npc.spellCooldowns.set(5, 2);
    expect(selectNpcSpell(npc, target)).toBeNull();
  });

  it('skips spell when condition is not met', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    npc.vitals.hp = 80;
    npc.vitals.maxHp = 100;
    const spell = createMockNpcSpell({
      conditionType: 'hp_below',
      conditionValue: 50,
      spell: { spellType: SpellType.HEALING, minDamage: null, maxDamage: null, minHealing: 1, maxHealing: 8 },
    });
    npc.template.spells = [spell];
    expect(selectNpcSpell(npc, target)).toBeNull();
  });

  it('falls back to in-round when between-round unavailable', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const healSpell = createMockNpcSpell({
      spellId: 10,
      spell: { id: 10, spellType: SpellType.HEALING, minDamage: null, maxDamage: null, minHealing: 1, maxHealing: 8 },
    });
    const offensiveSpell = createMockNpcSpell({
      spellId: 20,
      spell: { id: 20, spellType: SpellType.OFFENSIVE, minDamage: 2, maxDamage: 12 },
    });
    npc.template.spells = [healSpell, offensiveSpell];
    // Put the heal spell on cooldown so between-round pass fails
    npc.spellCooldowns.set(10, 3);
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.selectionType).toBe('in_round');
    expect(result!.npcSpell.spellId).toBe(20);
  });

  it('picks highest priority (lowest number)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const lowPriority = createMockNpcSpell({
      spellId: 1,
      priority: 90,
      spell: { id: 1, spellType: SpellType.OFFENSIVE, minDamage: 1, maxDamage: 4 },
    });
    const highPriority = createMockNpcSpell({
      spellId: 2,
      priority: 10,
      spell: { id: 2, spellType: SpellType.OFFENSIVE, minDamage: 2, maxDamage: 12 },
    });
    npc.template.spells = [lowPriority, highPriority];
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.npcSpell.spellId).toBe(2);
  });

  it('castChance 0 never selects the spell', () => {
    // With castChance=0, the roll (1-100) will always exceed 0
    const spell = createMockNpcSpell({
      castChance: 0,
      spell: { spellType: SpellType.OFFENSIVE, minDamage: 1, maxDamage: 6 },
    });
    npc.template.spells = [spell];
    // Run multiple times to ensure it's never selected
    for (let i = 0; i < 20; i++) {
      expect(selectNpcSpell(npc, target)).toBeNull();
    }
  });

  it('castChance 100 always passes the roll', () => {
    // Mock Math.random to return 0.99 → roll = floor(0.99*100)+1 = 100 → 100 <= 100 → pass
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const spell = createMockNpcSpell({
      castChance: 100,
      spell: { spellType: SpellType.OFFENSIVE, minDamage: 1, maxDamage: 6 },
    });
    npc.template.spells = [spell];
    expect(selectNpcSpell(npc, target)).not.toBeNull();
  });

  it('buff spells are classified as between-round', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const buffSpell = createMockNpcSpell({
      spell: { spellType: SpellType.BUFF, minDamage: null, maxDamage: null, statusEffect: 'shield' },
    });
    npc.template.spells = [buffSpell];
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.selectionType).toBe('between_round');
  });

  it('debuff spells are classified as between-round', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const debuffSpell = createMockNpcSpell({
      spell: { spellType: SpellType.DEBUFF, minDamage: null, maxDamage: null, statusEffect: 'slow' },
    });
    npc.template.spells = [debuffSpell];
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.selectionType).toBe('between_round');
  });

  it('offensive spell without damage is classified as between-round', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const offensiveNoDmg = createMockNpcSpell({
      spell: { spellType: SpellType.OFFENSIVE, minDamage: null, maxDamage: null, statusEffect: 'burn' },
    });
    npc.template.spells = [offensiveNoDmg];
    const result = selectNpcSpell(npc, target);
    expect(result).not.toBeNull();
    expect(result!.selectionType).toBe('between_round');
  });
});

// ============================================================================
// setSpellCooldown
// ============================================================================

describe('setSpellCooldown', () => {
  let npc: NpcCombatInstance;

  beforeEach(() => {
    npc = createMockNpc();
  });

  it('sets cooldown when rounds > 0', () => {
    setSpellCooldown(npc, 5, 3);
    expect(npc.spellCooldowns.has(5)).toBe(true);
    expect(npc.spellCooldowns.get(5)).toBe(3);
  });

  it('does not set cooldown when rounds is 0', () => {
    setSpellCooldown(npc, 5, 0);
    expect(npc.spellCooldowns.has(5)).toBe(false);
  });

  it('overwrites existing cooldown', () => {
    npc.spellCooldowns.set(5, 1);
    setSpellCooldown(npc, 5, 4);
    expect(npc.spellCooldowns.get(5)).toBe(4);
  });
});
