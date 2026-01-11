import { RoomData } from '@koa/shared';
import { colors } from '../utils/colors.js';
import * as roomRepo from '../db/repositories/roomRepository.js';

export interface Room {
  id: number;
  name: string;
  description: string;
  area: string;
  exits: Map<string, number>;
}

export class GameWorld {
  private rooms: Map<number, Room> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadRoomsFromDatabase();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to load rooms from database:', error);
      throw error;
    }
  }

  private async loadRoomsFromDatabase(): Promise<number> {
    const dbRooms = await roomRepo.getAllRoomsWithExits();
    
    this.rooms.clear();
    for (const dbRoom of dbRooms) {
      this.rooms.set(dbRoom.id, {
        id: dbRoom.id,
        name: dbRoom.name,
        description: dbRoom.description || '',
        area: dbRoom.area || 'Unknown',
        exits: dbRoom.exits,
      });
    }

    console.log(`Loaded ${this.rooms.size} rooms from database`);
    return this.rooms.size;
  }

  async reloadAllRooms(): Promise<number> {
    return this.loadRoomsFromDatabase();
  }

  async reloadRoom(roomId: number): Promise<Room | null> {
    const dbRoom = await roomRepo.getRoomWithExits(roomId);
    if (!dbRoom) {
      this.rooms.delete(roomId);
      return null;
    }

    const room: Room = {
      id: dbRoom.id,
      name: dbRoom.name,
      description: dbRoom.description || '',
      area: dbRoom.area || 'Unknown',
      exits: dbRoom.exits,
    };

    this.rooms.set(roomId, room);
    return room;
  }

  async createRoom(name: string, description: string, area: string): Promise<Room> {
    const dbRoom = await roomRepo.createRoom({ name, description, area });
    
    const room: Room = {
      id: dbRoom.id,
      name: dbRoom.name,
      description: dbRoom.description || '',
      area: dbRoom.area || 'Unknown',
      exits: new Map(),
    };

    this.rooms.set(room.id, room);
    return room;
  }

  async updateRoom(roomId: number, updates: { name?: string; description?: string; area?: string }): Promise<Room | null> {
    await roomRepo.updateRoom(roomId, updates);
    return this.reloadRoom(roomId);
  }

  async deleteRoom(roomId: number): Promise<boolean> {
    const success = await roomRepo.deleteRoom(roomId);
    if (success) {
      this.rooms.delete(roomId);
    }
    return success;
  }

  async linkRooms(fromRoomId: number, toRoomId: number, direction: string, bidirectional = true): Promise<void> {
    if (bidirectional) {
      await roomRepo.createBidirectionalExit(fromRoomId, toRoomId, direction);
    } else {
      await roomRepo.createExit({ fromRoomId, toRoomId, direction });
    }
    
    // Reload both rooms to update their exits
    await this.reloadRoom(fromRoomId);
    if (bidirectional) {
      await this.reloadRoom(toRoomId);
    }
  }

  async unlinkRooms(fromRoomId: number, direction: string, bidirectional = true): Promise<boolean> {
    let success: boolean;
    if (bidirectional) {
      success = await roomRepo.deleteBidirectionalExit(fromRoomId, direction);
    } else {
      success = await roomRepo.deleteExit(fromRoomId, direction);
    }

    if (success) {
      await this.reloadRoom(fromRoomId);
      // For bidirectional, we need to reload the target room too
      // but we don't know which one it was after deletion
      // So reload all rooms that might be affected
      const allRooms = await roomRepo.getAllRoomsWithExits();
      for (const dbRoom of allRooms) {
        this.rooms.set(dbRoom.id, {
          id: dbRoom.id,
          name: dbRoom.name,
          description: dbRoom.description || '',
          area: dbRoom.area || 'Unknown',
          exits: dbRoom.exits,
        });
      }
    }

    return success;
  }

  getRoom(id: number): Room | undefined {
    return this.rooms.get(id);
  }

  getRoomInDirection(fromRoomId: number, direction: string): Room | undefined {
    const room = this.rooms.get(fromRoomId);
    if (!room) return undefined;

    const targetId = room.exits.get(direction.toLowerCase());
    if (!targetId) return undefined;

    return this.rooms.get(targetId);
  }

  formatRoomDescription(room: Room): string {
    const exits = Array.from(room.exits.keys());
    const exitStr = exits.length > 0 ? exits.join(', ') : 'none';

    return `${colors.roomName(room.name)}\r\n` +
           `${colors.roomDesc(room.description)}\r\n` +
           `${colors.exitLabel('Exits:')} ${colors.exits(exitStr)}`;
  }

  getRoomData(room: Room): RoomData {
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      exits: Array.from(room.exits.keys()),
      players: [],
      npcs: [],
      items: [],
    };
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}
