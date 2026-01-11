import { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthResponse, Role } from '@koa/shared';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as roleRepo from '../db/repositories/roleRepository.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const COOKIE_NAME = 'koa_token';

// Fallback in-memory storage if database is unavailable
const fallbackUsers = new Map<string, { id: number; passwordHash: string }>();
let useDatabase = true;

export function setDatabaseMode(enabled: boolean): void {
  useDatabase = enabled;
}

export function setupAuthRoutes(app: Express): void {
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

        const token = jwt.sign({ playerId: player.id, username, roles }, JWT_SECRET, { expiresIn: '24h' });

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

        const bcrypt = await import('bcrypt');
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          const response: AuthResponse = { success: false, message: 'Invalid credentials' };
          res.json(response);
          return;
        }

        const token = jwt.sign({ playerId: user.id, username }, JWT_SECRET, { expiresIn: '24h' });

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

        const bcrypt = await import('bcrypt');
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
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
