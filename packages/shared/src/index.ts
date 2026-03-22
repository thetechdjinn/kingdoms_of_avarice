// Shared types and constants for Kingdoms of Avarice

// Re-export door system types (needed before RoomData definition)
export * from "./doors.js";
import type { DoorData } from "./doors.js";

// Message types for WebSocket communication
export enum MessageType {
  // Client -> Server
  COMMAND = "command",
  TRAINING_SUBMIT = "training_submit",  // Submit training form data

  // Server -> Client
  OUTPUT = "output",
  ERROR = "error",
  SYSTEM = "system",
  VITALS = "vitals",
  LOGOUT = "logout",
  TRAINING_FORM = "training_form",  // Open training form with character data
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

// Player status for statline display
export type PlayerStatus = 'normal' | 'resting' | 'meditating' | 'dropped' | 'aided' | 'dead' | 'hidden' | 'sneaking';

// Stealth mode states
export type StealthMode = 'none' | 'sneaking' | 'hidden';

// Death state tracking for dropped/purgatory mechanics
export interface DeathState {
  isDropped: boolean;     // Player is at 0 HP, on the ground
  isAided: boolean;       // Player has been stabilized by another player
  isDead: boolean;        // Player has died and is in purgatory
  deathRoomId?: number;   // Room where player died (for item drops)
  droppedAt?: number;     // Timestamp when player dropped
}

// Vitals data sent to client for statline display
export interface VitalsData {
  hp: number;
  maxHp: number;
  resource?: number;      // Current mana/kai/etc
  maxResource?: number;   // Max mana/kai/etc
  resourceType: ResourceType;
  status?: PlayerStatus;  // Current player status (resting, meditating, etc.)
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
  doors: DoorData[];
}

// Room training configuration
export interface RoomTrainingConfig {
  enabled: boolean;
  allowedClasses?: string[] | null;  // null = all classes allowed
  minLevel?: number;                  // default 1
  maxLevel?: number;                  // default 999
}

// Room respawn configuration
export interface RoomRespawnConfig {
  enabled: boolean;
  priority?: number;  // Lower = higher priority (default: 0)
  servedAreas?: string[];  // Additional areas this respawn room serves (besides its own)
}

// Room bank configuration
export interface RoomBankConfig {
  enabled: boolean;
}

// Room features (extensible for future features like portals, quests, etc.)
export interface RoomFeatures {
  training?: RoomTrainingConfig;
  respawn?: RoomRespawnConfig;
  bank?: RoomBankConfig;
}

// Hair style options for character appearance
export const HAIR_STYLES = ['none', 'short', 'long', 'braided', 'ponytail', 'mohawk'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

// Hair color options
export const HAIR_COLORS = ['black', 'brown', 'blonde', 'red', 'white', 'gray', 'auburn'] as const;
export type HairColor = (typeof HAIR_COLORS)[number];

// Eye color options
export const EYE_COLORS = ['brown', 'blue', 'green', 'hazel', 'gray', 'amber', 'black'] as const;
export type EyeColor = (typeof EYE_COLORS)[number];

// Training form data sent from server to client
export interface TrainingFormPayload {
  characterName: string;
  familyName?: string;
  race: string;    // Display name, not Race type (may differ from internal ID)
  class: string;   // Display name, not CharacterClass type
  level: number;
  stats: Record<string, {
    current: number;
    min: number;
    max: number;
    spent: number;
  }>;
  unspentCp: number;
  appearance?: {
    gender?: Gender;
    hairStyle?: HairStyle;
    hairColor?: HairColor;
    eyeColor?: EyeColor;
  };
  isNewCharacter?: boolean;  // True if this is shown after character creation
}

// Training form submission data from client to server
export interface TrainingSubmitPayload {
  stats: Record<string, number>;     // New stat values
  cpSpent: Record<string, number>;   // CP spent per stat
  cancelled: boolean;                 // True if user cancelled without saving
  familyName?: string;               // Updated family name
  appearance?: {
    hairStyle?: HairStyle;
    hairColor?: HairColor;
    eyeColor?: EyeColor;
  };
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
export type Gender = 'male' | 'female';

// Currency data for characters
export interface Currency {
  copper: number;
  silver: number;
  gold: number;
  platinum: number;
  runic: number;
}

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
  currency: Currency;
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
import type { Spell } from "./spells.js";

// Re-export status effects system
export * from "./statusEffects.js";

// Re-export character points system
export * from "./characterPoints.js";

// Re-export command queue system
export * from "./commandQueue.js";

// NPC attack definition
export interface NpcAttack {
  id: number;
  npcId: number;
  attackType: string;
  name: string;
  minDamage: number;
  maxDamage: number;
  attacksPerRound: number;
  percentage: number;
  hitMessage: string | null;
  missMessage: string | null;
  hitVerb: string;
  hitVerb3p: string;
  missVerb: string;
  missVerb3p: string;
}

// NPC spell assignment (links NPC to a spell with AI casting parameters)
export interface NpcSpell {
  id: number;
  npcId: number;
  spellId: number;
  priority: number;
  castChance: number;
  conditionType: string;
  conditionValue: number;
  cooldownRounds: number;
  spell: Spell;
}

// NPC template (blueprint for NPCs)
export interface NpcTemplate {
  id: number;
  name: string;
  description: string | null;
  spawnRoomId: number | null;
  health: number;
  maxHealth: number;
  hostile: boolean;
  respawnTime: number | null;
  level: number;
  experienceReward: number;
  maxMana: number;
  baseAccuracy: number;
  baseDefense: number;
  baseCritChance: number;
  baseDodge: number;
  damageReduction: number;
  traits: string[];
  fleeEnabled: boolean;
  fleeHpPercent: number;
  callForHelpChance: number;
  maxActive: number;
  interactable: boolean;
  allowedAreas: string[];
  roamEnabled: boolean;
  roamInterval: number;
  roamChance: number;
  dropTableId: number | null;
  essenceReward: number;
  essenceClass: string | null;
  leaveCorpse: boolean;
  corpseDuration: number;
  augmentations: string[];
  enterRoomMessage: string | null;
  exitRoomMessage: string | null;
  spawnMessage: string | null;
  primaryFactionId: number | null;
  merchantEnabled: boolean;
  properName: boolean;
  spellPower: number;
  attacks: NpcAttack[];
  spells: NpcSpell[];
}

// Currency denomination types
export const CURRENCY_DENOMINATIONS = ['copper', 'silver', 'gold', 'platinum', 'runic'] as const;
export type CurrencyDenomination = (typeof CURRENCY_DENOMINATIONS)[number];

// Drop table (loot table definition)
export interface DropTable {
  id: number;
  name: string;
  description: string | null;
}

// Drop table entry (individual loot roll)
export interface DropTableEntry {
  id: number;
  dropTableId: number;
  itemTemplateId: number | null;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
  currencyMin: number;
  currencyMax: number;
  allowedDenominations: CurrencyDenomination[];
}

// Faction types
export enum FactionType {
  CITY = 'city',
  TRIBAL = 'tribal',
  MERCHANT = 'merchant',
  GUILD = 'guild',
}

// Faction definition
export interface Faction {
  id: number;
  name: string;
  description: string | null;
  factionType: FactionType;
}

// Player reputation with a faction
export interface PlayerFactionReputation {
  characterId: number;
  factionId: number;
  reputation: number;
}

// Merchant inventory entry (item stock for a merchant NPC)
export interface MerchantInventoryEntry {
  id: number;
  npcTemplateId: number;
  itemTemplateId: number;
  maxStock: number;
  currentStock: number;
  restockChance: number; // 1-100 percentage
}

export interface MerchantResponse {
  id: number;
  npcTemplateId: number;
  triggerKeywords: string[];
  response: string;
}

// Re-export quest system
export * from "./quest.js";

// Action (social emote) data
export interface Action {
  id: number;
  command: string;
  description: string | null;
  firstPersonNoTarget: string;
  roomNoTarget: string;
  firstPersonWithTarget: string | null;
  targetPerspective: string | null;
  roomWithTarget: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
