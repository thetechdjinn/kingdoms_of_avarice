(function() {

interface NpcAttack {
  id?: number;
  npcId?: number;
  name: string;
  attackType: string;
  minDamage: number;
  maxDamage: number;
  attacksPerRound: number;
  percentage: number;
  manaCost: number;
  hitMessage: string | null;
  missMessage: string | null;
  hitVerb: string;
  hitVerb3p: string;
  missVerb: string;
  missVerb3p: string;
}

interface NpcTemplate {
  id: number;
  name: string;
  description: string | null;
  spawnRoomId: number | null;
  health: number;
  maxHealth: number;
  hostile: boolean;
  respawnTime: number | null;
  level: number;
  experienceReward: number;
  goldMin: number;
  goldMax: number;
  maxMana: number;
  baseAccuracy: number;
  baseDefense: number;
  baseCritChance: number;
  baseDodge: number;
  damageReduction: number;
  traits: string[];
  fleeEnabled: boolean;
  fleeHpPercent: number;
  callForHelpChance: number;
  maxActive: number;
  interactable: boolean;
  allowedAreas: string[];
  roamEnabled: boolean;
  roamInterval: number;
  roamChance: number;
  dropTableId: number | null;
  essenceReward: number;
  essenceClass: string | null;
  leaveCorpse: boolean;
  corpseDuration: number;
  augmentations: string[];
  enterRoomMessage: string | null;
  exitRoomMessage: string | null;
  spawnMessage: string | null;
  merchantEnabled: boolean;
  primaryFactionId: number | null;
  properName: boolean;
  attacks: NpcAttack[];
}

interface Faction {
  id: number;
  name: string;
  description: string | null;
  factionType: string;
}

interface ItemTemplateBasic {
  id: number;
  name: string;
  base_value: number;
}

interface MerchantInventoryEntry {
  id: number;
  npcTemplateId: number;
  itemTemplateId: number;
  maxStock: number;
  currentStock: number;
  restockChance: number;
  itemTemplate: ItemTemplateBasic;
}

interface MerchantResponse {
  id: number;
  npcTemplateId: number;
  triggerKeywords: string[];
  response: string;
}

interface DropTable {
  id: number;
  name: string;
  description: string | null;
}

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

let templates: NpcTemplate[] = [];
let dropTables: DropTable[] = [];
let factions: Faction[] = [];
let itemTemplates: ItemTemplateBasic[] = [];
let merchantInventory: MerchantInventoryEntry[] = [];
let merchantResponses: MerchantResponse[] = [];
let selectedTemplateId: number | null = null;
let editingAttacks: NpcAttack[] = [];
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

async function fetchTemplates(): Promise<void> {
  try {
    const response = await fetch('/api/npcs');
    if (!response.ok) throw new Error('Failed to fetch NPC templates');
    const data = await response.json();
    templates = data.templates || [];
    renderTemplateList();
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    showToast('Failed to load NPC templates', 'error');
  }
}

async function fetchDropTables(): Promise<void> {
  try {
    const response = await fetch('/api/drop-tables');
    if (!response.ok) throw new Error('Failed to fetch drop tables');
    const data = await response.json();
    dropTables = data.dropTables || [];
    populateDropTableSelect();
  } catch (error) {
    console.error('Failed to fetch drop tables:', error);
  }
}

function populateDropTableSelect(): void {
  const select = getElement<HTMLSelectElement>('npc-drop-table');
  if (!select) return;

  // Keep the "None" option
  select.innerHTML = '<option value="">None</option>';
  for (const dt of dropTables) {
    const option = document.createElement('option');
    option.value = String(dt.id);
    option.textContent = `${dt.name} (ID: ${dt.id})`;
    select.appendChild(option);
  }
}

// ============================================================================
// Template List Rendering
// ============================================================================

function renderTemplateList(): void {
  const list = getElement<HTMLUListElement>('npc-list');
  if (!list) return;

  const searchInput = getElement<HTMLInputElement>('search-input');
  const search = searchInput?.value.toLowerCase() || '';

  const filtered = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !String(t.id).includes(search)) {
      return false;
    }
    return true;
  });

  list.innerHTML = '';
  for (const t of filtered) {
    const li = document.createElement('li');
    li.dataset.id = String(t.id);
    if (t.id === selectedTemplateId) li.classList.add('selected');

    li.innerHTML = `
      <span class="npc-name">${escapeHtml(t.name)}</span>
      <span class="npc-info">Lv${t.level} ${t.hostile ? '<span class="hostile-tag">Hostile</span>' : 'Peaceful'}</span>
      <span class="npc-id">ID: ${t.id}</span>
    `;

    li.addEventListener('click', () => selectTemplate(t.id));
    list.appendChild(li);
  }
}

