import { Express, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import * as ipAccessRepo from '../db/repositories/ipAccessRepository.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import { resolveHostnameImmediate } from '../services/dnsResolver.js';

export function setupAdminRoutes(app: Express): void {
  // GET /api/admin/settings - Get all settings
  app.get('/api/admin/settings', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const settings = await settingsRepo.getAllSettings();
      res.json({ success: true, settings });
    } catch (error) {
      console.error('Failed to get settings:', error);
      res.status(500).json({ success: false, message: 'Failed to get settings' });
    }
  });

  // PUT /api/admin/settings/:key - Update a setting
  app.put('/api/admin/settings/:key', requireAdmin, async (req: Request, res: Response) => {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      res.status(400).json({ success: false, message: 'Value is required' });
      return;
    }

    // Validate specific settings
    if (key === 'max_characters_per_player') {
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < 1 || numValue > 100) {
        res.status(400).json({ success: false, message: 'Max characters must be between 1 and 100' });
        return;
      }
    } else if (key === 'ip_access_mode') {
      if (value !== 'allowlist' && value !== 'blocklist') {
        res.status(400).json({ success: false, message: 'IP access mode must be "allowlist" or "blocklist"' });
        return;
      }
    }

    try {
      await settingsRepo.setSetting(key, value);
      res.json({ success: true, message: 'Setting updated' });
    } catch (error) {
      console.error('Failed to update setting:', error);
      res.status(500).json({ success: false, message: 'Failed to update setting' });
    }
  });

  // GET /api/admin/ip-access - List all IP access rules
  app.get('/api/admin/ip-access', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const entries = await ipAccessRepo.getAllEntries();
      res.json({ success: true, entries });
    } catch (error) {
      console.error('Failed to get IP access entries:', error);
      res.status(500).json({ success: false, message: 'Failed to get IP access entries' });
    }
  });

  // POST /api/admin/ip-access - Add IP access rule
  app.post('/api/admin/ip-access', requireAdmin, async (req: Request, res: Response) => {
    const { entry, entryType, listType, reason } = req.body;

    // Validate required fields
    if (!entry || typeof entry !== 'string') {
      res.status(400).json({ success: false, message: 'Entry (IP or hostname) is required' });
      return;
    }

    if (entryType !== 'ip' && entryType !== 'hostname') {
      res.status(400).json({ success: false, message: 'Entry type must be "ip" or "hostname"' });
      return;
    }

    if (listType !== 'allow' && listType !== 'block') {
      res.status(400).json({ success: false, message: 'List type must be "allow" or "block"' });
      return;
    }

    // Validate IP format if entryType is 'ip'
    if (entryType === 'ip') {
      // IPv4 validation with proper octet range checking (0-255)
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      // IPv6 validation (simplified - covers most common formats)
      const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/;

      if (!ipv4Regex.test(entry) && !ipv6Regex.test(entry)) {
        res.status(400).json({ success: false, message: 'Invalid IP address format' });
        return;
      }
    }

    try {
      // Check if entry already exists
      const exists = await ipAccessRepo.entryExists(entry);
      if (exists) {
        res.status(400).json({ success: false, message: 'Entry already exists' });
        return;
      }

      // If hostname, resolve it immediately
      let resolvedIps: string[] | undefined;
      if (entryType === 'hostname') {
        resolvedIps = await resolveHostnameImmediate(entry);
        if (resolvedIps.length === 0) {
          res.status(400).json({ success: false, message: 'Could not resolve hostname' });
          return;
        }
      }

      const newEntry = await ipAccessRepo.createEntry(
        entry.trim(),
        entryType,
        listType,
        reason || undefined,
        req.user?.playerId,
        resolvedIps
      );

      res.json({ success: true, entry: newEntry });
    } catch (error) {
      console.error('Failed to create IP access entry:', error);
      res.status(500).json({ success: false, message: 'Failed to create IP access entry' });
    }
  });

  // DELETE /api/admin/ip-access/:id - Delete IP access rule
  app.delete('/api/admin/ip-access/:id', requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Invalid entry ID' });
      return;
    }

    try {
      const deleted = await ipAccessRepo.deleteEntry(id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Entry not found' });
        return;
      }

      res.json({ success: true, message: 'Entry deleted' });
    } catch (error) {
      console.error('Failed to delete IP access entry:', error);
      res.status(500).json({ success: false, message: 'Failed to delete IP access entry' });
    }
  });

  // GET /api/admin/players - List all players with their character limits
  app.get('/api/admin/players', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const players = await playerRepo.getAllPlayers();
      res.json({ success: true, players });
    } catch (error) {
      console.error('Failed to get players:', error);
      res.status(500).json({ success: false, message: 'Failed to get players' });
    }
  });

  // PUT /api/admin/players/:id/max-characters - Set player's character limit override
  app.put('/api/admin/players/:id/max-characters', requireAdmin, async (req: Request, res: Response) => {
    const playerId = parseInt(req.params.id);
    if (isNaN(playerId) || playerId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid player ID' });
      return;
    }

    const { maxCharacters } = req.body;

    // null means use global default, otherwise validate number
    if (maxCharacters !== null) {
      const numValue = Number(maxCharacters);
      if (isNaN(numValue) || numValue < 1 || numValue > 100) {
        res.status(400).json({ success: false, message: 'Max characters must be between 1 and 100, or null for default' });
        return;
      }
    }

    try {
      const player = await playerRepo.findPlayerById(playerId);
      if (!player) {
        res.status(404).json({ success: false, message: 'Player not found' });
        return;
      }

      await playerRepo.setMaxCharacters(playerId, maxCharacters);
      res.json({ success: true, message: 'Player character limit updated' });
    } catch (error) {
      console.error('Failed to update player character limit:', error);
      res.status(500).json({ success: false, message: 'Failed to update player character limit' });
    }
  });
}
