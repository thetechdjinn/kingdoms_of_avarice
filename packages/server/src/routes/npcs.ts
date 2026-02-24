import { Express, Request, Response } from 'express';
import * as npcRepo from '../db/repositories/npcRepository.js';
import type { CreateNpcAttackInput } from '../db/repositories/npcRepository.js';
import { reloadNpcTemplates, getTemplate, spawnNpcPublic, despawnByTemplate } from '../game/npcManager.js';
import { requireDeveloper } from '../middleware/auth.js';

/** Parse a route parameter as a positive integer, or return NaN. */
function parsePositiveInt(value: string): number {
  const n = parseInt(value);
  return (!isNaN(n) && n > 0) ? n : NaN;
}

/** Validate attack fields. Returns error string or null. */
function validateAttack(atk: Record<string, unknown>, index: number): string | null {
  if (!atk.name || typeof atk.name !== 'string') {
    return `Attack ${index + 1}: name is required`;
  }
  if (atk.minDamage !== undefined && (typeof atk.minDamage !== 'number' || atk.minDamage < 0)) {
    return `Attack ${index + 1}: minDamage must be >= 0`;
  }
  if (atk.maxDamage !== undefined && (typeof atk.maxDamage !== 'number' || atk.maxDamage < 0)) {
    return `Attack ${index + 1}: maxDamage must be >= 0`;
  }
  if (atk.minDamage !== undefined && atk.maxDamage !== undefined &&
      typeof atk.minDamage === 'number' && typeof atk.maxDamage === 'number' &&
      atk.maxDamage < atk.minDamage) {
    return `Attack ${index + 1}: maxDamage must be >= minDamage`;
  }
  if (atk.attacksPerRound !== undefined && (typeof atk.attacksPerRound !== 'number' || atk.attacksPerRound < 1)) {
    return `Attack ${index + 1}: attacksPerRound must be >= 1`;
  }
  if (atk.percentage !== undefined && (typeof atk.percentage !== 'number' || atk.percentage < 0 || atk.percentage > 100)) {
    return `Attack ${index + 1}: percentage must be 0-100`;
  }
  return null;
}

/** Validate template fields. Returns error string or null. */
function validateTemplate(item: Record<string, unknown>, label: string): string | null {
  if (item.level !== undefined && (typeof item.level !== 'number' || item.level < 1)) {
    return `${label}: level must be >= 1`;
  }
  if (item.goldMin !== undefined && (typeof item.goldMin !== 'number' || item.goldMin < 0)) {
    return `${label}: goldMin must be >= 0`;
  }
  if (item.goldMax !== undefined && (typeof item.goldMax !== 'number' || item.goldMax < 0)) {
    return `${label}: goldMax must be >= 0`;
  }
  const goldMin = typeof item.goldMin === 'number' ? item.goldMin : 0;
  const goldMax = typeof item.goldMax === 'number' ? item.goldMax : 0;
  if (goldMax < goldMin) {
    return `${label}: goldMax must be >= goldMin`;
  }
  if (Array.isArray(item.attacks)) {
    for (let i = 0; i < item.attacks.length; i++) {
      const error = validateAttack(item.attacks[i], i);
      if (error) return `${label}: ${error}`;
    }
  }
  return null;
}

