// Shared types and constants for Kingdoms of Avarice

// Message types for WebSocket communication
export enum MessageType {
  // Client -> Server
  COMMAND = "command",

  // Server -> Client
  OUTPUT = "output",
  ERROR = "error",
  SYSTEM = "system",
  VITALS = "vitals",
  LOGOUT = "logout",
}

// WebSocket message structure
export interface GameMessage {
  type: MessageType;
  payload: string;
  timestamp?: number;
}

// Resource types for different character classes
export enum ResourceType {
  MANA = "MA",    // Mages, Clerics
  KAI = "KA",     // Monks (future)
  NONE = "NONE",  // Warriors, Rogues (no secondary resource)
}

// Vitals data sent to client for statline display
export interface VitalsData {
  hp: number;
  maxHp: number;
  resource?: number;      // Current mana/kai/etc
  maxResource?: number;   // Max mana/kai/etc
  resourceType: ResourceType;
}

// Generic resource regeneration configuration
export interface ResourceRegenConfig {
  resourceKey: string;           // Identifier (e.g., 'mana', 'health', 'stamina')
  tickIntervalMs: number;        // How often this resource ticks
  baseRegenPercent: number;      // Base % of max per tick
  enhancedRegenPercent: number;  // Enhanced % when resting/meditating
  regenInCombat: boolean;        // Whether base regen applies in combat
}

// Player's regeneration state (server-side only, not sent to client)
export interface PlayerRegenState {
  enhancedRegen: Set<string>;    // Which resources have enhanced regen active
  inCombat: boolean;
  isPoisoned: boolean;           // Blocks resting/enhanced regen
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

// Character stats (6 primary attributes)
export interface CharacterStats {
  strength: number;
  intelligence: number;
  dexterity: number;
  constitution: number;
  wisdom: number;
  charisma: number;
}

// Gender type for character appearance
export type Gender = 'male' | 'female' | 'neutral';

// Character data
export interface Character {
  id: number;
  name: string;
  lastName?: string;
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
  // Appearance fields
  gender?: Gender;
  hair?: string;
  eyeColor?: string;
}

// Auth response
export interface AuthResponse {
  success: boolean;
  message?: string;
  playerId?: number;
}

// Available races
export const RACES = ["Human", "Elf", "Dwarf", "Halfling", "Orc", "Gnome"] as const;
export type Race = (typeof RACES)[number];

// Available classes
export const CLASSES = [
  "Warrior",
  "Mage",
  "Rogue",
  "Cleric",
  "Ranger",
  "Paladin",
] as const;
export type CharacterClass = (typeof CLASSES)[number];

// Re-export roles
export * from "./roles.js";

// Re-export items
export * from "./items.js";

// Re-export progression system
export * from "./progression.js";

// Re-export combat system
export * from "./combat.js";

// Re-export spell system
export * from "./spells.js";

// Re-export status effects system
export * from "./statusEffects.js";

// Re-export character points system
export * from "./characterPoints.js";

// Re-export command queue system
export * from "./commandQueue.js";
