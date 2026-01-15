import dns from 'dns';
import * as ipAccessRepo from '../db/repositories/ipAccessRepository.js';

const DNS_RESOLVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let resolverInterval: NodeJS.Timeout | null = null;

/**
 * Resolve a hostname to all its IP addresses (IPv4 and IPv6)
 */
async function resolveHostname(hostname: string): Promise<string[]> {
  const ips: string[] = [];

  // Try IPv4
  try {
    const ipv4Addresses = await dns.promises.resolve4(hostname);
    ips.push(...ipv4Addresses);
  } catch {
    // No IPv4 addresses or resolution failed
  }

  // Try IPv6
  try {
    const ipv6Addresses = await dns.promises.resolve6(hostname);
    ips.push(...ipv6Addresses);
  } catch {
    // No IPv6 addresses or resolution failed
  }

  return ips;
}

/**
 * Resolve all hostname entries in the database and update their cached IPs
 */
export async function resolveAllHostnames(): Promise<void> {
  try {
    const hostnameEntries = await ipAccessRepo.getHostnameEntries();

    for (const entry of hostnameEntries) {
      try {
        const resolvedIps = await resolveHostname(entry.entry);

        if (resolvedIps.length > 0) {
          await ipAccessRepo.updateResolvedIps(entry.id, resolvedIps);
          console.log(`[DNS] Resolved ${entry.entry} to ${resolvedIps.join(', ')}`);
        } else {
          console.warn(`[DNS] No IPs resolved for hostname: ${entry.entry}`);
          // Keep existing resolved_ips if resolution fails
        }
      } catch (error) {
        console.error(`[DNS] Failed to resolve hostname ${entry.entry}:`, error);
        // Keep existing resolved_ips if resolution fails
      }
    }
  } catch (error) {
    console.error('[DNS] Failed to fetch hostname entries:', error);
  }
}

/**
 * Resolve a single hostname and return the IPs (for immediate use when creating entries)
 */
export async function resolveHostnameImmediate(hostname: string): Promise<string[]> {
  return resolveHostname(hostname);
}

/**
 * Start the periodic DNS resolution service
 */
export function startDnsResolver(): void {
  if (resolverInterval) {
    console.warn('[DNS] Resolver already running');
    return;
  }

  // Run immediately on startup
  resolveAllHostnames().catch((error) => {
    console.error('[DNS] Initial resolution failed:', error);
  });

  // Then run periodically
  resolverInterval = setInterval(() => {
    resolveAllHostnames().catch((error) => {
      console.error('[DNS] Periodic resolution failed:', error);
    });
  }, DNS_RESOLVE_INTERVAL_MS);
  console.log(`[DNS] Started DNS resolver (every ${DNS_RESOLVE_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop the periodic DNS resolution service
 */
export function stopDnsResolver(): void {
  if (resolverInterval) {
    clearInterval(resolverInterval);
    resolverInterval = null;
    console.log('[DNS] Stopped DNS resolver');
  }
}
