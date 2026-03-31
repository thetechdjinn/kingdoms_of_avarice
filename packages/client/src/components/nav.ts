/**
 * Shared navigation component.
 * Single source of truth for all page navbars.
 *
 * Usage:
 *   import { renderNav } from './components/nav.js';
 *   renderNav({ activePage: 'item-editor', helpDoc: 'Item_Editor_Guide.md' });
 */

export interface NavConfig {
  /** Which page is active (matches the key in DEV_LINKS or ADMIN_LINKS) */
  activePage?: string;
  /** Help doc filename (e.g., 'Item_Editor_Guide.md'). If set, shows "?" link. */
  helpDoc?: string;
  /** Which dropdown group is active: 'developer' or 'admin' */
  activeGroup?: 'developer' | 'admin';
}

const DEV_LINKS: Array<{ href: string; key: string; label: string }> = [
  { href: '/editor.html', key: 'editor', label: 'Room Editor' },
  { href: '/item-editor.html', key: 'item-editor', label: 'Item Editor' },
  { href: '/spell-editor.html', key: 'spell-editor', label: 'Spell Editor' },
  { href: '/status-editor.html', key: 'status-editor', label: 'Status Effects Editor' },
  { href: '/progression-editor.html', key: 'progression-editor', label: 'Class / Race Editor' },
  { href: '/door-editor.html', key: 'door-editor', label: 'Door Editor' },
  { href: '/action-editor.html', key: 'action-editor', label: 'Action Editor' },
  { href: '/npc-editor.html', key: 'npc-editor', label: 'NPC Editor' },
  { href: '/drop-table-editor.html', key: 'drop-table-editor', label: 'Drop Table Editor' },
  { href: '/faction-editor.html', key: 'faction-editor', label: 'Faction Editor' },
  { href: '/quest-editor.html', key: 'quest-editor', label: 'Quest Editor' },
  { href: '/progression-table-editor.html', key: 'progression-table-editor', label: 'Progression Table Editor' },
  { href: '/swing-calculator.html', key: 'swing-calculator', label: 'Swing Calculator' },
  { href: '/combat-simulator.html', key: 'combat-simulator', label: 'Combat Simulator' },
];

const ADMIN_LINKS: Array<{ href: string; key: string; label: string; id?: string }> = [
  { href: '/admin.html', key: 'admin', label: 'Admin Panel' },
  { href: '/game-settings-editor.html', key: 'game-settings-editor', label: 'Game Settings' },
  { href: '/user-editor.html', key: 'user-editor', label: 'User Editor' },
  { href: '', key: 'export', label: 'Export Game Data', id: 'nav-export-btn' },
];

/**
 * Attach the export game data click handler to #nav-export-btn.
 * Called automatically by renderNav after injecting the HTML.
 */
export function attachExportHandler(): void {
  const exportBtn = document.getElementById('nav-export-btn');
  if (!exportBtn) return;

  exportBtn.onclick = async function () {
    if (exportBtn.dataset.busy === '1') return;
    exportBtn.dataset.busy = '1';
    exportBtn.textContent = 'Exporting...';
    exportBtn.style.color = '#ffcc00';
    let title = 'Export Failed';
    let message = 'An unknown error occurred.';
    let success = false;
    try {
      const res = await fetch('/api/data/export', { method: 'POST', credentials: 'include' });
      const result = await res.json();
      if (result.success) {
        success = true;
        title = 'Export Complete';
        message = result.message || 'All game data exported to seed files.';
      } else {
        message = result.message || 'Export failed.';
      }
    } catch {
      message = 'Network error: could not reach the server.';
    }
    exportBtn.textContent = 'Export Game Data';
    exportBtn.style.color = '';
    exportBtn.dataset.busy = '';
    showExportModal(title, message, success);
    return false;
  };
}

function showExportModal(title: string, message: string, success: boolean): void {
  // Remove existing modal if present
  document.getElementById('export-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'export-modal-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';

  const box = document.createElement('div');
  box.style.cssText = 'background:#16213e;border:1px solid ' + (success ? '#00ff00' : '#ff6b6b') + ';border-radius:8px;padding:1.5rem;max-width:450px;width:90%;';

  const h3 = document.createElement('h3');
  h3.style.cssText = 'color:' + (success ? '#00ff00' : '#ff6b6b') + ';margin:0 0 1rem 0;';
  h3.textContent = title;

  const p = document.createElement('p');
  p.style.cssText = 'color:#eee;line-height:1.5;margin:0 0 1.5rem 0;';
  p.textContent = message;

  const btn = document.createElement('button');
  btn.style.cssText = 'padding:0.4rem 1.5rem;background:#0e4429;border:1px solid #00aa00;border-radius:4px;color:#00ff00;cursor:pointer;font-size:0.9rem;float:right;';
  btn.textContent = 'OK';
  btn.onclick = () => overlay.remove();

  box.appendChild(h3);
  box.appendChild(p);
  box.appendChild(btn);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  btn.focus();
}

/**
 * Render the standard nav into #main-nav.
 * Call this before initAuth() so the DOM elements exist for role-based show/hide.
 */
export function renderNav(config: NavConfig = {}): void {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const { activePage, helpDoc, activeGroup = 'developer' } = config;
  const isDevActive = activeGroup === 'developer';
  const isAdminActive = activeGroup === 'admin';

  const devItems = DEV_LINKS.map(link => {
    const active = activePage === link.key ? ' active' : '';
    return `<a href="${link.href}" class="nav-dropdown-item${active}">${link.label}</a>`;
  }).join('\n              ');

  const adminItems = ADMIN_LINKS.map(link => {
    const active = activePage === link.key ? ' active' : '';
    const idAttr = link.id ? ` id="${link.id}"` : '';
    if (!link.href) {
      return `<a href="javascript:void(0)"${idAttr} class="nav-dropdown-item${active}">${link.label}</a>`;
    }
    return `<a href="${link.href}"${idAttr} class="nav-dropdown-item${active}">${link.label}</a>`;
  }).join('\n              ');

  const helpLink = helpDoc
    ? `<a href="/docs.html?file=${helpDoc}" class="help-link nav-help" title="View Documentation" target="_blank" rel="noopener noreferrer">?</a>`
    : '';

  nav.innerHTML = `
    <div class="nav-brand">Kingdoms of Avarice</div>
    <div class="nav-links">
      <a href="/" class="nav-link" target="_blank" rel="noopener noreferrer">Game</a>
      <div class="nav-dropdown" id="nav-dev-dropdown" style="display: none;">
        <button class="nav-link nav-dropdown-btn${isDevActive ? ' active' : ''}">Developer</button>
        <div class="nav-dropdown-menu">
          ${devItems}
        </div>
      </div>
      <div class="nav-dropdown" id="nav-admin-dropdown" style="display: none;">
        <button class="nav-link nav-dropdown-btn${isAdminActive ? ' active' : ''}">Admin</button>
        <div class="nav-dropdown-menu">
          ${adminItems}
        </div>
      </div>
    </div>
    <div class="nav-spacer"></div>
    ${helpLink}
    <div class="nav-user-menu">
      <button class="nav-user-btn" id="nav-username">User</button>
      <div class="dropdown-menu" id="user-dropdown">
        <button class="dropdown-item" id="logout-btn">Logout</button>
      </div>
    </div>`;

  attachExportHandler();
}
