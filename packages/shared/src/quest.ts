// Quest system types for Kingdoms of Avarice

export type QuestTriggerType = 'talk' | 'kill' | 'visit';
export type QuestStatus = 'active' | 'completed';

export interface QuestItemReward {
  itemTemplateId: number;
  quantity: number;
}

export interface QuestFactionReward {
  factionId: number;
  amount: number;
}

export interface QuestStep {
  id: number;
  questId: number;
  stepOrder: number;
  triggerType: QuestTriggerType;
  triggerNpcId: number | null;
  triggerItemTemplateId: number | null;
  triggerRoomId: number | null;
  triggerText: string | null;
  requiredCount: number;
  consumeItem: boolean;
  description: string;
  completionDialogue: string | null;
  inProgressDialogue: string | null;
  stepXpReward: number;
  stepEssenceReward: number;
  stepCurrencyReward: number;
  stepItemRewards: QuestItemReward[];
  stepFactionRewards: QuestFactionReward[];
}

export interface Quest {
  id: number;
  tag: string;
  name: string;
  description: string | null;
  questGiverNpcId: number | null;
  minLevel: number;
  maxLevel: number | null;
  requiredRaces: string[] | null;
  requiredClasses: string[] | null;
  requiredFactionId: number | null;
  requiredFactionMin: number | null;
  requiredFactionMax: number | null;
  requiredQuestIds: number[];
  requiredQuestTags: string[];
  xpReward: number;
  essenceReward: number;
  currencyReward: number;
  itemRewards: QuestItemReward[];
  factionRewards: QuestFactionReward[];
  questFlag: string | null;
  denialDialogue: string | null;
  completedDialogue: string | null;
  enabled: boolean;
  sortOrder: number;
  steps: QuestStep[];
}

export interface CharacterQuest {
  characterId: number;
  questId: number;
  status: QuestStatus;
  currentStep: number;
  startedAt: Date;
  completedAt: Date | null;
}

export interface CharacterQuestProgress {
  characterId: number;
  questStepId: number;
  currentCount: number;
}
