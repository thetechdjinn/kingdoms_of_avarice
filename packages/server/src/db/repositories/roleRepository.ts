import { query } from '../index.js';
import { Role, RoleInfo } from '@koa/shared';

interface DbRole {
  id: number;
  name: string;
  description: string;
  priority: number;
}

interface DbPlayerRole {
  id: number;
  player_id: number;
  role_id: number;
  granted_at: Date;
  granted_by: number | null;
}

// Initialize default roles in database
export async function initializeRoles(): Promise<void> {
  for (const [roleKey, info] of Object.entries(RoleInfo)) {
    await query(
      `INSERT INTO roles (name, description, priority)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET description = $2, priority = $3`,
      [roleKey, info.description, info.priority]
    );
  }
  console.log('Roles initialized');
}

// Get role ID by name
export async function getRoleId(roleName: Role): Promise<number | null> {
  const result = await query<DbRole>(
    'SELECT id FROM roles WHERE name = $1',
    [roleName]
  );
  return result.rows[0]?.id || null;
}

// Get all roles for a player
export async function getPlayerRoles(playerId: number): Promise<Role[]> {
  const result = await query<{ name: string }>(
    `SELECT r.name FROM roles r
     JOIN player_roles pr ON r.id = pr.role_id
     WHERE pr.player_id = $1`,
    [playerId]
  );
  return result.rows.map(row => row.name as Role);
}

// Assign a role to a player
export async function assignRole(
  playerId: number,
  role: Role,
  grantedBy?: number
): Promise<boolean> {
  const roleId = await getRoleId(role);
  if (!roleId) {
    console.error(`Role ${role} not found in database`);
    return false;
  }

  try {
    await query(
      `INSERT INTO player_roles (player_id, role_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (player_id, role_id) DO NOTHING`,
      [playerId, roleId, grantedBy || null]
    );
    return true;
  } catch (error) {
    console.error('Failed to assign role:', error);
    return false;
  }
}

// Remove a role from a player
export async function removeRole(playerId: number, role: Role): Promise<boolean> {
  const roleId = await getRoleId(role);
  if (!roleId) return false;

  const result = await query(
    'DELETE FROM player_roles WHERE player_id = $1 AND role_id = $2',
    [playerId, roleId]
  );
  return (result.rowCount ?? 0) > 0;
}

// Check if player has a specific role
export async function playerHasRole(playerId: number, role: Role): Promise<boolean> {
  const roles = await getPlayerRoles(playerId);
  // Admin has all roles
  if (roles.includes(Role.ADMIN)) return true;
  return roles.includes(role);
}

// Check if player has any of the specified roles
export async function playerHasAnyRole(playerId: number, roles: Role[]): Promise<boolean> {
  const playerRoles = await getPlayerRoles(playerId);
  if (playerRoles.includes(Role.ADMIN)) return true;
  return roles.some(role => playerRoles.includes(role));
}

// Check if player can play (has Player role or higher)
export async function playerCanPlay(playerId: number): Promise<boolean> {
  const roles = await getPlayerRoles(playerId);
  if (roles.includes(Role.ADMIN)) return true;
  // Must have Player role (not just Pending)
  return roles.includes(Role.PLAYER) || 
         roles.includes(Role.MODERATOR) || 
         roles.includes(Role.SYSOP) || 
         roles.includes(Role.DEVELOPER);
}

// Check if player can create content (Developer or Admin)
export async function playerCanCreateContent(playerId: number): Promise<boolean> {
  return playerHasAnyRole(playerId, [Role.DEVELOPER, Role.ADMIN]);
}

// Get all players with a specific role
export async function getPlayersWithRole(role: Role): Promise<number[]> {
  const roleId = await getRoleId(role);
  if (!roleId) return [];

  const result = await query<{ player_id: number }>(
    'SELECT player_id FROM player_roles WHERE role_id = $1',
    [roleId]
  );
  return result.rows.map(row => row.player_id);
}

// Get all pending players (for approval)
export async function getPendingPlayers(): Promise<{ id: number; username: string }[]> {
  const result = await query<{ id: number; username: string }>(
    `SELECT p.id, p.username FROM players p
     JOIN player_roles pr ON p.id = pr.player_id
     JOIN roles r ON pr.role_id = r.id
     WHERE r.name = $1
     AND NOT EXISTS (
       SELECT 1 FROM player_roles pr2
       JOIN roles r2 ON pr2.role_id = r2.id
       WHERE pr2.player_id = p.id AND r2.name = $2
     )`,
    [Role.PENDING, Role.PLAYER]
  );
  return result.rows;
}

// Approve a pending player (add Player role)
export async function approvePlayer(playerId: number, approvedBy: number): Promise<boolean> {
  return assignRole(playerId, Role.PLAYER, approvedBy);
}
