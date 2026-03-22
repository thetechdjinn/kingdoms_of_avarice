import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import * as effectDefRepo from '../db/repositories/statusEffectDefinitionRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { StatusEffectCategory, StackingBehavior } from '@koa/shared';
import { reloadEffectDefinitions } from '../game/statusEffects.js';

const validCategories = Object.values(StatusEffectCategory);
const validStackingBehaviors = Object.values(StackingBehavior);

// Validate effect definition input
function validateDefinitionInput(def: Record<string, unknown>): string | null {
  // Required string fields
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

  // Optional numeric fields - validate type if provided
  const numericFields = [
    'maxStacks', 'accuracyModifier', 'defenseModifier', 'energyModifier', 'damageModifier', 'speedModifier',
    'criticalChanceModifier', 'dodgeModifier', 'magicResistance', 'healingReceived',
    'perceptionModifier', 'stealthModifier', 'spellcastingModifier', 'lockpickingModifier',
    'strengthModifier', 'dexterityModifier', 'constitutionModifier',
    'intelligenceModifier', 'wisdomModifier', 'charismaModifier',
    'maxHpModifier', 'maxManaModifier',
  ];
  for (const field of numericFields) {
    if (def[field] !== undefined && def[field] !== null && typeof def[field] !== 'number') {
      return `${field} must be a number`;
    }
  }

  // Validate maxStacks is positive if provided
  if (def.maxStacks !== undefined && def.maxStacks !== null) {
    if (typeof def.maxStacks === 'number' && (def.maxStacks < 1 || !Number.isInteger(def.maxStacks))) {
      return 'maxStacks must be a positive integer';
    }
  }

  // Optional numeric range fields - validate type if provided
  const rangeFields = ['tickDamageMin', 'tickDamageMax', 'tickHealingMin', 'tickHealingMax'];
  for (const field of rangeFields) {
    if (def[field] !== undefined && def[field] !== null && typeof def[field] !== 'number') {
      return `${field} must be a number`;
    }
  }

  // Validate range ordering (min <= max) when both are provided
  const tickDamageMin = def.tickDamageMin as number | undefined;
  const tickDamageMax = def.tickDamageMax as number | undefined;
  const tickHealingMin = def.tickHealingMin as number | undefined;
  const tickHealingMax = def.tickHealingMax as number | undefined;

  if (tickDamageMin !== undefined && tickDamageMax !== undefined &&
      tickDamageMin !== null && tickDamageMax !== null &&
      tickDamageMin > tickDamageMax) {
    return 'tickDamageMin must be less than or equal to tickDamageMax';
  }
  if (tickHealingMin !== undefined && tickHealingMax !== undefined &&
      tickHealingMin !== null && tickHealingMax !== null &&
      tickHealingMin > tickHealingMax) {
    return 'tickHealingMin must be less than or equal to tickHealingMax';
  }

  // Optional string fields - validate type if provided
  const stringFields = ['description', 'tickMessage', 'wearOffMessage'];
  for (const field of stringFields) {
    if (def[field] !== undefined && def[field] !== null && typeof def[field] !== 'string') {
      return `${field} must be a string`;
    }
  }

  // Optional boolean fields - validate type if provided
  const booleanFields = ['silentTick', 'blocksRegen', 'blocksMovement', 'isBlind'];
  for (const field of booleanFields) {
    if (def[field] !== undefined && def[field] !== null && typeof def[field] !== 'boolean') {
      return `${field} must be a boolean`;
    }
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
      const body = req.body;

      // Validate required fields
      const validationError = validateDefinitionInput(body);
      if (validationError) {
        res.status(400).json({ success: false, message: validationError });
        return;
      }

      // Normalize ID to lowercase for consistency
      const normalizedId = body.id.toLowerCase();

      // Check for duplicate ID
      const existing = await effectDefRepo.getDefinitionById(normalizedId);
      if (existing) {
        res.status(400).json({ success: false, message: `Effect ID "${normalizedId}" already exists` });
        return;
      }

      const definition = await effectDefRepo.createDefinition({
        ...body,
        id: normalizedId,
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
      const normalizedId = id.toLowerCase();

      const existing = await effectDefRepo.getDefinitionById(normalizedId);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Status effect definition not found' });
        return;
      }

      const body = req.body;

      // Validate category if provided
      if (body.category !== undefined && !validCategories.includes(body.category)) {
        res.status(400).json({ success: false, message: `Invalid category: must be one of ${validCategories.join(', ')}` });
        return;
      }

      // Validate stackingBehavior if provided
      if (body.stackingBehavior !== undefined && !validStackingBehaviors.includes(body.stackingBehavior)) {
        res.status(400).json({ success: false, message: `Invalid stackingBehavior: must be one of ${validStackingBehaviors.join(', ')}` });
        return;
      }

      // Validate all numeric fields if provided
      const allNumericFields = [
        'maxStacks', 'accuracyModifier', 'defenseModifier', 'energyModifier', 'damageModifier', 'speedModifier',
        'criticalChanceModifier', 'dodgeModifier', 'magicResistance', 'healingReceived',
        'perceptionModifier', 'stealthModifier', 'spellcastingModifier', 'lockpickingModifier',
        'strengthModifier', 'dexterityModifier', 'constitutionModifier',
        'intelligenceModifier', 'wisdomModifier', 'charismaModifier',
        'maxHpModifier', 'maxManaModifier',
        'tickDamageMin', 'tickDamageMax', 'tickHealingMin', 'tickHealingMax',
      ];
      for (const field of allNumericFields) {
        if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'number') {
          res.status(400).json({ success: false, message: `${field} must be a number` });
          return;
        }
      }

      // Validate maxStacks is positive if provided
      if (body.maxStacks !== undefined && body.maxStacks !== null) {
        if (typeof body.maxStacks === 'number' && (body.maxStacks < 1 || !Number.isInteger(body.maxStacks))) {
          res.status(400).json({ success: false, message: 'maxStacks must be a positive integer' });
          return;
        }
      }

      // Validate range ordering
      if (body.tickDamageMin !== undefined && body.tickDamageMax !== undefined &&
          body.tickDamageMin !== null && body.tickDamageMax !== null &&
          body.tickDamageMin > body.tickDamageMax) {
        res.status(400).json({ success: false, message: 'tickDamageMin must be less than or equal to tickDamageMax' });
        return;
      }
      if (body.tickHealingMin !== undefined && body.tickHealingMax !== undefined &&
          body.tickHealingMin !== null && body.tickHealingMax !== null &&
          body.tickHealingMin > body.tickHealingMax) {
        res.status(400).json({ success: false, message: 'tickHealingMin must be less than or equal to tickHealingMax' });
        return;
      }

      // Validate boolean fields
      // Validate string fields if provided
      const stringFields = ['name', 'description', 'tickMessage', 'wearOffMessage'];
      for (const field of stringFields) {
        if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
          res.status(400).json({ success: false, message: `${field} must be a string` });
          return;
        }
      }

      const booleanFields = ['silentTick', 'blocksRegen', 'blocksMovement', 'isBlind', 'blocksCasting', 'blocksCombat', 'blocksStealth'];
      for (const field of booleanFields) {
        if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'boolean') {
          res.status(400).json({ success: false, message: `${field} must be a boolean` });
          return;
        }
      }

      const definition = await effectDefRepo.updateDefinition(normalizedId, body);

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
      const normalizedId = id.toLowerCase();

      const success = await effectDefRepo.deleteDefinition(normalizedId);
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
      const { definitions, merge: mergeParam } = req.body;
      // Validate merge parameter - defaults to true, only false if explicitly false
      const merge = mergeParam !== false;

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
          // Create a normalized copy to avoid mutating input
          const normalizedId = def.id ? def.id.toLowerCase() : undefined;

          // Validate definition structure (using original def for error messages)
          const validationError = validateDefinitionInput({ ...def, id: normalizedId });
          if (validationError) {
            results.errors.push(`Invalid definition "${def.id || 'unknown'}": ${validationError}`);
            continue;
          }

          // Pass through validated definition
          const sanitizedDef = {
            ...def,
            id: normalizedId,
          };

          const existing = await effectDefRepo.getDefinitionById(normalizedId!);

          if (existing && merge) {
            await effectDefRepo.updateDefinition(normalizedId!, sanitizedDef);
            results.updated++;
          } else if (!existing) {
            await effectDefRepo.createDefinition(sanitizedDef);
            results.created++;
          } else {
            results.errors.push(`Skipped "${normalizedId}": already exists (merge disabled)`);
          }
        } catch (err) {
          results.errors.push(`Failed to import "${def.id || 'unknown'}": ${err instanceof Error ? err.message : String(err)}`);
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
