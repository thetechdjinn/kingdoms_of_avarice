/**
 * Drop Table Editor — three-panel with simulation.
 * Currency is a top-level toggle on the Details tab.
 * Item entries use SearchableSelect with type filtering.
 */

import { initAuth, ListPanel, SearchableSelect, setupTabs, showToast, showConfirm, escapeHtml } from './components/index.js';
import type { SelectOption } from './components/index.js';

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
  item_type: string;
  base_value?: number;
}

interface NpcTemplate {
  id: number;
  name: string;
  level: number;
  dropTableId: number | null;
}

const ALL_DENOMINATIONS = ['copper', 'silver', 'gold', 'platinum', 'runic'];

(async function () {
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let dropTables: DropTable[] = [];
  let itemTemplates: ItemTemplate[] = [];
  let npcTemplates: NpcTemplate[] = [];
  let selectedTableId: number | null = null;

  // Editing state: currency entry is separate from item entries
  let currencyEntry: DropTableEntry | null = null;
  let itemEntries: DropTableEntry[] = [];

  // SearchableSelect instances for each entry row
  const entrySelects: Map<number, SearchableSelect> = new Map();
  let entryCounter = 0;

  // ============================================================================
  // DOM References
  // ============================================================================

  const dtForm = document.getElementById('dt-form') as HTMLFormElement;
  const noDtSelected = document.getElementById('no-dt-selected') as HTMLDivElement;
  const formTitle = document.getElementById('dt-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('dt-id-display') as HTMLSpanElement;
  const dtCount = document.getElementById('dt-count') as HTMLSpanElement;
  const nameInput = document.getElementById('dt-name') as HTMLInputElement;
  const descriptionInput = document.getElementById('dt-description') as HTMLInputElement;
  const entriesContainer = document.getElementById('entries-container') as HTMLDivElement;
  const noEntriesHint = document.getElementById('no-entries-hint') as HTMLDivElement;
  const npcRefContent = document.getElementById('npc-ref-content') as HTMLDivElement;
  const simulationContent = document.getElementById('simulation-content') as HTMLDivElement;
  const simBtn = document.getElementById('simulate-btn') as HTMLButtonElement;

  // Currency fields
  const currencyEnabled = document.getElementById('currency-enabled') as HTMLInputElement;
  const currencyFields = document.getElementById('currency-fields') as HTMLDivElement;
  const currencyChance = document.getElementById('currency-chance') as HTMLInputElement;
  const currencyMin = document.getElementById('currency-min') as HTMLInputElement;
  const currencyMax = document.getElementById('currency-max') as HTMLInputElement;
  const currencyDenomsContainer = document.getElementById('currency-denoms') as HTMLDivElement;

  // ============================================================================
  // List Panel
  // ============================================================================

  const listPanel = new ListPanel<DropTable>({
    listElement: document.getElementById('dt-list')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    onSelect: (item) => selectTable(item.id),
    getId: (item) => item.id,
    renderItem: (item) => {
      const count = item.entries?.length ?? 0;
      return `
        <span class="dt-name">${escapeHtml(item.name)}</span>
        <span class="dt-meta">ID: ${item.id}${count ? ` · ${count} entries` : ''}</span>
      `;
    },
    filterFn: (item, search) =>
      item.name.toLowerCase().includes(search) || String(item.id).includes(search),
    sortFn: (a, b) => a.name.localeCompare(b.name),
    onRender: updateCount,
  });

  setupTabs({ container: dtForm });

  // ============================================================================
  // Item Options for SearchableSelect
  // ============================================================================

  function getItemOptions(typeFilter?: string): SelectOption[] {
    let filtered = itemTemplates;
    if (typeFilter) {
      filtered = filtered.filter(i => i.item_type === typeFilter);
    }
    return filtered
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({
        value: String(i.id),
        label: i.name,
        group: i.item_type,
        detail: `#${i.id}`,
      }));
  }

  // ============================================================================
  // API
  // ============================================================================

  async function fetchDropTables(): Promise<void> {
    try {
      const res = await fetch('/api/drop-tables', { credentials: 'include' });
      const data = await res.json();
      dropTables = data.dropTables || [];
      listPanel.setItems(dropTables);
      listPanel.setSelected(selectedTableId);
    } catch (error) {
      console.error('Failed to fetch drop tables:', error);
      showToast('Failed to load drop tables', 'error');
    }
  }

  async function fetchItemTemplates(): Promise<void> {
    try {
      const res = await fetch('/api/items/templates', { credentials: 'include' });
      const data = await res.json();
      itemTemplates = data.templates || [];
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  }

  async function fetchNpcTemplates(): Promise<void> {
    try {
      const res = await fetch('/api/npcs', { credentials: 'include' });
      const data = await res.json();
      npcTemplates = data.templates || [];
    } catch (error) {
      console.error('Failed to fetch NPCs:', error);
    }
  }

  async function fetchTableWithEntries(id: number): Promise<DropTable | null> {
    try {
      const res = await fetch(`/api/drop-tables/${id}`, { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.dropTable || null;
    } catch (error) {
      console.error('Failed to fetch drop table:', error);
      return null;
    }
  }

  // ============================================================================
  // Currency Denomination Rendering
  // ============================================================================

  let currencyDenoms: string[] = [...ALL_DENOMINATIONS];

  function renderCurrencyDenoms(): void {
    currencyDenomsContainer.innerHTML = ALL_DENOMINATIONS.map(d => {
      const checked = currencyDenoms.includes(d) ? 'checked' : '';
      return `<label><input type="checkbox" data-denom="${d}" ${checked} /> ${escapeHtml(d)}</label>`;
    }).join('');

    currencyDenomsContainer.querySelectorAll('input[data-denom]').forEach(el => {
      el.addEventListener('change', () => {
        const cb = el as HTMLInputElement;
        const denom = cb.dataset.denom!;
        if (cb.checked) {
          if (!currencyDenoms.includes(denom)) currencyDenoms.push(denom);
        } else {
          currencyDenoms = currencyDenoms.filter(d => d !== denom);
          if (currencyDenoms.length === 0) {
            currencyDenoms.push('copper');
            showToast('Must have at least one denomination', 'warning');
            renderCurrencyDenoms();
          }
        }
      });
    });
  }

  // ============================================================================
  // Selection
  // ============================================================================

  async function selectTable(id: number): Promise<void> {
    selectedTableId = id;

    const tableData = await fetchTableWithEntries(id);
    if (!tableData) {
      showToast('Failed to load drop table', 'error');
      return;
    }

    noDtSelected.style.display = 'none';
    dtForm.style.display = 'block';
    formTitle.textContent = 'Edit Drop Table';
    idDisplay.textContent = `ID: ${tableData.id}`;

    nameInput.value = tableData.name;
    descriptionInput.value = tableData.description || '';

    // Split entries: currency (itemTemplateId=null) vs items
    const allEntries = (tableData.entries || []).map(e => ({
      ...e,
      allowedDenominations: [...(e.allowedDenominations || [])],
    }));

    const currencyEntries = allEntries.filter(e => e.itemTemplateId === null);
    itemEntries = allEntries.filter(e => e.itemTemplateId !== null);

    // Currency: use first currency entry if exists
    if (currencyEntries.length > 0) {
      currencyEntry = currencyEntries[0];
      currencyEnabled.checked = true;
      currencyFields.style.display = 'block';
      currencyChance.value = String(currencyEntry.dropChance);
      currencyMin.value = String(currencyEntry.currencyMin);
      currencyMax.value = String(currencyEntry.currencyMax);
      currencyDenoms = [...currencyEntry.allowedDenominations];
    } else {
      currencyEntry = null;
      currencyEnabled.checked = false;
      currencyFields.style.display = 'none';
      currencyChance.value = '100';
      currencyMin.value = '1';
      currencyMax.value = '10';
      currencyDenoms = [...ALL_DENOMINATIONS];
    }
    renderCurrencyDenoms();

    renderEntries();
    listPanel.setSelected(id);
    simBtn.disabled = false;
    clearSimulation();
    updateNpcReferences(id);
  }

  function clearForm(): void {
    selectedTableId = null;
    currencyEntry = null;
    itemEntries = [];
    destroyEntrySelects();
    noDtSelected.style.display = 'flex';
    dtForm.style.display = 'none';
    idDisplay.textContent = '';
    simBtn.disabled = true;
    clearSimulation();
    listPanel.setSelected(null);
  }

  // ============================================================================
  // Entry Rendering (Items Only)
  // ============================================================================

  function getItemName(itemId: number | null): string {
    if (!itemId) return '(none)';
    const item = itemTemplates.find(i => i.id === itemId);
    return item ? item.name : `Item #${itemId}`;
  }

  function destroyEntrySelects(): void {
    entrySelects.forEach(s => s.destroy());
    entrySelects.clear();
  }

  function renderEntries(): void {
    destroyEntrySelects();
    entriesContainer.innerHTML = '';

    if (itemEntries.length === 0) {
      noEntriesHint.style.display = 'block';
      return;
    }
    noEntriesHint.style.display = 'none';

    itemEntries.forEach((entry, index) => {
      const rowId = entryCounter++;
      const row = document.createElement('div');
      row.className = 'entry-row';
      row.innerHTML = `
        <div class="entry-row-header">
          <span class="entry-title">${escapeHtml(getItemName(entry.itemTemplateId))}</span>
          <button type="button" class="btn-remove" data-index="${index}">Remove</button>
        </div>
        <div class="entry-fields">
          <div class="form-group entry-type-filter">
            <label>Type</label>
            <select data-row="${rowId}">
              <option value="">All</option>
              <option value="weapon">Weapon</option>
              <option value="armor">Armor</option>
              <option value="consumable">Consumable</option>
              <option value="key">Key</option>
              <option value="light">Light</option>
              <option value="tool">Tool</option>
              <option value="misc">Misc</option>
            </select>
          </div>
          <div class="form-group entry-item-select">
            <label>Item</label>
            <div id="item-select-${rowId}"></div>
          </div>
          <div class="form-group entry-number-field">
            <label>Chance %</label>
            <input type="number" data-field="dropChance" data-index="${index}" min="0" max="100" step="0.1" value="${entry.dropChance}" />
          </div>
          <div class="form-group entry-number-field">
            <label>Min Qty</label>
            <input type="number" data-field="minQuantity" data-index="${index}" min="1" value="${entry.minQuantity}" />
          </div>
          <div class="form-group entry-number-field">
            <label>Max Qty</label>
            <input type="number" data-field="maxQuantity" data-index="${index}" min="1" value="${entry.maxQuantity}" />
          </div>
        </div>
      `;
      entriesContainer.appendChild(row);

      // Create SearchableSelect for item
      const selectContainer = document.getElementById(`item-select-${rowId}`)!;
      const select = new SearchableSelect({
        container: selectContainer,
        placeholder: 'Search items...',
        options: getItemOptions(),
        onChange: (value) => {
          itemEntries[index].itemTemplateId = value ? parseInt(value) : null;
          const title = row.querySelector('.entry-title');
          if (title) title.textContent = getItemName(itemEntries[index].itemTemplateId);
        },
      });
      if (entry.itemTemplateId) {
        select.setValue(String(entry.itemTemplateId));
      }
      entrySelects.set(rowId, select);

      // Wire up per-row type filter
      const typeSelect = row.querySelector(`select[data-row="${rowId}"]`) as HTMLSelectElement;
      typeSelect.addEventListener('change', () => {
        select.setOptions(getItemOptions(typeSelect.value || undefined));
      });
    });

    // Wire up number field changes
    entriesContainer.querySelectorAll('input[data-field]').forEach(el => {
      el.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const idx = parseInt(input.dataset.index || '0');
        const field = input.dataset.field as string;
        if (idx >= 0 && idx < itemEntries.length && field) {
          const val = parseFloat(input.value) || 0;
          (itemEntries[idx] as unknown as Record<string, unknown>)[field] = val;
        }
      });
    });

    // Wire up remove buttons
    entriesContainer.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.target as HTMLElement).dataset.index || '0');
        itemEntries.splice(idx, 1);
        renderEntries();
      });
    });
  }

  // ============================================================================
  // NPC References
  // ============================================================================

  function updateNpcReferences(tableId: number): void {
    const refs = npcTemplates.filter(n => n.dropTableId === tableId).sort((a, b) => a.name.localeCompare(b.name));

    if (refs.length === 0) {
      npcRefContent.innerHTML = '<p class="no-refs">No NPCs use this drop table</p>';
      return;
    }

    npcRefContent.innerHTML = `<ul class="npc-ref-list">${refs.map(n => `
      <li>
        <span class="npc-ref-name">${escapeHtml(n.name)}</span>
        <span class="npc-ref-level">Lv ${n.level}</span>
      </li>
    `).join('')}</ul>`;
  }

  // ============================================================================
  // Gather All Entries for Save
  // ============================================================================

  function gatherAllEntries(): DropTableEntry[] {
    const entries: DropTableEntry[] = [];

    // Currency entry (stored as entry with null itemTemplateId)
    if (currencyEnabled.checked) {
      entries.push({
        id: currencyEntry?.id,
        itemTemplateId: null,
        dropChance: Number.isFinite(parseFloat(currencyChance.value)) ? parseFloat(currencyChance.value) : 100,
        minQuantity: 1,
        maxQuantity: 1,
        currencyMin: parseInt(currencyMin.value) || 0,
        currencyMax: parseInt(currencyMax.value) || 0,
        allowedDenominations: [...currencyDenoms],
      });
    }

    // Item entries
    for (const entry of itemEntries) {
      entries.push({
        id: entry.id,
        itemTemplateId: entry.itemTemplateId,
        dropChance: entry.dropChance,
        minQuantity: entry.minQuantity,
        maxQuantity: entry.maxQuantity,
        currencyMin: 0,
        currencyMax: 0,
        allowedDenominations: [...ALL_DENOMINATIONS],
      });
    }

    return entries;
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async function createTable(): Promise<void> {
    try {
      const res = await fetch('/api/drop-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: 'New Drop Table' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Drop table created', 'success');
        await fetchDropTables();
        selectTable(data.dropTable.id);
      } else {
        showToast(data.message || 'Failed to create table', 'error');
      }
    } catch (error) {
      console.error('Failed to create table:', error);
      showToast('Failed to create drop table', 'error');
    }
  }

  async function saveTable(): Promise<void> {
    if (!selectedTableId) return;

    const name = nameInput.value.trim();
    if (!name) {
      showToast('Name is required', 'warning');
      nameInput.focus();
      return;
    }

    try {
      // Update table details
      const res = await fetch(`/api/drop-tables/${selectedTableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description: descriptionInput.value.trim() || null }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.message || 'Failed to save table', 'error');
        return;
      }

      // Sync entries
      const existing = await fetchTableWithEntries(selectedTableId);
      const existingEntries = existing?.entries || [];
      const existingIds = new Set(existingEntries.map(e => e.id));

      const allEntries = gatherAllEntries();
      const editingIds = new Set(allEntries.filter(e => e.id).map(e => e.id));

      // Delete removed entries
      for (const id of existingIds) {
        if (!editingIds.has(id)) {
          await fetch(`/api/drop-tables/${selectedTableId}/entries/${id}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        }
      }

      // Create/update entries
      for (const entry of allEntries) {
        const body = {
          itemTemplateId: entry.itemTemplateId,
          dropChance: entry.dropChance,
          minQuantity: entry.minQuantity,
          maxQuantity: entry.maxQuantity,
          currencyMin: entry.currencyMin,
          currencyMax: entry.currencyMax,
          allowedDenominations: entry.allowedDenominations,
        };

        if (entry.id && existingIds.has(entry.id)) {
          await fetch(`/api/drop-tables/${selectedTableId}/entries/${entry.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          });
        } else {
          await fetch(`/api/drop-tables/${selectedTableId}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          });
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
    const table = dropTables.find(t => t.id === selectedTableId);
    const name = table?.name || 'this table';
    const refs = npcTemplates.filter(n => n.dropTableId === selectedTableId);

    let message = `Delete drop table "${name}"?`;
    if (refs.length > 0) {
      message += ` ${refs.length} NPC(s) will lose their drop table.`;
    }

    const confirmed = await showConfirm(message, { confirmText: 'Delete', dangerous: true });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/drop-tables/${selectedTableId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Drop table deleted', 'success');
        await fetchDropTables();
        clearForm();
      } else {
        showToast(data.message || 'Failed to delete table', 'error');
      }
    } catch (error) {
      console.error('Failed to delete table:', error);
      showToast('Failed to delete drop table', 'error');
    }
  }

  async function duplicateTable(): Promise<void> {
    if (!selectedTableId) return;

    const name = (nameInput.value || 'Drop Table') + ' (copy)';
    const description = descriptionInput.value.trim() || null;

    try {
      const res = await fetch('/api/drop-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.message || 'Failed to duplicate', 'error');
        return;
      }

      const newId = data.dropTable.id;
      const allEntries = gatherAllEntries();

      for (const entry of allEntries) {
        await fetch(`/api/drop-tables/${newId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
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
      }

      await fetchDropTables();
      await selectTable(newId);
      showToast('Drop table duplicated', 'success');
    } catch (error) {
      console.error('Failed to duplicate:', error);
      showToast('Failed to duplicate drop table', 'error');
    }
  }

  // ============================================================================
  // Simulation
  // ============================================================================

  function clearSimulation(): void {
    simulationContent.innerHTML = '<p class="hint">Click Simulate to run a drop simulation</p>';
  }

  function runSimulation(): void {
    const iterInput = document.getElementById('sim-iterations') as HTMLInputElement;
    const iterations = Math.min(Math.max(parseInt(iterInput.value) || 1000, 1), 10000);

    const allEntries = gatherAllEntries();
    if (allEntries.length === 0) {
      simulationContent.innerHTML = '<p class="hint">No entries to simulate</p>';
      return;
    }

    const itemDropCounts: Record<string, number> = {};
    let totalCurrency = 0;
    let totalDrops = 0;

    for (let i = 0; i < iterations; i++) {
      for (const entry of allEntries) {
        if (Math.random() * 100 < entry.dropChance) {
          totalDrops++;

          if (entry.itemTemplateId) {
            const qty = entry.minQuantity + Math.floor(Math.random() * (entry.maxQuantity - entry.minQuantity + 1));
            const name = getItemName(entry.itemTemplateId);
            itemDropCounts[name] = (itemDropCounts[name] || 0) + qty;
          }

          if (entry.currencyMax > 0) {
            totalCurrency += entry.currencyMin + Math.floor(Math.random() * (entry.currencyMax - entry.currencyMin + 1));
          }
        }
      }
    }

    const avgCurrency = totalCurrency / iterations;
    const avgDrops = totalDrops / iterations;

    let itemLines = '';
    const sorted = Object.entries(itemDropCounts).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      const avg = (count / iterations).toFixed(2);
      const pct = ((count / iterations) * 100).toFixed(1);
      itemLines += `<div class="sim-stat"><span class="label">${escapeHtml(name)}:</span> <span class="value">${count} (${avg}/kill, ${pct}%)</span></div>`;
    }

    simulationContent.innerHTML = `
      <div class="sim-section">
        <div class="sim-title">Results (${iterations} kills)</div>
        <div class="sim-stat"><span class="label">Avg drops/kill:</span> <span class="value">${avgDrops.toFixed(2)}</span></div>
        ${totalCurrency > 0 ? `<div class="sim-stat"><span class="label">Avg currency/kill:</span> <span class="value">${avgCurrency.toFixed(1)} copper</span></div>` : ''}
      </div>
      ${itemLines ? `<div class="sim-section"><div class="sim-title">Item Frequency</div>${itemLines}</div>` : ''}
    `;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function updateCount(filtered: number, total: number): void {
    dtCount.textContent = filtered === total ? `${total}` : `${filtered}/${total}`;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  document.getElementById('new-dt-btn')?.addEventListener('click', createTable);

  dtForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveTable();
  });

  document.getElementById('delete-dt-btn')?.addEventListener('click', deleteTable);
  document.getElementById('duplicate-dt-btn')?.addEventListener('click', duplicateTable);

  // Add item entry
  document.getElementById('add-entry-btn')?.addEventListener('click', () => {
    itemEntries.push({
      itemTemplateId: null,
      dropChance: 50,
      minQuantity: 1,
      maxQuantity: 1,
      currencyMin: 0,
      currencyMax: 0,
      allowedDenominations: [...ALL_DENOMINATIONS],
    });
    renderEntries();
  });

  // Currency toggle
  currencyEnabled.addEventListener('change', () => {
    currencyFields.style.display = currencyEnabled.checked ? 'block' : 'none';
  });

  // Denomination All/None buttons
  document.getElementById('denom-all-btn')?.addEventListener('click', () => {
    currencyDenoms = [...ALL_DENOMINATIONS];
    renderCurrencyDenoms();
  });

  document.getElementById('denom-none-btn')?.addEventListener('click', () => {
    currencyDenoms = ['copper'];
    showToast('Must have at least one denomination', 'warning');
    renderCurrencyDenoms();
  });

  // Simulation
  document.getElementById('simulate-btn')?.addEventListener('click', runSimulation);

  // Export
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const tables: DropTable[] = [];
      for (const t of dropTables) {
        const full = await fetchTableWithEntries(t.id);
        if (full) tables.push(full);
      }

      const blob = new Blob([JSON.stringify({ dropTables: tables }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drop_tables_export.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${tables.length} drop tables`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Failed to export', 'error');
    }
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchDropTables(), fetchItemTemplates(), fetchNpcTemplates()]);
})();
