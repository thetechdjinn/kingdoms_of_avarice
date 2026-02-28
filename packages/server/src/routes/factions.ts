import { Express, Request, Response } from 'express';
import { FactionType } from '@koa/shared';
import * as factionRepo from '../db/repositories/factionRepository.js';
import { requireDeveloper } from '../middleware/auth.js';

const VALID_FACTION_TYPES = new Set<string>(['city', 'tribal', 'merchant', 'guild']);

export function setupFactionRoutes(app: Express): void {
  // List all factions
  app.get('/api/factions', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const factions = await factionRepo.getAllFactions();
      res.json({ success: true, factions });
    } catch (error) {
      console.error('Failed to load factions:', error);
      res.status(500).json({ success: false, message: 'Failed to load factions' });
    }
  });

  // Get single faction
  app.get('/api/factions/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid faction ID' });
        return;
      }
      const faction = await factionRepo.getFactionById(id);
      if (!faction) {
        res.status(404).json({ success: false, message: 'Faction not found' });
        return;
      }
      res.json({ success: true, faction });
    } catch (error) {
      console.error('Failed to load faction:', error);
      res.status(500).json({ success: false, message: 'Failed to load faction' });
    }
  });

  // Create faction
  app.post('/api/factions', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { name, description, factionType } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ success: false, message: 'Name is required' });
        return;
      }
      if (factionType && !VALID_FACTION_TYPES.has(factionType)) {
        res.status(400).json({ success: false, message: `Invalid faction type. Valid: ${[...VALID_FACTION_TYPES].join(', ')}` });
        return;
      }
      const faction = await factionRepo.createFaction({
        name: name.trim(),
        description: description || null,
        factionType: factionType as FactionType,
      });
      res.json({ success: true, faction });
    } catch (error) {
      console.error('Failed to create faction:', error);
      res.status(500).json({ success: false, message: 'Failed to create faction' });
    }
  });

  // Update faction
  app.put('/api/factions/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid faction ID' });
        return;
      }
      const { name, description, factionType } = req.body;
      if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
        res.status(400).json({ success: false, message: 'Name cannot be empty' });
        return;
      }
      if (factionType && !VALID_FACTION_TYPES.has(factionType)) {
        res.status(400).json({ success: false, message: `Invalid faction type. Valid: ${[...VALID_FACTION_TYPES].join(', ')}` });
        return;
      }
      const faction = await factionRepo.updateFaction(id, {
        name: name?.trim(),
        description,
        factionType: factionType as FactionType,
      });
      if (!faction) {
        res.status(404).json({ success: false, message: 'Faction not found' });
        return;
      }
      res.json({ success: true, faction });
    } catch (error) {
      console.error('Failed to update faction:', error);
      res.status(500).json({ success: false, message: 'Failed to update faction' });
    }
  });

  // Delete faction
  app.delete('/api/factions/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid faction ID' });
        return;
      }
      const deleted = await factionRepo.deleteFaction(id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Faction not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete faction:', error);
      res.status(500).json({ success: false, message: 'Failed to delete faction' });
    }
  });
}
