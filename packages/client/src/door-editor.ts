/**
 * Door Editor — three-panel with type-driven tabs, SearchableSelect for rooms,
 * lock presets, dynamic class buttons, connection diagram preview.
 */

import { initAuth, SearchableSelect, setupTabs, activateTab, showToast, showConfirm, showPromptFields, escapeHtml } from './components/index.js';
import type { SelectOption } from './components/index.js';
import { renderNav } from './components/nav.js';

interface Door {
  id: number;
  name: string;
  displayName: string | null;
  doorType: string;
  description: string | null;
  entryRoomId: number;
  entryDirection: string;
  exitRoomId: number | null;
  exitDirection: string | null;
  defaultState: string;
  autoResetSeconds: number | null;
  hasLock: boolean;
  keyItemTag: string | null;
  pickDifficultyMin: number;
  pickDifficultyMax: number;
  bashDifficulty: number;
  isHidden: boolean;
  triggerText: string | null;
  passageMessageSelf: string | null;
  passageMessageRoom: string | null;
  passageMessageArrival: string | null;
  itemDisplayName: string | null;
  isTemporary: boolean;
  spawnTriggerText: string | null;
  durationSeconds: number | null;
  appearMessage: string | null;
  disappearMessage: string | null;
  requiredLevel: number | null;
  maxLevel: number | null;
  requiredClasses: string[] | null;
  requiredQuestFlag: string | null;
  requiredItemTag: string | null;
  denialMessage: string | null;
}

interface Room {
  id: number;
  name: string;
  area: string | null;
  exits?: Record<string, number>; // { direction: targetRoomId }
}

interface ClassDef {
  id: string;
  displayName: string;
}

// Tab visibility per door type
const TYPE_TABS: Record<string, string[]> = {
  open_passageway: ['basic', 'rooms'],
  physical: ['basic', 'rooms', 'state', 'locks', 'permissions'],
  special: ['basic', 'rooms', 'triggers', 'permissions'],
  triggered_passageway: ['basic', 'rooms', 'triggers', 'permissions'],
  temporary_portal: ['basic', 'rooms', 'triggers', 'portal', 'permissions'],
};

const ALL_TABS = ['basic', 'rooms', 'state', 'locks', 'triggers', 'portal', 'permissions'];

