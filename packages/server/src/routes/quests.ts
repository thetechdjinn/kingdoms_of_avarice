import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import type { QuestTriggerType } from '@koa/shared';
import * as questRepo from '../db/repositories/questRepository.js';
import { reloadQuests } from '../game/questManager.js';
import { requireDeveloper } from '../middleware/auth.js';
import { withTransaction } from '../db/index.js';

const VALID_TRIGGER_TYPES = new Set(['talk', 'kill', 'visit']);

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function mapStepInput(questId: number, s: Record<string, unknown>, index: number): questRepo.CreateStepInput {
  return {
    questId,
    stepOrder: index + 1,
    triggerType: String(s.triggerType ?? 'talk') as QuestTriggerType,
    triggerNpcId: toNumberOrNull(s.triggerNpcId),
    triggerItemTemplateId: toNumberOrNull(s.triggerItemTemplateId),
    triggerRoomId: toNumberOrNull(s.triggerRoomId),
    triggerText: s.triggerText != null ? String(s.triggerText) : null,
    requiredCount: Number(s.requiredCount) || 1,
    consumeItem: s.consumeItem !== false,
    description: String(s.description ?? ''),
    completionDialogue: s.completionDialogue != null ? String(s.completionDialogue) : null,
    inProgressDialogue: s.inProgressDialogue != null ? String(s.inProgressDialogue) : null,
    stepXpReward: Number(s.stepXpReward) || 0,
    stepEssenceReward: Number(s.stepEssenceReward) || 0,
    stepCurrencyReward: Number(s.stepCurrencyReward) || 0,
    stepItemRewards: Array.isArray(s.stepItemRewards) ? s.stepItemRewards as { itemTemplateId: number; quantity: number }[] : [],
    stepFactionRewards: Array.isArray(s.stepFactionRewards) ? s.stepFactionRewards as { factionId: number; amount: number }[] : [],
  };
}

function validateSteps(steps: Record<string, unknown>[]): string | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.description || typeof step.description !== 'string') {
      return `Step ${i + 1}: description is required`;
    }
    if (!VALID_TRIGGER_TYPES.has(step.triggerType as string)) {
      return `Step ${i + 1}: invalid trigger type "${step.triggerType}"`;
    }
    if (step.triggerType === 'kill' && !step.triggerNpcId) {
      return `Step ${i + 1}: kill trigger requires an NPC ID`;
    }
    if (step.triggerType === 'visit' && !step.triggerRoomId) {
      return `Step ${i + 1}: visit trigger requires a Room ID`;
    }
    if (step.triggerType === 'talk' && !step.triggerNpcId) {
      return `Step ${i + 1}: talk trigger requires an NPC ID`;
    }
  }
  return null;
}

