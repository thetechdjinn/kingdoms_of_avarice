// Shared types and constants for Kingdoms of Avarice

// Message types for WebSocket communication
export enum MessageType {
  // Client -> Server
  COMMAND = "command",

  // Server -> Client
  OUTPUT = "output",
  ERROR = "error",
  SYSTEM = "system",
}

// WebSocket message structure
export interface GameMessage {
  type: MessageType;
  payload: string;
  timestamp?: number;
}

// Player state shared between client and server
export interface PlayerState {
  id: number;
  characterId: number;
  characterName: string;
  currentRoomId: number;
}

// Room data sent to client
export interface RoomData {
  id: number;
  name: string;
  description: string;
  exits: string[];
  players: string[];
  npcs: string[];
  items: string[];
}

// Character stats
export interface CharacterStats {
  strength: number;
  intelligence: number;
  dexterity: number;
  constitution: number;
}

// Character data
export interface Character {
  id: number;
  name: string;
  race: string;
  class: string;
  level: number;
  experience: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stats: CharacterStats;
  gold: number;
}

// Auth response
export interface AuthResponse {
  success: boolean;
  message?: string;
  playerId?: number;
}

// Available races
export const RACES = ["Human", "Elf", "Dwarf", "Halfling", "Gnome"] as const;
export type Race = (typeof RACES)[number];

// Available classes
export const CLASSES = [
  "Warrior",
  "Mage",
  "Rogue",
  "Cleric",
  "Ranger",
] as const;
export type CharacterClass = (typeof CLASSES)[number];

// Re-export roles
export * from "./roles.js";
