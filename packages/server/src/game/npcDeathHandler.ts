/**
 * NPC Death Handler
 *
 * Processes NPC death: XP distribution, gold/loot drops, despawn, respawn queue.
 */

import { MessageType } from '@koa/shared';
import type { CombatEntity } from './combatEntity.js';
import { isPlayerEntity } from './combatEntity.js';
import type { NpcCombatInstance } from './npcManager.js';
import { removeNpcInstance, queueRespawn } from './npcManager.js';
import { sendCombatMessage, broadcastCombatToRoom } from './combatMessaging.js';
import { colors } from '../utils/colors.js';
import * as npcRepo from '../db/repositories/npcRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import type { AuthenticatedSocket } from './socket.js';
import { ItemLocationType } from '@koa/shared';

/** Level gap for XP eligibility: players more than this many levels apart get nothing */
const XP_LEVEL_GAP = 5;

/**
 * Process NPC death: award XP, drop gold/loot, despawn, queue respawn.
 */
export async function processNpcDeath(
  npc: NpcCombatInstance,
  attacker: CombatEntity | null,
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<void> {
  const template = npc.template;

  // Collect all players who had this NPC targeted (the "party")
  const participants: CombatEntity[] = [];
  for (const [, socket] of connectedPlayers) {
    if (socket.combatState.targets.has(npc.entityId)) {
      participants.push(socket);
    }
  }
  // Ensure the attacker is included
  if (attacker && isPlayerEntity(attacker) && !participants.includes(attacker)) {
    participants.push(attacker);
  }

  // Award XP
  if (template.experienceReward > 0 && participants.length > 0) {
    await distributeXp(npc, participants);
  }

  // Drop gold
  if (template.goldMin > 0 || template.goldMax > 0) {
    await dropGold(npc, roomId);
  }

  // Process drop table (loot)
  if (template.dropTableId) {
    await processDropTable(template.dropTableId, roomId);
  }

  // Despawn the NPC instance
  removeNpcInstance(npc.entityId);

  // Queue respawn if template has a respawn time
  if (template.respawnTime && template.respawnTime > 0 && template.spawnRoomId) {
    queueRespawn(template.id, template.spawnRoomId, template.respawnTime);
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

    // Award XP via character repository
    try {
      // Get current experience first, then set new value
      const character = await characterRepo.findCharacterById(player.characterId);
      if (character) {
        const newXp = character.experience + share;
        await characterRepo.updateCharacterStats(player.characterId, { experience: newXp });
      }

      sendCombatMessage(player, MessageType.SYSTEM,
        colors.green(`You gain ${share} experience.`)
      );
    } catch (error) {
      console.error(`[NPC Death] Failed to award XP to character ${player.characterId}:`, error);
    }
  }
}

/**
 * Drop gold on the ground in the room where the NPC died.
 * Creates currency item instances using the existing item system.
 */
async function dropGold(npc: NpcCombatInstance, roomId: number): Promise<void> {
  const { goldMin, goldMax } = npc.template;
  const goldAmount = goldMin + Math.floor(Math.random() * (goldMax - goldMin + 1));

  if (goldAmount <= 0) return;

  try {
    // Find the gold coin template
    const goldTemplate = await findCurrencyTemplate('gold coins');
    if (!goldTemplate) {
      console.warn('[NPC Death] Gold coin template not found, skipping gold drop');
      return;
    }

    // Check for existing stackable gold in room
    const existingGold = await itemRepo.findStackableInstance(
      goldTemplate.id,
      'room' as ItemLocationType,
      roomId
    );

    if (existingGold) {
      // Add to existing stack
      await itemRepo.addToInstanceQuantity(existingGold.id, goldAmount);
    } else {
      // Create new gold stack
      await itemRepo.createInstance({
        template_id: goldTemplate.id,
        location_type: 'room' as ItemLocationType,
        location_id: roomId,
        quantity: goldAmount,
      });
    }

    broadcastCombatToRoom(
      roomId,
      colors.gold(`${goldAmount} gold coins scatter across the ground.`),
      []
    );
  } catch (error) {
    console.error('[NPC Death] Failed to drop gold:', error);
  }
}

/**
 * Process a drop table — roll for each entry, spawn items that pass the check.
 */
async function processDropTable(dropTableId: number, roomId: number): Promise<void> {
  try {
    const entries = await npcRepo.getDropTableEntries(dropTableId);

    for (const entry of entries) {
      // Roll against drop chance
      const roll = Math.random() * 100;
      if (roll > entry.drop_chance) continue;

      if (entry.item_template_id) {
        // Drop an item
        const quantity = entry.min_quantity + Math.floor(
          Math.random() * (entry.max_quantity - entry.min_quantity + 1)
        );

        await itemRepo.createInstance({
          template_id: entry.item_template_id,
          location_type: 'room' as ItemLocationType,
          location_id: roomId,
          quantity,
        });
      }

      // Drop currency from entry if specified
      if (entry.currency_min > 0 || entry.currency_max > 0) {
        const currencyAmount = entry.currency_min + Math.floor(
          Math.random() * (entry.currency_max - entry.currency_min + 1)
        );
        if (currencyAmount > 0) {
          const goldTemplate = await findCurrencyTemplate('gold coins');
          if (goldTemplate) {
            // Stack with existing gold in room
            const existingGold = await itemRepo.findStackableInstance(
              goldTemplate.id,
              'room' as ItemLocationType,
              roomId
            );
            if (existingGold) {
              await itemRepo.addToInstanceQuantity(existingGold.id, currencyAmount);
            } else {
              await itemRepo.createInstance({
                template_id: goldTemplate.id,
                location_type: 'room' as ItemLocationType,
                location_id: roomId,
                quantity: currencyAmount,
              });
            }

            broadcastCombatToRoom(
              roomId,
              colors.gold(`${currencyAmount} gold coins scatter across the ground.`),
              []
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('[NPC Death] Failed to process drop table:', error);
  }
}

// Cache for currency template IDs
const currencyTemplateCache = new Map<string, { id: number } | null>();

async function findCurrencyTemplate(name: string): Promise<{ id: number } | null> {
  if (currencyTemplateCache.has(name)) {
    return currencyTemplateCache.get(name)!;
  }

  try {
    const templates = await itemRepo.getAllTemplates();
    const template = templates.find(t => t.name.toLowerCase() === name.toLowerCase());
    const result = template ? { id: template.id } : null;
    currencyTemplateCache.set(name, result);
    return result;
  } catch {
    return null;
  }
}
