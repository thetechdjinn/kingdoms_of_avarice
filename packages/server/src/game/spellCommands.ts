/**
 * Spell Commands Module
 *
 * Handles spell casting via mnemonics (e.g., 'mmis goblin' for Magic Missile).
 * Attack spells replace melee combat and persist until combat ends or mana runs out.
 */

import { MessageType, Spell, SpellType, SpellTargetType } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket, broadcastToRoom, sendMessage, sendVitals } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import * as spellRepo from '../db/repositories/spellRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import { parseDiceString } from './combatCalculations.js';
import { applyEffect, getEffectDefinition, formatDuration } from './statusEffects.js';
import { isOnCooldown, startCooldown, getCooldownMessage } from './cooldownTracker.js';

/**
 * Cache of all spell mnemonics for quick lookup
 * Refreshed on server start and when spells are added/removed
 */
let cachedMnemonics: Set<string> = new Set();

/**
 * Initialize the spell mnemonic cache
 * Called on server startup
 */
export async function initializeSpellMnemonics(): Promise<void> {
  try {
    const mnemonics = await spellRepo.getAllMnemonics();
    cachedMnemonics = new Set(mnemonics.map(m => m.toLowerCase()));
    console.log(`[Spells] Loaded ${cachedMnemonics.size} spell mnemonics`);
  } catch (error) {
    console.error('[Spells] Failed to load spell mnemonics:', error);
  }
}

/**
 * Check if a command is a spell mnemonic
 */
export function isSpellMnemonic(command: string): boolean {
  return cachedMnemonics.has(command.toLowerCase());
}

/**
 * Find a player in the same room by name (case-insensitive partial match)
 */
function findPlayerInRoom(
  targetName: string,
  roomId: number,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  excludePlayerId: number
): AuthenticatedSocket | null {
  const lowerTarget = targetName.toLowerCase();

  for (const [playerId, socket] of connectedPlayers) {
    if (playerId === excludePlayerId) continue;
    if (getPlayerLocation(playerId) !== roomId) continue;

    const playerName = socket.username.toLowerCase();
    if (playerName === lowerTarget || playerName.startsWith(lowerTarget)) {
      return socket;
    }
  }

  return null;
}

/**
 * Handle a spell mnemonic command
 *
 * @param socket - The player casting the spell
 * @param mnemonic - The spell mnemonic (e.g., 'mmis')
 * @param args - Arguments (typically the target name)
 * @param connectedPlayers - Map of all connected players
 */
export async function handleSpellCommand(
  socket: AuthenticatedSocket,
  mnemonic: string,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Get the spell definition
  const spell = await spellRepo.getSpellByMnemonic(mnemonic);
  if (!spell) {
    return { type: MessageType.ERROR, message: 'Unknown spell.' };
  }

  // Check cooldown using spell mnemonic as ability identifier
  if (isOnCooldown(socket, mnemonic)) {
    return { type: MessageType.ERROR, message: getCooldownMessage(spell.name) };
  }

  // Get character info for class/level checks
  const character = await characterRepo.findCharacterById(socket.characterId!);
  if (!character) {
    return { type: MessageType.ERROR, message: 'Character not found.' };
  }

  // Get class display name for restriction check
  const { getClassById } = await import('../db/repositories/progressionRepository.js');
  const classDef = await getClassById(character.class);
  const classDisplayName = classDef?.display_name || character.class;

  // Check if character can use this spell
  const canUse = await spellRepo.canUseSpell(
    socket.characterId!,
    spell.id,
    classDisplayName,
    character.level
  );
  if (!canUse.canUse) {
    return { type: MessageType.ERROR, message: canUse.reason || 'You cannot use this spell.' };
  }

  // Check mana
  if ((socket.vitals.resource ?? 0) < spell.manaCost) {
    return { type: MessageType.ERROR, message: `You don't have enough mana to cast ${spell.name}. (Need ${spell.manaCost})` };
  }

  // Handle different spell types
  switch (spell.spellType) {
    case SpellType.OFFENSIVE:
      return handleOffensiveSpell(socket, spell, args, connectedPlayers);

    case SpellType.HEALING:
      return handleHealingSpell(socket, spell, args, connectedPlayers);

    case SpellType.BUFF:
      return handleBuffSpell(socket, spell);

    case SpellType.DEBUFF:
      return handleDebuffSpell(socket, spell, args, connectedPlayers);

    case SpellType.UTILITY:
      return handleUtilitySpell(socket, spell, args, connectedPlayers);

    default:
      return { type: MessageType.ERROR, message: 'Unknown spell type.' };
  }
}

