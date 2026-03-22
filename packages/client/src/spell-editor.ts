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

// Toast notification system
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

// Helper to show error messages
function showError(message: string): void {
  const list = document.getElementById('spell-list');
  if (list) {
    list.innerHTML = `<div class="error-message" style="color: #ff6b6b; padding: 1rem;">${escapeHtml(message)}</div>`;
  } else {
    showToast(message, 'error');
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

    // Show Admin dropdown if user is admin
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

  // Telegraph
  const telegraphMessageInput = getElement<HTMLInputElement>('spell-telegraph-message');
  if (telegraphMessageInput) telegraphMessageInput.value = spell.telegraphMessage || '';

  // Damage/Healing
  const minDamageInput = getElement<HTMLInputElement>('spell-min-damage');
  const maxDamageInput = getElement<HTMLInputElement>('spell-max-damage');
  const minHealingInput = getElement<HTMLInputElement>('spell-min-healing');
  const maxHealingInput = getElement<HTMLInputElement>('spell-max-healing');
  const hitsPerCastInput = getElement<HTMLInputElement>('spell-hits-per-cast');
  if (minDamageInput) minDamageInput.value = String(spell.minDamage || 0);
  if (maxDamageInput) maxDamageInput.value = String(spell.maxDamage || 0);
  if (minHealingInput) minHealingInput.value = String(spell.minHealing || 0);
  if (maxHealingInput) maxHealingInput.value = String(spell.maxHealing || 0);
  if (hitsPerCastInput) hitsPerCastInput.value = String(spell.hitsPerCast || 1);

  // Effects
  const statusEffectInput = getElement<HTMLInputElement>('spell-status-effect');
  const effectDurationInput = getElement<HTMLInputElement>('spell-effect-duration');
  const saveStatSelect = getElement<HTMLSelectElement>('spell-save-stat');
  const saveDifficultyInput = getElement<HTMLInputElement>('spell-save-difficulty');
  if (statusEffectInput) statusEffectInput.value = spell.statusEffect || '';
  if (effectDurationInput) effectDurationInput.value = String(spell.effectDuration || 0);
  if (saveStatSelect) saveStatSelect.value = spell.saveStat || 'none';
  if (saveDifficultyInput) saveDifficultyInput.value = String(spell.saveDifficulty || 0);

  // Scaling
  const scalingPerLevelInput = getElement<HTMLInputElement>('spell-scaling-per-level');
  const castDifficultyInput = getElement<HTMLInputElement>('spell-cast-difficulty');
  const fizzleMessageInput = getElement<HTMLInputElement>('spell-fizzle-message');
  if (scalingPerLevelInput) scalingPerLevelInput.value = String((spell.scalingPerLevel ?? 0) * 100);
  if (castDifficultyInput) castDifficultyInput.value = String(spell.castDifficulty || 0);
  if (fizzleMessageInput) fizzleMessageInput.value = spell.fizzleMessage || '';

  // Custom messages
  const hitMsgSelfInput = getElement<HTMLInputElement>('spell-hit-msg-self');
  const hitMsgTargetInput = getElement<HTMLInputElement>('spell-hit-msg-target');
  const hitMsgRoomInput = getElement<HTMLInputElement>('spell-hit-msg-room');
  if (hitMsgSelfInput) hitMsgSelfInput.value = spell.hitMessageSelf || '';
  if (hitMsgTargetInput) hitMsgTargetInput.value = spell.hitMessageTarget || '';
  if (hitMsgRoomInput) hitMsgRoomInput.value = spell.hitMessageRoom || '';

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

  // Damage with scaling
  if (spell.spellType === 'offensive' && spell.minDamage && spell.maxDamage) {
    let damageInfo = `${spell.minDamage}-${spell.maxDamage}`;
    if (spell.hitsPerCast > 1) damageInfo += ` x${spell.hitsPerCast} hits`;
    if (spell.scalingPerLevel) {
      damageInfo += ` <span style="color: #fbbf24">+${Math.round(spell.scalingPerLevel * 100)}%/lvl</span>`;
    }
    if (spell.damageScalingStat && spell.damageScalingStat !== 'none' && spell.damageScalingFactor) {
      const pct = Math.round(spell.damageScalingFactor * 1000);
      damageInfo += ` <span style="color: #60a5fa">+${pct / 10}%/10 ${escapeHtml(spell.damageScalingStat.toUpperCase())}</span>`;
    }
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Damage</div>
        <div>${damageInfo}</div>
      </div>
    `;
  }

  // Healing with scaling
  if (spell.spellType === 'healing' && spell.minHealing && spell.maxHealing) {
    let healingInfo = `${spell.minHealing}-${spell.maxHealing}`;
    if (spell.scalingPerLevel) {
      healingInfo += ` <span style="color: #fbbf24">+${Math.round(spell.scalingPerLevel * 100)}%/lvl</span>`;
    }
    if (spell.healingScalingStat && spell.healingScalingStat !== 'none' && spell.healingScalingFactor) {
      const pct = Math.round(spell.healingScalingFactor * 1000);
      healingInfo += ` <span style="color: #4ade80">+${pct / 10}%/10 ${escapeHtml(spell.healingScalingStat.toUpperCase())}</span>`;
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

    if (spell.saveStat && spell.saveStat !== 'none') {
      html += `
        <div class="preview-section">
          <div class="preview-section-title">Saving Throw</div>
          <div>${escapeHtml(spell.saveStat.toUpperCase())} DC ${spell.saveDifficulty}</div>
        </div>
      `;
    }
  }

  // Telegraph
  if (spell.telegraphMessage) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Telegraph</div>
        <div style="font-style: italic; font-size: 0.9em; opacity: 0.8;">${escapeHtml(spell.telegraphMessage).replace('{name}', 'Caster')}</div>
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
    showToast('Mnemonic must be 2-10 characters', 'warning');
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
      showToast(`Failed to create spell: ${data.message || 'HTTP ' + response.status}`, 'error');
      return;
    }
    const data = await response.json();
    if (data.success) {
      spells.push(data.spell);
      selectSpell(data.spell.id);
    } else {
      showToast('Failed to create spell: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to create spell:', error);
    showToast('Failed to create spell', 'error');
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
      showToast('Spell saved successfully!', 'success');
    } else {
      showToast('Failed to save spell: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to save spell:', error);
    showToast('Failed to save spell', 'error');
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
      showToast('Failed to delete spell: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to delete spell:', error);
    showToast('Failed to delete spell', 'error');
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
    showToast('Mnemonic must be 2-10 characters', 'warning');
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
      showToast('Failed to duplicate spell: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to duplicate spell:', error);
    showToast('Failed to duplicate spell', 'error');
  }
}

function gatherFormData(): Partial<Spell> {
  const classRestrictionsStr = (document.getElementById('spell-class-restrictions') as HTMLInputElement).value;
  const classRestrictions = classRestrictionsStr
    .split(',')
    .map(c => c.trim())
    .filter(c => c);

  // Parse scaling values - convert percentage to decimal
  const damageScalingStat = getElement<HTMLSelectElement>('spell-damage-scaling-stat')?.value || null;
  const damageScalingFactorPct = parseFloat(getElement<HTMLInputElement>('spell-damage-scaling-factor')?.value || '0') || 0;
  const healingScalingStat = getElement<HTMLSelectElement>('spell-healing-scaling-stat')?.value || null;
  const healingScalingFactorPct = parseFloat(getElement<HTMLInputElement>('spell-healing-scaling-factor')?.value || '0') || 0;
  const scalingPerLevelPct = parseFloat(getElement<HTMLInputElement>('spell-scaling-per-level')?.value || '0') || 0;

  return {
    name: (document.getElementById('spell-name') as HTMLInputElement).value,
    mnemonic: (document.getElementById('spell-mnemonic') as HTMLInputElement).value.toLowerCase(),
    description: (document.getElementById('spell-description') as HTMLTextAreaElement).value || '',
    spellType: (document.getElementById('spell-type') as HTMLSelectElement).value as SpellType,
    targetType: (document.getElementById('spell-target-type') as HTMLSelectElement).value as SpellTargetType,
    manaCost: parseInt((document.getElementById('spell-mana-cost') as HTMLInputElement).value) || 0,
    isAttackSpell: (document.getElementById('spell-is-attack') as HTMLInputElement).checked,
    minDamage: (document.getElementById('spell-min-damage') as HTMLInputElement).value ? parseInt((document.getElementById('spell-min-damage') as HTMLInputElement).value) : null,
    maxDamage: (document.getElementById('spell-max-damage') as HTMLInputElement).value ? parseInt((document.getElementById('spell-max-damage') as HTMLInputElement).value) : null,
    minHealing: (document.getElementById('spell-min-healing') as HTMLInputElement).value ? parseInt((document.getElementById('spell-min-healing') as HTMLInputElement).value) : null,
    maxHealing: (document.getElementById('spell-max-healing') as HTMLInputElement).value ? parseInt((document.getElementById('spell-max-healing') as HTMLInputElement).value) : null,
    hitsPerCast: parseInt((document.getElementById('spell-hits-per-cast') as HTMLInputElement).value) || 1,
    statusEffect: (document.getElementById('spell-status-effect') as HTMLInputElement).value || null,
    effectDuration: parseInt((document.getElementById('spell-effect-duration') as HTMLInputElement).value) || null,
    scalingPerLevel: scalingPerLevelPct > 0 ? scalingPerLevelPct / 100 : null,
    damageScalingStat: damageScalingStat as SpellScalingStat | null,
    damageScalingFactor: damageScalingFactorPct > 0 ? damageScalingFactorPct / 1000 : null,
    healingScalingStat: healingScalingStat as SpellScalingStat | null,
    healingScalingFactor: healingScalingFactorPct > 0 ? healingScalingFactorPct / 1000 : null,
    castDifficulty: parseInt((document.getElementById('spell-cast-difficulty') as HTMLInputElement).value) || 0,
    fizzleMessage: (document.getElementById('spell-fizzle-message') as HTMLInputElement)?.value || null,
    hitMessageSelf: (document.getElementById('spell-hit-msg-self') as HTMLInputElement)?.value || null,
    hitMessageTarget: (document.getElementById('spell-hit-msg-target') as HTMLInputElement)?.value || null,
    hitMessageRoom: (document.getElementById('spell-hit-msg-room') as HTMLInputElement)?.value || null,
    telegraphMessage: (document.getElementById('spell-telegraph-message') as HTMLInputElement).value || null,
    saveStat: (document.getElementById('spell-save-stat') as HTMLSelectElement).value as SpellScalingStat | null,
    saveDifficulty: parseInt((document.getElementById('spell-save-difficulty') as HTMLInputElement).value) || 0,
    levelRequired: parseInt((document.getElementById('spell-level-required') as HTMLInputElement).value) || 1,
    classRestrictions,
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
    showToast('Failed to export spells', 'error');
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
    showToast('Please select a file', 'warning');
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
      showToast(`Import complete! Created: ${result.results.created}, Updated: ${result.results.updated}, Errors: ${result.results.errors.length}`, 'success', 4000);
      hideImportModal();
      await fetchSpells();
    } else {
      showToast('Import failed: ' + result.message, 'error');
    }
  } catch (error) {
    console.error('Failed to import:', error);
    const errorMessage = error instanceof SyntaxError
      ? 'Failed to import: Invalid JSON file format'
      : 'Failed to import: ' + (error instanceof Error ? error.message : 'Unknown error');
    showToast(errorMessage, 'error');
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

  // Scaling calculator
  addListener('calc-btn', 'click', () => {
    const level = parseInt((document.getElementById('calc-level') as HTMLInputElement).value) || 1;
    const stat = parseInt((document.getElementById('calc-stat') as HTMLInputElement).value) || 50;
    const resultDiv = document.getElementById('calc-result');
    if (!resultDiv || !selectedSpellId) { if (resultDiv) resultDiv.textContent = 'Select a spell first.'; return; }

    const spell = spells.find(s => s.id === selectedSpellId);
    if (!spell) { resultDiv.textContent = 'Spell not found.'; return; }

    const scalingPerLevel = spell.scalingPerLevel ?? 0;
    const levelMult = 1 + level * scalingPerLevel;
    const statTiers = Math.floor(stat / 10);

    let lines: string[] = [];
    if (spell.minDamage && spell.maxDamage) {
      const statFactor = spell.damageScalingFactor ?? 0;
      const statMult = 1 + statTiers * statFactor;
      const min = Math.max(1, Math.floor(spell.minDamage * levelMult * statMult));
      const max = Math.max(1, Math.floor(spell.maxDamage * levelMult * statMult));
      const hits = spell.hitsPerCast || 1;
      lines.push(`Damage: ${min}-${max}${hits > 1 ? ` x${hits} = ${min * hits}-${max * hits}` : ''}`);
    }
    if (spell.minHealing && spell.maxHealing) {
      const statFactor = spell.healingScalingFactor ?? 0;
      const statMult = 1 + statTiers * statFactor;
      const min = Math.max(1, Math.floor(spell.minHealing * levelMult * statMult));
      const max = Math.max(1, Math.floor(spell.maxHealing * levelMult * statMult));
      lines.push(`Healing: ${min}-${max}`);
    }
    if (lines.length === 0) lines.push('No damage/healing on this spell.');
    resultDiv.innerHTML = lines.join('<br>');
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
