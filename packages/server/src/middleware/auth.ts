import { Request, Response, NextFunction } from 'express';
import { Role, hasAnyRole } from '@koa/shared';
import { verifyToken, COOKIE_NAME, TokenPayload } from '../routes/auth.js';

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
export function requireRoles(...requiredRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
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

    // Check if user has any of the required roles (Admin always passes)
    if (!hasAnyRole(payload.roles, requiredRoles)) {
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
