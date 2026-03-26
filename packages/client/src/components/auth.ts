/**
 * Shared auth check module.
 * Replaces per-editor checkAuth(), logout handler, and user dropdown toggle.
 *
 * Usage:
 *   import { initAuth } from './components/auth.js';
 *   const auth = await initAuth('developer');
 *   if (!auth) return;
 */

export type RequiredRole = 'developer' | 'admin';

let authInitialized = false;

export interface AuthResult {
  username: string;
  roles: string[];
  isAdmin: boolean;
  isDeveloper: boolean;
}

/**
 * Check authentication, enforce role, set up nav UI, logout handler, and user dropdown.
 * Redirects to '/' if not authenticated or lacking required role.
 * Returns null if auth fails (caller should abort initialization).
 */
export async function initAuth(requiredRole: RequiredRole = 'developer'): Promise<AuthResult | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) {
      window.location.href = '/';
      return null;
    }
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/';
      return null;
    }

    const roles: string[] = data.roles || [];
    const isAdmin = roles.includes('admin');
    const isDeveloper = roles.includes('developer') || isAdmin;

    // Check required role
    if (requiredRole === 'admin' && !isAdmin) {
      window.location.href = '/';
      return null;
    }
    if (requiredRole === 'developer' && !isDeveloper) {
      window.location.href = '/';
      return null;
    }

    // Update username display
    const usernameEl = document.getElementById('nav-username');
    if (usernameEl) usernameEl.textContent = data.username || 'User';

    // Show/hide admin dropdown
    const adminDropdown = document.getElementById('nav-admin-dropdown');
    if (adminDropdown) {
      adminDropdown.style.display = isAdmin ? 'flex' : 'none';
    }

    // Show/hide developer dropdown
    const devDropdown = document.getElementById('nav-dev-dropdown');
    if (devDropdown) {
      devDropdown.style.display = isDeveloper ? 'flex' : 'none';
    }

    // Attach UI listeners only once
    if (!authInitialized) {
      authInitialized = true;

      // Logout handler
      document.getElementById('logout-btn')?.addEventListener('click', async () => {
        try {
          await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        } catch {
          // Redirect even if logout request fails
        }
        window.location.href = '/';
      });

      // User dropdown toggle
      const userBtn = document.getElementById('nav-username');
      const userMenu = userBtn?.closest('.nav-user-menu');
      userBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu?.classList.toggle('open');
      });
      userMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      document.addEventListener('click', () => {
        userMenu?.classList.remove('open');
      });
    }

    return {
      username: data.username,
      roles,
      isAdmin,
      isDeveloper,
    };
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/';
    return null;
  }
}
