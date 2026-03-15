/**
 * Spell Commands Module
 *
 * Handles spell casting via mnemonics (e.g., 'mmis goblin' for Magic Missile).
 * Attack spells replace melee combat and persist until combat ends or mana runs out.
 */

import { MessageType, Spell, SpellType } from '@koa/shared';
import { CommandResponse } from './commands.js';
import { AuthenticatedSocket, broadcastToRoom, sendMessage, sendVitals } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import * as spellRepo from '../db/repositories/spellRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import { parseDiceString } from './combatCalculations.js';
import { applyEffect, getEffectDefinition, formatDuration } from './statusEffects.js';
import { isOnCooldown, startCooldown, getCooldownMessage } from './cooldownTracker.js';
import { isPlayerDropped, isPlayerDead, clearDeathState } from './damageHandler.js';
import { findPlayerInRoom } from './playerUtils.js';
import { findNpcInRoom, setMerchantHostile } from './npcManager.js';
import type { NpcCombatInstance } from './npcManager.js';
import { withNpcName, withNpcNameCapitalized } from '../utils/textFormat.js';
import { isStealthing, breakStealth } from './stealth/stealthState.js';
import { applyEffectToEntity } from './statusEffects.js';
import { breakCasterCombat } from './combatCommands.js';

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

  // Find the target — try players first, then NPCs
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId, socket.canSeeHidden);
  const npcTarget = !target ? findNpcInRoom(targetName, currentRoomId) : null;

  if (!target && !npcTarget) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // NPC target
  if (npcTarget) {
    if (npcTarget.vitals.hp <= 0 || npcTarget.isCorpse) {
      return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(npcTarget.entityName, npcTarget.isProperName)} is already dead.` };
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

    // Add NPC to targets and vice versa
    if (!socket.combatState.targets.has(npcTarget.entityId)) {
      socket.combatState.targets.add(npcTarget.entityId);
    }
    npcTarget.combatState.targets.add(socket.playerId);

    // Set combat flags
    socket.regenState.inCombat = true;
    npcTarget.regenState.inCombat = true;
    npcTarget.behaviorState = 'combat';

    // Mark merchant as hostile to this player
    if (npcTarget.template.merchantEnabled && socket.characterId) {
      setMerchantHostile(socket.characterId, npcTarget.template.id);
    }

    // Clear resting state
    socket.regenState.enhancedRegen.clear();

    if (socket.exitTimer) {
      clearTimeout(socket.exitTimer);
      socket.exitTimer = undefined;
    }

    sendVitals(socket);

    // Break stealth
    if (isStealthing(socket)) {
      breakStealth(socket, 'spell_cast', true);
    }

    const npcDisplayName = withNpcName(npcTarget.entityName, npcTarget.isProperName);
    broadcastToRoom(
      currentRoomId,
      `${socket.username} begins casting ${spell.name.toLowerCase()} at ${npcDisplayName}.`,
      socket.playerId
    );

    startCooldown(socket, spell.mnemonic, 'use');

    return {
      type: MessageType.OUTPUT,
      message: colors.yellow('*COMBAT ENGAGED*'),
    };
  }

  // Player target
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
  if (!socket.combatState.targets.has(target!.playerId)) {
    socket.combatState.targets.add(target!.playerId);
  }

  // Set combat flags
  socket.regenState.inCombat = true;
  target!.regenState.inCombat = true;

  // Clear resting state
  socket.regenState.enhancedRegen.clear();
  target!.regenState.enhancedRegen.clear();

  // Cancel meditation for both players if they were meditating
  if (socket.exitTimer) {
    clearTimeout(socket.exitTimer);
    socket.exitTimer = undefined;
  }
  if (target!.exitTimer) {
    clearTimeout(target!.exitTimer);
    target!.exitTimer = undefined;
  }

  // Update vitals to reflect status change (removes resting/meditating from statline)
  sendVitals(socket);
  sendVitals(target!);

  // Broadcast to room (exclude both caster and target - they get personalized messages)
  broadcastToRoom(
    currentRoomId,
    `${socket.username} begins casting ${spell.name.toLowerCase()} at ${target!.username}.`,
    [socket.playerId, target!.playerId]
  );

  // Notify target
  const targetMessage = {
    type: MessageType.OUTPUT,
    payload: `${colors.combatAttacker(socket.username)} begins casting ${colors.cyan(spell.name.toLowerCase())} at you!`,
    timestamp: Date.now(),
  };
  target!.send(JSON.stringify(targetMessage));

  // Start cooldown on use (offensive spells initiate combat, cooldown starts now)
  startCooldown(socket, spell.mnemonic, 'use');

  return {
    type: MessageType.OUTPUT,
    message: `${colors.yellow('*COMBAT ENGAGED*')} You begin casting ${colors.cyan(spell.name.toLowerCase())} at ${colors.combatDefender(target!.username)}!`,
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
    // Don't exclude anyone (-1), but respect stealth visibility
    const foundTarget = findPlayerInRoom(targetArg, currentRoomId, connectedPlayers, -1, socket.canSeeHidden);

    if (foundTarget) {
      targetSocket = foundTarget;
      targetName = foundTarget.username;
      isSelfHeal = foundTarget.playerId === socket.playerId;
    } else {
      return { type: MessageType.ERROR, message: `You don't see ${targetArg} here.` };
    }
  }

  // Check death state restrictions
  if (isPlayerDead(targetSocket)) {
    // Cannot heal dead players - they must respawn
    return { type: MessageType.ERROR, message: `${targetName} is dead. They need to respawn, not be healed.` };
  }

  // Track if target is dropped (for recovery check after healing)
  const wasDropped = isPlayerDropped(targetSocket);

  // Deduct mana
  socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

  // Combat break: non-offensive spells break combat
  const hadCombatTargets = socket.combatState.targets.size > 0;
  if (hadCombatTargets) {
    breakCasterCombat(socket);
  }

  // Roll healing
  const healingResult = parseDiceString(spell.healingDice || '1d8');
  const healAmount = healingResult.roll;

  // Apply healing to target (cap at max HP)
  const oldHp = targetSocket.vitals.hp;
  targetSocket.vitals.hp = Math.min(targetSocket.vitals.hp + healAmount, targetSocket.vitals.maxHp);
  const actualHeal = targetSocket.vitals.hp - oldHp;

  // Check if healing brought a dropped player back to consciousness
  if (wasDropped && targetSocket.vitals.hp > 0) {
    clearDeathState(targetSocket);
    // Broadcast recovery
    broadcastToRoom(
      currentRoomId,
      `${targetName} regains consciousness and rises to their feet!`,
      targetSocket.playerId
    );
    // Notify the recovered player
    sendMessage(targetSocket, MessageType.SYSTEM, colors.boldGreen('You regain consciousness and rise to your feet!'));
  }

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

  const combatBreakMsg = hadCombatTargets ? `\r\n${colors.yellow('*COMBAT BREAK* You must attack again to re-engage.')}` : '';

  // Broadcast to room (excluding caster and target who get direct messages)
  if (isSelfHeal) {
    broadcastToRoom(
      currentRoomId,
      `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())} and is healed.`,
      socket.playerId
    );
    sendVitals(socket);
    return {
      type: MessageType.OUTPUT,
      message: `You cast ${colors.cyan(spell.name.toLowerCase())} and heal for ${colors.green(actualHeal.toString())} HP!${combatBreakMsg}`,
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
      message: `You cast ${colors.cyan(spell.name.toLowerCase())} on ${colors.cyan(targetName)} and heal for ${colors.green(actualHeal.toString())} HP!${combatBreakMsg}`,
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

  // Calculate duration in milliseconds (effectDuration is in seconds)
  const durationMs = (spell.effectDuration ?? 60) * 1000;

  // Apply the status effect (check before deducting mana or breaking combat)
  const result = await applyEffect(socket, spell.statusEffect, durationMs, spell.id);

  if (!result.success) {
    return {
      type: MessageType.ERROR,
      message: result.message,
    };
  }

  // Deduct mana (only after successful effect application)
  socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

  // Combat break: non-offensive spells break combat
  const hadCombatTargets = socket.combatState.targets.size > 0;
  if (hadCombatTargets) {
    breakCasterCombat(socket);
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

  const combatBreakMsg = hadCombatTargets ? `\r\n${colors.yellow('*COMBAT BREAK* You must attack again to re-engage.')}` : '';
  const durationStr = formatDuration(durationMs);
  return {
    type: MessageType.OUTPUT,
    message: `You cast ${colors.cyan(spell.name.toLowerCase())}. ${result.message} (${durationStr})${combatBreakMsg}`,
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

  // Find the target — try players first, then NPCs
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId, socket.canSeeHidden);
  const npcTarget = !target ? findNpcInRoom(targetName, currentRoomId) : null;

  if (!target && !npcTarget) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // NPC target — apply effect and engage combat
  if (npcTarget) {
    if (npcTarget.vitals.hp <= 0 || npcTarget.isCorpse) {
      return { type: MessageType.ERROR, message: `${withNpcNameCapitalized(npcTarget.entityName, npcTarget.isProperName)} is already dead.` };
    }

    // Check if spell has a status effect defined
    if (!spell.statusEffect) {
      return { type: MessageType.ERROR, message: `${spell.name} has no effect defined.` };
    }

    // Apply the status effect to the NPC
    const durationMs = (spell.effectDuration ?? 60) * 1000;
    const effectResult = applyEffectToEntity(npcTarget, spell.statusEffect, durationMs, spell.id);
    if (!effectResult.success) {
      return { type: MessageType.ERROR, message: effectResult.message };
    }

    // Deduct mana (only after successful effect application)
    socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

    // Add NPC to targets and vice versa
    if (!socket.combatState.targets.has(npcTarget.entityId)) {
      socket.combatState.targets.add(npcTarget.entityId);
    }
    npcTarget.combatState.targets.add(socket.playerId);

    // Set combat flags
    socket.regenState.inCombat = true;
    npcTarget.regenState.inCombat = true;
    npcTarget.behaviorState = 'combat';

    // Mark merchant as hostile to this player
    if (npcTarget.template.merchantEnabled && socket.characterId) {
      setMerchantHostile(socket.characterId, npcTarget.template.id);
    }

    // Clear resting state
    socket.regenState.enhancedRegen.clear();

    if (socket.exitTimer) {
      clearTimeout(socket.exitTimer);
      socket.exitTimer = undefined;
    }

    // Break stealth
    if (isStealthing(socket)) {
      breakStealth(socket, 'spell_cast', true);
    }

    sendVitals(socket);

    const npcDisplayName = withNpcName(npcTarget.entityName, npcTarget.isProperName);
    broadcastToRoom(
      currentRoomId,
      `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())} at ${npcDisplayName}!`,
      socket.playerId
    );

    startCooldown(socket, spell.mnemonic, 'use');
    startCooldown(socket, spell.mnemonic, 'complete');

    const durationStr = formatDuration(durationMs);
    return {
      type: MessageType.OUTPUT,
      message: `${colors.yellow('*COMBAT ENGAGED*')} You cast ${colors.cyan(spell.name.toLowerCase())} at ${npcDisplayName}. ${effectResult.message} (${durationStr})`,
    };
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

  // Calculate duration in milliseconds (effectDuration is in seconds)
  const durationMs = (spell.effectDuration ?? 60) * 1000;

  // Apply the status effect to the target (check before deducting mana or setting combat flags)
  const result = await applyEffect(target!, spell.statusEffect, durationMs, spell.id);

  if (!result.success) {
    return {
      type: MessageType.ERROR,
      message: result.message,
    };
  }

  // Deduct mana (only after successful effect application)
  socket.vitals.resource = (socket.vitals.resource ?? 0) - spell.manaCost;

  // Combat break: non-offensive spells break combat
  const hadCombatTargets = socket.combatState.targets.size > 0;
  if (hadCombatTargets) {
    breakCasterCombat(socket);
  }

  // Set combat flags if this is an aggressive action
  socket.regenState.inCombat = true;
  target!.regenState.inCombat = true;
  socket.regenState.enhancedRegen.clear();
  target!.regenState.enhancedRegen.clear();

  // Broadcast to room (exclude caster and target)
  broadcastToRoom(
    currentRoomId,
    `${socket.username} casts ${colors.cyan(spell.name.toLowerCase())} on ${target!.username}!`,
    [socket.playerId, target!.playerId]
  );

  // Notify target
  const targetMessage = {
    type: MessageType.OUTPUT,
    payload: `${colors.combatAttacker(socket.username)} casts ${colors.cyan(spell.name.toLowerCase())} on you! ${result.message}`,
    timestamp: Date.now(),
  };
  target!.send(JSON.stringify(targetMessage));

  // Start cooldown (debuff spells are instant - call both modes)
  startCooldown(socket, spell.mnemonic, 'use');
  startCooldown(socket, spell.mnemonic, 'complete');

  // Send updated vitals to both caster and target
  sendVitals(socket);
  sendVitals(target!);

  const combatBreakMsg = hadCombatTargets ? `\r\n${colors.yellow('*COMBAT BREAK* You must attack again to re-engage.')}` : '';
  const durationStr = formatDuration(durationMs);
  return {
    type: MessageType.OUTPUT,
    message: `You cast ${colors.cyan(spell.name.toLowerCase())} on ${colors.magenta(target!.username)}. ${result.message} (${durationStr})${combatBreakMsg}`,
  };
}

/**
 * Handle utility spell casting (placeholder)
 */
async function handleUtilitySpell(
  _socket: AuthenticatedSocket,
  spell: Spell,
  _args: string[],
  _connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  // Utility effects not yet implemented — refuse to cast rather than consume mana
  return {
    type: MessageType.ERROR,
    message: `${spell.name} cannot be cast yet. (Utility effects not yet implemented)`,
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
