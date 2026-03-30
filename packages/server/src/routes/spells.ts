import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import * as spellRepo from '../db/repositories/spellRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { SpellType, SpellTargetType, SpellScalingStat } from '@koa/shared';
import { initializeSpellMnemonics } from '../game/spellCommands.js';

const VALID_SCALING_STATS = Object.values(SpellScalingStat) as string[];

// Validate spell object structure and field values
function validateSpellInput(spell: Record<string, unknown>): string | null {
  const validSpellTypes = Object.values(SpellType);
  const validTargetTypes = Object.values(SpellTargetType);

  if (!spell.name || typeof spell.name !== 'string') {
    return 'name is required and must be a string';
  }
  if (!spell.mnemonic || typeof spell.mnemonic !== 'string') {
    return 'mnemonic is required and must be a string';
  }
  if (!spell.spellType || !validSpellTypes.includes(spell.spellType as SpellType)) {
    return `spellType is required and must be one of: ${validSpellTypes.join(', ')}`;
  }
  if (!spell.targetType || !validTargetTypes.includes(spell.targetType as SpellTargetType)) {
    return `targetType is required and must be one of: ${validTargetTypes.join(', ')}`;
  }
  const scalingError = validateSpellScalingFields(spell);
  if (scalingError) return scalingError;
  return null;
}

/** Validate scaling and save fields on a spell. Returns error string or null. */
function validateSpellScalingFields(spell: Record<string, unknown>): string | null {
  if (spell.damageScalingStat !== undefined && spell.damageScalingStat !== null &&
      !VALID_SCALING_STATS.includes(spell.damageScalingStat as string)) {
    return `damageScalingStat must be one of: ${VALID_SCALING_STATS.join(', ')}`;
  }
  if (spell.healingScalingStat !== undefined && spell.healingScalingStat !== null &&
      !VALID_SCALING_STATS.includes(spell.healingScalingStat as string)) {
    return `healingScalingStat must be one of: ${VALID_SCALING_STATS.join(', ')}`;
  }
  if (spell.saveStat !== undefined && spell.saveStat !== null &&
      !VALID_SCALING_STATS.includes(spell.saveStat as string)) {
    return `saveStat must be one of: ${VALID_SCALING_STATS.join(', ')}`;
  }
  if (spell.damageScalingFactor !== undefined && spell.damageScalingFactor !== null &&
      (typeof spell.damageScalingFactor !== 'number' || spell.damageScalingFactor < 0)) {
    return 'damageScalingFactor must be a number >= 0';
  }
  if (spell.healingScalingFactor !== undefined && spell.healingScalingFactor !== null &&
      (typeof spell.healingScalingFactor !== 'number' || spell.healingScalingFactor < 0)) {
    return 'healingScalingFactor must be a number >= 0';
  }
  if (spell.saveDifficulty !== undefined && spell.saveDifficulty !== null &&
      (typeof spell.saveDifficulty !== 'number' || spell.saveDifficulty < 0)) {
    return 'saveDifficulty must be a number >= 0';
  }
  if (spell.maxScalingLevel !== undefined && spell.maxScalingLevel !== null &&
      (typeof spell.maxScalingLevel !== 'number' || !Number.isInteger(spell.maxScalingLevel) || spell.maxScalingLevel < 0)) {
    return 'maxScalingLevel must be a non-negative integer';
  }
  return null;
}

