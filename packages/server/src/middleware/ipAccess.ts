import { Request, Response, NextFunction } from 'express';
import * as settingsRepo from '../db/repositories/settingsRepository.js';
import * as ipAccessRepo from '../db/repositories/ipAccessRepository.js';

// Localhost IPs that are always allowed
const LOCALHOST_IPS = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]);

/**
 * Check if an IP is localhost
 */
function isLocalhost(ip: string): boolean {
  return LOCALHOST_IPS.has(ip) || ip.startsWith('127.') || ip === '::1';
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
 * Get the client IP address from the request
 * Handles both direct connections and proxied connections
 */
function getClientIp(req: Request): string {
  // Check for forwarded IP (if behind a proxy)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one (client IP)
    // Handle both array format and comma-separated string
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstIp = forwardedValue?.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // Direct connection
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
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
        return {
          allowed: false,
          message: 'Access denied. Your IP address is not in the allowlist.',
        };
      }
    } else {
      const isBlocked = await ipAccessRepo.isIpBlocked(ip);
      if (isBlocked) {
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
