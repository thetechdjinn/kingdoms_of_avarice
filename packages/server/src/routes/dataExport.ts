import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import { requireAdmin } from '../middleware/auth.js';
import { runExport } from '../db/data-export.js';

export function setupDataExportRoutes(app: Express): void {
  // Trigger a full game data export to the data/ directory.
  // This writes the current DB state as portable JSON files that can be
  // committed to the repo and used by `npm run data:import` on a fresh install.
  app.post('/api/data/export', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await runExport();
      res.json({
        success: true,
        message: `Export complete: ${result.counts.rooms ?? 0} rooms, ${result.counts.npcs ?? 0} NPCs, ${result.counts.items ?? 0} items, ${result.counts.spells ?? 0} spells, ${result.counts.factions ?? 0} factions, ${result.counts.drop_tables ?? 0} drop tables, ${result.counts.quests ?? 0} quests, ${result.counts.status_effects ?? 0} effects, ${result.counts.actions ?? 0} actions`,
        warnings: result.warnings,
        counts: result.counts,
      });
    } catch (error) {
      console.error('Data export failed:', error);
      res.status(500).json({ success: false, message: 'Export failed: ' + (error instanceof Error ? error.message : 'unknown error') });
    }
  });
}