/**
 * Handle offensive spell casting
 * Attack spells set the player's combat action to spell mode
 */
async function handleOffensiveSpell(
  socket: AuthenticatedSocket,
  spell: Spell,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Need a target for offensive spells
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: `Cast ${spell.name} at whom?` };
  }

  const targetName = args.join(' ');
  const currentRoomId = getPlayerLocation(socket.playerId);

  // Find the target
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId);
  if (!target) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // Set up spell casting state
  socket.combatState.combatAction = 'spell';
  socket.combatState.activeSpell = {
    spellId: spell.id,
    spellName: spell.name,
    mnemonic: spell.mnemonic,
    manaCost: spell.manaCost,
    damageDice: spell.damageDice || '1d4',
    damageScalingStat: spell.damageScalingStat,
    damageScalingFactor: spell.damageScalingFactor,
  };

  // Add target if not already in combat with them
  if (!socket.combatState.targets.has(target.playerId)) {
    socket.combatState.targets.add(target.playerId);
  }

  // Set combat flags
  socket.regenState.inCombat = true;
  target.regenState.inCombat = true;

  // Clear resting state
  socket.regenState.enhancedRegen.clear();
  target.regenState.enhancedRegen.clear();

  // Cancel meditation for both players if they were meditating
  if (socket.exitTimer) {
    clearTimeout(socket.exitTimer);
    socket.exitTimer = undefined;
  }
  if (target.exitTimer) {
    clearTimeout(target.exitTimer);
    target.exitTimer = undefined;
  }

  // Update vitals to reflect status change (removes resting/meditating from statline)
  sendVitals(socket);
  sendVitals(target);

  // Broadcast to room (exclude both caster and target - they get personalized messages)
  broadcastToRoom(
    currentRoomId,
    `${socket.username} begins casting ${spell.name.toLowerCase()} at ${target.username}.`,
    [socket.playerId, target.playerId]
  );

  // Notify target
  const targetMessage = {
    type: MessageType.OUTPUT,
    payload: `${colors.combatAttacker(socket.username)} begins casting ${colors.cyan(spell.name.toLowerCase())} at you!`,
    timestamp: Date.now(),
  };
  target.send(JSON.stringify(targetMessage));

  // Start cooldown on use (offensive spells initiate combat, cooldown starts now)
  startCooldown(socket, spell.mnemonic, 'use');

  return {
    type: MessageType.OUTPUT,
    message: `${colors.yellow('*COMBAT ENGAGED*')} You begin casting ${colors.cyan(spell.name.toLowerCase())} at ${colors.combatDefender(target.username)}!`,
  };
}

/**
 * Handle healing spell casting
 * Healing spells are instant and can be cast between combat rounds
 * Can target self or allies depending on spell target type
 */
