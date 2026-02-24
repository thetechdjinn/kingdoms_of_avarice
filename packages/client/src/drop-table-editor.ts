(function() {

interface DropTableEntry {
  id?: number;
  dropTableId?: number;
  itemTemplateId: number | null;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
  currencyMin: number;
  currencyMax: number;
  allowedDenominations: string[];
}

interface DropTable {
  id: number;
  name: string;
  description: string | null;
  entries?: DropTableEntry[];
}

interface ItemTemplate {
  id: number;
  name: string;
}

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

const ALL_DENOMINATIONS = ['copper', 'silver', 'gold', 'platinum', 'runic'];

let dropTables: DropTable[] = [];
let itemTemplates: ItemTemplate[] = [];
let selectedTableId: number | null = null;
let editingEntries: DropTableEntry[] = [];
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

function parseNumberOrDefault(value: string, defaultValue: number): number {
  const trimmed = value.trim();
  if (trimmed === '') return defaultValue;
  const parsed = Number(trimmed);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function getItemName(itemId: number | null): string {
  if (!itemId) return '(currency only)';
  const item = itemTemplates.find(i => i.id === itemId);
  return item ? item.name : `Item #${itemId}`;
}

// ============================================================================
// Authentication
// ============================================================================

async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (!response.ok) {
      window.location.href = '/';
      return false;
    }
    const data: AuthInfo = await response.json();
    currentUser = data;

    if (!data.authenticated) {
      window.location.href = '/';
      return false;
    }

    const roles = data.roles || [];
    const hasDeveloperAccess = roles.includes('developer') || roles.includes('admin');

    if (!hasDeveloperAccess) {
      window.location.href = '/';
      return false;
    }

    const usernameEl = document.getElementById('nav-username');
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username;
    }

    const isAdmin = roles.includes('admin');
    const adminDropdown = document.getElementById('nav-admin-dropdown');
    if (adminDropdown) {
      adminDropdown.style.display = isAdmin ? 'flex' : 'none';
    }

    return true;
  } catch (error) {
    console.error('Failed to check auth:', error);
    window.location.href = '/';
    return false;
  }
}

async function handleLogout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Ignore errors
  }
  window.location.href = '/';
}

// ============================================================================
// Data Loading
// ============================================================================

