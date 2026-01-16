import { Express, Request, Response } from 'express';
import { verifyToken, COOKIE_NAME } from './auth.js';
import { withTransaction } from '../db/index.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as progressionRepo from '../db/repositories/progressionRepository.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import * as spellRepo from '../db/repositories/spellRepository.js';
import { CharacterStats } from '@koa/shared';

// Validation constants
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 20;
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9 ]*$/;

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

    const { name, raceId, classId } = req.body;

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
        message: 'Character name must start with a letter and contain only letters, numbers, and spaces',
      });
      return;
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

      // Calculate final stats: class base + race modifiers
      const baseStats = classDef.base_stats || {};
      const raceModifiers = race.stat_modifiers || {};

      const finalStats: CharacterStats = {
        strength: (baseStats.strength ?? 10) + (raceModifiers.strength ?? 0),
        intelligence: (baseStats.intelligence ?? 10) + (raceModifiers.intelligence ?? 0),
        dexterity: (baseStats.dexterity ?? 10) + (raceModifiers.dexterity ?? 0),
        constitution: (baseStats.constitution ?? 10) + (raceModifiers.constitution ?? 0),
        wisdom: (baseStats.wisdom ?? 10) + (raceModifiers.wisdom ?? 0),
        charisma: (baseStats.charisma ?? 10) + (raceModifiers.charisma ?? 0),
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
          race: raceId,
          characterClass: classId,
          stats: finalStats,
        }, client);

        await progressionRepo.createCharacterProgression(newCharacter.id, classId, client);

        return newCharacter;
      });

      // Grant level 1 starter spells for the character's class (outside transaction)
      try {
        const starterSpells = await spellRepo.getAvailableSpells(
          character.id,
          classDef.display_name,
          1 // Level 1 spells only
        );
        for (const spell of starterSpells) {
          if (spell.levelRequired === 1) {
            await spellRepo.learnSpell(character.id, spell.id);
          }
        }
      } catch (spellError) {
        // Log but don't fail character creation if spell granting fails
        console.error('Failed to grant starter spells:', spellError);
      }

      res.json({
        success: true,
        character: await characterRepo.toSharedCharacterWithDisplayNames(character),
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
}
