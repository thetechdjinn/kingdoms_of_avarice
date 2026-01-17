import { StatusEffectDefinition, StatusEffectCategory, StackingBehavior } from '@koa/shared';

(function() {

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

let effects: StatusEffectDefinition[] = [];
let selectedEffectId: string | null = null;
let currentUser: AuthInfo | null = null;

// Helper to show error messages
function showError(message: string): void {
  const list = document.getElementById('effect-list');
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

async function fetchEffects(): Promise<void> {
  try {
    const response = await fetch('/api/status-effects');
    if (!response.ok) {
      console.error('Failed to fetch effects: HTTP', response.status);
      showError('Failed to load status effects. Please refresh the page.');
      return;
    }
    const data = await response.json();
    if (data.success) {
      if (Array.isArray(data.definitions)) {
        effects = data.definitions;
        renderEffectList();
      } else {
        showError('Invalid status effect data received from server.');
      }
    } else {
      showError('Failed to load status effects: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to fetch effects:', error);
    showError('Failed to connect to server. Please check your connection.');
  }
}

// ============================================================================
// Rendering
// ============================================================================

function renderEffectList(): void {
  const list = getElement<HTMLElement>('effect-list');
  if (!list) return;
  const filterCategoryEl = getElement<HTMLSelectElement>('category-select');
  const searchInputEl = getElement<HTMLInputElement>('search-input');
  const filterCategory = filterCategoryEl?.value ?? '';
  const searchTerm = (searchInputEl?.value ?? '').toLowerCase();

  let filteredEffects = effects;

  if (filterCategory) {
    filteredEffects = filteredEffects.filter(e => e.category === filterCategory);
  }

  if (searchTerm) {
    filteredEffects = filteredEffects.filter(e =>
      e.name.toLowerCase().includes(searchTerm) ||
      e.id.toLowerCase().includes(searchTerm) ||
      e.description.toLowerCase().includes(searchTerm)
    );
  }

  list.innerHTML = filteredEffects
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map(effect => `
      <li data-id="${effect.id}" class="${effect.id === selectedEffectId ? 'selected' : ''}">
        <span class="effect-id">${escapeHtml(effect.id)}</span>
        <div class="effect-name">${escapeHtml(effect.name)}</div>
        <div class="effect-meta">
          <span class="effect-category effect-category-${effect.category}">${escapeHtml(effect.category)}</span>
        </div>
      </li>
    `)
    .join('');

  list.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const id = li.dataset.id!;
      selectEffect(id);
    });
  });
}

