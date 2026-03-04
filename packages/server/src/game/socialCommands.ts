import { MessageType } from '@koa/shared';
import { AuthenticatedSocket, sendMessage, broadcastToRoom } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { findOnlinePlayer } from './playerUtils.js';
import { colors } from '../utils/colors.js';
import { wordWrap } from '../utils/textFormat.js';
import type { GameWorld } from './world.js';
import type { CommandResponse } from './commands.js';

// ---------------------------------------------------------------------------
// Broadcast channel state (in-memory only)
// ---------------------------------------------------------------------------
interface BroadcastChannel {
  name: string;
  password: string | null;
  members: Set<number>;
}

const broadcastChannels = new Map<string, BroadcastChannel>(); // keyed by lowercase name

// ---------------------------------------------------------------------------
// Opposite directions (for shout)
// ---------------------------------------------------------------------------
const OPPOSITE_DIRECTIONS: Record<string, string> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'below',
  down: 'above',
  northeast: 'southwest',
  northwest: 'southeast',
  southeast: 'northwest',
  southwest: 'northeast',
};

// ---------------------------------------------------------------------------
// 7B: Gossip
// ---------------------------------------------------------------------------
export function handleGossip(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  // Toggle on/off
  if (args.length === 1 && args[0].toLowerCase() === 'on') {
    socket.gossipEnabled = true;
    return { type: MessageType.SYSTEM, message: 'Gossip channel enabled.' };
  }
  if (args.length === 1 && args[0].toLowerCase() === 'off') {
    socket.gossipEnabled = false;
    return { type: MessageType.SYSTEM, message: 'Gossip channel disabled.' };
  }

  if (args.length === 0) {
    const status = socket.gossipEnabled ? 'enabled' : 'disabled';
    return { type: MessageType.SYSTEM, message: `Gossip channel is ${status}. Usage: gossip <message>` };
  }

  if (!socket.gossipEnabled) {
    return { type: MessageType.ERROR, message: 'Your gossip channel is disabled. Type "gossip on" to enable.' };
  }

  const text = args.join(' ');
  const othersMsg = colors.magenta(`${socket.username} gossips: "${text}"`);

  for (const [playerId, playerSocket] of connectedPlayers) {
    if (playerId !== socket.playerId && playerSocket.gossipEnabled) {
      sendMessage(playerSocket, MessageType.OUTPUT, othersMsg);
    }
  }

  return { type: MessageType.OUTPUT, message: colors.magenta(`You gossip: "${text}"`) };
}

// ---------------------------------------------------------------------------
// 7B: Auction
// ---------------------------------------------------------------------------
export function handleAuction(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  // Toggle on/off
  if (args.length === 1 && args[0].toLowerCase() === 'on') {
    socket.auctionEnabled = true;
    return { type: MessageType.SYSTEM, message: 'Auction channel enabled.' };
  }
  if (args.length === 1 && args[0].toLowerCase() === 'off') {
    socket.auctionEnabled = false;
    return { type: MessageType.SYSTEM, message: 'Auction channel disabled.' };
  }

  if (args.length === 0) {
    const status = socket.auctionEnabled ? 'enabled' : 'disabled';
    return { type: MessageType.SYSTEM, message: `Auction channel is ${status}. Usage: auction <message>` };
  }

  if (!socket.auctionEnabled) {
    return { type: MessageType.ERROR, message: 'Your auction channel is disabled. Type "auction on" to enable.' };
  }

  const text = args.join(' ');
  const othersMsg = colors.yellow(`${socket.username} auctions: "${text}"`);

  for (const [playerId, playerSocket] of connectedPlayers) {
    if (playerId !== socket.playerId && playerSocket.auctionEnabled) {
      sendMessage(playerSocket, MessageType.OUTPUT, othersMsg);
    }
  }

  return { type: MessageType.OUTPUT, message: colors.yellow(`You auction: "${text}"`) };
}

