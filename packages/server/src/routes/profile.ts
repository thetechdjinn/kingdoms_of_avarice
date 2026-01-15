import { Express, Request, Response } from 'express';
import { verifyToken, COOKIE_NAME } from './auth.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';

export function setupProfileRoutes(app: Express): void {
  // GET /api/profile - Get current player profile
  app.get('/api/profile', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    try {
      const player = await playerRepo.findPlayerById(payload.playerId);
      if (!player) {
        res.status(404).json({ success: false, message: 'Player not found' });
        return;
      }

      const characterCount = await characterRepo.getCharacterCount(payload.playerId);
      const globalMaxCharacters = await settingsRepo.getMaxCharactersPerPlayer();
      const maxCharacters = player.max_characters ?? globalMaxCharacters;

      res.json({
        success: true,
        profile: {
          username: player.username,
          email: player.email,
          characterCount,
          maxCharacters,
          roles: payload.roles || [],
        },
      });
    } catch (error) {
      console.error('Failed to get profile:', error);
      res.status(500).json({ success: false, message: 'Failed to get profile' });
    }
  });

  // PUT /api/profile/email - Update email
  app.put('/api/profile/email', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const { email } = req.body;

    // Trim and validate email format if provided
    const trimmedEmail = typeof email === 'string' ? email.trim() : email;

    if (trimmedEmail !== null && trimmedEmail !== undefined && trimmedEmail !== '') {
      if (typeof trimmedEmail !== 'string') {
        res.status(400).json({ success: false, message: 'Invalid email format' });
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        res.status(400).json({ success: false, message: 'Invalid email format' });
        return;
      }
    }

    try {
      await playerRepo.updateEmail(payload.playerId, trimmedEmail || null);
      res.json({ success: true, message: 'Email updated' });
    } catch (error) {
      console.error('Failed to update email:', error);
      res.status(500).json({ success: false, message: 'Failed to update email' });
    }
  });

  // PUT /api/profile/password - Change password
  app.put('/api/profile/password', async (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || typeof currentPassword !== 'string') {
      res.status(400).json({ success: false, message: 'Current password is required' });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string') {
      res.status(400).json({ success: false, message: 'New password is required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      return;
    }

    try {
      const player = await playerRepo.findPlayerById(payload.playerId);
      if (!player) {
        res.status(404).json({ success: false, message: 'Player not found' });
        return;
      }

      // Verify current password
      const isValid = await playerRepo.validatePassword(player, currentPassword);
      if (!isValid) {
        res.status(401).json({ success: false, message: 'Current password is incorrect' });
        return;
      }

      // Update password
      await playerRepo.updatePassword(payload.playerId, newPassword);
      res.json({ success: true, message: 'Password updated' });
    } catch (error) {
      console.error('Failed to update password:', error);
      res.status(500).json({ success: false, message: 'Failed to update password' });
    }
  });
}
