export interface RoomDef {
  tag: string;
  name: string;
  description: string;
  area?: string;       // defaults to 'Arindale'
  terrain?: string;    // defaults to 'indoor'
  features?: Record<string, unknown>;
}

export interface ExitDef {
  fromTag: string;
  toTag: string;
  direction: string;
}

export interface DoorDef {
  name: string;
  doorType: 'physical' | 'open_passageway' | 'special' | 'triggered_passageway';
  entryTag: string;
  entryDirection: string;
  exitTag: string;
  exitDirection: string;
  defaultState: 'open' | 'closed' | 'locked';
  autoResetSeconds?: number;
  hasLock?: boolean;
  keyItemTag?: string;
  pickDifficultyMin?: number;
  pickDifficultyMax?: number;
  bashDifficulty?: number;
  denialMessage?: string;
  requiredItemTag?: string;
}

export interface DistrictData {
  rooms: RoomDef[];
  exits: ExitDef[];
  doors?: DoorDef[];
}
