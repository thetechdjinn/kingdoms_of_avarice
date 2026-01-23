import { Express, Request, Response } from 'express';
import * as doorRepo from '../db/repositories/doorRepository.js';
import * as roomRepo from '../db/repositories/roomRepository.js';
import * as doorStateManager from '../services/doorStateManager.js';
import { requireDeveloper } from '../middleware/auth.js';
import { DoorType, DoorState } from '@koa/shared';

const VALID_DOOR_TYPES = Object.values(DoorType);
const VALID_DOOR_STATES = Object.values(DoorState);
const VALID_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest'];

export function setupDoorRoutes(app: Express): void {
  // Get all doors (requires Developer role)
  app.get('/api/doors', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const doors = await doorRepo.getAllDoors();
      res.json({ success: true, doors });
    } catch (error) {
      console.error('Failed to get doors:', error);
      res.status(500).json({ success: false, message: 'Failed to get doors' });
    }
  });

  // Get single door (requires Developer role)
  app.get('/api/doors/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid door ID' });
        return;
      }

      const door = await doorRepo.getDoorById(id);
      if (!door) {
        res.status(404).json({ success: false, message: 'Door not found' });
        return;
      }

      res.json({ success: true, door });
    } catch (error) {
      console.error('Failed to get door:', error);
      res.status(500).json({ success: false, message: 'Failed to get door' });
    }
  });

  // Create door (requires Developer role)
  app.post('/api/doors', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const {
        name,
        doorType,
        description,
        entryRoomId,
        entryDirection,
        exitRoomId,
        exitDirection,
        defaultState,
        autoCloseSeconds,
        hasLock,
        keyItemTag,
        autoLockSeconds,
        pickDifficulty,
        bashDifficulty,
        isHidden,
        triggerText,
        passageMessageSelf,
        passageMessageRoom,
        itemDisplayName,
        isTemporary,
        spawnTriggerText,
        durationSeconds,
        appearMessage,
        disappearMessage,
        requiredLevel,
        requiredClasses,
        requiredQuestFlag,
        requiredItemTag,
        denialMessage,
      } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ success: false, message: 'Name is required' });
        return;
      }

      if (!doorType || !VALID_DOOR_TYPES.includes(doorType)) {
        res.status(400).json({ success: false, message: 'Invalid door type' });
        return;
      }

      if (!entryRoomId || typeof entryRoomId !== 'number') {
        res.status(400).json({ success: false, message: 'Entry room ID is required' });
        return;
      }

      if (!entryDirection || !VALID_DIRECTIONS.includes(entryDirection.toLowerCase())) {
        res.status(400).json({ success: false, message: 'Invalid entry direction' });
        return;
      }

      // Validate entry room exists
      const entryRoom = await roomRepo.getRoomById(entryRoomId);
      if (!entryRoom) {
        res.status(400).json({ success: false, message: 'Entry room does not exist' });
        return;
      }

      // Validate exit room if provided
      if (exitRoomId !== undefined && exitRoomId !== null) {
        const exitRoom = await roomRepo.getRoomById(exitRoomId);
        if (!exitRoom) {
          res.status(400).json({ success: false, message: 'Exit room does not exist' });
          return;
        }

        if (exitDirection && !VALID_DIRECTIONS.includes(exitDirection.toLowerCase())) {
          res.status(400).json({ success: false, message: 'Invalid exit direction' });
          return;
        }
      }

      // Validate default state if provided
      if (defaultState && !VALID_DOOR_STATES.includes(defaultState)) {
        res.status(400).json({ success: false, message: 'Invalid default state' });
        return;
      }

      // Validate numeric fields
      if (autoCloseSeconds !== undefined && autoCloseSeconds !== null && (typeof autoCloseSeconds !== 'number' || autoCloseSeconds <= 0)) {
        res.status(400).json({ success: false, message: 'Auto close seconds must be a positive number' });
        return;
      }

      if (autoLockSeconds !== undefined && autoLockSeconds !== null && (typeof autoLockSeconds !== 'number' || autoLockSeconds <= 0)) {
        res.status(400).json({ success: false, message: 'Auto lock seconds must be a positive number' });
        return;
      }

      if (pickDifficulty !== undefined && (typeof pickDifficulty !== 'number' || pickDifficulty < 0)) {
        res.status(400).json({ success: false, message: 'Pick difficulty must be a non-negative number' });
        return;
      }

      if (bashDifficulty !== undefined && (typeof bashDifficulty !== 'number' || bashDifficulty < 0)) {
        res.status(400).json({ success: false, message: 'Bash difficulty must be a non-negative number' });
        return;
      }

      if (durationSeconds !== undefined && durationSeconds !== null && (typeof durationSeconds !== 'number' || durationSeconds <= 0)) {
        res.status(400).json({ success: false, message: 'Duration seconds must be a positive number' });
        return;
      }

      if (requiredLevel !== undefined && requiredLevel !== null && (typeof requiredLevel !== 'number' || requiredLevel < 0)) {
        res.status(400).json({ success: false, message: 'Required level must be a non-negative number' });
        return;
      }

      if (requiredClasses !== undefined && requiredClasses !== null && !Array.isArray(requiredClasses)) {
        res.status(400).json({ success: false, message: 'Required classes must be an array' });
        return;
      }

      const door = await doorRepo.createDoor({
        name: name.trim(),
        doorType,
        description: description || null,
        entryRoomId,
        entryDirection: entryDirection.toLowerCase(),
        exitRoomId: exitRoomId || undefined,
        exitDirection: exitDirection?.toLowerCase() || undefined,
        defaultState: defaultState || DoorState.CLOSED,
        autoCloseSeconds,
        hasLock: hasLock || false,
        keyItemTag: keyItemTag || undefined,
        autoLockSeconds: autoLockSeconds ?? null,
        pickDifficulty: pickDifficulty ?? 0,
        bashDifficulty: bashDifficulty ?? 0,
        isHidden: isHidden || false,
        triggerText: triggerText || undefined,
        passageMessageSelf: passageMessageSelf || undefined,
        passageMessageRoom: passageMessageRoom || undefined,
        itemDisplayName: itemDisplayName || undefined,
        isTemporary: isTemporary || false,
        spawnTriggerText: spawnTriggerText || undefined,
        durationSeconds: durationSeconds ?? null,
        appearMessage: appearMessage || undefined,
        disappearMessage: disappearMessage || undefined,
        requiredLevel: requiredLevel ?? null,
        requiredClasses: requiredClasses || null,
        requiredQuestFlag: requiredQuestFlag || null,
        requiredItemTag: requiredItemTag || null,
        denialMessage: denialMessage || null,
      });

      // Reload door into in-memory state manager
      await doorStateManager.reloadDoor(door.id);

      res.json({ success: true, door });
    } catch (error) {
      console.error('Failed to create door:', error);
      // Check for unique constraint violation
      if (error instanceof Error && error.message.includes('duplicate key') && error.message.includes('entry_room_id')) {
        res.status(400).json({ success: false, message: 'A door already exists in that direction for the entry room' });
        return;
      }
      res.status(500).json({ success: false, message: 'Failed to create door' });
    }
  });

  // Update door (requires Developer role)
  app.put('/api/doors/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid door ID' });
        return;
      }

      const existingDoor = await doorRepo.getDoorById(id);
      if (!existingDoor) {
        res.status(404).json({ success: false, message: 'Door not found' });
        return;
      }

      const {
        name,
        doorType,
        description,
        entryRoomId,
        entryDirection,
        exitRoomId,
        exitDirection,
        defaultState,
        autoCloseSeconds,
        hasLock,
        keyItemTag,
        autoLockSeconds,
        pickDifficulty,
        bashDifficulty,
        isHidden,
        triggerText,
        passageMessageSelf,
        passageMessageRoom,
        itemDisplayName,
        isTemporary,
        spawnTriggerText,
        durationSeconds,
        appearMessage,
        disappearMessage,
        requiredLevel,
        requiredClasses,
        requiredQuestFlag,
        requiredItemTag,
        denialMessage,
      } = req.body;

      // Validate fields if provided
      if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) {
        res.status(400).json({ success: false, message: 'Name cannot be empty' });
        return;
      }

      if (doorType !== undefined && !VALID_DOOR_TYPES.includes(doorType)) {
        res.status(400).json({ success: false, message: 'Invalid door type' });
        return;
      }

      if (entryRoomId !== undefined) {
        if (typeof entryRoomId !== 'number') {
          res.status(400).json({ success: false, message: 'Entry room ID must be a number' });
          return;
        }
        const entryRoom = await roomRepo.getRoomById(entryRoomId);
        if (!entryRoom) {
          res.status(400).json({ success: false, message: 'Entry room does not exist' });
          return;
        }
      }

      if (entryDirection !== undefined && !VALID_DIRECTIONS.includes(entryDirection.toLowerCase())) {
        res.status(400).json({ success: false, message: 'Invalid entry direction' });
        return;
      }

      if (exitRoomId !== undefined && exitRoomId !== null) {
        if (typeof exitRoomId !== 'number') {
          res.status(400).json({ success: false, message: 'Exit room ID must be a number' });
          return;
        }
        const exitRoom = await roomRepo.getRoomById(exitRoomId);
        if (!exitRoom) {
          res.status(400).json({ success: false, message: 'Exit room does not exist' });
          return;
        }
      }

      if (exitDirection !== undefined && exitDirection !== null && !VALID_DIRECTIONS.includes(exitDirection.toLowerCase())) {
        res.status(400).json({ success: false, message: 'Invalid exit direction' });
        return;
      }

      if (defaultState !== undefined && defaultState !== null && !VALID_DOOR_STATES.includes(defaultState)) {
        res.status(400).json({ success: false, message: 'Invalid default state' });
        return;
      }

      // Validate numeric fields
      if (autoCloseSeconds !== undefined && autoCloseSeconds !== null && (typeof autoCloseSeconds !== 'number' || autoCloseSeconds <= 0)) {
        res.status(400).json({ success: false, message: 'Auto close seconds must be a positive number' });
        return;
      }

      if (autoLockSeconds !== undefined && autoLockSeconds !== null && (typeof autoLockSeconds !== 'number' || autoLockSeconds <= 0)) {
        res.status(400).json({ success: false, message: 'Auto lock seconds must be a positive number' });
        return;
      }

      if (pickDifficulty !== undefined && (typeof pickDifficulty !== 'number' || pickDifficulty < 0)) {
        res.status(400).json({ success: false, message: 'Pick difficulty must be a non-negative number' });
        return;
      }

      if (bashDifficulty !== undefined && (typeof bashDifficulty !== 'number' || bashDifficulty < 0)) {
        res.status(400).json({ success: false, message: 'Bash difficulty must be a non-negative number' });
        return;
      }

      if (durationSeconds !== undefined && durationSeconds !== null && (typeof durationSeconds !== 'number' || durationSeconds <= 0)) {
        res.status(400).json({ success: false, message: 'Duration seconds must be a positive number' });
        return;
      }

      if (requiredLevel !== undefined && requiredLevel !== null && (typeof requiredLevel !== 'number' || requiredLevel < 0)) {
        res.status(400).json({ success: false, message: 'Required level must be a non-negative number' });
        return;
      }

      if (requiredClasses !== undefined && requiredClasses !== null && !Array.isArray(requiredClasses)) {
        res.status(400).json({ success: false, message: 'Required classes must be an array' });
        return;
      }

      // Build updates object
      const updates: Parameters<typeof doorRepo.updateDoor>[1] = {};

      if (name !== undefined) updates.name = name.trim();
      if (doorType !== undefined) updates.doorType = doorType;
      if (description !== undefined) updates.description = description || null;
      if (entryRoomId !== undefined) updates.entryRoomId = entryRoomId;
      if (entryDirection !== undefined) updates.entryDirection = entryDirection.toLowerCase();
      if (exitRoomId !== undefined) updates.exitRoomId = exitRoomId;
      if (exitDirection !== undefined) updates.exitDirection = exitDirection?.toLowerCase() ?? null;
      if (defaultState !== undefined) updates.defaultState = defaultState;
      if (autoCloseSeconds !== undefined) updates.autoCloseSeconds = autoCloseSeconds;
      if (hasLock !== undefined) updates.hasLock = hasLock;
      if (keyItemTag !== undefined) updates.keyItemTag = keyItemTag || undefined;
      if (autoLockSeconds !== undefined) updates.autoLockSeconds = autoLockSeconds;
      if (pickDifficulty !== undefined) updates.pickDifficulty = pickDifficulty;
      if (bashDifficulty !== undefined) updates.bashDifficulty = bashDifficulty;
      if (isHidden !== undefined) updates.isHidden = isHidden;
      if (triggerText !== undefined) updates.triggerText = triggerText || undefined;
      if (passageMessageSelf !== undefined) updates.passageMessageSelf = passageMessageSelf || undefined;
      if (passageMessageRoom !== undefined) updates.passageMessageRoom = passageMessageRoom || undefined;
      if (itemDisplayName !== undefined) updates.itemDisplayName = itemDisplayName || undefined;
      if (isTemporary !== undefined) updates.isTemporary = isTemporary;
      if (spawnTriggerText !== undefined) updates.spawnTriggerText = spawnTriggerText || undefined;
      if (durationSeconds !== undefined) updates.durationSeconds = durationSeconds;
      if (appearMessage !== undefined) updates.appearMessage = appearMessage || undefined;
      if (disappearMessage !== undefined) updates.disappearMessage = disappearMessage || undefined;
      if (requiredLevel !== undefined) updates.requiredLevel = requiredLevel;
      if (requiredClasses !== undefined) updates.requiredClasses = requiredClasses;
      if (requiredQuestFlag !== undefined) updates.requiredQuestFlag = requiredQuestFlag || null;
      if (requiredItemTag !== undefined) updates.requiredItemTag = requiredItemTag || null;
      if (denialMessage !== undefined) updates.denialMessage = denialMessage || null;

      const door = await doorRepo.updateDoor(id, updates);

      // Reload door into in-memory state manager
      await doorStateManager.reloadDoor(id);

      res.json({ success: true, door });
    } catch (error) {
      console.error('Failed to update door:', error);
      // Check for unique constraint violation
      if (error instanceof Error && error.message.includes('duplicate key') && error.message.includes('entry_room_id')) {
        res.status(400).json({ success: false, message: 'A door already exists in that direction for the entry room' });
        return;
      }
      res.status(500).json({ success: false, message: 'Failed to update door' });
    }
  });

  // Delete door (requires Developer role)
  app.delete('/api/doors/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid door ID' });
        return;
      }

      const success = await doorRepo.deleteDoor(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Door not found' });
        return;
      }

      // Remove door from in-memory state manager
      await doorStateManager.reloadDoor(id);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete door:', error);
      res.status(500).json({ success: false, message: 'Failed to delete door' });
    }
  });
}
