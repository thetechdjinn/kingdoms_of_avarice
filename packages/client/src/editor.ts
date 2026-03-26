import {
  initAuth, showToast, showConfirm, showPrompt, showPromptFields,
  setupTabs, escapeHtml, ListPanel, SearchableSelect, ChipTagInput,
} from './components/index.js';
import { renderNav } from './components/nav.js';
import type { SelectOption } from './components/index.js';

// ============================================================================
// Types
// ============================================================================

type DoorType = 'open_passageway' | 'physical' | 'special' | 'triggered_passageway' | 'temporary_portal';

interface RoomTrainingConfig {
  enabled: boolean;
  allowedClasses?: string[] | null;
  minLevel?: number;
  maxLevel?: number;
}

interface RoomRespawnConfig {
  enabled: boolean;
  priority?: number;
  servedAreas?: string[];
}

interface RoomFeatures {
  training?: RoomTrainingConfig;
  respawn?: RoomRespawnConfig;
  bank?: { enabled: boolean };
}

interface Room {
  id: number;
  name: string;
  description: string | null;
  area: string | null;
  terrain: string;
  darkness_level: number;
  tag: string | null;
  exits: Record<string, number>;
  features: RoomFeatures;
}

interface Door {
  id: number;
  name: string;
  doorType: DoorType;
  entryRoomId: number;
  entryDirection: string;
  exitRoomId: number | null;
  exitDirection: string | null;
  triggerText: string | null;
  isHidden: boolean;
}

interface ClassDef {
  id: string;
  displayName: string;
}

interface RoomLayoutInfo {
  x: number;
  y: number;
  level: number;
}

// ============================================================================
// Main
// ============================================================================

