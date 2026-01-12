interface ItemTemplate {
  id: number;
  name: string;
  short_desc: string;
  long_desc?: string;
  room_desc?: string;
  keywords: string[];
  weight: number;
  size: number;
  base_value: number;
  item_type: string;
  equipment_slot?: string;
  flags: Record<string, boolean>;
  max_stack: number;
  container_capacity?: number;
  container_weight_limit?: number;
  weapon_data?: {
    damage_dice: string;
    damage_type: string;
    attack_speed?: number;
    crit_modifier?: number;
    range?: string;
  };
  armor_data?: {
    armor_class: number;
    weight_class?: string;
  };
  consumable_data?: {
    charges?: number;
    effect_type: string;
    effect_value: number;
    duration?: number;
  };
  light_data?: {
    radius: number;
    fuel_max?: number;
    fuel_rate?: number;
  };
  requirements?: {
    level?: number;
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    constitution?: number;
    class?: string[];
    race?: string[];
  };
  stat_modifiers?: {
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    max_health?: number;
    max_mana?: number;
  };
  effect_slots: number;
}

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

let templates: ItemTemplate[] = [];
let selectedTemplateId: number | null = null;
let currentUser: AuthInfo | null = null;

// Helper to show error messages to the user
function showError(message: string): void {
  const list = document.getElementById('item-list');
  if (list) {
    list.innerHTML = `<div class="error-message" style="color: #ff6b6b; padding: 1rem;">${escapeHtml(message)}</div>`;
  } else {
    alert(message);
  }
}

// Helper to parse numbers with proper zero handling
function parseNumberOrDefault(value: string, defaultValue: number): number {
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Helper to safely get DOM element by ID
function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// Helper to safely get required DOM element (logs error if missing)
function requireElement<T extends HTMLElement>(id: string): T | null {
  const el = document.getElementById(id) as T | null;
  if (!el) {
    console.error(`Required element #${id} not found`);
  }
  return el;
}

// ============================================================================
// Authentication
// ============================================================================

async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      showLoginRequired();
      return false;
    }
    const data: AuthInfo = await response.json();
    currentUser = data;
    
    if (!data.authenticated) {
      showLoginRequired();
      return false;
    }

    const roles = data.roles || [];
    const hasDeveloperAccess = roles.includes('developer') || roles.includes('admin');
    
    if (!hasDeveloperAccess) {
      showAccessDenied();
      return false;
    }

    const usernameEl = document.getElementById('nav-username');
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username;
    }

    return true;
  } catch (error) {
    console.error('Failed to check auth:', error);
    showLoginRequired();
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

function showLoginRequired(): void {
  const app = document.getElementById('editor-app')!;
  app.innerHTML = `
    <div class="auth-message">
      <h1>Authentication Required</h1>
      <p>You must be logged in to access the Item Editor.</p>
      <a href="/" class="btn-primary">Go to Login</a>
    </div>
  `;
}

function showAccessDenied(): void {
  const app = document.getElementById('editor-app')!;
  app.innerHTML = `
    <div class="auth-message">
      <h1>Access Denied</h1>
      <p>You do not have permission to access the Item Editor.</p>
      <p>Developer or Admin role is required.</p>
      <a href="/" class="btn-primary">Back to Game</a>
    </div>
  `;
}

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchTemplates(): Promise<void> {
  try {
    const response = await fetch('/api/items/templates');
    if (!response.ok) {
      console.error('Failed to fetch templates: HTTP', response.status);
      showError('Failed to load item templates. Please refresh the page.');
      return;
    }
    const data = await response.json();
    if (data.success) {
      if (Array.isArray(data.templates)) {
        templates = data.templates;
        renderTemplateList();
      } else {
        showError('Invalid template data received from server.');
      }
    } else {
      showError('Failed to load item templates: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    showError('Failed to connect to server. Please check your connection.');
  }
}

// ============================================================================
// Rendering
// ============================================================================

function renderTemplateList(): void {
  const list = getElement<HTMLElement>('item-list');
  if (!list) return;
  const filterTypeEl = getElement<HTMLSelectElement>('type-select');
  const searchInputEl = getElement<HTMLInputElement>('search-input');
  const filterType = filterTypeEl?.value ?? '';
  const searchTerm = (searchInputEl?.value ?? '').toLowerCase();

  let filteredTemplates = templates;
  
  if (filterType) {
    filteredTemplates = filteredTemplates.filter(t => t.item_type === filterType);
  }
  
  if (searchTerm) {
    filteredTemplates = filteredTemplates.filter(t => 
      t.name.toLowerCase().includes(searchTerm) ||
      t.short_desc.toLowerCase().includes(searchTerm) ||
      t.keywords.some(k => k.toLowerCase().includes(searchTerm))
    );
  }

  list.innerHTML = filteredTemplates
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(template => `
      <li data-id="${template.id}" class="${template.id === selectedTemplateId ? 'selected' : ''}">
        <span class="item-id">#${template.id}</span>
        <div class="item-name">${escapeHtml(template.name)}</div>
        <div class="item-type">${escapeHtml(template.item_type)}</div>
      </li>
    `)
    .join('');

  list.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const id = parseInt(li.dataset.id!);
      selectTemplate(id);
    });
  });
}