(async function () {
  renderNav({ activePage: 'door-editor', helpDoc: 'Door_System_Guide.md' });
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let doors: Door[] = [];
  let rooms: Room[] = [];
  let classDefs: ClassDef[] = [];
  let selectedDoorId: number | null = null;
  let selectedClasses: Set<string> = new Set();
  let viewMode: 'doors' | 'exits' = 'doors';

  // ============================================================================
  // DOM
  // ============================================================================

  const doorForm = document.getElementById('door-form') as HTMLFormElement;
  const noDoorSelected = document.getElementById('no-door-selected') as HTMLDivElement;
  const formTitle = document.getElementById('door-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('door-id-display') as HTMLSpanElement;
  const doorCount = document.getElementById('door-count') as HTMLSpanElement;
  const previewContent = document.getElementById('preview-content') as HTMLDivElement;
  const doorList = document.getElementById('door-list') as HTMLUListElement;
  const classButtonsContainer = document.getElementById('class-buttons') as HTMLDivElement;

  // Filters
  const areaFilter = document.getElementById('area-filter') as HTMLSelectElement;
  const roomFilter = document.getElementById('room-filter') as HTMLSelectElement;
  const typeFilter = document.getElementById('type-filter') as HTMLSelectElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;

  // Basic
  const nameInput = document.getElementById('door-name') as HTMLInputElement;
  const doorTypeSelect = document.getElementById('door-type') as HTMLSelectElement;
  const displayNameInput = document.getElementById('door-display-name') as HTMLInputElement;
  const hiddenCheckbox = document.getElementById('door-hidden') as HTMLInputElement;
  const descriptionInput = document.getElementById('door-description') as HTMLTextAreaElement;

  // Room direction selects
  const entryDirectionSelect = document.getElementById('entry-direction') as HTMLSelectElement;
  const exitDirectionSelect = document.getElementById('exit-direction') as HTMLSelectElement;

  // State
  const defaultStateSelect = document.getElementById('default-state') as HTMLSelectElement;
  const autoResetInput = document.getElementById('auto-reset-seconds') as HTMLInputElement;

  // Locks
  const hasLockCheckbox = document.getElementById('has-lock') as HTMLInputElement;
  const lockOptions = document.getElementById('lock-options') as HTMLDivElement;
  const keyItemTagInput = document.getElementById('key-item-tag') as HTMLInputElement;
  const pickMinInput = document.getElementById('pick-difficulty-min') as HTMLInputElement;
  const pickMaxInput = document.getElementById('pick-difficulty-max') as HTMLInputElement;
  const bashInput = document.getElementById('bash-difficulty') as HTMLInputElement;

  // Triggers
  const triggerTextInput = document.getElementById('trigger-text') as HTMLInputElement;
  const passageSelfInput = document.getElementById('passage-message-self') as HTMLInputElement;
  const passageRoomInput = document.getElementById('passage-message-room') as HTMLInputElement;
  const passageArrivalInput = document.getElementById('passage-message-arrival') as HTMLInputElement;
  const itemDisplayNameInput = document.getElementById('item-display-name') as HTMLInputElement;

  // Portal
  const spawnTriggerInput = document.getElementById('spawn-trigger-text') as HTMLInputElement;
  const durationInput = document.getElementById('duration-seconds') as HTMLInputElement;
  const appearMsgInput = document.getElementById('appear-message') as HTMLInputElement;
  const disappearMsgInput = document.getElementById('disappear-message') as HTMLInputElement;

  // Permissions
  const requiredLevelInput = document.getElementById('required-level') as HTMLInputElement;
  const maxLevelInput = document.getElementById('max-level') as HTMLInputElement;
  const questFlagInput = document.getElementById('required-quest-flag') as HTMLInputElement;
  const itemTagInput = document.getElementById('required-item-tag') as HTMLInputElement;
  const denialMsgInput = document.getElementById('denial-message') as HTMLTextAreaElement;

  // ============================================================================
  // Room SearchableSelect
  // ============================================================================

  let entryRoomSelect: SearchableSelect;
  let exitRoomSelect: SearchableSelect;

  function getRoomOptions(): SelectOption[] {
    return [...rooms]
      .sort((a, b) => (a.area || '').localeCompare(b.area || '') || a.name.localeCompare(b.name))
      .map(r => ({
        value: String(r.id),
        label: r.name,
        group: r.area || 'No Area',
        detail: `#${r.id}`,
      }));
  }

  function initRoomSelects(): void {
    const options = getRoomOptions();

    entryRoomSelect = new SearchableSelect({
      container: document.getElementById('entry-room-select-container')!,
      placeholder: 'Search rooms...',
      options,
      onChange: () => {},
    });

    exitRoomSelect = new SearchableSelect({
      container: document.getElementById('exit-room-select-container')!,
      placeholder: 'Search rooms... (empty = one-way)',
      options: [{ value: '', label: '(None — one-way door)' }, ...options],
      clearable: true,
      onChange: () => {},
    });
  }

  // ============================================================================
  // Tabs
  // ============================================================================

  setupTabs({ container: doorForm });

  function updateVisibleTabs(doorType: string): void {
    const visibleTabs = TYPE_TABS[doorType] || ['basic', 'rooms'];
    for (const tab of ALL_TABS) {
      const btn = doorForm.querySelector(`.tab-btn[data-tab="${tab}"]`) as HTMLElement | null;
      if (btn) {
        btn.classList.toggle('tab-hidden', !visibleTabs.includes(tab));
      }
    }
    // If active tab is now hidden, switch to basic
    const activeBtn = doorForm.querySelector('.tab-btn.active') as HTMLElement | null;
    if (activeBtn?.classList.contains('tab-hidden')) {
      activateTab('basic', { container: doorForm });
    }
  }

  // ============================================================================
  // API
  // ============================================================================

  async function fetchDoors(): Promise<void> {
    try {
      const res = await fetch('/api/doors', { credentials: 'include' });
      const data = await res.json();
      doors = data.success ? (data.doors || []) : [];
    } catch (error) {
      console.error('Failed to fetch doors:', error);
      showToast('Failed to load doors', 'error');
    }
  }

  async function fetchRooms(): Promise<void> {
    try {
      const res = await fetch('/api/rooms', { credentials: 'include' });
      const data = await res.json();
      if (data.success === false) {
        console.error('Failed to fetch rooms:', data.message);
        rooms = [];
        return;
      }
      rooms = data.rooms || [];
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      showToast('Failed to load rooms', 'error');
    }
  }

  async function fetchClasses(): Promise<void> {
    try {
      const res = await fetch('/api/progression/classes', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        classDefs = (data.classes || []).map((c: Record<string, unknown>) => ({
          id: (c.class_id || c.id) as string,
          displayName: (c.display_name || c.displayName || c.class_id || c.id) as string,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      showToast('Failed to fetch class data', 'error');
    }
  }

  // ============================================================================
  // List Rendering
  // ============================================================================

  function getRoomName(roomId: number | null): string {
    if (!roomId) return '(none)';
    const room = rooms.find(r => r.id === roomId);
    return room ? room.name : `#${roomId}`;
  }

  function populateAreaFilter(): void {
    const areas = [...new Set(rooms.map(r => r.area).filter(Boolean))].sort() as string[];
    areaFilter.innerHTML = '<option value="">All Areas</option>' +
      areas.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
  }

  function updateRoomFilter(): void {
    const area = areaFilter.value;
    const filtered = area ? rooms.filter(r => r.area === area) : rooms;
    roomFilter.innerHTML = '<option value="">All Rooms</option>' +
      filtered.sort((a, b) => a.name.localeCompare(b.name))
        .map(r => `<option value="${r.id}">${escapeHtml(r.name)} (#${r.id})</option>`).join('');
  }

  function renderList(): void {
    if (viewMode === 'doors') {
      renderDoorList();
    } else {
      renderExitList();
    }
  }

  function renderDoorList(): void {
    const area = areaFilter.value;
    const roomId = roomFilter.value ? parseInt(roomFilter.value) : null;
    const type = typeFilter.value;
    const search = searchInput.value.toLowerCase();

    const filtered = doors.filter(d => {
      if (area) {
        const entryRoom = rooms.find(r => r.id === d.entryRoomId);
        const exitRoom = rooms.find(r => r.id === d.exitRoomId);
        if ((!entryRoom || entryRoom.area !== area) && (!exitRoom || exitRoom.area !== area)) return false;
      }
      if (roomId && d.entryRoomId !== roomId && d.exitRoomId !== roomId) return false;
      if (type && d.doorType !== type) return false;
      if (search && !d.name.toLowerCase().includes(search) && !(d.description || '').toLowerCase().includes(search)) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));

    doorList.innerHTML = '';
    for (const door of filtered) {
      const li = document.createElement('li');
      if (door.id === selectedDoorId) li.className = 'selected';
      li.innerHTML = `
        <div class="door-name">${escapeHtml(door.name)}</div>
        <div class="door-meta">
          <span class="dtype-badge ${door.doorType}">${formatDoorType(door.doorType)}</span>
          <span class="door-rooms">${escapeHtml(getRoomName(door.entryRoomId))} → ${escapeHtml(getRoomName(door.exitRoomId))}</span>
        </div>
      `;
      li.addEventListener('click', () => selectDoor(door.id));
      doorList.appendChild(li);
    }

    doorCount.textContent = `${filtered.length}/${doors.length}`;
  }

  function renderExitList(): void {
    const area = areaFilter.value;
    const roomId = roomFilter.value ? parseInt(roomFilter.value) : null;
    const search = searchInput.value.toLowerCase();

    // Build exit list from room data
    const exits: Array<{ fromRoom: Room; direction: string; toRoomId: number; hasDoor: boolean; doorId?: number }> = [];

    for (const room of rooms) {
      if (area && room.area !== area) continue;
      if (roomId && room.id !== roomId) continue;

      const roomExits = room.exits || {};
      for (const [direction, targetRoomId] of Object.entries(roomExits)) {
        if (search) {
          const targetRoom = rooms.find(r => r.id === targetRoomId);
          const targetName = targetRoom?.name?.toLowerCase() || '';
          if (!room.name.toLowerCase().includes(search) &&
              !targetName.includes(search) &&
              !direction.toLowerCase().includes(search) &&
              !(room.area?.toLowerCase().includes(search) ?? false)) continue;
        }
        // Check both entry and exit sides — a door from the other side also covers this exit
        const door = doors.find(d =>
          (d.entryRoomId === room.id && d.entryDirection === direction) ||
          (d.exitRoomId === room.id && d.exitDirection === direction)
        );
        exits.push({
          fromRoom: room,
          direction,
          toRoomId: targetRoomId,
          hasDoor: !!door,
          doorId: door?.id,
        });
      }
    }

    exits.sort((a, b) => (a.fromRoom.area || '').localeCompare(b.fromRoom.area || '') || a.fromRoom.name.localeCompare(b.fromRoom.name) || a.direction.localeCompare(b.direction));

    doorList.innerHTML = '';
    for (const exit of exits) {
      const li = document.createElement('li');
      li.className = 'exit-item';
      const targetName = getRoomName(exit.toRoomId);
      li.innerHTML = `
        <div class="exit-info">
          <span class="exit-dir">${escapeHtml(exit.direction)}</span>
          <span class="exit-room">${escapeHtml(exit.fromRoom.name)} → ${escapeHtml(targetName)}</span>
          ${exit.hasDoor
            ? `<span class="exit-status" style="color: #4ade80;">Has door</span>`
            : `<button type="button" class="exit-add-btn" data-from="${exit.fromRoom.id}" data-dir="${exit.direction}" data-to="${exit.toRoomId}">+ Door</button>`
          }
        </div>
      `;

      if (exit.hasDoor && exit.doorId) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => selectDoor(exit.doorId!));
      }

      doorList.appendChild(li);
    }

    // Wire up "+ Door" buttons
    doorList.querySelectorAll('.exit-add-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = e.target as HTMLElement;
        const fromId = parseInt(el.dataset.from!);
        const dir = el.dataset.dir!;
        const toId = parseInt(el.dataset.to!);
        await createDoorFromExit(fromId, dir, toId);
      });
    });

    doorCount.textContent = `${exits.length} exits`;
  }

  // ============================================================================
  // Selection
  // ============================================================================

  async function selectDoor(id: number): Promise<void> {
    // Fetch fresh data
    try {
      const res = await fetch(`/api/doors/${id}`, { credentials: 'include' });
      const data = await res.json();
      if (!data.success) { showToast('Failed to load door', 'error'); return; }

      const door: Door = data.door;
      selectedDoorId = id;

      noDoorSelected.style.display = 'none';
      doorForm.style.display = 'block';
      formTitle.textContent = 'Edit Door';
      idDisplay.textContent = `ID: ${door.id}`;

      // Basic
      nameInput.value = door.name;
      doorTypeSelect.value = door.doorType;
      displayNameInput.value = door.displayName || '';
      hiddenCheckbox.checked = door.isHidden;
      descriptionInput.value = door.description || '';

      // Rooms
      entryRoomSelect.setValue(String(door.entryRoomId));
      entryDirectionSelect.value = door.entryDirection;
      exitRoomSelect.setValue(door.exitRoomId ? String(door.exitRoomId) : '');
      exitDirectionSelect.value = door.exitDirection || '';

      // State
      defaultStateSelect.value = door.defaultState || 'closed';
      autoResetInput.value = String(door.autoResetSeconds || 0);

      // Locks
      hasLockCheckbox.checked = door.hasLock;
      lockOptions.style.display = door.hasLock ? 'block' : 'none';
      keyItemTagInput.value = door.keyItemTag || '';
      pickMinInput.value = String(door.pickDifficultyMin || 0);
      pickMaxInput.value = String(door.pickDifficultyMax || 0);
      bashInput.value = String(door.bashDifficulty || 0);

      // Triggers
      triggerTextInput.value = door.triggerText || '';
      passageSelfInput.value = door.passageMessageSelf || '';
      passageRoomInput.value = door.passageMessageRoom || '';
      passageArrivalInput.value = door.passageMessageArrival || '';
      itemDisplayNameInput.value = door.itemDisplayName || '';

      // Portal
      spawnTriggerInput.value = door.spawnTriggerText || '';
      durationInput.value = String(door.durationSeconds ?? 60);
      appearMsgInput.value = door.appearMessage || '';
      disappearMsgInput.value = door.disappearMessage || '';

      // Permissions
      requiredLevelInput.value = String(door.requiredLevel || 0);
      maxLevelInput.value = String(door.maxLevel || 0);
      selectedClasses = new Set(
        (door.requiredClasses || [])
          .filter(c => c && c.trim())
          .map(c => { const m = classDefs.find(cd => cd.id.toLowerCase() === c.toLowerCase()); return m ? m.id : c; })
      );
      renderClassButtons();
      questFlagInput.value = door.requiredQuestFlag || '';
      itemTagInput.value = door.requiredItemTag || '';
      denialMsgInput.value = door.denialMessage || '';

      // Update visibility and preview
      updateVisibleTabs(door.doorType);
      activateTab('basic', { container: doorForm });
      updatePreview(door);
      renderList();
    } catch (error) {
      console.error('Failed to load door:', error);
      showToast('Failed to load door', 'error');
    }
  }

  function clearForm(): void {
    selectedDoorId = null;
    noDoorSelected.style.display = 'flex';
    doorForm.style.display = 'none';
    idDisplay.textContent = '';
    previewContent.innerHTML = '<p class="hint">Select a door to see preview</p>';
    renderList();
  }

  // ============================================================================
  // Class Buttons
  // ============================================================================

  function renderClassButtons(): void {
    classButtonsContainer.innerHTML = '';
    for (const cls of classDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `class-btn${selectedClasses.has(cls.id) ? ' selected' : ''}`;
      btn.textContent = cls.displayName;
      btn.addEventListener('click', () => {
        if (selectedClasses.has(cls.id)) {
          selectedClasses.delete(cls.id);
          btn.classList.remove('selected');
        } else {
          selectedClasses.add(cls.id);
          btn.classList.add('selected');
        }
      });
      classButtonsContainer.appendChild(btn);
    }
  }

  // ============================================================================
  // Preview
  // ============================================================================

  function updatePreview(door: Door): void {
    const entryName = getRoomName(door.entryRoomId);
    const exitName = getRoomName(door.exitRoomId);

    let html = `
      <div class="preview-name">${escapeHtml(door.displayName || door.name)}</div>
      <div class="preview-badges">
        <span class="dtype-badge ${door.doorType}">${formatDoorType(door.doorType)}</span>
        ${door.isHidden ? '<span class="dtype-badge" style="background:#3a3a1a;color:#fbbf24;">hidden</span>' : ''}
      </div>
      ${door.description ? `<div style="color:#aaa;font-size:0.85rem;margin-bottom:0.75rem;">${escapeHtml(door.description)}</div>` : ''}
    `;

    // Connection diagram
    html += `<div class="connection-diagram">
      <div class="room-box">${escapeHtml(entryName)}</div>
      <div class="direction-arrow">↓ ${escapeHtml(door.entryDirection)} ↓</div>
      <div class="room-box">${escapeHtml(door.name)}</div>
      ${door.exitRoomId ? `<div class="direction-arrow">↓ ${escapeHtml(door.exitDirection || '?')} ↓</div><div class="room-box">${escapeHtml(exitName)}</div>` : '<div style="color:#555;font-size:0.75rem;margin-top:0.3rem;">(one-way)</div>'}
    </div>`;

    // Type-specific info
    if (door.doorType === 'physical') {
      html += `<div class="preview-section"><div class="preview-section-title">State</div>`;
      html += `<div class="preview-stat"><span class="label">Default:</span> ${door.defaultState}</div>`;
      if (door.autoResetSeconds) html += `<div class="preview-stat"><span class="label">Auto-reset:</span> ${door.autoResetSeconds}s</div>`;
      if (door.hasLock) {
        const pickAvg = Math.round((door.pickDifficultyMin + door.pickDifficultyMax) / 2);
        const pickLabel = (door.pickDifficultyMin >= 500 && door.pickDifficultyMax >= 500) ? 'Unpickable' : pickAvg <= 30 ? 'Easy' : pickAvg <= 60 ? 'Moderate' : pickAvg <= 90 ? 'Hard' : 'Very Hard';
        html += `<div class="preview-stat"><span class="label">Pick:</span> ${door.pickDifficultyMin}-${door.pickDifficultyMax} (${pickLabel})</div>`;
        html += `<div class="preview-stat"><span class="label">Bash:</span> ${door.bashDifficulty}${door.bashDifficulty >= 500 ? ' (Unbashable)' : ''}</div>`;
        if (door.keyItemTag) html += `<div class="preview-stat"><span class="label">Key:</span> ${escapeHtml(door.keyItemTag)}</div>`;
      }
      html += `</div>`;
    }

    if (door.triggerText) {
      html += `<div class="preview-section"><div class="preview-section-title">Trigger</div>`;
      html += `<div class="preview-stat">"${escapeHtml(door.triggerText)}"</div>`;
      html += `</div>`;
    }

    if (door.requiredLevel || door.maxLevel || door.requiredQuestFlag || door.requiredItemTag || (door.requiredClasses && door.requiredClasses.length > 0)) {
      html += `<div class="preview-section"><div class="preview-section-title">Permissions</div>`;
      if (door.requiredLevel && door.maxLevel) {
        html += `<div class="preview-stat"><span class="label">Level:</span> ${door.requiredLevel}-${door.maxLevel}</div>`;
      } else if (door.requiredLevel) {
        html += `<div class="preview-stat"><span class="label">Level:</span> ${door.requiredLevel}+</div>`;
      } else if (door.maxLevel) {
        html += `<div class="preview-stat"><span class="label">Max Level:</span> ${door.maxLevel}</div>`;
      }
      if (door.requiredClasses && door.requiredClasses.length > 0) {
        const names = door.requiredClasses.map(id => escapeHtml(classDefs.find(c => c.id === id)?.displayName || id));
        html += `<div class="preview-stat"><span class="label">Classes:</span> ${names.join(', ')}</div>`;
      }
      if (door.requiredQuestFlag) html += `<div class="preview-stat"><span class="label">Quest:</span> ${escapeHtml(door.requiredQuestFlag)}</div>`;
      if (door.requiredItemTag) html += `<div class="preview-stat"><span class="label">Item:</span> ${escapeHtml(door.requiredItemTag)}</div>`;
      if (door.denialMessage) html += `<div class="preview-stat"><span class="label">Denial:</span> "${escapeHtml(door.denialMessage)}"</div>`;
      html += `</div>`;
    }

    previewContent.innerHTML = html;
  }

  // ============================================================================
  // Gather Form Data
  // ============================================================================

  function gatherFormData(): Partial<Door> {
    return {
      name: nameInput.value.trim(),
      doorType: doorTypeSelect.value,
      displayName: displayNameInput.value.trim() || null,
      description: descriptionInput.value.trim() || null,
      isHidden: hiddenCheckbox.checked,
      entryRoomId: parseInt(entryRoomSelect.getValue() || '0'),
      entryDirection: entryDirectionSelect.value,
      exitRoomId: exitRoomSelect.getValue() ? parseInt(exitRoomSelect.getValue()!) : null,
      exitDirection: exitDirectionSelect.value || null,
      defaultState: defaultStateSelect.value,
      autoResetSeconds: Number.isFinite(parseInt(autoResetInput.value)) ? parseInt(autoResetInput.value) : null,
      hasLock: hasLockCheckbox.checked,
      keyItemTag: keyItemTagInput.value.trim() || null,
      pickDifficultyMin: parseInt(pickMinInput.value) || 0,
      pickDifficultyMax: parseInt(pickMaxInput.value) || 0,
      bashDifficulty: parseInt(bashInput.value) || 0,
      triggerText: triggerTextInput.value.trim() || null,
      passageMessageSelf: passageSelfInput.value.trim() || null,
      passageMessageRoom: passageRoomInput.value.trim() || null,
      passageMessageArrival: passageArrivalInput.value.trim() || null,
      itemDisplayName: itemDisplayNameInput.value.trim() || null,
      isTemporary: doorTypeSelect.value === 'temporary_portal',
      spawnTriggerText: spawnTriggerInput.value.trim() || null,
      durationSeconds: Number.isFinite(parseInt(durationInput.value)) ? parseInt(durationInput.value) : null,
      appearMessage: appearMsgInput.value.trim() || null,
      disappearMessage: disappearMsgInput.value.trim() || null,
      requiredLevel: parseInt(requiredLevelInput.value) || null,
      maxLevel: parseInt(maxLevelInput.value) || null,
      requiredClasses: (() => { const cls = [...new Set(Array.from(selectedClasses).filter(c => c && c.trim()))]; return cls.length > 0 ? cls : null; })(),
      requiredQuestFlag: questFlagInput.value.trim() || null,
      requiredItemTag: itemTagInput.value.trim() || null,
      denialMessage: denialMsgInput.value.trim() || null,
    };
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async function saveDoor(doorData: Partial<Door>, isNew: boolean): Promise<Door | null> {
    try {
      const url = isNew ? '/api/doors' : `/api/doors/${selectedDoorId}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(doorData),
      });

      const data = await res.json();
      if (data.success) {
        showToast(isNew ? 'Door created' : 'Door saved', 'success');
        await fetchDoors();
        return data.door;
      } else {
        showToast(data.message || 'Failed to save door', 'error');
        return null;
      }
    } catch (error) {
      console.error('Failed to save door:', error);
      showToast('Failed to save door', 'error');
      return null;
    }
  }

  async function createDoorFromExit(fromRoomId: number, direction: string, toRoomId: number): Promise<void> {
    const fromRoom = rooms.find(r => r.id === fromRoomId);
    const toRoom = rooms.find(r => r.id === toRoomId);
    const defaultName = `${fromRoom?.name || 'Room'} ${direction} door`;

    const result = await showPromptFields('New Door from Exit', [
      { key: 'name', label: 'Door Name', required: true, defaultValue: defaultName },
    ]);
    if (!result) return;

    // Compute reverse direction
    const reverseDir: Record<string, string> = {
      north: 'south', south: 'north', east: 'west', west: 'east',
      up: 'down', down: 'up', northeast: 'southwest', northwest: 'southeast',
      southeast: 'northwest', southwest: 'northeast',
    };

    const doorData: Partial<Door> = {
      name: result.name,
      doorType: 'physical',
      entryRoomId: fromRoomId,
      entryDirection: direction,
      exitRoomId: toRoomId,
      exitDirection: reverseDir[direction] || null,
      defaultState: 'closed',
      hasLock: false,
      isHidden: false,
      pickDifficultyMin: 0,
      pickDifficultyMax: 0,
      bashDifficulty: 0,
    };

    const saved = await saveDoor(doorData, true);
    if (saved) {
      await fetchDoors();
      await selectDoor(saved.id);
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function formatDoorType(type: string): string {
    return type.replace(/_/g, ' ');
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // New door
  document.getElementById('new-door-btn')?.addEventListener('click', async () => {
    const defaultEntryRoomId = rooms[0]?.id;
    if (defaultEntryRoomId === undefined) {
      showToast('No rooms available. Please create rooms first.', 'error');
      return;
    }

    const result = await showPromptFields('New Door', [
      { key: 'name', label: 'Door Name', required: true, placeholder: 'Main Gate' },
    ]);
    if (!result) return;

    const doorData: Partial<Door> = {
      name: result.name,
      doorType: 'physical',
      entryRoomId: defaultEntryRoomId,
      entryDirection: 'north',
      defaultState: 'closed',
      hasLock: false,
      isHidden: false,
      pickDifficultyMin: 0,
      pickDifficultyMax: 0,
      bashDifficulty: 0,
    };

    const saved = await saveDoor(doorData, true);
    if (saved) {
      await fetchDoors();
      await selectDoor(saved.id);
    }
  });

  // Save
  doorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedDoorId) return;

    const data = gatherFormData();
    if (!data.name?.trim()) {
      showToast('Name is required', 'warning');
      return;
    }
    if (!data.entryRoomId) {
      showToast('Entry room is required', 'warning');
      return;
    }

    // Validate level range
    if (data.requiredLevel && data.maxLevel && data.maxLevel < data.requiredLevel) {
      showToast('Max level must be >= min level', 'warning');
      return;
    }

    const saved = await saveDoor(data, false);
    if (saved) await selectDoor(saved.id);
  });

  // Delete
  document.getElementById('delete-door-btn')?.addEventListener('click', async () => {
    if (!selectedDoorId) return;
    const door = doors.find(d => d.id === selectedDoorId);
    const confirmed = await showConfirm(
      `Delete door "${door?.name || 'this door'}"?`,
      { confirmText: 'Delete', dangerous: true },
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/doors/${selectedDoorId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        showToast('Door deleted', 'success');
        await fetchDoors();
        clearForm();
      } else {
        showToast(data.message || 'Failed to delete', 'error');
      }
    } catch (error) {
      showToast('Failed to delete door', 'error');
    }
  });

  // Duplicate
  document.getElementById('duplicate-door-btn')?.addEventListener('click', async () => {
    if (!selectedDoorId) return;
    const result = await showPromptFields('Duplicate Door', [
      { key: 'name', label: 'Door Name', required: true, defaultValue: nameInput.value + ' (copy)' },
    ]);
    if (!result) return;

    const data = { ...gatherFormData(), name: result.name };
    const saved = await saveDoor(data, true);
    if (saved) {
      await selectDoor(saved.id);
    }
  });

  // Door type change -> update visible tabs
  doorTypeSelect.addEventListener('change', () => {
    updateVisibleTabs(doorTypeSelect.value);
  });

  // Has lock toggle
  hasLockCheckbox.addEventListener('change', () => {
    lockOptions.style.display = hasLockCheckbox.checked ? 'block' : 'none';
  });

  // Lock presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      pickMinInput.value = el.dataset.pickMin || '0';
      pickMaxInput.value = el.dataset.pickMax || '0';
      bashInput.value = el.dataset.bash || '0';
    });
  });

  // View toggle
  document.getElementById('view-doors-btn')?.addEventListener('click', () => {
    viewMode = 'doors';
    document.getElementById('view-doors-btn')!.classList.add('active');
    document.getElementById('view-exits-btn')!.classList.remove('active');
    renderList();
  });

  document.getElementById('view-exits-btn')?.addEventListener('click', () => {
    viewMode = 'exits';
    document.getElementById('view-exits-btn')!.classList.add('active');
    document.getElementById('view-doors-btn')!.classList.remove('active');
    renderList();
  });

  // Filters
  areaFilter.addEventListener('change', () => { updateRoomFilter(); renderList(); });
  roomFilter.addEventListener('change', renderList);
  typeFilter.addEventListener('change', renderList);
  searchInput.addEventListener('input', renderList);

  // Export
  document.getElementById('export-btn')?.addEventListener('click', () => {
    if (doors.length === 0) {
      showToast('No doors to export', 'warning');
      return;
    }

    const blob = new Blob([JSON.stringify({ doors }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'doors_export.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${doors.length} doors`, 'success');
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchDoors(), fetchRooms(), fetchClasses()]);
  populateAreaFilter();
  updateRoomFilter();
  initRoomSelects();
  renderClassButtons();
  renderList();

  // Handle URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const doorIdParam = urlParams.get('doorId');
  const newDoorForRoomParam = urlParams.get('newDoorForRoom');

  if (doorIdParam) {
    const doorId = parseInt(doorIdParam);
    if (!Number.isNaN(doorId) && doors.find(d => d.id === doorId)) {
      await selectDoor(doorId);
    }
  } else if (newDoorForRoomParam) {
    const roomId = parseInt(newDoorForRoomParam);
    if (Number.isNaN(roomId)) {
      showToast('Invalid room ID in URL', 'error');
    } else if (!rooms.find(r => r.id === roomId)) {
      showToast(`Room #${roomId} not found`, 'error');
    } else {
      const result = await showPromptFields('New Door', [
        { key: 'name', label: 'Door Name', required: true, placeholder: 'Main Gate' },
      ]);
      if (result) {
        const doorData: Partial<Door> = {
          name: result.name,
          doorType: 'physical',
          entryRoomId: roomId,
          entryDirection: 'north',
          defaultState: 'closed',
          hasLock: false,
          isHidden: false,
          pickDifficultyMin: 0,
          pickDifficultyMax: 0,
          bashDifficulty: 0,
        };
        const saved = await saveDoor(doorData, true);
        if (saved) {
          await fetchDoors();
          await selectDoor(saved.id);
        }
      }
    }
    // Clean URL parameters after handling
    window.history.replaceState({}, '', window.location.pathname);
  }
})();
