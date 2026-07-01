/**
 * Memory-First Session State
 *
 * Central API for mutating cached player state and flushing it to the database.
 * See notes/Memory_First_Architecture.md for the full rule.
 *
 * INVARIANT (memory-first architecture):
 * Every flush — periodic save tick, logout close handler, graceful shutdown,
 * quest completion, level-up, or any other direct-write trigger — MUST drain
 * the player's entire dirty state in a single transaction via flushPlayer.
 * Writing one field without flushing everything else dirty creates torn-state
 * risk on crash. Any new feature that writes to the database during gameplay
 * MUST route through flushPlayer (or call it alongside its write).
 *
 * The helpers below are the only sanctioned way to mutate cached state.
 * They:
 *   1. Mutate the in-memory cache on the socket
 *   2. Mark the corresponding entry in socket.dirty (or dirtyItems)
 *   3. Return synchronously — the actual DB write happens at the next flush
 *
 * Direct field writes like `socket.pocket.gold = x` bypass dirty tracking
 * and will be silently lost at the next flush. Always use these helpers.
 */

import type { WebSocket } from 'ws';
import type { Currency, ItemInstance, VitalsData, ActiveStatusEffect } from '@koa/shared';
import { withTransaction } from '../db/index.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import { getPlayerLocation } from './adminCommands.js';

// Local mirror of AuthenticatedSocket — sessionState only needs the cache fields.
// Kept narrow so callers can pass any socket-like object during refactor phases.
export interface SessionSocket extends WebSocket {
  playerId: number;
  characterId?: number;
  vitals: VitalsData;
  activeEffects: Map<string, ActiveStatusEffect>;
  pocket: Currency;
  bankBalance: number;
  inventory: ItemInstance[];
  dirty: Set<DirtyField>;
  dirtyItems: Set<number>;
}

export type DirtyField = 'vitals' | 'room' | 'pocket' | 'bank' | 'inventory' | 'effects';

// ----------------------------------------------------------------------------
// Mutation helpers — the ONLY sanctioned way to change cached state
// ----------------------------------------------------------------------------

/**
 * Add (or subtract, with negative amount) a currency denomination.
 * Pocket totals are clamped at zero — callers that need pre-check semantics
 * should validate before calling.
 */
export function addPocket(socket: SessionSocket, type: keyof Currency, amount: number): void {
  const next = socket.pocket[type] + amount;
  socket.pocket[type] = next < 0 ? 0 : next;
  socket.dirty.add('pocket');
}

/**
 * Set absolute pocket value (used by logout flush sync from DB).
 */
export function setPocket(socket: SessionSocket, value: Currency): void {
  socket.pocket = { ...value };
  socket.dirty.add('pocket');
}

/**
 * Add (or subtract, with negative delta) the bank balance.
 * Clamped at zero — callers must validate sufficient funds before withdrawing.
 */
export function addBank(socket: SessionSocket, delta: number): void {
  const next = socket.bankBalance + delta;
  socket.bankBalance = next < 0 ? 0 : next;
  socket.dirty.add('bank');
}

/**
 * Mark vitals (HP/mana) dirty for the next flush. Vitals are mutated directly
 * on socket.vitals by the combat / spell / regen code — this just registers
 * the change so the next flush picks it up.
 */
export function markVitalsDirty(socket: SessionSocket): void {
  socket.dirty.add('vitals');
}

/**
 * Mark the current room dirty for the next flush. Room is tracked in the
 * existing playerLocations map (see adminCommands.ts) which already serves
 * as the in-memory source of truth.
 */
export function markRoomDirty(socket: SessionSocket): void {
  socket.dirty.add('room');
}

/**
 * Mark a specific item instance as needing a flush (location, quantity, or
 * any other instance-level state change).
 */
export function markItemDirty(socket: SessionSocket, instanceId: number): void {
  socket.dirtyItems.add(instanceId);
  socket.dirty.add('inventory');
}

/**
 * Mark active status effects dirty for the next flush. Effects tick locally
 * in memory; only the snapshot at flush time hits the DB.
 */
export function markEffectsDirty(socket: SessionSocket): void {
  socket.dirty.add('effects');
}

// ----------------------------------------------------------------------------
// flushPlayer — central flush helper. THE ONE PLACE state hits the DB.
// ----------------------------------------------------------------------------

/**
 * Drain the player's entire dirty state to the database in a single transaction.
 *
 * INVARIANT (memory-first architecture):
 * Every flush trigger (save tick, logout, shutdown, quest completion, level-up,
 * etc.) routes through this function. Either every dirty field lands together
 * or the transaction rolls back, preserving the last sync point on crash.
 *
 * Direct-write triggers (quest completion, level-up, etc.) call flushPlayer
 * BEFORE or AFTER their own write to drain everything else dirty alongside.
 * The cleanest pattern is to perform the trigger's write inside the same
 * transaction — extend this function (or add a sibling) when needed.
 *
 * Currently writes:
 *   - vitals (health + mana) when 'vitals' is dirty
 *   - room location when 'room' is dirty
 *   - pocket currency (5 denominations) when 'pocket' is dirty
 *   - bank balance when 'bank' is dirty
 *
 * NOT YET WIRED (added in subsequent refactor phases):
 *   - inventory dirty items (Phase 1.5)
 *   - status effects (Phase 1.x)
 */
export async function flushPlayer(socket: SessionSocket): Promise<void> {
  if (!socket.characterId) return;
  if (socket.dirty.size === 0 && socket.dirtyItems.size === 0) return;

  const updates: Parameters<typeof characterRepo.updateCharacterStats>[1] = {};

  if (socket.dirty.has('vitals')) {
    updates.health = socket.vitals.hp;
    updates.mana = socket.vitals.resource ?? 0;
  }
  if (socket.dirty.has('room')) {
    updates.current_room_id = getPlayerLocation(socket.playerId);
  }
  if (socket.dirty.has('pocket')) {
    updates.copper = socket.pocket.copper;
    updates.silver = socket.pocket.silver;
    updates.gold = socket.pocket.gold;
    updates.platinum = socket.pocket.platinum;
    updates.runic = socket.pocket.runic;
  }
  if (socket.dirty.has('bank')) {
    updates.bank_balance = socket.bankBalance;
  }

  // Snapshot the flags we are about to persist BEFORE awaiting. A command
  // handler running during the transaction's awaits (same event loop) can
  // re-dirty a field; clearing only the captured flags afterward avoids
  // dropping that write. (A blanket .clear() after the await would wipe it.)
  const flushedFields = new Set(socket.dirty);
  const flushedItems = new Set(socket.dirtyItems);

  await withTransaction(async (client) => {
    if (Object.keys(updates).length > 0) {
      await characterRepo.updateCharacterStats(socket.characterId!, updates, client);
    }
    // Future phases plug in inventory + status effect flushes here so they
    // share the same transaction with the character update above.
  });

  for (const field of flushedFields) socket.dirty.delete(field);
  for (const item of flushedItems) socket.dirtyItems.delete(item);
}

// Type-only re-exports so callers don't have to import from shared individually
// when they only touch session state.
export type { Currency, ItemInstance };
