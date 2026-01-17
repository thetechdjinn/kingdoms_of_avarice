import { Spell, SpellType, SpellTargetType, SpellScalingStat } from '@koa/shared';

(function() {

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

let spells: Spell[] = [];
let selectedSpellId: number | null = null;
let currentUser: AuthInfo | null = null;

// Helper to show error messages
function showError(message: string): void {
  const list = document.getElementById('spell-list');
  if (list) {
    list.innerHTML = `<div class="error-message" style="color: #ff6b6b; padding: 1rem;">${escapeHtml(message)}</div>`;
  } else {
    alert(message);
  }
}

// Helper to safely get DOM element by ID
function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ============================================================================
// Authentication
// ============================================================================

async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me');
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

    // Show Admin link if user is admin
    const isAdmin = roles.includes('admin');
    const adminLink = document.getElementById('nav-admin-link');
    if (adminLink) {
      adminLink.style.display = isAdmin ? 'block' : 'none';
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
// Data Fetching
// ============================================================================

async function fetchSpells(): Promise<void> {
  try {
    const response = await fetch('/api/spells');
    if (!response.ok) {
      console.error('Failed to fetch spells: HTTP', response.status);
      showError('Failed to load spells. Please refresh the page.');
      return;
    }
    const data = await response.json();
    if (data.success) {
      if (Array.isArray(data.spells)) {
        spells = data.spells;
        renderSpellList();
      } else {
        showError('Invalid spell data received from server.');
      }
    } else {
      showError('Failed to load spells: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to fetch spells:', error);
    showError('Failed to connect to server. Please check your connection.');
  }
}

// ============================================================================
// Rendering
// ============================================================================

function renderSpellList(): void {
  const list = getElement<HTMLElement>('spell-list');
  if (!list) return;
  const filterTypeEl = getElement<HTMLSelectElement>('type-select');
  const searchInputEl = getElement<HTMLInputElement>('search-input');
  const filterType = filterTypeEl?.value ?? '';
  const searchTerm = (searchInputEl?.value ?? '').toLowerCase();

  let filteredSpells = spells;

  if (filterType) {
    filteredSpells = filteredSpells.filter(s => s.spellType === filterType);
  }

  if (searchTerm) {
    filteredSpells = filteredSpells.filter(s =>
      s.name.toLowerCase().includes(searchTerm) ||
      s.mnemonic.toLowerCase().includes(searchTerm) ||
      s.description.toLowerCase().includes(searchTerm)
    );
  }

  list.innerHTML = filteredSpells
    .sort((a, b) => a.levelRequired - b.levelRequired || a.name.localeCompare(b.name))
    .map(spell => `
      <li data-id="${spell.id}" class="${spell.id === selectedSpellId ? 'selected' : ''}">
        <span class="spell-mnemonic">${escapeHtml(spell.mnemonic)}</span>
        <div class="spell-name">${escapeHtml(spell.name)}</div>
        <div class="spell-meta">
          <span class="spell-type spell-type-${spell.spellType}">${escapeHtml(spell.spellType)}</span>
          <span class="spell-level">Lv${spell.levelRequired}</span>
        </div>
      </li>
    `)
    .join('');

  list.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const id = parseInt(li.dataset.id!);
      selectSpell(id);
    });
  });
}

