/**
 * NPC Death Handler
 *
 * Processes NPC death: XP distribution, loot drops, despawn, respawn queue.
 */

import { MessageType, ItemLocationType } from '@koa/shared';
import type { CurrencyDenomination } from '@koa/shared';
import type { CombatEntity } from './combatEntity.js';
import { isPlayerEntity } from './combatEntity.js';
import type { NpcCombatInstance } from './npcManager.js';
import { removeNpcInstance, queueRespawn, markAsCorpse, getSpawnConfig } from './npcManager.js';
import { sendCombatMessage, broadcastCombatToRoom } from './combatMessaging.js';
import { colors } from '../utils/colors.js';
import { awardEssence, awardXp } from './progression.js';
import { copperToDenominationCounts } from '../utils/textFormat.js';
import * as dropTableRepo from '../db/repositories/dropTableRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import type { AuthenticatedSocket } from './socket.js';
import { getGroupMembers } from './groupManager.js';
import { checkKillTrigger } from './questManager.js';

/** Level gap for XP eligibility: players more than this many levels apart get nothing */
const XP_LEVEL_GAP = 5;

/**
 * Process NPC death: award XP, drop gold/loot, despawn, queue respawn.
 */
export async function processNpcDeath(
  npc: NpcCombatInstance,
  attacker: CombatEntity | null,
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  deferredRewards: Array<() => Promise<void>> = [],
  preCollectedParticipants?: CombatEntity[]
): Promise<void> {
  const template = npc.template;

  // Use pre-collected participants if provided (snapshotted before clearCombatState
  // wiped target lists), otherwise fall back to scanning current targets.
  let participants: CombatEntity[];
  if (preCollectedParticipants && preCollectedParticipants.length > 0) {
    participants = preCollectedParticipants;
  } else {
    participants = [];
    for (const [, socket] of connectedPlayers) {
      if (socket.combatState.targets.has(npc.entityId)) {
        participants.push(socket);
      }
    }
    if (attacker && isPlayerEntity(attacker) && !participants.includes(attacker)) {
      participants.push(attacker);
    }
  }

  // Merchants don't drop gold or loot — their inventory persists through death/respawn
  if (!template.merchantEnabled) {
    // Process drop table (currency + loot, before COMBAT OFF)
    if (template.dropTableId) {
      await processDropTable(template.dropTableId, roomId);
    }
  }

  // Defer XP/essence to send after COMBAT OFF
  if (template.experienceReward > 0 && participants.length > 0) {
    // Capture participants snapshot for deferred execution
    const xpParticipants = [...participants];
    deferredRewards.push(() => distributeXp(npc, xpParticipants));
  }

  if (template.essenceReward > 0 && participants.length > 0) {
    const essenceParticipants = [...participants];
    deferredRewards.push(() => distributeEssence(npc, essenceParticipants));
  }

  // Defer quest kill trigger check
  if (participants.length > 0) {
    const questParticipants = [...participants];
    deferredRewards.push(() => checkKillTrigger(npc.templateId, questParticipants));
  }

  // Despawn or leave corpse
  if (template.leaveCorpse) {
    // Corpse stays in room; respawn is queued when corpse expires (processCorpseCleanup)
    markAsCorpse(npc);
  } else {
    removeNpcInstance(npc.entityId);

    // Queue respawn using per-spawn-point config
    const spawnConfig = getSpawnConfig(npc.templateId, npc.spawnRoomId);
    if (spawnConfig && spawnConfig.respawnSeconds > 0) {
      queueRespawn(npc.templateId, npc.spawnRoomId, spawnConfig.respawnSeconds);
    }
  }
}

/**
 * Distribute XP to participating players using level-weighted formula.
 * Each player gets: (playerLevel / totalLevels) * xpReward
 * Players outside the level gap range get nothing.
 */
async function distributeXp(
  npc: NpcCombatInstance,
  participants: CombatEntity[]
): Promise<void> {
  const xpReward = npc.template.experienceReward;
  const npcLevel = npc.template.level;

  // Filter out players outside level gap
  const eligible = participants.filter(p => {
    const levelDiff = Math.abs(p.characterLevel - npcLevel);
    return levelDiff <= XP_LEVEL_GAP;
  });

  if (eligible.length === 0) return;

  // Calculate total levels for weighting
  const totalLevels = eligible.reduce((sum, p) => sum + p.characterLevel, 0);

  for (const player of eligible) {
    if (!isPlayerEntity(player) || !player.characterId) continue;

    // Level-weighted share
    const share = Math.max(1, Math.floor((player.characterLevel / totalLevels) * xpReward));

    // Group bonus: +10% per additional group member who participated, max +40%
    const groupMembers = getGroupMembers(player.entityId);
    const eligibleIds = new Set(eligible.map(e => e.entityId));
    const participatingGroupMembers = groupMembers.filter(id => eligibleIds.has(id)).length;
    const additionalMembers = Math.max(0, participatingGroupMembers - 1);
    const groupBonusMultiplier = 1.0 + Math.min(additionalMembers * 0.10, 0.40);
    const finalShare = Math.max(1, Math.floor(share * groupBonusMultiplier));

    // Award XP to progression system (std_xp — the single source of truth for leveling)
    try {
      await awardXp(player.characterId, finalShare);

      sendCombatMessage(player, MessageType.SYSTEM,
        colors.green(`You gain ${finalShare} experience.`)
      );
    } catch (error) {
      console.error(`[NPC Death] Failed to award XP to character ${player.characterId}:`, error);
    }
  }
}