// ============================================================================
// Template Selection & Form Population
// ============================================================================

function selectTemplate(id: number): void {
  selectedTemplateId = id;
  const template = templates.find(t => t.id === id);
  if (!template) return;

  const noSelected = getElement<HTMLElement>('no-npc-selected');
  const form = getElement<HTMLFormElement>('npc-form');
  if (noSelected) noSelected.style.display = 'none';
  if (form) form.style.display = 'block';

  const titleEl = getElement<HTMLElement>('npc-form-title');
  if (titleEl) titleEl.textContent = `Edit NPC: ${template.name}`;

  const idEl = getElement<HTMLElement>('npc-id-display');
  if (idEl) idEl.textContent = `ID: ${template.id}`;

  // Basic tab
  setInputValue('npc-name', template.name);
  setInputValue('npc-level', String(template.level));
  setInputValue('npc-description', template.description || '');
  setInputValue('npc-spawn-room', template.spawnRoomId ? String(template.spawnRoomId) : '');
  setInputValue('npc-respawn-time', template.respawnTime !== null ? String(template.respawnTime) : '');
  setInputValue('npc-max-active', String(template.maxActive));
  setCheckbox('npc-hostile', template.hostile);
  setCheckbox('npc-proper-name', template.properName);
  setCheckbox('npc-interactable', template.interactable);

  // Combat tab
  setInputValue('npc-max-health', String(template.maxHealth));
  setInputValue('npc-max-mana', String(template.maxMana));
  setInputValue('npc-base-accuracy', String(template.baseAccuracy));
  setInputValue('npc-base-defense', String(template.baseDefense));
  setInputValue('npc-base-crit-chance', String(template.baseCritChance));
  setInputValue('npc-base-dodge', String(template.baseDodge));
  setInputValue('npc-damage-reduction', String(template.damageReduction));

  // Behavior tab
  setCheckbox('npc-flee-enabled', template.fleeEnabled);
  setInputValue('npc-flee-hp-percent', String(template.fleeHpPercent));
  setInputValue('npc-call-for-help', String(template.callForHelpChance));
  setInputValue('npc-traits', template.traits.join(', '));
  setCheckbox('npc-roam-enabled', template.roamEnabled);
  setInputValue('npc-roam-interval', String(template.roamInterval));
  setInputValue('npc-roam-chance', String(template.roamChance));
  setInputValue('npc-allowed-areas', template.allowedAreas.join(', '));

  // Rewards tab
  setInputValue('npc-experience-reward', String(template.experienceReward));
  setInputValue('npc-essence-reward', String(template.essenceReward));
  setInputValue('npc-essence-class', template.essenceClass || '');
  setInputValue('npc-gold-min', String(template.goldMin));
  setInputValue('npc-gold-max', String(template.goldMax));
  setSelectValue('npc-drop-table', template.dropTableId ? String(template.dropTableId) : '');

  // Appearance tab
  setInputValue('npc-augmentations', template.augmentations.join(', '));
  setInputValue('npc-enter-message', template.enterRoomMessage || '');
  setInputValue('npc-exit-message', template.exitRoomMessage || '');
  setInputValue('npc-spawn-message', template.spawnMessage || '');
  setCheckbox('npc-leave-corpse', template.leaveCorpse);
  setInputValue('npc-corpse-duration', String(template.corpseDuration));

  // Attacks
  editingAttacks = template.attacks.map(a => ({ ...a }));
  renderAttacks();

  // Merchant tab
  setCheckbox('npc-merchant-enabled', template.merchantEnabled);
  setSelectValue('npc-primary-faction', template.primaryFactionId ? String(template.primaryFactionId) : '');
  toggleMerchantSection(template.merchantEnabled);
  if (template.merchantEnabled) {
    loadMerchantData(template.id);
  }

  // Enable spawn
  const spawnBtn = getElement<HTMLButtonElement>('spawn-btn');
  if (spawnBtn) spawnBtn.disabled = false;

  // Update preview
  updatePreview();
  renderTemplateList();
}

function setInputValue(id: string, value: string): void {
  const el = getElement<HTMLInputElement>(id);
  if (el) el.value = value;
}

function setCheckbox(id: string, checked: boolean): void {
  const el = getElement<HTMLInputElement>(id);
  if (el) el.checked = checked;
}

function setSelectValue(id: string, value: string): void {
  const el = getElement<HTMLSelectElement>(id);
  if (el) el.value = value;
}

// ============================================================================
// Attacks Rendering
// ============================================================================

