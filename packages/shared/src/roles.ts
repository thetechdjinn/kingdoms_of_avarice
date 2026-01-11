// Role-Based Access Control (RBAC) constants and types

export enum Role {
  PENDING = 'pending',
  PLAYER = 'player',
  MODERATOR = 'moderator',
  SYSOP = 'sysop',
  DEVELOPER = 'developer',
  ADMIN = 'admin',
}

export const RoleInfo: Record<Role, { name: string; description: string; priority: number }> = {
  [Role.PENDING]: {
    name: 'Pending',
    description: 'Registered but not yet approved to play',
    priority: 0,
  },
  [Role.PLAYER]: {
    name: 'Player',
    description: 'Approved player with rights to play the game',
    priority: 10,
  },
  [Role.MODERATOR]: {
    name: 'Game Moderator',
    description: 'Can assist or block players in game',
    priority: 20,
  },
  [Role.SYSOP]: {
    name: 'Game Sysop',
    description: 'Extended moderation capabilities',
    priority: 30,
  },
  [Role.DEVELOPER]: {
    name: 'Developer',
    description: 'Can create game content (rooms, items, monsters)',
    priority: 40,
  },
  [Role.ADMIN]: {
    name: 'System Admin',
    description: 'Full control over all game systems',
    priority: 100,
  },
};

// Helper to check if a user has a specific role or higher privilege
export function hasRole(userRoles: Role[], requiredRole: Role): boolean {
  // Admin has access to everything
  if (userRoles.includes(Role.ADMIN)) {
    return true;
  }
  return userRoles.includes(requiredRole);
}

// Helper to check if user has any of the specified roles
export function hasAnyRole(userRoles: Role[], requiredRoles: Role[]): boolean {
  if (userRoles.includes(Role.ADMIN)) {
    return true;
  }
  return requiredRoles.some(role => userRoles.includes(role));
}

// Check if user can play the game (has Player role or higher, not just Pending)
export function canPlay(userRoles: Role[]): boolean {
  if (userRoles.includes(Role.ADMIN)) {
    return true;
  }
  // Must have at least Player role (not just Pending)
  return userRoles.some(role => role !== Role.PENDING && RoleInfo[role].priority >= RoleInfo[Role.PLAYER].priority);
}

// Check if user can create/edit game content
export function canCreateContent(userRoles: Role[]): boolean {
  return hasAnyRole(userRoles, [Role.DEVELOPER, Role.ADMIN]);
}

// Check if user can moderate
export function canModerate(userRoles: Role[]): boolean {
  return hasAnyRole(userRoles, [Role.MODERATOR, Role.SYSOP, Role.ADMIN]);
}
