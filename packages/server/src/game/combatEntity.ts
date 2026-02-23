/**
 * CombatEntity Interface
 *
 * Defines the combat-relevant subset of properties that both players (AuthenticatedSocket)
 * and NPCs can provide. This allows the combat system to operate on either entity type
 * without knowing the underlying implementation.
 *
 * Pattern follows RegenCapableSocket in regeneration.ts — a minimal interface that
 * AuthenticatedSocket satisfies via TypeScript structural typing.
 */

import { VitalsData, PlayerRegenState, ActiveStatusEffect, DeathState, StealthMode } from '@koa/shared';
import type { CharacterStats, CombatActionType, SpellCastingState } from '@koa/shared';
import { getPlayerLocation } from './adminCommands.js';

/**
 * Combat state tracked per-entity in memory.
 * Defined here so both players and NPCs can share the same structure.
 */
export interface CombatState {
  targets: Set<number>;    // entityIds this entity is attacking
  energy: number;          // Current energy pool for this round
  carriedEnergy: number;   // Leftover energy from last round
  combatAction: CombatActionType;  // 'melee' or 'spell'
  activeSpell: SpellCastingState | null;  // If casting, the spell being cast
}

/**
 * The combat-relevant interface that both AuthenticatedSocket (players)
 * and NPC instances will satisfy.
 */
export interface CombatEntity {
  entityId: number;          // playerId for players, npcInstanceId for NPCs
  entityName: string;        // Display name in combat messages
  entityType: 'player' | 'npc';
  characterId?: number;      // DB character ID (players only)

  vitals: VitalsData;
  combatState: CombatState;
  characterLevel: number;
  characterStats: CharacterStats;
  combatLevel: number;
  activeEffects: Map<string, ActiveStatusEffect>;
  deathState: DeathState | null;
  regenState: PlayerRegenState;
  stealthMode: StealthMode;
  canSeeHidden: boolean;
}

/**
 * NPC entity IDs start above this offset to avoid collision with player IDs.
 * Player IDs are database-assigned and will always be below this value.
 */
export const NPC_ID_OFFSET = 1_000_000;

/**
 * Type guard: returns true if the entity is a player (AuthenticatedSocket).
 * Use this to gate player-specific behavior (WebSocket messaging, DB persistence, etc.)
 *
 * Note: This narrows to CombatEntity & { entityType: 'player' } rather than
 * AuthenticatedSocket because CombatEntity doesn't extend WebSocket.
 * Callers needing AuthenticatedSocket-specific APIs (like .send()) must cast explicitly.
 */
export function isPlayerEntity(entity: CombatEntity): entity is CombatEntity & { entityType: 'player' } {
  return entity.entityType === 'player';
}

/**
 * Get the room ID where a combat entity is located.
 * For players, delegates to the existing getPlayerLocation map.
 * Phase 2 will add NPC room lookup here.
 */
export function getEntityRoomId(entity: CombatEntity): number {
  if (entity.entityType === 'player') {
    return getPlayerLocation(entity.entityId);
  }
  // Phase 2: NPCs will store their room ID on the entity directly
  // For now, return 0 as a safe fallback (should never be reached in Phase 1)
  return 0;
}
