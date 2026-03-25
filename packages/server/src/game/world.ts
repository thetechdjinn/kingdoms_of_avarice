import { RoomData, DoorData, DoorType, DoorState } from '@koa/shared';
import { colors } from '../utils/colors.js';
import * as roomRepo from '../db/repositories/roomRepository.js';
import * as doorStateManager from '../services/doorStateManager.js';

export interface Room {
  id: number;
  name: string;
  description: string;
  area: string;
  terrain: string;
  darkness_level: number;
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
        terrain: dbRoom.terrain || 'indoor',
        darkness_level: dbRoom.darkness_level ?? 0,
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
      terrain: dbRoom.terrain || 'indoor',
      darkness_level: dbRoom.darkness_level ?? 0,
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
      terrain: dbRoom.terrain || 'indoor',
      darkness_level: dbRoom.darkness_level ?? 0,
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
          terrain: dbRoom.terrain || 'indoor',
          darkness_level: dbRoom.darkness_level ?? 0,
          exits: dbRoom.exits,
        });
      }
    }

    return success;
  }

  getRoom(id: number): Room | undefined {
    return this.rooms.get(id);
  }

  getRoomExits(roomId: number): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.exits.keys());
  }

  getRoomInDirection(fromRoomId: number, direction: string): Room | undefined {
    const room = this.rooms.get(fromRoomId);
    if (!room) return undefined;

    const targetId = room.exits.get(direction.toLowerCase());
    if (!targetId) return undefined;

    return this.rooms.get(targetId);
  }

  formatRoomDescription(room: Room, otherPlayers: string[] = [], briefMode: boolean = false, itemDescriptions: string | null = null, preColoredEntities: string[] = [], darknessTag: string = ''): string {
    // Get doors in this room
    const doors = doorStateManager.getDoorsInRoom(room.id);
    const doorsByDirection = new Map<string, { door: typeof doors[0]; state: DoorState | null }>();

    for (const door of doors) {
      const direction = doorStateManager.getDoorDirection(door, room.id);
      if (direction) {
        doorsByDirection.set(direction, {
          door,
          state: doorStateManager.getDoorState(door.id),
        });
      }
    }

    // Format exits with door states
    const exits = Array.from(room.exits.keys());
    const formattedExits: string[] = [];

    for (const exit of exits) {
      const doorInfo = doorsByDirection.get(exit);

      if (doorInfo) {
        // This exit has a door
        const { door, state } = doorInfo;

        // Skip hidden doors (they don't appear on obvious exits)
        if (door.isHidden) {
          continue;
        }

        // For physical doors, show the state (but hide "locked" - show as "closed")
        if (door.doorType === DoorType.PHYSICAL && state) {
          const displayState = state === DoorState.LOCKED ? DoorState.CLOSED : state;
          formattedExits.push(`${exit} (${displayState})`);
        } else if (door.doorType === DoorType.OPEN_PASSAGEWAY) {
          // Open passageways show as normal exits
          formattedExits.push(exit);
        }
        // All other door types don't show on obvious exits:
        // - SPECIAL/TEMPORARY_PORTAL: appear on "Also here:" line instead
        // - TRIGGERED_PASSAGEWAY: completely hidden, only accessible via trigger text
      } else {
        // No door - just show the direction
        formattedExits.push(exit);
      }
    }

    const exitStr = formattedExits.length > 0 ? formattedExits.join(', ') : 'none';

    const nameWithTag = darknessTag ? `${room.name} ${darknessTag}` : room.name;
    let output = `${colors.roomName(nameWithTag)}\r\n`;

    // Only show description if not in brief mode
    if (!briefMode) {
      const wrappedDesc = this.wordWrap(room.description, 80);
      output += `${colors.roomDesc(wrappedDesc)}\r\n`;
    }

    // Show items on the ground
    if (itemDescriptions) {
      output += `${itemDescriptions}\r\n`;
    }

    // Build "Also here:" line content
    // IMPORTANT: Special doors are added FIRST, before players, to ensure consistent display order
    const alsoHereItems: string[] = [];

    // Add special doors that appear as items (only if not hidden)
    // These are added first so they always appear before player names
    for (const door of doors) {
      if (door.doorType === DoorType.SPECIAL && door.itemDisplayName && !door.isHidden) {
        alsoHereItems.push(colors.cyan(door.itemDisplayName));
      } else if (door.doorType === DoorType.TEMPORARY_PORTAL && door.itemDisplayName && !door.isHidden) {
        // Temporary portals only show if they're active (spawned and not expired)
        if (!door.isTemporary || doorStateManager.isPortalActive(door.id)) {
          alsoHereItems.push(colors.cyan(door.itemDisplayName));
        }
      }
    }

    // Add other players (colored as playerInRoom)
    for (const name of otherPlayers) {
      alsoHereItems.push(colors.playerInRoom(name));
    }

    // Add pre-colored entities (NPCs, etc.) — already styled by caller
    for (const name of preColoredEntities) {
      alsoHereItems.push(name);
    }

    // Show "Also here:" line if there's anything to show
    if (alsoHereItems.length > 0) {
      output += `${colors.alsoHereLabel('Also here:')} ${alsoHereItems.join(', ')}\r\n`;
    }

    output += `${colors.exitLabel('Obvious exits:')} ${colors.exits(exitStr)}`;

    return output;
  }

  private wordWrap(text: string, maxWidth: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines.join('\r\n');
  }

  getRoomData(room: Room): RoomData {
    // Get doors for this room with current states
    const doorsData: DoorData[] = doorStateManager.getDoorsDataForRoom(room.id);

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      darkness_level: room.darkness_level,
      exits: Array.from(room.exits.keys()),
      players: [],
      npcs: [],
      items: [],
      doors: doorsData,
    };
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}
