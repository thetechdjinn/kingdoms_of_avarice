// ============================================================================
// PROGRESSION EDITOR
// Editor UI for classes, races, abilities, talents, and game events
// ============================================================================

import {
  ClassDefinition,
  RaceDefinition,
  AbilityDefinition,
  TalentDefinition,
  GameEvent,
} from '@koa/shared';

(function() {

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

interface ClassAbilityMapping {
  class_id: string;
  ability_id: string;
  required_level: number;
  auto_learn: boolean;
  training_cost?: number;
}

// State
let currentUser: AuthInfo | null = null;
let currentTab = 'classes';
let classes: ClassDefinition[] = [];
let races: RaceDefinition[] = [];
let abilities: AbilityDefinition[] = [];
let talents: TalentDefinition[] = [];
let events: GameEvent[] = [];
let selectedId: string | null = null;
let selectedType: string | null = null;
let classAbilities: ClassAbilityMapping[] = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const authenticated = await checkAuth();
  if (!authenticated) return;

  setupEventListeners();
  await loadAllData();
  showTab('classes');
});

async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me');
    const data: AuthInfo = await response.json();
    currentUser = data;

    if (!data.authenticated) {
      // Redirect to login
      window.location.href = '/';
      return false;
    }

    const roles = data.roles || [];
    if (!roles.includes('developer') && !roles.includes('admin')) {
      // Redirect to game - no access
      window.location.href = '/';
      return false;
    }

    const navUsername = document.getElementById('nav-username');
    if (navUsername) {
      navUsername.textContent = data.username || 'User';
    }

    return true;
  } catch (error) {
    console.error('Auth check failed:', error);
    // Redirect to login on auth error
    window.location.href = '/';
    return false;
  }
}

async function handleLogout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners(): void {
  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

  // User dropdown
  const navUserBtn = document.getElementById('nav-username');
  const userMenu = navUserBtn?.closest('.nav-user-menu');
  navUserBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu?.classList.toggle('open');
  });
  document.addEventListener('click', () => {
    userMenu?.classList.remove('open');
  });

  // Main tab navigation
  document.querySelectorAll('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) showTab(tab);
    });
  });

  // New entity buttons
  document.getElementById('new-class-btn')?.addEventListener('click', () => showNewForm('class'));
  document.getElementById('new-race-btn')?.addEventListener('click', () => showNewForm('race'));
  document.getElementById('new-ability-btn')?.addEventListener('click', () => showNewForm('ability'));
  document.getElementById('new-talent-btn')?.addEventListener('click', () => showNewForm('talent'));
  document.getElementById('new-event-btn')?.addEventListener('click', () => showNewForm('event'));

  // Form submissions
  document.getElementById('class-form')?.addEventListener('submit', handleClassSubmit);
  document.getElementById('race-form')?.addEventListener('submit', handleRaceSubmit);
  document.getElementById('ability-form')?.addEventListener('submit', handleAbilitySubmit);
  document.getElementById('talent-form')?.addEventListener('submit', handleTalentSubmit);
  document.getElementById('event-form')?.addEventListener('submit', handleEventSubmit);

  // Delete buttons
  document.getElementById('delete-class-btn')?.addEventListener('click', () => handleDelete('class'));
  document.getElementById('delete-race-btn')?.addEventListener('click', () => handleDelete('race'));
  document.getElementById('delete-ability-btn')?.addEventListener('click', () => handleDelete('ability'));
  document.getElementById('delete-talent-btn')?.addEventListener('click', () => handleDelete('talent'));
  document.getElementById('delete-event-btn')?.addEventListener('click', () => handleDelete('event'));

  // Filters
  document.getElementById('ability-type-filter')?.addEventListener('change', renderAbilityList);
  document.getElementById('talent-class-filter')?.addEventListener('change', renderTalentList);

  // Class ability management
  document.getElementById('add-class-ability-btn')?.addEventListener('click', handleAddClassAbility);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadAllData(): Promise<void> {
  await Promise.all([
    loadClasses(),
    loadRaces(),
    loadAbilities(),
    loadTalents(),
    loadEvents(),
  ]);
}