function selectSpell(id: number): void {
  const spell = spells.find(s => s.id === id);

  const noSpellSelected = getElement<HTMLElement>('no-spell-selected');
  const spellForm = getElement<HTMLElement>('spell-form');

  if (!spell) {
    selectedSpellId = null;
    if (noSpellSelected) noSpellSelected.style.display = 'flex';
    if (spellForm) spellForm.style.display = 'none';
    return;
  }

  selectedSpellId = id;

  if (noSpellSelected) noSpellSelected.style.display = 'none';
  if (spellForm) spellForm.style.display = 'block';

  const formTitle = getElement<HTMLElement>('spell-form-title');
  const idDisplay = getElement<HTMLElement>('spell-id-display');
  if (formTitle) formTitle.textContent = 'Edit Spell';
  if (idDisplay) idDisplay.textContent = `ID: ${spell.id}`;

  // Basic fields
  const nameInput = getElement<HTMLInputElement>('spell-name');
  const mnemonicInput = getElement<HTMLInputElement>('spell-mnemonic');
  const descriptionInput = getElement<HTMLTextAreaElement>('spell-description');
  const typeSelect = getElement<HTMLSelectElement>('spell-type');
  const targetTypeSelect = getElement<HTMLSelectElement>('spell-target-type');
  const manaCostInput = getElement<HTMLInputElement>('spell-mana-cost');
  const isAttackCheckbox = getElement<HTMLInputElement>('spell-is-attack');

  if (nameInput) nameInput.value = spell.name;
  if (mnemonicInput) mnemonicInput.value = spell.mnemonic;
  if (descriptionInput) descriptionInput.value = spell.description || '';
  if (typeSelect) typeSelect.value = spell.spellType;
  if (targetTypeSelect) targetTypeSelect.value = spell.targetType;
  if (manaCostInput) manaCostInput.value = String(spell.manaCost);
  if (isAttackCheckbox) isAttackCheckbox.checked = spell.isAttackSpell;

  // Effects
  const damageDiceInput = getElement<HTMLInputElement>('spell-damage-dice');
  const healingDiceInput = getElement<HTMLInputElement>('spell-healing-dice');
  const statusEffectInput = getElement<HTMLInputElement>('spell-status-effect');
  const effectDurationInput = getElement<HTMLInputElement>('spell-effect-duration');

  if (damageDiceInput) damageDiceInput.value = spell.damageDice || '';
  if (healingDiceInput) healingDiceInput.value = spell.healingDice || '';
  if (statusEffectInput) statusEffectInput.value = spell.statusEffect || '';
  if (effectDurationInput) effectDurationInput.value = String(spell.effectDuration || 0);

  // Scaling fields
  const damageScalingStatSelect = getElement<HTMLSelectElement>('spell-damage-scaling-stat');
  const damageScalingFactorInput = getElement<HTMLInputElement>('spell-damage-scaling-factor');
  const healingScalingStatSelect = getElement<HTMLSelectElement>('spell-healing-scaling-stat');
  const healingScalingFactorInput = getElement<HTMLInputElement>('spell-healing-scaling-factor');

  if (damageScalingStatSelect) damageScalingStatSelect.value = spell.damageScalingStat || '';
  if (damageScalingFactorInput) damageScalingFactorInput.value = spell.damageScalingFactor ? String(Math.round(spell.damageScalingFactor * 100)) : '0';
  if (healingScalingStatSelect) healingScalingStatSelect.value = spell.healingScalingStat || '';
  if (healingScalingFactorInput) healingScalingFactorInput.value = spell.healingScalingFactor ? String(Math.round(spell.healingScalingFactor * 100)) : '0';

  // Requirements
  const levelRequiredInput = getElement<HTMLInputElement>('spell-level-required');
  const classRestrictionsInput = getElement<HTMLInputElement>('spell-class-restrictions');

  if (levelRequiredInput) levelRequiredInput.value = String(spell.levelRequired);
  if (classRestrictionsInput) classRestrictionsInput.value = spell.classRestrictions.join(', ');

  // Update effect sections visibility
  updateEffectSections(spell.spellType);

  // Update class quick select buttons
  updateClassButtons(spell.classRestrictions);

  // Update preview
  updatePreview(spell);

  renderSpellList();
}

function updateEffectSections(spellType: string): void {
  const damageSection = getElement<HTMLElement>('damage-section');
  const healingSection = getElement<HTMLElement>('healing-section');
  const statusSection = getElement<HTMLElement>('status-section');

  // Show/hide sections based on spell type
  if (damageSection) {
    damageSection.style.display = spellType === 'offensive' ? 'block' : 'none';
  }
  if (healingSection) {
    healingSection.style.display = spellType === 'healing' ? 'block' : 'none';
  }
  if (statusSection) {
    statusSection.style.display = ['buff', 'debuff'].includes(spellType) ? 'block' : 'none';
  }
}