function selectTemplate(id: number): void {
  selectedTemplateId = id;
  const template = templates.find(t => t.id === id);

  const noItemSelected = getElement<HTMLElement>('no-item-selected');
  const itemForm = getElement<HTMLElement>('item-form');

  if (!template) {
    if (noItemSelected) noItemSelected.style.display = 'flex';
    if (itemForm) itemForm.style.display = 'none';
    return;
  }

  if (noItemSelected) noItemSelected.style.display = 'none';
  if (itemForm) itemForm.style.display = 'block';

  const formTitle = getElement<HTMLElement>('item-form-title');
  const idDisplay = getElement<HTMLElement>('item-id-display');
  if (formTitle) formTitle.textContent = 'Edit Item';
  if (idDisplay) idDisplay.textContent = `ID: ${template.id}`;

  // Basic fields
  const nameInput = getElement<HTMLInputElement>('item-name');
  const typeSelect = getElement<HTMLSelectElement>('item-type');
  const shortDescInput = getElement<HTMLInputElement>('item-short-desc');
  const longDescInput = getElement<HTMLTextAreaElement>('item-long-desc');
  const roomDescInput = getElement<HTMLInputElement>('item-room-desc');
  const keywordsInput = getElement<HTMLInputElement>('item-keywords');
  const weightInput = getElement<HTMLInputElement>('item-weight');
  const sizeInput = getElement<HTMLInputElement>('item-size');
  const valueInput = getElement<HTMLInputElement>('item-value');
  const equipSlotSelect = getElement<HTMLSelectElement>('item-equipment-slot');
  const maxStackInput = getElement<HTMLInputElement>('item-max-stack');
  const effectSlotsInput = getElement<HTMLInputElement>('item-effect-slots');

  if (nameInput) nameInput.value = template.name;
  if (typeSelect) typeSelect.value = template.item_type;
  if (shortDescInput) shortDescInput.value = template.short_desc;
  if (longDescInput) longDescInput.value = template.long_desc || '';
  if (roomDescInput) roomDescInput.value = template.room_desc || '';
  if (keywordsInput) keywordsInput.value = template.keywords.join(', ');
  if (weightInput) weightInput.value = String(template.weight);
  if (sizeInput) sizeInput.value = String(template.size);
  if (valueInput) valueInput.value = String(template.base_value);
  if (equipSlotSelect) equipSlotSelect.value = template.equipment_slot || '';
  if (maxStackInput) maxStackInput.value = String(template.max_stack);
  if (effectSlotsInput) effectSlotsInput.value = String(template.effect_slots);

  // Flags
  const flagTakeable = getElement<HTMLInputElement>('flag-takeable');
  const flagHidden = getElement<HTMLInputElement>('flag-hidden');
  const flagNoDrop = getElement<HTMLInputElement>('flag-no-drop');
  if (flagTakeable) flagTakeable.checked = template.flags?.takeable !== false;
  if (flagHidden) flagHidden.checked = template.flags?.hidden === true;
  if (flagNoDrop) flagNoDrop.checked = template.flags?.no_drop === true;
  const flagStackable = getElement<HTMLInputElement>('flag-stackable');
  const flagCursed = getElement<HTMLInputElement>('flag-cursed');
  const flagTwoHanded = getElement<HTMLInputElement>('flag-two-handed');
  const flagThrowable = getElement<HTMLInputElement>('flag-throwable');
  if (flagStackable) flagStackable.checked = template.flags?.stackable === true;
  if (flagCursed) flagCursed.checked = template.flags?.cursed === true;
  if (flagTwoHanded) flagTwoHanded.checked = template.flags?.two_handed === true;
  if (flagThrowable) flagThrowable.checked = template.flags?.throwable === true;

  // Type-specific data
  loadWeaponData(template);
  loadArmorData(template);
  loadContainerData(template);
  loadConsumableData(template);
  loadLightData(template);

  // Requirements
  loadRequirements(template);

  // Modifiers
  loadModifiers(template);

  // Update type-specific sections visibility
  updateTypeSections(template.item_type);

  // Update preview
  updatePreview(template);

  // Enable spawn button
  (document.getElementById('spawn-btn') as HTMLButtonElement).disabled = false;

  renderTemplateList();
}