function renderAttacks(): void {
  const container = getElement<HTMLElement>('attacks-container');
  const hint = getElement<HTMLElement>('no-attacks-hint');
  if (!container) return;

  container.innerHTML = '';

  if (editingAttacks.length === 0) {
    if (hint) hint.style.display = 'block';
    return;
  }

  if (hint) hint.style.display = 'none';

  editingAttacks.forEach((atk, index) => {
    const row = document.createElement('div');
    row.className = 'attack-row';
    row.innerHTML = `
      <div class="attack-row-header">
        <span class="attack-title">Attack ${index + 1}: ${escapeHtml(atk.name || 'Unnamed')}</span>
        <button type="button" class="btn-remove" data-index="${index}">Remove</button>
      </div>
      <div class="attack-fields">
        <div class="form-group">
          <label>Name</label>
          <input type="text" data-field="name" data-index="${index}" value="${escapeHtml(atk.name)}" />
        </div>
        <div class="form-group">
          <label>Type</label>
          <select data-field="attackType" data-index="${index}">
            <option value="melee" ${atk.attackType === 'melee' ? 'selected' : ''}>Melee</option>
            <option value="magic" ${atk.attackType === 'magic' ? 'selected' : ''}>Magic</option>
            <option value="ranged" ${atk.attackType === 'ranged' ? 'selected' : ''}>Ranged</option>
          </select>
        </div>
        <div class="form-group">
          <label>Attacks/Round</label>
          <input type="number" data-field="attacksPerRound" data-index="${index}" min="1" value="${atk.attacksPerRound}" />
        </div>
        <div class="form-group">
          <label>Min Damage</label>
          <input type="number" data-field="minDamage" data-index="${index}" min="0" value="${atk.minDamage}" />
        </div>
        <div class="form-group">
          <label>Max Damage</label>
          <input type="number" data-field="maxDamage" data-index="${index}" min="0" value="${atk.maxDamage}" />
        </div>
        <div class="form-group">
          <label>Percentage %</label>
          <input type="number" data-field="percentage" data-index="${index}" min="0" max="100" value="${atk.percentage}" />
        </div>
        <div class="form-group">
          <label>Mana Cost</label>
          <input type="number" data-field="manaCost" data-index="${index}" min="0" value="${atk.manaCost}" />
        </div>
      </div>
      <div class="attack-verbs">
        <div class="attack-verbs-title">Verbs & Messages</div>
        <div class="attack-fields">
          <div class="form-group">
            <label>Hit Verb (1p)</label>
            <input type="text" data-field="hitVerb" data-index="${index}" value="${escapeHtml(atk.hitVerb)}" />
          </div>
          <div class="form-group">
            <label>Hit Verb (3p)</label>
            <input type="text" data-field="hitVerb3p" data-index="${index}" value="${escapeHtml(atk.hitVerb3p)}" />
          </div>
          <div class="form-group">
            <label>Miss Verb (1p)</label>
            <input type="text" data-field="missVerb" data-index="${index}" value="${escapeHtml(atk.missVerb)}" />
          </div>
          <div class="form-group">
            <label>Miss Verb (3p)</label>
            <input type="text" data-field="missVerb3p" data-index="${index}" value="${escapeHtml(atk.missVerb3p)}" />
          </div>
          <div class="form-group">
            <label>Hit Message</label>
            <input type="text" data-field="hitMessage" data-index="${index}" value="${escapeHtml(atk.hitMessage || '')}" placeholder="Custom hit message" />
          </div>
          <div class="form-group">
            <label>Miss Message</label>
            <input type="text" data-field="missMessage" data-index="${index}" value="${escapeHtml(atk.missMessage || '')}" placeholder="Custom miss message" />
          </div>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  // Wire up change listeners on attack inputs
  container.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', handleAttackFieldChange);
    el.addEventListener('input', handleAttackFieldChange);
  });

  // Wire up remove buttons
  container.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0');
      editingAttacks.splice(index, 1);
      renderAttacks();
      updatePreview();
    });
  });
}

function handleAttackFieldChange(e: Event): void {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const index = parseInt(el.dataset.index || '0');
  const field = el.dataset.field as string;
  if (index < 0 || index >= editingAttacks.length || !field) return;

  const atk = editingAttacks[index] as unknown as Record<string, unknown>;
  const numericFields = ['minDamage', 'maxDamage', 'attacksPerRound', 'percentage', 'manaCost'];
  if (numericFields.includes(field)) {
    atk[field] = parseNumberOrDefault(el.value, 0);
  } else if (field === 'hitMessage' || field === 'missMessage') {
    atk[field] = el.value || null;
  } else {
    atk[field] = el.value;
  }

  // Update header title if name changed
  if (field === 'name') {
    const row = el.closest('.attack-row');
    const title = row?.querySelector('.attack-title');
    if (title) title.textContent = `Attack ${index + 1}: ${el.value || 'Unnamed'}`;
  }

  updatePreview();
}

function addAttack(): void {
  editingAttacks.push({
    name: 'New Attack',
    attackType: 'melee',
    minDamage: 1,
    maxDamage: 5,
    attacksPerRound: 1,
    percentage: 100,
    manaCost: 0,
    hitMessage: null,
    missMessage: null,
    hitVerb: 'hits',
    hitVerb3p: 'hits',
    missVerb: 'misses',
    missVerb3p: 'misses',
  });
  renderAttacks();
  updatePreview();
}

// ============================================================================
// Form Data Gathering
// ============================================================================

function gatherFormData(): Record<string, unknown> {
  const getVal = (id: string) => getElement<HTMLInputElement>(id)?.value || '';
  const getNum = (id: string, def: number) => parseNumberOrDefault(getVal(id), def);
  const getChecked = (id: string) => getElement<HTMLInputElement>(id)?.checked || false;

  const traits = getVal('npc-traits').split(',').map(s => s.trim()).filter(Boolean);
  const allowedAreas = getVal('npc-allowed-areas').split(',').map(s => s.trim()).filter(Boolean);
  const augmentations = getVal('npc-augmentations').split(',').map(s => s.trim()).filter(Boolean);

  const spawnRoomVal = getVal('npc-spawn-room').trim();
  const respawnTimeVal = getVal('npc-respawn-time').trim();
  const essenceClassVal = getVal('npc-essence-class').trim();
  const dropTableVal = getElement<HTMLSelectElement>('npc-drop-table')?.value || '';

  return {
    name: getVal('npc-name'),
    description: getVal('npc-description') || null,
    level: getNum('npc-level', 1),
    spawnRoomId: spawnRoomVal ? parseInt(spawnRoomVal) : null,
    respawnTime: respawnTimeVal ? parseInt(respawnTimeVal) : null,
    maxActive: getNum('npc-max-active', 1),
    hostile: getChecked('npc-hostile'),
    properName: getChecked('npc-proper-name'),
    interactable: getChecked('npc-interactable'),

    maxHealth: getNum('npc-max-health', 100),
    maxMana: getNum('npc-max-mana', 0),
    baseAccuracy: getNum('npc-base-accuracy', 50),
    baseDefense: getNum('npc-base-defense', 50),
    baseCritChance: getNum('npc-base-crit-chance', 5),
    baseDodge: getNum('npc-base-dodge', 5),
    damageReduction: getNum('npc-damage-reduction', 0),

    fleeEnabled: getChecked('npc-flee-enabled'),
    fleeHpPercent: getNum('npc-flee-hp-percent', 20),
    callForHelpChance: getNum('npc-call-for-help', 0),
    traits,
    roamEnabled: getChecked('npc-roam-enabled'),
    roamInterval: getNum('npc-roam-interval', 60),
    roamChance: getNum('npc-roam-chance', 10),
    allowedAreas,

    experienceReward: getNum('npc-experience-reward', 0),
    essenceReward: getNum('npc-essence-reward', 0),
    essenceClass: essenceClassVal || null,
    goldMin: getNum('npc-gold-min', 0),
    goldMax: getNum('npc-gold-max', 0),
    dropTableId: dropTableVal ? parseInt(dropTableVal) : null,

    augmentations,
    enterRoomMessage: getVal('npc-enter-message') || null,
    exitRoomMessage: getVal('npc-exit-message') || null,
    spawnMessage: getVal('npc-spawn-message') || null,
    leaveCorpse: getChecked('npc-leave-corpse'),
    corpseDuration: getNum('npc-corpse-duration', 300),

    merchantEnabled: getChecked('npc-merchant-enabled'),
    primaryFactionId: getElement<HTMLSelectElement>('npc-primary-faction')?.value
      ? parseInt(getElement<HTMLSelectElement>('npc-primary-faction')!.value)
      : null,

    attacks: editingAttacks,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

async function createTemplate(): Promise<void> {
  try {
    const response = await fetch('/api/npcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New NPC', level: 1 }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to create NPC', 'error');
      return;
    }

    await fetchTemplates();
    selectTemplate(data.template.id);
    showToast('NPC template created', 'success');
  } catch (error) {
    console.error('Failed to create template:', error);
    showToast('Failed to create NPC template', 'error');
  }
}

async function saveTemplate(): Promise<void> {
  if (!selectedTemplateId) return;

  const formData = gatherFormData();
  if (!formData.name || typeof formData.name !== 'string' || !(formData.name as string).trim()) {
    showToast('Name is required', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/npcs/${selectedTemplateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to save NPC', 'error');
      return;
    }

    await fetchTemplates();
    selectTemplate(selectedTemplateId);
    showToast('NPC template saved', 'success');
  } catch (error) {
    console.error('Failed to save template:', error);
    showToast('Failed to save NPC template', 'error');
  }
}

async function deleteTemplate(): Promise<void> {
  if (!selectedTemplateId) return;
  if (!confirm('Delete this NPC template? All active instances will be despawned.')) return;

  try {
    const response = await fetch(`/api/npcs/${selectedTemplateId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to delete NPC', 'error');
      return;
    }

    selectedTemplateId = null;
    const noSelected = getElement<HTMLElement>('no-npc-selected');
    const form = getElement<HTMLFormElement>('npc-form');
    if (noSelected) noSelected.style.display = 'block';
    if (form) form.style.display = 'none';

    const spawnBtn = getElement<HTMLButtonElement>('spawn-btn');
    if (spawnBtn) spawnBtn.disabled = true;

    await fetchTemplates();
    clearPreview();
    showToast('NPC template deleted', 'success');
  } catch (error) {
    console.error('Failed to delete template:', error);
    showToast('Failed to delete NPC template', 'error');
  }
}

async function duplicateTemplate(): Promise<void> {
  if (!selectedTemplateId) return;

  const formData = gatherFormData();
  formData.name = `${formData.name} (copy)`;

  try {
    const response = await fetch('/api/npcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to duplicate NPC', 'error');
      return;
    }

    await fetchTemplates();
    selectTemplate(data.template.id);
    showToast('NPC template duplicated', 'success');
  } catch (error) {
    console.error('Failed to duplicate template:', error);
    showToast('Failed to duplicate NPC template', 'error');
  }
}

