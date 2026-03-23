/**
 * Item Editor — three-panel with type-driven Type Data tab, SearchableSelect
 * for spawn room, dynamic class/race buttons, reverse lookups.
 */

import { initAuth, ListPanel, SearchableSelect, setupTabs, showToast, showConfirm, showPromptFields, escapeHtml } from './components/index.js';
import type { SelectOption } from './components/index.js';

// Minimal interfaces for what we need from the API
interface ItemTemplate {
  id: number;
  name: string;
  short_desc?: string;
  long_desc?: string;
  room_desc?: string;
  keywords: string[];
  weight: number;
  size: number;
  base_value: number;
  item_type: string;
  equipment_slot?: string;
  flags: Record<string, unknown>;
  max_stack: number;
  container_capacity?: number;
  container_weight_limit?: number;
  weapon_data?: Record<string, unknown>;
  armor_data?: Record<string, unknown>;
  consumable_data?: Record<string, unknown>;
  light_data?: Record<string, unknown>;
  tool_data?: Record<string, unknown>;
  requirements?: Record<string, unknown>;
  stat_modifiers?: Record<string, unknown>;
  stealth_modifier?: number;
  spellcasting_modifier?: number;
  lockpicking_modifier?: number;
  perception_modifier?: number;
  critical_chance_modifier?: number;
  magic_resistance_modifier?: number;
  trap_modifier?: number;
  effect_slots: number;
  rarity?: string;
  max_in_world?: number;
}

interface Room { id: number; name: string; area: string | null; }
interface ClassDef { id: string; displayName: string; }
interface RaceDef { id: string; displayName: string; }
interface DropTableRef { id: number; name: string; }
interface NpcRef { id: number; name: string; }

const DENOMINATION_BREAKS = [
  { name: 'runic', value: 10000 },
  { name: 'platinum', value: 1000 },
  { name: 'gold', value: 100 },
  { name: 'silver', value: 10 },
  { name: 'copper', value: 1 },
];

function formatCopper(copper: number): string {
  if (copper <= 0) return '0 copper';
  const parts: string[] = [];
  let remaining = copper;
  for (const d of DENOMINATION_BREAKS) {
    const count = Math.floor(remaining / d.value);
    if (count > 0) { parts.push(`${count} ${d.name}`); remaining -= count * d.value; }
  }
  return parts.join(', ');
}