function selectEffect(id: string): void {
  const effect = effects.find(e => e.id === id);

  const noEffectSelected = getElement<HTMLElement>('no-effect-selected');
  const effectForm = getElement<HTMLElement>('effect-form');

  if (!effect) {
    selectedEffectId = null;
    if (noEffectSelected) noEffectSelected.style.display = 'flex';
    if (effectForm) effectForm.style.display = 'none';
    return;
  }

  selectedEffectId = id;

  if (noEffectSelected) noEffectSelected.style.display = 'none';
  if (effectForm) effectForm.style.display = 'block';

  const formTitle = getElement<HTMLElement>('effect-form-title');
  const idDisplay = getElement<HTMLElement>('effect-id-display');
  if (formTitle) formTitle.textContent = 'Edit Status Effect';
  if (idDisplay) idDisplay.textContent = `ID: ${effect.id}`;

  // Basic fields
  const idInput = getElement<HTMLInputElement>('effect-id');
  const nameInput = getElement<HTMLInputElement>('effect-name');
  const descriptionInput = getElement<HTMLTextAreaElement>('effect-description');
  const categorySelect = getElement<HTMLSelectElement>('effect-category');
  const stackingSelect = getElement<HTMLSelectElement>('effect-stacking');
  const maxStacksInput = getElement<HTMLInputElement>('effect-max-stacks');

  if (idInput) {
    idInput.value = effect.id;
    idInput.disabled = true; // Can't change ID after creation
  }
  if (nameInput) nameInput.value = effect.name;
  if (descriptionInput) descriptionInput.value = effect.description || '';
  if (categorySelect) categorySelect.value = effect.category;
  if (stackingSelect) stackingSelect.value = effect.stackingBehavior;
  if (maxStacksInput) maxStacksInput.value = String(effect.maxStacks);

  // Modifiers
  const accuracyInput = getElement<HTMLInputElement>('effect-accuracy');
  const defenseInput = getElement<HTMLInputElement>('effect-defense');
  const energyInput = getElement<HTMLInputElement>('effect-energy');
  const damageInput = getElement<HTMLInputElement>('effect-damage');

  if (accuracyInput) accuracyInput.value = String(effect.accuracyModifier ?? 0);
  if (defenseInput) defenseInput.value = String(effect.defenseModifier ?? 0);
  if (energyInput) energyInput.value = String(effect.energyModifier ?? 0);
  if (damageInput) damageInput.value = String(effect.damageModifier ?? 0);

  // Periodic effects
  const tickDamageInput = getElement<HTMLInputElement>('effect-tick-damage');
  const tickHealingInput = getElement<HTMLInputElement>('effect-tick-healing');
  const tickMessageInput = getElement<HTMLInputElement>('effect-tick-message');
  const silentTickCheckbox = getElement<HTMLInputElement>('effect-silent-tick');
  const wearOffInput = getElement<HTMLInputElement>('effect-wear-off');

  if (tickDamageInput) tickDamageInput.value = effect.tickDamage || '';
  if (tickHealingInput) tickHealingInput.value = effect.tickHealing || '';
  if (tickMessageInput) tickMessageInput.value = effect.tickMessage || '';
  if (silentTickCheckbox) silentTickCheckbox.checked = effect.silentTick || false;
  if (wearOffInput) wearOffInput.value = effect.wearOffMessage || '';

  // Flags
  const blocksRegenCheckbox = getElement<HTMLInputElement>('effect-blocks-regen');
  const blocksMovementCheckbox = getElement<HTMLInputElement>('effect-blocks-movement');
  const isBlindCheckbox = getElement<HTMLInputElement>('effect-is-blind');

  if (blocksRegenCheckbox) blocksRegenCheckbox.checked = effect.blocksRegen || false;
  if (blocksMovementCheckbox) blocksMovementCheckbox.checked = effect.blocksMovement || false;
  if (isBlindCheckbox) isBlindCheckbox.checked = effect.isBlind || false;

  // Update max stacks visibility
  updateMaxStacksVisibility(effect.stackingBehavior);

  // Update preview
  updatePreview(effect);

  renderEffectList();
}

function updateMaxStacksVisibility(stackingBehavior: string): void {
  const maxStacksGroup = getElement<HTMLElement>('max-stacks-group');
  if (maxStacksGroup) {
    maxStacksGroup.style.display = stackingBehavior === 'stack' ? 'block' : 'none';
  }
}