// ============================================================================
// Spawn
// ============================================================================

async function spawnNpc(): Promise<void> {
  if (!selectedTemplateId) return;

  const roomInput = getElement<HTMLInputElement>('spawn-room');
  const roomId = roomInput ? parseInt(roomInput.value) : 0;
  if (!roomId || roomId < 1) {
    showToast('Enter a valid room ID', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/npcs/${selectedTemplateId}/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to spawn NPC', 'error');
      return;
    }

    showToast(`Spawned "${data.instance.entityName}" in room ${roomId}`, 'success');
  } catch (error) {
    console.error('Failed to spawn NPC:', error);
    showToast('Failed to spawn NPC', 'error');
  }
}

// ============================================================================
// Import / Export
// ============================================================================

function showImportModal(): void {
  const modal = getElement<HTMLElement>('import-modal');
  if (modal) modal.style.display = 'flex';
}

function hideImportModal(): void {
  const modal = getElement<HTMLElement>('import-modal');
  if (modal) modal.style.display = 'none';
}

async function doImport(): Promise<void> {
  const fileInput = getElement<HTMLInputElement>('import-file');
  const mergeCheckbox = getElement<HTMLInputElement>('import-merge');
  if (!fileInput?.files?.length) {
    showToast('Select a file to import', 'error');
    return;
  }

  try {
    const text = await fileInput.files[0].text();
    const json = JSON.parse(text);
    const importTemplates = json.templates || json;

    if (!Array.isArray(importTemplates)) {
      showToast('Invalid import file format', 'error');
      return;
    }

    const response = await fetch('/api/npcs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templates: importTemplates,
        merge: mergeCheckbox?.checked ?? true,
      }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      showToast(errData?.message || `Import failed (HTTP ${response.status})`, 'error');
      return;
    }
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Import failed', 'error');
      return;
    }

    hideImportModal();
    await fetchTemplates();
    const skippedMsg = data.skipped > 0 ? `, ${data.skipped} skipped` : '';
    showToast(`Import complete: ${data.created} created, ${data.updated} updated${skippedMsg}`, data.skipped > 0 ? 'warning' : 'success');
  } catch (error) {
    console.error('Import failed:', error);
    showToast(error instanceof SyntaxError ? 'Import failed: invalid JSON' : 'Import failed', 'error');
  }
}

