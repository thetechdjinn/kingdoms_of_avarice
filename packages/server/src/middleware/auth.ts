import { Request, Response, NextFunction } from 'express';
import { Role, hasAnyRole } from '@koa/shared';
import { verifyToken, COOKIE_NAME, TokenPayload } from '../routes/auth.js';
import * as roleRepo from '../db/repositories/roleRepository.js';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies[COOKIE_NAME];
  
  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  next();
}

// Middleware factory to require specific roles
// Re-fetches roles from DB to enforce immediate revocation
export function requireRoles(...requiredRoles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    // Fetch current roles from DB to ensure revocations take effect immediately
    try {
      const currentRoles = await roleRepo.getPlayerRoles(payload.playerId);
      payload.roles = currentRoles;
    } catch {
      // If DB is unavailable, fall back to token roles
    }

    req.user = payload;

    if (!hasAnyRole(payload.roles ?? [], requiredRoles)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

// Middleware to require Developer or Admin role
export const requireDeveloper = requireRoles(Role.DEVELOPER, Role.ADMIN);

// Middleware to require Moderator or higher
export const requireModerator = requireRoles(Role.MODERATOR, Role.SYSOP, Role.ADMIN);

// Middleware to require Admin role
export const requireAdmin = requireRoles(Role.ADMIN);
