(function() {

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
  flags: Record<string, boolean | number | string | undefined>;
  max_stack: number;
  container_capacity?: number;
  container_weight_limit?: number;
  weapon_data?: {
    min_damage: number;
    max_damage: number;
    damage_type: string;
    attack_speed?: number;
    crit_modifier?: number;
    range?: string;
    backstab_accuracy?: number;
    backstab_min_damage_bonus?: number;
    backstab_max_damage_bonus?: number;
    attack_verbs?: {
      hit: string;
      miss: string;
      hit_3p: string;
      miss_3p: string;
    };
  };
  armor_data?: {
    armor_class: number;
    damage_resistance?: number;
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
  tool_data?: {
    toolType: 'lockpick';
    quality: number;
    durability: number;
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
  stealth_modifier?: number;
  effect_slots: number;
  rarity?: string;
  max_in_world?: number;
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

// Helper to show error messages to the user
function showError(message: string): void {
  const list = document.getElementById('item-list');
  if (list) {
    list.innerHTML = `<div class="error-message" style="color: #ff6b6b; padding: 1rem;">${escapeHtml(message)}</div>`;
  } else {
    showToast(message, 'error');
  }
}

// Helper to parse numbers with proper zero handling
function parseNumberOrDefault(value: string, defaultValue: number): number {
  const trimmed = value.trim();
  if (trimmed === '') return defaultValue;
  const parsed = Number(trimmed);
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
      // Redirect to login
      window.location.href = '/';
      return false;
    }
    const data: AuthInfo = await response.json();
    currentUser = data;
    
    if (!data.authenticated) {
      // Redirect to login
      window.location.href = '/';
      return false;
    }

    const roles = data.roles || [];
    const hasDeveloperAccess = roles.includes('developer') || roles.includes('admin');
    
    if (!hasDeveloperAccess) {
      // Redirect to game - no access
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
    // Redirect to login on error
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

  // Rarity and max_in_world
  const raritySelect = getElement<HTMLSelectElement>('item-rarity');
  const maxInWorldInput = getElement<HTMLInputElement>('item-max-in-world');
  if (raritySelect) raritySelect.value = template.rarity || 'common';
  if (maxInWorldInput) maxInWorldInput.value = String(template.max_in_world || 0);

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
  loadToolData(template);
  loadKeyData(template);

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
  const minDamage = getElement<HTMLInputElement>('weapon-min-damage');
  const maxDamage = getElement<HTMLInputElement>('weapon-max-damage');
  const damageType = getElement<HTMLSelectElement>('weapon-damage-type');
  const attackSpeed = getElement<HTMLInputElement>('weapon-attack-speed');
  const critModifier = getElement<HTMLInputElement>('weapon-crit-modifier');
  const range = getElement<HTMLSelectElement>('weapon-range');
  const backstabAccuracy = getElement<HTMLInputElement>('weapon-backstab-accuracy');
  const backstabMinDmgBonus = getElement<HTMLInputElement>('weapon-backstab-min-damage');
  const backstabMaxDmgBonus = getElement<HTMLInputElement>('weapon-backstab-max-damage');

  if (minDamage) minDamage.value = String(data?.min_damage ?? 1);
  if (maxDamage) maxDamage.value = String(data?.max_damage ?? 6);
  if (damageType) damageType.value = data?.damage_type || 'slashing';
  if (attackSpeed) attackSpeed.value = String(data?.attack_speed || 1500);
  if (critModifier) critModifier.value = String(data?.crit_modifier || 2);
  if (range) range.value = data?.range || 'melee';
  if (backstabAccuracy) backstabAccuracy.value = String(data?.backstab_accuracy || 0);
  if (backstabMinDmgBonus) backstabMinDmgBonus.value = String(data?.backstab_min_damage_bonus || 0);
  if (backstabMaxDmgBonus) backstabMaxDmgBonus.value = String(data?.backstab_max_damage_bonus || 0);

  // Attack verbs
  const verbHit = getElement<HTMLInputElement>('weapon-verb-hit');
  const verbHit3p = getElement<HTMLInputElement>('weapon-verb-hit-3p');
  const verbMiss = getElement<HTMLInputElement>('weapon-verb-miss');
  const verbMiss3p = getElement<HTMLInputElement>('weapon-verb-miss-3p');

  if (verbHit) verbHit.value = data?.attack_verbs?.hit || '';
  if (verbHit3p) verbHit3p.value = data?.attack_verbs?.hit_3p || '';
  if (verbMiss) verbMiss.value = data?.attack_verbs?.miss || '';
  if (verbMiss3p) verbMiss3p.value = data?.attack_verbs?.miss_3p || '';
}

function loadArmorData(template: ItemTemplate): void {
  const data = template.armor_data;
  (document.getElementById('armor-class') as HTMLInputElement).value = String(data?.armor_class || 0);
  (document.getElementById('armor-damage-resistance') as HTMLInputElement).value = String(data?.damage_resistance || 0);
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

function loadToolData(template: ItemTemplate): void {
  const data = template.tool_data;
  (document.getElementById('tool-type') as HTMLSelectElement).value = data?.toolType || 'lockpick';
  (document.getElementById('tool-quality') as HTMLInputElement).value = String(data?.quality || 1);
  (document.getElementById('tool-durability') as HTMLInputElement).value = String(data?.durability || 50);
}

function loadKeyData(template: ItemTemplate): void {
  const flags = template.flags || {};
  (document.getElementById('key-tag') as HTMLInputElement).value = String(flags.key_tag || '');
  (document.getElementById('key-consume-on-use') as HTMLInputElement).checked = flags.consumeOnUse === true;
  (document.getElementById('key-consume-chance') as HTMLInputElement).value = String(flags.consumeChance || 0);
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

  // Stealth modifier (negative for heavy armor, positive for stealth gear)
  const stealthModInput = document.getElementById('mod-stealth') as HTMLInputElement;
  if (stealthModInput) stealthModInput.value = String(template.stealth_modifier || 0);
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
    case 'tool':
      document.getElementById('tool-data-section')!.style.display = 'block';
      break;
    case 'key':
      document.getElementById('key-data-section')!.style.display = 'block';
      break;
    default:
      document.getElementById('no-type-data')!.style.display = 'block';
  }
}

function updatePreview(template: ItemTemplate): void {
  const content = document.getElementById('preview-content')!;
  
  const rarityDisplay = template.rarity && template.rarity !== 'common'
    ? `<span>Rarity: ${escapeHtml(template.rarity.charAt(0).toUpperCase() + template.rarity.slice(1))}</span>` : '';
  const valueDisplay = formatCopperValue(template.base_value);

  let html = `
    <div class="preview-name">${escapeHtml(template.short_desc)}</div>
    <div class="preview-desc">${escapeHtml(template.long_desc || 'No description.')}</div>
    <div class="preview-stats">
      <span>Weight: ${template.weight}</span>
      <span>Value: ${escapeHtml(valueDisplay)}</span>
      ${rarityDisplay}
    </div>
  `;

  // Type-specific preview
  if (template.item_type === 'weapon' && template.weapon_data) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Weapon</div>
        <div>Damage: ${template.weapon_data.min_damage}-${template.weapon_data.max_damage} ${escapeHtml(template.weapon_data.damage_type)}</div>
        <div>Speed: ${template.weapon_data.attack_speed || 1500}</div>
      </div>
    `;
  }

  if (template.item_type === 'armor' && template.armor_data) {
    const dr = template.armor_data.damage_resistance || 0;
    const drDisplay = Number.isInteger(dr) ? dr : dr.toFixed(1);
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Armor</div>
        <div>AC: ${template.armor_data.armor_class}/${drDisplay}</div>
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

  if (template.item_type === 'tool' && template.tool_data) {
    const durabilityText = template.tool_data.durability >= 101 ? 'Unbreakable' : `${template.tool_data.durability}%`;
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Tool (${escapeHtml(template.tool_data.toolType)})</div>
        <div>Quality: +${template.tool_data.quality}</div>
        <div>Durability: ${durabilityText}</div>
      </div>
    `;
  }

  if (template.item_type === 'key') {
    const keyFlags = template.flags;
    const keyTag = keyFlags?.key_tag as string | undefined;
    const consumeChance = keyFlags?.consumeChance as number | undefined;
    let consumeText = 'Permanent';
    if (keyFlags?.consumeOnUse) {
      consumeText = 'Consumed on use';
    } else if (consumeChance && consumeChance > 0) {
      consumeText = `${consumeChance}% break chance`;
    }
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Key</div>
        ${keyTag ? `<div>Tag: ${escapeHtml(keyTag)}</div>` : '<div class="hint">No key tag set</div>'}
        <div>${consumeText}</div>
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
      showToast(`Failed to create template: HTTP ${response.status}`, 'error');
      return;
    }
    const data = await response.json();
    if (data.success) {
      templates.push(data.template);
      selectTemplate(data.template.id);
    } else {
      showToast('Failed to create item: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to create item:', error);
    showToast('Failed to create item', 'error');
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
      showToast('Item saved successfully!', 'success');
    } else {
      showToast('Failed to save item: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to save item:', error);
    showToast('Failed to save item', 'error');
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
      showToast('Failed to delete item: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to delete item:', error);
    showToast('Failed to delete item', 'error');
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
      showToast('Failed to duplicate item: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to duplicate item:', error);
    showToast('Failed to duplicate item', 'error');
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
    rarity: (document.getElementById('item-rarity') as HTMLSelectElement).value || 'common',
    max_in_world: (document.getElementById('item-max-in-world') as HTMLInputElement).value
      ? parseInt((document.getElementById('item-max-in-world') as HTMLInputElement).value, 10)
      : undefined,
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
    const backstabAccuracyValue = parseNumberOrDefault((document.getElementById('weapon-backstab-accuracy') as HTMLInputElement)?.value, 0);
    const backstabMinDmgBonus = parseNumberOrDefault((document.getElementById('weapon-backstab-min-damage') as HTMLInputElement)?.value, 0);
    const backstabMaxDmgBonus = parseNumberOrDefault((document.getElementById('weapon-backstab-max-damage') as HTMLInputElement)?.value, 0);
    const weaponData: NonNullable<ItemTemplate['weapon_data']> = {
      min_damage: parseNumberOrDefault((document.getElementById('weapon-min-damage') as HTMLInputElement).value, 1),
      max_damage: parseNumberOrDefault((document.getElementById('weapon-max-damage') as HTMLInputElement).value, 6),
      damage_type: (document.getElementById('weapon-damage-type') as HTMLSelectElement).value,
      attack_speed: parseNumberOrDefault((document.getElementById('weapon-attack-speed') as HTMLInputElement).value, 1500),
      crit_modifier: parseNumberOrDefault((document.getElementById('weapon-crit-modifier') as HTMLInputElement).value, 2),
      range: (document.getElementById('weapon-range') as HTMLSelectElement).value,
      backstab_accuracy: backstabAccuracyValue !== 0 ? backstabAccuracyValue : undefined,
      backstab_min_damage_bonus: backstabMinDmgBonus !== 0 ? backstabMinDmgBonus : undefined,
      backstab_max_damage_bonus: backstabMaxDmgBonus !== 0 ? backstabMaxDmgBonus : undefined,
    };

    // Attack verbs - only include if at least one is filled
    const verbHit = (document.getElementById('weapon-verb-hit') as HTMLInputElement).value.trim();
    const verbHit3p = (document.getElementById('weapon-verb-hit-3p') as HTMLInputElement).value.trim();
    const verbMiss = (document.getElementById('weapon-verb-miss') as HTMLInputElement).value.trim();
    const verbMiss3p = (document.getElementById('weapon-verb-miss-3p') as HTMLInputElement).value.trim();

    if (verbHit || verbHit3p || verbMiss || verbMiss3p) {
      weaponData.attack_verbs = {
        hit: verbHit,
        miss: verbMiss,
        hit_3p: verbHit3p,
        miss_3p: verbMiss3p,
      };
    }

    data.weapon_data = weaponData;
  }

  if (itemType === 'armor') {
    data.armor_data = {
      armor_class: parseInt((document.getElementById('armor-class') as HTMLInputElement).value) || 0,
      damage_resistance: parseFloat((document.getElementById('armor-damage-resistance') as HTMLInputElement).value) || 0,
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

  if (itemType === 'tool') {
    const toolTypeValue = (document.getElementById('tool-type') as HTMLSelectElement).value;
    const qualityValue = parseInt((document.getElementById('tool-quality') as HTMLInputElement).value) || 1;
    const durabilityValue = parseInt((document.getElementById('tool-durability') as HTMLInputElement).value) || 50;

    // Validate toolType is a known value (currently only 'lockpick')
    const toolType: 'lockpick' = toolTypeValue === 'lockpick' ? 'lockpick' : 'lockpick';

    data.tool_data = {
      toolType,
      quality: Math.max(1, Math.min(5, qualityValue)),      // Clamp to 1-5
      durability: Math.max(1, Math.min(101, durabilityValue)), // Clamp to 1-101
    };
  }

  if (itemType === 'key') {
    const keyTag = (document.getElementById('key-tag') as HTMLInputElement).value.trim();
    const consumeOnUse = (document.getElementById('key-consume-on-use') as HTMLInputElement).checked;
    const consumeChance = parseInt((document.getElementById('key-consume-chance') as HTMLInputElement).value) || 0;

    // Add key flags to the flags object
    if (keyTag) {
      data.flags!.key_tag = keyTag;
    }
    if (consumeOnUse) {
      data.flags!.consumeOnUse = true;
    }
    if (consumeChance > 0) {
      data.flags!.consumeChance = Math.max(0, Math.min(100, consumeChance));
    }
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

  // Stealth modifier (negative for heavy armor, positive for stealth gear)
  const stealthMod = parseInt((document.getElementById('mod-stealth') as HTMLInputElement)?.value) || 0;
  if (stealthMod !== 0) {
    data.stealth_modifier = stealthMod;
  }

  return data;
}

// ============================================================================
// Import/Export
// ============================================================================

async function exportItems(): Promise<void> {
  try {
    const response = await fetch('/api/items/export');
    if (!response.ok) throw new Error('Failed to fetch items');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'items_export.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export items:', error);
    showToast('Failed to export items', 'error');
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

    const response = await fetch('/api/items/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: data.templates, merge }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      showToast(`Import complete! Created: ${result.results.created}, Updated: ${result.results.updated}, Errors: ${result.results.errors.length}`, 'success', 4000);
      hideImportModal();
      await fetchTemplates();
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
// Spawn Item
// ============================================================================

async function spawnItem(): Promise<void> {
  if (!selectedTemplateId) return;

  const roomId = parseInt((document.getElementById('spawn-room') as HTMLInputElement).value, 10);
  const quantity = parseInt((document.getElementById('spawn-quantity') as HTMLInputElement).value, 10);

  if (isNaN(roomId) || roomId < 1) {
    showToast('Invalid room ID', 'warning');
    return;
  }

  if (isNaN(quantity) || quantity < 1) {
    showToast('Invalid quantity - must be a positive number', 'warning');
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
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast('Failed to spawn item: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to spawn item:', error);
    showToast('Failed to spawn item', 'error');
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

// Format copper value as denomination string (e.g., 1234 -> "12 gold, 3 silver, 4 copper")
function formatCopperValue(copper: number): string {
  if (copper <= 0) return '0 copper';
  const denominations: { name: string; value: number }[] = [
    { name: 'runic', value: 100000 },
    { name: 'platinum', value: 1000 },
    { name: 'gold', value: 100 },
    { name: 'silver', value: 10 },
    { name: 'copper', value: 1 },
  ];
  const parts: string[] = [];
  let remaining = copper;
  for (const d of denominations) {
    const count = Math.floor(remaining / d.value);
    if (count > 0) {
      parts.push(`${count} ${d.name}`);
      remaining -= count * d.value;
    }
  }
  return parts.length > 0 ? parts.join(', ') : '0 copper';
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

  await fetchTemplates();
  setupTabs();

  // Helper to safely add event listeners
  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`Element #${id} not found for event listener`);
  };

  // Event listeners
  addListener('new-item-btn', 'click', createTemplate);
  addListener('item-form', 'submit', (e) => {
    e.preventDefault();
    saveTemplate();
  });
  addListener('delete-item-btn', 'click', deleteTemplate);
  addListener('duplicate-item-btn', 'click', duplicateTemplate);
  
  // Filters
  addListener('type-select', 'change', renderTemplateList);
  addListener('search-input', 'input', renderTemplateList);
  
  // Type change handler
  addListener('item-type', 'change', (e) => {
    updateTypeSections((e.target as HTMLSelectElement).value);
  });

  // Import/Export
  addListener('import-btn', 'click', showImportModal);
  addListener('export-btn', 'click', exportItems);
  addListener('close-import-modal', 'click', hideImportModal);
  addListener('do-import-btn', 'click', doImport);
  addListener('import-modal', 'click', (e) => {
    if (e.target === e.currentTarget) hideImportModal();
  });

  // Spawn
  addListener('spawn-btn', 'click', spawnItem);

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