async function handleHealingSpell(
  socket: AuthenticatedSocket,
  spell: Spell,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  const currentRoomId = getPlayerLocation(socket.playerId);
  let targetSocket: AuthenticatedSocket = socket;
  let targetName = socket.username;
  let isSelfHeal = true;

  // Check if targeting another player
  if (args.length > 0) {
    const targetArg = args.join(' ');
    const foundTarget = findPlayerInRoom(targetArg, currentRoomId, connectedPlayers, -1); // Don't exclude anyone

    if (foundTarget) {
      targetSocket = foundTarget;
      targetName = foundTarget.username;
      isSelfHeal = foundTarget.playerId === socket.playerId;
    } else {
      return { type: MessageType.ERROR, message: `You don't see ${targetArg} here.` };
    }
  }

  // Deduct mana
  socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

  // Roll healing
  const healingResult = parseDiceString(spell.healingDice || '1d8');
  const healAmount = healingResult.roll;

  // Apply healing to target (cap at max HP)
  const oldHp = targetSocket.vitals.hp;
  targetSocket.vitals.hp = Math.min(targetSocket.vitals.hp + healAmount, targetSocket.vitals.maxHp);
  const actualHeal = targetSocket.vitals.hp - oldHp;

  // Persist HP to database
  if (targetSocket.characterId) {
    characterRepo.updateCharacterStats(targetSocket.characterId, { health: targetSocket.vitals.hp }).catch((error: unknown) => {
      console.error('Failed to persist health after healing:', error);
    });
  }

  // Send vitals update to target if not self
  if (!isSelfHeal) {
    sendVitals(targetSocket);

    // Notify the target
    const targetNotify = {
      type: MessageType.OUTPUT,
      payload: `${colors.cyan(socket.username)} casts ${colors.cyan(spell.name.toLowerCase())} on you! You are healed for ${colors.green(actualHeal.toString())} HP!`,
      timestamp: Date.now(),
    };
    targetSocket.send(JSON.stringify(targetNotify));
  }

  // Start cooldown (healing spells are instant - call both modes)
  startCooldown(socket, spell.mnemonic, 'use');
  startCooldown(socket, spell.mnemonic, 'complete');

  // Broadcast to room (excluding caster and target who get direct messages)
  if (isSelfHeal) {
    broadcastToRoom(
      currentRoomId,
      `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())} and is healed.`,
      socket.playerId
    );
    return {
      type: MessageType.OUTPUT,
      message: `You cast ${colors.cyan(spell.name.toLowerCase())} and heal for ${colors.green(actualHeal.toString())} HP!`,
    };
  } else {
    // Broadcast to others (excluding caster - target already got direct message)
    for (const [playerId, playerSocket] of connectedPlayers) {
      if (playerId !== socket.playerId && playerId !== targetSocket.playerId && getPlayerLocation(playerId) === currentRoomId) {
        const broadcastMsg = {
          type: MessageType.OUTPUT,
          payload: `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())} on ${targetName}.`,
          timestamp: Date.now(),
        };
        playerSocket.send(JSON.stringify(broadcastMsg));
      }
    }
    return {
      type: MessageType.OUTPUT,
      message: `You cast ${colors.cyan(spell.name.toLowerCase())} on ${colors.cyan(targetName)} and heal for ${colors.green(actualHeal.toString())} HP!`,
    };
  }
}

/**
 * Handle buff spell casting - applies a beneficial status effect to the caster
 */
async function handleBuffSpell(
  socket: AuthenticatedSocket,
  spell: Spell
): Promise<CommandResponse> {
  // Check if spell has a status effect defined
  if (!spell.statusEffect) {
    return {
      type: MessageType.ERROR,
      message: `${spell.name} has no effect defined.`,
    };
  }

  // Check if the effect exists in the registry
  const effectDef = getEffectDefinition(spell.statusEffect);
  if (!effectDef) {
    return {
      type: MessageType.ERROR,
      message: `Unknown effect: ${spell.statusEffect}`,
    };
  }

  // Deduct mana
  socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

  // Calculate duration in milliseconds (effectDuration is in seconds)
  const durationMs = (spell.effectDuration ?? 60) * 1000;

  // Apply the status effect
  const result = await applyEffect(socket, spell.statusEffect, durationMs, spell.id);

  if (!result.success) {
    return {
      type: MessageType.ERROR,
      message: result.message,
    };
  }

  // Start cooldown (buff spells are instant - call both modes)
  startCooldown(socket, spell.mnemonic, 'use');
  startCooldown(socket, spell.mnemonic, 'complete');

  // Broadcast to room
  const currentRoomId = getPlayerLocation(socket.playerId);
  broadcastToRoom(
    currentRoomId,
    `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())} and is ${colors.yellow(effectDef.name.toLowerCase())}!`,
    socket.playerId
  );

  // Send updated vitals
  sendVitals(socket);

  const durationStr = formatDuration(durationMs);
  return {
    type: MessageType.OUTPUT,
    message: `You cast ${colors.cyan(spell.name.toLowerCase())}. ${result.message} (${durationStr})`,
  };
}

/**
 * Handle debuff spell casting - applies a harmful status effect to a target
 * Can target players (PvP) or NPCs (when implemented)
 */