function updatePreview(effect: StatusEffectDefinition): void {
  const content = document.getElementById('preview-content')!;

  const categoryColors: Record<string, string> = {
    buff: '#4ade80',
    debuff: '#c084fc',
    dot: '#ff6b6b',
    hot: '#60a5fa',
    control: '#fbbf24',
  };

  let html = `
    <div class="preview-name">${escapeHtml(effect.name)}</div>
    <div class="preview-id">ID: <code>${escapeHtml(effect.id)}</code></div>
    <div class="preview-desc">${escapeHtml(effect.description || 'No description.')}</div>
    <div class="preview-stats">
      <span style="color: ${categoryColors[effect.category] || '#fff'}">${escapeHtml(effect.category.toUpperCase())}</span>
      <span>${escapeHtml(effect.stackingBehavior)}</span>
    </div>
  `;

  // Modifiers
  const modifiers = [];
  if (effect.accuracyModifier) modifiers.push(`Accuracy: ${effect.accuracyModifier > 0 ? '+' : ''}${effect.accuracyModifier}`);
  if (effect.defenseModifier) modifiers.push(`Defense: ${effect.defenseModifier > 0 ? '+' : ''}${effect.defenseModifier}`);
  if (effect.energyModifier) modifiers.push(`Energy: ${effect.energyModifier > 0 ? '+' : ''}${effect.energyModifier}%`);
  if (effect.damageModifier) modifiers.push(`Damage: ${effect.damageModifier > 0 ? '+' : ''}${effect.damageModifier}%`);

  if (modifiers.length > 0) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Combat Modifiers</div>
        <div>${modifiers.join('<br>')}</div>
      </div>
    `;
  }

  // Periodic effects
  if (effect.tickDamage || effect.tickHealing) {
    html += `<div class="preview-section"><div class="preview-section-title">Periodic Effects</div>`;
    if (effect.tickDamage) {
      html += `<div>Damage: ${escapeHtml(effect.tickDamage)}/tick</div>`;
    }
    if (effect.tickHealing) {
      html += `<div>Healing: ${escapeHtml(effect.tickHealing)}/tick</div>`;
    }
    if (effect.tickMessage) {
      html += `<div class="preview-message">"${escapeHtml(effect.tickMessage)}"</div>`;
    }
    html += `</div>`;
  }

  // Messages
  if (effect.wearOffMessage) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Wear Off Message</div>
        <div class="preview-message">"${escapeHtml(effect.wearOffMessage)}"</div>
      </div>
    `;
  }

  // Flags
  const flags = [];
  if (effect.blocksRegen) flags.push('Blocks Regen');
  if (effect.blocksMovement) flags.push('Blocks Movement');
  if (effect.isBlind) flags.push('Blind');
  if (effect.silentTick) flags.push('Silent Tick');

  if (flags.length > 0) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Flags</div>
        <div>${flags.join(', ')}</div>
      </div>
    `;
  }

  // Max stacks
  if (effect.stackingBehavior === 'stack') {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Max Stacks</div>
        <div>${effect.maxStacks}</div>
      </div>
    `;
  }

  content.innerHTML = html;
}

// ============================================================================
// CRUD Operations
// ============================================================================