async function exportNpcs(): Promise<void> {
  try {
    const response = await fetch('/api/npcs/export');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'npc-templates.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported NPC templates', 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed', 'error');
  }
}

// ============================================================================
// Preview
// ============================================================================

function clearPreview(): void {
  const content = getElement<HTMLElement>('preview-content');
  if (content) content.innerHTML = '<p class="hint">Select an NPC to see preview</p>';
}

function updatePreview(): void {
  const content = getElement<HTMLElement>('preview-content');
  if (!content) return;

  const getVal = (id: string) => getElement<HTMLInputElement>(id)?.value || '';
  const getNum = (id: string, def: number) => parseNumberOrDefault(getVal(id), def);
  const getChecked = (id: string) => getElement<HTMLInputElement>(id)?.checked || false;

  const name = getVal('npc-name') || 'Unnamed';
  const level = getNum('npc-level', 1);
  const hostile = getChecked('npc-hostile');
  const maxHealth = getNum('npc-max-health', 100);
  const maxMana = getNum('npc-max-mana', 0);
  const accuracy = getNum('npc-base-accuracy', 50);
  const defense = getNum('npc-base-defense', 50);
  const dr = getNum('npc-damage-reduction', 0);
  const spawnRoom = getVal('npc-spawn-room');
  const xp = getNum('npc-experience-reward', 0);
  const goldMin = getNum('npc-gold-min', 0);
  const goldMax = getNum('npc-gold-max', 0);

  // Balance calculations
  const effectiveHp = dr < 100 ? Math.round(maxHealth / (1 - dr / 100)) : Infinity;

  let totalDps = 0;
  const attackLines: string[] = [];
  for (const atk of editingAttacks) {
    const avgDmg = (atk.minDamage + atk.maxDamage) / 2;
    const dps = avgDmg * atk.attacksPerRound * (atk.percentage / 100);
    totalDps += dps;
    attackLines.push(`
      <div class="preview-stat">
        <span class="label">${escapeHtml(atk.name)}:</span>
        <span class="value">${atk.minDamage}-${atk.maxDamage} x${atk.attacksPerRound} (${atk.percentage}%) = ${dps.toFixed(1)} avg</span>
      </div>
    `);
  }

  content.innerHTML = `
    <div class="preview-name">${escapeHtml(name)}</div>
    <div class="preview-section">
      <div class="preview-section-title">Identity</div>
      <div class="preview-stat"><span class="label">Level:</span> <span class="value">${level}</span></div>
      <div class="preview-stat"><span class="label">Hostile:</span> <span class="value ${hostile ? 'hostile' : 'peaceful'}">${hostile ? 'Yes' : 'No'}</span></div>
      ${spawnRoom ? `<div class="preview-stat"><span class="label">Spawn Room:</span> <span class="value">${escapeHtml(spawnRoom)}</span></div>` : ''}
    </div>
    <div class="preview-section">
      <div class="preview-section-title">Combat Stats</div>
      <div class="preview-stat"><span class="label">HP:</span> <span class="value">${maxHealth}</span></div>
      ${maxMana > 0 ? `<div class="preview-stat"><span class="label">Mana:</span> <span class="value">${maxMana}</span></div>` : ''}
      <div class="preview-stat"><span class="label">Accuracy:</span> <span class="value">${accuracy}</span></div>
      <div class="preview-stat"><span class="label">Defense:</span> <span class="value">${defense}</span></div>
      ${dr > 0 ? `<div class="preview-stat"><span class="label">DR:</span> <span class="value">${dr}%</span></div>` : ''}
    </div>
    <div class="preview-section">
      <div class="preview-section-title">Balance Preview</div>
      <div class="preview-stat"><span class="label">Effective HP:</span> <span class="balance-value">${effectiveHp === Infinity ? '&infin;' : effectiveHp}</span></div>
      ${attackLines.length > 0 ? attackLines.join('') : '<div class="preview-stat"><span class="label">No attacks defined</span></div>'}
      <div class="preview-stat"><span class="label">Total DPS:</span> <span class="balance-value">${totalDps.toFixed(1)}</span></div>
    </div>
    <div class="preview-section">
      <div class="preview-section-title">Rewards</div>
      <div class="preview-stat"><span class="label">XP:</span> <span class="value">${xp}</span></div>
      <div class="preview-stat"><span class="label">Gold:</span> <span class="value">${goldMin}-${goldMax} copper</span></div>
    </div>
  `;
}

