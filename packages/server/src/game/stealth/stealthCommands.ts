/**
 * Stealth Commands Module
 *
 * Implements hide, sneak, and backstab commands for characters with stealth abilities.
 *
 * Based on MajorMUD mechanics - see notes/Stealth_Implementation_Plan.md
 */

import { MessageType, EquipmentSlot, WeaponData, DEFAULT_ATTACK_VERBS, DamageType } from '@koa/shared';
import { AuthenticatedSocket, broadcastToRoom, sendMessage, sendVitals } from '../socket.js';
import { CommandResponse } from '../commands.js';
import { getPlayerLocation } from '../adminCommands.js';
import { colors } from '../../utils/colors.js';
import * as characterRepo from '../../db/repositories/characterRepository.js';
import * as itemRepo from '../../db/repositories/itemRepository.js';
import * as progressionRepo from '../../db/repositories/progressionRepository.js';
import {
  canEnterStealth,
  canEnterSneak,
  setStealthMode,
  isHidden,
  isSneaking,
  isStealthing,
  breakStealth,
} from './stealthState.js';
import { calculateStealth, calculatePerception, characterHasStealth, getEquipmentStealthModifier, getBackstabDamageBonuses } from '../stats/secondaryStats.js';
import { findPlayerInRoom } from '../playerUtils.js';
import { calculateBackstabAccuracy, calculateBackstabDefense, rollBackstabHit } from '../combat/backstabAccuracy.js';
import { calculateBackstabDamage, calculateStrengthDamageBonus } from '../combat/backstabDamage.js';
import { applyDamage, initializeDroppedState, initializeDeadState, formatDroppedMessage, formatDeathMessage } from '../damageHandler.js';
import { getEquipmentCombatStats } from '../combatStats.js';

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

  // Get equipped items for stealth modifier calculation
  const equippedItems = await itemRepo.getCharacterEquipped(socket.characterId!);
  const equipmentStealthMod = getEquipmentStealthModifier(equippedItems);

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
    equipmentStealthMod,
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

  // Get equipped items for stealth modifier calculation
  const equippedItems = await itemRepo.getCharacterEquipped(socket.characterId!);
  const equipmentStealthMod = getEquipmentStealthModifier(equippedItems);

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
    equipmentStealthMod,
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

// ============================================================================
// BACKSTAB COMMAND
// ============================================================================

/**
 * Handle the 'backstab' command
 *
 * Attempts a surprise attack from stealth, dealing high damage.
 *
 * Requirements:
 * - Character must have stealth ability (from race or class)
 * - Must be sneaking OR hidden
 * - Must have a one-handed weapon equipped
 * - Target must exist in the room
 * - Cannot already be in combat with target
 *
 * Flow:
 * 1. Validate all prerequisites
 * 2. Roll accuracy check
 * 3. If hit: calculate damage, apply to target
 * 4. Break stealth (hit or miss)
 * 5. Engage combat with target
 */