// ---------------------------------------------------------------------------
// 7C: Telepath (private messages)
// ---------------------------------------------------------------------------
export function handleTelepath(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  // Toggle on/off
  if (args.length === 1 && args[0].toLowerCase() === 'on') {
    socket.telepathEnabled = true;
    return { type: MessageType.SYSTEM, message: 'Telepathy enabled.' };
  }
  if (args.length === 1 && args[0].toLowerCase() === 'off') {
    socket.telepathEnabled = false;
    return { type: MessageType.SYSTEM, message: 'Telepathy disabled.' };
  }

  if (args.length < 2) {
    return { type: MessageType.SYSTEM, message: 'Usage: tel <player> <message>' };
  }

  if (!socket.telepathEnabled) {
    return { type: MessageType.ERROR, message: 'Your telepathy is disabled. Type "tel on" to enable.' };
  }

  const targetName = args[0];
  const text = args.slice(1).join(' ');

  const target = findOnlinePlayer(targetName, connectedPlayers, socket.playerId);
  if (!target) {
    return { type: MessageType.ERROR, message: `${targetName} is not online.` };
  }

  // Check if target has telepath off or has blocked sender
  if (!target.telepathEnabled || target.telepathBlocks.has(socket.playerId)) {
    return { type: MessageType.ERROR, message: `${target.username} has telepathy disabled.` };
  }

  // Send to target
  sendMessage(target, MessageType.OUTPUT,
    colors.magenta(`${socket.username} telepaths you: "${text}"`)
  );

  return { type: MessageType.OUTPUT, message: colors.magenta(`You telepath ${target.username}: "${text}"`) };
}

export function handleBlock(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: /block <player>' };
  }

  const targetName = args[0];
  const target = findOnlinePlayer(targetName, connectedPlayers, socket.playerId);
  if (!target) {
    return { type: MessageType.ERROR, message: `${targetName} is not online.` };
  }

  socket.telepathBlocks.add(target.playerId);
  return { type: MessageType.SYSTEM, message: `You are now blocking telepaths from ${target.username}.` };
}

export function handleUnblock(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: /unblock <player>' };
  }

  const targetName = args[0];
  const target = findOnlinePlayer(targetName, connectedPlayers, socket.playerId);
  if (!target) {
    return { type: MessageType.ERROR, message: `${targetName} is not online.` };
  }

  socket.telepathBlocks.delete(target.playerId);
  return { type: MessageType.SYSTEM, message: `You are no longer blocking telepaths from ${target.username}.` };
}

// ---------------------------------------------------------------------------
// 7D: Shout
// ---------------------------------------------------------------------------
export function handleShout(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>,
  world: GameWorld
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Shout what?' };
  }

  const text = args.join(' ');
  const currentRoomId = getPlayerLocation(socket.playerId);

  // Same room: "<name> shouts: "<message>""
  broadcastToRoom(
    currentRoomId,
    colors.boldYellow(`${socket.username} shouts: "${text}"`),
    socket.playerId
  );

  // Adjacent rooms: "You hear <name> shout from the <opposite-direction>: "<message>""
  const room = world.getRoom(currentRoomId);
  if (room) {
    const notifiedRooms = new Set<number>();
    for (const [direction, targetRoomId] of room.exits) {
      if (notifiedRooms.has(targetRoomId)) continue;
      notifiedRooms.add(targetRoomId);

      const oppositeDir = OPPOSITE_DIRECTIONS[direction] || direction;
      const adjMsg = colors.boldYellow(
        `You hear ${socket.username} shout from the ${oppositeDir}: "${text}"`
      );

      // Send to all players in that adjacent room
      for (const [playerId, playerSocket] of connectedPlayers) {
        if (playerId !== socket.playerId && getPlayerLocation(playerId) === targetRoomId) {
          sendMessage(playerSocket, MessageType.OUTPUT, adjMsg);
        }
      }
    }
  }

  return { type: MessageType.OUTPUT, message: colors.boldYellow(`You shout: "${text}"`) };
}

// ---------------------------------------------------------------------------
// 7E: Broadcast channels
// ---------------------------------------------------------------------------
export function handleBroadcastCreate(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: broadcast create <name> [password]' };
  }

  const channelName = args[0].toLowerCase();
  const password = args[1] || null;

  if (broadcastChannels.has(channelName)) {
    return { type: MessageType.ERROR, message: `Broadcast channel "${channelName}" already exists.` };
  }

  // Leave current channel if any
  if (socket.broadcastChannel) {
    removeMemberFromChannel(socket, connectedPlayers);
  }

  const channel: BroadcastChannel = {
    name: channelName,
    password,
    members: new Set([socket.playerId]),
  };
  broadcastChannels.set(channelName, channel);
  socket.broadcastChannel = channelName;

  const passwordNote = password ? ` (password: ${password})` : '';
  return { type: MessageType.SYSTEM, message: `Broadcast channel "${channelName}" created and joined.${passwordNote}` };
}