async function createEffect(): Promise<void> {
  const id = prompt('Enter effect ID (lowercase, no spaces):');
  if (!id || !/^[a-z_]+$/.test(id)) {
    alert('ID must be lowercase letters and underscores only');
    return;
  }

  const name = prompt('Enter display name:');
  if (!name) return;

  try {
    const response = await fetch('/api/status-effects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id.toLowerCase(),
        name,
        description: '',
        category: 'buff',
        stackingBehavior: 'refresh',
        maxStacks: 1,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(`Failed to create effect: ${data.message || 'HTTP ' + response.status}`);
      return;
    }
    const data = await response.json();
    if (data.success) {
      effects.push(data.definition);
      selectEffect(data.definition.id);
    } else {
      alert('Failed to create effect: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to create effect:', error);
    alert('Failed to create effect');
  }
}

async function saveEffect(): Promise<void> {
  if (!selectedEffectId) return;

  const effectData = gatherFormData();

  try {
    const response = await fetch(`/api/status-effects/${selectedEffectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(effectData),
    });

    const data = await response.json();
    if (data.success) {
      const index = effects.findIndex(e => e.id === selectedEffectId);
      if (index !== -1) {
        effects[index] = data.definition;
      }
      selectEffect(selectedEffectId);
      alert('Effect saved successfully!');
    } else {
      alert('Failed to save effect: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to save effect:', error);
    alert('Failed to save effect');
  }
}

async function deleteEffect(): Promise<void> {
  if (!selectedEffectId) return;

  const effect = effects.find(e => e.id === selectedEffectId);
  if (!confirm(`Are you sure you want to delete "${effect?.name}"?`)) return;

  try {
    const response = await fetch(`/api/status-effects/${selectedEffectId}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    if (data.success) {
      effects = effects.filter(e => e.id !== selectedEffectId);
      selectedEffectId = null;
      document.getElementById('no-effect-selected')!.style.display = 'flex';
      document.getElementById('effect-form')!.style.display = 'none';
      document.getElementById('preview-content')!.innerHTML = '<p class="hint">Select an effect to see preview</p>';
      renderEffectList();
    } else {
      alert('Failed to delete effect: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to delete effect:', error);
    alert('Failed to delete effect');
  }
}

async function duplicateEffect(): Promise<void> {
  if (!selectedEffectId) return;

  const effect = effects.find(e => e.id === selectedEffectId);
  if (!effect) return;

  const newId = prompt('Enter ID for duplicate:', effect.id + '_copy');
  if (!newId || !/^[a-z_]+$/.test(newId)) {
    alert('ID must be lowercase letters and underscores only');
    return;
  }

  const newName = prompt('Enter name for duplicate:', effect.name + ' (copy)');
  if (!newName) return;

  const duplicateData = { ...gatherFormData(), id: newId.toLowerCase(), name: newName };

  try {
    const response = await fetch('/api/status-effects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateData),
    });

    const data = await response.json();
    if (data.success) {
      effects.push(data.definition);
      selectEffect(data.definition.id);
    } else {
      alert('Failed to duplicate effect: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to duplicate effect:', error);
    alert('Failed to duplicate effect');
  }
}

function gatherFormData(): Partial<StatusEffectDefinition> {
  return {
    name: (document.getElementById('effect-name') as HTMLInputElement).value,
    description: (document.getElementById('effect-description') as HTMLTextAreaElement).value || '',
    category: (document.getElementById('effect-category') as HTMLSelectElement).value as StatusEffectCategory,
    stackingBehavior: (document.getElementById('effect-stacking') as HTMLSelectElement).value as StackingBehavior,
    maxStacks: parseInt((document.getElementById('effect-max-stacks') as HTMLInputElement).value) || 1,
    accuracyModifier: parseInt((document.getElementById('effect-accuracy') as HTMLInputElement).value) || 0,
    defenseModifier: parseInt((document.getElementById('effect-defense') as HTMLInputElement).value) || 0,
    energyModifier: parseInt((document.getElementById('effect-energy') as HTMLInputElement).value) || 0,
    damageModifier: parseInt((document.getElementById('effect-damage') as HTMLInputElement).value) || 0,
    tickDamage: (document.getElementById('effect-tick-damage') as HTMLInputElement).value || undefined,
    tickHealing: (document.getElementById('effect-tick-healing') as HTMLInputElement).value || undefined,
    tickMessage: (document.getElementById('effect-tick-message') as HTMLInputElement).value || undefined,
    silentTick: (document.getElementById('effect-silent-tick') as HTMLInputElement).checked,
    wearOffMessage: (document.getElementById('effect-wear-off') as HTMLInputElement).value || undefined,
    blocksRegen: (document.getElementById('effect-blocks-regen') as HTMLInputElement).checked,
    blocksMovement: (document.getElementById('effect-blocks-movement') as HTMLInputElement).checked,
    isBlind: (document.getElementById('effect-is-blind') as HTMLInputElement).checked,
  };
}

// ============================================================================
// Import/Export
// ============================================================================

async function exportEffects(): Promise<void> {
  try {
    const response = await fetch('/api/status-effects/export/all');
    if (!response.ok) throw new Error('Failed to fetch effects');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'status_effects_export.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export effects:', error);
    alert('Failed to export effects');
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

    const response = await fetch('/api/status-effects/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definitions: data.definitions, merge }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      alert(`Import complete!\nCreated: ${result.results.created}\nUpdated: ${result.results.updated}\nErrors: ${result.results.errors.length}`);
      hideImportModal();
      await fetchEffects();
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
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  await fetchEffects();
  setupTabs();

  // Helper to safely add event listeners
  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`Element #${id} not found for event listener`);
  };

  // Event listeners
  addListener('new-effect-btn', 'click', createEffect);
  addListener('effect-form', 'submit', (e) => {
    e.preventDefault();
    saveEffect();
  });
  addListener('delete-effect-btn', 'click', deleteEffect);
  addListener('duplicate-effect-btn', 'click', duplicateEffect);

  // Filters
  addListener('category-select', 'change', renderEffectList);
  addListener('search-input', 'input', renderEffectList);

  // Stacking behavior change handler - update max stacks visibility
  addListener('effect-stacking', 'change', (e) => {
    updateMaxStacksVisibility((e.target as HTMLSelectElement).value);
  });

  // Import/Export
  addListener('import-btn', 'click', showImportModal);
  addListener('export-btn', 'click', exportEffects);
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
