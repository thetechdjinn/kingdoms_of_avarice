import { Express, Request, Response } from 'express';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { requireDeveloper } from '../middleware/auth.js';

// Validation constants
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_ID_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 100;

export function setupProgressionRoutes(app: Express): void {
  // ============================================================================
  // CLASS DEFINITIONS
  // ============================================================================

  app.get('/api/progression/classes', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const classes = await progressionRepo.getAllClasses();
      res.json({ success: true, classes });
    } catch (error) {
      console.error('Failed to get classes:', error);
      res.status(500).json({ success: false, message: 'Failed to get classes' });
    }
  });

  app.get('/api/progression/classes/playable', async (_req: Request, res: Response) => {
    try {
      const classes = await progressionRepo.getPlayableClasses();
      res.json({ success: true, classes });
    } catch (error) {
      console.error('Failed to get playable classes:', error);
      res.status(500).json({ success: false, message: 'Failed to get playable classes' });
    }
  });

  app.get('/api/progression/classes/:classId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const classDef = await progressionRepo.getClassById(req.params.classId);
      if (!classDef) {
        res.status(404).json({ success: false, message: 'Class not found' });
        return;
      }
      res.json({ success: true, class: classDef });
    } catch (error) {
      console.error('Failed to get class:', error);
      res.status(500).json({ success: false, message: 'Failed to get class' });
    }
  });

  app.post('/api/progression/classes', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { class_id, display_name, description, essence_multiplier, subscribed_tags, talent_tree_id, resource_type, playable } = req.body;

      if (!class_id || !display_name) {
        res.status(400).json({ success: false, message: 'class_id and display_name are required' });
        return;
      }

      // Validate class_id format (alphanumeric with underscores, no spaces)
      if (typeof class_id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(class_id) || class_id.length > MAX_ID_LENGTH) {
        res.status(400).json({ success: false, message: 'class_id must be lowercase alphanumeric starting with a letter (underscores allowed)' });
        return;
      }

      // Validate display_name (non-empty and length limit)
      if (typeof display_name !== 'string' || display_name.length === 0 || display_name.length > MAX_DISPLAY_NAME_LENGTH) {
        res.status(400).json({ success: false, message: `display_name must be a non-empty string not exceeding ${MAX_DISPLAY_NAME_LENGTH} characters` });
        return;
      }

      // Validate description length if provided
      if (description !== undefined && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
        res.status(400).json({ success: false, message: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
        return;
      }

      // Validate essence_multiplier if provided
      const multiplier = essence_multiplier ?? 1.0;
      if (typeof multiplier !== 'number' || multiplier <= 0 || !isFinite(multiplier)) {
        res.status(400).json({ success: false, message: 'essence_multiplier must be a positive number' });
        return;
      }

      // Validate subscribed_tags if provided
      if (subscribed_tags !== undefined && (!Array.isArray(subscribed_tags) || subscribed_tags.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `subscribed_tags must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      const classDef = await progressionRepo.createClass({
        class_id,
        display_name,
        description,
        essence_multiplier: multiplier,
        subscribed_tags: subscribed_tags ?? [],
        talent_tree_id,
        resource_type,
        playable,
      });

      res.json({ success: true, class: classDef });
    } catch (error) {
      console.error('Failed to create class:', error);
      res.status(500).json({ success: false, message: 'Failed to create class' });
    }
  });

  app.put('/api/progression/classes/:classId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { display_name, description, essence_multiplier, subscribed_tags } = req.body;

      // Validate display_name if provided
      if (display_name !== undefined && (typeof display_name !== 'string' || display_name.length === 0 || display_name.length > MAX_DISPLAY_NAME_LENGTH)) {
        res.status(400).json({ success: false, message: `display_name must be a non-empty string not exceeding ${MAX_DISPLAY_NAME_LENGTH} characters` });
        return;
      }

      // Validate description if provided
      if (description !== undefined && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
        res.status(400).json({ success: false, message: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
        return;
      }

      // Validate essence_multiplier if provided
      if (essence_multiplier !== undefined && (typeof essence_multiplier !== 'number' || essence_multiplier <= 0 || !isFinite(essence_multiplier))) {
        res.status(400).json({ success: false, message: 'essence_multiplier must be a positive number' });
        return;
      }

      // Validate subscribed_tags if provided
      if (subscribed_tags !== undefined && (!Array.isArray(subscribed_tags) || subscribed_tags.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `subscribed_tags must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      const classDef = await progressionRepo.updateClass(req.params.classId, req.body);
      if (!classDef) {
        res.status(404).json({ success: false, message: 'Class not found' });
        return;
      }
      res.json({ success: true, class: classDef });
    } catch (error) {
      console.error('Failed to update class:', error);
      res.status(500).json({ success: false, message: 'Failed to update class' });
    }
  });

  app.delete('/api/progression/classes/:classId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const deleted = await progressionRepo.deleteClass(req.params.classId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Class not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete class:', error);
      res.status(500).json({ success: false, message: 'Failed to delete class' });
    }
  });

  // ============================================================================
  // RACE DEFINITIONS
  // ============================================================================

  app.get('/api/progression/races', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const races = await progressionRepo.getAllRaces();
      res.json({ success: true, races });
    } catch (error) {
      console.error('Failed to get races:', error);
      res.status(500).json({ success: false, message: 'Failed to get races' });
    }
  });

  app.get('/api/progression/races/playable', async (_req: Request, res: Response) => {
    try {
      const races = await progressionRepo.getPlayableRaces();
      res.json({ success: true, races });
    } catch (error) {
      console.error('Failed to get playable races:', error);
      res.status(500).json({ success: false, message: 'Failed to get playable races' });
    }
  });

  app.get('/api/progression/races/:raceId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const raceDef = await progressionRepo.getRaceById(req.params.raceId);
      if (!raceDef) {
        res.status(404).json({ success: false, message: 'Race not found' });
        return;
      }
      res.json({ success: true, race: raceDef });
    } catch (error) {
      console.error('Failed to get race:', error);
      res.status(500).json({ success: false, message: 'Failed to get race' });
    }
  });

  app.post('/api/progression/races', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { race_id, display_name, description, stat_modifiers, traits, allowed_classes, playable } = req.body;

      if (!race_id || !display_name) {
        res.status(400).json({ success: false, message: 'race_id and display_name are required' });
        return;
      }

      // Validate race_id format and length
      if (typeof race_id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(race_id) || race_id.length > MAX_ID_LENGTH) {
        res.status(400).json({ success: false, message: 'race_id must be lowercase alphanumeric starting with a letter (underscores allowed)' });
        return;
      }

      // Validate display_name (non-empty and length limit)
      if (typeof display_name !== 'string' || display_name.length === 0 || display_name.length > MAX_DISPLAY_NAME_LENGTH) {
        res.status(400).json({ success: false, message: `display_name must be a non-empty string not exceeding ${MAX_DISPLAY_NAME_LENGTH} characters` });
        return;
      }

      // Validate description length if provided
      if (description !== undefined && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
        res.status(400).json({ success: false, message: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
        return;
      }

      // Validate arrays if provided
      if (traits !== undefined && (!Array.isArray(traits) || traits.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `traits must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }
      if (allowed_classes !== undefined && (!Array.isArray(allowed_classes) || allowed_classes.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `allowed_classes must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      const raceDef = await progressionRepo.createRace({
        race_id,
        display_name,
        description,
        stat_modifiers,
        traits,
        allowed_classes,
        playable,
      });

      res.json({ success: true, race: raceDef });
    } catch (error) {
      console.error('Failed to create race:', error);
      res.status(500).json({ success: false, message: 'Failed to create race' });
    }
  });

  app.put('/api/progression/races/:raceId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { display_name, description, traits, allowed_classes } = req.body;

      // Validate display_name if provided
      if (display_name !== undefined && (typeof display_name !== 'string' || display_name.length === 0 || display_name.length > MAX_DISPLAY_NAME_LENGTH)) {
        res.status(400).json({ success: false, message: `display_name must be a non-empty string not exceeding ${MAX_DISPLAY_NAME_LENGTH} characters` });
        return;
      }

      // Validate description if provided
      if (description !== undefined && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
        res.status(400).json({ success: false, message: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
        return;
      }

      // Validate arrays if provided
      if (traits !== undefined && (!Array.isArray(traits) || traits.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `traits must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }
      if (allowed_classes !== undefined && (!Array.isArray(allowed_classes) || allowed_classes.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `allowed_classes must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      const raceDef = await progressionRepo.updateRace(req.params.raceId, req.body);
      if (!raceDef) {
        res.status(404).json({ success: false, message: 'Race not found' });
        return;
      }
      res.json({ success: true, race: raceDef });
    } catch (error) {
      console.error('Failed to update race:', error);
      res.status(500).json({ success: false, message: 'Failed to update race' });
    }
  });

  app.delete('/api/progression/races/:raceId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const deleted = await progressionRepo.deleteRace(req.params.raceId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Race not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete race:', error);
      res.status(500).json({ success: false, message: 'Failed to delete race' });
    }
  });

  // ============================================================================
  // PROGRESSION TABLE
  // ============================================================================

  app.get('/api/progression/levels', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const table = await progressionRepo.getProgressionTable();
      res.json({ success: true, levels: table });
    } catch (error) {
      console.error('Failed to get progression table:', error);
      res.status(500).json({ success: false, message: 'Failed to get progression table' });
    }
  });

  app.post('/api/progression/levels', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { level, std_xp_required, base_essence_required } = req.body;

      if (level === undefined || std_xp_required === undefined || base_essence_required === undefined) {
        res.status(400).json({ success: false, message: 'level, std_xp_required, and base_essence_required are required' });
        return;
      }

      // Validate level is a positive integer
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1) {
        res.status(400).json({ success: false, message: 'level must be a positive integer' });
        return;
      }

      // Validate XP and essence are non-negative numbers
      if (typeof std_xp_required !== 'number' || std_xp_required < 0) {
        res.status(400).json({ success: false, message: 'std_xp_required must be a non-negative number' });
        return;
      }
      if (typeof base_essence_required !== 'number' || base_essence_required < 0) {
        res.status(400).json({ success: false, message: 'base_essence_required must be a non-negative number' });
        return;
      }

      const levelReq = await progressionRepo.setLevelRequirement({
        level,
        std_xp_required,
        base_essence_required,
      });

      res.json({ success: true, level: levelReq });
    } catch (error) {
      console.error('Failed to set level requirement:', error);
      res.status(500).json({ success: false, message: 'Failed to set level requirement' });
    }
  });

}