async function fetchDropTables(): Promise<void> {
  try {
    const response = await fetch('/api/drop-tables', { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch drop tables');
    const data = await response.json();
    dropTables = data.dropTables || [];
    renderTableList();
  } catch (error) {
    console.error('Failed to fetch drop tables:', error);
    showToast('Failed to load drop tables', 'error');
  }
}

async function fetchItemTemplates(): Promise<void> {
  try {
    const response = await fetch('/api/items', { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch items');
    const data = await response.json();
    itemTemplates = (data.items || []).map((i: Record<string, unknown>) => ({
      id: i.id,
      name: i.name,
    }));
  } catch (error) {
    console.error('Failed to fetch item templates:', error);
  }
}

async function fetchTableWithEntries(id: number): Promise<DropTable | null> {
  try {
    const response = await fetch(`/api/drop-tables/${id}`, { credentials: 'include' });
    if (!response.ok) return null;
    const data = await response.json();
    return data.dropTable || null;
  } catch (error) {
    console.error('Failed to fetch drop table:', error);
    return null;
  }
}

// ============================================================================
// Table List Rendering
// ============================================================================

function renderTableList(): void {
  const list = getElement<HTMLUListElement>('dt-list');
  if (!list) return;

  const searchInput = getElement<HTMLInputElement>('search-input');
  const search = searchInput?.value.toLowerCase() || '';

  const filtered = dropTables.filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !String(t.id).includes(search)) {
      return false;
    }
    return true;
  });

  list.innerHTML = '';
  for (const t of filtered) {
    const li = document.createElement('li');
    li.dataset.id = String(t.id);
    if (t.id === selectedTableId) li.classList.add('selected');

    li.innerHTML = `
      <span class="dt-name">${escapeHtml(t.name)}</span>
      <span class="dt-id">ID: ${t.id}</span>
    `;

    li.addEventListener('click', () => selectTable(t.id));
    list.appendChild(li);
  }
}

// ============================================================================
// Table Selection
// ============================================================================

async function selectTable(id: number): Promise<void> {
  selectedTableId = id;

  const tableData = await fetchTableWithEntries(id);
  if (!tableData) {
    showToast('Failed to load drop table', 'error');
    return;
  }

  const noSelected = getElement<HTMLElement>('no-dt-selected');
  const form = getElement<HTMLFormElement>('dt-form');
  if (noSelected) noSelected.style.display = 'none';
  if (form) form.style.display = 'block';

  const titleEl = getElement<HTMLElement>('dt-form-title');
  if (titleEl) titleEl.textContent = `Edit: ${tableData.name}`;

  const idEl = getElement<HTMLElement>('dt-id-display');
  if (idEl) idEl.textContent = `ID: ${tableData.id}`;

  // Details tab
  setInputValue('dt-name', tableData.name);
  setInputValue('dt-description', tableData.description || '');

  // Entries
  editingEntries = (tableData.entries || []).map(e => ({ ...e, allowedDenominations: [...(e.allowedDenominations || [])] }));
  renderEntries();

  // Enable simulate
  const simBtn = getElement<HTMLButtonElement>('simulate-btn');
  if (simBtn) simBtn.disabled = false;

  renderTableList();
  clearSimulation();
}

function setInputValue(id: string, value: string): void {
  const el = getElement<HTMLInputElement>(id);
  if (el) el.value = value;
}

// ============================================================================
// Entry Rendering
// ============================================================================

function renderEntries(): void {
  const container = getElement<HTMLElement>('entries-container');
  const hint = getElement<HTMLElement>('no-entries-hint');
  if (!container) return;

  container.innerHTML = '';

  if (editingEntries.length === 0) {
    if (hint) hint.style.display = 'block';
    return;
  }

  if (hint) hint.style.display = 'none';

  editingEntries.forEach((entry, index) => {
    const denomChecks = ALL_DENOMINATIONS.map(d => {
      const checked = entry.allowedDenominations.includes(d) ? 'checked' : '';
      return `<label><input type="checkbox" data-denom="${d}" data-index="${index}" ${checked} /> ${d}</label>`;
    }).join('');

    const row = document.createElement('div');
    row.className = 'entry-row';
    row.innerHTML = `
      <div class="entry-row-header">
        <span class="entry-title">Entry ${index + 1}: ${escapeHtml(getItemName(entry.itemTemplateId))}</span>
        <button type="button" class="btn-remove" data-index="${index}">Remove</button>
      </div>
      <div class="entry-fields">
        <div class="form-group">
          <label>Item Template ID</label>
          <input type="number" data-field="itemTemplateId" data-index="${index}" min="1" value="${entry.itemTemplateId || ''}" placeholder="None (currency)" />
        </div>
        <div class="form-group">
          <label>Drop Chance %</label>
          <input type="number" data-field="dropChance" data-index="${index}" min="0" max="100" step="0.1" value="${entry.dropChance}" />
        </div>
        <div class="form-group">
          <label>Min Quantity</label>
          <input type="number" data-field="minQuantity" data-index="${index}" min="0" value="${entry.minQuantity}" />
        </div>
        <div class="form-group">
          <label>Max Quantity</label>
          <input type="number" data-field="maxQuantity" data-index="${index}" min="0" value="${entry.maxQuantity}" />
        </div>
        <div class="form-group">
          <label>Currency Min (copper)</label>
          <input type="number" data-field="currencyMin" data-index="${index}" min="0" value="${entry.currencyMin}" />
        </div>
        <div class="form-group">
          <label>Currency Max (copper)</label>
          <input type="number" data-field="currencyMax" data-index="${index}" min="0" value="${entry.currencyMax}" />
        </div>
      </div>
      <div class="denomination-checkboxes">
        <div class="denom-title">Allowed Denominations</div>
        <div class="denom-grid">${denomChecks}</div>
      </div>
    `;
    container.appendChild(row);
  });

  // Wire up field change listeners
  container.querySelectorAll('input[data-field], select[data-field]').forEach(el => {
    el.addEventListener('change', handleEntryFieldChange);
    el.addEventListener('input', handleEntryFieldChange);
  });

  // Wire up denomination checkboxes
  container.querySelectorAll('input[data-denom]').forEach(el => {
    el.addEventListener('change', handleDenomChange);
  });

  // Wire up remove buttons
  container.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0');
      editingEntries.splice(index, 1);
      renderEntries();
    });
  });
}

