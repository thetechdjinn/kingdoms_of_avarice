import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import { verifyToken, COOKIE_NAME } from './auth.js';
import { withTransaction } from '../db/index.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import { CharacterStats } from '@koa/shared';
import { requireDeveloper } from '../middleware/auth.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import { getEquipmentCombatStats } from '../game/combatStats.js';

// Validation constants
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 20;
const NAME_PATTERN = /^[a-zA-Z]+$/;

export function setupCharacterRoutes(app: Express): void {
  // GET /api/characters - List player's characters
  app.get('/api/characters', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    try {
      const characters = await characterRepo.findCharactersByPlayerId(payload.playerId);
      const sharedCharacters = await Promise.all(
        characters.map(characterRepo.toSharedCharacterWithDisplayNames)
      );
      res.json({
        success: true,
        characters: sharedCharacters,
      });
    } catch (error) {
      console.error('Failed to get characters:', error);
      res.status(500).json({ success: false, message: 'Failed to get characters' });
    }
  });

  // GET /api/characters/all - List all characters (developer tool for combat simulator)
  // Must be before /:id to avoid Express matching "all" as a character ID
  app.get('/api/characters/all', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const allChars = await characterRepo.findAllCharacters();
      const result = allChars.map(c => ({
        id: c.id,
        name: c.name,
        race: c.race,
        class: c.class,
        level: c.level,
        maxHealth: c.max_health,
        maxMana: c.max_mana,
        strength: c.strength,
        dexterity: c.dexterity,
        intelligence: c.intelligence,
        constitution: c.constitution,
        wisdom: c.wisdom,
        charisma: c.charisma,
      }));
      res.json({ success: true, characters: result });
    } catch (error) {
      console.error('Failed to list all characters:', error);
      res.status(500).json({ success: false, message: 'Failed to list characters' });
    }
  });

  // GET /api/characters/:id - Get specific character
  app.get('/api/characters/:id', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const characterId = Number(req.params.id);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid character ID' });
      return;
    }

    try {
      const character = await characterRepo.findCharacterById(characterId);
      if (!character) {
        res.status(404).json({ success: false, message: 'Character not found' });
        return;
      }

      // Ensure character belongs to this player
      if (character.player_id !== payload.playerId) {
        res.status(403).json({ success: false, message: 'Not your character' });
        return;
      }

      res.json({
        success: true,
        character: await characterRepo.toSharedCharacterWithDisplayNames(character),
      });
    } catch (error) {
      console.error('Failed to get character:', error);
      res.status(500).json({ success: false, message: 'Failed to get character' });
    }
  });

  // POST /api/characters - Create new character
  app.post('/api/characters', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const { name, lastName, raceId, classId, gender, hair, eyeColor } = req.body;

    // Validate name
    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, message: 'Character name is required' });
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length < MIN_NAME_LENGTH || trimmedName.length > MAX_NAME_LENGTH) {
      res.status(400).json({
        success: false,
        message: `Character name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters`,
      });
      return;
    }

    if (!NAME_PATTERN.test(trimmedName)) {
      res.status(400).json({
        success: false,
        message: 'Character name must contain only letters',
      });
      return;
    }

    // Validate lastName if provided
    if (lastName !== undefined && lastName !== null && lastName !== '') {
      if (typeof lastName !== 'string') {
        res.status(400).json({ success: false, message: 'Invalid last name' });
        return;
      }
      const trimmedLastName = lastName.trim();
      if (trimmedLastName.length > 50) {
        res.status(400).json({ success: false, message: 'Last name must be 50 characters or less' });
        return;
      }
      if (trimmedLastName.length > 0 && !/^[a-zA-Z][a-zA-Z'-]*$/.test(trimmedLastName)) {
        res.status(400).json({ success: false, message: 'Last name must start with a letter and contain only letters, hyphens, and apostrophes' });
        return;
      }
    }

    // Validate and trim gender if provided (case-insensitive)
    const validGenders = ['male', 'female'];
    let trimmedGender: string | undefined;
    if (gender !== undefined && gender !== null && gender !== '') {
      if (typeof gender !== 'string') {
        res.status(400).json({ success: false, message: 'Invalid gender selection' });
        return;
      }
      trimmedGender = gender.trim().toLowerCase();
      if (trimmedGender && !validGenders.includes(trimmedGender)) {
        res.status(400).json({ success: false, message: 'Invalid gender selection' });
        return;
      }
    }

    // Validate and trim hair if provided (max 100 chars per schema)
    let trimmedHair: string | undefined;
    if (hair !== undefined && hair !== null && hair !== '') {
      if (typeof hair !== 'string') {
        res.status(400).json({ success: false, message: 'Invalid hair selection' });
        return;
      }
      trimmedHair = hair.trim();
      if (trimmedHair.length > 100) {
        res.status(400).json({ success: false, message: 'Hair description must be 100 characters or less' });
        return;
      }
    }

    // Validate and trim eyeColor if provided (max 50 chars per schema)
    let trimmedEyeColor: string | undefined;
    if (eyeColor !== undefined && eyeColor !== null && eyeColor !== '') {
      if (typeof eyeColor !== 'string') {
        res.status(400).json({ success: false, message: 'Invalid eye color selection' });
        return;
      }
      trimmedEyeColor = eyeColor.trim();
      if (trimmedEyeColor.length > 50) {
        res.status(400).json({ success: false, message: 'Eye color description must be 50 characters or less' });
        return;
      }
    }

    // Validate raceId
    if (!raceId || typeof raceId !== 'string') {
      res.status(400).json({ success: false, message: 'Race selection is required' });
      return;
    }

    // Validate classId
    if (!classId || typeof classId !== 'string') {
      res.status(400).json({ success: false, message: 'Class selection is required' });
      return;
    }

    try {
      // Get race and class definitions first (outside transaction, read-only)
      const race = await progressionRepo.getRaceById(raceId);
      if (!race || !race.playable) {
        res.status(400).json({ success: false, message: 'Invalid or unavailable race' });
        return;
      }

      const classDef = await progressionRepo.getClassById(classId);
      if (!classDef || !classDef.playable) {
        res.status(400).json({ success: false, message: 'Invalid or unavailable class' });
        return;
      }

      // Check if race allows this class
      if (race.allowed_classes && race.allowed_classes.length > 0) {
        if (!race.allowed_classes.includes(classId)) {
          res.status(400).json({
            success: false,
            message: `${race.display_name} cannot be a ${classDef.display_name}`,
          });
          return;
        }
      }

      // Calculate starting stats from race base_stats (min values)
      // Characters start with racial base stats and 100 CP to allocate
      const raceBaseStats = race.base_stats;

      // Use new base_stats format if available, otherwise fall back to legacy
      const finalStats: CharacterStats = raceBaseStats && raceBaseStats.strength
        ? {
            strength: raceBaseStats.strength.min ?? 40,
            intelligence: raceBaseStats.intellect?.min ?? 40, // Note: mapped from intellect to intelligence
            dexterity: raceBaseStats.agility?.min ?? 40,      // Note: mapped from agility to dexterity
            constitution: raceBaseStats.constitution?.min ?? 40,
            wisdom: raceBaseStats.wisdom?.min ?? 40,
            charisma: raceBaseStats.charisma?.min ?? 40,
          }
        : {
            // Legacy fallback: use class base + race modifiers
            strength: 40,
            intelligence: 40,
            dexterity: 40,
            constitution: 40,
            wisdom: 40,
            charisma: 40,
          };

      // Get global settings outside transaction (read-only, no lock needed)
      const globalMaxChars = await settingsRepo.getMaxCharactersPerPlayer();

      // Create character atomically with all checks inside transaction to prevent race conditions
      const character = await withTransaction(async (client) => {
        // Check character limit inside transaction
        const playerMaxChars = await playerRepo.getMaxCharacters(payload.playerId, client);
        const maxCharacters = playerMaxChars ?? globalMaxChars;
        const currentCount = await characterRepo.getCharacterCount(payload.playerId, client);

        if (currentCount >= maxCharacters) {
          throw new Error(`CHARACTER_LIMIT:Character limit reached (${maxCharacters} maximum)`);
        }

        // Check if name is already taken inside transaction
        const nameExists = await characterRepo.characterNameExists(trimmedName, client);
        if (nameExists) {
          throw new Error('NAME_TAKEN:Character name is already taken');
        }

        const newCharacter = await characterRepo.createCharacter({
          playerId: payload.playerId,
          name: trimmedName,
          lastName: lastName?.trim() || undefined,
          race: raceId,
          characterClass: classId,
          stats: finalStats,
          gender: trimmedGender || 'male',
          hair: trimmedHair || undefined,
          eyeColor: trimmedEyeColor || undefined,
        }, client);

        await progressionRepo.createCharacterProgression(newCharacter.id, classId, client);

        return newCharacter;
      });

      res.json({
        success: true,
        character: await characterRepo.toSharedCharacterWithDisplayNames(character),
        showTrainingForm: true,  // New character should be shown the training form
      });
    } catch (error) {
      // Handle specific validation errors from transaction
      if (error instanceof Error) {
        if (error.message.startsWith('CHARACTER_LIMIT:')) {
          res.status(400).json({ success: false, message: error.message.substring(16) });
          return;
        }
        if (error.message.startsWith('NAME_TAKEN:')) {
          res.status(400).json({ success: false, message: error.message.substring(11) });
          return;
        }
      }
      console.error('Failed to create character:', error);
      res.status(500).json({ success: false, message: 'Failed to create character' });
    }
  });

  // DELETE /api/characters/:id - Delete a character
  app.delete('/api/characters/:id', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const characterId = Number(req.params.id);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid character ID' });
      return;
    }

    try {
      // Verify character exists and belongs to this player
      const character = await characterRepo.findCharacterById(characterId);
      if (!character) {
        res.status(404).json({ success: false, message: 'Character not found' });
        return;
      }

      if (character.player_id !== payload.playerId) {
        res.status(403).json({ success: false, message: 'Not your character' });
        return;
      }

      // Delete the character (cascade will handle character_progression)
      await characterRepo.deleteCharacter(characterId);

      res.json({ success: true, message: 'Character deleted' });
    } catch (error) {
      console.error('Failed to delete character:', error);
      res.status(500).json({ success: false, message: 'Failed to delete character' });
    }
  });

  // GET /api/characters/:id/combat-stats - Get character's calculated equipment combat stats (developer tool)
  app.get('/api/characters/:id/combat-stats', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid character ID' });
        return;
      }
      const equipStats = await getEquipmentCombatStats(id);
      res.json({
        success: true,
        weapon: equipStats.weapon,
        armor: equipStats.armor,
        modifiers: equipStats.modifiers,
      });
    } catch (error) {
      console.error('Failed to get combat stats:', error);
      res.status(500).json({ success: false, message: 'Failed to get combat stats' });
    }
  });
}