export function setupQuestRoutes(app: Express): void {
  // List all quests
  app.get('/api/quests', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const quests = await questRepo.getAllQuests();
      res.json({ success: true, quests });
    } catch (error) {
      console.error('Failed to load quests:', error);
      res.status(500).json({ success: false, message: 'Failed to load quests' });
    }
  });

  // Get single quest
  app.get('/api/quests/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid quest ID' });
        return;
      }
      const quest = await questRepo.getQuestById(id);
      if (!quest) {
        res.status(404).json({ success: false, message: 'Quest not found' });
        return;
      }
      res.json({ success: true, quest });
    } catch (error) {
      console.error('Failed to load quest:', error);
      res.status(500).json({ success: false, message: 'Failed to load quest' });
    }
  });

  // Create quest
  app.post('/api/quests', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { tag, name } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ success: false, message: 'Name is required' });
        return;
      }
      // Auto-generate tag if not provided
      const questTag = tag?.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      const existing = await questRepo.getQuestByTag(questTag);
      if (existing) {
        res.status(409).json({ success: false, message: 'A quest with that tag already exists' });
        return;
      }

      const quest = await questRepo.createQuest({
        ...req.body,
        tag: questTag,
        name: name.trim(),
      });

      await reloadQuests();
      res.json({ success: true, quest });
    } catch (error) {
      console.error('Failed to create quest:', error);
      res.status(500).json({ success: false, message: 'Failed to create quest' });
    }
  });

  // Update quest
  app.put('/api/quests/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid quest ID' });
        return;
      }

      const { name, steps } = req.body;
      if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
        res.status(400).json({ success: false, message: 'Name cannot be empty' });
        return;
      }

      // Validate tag uniqueness if changing
      const { tag } = req.body;
      if (tag !== undefined && typeof tag === 'string' && tag.trim().length > 0) {
        const existingTag = await questRepo.getQuestByTag(tag.trim());
        if (existingTag && existingTag.id !== id) {
          res.status(409).json({ success: false, message: 'A quest with that tag already exists' });
          return;
        }
      }

      // Whitelist allowed fields to prevent unexpected overwrites
      const allowedFields = [
        'tag', 'description', 'questGiverNpcId', 'minLevel', 'maxLevel',
        'requiredRaces', 'requiredClasses', 'requiredFactionId',
        'requiredFactionMin', 'requiredFactionMax', 'requiredQuestIds',
        'xpReward', 'essenceReward', 'currencyReward', 'itemRewards',
        'factionRewards', 'questFlag', 'denialDialogue', 'completedDialogue',
        'enabled', 'sortOrder',
      ] as const;
      const updateFields: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateFields[field] = req.body[field];
        }
      }

      // Validate steps if provided
      if (steps && Array.isArray(steps)) {
        const stepError = validateSteps(steps);
        if (stepError) {
          res.status(400).json({ success: false, message: stepError });
          return;
        }
      }

      // Update quest fields and steps atomically
      const updated = await withTransaction(async (client) => {
        const quest = await questRepo.updateQuest(id, {
          ...updateFields,
          name: name?.trim(),
        }, client);
        if (!quest) return null;

        // Replace steps if provided
        if (steps && Array.isArray(steps)) {
          await questRepo.replaceSteps(id, steps.map((s: Record<string, unknown>, i: number) =>
            mapStepInput(id, s, i)
          ), client);
        }

        return quest;
      });

      if (!updated) {
        res.status(404).json({ success: false, message: 'Quest not found' });
        return;
      }

      // Re-fetch with updated steps
      const result = await questRepo.getQuestById(id);
      await reloadQuests();
      res.json({ success: true, quest: result });
    } catch (error) {
      console.error('Failed to update quest:', error);
      res.status(500).json({ success: false, message: 'Failed to update quest' });
    }
  });

  // Delete quest
  app.delete('/api/quests/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid quest ID' });
        return;
      }
      const deleted = await questRepo.deleteQuest(id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Quest not found' });
        return;
      }
      await reloadQuests();
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete quest:', error);
      res.status(500).json({ success: false, message: 'Failed to delete quest' });
    }
  });

  // Import quests
  app.post('/api/quests/import', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { quests: importData, merge } = req.body;
      if (!Array.isArray(importData)) {
        res.status(400).json({ success: false, message: 'Expected { quests: [...] }' });
        return;
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      await withTransaction(async (client) => {
        for (const item of importData) {
          const tag = item.tag;
          if (!tag || !item.name) { skipped++; continue; }

          // Validate steps if present
          if (item.steps && Array.isArray(item.steps)) {
            const stepError = validateSteps(item.steps);
            if (stepError) { skipped++; continue; }
          }

          const existing = await questRepo.getQuestByTag(tag);

          if (existing && merge) {
            // If import changes the tag, verify the new tag doesn't collide
            if (item.tag && item.tag !== existing.tag) {
              const tagCollision = await questRepo.getQuestByTag(item.tag);
              if (tagCollision && tagCollision.id !== existing.id) {
                skipped++;
                continue;
              }
            }
            await questRepo.updateQuest(existing.id, item, client);
            if (item.steps && Array.isArray(item.steps)) {
              await questRepo.replaceSteps(existing.id, item.steps.map((s: Record<string, unknown>, i: number) =>
                mapStepInput(existing.id, s, i)
              ), client);
            }
            updated++;
          } else if (!existing) {
            const quest = await questRepo.createQuest(item, client);
            if (item.steps && Array.isArray(item.steps)) {
              await questRepo.replaceSteps(quest.id, item.steps.map((s: Record<string, unknown>, i: number) =>
                mapStepInput(quest.id, s, i)
              ), client);
            }
            created++;
          } else {
            skipped++;
          }
        }
      });

      await reloadQuests();
      res.json({ success: true, created, updated, skipped });
    } catch (error) {
      console.error('Failed to import quests:', error);
      res.status(500).json({ success: false, message: 'Failed to import quests' });
    }
  });
}
