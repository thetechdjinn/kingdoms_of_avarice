import { MessageType, GameMessage } from '@koa/shared';
import * as actionRepo from '../db/repositories/actionRepository.js';
import { AuthenticatedSocket, broadcastToRoom } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { colors } from '../utils/colors.js';
import { CommandResponse } from './commands.js';
import { findPlayerInRoom } from './playerUtils.js';
import { isStealthing, breakStealth } from './stealth/stealthState.js';

// In-memory cache of action commands
let actionCommandSet: Set<string> = new Set();
let actionCache: Map<string, actionRepo.Action> = new Map();

/**
 * Initialize action commands from the database
 * Should be called at server startup and when reloading
 */
export async function initializeActionCommands(): Promise<void> {
  try {
    const actions = await actionRepo.getAllActions();
    actionCommandSet = new Set(actions.map(a => a.command.toLowerCase()));
    actionCache = new Map(actions.map(a => [a.command.toLowerCase(), a]));
    console.log(`[Actions] Loaded ${actions.length} action commands`);
  } catch (error) {
    console.error('[Actions] Failed to load action commands:', error);
    actionCommandSet = new Set();
    actionCache = new Map();
  }
}

/**
 * Check if a command is a registered action command
 */
export function isActionCommand(command: string): boolean {
  return actionCommandSet.has(command.toLowerCase());
}

/**
 * Replace placeholders in message templates
 * {player} -> actor's name
 * {target} -> target's name
 */
function replacePlaceholders(template: string | null | undefined, playerName: string, targetName?: string): string {
  if (!template) return '';
  let result = template.replace(/\{player\}/gi, playerName);
  if (targetName) {
    result = result.replace(/\{target\}/gi, targetName);
  }
  return result;
}

/**
 * Handle an action command (dance, bow, wave, etc.)
 */
export async function handleActionCommand(
  socket: AuthenticatedSocket,
  command: string,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): Promise<CommandResponse> {
  const action = actionCache.get(command.toLowerCase());
  if (!action) {
    return { type: MessageType.ERROR, message: 'Unknown action.' };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);
  const targetName = args.join(' ').trim();

  // No target specified - use no-target messages
  if (!targetName) {
    const selfMsg = replacePlaceholders(action.firstPersonNoTarget, socket.username);
    const roomMsg = replacePlaceholders(action.roomNoTarget, socket.username);

    broadcastToRoom(currentRoomId, roomMsg, socket.playerId);
    return { type: MessageType.OUTPUT, message: selfMsg };
  }

  // Target specified - check if action supports targeting
  if (!action.firstPersonWithTarget || !action.targetPerspective || !action.roomWithTarget) {
    return { type: MessageType.ERROR, message: `The ${action.command} action doesn't support targeting.` };
  }

  // Find the target player (respects stealth - can't target what you can't see)
  const target = findPlayerInRoom(targetName, currentRoomId, connectedPlayers, socket.playerId, socket.canSeeHidden);
  if (!target) {
    return { type: MessageType.ERROR, message: `You don't see ${targetName} here.` };
  }

  // Break stealth when using a targeted social action
  if (isStealthing(socket)) {
    breakStealth(socket, 'social_action', true);
  }

  // Build messages with target
  const selfMsg = replacePlaceholders(action.firstPersonWithTarget, socket.username, target.username);
  const targetMsg = replacePlaceholders(action.targetPerspective, socket.username, target.username);
  const roomMsg = replacePlaceholders(action.roomWithTarget, socket.username, target.username);

  // Send to target
  const targetGameMsg: GameMessage = {
    type: MessageType.OUTPUT,
    payload: targetMsg,
    timestamp: Date.now(),
  };
  target.send(JSON.stringify(targetGameMsg));

  // Send to room (excluding self and target)
  broadcastToRoom(currentRoomId, roomMsg, [socket.playerId, target.playerId]);

  return { type: MessageType.OUTPUT, message: selfMsg };
}

/**
 * Handle the /me emote command
 * Format: /me <text> or me <text>
 */
export function handleEmoteCommand(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  const emoteText = args.join(' ').trim();

  if (!emoteText) {
    return { type: MessageType.ERROR, message: 'Emote what? Usage: /me <action>' };
  }

  const currentRoomId = getPlayerLocation(socket.playerId);

  // Message to self shows "You", room sees player's name
  const selfMsg = colors.emote(`You ${emoteText}`);
  const roomMsg = colors.emote(`${socket.username} ${emoteText}`);

  // Broadcast to room (excluding self)
  broadcastToRoom(currentRoomId, roomMsg, socket.playerId);

  return { type: MessageType.OUTPUT, message: selfMsg };
}

/**
 * Get all registered action commands (for help display)
 */
export function getActionCommands(): string[] {
  return Array.from(actionCommandSet).sort();
}

/**
 * Get action help info (command and description) for help display
 * Returns sorted array of { command, description }
 */
export function getActionHelpList(): Array<{ command: string; description: string | null }> {
  const actions = Array.from(actionCache.values());
  return actions
    .map(a => ({ command: a.command, description: a.description }))
    .sort((a, b) => a.command.localeCompare(b.command));
}