function loadWeaponData(template: ItemTemplate): void {
  const data = template.weapon_data;
  (document.getElementById('weapon-damage-dice') as HTMLInputElement).value = data?.damage_dice || '1d6';
  (document.getElementById('weapon-damage-type') as HTMLSelectElement).value = data?.damage_type || 'slashing';
  (document.getElementById('weapon-attack-speed') as HTMLInputElement).value = String(data?.attack_speed || 10);
  (document.getElementById('weapon-crit-modifier') as HTMLInputElement).value = String(data?.crit_modifier || 2);
  (document.getElementById('weapon-range') as HTMLSelectElement).value = data?.range || 'melee';
}

function loadArmorData(template: ItemTemplate): void {
  const data = template.armor_data;
  (document.getElementById('armor-class') as HTMLInputElement).value = String(data?.armor_class || 0);
  (document.getElementById('armor-weight-class') as HTMLSelectElement).value = data?.weight_class || 'light';
}

function loadContainerData(template: ItemTemplate): void {
  (document.getElementById('container-capacity') as HTMLInputElement).value = String(template.container_capacity || 10);
  (document.getElementById('container-weight-limit') as HTMLInputElement).value = String(template.container_weight_limit || 100);
}

function loadConsumableData(template: ItemTemplate): void {
  const data = template.consumable_data;
  (document.getElementById('consumable-effect-type') as HTMLSelectElement).value = data?.effect_type || 'heal';
  (document.getElementById('consumable-effect-value') as HTMLInputElement).value = String(data?.effect_value || 10);
  (document.getElementById('consumable-charges') as HTMLInputElement).value = String(data?.charges || 0);
  (document.getElementById('consumable-duration') as HTMLInputElement).value = String(data?.duration || 0);
}

function loadLightData(template: ItemTemplate): void {
  const data = template.light_data;
  (document.getElementById('light-radius') as HTMLInputElement).value = String(data?.radius || 2);
  (document.getElementById('light-fuel-max') as HTMLInputElement).value = String(data?.fuel_max || 60);
  (document.getElementById('light-fuel-rate') as HTMLInputElement).value = String(data?.fuel_rate || 1);
}

function loadRequirements(template: ItemTemplate): void {
  const req = template.requirements || {};
  (document.getElementById('req-level') as HTMLInputElement).value = String(req.level || 0);
  (document.getElementById('req-strength') as HTMLInputElement).value = String(req.strength || 0);
  (document.getElementById('req-dexterity') as HTMLInputElement).value = String(req.dexterity || 0);
  (document.getElementById('req-intelligence') as HTMLInputElement).value = String(req.intelligence || 0);
  (document.getElementById('req-constitution') as HTMLInputElement).value = String(req.constitution || 0);
  (document.getElementById('req-class') as HTMLInputElement).value = (req.class || []).join(', ');
  (document.getElementById('req-race') as HTMLInputElement).value = (req.race || []).join(', ');
}