// ============================================================================
// Merchant Tab
// ============================================================================

async function fetchFactions(): Promise<void> {
  try {
    const response = await fetch('/api/factions');
    if (!response.ok) return;
    const data = await response.json();
    factions = data.factions || [];
    populateFactionDropdown();
  } catch (error) {
    console.error('Failed to fetch factions:', error);
  }
}

async function fetchItemTemplates(): Promise<void> {
  try {
    const response = await fetch('/api/items/templates');
    if (!response.ok) return;
    const data = await response.json();
    itemTemplates = (data.templates || []).map((t: Record<string, unknown>) => ({
      id: t.id,
      name: t.name,
      base_value: t.base_value ?? 0,
    }));
    populateItemDropdown();
  } catch (error) {
    console.error('Failed to fetch item templates:', error);
  }
}

function populateFactionDropdown(): void {
  const select = getElement<HTMLSelectElement>('npc-primary-faction');
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = '<option value="">None</option>';
  for (const f of factions) {
    const opt = document.createElement('option');
    opt.value = String(f.id);
    opt.textContent = `${f.name} (${f.factionType})`;
    select.appendChild(opt);
  }
  select.value = currentValue;
}

function populateItemDropdown(): void {
  const select = getElement<HTMLSelectElement>('merchant-add-item-select');
  if (!select) return;
  select.innerHTML = '<option value="">Select item to add...</option>';
  const sorted = [...itemTemplates].sort((a, b) => a.name.localeCompare(b.name));
  for (const item of sorted) {
    const opt = document.createElement('option');
    opt.value = String(item.id);
    opt.textContent = `${item.name} (${item.base_value}c)`;
    select.appendChild(opt);
  }
}