export async function handleBackstab(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Get character data
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Check if character has stealth ability
  const hasStealth = await characterHasStealth(character.race, character.class);
  if (!hasStealth) {
    return { type: MessageType.ERROR, message: 'You do not have stealth abilities.' };
  }

  // Must be sneaking or hidden
  if (!isStealthing(socket)) {
    return { type: MessageType.ERROR, message: 'You must be sneaking or hidden to backstab.' };
  }

  // Need a target
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Backstab who?' };
  }

  const targetName = args.join(' ');
  const currentRoomId = getPlayerLocation(socket.playerId);

  // Find the target - only see hidden players if attacker has canSeeHidden
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId, socket.canSeeHidden);
  if (!target) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // Cannot backstab dead players
  if (target.deathState?.isDead) {
    return { type: MessageType.ERROR, message: `${target.username} is already dead.` };
  }

  // Cannot backstab someone we're already in combat with
  if (socket.combatState.targets.has(target.playerId)) {
    return { type: MessageType.ERROR, message: `You are already in combat with ${target.username}!` };
  }

  // Get equipped weapon
  const equipped = await itemRepo.getCharacterEquipped(socket.characterId!);
  const mainHandWeapon = equipped.find(item => item.equipped_slot === EquipmentSlot.MAIN_HAND);

  // Must have a weapon equipped
  if (!mainHandWeapon || !mainHandWeapon.template?.weapon_data) {
    return { type: MessageType.ERROR, message: 'You need a weapon equipped to backstab.' };
  }

  // Check if weapon is two-handed (can't backstab with two-handed weapons)
  if (mainHandWeapon.template.flags?.two_handed) {
    return { type: MessageType.ERROR, message: 'You cannot backstab with a two-handed weapon.' };
  }

  const weaponData = mainHandWeapon.template.weapon_data as WeaponData;

  // Get attack verbs for messages
  const damageType = weaponData.damage_type || DamageType.PIERCING;
  const attackVerbs = weaponData.attack_verbs
    || DEFAULT_ATTACK_VERBS[damageType as DamageType]
    || { hit: 'hit', hit_3p: 'hits', miss: 'swing at', miss_3p: 'swings at' };
  const hitVerb = attackVerbs.hit || 'hit';

  // Get class backstab bonus
  const classDef = await progressionRepo.getClassById(character.class);
  const classBackstabBonus = classDef?.backstab_accuracy_bonus ?? 0;

  // Get weapon backstab accuracy bonus
  const weaponBackstabAccuracy = weaponData.backstab_accuracy ?? 0;

  // Get equipment modifiers (stealth and backstab damage bonuses)
  const equipmentStealthMod = getEquipmentStealthModifier(equipped);
  const backstabDmgBonuses = getBackstabDamageBonuses(equipped);

  // Calculate attacker's stealth value
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
    equipmentStealthMod,
    0  // TODO: Encumbrance ratio
  );

  // Calculate attacker's backstab accuracy
  const attackerAccuracy = calculateBackstabAccuracy(
    {
      dexterity: character.dexterity,
      intelligence: character.intelligence,
      charisma: character.charisma,
    },
    stealthBreakdown.total,
    weaponBackstabAccuracy,
    classBackstabBonus
  );

  // Get target's stats for defense calculation
  const targetCharacter = await characterRepo.findCharacterById(target.characterId!);
  if (!targetCharacter) {
    return { type: MessageType.ERROR, message: 'Target not found.' };
  }

  // Get target's equipment stats for AC
  const targetEquipStats = await getEquipmentCombatStats(target.characterId!);

  // For now, perception modifier from equipment is 0
  // TODO: Add perception_modifier to equipment if needed
  const targetEquipPerceptionMod = 0;

  // Calculate target's perception
  const targetPerception = calculatePerception(
    targetCharacter.intelligence,
    targetCharacter.wisdom,
    targetCharacter.charisma,
    targetEquipPerceptionMod
  );

  // Calculate defender's backstab defense
  const defenderDefense = calculateBackstabDefense(
    targetEquipStats.armor.totalArmorClass,
    targetPerception.total
  );

  // Roll to hit
  const hitResult = rollBackstabHit(attackerAccuracy, defenderDefense);

  // Break stealth regardless of hit/miss
  breakStealth(socket, 'attack', true);

  // Break target's stealth if they're hidden (they've been spotted)
  if (isStealthing(target)) {
    breakStealth(target, 'attacked', true);
  }

  // Engage combat
  socket.combatState.targets.add(target.playerId);
  socket.regenState.inCombat = true;
  target.regenState.inCombat = true;

  // Clear resting state for both players
  socket.regenState.enhancedRegen.clear();
  target.regenState.enhancedRegen.clear();

  // Cancel meditation for both players
  if (socket.exitTimer) {
    clearTimeout(socket.exitTimer);
    socket.exitTimer = undefined;
  }
  if (target.exitTimer) {
    clearTimeout(target.exitTimer);
    target.exitTimer = undefined;
  }

  // Update vitals
  sendVitals(socket);
  sendVitals(target);

  if (hitResult.hit) {
    // Calculate damage
    const strengthBonus = calculateStrengthDamageBonus(character.strength);
    const damageResult = calculateBackstabDamage(
      weaponData.max_damage,
      strengthBonus,
      character.level,
      {
        minDamageBonus: backstabDmgBonuses.minBonus,
        maxDamageBonus: backstabDmgBonuses.maxBonus,
      }
    );

    // Apply damage to target
    const damageApplied = await applyDamage(target, damageResult.damage, 'melee');

    // Build messages with "surprise" + weapon verb
    const attackerMsg = `You surprise ${hitVerb} ${colors.combatDefender(target.username)} for ${colors.combatDamage(damageResult.damage.toString())} damage!`;
    const targetMsg = `${colors.combatAttacker(socket.username)} surprises ${hitVerb} you for ${colors.combatDamage(damageResult.damage.toString())} damage!`;
    const roomMsg = `${colors.combatAttacker(socket.username)} surprises ${hitVerb} ${colors.combatDefender(target.username)} for ${colors.combatDamage(damageResult.damage.toString())} damage!`;

    // Broadcast to room (exclude attacker and target)
    broadcastToRoom(currentRoomId, roomMsg, [socket.playerId, target.playerId]);

    // Notify the target
    sendMessage(target, MessageType.OUTPUT, targetMsg);

    // Handle state changes (dropped/death)
    if (damageApplied.stateChange === 'dropped') {
      initializeDroppedState(target, currentRoomId);
      sendMessage(target, MessageType.OUTPUT, formatDroppedMessage());
      broadcastToRoom(
        currentRoomId,
        colors.boldRed(`${target.username} collapses to the ground!`),
        target.playerId
      );
      sendVitals(target);
    } else if (damageApplied.stateChange === 'death') {
      initializeDeadState(target, currentRoomId);
      sendMessage(target, MessageType.OUTPUT, formatDeathMessage());
      broadcastToRoom(
        currentRoomId,
        colors.boldRed(`${target.username} has been slain!`),
        target.playerId
      );
      sendVitals(target);
    }

    return {
      type: MessageType.OUTPUT,
      message: attackerMsg,
    };
  } else {
    // Miss messages
    const attackerMsg = `You attempt to backstab ${colors.combatDefender(target.username)} but miss!`;
    const targetMsg = `${colors.combatAttacker(socket.username)} lunges at you from the shadows but misses!`;
    const roomMsg = `${colors.combatAttacker(socket.username)} lunges at ${colors.combatDefender(target.username)} from the shadows but misses!`;

    // Broadcast to room (exclude attacker and target)
    broadcastToRoom(currentRoomId, roomMsg, [socket.playerId, target.playerId]);

    // Notify the target
    sendMessage(target, MessageType.OUTPUT, targetMsg);

    return {
      type: MessageType.OUTPUT,
      message: attackerMsg,
    };
  }
}