/**
 * Distribute essence to eligible participants.
 * Each eligible player gets the full essenceReward (not split).
 * Essence is class-gated: if essenceClass is set, only matching class gets it.
 * If essenceClass is null, all classes are eligible.
 */
async function distributeEssence(
  npc: NpcCombatInstance,
  participants: CombatEntity[]
): Promise<void> {
  const essenceReward = npc.template.essenceReward;
  const essenceClass = npc.template.essenceClass;
  const npcLevel = npc.template.level;

  for (const player of participants) {
    if (!isPlayerEntity(player) || !player.characterId) continue;

    // Level gap check (reuse same constant as XP)
    const levelDiff = Math.abs(player.characterLevel - npcLevel);
    if (levelDiff > XP_LEVEL_GAP) continue;

    // Class gate: if essenceClass is set, only matching class gets essence
    if (essenceClass) {
      try {
        const character = await characterRepo.findCharacterById(player.characterId);
        if (!character || character.class !== essenceClass) continue;
      } catch (error) {
        console.error(`[NPC Death] Failed to look up class for character ${player.characterId}:`, error);
        continue;
      }
    }

    // Award full essence amount to each eligible player
    const success = await awardEssence(player.characterId, essenceReward);
    if (success) {
      sendCombatMessage(player, MessageType.SYSTEM,
        colors.green(`You gain ${essenceReward} essence.`)
      );
    }
  }
}

// ============================================================================
// Currency / Denomination Drop System
// ============================================================================

/** Cache for denomination coin template IDs (e.g. "gold coins" → template) */
const denominationTemplateCache = new Map<string, { id: number } | null>();

/** Map denomination name to item template name */
const DENOMINATION_TEMPLATE_NAMES: Record<CurrencyDenomination, string> = {
  copper: 'copper coins',
  silver: 'silver coins',
  gold: 'gold coins',
  platinum: 'platinum coins',
  runic: 'runic coins',
};

/**
 * Look up the item template for a denomination coin, with caching.
 */
async function getDenominationTemplate(denom: CurrencyDenomination): Promise<{ id: number } | null> {
  const name = DENOMINATION_TEMPLATE_NAMES[denom];
  if (denominationTemplateCache.has(name)) {
    return denominationTemplateCache.get(name)!;
  }

  try {
    const template = await itemRepo.getTemplateByName(name);
    const result = template ? { id: template.id } : null;
    denominationTemplateCache.set(name, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Drop a copper amount as individual denomination coin items in a room.
 * Converts copper to the best-fit denominations, then creates/stacks
 * item instances for each denomination.
 */
async function dropCurrencyAsDenominations(
  copperAmount: number,
  allowedDenominations: readonly CurrencyDenomination[],
  roomId: number
): Promise<void> {
  if (copperAmount <= 0) return;

  const counts = copperToDenominationCounts(copperAmount, allowedDenominations);

  for (const [denom, count] of counts) {
    if (count <= 0) continue;

    const template = await getDenominationTemplate(denom);
    if (!template) {
      console.warn(`[NPC Death] ${denom} coin template not found, skipping`);
      continue;
    }

    // Stack with existing coins in room
    const existing = await itemRepo.findStackableInstance(
      template.id,
      'room' as ItemLocationType,
      roomId
    );

    if (existing) {
      await itemRepo.addToInstanceQuantity(existing.id, count);
    } else {
      await itemRepo.createInstance({
        template_id: template.id,
        location_type: 'room' as ItemLocationType,
        location_id: roomId,
        quantity: count,
      });
    }
  }
}

/**
 * Process a drop table — roll for each entry, spawn items that pass the check.
 * Currency entries use the denomination system with allowed_denominations filtering.
 * Currency drops are announced to the room.
 */
async function processDropTable(dropTableId: number, roomId: number): Promise<void> {
  try {
    const entries = await dropTableRepo.getEntriesForDropTable(dropTableId);

    for (const entry of entries) {
      // Roll against drop chance
      const roll = Math.random() * 100;
      if (roll > entry.dropChance) continue;

      if (entry.itemTemplateId) {
        // Drop an item
        const quantity = entry.minQuantity + Math.floor(
          Math.random() * (entry.maxQuantity - entry.minQuantity + 1)
        );

        await itemRepo.createInstance({
          template_id: entry.itemTemplateId,
          location_type: 'room' as ItemLocationType,
          location_id: roomId,
          quantity,
        });
      }

      // Drop currency from entry if specified
      if (entry.currencyMin > 0 || entry.currencyMax > 0) {
        const currencyAmount = entry.currencyMin + Math.floor(
          Math.random() * (entry.currencyMax - entry.currencyMin + 1)
        );
        if (currencyAmount > 0) {
          // Calculate denominations before dropping so we can announce them
          const counts = copperToDenominationCounts(currencyAmount, entry.allowedDenominations);
          await dropCurrencyAsDenominations(
            currencyAmount,
            entry.allowedDenominations,
            roomId
          );
          // Announce each denomination dropped
          for (const [denom, count] of counts) {
            if (count <= 0) continue;
            broadcastCombatToRoom(roomId, colors.gold(`${count} ${denom} drops to the ground.`), []);
          }
        }
      }
    }
  } catch (error) {
    console.error('[NPC Death] Failed to process drop table:', error);
  }
}

/**
 * Clear the denomination template cache. Called by @reload droptables.
 */
export function clearDenominationCache(): void {
  denominationTemplateCache.clear();
}
