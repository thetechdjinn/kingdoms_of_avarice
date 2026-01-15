import { Express, Request, Response } from 'express';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { AbilityType } from '@koa/shared';

// Validation constants
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_ID_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 100;
const VALID_ABILITY_TYPES: AbilityType[] = ['skill', 'spell', 'technique', 'passive'];

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
      const { class_id, display_name, description, essence_multiplier, subscribed_tags, base_stats, talent_tree_id, resource_type, playable } = req.body;

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
        base_stats,
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
  // ABILITY DEFINITIONS
  // ============================================================================

  app.get('/api/progression/abilities', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const abilities = await progressionRepo.getAllAbilities();
      res.json({ success: true, abilities });
    } catch (error) {
      console.error('Failed to get abilities:', error);
      res.status(500).json({ success: false, message: 'Failed to get abilities' });
    }
  });

  app.get('/api/progression/abilities/type/:type', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const validTypes = VALID_ABILITY_TYPES;
      const abilityType = req.params.type as AbilityType;
      
      if (!validTypes.includes(abilityType)) {
        res.status(400).json({ success: false, message: `Invalid ability type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      const abilities = await progressionRepo.getAbilitiesByType(abilityType);
      res.json({ success: true, abilities });
    } catch (error) {
      console.error('Failed to get abilities by type:', error);
      res.status(500).json({ success: false, message: 'Failed to get abilities' });
    }
  });

  app.get('/api/progression/abilities/:abilityId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const ability = await progressionRepo.getAbilityById(req.params.abilityId);
      if (!ability) {
        res.status(404).json({ success: false, message: 'Ability not found' });
        return;
      }
      res.json({ success: true, ability });
    } catch (error) {
      console.error('Failed to get ability:', error);
      res.status(500).json({ success: false, message: 'Failed to get ability' });
    }
  });

  app.post('/api/progression/abilities', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { ability_id, display_name, description, ability_type, emitted_tags, resource_cost, resource_type, cooldown, effect_data, requirements } = req.body;

      if (!ability_id || !display_name || !ability_type) {
        res.status(400).json({ success: false, message: 'ability_id, display_name, and ability_type are required' });
        return;
      }

      // Validate ability_id format and length
      if (typeof ability_id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(ability_id) || ability_id.length > MAX_ID_LENGTH) {
        res.status(400).json({ success: false, message: 'ability_id must be lowercase alphanumeric starting with a letter (underscores allowed)' });
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

      const validTypes = VALID_ABILITY_TYPES;
      if (!validTypes.includes(ability_type)) {
        res.status(400).json({ success: false, message: `Invalid ability_type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      // Validate numeric fields if provided
      if (resource_cost !== undefined && (typeof resource_cost !== 'number' || resource_cost < 0)) {
        res.status(400).json({ success: false, message: 'resource_cost must be a non-negative number' });
        return;
      }
      if (cooldown !== undefined && (typeof cooldown !== 'number' || cooldown < 0)) {
        res.status(400).json({ success: false, message: 'cooldown must be a non-negative number' });
        return;
      }

      // Validate emitted_tags if provided
      if (emitted_tags !== undefined && (!Array.isArray(emitted_tags) || emitted_tags.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `emitted_tags must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      const ability = await progressionRepo.createAbility({
        ability_id,
        display_name,
        description,
        ability_type,
        emitted_tags,
        resource_cost,
        resource_type,
        cooldown,
        effect_data,
        requirements,
      });

      res.json({ success: true, ability });
    } catch (error) {
      console.error('Failed to create ability:', error);
      res.status(500).json({ success: false, message: 'Failed to create ability' });
    }
  });

  app.put('/api/progression/abilities/:abilityId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { display_name, description, ability_type, emitted_tags, resource_cost, cooldown } = req.body;
      const validTypes = VALID_ABILITY_TYPES;

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

      // Validate ability_type if provided
      if (ability_type !== undefined && !validTypes.includes(ability_type)) {
        res.status(400).json({ success: false, message: `Invalid ability_type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      // Validate numeric fields if provided
      if (resource_cost !== undefined && (typeof resource_cost !== 'number' || resource_cost < 0)) {
        res.status(400).json({ success: false, message: 'resource_cost must be a non-negative number' });
        return;
      }
      if (cooldown !== undefined && (typeof cooldown !== 'number' || cooldown < 0)) {
        res.status(400).json({ success: false, message: 'cooldown must be a non-negative number' });
        return;
      }

      // Validate emitted_tags if provided
      if (emitted_tags !== undefined && (!Array.isArray(emitted_tags) || emitted_tags.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `emitted_tags must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      const ability = await progressionRepo.updateAbility(req.params.abilityId, req.body);
      if (!ability) {
        res.status(404).json({ success: false, message: 'Ability not found' });
        return;
      }
      res.json({ success: true, ability });
    } catch (error) {
      console.error('Failed to update ability:', error);
      res.status(500).json({ success: false, message: 'Failed to update ability' });
    }
  });

  app.delete('/api/progression/abilities/:abilityId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const deleted = await progressionRepo.deleteAbility(req.params.abilityId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Ability not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete ability:', error);
      res.status(500).json({ success: false, message: 'Failed to delete ability' });
    }
  });

  // ============================================================================
  // TALENT DEFINITIONS
  // ============================================================================

  app.get('/api/progression/talents', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const talents = await progressionRepo.getAllTalents();
      res.json({ success: true, talents });
    } catch (error) {
      console.error('Failed to get talents:', error);
      res.status(500).json({ success: false, message: 'Failed to get talents' });
    }
  });

  app.get('/api/progression/talents/class/:classId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const talents = await progressionRepo.getTalentsByClass(req.params.classId);
      res.json({ success: true, talents });
    } catch (error) {
      console.error('Failed to get talents for class:', error);
      res.status(500).json({ success: false, message: 'Failed to get talents' });
    }
  });

  app.get('/api/progression/talents/:talentId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const talent = await progressionRepo.getTalentById(req.params.talentId);
      if (!talent) {
        res.status(404).json({ success: false, message: 'Talent not found' });
        return;
      }
      res.json({ success: true, talent });
    } catch (error) {
      console.error('Failed to get talent:', error);
      res.status(500).json({ success: false, message: 'Failed to get talent' });
    }
  });

  app.post('/api/progression/talents', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { talent_id, display_name, description, class_restriction, essence_cost, prerequisite_level, prerequisite_talents, effect_modifiers, grants_ability, tree_tier, tree_position } = req.body;

      if (!talent_id || !display_name || essence_cost === undefined) {
        res.status(400).json({ success: false, message: 'talent_id, display_name, and essence_cost are required' });
        return;
      }

      // Validate talent_id format and length
      if (typeof talent_id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(talent_id) || talent_id.length > MAX_ID_LENGTH) {
        res.status(400).json({ success: false, message: 'talent_id must be lowercase alphanumeric starting with a letter (underscores allowed)' });
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

      // Validate numeric fields
      if (typeof essence_cost !== 'number' || essence_cost < 0) {
        res.status(400).json({ success: false, message: 'essence_cost must be a non-negative number' });
        return;
      }
      if (prerequisite_level !== undefined && (typeof prerequisite_level !== 'number' || prerequisite_level < 1)) {
        res.status(400).json({ success: false, message: 'prerequisite_level must be a positive number' });
        return;
      }

      const talent = await progressionRepo.createTalent({
        talent_id,
        display_name,
        description,
        class_restriction,
        essence_cost,
        prerequisite_level,
        prerequisite_talents,
        effect_modifiers,
        grants_ability,
        tree_tier,
        tree_position,
      });

      res.json({ success: true, talent });
    } catch (error) {
      console.error('Failed to create talent:', error);
      res.status(500).json({ success: false, message: 'Failed to create talent' });
    }
  });

  app.put('/api/progression/talents/:talentId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { display_name, description, essence_cost, prerequisite_level } = req.body;

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

      // Validate numeric fields if provided
      if (essence_cost !== undefined && (typeof essence_cost !== 'number' || essence_cost < 0)) {
        res.status(400).json({ success: false, message: 'essence_cost must be a non-negative number' });
        return;
      }
      if (prerequisite_level !== undefined && (typeof prerequisite_level !== 'number' || prerequisite_level < 1)) {
        res.status(400).json({ success: false, message: 'prerequisite_level must be a positive number' });
        return;
      }

      const talent = await progressionRepo.updateTalent(req.params.talentId, req.body);
      if (!talent) {
        res.status(404).json({ success: false, message: 'Talent not found' });
        return;
      }
      res.json({ success: true, talent });
    } catch (error) {
      console.error('Failed to update talent:', error);
      res.status(500).json({ success: false, message: 'Failed to update talent' });
    }
  });

  app.delete('/api/progression/talents/:talentId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const deleted = await progressionRepo.deleteTalent(req.params.talentId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Talent not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete talent:', error);
      res.status(500).json({ success: false, message: 'Failed to delete talent' });
    }
  });

  // ============================================================================
  // GAME EVENTS
  // ============================================================================

  app.get('/api/progression/events', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const events = await progressionRepo.getAllGameEvents();
      res.json({ success: true, events });
    } catch (error) {
      console.error('Failed to get game events:', error);
      res.status(500).json({ success: false, message: 'Failed to get game events' });
    }
  });

  app.get('/api/progression/events/:eventId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const event = await progressionRepo.getGameEventById(req.params.eventId);
      if (!event) {
        res.status(404).json({ success: false, message: 'Event not found' });
        return;
      }
      res.json({ success: true, event });
    } catch (error) {
      console.error('Failed to get game event:', error);
      res.status(500).json({ success: false, message: 'Failed to get game event' });
    }
  });

  app.post('/api/progression/events', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { event_id, display_name, emitted_tags, base_essence_value, base_xp_value } = req.body;

      if (!event_id || !emitted_tags || base_essence_value === undefined) {
        res.status(400).json({ success: false, message: 'event_id, emitted_tags, and base_essence_value are required' });
        return;
      }

      // Validate event_id format and length
      if (typeof event_id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(event_id) || event_id.length > MAX_ID_LENGTH) {
        res.status(400).json({ success: false, message: 'event_id must be lowercase alphanumeric starting with a letter (underscores allowed)' });
        return;
      }

      // Validate display_name length if provided
      if (display_name !== undefined && (typeof display_name !== 'string' || display_name.length > MAX_DISPLAY_NAME_LENGTH)) {
        res.status(400).json({ success: false, message: `display_name must not exceed ${MAX_DISPLAY_NAME_LENGTH} characters` });
        return;
      }

      // Validate emitted_tags is an array with length limit
      if (!Array.isArray(emitted_tags) || emitted_tags.length > MAX_ARRAY_LENGTH) {
        res.status(400).json({ success: false, message: `emitted_tags must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      // Validate numeric fields
      if (typeof base_essence_value !== 'number' || base_essence_value < 0) {
        res.status(400).json({ success: false, message: 'base_essence_value must be a non-negative number' });
        return;
      }
      if (base_xp_value !== undefined && (typeof base_xp_value !== 'number' || base_xp_value < 0)) {
        res.status(400).json({ success: false, message: 'base_xp_value must be a non-negative number' });
        return;
      }

      const event = await progressionRepo.createGameEvent({
        event_id,
        display_name,
        emitted_tags,
        base_essence_value,
        base_xp_value,
      });

      res.json({ success: true, event });
    } catch (error) {
      console.error('Failed to create game event:', error);
      res.status(500).json({ success: false, message: 'Failed to create game event' });
    }
  });

  app.put('/api/progression/events/:eventId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { display_name, emitted_tags, base_essence_value, base_xp_value } = req.body;

      // Validate display_name if provided
      if (display_name !== undefined && (typeof display_name !== 'string' || display_name.length > MAX_DISPLAY_NAME_LENGTH)) {
        res.status(400).json({ success: false, message: `display_name must not exceed ${MAX_DISPLAY_NAME_LENGTH} characters` });
        return;
      }

      // Validate emitted_tags if provided
      if (emitted_tags !== undefined && (!Array.isArray(emitted_tags) || emitted_tags.length > MAX_ARRAY_LENGTH)) {
        res.status(400).json({ success: false, message: `emitted_tags must be an array with at most ${MAX_ARRAY_LENGTH} items` });
        return;
      }

      // Validate numeric fields if provided
      if (base_essence_value !== undefined && (typeof base_essence_value !== 'number' || base_essence_value < 0)) {
        res.status(400).json({ success: false, message: 'base_essence_value must be a non-negative number' });
        return;
      }
      if (base_xp_value !== undefined && (typeof base_xp_value !== 'number' || base_xp_value < 0)) {
        res.status(400).json({ success: false, message: 'base_xp_value must be a non-negative number' });
        return;
      }

      const event = await progressionRepo.updateGameEvent(req.params.eventId, req.body);
      if (!event) {
        res.status(404).json({ success: false, message: 'Event not found' });
        return;
      }
      res.json({ success: true, event });
    } catch (error) {
      console.error('Failed to update game event:', error);
      res.status(500).json({ success: false, message: 'Failed to update game event' });
    }
  });

  app.delete('/api/progression/events/:eventId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const deleted = await progressionRepo.deleteGameEvent(req.params.eventId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Event not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete game event:', error);
      res.status(500).json({ success: false, message: 'Failed to delete game event' });
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

  // ============================================================================
  // CLASS ABILITIES
  // ============================================================================

  app.get('/api/progression/classes/:classId/abilities', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const abilities = await progressionRepo.getClassAbilities(req.params.classId);
      res.json({ success: true, abilities });
    } catch (error) {
      console.error('Failed to get class abilities:', error);
      res.status(500).json({ success: false, message: 'Failed to get class abilities' });
    }
  });

  app.post('/api/progression/classes/:classId/abilities', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { ability_id, required_level, auto_learn, training_cost } = req.body;

      if (!ability_id) {
        res.status(400).json({ success: false, message: 'ability_id is required' });
        return;
      }

      // Validate numeric fields
      if (required_level !== undefined) {
        const level = Number(required_level);
        if (!Number.isInteger(level) || level < 1) {
          res.status(400).json({ success: false, message: 'required_level must be a positive integer' });
          return;
        }
      }
      if (training_cost !== undefined) {
        const cost = Number(training_cost);
        if (!Number.isInteger(cost) || cost < 0) {
          res.status(400).json({ success: false, message: 'training_cost must be a non-negative integer' });
          return;
        }
      }

      const mapping = await progressionRepo.addClassAbility({
        class_id: req.params.classId,
        ability_id,
        required_level: required_level !== undefined ? Number(required_level) : 1,
        auto_learn: auto_learn ?? false,
        training_cost: training_cost !== undefined ? Number(training_cost) : undefined,
      });

      res.json({ success: true, mapping });
    } catch (error) {
      console.error('Failed to add class ability:', error);
      res.status(500).json({ success: false, message: 'Failed to add class ability' });
    }
  });

  app.delete('/api/progression/classes/:classId/abilities/:abilityId', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const deleted = await progressionRepo.removeClassAbility(req.params.classId, req.params.abilityId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Class ability mapping not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to remove class ability:', error);
      res.status(500).json({ success: false, message: 'Failed to remove class ability' });
    }
  });
}