function loadModifiers(template: ItemTemplate): void {
  const mod = template.stat_modifiers || {};
  (document.getElementById('mod-strength') as HTMLInputElement).value = String(mod.strength || 0);
  (document.getElementById('mod-dexterity') as HTMLInputElement).value = String(mod.dexterity || 0);
  (document.getElementById('mod-constitution') as HTMLInputElement).value = String(mod.constitution || 0);
  (document.getElementById('mod-intelligence') as HTMLInputElement).value = String(mod.intelligence || 0);
  (document.getElementById('mod-max-health') as HTMLInputElement).value = String(mod.max_health || 0);
  (document.getElementById('mod-max-mana') as HTMLInputElement).value = String(mod.max_mana || 0);
}

function updateTypeSections(itemType: string): void {
  // Hide all type sections
  document.querySelectorAll('.type-section').forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });

  // Show relevant section
  switch (itemType) {
    case 'weapon':
      document.getElementById('weapon-data-section')!.style.display = 'block';
      break;
    case 'armor':
      document.getElementById('armor-data-section')!.style.display = 'block';
      break;
    case 'container':
      document.getElementById('container-data-section')!.style.display = 'block';
      break;
    case 'consumable':
      document.getElementById('consumable-data-section')!.style.display = 'block';
      break;
    case 'light':
      document.getElementById('light-data-section')!.style.display = 'block';
      break;
    default:
      document.getElementById('no-type-data')!.style.display = 'block';
  }
}

function updatePreview(template: ItemTemplate): void {
  const content = document.getElementById('preview-content')!;
  
  let html = `
    <div class="preview-name">${escapeHtml(template.short_desc)}</div>
    <div class="preview-desc">${escapeHtml(template.long_desc || 'No description.')}</div>
    <div class="preview-stats">
      <span>Weight: ${template.weight}</span>
      <span>Value: ${template.base_value}g</span>
    </div>
  `;

  // Type-specific preview
  if (template.item_type === 'weapon' && template.weapon_data) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Weapon</div>
        <div>Damage: ${escapeHtml(template.weapon_data.damage_dice)} ${escapeHtml(template.weapon_data.damage_type)}</div>
        <div>Speed: ${template.weapon_data.attack_speed || 10}</div>
      </div>
    `;
  }

  if (template.item_type === 'armor' && template.armor_data) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Armor</div>
        <div>AC: ${template.armor_data.armor_class}</div>
        <div>Class: ${escapeHtml(template.armor_data.weight_class || 'light')}</div>
      </div>
    `;
  }

  if (template.item_type === 'consumable' && template.consumable_data) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Effect</div>
        <div>${escapeHtml(template.consumable_data.effect_type)}: ${template.consumable_data.effect_value}</div>
      </div>
    `;
  }

  if (template.item_type === 'light' && template.light_data) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Light</div>
        <div>Radius: ${template.light_data.radius}</div>
        ${template.light_data.fuel_max ? `<div>Fuel: ${template.light_data.fuel_max}</div>` : ''}
      </div>
    `;
  }

  // Modifiers
  const mods = template.stat_modifiers;
  if (mods) {
    const modList = [];
    if (mods.strength) modList.push(`STR ${mods.strength > 0 ? '+' : ''}${mods.strength}`);
    if (mods.dexterity) modList.push(`DEX ${mods.dexterity > 0 ? '+' : ''}${mods.dexterity}`);
    if (mods.constitution) modList.push(`CON ${mods.constitution > 0 ? '+' : ''}${mods.constitution}`);
    if (mods.intelligence) modList.push(`INT ${mods.intelligence > 0 ? '+' : ''}${mods.intelligence}`);
    if (mods.max_health) modList.push(`HP ${mods.max_health > 0 ? '+' : ''}${mods.max_health}`);
    if (mods.max_mana) modList.push(`MP ${mods.max_mana > 0 ? '+' : ''}${mods.max_mana}`);
    
    if (modList.length > 0) {
      html += `
        <div class="preview-section">
          <div class="preview-section-title">Modifiers</div>
          <div>${modList.join(', ')}</div>
        </div>
      `;
    }
  }

  // Flags
  const flags = [];
  if (template.flags?.two_handed) flags.push('Two-Handed');
  if (template.flags?.cursed) flags.push('Cursed');
  if (template.flags?.hidden) flags.push('Hidden');
  if (template.flags?.no_drop) flags.push('Quest Item');
  
  if (flags.length > 0) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Flags</div>
        <div>${flags.join(', ')}</div>
      </div>
    `;
  }

  content.innerHTML = html;
}

// ============================================================================
// CRUD Operations
// ============================================================================

async function createTemplate(): Promise<void> {
  const name = prompt('Enter item name:');
  if (!name) return;

  try {
    const response = await fetch('/api/items/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        short_desc: `a ${name.toLowerCase()}`,
        item_type: 'misc',
        keywords: [name.toLowerCase()],
      }),
    });

    if (!response.ok) {
      alert(`Failed to create template: HTTP ${response.status}`);
      return;
    }
    const data = await response.json();
    if (data.success) {
      templates.push(data.template);
      selectTemplate(data.template.id);
    } else {
      alert('Failed to create item: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to create item:', error);
    alert('Failed to create item');
  }
}

async function saveTemplate(): Promise<void> {
  if (!selectedTemplateId) return;

  const templateData = gatherFormData();

  try {
    const response = await fetch(`/api/items/templates/${selectedTemplateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData),
    });

    const data = await response.json();
    if (data.success) {
      const index = templates.findIndex(t => t.id === selectedTemplateId);
      if (index !== -1) {
        templates[index] = data.template;
      }
      selectTemplate(selectedTemplateId);
      alert('Item saved successfully!');
    } else {
      alert('Failed to save item: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to save item:', error);
    alert('Failed to save item');
  }
}

