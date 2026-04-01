/**
 * Quest Manager
 *
 * In-memory cache of quest definitions with trigger evaluation, step advancement,
 * and reward distribution. Follows the npcManager.ts cache/reload pattern.
 */

import { MessageType, ItemLocationType } from '@koa/shared';
import type { Quest, QuestStep } from '@koa/shared';
import type { CombatEntity } from './combatEntity.js';
import { isPlayerEntity } from './combatEntity.js';
import type { AuthenticatedSocket } from './socket.js';
import { sendMessage, connectedPlayers } from './socket.js';
import * as questRepo from '../db/repositories/questRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import * as factionRepo from '../db/repositories/factionRepository.js';
import { awardEssence, awardXp } from './progression.js';
import { wordWrap, renderColorMarkup } from '../utils/textFormat.js';
import { colors } from '../utils/colors.js';

// ============================================================================
// Cache
// ============================================================================

const questCache = new Map<number, Quest>();
const questTagIndex = new Map<string, Quest>();
const questNpcIndex = new Map<number, Quest[]>();   // NPC template ID → quests involving that NPC
const questRoomIndex = new Map<number, Quest[]>();   // room ID → quests with visit steps

// ============================================================================
// Initialization
// ============================================================================

export async function initializeQuestManager(): Promise<void> {
  const count = await reloadQuests();
  console.log(`[Quest] Loaded ${count} quest definitions`);
}

export async function reloadQuests(): Promise<number> {
  questCache.clear();
  questTagIndex.clear();
  questNpcIndex.clear();
  questRoomIndex.clear();

  const quests = await questRepo.getAllQuests();

  for (const quest of quests) {
    questCache.set(quest.id, quest);
    questTagIndex.set(quest.tag, quest);

    // Index by quest giver NPC
    if (quest.questGiverNpcId) {
      addToNpcIndex(quest.questGiverNpcId, quest);
    }

    // Index by step NPCs and rooms
    for (const step of quest.steps) {
      if (step.triggerNpcId) {
        addToNpcIndex(step.triggerNpcId, quest);
      }
      if (step.triggerType === 'visit' && step.triggerRoomId) {
        const existing = questRoomIndex.get(step.triggerRoomId) ?? [];
        if (!existing.includes(quest)) {
          existing.push(quest);
          questRoomIndex.set(step.triggerRoomId, existing);
        }
      }
    }
  }

  return quests.length;
}

function addToNpcIndex(npcTemplateId: number, quest: Quest): void {
  const existing = questNpcIndex.get(npcTemplateId) ?? [];
  if (!existing.includes(quest)) {
    existing.push(quest);
    questNpcIndex.set(npcTemplateId, existing);
  }
}

// ============================================================================
// Cache Accessors
// ============================================================================

export function getQuestById(id: number): Quest | undefined {
  return questCache.get(id);
}

export function getQuestByTag(tag: string): Quest | undefined {
  return questTagIndex.get(tag);
}

export function getAllCachedQuests(): Quest[] {
  return Array.from(questCache.values());
}

// ============================================================================
// Talk Trigger (Directed Speech)
// ============================================================================

/**
 * Check if directed speech to an NPC triggers a quest event.
 * Returns formatted quest response text, or null if no quest match.
 */
