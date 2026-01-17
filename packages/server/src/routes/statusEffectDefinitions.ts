import { Express, Request, Response } from 'express';
import * as effectDefRepo from '../db/repositories/statusEffectDefinitionRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { StatusEffectCategory, StackingBehavior } from '@koa/shared';
import { reloadEffectDefinitions } from '../game/statusEffects.js';

const validCategories = Object.values(StatusEffectCategory);
const validStackingBehaviors = Object.values(StackingBehavior);

// Validate effect definition input
function validateDefinitionInput(def: Record<string, unknown>): string | null {
  if (!def.id || typeof def.id !== 'string') {
    return 'id is required and must be a string';
  }
  if (!def.name || typeof def.name !== 'string') {
    return 'name is required and must be a string';
  }
  if (!def.category || !validCategories.includes(def.category as StatusEffectCategory)) {
    return `category is required and must be one of: ${validCategories.join(', ')}`;
  }
  if (!def.stackingBehavior || !validStackingBehaviors.includes(def.stackingBehavior as StackingBehavior)) {
    return `stackingBehavior is required and must be one of: ${validStackingBehaviors.join(', ')}`;
  }
  return null;
}

export function setupStatusEffectDefinitionRoutes(app: Express): void {
  // ============================================================================
  // STATUS EFFECT DEFINITIONS
  // ============================================================================

  // Get all definitions
  app.get('/api/status-effects', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const definitions = await effectDefRepo.getAllDefinitions();
      res.json({ success: true, definitions });
    } catch (error) {
      console.error('Failed to get status effect definitions:', error);
      res.status(500).json({ success: false, message: 'Failed to get status effect definitions' });
    }
  });

  // Get single definition
  app.get('/api/status-effects/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const definition = await effectDefRepo.getDefinitionById(id);
      if (!definition) {
        res.status(404).json({ success: false, message: 'Status effect definition not found' });
        return;
      }
      res.json({ success: true, definition });
    } catch (error) {
      console.error('Failed to get status effect definition:', error);
      res.status(500).json({ success: false, message: 'Failed to get status effect definition' });
    }
  });

  // Create definition
  app.post('/api/status-effects', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const {
        id, name, description, category, stackingBehavior, maxStacks,
        accuracyModifier, defenseModifier, energyModifier, damageModifier,
        tickDamage, tickHealing, tickMessage, silentTick, wearOffMessage,
        blocksRegen, blocksMovement, isBlind
      } = req.body;

      // Validate required fields
      const validationError = validateDefinitionInput(req.body);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      // Normalize ID to lowercase for consistency
      const normalizedId = id.toLowerCase();

      // Check for duplicate ID
      const existing = await effectDefRepo.getDefinitionById(normalizedId);
      if (existing) {
        res.status(400).json({ success: false, message: `Effect ID "${normalizedId}" already exists` });
        return;
      }

      const definition = await effectDefRepo.createDefinition({
        id: normalizedId,
        name,
        description,
        category,
        stackingBehavior,
        maxStacks: maxStacks ?? 1,
        accuracyModifier: accuracyModifier ?? 0,
        defenseModifier: defenseModifier ?? 0,
        energyModifier: energyModifier ?? 0,
        damageModifier: damageModifier ?? 0,
        tickDamage,
        tickHealing,
        tickMessage,
        silentTick: silentTick ?? false,
        wearOffMessage,
        blocksRegen: blocksRegen ?? false,
        blocksMovement: blocksMovement ?? false,
        isBlind: isBlind ?? false,
      });

      // Reload effect definitions cache
      await reloadEffectDefinitions();

      res.json({ success: true, definition });
    } catch (error) {
      console.error('Failed to create status effect definition:', error);
      res.status(500).json({ success: false, message: 'Failed to create status effect definition' });
    }
  });

  // Update definition
  app.put('/api/status-effects/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const existing = await effectDefRepo.getDefinitionById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Status effect definition not found' });
        return;
      }

      // Validate category if provided
      const { category, stackingBehavior } = req.body;
      if (category !== undefined && !validCategories.includes(category)) {
        res.status(400).json({ success: false, message: `Invalid category: must be one of ${validCategories.join(', ')}` });
        return;
      }

      // Validate stackingBehavior if provided
      if (stackingBehavior !== undefined && !validStackingBehaviors.includes(stackingBehavior)) {
        res.status(400).json({ success: false, message: `Invalid stackingBehavior: must be one of ${validStackingBehaviors.join(', ')}` });
        return;
      }

      const definition = await effectDefRepo.updateDefinition(id, req.body);

      // Reload effect definitions cache
      await reloadEffectDefinitions();

      res.json({ success: true, definition });
    } catch (error) {
      console.error('Failed to update status effect definition:', error);
      res.status(500).json({ success: false, message: 'Failed to update status effect definition' });
    }
  });

  // Delete definition
  app.delete('/api/status-effects/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const success = await effectDefRepo.deleteDefinition(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Status effect definition not found' });
        return;
      }

      // Reload effect definitions cache
      await reloadEffectDefinitions();

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete status effect definition:', error);
      res.status(500).json({ success: false, message: 'Failed to delete status effect definition' });
    }
  });

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  // Get all effect IDs (for spell editor dropdown)
  app.get('/api/status-effects/ids/list', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const ids = await effectDefRepo.getAllEffectIds();
      res.json({ success: true, ids });
    } catch (error) {
      console.error('Failed to get effect IDs:', error);
      res.status(500).json({ success: false, message: 'Failed to get effect IDs' });
    }
  });

  // Get categories and stacking behaviors enums
  app.get('/api/status-effects/types/enum', requireDeveloper, (_req: Request, res: Response) => {
    res.json({
      success: true,
      categories: validCategories,
      stackingBehaviors: validStackingBehaviors,
    });
  });

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  // Export all definitions
  app.get('/api/status-effects/export/all', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const definitions = await effectDefRepo.exportDefinitions();

      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        definitions,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="status_effects_export.json"');
      res.json(exportData);
    } catch (error) {
      console.error('Failed to export status effect definitions:', error);
      res.status(500).json({ success: false, message: 'Failed to export status effect definitions' });
    }
  });

  // Import definitions
  app.post('/api/status-effects/import', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { definitions, merge = true } = req.body;

      if (!definitions || !Array.isArray(definitions)) {
        res.status(400).json({ success: false, message: 'definitions array is required' });
        return;
      }

      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
      };

      for (const def of definitions) {
        try {
          // Validate definition structure
          const validationError = validateDefinitionInput(def);
          if (validationError) {
            results.errors.push(`Invalid definition "${def.id || 'unknown'}": ${validationError}`);
            continue;
          }

          const existing = await effectDefRepo.getDefinitionById(def.id);

          if (existing && merge) {
            await effectDefRepo.updateDefinition(def.id, def);
            results.updated++;
          } else if (!existing) {
            await effectDefRepo.createDefinition(def);
            results.created++;
          } else {
            results.errors.push(`Skipped "${def.id}": already exists (merge disabled)`);
          }
        } catch (err) {
          results.errors.push(`Failed to import "${def.id}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Reload effect definitions cache
      await reloadEffectDefinitions();

      res.json({ success: true, results });
    } catch (error) {
      console.error('Failed to import status effect definitions:', error);
      res.status(500).json({ success: false, message: 'Failed to import status effect definitions' });
    }
  });
}
