import { Express, Request as ExpressRequest, Response } from 'express';
type Request = ExpressRequest<Record<string, string>>;
import net from 'net';
import { requireAdmin } from '../middleware/auth.js';
import { getClientIpFromRequest } from '../middleware/ipAccess.js';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import * as ipAccessRepo from '../db/repositories/ipAccessRepository.js';
import * as playerRepo from '../db/repositories/playerRepository.js';
import * as characterRepo from '../db/repositories/characterRepository.js';
import * as roleRepo from '../db/repositories/roleRepository.js';
import { resolveHostnameImmediate } from '../services/dnsResolver.js';
import { Role } from '@koa/shared';

export function setupAdminRoutes(app: Express): void {
  // GET /api/ip-check - Check if caller's IP is allowed (used by Vite dev server)
  // This endpoint does NOT require authentication - it just checks IP access rules
  app.get('/api/ip-check', async (req: Request, res: Response) => {
    try {
      // Get client IP using centralized extraction (respects TRUST_PROXY setting)
      const clientIp = getClientIpFromRequest(req);

      // Normalize IPv6-mapped IPv4 addresses
      const normalizedIp = clientIp.startsWith('::ffff:') ? clientIp.slice(7) : clientIp;

      // Always allow localhost
      const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' ||
                          clientIp === '::ffff:127.0.0.1' || normalizedIp === '127.0.0.1' ||
                          normalizedIp.startsWith('127.');
      if (isLocalhost) {
        res.json({ allowed: true });
        return;
      }

      // Check IP access mode and rules
      const mode = await settingsRepo.getIpAccessMode();

      if (mode === 'allowlist') {
        const isAllowed = await ipAccessRepo.isIpAllowed(clientIp);
        res.json({ allowed: isAllowed });
      } else {
        const isBlocked = await ipAccessRepo.isIpBlocked(clientIp);
        res.json({ allowed: !isBlocked });
      }
    } catch (error) {
      console.error('Failed to check IP access:', error);
      // Fail open on error
      res.json({ allowed: true });
    }
  });

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

  // GET /api/admin/settings/all - Get all settings as raw key-value pairs (for settings editor)
  app.get('/api/admin/settings/all', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const settings = await settingsRepo.getAllSettingsRaw();
      res.json({ success: true, settings });
    } catch (error) {
      console.error('Failed to get all settings:', error);
      res.status(500).json({ success: false, message: 'Failed to get all settings' });
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
    } else if (key === 'currency_runic_name') {
      if (typeof value !== 'string') {
        res.status(400).json({ success: false, message: 'Runic name must be a string' });
        return;
      }
      const trimmedName = value.trim();
      if (trimmedName.length === 0) {
        res.status(400).json({ success: false, message: 'Runic name cannot be empty' });
        return;
      }
      if (trimmedName.length > 20) {
        res.status(400).json({ success: false, message: 'Runic name must be 20 characters or less' });
        return;
      }
      // Only allow letters, spaces, and hyphens
      if (!/^[a-zA-Z][a-zA-Z\s-]*$/.test(trimmedName)) {
        res.status(400).json({ success: false, message: 'Runic name must start with a letter and contain only letters, spaces, and hyphens' });
        return;
      }
    } else if (key === 'character_save_interval_ms') {
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < 10000 || numValue > 600000) {
        res.status(400).json({ success: false, message: 'Save interval must be between 10000ms (10s) and 600000ms (10min)' });
        return;
      }
    } else if (key === 'health_tick_interval_ms' || key === 'mana_tick_interval_ms') {
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < 1000 || numValue > 60000) {
        res.status(400).json({ success: false, message: 'Tick interval must be between 1000ms and 60000ms' });
        return;
      }
    } else if (key.match(/^(health|mana)_regen_(base|enhanced)_percent$/)) {
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        res.status(400).json({ success: false, message: 'Regen percent must be between 0 and 100' });
        return;
      }
    } else if (key === 'blind_accuracy_penalty') {
      const numValue = Number(value);
      if (isNaN(numValue) || !Number.isInteger(numValue) || numValue < 1 || numValue > 50) {
        res.status(400).json({ success: false, message: 'Blind accuracy penalty must be a whole number between 1 and 50' });
        return;
      }
    } else if (key === 'crit_soft_cap') {
      const numValue = Number(value);
      if (isNaN(numValue) || !Number.isInteger(numValue) || numValue < 5 || numValue > 60) {
        res.status(400).json({ success: false, message: 'Critical hit soft cap must be a whole number between 5 and 60' });
        return;
      }
    } else if (key === 'xp_overcap_percent') {
      const numValue = Number(value);
      if (isNaN(numValue) || !Number.isInteger(numValue) || numValue < 0 || numValue > 200) {
        res.status(400).json({ success: false, message: 'XP overcap percent must be a whole number between 0 and 200' });
        return;
      }
    } else if (key in settingsRepo.BACKSTAB_SETTING_RANGES) {
      const numValue = Number(value);
      const range = settingsRepo.BACKSTAB_SETTING_RANGES[key as settingsRepo.BackstabSettingKey];
      if (isNaN(numValue)) {
        res.status(400).json({ success: false, message: 'Value must be a valid number' });
        return;
      }
      if (numValue < range.min || numValue > range.max) {
        res.status(400).json({
          success: false,
          message: `Value must be between ${range.min} and ${range.max}`
        });
        return;
      }
    }

    try {
      await settingsRepo.setSetting(key, value);

      // Clear relevant caches when settings are updated
      if (key.startsWith('combat_') || key === 'crit_soft_cap') {
        settingsRepo.clearCombatSettingsCache();
      }
      if (key.startsWith('currency_') && key.endsWith('_per_enc')) {
        settingsRepo.clearCurrencyEncumbranceCache();
      }
      if (key.startsWith('training_') || key === 'initial_character_points') {
        settingsRepo.clearTrainingSettingsCache();
      }
      if (key === 'character_save_interval_ms') {
        settingsRepo.clearCharacterSaveSettingsCache();
        // Dynamically update the running save loop
        try {
          const { restartCharacterSaveLoopWithNewInterval } = await import('../game/characterSaveLoop.js');
          restartCharacterSaveLoopWithNewInterval(Number(value));
        } catch (error) {
          console.error('Failed to update character save loop interval:', error);
        }
      }
      if (key.startsWith('backstab_')) {
        settingsRepo.clearBackstabSettingsCache();
      }
      if (key === 'blind_accuracy_penalty') {
        settingsRepo.clearBlindAccuracyCache();
      }
      if (key === 'xp_overcap_percent') {
        settingsRepo.clearXpOvercapCache();
      }
      if (key.match(/^(health|mana)_(tick_interval_ms|regen_(base|enhanced)_percent)$/)) {
        settingsRepo.clearRegenSettingsCache();
      }

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

    // Normalize entry: trim whitespace, lowercase (IPs and hostnames are case-insensitive)
    let normalizedEntry = entry.trim().toLowerCase();

    if (!normalizedEntry) {
      res.status(400).json({ success: false, message: 'Entry cannot be empty' });
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

    // Validate and normalize IP format
    if (entryType === 'ip') {
      // Strip IPv6-mapped IPv4 prefix if present (e.g., ::ffff:192.168.1.1 -> 192.168.1.1)
      if (normalizedEntry.startsWith('::ffff:')) {
        normalizedEntry = normalizedEntry.slice(7);
      }

      const ipVersion = net.isIP(normalizedEntry);
      if (ipVersion === 0) {
        res.status(400).json({ success: false, message: 'Invalid IP address format' });
        return;
      }
    }

    try {
      // Check if entry already exists (case-insensitive for hostnames)
      const exists = await ipAccessRepo.entryExists(normalizedEntry);
      if (exists) {
        res.status(400).json({ success: false, message: 'Entry already exists' });
        return;
      }

      // If hostname, resolve it immediately
      let resolvedIps: string[] | undefined;
      if (entryType === 'hostname') {
        resolvedIps = await resolveHostnameImmediate(normalizedEntry);
        if (resolvedIps.length === 0) {
          res.status(400).json({ success: false, message: 'Could not resolve hostname' });
          return;
        }
      }

      const newEntry = await ipAccessRepo.createEntry(
        normalizedEntry,
        entryType,
        listType,
        reason || undefined,
        req.user?.playerId,
        resolvedIps
      );

      res.json({ success: true, entry: newEntry });
    } catch (error) {
      console.error('Failed to create IP access entry:', error);
      // Provide more specific error message if available
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        message: `Failed to create IP access entry: ${errorMessage}`,
      });
    }
  });

  // DELETE /api/admin/ip-access/:id - Delete IP access rule
  app.delete('/api/admin/ip-access/:id', requireAdmin, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
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
    const playerId = Number(req.params.id);
    if (!Number.isInteger(playerId) || playerId <= 0) {
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

  // ============================================================================
  // User/Character Admin Endpoints (for User Editor)
  // ============================================================================

  // GET /api/admin/users - List all users with character counts and roles
  app.get('/api/admin/users', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const users = await playerRepo.getAllPlayersWithDetails();
      res.json({ success: true, users });
    } catch (error) {
      console.error('Failed to get users:', error);
      res.status(500).json({ success: false, message: 'Failed to get users' });
    }
  });

  // GET /api/admin/users/:id - Get user details with characters
  app.get('/api/admin/users/:id', requireAdmin, async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    try {
      const user = await playerRepo.getPlayerWithRoles(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const characters = await characterRepo.findCharactersByPlayerId(userId);
      res.json({ success: true, user, characters });
    } catch (error) {
      console.error('Failed to get user:', error);
      res.status(500).json({ success: false, message: 'Failed to get user' });
    }
  });

  // PUT /api/admin/users/:id - Update user details
  app.put('/api/admin/users/:id', requireAdmin, async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    const { username, email, max_characters } = req.body;

    // Validate username if provided
    if (username !== undefined) {
      if (typeof username !== 'string' || username.trim().length < 3) {
        res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
        return;
      }

      // Check if username is already taken by another user
      const existingPlayer = await playerRepo.findPlayerByUsername(username.trim());
      if (existingPlayer && existingPlayer.id !== userId) {
        res.status(400).json({ success: false, message: 'Username already taken' });
        return;
      }
    }

    // Validate max_characters if provided
    if (max_characters !== undefined && max_characters !== null) {
      const numValue = Number(max_characters);
      if (isNaN(numValue) || numValue < 1 || numValue > 100) {
        res.status(400).json({ success: false, message: 'Max characters must be between 1 and 100' });
        return;
      }
    }

    try {
      const updates: playerRepo.UpdatePlayerAdminInput = {};
      if (username !== undefined) updates.username = username.trim();
      if (email !== undefined) updates.email = email?.trim() || null;
      if (max_characters !== undefined) updates.max_characters = max_characters;

      const updated = await playerRepo.updatePlayerAdmin(userId, updates);
      if (!updated) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      res.json({ success: true, message: 'User updated' });
    } catch (error) {
      console.error('Failed to update user:', error);
      res.status(500).json({ success: false, message: 'Failed to update user' });
    }
  });

  // POST /api/admin/users/:id/reset-password - Reset user password
  app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    const { password } = req.body;

    // If password provided, validate it
    if (password !== undefined && (typeof password !== 'string' || password.length < 6)) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      return;
    }

    try {
      const newPassword = await playerRepo.resetPlayerPassword(userId, password);
      if (!newPassword) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      // Only include password in response when it was auto-generated (no password provided)
      if (password) {
        res.json({ success: true, message: 'Password reset' });
      } else {
        res.json({ success: true, message: 'Password reset', password: newPassword });
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
      res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
  });

  // PUT /api/admin/users/:id/role - Change user role
  app.put('/api/admin/users/:id/role', requireAdmin, async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    const { role } = req.body;

    // Validate role
    const validRoles = Object.values(Role);
    if (!validRoles.includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role' });
      return;
    }

    try {
      const user = await playerRepo.findPlayerById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      // Get current roles
      const currentRoles = await roleRepo.getPlayerRoles(userId);

      // Remove all current roles except PENDING
      for (const currentRole of currentRoles) {
        if (currentRole !== Role.PENDING) {
          await roleRepo.removeRole(userId, currentRole);
        }
      }

      // Add the new role
      await roleRepo.assignRole(userId, role, req.user?.playerId);

      // If assigning a role higher than PENDING, also ensure PLAYER is assigned
      if (role !== Role.PENDING && role !== Role.PLAYER) {
        await roleRepo.assignRole(userId, Role.PLAYER, req.user?.playerId);
      }

      res.json({ success: true, message: 'Role updated' });
    } catch (error) {
      console.error('Failed to update role:', error);
      res.status(500).json({ success: false, message: 'Failed to update role' });
    }
  });

  // PUT /api/admin/characters/:id - Update character
  app.put('/api/admin/characters/:id', requireAdmin, async (req: Request, res: Response) => {
    const characterId = Number(req.params.id);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid character ID' });
      return;
    }

    const updates = req.body;

    // Validate character name if provided
    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || updates.name.trim().length < 2) {
        res.status(400).json({ success: false, message: 'Character name must be at least 2 characters' });
        return;
      }

      // Check if name is already taken by another character
      const existingChar = await characterRepo.findCharacterByName(updates.name.trim());
      if (existingChar && existingChar.id !== characterId) {
        res.status(400).json({ success: false, message: 'Character name already taken' });
        return;
      }

      updates.name = updates.name.trim();
    }

    // Validate numeric fields with ranges
    const numericFields: Record<string, { min: number; max: number }> = {
      level: { min: 1, max: 1000 },
      experience: { min: 0, max: Number.MAX_SAFE_INTEGER },
      health: { min: 0, max: 100000 },
      max_health: { min: 1, max: 100000 },
      mana: { min: 0, max: 100000 },
      max_mana: { min: 0, max: 100000 },
      strength: { min: 1, max: 255 },
      intelligence: { min: 1, max: 255 },
      dexterity: { min: 1, max: 255 },
      constitution: { min: 1, max: 255 },
      wisdom: { min: 1, max: 255 },
      charisma: { min: 1, max: 255 },
      current_room_id: { min: 1, max: Number.MAX_SAFE_INTEGER },
      gold: { min: 0, max: Number.MAX_SAFE_INTEGER },
      unspent_cp: { min: 0, max: 10000 },
    };

    for (const [field, range] of Object.entries(numericFields)) {
      if (updates[field] !== undefined) {
        const value = Number(updates[field]);
        if (isNaN(value)) {
          res.status(400).json({ success: false, message: `Invalid value for ${field}` });
          return;
        }
        if (value < range.min || value > range.max) {
          res.status(400).json({ success: false, message: `${field} must be between ${range.min} and ${range.max}` });
          return;
        }
        updates[field] = value;
      }
    }

    // Validate cp_spent if provided (must be an object with numeric values)
    if (updates.cp_spent !== undefined) {
      if (typeof updates.cp_spent !== 'object' || updates.cp_spent === null || Array.isArray(updates.cp_spent)) {
        res.status(400).json({ success: false, message: 'cp_spent must be an object' });
        return;
      }
      for (const [stat, value] of Object.entries(updates.cp_spent)) {
        if (typeof value !== 'number' || value < 0) {
          res.status(400).json({ success: false, message: `Invalid cp_spent value for ${stat}` });
          return;
        }
      }
    }

    try {
      const character = await characterRepo.updateCharacterAdmin(characterId, updates);
      if (!character) {
        res.status(404).json({ success: false, message: 'Character not found' });
        return;
      }

      res.json({ success: true, message: 'Character updated', character });
    } catch (error) {
      console.error('Failed to update character:', error);
      res.status(500).json({ success: false, message: 'Failed to update character' });
    }
  });

  // DELETE /api/admin/characters/:id - Delete character
  app.delete('/api/admin/characters/:id', requireAdmin, async (req: Request, res: Response) => {
    const characterId = Number(req.params.id);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid character ID' });
      return;
    }

    try {
      const deleted = await characterRepo.deleteCharacter(characterId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Character not found' });
        return;
      }

      res.json({ success: true, message: 'Character deleted' });
    } catch (error) {
      console.error('Failed to delete character:', error);
      res.status(500).json({ success: false, message: 'Failed to delete character' });
    }
  });
}