function updateClassButtons(classRestrictions: string[]): void {
  document.querySelectorAll('.class-btn').forEach(btn => {
    const className = (btn as HTMLElement).dataset.class;
    if (className && classRestrictions.includes(className)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updatePreview(spell: Spell): void {
  const content = document.getElementById('preview-content')!;

  const typeColors: Record<string, string> = {
    offensive: '#ff6b6b',
    healing: '#4ade80',
    buff: '#60a5fa',
    debuff: '#c084fc',
    utility: '#fbbf24',
  };

  let html = `
    <div class="preview-name">${escapeHtml(spell.name)}</div>
    <div class="preview-mnemonic">Mnemonic: <code>${escapeHtml(spell.mnemonic)}</code></div>
    <div class="preview-desc">${escapeHtml(spell.description || 'No description.')}</div>
    <div class="preview-stats">
      <span style="color: ${typeColors[spell.spellType] || '#fff'}">${escapeHtml(spell.spellType.toUpperCase())}</span>
      <span>Target: ${escapeHtml(spell.targetType)}</span>
    </div>
    <div class="preview-stats">
      <span style="color: #60a5fa">${spell.manaCost} Mana</span>
      <span>Level ${spell.levelRequired}+</span>
    </div>
  `;

  // Damage/Healing with scaling
  if (spell.spellType === 'offensive' && spell.damageDice) {
    let damageInfo = escapeHtml(spell.damageDice);
    if (spell.damageScalingStat && spell.damageScalingFactor) {
      const pct = Math.round(spell.damageScalingFactor * 100);
      damageInfo += ` <span style="color: #60a5fa">+${pct}% ${escapeHtml(spell.damageScalingStat.toUpperCase())}</span>`;
    }
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Damage</div>
        <div>${damageInfo}</div>
      </div>
    `;
  }

  if (spell.spellType === 'healing' && spell.healingDice) {
    let healingInfo = escapeHtml(spell.healingDice);
    if (spell.healingScalingStat && spell.healingScalingFactor) {
      const pct = Math.round(spell.healingScalingFactor * 100);
      healingInfo += ` <span style="color: #4ade80">+${pct}% ${escapeHtml(spell.healingScalingStat.toUpperCase())}</span>`;
    }
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Healing</div>
        <div>${healingInfo}</div>
      </div>
    `;
  }

  // Status effect
  if (spell.statusEffect) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Status Effect</div>
        <div>${escapeHtml(spell.statusEffect)}${spell.effectDuration ? ` (${spell.effectDuration}s)` : ''}</div>
      </div>
    `;
  }

  // Flags
  const flags = [];
  if (spell.isAttackSpell) flags.push('Attack Spell');
  if (flags.length > 0) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Flags</div>
        <div>${flags.join(', ')}</div>
      </div>
    `;
  }

  // Class restrictions
  if (spell.classRestrictions.length > 0) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Classes</div>
        <div>${spell.classRestrictions.join(', ')}</div>
      </div>
    `;
  } else {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Classes</div>
        <div>All Classes</div>
      </div>
    `;
  }

  content.innerHTML = html;
}

// ============================================================================
// CRUD Operations
// ============================================================================

async function createSpell(): Promise<void> {
  const name = prompt('Enter spell name:');
  if (!name) return;

  const mnemonic = prompt('Enter mnemonic (short command, 2-10 chars):');
  if (!mnemonic || mnemonic.length < 2 || mnemonic.length > 10) {
    alert('Mnemonic must be 2-10 characters');
    return;
  }

  try {
    const response = await fetch('/api/spells', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mnemonic: mnemonic.toLowerCase(),
        spellType: 'offensive',
        targetType: 'enemy',
        manaCost: 5,
        levelRequired: 1,
        isAttackSpell: false,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(`Failed to create spell: ${data.message || 'HTTP ' + response.status}`);
      return;
    }
    const data = await response.json();
    if (data.success) {
      spells.push(data.spell);
      selectSpell(data.spell.id);
    } else {
      alert('Failed to create spell: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to create spell:', error);
    alert('Failed to create spell');
  }
}

async function saveSpell(): Promise<void> {
  if (!selectedSpellId) return;

  const spellData = gatherFormData();

  try {
    const response = await fetch(`/api/spells/${selectedSpellId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spellData),
    });

    const data = await response.json();
    if (data.success) {
      const index = spells.findIndex(s => s.id === selectedSpellId);
      if (index !== -1) {
        spells[index] = data.spell;
      }
      selectSpell(selectedSpellId);
      alert('Spell saved successfully!');
    } else {
      alert('Failed to save spell: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to save spell:', error);
    alert('Failed to save spell');
  }
}

async function deleteSpell(): Promise<void> {
  if (!selectedSpellId) return;

  const spell = spells.find(s => s.id === selectedSpellId);
  if (!confirm(`Are you sure you want to delete "${spell?.name}"?`)) return;

  try {
    const response = await fetch(`/api/spells/${selectedSpellId}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    if (data.success) {
      spells = spells.filter(s => s.id !== selectedSpellId);
      selectedSpellId = null;
      document.getElementById('no-spell-selected')!.style.display = 'flex';
      document.getElementById('spell-form')!.style.display = 'none';
      document.getElementById('preview-content')!.innerHTML = '<p class="hint">Select a spell to see preview</p>';
      renderSpellList();
    } else {
      alert('Failed to delete spell: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to delete spell:', error);
    alert('Failed to delete spell');
  }
}

async function duplicateSpell(): Promise<void> {
  if (!selectedSpellId) return;

  const spell = spells.find(s => s.id === selectedSpellId);
  if (!spell) return;

  const newName = prompt('Enter name for duplicate:', spell.name + ' (copy)');
  if (!newName) return;

  const newMnemonic = prompt('Enter mnemonic for duplicate:', spell.mnemonic + '2');
  if (!newMnemonic || newMnemonic.length < 2 || newMnemonic.length > 10) {
    alert('Mnemonic must be 2-10 characters');
    return;
  }

  const duplicateData = { ...gatherFormData(), name: newName, mnemonic: newMnemonic.toLowerCase() };

  try {
    const response = await fetch('/api/spells', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateData),
    });

    const data = await response.json();
    if (data.success) {
      spells.push(data.spell);
      selectSpell(data.spell.id);
    } else {
      alert('Failed to duplicate spell: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to duplicate spell:', error);
    alert('Failed to duplicate spell');
  }
}

function gatherFormData(): Partial<Spell> {
  const classRestrictionsStr = (document.getElementById('spell-class-restrictions') as HTMLInputElement).value;
  const classRestrictions = classRestrictionsStr
    .split(',')
    .map(c => c.trim())
    .filter(c => c);

  // Parse scaling values - convert percentage to decimal (round to handle floating point)
  const damageScalingStat = getElement<HTMLSelectElement>('spell-damage-scaling-stat')?.value || null;
  const damageScalingFactorPct = Math.round(parseFloat(getElement<HTMLInputElement>('spell-damage-scaling-factor')?.value || '0')) || 0;
  const healingScalingStat = getElement<HTMLSelectElement>('spell-healing-scaling-stat')?.value || null;
  const healingScalingFactorPct = Math.round(parseFloat(getElement<HTMLInputElement>('spell-healing-scaling-factor')?.value || '0')) || 0;

  return {
    name: (document.getElementById('spell-name') as HTMLInputElement).value,
    mnemonic: (document.getElementById('spell-mnemonic') as HTMLInputElement).value.toLowerCase(),
    description: (document.getElementById('spell-description') as HTMLTextAreaElement).value || '',
    spellType: (document.getElementById('spell-type') as HTMLSelectElement).value as SpellType,
    targetType: (document.getElementById('spell-target-type') as HTMLSelectElement).value as SpellTargetType,
    manaCost: parseInt((document.getElementById('spell-mana-cost') as HTMLInputElement).value) || 0,
    isAttackSpell: (document.getElementById('spell-is-attack') as HTMLInputElement).checked,
    damageDice: (document.getElementById('spell-damage-dice') as HTMLInputElement).value || null,
    healingDice: (document.getElementById('spell-healing-dice') as HTMLInputElement).value || null,
    statusEffect: (document.getElementById('spell-status-effect') as HTMLInputElement).value || null,
    effectDuration: parseInt((document.getElementById('spell-effect-duration') as HTMLInputElement).value) || null,
    levelRequired: parseInt((document.getElementById('spell-level-required') as HTMLInputElement).value) || 1,
    classRestrictions,
    damageScalingStat: damageScalingStat as SpellScalingStat | null,
    damageScalingFactor: damageScalingFactorPct > 0 ? damageScalingFactorPct / 100 : null,
    healingScalingStat: healingScalingStat as SpellScalingStat | null,
    healingScalingFactor: healingScalingFactorPct > 0 ? healingScalingFactorPct / 100 : null,
  };
}

// ============================================================================
// Import/Export
// ============================================================================

async function exportSpells(): Promise<void> {
  try {
    const response = await fetch('/api/spells/export/all');
    if (!response.ok) throw new Error('Failed to fetch spells');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spells_export.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export spells:', error);
    alert('Failed to export spells');
  }
}

function showImportModal(): void {
  document.getElementById('import-modal')!.style.display = 'flex';
}

function hideImportModal(): void {
  document.getElementById('import-modal')!.style.display = 'none';
}

async function doImport(): Promise<void> {
  const fileInput = document.getElementById('import-file') as HTMLInputElement;
  const merge = (document.getElementById('import-merge') as HTMLInputElement).checked;

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a file');
    return;
  }

  try {
    const file = fileInput.files[0];
    const text = await file.text();
    const data = JSON.parse(text);

    const response = await fetch('/api/spells/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spells: data.spells, merge }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      alert(`Import complete!\nCreated: ${result.results.created}\nUpdated: ${result.results.updated}\nErrors: ${result.results.errors.length}`);
      hideImportModal();
      await fetchSpells();
    } else {
      alert('Import failed: ' + result.message);
    }
  } catch (error) {
    console.error('Failed to import:', error);
    const errorMessage = error instanceof SyntaxError
      ? 'Failed to import: Invalid JSON file format'
      : 'Failed to import: ' + (error instanceof Error ? error.message : 'Unknown error');
    alert(errorMessage);
  }
}

// ============================================================================
// Utility
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Tab Handling
// ============================================================================

function setupTabs(): void {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = (btn as HTMLElement).dataset.tab;
      if (!tabName) return;

      // Update button states
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content visibility
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      const tabContent = document.getElementById(`tab-${tabName}`);
      if (tabContent) tabContent.classList.add('active');
    });
  });
}

