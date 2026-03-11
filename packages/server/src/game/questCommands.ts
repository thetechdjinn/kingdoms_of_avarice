/**
 * Quest Commands
 *
 * Player-facing quest commands: quest list, quest log, quest info.
 */

import { MessageType } from '@koa/shared';
import type { Quest, CharacterQuest } from '@koa/shared';
import { CommandResponse } from './commands.js';
import type { AuthenticatedSocket } from './socket.js';
import { colors } from '../utils/colors.js';
import { wordWrap } from '../utils/textFormat.js';
import { getQuestById } from './questManager.js';
import * as questRepo from '../db/repositories/questRepository.js';

// ============================================================================
// Main Router
// ============================================================================

export async function handleQuest(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  const sub = args[0]?.toLowerCase();

  if (sub === 'log') {
    return handleQuestLog(socket, args.slice(1));
  }

  if (sub === 'info') {
    return handleQuestInfo(socket, args.slice(1));
  }

  // Default: list active quests
  return handleQuestList(socket);
}

// ============================================================================
// quest — List Active Quests
// ============================================================================

async function handleQuestList(
  socket: AuthenticatedSocket
): Promise<CommandResponse> {
  const characterId = socket.characterId!;
  const activeQuests = await questRepo.getActiveQuests(characterId);

  if (activeQuests.length === 0) {
    return {
      type: MessageType.OUTPUT,
      message: colors.cyan('You have no active quests.'),
    };
  }

  const border = '\u2500'.repeat(57);
  const lines: string[] = [];
  lines.push(colors.boldCyan(centerText('Active Quests', 57)));
  lines.push(colors.cyan(` ${border}`));

  for (const cq of activeQuests) {
    const quest = getQuestById(cq.questId);
    if (!quest) continue;

    const step = quest.steps.find(s => s.stepOrder === cq.currentStep);
    if (!step) continue;

    lines.push(colors.white(` ${quest.name}`));

    // For kill steps, show progress
    if (step.triggerType === 'kill' && step.requiredCount > 1) {
      const progress = await questRepo.getQuestProgress(characterId, step.id);
      lines.push(colors.cyan(`   ${step.description} (${progress}/${step.requiredCount})`));
    } else {
      lines.push(colors.cyan(`   ${step.description}`));
    }

    lines.push('');
  }

  // Remove trailing empty line
  if (lines[lines.length - 1] === '') lines.pop();

  lines.push(colors.cyan(` ${border}`));

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// quest log — Detailed Quest Journal
// ============================================================================

async function handleQuestLog(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  const characterId = socket.characterId!;
  const activeQuests = await questRepo.getActiveQuests(characterId);

  if (activeQuests.length === 0) {
    return {
      type: MessageType.OUTPUT,
      message: colors.cyan('You have no active quests.'),
    };
  }

  // If a quest name is specified, show that one
  let targetQuest: Quest | undefined;
  let targetCq: CharacterQuest | undefined;

  if (args.length > 0) {
    const nameSearch = args.join(' ').toLowerCase();
    for (const cq of activeQuests) {
      const quest = getQuestById(cq.questId);
      if (quest && quest.name.toLowerCase().includes(nameSearch)) {
        targetQuest = quest;
        targetCq = cq;
        break;
      }
    }
    if (!targetQuest) {
      return { type: MessageType.ERROR, message: `No active quest matching "${args.join(' ')}".` };
    }
  } else if (activeQuests.length === 1) {
    // Single active quest — show it directly
    const cq = activeQuests[0];
    targetQuest = getQuestById(cq.questId);
    targetCq = cq;
  } else {
    // Multiple active quests — show list with hint
    const lines: string[] = [];
    lines.push(colors.boldCyan('You have multiple active quests. Specify one:'));
    lines.push('');
    for (const cq of activeQuests) {
      const quest = getQuestById(cq.questId);
      if (quest) {
        lines.push(`  ${colors.white(quest.name)}`);
      }
    }
    lines.push('');
    lines.push(colors.cyan('Usage: quest log <name>'));
    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  }

  if (!targetQuest || !targetCq) {
    return { type: MessageType.ERROR, message: 'Quest not found.' };
  }

  return formatQuestLog(targetQuest, targetCq, characterId);
}

async function formatQuestLog(
  quest: Quest,
  cq: CharacterQuest,
  characterId: number
): Promise<CommandResponse> {
  const border = '\u2500'.repeat(57);
  const lines: string[] = [];

  lines.push(colors.boldCyan(centerText(quest.name, 57)));
  lines.push(colors.cyan(` ${border}`));

  // Quest description
  if (quest.description) {
    lines.push(wordWrap(` ${quest.description}`, 78));
    lines.push('');
  }

  // Show completed steps and current step (future steps hidden)
  for (const step of quest.steps) {
    if (step.stepOrder < cq.currentStep) {
      // Completed step
      lines.push(colors.green(` [x] ${step.description}`));
    } else if (step.stepOrder === cq.currentStep) {
      // Current step
      if (step.triggerType === 'kill' && step.requiredCount > 1) {
        const progress = await questRepo.getQuestProgress(characterId, step.id);
        lines.push(colors.white(` [>] ${step.description} (${progress}/${step.requiredCount})`));
      } else {
        lines.push(colors.white(` [>] ${step.description}`));
      }
    }
    // Future steps: hidden
  }

  lines.push(colors.cyan(` ${border}`));

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// quest info <name> — View Specific Quest Details
// ============================================================================

async function handleQuestInfo(
  socket: AuthenticatedSocket,
  args: string[]
): Promise<CommandResponse> {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: quest info <name>' };
  }

  const characterId = socket.characterId!;
  const nameSearch = args.join(' ').toLowerCase();

  // Search active quests first
  const activeQuests = await questRepo.getActiveQuests(characterId);
  for (const cq of activeQuests) {
    const quest = getQuestById(cq.questId);
    if (quest && quest.name.toLowerCase().includes(nameSearch)) {
      return formatQuestLog(quest, cq, characterId);
    }
  }

  // Search completed quests
  const completedIds = await questRepo.getCompletedQuestIds(characterId);
  for (const questId of completedIds) {
    const quest = getQuestById(questId);
    if (quest && quest.name.toLowerCase().includes(nameSearch)) {
      return formatCompletedQuest(quest);
    }
  }

  return { type: MessageType.ERROR, message: `No quest matching "${args.join(' ')}".` };
}

function formatCompletedQuest(quest: Quest): CommandResponse {
  const border = '\u2500'.repeat(57);
  const lines: string[] = [];

  lines.push(colors.boldCyan(centerText(quest.name, 57)));
  lines.push(colors.cyan(` ${border}`));

  if (quest.description) {
    lines.push(wordWrap(` ${quest.description}`, 78));
    lines.push('');
  }

  for (const step of quest.steps) {
    lines.push(colors.green(` [x] ${step.description}`));
  }

  lines.push('');
  lines.push(colors.gold(' Quest Complete'));
  lines.push(colors.cyan(` ${border}`));

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}

// ============================================================================
// Helpers
// ============================================================================

function centerText(text: string, width: number): string {
  // +1 accounts for the leading space used by border lines (` ${border}`)
  const totalWidth = width + 1;
  const padding = Math.max(0, Math.floor((totalWidth - text.length) / 2));
  return ' '.repeat(padding) + text;
}
