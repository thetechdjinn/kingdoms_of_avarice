import { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthResponse, Role } from '@koa/shared';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as roleRepo from '../db/repositories/roleRepository.js';

const COOKIE_NAME = 'koa_token';

// Lazy accessor — reads process.env at call time (after dotenv has loaded)
let _jwtSecret: string | null = null;
function getJwtSecret(): string {
  if (!_jwtSecret) {
    _jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  }
  return _jwtSecret;
}

let _jwtWarningLogged = false;
function checkJwtWarning(): void {
  if (_jwtWarningLogged) return;
  _jwtWarningLogged = true;
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[AUTH] CRITICAL: JWT_SECRET is not set! Tokens are signed with a hardcoded default. Set JWT_SECRET in your environment.');
    } else {
      console.warn('[AUTH] WARNING: JWT_SECRET is not set. Using default dev secret. Do not use this in production.');
    }
  }
}

// Fallback in-memory storage if database is unavailable
const fallbackUsers = new Map<string, { id: number; passwordHash: string }>();
let useDatabase = true;

export function setDatabaseMode(enabled: boolean): void {
  useDatabase = enabled;
}

export function setupAuthRoutes(app: Express): void {
  // Check JWT_SECRET now that dotenv has loaded
  checkJwtWarning();

  app.post('/api/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      const response: AuthResponse = { success: false, message: 'Username and password required' };
      res.json(response);
      return;
    }

    try {
      if (useDatabase) {
        const player = await playerRepo.findPlayerByUsername(username);
        if (!player) {
          const response: AuthResponse = { success: false, message: 'Invalid credentials' };
          res.json(response);
          return;
        }

        const valid = await playerRepo.validatePassword(player, password);
        if (!valid) {
          const response: AuthResponse = { success: false, message: 'Invalid credentials' };
          res.json(response);
          return;
        }

        // Check if player can play (has Player role or higher)
        const canPlay = await roleRepo.playerCanPlay(player.id);
        if (!canPlay) {
          const response: AuthResponse = { success: false, message: 'Your account is pending approval' };
          res.json(response);
          return;
        }

        await playerRepo.updateLastLogin(player.id);
        
        // Get player roles for token
        const roles = await roleRepo.getPlayerRoles(player.id);

        const token = jwt.sign({ playerId: player.id, username: player.username, roles }, getJwtSecret(), { expiresIn: '24h' });

        res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000,
        });

        const response: AuthResponse = { success: true, playerId: player.id };
        res.json(response);
      } else {
        // Fallback to in-memory
        const user = fallbackUsers.get(username);
        if (!user) {
          const response: AuthResponse = { success: false, message: 'Invalid credentials' };
          res.json(response);
          return;
        }

        const bcrypt = await import('bcryptjs');
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          const response: AuthResponse = { success: false, message: 'Invalid credentials' };
          res.json(response);
          return;
        }

        const token = jwt.sign({ playerId: user.id, username, roles: [] }, getJwtSecret(), { expiresIn: '24h' });

        res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000,
        });

        const response: AuthResponse = { success: true, playerId: user.id };
        res.json(response);
      }
    } catch (error) {
      console.error('Login error:', error);
      const response: AuthResponse = { success: false, message: 'Server error' };
      res.json(response);
    }
  });

  app.post('/api/register', async (req: Request, res: Response) => {
    const { username, password, email } = req.body;

    if (!username || !password) {
      const response: AuthResponse = { success: false, message: 'Username and password required' };
      res.json(response);
      return;
    }

    if (username.length < 3 || username.length > 20) {
      const response: AuthResponse = { success: false, message: 'Username must be 3-20 characters' };
      res.json(response);
      return;
    }

    if (password.length < 6) {
      const response: AuthResponse = { success: false, message: 'Password must be at least 6 characters' };
      res.json(response);
      return;
    }

    try {
      if (useDatabase) {
        const exists = await playerRepo.playerExists(username);
        if (exists) {
          const response: AuthResponse = { success: false, message: 'Username already exists' };
          res.json(response);
          return;
        }

        const player = await playerRepo.createPlayer({ username, password, email });
        
        // Assign Pending role to new registrations
        await roleRepo.assignRole(player.id, Role.PENDING);
        
        const response: AuthResponse = { success: true, message: 'Registration successful. Your account is pending approval.' };
        res.json(response);
      } else {
        // Fallback to in-memory
        if (fallbackUsers.has(username)) {
          const response: AuthResponse = { success: false, message: 'Username already exists' };
          res.json(response);
          return;
        }

        const bcrypt = await import('bcryptjs');
        const hash = await bcrypt.hash(password, 10);
        const id = fallbackUsers.size + 1;
        fallbackUsers.set(username, { id, passwordHash: hash });

        const response: AuthResponse = { success: true, message: 'Registration successful' };
        res.json(response);
      }
    } catch (error) {
      console.error('Registration error:', error);
      const response: AuthResponse = { success: false, message: 'Server error' };
      res.json(response);
    }
  });

  app.post('/api/logout', (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
  });

  // Admin: Get pending users
  app.get('/api/admin/pending-users', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Check if user is admin
    const isAdmin = payload.roles?.includes(Role.ADMIN);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    try {
      const pendingUsers = await roleRepo.getPendingPlayers();
      res.json({ users: pendingUsers });
    } catch (error) {
      console.error('Error fetching pending users:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Admin: Approve a user
  app.post('/api/admin/approve-user', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Check if user is admin
    const isAdmin = payload.roles?.includes(Role.ADMIN);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { playerId } = req.body;
    
    // Validate playerId is a positive integer
    if (!playerId || typeof playerId !== 'number' || !Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'Valid player ID required' });
      return;
    }

    try {
      const success = await roleRepo.approvePlayer(playerId, payload.playerId);
      if (success) {
        res.json({ success: true, message: 'User approved' });
      } else {
        res.status(500).json({ error: 'Failed to approve user' });
      }
    } catch (error) {
      console.error('Error approving user:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Check current authentication status and roles
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    
    if (!token) {
      res.json({ authenticated: false });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      playerId: payload.playerId,
      username: payload.username,
      roles: payload.roles,
    });
  });
}

export interface TokenPayload {
  playerId: number;
  username: string;
  roles: Role[];
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