export function handleJoinBroadcast(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: join br <name> [password]' };
  }

  const channelName = args[0].toLowerCase();
  const password = args[1] || null;

  const channel = broadcastChannels.get(channelName);
  if (!channel) {
    return { type: MessageType.ERROR, message: `Broadcast channel "${channelName}" does not exist.` };
  }

  if (channel.password && channel.password !== password) {
    return { type: MessageType.ERROR, message: 'Incorrect password.' };
  }

  // Leave current channel if different
  if (socket.broadcastChannel && socket.broadcastChannel !== channelName) {
    removeMemberFromChannel(socket, connectedPlayers);
  }

  if (socket.broadcastChannel === channelName) {
    return { type: MessageType.SYSTEM, message: `You are already in broadcast channel "${channelName}".` };
  }

  // Notify existing members before adding
  notifyChannel(channel, `${socket.username} has joined the channel.`, connectedPlayers);

  channel.members.add(socket.playerId);
  socket.broadcastChannel = channelName;

  return { type: MessageType.SYSTEM, message: `Joined broadcast channel "${channelName}".` };
}

export function handleLeaveBroadcast(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: leave <channelname>' };
  }

  const channelName = args[0].toLowerCase();

  if (!socket.broadcastChannel || socket.broadcastChannel !== channelName) {
    return { type: MessageType.ERROR, message: `You are not in broadcast channel "${channelName}".` };
  }

  removeMemberFromChannel(socket, connectedPlayers);
  return { type: MessageType.SYSTEM, message: `Left broadcast channel "${channelName}".` };
}

export function handleBroadcast(
  socket: AuthenticatedSocket,
  args: string[],
  connectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (!socket.broadcastChannel) {
    return { type: MessageType.ERROR, message: 'You are not in a broadcast channel. Use "broadcast create <name>" or "join br <name>".' };
  }

  const channel = broadcastChannels.get(socket.broadcastChannel);
  if (!channel) {
    socket.broadcastChannel = null;
    return { type: MessageType.ERROR, message: 'Your broadcast channel no longer exists.' };
  }

  // No args: list members
  if (args.length === 0) {
    const memberNames: string[] = [];
    for (const memberId of channel.members) {
      const memberSocket = connectedPlayers.get(memberId);
      if (memberSocket) {
        memberNames.push(memberSocket.username);
      }
    }
    const lines = [
      colors.boldCyan(`Broadcast channel: ${channel.name}`),
      wordWrap(`Members: ${memberNames.join(', ')}`),
    ];
    return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
  }

  // Send message to channel
  const text = args.join(' ');
  const othersMsg = colors.cyan(`[${channel.name}] ${socket.username}: "${text}"`);

  for (const memberId of channel.members) {
    if (memberId !== socket.playerId) {
      const memberSocket = connectedPlayers.get(memberId);
      if (memberSocket) {
        sendMessage(memberSocket, MessageType.OUTPUT, othersMsg);
      }
    }
  }

  return { type: MessageType.OUTPUT, message: colors.cyan(`[${channel.name}] You: "${text}"`) };
}

/**
 * Send a system notification to all members of a broadcast channel.
 */
function notifyChannel(
  channel: BroadcastChannel,
  message: string,
  connectedPlayers: Map<number, AuthenticatedSocket>,
  excludePlayerId?: number
): void {
  const formatted = colors.cyan(`[${channel.name}] ${message}`);
  for (const memberId of channel.members) {
    if (memberId === excludePlayerId) continue;
    const memberSocket = connectedPlayers.get(memberId);
    if (memberSocket) {
      sendMessage(memberSocket, MessageType.OUTPUT, formatted);
    }
  }
}

/**
 * Remove player from their current broadcast channel.
 * Auto-deletes the channel if empty. Notifies remaining members.
 */
function removeMemberFromChannel(
  socket: AuthenticatedSocket,
  connectedPlayers?: Map<number, AuthenticatedSocket>
): void {
  if (!socket.broadcastChannel) return;

  const channel = broadcastChannels.get(socket.broadcastChannel);
  if (channel) {
    channel.members.delete(socket.playerId);
    if (channel.members.size === 0) {
      broadcastChannels.delete(socket.broadcastChannel);
    } else if (connectedPlayers) {
      notifyChannel(channel, `${socket.username} has left the channel.`, connectedPlayers);
    }
  }
  socket.broadcastChannel = null;
}

/**
 * Clean up broadcast membership on disconnect.
 * Called from socket.ts close handler.
 */
export function cleanupBroadcastMembership(
  socket: AuthenticatedSocket,
  connectedPlayers?: Map<number, AuthenticatedSocket>
): void {
  removeMemberFromChannel(socket, connectedPlayers);
}