export async function checkTalkTrigger(
  socket: AuthenticatedSocket,
  npcTemplateId: number,
  message: string,
): Promise<string | null> {
  const quests = questNpcIndex.get(npcTemplateId);
  if (!quests || !socket.characterId) return null;

  const characterId = socket.characterId;
  const messageLower = message.toLowerCase();

  // Sort by sort_order for deterministic priority
  const sorted = [...quests].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  for (const quest of sorted) {
    if (!quest.enabled) continue;

    const charQuest = await questRepo.getCharacterQuest(characterId, quest.id);

    // Already completed
    if (charQuest?.status === 'completed') {
      if (quest.completedDialogue && matchesTriggerText(quest, messageLower, npcTemplateId)) {
        return formatNpcDialogue(quest.completedDialogue, socket);
      }
      continue;
    }

    // Active quest — check current step
    if (charQuest?.status === 'active') {
      const step = getStepByOrder(quest, charQuest.currentStep);
      if (!step) continue;

      // Only handle talk steps targeting this NPC
      if (step.triggerType !== 'talk' || step.triggerNpcId !== npcTemplateId) continue;

      // Check trigger text match
      if (!step.triggerText || !messageLower.includes(step.triggerText.toLowerCase())) continue;

      // Optional item check (lazy collect/deliver)
      let itemToConsume: number | null = null;
      if (step.triggerItemTemplateId) {
        const inventory = await itemRepo.getCharacterInventory(characterId);
        const matchingItem = inventory.find(
          item => item.template_id === step.triggerItemTemplateId
        );

        if (!matchingItem) {
          // Player doesn't have the required item
          if (step.inProgressDialogue) {
            return formatNpcDialogue(step.inProgressDialogue, socket);
          }
          return null;
        }

        if (step.consumeItem) {
          itemToConsume = matchingItem.id;
        }
      }

      // Step matched — advance quest (defer so player's speech arrives first)
      const consumeId = itemToConsume;
      setTimeout(async () => {
        try {
          // Consume item inside the deferred callback so it's not lost if advancement fails
          if (consumeId !== null) {
            await itemRepo.deleteInstance(consumeId);
          }
          await advanceQuestStep(socket, quest, charQuest.currentStep);
        } catch (err) {
          console.error('[Quest] Failed to advance step:', err);
        }
      }, 0);
      return ''; // Signal handled — no NPC dialogue to show
    }

    // Not started — check if first step matches
    if (!charQuest) {
      const firstStep = getStepByOrder(quest, 1);
      if (!firstStep) continue;

      // First step must be a talk trigger on this NPC
      if (firstStep.triggerType !== 'talk' || firstStep.triggerNpcId !== npcTemplateId) continue;

      // Check trigger text match
      if (!firstStep.triggerText || !messageLower.includes(firstStep.triggerText.toLowerCase())) continue;

      // Check prerequisites
      const prereqResult = await canStartQuest(characterId, quest);
      if (!prereqResult.allowed) {
        if (quest.denialDialogue) {
          return formatNpcDialogue(quest.denialDialogue, socket);
        }
        return null;
      }

      // Start quest (defer so player's speech arrives first)
      const questId = quest.id;
      const questRef = quest;
      const stepRef = firstStep;
      const nextStep = questRef.steps.length > 1 ? getStepByOrder(questRef, 2) ?? null : null;
      setTimeout(async () => {
        try {
          await questRepo.startQuest(characterId, questId);
          sendQuestStartMessage(socket, questRef, stepRef, nextStep);
          await grantStepRewards(socket, stepRef);

          if (questRef.steps.length === 1) {
            // Single-step quest — complete immediately
            await completeQuest(socket, questRef, characterId);
          } else {
            // Advance past step 1 since it was just completed by the accept trigger
            await questRepo.advanceStep(characterId, questId, 2);
          }
        } catch (err) {
          console.error('[Quest] Failed to start quest:', err);
        }
      }, 0);
      return ''; // Signal handled — no NPC dialogue to show
    }
  }

  return null;
}

/**
 * Check if any step of a quest has a talk trigger matching this NPC + text.
 * Used for completed_dialogue matching.
 */
