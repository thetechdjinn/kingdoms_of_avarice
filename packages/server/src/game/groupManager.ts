import { MessageType } from '@koa/shared';
import { AuthenticatedSocket, sendMessage, connectedPlayers } from './socket.js';
import { getPlayerLocation } from './adminCommands.js';
import { findOnlinePlayer } from './playerUtils.js';
import { colors } from '../utils/colors.js';
import type { CommandResponse } from './commands.js';

// ---------------------------------------------------------------------------
// Group state (in-memory only)
// ---------------------------------------------------------------------------
interface PlayerGroup {
  id: string;
  leaderId: number;
  members: number[]; // ordered: leader first, then joiners in order
}

const groups = new Map<string, PlayerGroup>();
const playerGroupMap = new Map<number, string>(); // playerId → groupId

const MAX_GROUP_SIZE = 6;
const INVITE_EXPIRY_MS = 60_000; // 60 seconds

let nextGroupId = 1;

function generateGroupId(): string {
  return `group_${nextGroupId++}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the group for a player, or null if not in a group.
 */
export function getGroupForPlayer(playerId: number): PlayerGroup | null {
  const groupId = playerGroupMap.get(playerId);
  if (!groupId) return null;
  return groups.get(groupId) || null;
}

/**
 * Get the member IDs of a player's group.
 * Returns empty array if not in a group.
 */
export function getGroupMembers(playerId: number): number[] {
  const group = getGroupForPlayer(playerId);
  return group ? [...group.members] : [];
}

/**
 * Get the count of members in the player's group.
 * Returns 0 if not in a group.
 */
export function getGroupMemberCount(playerId: number): number {
  const group = getGroupForPlayer(playerId);
  return group ? group.members.length : 0;
}

/**
 * Check if a player is the leader of their group.
 */
export function isGroupLeader(playerId: number): boolean {
  const group = getGroupForPlayer(playerId);
  return group !== null && group.leaderId === playerId;
}

/**
 * Clean up a player's group membership on disconnect.
 * Notifies remaining group members. Handles leader succession.
 */
export function cleanupPlayerGroup(playerId: number): void {
  const group = getGroupForPlayer(playerId);
  if (!group) return;

  const playerSocket = connectedPlayers.get(playerId);
  const playerName = playerSocket?.username || 'Someone';

  removeFromGroup(playerId, group);

  // Notify remaining members
  for (const memberId of group.members) {
    const memberSocket = connectedPlayers.get(memberId);
    if (memberSocket) {
      sendMessage(memberSocket, MessageType.SYSTEM,
        colors.yellow(`${playerName} has left the group.`)
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

export function handleInvite(
  socket: AuthenticatedSocket,
  args: string[],
  allConnectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: invite <player>' };
  }

  const targetName = args[0];
  const currentRoomId = getPlayerLocation(socket.playerId);

  const target = findOnlinePlayer(targetName, allConnectedPlayers, socket.playerId);
  if (!target) {
    return { type: MessageType.ERROR, message: `${targetName} is not online.` };
  }

  // Must be in same room
  if (getPlayerLocation(target.playerId) !== currentRoomId) {
    return { type: MessageType.ERROR, message: `${target.username} is not in this room.` };
  }

  // Check if target is already in a group
  if (getGroupForPlayer(target.playerId)) {
    return { type: MessageType.ERROR, message: `${target.username} is already in a group.` };
  }

  // Get or create caller's group (lazy creation)
  let group = getGroupForPlayer(socket.playerId);
  if (!group) {
    const groupId = generateGroupId();
    group = { id: groupId, leaderId: socket.playerId, members: [socket.playerId] };
    groups.set(groupId, group);
    playerGroupMap.set(socket.playerId, groupId);
  }

  // Only leader can invite
  if (group.leaderId !== socket.playerId) {
    return { type: MessageType.ERROR, message: 'Only the group leader can invite players.' };
  }

  // Check size limit
  if (group.members.length >= MAX_GROUP_SIZE) {
    return { type: MessageType.ERROR, message: `Group is full (max ${MAX_GROUP_SIZE} members).` };
  }

  // Set pending invite on target
  target.pendingGroupInvite = {
    groupId: group.id,
    leaderId: socket.playerId,
    leaderName: socket.username,
    expiresAt: Date.now() + INVITE_EXPIRY_MS,
  };

  // Notify target
  sendMessage(target, MessageType.SYSTEM,
    colors.yellow(`${socket.username} has invited you to join their group. Type "join ${socket.username}" to accept.`)
  );

  return { type: MessageType.SYSTEM, message: colors.yellow(`You have invited ${target.username} to join the group.`) };
}

export function handleJoinGroup(
  socket: AuthenticatedSocket,
  args: string[],
  allConnectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: join <leader name>' };
  }

  // Already in a group
  if (getGroupForPlayer(socket.playerId)) {
    return { type: MessageType.ERROR, message: 'You are already in a group. Use "leave" to leave first.' };
  }

  // Check for pending invite
  const invite = socket.pendingGroupInvite;
  if (!invite) {
    return { type: MessageType.ERROR, message: 'You have no pending group invitation.' };
  }

  // Check expiry
  if (Date.now() > invite.expiresAt) {
    socket.pendingGroupInvite = null;
    return { type: MessageType.ERROR, message: 'The group invitation has expired.' };
  }

  // Check the group still exists
  const group = groups.get(invite.groupId);
  if (!group) {
    socket.pendingGroupInvite = null;
    return { type: MessageType.ERROR, message: 'The group no longer exists.' };
  }

  // Verify the inviter is still the group leader (guards against stale invites after succession)
  if (group.leaderId !== invite.leaderId) {
    socket.pendingGroupInvite = null;
    return { type: MessageType.ERROR, message: 'The group leader has changed. Ask for a new invite.' };
  }

  // Verify the leader name matches arg (partial match)
  const leaderArg = args[0].toLowerCase();
  if (!invite.leaderName.toLowerCase().startsWith(leaderArg)) {
    return { type: MessageType.ERROR, message: 'You have no pending group invitation from that player.' };
  }

  // Must be in same room as leader
  const leaderSocket = allConnectedPlayers.get(group.leaderId);
  if (!leaderSocket) {
    socket.pendingGroupInvite = null;
    return { type: MessageType.ERROR, message: 'The group leader is no longer online.' };
  }

  if (getPlayerLocation(socket.playerId) !== getPlayerLocation(leaderSocket.playerId)) {
    return { type: MessageType.ERROR, message: 'You must be in the same room as the group leader to join.' };
  }

  // Check size limit
  if (group.members.length >= MAX_GROUP_SIZE) {
    socket.pendingGroupInvite = null;
    return { type: MessageType.ERROR, message: 'The group is full.' };
  }

  // Join the group
  group.members.push(socket.playerId);
  playerGroupMap.set(socket.playerId, group.id);
  socket.groupId = group.id;
  socket.pendingGroupInvite = null;

  // Notify all group members
  for (const memberId of group.members) {
    if (memberId !== socket.playerId) {
      const memberSocket = allConnectedPlayers.get(memberId);
      if (memberSocket) {
        sendMessage(memberSocket, MessageType.SYSTEM,
          colors.yellow(`${socket.username} has joined the group.`)
        );
      }
    }
  }

  return { type: MessageType.SYSTEM, message: colors.yellow(`You have joined ${invite.leaderName}'s group.`) };
}