function handleEntryFieldChange(e: Event): void {
  const el = e.target as HTMLInputElement;
  const index = parseInt(el.dataset.index || '0');
  const field = el.dataset.field as string;
  if (index < 0 || index >= editingEntries.length || !field) return;

  if (field === 'itemTemplateId') {
    const val = el.value.trim();
    editingEntries[index].itemTemplateId = val ? parseInt(val) || null : null;
    // Update title
    const row = el.closest('.entry-row');
    const title = row?.querySelector('.entry-title');
    if (title) title.textContent = `Entry ${index + 1}: ${getItemName(editingEntries[index].itemTemplateId)}`;
  } else {
    (editingEntries[index] as unknown as Record<string, unknown>)[field] = parseNumberOrDefault(el.value, 0);
  }
}

function handleDenomChange(e: Event): void {
  const el = e.target as HTMLInputElement;
  const index = parseInt(el.dataset.index || '0');
  const denom = el.dataset.denom as string;
  if (index < 0 || index >= editingEntries.length || !denom) return;

  const entry = editingEntries[index];
  if (el.checked) {
    if (!entry.allowedDenominations.includes(denom)) {
      entry.allowedDenominations.push(denom);
    }
  } else {
    entry.allowedDenominations = entry.allowedDenominations.filter(d => d !== denom);
    // Don't allow empty
    if (entry.allowedDenominations.length === 0) {
      entry.allowedDenominations.push('copper');
      el.checked = false; // Will re-render, but let's also update checkbox
      showToast('Must have at least one denomination', 'warning');
      renderEntries();
    }
  }
}

function addEntry(): void {
  editingEntries.push({
    itemTemplateId: null,
    dropChance: 50,
    minQuantity: 1,
    maxQuantity: 1,
    currencyMin: 0,
    currencyMax: 0,
    allowedDenominations: [...ALL_DENOMINATIONS],
  });
  renderEntries();
}

// ============================================================================
// CRUD Operations
// ============================================================================

async function createTable(): Promise<void> {
  try {
    const response = await fetch('/api/drop-tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Drop Table' }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to create table', 'error');
      return;
    }

    await fetchDropTables();
    selectTable(data.dropTable.id);
    showToast('Drop table created', 'success');
  } catch (error) {
    console.error('Failed to create table:', error);
    showToast('Failed to create drop table', 'error');
  }
}