async function deleteTemplate(): Promise<void> {
  if (!selectedTemplateId) return;

  const template = templates.find(t => t.id === selectedTemplateId);
  if (!confirm(`Are you sure you want to delete "${template?.name}"?`)) return;

  try {
    const response = await fetch(`/api/items/templates/${selectedTemplateId}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    if (data.success) {
      templates = templates.filter(t => t.id !== selectedTemplateId);
      selectedTemplateId = null;
      document.getElementById('no-item-selected')!.style.display = 'flex';
      document.getElementById('item-form')!.style.display = 'none';
      renderTemplateList();
    } else {
      alert('Failed to delete item: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to delete item:', error);
    alert('Failed to delete item');
  }
}

async function duplicateTemplate(): Promise<void> {
  if (!selectedTemplateId) return;

  const template = templates.find(t => t.id === selectedTemplateId);
  if (!template) return;

  const newName = prompt('Enter name for duplicate:', template.name + ' (copy)');
  if (!newName) return;

  const duplicateData = { ...gatherFormData(), name: newName };

  try {
    const response = await fetch('/api/items/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateData),
    });

    const data = await response.json();
    if (data.success) {
      templates.push(data.template);
      selectTemplate(data.template.id);
    } else {
      alert('Failed to duplicate item: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to duplicate item:', error);
    alert('Failed to duplicate item');
  }
}

function gatherFormData(): Partial<ItemTemplate> {
  const itemType = (document.getElementById('item-type') as HTMLSelectElement).value;
  const keywordsStr = (document.getElementById('item-keywords') as HTMLInputElement).value;
  const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k);

  const data: Partial<ItemTemplate> = {
    name: (document.getElementById('item-name') as HTMLInputElement).value,
    short_desc: (document.getElementById('item-short-desc') as HTMLInputElement).value,
    long_desc: (document.getElementById('item-long-desc') as HTMLTextAreaElement).value || undefined,
    room_desc: (document.getElementById('item-room-desc') as HTMLInputElement).value || undefined,
    keywords,
    weight: parseInt((document.getElementById('item-weight') as HTMLInputElement).value) || 0,
    size: parseInt((document.getElementById('item-size') as HTMLInputElement).value) || 1,
    base_value: parseInt((document.getElementById('item-value') as HTMLInputElement).value) || 0,
    item_type: itemType,
    equipment_slot: (document.getElementById('item-equipment-slot') as HTMLSelectElement).value || undefined,
    max_stack: parseInt((document.getElementById('item-max-stack') as HTMLInputElement).value) || 1,
    effect_slots: parseInt((document.getElementById('item-effect-slots') as HTMLInputElement).value) || 0,
    flags: {
      takeable: (document.getElementById('flag-takeable') as HTMLInputElement).checked,
      hidden: (document.getElementById('flag-hidden') as HTMLInputElement).checked,
      no_drop: (document.getElementById('flag-no-drop') as HTMLInputElement).checked,
      stackable: (document.getElementById('flag-stackable') as HTMLInputElement).checked,
      cursed: (document.getElementById('flag-cursed') as HTMLInputElement).checked,
      two_handed: (document.getElementById('flag-two-handed') as HTMLInputElement).checked,
      throwable: (document.getElementById('flag-throwable') as HTMLInputElement).checked,
    },
  };

  // Type-specific data
  if (itemType === 'weapon') {
    data.weapon_data = {
      damage_dice: (document.getElementById('weapon-damage-dice') as HTMLInputElement).value,
      damage_type: (document.getElementById('weapon-damage-type') as HTMLSelectElement).value,
      attack_speed: parseNumberOrDefault((document.getElementById('weapon-attack-speed') as HTMLInputElement).value, 10),
      crit_modifier: parseNumberOrDefault((document.getElementById('weapon-crit-modifier') as HTMLInputElement).value, 2),
      range: (document.getElementById('weapon-range') as HTMLSelectElement).value,
    };
  }

  if (itemType === 'armor') {
    data.armor_data = {
      armor_class: parseInt((document.getElementById('armor-class') as HTMLInputElement).value) || 0,
      weight_class: (document.getElementById('armor-weight-class') as HTMLSelectElement).value,
    };
  }

  if (itemType === 'container') {
    data.container_capacity = parseInt((document.getElementById('container-capacity') as HTMLInputElement).value) || 10;
    data.container_weight_limit = parseInt((document.getElementById('container-weight-limit') as HTMLInputElement).value) || 100;
  }

  if (itemType === 'consumable') {
    data.consumable_data = {
      effect_type: (document.getElementById('consumable-effect-type') as HTMLSelectElement).value,
      effect_value: parseInt((document.getElementById('consumable-effect-value') as HTMLInputElement).value) || 10,
      charges: parseInt((document.getElementById('consumable-charges') as HTMLInputElement).value) || undefined,
      duration: parseInt((document.getElementById('consumable-duration') as HTMLInputElement).value) || undefined,
    };
  }

  if (itemType === 'light') {
    data.light_data = {
      radius: parseInt((document.getElementById('light-radius') as HTMLInputElement).value) || 2,
      fuel_max: parseInt((document.getElementById('light-fuel-max') as HTMLInputElement).value) || undefined,
      fuel_rate: parseInt((document.getElementById('light-fuel-rate') as HTMLInputElement).value) || undefined,
    };
  }

  // Requirements
  const reqClass = (document.getElementById('req-class') as HTMLInputElement).value;
  const reqRace = (document.getElementById('req-race') as HTMLInputElement).value;
  data.requirements = {
    level: parseInt((document.getElementById('req-level') as HTMLInputElement).value) || undefined,
    strength: parseInt((document.getElementById('req-strength') as HTMLInputElement).value) || undefined,
    dexterity: parseInt((document.getElementById('req-dexterity') as HTMLInputElement).value) || undefined,
    intelligence: parseInt((document.getElementById('req-intelligence') as HTMLInputElement).value) || undefined,
    constitution: parseInt((document.getElementById('req-constitution') as HTMLInputElement).value) || undefined,
    class: reqClass ? reqClass.split(',').map(c => c.trim()).filter(c => c) : undefined,
    race: reqRace ? reqRace.split(',').map(r => r.trim()).filter(r => r) : undefined,
  };

  // Modifiers
  data.stat_modifiers = {
    strength: parseInt((document.getElementById('mod-strength') as HTMLInputElement).value) || undefined,
    dexterity: parseInt((document.getElementById('mod-dexterity') as HTMLInputElement).value) || undefined,
    constitution: parseInt((document.getElementById('mod-constitution') as HTMLInputElement).value) || undefined,
    intelligence: parseInt((document.getElementById('mod-intelligence') as HTMLInputElement).value) || undefined,
    max_health: parseInt((document.getElementById('mod-max-health') as HTMLInputElement).value) || undefined,
    max_mana: parseInt((document.getElementById('mod-max-mana') as HTMLInputElement).value) || undefined,
  };

  return data;
}

// ============================================================================
// Import/Export
// ============================================================================

async function exportItems(): Promise<void> {
  try {
    const response = await fetch('/api/items/export');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'items_export.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export items:', error);
    alert('Failed to export items');
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

    const response = await fetch('/api/items/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: data.templates, merge }),
    });

    const result = await response.json();
    if (result.success) {
      alert(`Import complete!\nCreated: ${result.results.created}\nUpdated: ${result.results.updated}\nErrors: ${result.results.errors.length}`);
      hideImportModal();
      await fetchTemplates();
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
// Spawn Item
// ============================================================================

async function spawnItem(): Promise<void> {
  if (!selectedTemplateId) return;

  const roomId = parseInt((document.getElementById('spawn-room') as HTMLInputElement).value, 10);
  const quantity = parseInt((document.getElementById('spawn-quantity') as HTMLInputElement).value, 10);

  if (isNaN(roomId) || roomId < 1) {
    alert('Invalid room ID');
    return;
  }

  if (isNaN(quantity) || quantity < 1) {
    alert('Invalid quantity - must be a positive number');
    return;
  }

  try {
    const response = await fetch('/api/items/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: selectedTemplateId,
        room_id: roomId,
        quantity,
      }),
    });

    const data = await response.json();
    if (data.success) {
      alert(data.message);
    } else {
      alert('Failed to spawn item: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to spawn item:', error);
    alert('Failed to spawn item');
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
      const tabName = (btn as HTMLElement).dataset.tab!;
      
      // Update button states
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update content visibility
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`tab-${tabName}`)!.classList.add('active');
    });
  });
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  await fetchTemplates();
  setupTabs();

  // Event listeners
  document.getElementById('new-item-btn')!.addEventListener('click', createTemplate);
  document.getElementById('item-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    saveTemplate();
  });
  document.getElementById('delete-item-btn')!.addEventListener('click', deleteTemplate);
  document.getElementById('duplicate-item-btn')!.addEventListener('click', duplicateTemplate);
  
  // Filters
  document.getElementById('type-select')!.addEventListener('change', renderTemplateList);
  document.getElementById('search-input')!.addEventListener('input', renderTemplateList);
  
  // Type change handler
  document.getElementById('item-type')!.addEventListener('change', (e) => {
    updateTypeSections((e.target as HTMLSelectElement).value);
  });

  // Import/Export
  document.getElementById('import-btn')!.addEventListener('click', showImportModal);
  document.getElementById('export-btn')!.addEventListener('click', exportItems);
  document.getElementById('close-import-modal')!.addEventListener('click', hideImportModal);
  document.getElementById('do-import-btn')!.addEventListener('click', doImport);
  document.getElementById('import-modal')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideImportModal();
  });

  // Spawn
  document.getElementById('spawn-btn')!.addEventListener('click', spawnItem);

  // Logout
  document.getElementById('logout-btn')!.addEventListener('click', handleLogout);

  // User menu dropdown toggle
  const userMenuBtn = document.getElementById('nav-username');
  const userMenu = userMenuBtn?.closest('.nav-user-menu');
  if (userMenuBtn && userMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      userMenu.classList.remove('open');
    });
  }
});