(async function () {
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let templates: ItemTemplate[] = [];
  let rooms: Room[] = [];
  let classDefs: ClassDef[] = [];
  let raceDefs: RaceDef[] = [];
  let dropTables: DropTableRef[] = [];
  let npcTemplates: NpcRef[] = [];
  let selectedTemplateId: number | null = null;
  let selectedClasses: Set<string> = new Set();
  let selectedRaces: Set<string> = new Set();

  // ============================================================================
  // DOM
  // ============================================================================

  const itemForm = document.getElementById('item-form') as HTMLFormElement;
  const noItemSelected = document.getElementById('no-item-selected') as HTMLDivElement;
  const formTitle = document.getElementById('item-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('item-id-display') as HTMLSpanElement;
  const itemCount = document.getElementById('item-count') as HTMLSpanElement;
  const previewContent = document.getElementById('preview-content') as HTMLDivElement;
  const refContent = document.getElementById('ref-content') as HTMLDivElement;
  const typeDataHeader = document.getElementById('type-data-header') as HTMLDivElement;

  // Basic fields
  const nameInput = document.getElementById('item-name') as HTMLInputElement;
  const itemTypeSelect = document.getElementById('item-type') as HTMLSelectElement;
  const longDescInput = document.getElementById('item-long-desc') as HTMLTextAreaElement;
  const keywordsInput = document.getElementById('item-keywords') as HTMLInputElement;
  const weightInput = document.getElementById('item-weight') as HTMLInputElement;
  const sizeInput = document.getElementById('item-size') as HTMLInputElement;
  const valueInput = document.getElementById('item-value') as HTMLInputElement;
  const equipSlotSelect = document.getElementById('item-equipment-slot') as HTMLSelectElement;
  const effectSlotsInput = document.getElementById('item-effect-slots') as HTMLInputElement;
  const raritySelect = document.getElementById('item-rarity') as HTMLSelectElement;
  const maxInWorldInput = document.getElementById('item-max-in-world') as HTMLInputElement;

  // Type sections
  const typeSections: Record<string, HTMLElement> = {
    weapon: document.getElementById('weapon-section')!,
    armor: document.getElementById('armor-section')!,
    container: document.getElementById('container-section')!,
    consumable: document.getElementById('consumable-section')!,
    light: document.getElementById('light-section')!,
    tool: document.getElementById('tool-section')!,
    key: document.getElementById('key-section')!,
    misc: document.getElementById('misc-section')!,
  };

  // ============================================================================
  // List Panel
  // ============================================================================

  const listPanel = new ListPanel<ItemTemplate>({
    listElement: document.getElementById('item-list')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    filterSelect: document.getElementById('type-filter') as HTMLSelectElement,
    onSelect: (item) => selectTemplate(item.id),
    getId: (item) => item.id,
    renderItem: (item) => `
      <div class="item-name">${escapeHtml(item.name)}</div>
      <div class="item-meta">
        <span class="itype-badge ${item.item_type}">${escapeHtml(item.item_type)}</span>
        <span style="font-size:0.7rem;color:#555;">#${item.id}</span>
      </div>
    `,
    filterFn: (item, search) =>
      item.name.toLowerCase().includes(search) ||
      (item.keywords || []).some(k => k.toLowerCase().includes(search)),
    dropdownFilterFn: (item, value) => item.item_type === value,
    sortFn: (a, b) => a.name.localeCompare(b.name),
    onRender: updateCount,
  });

  setupTabs({ container: itemForm });

  // ============================================================================
  // Spawn Room SearchableSelect
  // ============================================================================

  let spawnRoomSelect: SearchableSelect;

  function initSpawnRoomSelect(): void {
    spawnRoomSelect = new SearchableSelect({
      container: document.getElementById('spawn-room-select-container')!,
      placeholder: 'Search rooms...',
      options: rooms.sort((a, b) => (a.area || '').localeCompare(b.area || '') || a.name.localeCompare(b.name))
        .map(r => ({ value: String(r.id), label: r.name, group: r.area || 'No Area', detail: `#${r.id}` })),
      onChange: () => {},
    });
  }

  // ============================================================================
  // API
  // ============================================================================

  async function fetchTemplates(): Promise<void> {
    try {
      const res = await fetch('/api/items/templates', { credentials: 'include' });
      const data = await res.json();
      templates = data.templates || [];
      listPanel.setItems(templates);
      listPanel.setSelected(selectedTemplateId);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      showToast('Failed to load items', 'error');
    }
  }

  async function fetchRooms(): Promise<void> {
    try {
      const res = await fetch('/api/rooms', { credentials: 'include' });
      const data = await res.json();
      rooms = data.rooms || [];
    } catch (error) { console.error('Failed to fetch rooms:', error); }
  }

  async function fetchClasses(): Promise<void> {
    try {
      const res = await fetch('/api/progression/classes', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        classDefs = (data.classes || []).map((c: Record<string, unknown>) => ({
          id: (c.class_id || c.id) as string,
          displayName: (c.display_name || c.displayName || c.class_id) as string,
        }));
      }
    } catch (error) { console.error('Failed to fetch classes:', error); }
  }

  async function fetchRaces(): Promise<void> {
    try {
      const res = await fetch('/api/progression/races', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        raceDefs = (data.races || []).map((r: Record<string, unknown>) => ({
          id: (r.race_id || r.id) as string,
          displayName: (r.display_name || r.displayName || r.race_id) as string,
        }));
      }
    } catch (error) { console.error('Failed to fetch races:', error); }
  }

  async function fetchDropTables(): Promise<void> {
    try {
      const res = await fetch('/api/drop-tables', { credentials: 'include' });
      const data = await res.json();
      dropTables = (data.dropTables || []).map((t: Record<string, unknown>) => ({
        id: t.id as number, name: t.name as string, entries: t.entries,
      }));
    } catch (error) { console.error('Failed to fetch drop tables:', error); }
  }

  async function fetchNpcTemplates(): Promise<void> {
    try {
      const res = await fetch('/api/npcs', { credentials: 'include' });
      const data = await res.json();
      npcTemplates = (data.templates || []).map((n: Record<string, unknown>) => ({
        id: n.id as number, name: n.name as string,
      }));
    } catch (error) { console.error('Failed to fetch NPCs:', error); }
  }

  // ============================================================================
  // Selection
  // ============================================================================

  function selectTemplate(id: number): void {
    const t = templates.find(t => t.id === id);
    if (!t) return;

    selectedTemplateId = id;
    noItemSelected.style.display = 'none';
    itemForm.style.display = 'block';
    formTitle.textContent = 'Edit Item';
    idDisplay.textContent = `ID: ${t.id}`;

    // Basic
    nameInput.value = t.name;
    itemTypeSelect.value = t.item_type;
    longDescInput.value = t.long_desc || '';
    keywordsInput.value = (t.keywords || []).join(', ');
    weightInput.value = String(t.weight || 0);
    sizeInput.value = String(t.size || 0);
    valueInput.value = String(t.base_value || 0);
    equipSlotSelect.value = t.equipment_slot || '';
    effectSlotsInput.value = String(t.effect_slots || 0);
    raritySelect.value = t.rarity || 'common';
    maxInWorldInput.value = String(t.max_in_world || 0);

    // Type data
    loadWeaponData(t);
    loadArmorData(t);
    loadContainerData(t);
    loadConsumableData(t);
    loadLightData(t);
    loadToolData(t);
    loadKeyData(t);

    // Requirements
    const req = t.requirements || {};
    (document.getElementById('req-level') as HTMLInputElement).value = String(req.level || 0);
    (document.getElementById('req-strength') as HTMLInputElement).value = String(req.strength || 0);
    (document.getElementById('req-dexterity') as HTMLInputElement).value = String(req.dexterity || 0);
    (document.getElementById('req-constitution') as HTMLInputElement).value = String(req.constitution || 0);
    (document.getElementById('req-intelligence') as HTMLInputElement).value = String(req.intelligence || 0);
    (document.getElementById('req-wisdom') as HTMLInputElement).value = String(req.wisdom || 0);
    (document.getElementById('req-charisma') as HTMLInputElement).value = String(req.charisma || 0);

    selectedClasses = new Set(
      ((req.class as string[]) || []).filter(c => c && c.trim()).map(c => {
        const m = classDefs.find(cd => cd.id.toLowerCase() === c.toLowerCase());
        return m ? m.id : c;
      })
    );
    selectedRaces = new Set(
      ((req.race as string[]) || []).filter(r => r && r.trim()).map(r => {
        const m = raceDefs.find(rd => rd.id.toLowerCase() === r.toLowerCase());
        return m ? m.id : r;
      })
    );
    renderClassButtons();
    renderRaceButtons();

    // Modifiers
    const mods = t.stat_modifiers || {};
    (document.getElementById('mod-strength') as HTMLInputElement).value = String(mods.strength || 0);
    (document.getElementById('mod-dexterity') as HTMLInputElement).value = String(mods.dexterity || 0);
    (document.getElementById('mod-constitution') as HTMLInputElement).value = String(mods.constitution || 0);
    (document.getElementById('mod-intelligence') as HTMLInputElement).value = String(mods.intelligence || 0);
    (document.getElementById('mod-wisdom') as HTMLInputElement).value = String(mods.wisdom || 0);
    (document.getElementById('mod-charisma') as HTMLInputElement).value = String(mods.charisma || 0);
    (document.getElementById('mod-max-health') as HTMLInputElement).value = String(mods.max_health || 0);
    (document.getElementById('mod-max-mana') as HTMLInputElement).value = String(mods.max_mana || 0);
    (document.getElementById('mod-stealth') as HTMLInputElement).value = String(t.stealth_modifier || 0);
    (document.getElementById('mod-spellcasting') as HTMLInputElement).value = String(t.spellcasting_modifier || 0);
    (document.getElementById('mod-lockpicking') as HTMLInputElement).value = String(t.lockpicking_modifier || 0);
    (document.getElementById('mod-perception') as HTMLInputElement).value = String(t.perception_modifier || 0);
    (document.getElementById('mod-critical') as HTMLInputElement).value = String(t.critical_chance_modifier || 0);
    (document.getElementById('mod-magic-resist') as HTMLInputElement).value = String(t.magic_resistance_modifier || 0);
    (document.getElementById('mod-trap') as HTMLInputElement).value = String(t.trap_modifier || 0);

    // Flags
    const flags = t.flags || {};
    (document.getElementById('flag-takeable') as HTMLInputElement).checked = flags.takeable !== false;
    (document.getElementById('flag-hidden') as HTMLInputElement).checked = !!flags.hidden;
    (document.getElementById('flag-no-drop') as HTMLInputElement).checked = !!flags.no_drop;
    (document.getElementById('flag-stackable') as HTMLInputElement).checked = !!flags.stackable;
    (document.getElementById('flag-cursed') as HTMLInputElement).checked = !!flags.cursed;
    (document.getElementById('flag-two-handed') as HTMLInputElement).checked = !!flags.two_handed;
    (document.getElementById('flag-throwable') as HTMLInputElement).checked = !!flags.throwable;

    updateTypeSections(t.item_type);
    listPanel.setSelected(id);
    (document.getElementById('spawn-btn') as HTMLButtonElement).disabled = false;
    updatePreview(t);
    updateReferences(id);
  }

  function loadWeaponData(t: ItemTemplate): void {
    const w = t.weapon_data || {};
    (document.getElementById('weapon-min-damage') as HTMLInputElement).value = String(w.min_damage || 0);
    (document.getElementById('weapon-max-damage') as HTMLInputElement).value = String(w.max_damage || 0);
    (document.getElementById('weapon-damage-type') as HTMLSelectElement).value = (w.damage_type as string) || 'slashing';
    (document.getElementById('weapon-attack-speed') as HTMLInputElement).value = String(w.attack_speed || 2000);
    (document.getElementById('weapon-crit-modifier') as HTMLInputElement).value = String(w.crit_modifier || 0);
    (document.getElementById('weapon-allows-backstab') as HTMLInputElement).checked = !!w.allows_backstab;
    (document.getElementById('weapon-backstab-accuracy') as HTMLInputElement).value = String(w.backstab_accuracy || 0);
    (document.getElementById('weapon-backstab-min-damage') as HTMLInputElement).value = String(w.backstab_min_damage_bonus || 0);
    (document.getElementById('weapon-backstab-max-damage') as HTMLInputElement).value = String(w.backstab_max_damage_bonus || 0);
    const verbs = (w.attack_verbs || {}) as Record<string, string>;
    (document.getElementById('weapon-verb-hit') as HTMLInputElement).value = verbs.hit || '';
    (document.getElementById('weapon-verb-hit-3p') as HTMLInputElement).value = verbs.hit_3p || '';
    (document.getElementById('weapon-verb-miss') as HTMLInputElement).value = verbs.miss || '';
    (document.getElementById('weapon-verb-miss-3p') as HTMLInputElement).value = verbs.miss_3p || '';
  }

  function loadArmorData(t: ItemTemplate): void {
    const a = t.armor_data || {};
    (document.getElementById('armor-class') as HTMLInputElement).value = String(a.armor_class || 0);
    (document.getElementById('armor-damage-resistance') as HTMLInputElement).value = String(a.damage_resistance || 0);
    (document.getElementById('armor-type') as HTMLSelectElement).value = (a.armor_type as string) || 'leather';
  }

  function loadContainerData(t: ItemTemplate): void {
    (document.getElementById('container-capacity') as HTMLInputElement).value = String(t.container_capacity || 0);
    (document.getElementById('container-weight-limit') as HTMLInputElement).value = String(t.container_weight_limit || 0);
  }

  function loadConsumableData(t: ItemTemplate): void {
    const c = t.consumable_data || {};
    (document.getElementById('consumable-effect-type') as HTMLSelectElement).value = (c.effect_type as string) || 'heal';
    (document.getElementById('consumable-effect-value') as HTMLInputElement).value = String(c.effect_value || 0);
    (document.getElementById('consumable-charges') as HTMLInputElement).value = String(c.charges || 0);
    (document.getElementById('consumable-duration') as HTMLInputElement).value = String(c.duration || 0);
  }

  function loadLightData(t: ItemTemplate): void {
    const l = t.light_data || {};
    (document.getElementById('light-radius') as HTMLInputElement).value = String(l.radius || 0);
    (document.getElementById('light-fuel-max') as HTMLInputElement).value = String(l.fuel_max || 0);
    (document.getElementById('light-fuel-rate') as HTMLInputElement).value = String(l.fuel_rate || 0);
  }

  function loadToolData(t: ItemTemplate): void {
    const td = t.tool_data || {};
    (document.getElementById('tool-type') as HTMLSelectElement).value = (td.toolType as string) || 'lockpick';
    (document.getElementById('tool-quality') as HTMLInputElement).value = String(td.quality || 1);
    (document.getElementById('tool-durability') as HTMLInputElement).value = String(td.durability || 50);
  }

  function loadKeyData(t: ItemTemplate): void {
    const flags = t.flags || {};
    (document.getElementById('key-tag') as HTMLInputElement).value = (flags.key_tag as string) || '';
    (document.getElementById('key-consume-on-use') as HTMLInputElement).checked = !!flags.consumeOnUse;
    (document.getElementById('key-consume-chance') as HTMLInputElement).value = String(flags.consumeChance || 0);
  }

  function clearForm(): void {
    selectedTemplateId = null;
    noItemSelected.style.display = 'flex';
    itemForm.style.display = 'none';
    idDisplay.textContent = '';
    previewContent.innerHTML = '<p class="hint">Select an item to see preview</p>';
    refContent.innerHTML = '<p class="hint">Select an item to see references</p>';
    (document.getElementById('spawn-btn') as HTMLButtonElement).disabled = true;
    listPanel.setSelected(null);
  }

  // ============================================================================
  // Type Section Visibility
  // ============================================================================

  function updateTypeSections(itemType: string): void {
    for (const [type, section] of Object.entries(typeSections)) {
      section.style.display = type === itemType ? 'block' : 'none';
    }
    typeDataHeader.textContent = `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} Data`;
  }

  // ============================================================================
  // Class/Race Buttons
  // ============================================================================

  function renderClassButtons(): void {
    const container = document.getElementById('class-buttons')!;
    container.innerHTML = '';
    for (const cls of classDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `class-btn${selectedClasses.has(cls.id) ? ' selected' : ''}`;
      btn.textContent = cls.displayName;
      btn.addEventListener('click', () => {
        if (selectedClasses.has(cls.id)) { selectedClasses.delete(cls.id); btn.classList.remove('selected'); }
        else { selectedClasses.add(cls.id); btn.classList.add('selected'); }
      });
      container.appendChild(btn);
    }
  }

  function renderRaceButtons(): void {
    const container = document.getElementById('race-buttons')!;
    container.innerHTML = '';
    for (const race of raceDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `class-btn${selectedRaces.has(race.id) ? ' selected' : ''}`;
      btn.textContent = race.displayName;
      btn.addEventListener('click', () => {
        if (selectedRaces.has(race.id)) { selectedRaces.delete(race.id); btn.classList.remove('selected'); }
        else { selectedRaces.add(race.id); btn.classList.add('selected'); }
      });
      container.appendChild(btn);
    }
  }

  // ============================================================================
  // Gather Form Data
  // ============================================================================

  function gatherFormData(): Record<string, unknown> {
    const itemType = itemTypeSelect.value;
    const keywords = keywordsInput.value.split(',').map(k => k.trim()).filter(Boolean);

    const data: Record<string, unknown> = {
      name: nameInput.value.trim(),
      item_type: itemType,
      long_desc: longDescInput.value.trim() || null,
      keywords,
      weight: parseInt(weightInput.value) || 0,
      size: parseInt(sizeInput.value) || 0,
      base_value: parseInt(valueInput.value) || 0,
      equipment_slot: equipSlotSelect.value || null,
      effect_slots: parseInt(effectSlotsInput.value) || 0,
      rarity: raritySelect.value,
      max_in_world: parseInt(maxInWorldInput.value) || null,
      max_stack: 999,
    };

    // Flags
    const flags: Record<string, unknown> = {
      takeable: (document.getElementById('flag-takeable') as HTMLInputElement).checked,
      hidden: (document.getElementById('flag-hidden') as HTMLInputElement).checked,
      no_drop: (document.getElementById('flag-no-drop') as HTMLInputElement).checked,
      stackable: (document.getElementById('flag-stackable') as HTMLInputElement).checked,
      cursed: (document.getElementById('flag-cursed') as HTMLInputElement).checked,
      two_handed: (document.getElementById('flag-two-handed') as HTMLInputElement).checked,
      throwable: (document.getElementById('flag-throwable') as HTMLInputElement).checked,
    };

    // Key flags
    if (itemType === 'key') {
      flags.key_tag = (document.getElementById('key-tag') as HTMLInputElement).value.trim() || null;
      flags.consumeOnUse = (document.getElementById('key-consume-on-use') as HTMLInputElement).checked;
      flags.consumeChance = parseInt((document.getElementById('key-consume-chance') as HTMLInputElement).value) || 0;
    }
    data.flags = flags;

    // Type-specific data
    if (itemType === 'weapon') {
      data.weapon_data = {
        min_damage: parseInt((document.getElementById('weapon-min-damage') as HTMLInputElement).value) || 1,
        max_damage: parseInt((document.getElementById('weapon-max-damage') as HTMLInputElement).value) || 1,
        damage_type: (document.getElementById('weapon-damage-type') as HTMLSelectElement).value,
        attack_speed: parseInt((document.getElementById('weapon-attack-speed') as HTMLInputElement).value) || 2000,
        crit_modifier: parseInt((document.getElementById('weapon-crit-modifier') as HTMLInputElement).value) || 0,
        allows_backstab: (document.getElementById('weapon-allows-backstab') as HTMLInputElement).checked,
        backstab_accuracy: parseInt((document.getElementById('weapon-backstab-accuracy') as HTMLInputElement).value) || 0,
        backstab_min_damage_bonus: parseInt((document.getElementById('weapon-backstab-min-damage') as HTMLInputElement).value) || 0,
        backstab_max_damage_bonus: parseInt((document.getElementById('weapon-backstab-max-damage') as HTMLInputElement).value) || 0,
        attack_verbs: {
          hit: (document.getElementById('weapon-verb-hit') as HTMLInputElement).value.trim() || undefined,
          hit_3p: (document.getElementById('weapon-verb-hit-3p') as HTMLInputElement).value.trim() || undefined,
          miss: (document.getElementById('weapon-verb-miss') as HTMLInputElement).value.trim() || undefined,
          miss_3p: (document.getElementById('weapon-verb-miss-3p') as HTMLInputElement).value.trim() || undefined,
        },
      };
    } else if (itemType === 'armor') {
      data.armor_data = {
        armor_class: parseInt((document.getElementById('armor-class') as HTMLInputElement).value) || 0,
        damage_resistance: parseFloat((document.getElementById('armor-damage-resistance') as HTMLInputElement).value) || 0,
        armor_type: (document.getElementById('armor-type') as HTMLSelectElement).value,
      };
    } else if (itemType === 'container') {
      data.container_capacity = parseInt((document.getElementById('container-capacity') as HTMLInputElement).value) || 0;
      data.container_weight_limit = parseInt((document.getElementById('container-weight-limit') as HTMLInputElement).value) || 0;
    } else if (itemType === 'consumable') {
      data.consumable_data = {
        effect_type: (document.getElementById('consumable-effect-type') as HTMLSelectElement).value,
        effect_value: parseInt((document.getElementById('consumable-effect-value') as HTMLInputElement).value) || 0,
        charges: parseInt((document.getElementById('consumable-charges') as HTMLInputElement).value) || 0,
        duration: parseInt((document.getElementById('consumable-duration') as HTMLInputElement).value) || 0,
      };
    } else if (itemType === 'light') {
      data.light_data = {
        radius: parseInt((document.getElementById('light-radius') as HTMLInputElement).value) || 0,
        fuel_max: parseInt((document.getElementById('light-fuel-max') as HTMLInputElement).value) || 0,
        fuel_rate: parseInt((document.getElementById('light-fuel-rate') as HTMLInputElement).value) || 0,
      };
    } else if (itemType === 'tool') {
      data.tool_data = {
        toolType: (document.getElementById('tool-type') as HTMLSelectElement).value,
        quality: Math.max(1, Math.min(5, parseInt((document.getElementById('tool-quality') as HTMLInputElement).value) || 1)),
        durability: Math.max(1, Math.min(101, parseInt((document.getElementById('tool-durability') as HTMLInputElement).value) || 50)),
      };
    }

    // Requirements
    data.requirements = {
      level: parseInt((document.getElementById('req-level') as HTMLInputElement).value) || 0,
      strength: parseInt((document.getElementById('req-strength') as HTMLInputElement).value) || 0,
      dexterity: parseInt((document.getElementById('req-dexterity') as HTMLInputElement).value) || 0,
      constitution: parseInt((document.getElementById('req-constitution') as HTMLInputElement).value) || 0,
      intelligence: parseInt((document.getElementById('req-intelligence') as HTMLInputElement).value) || 0,
      wisdom: parseInt((document.getElementById('req-wisdom') as HTMLInputElement).value) || 0,
      charisma: parseInt((document.getElementById('req-charisma') as HTMLInputElement).value) || 0,
      class: [...new Set(Array.from(selectedClasses).filter(c => c && c.trim()))],
      race: [...new Set(Array.from(selectedRaces).filter(r => r && r.trim()))],
    };

    // Modifiers
    data.stat_modifiers = {
      strength: parseInt((document.getElementById('mod-strength') as HTMLInputElement).value) || 0,
      dexterity: parseInt((document.getElementById('mod-dexterity') as HTMLInputElement).value) || 0,
      constitution: parseInt((document.getElementById('mod-constitution') as HTMLInputElement).value) || 0,
      intelligence: parseInt((document.getElementById('mod-intelligence') as HTMLInputElement).value) || 0,
      wisdom: parseInt((document.getElementById('mod-wisdom') as HTMLInputElement).value) || 0,
      charisma: parseInt((document.getElementById('mod-charisma') as HTMLInputElement).value) || 0,
      max_health: parseInt((document.getElementById('mod-max-health') as HTMLInputElement).value) || 0,
      max_mana: parseInt((document.getElementById('mod-max-mana') as HTMLInputElement).value) || 0,
    };
    data.stealth_modifier = parseInt((document.getElementById('mod-stealth') as HTMLInputElement).value) || 0;
    data.spellcasting_modifier = parseInt((document.getElementById('mod-spellcasting') as HTMLInputElement).value) || 0;
    data.lockpicking_modifier = parseInt((document.getElementById('mod-lockpicking') as HTMLInputElement).value) || 0;
    data.perception_modifier = parseInt((document.getElementById('mod-perception') as HTMLInputElement).value) || 0;
    data.critical_chance_modifier = parseInt((document.getElementById('mod-critical') as HTMLInputElement).value) || 0;
    data.magic_resistance_modifier = parseInt((document.getElementById('mod-magic-resist') as HTMLInputElement).value) || 0;
    data.trap_modifier = parseInt((document.getElementById('mod-trap') as HTMLInputElement).value) || 0;

    return data;
  }

  // ============================================================================
  // Preview
  // ============================================================================

  function updatePreview(t: ItemTemplate): void {
    let html = `
      <div class="preview-name">${escapeHtml(t.name)}</div>
      <div class="preview-badges">
        <span class="itype-badge ${t.item_type}">${escapeHtml(t.item_type)}</span>
        ${t.rarity && t.rarity !== 'common' ? `<span class="itype-badge" style="background:#2a2a1a;color:#fbbf24;">${escapeHtml(t.rarity)}</span>` : ''}
      </div>
      ${t.long_desc ? `<div style="color:#aaa;font-size:0.85rem;margin-bottom:0.5rem;">${escapeHtml(t.long_desc)}</div>` : ''}
    `;

    html += `<div class="preview-stat"><span class="label">Weight:</span> ${t.weight}</div>`;
    html += `<div class="preview-stat"><span class="label">Value:</span> ${formatCopper(t.base_value)}</div>`;
    if (t.equipment_slot) html += `<div class="preview-stat"><span class="label">Slot:</span> ${t.equipment_slot}</div>`;

    // Type-specific
    if (t.item_type === 'weapon' && t.weapon_data) {
      const w = t.weapon_data;
      html += `<div class="preview-section"><div class="preview-section-title">Weapon</div>`;
      html += `<div class="preview-stat">Damage: ${w.min_damage}-${w.max_damage} (${w.damage_type})</div>`;
      html += `<div class="preview-stat">Speed: ${w.attack_speed}ms</div>`;
      if (w.crit_modifier) html += `<div class="preview-stat">Crit: +${w.crit_modifier}</div>`;
      if (w.allows_backstab) html += `<div class="preview-stat" style="color:#c084fc;">Allows Backstab</div>`;
      html += `</div>`;
    } else if (t.item_type === 'armor' && t.armor_data) {
      html += `<div class="preview-section"><div class="preview-section-title">Armor</div>`;
      html += `<div class="preview-stat">AC: ${t.armor_data.armor_class}, DR: ${t.armor_data.damage_resistance}</div>`;
      html += `<div class="preview-stat">Type: ${t.armor_data.armor_type || 'leather'}</div>`;
      html += `</div>`;
    }

    // Flags
    const flags = t.flags || {};
    const activeFlags = [];
    if (flags.two_handed) activeFlags.push('Two-Handed');
    if (flags.cursed) activeFlags.push('Cursed');
    if (flags.no_drop) activeFlags.push('No Drop');
    if (flags.hidden) activeFlags.push('Hidden');
    if (activeFlags.length > 0) {
      html += `<div class="preview-section"><div class="preview-section-title">Flags</div><div class="preview-stat">${activeFlags.join(', ')}</div></div>`;
    }

    previewContent.innerHTML = html;
  }

  function updateReferences(itemId: number): void {
    const refs: string[] = [];

    // Check drop tables (we need entries — fetch per table if needed, or check from templates)
    // For now, just show NPC merchants
    // TODO: Full drop table entry cross-reference requires fetching entries

    refContent.innerHTML = refs.length > 0
      ? `<ul class="ref-list">${refs.map(r => `<li>${r}</li>`).join('')}</ul>`
      : '<p class="no-refs">No references found</p>';
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async function saveTemplate(data: Record<string, unknown>, isNew: boolean): Promise<ItemTemplate | null> {
    try {
      const url = isNew ? '/api/items/templates' : `/api/items/templates/${selectedTemplateId}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        showToast(isNew ? 'Item created' : 'Item saved', 'success');
        await fetchTemplates();
        return result.template;
      } else {
        showToast(result.message || 'Failed to save item', 'error');
        return null;
      }
    } catch (error) {
      console.error('Failed to save item:', error);
      showToast('Failed to save item', 'error');
      return null;
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function updateCount(f: number, t: number): void {
    itemCount.textContent = f === t ? `${t}` : `${f}/${t}`;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // New item
  document.getElementById('new-item-btn')?.addEventListener('click', async () => {
    const result = await showPromptFields('New Item', [
      { key: 'name', label: 'Item Name', required: true, placeholder: 'iron sword' },
    ]);
    if (!result) return;

    const data: Record<string, unknown> = {
      name: result.name.toLowerCase(),
      item_type: 'misc',
      weight: 0, size: 0, base_value: 0, effect_slots: 0,
      keywords: result.name.toLowerCase().split(' '),
      flags: { takeable: true },
    };
    const saved = await saveTemplate(data, true);
    if (saved) selectTemplate(saved.id);
  });

  // Save
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedTemplateId) return;
    const data = gatherFormData();
    if (!(data.name as string)?.trim()) { showToast('Name is required', 'warning'); return; }
    const saved = await saveTemplate(data, false);
    if (saved) selectTemplate(saved.id);
  });

  // Delete
  document.getElementById('delete-item-btn')?.addEventListener('click', async () => {
    if (!selectedTemplateId) return;
    const t = templates.find(t => t.id === selectedTemplateId);
    const confirmed = await showConfirm(`Delete item "${t?.name || 'this item'}"?`, { confirmText: 'Delete', dangerous: true });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/items/templates/${selectedTemplateId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) { showToast('Item deleted', 'success'); await fetchTemplates(); clearForm(); }
      else showToast(data.message || 'Failed to delete', 'error');
    } catch { showToast('Failed to delete item', 'error'); }
  });

  // Duplicate
  document.getElementById('duplicate-item-btn')?.addEventListener('click', async () => {
    if (!selectedTemplateId) return;
    const result = await showPromptFields('Duplicate Item', [
      { key: 'name', label: 'Item Name', required: true, defaultValue: nameInput.value + ' (copy)' },
    ]);
    if (!result) return;
    const data = { ...gatherFormData(), name: result.name.toLowerCase() };
    const saved = await saveTemplate(data, true);
    if (saved) selectTemplate(saved.id);
  });

  // Type change
  itemTypeSelect.addEventListener('change', () => updateTypeSections(itemTypeSelect.value));

  // Spawn
  document.getElementById('spawn-btn')?.addEventListener('click', async () => {
    if (!selectedTemplateId) return;
    const roomId = spawnRoomSelect.getValue();
    const qty = parseInt((document.getElementById('spawn-quantity') as HTMLInputElement).value) || 1;
    if (!roomId) { showToast('Select a room', 'warning'); return; }
    const parsedRoomId = parseInt(roomId);
    if (isNaN(parsedRoomId)) { showToast('Invalid room ID', 'warning'); return; }

    try {
      const res = await fetch('/api/items/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ template_id: selectedTemplateId, room_id: parsedRoomId, quantity: qty }),
      });
      const data = await res.json();
      if (data.success) showToast(`Spawned ${qty} item(s) in room`, 'success');
      else showToast(data.message || 'Spawn failed', 'error');
    } catch { showToast('Spawn failed', 'error'); }
  });

  // Import
  document.getElementById('import-btn')?.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const items = data.templates || data.items || data;
        if (!Array.isArray(items) || items.length === 0) { showToast('No items found', 'warning'); return; }
        const confirmed = await showConfirm(`Import ${items.length} item(s)?`);
        if (!confirmed) return;

        const res = await fetch('/api/items/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ templates: items, merge: true }),
        });
        if (!res.ok) { showToast(`Import failed: ${res.status}`, 'error'); return; }
        const result = await res.json();
        if (result.success) {
          showToast(`Imported: ${result.results?.created || 0} created, ${result.results?.updated || 0} updated`, 'success');
          await fetchTemplates();
        } else showToast(result.message || 'Import failed', 'error');
      } catch { showToast('Failed to parse import file', 'error'); }
    });
    fileInput.click();
  });

  // Export
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/items/export', { credentials: 'include' });
      if (!res.ok) { showToast('Export failed', 'error'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'items_export.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${templates.length} item${templates.length === 1 ? '' : 's'}`, 'success');
    } catch { showToast('Export failed', 'error'); }
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchTemplates(), fetchRooms(), fetchClasses(), fetchRaces(), fetchDropTables(), fetchNpcTemplates()]);
  initSpawnRoomSelect();
  renderClassButtons();
  renderRaceButtons();
})();
