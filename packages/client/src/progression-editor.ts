/**
 * Class / Race Editor — two-panel with entity type tabs, trait system,
 * armor restrictions, dynamic allowed class buttons.
 */

import { initAuth, showToast, showConfirm, showPromptFields, escapeHtml } from './components/index.js';

// ============================================================================
// Trait Definitions (hardcoded until trait_definitions table exists)
// ============================================================================

interface TraitPreset {
  label: string;
  value: number;
}

interface TraitDef {
  id: string;
  label: string;
  numeric: boolean; // true = has a value input, false = boolean toggle
  forClass: boolean;
  forRace: boolean;
  presets?: TraitPreset[]; // optional quick-fill presets for numeric traits
}

const TRAIT_DEFS: TraitDef[] = [
  { id: 'stealth', label: 'Stealth', numeric: false, forClass: true, forRace: true },
  { id: 'lockpicking', label: 'Lockpicking', numeric: false, forClass: true, forRace: true },
  { id: 'see_hidden', label: 'See Hidden', numeric: false, forClass: false, forRace: true },
  { id: 'traps', label: 'Traps', numeric: false, forClass: true, forRace: false },
  { id: 'pickpocket', label: 'Pickpocket', numeric: false, forClass: true, forRace: false },
  { id: 'tracking', label: 'Tracking', numeric: false, forClass: true, forRace: false },
  { id: 'martial_arts', label: 'Martial Arts (NYI)', numeric: false, forClass: true, forRace: false },
  { id: 'natural_magic_resistance', label: 'Natural Magic Resistance', numeric: false, forClass: true, forRace: false },
  { id: 'no_magic_items', label: 'No Magic Items (NYI)', numeric: false, forClass: true, forRace: false },
  { id: 'dodge', label: 'Dodge Bonus', numeric: true, forClass: true, forRace: false },
  { id: 'enhanced_crits', label: 'Enhanced Crits', numeric: true, forClass: true, forRace: false },
  { id: 'magic_resist', label: 'Magic Resistance', numeric: true, forClass: true, forRace: true },
  { id: 'poison_resistance', label: 'Poison Resistance', numeric: true, forClass: false, forRace: true },
];

// ============================================================================
// Types
// ============================================================================

interface ClassDef {
  class_id: string;
  display_name: string;
  description?: string;
  essence_multiplier: number;
  resource_type?: string;
  playable?: boolean;
  combat_level?: number;
  magic_level?: number;
  magic_school?: string;
  crit_bonus?: number;
  dodge_bonus?: number;
  traits?: string[];
  armor_type_restrictions?: string[];
  subscribed_tags?: string[];
}

interface RaceDef {
  race_id: string;
  display_name: string;
  description?: string;
  playable?: boolean;
  dodge_bonus?: number;
  base_stats?: Record<string, { min: number; max: number }>;
  traits?: Array<{ id: string; value: number | boolean }> | string[];
  allowed_classes?: string[];
}

