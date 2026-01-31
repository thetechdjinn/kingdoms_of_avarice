/**
 * Stealth Commands Module
 *
 * Implements hide and sneak commands for characters with stealth abilities.
 *
 * Based on MajorMUD mechanics - see notes/Stealth_Implementation_Plan.md
 */

import { MessageType } from '@koa/shared';
import { AuthenticatedSocket, broadcastToRoom } from '../socket.js';
import { CommandResponse } from '../commands.js';
import { getPlayerLocation } from '../adminCommands.js';
import { colors } from '../../utils/colors.js';
import * as characterRepo from '../../db/repositories/characterRepository.js';
import {
  canEnterStealth,
  canEnterSneak,
  setStealthMode,
  isHidden,
  isSneaking,
} from './stealthState.js';
import { calculateStealth } from '../stats/secondaryStats.js';

// ============================================================================
// STEALTH ROLL
// ============================================================================

/**
 * Make a stealth roll to determine hide/sneak success
 *
 * For Phase 2, this is a simple roll against a base difficulty.
 * In future phases, this will factor in:
 * - Number of observers in the room
 * - Each observer's perception stat
 * - Environmental factors
 *
 * @param stealthValue - The character's total stealth stat
 * @returns true if the stealth attempt succeeds
 */
function makeStealthRoll(stealthValue: number): boolean {
  // Base difficulty for an empty room
  const baseDifficulty = 20;

  // Roll 1-100
  const roll = Math.floor(Math.random() * 100) + 1;

  // Success if roll + stealth >= difficulty
  // Higher stealth makes success more likely
  return roll + stealthValue >= baseDifficulty;
}

// ============================================================================
// HIDE COMMAND
// ============================================================================

/**
 * Handle the 'hide' command
 *
 * Attempts to hide in the shadows, making the character invisible in the room.
 * Other players must use 'search' to find hidden characters.
 *
 * Requirements:
 * - Character must have stealth ability (from race or class)
 * - Cannot be in combat
 * - Cannot hide if NPCs/monsters are in the room (they would notice repositioning)
 *
 * Mechanics:
 * - Makes a stealth roll
 * - Success: Sets state to 'hidden', shows "Attempting to hide..."
 * - Failure: Sets state to 'none', shows "Attempting to hide... You don't think you are hidden."
 */
export async function handleHide(socket: AuthenticatedSocket): Promise<CommandResponse> {
  // Get character data
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Validate stealth ability and state
  const validation = await canEnterStealth(socket, character.race, character.class);
  if (!validation.allowed) {
    return { type: MessageType.ERROR, message: validation.reason || 'You cannot hide.' };
  }

  // TODO: Phase 2+ - Check for NPCs/monsters in room
  // If hostile NPCs/monsters are present, hiding fails because repositioning would alert them
  // For now, we skip this check since NPCs/monsters aren't implemented yet

  // If already hidden, just acknowledge
  if (isHidden(socket)) {
    return { type: MessageType.OUTPUT, message: 'You are already hidden.' };
  }

  // Calculate stealth value for the roll
  const stealthBreakdown = await calculateStealth(
    {
      dexterity: character.dexterity,
      intelligence: character.intelligence,
      wisdom: character.wisdom,
      charisma: character.charisma,
      level: character.level,
      race: character.race,
      class: character.class,
    },
    0, // TODO: Equipment stealth modifier
    0  // TODO: Encumbrance ratio
  );

  // Make the stealth roll
  const success = makeStealthRoll(stealthBreakdown.total);

  if (success) {
    // Success - become hidden
    setStealthMode(socket, 'hidden');
    return { type: MessageType.OUTPUT, message: 'Attempting to hide...' };
  } else {
    // Failure - not hidden
    setStealthMode(socket, 'none');
    return {
      type: MessageType.OUTPUT,
      message: "Attempting to hide... You don't think you are hidden.",
    };
  }
}

// ============================================================================
// SNEAK COMMAND
// ============================================================================

/**
 * Handle the 'sneak' command
 *
 * Enters sneak mode, allowing stealthy movement between rooms.
 * Sneaking characters are visible in the room but not announced when entering/leaving.
 *
 * Requirements:
 * - Character must have stealth ability (from race or class)
 * - Cannot be in combat
 * - Cannot sneak if hostile NPCs have already engaged you
 *
 * Mechanics:
 * - Makes a stealth roll (result is hidden from player)
 * - Always shows "Attempting to sneak..."
 * - Sets state to 'sneaking'
 * - The actual success/failure is revealed during movement:
 *   - Success: "Sneaking..." on exit, silent entry
 *   - Failure: No sneaking message, normal entry announcement
 */
export async function handleSneak(socket: AuthenticatedSocket): Promise<CommandResponse> {
  // Get character data
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Validate stealth ability and state
  const validation = await canEnterSneak(socket, character.race, character.class);
  if (!validation.allowed) {
    return { type: MessageType.ERROR, message: validation.reason || 'You cannot sneak.' };
  }

  // TODO: Phase 2+ - Check for hostile NPCs in room that have engaged the player
  // "You may not sneak right now!" if hostile NPCs have already engaged

  // If already sneaking, just acknowledge
  if (isSneaking(socket)) {
    return { type: MessageType.OUTPUT, message: 'You are already sneaking.' };
  }

  // If hidden, transition to sneaking
  // Note: Per design doc, attempting to sneak while hidden switches to sneaking
  if (isHidden(socket)) {
    setStealthMode(socket, 'sneaking');
    return { type: MessageType.OUTPUT, message: 'Attempting to sneak...' };
  }

  // Calculate stealth value and make a roll
  // The result is stored internally - success/failure revealed on movement
  const stealthBreakdown = await calculateStealth(
    {
      dexterity: character.dexterity,
      intelligence: character.intelligence,
      wisdom: character.wisdom,
      charisma: character.charisma,
      level: character.level,
      race: character.race,
      class: character.class,
    },
    0, // TODO: Equipment stealth modifier
    0  // TODO: Encumbrance ratio
  );

  // NOTE: In Phase 4 (Stealth Movement), we will make a stealth roll here
  // and store the result to determine movement success/failure.
  // For Phase 2, we just enter sneak mode - no roll needed yet.

  // Enter sneaking mode
  setStealthMode(socket, 'sneaking');

  return { type: MessageType.OUTPUT, message: 'Attempting to sneak...' };
}

// ============================================================================
// STOP SNEAKING COMMAND (optional)
// ============================================================================

/**
 * Handle the 'visible' or 'appear' command (optional)
 *
 * Allows a player to voluntarily exit stealth mode.
 */
export async function handleVisible(socket: AuthenticatedSocket): Promise<CommandResponse> {
  const currentMode = socket.stealthMode;

  if (currentMode === 'none') {
    return { type: MessageType.OUTPUT, message: 'You are not hiding or sneaking.' };
  }

  const roomId = getPlayerLocation(socket.playerId);

  // Exit stealth mode
  setStealthMode(socket, 'none');

  if (currentMode === 'hidden') {
    // Broadcast emergence to room
    broadcastToRoom(
      roomId,
      colors.green(`${colors.red(socket.username)} emerges from the shadows.`),
      socket.playerId
    );
    return { type: MessageType.OUTPUT, message: 'You step out of the shadows.' };
  } else {
    return { type: MessageType.OUTPUT, message: 'You stop sneaking.' };
  }
}