export function setupNpcRoutes(app: Express): void {
  // List all NPC templates
  app.get('/api/npcs', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const templates = await npcRepo.getAllTemplates();
      res.json({ success: true, templates });
    } catch (error) {
      console.error('Failed to get NPC templates:', error);
      res.status(500).json({ success: false, message: 'Failed to get NPC templates' });
    }
  });

  // Export all templates as JSON (must be before :id route)
  app.get('/api/npcs/export', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const templates = await npcRepo.getAllTemplates();
      res.setHeader('Content-Disposition', 'attachment; filename="npc-templates.json"');
      res.json({ success: true, templates });
    } catch (error) {
      console.error('Failed to export NPC templates:', error);
      res.status(500).json({ success: false, message: 'Failed to export NPC templates' });
    }
  });

  // Get single template with attacks
  app.get('/api/npcs/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }

      const template = await npcRepo.getTemplateById(id);
      if (!template) {
        res.status(404).json({ success: false, message: 'NPC template not found' });
        return;
      }

      res.json({ success: true, template });
    } catch (error) {
      console.error('Failed to get NPC template:', error);
      res.status(500).json({ success: false, message: 'Failed to get NPC template' });
    }
  });

  // Create template
  app.post('/api/npcs', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { name, attacks, ...rest } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ success: false, message: 'name is required' });
        return;
      }

      const validationError = validateTemplate({ ...rest, attacks }, name);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      const template = await npcRepo.createTemplate({ name, ...rest });

      if (Array.isArray(attacks) && attacks.length > 0) {
        await npcRepo.replaceAttacks(template.id, attacks as CreateNpcAttackInput[]);
      }

      await reloadNpcTemplates();
      const created = await npcRepo.getTemplateById(template.id);
      res.json({ success: true, template: created });
    } catch (error) {
      console.error('Failed to create NPC template:', error);
      res.status(500).json({ success: false, message: 'Failed to create NPC template' });
    }
  });

  // Update template
  app.put('/api/npcs/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }

      const { attacks, ...rest } = req.body;

      // Validate gold range against existing values when only one field is provided
      const existing = await npcRepo.getTemplateById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'NPC template not found' });
        return;
      }

      const effectiveGoldMin = (rest.goldMin !== undefined && typeof rest.goldMin === 'number') ? rest.goldMin : existing.goldMin;
      const effectiveGoldMax = (rest.goldMax !== undefined && typeof rest.goldMax === 'number') ? rest.goldMax : existing.goldMax;

      const validationError = validateTemplate({ ...rest, goldMin: effectiveGoldMin, goldMax: effectiveGoldMax, attacks }, existing.name);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      const template = await npcRepo.updateTemplate(id, rest);

      if (Array.isArray(attacks)) {
        await npcRepo.replaceAttacks(id, attacks as CreateNpcAttackInput[]);
      }

      await reloadNpcTemplates();
      const updated = await npcRepo.getTemplateById(id);
      res.json({ success: true, template: updated });
    } catch (error) {
      console.error('Failed to update NPC template:', error);
      res.status(500).json({ success: false, message: 'Failed to update NPC template' });
    }
  });

  // Delete template
  app.delete('/api/npcs/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }

      despawnByTemplate(id);
      const success = await npcRepo.deleteTemplate(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'NPC template not found' });
        return;
      }

      await reloadNpcTemplates();
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete NPC template:', error);
      res.status(500).json({ success: false, message: 'Failed to delete NPC template' });
    }
  });

  // Spawn NPC instance
  app.post('/api/npcs/:id/spawn', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid NPC template ID' });
        return;
      }

      const roomId = req.body.roomId;
      if (!roomId || typeof roomId !== 'number' || roomId < 1) {
        res.status(400).json({ success: false, message: 'roomId is required and must be a positive number' });
        return;
      }

      const template = getTemplate(id);
      if (!template) {
        res.status(404).json({ success: false, message: 'NPC template not found' });
        return;
      }

      const instance = await spawnNpcPublic(template, roomId);
      res.json({
        success: true,
        instance: {
          entityId: instance.entityId,
          entityName: instance.entityName,
          roomId: instance.currentRoomId,
          hp: instance.vitals.hp,
        },
      });
    } catch (error) {
      console.error('Failed to spawn NPC:', error);
      res.status(500).json({ success: false, message: 'Failed to spawn NPC' });
    }
  });

  // Import templates
  app.post('/api/npcs/import', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { templates: importData, merge: rawMerge } = req.body;
      if (!Array.isArray(importData)) {
        res.status(400).json({ success: false, message: 'templates must be an array' });
        return;
      }
      const merge = rawMerge === true;

      let created = 0;
      let updated = 0;
      const skipped: string[] = [];

      const existingTemplates = await npcRepo.getAllTemplates();
      const existingByName = new Map(existingTemplates.map(t => [t.name.toLowerCase(), t]));

      for (const item of importData) {
        if (!item.name || typeof item.name !== 'string') continue;

        const validationError = validateTemplate(item, item.name);
        if (validationError) {
          skipped.push(validationError);
          continue;
        }

        const { id: _id, attacks, ...templateData } = item;
        const existing = existingByName.get(item.name.toLowerCase());

        if (existing && merge) {
          await npcRepo.updateTemplate(existing.id, templateData);
          if (Array.isArray(attacks)) {
            await npcRepo.replaceAttacks(existing.id, attacks);
          }
          updated++;
        } else if (!existing) {
          const newTemplate = await npcRepo.createTemplate(templateData);
          if (Array.isArray(attacks) && attacks.length > 0) {
            await npcRepo.replaceAttacks(newTemplate.id, attacks);
          }
          created++;
        }
      }

      await reloadNpcTemplates();
      res.json({ success: true, created, updated, skipped: skipped.length, skippedReasons: skipped });
    } catch (error) {
      console.error('Failed to import NPC templates:', error);
      res.status(500).json({ success: false, message: 'Failed to import NPC templates' });
    }
  });
}
