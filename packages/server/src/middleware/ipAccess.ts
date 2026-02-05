import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import * as ipAccessRepo from '../db/repositories/ipAccessRepository.js';

// Only trust X-Forwarded-For when explicitly configured (server is behind a reverse proxy)
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

// Localhost IPs that are always allowed
const LOCALHOST_IPS = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]);

/**
 * Normalize an IP address by stripping IPv6-mapped IPv4 prefix
 * e.g., '::ffff:192.168.1.100' becomes '192.168.1.100'
 */
function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

/**
 * Check if an IP is localhost
 */
function isLocalhost(ip: string): boolean {
  const normalized = normalizeIp(ip);
  return LOCALHOST_IPS.has(ip) || LOCALHOST_IPS.has(normalized) ||
         normalized.startsWith('127.') || ip === '::1';
}

/**
 * Check if request has valid emergency access token
 * This allows admins with server access to bypass IP restrictions if locked out
 */
function hasEmergencyAccess(req: Request): boolean {
  const emergencyToken = process.env.EMERGENCY_ACCESS_TOKEN;
  if (!emergencyToken) return false;

  // Check header first, then query param as fallback
  // Handle array format (multiple query params with same name)
  const headerToken = req.headers['x-emergency-token'];
  const queryToken = req.query.emergencyToken;
  const providedToken = headerToken || (Array.isArray(queryToken) ? queryToken[0] : queryToken);
  return providedToken === emergencyToken;
}

/**
 * Extract client IP from X-Forwarded-For header.
 * Only used when TRUST_PROXY is enabled.
 */
function getForwardedIp(headers: Record<string, string | string[] | undefined>): string | null {
  if (!TRUST_PROXY) return null;

  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstIp = forwardedValue?.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return null;
}

/**
 * Get the client IP address from an Express request.
 * Only trusts X-Forwarded-For when TRUST_PROXY is enabled.
 */
function getClientIp(req: Request): string {
  return getForwardedIp(req.headers) || req.socket.remoteAddress || req.ip || '127.0.0.1';
}

/**
 * Get the client IP address from a raw HTTP IncomingMessage (for WebSocket upgrades).
 * Only trusts X-Forwarded-For when TRUST_PROXY is enabled.
 */
export function getClientIpFromRequest(req: IncomingMessage): string {
  return getForwardedIp(req.headers as Record<string, string | string[] | undefined>) || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * IP access control middleware
 * Checks incoming requests against allowlist/blocklist based on settings
 */
export async function ipAccessMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip IP check for the /api/ip-check endpoint (used by Vite to check IP access)
    // This endpoint handles its own IP logic
    if (req.path === '/ip-check') {
      next();
      return;
    }

    const clientIp = getClientIp(req);

    // Always allow localhost connections
    if (isLocalhost(clientIp)) {
      next();
      return;
    }

    // Allow emergency access if token is provided and valid
    if (hasEmergencyAccess(req)) {
      console.log(`[IP Access] Emergency access granted for IP: ${clientIp}`);
      next();
      return;
    }

    const mode = await settingsRepo.getIpAccessMode();

    if (mode === 'allowlist') {
      // In allowlist mode, block everything unless explicitly allowed
      const isAllowed = await ipAccessRepo.isIpAllowed(clientIp);
      if (!isAllowed) {
        console.log(`[IP Access] Blocked (allowlist mode): ${clientIp}`);
        res.status(403).json({
          success: false,
          message: 'Access denied. Your IP address is not in the allowlist.',
        });
        return;
      }
    } else {
      // In blocklist mode, allow everything unless explicitly blocked
      const isBlocked = await ipAccessRepo.isIpBlocked(clientIp);
      if (isBlocked) {
        console.log(`[IP Access] Blocked (blocklist mode): ${clientIp}`);
        res.status(403).json({
          success: false,
          message: 'Access denied. Your IP address has been blocked.',
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('[IP Access] Error checking IP access:', error);
    // On error, allow the request through (fail open)
    // This prevents the entire site from going down if there's a DB issue
    next();
  }
}

/**
 * Check IP access for WebSocket upgrade requests
 * Returns true if allowed, false if blocked
 *
 * @param ip - The client IP address
 * @param emergencyToken - Optional emergency access token from query string
 */
export async function checkWebSocketIp(
  ip: string,
  emergencyToken?: string
): Promise<{ allowed: boolean; message?: string }> {
  try {
    // Always allow localhost
    if (isLocalhost(ip)) {
      return { allowed: true };
    }

    // Check emergency access token
    const envToken = process.env.EMERGENCY_ACCESS_TOKEN;
    if (envToken && emergencyToken === envToken) {
      console.log(`[IP Access] Emergency WebSocket access granted for IP: ${ip}`);
      return { allowed: true };
    }

    const mode = await settingsRepo.getIpAccessMode();

    if (mode === 'allowlist') {
      const isAllowed = await ipAccessRepo.isIpAllowed(ip);
      if (!isAllowed) {
        console.log(`[IP Access] WebSocket blocked (allowlist mode): ${ip}`);
        return {
          allowed: false,
          message: 'Access denied. Your IP address is not in the allowlist.',
        };
      }
    } else {
      const isBlocked = await ipAccessRepo.isIpBlocked(ip);
      if (isBlocked) {
        console.log(`[IP Access] WebSocket blocked (blocklist mode): ${ip}`);
        return {
          allowed: false,
          message: 'Access denied. Your IP address has been blocked.',
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error('[IP Access] Error checking WebSocket IP access:', error);
    // Fail open
    return { allowed: true };
  }
}