function toggleMerchantSection(enabled: boolean): void {
  const section = document.getElementById('merchant-section');
  if (section) section.style.display = enabled ? 'block' : 'none';
}

async function loadMerchantData(npcTemplateId: number): Promise<void> {
  try {
    const [invRes, respRes] = await Promise.all([
      fetch(`/api/merchants/${npcTemplateId}/inventory`),
      fetch(`/api/merchants/${npcTemplateId}/responses`),
    ]);
    if (invRes.ok) {
      const invData = await invRes.json();
      merchantInventory = invData.inventory || [];
    }
    if (respRes.ok) {
      const respData = await respRes.json();
      merchantResponses = respData.responses || [];
    }
  } catch (error) {
    console.error('Failed to load merchant data:', error);
  }
  renderMerchantInventory();
  renderMerchantResponses();
}

function renderMerchantInventory(): void {
  const tbody = document.getElementById('merchant-inventory-body');
  const hint = document.getElementById('no-inventory-hint');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (hint) hint.style.display = merchantInventory.length === 0 ? 'block' : 'none';

  for (const entry of merchantInventory) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(entry.itemTemplate.name)}</td>
      <td><input type="number" value="${entry.maxStock}" min="1" data-id="${entry.id}" data-field="maxStock" class="inv-edit" style="width:60px" /></td>
      <td><input type="number" value="${entry.currentStock}" min="0" data-id="${entry.id}" data-field="currentStock" class="inv-edit" style="width:60px" /></td>
      <td><input type="number" value="${entry.restockChance}" min="1" max="100" data-id="${entry.id}" data-field="restockChance" class="inv-edit" style="width:60px" /></td>
      <td>${entry.itemTemplate.base_value}c</td>
      <td><button type="button" class="btn-small btn-danger inv-delete" data-id="${entry.id}">X</button></td>
    `;
    tbody.appendChild(tr);
  }

  // Attach listeners
  tbody.querySelectorAll('.inv-edit').forEach(input => {
    input.addEventListener('change', async (e) => {
      const el = e.target as HTMLInputElement;
      const id = parseInt(el.dataset.id || '0');
      const field = el.dataset.field || '';
      const value = parseInt(el.value);
      if (isNaN(id) || isNaN(value)) return;
      try {
        await fetch(`/api/merchants/inventory/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
        showToast('Inventory updated', 'success');
      } catch (error) {
        showToast('Failed to update inventory', 'error');
      }
    });
  });

  tbody.querySelectorAll('.inv-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0');
      if (!id || !confirm('Remove this item from inventory?')) return;
      try {
        await fetch(`/api/merchants/inventory/${id}`, { method: 'DELETE' });
        if (selectedTemplateId) await loadMerchantData(selectedTemplateId);
        showToast('Item removed from inventory', 'success');
      } catch (error) {
        showToast('Failed to remove item', 'error');
      }
    });
  });
}