async function loadClasses(): Promise<void> {
  try {
    const response = await fetch('/api/progression/classes');
    const data = await response.json();
    if (data.success && Array.isArray(data.classes)) {
      classes = data.classes;
      renderClassList();
      populateClassDropdowns();
    }
  } catch (error) {
    console.error('Failed to load classes:', error);
  }
}

async function loadRaces(): Promise<void> {
  try {
    const response = await fetch('/api/progression/races');
    const data = await response.json();
    if (data.success && Array.isArray(data.races)) {
      races = data.races;
      renderRaceList();
    }
  } catch (error) {
    console.error('Failed to load races:', error);
  }
}

async function loadAbilities(): Promise<void> {
  try {
    const response = await fetch('/api/progression/abilities');
    const data = await response.json();
    if (data.success && Array.isArray(data.abilities)) {
      abilities = data.abilities;
      renderAbilityList();
      populateAbilityDropdowns();
    }
  } catch (error) {
    console.error('Failed to load abilities:', error);
  }
}

async function loadTalents(): Promise<void> {
  try {
    const response = await fetch('/api/progression/talents');
    const data = await response.json();
    if (data.success && Array.isArray(data.talents)) {
      talents = data.talents;
      renderTalentList();
    }
  } catch (error) {
    console.error('Failed to load talents:', error);
  }
}

async function loadEvents(): Promise<void> {
  try {
    const response = await fetch('/api/progression/events');
    const data = await response.json();
    if (data.success && Array.isArray(data.events)) {
      events = data.events;
      renderEventList();
    }
  } catch (error) {
    console.error('Failed to load events:', error);
  }
}

async function loadClassAbilities(classId: string): Promise<void> {
  try {
    const response = await fetch(`/api/progression/classes/${classId}/abilities`);
    const data = await response.json();
    if (data.success && Array.isArray(data.abilities)) {
      classAbilities = data.abilities;
      renderClassAbilities();
    }
  } catch (error) {
    console.error('Failed to load class abilities:', error);
  }
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

function showTab(tab: string): void {
  currentTab = tab;
  selectedId = null;
  selectedType = null;

  // Update main tab buttons
  document.querySelectorAll('.main-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });

  // Update tab pages
  document.querySelectorAll('.tab-page').forEach(page => {
    page.classList.toggle('active', page.id === `page-${tab}`);
  });

  // Hide all forms in the active tab, show no-selection
  hideAllForms();
  const noSelection = document.getElementById(`${tab}-no-selection`);
  if (noSelection) noSelection.style.display = 'flex';
}

function hideAllForms(): void {
  document.querySelectorAll('.entity-form').forEach(form => {
    (form as HTMLElement).style.display = 'none';
  });
}

// ============================================================================
// LIST RENDERING
// ============================================================================

function renderClassList(): void {
  const list = document.getElementById('class-list');
  if (!list) return;

  list.innerHTML = classes.map(cls => `
    <li class="entity-item ${selectedId === cls.class_id && selectedType === 'class' ? 'selected' : ''}" 
        data-id="${escapeHtml(cls.class_id)}" data-type="class">
      <span class="entity-name">${escapeHtml(cls.display_name)}</span>
      <span class="entity-meta">${cls.essence_multiplier}x</span>
    </li>
  `).join('');

  list.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      if (id) selectClass(id);
    });
  });
}

function renderRaceList(): void {
  const list = document.getElementById('race-list');
  if (!list) return;

  list.innerHTML = races.map(race => `
    <li class="entity-item ${selectedId === race.race_id && selectedType === 'race' ? 'selected' : ''}" 
        data-id="${escapeHtml(race.race_id)}" data-type="race">
      <span class="entity-name">${escapeHtml(race.display_name)}</span>
      <span class="entity-meta">${race.playable ? '' : 'NPC'}</span>
    </li>
  `).join('');

  list.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      if (id) selectRace(id);
    });
  });
}

function renderAbilityList(): void {
  const list = document.getElementById('ability-list');
  if (!list) return;

  const filter = (document.getElementById('ability-type-filter') as HTMLSelectElement)?.value;
  const filtered = filter ? abilities.filter(a => a.ability_type === filter) : abilities;

  list.innerHTML = filtered.map(ability => `
    <li class="entity-item ${selectedId === ability.ability_id && selectedType === 'ability' ? 'selected' : ''}" 
        data-id="${escapeHtml(ability.ability_id)}" data-type="ability">
      <span class="entity-name">${escapeHtml(ability.display_name)}</span>
      <span class="entity-meta">${ability.ability_type}</span>
    </li>
  `).join('');

  list.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      if (id) selectAbility(id);
    });
  });
}

