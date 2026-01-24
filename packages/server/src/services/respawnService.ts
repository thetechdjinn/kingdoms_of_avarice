import { getRoomById, getRespawnRoomForArea } from '../db/repositories/roomRepository.js';
import { getDefaultRespawnRoomId } from '../db/repositories/settingsRepository.js';

// Hardcoded fallback room ID (last resort if no respawn room configured)
const FALLBACK_RESPAWN_ROOM_ID = 1;

/**
 * Determines the respawn room for a player death.
 *
 * Fallback chain:
 * 1. Area respawn room - designated respawn point in the death room's area
 * 2. Global default setting - configurable default respawn room
 * 3. Room 1 - hardcoded last resort
 *
 * @param deathRoomId - The room ID where the player died
 * @param _characterId - Character ID (reserved for future per-character overrides)
 * @returns The room ID where the player should respawn
 */
export async function getRespawnRoomId(
  deathRoomId: number,
  _characterId?: number
): Promise<number> {
  try {
    // Get the room where the player died to determine their area
    const deathRoom = await getRoomById(deathRoomId);

    if (deathRoom?.area) {
      // Try to find a respawn room in the same area
      const areaRespawnRoom = await getRespawnRoomForArea(deathRoom.area);
      if (areaRespawnRoom !== null) {
        return areaRespawnRoom;
      }
    }

    // Fall back to global default respawn room
    const defaultRespawnRoom = await getDefaultRespawnRoomId();
    if (defaultRespawnRoom !== null) {
      // Verify the default room exists
      const defaultRoom = await getRoomById(defaultRespawnRoom);
      if (defaultRoom) {
        return defaultRespawnRoom;
      }
    }

    // Last resort: hardcoded fallback
    return FALLBACK_RESPAWN_ROOM_ID;
  } catch (error) {
    console.error('[RespawnService] Error determining respawn room:', error);
    return FALLBACK_RESPAWN_ROOM_ID;
  }
}