export function handleLeaveGroup(
  socket: AuthenticatedSocket,
  allConnectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  const group = getGroupForPlayer(socket.playerId);
  if (!group) {
    return { type: MessageType.ERROR, message: 'You are not in a group.' };
  }

  removeFromGroup(socket.playerId, group);

  // Notify remaining members
  for (const memberId of group.members) {
    const memberSocket = allConnectedPlayers.get(memberId);
    if (memberSocket) {
      sendMessage(memberSocket, MessageType.SYSTEM,
        colors.yellow(`${socket.username} has left the group.`)
      );
    }
  }

  return { type: MessageType.SYSTEM, message: colors.yellow('You have left the group.') };
}

export function handleKick(
  socket: AuthenticatedSocket,
  args: string[],
  allConnectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  if (args.length === 0) {
    return { type: MessageType.ERROR, message: 'Usage: kick <player>' };
  }

  const group = getGroupForPlayer(socket.playerId);
  if (!group) {
    return { type: MessageType.ERROR, message: 'You are not in a group.' };
  }

  if (group.leaderId !== socket.playerId) {
    return { type: MessageType.ERROR, message: 'Only the group leader can kick members.' };
  }

  const targetName = args[0].toLowerCase();
  // Find the target in the group
  let targetId: number | null = null;
  let targetSocket: AuthenticatedSocket | null = null;
  for (const memberId of group.members) {
    if (memberId === socket.playerId) continue;
    const memberSocket = allConnectedPlayers.get(memberId);
    if (memberSocket && (memberSocket.username.toLowerCase() === targetName || memberSocket.username.toLowerCase().startsWith(targetName))) {
      targetId = memberId;
      targetSocket = memberSocket;
      break;
    }
  }

  if (!targetId || !targetSocket) {
    return { type: MessageType.ERROR, message: 'That player is not in your group.' };
  }

  const kickedName = targetSocket.username;
  removeFromGroup(targetId, group);

  // Notify kicked player
  sendMessage(targetSocket, MessageType.SYSTEM,
    colors.yellow(`You have been kicked from the group by ${socket.username}.`)
  );

  // Notify remaining members
  for (const memberId of group.members) {
    const memberSocket = allConnectedPlayers.get(memberId);
    if (memberSocket) {
      sendMessage(memberSocket, MessageType.SYSTEM,
        colors.yellow(`${kickedName} has been kicked from the group.`)
      );
    }
  }

  return { type: MessageType.SYSTEM, message: colors.yellow(`You kicked ${kickedName} from the group.`) };
}