function renderTalentList(): void {
  const list = document.getElementById('talent-list');
  if (!list) return;

  const filter = (document.getElementById('talent-class-filter') as HTMLSelectElement)?.value;
  const filtered = filter ? talents.filter(t => t.class_restriction === filter) : talents;

  list.innerHTML = filtered.map(talent => `
    <li class="entity-item ${selectedId === talent.talent_id && selectedType === 'talent' ? 'selected' : ''}" 
        data-id="${escapeHtml(talent.talent_id)}" data-type="talent">
      <span class="entity-name">${escapeHtml(talent.display_name)}</span>
      <span class="entity-meta">${talent.essence_cost} ess</span>
    </li>
  `).join('');

  list.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      if (id) selectTalent(id);
    });
  });
}

function renderEventList(): void {
  const list = document.getElementById('event-list');
  if (!list) return;

  list.innerHTML = events.map(event => `
    <li class="entity-item ${selectedId === event.event_id && selectedType === 'event' ? 'selected' : ''}" 
        data-id="${escapeHtml(event.event_id)}" data-type="event">
      <span class="entity-name">${escapeHtml(event.display_name || event.event_id)}</span>
      <span class="entity-meta">${event.base_essence_value} ess</span>
    </li>
  `).join('');

  list.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      if (id) selectEvent(id);
    });
  });
}

