import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { loadProgressionTableFromDb } from '../game/progressionLoader.js';

export function setupProgressionTableRoutes(app: Express): void {
  // Get all levels (requires Developer role)
  app.get('/api/progression-table', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const levels = await progressionRepo.getProgressionTable();
      res.json({ success: true, levels });
    } catch (error) {
      console.error('Failed to get progression table:', error);
      res.status(500).json({ success: false, message: 'Failed to get progression table' });
    }
  });

  // Upsert a level (requires Developer role)
  app.put('/api/progression-table/:level', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const level = parseInt(req.params.level);
      if (isNaN(level)) {
        res.status(400).json({ success: false, message: 'Invalid level' });
        return;
      }

      if (level < 2) {
        res.status(400).json({ success: false, message: 'Level must be >= 2 (level 1 is implicit)' });
        return;
      }

      const { std_xp_required, base_essence_required } = req.body;

      if (std_xp_required === undefined || typeof std_xp_required !== 'number' || std_xp_required <= 0) {
        res.status(400).json({ success: false, message: 'std_xp_required must be a number greater than 0' });
        return;
      }

      if (base_essence_required === undefined || typeof base_essence_required !== 'number' || base_essence_required < 0) {
        res.status(400).json({ success: false, message: 'base_essence_required must be a number >= 0' });
        return;
      }

      const result = await progressionRepo.setLevelRequirement({
        level,
        std_xp_required,
        base_essence_required,
      });

      // Reload in-memory progression table so changes take effect immediately
      await loadProgressionTableFromDb();

      res.json({ success: true, level: result });
    } catch (error) {
      console.error('Failed to upsert level requirement:', error);
      res.status(500).json({ success: false, message: 'Failed to upsert level requirement' });
    }
  });

  // Delete a level (requires Developer role)
  app.delete('/api/progression-table/:level', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const level = parseInt(req.params.level);
      if (isNaN(level)) {
        res.status(400).json({ success: false, message: 'Invalid level' });
        return;
      }

      if (level < 2) {
        res.status(400).json({ success: false, message: 'Level must be >= 2 (level 1 is implicit)' });
        return;
      }

      // Only allow deleting the highest level to prevent gaps that break leveling
      const allLevels = await progressionRepo.getProgressionTable();
      if (allLevels.length === 0) {
        res.status(404).json({ success: false, message: 'Progression table is empty.' });
        return;
      }
      const maxLevel = Math.max(...allLevels.map(l => l.level));
      if (level !== maxLevel) {
        res.status(400).json({ success: false, message: `Can only delete the highest level (${maxLevel}). Remove levels from the top down to avoid gaps.` });
        return;
      }

      const success = await progressionRepo.deleteLevelRequirement(level);
      if (!success) {
        res.status(404).json({ success: false, message: 'Level not found' });
        return;
      }

      // Reload in-memory progression table so changes take effect immediately
      await loadProgressionTableFromDb();

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete level requirement:', error);
      res.status(500).json({ success: false, message: 'Failed to delete level requirement' });
    }
  });
}