export function setupSpellRoutes(app: Express): void {
  // ============================================================================
  // SPELL DEFINITIONS
  // ============================================================================

  // Get all spells
  app.get('/api/spells', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const spells = await spellRepo.getAllSpells();
      res.json({ success: true, spells });
    } catch (error) {
      console.error('Failed to get spells:', error);
      res.status(500).json({ success: false, message: 'Failed to get spells' });
    }
  });

  // Get single spell
  app.get('/api/spells/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid spell ID' });
        return;
      }

      const spell = await spellRepo.getSpellById(id);
      if (!spell) {
        res.status(404).json({ success: false, message: 'Spell not found' });
        return;
      }

      res.json({ success: true, spell });
    } catch (error) {
      console.error('Failed to get spell:', error);
      res.status(500).json({ success: false, message: 'Failed to get spell' });
    }
  });

  // Create spell
  app.post('/api/spells', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const {
        name, mnemonic, description, spellType, targetType,
        manaCost, minDamage, maxDamage, minHealing, maxHealing, hitsPerCast,
        statusEffect, effectDuration,
        levelRequired, classRestrictions, isAttackSpell,
        scalingPerLevel, maxScalingLevel, damageScalingStat, damageScalingFactor,
        healingScalingStat, healingScalingFactor,
        castDifficulty, fizzleMessage, fizzleMessageRoom,
        hitMessageSelf, hitMessageTarget, hitMessageRoom,
        telegraphMessage, saveStat, saveDifficulty
      } = req.body;

      if (!name || !mnemonic || !spellType || !targetType) {
        res.status(400).json({ success: false, message: 'name, mnemonic, spellType, and targetType are required' });
        return;
      }

      // Validate spell_type
      const validSpellTypes = Object.values(SpellType);
      if (!validSpellTypes.includes(spellType)) {
        res.status(400).json({ success: false, message: `Invalid spellType: must be one of ${validSpellTypes.join(', ')}` });
        return;
      }

      // Validate target_type
      const validTargetTypes = Object.values(SpellTargetType);
      if (!validTargetTypes.includes(targetType)) {
        res.status(400).json({ success: false, message: `Invalid targetType: must be one of ${validTargetTypes.join(', ')}` });
        return;
      }

      // Validate scaling and save fields
      const scalingError = validateSpellScalingFields(req.body);
      if (scalingError) {
        res.status(400).json({ success: false, message: scalingError });
        return;
      }

      // Check for duplicate mnemonic
      const existingMnemonic = await spellRepo.getSpellByMnemonic(mnemonic);
      if (existingMnemonic) {
        res.status(400).json({ success: false, message: `Mnemonic "${mnemonic}" is already in use` });
        return;
      }

      const spell = await spellRepo.createSpell({
        name,
        mnemonic,
        description,
        spellType,
        targetType,
        manaCost: manaCost ?? 0,
        minDamage, maxDamage, minHealing, maxHealing,
        hitsPerCast: hitsPerCast ?? 1,
        statusEffect, effectDuration,
        levelRequired: levelRequired ?? 1,
        classRestrictions,
        isAttackSpell: isAttackSpell ?? false,
        scalingPerLevel, maxScalingLevel, damageScalingStat, damageScalingFactor,
        healingScalingStat, healingScalingFactor,
        castDifficulty: castDifficulty ?? 0, fizzleMessage, fizzleMessageRoom,
        hitMessageSelf, hitMessageTarget, hitMessageRoom,
        telegraphMessage, saveStat, saveDifficulty,
      });

      // Refresh mnemonic cache
      await initializeSpellMnemonics();

      res.json({ success: true, spell });
    } catch (error) {
      console.error('Failed to create spell:', error);
      res.status(500).json({ success: false, message: 'Failed to create spell' });
    }
  });

  // Update spell
  app.put('/api/spells/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid spell ID' });
        return;
      }

      const existing = await spellRepo.getSpellById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Spell not found' });
        return;
      }

      // Check for duplicate mnemonic if mnemonic is being changed
      const { mnemonic, spellType, targetType } = req.body;
      if (mnemonic && mnemonic.toLowerCase() !== existing.mnemonic.toLowerCase()) {
        const existingMnemonic = await spellRepo.getSpellByMnemonic(mnemonic);
        if (existingMnemonic) {
          res.status(400).json({ success: false, message: `Mnemonic "${mnemonic}" is already in use` });
          return;
        }
      }

      // Validate spell_type if provided
      if (spellType !== undefined) {
        const validSpellTypes = Object.values(SpellType);
        if (!validSpellTypes.includes(spellType)) {
          res.status(400).json({ success: false, message: `Invalid spellType: must be one of ${validSpellTypes.join(', ')}` });
          return;
        }
      }

      // Validate target_type if provided
      if (targetType !== undefined) {
        const validTargetTypes = Object.values(SpellTargetType);
        if (!validTargetTypes.includes(targetType)) {
          res.status(400).json({ success: false, message: `Invalid targetType: must be one of ${validTargetTypes.join(', ')}` });
          return;
        }
      }

      // Validate scaling and save fields if provided
      const scalingError = validateSpellScalingFields(req.body);
      if (scalingError) {
        res.status(400).json({ success: false, message: scalingError });
        return;
      }

      const spell = await spellRepo.updateSpell(id, req.body);

      // Refresh mnemonic cache if mnemonic changed
      if (mnemonic) {
        await initializeSpellMnemonics();
      }

      res.json({ success: true, spell });
    } catch (error) {
      console.error('Failed to update spell:', error);
      res.status(500).json({ success: false, message: 'Failed to update spell' });
    }
  });

  // Delete spell
  app.delete('/api/spells/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid spell ID' });
        return;
      }

      const success = await spellRepo.deleteSpell(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Spell not found' });
        return;
      }

      // Refresh mnemonic cache
      await initializeSpellMnemonics();

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete spell:', error);
      res.status(500).json({ success: false, message: 'Failed to delete spell' });
    }
  });

  // ============================================================================
  // UTILITY ENDPOINTS
  // ============================================================================

  // Get spell types and target types enums
  app.get('/api/spells/types/enum', requireDeveloper, (_req: Request, res: Response) => {
    res.json({
      success: true,
      spellTypes: Object.values(SpellType),
      targetTypes: Object.values(SpellTargetType),
    });
  });

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  // Export all spells
  app.get('/api/spells/export/all', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const spells = await spellRepo.getAllSpells();

      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        spells,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="spells_export.json"');
      res.json(exportData);
    } catch (error) {
      console.error('Failed to export spells:', error);
      res.status(500).json({ success: false, message: 'Failed to export spells' });
    }
  });

  // Import spells
  app.post('/api/spells/import', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { spells, merge = true } = req.body;

      if (!spells || !Array.isArray(spells)) {
        res.status(400).json({ success: false, message: 'spells array is required' });
        return;
      }

      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
      };

      for (const spell of spells) {
        try {
          // Validate spell structure
          const validationError = validateSpellInput(spell);
          if (validationError) {
            results.errors.push(`Invalid spell "${spell.name || 'unknown'}": ${validationError}`);
            continue;
          }

          const existing = await spellRepo.getSpellByMnemonic(spell.mnemonic);

          if (existing && merge) {
            await spellRepo.updateSpell(existing.id, spell);
            results.updated++;
          } else if (!existing) {
            await spellRepo.createSpell(spell);
            results.created++;
          } else {
            results.errors.push(`Skipped "${spell.name}": mnemonic already exists (merge disabled)`);
          }
        } catch (err) {
          results.errors.push(`Failed to import "${spell.name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Refresh mnemonic cache
      await initializeSpellMnemonics();

      res.json({ success: true, results });
    } catch (error) {
      console.error('Failed to import spells:', error);
      res.status(500).json({ success: false, message: 'Failed to import spells' });
    }
  });
}