function renderClassAbilities(): void {
  const list = document.getElementById('class-abilities-list');
  if (!list) return;

  if (classAbilities.length === 0) {
    list.innerHTML = '<p class="hint">No abilities assigned to this class.</p>';
    return;
  }

  list.innerHTML = classAbilities.map(mapping => {
    const ability = abilities.find(a => a.ability_id === mapping.ability_id);
    return `
      <div class="class-ability-item">
        <span class="ability-name">${escapeHtml(ability?.display_name || mapping.ability_id)}</span>
        <span class="ability-level">Lv${mapping.required_level}</span>
        <span class="ability-auto">${mapping.auto_learn ? 'Auto' : ''}</span>
        <button type="button" class="btn-small btn-danger remove-ability-btn" data-ability="${escapeHtml(mapping.ability_id)}">×</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.remove-ability-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const abilityId = btn.getAttribute('data-ability');
      if (abilityId && selectedId) {
        await handleRemoveClassAbility(abilityId);
      }
    });
  });
}

// ============================================================================
// DROPDOWN POPULATION
// ============================================================================

function populateClassDropdowns(): void {
  const talentClassFilter = document.getElementById('talent-class-filter') as HTMLSelectElement;
  const talentClass = document.getElementById('talent-class') as HTMLSelectElement;

  const options = '<option value="">All Classes</option>' + 
    classes.map(c => `<option value="${escapeHtml(c.class_id)}">${escapeHtml(c.display_name)}</option>`).join('');

  if (talentClassFilter) talentClassFilter.innerHTML = options;
  if (talentClass) talentClass.innerHTML = options.replace('All Classes', 'General (All Classes)');
}

function populateAbilityDropdowns(): void {
  const addAbilitySelect = document.getElementById('add-class-ability-select') as HTMLSelectElement;
  const talentGrants = document.getElementById('talent-grants') as HTMLSelectElement;

  const options = '<option value="">Select ability...</option>' + 
    abilities.map(a => `<option value="${escapeHtml(a.ability_id)}">${escapeHtml(a.display_name)}</option>`).join('');

  if (addAbilitySelect) addAbilitySelect.innerHTML = options;
  if (talentGrants) talentGrants.innerHTML = options.replace('Select ability...', 'None');
}

// ============================================================================
// SELECTION HANDLERS
// ============================================================================

function selectClass(classId: string): void {
  const cls = classes.find(c => c.class_id === classId);
  if (!cls) return;

  selectedId = classId;
  selectedType = 'class';
  hideAllForms();
  const noSelection = document.getElementById('class-no-selection');
  if (noSelection) noSelection.style.display = 'none';

  const form = document.getElementById('class-form') as HTMLFormElement;
  form.style.display = 'block';

  (document.getElementById('class-form-title') as HTMLElement).textContent = 'Edit Class';
  (document.getElementById('class-id') as HTMLInputElement).value = cls.class_id;
  (document.getElementById('class-id') as HTMLInputElement).readOnly = true;
  (document.getElementById('class-name') as HTMLInputElement).value = cls.display_name;
  (document.getElementById('class-description') as HTMLTextAreaElement).value = cls.description || '';
  (document.getElementById('class-multiplier') as HTMLInputElement).value = String(cls.essence_multiplier);
  (document.getElementById('class-resource') as HTMLSelectElement).value = cls.resource_type || '';
  (document.getElementById('class-playable') as HTMLInputElement).checked = cls.playable !== false;
  (document.getElementById('class-tags') as HTMLInputElement).value = cls.subscribed_tags.join(', ');
  (document.getElementById('class-str') as HTMLInputElement).value = String(cls.base_stats?.strength || 10);
  (document.getElementById('class-dex') as HTMLInputElement).value = String(cls.base_stats?.dexterity || 10);
  (document.getElementById('class-int') as HTMLInputElement).value = String(cls.base_stats?.intelligence || 10);
  (document.getElementById('class-wis') as HTMLInputElement).value = String(cls.base_stats?.wisdom || 10);
  (document.getElementById('class-con') as HTMLInputElement).value = String(cls.base_stats?.constitution || 10);
  (document.getElementById('class-cha') as HTMLInputElement).value = String(cls.base_stats?.charm || 10);

  loadClassAbilities(classId);
  renderClassList();
}

function selectRace(raceId: string): void {
  const race = races.find(r => r.race_id === raceId);
  if (!race) return;

  selectedId = raceId;
  selectedType = 'race';
  hideAllForms();
  const noSelection = document.getElementById('race-no-selection');
  if (noSelection) noSelection.style.display = 'none';

  const form = document.getElementById('race-form') as HTMLFormElement;
  form.style.display = 'block';

  (document.getElementById('race-form-title') as HTMLElement).textContent = 'Edit Race';
  (document.getElementById('race-id') as HTMLInputElement).value = race.race_id;
  (document.getElementById('race-id') as HTMLInputElement).readOnly = true;
  (document.getElementById('race-name') as HTMLInputElement).value = race.display_name;
  (document.getElementById('race-description') as HTMLTextAreaElement).value = race.description || '';
  (document.getElementById('race-playable') as HTMLInputElement).checked = race.playable !== false;
  (document.getElementById('race-str') as HTMLInputElement).value = String(race.stat_modifiers?.strength || 0);
  (document.getElementById('race-dex') as HTMLInputElement).value = String(race.stat_modifiers?.dexterity || 0);
  (document.getElementById('race-int') as HTMLInputElement).value = String(race.stat_modifiers?.intelligence || 0);
  (document.getElementById('race-wis') as HTMLInputElement).value = String(race.stat_modifiers?.wisdom || 0);
  (document.getElementById('race-con') as HTMLInputElement).value = String(race.stat_modifiers?.constitution || 0);
  (document.getElementById('race-cha') as HTMLInputElement).value = String(race.stat_modifiers?.charm || 0);
  (document.getElementById('race-traits') as HTMLInputElement).value = race.traits?.join(', ') || '';
  (document.getElementById('race-allowed-classes') as HTMLInputElement).value = race.allowed_classes?.join(', ') || '';

  renderRaceList();
}

function selectAbility(abilityId: string): void {
  const ability = abilities.find(a => a.ability_id === abilityId);
  if (!ability) return;

  selectedId = abilityId;
  selectedType = 'ability';
  hideAllForms();
  const noSelection = document.getElementById('ability-no-selection');
  if (noSelection) noSelection.style.display = 'none';

  const form = document.getElementById('ability-form') as HTMLFormElement;
  form.style.display = 'block';

  (document.getElementById('ability-form-title') as HTMLElement).textContent = 'Edit Ability';
  (document.getElementById('ability-id') as HTMLInputElement).value = ability.ability_id;
  (document.getElementById('ability-id') as HTMLInputElement).readOnly = true;
  (document.getElementById('ability-name') as HTMLInputElement).value = ability.display_name;
  (document.getElementById('ability-type') as HTMLSelectElement).value = ability.ability_type;
  (document.getElementById('ability-description') as HTMLTextAreaElement).value = ability.description || '';
  (document.getElementById('ability-resource-type') as HTMLSelectElement).value = ability.resource_type || '';
  (document.getElementById('ability-cost') as HTMLInputElement).value = String(ability.resource_cost || 0);
  (document.getElementById('ability-cooldown') as HTMLInputElement).value = String(ability.cooldown || 0);
  (document.getElementById('ability-tags') as HTMLInputElement).value = ability.emitted_tags?.join(', ') || '';

  renderAbilityList();
}

function selectTalent(talentId: string): void {
  const talent = talents.find(t => t.talent_id === talentId);
  if (!talent) return;

  selectedId = talentId;
  selectedType = 'talent';
  hideAllForms();
  const noSelection = document.getElementById('talent-no-selection');
  if (noSelection) noSelection.style.display = 'none';

  const form = document.getElementById('talent-form') as HTMLFormElement;
  form.style.display = 'block';

  (document.getElementById('talent-form-title') as HTMLElement).textContent = 'Edit Talent';
  (document.getElementById('talent-id') as HTMLInputElement).value = talent.talent_id;
  (document.getElementById('talent-id') as HTMLInputElement).readOnly = true;
  (document.getElementById('talent-name') as HTMLInputElement).value = talent.display_name;
  (document.getElementById('talent-description') as HTMLTextAreaElement).value = talent.description || '';
  (document.getElementById('talent-class') as HTMLSelectElement).value = talent.class_restriction || '';
  (document.getElementById('talent-cost') as HTMLInputElement).value = String(talent.essence_cost);
  (document.getElementById('talent-level') as HTMLInputElement).value = String(talent.prerequisite_level || 1);
  (document.getElementById('talent-prereqs') as HTMLInputElement).value = talent.prerequisite_talents?.join(', ') || '';
  (document.getElementById('talent-grants') as HTMLSelectElement).value = talent.grants_ability || '';

  renderTalentList();
}

function selectEvent(eventId: string): void {
  const event = events.find(e => e.event_id === eventId);
  if (!event) return;

  selectedId = eventId;
  selectedType = 'event';
  hideAllForms();
  const noSelection = document.getElementById('event-no-selection');
  if (noSelection) noSelection.style.display = 'none';

  const form = document.getElementById('event-form') as HTMLFormElement;
  form.style.display = 'block';

  (document.getElementById('event-form-title') as HTMLElement).textContent = 'Edit Game Event';
  (document.getElementById('event-id') as HTMLInputElement).value = event.event_id;
  (document.getElementById('event-id') as HTMLInputElement).readOnly = true;
  (document.getElementById('event-name') as HTMLInputElement).value = event.display_name || event.event_id;
  (document.getElementById('event-essence') as HTMLInputElement).value = String(event.base_essence_value);
  (document.getElementById('event-xp') as HTMLInputElement).value = String(event.base_xp_value || 0);
  (document.getElementById('event-tags') as HTMLInputElement).value = event.emitted_tags.join(', ');

  renderEventList();
}

// ============================================================================
// NEW FORM HANDLERS
// ============================================================================

function showNewForm(type: string): void {
  selectedId = null;
  selectedType = type;
  hideAllForms();
  
  // Hide no-selection for this type
  const noSelection = document.getElementById(`${type}-no-selection`);
  if (noSelection) noSelection.style.display = 'none';

  const form = document.getElementById(`${type}-form`) as HTMLFormElement;
  if (!form) return;

  form.style.display = 'block';
  form.reset();

  const titleEl = document.getElementById(`${type}-form-title`);
  if (titleEl) titleEl.textContent = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  const idInput = document.getElementById(`${type}-id`) as HTMLInputElement;
  if (idInput) idInput.readOnly = false;

  // Reset class abilities list for new class
  if (type === 'class') {
    classAbilities = [];
    renderClassAbilities();
  }
}

// ============================================================================
// FORM SUBMISSION HANDLERS
// ============================================================================

async function handleClassSubmit(e: Event): Promise<void> {
  e.preventDefault();

  const classId = (document.getElementById('class-id') as HTMLInputElement).value;
  const data: Partial<ClassDefinition> = {
    class_id: classId,
    display_name: (document.getElementById('class-name') as HTMLInputElement).value,
    description: (document.getElementById('class-description') as HTMLTextAreaElement).value || undefined,
    essence_multiplier: parseFloat((document.getElementById('class-multiplier') as HTMLInputElement).value) || 1.0,
    resource_type: (document.getElementById('class-resource') as HTMLSelectElement).value || undefined,
    playable: (document.getElementById('class-playable') as HTMLInputElement).checked,
    subscribed_tags: (document.getElementById('class-tags') as HTMLInputElement).value.split(',').map(t => t.trim()).filter(Boolean),
    base_stats: {
      strength: Number((document.getElementById('class-str') as HTMLInputElement).value) || 0,
      dexterity: Number((document.getElementById('class-dex') as HTMLInputElement).value) || 0,
      intelligence: Number((document.getElementById('class-int') as HTMLInputElement).value) || 0,
      wisdom: Number((document.getElementById('class-wis') as HTMLInputElement).value) || 0,
      constitution: Number((document.getElementById('class-con') as HTMLInputElement).value) || 0,
      charm: Number((document.getElementById('class-cha') as HTMLInputElement).value) || 0,
    },
  };

  try {
    const isNew = !selectedId;
    const url = isNew ? '/api/progression/classes' : `/api/progression/classes/${classId}`;
    const method = isNew ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (result.success) {
      await loadClasses();
      selectClass(classId);
    } else {
      alert('Failed to save class: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to save class:', error);
    alert('Failed to save class');
  }
}

async function handleRaceSubmit(e: Event): Promise<void> {
  e.preventDefault();

  const raceIdEl = document.getElementById('race-id') as HTMLInputElement | null;
  const raceNameEl = document.getElementById('race-name') as HTMLInputElement | null;
  const raceDescEl = document.getElementById('race-description') as HTMLTextAreaElement | null;
  const racePlayableEl = document.getElementById('race-playable') as HTMLInputElement | null;
  const raceTraitsEl = document.getElementById('race-traits') as HTMLInputElement | null;
  const raceAllowedEl = document.getElementById('race-allowed-classes') as HTMLInputElement | null;

  if (!raceIdEl || !raceNameEl) {
    alert('Required form elements are missing');
    return;
  }

  const raceId = raceIdEl.value.trim();
  if (!raceId) {
    alert('Race ID is required');
    return;
  }

  const data: Partial<RaceDefinition> = {
    race_id: raceId,
    display_name: raceNameEl.value,
    description: raceDescEl?.value || undefined,
    playable: racePlayableEl?.checked ?? false,
    stat_modifiers: {
      strength: Number((document.getElementById('race-str') as HTMLInputElement | null)?.value) || 0,
      dexterity: Number((document.getElementById('race-dex') as HTMLInputElement | null)?.value) || 0,
      intelligence: Number((document.getElementById('race-int') as HTMLInputElement | null)?.value) || 0,
      wisdom: Number((document.getElementById('race-wis') as HTMLInputElement | null)?.value) || 0,
      constitution: Number((document.getElementById('race-con') as HTMLInputElement | null)?.value) || 0,
      charm: Number((document.getElementById('race-cha') as HTMLInputElement | null)?.value) || 0,
    },
    traits: raceTraitsEl?.value.split(',').map(t => t.trim()).filter(Boolean) ?? [],
    allowed_classes: raceAllowedEl?.value.split(',').map(t => t.trim()).filter(Boolean) ?? [],
  };

  if (data.allowed_classes?.length === 0) delete data.allowed_classes;

  try {
    const isNew = !selectedId;
    const url = isNew ? '/api/progression/races' : `/api/progression/races/${raceId}`;
    const method = isNew ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (result.success) {
      await loadRaces();
      selectRace(raceId);
    } else {
      alert('Failed to save race: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to save race:', error);
    alert('Failed to save race');
  }
}

async function handleAbilitySubmit(e: Event): Promise<void> {
  e.preventDefault();

  const abilityIdEl = document.getElementById('ability-id') as HTMLInputElement | null;
  const abilityNameEl = document.getElementById('ability-name') as HTMLInputElement | null;
  const abilityTypeEl = document.getElementById('ability-type') as HTMLSelectElement | null;
  const abilityDescEl = document.getElementById('ability-description') as HTMLTextAreaElement | null;
  const abilityResourceTypeEl = document.getElementById('ability-resource-type') as HTMLSelectElement | null;
  const abilityCostEl = document.getElementById('ability-cost') as HTMLInputElement | null;
  const abilityCooldownEl = document.getElementById('ability-cooldown') as HTMLInputElement | null;
  const abilityTagsEl = document.getElementById('ability-tags') as HTMLInputElement | null;

  if (!abilityIdEl || !abilityNameEl || !abilityTypeEl) {
    alert('Required form elements are missing');
    return;
  }

  const abilityId = abilityIdEl.value.trim();
  if (!abilityId) {
    alert('Ability ID is required');
    return;
  }

  const data: Partial<AbilityDefinition> = {
    ability_id: abilityId,
    display_name: abilityNameEl.value,
    ability_type: abilityTypeEl.value as AbilityDefinition['ability_type'],
    description: abilityDescEl?.value || undefined,
    resource_type: abilityResourceTypeEl?.value || undefined,
    resource_cost: Number(abilityCostEl?.value) || 0,
    cooldown: Number(abilityCooldownEl?.value) || 0,
    emitted_tags: abilityTagsEl?.value.split(',').map(t => t.trim()).filter(Boolean) ?? [],
  };

  try {
    const isNew = !selectedId;
    const url = isNew ? '/api/progression/abilities' : `/api/progression/abilities/${abilityId}`;
    const method = isNew ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (result.success) {
      await loadAbilities();
      selectAbility(abilityId);
    } else {
      alert('Failed to save ability: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to save ability:', error);
    alert('Failed to save ability');
  }
}

async function handleTalentSubmit(e: Event): Promise<void> {
  e.preventDefault();

  const talentIdEl = document.getElementById('talent-id') as HTMLInputElement | null;
  const talentNameEl = document.getElementById('talent-name') as HTMLInputElement | null;
  const talentDescEl = document.getElementById('talent-description') as HTMLTextAreaElement | null;
  const talentClassEl = document.getElementById('talent-class') as HTMLSelectElement | null;
  const talentCostEl = document.getElementById('talent-cost') as HTMLInputElement | null;
  const talentLevelEl = document.getElementById('talent-level') as HTMLInputElement | null;
  const talentPrereqsEl = document.getElementById('talent-prereqs') as HTMLInputElement | null;
  const talentGrantsEl = document.getElementById('talent-grants') as HTMLSelectElement | null;

  if (!talentIdEl || !talentNameEl) {
    alert('Required form elements are missing');
    return;
  }

  const talentId = talentIdEl.value.trim();
  if (!talentId) {
    alert('Talent ID is required');
    return;
  }
  const data: Partial<TalentDefinition> = {
    talent_id: talentId,
    display_name: talentNameEl.value,
    description: talentDescEl?.value || undefined,
    class_restriction: talentClassEl?.value || undefined,
    essence_cost: Number(talentCostEl?.value) || 100,
    prerequisite_level: Number(talentLevelEl?.value) || 1,
    prerequisite_talents: talentPrereqsEl?.value.split(',').map(t => t.trim()).filter(Boolean) ?? [],
    grants_ability: talentGrantsEl?.value || undefined,
  };

  if (data.prerequisite_talents?.length === 0) delete data.prerequisite_talents;

  try {
    const isNew = !selectedId;
    const url = isNew ? '/api/progression/talents' : `/api/progression/talents/${talentId}`;
    const method = isNew ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (result.success) {
      await loadTalents();
      selectTalent(talentId);
    } else {
      alert('Failed to save talent: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to save talent:', error);
    alert('Failed to save talent');
  }
}

async function handleEventSubmit(e: Event): Promise<void> {
  e.preventDefault();

  const eventIdEl = document.getElementById('event-id') as HTMLInputElement | null;
  const eventNameEl = document.getElementById('event-name') as HTMLInputElement | null;
  const eventEssenceEl = document.getElementById('event-essence') as HTMLInputElement | null;
  const eventXpEl = document.getElementById('event-xp') as HTMLInputElement | null;
  const eventTagsEl = document.getElementById('event-tags') as HTMLInputElement | null;

  if (!eventIdEl || !eventTagsEl) {
    alert('Required form elements are missing');
    return;
  }

  const eventId = eventIdEl.value.trim();
  if (!eventId) {
    alert('Event ID is required');
    return;
  }
  const data: Partial<GameEvent> = {
    event_id: eventId,
    display_name: eventNameEl?.value || undefined,
    base_essence_value: Number(eventEssenceEl?.value) || 0,
    base_xp_value: Number(eventXpEl?.value) || 0,
    emitted_tags: eventTagsEl?.value.split(',').map(t => t.trim()).filter(Boolean) ?? [],
  };

  try {
    const isNew = !selectedId;
    const url = isNew ? '/api/progression/events' : `/api/progression/events/${eventId}`;
    const method = isNew ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (result.success) {
      await loadEvents();
      selectEvent(eventId);
    } else {
      alert('Failed to save event: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to save event:', error);
    alert('Failed to save event');
  }
}

// ============================================================================
// DELETE HANDLERS
// ============================================================================

async function handleDelete(type: string): Promise<void> {
  if (!selectedId) return;

  const confirmed = confirm(`Are you sure you want to delete this ${type}?`);
  if (!confirmed) return;

  // Map singular type to correct API plural endpoint
  const pluralMap: Record<string, string> = {
    'class': 'classes',
    'race': 'races',
    'ability': 'abilities',
    'talent': 'talents',
    'event': 'events',
  };
  const endpoint = pluralMap[type] || `${type}s`;

  try {
    const response = await fetch(`/api/progression/${endpoint}/${selectedId}`, {
      method: 'DELETE',
    });

    const result = await response.json();
    if (result.success) {
      selectedId = null;
      selectedType = null;
      hideAllForms();
      document.getElementById('no-selection')!.style.display = 'block';

      switch (type) {
        case 'class': await loadClasses(); break;
        case 'race': await loadRaces(); break;
        case 'ability': await loadAbilities(); break;
        case 'talent': await loadTalents(); break;
        case 'event': await loadEvents(); break;
      }
    } else {
      alert('Failed to delete: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to delete:', error);
    alert('Failed to delete');
  }
}

// ============================================================================
// CLASS ABILITY HANDLERS
// ============================================================================

async function handleAddClassAbility(): Promise<void> {
  if (!selectedId || selectedType !== 'class') return;

  const abilitySelectEl = document.getElementById('add-class-ability-select') as HTMLSelectElement | null;
  const levelEl = document.getElementById('add-class-ability-level') as HTMLInputElement | null;
  const autoLearnEl = document.getElementById('add-class-ability-auto') as HTMLInputElement | null;

  if (!abilitySelectEl) {
    alert('Required form elements are missing');
    return;
  }

  const abilityId = abilitySelectEl.value;
  const levelValue = Number(levelEl?.value);
  const level = isNaN(levelValue) || levelValue < 1 ? 1 : levelValue;
  const autoLearn = autoLearnEl?.checked ?? false;

  if (!abilityId) {
    alert('Please select an ability');
    return;
  }

  try {
    const response = await fetch(`/api/progression/classes/${selectedId}/abilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ability_id: abilityId,
        required_level: level,
        auto_learn: autoLearn,
      }),
    });

    const result = await response.json();
    if (result.success) {
      await loadClassAbilities(selectedId);
      (document.getElementById('add-class-ability-select') as HTMLSelectElement).value = '';
    } else {
      alert('Failed to add ability: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to add class ability:', error);
    alert('Failed to add ability');
  }
}

async function handleRemoveClassAbility(abilityId: string): Promise<void> {
  if (!selectedId || selectedType !== 'class') return;

  try {
    const response = await fetch(`/api/progression/classes/${selectedId}/abilities/${abilityId}`, {
      method: 'DELETE',
    });

    const result = await response.json();
    if (result.success) {
      await loadClassAbilities(selectedId);
    } else {
      alert('Failed to remove ability: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to remove class ability:', error);
    alert('Failed to remove ability');
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text: string | null | undefined): string {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

})();