(async function () {
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let classes: ClassDef[] = [];
  let races: RaceDef[] = [];
  let currentTab: 'classes' | 'races' = 'classes';
  let selectedClassId: string | null = null;
  let selectedRaceId: string | null = null;
  let raceAllowedClasses: Set<string> = new Set();

  // Trait state: Map<traitId, { enabled: boolean, value: number }>
  let classTraitState: Map<string, { enabled: boolean; value: number }> = new Map();
  let raceTraitState: Map<string, { enabled: boolean; value: number }> = new Map();

  // ============================================================================
  // DOM
  // ============================================================================

  const noEntitySelected = document.getElementById('no-entity-selected') as HTMLDivElement;
  const classForm = document.getElementById('class-form') as HTMLFormElement;
  const raceForm = document.getElementById('race-form') as HTMLFormElement;
  const entityList = document.getElementById('entity-list') as HTMLUListElement;
  const entityCount = document.getElementById('entity-count') as HTMLSpanElement;
  const listTitle = document.getElementById('list-title') as HTMLHeadingElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;

  // ============================================================================
  // API
  // ============================================================================

  async function fetchClasses(): Promise<void> {
    try {
      const res = await fetch('/api/progression/classes', { credentials: 'include' });
      const data = await res.json();
      if (data.success) classes = data.classes || [];
    } catch (error) { console.error('Failed to fetch classes:', error); }
  }

  async function fetchRaces(): Promise<void> {
    try {
      const res = await fetch('/api/progression/races', { credentials: 'include' });
      const data = await res.json();
      if (data.success) races = data.races || [];
    } catch (error) { console.error('Failed to fetch races:', error); }
  }

  // ============================================================================
  // List Rendering
  // ============================================================================

  function renderList(): void {
    const search = searchInput.value.toLowerCase();

    if (currentTab === 'classes') {
      listTitle.textContent = 'Classes';
      const filtered = classes.filter(c =>
        !search || c.display_name.toLowerCase().includes(search) || c.class_id.toLowerCase().includes(search)
      ).sort((a, b) => a.display_name.localeCompare(b.display_name));

      entityList.innerHTML = '';
      for (const cls of filtered) {
        const li = document.createElement('li');
        if (cls.class_id === selectedClassId) li.className = 'selected';
        li.innerHTML = `
          <div class="entity-name">${escapeHtml(cls.display_name)}</div>
          <div class="entity-meta">${escapeHtml(cls.class_id)} · ${cls.essence_multiplier}x${cls.playable === false ? ' · <span class="npc-badge">NPC</span>' : ''}</div>
        `;
        li.addEventListener('click', () => selectClass(cls.class_id));
        entityList.appendChild(li);
      }
      entityCount.textContent = `${filtered.length}/${classes.length}`;
    } else {
      listTitle.textContent = 'Races';
      const filtered = races.filter(r =>
        !search || r.display_name.toLowerCase().includes(search) || r.race_id.toLowerCase().includes(search)
      ).sort((a, b) => a.display_name.localeCompare(b.display_name));

      entityList.innerHTML = '';
      for (const race of filtered) {
        const li = document.createElement('li');
        if (race.race_id === selectedRaceId) li.className = 'selected';
        li.innerHTML = `
          <div class="entity-name">${escapeHtml(race.display_name)}</div>
          <div class="entity-meta">${escapeHtml(race.race_id)}${race.playable === false ? ' · <span class="npc-badge">NPC</span>' : ''}</div>
        `;
        li.addEventListener('click', () => selectRace(race.race_id));
        entityList.appendChild(li);
      }
      entityCount.textContent = `${filtered.length}/${races.length}`;
    }
  }

  // ============================================================================
  // Trait Rendering
  // ============================================================================

  function renderTraits(container: HTMLElement, entityType: 'class' | 'race', state: Map<string, { enabled: boolean; value: number }>): void {
    const defs = TRAIT_DEFS.filter(t => entityType === 'class' ? t.forClass : t.forRace);
    container.innerHTML = '';

    for (const def of defs) {
      const traitState = state.get(def.id) || { enabled: false, value: 0 };
      const item = document.createElement('div');
      item.className = 'trait-item';

      const label = document.createElement('label');
      label.className = 'toggle-label';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = traitState.enabled;
      const track = document.createElement('span');
      track.className = 'toggle-track';
      const text = document.createTextNode(` ${def.label}`);
      label.appendChild(cb);
      label.appendChild(track);
      label.appendChild(text);
      item.appendChild(label);

      if (def.numeric) {
        if (def.presets && def.presets.length > 0) {
          // Dropdown select for preset-based traits
          const selectEl = document.createElement('select');
          selectEl.className = 'trait-select-input';
          selectEl.disabled = !traitState.enabled;
          for (const preset of def.presets) {
            const opt = document.createElement('option');
            opt.value = String(preset.value);
            opt.textContent = `${preset.label} (${preset.value})`;
            selectEl.appendChild(opt);
          }
          selectEl.value = String(traitState.value ?? def.presets[0].value);
          selectEl.addEventListener('change', () => {
            const s = state.get(def.id);
            if (s) s.value = parseInt(selectEl.value) || 0;
          });
          cb.addEventListener('change', () => {
            const s = state.get(def.id) || { enabled: false, value: 0 };
            s.enabled = cb.checked;
            if (cb.checked && s.value === 0) s.value = def.presets![0].value;
            state.set(def.id, s);
            selectEl.disabled = !cb.checked;
          });
          item.appendChild(selectEl);
        } else {
          // Plain number input for other numeric traits
          const valInput = document.createElement('input');
          valInput.type = 'number';
          valInput.className = 'trait-value-input';
          valInput.value = String(traitState.value ?? 0);
          valInput.disabled = !traitState.enabled;
          valInput.addEventListener('change', () => {
            const s = state.get(def.id);
            if (s) s.value = parseInt(valInput.value) || 0;
          });
          cb.addEventListener('change', () => {
            const s = state.get(def.id) || { enabled: false, value: 0 };
            s.enabled = cb.checked;
            state.set(def.id, s);
            valInput.disabled = !cb.checked;
          });
          item.appendChild(valInput);
        }
      } else {
        cb.addEventListener('change', () => {
          const s = state.get(def.id) || { enabled: false, value: 0 };
          s.enabled = cb.checked;
          state.set(def.id, s);
        });
      }

      state.set(def.id, traitState);
      container.appendChild(item);
    }
  }

  function traitsToArray(state: Map<string, { enabled: boolean; value: number }>, entityType: 'class' | 'race'): string[] | Array<{ id: string; value: number | boolean }> {
    if (entityType === 'class') {
      // Classes store traits as string[] like ["stealth", "lockpicking", "dodge"]
      const result: string[] = [];
      for (const [id, s] of state) {
        if (s.enabled) result.push(id);
      }
      return result;
    } else {
      // Races store traits as [{id, value}] objects
      const result: Array<{ id: string; value: number | boolean }> = [];
      for (const [id, s] of state) {
        if (s.enabled) {
          const def = TRAIT_DEFS.find(d => d.id === id);
          result.push({ id, value: def?.numeric ? s.value : true });
        }
      }
      return result;
    }
  }

  function loadClassTraits(traits: string[]): void {
    classTraitState = new Map();
    for (const def of TRAIT_DEFS.filter(t => t.forClass)) {
      classTraitState.set(def.id, { enabled: traits.includes(def.id), value: 0 });
    }
  }

  function loadRaceTraits(traits: Array<{ id: string; value: number | boolean }> | string[]): void {
    raceTraitState = new Map();
    for (const def of TRAIT_DEFS.filter(t => t.forRace)) {
      raceTraitState.set(def.id, { enabled: false, value: 0 });
    }
    if (!traits) return;
    for (const t of traits) {
      // base_vision is handled as a separate form field, not a trait toggle
      if (typeof t === 'object' && t !== null && t.id === 'base_vision') continue;
      if (typeof t === 'string') {
        const existing = raceTraitState.get(t);
        if (existing) { existing.enabled = true; }
      } else if (t && typeof t === 'object') {
        const existing = raceTraitState.get(t.id);
        if (existing) {
          existing.enabled = true;
          existing.value = typeof t.value === 'number' ? t.value : 0;
        }
      }
    }
  }

  // ============================================================================
  // Class Selection & Form
  // ============================================================================

  function selectClass(classId: string): void {
    const cls = classes.find(c => c.class_id === classId);
    if (!cls) return;

    selectedClassId = classId;
    noEntitySelected.style.display = 'none';
    raceForm.style.display = 'none';
    classForm.style.display = 'block';

    (document.getElementById('class-form-title') as HTMLHeadingElement).textContent = 'Edit Class';
    (document.getElementById('class-id-display') as HTMLSpanElement).textContent = `ID: ${cls.class_id}`;
    const idInput = document.getElementById('class-id') as HTMLInputElement;
    idInput.value = cls.class_id;
    idInput.readOnly = true;

    (document.getElementById('class-name') as HTMLInputElement).value = cls.display_name;
    (document.getElementById('class-description') as HTMLTextAreaElement).value = cls.description || '';
    (document.getElementById('class-multiplier') as HTMLInputElement).value = String(cls.essence_multiplier);
    (document.getElementById('class-resource') as HTMLSelectElement).value = cls.resource_type || '';
    (document.getElementById('class-playable') as HTMLInputElement).checked = cls.playable !== false;
    (document.getElementById('class-combat-level') as HTMLInputElement).value = String(cls.combat_level ?? 3);
    (document.getElementById('class-magic-level') as HTMLInputElement).value = String(cls.magic_level ?? 0);
    (document.getElementById('class-magic-school') as HTMLSelectElement).value = cls.magic_school || '';
    (document.getElementById('class-crit-bonus') as HTMLInputElement).value = String(cls.crit_bonus ?? 0);
    (document.getElementById('class-dodge-bonus') as HTMLInputElement).value = String(cls.dodge_bonus ?? 0);

    // Armor restrictions
    const armorTypes = cls.armor_type_restrictions || [];
    (document.getElementById('class-armor-robe') as HTMLInputElement).checked = armorTypes.includes('robe');
    (document.getElementById('class-armor-leather') as HTMLInputElement).checked = armorTypes.includes('leather');
    (document.getElementById('class-armor-chainmail') as HTMLInputElement).checked = armorTypes.includes('chainmail');
    (document.getElementById('class-armor-scalemail') as HTMLInputElement).checked = armorTypes.includes('scalemail');
    (document.getElementById('class-armor-platemail') as HTMLInputElement).checked = armorTypes.includes('platemail');

    // Traits
    loadClassTraits(cls.traits || []);
    renderTraits(document.getElementById('class-traits-container')!, 'class', classTraitState);

    renderList();
  }

  function selectRace(raceId: string): void {
    const race = races.find(r => r.race_id === raceId);
    if (!race) return;

    selectedRaceId = raceId;
    noEntitySelected.style.display = 'none';
    classForm.style.display = 'none';
    raceForm.style.display = 'block';

    (document.getElementById('race-form-title') as HTMLHeadingElement).textContent = 'Edit Race';
    (document.getElementById('race-id-display') as HTMLSpanElement).textContent = `ID: ${race.race_id}`;
    const idInput = document.getElementById('race-id') as HTMLInputElement;
    idInput.value = race.race_id;
    idInput.readOnly = true;

    (document.getElementById('race-name') as HTMLInputElement).value = race.display_name;
    (document.getElementById('race-description') as HTMLTextAreaElement).value = race.description || '';
    (document.getElementById('race-playable') as HTMLInputElement).checked = race.playable !== false;
    (document.getElementById('race-dodge-bonus') as HTMLInputElement).value = String(race.dodge_bonus ?? 0);

    // Base vision — stored as a trait {id: 'base_vision', value: number}
    const visionTrait = Array.isArray(race.traits) ? race.traits.find(
      (t): t is { id: string; value: number } => typeof t === 'object' && t !== null && t.id === 'base_vision'
    ) : null;
    (document.getElementById('race-base-vision') as HTMLSelectElement).value = String(visionTrait?.value ?? 100);

    // Stats
    const stats = race.base_stats || {};
    const statMap: Record<string, string> = {
      strength: 'str', agility: 'agi', constitution: 'con',
      intellect: 'int', wisdom: 'wis', charisma: 'cha',
    };
    for (const [key, abbr] of Object.entries(statMap)) {
      const range = (stats as Record<string, { min: number; max: number }>)[key] || { min: 40, max: 100 };
      (document.getElementById(`race-${abbr}-min`) as HTMLInputElement).value = String(range.min);
      (document.getElementById(`race-${abbr}-max`) as HTMLInputElement).value = String(range.max);
    }

    // Traits
    loadRaceTraits(race.traits || []);
    renderTraits(document.getElementById('race-traits-container')!, 'race', raceTraitState);

    // Allowed classes
    raceAllowedClasses = new Set(
      (race.allowed_classes || []).filter(c => c && c.trim()).map(c => {
        const m = classes.find(cd => cd.class_id.toLowerCase() === c.toLowerCase());
        return m ? m.class_id : c;
      })
    );
    renderAllowedClasses();

    renderList();
  }

  function clearSelection(): void {
    selectedClassId = null;
    selectedRaceId = null;
    noEntitySelected.style.display = 'flex';
    classForm.style.display = 'none';
    raceForm.style.display = 'none';
    renderList();
  }

  // ============================================================================
  // Allowed Classes (Race)
  // ============================================================================

  function renderAllowedClasses(): void {
    const container = document.getElementById('race-allowed-classes')!;
    container.innerHTML = '';
    for (const cls of classes.sort((a, b) => a.display_name.localeCompare(b.display_name))) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `class-btn${raceAllowedClasses.has(cls.class_id) ? ' selected' : ''}`;
      btn.textContent = cls.display_name;
      btn.addEventListener('click', () => {
        if (raceAllowedClasses.has(cls.class_id)) {
          raceAllowedClasses.delete(cls.class_id);
          btn.classList.remove('selected');
        } else {
          raceAllowedClasses.add(cls.class_id);
          btn.classList.add('selected');
        }
      });
      container.appendChild(btn);
    }
  }

  // ============================================================================
  // Gather Form Data
  // ============================================================================

  function gatherClassData(): Record<string, unknown> {
    const armorTypes: string[] = [];
    if ((document.getElementById('class-armor-robe') as HTMLInputElement).checked) armorTypes.push('robe');
    if ((document.getElementById('class-armor-leather') as HTMLInputElement).checked) armorTypes.push('leather');
    if ((document.getElementById('class-armor-chainmail') as HTMLInputElement).checked) armorTypes.push('chainmail');
    if ((document.getElementById('class-armor-scalemail') as HTMLInputElement).checked) armorTypes.push('scalemail');
    if ((document.getElementById('class-armor-platemail') as HTMLInputElement).checked) armorTypes.push('platemail');

    return {
      class_id: (document.getElementById('class-id') as HTMLInputElement).value.trim(),
      display_name: (document.getElementById('class-name') as HTMLInputElement).value.trim(),
      description: (document.getElementById('class-description') as HTMLTextAreaElement).value.trim() || null,
      essence_multiplier: parseFloat((document.getElementById('class-multiplier') as HTMLInputElement).value) || 1.0,
      resource_type: (document.getElementById('class-resource') as HTMLSelectElement).value || null,
      playable: (document.getElementById('class-playable') as HTMLInputElement).checked,
      combat_level: parseInt((document.getElementById('class-combat-level') as HTMLInputElement).value) || 3,
      magic_level: parseInt((document.getElementById('class-magic-level') as HTMLInputElement).value) || 0,
      magic_school: (document.getElementById('class-magic-school') as HTMLSelectElement).value || null,
      crit_bonus: parseInt((document.getElementById('class-crit-bonus') as HTMLInputElement).value) || 0,
      dodge_bonus: parseInt((document.getElementById('class-dodge-bonus') as HTMLInputElement).value) || 0,
      traits: traitsToArray(classTraitState, 'class'),
      armor_type_restrictions: armorTypes.length > 0 ? armorTypes : null,
    };
  }

  function gatherRaceData(): Record<string, unknown> {
    const statMap: Record<string, string> = {
      strength: 'str', agility: 'agi', constitution: 'con',
      intellect: 'int', wisdom: 'wis', charisma: 'cha',
    };
    const base_stats: Record<string, { min: number; max: number }> = {};
    for (const [key, abbr] of Object.entries(statMap)) {
      base_stats[key] = {
        min: parseInt((document.getElementById(`race-${abbr}-min`) as HTMLInputElement).value) || 40,
        max: parseInt((document.getElementById(`race-${abbr}-max`) as HTMLInputElement).value) || 100,
      };
    }

    return {
      race_id: (document.getElementById('race-id') as HTMLInputElement).value.trim(),
      display_name: (document.getElementById('race-name') as HTMLInputElement).value.trim(),
      description: (document.getElementById('race-description') as HTMLTextAreaElement).value.trim() || null,
      playable: (document.getElementById('race-playable') as HTMLInputElement).checked,
      dodge_bonus: parseInt((document.getElementById('race-dodge-bonus') as HTMLInputElement).value) || 0,
      base_stats,
      traits: [
        ...traitsToArray(raceTraitState, 'race') as Array<{ id: string; value: number | boolean }>,
        { id: 'base_vision', value: parseInt((document.getElementById('race-base-vision') as HTMLSelectElement).value) || 100 },
      ],
      allowed_classes: [...new Set(Array.from(raceAllowedClasses).filter(c => c && c.trim()))],
    };
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  // Class CRUD
  classForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedClassId) return;
    const data = gatherClassData();
    try {
      const res = await fetch(`/api/progression/classes/${selectedClassId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) { showToast('Class saved', 'success'); await fetchClasses(); selectClass(selectedClassId); }
      else showToast(result.message || 'Failed to save', 'error');
    } catch { showToast('Failed to save class', 'error'); }
  });

  raceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRaceId) return;
    const data = gatherRaceData();
    try {
      const res = await fetch(`/api/progression/races/${selectedRaceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) { showToast('Race saved', 'success'); await fetchRaces(); selectRace(selectedRaceId); }
      else showToast(result.message || 'Failed to save', 'error');
    } catch { showToast('Failed to save race', 'error'); }
  });

  // New entity
  document.getElementById('new-entity-btn')?.addEventListener('click', async () => {
    if (currentTab === 'classes') {
      const result = await showPromptFields('New Class', [
        { key: 'id', label: 'Class ID', required: true, placeholder: 'warrior' },
        { key: 'name', label: 'Display Name', required: true, placeholder: 'Warrior' },
      ]);
      if (!result) return;
      const id = result.id.toLowerCase();
      if (!/^[a-z][a-z0-9_]*$/.test(id)) { showToast('ID must be lowercase letters/numbers/underscores', 'warning'); return; }
      if (classes.some(c => c.class_id === id)) { showToast('Class ID already exists', 'warning'); return; }

      try {
        const res = await fetch('/api/progression/classes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ class_id: id, display_name: result.name, essence_multiplier: 1.0, playable: true }),
        });
        const data = await res.json();
        if (data.success) { showToast('Class created', 'success'); await fetchClasses(); selectClass(id); }
        else showToast(data.message || 'Failed to create', 'error');
      } catch { showToast('Failed to create class', 'error'); }
    } else {
      const result = await showPromptFields('New Race', [
        { key: 'id', label: 'Race ID', required: true, placeholder: 'human' },
        { key: 'name', label: 'Display Name', required: true, placeholder: 'Human' },
      ]);
      if (!result) return;
      const id = result.id.toLowerCase();
      if (!/^[a-z][a-z0-9_]*$/.test(id)) { showToast('ID must be lowercase letters/numbers/underscores', 'warning'); return; }
      if (races.some(r => r.race_id === id)) { showToast('Race ID already exists', 'warning'); return; }

      try {
        const res = await fetch('/api/progression/races', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ race_id: id, display_name: result.name, playable: true }),
        });
        const data = await res.json();
        if (data.success) { showToast('Race created', 'success'); await fetchRaces(); selectRace(id); }
        else showToast(data.message || 'Failed to create', 'error');
      } catch { showToast('Failed to create race', 'error'); }
    }
  });

  // Delete class
  document.getElementById('delete-class-btn')?.addEventListener('click', async () => {
    if (!selectedClassId) return;
    const cls = classes.find(c => c.class_id === selectedClassId);
    const confirmed = await showConfirm(`Delete class "${cls?.display_name}"?`, { confirmText: 'Delete', dangerous: true });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/progression/classes/${selectedClassId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) { showToast('Class deleted', 'success'); await fetchClasses(); clearSelection(); }
      else showToast(data.message || 'Failed to delete', 'error');
    } catch { showToast('Failed to delete class', 'error'); }
  });

  // Delete race
  document.getElementById('delete-race-btn')?.addEventListener('click', async () => {
    if (!selectedRaceId) return;
    const race = races.find(r => r.race_id === selectedRaceId);
    const confirmed = await showConfirm(`Delete race "${race?.display_name}"?`, { confirmText: 'Delete', dangerous: true });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/progression/races/${selectedRaceId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) { showToast('Race deleted', 'success'); await fetchRaces(); clearSelection(); }
      else showToast(data.message || 'Failed to delete', 'error');
    } catch { showToast('Failed to delete race', 'error'); }
  });

  // Duplicate class
  document.getElementById('duplicate-class-btn')?.addEventListener('click', async () => {
    if (!selectedClassId) return;
    const result = await showPromptFields('Duplicate Class', [
      { key: 'id', label: 'New Class ID', required: true, defaultValue: selectedClassId + '_copy' },
      { key: 'name', label: 'Display Name', required: true, defaultValue: (document.getElementById('class-name') as HTMLInputElement).value + ' (copy)' },
    ]);
    if (!result) return;
    const id = result.id.toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(id)) { showToast('Invalid ID format', 'warning'); return; }
    if (classes.some(c => c.class_id === id)) { showToast('Class ID already exists', 'warning'); return; }

    const sourceClass = classes.find(c => c.class_id === selectedClassId);
    const data = { ...gatherClassData(), class_id: id, display_name: result.name, subscribed_tags: sourceClass?.subscribed_tags ?? [] };
    try {
      const res = await fetch('/api/progression/classes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(data),
      });
      const resp = await res.json();
      if (resp.success) { showToast('Class duplicated', 'success'); await fetchClasses(); selectClass(id); }
      else showToast(resp.message || 'Failed to duplicate', 'error');
    } catch { showToast('Failed to duplicate class', 'error'); }
  });

  // Duplicate race
  document.getElementById('duplicate-race-btn')?.addEventListener('click', async () => {
    if (!selectedRaceId) return;
    const result = await showPromptFields('Duplicate Race', [
      { key: 'id', label: 'New Race ID', required: true, defaultValue: selectedRaceId + '_copy' },
      { key: 'name', label: 'Display Name', required: true, defaultValue: (document.getElementById('race-name') as HTMLInputElement).value + ' (copy)' },
    ]);
    if (!result) return;
    const id = result.id.toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(id)) { showToast('Invalid ID format', 'warning'); return; }
    if (races.some(r => r.race_id === id)) { showToast('Race ID already exists', 'warning'); return; }

    const data = { ...gatherRaceData(), race_id: id, display_name: result.name };
    try {
      const res = await fetch('/api/progression/races', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(data),
      });
      const resp = await res.json();
      if (resp.success) { showToast('Race duplicated', 'success'); await fetchRaces(); selectRace(id); }
      else showToast(resp.message || 'Failed to duplicate', 'error');
    } catch { showToast('Failed to duplicate race', 'error'); }
  });

  // ============================================================================
  // Tab Switching
  // ============================================================================

  document.getElementById('tab-classes-btn')?.addEventListener('click', () => {
    currentTab = 'classes';
    document.getElementById('tab-classes-btn')!.classList.add('active');
    document.getElementById('tab-races-btn')!.classList.remove('active');
    searchInput.value = '';
    clearSelection();
  });

  document.getElementById('tab-races-btn')?.addEventListener('click', () => {
    currentTab = 'races';
    document.getElementById('tab-races-btn')!.classList.add('active');
    document.getElementById('tab-classes-btn')!.classList.remove('active');
    searchInput.value = '';
    clearSelection();
  });

  // Search
  searchInput.addEventListener('input', renderList);

  // Export
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const data = currentTab === 'classes'
        ? { classes }
        : { races };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentTab}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${currentTab}`, 'success');
    } catch { showToast('Export failed', 'error'); }
  });

  // ============================================================================
  // Helpers
  // ============================================================================

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchClasses(), fetchRaces()]);
  renderList();
})();
