/**
 * Progression Table Editor - View and edit XP/essence requirements per level
 */
import { renderNav } from './components/nav.js';
import { initAuth } from './components/auth.js';
import { showConfirm } from './components/modal.js';

interface LevelRow {
  level: number;
  std_xp_required: number;
  base_essence_required: number;
}

(async function () {
  renderNav({ activePage: 'progression-table-editor' });

  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State & DOM Elements
  // ============================================================================

  let levels: LevelRow[] = [];

  const tableBody = document.getElementById('table-body') as HTMLTableSectionElement;
  const statusMessage = document.getElementById('status-message') as HTMLDivElement;
  const newLevelInput = document.getElementById('new-level') as HTMLInputElement;
  const newXpInput = document.getElementById('new-xp') as HTMLInputElement;
  const newEssenceInput = document.getElementById('new-essence') as HTMLInputElement;
  const addLevelBtn = document.getElementById('add-level-btn') as HTMLButtonElement;

  // ============================================================================
  // Status Messages
  // ============================================================================

  let statusTimeout: ReturnType<typeof setTimeout> | null = null;

  function showStatus(message: string, type: 'success' | 'error'): void {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }
    statusTimeout = setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  }

  // ============================================================================
  // API Functions
  // ============================================================================

  async function fetchLevels(): Promise<void> {
    try {
      const res = await fetch('/api/progression-table', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        levels = (data.levels as LevelRow[]).sort((a, b) => a.level - b.level);
        renderTable();
      } else {
        showStatus(data.message || 'Failed to fetch progression table', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch progression table:', error);
      showStatus('Failed to fetch progression table', 'error');
    }
  }

  async function saveLevel(level: number, std_xp_required: number, base_essence_required: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/progression-table/${level}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ std_xp_required, base_essence_required }),
      });

      const data = await res.json();
      if (data.success) {
        showStatus(`Level ${level} saved successfully`, 'success');
        await fetchLevels();
        return true;
      } else {
        showStatus(data.message || `Failed to save level ${level}`, 'error');
        return false;
      }
    } catch (error) {
      console.error('Failed to save level:', error);
      showStatus(`Failed to save level ${level}`, 'error');
      return false;
    }
  }

  async function deleteLevel(level: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/progression-table/${level}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        showStatus(`Level ${level} deleted`, 'success');
        await fetchLevels();
        return true;
      } else {
        showStatus(data.message || `Failed to delete level ${level}`, 'error');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete level:', error);
      showStatus(`Failed to delete level ${level}`, 'error');
      return false;
    }
  }

  // ============================================================================
  // Calculations
  // ============================================================================

  function calculateGrowth(index: number): string {
    if (index <= 0) return '--';
    const prevXp = levels[index - 1].std_xp_required;
    const currXp = levels[index].std_xp_required;
    if (prevXp <= 0) return '--';
    const ratio = currXp / prevXp;
    return ratio.toFixed(2) + 'x';
  }

  function calculateTotalXp(index: number): number {
    let total = 0;
    for (let i = 0; i <= index; i++) {
      total += levels[i].std_xp_required;
    }
    return total;
  }

  function formatNumber(n: number): string {
    return n.toLocaleString();
  }

  // ============================================================================
  // UI Rendering
  // ============================================================================

  function renderTable(): void {
    tableBody.innerHTML = '';

    const maxLevel = levels.length > 0 ? levels[levels.length - 1].level : 0;

    for (let i = 0; i < levels.length; i++) {
      const row = levels[i];
      const tr = document.createElement('tr');

      const growth = calculateGrowth(i);
      const totalXp = calculateTotalXp(i);
      const isMaxLevel = row.level === maxLevel;

      tr.innerHTML = `
        <td class="col-level">${row.level}</td>
        <td>
          <input type="number" class="input-xp" min="1" value="${row.std_xp_required}" data-level="${row.level}" data-field="xp" />
        </td>
        <td>
          <input type="number" class="input-essence" min="0" value="${row.base_essence_required}" data-level="${row.level}" data-field="essence" />
        </td>
        <td class="col-calculated">${growth}</td>
        <td class="col-calculated">${formatNumber(totalXp)}</td>
        <td class="col-actions-cell">
          <button class="btn-save" data-level="${row.level}">Save</button>
          ${isMaxLevel ? `<button class="btn-delete" data-level="${row.level}">Delete</button>` : ''}
        </td>
      `;

      tableBody.appendChild(tr);
    }

    // Attach event listeners to save/delete buttons
    tableBody.querySelectorAll('.btn-save').forEach((btn) => {
      btn.addEventListener('click', handleSave);
    });

    tableBody.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', handleDelete);
    });

    // Auto-suggest next level for the add row
    if (levels.length > 0) {
      const maxLevel = levels[levels.length - 1].level;
      newLevelInput.value = String(maxLevel + 1);
    } else {
      newLevelInput.value = '2';
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function handleSave(e: Event): void {
    const btn = e.currentTarget as HTMLButtonElement;
    const level = parseInt(btn.dataset.level!);
    const row = btn.closest('tr')!;

    const xpInput = row.querySelector('input[data-field="xp"]') as HTMLInputElement;
    const essenceInput = row.querySelector('input[data-field="essence"]') as HTMLInputElement;

    const xp = parseInt(xpInput.value);
    const essence = parseInt(essenceInput.value);

    if (isNaN(xp) || xp <= 0) {
      showStatus('XP required must be a positive number', 'error');
      xpInput.focus();
      return;
    }

    if (isNaN(essence) || essence < 0) {
      showStatus('Essence required must be zero or greater', 'error');
      essenceInput.focus();
      return;
    }

    saveLevel(level, xp, essence);
  }

  async function handleDelete(e: Event): Promise<void> {
    const btn = e.currentTarget as HTMLButtonElement;
    const level = parseInt(btn.dataset.level!);

    if (!await showConfirm(`Delete level ${level}? This cannot be undone.`, { dangerous: true })) {
      return;
    }

    deleteLevel(level);
  }

  // Add level button
  addLevelBtn.addEventListener('click', async () => {
    const level = parseInt(newLevelInput.value);
    const xp = parseInt(newXpInput.value);
    const essence = parseInt(newEssenceInput.value);

    if (isNaN(level) || level < 2) {
      showStatus('Level must be 2 or greater', 'error');
      newLevelInput.focus();
      return;
    }

    if (isNaN(xp) || xp <= 0) {
      showStatus('XP required must be a positive number', 'error');
      newXpInput.focus();
      return;
    }

    if (isNaN(essence) || essence < 0) {
      showStatus('Essence required must be zero or greater', 'error');
      newEssenceInput.focus();
      return;
    }

    // Check for duplicate level
    if (levels.some(l => l.level === level)) {
      if (!await showConfirm(`Level ${level} already exists. Overwrite it?`)) {
        return;
      }
    }

    saveLevel(level, xp, essence).then((success) => {
      if (success) {
        newXpInput.value = '';
        newEssenceInput.value = '';
      }
    });
  });

  // Allow Enter key to submit the add row
  [newLevelInput, newXpInput, newEssenceInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addLevelBtn.click();
      }
    });
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await fetchLevels();
})();