async function saveTable(): Promise<void> {
  if (!selectedTableId) return;

  const name = getElement<HTMLInputElement>('dt-name')?.value || '';
  const description = getElement<HTMLTextAreaElement>('dt-description')?.value || '';

  if (!name.trim()) {
    showToast('Name is required', 'error');
    return;
  }

  try {
    // Update table details
    const response = await fetch(`/api/drop-tables/${selectedTableId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to save table', 'error');
      return;
    }

    // Sync entries: delete removed, update existing, create new
    const existing = await fetchTableWithEntries(selectedTableId);
    const existingEntries = existing?.entries || [];
    const existingIds = new Set(existingEntries.map(e => e.id));
    const editingIds = new Set(editingEntries.filter(e => e.id).map(e => e.id));

    // Delete entries that were removed
    for (const id of existingIds) {
      if (!editingIds.has(id)) {
        const delRes = await fetch(`/api/drop-tables/${selectedTableId}/entries/${id}`, { method: 'DELETE' });
        const delData = await delRes.json();
        if (!delData.success) {
          showToast(delData.message || `Failed to delete entry ${id}`, 'error');
          return;
        }
      }
    }

    // Update existing or create new
    for (const entry of editingEntries) {
      const body = {
        itemTemplateId: entry.itemTemplateId,
        dropChance: entry.dropChance,
        minQuantity: entry.minQuantity,
        maxQuantity: entry.maxQuantity,
        currencyMin: entry.currencyMin,
        currencyMax: entry.currencyMax,
        allowedDenominations: entry.allowedDenominations,
      };

      let entryRes: Response;
      if (entry.id && existingIds.has(entry.id)) {
        entryRes = await fetch(`/api/drop-tables/${selectedTableId}/entries/${entry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        entryRes = await fetch(`/api/drop-tables/${selectedTableId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, dropChance: body.dropChance ?? 50 }),
        });
      }
      const entryData = await entryRes.json();
      if (!entryData.success) {
        showToast(entryData.message || 'Failed to save entry', 'error');
        return;
      }
    }

    await fetchDropTables();
    await selectTable(selectedTableId);
    showToast('Drop table saved', 'success');
  } catch (error) {
    console.error('Failed to save table:', error);
    showToast('Failed to save drop table', 'error');
  }
}

async function deleteTable(): Promise<void> {
  if (!selectedTableId) return;
  if (!confirm('Delete this drop table? NPCs using it will lose their drop table reference.')) return;

  try {
    const response = await fetch(`/api/drop-tables/${selectedTableId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to delete table', 'error');
      return;
    }

    selectedTableId = null;
    const noSelected = getElement<HTMLElement>('no-dt-selected');
    const form = getElement<HTMLFormElement>('dt-form');
    if (noSelected) noSelected.style.display = 'block';
    if (form) form.style.display = 'none';

    const simBtn = getElement<HTMLButtonElement>('simulate-btn');
    if (simBtn) simBtn.disabled = true;

    await fetchDropTables();
    clearSimulation();
    showToast('Drop table deleted', 'success');
  } catch (error) {
    console.error('Failed to delete table:', error);
    showToast('Failed to delete drop table', 'error');
  }
}

async function duplicateTable(): Promise<void> {
  if (!selectedTableId) return;

  const name = (getElement<HTMLInputElement>('dt-name')?.value || 'Drop Table') + ' (copy)';
  const description = getElement<HTMLTextAreaElement>('dt-description')?.value || '';

  try {
    // Create new table
    const response = await fetch('/api/drop-tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to duplicate', 'error');
      return;
    }

    const newId = data.dropTable.id;

    // Copy entries
    for (const entry of editingEntries) {
      const entryRes = await fetch(`/api/drop-tables/${newId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemTemplateId: entry.itemTemplateId,
          dropChance: entry.dropChance,
          minQuantity: entry.minQuantity,
          maxQuantity: entry.maxQuantity,
          currencyMin: entry.currencyMin,
          currencyMax: entry.currencyMax,
          allowedDenominations: entry.allowedDenominations,
        }),
      });
      const entryData = await entryRes.json();
      if (!entryData.success) {
        showToast(entryData.message || 'Failed to copy entry during duplication', 'error');
        // Still select the partially-created table so user can fix it
        await fetchDropTables();
        await selectTable(newId);
        return;
      }
    }

    await fetchDropTables();
    await selectTable(newId);
    showToast('Drop table duplicated', 'success');
  } catch (error) {
    console.error('Failed to duplicate table:', error);
    showToast('Failed to duplicate drop table', 'error');
  }
}

// ============================================================================
// Simulation
// ============================================================================

function clearSimulation(): void {
  const content = getElement<HTMLElement>('simulation-content');
  if (content) content.innerHTML = '<p class="hint">Select a drop table to simulate drops</p>';
}

function runSimulation(): void {
  const iterInput = getElement<HTMLInputElement>('sim-iterations');
  const iterations = Math.min(Math.max(parseInt(iterInput?.value || '100') || 100, 1), 10000);
  const content = getElement<HTMLElement>('simulation-content');
  if (!content) return;

  if (editingEntries.length === 0) {
    content.innerHTML = '<p class="hint">No entries to simulate</p>';
    return;
  }

  // Track stats
  const itemDropCounts: Record<string, number> = {};
  let totalCurrency = 0;
  let totalDrops = 0;

  for (let i = 0; i < iterations; i++) {
    for (const entry of editingEntries) {
      const roll = Math.random() * 100;
      if (roll < entry.dropChance) {
        totalDrops++;

        // Item drops
        if (entry.itemTemplateId) {
          const qty = entry.minQuantity + Math.floor(Math.random() * (entry.maxQuantity - entry.minQuantity + 1));
          const name = getItemName(entry.itemTemplateId);
          itemDropCounts[name] = (itemDropCounts[name] || 0) + qty;
        }

        // Currency drops
        if (entry.currencyMax > 0) {
          const amount = entry.currencyMin + Math.floor(Math.random() * (entry.currencyMax - entry.currencyMin + 1));
          totalCurrency += amount;
        }
      }
    }
  }

  // Render results
  const avgCurrency = totalCurrency / iterations;
  const avgDrops = totalDrops / iterations;

  let itemLines = '';
  const sortedItems = Object.entries(itemDropCounts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sortedItems) {
    const avgPerKill = (count / iterations).toFixed(2);
    const pctOfKills = ((count / iterations) * 100).toFixed(1);
    itemLines += `<div class="sim-stat"><span class="label">${escapeHtml(name)}:</span> <span class="value">${count} total (${avgPerKill}/kill, ${pctOfKills}%)</span></div>`;
  }

  content.innerHTML = `
    <div class="sim-section">
      <div class="sim-title">Simulation Results (${iterations} kills)</div>
      <div class="sim-stat"><span class="label">Avg drops/kill:</span> <span class="value">${avgDrops.toFixed(2)}</span></div>
      <div class="sim-stat"><span class="label">Avg currency/kill:</span> <span class="value">${avgCurrency.toFixed(1)} copper</span></div>
      <div class="sim-stat"><span class="label">Total currency:</span> <span class="value">${totalCurrency} copper</span></div>
    </div>
    ${itemLines ? `<div class="sim-section"><div class="sim-title">Item Frequency</div>${itemLines}</div>` : ''}
    <div class="sim-section">
      <div class="sim-title">Configured Rates</div>
      ${editingEntries.map((e, i) => `
        <div class="sim-stat">
          <span class="label">Entry ${i + 1}:</span>
          <span class="value">${e.dropChance}% chance${e.itemTemplateId ? ' - ' + escapeHtml(getItemName(e.itemTemplateId)) : ''}${e.currencyMax > 0 ? ' + ' + e.currencyMin + '-' + e.currencyMax + 'c' : ''}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================================
// Tab Handling
// ============================================================================

function setupTabs(): void {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = (btn as HTMLElement).dataset.tab;
      if (!tabName) return;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const tabContent = document.getElementById(`tab-${tabName}`);
      if (tabContent) tabContent.classList.add('active');
    });
  });
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  await Promise.all([fetchDropTables(), fetchItemTemplates()]);
  setupTabs();

  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`Element #${id} not found for event listener`);
  };

  // CRUD
  addListener('new-dt-btn', 'click', createTable);
  addListener('dt-form', 'submit', (e) => {
    e.preventDefault();
    saveTable();
  });
  addListener('delete-dt-btn', 'click', deleteTable);
  addListener('duplicate-dt-btn', 'click', duplicateTable);

  // Search
  addListener('search-input', 'input', renderTableList);

  // Entries
  addListener('add-entry-btn', 'click', addEntry);

  // Simulation
  addListener('simulate-btn', 'click', runSimulation);

  // Logout
  addListener('logout-btn', 'click', handleLogout);

  // User menu dropdown toggle
  const userMenuBtn = document.getElementById('nav-username');
  const userMenu = userMenuBtn?.closest('.nav-user-menu');
  if (userMenuBtn && userMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('open');
    });
    userMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    document.addEventListener('click', () => {
      userMenu.classList.remove('open');
    });
  }
});

})();
