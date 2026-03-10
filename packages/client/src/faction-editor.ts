(function() {

interface Faction {
  id: number;
  name: string;
  description: string | null;
  factionType: string;
}

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

let factions: Faction[] = [];
let selectedFactionId: number | null = null;
let currentUser: AuthInfo | null = null;

// ============================================================================
// Toast Notifications
// ============================================================================

type ToastType = 'success' | 'error' | 'warning' | 'info';

function showToast(message: string, type: ToastType = 'info', duration: number = 3000): void {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ============================================================================
// Authentication
// ============================================================================

async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (!response.ok) { window.location.href = '/'; return false; }
    const data: AuthInfo = await response.json();
    currentUser = data;
    if (!data.authenticated) { window.location.href = '/'; return false; }
    const roles = data.roles || [];
    if (!roles.includes('developer') && !roles.includes('admin')) {
      window.location.href = '/'; return false;
    }
    const usernameEl = document.getElementById('nav-username');
    if (usernameEl && data.username) usernameEl.textContent = data.username;
    const adminDropdown = document.getElementById('nav-admin-dropdown');
    if (adminDropdown) adminDropdown.style.display = roles.includes('admin') ? 'flex' : 'none';
    return true;
  } catch {
    window.location.href = '/';
    return false;
  }
}

async function handleLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } finally {
    window.location.href = '/';
  }
}

// ============================================================================
// Data Operations
// ============================================================================

async function fetchFactions(): Promise<void> {
  try {
    const response = await fetch('/api/factions');
    if (!response.ok) throw new Error('Failed to fetch factions');
    const data = await response.json();
    factions = data.factions || [];
    renderFactionList();
  } catch (error) {
    console.error('Failed to fetch factions:', error);
    showToast('Failed to load factions', 'error');
  }
}

function renderFactionList(): void {
  const list = document.getElementById('faction-list');
  if (!list) return;
  const searchInput = getElement<HTMLInputElement>('search-input');
  const searchTerm = (searchInput?.value || '').toLowerCase();

  const filtered = searchTerm
    ? factions.filter(f => f.name.toLowerCase().includes(searchTerm) || f.factionType.toLowerCase().includes(searchTerm))
    : factions;

  list.innerHTML = '';
  for (const faction of filtered) {
    const li = document.createElement('li');
    li.className = faction.id === selectedFactionId ? 'active' : '';
    li.innerHTML = `<div class="faction-name">${escapeHtml(faction.name)}</div><div class="faction-type">${escapeHtml(faction.factionType)}</div>`;
    li.addEventListener('click', () => selectFaction(faction.id));
    list.appendChild(li);
  }
}

function selectFaction(id: number): void {
  selectedFactionId = id;
  const faction = factions.find(f => f.id === id);
  if (!faction) return;

  const noSelected = getElement<HTMLElement>('no-faction-selected');
  const form = getElement<HTMLFormElement>('faction-form');
  if (noSelected) noSelected.style.display = 'none';
  if (form) form.style.display = 'block';

  const titleEl = getElement<HTMLElement>('faction-form-title');
  if (titleEl) titleEl.textContent = `Edit Faction: ${faction.name}`;
  const idEl = getElement<HTMLElement>('faction-id-display');
  if (idEl) idEl.textContent = `ID: ${faction.id}`;

  const nameInput = getElement<HTMLInputElement>('faction-name');
  if (nameInput) nameInput.value = faction.name;
  const typeSelect = getElement<HTMLSelectElement>('faction-type');
  if (typeSelect) typeSelect.value = faction.factionType;
  const descInput = getElement<HTMLTextAreaElement>('faction-description');
  if (descInput) descInput.value = faction.description || '';

  updatePreview();
  renderFactionList();
}

function updatePreview(): void {
  const content = document.getElementById('preview-content');
  if (!content || !selectedFactionId) return;
  const faction = factions.find(f => f.id === selectedFactionId);
  if (!faction) return;

  content.innerHTML = `
    <div class="preview-name">${escapeHtml(faction.name)}</div>
    <div class="preview-section">
      <div class="preview-stat"><span class="label">Type:</span> <span class="value">${escapeHtml(faction.factionType)}</span></div>
      <div class="preview-stat"><span class="label">ID:</span> <span class="value">${faction.id}</span></div>
    </div>
    ${faction.description ? `<div class="preview-section"><div class="preview-stat"><span class="label">Description:</span></div><div style="color: #ccc; font-size: 0.85rem; margin-top: 4px;">${escapeHtml(faction.description)}</div></div>` : ''}
  `;
}

// ============================================================================
// CRUD Operations
// ============================================================================

async function createFaction(): Promise<void> {
  try {
    const response = await fetch('/api/factions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Faction', factionType: 'merchant' }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to create faction', 'error');
      return;
    }
    await fetchFactions();
    selectFaction(data.faction.id);
    showToast('Faction created', 'success');
  } catch (error) {
    console.error('Failed to create faction:', error);
    showToast('Failed to create faction', 'error');
  }
}

async function saveFaction(): Promise<void> {
  if (!selectedFactionId) return;
  const name = getElement<HTMLInputElement>('faction-name')?.value?.trim();
  if (!name) {
    showToast('Name is required', 'error');
    return;
  }
  const factionType = getElement<HTMLSelectElement>('faction-type')?.value || 'merchant';
  const description = getElement<HTMLTextAreaElement>('faction-description')?.value?.trim() || null;

  try {
    const response = await fetch(`/api/factions/${selectedFactionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, factionType, description }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to save faction', 'error');
      return;
    }
    await fetchFactions();
    selectFaction(selectedFactionId);
    showToast('Faction saved', 'success');
  } catch (error) {
    console.error('Failed to save faction:', error);
    showToast('Failed to save faction', 'error');
  }
}

async function deleteFaction(): Promise<void> {
  if (!selectedFactionId) return;
  if (!confirm('Delete this faction? NPCs assigned to it will lose their faction.')) return;

  try {
    const response = await fetch(`/api/factions/${selectedFactionId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to delete faction', 'error');
      return;
    }
    selectedFactionId = null;
    const noSelected = getElement<HTMLElement>('no-faction-selected');
    const form = getElement<HTMLFormElement>('faction-form');
    if (noSelected) noSelected.style.display = 'block';
    if (form) form.style.display = 'none';
    await fetchFactions();
    showToast('Faction deleted', 'success');
  } catch (error) {
    console.error('Failed to delete faction:', error);
    showToast('Failed to delete faction', 'error');
  }
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  await fetchFactions();

  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  };

  addListener('new-faction-btn', 'click', createFaction);
  addListener('faction-form', 'submit', (e) => { e.preventDefault(); saveFaction(); });
  addListener('delete-faction-btn', 'click', deleteFaction);
  addListener('search-input', 'input', renderFactionList);
  addListener('logout-btn', 'click', handleLogout);

  // User menu dropdown toggle
  const userMenuBtn = document.getElementById('nav-username');
  const userMenu = userMenuBtn?.closest('.nav-user-menu');
  if (userMenuBtn && userMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('open');
    });
    document.addEventListener('click', () => userMenu.classList.remove('open'));
  }

  // Live preview on form changes
  document.querySelectorAll('#faction-form input, #faction-form select, #faction-form textarea').forEach(el => {
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
  });
});

})();
