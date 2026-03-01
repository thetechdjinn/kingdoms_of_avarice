/**
 * NPC Spell AI — Decision Layer
 *
 * Evaluates casting conditions, selects spells based on priority and timing,
 * and manages cooldown state for NPC spellcasters. Does NOT execute spells
 * (that's Phase C).
 */

import { SpellType } from '@koa/shared';
import type { NpcSpell } from '@koa/shared';
import type { NpcCombatInstance } from './npcManager.js';
import { getNpcsInRoom } from './npcManager.js';
import type { CombatEntity } from './combatEntity.js';
import { hasEffect } from './statusEffects.js';

// ============================================================================
// Types
// ============================================================================

export type SpellTiming = 'in_round' | 'between_round';

export interface NpcSpellSelection {
  npcSpell: NpcSpell;
  selectionType: SpellTiming;
}

// ============================================================================
// Spell Timing Classification
// ============================================================================

/**
 * Classify a spell's timing based on its type and properties.
 * Offensive spells with damage dice fire during the attack round (in_round).
 * Everything else (buffs, debuffs, heals, DoTs) fires between rounds.
 */
function classifySpellTiming(npcSpell: NpcSpell): SpellTiming {
  if (npcSpell.spell.spellType === SpellType.OFFENSIVE && npcSpell.spell.damageDice) {
    return 'in_round';
  }
  return 'between_round';
}

// ============================================================================
// Condition Evaluation
// ============================================================================

/**
 * Evaluate whether an NPC spell's casting condition is met.
 *
 * Condition types:
 * - any:             Always true
 * - hp_below:        NPC HP% < conditionValue
 * - hp_above:        NPC HP% > conditionValue
 * - target_hp_below: Target HP% < conditionValue (false if no target)
 * - mana_above:      NPC mana% > conditionValue
 * - no_effect:       Target does NOT have the spell's statusEffect
 * - has_allies:      Alive NPCs in room (excl self) >= conditionValue
 * - combat_start:    This is round 0 of the engagement
 */
export function evaluateSpellCondition(
  npcSpell: NpcSpell,
  npc: NpcCombatInstance,
  target: CombatEntity | null
): boolean {
  const { conditionType, conditionValue } = npcSpell;

  switch (conditionType) {
    case 'any':
      return true;

    case 'hp_below': {
      const hpPct = (npc.vitals.hp / npc.vitals.maxHp) * 100;
      return hpPct < conditionValue;
    }

    case 'hp_above': {
      const hpPct = (npc.vitals.hp / npc.vitals.maxHp) * 100;
      return hpPct > conditionValue;
    }

    case 'target_hp_below': {
      if (!target) return false;
      const targetHpPct = (target.vitals.hp / target.vitals.maxHp) * 100;
      return targetHpPct < conditionValue;
    }

    case 'mana_above': {
      if (npc.template.maxMana <= 0) return false;
      const manaPct = (npc.currentMana / npc.template.maxMana) * 100;
      return manaPct > conditionValue;
    }

    case 'no_effect': {
      const effectId = npcSpell.spell.statusEffect;
      if (!effectId) return true; // No status effect on spell — condition trivially met
      // For self-targeting spells (buffs/heals), check the NPC itself.
      // For enemy-targeting spells (debuffs/offensive), check the target.
      const spellType = npcSpell.spell.spellType;
      if (spellType === SpellType.BUFF || spellType === SpellType.HEALING) {
        return !hasEffect(npc, effectId);
      }
      if (!target) return false;
      return !hasEffect(target, effectId);
    }

    case 'has_allies': {
      const roomNpcs = getNpcsInRoom(npc.currentRoomId);
      const aliveAllies = roomNpcs.filter(
        other => other.entityId !== npc.entityId && other.vitals.hp > 0
      );
      return aliveAllies.length >= conditionValue;
    }

    case 'combat_start':
      return npc.combatRoundCount === 0;

    default:
      return false;
  }
}

// ============================================================================
// Spell Selection
// ============================================================================

/**
 * Filter eligible spells by timing, mana, cooldown, condition, and cast chance.
 * Returns the highest-priority eligible spell (ties broken randomly).
 */
function selectFromPool(
  spells: NpcSpell[],
  timing: SpellTiming,
  npc: NpcCombatInstance,
  target: CombatEntity | null
): NpcSpell | null {
  // Filter to matching timing
  const pool = spells.filter(s => classifySpellTiming(s) === timing);
  if (pool.length === 0) return null;

  // Filter: enough mana
  const affordable = pool.filter(s => npc.currentMana >= s.spell.manaCost);
  if (affordable.length === 0) return null;

  // Filter: not on cooldown
  const ready = affordable.filter(s => !npc.spellCooldowns.has(s.spellId));
  if (ready.length === 0) return null;

  // Filter: condition met
  const conditionMet = ready.filter(s => evaluateSpellCondition(s, npc, target));
  if (conditionMet.length === 0) return null;

  // Filter: cast chance roll (castChance is 0-100 %)
  const rolled = conditionMet.filter(s => {
    const roll = Math.floor(Math.random() * 100) + 1; // 1-100
    return roll <= s.castChance;
  });
  if (rolled.length === 0) return null;

  // Pick highest priority (lowest number = highest priority); ties random
  rolled.sort((a, b) => a.priority - b.priority);
  const bestPriority = rolled[0].priority;
  const tied = rolled.filter(s => s.priority === bestPriority);
  return tied[Math.floor(Math.random() * tied.length)];
}

/**
 * Select a spell for an NPC to cast this round.
 *
 * Two-pass selection:
 * 1. Between-round spells (buff/debuff/heal/dot) — checked first
 * 2. In-round spells (offensive damage) — checked second
 *
 * Returns the selected spell with its timing, or null (NPC melees).
 */
export function selectNpcSpell(
  npc: NpcCombatInstance,
  target: CombatEntity | null
): NpcSpellSelection | null {
  const spells = npc.template.spells;
  if (spells.length === 0) return null;

  // Silenced NPCs cannot cast spells
  if (hasEffect(npc, 'silenced')) return null;

  // Pass 1: between-round (buffs, debuffs, heals, dots)
  const betweenRound = selectFromPool(spells, 'between_round', npc, target);
  if (betweenRound) {
    return { npcSpell: betweenRound, selectionType: 'between_round' };
  }

  // Pass 2: in-round (offensive damage)
  const inRound = selectFromPool(spells, 'in_round', npc, target);
  if (inRound) {
    return { npcSpell: inRound, selectionType: 'in_round' };
  }

  return null;
}

// ============================================================================
// Cooldown Management
// ============================================================================

/**
 * Set a cooldown on a spell for an NPC.
 * Called by Phase C after a spell is successfully cast.
 */
export function setSpellCooldown(
  npc: NpcCombatInstance,
  spellId: number,
  cooldownRounds: number
): void {
  if (cooldownRounds > 0) {
    npc.spellCooldowns.set(spellId, cooldownRounds);
  }
}
