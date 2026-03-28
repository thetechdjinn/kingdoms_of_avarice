import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import * as spawnRepo from '../db/repositories/spawnRepository.js';
import { reloadSpawnConfigs } from '../game/npcManager.js';
import { requireDeveloper } from '../middleware/auth.js';

export function setupSpawnRoutes(app: Express): void {
  // Get spawns (filtered by room_id or npc_id query param)
  app.get('/api/room-spawns', requireDeveloper, async (req: Request, res: Response) => {
    try {
      if (req.query.room_id) {
        const roomId = parseInt(req.query.room_id as string);
        if (isNaN(roomId) || roomId < 1) {
          res.status(400).json({ success: false, message: 'room_id must be a positive integer' });
          return;
        }
        const spawns = await spawnRepo.getSpawnsByRoom(roomId);
        res.json({ success: true, spawns });
        return;
      }

      if (req.query.npc_id) {
        const npcId = parseInt(req.query.npc_id as string);
        if (isNaN(npcId) || npcId < 1) {
          res.status(400).json({ success: false, message: 'npc_id must be a positive integer' });
          return;
        }
        const spawns = await spawnRepo.getSpawnsByNpc(npcId);
        res.json({ success: true, spawns });
        return;
      }

      const spawns = await spawnRepo.getAllSpawns();
      res.json({ success: true, spawns });
    } catch (error) {
      console.error('Failed to fetch room spawns:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch room spawns' });
    }
  });

  // Create spawn
  app.post('/api/room-spawns', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { roomId, npcId, maxActive, respawnSeconds } = req.body;

      if (!roomId || !Number.isInteger(roomId) || roomId < 1) {
        res.status(400).json({ success: false, message: 'roomId must be a positive integer' });
        return;
      }
      if (!npcId || !Number.isInteger(npcId) || npcId < 1) {
        res.status(400).json({ success: false, message: 'npcId must be a positive integer' });
        return;
      }
      if (maxActive !== undefined && (!Number.isInteger(maxActive) || maxActive < 1)) {
        res.status(400).json({ success: false, message: 'maxActive must be an integer >= 1' });
        return;
      }
      if (respawnSeconds !== undefined && (!Number.isInteger(respawnSeconds) || respawnSeconds < 0)) {
        res.status(400).json({ success: false, message: 'respawnSeconds must be an integer >= 0' });
        return;
      }

      const spawn = await spawnRepo.createSpawn({ roomId, npcId, maxActive, respawnSeconds });
      await reloadSpawnConfigs();
      res.json({ success: true, spawn });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to create room spawn';
      // Handle unique constraint violation (duplicate room+npc pair)
      if (msg.includes('unique') || msg.includes('duplicate')) {
        res.status(409).json({ success: false, message: 'A spawn config for this NPC already exists in this room' });
        return;
      }
      console.error('Failed to create room spawn:', error);
      res.status(500).json({ success: false, message: 'Failed to create room spawn' });
    }
  });

  // Update spawn
  app.put('/api/room-spawns/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) {
        res.status(400).json({ success: false, message: 'Invalid spawn ID' });
        return;
      }

      const { maxActive, respawnSeconds } = req.body;

      if (maxActive !== undefined && (!Number.isInteger(maxActive) || maxActive < 1)) {
        res.status(400).json({ success: false, message: 'maxActive must be an integer >= 1' });
        return;
      }
      if (respawnSeconds !== undefined && (!Number.isInteger(respawnSeconds) || respawnSeconds < 0)) {
        res.status(400).json({ success: false, message: 'respawnSeconds must be an integer >= 0' });
        return;
      }

      const updated = await spawnRepo.updateSpawn(id, { maxActive, respawnSeconds });
      if (!updated) {
        res.status(404).json({ success: false, message: 'Spawn config not found' });
        return;
      }

      await reloadSpawnConfigs();
      res.json({ success: true, spawn: updated });
    } catch (error) {
      console.error('Failed to update room spawn:', error);
      res.status(500).json({ success: false, message: 'Failed to update room spawn' });
    }
  });

  // Delete spawn
  app.delete('/api/room-spawns/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id < 1) {
        res.status(400).json({ success: false, message: 'Invalid spawn ID' });
        return;
      }

      const deleted = await spawnRepo.deleteSpawn(id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Spawn config not found' });
        return;
      }

      await reloadSpawnConfigs();
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete room spawn:', error);
      res.status(500).json({ success: false, message: 'Failed to delete room spawn' });
    }
  });
}
