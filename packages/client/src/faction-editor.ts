/**
 * Faction Editor — two-panel layout with linked NPC reverse lookup.
 * Uses shared components: initAuth, ListPanel, showToast, showConfirm.
 */

import { initAuth, ListPanel, showToast, showConfirm, escapeHtml } from './components/index.js';

interface Faction {
  id: number;
  name: string;
  description: string | null;
  factionType: string;
}

interface NpcTemplate {
  id: number;
  name: string;
  level: number;
  primaryFactionId: number | null;
}

(async function () {
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let factions: Faction[] = [];
  let npcTemplates: NpcTemplate[] = [];
  let selectedFactionId: number | null = null;

  // ============================================================================
  // DOM References
  // ============================================================================

  const factionForm = document.getElementById('faction-form') as HTMLFormElement;
  const noFactionSelected = document.getElementById('no-faction-selected') as HTMLDivElement;
  const formTitle = document.getElementById('faction-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('faction-id-display') as HTMLSpanElement;
  const factionCount = document.getElementById('faction-count') as HTMLSpanElement;
  const linkedNpcsEl = document.getElementById('linked-npcs') as HTMLDivElement;

  const nameInput = document.getElementById('faction-name') as HTMLInputElement;
  const typeSelect = document.getElementById('faction-type') as HTMLSelectElement;
  const descriptionInput = document.getElementById('faction-description') as HTMLTextAreaElement;

  // ============================================================================
  // List Panel
  // ============================================================================

  const listPanel = new ListPanel<Faction>({
    listElement: document.getElementById('faction-list')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    onSelect: (item) => selectFaction(item.id),
    getId: (item) => item.id,
    renderItem: (item) => `
      <span class="faction-name">${escapeHtml(item.name)}</span>
      <span class="faction-type">${escapeHtml(item.factionType)}</span>
    `,
    filterFn: (item, search) =>
      item.name.toLowerCase().includes(search) ||
      item.factionType.toLowerCase().includes(search),
    sortFn: (a, b) => a.name.localeCompare(b.name),
    onRender: updateCount,
  });

  // ============================================================================
  // API
  // ============================================================================

  async function fetchFactions(): Promise<void> {
    try {
      const res = await fetch('/api/factions', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        factions = data.factions || [];
        listPanel.setItems(factions);
        listPanel.setSelected(selectedFactionId);
      } else {
        showToast(data.message || 'Failed to fetch factions', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch factions:', error);
      showToast('Failed to fetch factions', 'error');
    }
  }

  async function fetchNpcTemplates(): Promise<void> {
    try {
      const res = await fetch('/api/npcs', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        npcTemplates = data.templates || [];
      }
    } catch (error) {
      console.error('Failed to fetch NPC templates:', error);
      showToast('Failed to fetch NPC data', 'error');
    }
  }

  async function saveFaction(factionData: Partial<Faction>): Promise<Faction | null> {
    try {
      const isNew = !selectedFactionId;
      const url = isNew ? '/api/factions' : `/api/factions/${selectedFactionId}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(factionData),
      });

      const data = await res.json();
      if (data.success) {
        showToast(isNew ? 'Faction created' : 'Faction saved', 'success');
        await fetchFactions();
        return data.faction;
      } else {
        showToast(data.message || 'Failed to save faction', 'error');
        return null;
      }
    } catch (error) {
      console.error('Failed to save faction:', error);
      showToast('Failed to save faction', 'error');
      return null;
    }
  }

  async function deleteFaction(id: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/factions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Faction deleted', 'success');
        await fetchFactions();
        return true;
      } else {
        showToast(data.message || 'Failed to delete faction', 'error');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete faction:', error);
      showToast('Failed to delete faction', 'error');
      return false;
    }
  }

  // ============================================================================
  // Selection & Form
  // ============================================================================

  function selectFaction(id: number): void {
    selectedFactionId = id;
    const faction = factions.find(f => f.id === id);
    if (!faction) return;

    noFactionSelected.style.display = 'none';
    factionForm.style.display = 'block';
    formTitle.textContent = 'Edit Faction';
    idDisplay.textContent = `ID: ${faction.id}`;

    nameInput.value = faction.name;
    typeSelect.value = faction.factionType;
    descriptionInput.value = faction.description || '';

    listPanel.setSelected(id);
    updateLinkedNpcs(id);
  }

  function clearForm(): void {
    selectedFactionId = null;
    nameInput.value = '';
    typeSelect.value = 'merchant';
    descriptionInput.value = '';

    noFactionSelected.style.display = 'flex';
    factionForm.style.display = 'none';
    idDisplay.textContent = '';
    listPanel.setSelected(null);
  }

  function showNewForm(): void {
    selectedFactionId = null;
    noFactionSelected.style.display = 'none';
    factionForm.style.display = 'block';
    formTitle.textContent = 'New Faction';
    idDisplay.textContent = '';

    nameInput.value = '';
    typeSelect.value = 'merchant';
    descriptionInput.value = '';

    listPanel.setSelected(null);
    nameInput.focus();
    linkedNpcsEl.innerHTML = '<p class="no-linked-npcs">Save the faction first to see linked NPCs</p>';
  }

  // ============================================================================
  // Linked NPCs
  // ============================================================================

  function updateLinkedNpcs(factionId: number): void {
    const linked = npcTemplates.filter(n => n.primaryFactionId === factionId);

    if (linked.length === 0) {
      linkedNpcsEl.innerHTML = '<p class="no-linked-npcs">No NPCs assigned to this faction</p>';
      return;
    }

    const sorted = linked.sort((a, b) => a.name.localeCompare(b.name));
    const listHtml = sorted.map(npc => `
      <li>
        <span class="npc-link-name">${escapeHtml(npc.name)}</span>
        <span class="npc-link-level">Lv ${npc.level}</span>
        <a href="/npc-editor.html" class="npc-link-edit" title="Open NPC Editor">Edit</a>
      </li>
    `).join('');

    linkedNpcsEl.innerHTML = `<ul class="npc-link-list">${listHtml}</ul>`;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function updateCount(filtered: number, total: number): void {
    factionCount.textContent = filtered === total ? `${total}` : `${filtered}/${total}`;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // New faction
  document.getElementById('new-faction-btn')?.addEventListener('click', showNewForm);

  // Form submission
  factionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      showToast('Name is required', 'warning');
      nameInput.focus();
      return;
    }

    const factionData = {
      name,
      factionType: typeSelect.value,
      description: descriptionInput.value.trim() || null,
    };

    const saved = await saveFaction(factionData);
    if (saved) {
      selectFaction(saved.id);
    }
  });

  // Delete
  document.getElementById('delete-faction-btn')?.addEventListener('click', async () => {
    if (!selectedFactionId) return;
    const faction = factions.find(f => f.id === selectedFactionId);
    const name = faction?.name || 'this faction';
    const linked = npcTemplates.filter(n => n.primaryFactionId === selectedFactionId);

    let message = `Delete faction "${name}"?`;
    if (linked.length > 0) {
      message += ` ${linked.length} NPC(s) will lose their faction assignment.`;
    }

    const confirmed = await showConfirm(message, { confirmText: 'Delete', dangerous: true });
    if (!confirmed) return;

    const success = await deleteFaction(selectedFactionId);
    if (success) clearForm();
  });

  // Duplicate
  document.getElementById('duplicate-faction-btn')?.addEventListener('click', () => {
    if (!selectedFactionId) return;

    const baseName = nameInput.value;
    let newName = baseName + ' (copy)';
    const existing = factions.map(f => f.name.toLowerCase());
    let counter = 2;
    while (existing.includes(newName.toLowerCase())) {
      newName = `${baseName} (${counter})`;
      counter++;
    }

    selectedFactionId = null;
    formTitle.textContent = 'New Faction';
    idDisplay.textContent = '';
    nameInput.value = newName;
    listPanel.setSelected(null);
    nameInput.focus();
    linkedNpcsEl.innerHTML = '<p class="no-linked-npcs">Save the faction first to see linked NPCs</p>';
  });

  // Export
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/factions', { credentials: 'include' });
      const data = await res.json();
      if (!data.success) {
        showToast('Export failed', 'error');
        return;
      }

      const blob = new Blob([JSON.stringify(data.factions, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'factions_export.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${data.factions.length} factions`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Failed to export factions', 'error');
    }
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchFactions(), fetchNpcTemplates()]);
})();