// ============================================================================
// Class Quick Select
// ============================================================================

function setupClassButtons(): void {
  document.querySelectorAll('.class-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const className = (btn as HTMLElement).dataset.class;
      if (!className) return;

      btn.classList.toggle('active');

      // Update the input field
      const activeClasses: string[] = [];
      document.querySelectorAll('.class-btn.active').forEach(activeBtn => {
        const cls = (activeBtn as HTMLElement).dataset.class;
        if (cls) activeClasses.push(cls);
      });

      const input = document.getElementById('spell-class-restrictions') as HTMLInputElement;
      if (input) {
        input.value = activeClasses.join(', ');
      }
    });
  });

  // Sync input to buttons when typing
  const input = document.getElementById('spell-class-restrictions') as HTMLInputElement;
  if (input) {
    input.addEventListener('input', () => {
      const classes = input.value.split(',').map(c => c.trim()).filter(c => c);
      updateClassButtons(classes);
    });
  }
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  await fetchSpells();
  setupTabs();
  setupClassButtons();

  // Helper to safely add event listeners
  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`Element #${id} not found for event listener`);
  };

  // Event listeners
  addListener('new-spell-btn', 'click', createSpell);
  addListener('spell-form', 'submit', (e) => {
    e.preventDefault();
    saveSpell();
  });
  addListener('delete-spell-btn', 'click', deleteSpell);
  addListener('duplicate-spell-btn', 'click', duplicateSpell);

  // Filters
  addListener('type-select', 'change', renderSpellList);
  addListener('search-input', 'input', renderSpellList);

  // Type change handler - update effect sections
  addListener('spell-type', 'change', (e) => {
    updateEffectSections((e.target as HTMLSelectElement).value);
  });

  // Import/Export
  addListener('import-btn', 'click', showImportModal);
  addListener('export-btn', 'click', exportSpells);
  addListener('close-import-modal', 'click', hideImportModal);
  addListener('do-import-btn', 'click', doImport);
  addListener('import-modal', 'click', (e) => {
    if (e.target === e.currentTarget) hideImportModal();
  });

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
    // Prevent clicks inside the dropdown from closing it
    userMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    document.addEventListener('click', () => {
      userMenu.classList.remove('open');
    });
  }
});

})();