function matchesTriggerText(quest: Quest, messageLower: string, npcTemplateId: number): boolean {
  // Check if the quest giver is this NPC and any step text matches
  if (quest.questGiverNpcId === npcTemplateId) {
    for (const step of quest.steps) {
      if (step.triggerText && messageLower.includes(step.triggerText.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// Kill Trigger (NPC Death)
// ============================================================================

/**
 * Check if killing an NPC advances any quest for participating players.
 * Called from npcDeathHandler after XP/essence distribution.
 */
export async function checkKillTrigger(
  npcTemplateId: number,
  participants: CombatEntity[]
): Promise<void> {
  const quests = questNpcIndex.get(npcTemplateId);
  if (!quests) return;

  for (const player of participants) {
    if (!isPlayerEntity(player) || !player.characterId) continue;

    const characterId = player.characterId;

    for (const quest of quests) {
      if (!quest.enabled) continue;

      const charQuest = await questRepo.getCharacterQuest(characterId, quest.id);
      if (!charQuest || charQuest.status !== 'active') continue;

      const step = getStepByOrder(quest, charQuest.currentStep);
      if (!step) continue;
      if (step.triggerType !== 'kill' || step.triggerNpcId !== npcTemplateId) continue;

      // Increment kill count
      const newCount = await questRepo.incrementQuestProgress(characterId, step.id);

      // Look up the actual socket for messaging
      const socket = connectedPlayers.get(player.entityId);
      if (!socket) continue;

      if (newCount >= step.requiredCount) {
        // Re-read current step to guard against race with simultaneous kills
        const freshQuest = await questRepo.getCharacterQuest(characterId, quest.id);
        if (!freshQuest || freshQuest.currentStep !== charQuest.currentStep) continue;

        // Step complete
        await advanceQuestStep(socket, quest, charQuest.currentStep);
      } else {
        // Progress update
        sendMessage(socket, MessageType.SYSTEM,
          colors.white(wordWrap(`Quest progress: ${step.description} (${newCount}/${step.requiredCount})`, 80))
        );
      }
    }
  }
}

// ============================================================================
// Visit Trigger (Room Entry)
// ============================================================================

/**
 * Check if entering a room completes a visit quest step.
 * Called from handleMove/moveFollower after room transition.
 */
export async function checkVisitTrigger(
  socket: AuthenticatedSocket,
  roomId: number
): Promise<void> {
  const quests = questRoomIndex.get(roomId);
  if (!quests || !socket.characterId) return;

  const characterId = socket.characterId;

  for (const quest of quests) {
    if (!quest.enabled) continue;

    const charQuest = await questRepo.getCharacterQuest(characterId, quest.id);
    if (!charQuest || charQuest.status !== 'active') continue;

    const step = getStepByOrder(quest, charQuest.currentStep);
    if (!step) continue;
    if (step.triggerType !== 'visit' || step.triggerRoomId !== roomId) continue;

    // Step complete
    await advanceQuestStep(socket, quest, charQuest.currentStep);
  }
}

// ============================================================================
// Step Advancement & Quest Completion
// ============================================================================

async function advanceQuestStep(
  socket: AuthenticatedSocket,
  quest: Quest,
  currentStepOrder: number
): Promise<void> {
  const characterId = socket.characterId!;
  const currentStep = getStepByOrder(quest, currentStepOrder);
  const nextStepOrder = currentStepOrder + 1;
  const isLastStep = nextStepOrder > quest.steps.length;

  // Send step completion message
  if (currentStep?.completionDialogue) {
    sendStepCompleteMessage(socket, quest, currentStep);
  }

  // Grant step rewards
  if (currentStep) {
    await grantStepRewards(socket, currentStep);
  }

  if (isLastStep) {
    await completeQuest(socket, quest, characterId);
  } else {
    // Advance to next step
    await questRepo.advanceStep(characterId, quest.id, nextStepOrder);
  }
}

async function completeQuest(
  socket: AuthenticatedSocket,
  quest: Quest,
  characterId: number
): Promise<void> {
  // Mark quest as completed in DB
  await questRepo.completeQuest(characterId, quest.id);

  // Grant quest flag
  if (quest.questFlag) {
    await questRepo.setQuestFlag(characterId, quest.questFlag);
  }

  // Grant completion rewards silently
  await grantQuestRewards(socket, quest, characterId);

  // Send completion message (designer's dialogue only)
  sendQuestCompleteMessage(socket, quest);
}

// ============================================================================
// Prerequisite Checking
// ============================================================================

export async function canStartQuest(
  characterId: number,
  quest: Quest
): Promise<{ allowed: boolean; reason?: string }> {
  const character = await characterRepo.findCharacterById(characterId);
  if (!character) {
    return { allowed: false, reason: 'Character not found.' };
  }

  // Level check
  if (character.level < quest.minLevel) {
    return { allowed: false, reason: `You must be at least level ${quest.minLevel}.` };
  }
  if (quest.maxLevel !== null && character.level > quest.maxLevel) {
    return { allowed: false, reason: `You must be level ${quest.maxLevel} or below.` };
  }

  // Race check
  if (quest.requiredRaces && quest.requiredRaces.length > 0) {
    if (!quest.requiredRaces.includes(character.race)) {
      return { allowed: false, reason: 'Your race cannot undertake this quest.' };
    }
  }

  // Class check
  if (quest.requiredClasses && quest.requiredClasses.length > 0) {
    if (!quest.requiredClasses.includes(character.class)) {
      return { allowed: false, reason: 'Your class cannot undertake this quest.' };
    }
  }

  // Faction check
  if (quest.requiredFactionId !== null) {
    const rep = await factionRepo.getPlayerReputation(characterId, quest.requiredFactionId);
    if (quest.requiredFactionMin !== null && rep < quest.requiredFactionMin) {
      return { allowed: false, reason: 'Your reputation is not high enough.' };
    }
    if (quest.requiredFactionMax !== null && rep > quest.requiredFactionMax) {
      return { allowed: false, reason: 'Your reputation is too high for this quest.' };
    }
  }

  // Prerequisite quests
  if (quest.requiredQuestIds.length > 0) {
    const completedIds = await questRepo.getCompletedQuestIds(characterId);
    const completedSet = new Set(completedIds);
    for (const reqId of quest.requiredQuestIds) {
      if (!completedSet.has(reqId)) {
        return { allowed: false, reason: 'You have not completed a required quest.' };
      }
    }
  }

  return { allowed: true };
}

// ============================================================================
// Reward Granting
// ============================================================================

/**
 * Grant step rewards to a character (DB only, no messaging).
 * Exported for use by admin commands.
 */
export async function grantStepRewardsForCharacter(
  characterId: number,
  step: QuestStep
): Promise<void> {
  if (step.stepXpReward > 0) {
    await awardXp(characterId, step.stepXpReward);
  }
  if (step.stepEssenceReward > 0) {
    await awardEssence(characterId, step.stepEssenceReward);
  }
  if (step.stepCurrencyReward > 0) {
    await characterRepo.addCurrency(characterId, 'copper', step.stepCurrencyReward);
  }
  for (const reward of step.stepItemRewards) {
    const template = await itemRepo.getTemplateById(reward.itemTemplateId);
    if (!template) {
      console.warn(`[Quest] Step reward references invalid item template #${reward.itemTemplateId}, skipping`);
      continue;
    }
    for (let i = 0; i < reward.quantity; i++) {
      await itemRepo.createInstance({
        template_id: reward.itemTemplateId,
        location_type: ItemLocationType.PLAYER,
        location_id: characterId,
      });
    }
  }
  for (const reward of step.stepFactionRewards) {
    const faction = await factionRepo.getFactionById(reward.factionId);
    if (!faction) {
      console.warn(`[Quest] Step reward references invalid faction #${reward.factionId}, skipping`);
      continue;
    }
    await factionRepo.adjustPlayerReputation(characterId, reward.factionId, reward.amount);
  }
}

/**
 * Grant quest completion rewards to a character (DB only, no messaging).
 * Exported for use by admin commands.
 */
export async function grantQuestRewardsForCharacter(
  characterId: number,
  quest: Quest
): Promise<void> {
  if (quest.xpReward > 0) {
    await awardXp(characterId, quest.xpReward);
  }
  if (quest.essenceReward > 0) {
    await awardEssence(characterId, quest.essenceReward);
  }
  if (quest.currencyReward > 0) {
    await characterRepo.addCurrency(characterId, 'copper', quest.currencyReward);
  }
  for (const reward of quest.itemRewards) {
    const template = await itemRepo.getTemplateById(reward.itemTemplateId);
    if (!template) {
      console.warn(`[Quest] Completion reward references invalid item template #${reward.itemTemplateId}, skipping`);
      continue;
    }
    for (let i = 0; i < reward.quantity; i++) {
      await itemRepo.createInstance({
        template_id: reward.itemTemplateId,
        location_type: ItemLocationType.PLAYER,
        location_id: characterId,
      });
    }
  }
  for (const reward of quest.factionRewards) {
    const faction = await factionRepo.getFactionById(reward.factionId);
    if (!faction) {
      console.warn(`[Quest] Completion reward references invalid faction #${reward.factionId}, skipping`);
      continue;
    }
    await factionRepo.adjustPlayerReputation(characterId, reward.factionId, reward.amount);
  }
}

async function grantStepRewards(
  socket: AuthenticatedSocket,
  step: QuestStep
): Promise<void> {
  const characterId = socket.characterId!;
  await grantStepRewardsForCharacter(characterId, step);
  // Rewards granted silently — the designer's dialogue text handles player-facing output
}

async function grantQuestRewards(
  socket: AuthenticatedSocket,
  quest: Quest,
  characterId: number
): Promise<void> {
  await grantQuestRewardsForCharacter(characterId, quest);
  // Rewards granted silently — the designer's dialogue text handles player-facing output
}

// ============================================================================
// Message Formatting
// ============================================================================

function questVars(socket: AuthenticatedSocket): Record<string, string> {
  return { name: socket.username };
}

function renderDialogue(dialogue: string, socket: AuthenticatedSocket): string {
  return wordWrap(renderColorMarkup(dialogue, colors.white, questVars(socket)), 80);
}

function formatNpcDialogue(dialogue: string, socket: AuthenticatedSocket): string {
  return renderDialogue(dialogue, socket);
}

function sendQuestStartMessage(
  socket: AuthenticatedSocket,
  quest: Quest,
  completedStep: QuestStep,
  _nextStep: QuestStep | null
): void {
  if (!completedStep.completionDialogue) return;
  sendMessage(socket, MessageType.SYSTEM, `\r\n${renderDialogue(completedStep.completionDialogue, socket)}`);
}

function sendStepCompleteMessage(
  socket: AuthenticatedSocket,
  _quest: Quest,
  step: QuestStep
): void {
  if (!step.completionDialogue) return;
  sendMessage(socket, MessageType.SYSTEM, `\r\n${renderDialogue(step.completionDialogue, socket)}`);
}

function sendQuestCompleteMessage(
  socket: AuthenticatedSocket,
  quest: Quest
): void {
  // The final step's completionDialogue is already shown by sendStepCompleteMessage.
  // This fallback ensures the player always sees something when a quest completes,
  // even if the designer omitted completionDialogue on the final step.
  const lastStep = quest.steps[quest.steps.length - 1];
  if (!lastStep?.completionDialogue) {
    sendMessage(socket, MessageType.SYSTEM, `\r\n${colors.gold(`Quest complete: ${quest.name}`)}`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getStepByOrder(quest: Quest, stepOrder: number): QuestStep | undefined {
  return quest.steps.find(s => s.stepOrder === stepOrder);
}
