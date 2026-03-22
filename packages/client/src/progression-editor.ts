// ============================================================================
// PROGRESSION EDITOR
// Editor UI for classes and races
// ============================================================================

import {
  ClassDefinition,
  RaceDefinition,
} from '@koa/shared';

(function() {

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

// State
let currentUser: AuthInfo | null = null;
let currentTab = 'classes';
let classes: ClassDefinition[] = [];
let races: RaceDefinition[] = [];
let selectedId: string | null = null;
let selectedType: string | null = null;

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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a stat value from form input, defaulting to 0 for empty or invalid values
 */
function parseStatValue(value: string): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

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

    // Show Admin dropdown if user is admin
    const isAdmin = roles.includes('admin');
    const adminDropdown = document.getElementById('nav-admin-dropdown');
    if (adminDropdown) {
      adminDropdown.style.display = isAdmin ? 'flex' : 'none';
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

  // Form submissions
  document.getElementById('class-form')?.addEventListener('submit', handleClassSubmit);
  document.getElementById('race-form')?.addEventListener('submit', handleRaceSubmit);

  // Delete buttons
  document.getElementById('delete-class-btn')?.addEventListener('click', () => handleDelete('class'));
  document.getElementById('delete-race-btn')?.addEventListener('click', () => handleDelete('race'));
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadAllData(): Promise<void> {
  await Promise.all([
    loadClasses(),
    loadRaces(),
  ]);
}

async function loadClasses(): Promise<void> {
  try {
    const response = await fetch('/api/progression/classes');
    const data = await response.json();
    if (data.success && Array.isArray(data.classes)) {
      classes = data.classes;
      renderClassList();
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
  (document.getElementById('class-combat-level') as HTMLInputElement).value = String(cls.combat_level ?? 3);
  (document.getElementById('class-magic-level') as HTMLInputElement).value = String(cls.magic_level ?? 0);
  (document.getElementById('class-magic-school') as HTMLSelectElement).value = cls.magic_school || '';
  const classTraits = cls.traits ?? [];
  (document.getElementById('class-stealth') as HTMLInputElement).checked = classTraits.includes('stealth');
  (document.getElementById('class-lockpicking') as HTMLInputElement).checked = classTraits.includes('lockpicking');
  (document.getElementById('class-traps') as HTMLInputElement).checked = classTraits.includes('traps');
  (document.getElementById('class-pickpocket') as HTMLInputElement).checked = classTraits.includes('pickpocket');
  (document.getElementById('class-crit-bonus') as HTMLInputElement).value = String(cls.crit_bonus ?? 0);
  (document.getElementById('class-dodge-bonus') as HTMLInputElement).value = String(cls.dodge_bonus ?? 0);
  const armorRestrictions = cls.armor_type_restrictions ?? [];
  (document.getElementById('class-armor-robe') as HTMLInputElement).checked = armorRestrictions.includes('robe');
  (document.getElementById('class-armor-leather') as HTMLInputElement).checked = armorRestrictions.includes('leather');
  (document.getElementById('class-armor-chainmail') as HTMLInputElement).checked = armorRestrictions.includes('chainmail');
  (document.getElementById('class-armor-scalemail') as HTMLInputElement).checked = armorRestrictions.includes('scalemail');
  (document.getElementById('class-armor-platemail') as HTMLInputElement).checked = armorRestrictions.includes('platemail');

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
  (document.getElementById('race-dodge-bonus') as HTMLInputElement).value = String(race.dodge_bonus ?? 0);

  // Load base_stats with min/max ranges
  const bs = race.base_stats as Record<string, { min: number; max: number }> | undefined;
  (document.getElementById('race-str-min') as HTMLInputElement).value = String(bs?.strength?.min ?? 40);
  (document.getElementById('race-str-max') as HTMLInputElement).value = String(bs?.strength?.max ?? 100);
  (document.getElementById('race-agi-min') as HTMLInputElement).value = String(bs?.agility?.min ?? 40);
  (document.getElementById('race-agi-max') as HTMLInputElement).value = String(bs?.agility?.max ?? 100);
  (document.getElementById('race-con-min') as HTMLInputElement).value = String(bs?.constitution?.min ?? 40);
  (document.getElementById('race-con-max') as HTMLInputElement).value = String(bs?.constitution?.max ?? 100);
  (document.getElementById('race-int-min') as HTMLInputElement).value = String(bs?.intellect?.min ?? 40);
  (document.getElementById('race-int-max') as HTMLInputElement).value = String(bs?.intellect?.max ?? 100);
  (document.getElementById('race-wis-min') as HTMLInputElement).value = String(bs?.wisdom?.min ?? 40);
  (document.getElementById('race-wis-max') as HTMLInputElement).value = String(bs?.wisdom?.max ?? 100);
  (document.getElementById('race-cha-min') as HTMLInputElement).value = String(bs?.charisma?.min ?? 40);
  (document.getElementById('race-cha-max') as HTMLInputElement).value = String(bs?.charisma?.max ?? 100);

  // Check for special ability traits
  const specialAbilityIds = ['stealth', 'lockpicking', 'see_hidden'];
  const hasSpecialAbility = (id: string): boolean => {
    if (!race.traits) return false;
    return race.traits.some(t => {
      if (typeof t === 'string') return t === id;
      return t.id === id && t.value;
    });
  };

  (document.getElementById('race-stealth') as HTMLInputElement).checked = hasSpecialAbility('stealth');
  (document.getElementById('race-lockpicking') as HTMLInputElement).checked = hasSpecialAbility('lockpicking');
  (document.getElementById('race-see-hidden') as HTMLInputElement).checked = hasSpecialAbility('see_hidden');

  // Format other traits for display (excluding special abilities)
  const otherTraits = race.traits?.filter(t => {
    const id = typeof t === 'string' ? t : t.id;
    return !specialAbilityIds.includes(id);
  }) || [];
  const traitsValue = otherTraits.map(t => typeof t === 'string' ? t : `${t.id}=${t.value}`).join(', ');
  (document.getElementById('race-traits') as HTMLInputElement).value = traitsValue;
  (document.getElementById('race-allowed-classes') as HTMLInputElement).value = race.allowed_classes?.join(', ') || '';

  renderRaceList();
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
}

// ============================================================================
// FORM SUBMISSION HANDLERS
// ============================================================================

async function handleClassSubmit(e: Event): Promise<void> {
  e.preventDefault();

  const classId = (document.getElementById('class-id') as HTMLInputElement).value;
  const magicSchool = (document.getElementById('class-magic-school') as HTMLSelectElement).value;
  const data: Partial<ClassDefinition> = {
    class_id: classId,
    display_name: (document.getElementById('class-name') as HTMLInputElement).value,
    description: (document.getElementById('class-description') as HTMLTextAreaElement).value || undefined,
    essence_multiplier: parseFloat((document.getElementById('class-multiplier') as HTMLInputElement).value) || 1.0,
    resource_type: (document.getElementById('class-resource') as HTMLSelectElement).value || 'none',
    playable: (document.getElementById('class-playable') as HTMLInputElement).checked,
    subscribed_tags: (document.getElementById('class-tags') as HTMLInputElement).value.split(',').map(t => t.trim()).filter(Boolean),
    combat_level: parseStatValue((document.getElementById('class-combat-level') as HTMLInputElement).value) || 3,
    magic_level: parseStatValue((document.getElementById('class-magic-level') as HTMLInputElement).value) || 0,
    magic_school: magicSchool || undefined,
    traits: (() => {
      // Start with existing traits that don't have UI checkboxes (preserve them)
      const knownCheckboxTraits = ['stealth', 'lockpicking', 'traps', 'pickpocket'];
      const existingClass = classes.find(c => c.class_id === classId);
      const preserved = (existingClass?.traits ?? []).filter(t => !knownCheckboxTraits.includes(t));
      // Add checkbox-controlled traits
      const checked = [
        (document.getElementById('class-stealth') as HTMLInputElement).checked ? 'stealth' : null,
        (document.getElementById('class-lockpicking') as HTMLInputElement).checked ? 'lockpicking' : null,
        (document.getElementById('class-traps') as HTMLInputElement).checked ? 'traps' : null,
        (document.getElementById('class-pickpocket') as HTMLInputElement).checked ? 'pickpocket' : null,
      ].filter((a): a is string => a !== null);
      return [...preserved, ...checked];
    })(),
    crit_bonus: parseStatValue((document.getElementById('class-crit-bonus') as HTMLInputElement).value) || 0,
    dodge_bonus: parseStatValue((document.getElementById('class-dodge-bonus') as HTMLInputElement).value) || 0,
    armor_type_restrictions: [
      (document.getElementById('class-armor-robe') as HTMLInputElement).checked ? 'robe' : null,
      (document.getElementById('class-armor-leather') as HTMLInputElement).checked ? 'leather' : null,
      (document.getElementById('class-armor-chainmail') as HTMLInputElement).checked ? 'chainmail' : null,
      (document.getElementById('class-armor-scalemail') as HTMLInputElement).checked ? 'scalemail' : null,
      (document.getElementById('class-armor-platemail') as HTMLInputElement).checked ? 'platemail' : null,
    ].filter((a): a is string => a !== null),
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
      showToast('Class saved successfully!', 'success');
    } else {
      showToast('Failed to save class: ' + (result.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Failed to save class:', error);
    showToast('Failed to save class', 'error');
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
    showToast('Required form elements are missing', 'error');
    return;
  }

  const raceId = raceIdEl.value.trim();
  if (!raceId) {
    showToast('Race ID is required', 'warning');
    return;
  }

  // Parse other traits - support both simple strings and id=value format
  const traitsRaw = raceTraitsEl?.value.split(',').map(t => t.trim()).filter(Boolean) ?? [];
  const otherTraits = traitsRaw.map(t => {
    if (t.includes('=')) {
      const [id, val] = t.split('=');
      const numVal = Number(val);
      return { id: id.trim(), value: isNaN(numVal) ? val.trim() === 'true' : numVal };
    }
    return t;
  });

  // Add special ability traits from checkboxes (boolean traits use true, not 1)
  const specialAbilityTraits: Array<{ id: string; value: boolean | number }> = [];
  if ((document.getElementById('race-stealth') as HTMLInputElement).checked) {
    specialAbilityTraits.push({ id: 'stealth', value: true });
  }
  if ((document.getElementById('race-lockpicking') as HTMLInputElement).checked) {
    specialAbilityTraits.push({ id: 'lockpicking', value: true });
  }
  if ((document.getElementById('race-see-hidden') as HTMLInputElement).checked) {
    specialAbilityTraits.push({ id: 'see_hidden', value: true });
  }

  const traits = [...otherTraits, ...specialAbilityTraits];

  const data: Partial<RaceDefinition> = {
    race_id: raceId,
    display_name: raceNameEl.value,
    description: raceDescEl?.value || undefined,
    playable: racePlayableEl?.checked ?? false,
    base_stats: {
      strength: {
        min: Number((document.getElementById('race-str-min') as HTMLInputElement | null)?.value) || 40,
        max: Number((document.getElementById('race-str-max') as HTMLInputElement | null)?.value) || 100,
      },
      agility: {
        min: Number((document.getElementById('race-agi-min') as HTMLInputElement | null)?.value) || 40,
        max: Number((document.getElementById('race-agi-max') as HTMLInputElement | null)?.value) || 100,
      },
      constitution: {
        min: Number((document.getElementById('race-con-min') as HTMLInputElement | null)?.value) || 40,
        max: Number((document.getElementById('race-con-max') as HTMLInputElement | null)?.value) || 100,
      },
      intellect: {
        min: Number((document.getElementById('race-int-min') as HTMLInputElement | null)?.value) || 40,
        max: Number((document.getElementById('race-int-max') as HTMLInputElement | null)?.value) || 100,
      },
      wisdom: {
        min: Number((document.getElementById('race-wis-min') as HTMLInputElement | null)?.value) || 40,
        max: Number((document.getElementById('race-wis-max') as HTMLInputElement | null)?.value) || 100,
      },
      charisma: {
        min: Number((document.getElementById('race-cha-min') as HTMLInputElement | null)?.value) || 40,
        max: Number((document.getElementById('race-cha-max') as HTMLInputElement | null)?.value) || 100,
      },
    },
    traits: traits as RaceDefinition['traits'],
    allowed_classes: raceAllowedEl?.value.split(',').map(t => t.trim()).filter(Boolean) ?? [],
    dodge_bonus: Number((document.getElementById('race-dodge-bonus') as HTMLInputElement | null)?.value) || 0,
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
      showToast('Race saved successfully!', 'success');
    } else {
      showToast('Failed to save race: ' + (result.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Failed to save race:', error);
    showToast('Failed to save race', 'error');
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
      const noSelection = document.getElementById(`${type}-no-selection`);
      if (noSelection) noSelection.style.display = 'flex';

      switch (type) {
        case 'class': await loadClasses(); break;
        case 'race': await loadRaces(); break;
      }
      showToast('Deleted successfully!', 'success');
    } else {
      showToast('Failed to delete: ' + (result.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Failed to delete:', error);
    showToast('Failed to delete', 'error');
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