async function addMerchantItem(): Promise<void> {
  if (!selectedTemplateId) return;
  const select = getElement<HTMLSelectElement>('merchant-add-item-select');
  if (!select || !select.value) {
    showToast('Select an item to add', 'error');
    return;
  }
  const itemTemplateId = parseInt(select.value);
  try {
    const res = await fetch(`/api/merchants/${selectedTemplateId}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemTemplateId, maxStock: 10, restockChance: 100 }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Failed to add item', 'error');
      return;
    }
    await loadMerchantData(selectedTemplateId);
    select.value = '';
    showToast('Item added to inventory', 'success');
  } catch (error) {
    showToast('Failed to add item', 'error');
  }
}

function renderMerchantResponses(): void {
  const tbody = document.getElementById('merchant-responses-body');
  const hint = document.getElementById('no-responses-hint');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (hint) hint.style.display = merchantResponses.length === 0 ? 'block' : 'none';

  for (const resp of merchantResponses) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(resp.triggerKeywords.join(', '))}</td>
      <td>${escapeHtml(resp.response)}</td>
      <td><button type="button" class="btn-small btn-danger resp-delete" data-id="${resp.id}">X</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.resp-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0');
      if (!id || !confirm('Delete this response?')) return;
      try {
        await fetch(`/api/merchants/responses/${id}`, { method: 'DELETE' });
        if (selectedTemplateId) await loadMerchantData(selectedTemplateId);
        showToast('Response deleted', 'success');
      } catch (error) {
        showToast('Failed to delete response', 'error');
      }
    });
  });
}

async function addMerchantResponse(): Promise<void> {
  if (!selectedTemplateId) return;
  const keywordsInput = getElement<HTMLInputElement>('response-keywords');
  const textInput = getElement<HTMLInputElement>('response-text');
  if (!keywordsInput?.value || !textInput?.value) {
    showToast('Keywords and response text are required', 'error');
    return;
  }
  const triggerKeywords = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
  if (triggerKeywords.length === 0) {
    showToast('At least one keyword is required', 'error');
    return;
  }
  try {
    const res = await fetch(`/api/merchants/${selectedTemplateId}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerKeywords, response: textInput.value }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Failed to add response', 'error');
      return;
    }
    keywordsInput.value = '';
    textInput.value = '';
    await loadMerchantData(selectedTemplateId);
    showToast('Response added', 'success');
  } catch (error) {
    showToast('Failed to add response', 'error');
  }
}

async function testPrice(): Promise<void> {
  const baseValue = parseInt(getElement<HTMLInputElement>('test-base-value')?.value || '100');
  const factionRep = parseInt(getElement<HTMLInputElement>('test-faction-rep')?.value || '0');
  const charisma = parseInt(getElement<HTMLInputElement>('test-charisma')?.value || '50');
  const haggleRep = parseInt(getElement<HTMLInputElement>('test-haggle-rep')?.value || '0');
  const resultDiv = document.getElementById('price-test-result');
  if (!resultDiv) return;

  try {
    const res = await fetch('/api/merchants/test-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseValue, factionRep, charisma, haggleRep }),
    });
    const data = await res.json();
    if (data.success) {
      const buyStr = data.buy.refused ? 'REFUSED' : `${data.buy.price} copper`;
      const sellStr = data.sell.refused ? 'REFUSED' : `${data.sell.price} copper`;
      resultDiv.textContent = `Buy: ${buyStr} | Sell: ${sellStr}`;
    } else {
      resultDiv.textContent = 'Error calculating price';
    }
  } catch (error) {
    resultDiv.textContent = 'Error calculating price';
  }
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

  await Promise.all([fetchTemplates(), fetchDropTables(), fetchFactions(), fetchItemTemplates()]);
  setupTabs();

  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`Element #${id} not found for event listener`);
  };

  // CRUD
  addListener('new-npc-btn', 'click', createTemplate);
  addListener('npc-form', 'submit', (e) => {
    e.preventDefault();
    saveTemplate();
  });
  addListener('delete-npc-btn', 'click', deleteTemplate);
  addListener('duplicate-npc-btn', 'click', duplicateTemplate);

  // Search
  addListener('search-input', 'input', renderTemplateList);

  // Attacks
  addListener('add-attack-btn', 'click', addAttack);

  // Import/Export
  addListener('import-btn', 'click', showImportModal);
  addListener('export-btn', 'click', exportNpcs);
  addListener('close-import-modal', 'click', hideImportModal);
  addListener('do-import-btn', 'click', doImport);
  addListener('import-modal', 'click', (e) => {
    if (e.target === e.currentTarget) hideImportModal();
  });

  // Merchant tab
  addListener('merchant-add-item-btn', 'click', addMerchantItem);
  addListener('merchant-add-response-btn', 'click', addMerchantResponse);
  addListener('test-price-btn', 'click', testPrice);
  const merchantEnabledCheckbox = document.getElementById('npc-merchant-enabled') as HTMLInputElement;
  if (merchantEnabledCheckbox) {
    merchantEnabledCheckbox.addEventListener('change', () => {
      toggleMerchantSection(merchantEnabledCheckbox.checked);
      if (merchantEnabledCheckbox.checked && selectedTemplateId) {
        loadMerchantData(selectedTemplateId);
      }
    });
  }

  // Spawn
  addListener('spawn-btn', 'click', spawnNpc);

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

  // Live preview updates when any form input changes
  document.getElementById('npc-form')?.addEventListener('input', updatePreview);
  document.getElementById('npc-form')?.addEventListener('change', updatePreview);
});

})();
