/**
 * Fuel Manager
 *
 * Manages fuel consumption for lit light sources held by players.
 * Piggybacks on the same tick interval as the dropped state system.
 * Each tick, lit light sources in the HELD slot lose fuel_rate fuel.
 * When fuel reaches 0, the light auto-extinguishes and the room is re-displayed
 * if the player can no longer see.
 *
 * Maintains an in-memory set of character IDs with lit light sources to avoid
 * querying the DB for every connected player each tick.
 */

import { MessageType, EquipmentSlot, ItemType } from '@koa/shared';
import { AuthenticatedSocket } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { getDroppedTickIntervalMs } from '../db/repositories/settingsRepository.js';
import * as itemRepo from '../db/repositories/itemRepository.js';
import { calculateEffectiveVision, canSee, getBlindMessage } from './vision.js';
import { GameWorld } from './world.js';

let fuelTimer: NodeJS.Timeout | null = null;
let fuelTickInProgress = false;

// References set during initialization
let connectedPlayersRef: Map<number, AuthenticatedSocket>;
let sendMessageRef: (socket: AuthenticatedSocket, type: MessageType, message: string) => void;
let worldRef: GameWorld;

// In-memory set of character IDs that have a lit fuel-burning light source
const litCharacters = new Set<number>();

/** Register a character as having a lit fuel-burning light source. */
export function trackLitCharacter(characterId: number): void {
  litCharacters.add(characterId);
}

/** Unregister a character (extinguished, fuel depleted, disconnected). */
export function untrackLitCharacter(characterId: number): void {
  litCharacters.delete(characterId);
}

/**
 * Start the fuel consumption processing loop.
 * Uses the same tick interval as the dropped state system.
 */
export async function startFuelLoop(
  connectedPlayers: Map<number, AuthenticatedSocket>,
  sendMessage: (socket: AuthenticatedSocket, type: MessageType, message: string) => void,
  world: GameWorld
): Promise<void> {
  connectedPlayersRef = connectedPlayers;
  sendMessageRef = sendMessage;
  worldRef = world;

  const tickIntervalMs = await getDroppedTickIntervalMs();

  if (fuelTimer) {
    clearInterval(fuelTimer);
  }

  fuelTimer = setInterval(() => {
    if (fuelTickInProgress) return;
    fuelTickInProgress = true;

    processFuelTick()
      .catch((error) => {
        console.error('[FuelManager] Error processing tick:', error);
      })
      .finally(() => {
        fuelTickInProgress = false;
      });
  }, tickIntervalMs);

  console.log(`[FuelManager] Started fuel consumption loop (every ${tickIntervalMs}ms)`);
}

/**
 * Stop the fuel consumption processing loop.
 */
export function stopFuelLoop(): void {
  if (fuelTimer) {
    clearInterval(fuelTimer);
    fuelTimer = null;
    console.log('[FuelManager] Stopped fuel consumption loop');
  }
}

/**
 * Restart the fuel loop with the current tick interval from settings.
 * Called by @reload settings.
 */
export async function reloadFuelLoop(): Promise<void> {
  const savedPlayers = connectedPlayersRef;
  const savedSendMessage = sendMessageRef;
  const savedWorld = worldRef;
  stopFuelLoop();
  if (savedPlayers && savedSendMessage && savedWorld) {
    await startFuelLoop(savedPlayers, savedSendMessage, savedWorld);
  }
}

/**
 * Process a single fuel tick.
 * Only queries the DB for characters in the litCharacters set.
 */
async function processFuelTick(): Promise<void> {
  if (!connectedPlayersRef || litCharacters.size === 0) return;

  // Build characterId->socket index once per tick
  const socketByCharacter = new Map<number, AuthenticatedSocket>();
  for (const [, s] of connectedPlayersRef) {
    if (s.characterId) {
      socketByCharacter.set(s.characterId, s);
    }
  }

  for (const characterId of litCharacters) {
    const socket = socketByCharacter.get(characterId);

    if (!socket) {
      // Player disconnected but wasn't cleaned up
      litCharacters.delete(characterId);
      continue;
    }

    try {
      const equipped = await itemRepo.getCharacterEquipped(characterId);
      const heldLight = equipped.find(
        e => e.equipped_slot === EquipmentSlot.HELD &&
             e.template?.item_type === ItemType.LIGHT &&
             e.is_lit
      );

      if (!heldLight) {
        // No longer has a lit light source
        litCharacters.delete(characterId);
        continue;
      }

      const lightData = heldLight.template?.light_data;
      if (!lightData || lightData.fuel_max === undefined) {
        // Permanent light source - no fuel to burn
        litCharacters.delete(characterId);
        continue;
      }

      const fuelRate = lightData.fuel_rate ?? 1;
      const currentFuel = heldLight.fuel_remaining ?? 0;
      const newFuel = Math.max(0, currentFuel - fuelRate);

      await itemRepo.updateInstanceFuel(heldLight.id, newFuel);

      if (newFuel <= 0) {
        // Fuel exhausted - extinguish
        await itemRepo.updateInstanceLitState(heldLight.id, false);
        litCharacters.delete(characterId);

        const itemName = heldLight.template?.name ?? 'light source';
        const isLantern = itemName.toLowerCase().includes('lantern');
        const extinguishMsg = isLantern
          ? `Your ${itemName} flickers and goes dark.`
          : `Your ${itemName} sputters and goes out.`;

        sendMessageRef(socket, MessageType.SYSTEM, extinguishMsg);

        // Check if player can still see - if not, show blind message
        const roomId = getPlayerLocation(socket.playerId);
        const room = worldRef.getRoom(roomId);
        if (room && room.darkness_level < 0) {
          const vision = await calculateEffectiveVision(socket);
          if (!canSee(vision, room.darkness_level)) {
            sendMessageRef(socket, MessageType.OUTPUT, getBlindMessage(room.darkness_level));
          }
        }
      }
    } catch (error) {
      console.error(`[FuelManager] Error processing fuel for character ${characterId}:`, error);
    }
  }
}