(async function () {
  renderNav({ activePage: 'editor', helpDoc: 'Room_Creation_Guide.md' });
  const auth = await initAuth('developer');
  if (!auth) return;

  // === State ===
  let rooms: Room[] = [];
  let doors: Door[] = [];
  let areas: string[] = [];
  let classDefs: ClassDef[] = [];
  let selectedRoomId: number | null = null;

  // === DOM References ===
  const roomForm = document.getElementById('room-form') as HTMLFormElement;
  const noRoomSelected = document.getElementById('no-room-selected')!;
  const formTitle = document.getElementById('room-form-title')!;
  const idDisplay = document.getElementById('room-id-display')!;

  // Basic tab
  const nameInput = document.getElementById('room-name') as HTMLInputElement;
  const areaInput = document.getElementById('room-area') as HTMLInputElement;
  const terrainSelect = document.getElementById('room-terrain') as HTMLSelectElement;
  const darknessInput = document.getElementById('room-darkness') as HTMLInputElement;
  const darknessBandLabel = document.getElementById('darkness-band-label')!;
  const tagInput = document.getElementById('room-tag') as HTMLInputElement;

  // Update darkness band label based on value
  function updateDarknessBandLabel(): void {
    const val = parseInt(darknessInput.value) || 0;
    let label = '';
    if (val === 0) label = 'Bright';
    else if (val >= -75) label = 'Dim';
    else if (val >= -150) label = 'Dark';
    else if (val >= -250) label = 'Very Dark';
    else if (val >= -400) label = 'Pitch Black';
    else label = 'Abyssal';
    darknessBandLabel.textContent = label;
  }
  darknessInput.addEventListener('input', updateDarknessBandLabel);
  const descriptionInput = document.getElementById('room-description') as HTMLTextAreaElement;

  // Features tab
  const trainingEnabledCheckbox = document.getElementById('room-training-enabled') as HTMLInputElement;
  const trainingOptions = document.getElementById('training-options')!;
  const trainingMinLevel = document.getElementById('room-training-min-level') as HTMLInputElement;
  const trainingMaxLevel = document.getElementById('room-training-max-level') as HTMLInputElement;
  const bankEnabledCheckbox = document.getElementById('room-bank-enabled') as HTMLInputElement;
  const respawnEnabledCheckbox = document.getElementById('room-respawn-enabled') as HTMLInputElement;
  const respawnOptions = document.getElementById('respawn-options')!;
  const respawnPriorityInput = document.getElementById('room-respawn-priority') as HTMLInputElement;

  // Exits tab
  const exitsList = document.getElementById('exits-list')!;
  const exitDirectionSelect = document.getElementById('exit-direction') as HTMLSelectElement;
  const exitBidirectionalCheckbox = document.getElementById('exit-bidirectional') as HTMLInputElement;

  // Doors tab
  const doorsList = document.getElementById('doors-list')!;

  // List panel
  const areaFilter = document.getElementById('area-filter') as HTMLSelectElement;
  const roomCountEl = document.getElementById('room-count')!;
  const areaSuggestions = document.getElementById('area-suggestions')!;

  // === Components ===
  let exitTargetSelect: SearchableSelect;
  let trainingClassesInput: ChipTagInput;
  let respawnAreasInput: ChipTagInput;

  // Tab setup
  setupTabs({ container: roomForm });

  // ListPanel
  const roomListPanel = new ListPanel<Room>({
    listElement: document.getElementById('room-list')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    filterSelect: areaFilter,
    onSelect: (room) => selectRoom(room.id),
    getId: (room) => room.id,
    renderItem: (room) => `
      <span class="room-id">#${room.id}</span>
      <div class="room-name">${escapeHtml(room.name)}</div>
      <div class="room-area">${escapeHtml(room.area || 'No area')}</div>
    `,
    filterFn: (room, search) =>
      room.name.toLowerCase().includes(search) ||
      String(room.id).includes(search) ||
      (room.area?.toLowerCase().includes(search) ?? false) ||
      (room.tag?.toLowerCase().includes(search) ?? false),
    dropdownFilterFn: (room, value) => room.area === value,
    sortFn: (a, b) => a.id - b.id,
    onRender: (filtered, total) => {
      roomCountEl.textContent = `${filtered} / ${total}`;
    },
  });

  // ============================================================================
  // API Functions
  // ============================================================================

  async function fetchRooms(): Promise<void> {
    try {
      const res = await fetch('/api/rooms', { credentials: 'include' });
      const data = await res.json();
      rooms = data.success ? (data.rooms || []) : [];
    } catch {
      showToast('Failed to load rooms', 'error');
      rooms = [];
    }
    roomListPanel.setItems(rooms);
    if (selectedRoomId) roomListPanel.setSelected(selectedRoomId);
  }

  async function fetchDoors(): Promise<void> {
    try {
      const res = await fetch('/api/doors', { credentials: 'include' });
      const data = await res.json();
      doors = data.success ? (data.doors || []) : [];
    } catch {
      doors = [];
    }
  }

  async function fetchAreas(): Promise<void> {
    try {
      const res = await fetch('/api/areas', { credentials: 'include' });
      const data = await res.json();
      areas = data.success ? (data.areas || []) : [];
    } catch {
      areas = [];
    }
    populateAreaFilter();
    updateAreaSuggestions();
    if (respawnAreasInput) {
      respawnAreasInput.setOptions(areas);
    }
  }

  async function fetchClasses(): Promise<void> {
    try {
      const res = await fetch('/api/progression/classes', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.classes)) {
        classDefs = data.classes.map((c: { class_id: string; display_name: string }) => ({
          id: c.class_id,
          displayName: c.display_name,
        }));
      }
    } catch {
      classDefs = [];
      showToast('Failed to load classes', 'error');
    }
  }

  // ============================================================================
  // Area Filter & Suggestions
  // ============================================================================

  function populateAreaFilter(): void {
    const current = areaFilter.value;
    areaFilter.innerHTML = '<option value="">All Areas</option>' +
      areas.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    areaFilter.value = current;
  }

  function updateAreaSuggestions(): void {
    areaSuggestions.innerHTML = areas.map(a => `<option value="${escapeHtml(a)}"></option>`).join('');
  }

  // ============================================================================
  // Component Initialization
  // ============================================================================

  function getRoomOptions(): SelectOption[] {
    return rooms
      .filter(r => r.id !== selectedRoomId)
      .sort((a, b) => (a.area || '').localeCompare(b.area || '') || a.name.localeCompare(b.name))
      .map(r => ({
        value: String(r.id),
        label: r.name,
        group: r.area || 'No Area',
        detail: `#${r.id}`,
      }));
  }

  function initComponents(): void {
    // Exit target SearchableSelect
    exitTargetSelect = new SearchableSelect({
      container: document.getElementById('exit-target-container')!,
      placeholder: 'Search rooms...',
      options: getRoomOptions(),
      onChange: () => {},
    });

    // Training classes ChipTagInput
    trainingClassesInput = new ChipTagInput({
      container: document.getElementById('training-classes-container')!,
      placeholder: 'Add classes...',
      options: classDefs.map(c => c.displayName),
      onChange: () => {},
    });

    // Respawn areas ChipTagInput
    respawnAreasInput = new ChipTagInput({
      container: document.getElementById('respawn-areas-container')!,
      placeholder: 'Add areas...',
      options: areas,
      onChange: () => {},
    });
  }

  // ============================================================================
  // Room Selection & Form Population
  // ============================================================================

  async function selectRoom(id: number): Promise<void> {
    selectedRoomId = id;

    // Fetch fresh room data — abort if fetch fails to avoid showing stale data
    try {
      const res = await fetch(`/api/rooms/${id}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        const idx = rooms.findIndex(r => r.id === id);
        if (idx !== -1) rooms[idx] = data.room;
        else rooms.push(data.room);
      } else {
        showToast('Failed to load room', 'error');
        return;
      }
    } catch {
      showToast('Failed to load room', 'error');
      return;
    }

    const room = rooms.find(r => r.id === id);
    await fetchDoors();

    if (!room) {
      noRoomSelected.style.display = 'flex';
      roomForm.style.display = 'none';
      return;
    }

    noRoomSelected.style.display = 'none';
    roomForm.style.display = 'block';

    formTitle.textContent = 'Edit Room';
    idDisplay.textContent = `ID: ${room.id}`;

    // Basic tab
    nameInput.value = room.name;
    areaInput.value = room.area || '';
    terrainSelect.value = room.terrain || 'indoor';
    darknessInput.value = String(room.darkness_level ?? 0);
    updateDarknessBandLabel();
    tagInput.value = room.tag || '';
    descriptionInput.value = room.description || '';

    // Features tab - training
    const trainingEnabled = room.features?.training?.enabled === true;
    trainingEnabledCheckbox.checked = trainingEnabled;
    trainingOptions.style.display = trainingEnabled ? 'block' : 'none';
    trainingMinLevel.value = String(room.features?.training?.minLevel ?? 1);
    trainingMaxLevel.value = String(room.features?.training?.maxLevel ?? 999);

    // Training classes: map class_id -> displayName
    const allowedClasses = room.features?.training?.allowedClasses;
    if (allowedClasses === null || allowedClasses === undefined) {
      // null/undefined means all classes allowed - show empty (= all)
      trainingClassesInput.setValues([]);
    } else {
      const names = allowedClasses
        .map(id => classDefs.find(c => c.id === id)?.displayName)
        .filter((n): n is string => !!n);
      trainingClassesInput.setValues(names);
    }

    // Features tab - bank
    bankEnabledCheckbox.checked = room.features?.bank?.enabled === true;

    // Features tab - respawn
    const respawnEnabled = room.features?.respawn?.enabled === true;
    respawnEnabledCheckbox.checked = respawnEnabled;
    respawnOptions.style.display = respawnEnabled ? 'block' : 'none';
    respawnPriorityInput.value = String(room.features?.respawn?.priority ?? 0);

    // Respawn areas: filter out room's own area
    const respawnAreaOptions = areas.filter(a => a !== room.area);
    respawnAreasInput.setOptions(respawnAreaOptions);
    respawnAreasInput.setValues(room.features?.respawn?.servedAreas || []);

    // Exits & Doors
    renderExits(room);
    renderDoors(room);

    // Update exit target options (exclude current room)
    exitTargetSelect.setOptions(getRoomOptions());

    // List + map
    roomListPanel.setSelected(id);
    drawMap();
  }

  function clearForm(): void {
    selectedRoomId = null;
    noRoomSelected.style.display = 'flex';
    roomForm.style.display = 'none';
    roomListPanel.setSelected(null);
    drawMap();
  }

  // ============================================================================
  // Exits Rendering
  // ============================================================================

  function renderExits(room: Room): void {
    const entries = Object.entries(room.exits);
    if (entries.length === 0) {
      exitsList.innerHTML = '<p class="no-exits">No exits</p>';
      return;
    }

    exitsList.innerHTML = entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([direction, targetId]) => {
        const target = rooms.find(r => r.id === targetId);
        return `
          <div class="exit-item">
            <div class="exit-info">
              <span class="exit-direction">${escapeHtml(direction)}</span>
              <span class="exit-target">\u2192 [${targetId}] ${escapeHtml(target?.name || 'Unknown')}</span>
            </div>
            <div class="exit-actions">
              <button class="delete-exit-oneway" data-dir="${escapeHtml(direction)}" title="Delete this direction only">1-way</button>
              <button class="delete-exit-btn" data-dir="${escapeHtml(direction)}" title="Delete both directions">\u00d7</button>
            </div>
          </div>
        `;
      })
      .join('');

    // Two-way delete
    exitsList.querySelectorAll('.delete-exit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const dir = (btn as HTMLElement).dataset.dir!;
        await deleteExit(room.id, dir, true);
      });
    });

    // One-way delete
    exitsList.querySelectorAll('.delete-exit-oneway').forEach(btn => {
      btn.addEventListener('click', async () => {
        const dir = (btn as HTMLElement).dataset.dir!;
        await deleteExit(room.id, dir, false);
      });
    });
  }

  // ============================================================================
  // Doors Rendering
  // ============================================================================

  function renderDoors(room: Room): void {
    const roomDoors = doors.filter(d => d.entryRoomId === room.id || d.exitRoomId === room.id);

    if (roomDoors.length === 0) {
      doorsList.innerHTML = '<p class="no-doors">No doors for this room</p>';
      return;
    }

    doorsList.innerHTML = roomDoors
      .map(door => {
        const isEntry = door.entryRoomId === room.id;
        const direction = isEntry ? door.entryDirection : door.exitDirection;
        const otherRoomId = isEntry ? door.exitRoomId : door.entryRoomId;
        const otherRoom = otherRoomId ? rooms.find(r => r.id === otherRoomId) : null;
        const typeDisplay = door.doorType.replace(/_/g, ' ');
        const dirDisplay = direction || '\u2014';
        const connDisplay = otherRoom
          ? `\u2192 ${escapeHtml(otherRoom.name)}`
          : (otherRoomId ? `\u2192 Room #${otherRoomId}` : '(one-way)');

        return `
          <div class="door-item" data-door-id="${door.id}" title="Click to edit in Door Editor">
            <div class="door-info">
              <span class="door-direction">${escapeHtml(dirDisplay)}</span>
              <span class="door-name">${escapeHtml(door.name)}</span>
              <span class="door-type-badge ${escapeHtml(door.doorType)}">${escapeHtml(typeDisplay)}</span>
            </div>
            <span style="color: #888; font-size: 0.85rem;">${connDisplay}</span>
            <button class="edit-door-btn" data-door-id="${door.id}">Edit</button>
          </div>
        `;
      })
      .join('');

    doorsList.querySelectorAll('.door-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('edit-door-btn')) return;
        const doorId = (item as HTMLElement).dataset.doorId;
        window.open(`/door-editor.html?doorId=${doorId}`, '_blank');
      });
    });

    doorsList.querySelectorAll('.edit-door-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const doorId = (btn as HTMLElement).dataset.doorId;
        window.open(`/door-editor.html?doorId=${doorId}`, '_blank');
      });
    });
  }

  // ============================================================================
  // Data Gathering
  // ============================================================================

  function gatherFormData(): Partial<Room> & { features: RoomFeatures } {
    const features: RoomFeatures = {};

    // Training
    if (trainingEnabledCheckbox.checked) {
      const minLevelRaw = parseInt(trainingMinLevel.value, 10);
      const maxLevelRaw = parseInt(trainingMaxLevel.value, 10);
      const minLevel = Math.max(1, Math.min(999, Number.isFinite(minLevelRaw) ? minLevelRaw : 1));
      const maxLevel = Math.max(1, Math.min(999, Number.isFinite(maxLevelRaw) ? maxLevelRaw : 999));

      // Map display names back to class_ids
      const selectedNames = trainingClassesInput.getValues();
      const classIds = selectedNames
        .map(name => classDefs.find(c => c.displayName === name)?.id)
        .filter((id): id is string => !!id);

      features.training = {
        enabled: true,
        minLevel,
        maxLevel,
        allowedClasses: classIds.length > 0 ? classIds : null,
      };
    }

    // Bank
    if (bankEnabledCheckbox.checked) {
      features.bank = { enabled: true };
    }

    // Respawn
    if (respawnEnabledCheckbox.checked) {
      const priorityRaw = parseInt(respawnPriorityInput.value, 10);
      const priority = Math.max(0, Math.min(999, Number.isFinite(priorityRaw) ? priorityRaw : 0));
      const servedAreas = respawnAreasInput.getValues();

      features.respawn = {
        enabled: true,
        priority,
        servedAreas: servedAreas.length > 0 ? servedAreas : undefined,
      };
    }

    const darknessRaw = parseInt(darknessInput.value, 10);
    const darkness_level = Number.isFinite(darknessRaw) ? Math.max(-500, Math.min(0, darknessRaw)) : 0;

    return {
      name: nameInput.value.trim(),
      description: descriptionInput.value || null,
      area: areaInput.value.trim() || null,
      terrain: terrainSelect.value,
      darkness_level,
      tag: tagInput.value.trim() || null,
      features,
    };
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  async function createRoom(): Promise<void> {
    // Pre-fill area from current filter
    const currentArea = areaFilter.value || '';
    const result = await showPromptFields('New Room', [
      { key: 'name', label: 'Room Name', required: true, placeholder: 'Enter room name' },
      { key: 'area', label: 'Area', defaultValue: currentArea, placeholder: 'Optional area' },
    ]);
    if (!result) return;

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: result.name,
          area: result.area || null,
          description: 'A newly created room.',
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchRooms();
        await fetchAreas();
        selectRoom(data.room.id);
        showToast('Room created', 'success');
      } else {
        showToast(data.message || 'Failed to create room', 'error');
      }
    } catch {
      showToast('Failed to create room', 'error');
    }
  }

  async function saveRoom(): Promise<void> {
    if (!selectedRoomId) return;

    const formData = gatherFormData();
    if (!formData.name) {
      showToast('Name is required', 'warning');
      return;
    }

    // Validate training min <= max
    if (formData.features.training?.enabled) {
      const min = formData.features.training.minLevel ?? 1;
      const max = formData.features.training.maxLevel ?? 999;
      if (min > max) {
        showToast('Min training level cannot exceed max', 'error');
        return;
      }
    }

    try {
      const res = await fetch(`/api/rooms/${selectedRoomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        await fetchRooms();
        await fetchAreas();
        selectRoom(selectedRoomId);
        showToast('Room saved', 'success');
      } else {
        showToast(data.message || 'Failed to save room', 'error');
      }
    } catch {
      showToast('Failed to save room', 'error');
    }
  }

  async function deleteRoom(): Promise<void> {
    if (!selectedRoomId) return;
    const room = rooms.find(r => r.id === selectedRoomId);
    const confirmed = await showConfirm(`Delete room "${room?.name}" (#${selectedRoomId})?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/rooms/${selectedRoomId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        await fetchRooms();
        await fetchAreas();
        clearForm();
        showToast('Room deleted', 'success');
      } else {
        showToast(data.message || 'Failed to delete room', 'error');
      }
    } catch {
      showToast('Failed to delete room', 'error');
    }
  }

  async function duplicateRoom(): Promise<void> {
    if (!selectedRoomId) return;
    const room = rooms.find(r => r.id === selectedRoomId);
    if (!room) return;

    const result = await showPromptFields('Duplicate Room', [
      { key: 'name', label: 'New Room Name', required: true, defaultValue: `${room.name} (copy)` },
    ]);
    if (!result) return;

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: result.name,
          description: room.description,
          area: room.area,
          terrain: room.terrain,
          darkness_level: room.darkness_level,
          features: room.features,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchRooms();
        await fetchAreas();
        selectRoom(data.room.id);
        showToast('Room duplicated', 'success');
      } else {
        showToast(data.message || 'Failed to duplicate room', 'error');
      }
    } catch {
      showToast('Failed to duplicate room', 'error');
    }
  }

  // ============================================================================
  // Exit Operations
  // ============================================================================

  async function addExit(): Promise<void> {
    if (!selectedRoomId) return;

    const direction = exitDirectionSelect.value;
    const targetValue = exitTargetSelect.getValue();
    const toRoomId = targetValue ? parseInt(targetValue, 10) : NaN;
    const bidirectional = exitBidirectionalCheckbox.checked;

    if (!direction || Number.isNaN(toRoomId)) {
      showToast('Select a direction and target room', 'warning');
      return;
    }

    // Warn if direction already exists
    const currentRoom = rooms.find(r => r.id === selectedRoomId);
    if (currentRoom && direction in currentRoom.exits) {
      const confirmed = await showConfirm(`Exit "${direction}" already exists. Replace it?`);
      if (!confirmed) return;
    }

    try {
      const res = await fetch(`/api/rooms/${selectedRoomId}/exits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ direction, toRoomId, bidirectional }),
      });
      const data = await res.json();
      if (data.success) {
        if (bidirectional) await fetchRooms();
        selectRoom(selectedRoomId);
        exitDirectionSelect.value = '';
        exitTargetSelect.clear();
        showToast('Exit added', 'success');
      } else {
        showToast(data.message || 'Failed to add exit', 'error');
      }
    } catch {
      showToast('Failed to add exit', 'error');
    }
  }

  async function deleteExit(roomId: number, direction: string, bidirectional: boolean): Promise<void> {
    const label = bidirectional ? 'both directions' : 'this direction only';
    const confirmed = await showConfirm(`Delete exit "${direction}" (${label})?`);
    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/rooms/${roomId}/exits/${encodeURIComponent(direction)}?bidirectional=${bidirectional}`,
        { method: 'DELETE', credentials: 'include' },
      );
      const data = await res.json();
      if (data.success) {
        await fetchRooms();
        if (selectedRoomId) selectRoom(selectedRoomId);
        showToast('Exit deleted', 'success');
      } else {
        showToast(data.message || 'Failed to delete exit', 'error');
      }
    } catch {
      showToast('Failed to delete exit', 'error');
    }
  }

  // ============================================================================
  // Area Management
  // ============================================================================

  function showAreaManagementModal(): void {
    // Build modal dynamically
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.style.display = 'flex';

    // Count rooms per area
    const areaCounts = new Map<string, number>();
    for (const room of rooms) {
      const area = room.area || 'No Area';
      areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
    }

    const sortedAreas = Array.from(areaCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.innerHTML = `
      <div class="modal-header">
        <h3>Manage Areas</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <p class="hint">Click Rename to change an area name. Type a new name in the room's Area field to create areas.</p>
        <ul id="area-list">
          ${sortedAreas.map(([area, count]) => `
            <li>
              <div>
                <span class="area-name">${escapeHtml(area)}</span>
                <span class="area-count">(${count} room${count !== 1 ? 's' : ''})</span>
              </div>
              ${area !== 'No Area' ? `<button class="rename-btn" data-area="${escapeHtml(area)}">Rename</button>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Close
    const closeModal = () => overlay.remove();
    content.querySelector('.close-btn')!.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Rename buttons
    content.querySelectorAll('.rename-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const oldName = (btn as HTMLElement).dataset.area!;
        const newName = await showPrompt(`Rename area "${oldName}" to:`, {
          defaultValue: oldName,
        });
        if (!newName || newName === oldName) return;

        try {
          const res = await fetch(`/api/areas/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ newName }),
          });
          const data = await res.json();
          if (data.success) {
            showToast(data.message || 'Area renamed', 'success');
            await fetchRooms();
            await fetchAreas();
            closeModal();
            showAreaManagementModal(); // Reopen with updated data
            if (selectedRoomId) selectRoom(selectedRoomId);
          } else {
            showToast(data.message || 'Failed to rename area', 'error');
          }
        } catch {
          showToast('Failed to rename area', 'error');
        }
      });
    });
  }

  // ============================================================================
  // Import / Export
  // ============================================================================

  function exportRooms(): void {
    const filterArea = areaFilter.value;
    const toExport = roomListPanel.getFilteredItems();

    if (toExport.length === 0) {
      showToast('No rooms to export', 'warning');
      return;
    }

    const blob = new Blob([JSON.stringify({ rooms: toExport }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filterArea ? `rooms_${filterArea}.json` : 'rooms_export.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${toExport.length} rooms`, 'success');
  }

  function importRooms(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const importRoomList: Room[] = data.rooms;
        if (!Array.isArray(importRoomList) || importRoomList.length === 0) {
          showToast('No rooms found in file', 'warning');
          return;
        }

        const confirmed = await showConfirm(`Import ${importRoomList.length} rooms? Existing rooms with the same ID will be updated.`);
        if (!confirmed) return;

        let created = 0;
        let updated = 0;
        let failed = 0;
        const createdIdMap = new Map<number, number>(); // old ID -> new ID

        // Pass 1: Create/update rooms (without exits)
        for (const room of importRoomList) {
          const existing = rooms.find(r => r.id === room.id);
          const payload = {
            name: room.name,
            description: room.description,
            area: room.area,
            terrain: room.terrain,
            darkness_level: room.darkness_level,
            features: room.features,
            tag: room.tag,
          };

          if (existing) {
            const res = await fetch(`/api/rooms/${room.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) { updated++; createdIdMap.set(room.id, room.id); }
            else failed++;
          } else {
            const res = await fetch('/api/rooms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) { created++; createdIdMap.set(room.id, data.room.id); }
            else failed++;
          }
        }

        // Pass 2: Recreate exits (only if both rooms were imported)
        let exitsCreated = 0;
        for (const room of importRoomList) {
          const fromId = createdIdMap.get(room.id);
          if (!fromId || !room.exits) continue;

          for (const [direction, targetOldId] of Object.entries(room.exits)) {
            const toId = createdIdMap.get(targetOldId);
            if (!toId) continue;

            const res = await fetch(`/api/rooms/${fromId}/exits`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ direction, toRoomId: toId, bidirectional: false }),
            });
            const data = await res.json();
            if (data.success) exitsCreated++;
          }
        }

        await fetchRooms();
        await fetchAreas();
        const parts = [`${created} created`, `${updated} updated`];
        if (exitsCreated > 0) parts.push(`${exitsCreated} exits linked`);
        if (failed > 0) parts.push(`${failed} failed`);
        showToast(`Import: ${parts.join(', ')}`, failed > 0 ? 'warning' : 'success');
      } catch {
        showToast('Failed to import rooms', 'error');
      }
    });
    input.click();
  }

  // ============================================================================
  // Seed Export (full game data to data/ directory)
  // ============================================================================

  async function seedExport(): Promise<void> {
    const confirmed = await showConfirm(
      'Export all game data to data/ directory?\n\nThis overwrites the seed data files that new installs use. Make sure to commit the result.'
    );
    if (!confirmed) return;

    showToast('Exporting game data...', 'info', 10000);

    try {
      const res = await fetch('/api/data/export', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        const warnSuffix = data.warnings?.length > 0 ? ` (${data.warnings.length} warnings)` : '';
        showToast(`${data.message}${warnSuffix}`, data.warnings?.length > 0 ? 'warning' : 'success', 5000);
      } else {
        showToast(data.message || 'Export failed', 'error');
      }
    } catch {
      showToast('Export failed', 'error');
    }
  }

  // ============================================================================
  // Map Canvas (preserved from original)
  // ============================================================================

  function drawMap(): void {
    drawRoomMap();
  }

  function drawRoomMap(): void {
    const canvas = document.getElementById('room-map') as HTMLCanvasElement;
    const container = document.getElementById('map-container')!;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!selectedRoomId) return;

    const currentRoom = rooms.find(r => r.id === selectedRoomId);
    if (!currentRoom) return;

    const filterArea = areaFilter.value;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const roomSize = 60;
    const spacing = 100;

    const directionOffsets: Record<string, { x: number; y: number }> = {
      north: { x: 0, y: -spacing },
      south: { x: 0, y: spacing },
      east: { x: spacing, y: 0 },
      west: { x: -spacing, y: 0 },
      northeast: { x: spacing * 0.7, y: -spacing * 0.7 },
      northwest: { x: -spacing * 0.7, y: -spacing * 0.7 },
      southeast: { x: spacing * 0.7, y: spacing * 0.7 },
      southwest: { x: -spacing * 0.7, y: spacing * 0.7 },
      up: { x: spacing * 0.5, y: -spacing * 0.5 },
      down: { x: -spacing * 0.5, y: spacing * 0.5 },
    };

    // Draw connections
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;

    for (const [direction, targetId] of Object.entries(currentRoom.exits)) {
      const offset = directionOffsets[direction];
      if (!offset) continue;

      const targetRoom = rooms.find(r => r.id === targetId);
      if (filterArea && targetRoom && targetRoom.area !== filterArea) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#666';
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#00ff00';
      }

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + offset.x, centerY + offset.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw connected rooms
    for (const [direction, targetId] of Object.entries(currentRoom.exits)) {
      const offset = directionOffsets[direction];
      if (!offset) continue;

      const targetRoom = rooms.find(r => r.id === targetId);
      const x = centerX + offset.x;
      const y = centerY + offset.y;
      const isDifferentArea = filterArea && targetRoom && targetRoom.area !== filterArea;

      if (isDifferentArea) {
        ctx.fillStyle = '#1a1a1a';
        ctx.strokeStyle = '#555';
      } else {
        ctx.fillStyle = '#1a1a2e';
        ctx.strokeStyle = '#00aa00';
      }

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - roomSize / 2, y - roomSize / 2, roomSize, roomSize, 4);
      ctx.fill();
      ctx.stroke();

      // Up/down indicators
      if (targetRoom) {
        const hasUp = 'up' in targetRoom.exits;
        const hasDown = 'down' in targetRoom.exits;
        if (hasUp || hasDown) {
          ctx.font = 'bold 12px sans-serif';
          ctx.fillStyle = '#ffaa00';
          const indicators = (hasUp ? '\u2191' : '') + (hasDown ? '\u2193' : '');
          ctx.fillText(indicators, x + roomSize / 2 - 8, y - roomSize / 2 + 12);
        }
      }

      ctx.fillStyle = isDifferentArea ? '#666' : '#aaa';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const name = targetRoom?.name || `Room ${targetId}`;
      const truncated = name.length > 10 ? name.slice(0, 9) + '\u2026' : name;
      ctx.fillText(truncated, x, y - 5);
      ctx.fillStyle = '#666';
      ctx.fillText(`#${targetId}`, x, y + 10);

      if (isDifferentArea && targetRoom?.area) {
        ctx.fillStyle = '#888';
        ctx.font = '8px sans-serif';
        ctx.fillText(`(${targetRoom.area})`, x, y + 22);
      }
    }

    // Draw current room (center)
    ctx.fillStyle = '#0e4429';
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(centerX - roomSize / 2, centerY - roomSize / 2, roomSize, roomSize, 4);
    ctx.fill();
    ctx.stroke();

    const hasUp = 'up' in currentRoom.exits;
    const hasDown = 'down' in currentRoom.exits;
    if (hasUp || hasDown) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#ffaa00';
      const indicators = (hasUp ? '\u2191' : '') + (hasDown ? '\u2193' : '');
      ctx.fillText(indicators, centerX + roomSize / 2 - 8, centerY - roomSize / 2 + 12);
    }

    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cName = currentRoom.name;
    const cTruncated = cName.length > 10 ? cName.slice(0, 9) + '\u2026' : cName;
    ctx.fillText(cTruncated, centerX, centerY - 5);
    ctx.fillStyle = '#00aa00';
    ctx.fillText(`#${currentRoom.id}`, centerX, centerY + 10);
  }

  // ============================================================================
  // Pop-out Area Map with Pan/Zoom
  // ============================================================================

  function openAreaMap(): void {
    const roomSize = 60;

    // Mutable map state - recalculated when filter changes
    let currentFilter = areaFilter.value;
    let areaRooms = getFilteredRooms(currentFilter);
    let positions = calculateRoomPositionsUnbounded(areaRooms);

    function getFilteredRooms(filter: string): Room[] {
      return filter ? rooms.filter(r => r.area === filter) : rooms;
    }

    // Pan/zoom state
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let dragLastX = 0;
    let dragLastY = 0;
    let mouseDownX = 0;
    let mouseDownY = 0;
    let hoveredRoomId: number | null = null;

    // Build overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;';

    // Header bar
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1.5rem;background:#16213e;border-bottom:1px solid #333;flex-shrink:0;flex-wrap:wrap;gap:0.5rem;';

    // Build area filter options
    const areaOptions = ['<option value="">All Areas</option>']
      .concat(areas.map(a => `<option value="${escapeHtml(a)}"${a === currentFilter ? ' selected' : ''}>${escapeHtml(a)}</option>`))
      .join('');

    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:1rem;">
        <h2 style="color:#00ff00;font-size:1.1rem;margin:0;">Area Map</h2>
        <select id="area-map-filter" style="padding:0.3rem 0.5rem;background:#0f0f23;color:#eee;border:1px solid #333;border-radius:4px;font-size:0.85rem;">
          ${areaOptions}
        </select>
        <span id="area-map-count" style="color:#666;font-size:0.85rem;">${areaRooms.length} rooms</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span style="color:#666;font-size:0.75rem;">Scroll to zoom \u2022 Drag to pan \u2022 Click to select</span>
        <button id="area-map-reset" style="padding:0.3rem 0.75rem;background:#333;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:0.8rem;">Reset View</button>
        <button id="area-map-close" style="padding:0.3rem 0.75rem;background:#4a1515;border:1px solid #aa3333;border-radius:4px;color:#ff6b6b;cursor:pointer;font-size:0.8rem;">Close</button>
      </div>
    `;
    overlay.appendChild(header);

    // Canvas container
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = 'flex:1;overflow:hidden;position:relative;';
    overlay.appendChild(canvasContainer);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;cursor:grab;';
    canvasContainer.appendChild(canvas);

    // Tooltip element
    const tooltip = document.createElement('div');
    tooltip.style.cssText = 'position:absolute;background:#16213e;border:1px solid #00ff00;border-radius:4px;padding:0.4rem 0.6rem;color:#eee;font-size:0.8rem;pointer-events:none;display:none;z-index:1;white-space:nowrap;';
    canvasContainer.appendChild(tooltip);

    document.body.appendChild(overlay);

    const mapFilterSelect = header.querySelector('#area-map-filter') as HTMLSelectElement;
    const mapCountSpan = header.querySelector('#area-map-count')!;

    // Switch area filter within the pop-out
    function switchArea(newFilter: string): void {
      currentFilter = newFilter;
      areaRooms = getFilteredRooms(currentFilter);
      positions = calculateRoomPositionsUnbounded(areaRooms);
      mapCountSpan.textContent = `${areaRooms.length} rooms`;
      hoveredRoomId = null;
      tooltip.style.display = 'none';
      resizeCanvas();
      resetView();
    }

    mapFilterSelect.addEventListener('change', () => {
      switchArea(mapFilterSelect.value);
    });

    // Size canvas
    function resizeCanvas(): void {
      canvas.width = canvasContainer.clientWidth;
      canvas.height = canvasContainer.clientHeight;
      render();
    }

    // Center view and auto-fit zoom
    function resetView(): void {
      if (positions.size === 0) {
        zoom = 1; panX = 0; panY = 0;
        render();
        return;
      }

      // Bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pos of positions.values()) {
        minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x); maxY = Math.max(maxY, pos.y);
      }

      const worldW = maxX - minX + roomSize * 2;
      const worldH = maxY - minY + roomSize * 2;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      if (worldW > 0 && worldH > 0) {
        zoom = Math.min(canvas.width / worldW, canvas.height / worldH, 2);
        zoom = Math.max(zoom, 0.05);
      } else {
        zoom = 1;
      }

      panX = canvas.width / 2 - cx * zoom;
      panY = canvas.height / 2 - cy * zoom;
      render();
    }

    // Convert screen coords to world coords
    function screenToWorld(sx: number, sy: number): { x: number; y: number } {
      return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
    }

    // Find room at screen position
    function roomAtScreen(sx: number, sy: number): number | null {
      const w = screenToWorld(sx, sy);
      const half = roomSize / 2;
      for (const [id, pos] of positions) {
        if (w.x >= pos.x - half && w.x <= pos.x + half &&
            w.y >= pos.y - half && w.y <= pos.y + half) {
          return id;
        }
      }
      return null;
    }

    // Render the area map
    function render(): void {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0f0f23';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (areaRooms.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No rooms in this area', canvas.width / 2, canvas.height / 2);
        return;
      }

      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);

      // Draw connections
      for (const room of areaRooms) {
        const pos = positions.get(room.id);
        if (!pos) continue;

        for (const [direction, targetId] of Object.entries(room.exits)) {
          const targetPos = positions.get(targetId);
          const targetRoom = rooms.find(r => r.id === targetId);
          const isDifferentArea = targetRoom && targetRoom.area !== room.area;

          if (isDifferentArea) {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#555';
          } else if (targetPos) {
            ctx.setLineDash([]);
            ctx.strokeStyle = '#00aa00';
          } else {
            continue;
          }

          ctx.lineWidth = 2 / zoom;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);

          if (targetPos) {
            ctx.lineTo(targetPos.x, targetPos.y);
          } else {
            const angle = getDirectionAngle(direction);
            ctx.lineTo(pos.x + Math.cos(angle) * 40, pos.y + Math.sin(angle) * 40);
          }
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // Draw rooms
      const half = roomSize / 2;
      for (const room of areaRooms) {
        const pos = positions.get(room.id);
        if (!pos) continue;

        const isSelected = room.id === selectedRoomId;
        const isHovered = room.id === hoveredRoomId;
        const levelColors = getLevelColors(pos.level);

        ctx.fillStyle = isSelected ? '#0e4429' : levelColors.fill;
        ctx.strokeStyle = isSelected ? '#00ff00' : (isHovered ? '#ffff00' : levelColors.stroke);
        ctx.lineWidth = (isSelected ? 3 : (isHovered ? 2.5 : 2)) / zoom;
        ctx.beginPath();
        ctx.roundRect(pos.x - half, pos.y - half, roomSize, roomSize, 4);
        ctx.fill();
        ctx.stroke();

        // Up/down indicators
        const hasUp = 'up' in room.exits;
        const hasDown = 'down' in room.exits;
        if (hasUp || hasDown) {
          ctx.font = `bold ${12 / zoom}px sans-serif`;
          ctx.fillStyle = '#ffaa00';
          ctx.textAlign = 'right';
          const indicators = (hasUp ? '\u2191' : '') + (hasDown ? '\u2193' : '');
          ctx.fillText(indicators, pos.x + half - 2, pos.y - half + 12);
        }

        // Level indicator
        if (pos.level !== 0) {
          ctx.font = `bold ${9 / zoom}px sans-serif`;
          ctx.fillStyle = levelColors.stroke;
          ctx.textAlign = 'left';
          ctx.fillText(`L${pos.level > 0 ? '+' : ''}${pos.level}`, pos.x - half + 2, pos.y - half + 10);
        }

        // Room name (show more chars at higher zoom, constant screen-size text)
        const maxChars = zoom >= 1.5 ? 20 : (zoom >= 0.8 ? 12 : 8);
        ctx.fillStyle = isSelected ? '#00ff00' : '#aaa';
        ctx.font = `${isSelected ? 'bold ' : ''}${10 / zoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const truncated = room.name.length > maxChars ? room.name.slice(0, maxChars - 1) + '\u2026' : room.name;
        ctx.fillText(truncated, pos.x, pos.y - 5);
        ctx.fillStyle = '#666';
        ctx.font = `${8 / zoom}px sans-serif`;
        ctx.fillText(`#${room.id}`, pos.x, pos.y + 8);
      }

      ctx.restore();

      // Zoom indicator
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${Math.round(zoom * 100)}%`, 10, canvas.height - 10);
    }

    // --- Event handlers ---

    // Wheel zoom (zoom toward cursor)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const oldZoom = zoom;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      zoom = Math.max(0.05, Math.min(10, zoom * delta));

      // Zoom toward cursor
      panX = mx - (mx - panX) * (zoom / oldZoom);
      panY = my - (my - panY) * (zoom / oldZoom);

      render();
    }, { passive: false });

    // Drag pan
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isDragging = true;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
        canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    function onMouseMove(e: MouseEvent): void {
      if (isDragging) {
        panX += e.clientX - dragLastX;
        panY += e.clientY - dragLastY;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        render();
      } else {
        // Hover detection
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hovered = roomAtScreen(mx, my);

        if (hovered !== hoveredRoomId) {
          hoveredRoomId = hovered;
          canvas.style.cursor = hovered ? 'pointer' : 'grab';
          render();
        }

        // Tooltip
        if (hovered) {
          const room = areaRooms.find(r => r.id === hovered);
          if (room) {
            tooltip.style.display = 'block';
            tooltip.style.left = `${mx + 15}px`;
            tooltip.style.top = `${my - 10}px`;
            const exitCount = Object.keys(room.exits).length;
            tooltip.innerHTML = `<strong>${escapeHtml(room.name)}</strong> <span style="color:#666">#${room.id}</span><br>` +
              `<span style="color:#888">${escapeHtml(room.area || 'No area')} \u2022 ${exitCount} exit${exitCount !== 1 ? 's' : ''}</span>`;
          }
        } else {
          tooltip.style.display = 'none';
        }
      }
    }

    function onMouseUp(e: MouseEvent): void {
      if (isDragging) {
        isDragging = false;
        canvas.style.cursor = hoveredRoomId ? 'pointer' : 'grab';

        // If barely moved from initial mousedown, treat as click
        const dx = Math.abs(e.clientX - mouseDownX);
        const dy = Math.abs(e.clientY - mouseDownY);
        if (dx < 5 && dy < 5) {
          handleClick(e);
        }
      }
    }

    function handleClick(e: MouseEvent): void {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const clickedId = roomAtScreen(mx, my);

      if (clickedId) {
        selectRoom(clickedId);
        render();
      }
    }

    // Close + cleanup
    function cleanup(): void {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    }

    header.querySelector('#area-map-close')!.addEventListener('click', cleanup);
    header.querySelector('#area-map-reset')!.addEventListener('click', resetView);

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        cleanup();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    window.addEventListener('resize', resizeCanvas);

    // Initial render
    resizeCanvas();
    resetView();
  }

  /**
   * Calculate room positions in unbounded world space.
   *
   * Uses BFS from the start room, placing each room at (parent + direction_offset).
   * For consistent grids (east-then-south = south-then-east), BFS naturally produces
   * correct positions. For cycles, the BFS tree edges determine placement and
   * cycle-closing edges are simply drawn as connections between existing positions.
   *
   * This is the correct approach for grid-based city maps like Arindale where
   * directional consistency is guaranteed by the seed data.
   */
  function calculateRoomPositionsUnbounded(areaRooms: Room[]): Map<number, RoomLayoutInfo> {
    const positions = new Map<number, RoomLayoutInfo>();
    if (areaRooms.length === 0) return positions;

    const areaRoomIds = new Set(areaRooms.map(r => r.id));
    const roomById = new Map(areaRooms.map(r => [r.id, r]));
    const startRoom = areaRooms.find(r => r.id === selectedRoomId) || areaRooms[0];
    if (!startRoom) return positions;

    const spacing = 100;

    const dirOffsets: Record<string, { x: number; y: number }> = {
      north: { x: 0, y: -spacing },
      south: { x: 0, y: spacing },
      east: { x: spacing, y: 0 },
      west: { x: -spacing, y: 0 },
      northeast: { x: spacing * 0.7, y: -spacing * 0.7 },
      northwest: { x: -spacing * 0.7, y: -spacing * 0.7 },
      southeast: { x: spacing * 0.7, y: spacing * 0.7 },
      southwest: { x: -spacing * 0.7, y: spacing * 0.7 },
    };

    // BFS placement - each room placed at parent_pos + direction_offset
    const visited = new Set<number>();
    const queue: { id: number; x: number; y: number; level: number }[] = [];

    queue.push({ id: startRoom.id, x: 0, y: 0, level: 0 });
    visited.add(startRoom.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      positions.set(current.id, { x: current.x, y: current.y, level: current.level });

      const room = roomById.get(current.id);
      if (!room) continue;

      for (const [direction, targetId] of Object.entries(room.exits)) {
        if (visited.has(targetId)) continue;
        if (!areaRoomIds.has(targetId)) continue;

        visited.add(targetId);
        let newLevel = current.level;
        if (direction === 'up') newLevel = current.level + 1;
        else if (direction === 'down') newLevel = current.level - 1;

        const offset = dirOffsets[direction];
        if (offset) {
          queue.push({ id: targetId, x: current.x + offset.x, y: current.y + offset.y, level: newLevel });
        } else {
          // up/down: offset slightly so they don't stack on parent
          queue.push({ id: targetId, x: current.x + 30, y: current.y + 30, level: newLevel });
        }
      }
    }

    // Place disconnected rooms in a grid off to the side
    let maxX = -Infinity;
    for (const pos of positions.values()) maxX = Math.max(maxX, pos.x);
    const disconnectedStartX = (maxX === -Infinity ? 0 : maxX) + spacing * 2;
    let unvisitedIndex = 0;
    for (const room of areaRooms) {
      if (!positions.has(room.id)) {
        const col = unvisitedIndex % 4;
        const row = Math.floor(unvisitedIndex / 4);
        positions.set(room.id, { x: disconnectedStartX + col * spacing, y: row * spacing, level: 0 });
        unvisitedIndex++;
      }
    }

    return positions;
  }

  function getLevelColors(level: number): { fill: string; stroke: string } {
    if (level === 0) {
      return { fill: '#1a1a2e', stroke: '#00aa00' };
    } else if (level > 0) {
      const colors = [
        { fill: '#1a2a3e', stroke: '#00aacc' },
        { fill: '#1a2a4e', stroke: '#00aaff' },
        { fill: '#2a2a5e', stroke: '#5588ff' },
        { fill: '#3a2a6e', stroke: '#8866ff' },
        { fill: '#4a2a7e', stroke: '#aa55ff' },
      ];
      return colors[Math.min(level - 1, colors.length - 1)];
    } else {
      const colors = [
        { fill: '#2e1a1a', stroke: '#cc6600' },
        { fill: '#3e1a1a', stroke: '#aa4400' },
        { fill: '#4e1a1a', stroke: '#882200' },
        { fill: '#5e1a1a', stroke: '#661100' },
        { fill: '#6e1a1a', stroke: '#440000' },
      ];
      return colors[Math.min(Math.abs(level) - 1, colors.length - 1)];
    }
  }

  function getDirectionAngle(direction: string): number {
    const angles: Record<string, number> = {
      north: -Math.PI / 2,
      south: Math.PI / 2,
      east: 0,
      west: Math.PI,
      northeast: -Math.PI / 4,
      northwest: -3 * Math.PI / 4,
      southeast: Math.PI / 4,
      southwest: 3 * Math.PI / 4,
      up: -Math.PI / 4,
      down: Math.PI / 4,
    };
    return angles[direction] ?? 0;
  }

  // ============================================================================
  // Event Wiring
  // ============================================================================

  // New room
  document.getElementById('new-room-btn')?.addEventListener('click', createRoom);

  // Save (form submit)
  roomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveRoom();
  });

  // Delete
  document.getElementById('delete-room-btn')?.addEventListener('click', deleteRoom);

  // Duplicate
  document.getElementById('duplicate-room-btn')?.addEventListener('click', duplicateRoom);

  // Add exit
  document.getElementById('add-exit-btn')?.addEventListener('click', addExit);

  // Add door -> open door editor in new tab with room context
  document.getElementById('add-door-btn')?.addEventListener('click', () => {
    if (selectedRoomId) {
      window.open(`/door-editor.html?newDoorForRoom=${selectedRoomId}`, '_blank');
    } else {
      showToast('Select a room first', 'warning');
    }
  });

  // Feature toggles
  trainingEnabledCheckbox.addEventListener('change', () => {
    trainingOptions.style.display = trainingEnabledCheckbox.checked ? 'block' : 'none';
  });
  respawnEnabledCheckbox.addEventListener('change', () => {
    respawnOptions.style.display = respawnEnabledCheckbox.checked ? 'block' : 'none';
  });

  // Area map pop-out
  document.getElementById('view-area-btn')?.addEventListener('click', openAreaMap);

  // Area filter change -> redraw sidebar map
  areaFilter.addEventListener('change', () => {
    drawMap();
  });

  // Area management
  document.getElementById('manage-areas-btn')?.addEventListener('click', showAreaManagementModal);

  // Import/Export
  document.getElementById('export-btn')?.addEventListener('click', exportRooms);
  document.getElementById('import-btn')?.addEventListener('click', importRooms);

  // Seed export (admin only)
  const seedExportBtn = document.getElementById('seed-export-btn');
  if (seedExportBtn) {
    if (auth.isAdmin) {
      seedExportBtn.addEventListener('click', seedExport);
    } else {
      seedExportBtn.style.display = 'none';
    }
  }

  // Resize -> redraw map
  window.addEventListener('resize', () => drawMap());

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchRooms(), fetchDoors(), fetchAreas(), fetchClasses()]);
  initComponents();

  // Handle URL params (deep linking)
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdParam = urlParams.get('roomId');
  if (roomIdParam) {
    const roomId = parseInt(roomIdParam, 10);
    if (!Number.isNaN(roomId) && rooms.find(r => r.id === roomId)) {
      await selectRoom(roomId);
    }
  }
  window.history.replaceState({}, '', window.location.pathname);

})();