export function handleGroupChat(
  socket: AuthenticatedSocket,
  args: string[],
  allConnectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  const group = getGroupForPlayer(socket.playerId);
  if (!group) {
    return { type: MessageType.ERROR, message: 'You are not in a group.' };
  }

  // No args: show group status
  if (args.length === 0) {
    return showGroupStatus(socket, group, allConnectedPlayers);
  }

  // Send message to group
  const text = args.join(' ');
  const othersMsg = colors.yellow(`${socket.username} group chats: "${text}"`);

  for (const memberId of group.members) {
    if (memberId !== socket.playerId) {
      const memberSocket = allConnectedPlayers.get(memberId);
      if (memberSocket) {
        sendMessage(memberSocket, MessageType.OUTPUT, othersMsg);
      }
    }
  }

  return { type: MessageType.OUTPUT, message: colors.yellow(`You group chat: "${text}"`) };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Remove a player from their group. Handles leader succession and group dissolution.
 */
function removeFromGroup(playerId: number, group: PlayerGroup): void {
  const idx = group.members.indexOf(playerId);
  if (idx === -1) return;

  group.members.splice(idx, 1);
  playerGroupMap.delete(playerId);

  // Update socket
  const socket = connectedPlayers.get(playerId);
  if (socket) {
    socket.groupId = null;
  }

  // If group is now empty, delete it
  if (group.members.length === 0) {
    groups.delete(group.id);
    return;
  }

  // If group has 1 member left, dissolve
  if (group.members.length === 1) {
    const lastMemberId = group.members[0];
    const lastSocket = connectedPlayers.get(lastMemberId);
    if (lastSocket) {
      sendMessage(lastSocket, MessageType.SYSTEM,
        colors.yellow('The group has been disbanded.')
      );
      lastSocket.groupId = null;
    }
    playerGroupMap.delete(lastMemberId);
    groups.delete(group.id);
    return;
  }

  // Leader succession: if the departing player was leader, promote first member
  if (group.leaderId === playerId) {
    group.leaderId = group.members[0];
    const newLeaderSocket = connectedPlayers.get(group.leaderId);
    if (newLeaderSocket) {
      sendMessage(newLeaderSocket, MessageType.SYSTEM,
        colors.yellow('You are now the group leader.')
      );
    }
  }
}

function showGroupStatus(
  socket: AuthenticatedSocket,
  group: PlayerGroup,
  allConnectedPlayers: Map<number, AuthenticatedSocket>
): CommandResponse {
  const lines: string[] = [
    colors.boldYellow('Group Members:'),
    '',
  ];

  for (const memberId of group.members) {
    const memberSocket = allConnectedPlayers.get(memberId);
    if (!memberSocket) continue;

    const isLeader = memberId === group.leaderId;
    const leaderMark = isLeader ? '*' : ' ';
    const hpPercent = memberSocket.vitals.maxHp > 0
      ? Math.round((memberSocket.vitals.hp / memberSocket.vitals.maxHp) * 100)
      : 0;
    const maxResource = memberSocket.vitals.maxResource ?? 0;
    const resource = memberSocket.vitals.resource ?? 0;
    const mpPercent = maxResource > 0
      ? Math.round((resource / maxResource) * 100)
      : 0;

    lines.push(
      `  ${leaderMark} ${memberSocket.username.padEnd(16)} HP: ${String(hpPercent).padStart(3)}%  Mana: ${String(mpPercent).padStart(3)}%`
    );
  }

  lines.push('');
  lines.push(colors.gray('  * = group leader'));

  return { type: MessageType.OUTPUT, message: lines.join('\r\n') };
}
