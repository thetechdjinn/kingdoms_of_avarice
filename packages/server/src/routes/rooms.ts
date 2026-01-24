import { Express, Request, Response } from 'express';
import * as roomRepo from '../db/repositories/roomRepository.js';
import { requireDeveloper } from '../middleware/auth.js';
import { getGameWorld } from '../game/socket.js';

export function setupRoomRoutes(app: Express): void {
  // Get all rooms (requires Developer role)
  app.get('/api/rooms', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const rooms = await roomRepo.getAllRoomsWithExits();
      const roomsData = rooms.map(room => ({
        id: room.id,
        name: room.name,
        description: room.description,
        area: room.area,
        terrain: room.terrain || 'indoor',
        features: room.features || {},
        exits: Object.fromEntries(room.exits),
      }));
      res.json({ success: true, rooms: roomsData });
    } catch (error) {
      console.error('Failed to get rooms:', error);
      res.status(500).json({ success: false, message: 'Failed to get rooms' });
    }
  });

  // Get single room (requires Developer role)
  app.get('/api/rooms/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid room ID' });
        return;
      }

      const room = await roomRepo.getRoomWithExits(id);
      if (!room) {
        res.status(404).json({ success: false, message: 'Room not found' });
        return;
      }

      res.json({
        success: true,
        room: {
          id: room.id,
          name: room.name,
          description: room.description,
          area: room.area,
          terrain: room.terrain || 'indoor',
          features: room.features || {},
          exits: Object.fromEntries(room.exits),
        },
      });
    } catch (error) {
      console.error('Failed to get room:', error);
      res.status(500).json({ success: false, message: 'Failed to get room' });
    }
  });

  // Create room (requires Developer role)
  app.post('/api/rooms', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const { name, description, area, terrain, features } = req.body;

      if (!name) {
        res.status(400).json({ success: false, message: 'Name is required' });
        return;
      }

      const room = await roomRepo.createRoom({ name, description, area, terrain, features });

      // Sync with in-memory GameWorld
      await getGameWorld().reloadRoom(room.id);

      res.json({
        success: true,
        room: {
          id: room.id,
          name: room.name,
          description: room.description,
          area: room.area,
          terrain: room.terrain || 'indoor',
          features: room.features || {},
          exits: {},
        },
      });
    } catch (error) {
      console.error('Failed to create room:', error);
      res.status(500).json({ success: false, message: 'Failed to create room' });
    }
  });

  // Update room (requires Developer role)
  app.put('/api/rooms/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid room ID' });
        return;
      }

      const { name, description, area, terrain, features } = req.body;
      const room = await roomRepo.updateRoom(id, { name, description, area, terrain, features });

      if (!room) {
        res.status(404).json({ success: false, message: 'Room not found' });
        return;
      }

      // Sync with in-memory GameWorld
      await getGameWorld().reloadRoom(id);

      const roomWithExits = await roomRepo.getRoomWithExits(id);
      res.json({
        success: true,
        room: {
          id: roomWithExits!.id,
          name: roomWithExits!.name,
          description: roomWithExits!.description,
          area: roomWithExits!.area,
          terrain: roomWithExits!.terrain || 'indoor',
          features: roomWithExits!.features || {},
          exits: Object.fromEntries(roomWithExits!.exits),
        },
      });
    } catch (error) {
      console.error('Failed to update room:', error);
      res.status(500).json({ success: false, message: 'Failed to update room' });
    }
  });

  // Delete room (requires Developer role)
  app.delete('/api/rooms/:id', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid room ID' });
        return;
      }

      if (id === 1) {
        res.status(400).json({ success: false, message: 'Cannot delete the starting room' });
        return;
      }

      const success = await roomRepo.deleteRoom(id);
      if (!success) {
        res.status(404).json({ success: false, message: 'Room not found' });
        return;
      }

      // Sync with in-memory GameWorld (removes deleted room from memory)
      await getGameWorld().reloadRoom(id);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete room:', error);
      res.status(500).json({ success: false, message: 'Failed to delete room' });
    }
  });

  // Create exit (requires Developer role)
  app.post('/api/rooms/:id/exits', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const fromRoomId = parseInt(req.params.id);
      if (isNaN(fromRoomId)) {
        res.status(400).json({ success: false, message: 'Invalid room ID' });
        return;
      }

      const { direction, toRoomId, bidirectional = true } = req.body;

      if (!direction || !toRoomId) {
        res.status(400).json({ success: false, message: 'Direction and toRoomId are required' });
        return;
      }

      const targetRoom = await roomRepo.getRoomById(toRoomId);
      if (!targetRoom) {
        res.status(400).json({ success: false, message: 'Target room does not exist' });
        return;
      }

      if (bidirectional) {
        await roomRepo.createBidirectionalExit(fromRoomId, toRoomId, direction);
      } else {
        await roomRepo.createExit({ fromRoomId, toRoomId, direction });
      }

      // Sync with in-memory GameWorld
      await getGameWorld().reloadRoom(fromRoomId);
      if (bidirectional) {
        await getGameWorld().reloadRoom(toRoomId);
      }

      const updatedRoom = await roomRepo.getRoomWithExits(fromRoomId);
      res.json({
        success: true,
        room: {
          id: updatedRoom!.id,
          name: updatedRoom!.name,
          description: updatedRoom!.description,
          area: updatedRoom!.area,
          terrain: updatedRoom!.terrain || 'indoor',
          features: updatedRoom!.features || {},
          exits: Object.fromEntries(updatedRoom!.exits),
        },
      });
    } catch (error) {
      console.error('Failed to create exit:', error);
      res.status(500).json({ success: false, message: 'Failed to create exit' });
    }
  });

  // Delete exit (requires Developer role)
  app.delete('/api/rooms/:id/exits/:direction', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const fromRoomId = parseInt(req.params.id);
      const direction = req.params.direction;
      const bidirectional = req.query.bidirectional !== 'false';

      if (isNaN(fromRoomId)) {
        res.status(400).json({ success: false, message: 'Invalid room ID' });
        return;
      }

      let success: boolean;
      if (bidirectional) {
        success = await roomRepo.deleteBidirectionalExit(fromRoomId, direction);
      } else {
        success = await roomRepo.deleteExit(fromRoomId, direction);
      }

      if (!success) {
        res.status(404).json({ success: false, message: 'Exit not found' });
        return;
      }

      // Sync with in-memory GameWorld (reload all for bidirectional to ensure both rooms are updated)
      await getGameWorld().reloadAllRooms();

      const updatedRoom = await roomRepo.getRoomWithExits(fromRoomId);
      res.json({
        success: true,
        room: updatedRoom ? {
          id: updatedRoom.id,
          name: updatedRoom.name,
          description: updatedRoom.description,
          area: updatedRoom.area,
          terrain: updatedRoom.terrain || 'indoor',
          features: updatedRoom.features || {},
          exits: Object.fromEntries(updatedRoom.exits),
        } : null,
      });
    } catch (error) {
      console.error('Failed to delete exit:', error);
      res.status(500).json({ success: false, message: 'Failed to delete exit' });
    }
  });

  // Get all areas (requires Developer role)
  app.get('/api/areas', requireDeveloper, async (_req: Request, res: Response) => {
    try {
      const rooms = await roomRepo.getAllRooms();
      const areas = [...new Set(rooms.map(r => r.area).filter(Boolean))];
      res.json({ success: true, areas });
    } catch (error) {
      console.error('Failed to get areas:', error);
      res.status(500).json({ success: false, message: 'Failed to get areas' });
    }
  });

  // Rename an area (requires Developer role)
  app.put('/api/areas/:name', requireDeveloper, async (req: Request, res: Response) => {
    try {
      const oldName = decodeURIComponent(req.params.name);
      const { newName } = req.body;

      if (!newName || !newName.trim()) {
        res.status(400).json({ success: false, message: 'New area name is required' });
        return;
      }

      const rooms = await roomRepo.getAllRooms();
      const roomsToUpdate = rooms.filter(r => r.area === oldName);

      if (roomsToUpdate.length === 0) {
        res.status(404).json({ success: false, message: 'Area not found' });
        return;
      }

      for (const room of roomsToUpdate) {
        await roomRepo.updateRoom(room.id, { area: newName.trim() });
      }

      // Sync with in-memory GameWorld
      await getGameWorld().reloadAllRooms();

      res.json({
        success: true,
        message: `Renamed area "${oldName}" to "${newName.trim()}" (${roomsToUpdate.length} rooms updated)`
      });
    } catch (error) {
      console.error('Failed to rename area:', error);
      res.status(500).json({ success: false, message: 'Failed to rename area' });
    }
  });
}
