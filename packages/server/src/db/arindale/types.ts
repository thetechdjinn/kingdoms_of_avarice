export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down'
  | 'northeast' | 'northwest' | 'southeast' | 'southwest';

export interface RoomDef {
  tag: string;
  name: string;
  description: string;
  area?: string;             // defaults to 'Arindale'
  terrain?: string;          // defaults to 'indoor'
  darkness_level?: number;   // 0 to -500, defaults to 0
  features?: Record<string, unknown>;
}

export interface ExitDef {
  fromTag: string;
  toTag: string;
  direction: Direction;
}

export interface DoorDef {
  name: string;
  doorType: 'physical' | 'open_passageway' | 'special' | 'triggered_passageway';
  entryTag: string;
  entryDirection: Direction;
  exitTag?: string;
  exitDirection?: Direction;
  defaultState: 'open' | 'closed' | 'locked';
  autoResetSeconds?: number;
  hasLock?: boolean;
  keyItemTag?: string;
  pickDifficultyMin?: number;
  pickDifficultyMax?: number;
  bashDifficulty?: number;
  denialMessage?: string;
  requiredItemTag?: string;
  triggerText?: string;
  isHidden?: boolean;
  passageMessageSelf?: string;
  passageMessageRoom?: string;
}

export interface DistrictData {
  rooms: RoomDef[];
  exits: ExitDef[];
  doors?: DoorDef[];
}