async function handleDebuffSpell(
  socket: AuthenticatedSocket,
  spell: Spell,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Need a target for debuff spells
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: `Cast ${spell.name} at whom?` };
  }

  const targetName = args.join(' ');
  const currentRoomId = getPlayerLocation(socket.playerId);

  // Find the target player
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId);
  if (!target) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // Check if spell has a status effect defined
  if (!spell.statusEffect) {
    return {
      type: MessageType.ERROR,
      message: `${spell.name} has no effect defined.`,
    };
  }

  // Check if the effect exists in the registry
  const effectDef = getEffectDefinition(spell.statusEffect);
  if (!effectDef) {
    return {
      type: MessageType.ERROR,
      message: `Unknown effect: ${spell.statusEffect}`,
    };
  }

  // Deduct mana
  socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

  // Calculate duration in milliseconds (effectDuration is in seconds)
  const durationMs = (spell.effectDuration ?? 60) * 1000;

  // Apply the status effect to the target
  const result = await applyEffect(target, spell.statusEffect, durationMs, spell.id);

  // Set combat flags if this is an aggressive action
  socket.regenState.inCombat = true;
  target.regenState.inCombat = true;
  socket.regenState.enhancedRegen.clear();
  target.regenState.enhancedRegen.clear();

  // Broadcast to room (exclude caster and target)
  broadcastToRoom(
    currentRoomId,
    `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())} on ${target.username}!`,
    [socket.playerId, target.playerId]
  );

  // Notify target
  const targetMessage = {
    type: MessageType.OUTPUT,
    payload: `${colors.combatAttacker(socket.username)} casts ${colors.cyan(spell.name.toLowerCase())} on you! ${result.message}`,
    timestamp: Date.now(),
  };
  target.send(JSON.stringify(targetMessage));

  // Start cooldown (debuff spells are instant - call both modes)
  startCooldown(socket, spell.mnemonic, 'use');
  startCooldown(socket, spell.mnemonic, 'complete');

  // Send updated vitals to target
  sendVitals(target);

  const durationStr = formatDuration(durationMs);
  return {
    type: MessageType.OUTPUT,
    message: `You cast ${colors.cyan(spell.name.toLowerCase())} on ${colors.magenta(target.username)}. ${result.message} (${durationStr})`,
  };
}

/**
 * Handle utility spell casting (placeholder)
 */
async function handleUtilitySpell(
  socket: AuthenticatedSocket,
  spell: Spell,
  _args: string[],
  _connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Deduct mana
  socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

  // Start cooldown (utility spells are instant - call both modes)
  startCooldown(socket, spell.mnemonic, 'use');
  startCooldown(socket, spell.mnemonic, 'complete');

  const currentRoomId = getPlayerLocation(socket.playerId);
  broadcastToRoom(
    currentRoomId,
    `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())}.`,
    socket.playerId
  );

  return {
    type: MessageType.OUTPUT,
    message: `You cast ${colors.cyan(spell.name.toLowerCase())}. (Utility effects not yet implemented)`,
  };
}

/**
 * Get list of spells a character has learned
 */
export async function handleSpellbook(socket: AuthenticatedSocket): Promise<CommandResponse> {
  if (!socket.characterId) {
    return { type: MessageType.ERROR, message: 'No character selected.' };
  }

  const spells = await spellRepo.getCharacterSpells(socket.characterId);

  if (spells.length === 0) {
    return { type: MessageType.SYSTEM, message: 'You have not learned any spells yet.' };
  }

  const lines = [
    colors.boldYellow('Your Spellbook:'),
    '',
  ];

  for (const spell of spells) {
    const typeColor = spell.spellType === SpellType.OFFENSIVE ? colors.red :
                      spell.spellType === SpellType.HEALING ? colors.green :
                      spell.spellType === SpellType.BUFF ? colors.cyan :
                      spell.spellType === SpellType.DEBUFF ? colors.magenta :
                      colors.white;

    lines.push(
      `  ${colors.cyan(spell.mnemonic.padEnd(6))} ${colors.white(spell.name.padEnd(20))} ` +
      `${typeColor(spell.spellType.padEnd(10))} ${colors.blue(spell.manaCost + ' mana')}`
    );
  }

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}
