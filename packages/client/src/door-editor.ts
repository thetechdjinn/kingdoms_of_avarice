(function() {

interface Door {
  id: number;
  name: string;
  doorType: string;
  description: string | null;
  entryRoomId: number;
  entryDirection: string;
  exitRoomId: number | null;
  exitDirection: string | null;
  defaultState: string;
  autoCloseSeconds: number | null;
  hasLock: boolean;
  keyItemTag: string | null;
  autoLockSeconds: number | null;
  pickDifficultyMin: number;
  pickDifficultyMax: number;
  bashDifficulty: number;
  isHidden: boolean;
  triggerText: string | null;
  passageMessageSelf: string | null;
  passageMessageRoom: string | null;
  itemDisplayName: string | null;
  isTemporary: boolean;
  spawnTriggerText: string | null;
  durationSeconds: number | null;
  appearMessage: string | null;
  disappearMessage: string | null;
  requiredLevel: number | null;
  requiredClasses: string[] | null;
  requiredQuestFlag: string | null;
  requiredItemTag: string | null;
  denialMessage: string | null;
}

interface Room {
  id: number;
  name: string;
  area: string | null;
  exits: { [direction: string]: number };
}

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

// Door type to visible sections mapping
const DOOR_TYPE_SECTIONS: Record<string, string[]> = {
  open_passageway: ['basic', 'rooms'],
  physical: ['basic', 'rooms', 'state', 'locks', 'permissions'],
  special: ['basic', 'rooms', 'triggers', 'permissions'],
  triggered_passageway: ['basic', 'rooms', 'triggers', 'permissions'],
  temporary_portal: ['basic', 'rooms', 'triggers', 'portal', 'permissions'],
};

let doors: Door[] = [];
let rooms: Room[] = [];
let selectedDoorId: number | null = null;
let viewMode: 'doors' | 'exits' = 'doors';

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

function showError(message: string): void {
  const list = document.getElementById('door-list');
  if (list) {
    list.innerHTML = `<div class="error-message" style="color: #ff6b6b; padding: 1rem;">${escapeHtml(message)}</div>`;
  } else {
    showToast(message, 'error');
  }
}

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

async function fetchDoors(): Promise<void> {
  try {
    const response = await fetch('/api/doors');
    if (!response.ok) {
      console.error('Failed to fetch doors: HTTP', response.status);
      showError('Failed to load doors. Please refresh the page.');
      return;
    }
    const data = await response.json();
    if (data.success) {
      if (Array.isArray(data.doors)) {
        doors = data.doors;
        renderList();
      } else {
        showError('Invalid door data received from server.');
      }
    } else {
      showError('Failed to load doors: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to fetch doors:', error);
    showError('Failed to connect to server. Please check your connection.');
  }
}

async function fetchRooms(): Promise<void> {
  try {
    const response = await fetch('/api/rooms');
    if (!response.ok) {
      console.error('Failed to fetch rooms: HTTP', response.status);
      showError('Failed to load rooms: HTTP ' + response.status);
      return;
    }
    const data = await response.json();
    if (data.success && Array.isArray(data.rooms)) {
      rooms = data.rooms;
      populateRoomDropdowns();
    } else {
      console.error('Failed to fetch rooms: Invalid response');
      showError('Failed to load rooms: ' + (data.message || 'Invalid response'));
    }
  } catch (error) {
    console.error('Failed to fetch rooms:', error);
    showError('Failed to connect to server. Please check your connection.');
  }
}

function populateRoomDropdowns(): void {
  const entryRoomSelect = getElement<HTMLSelectElement>('entry-room-id');
  const exitRoomSelect = getElement<HTMLSelectElement>('exit-room-id');

  if (!entryRoomSelect || !exitRoomSelect) return;

  // Sort rooms by area, then name
  const sortedRooms = [...rooms].sort((a, b) => {
    const areaA = a.area || '';
    const areaB = b.area || '';
    if (areaA !== areaB) return areaA.localeCompare(areaB);
    return a.name.localeCompare(b.name);
  });

  // Build options
  const options = sortedRooms.map(room => {
    const areaLabel = room.area ? `[${room.area}] ` : '';
    return `<option value="${room.id}">${areaLabel}${escapeHtml(room.name)} (#${room.id})</option>`;
  }).join('');

  entryRoomSelect.innerHTML = `<option value="">Select room...</option>${options}`;
  exitRoomSelect.innerHTML = `<option value="">None (one-way)</option>${options}`;

  // Populate filter dropdowns
  populateFilterDropdowns();
}

function populateFilterDropdowns(): void {
  const areaSelect = getElement<HTMLSelectElement>('area-select');
  const roomSelect = getElement<HTMLSelectElement>('room-select');

  if (!areaSelect || !roomSelect) return;

  // Get unique areas sorted alphabetically
  const areas = [...new Set(rooms.map(r => r.area).filter(Boolean))].sort() as string[];

  areaSelect.innerHTML = `<option value="">All Areas</option>` +
    areas.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('');

  // Populate rooms (will be filtered when area changes)
  updateRoomFilterDropdown();
}

function updateRoomFilterDropdown(): void {
  const areaSelect = getElement<HTMLSelectElement>('area-select');
  const roomSelect = getElement<HTMLSelectElement>('room-select');

  if (!roomSelect) return;

  const selectedArea = areaSelect?.value || '';

  // Filter rooms by selected area
  let filteredRooms = rooms;
  if (selectedArea) {
    filteredRooms = rooms.filter(r => r.area === selectedArea);
  }

  // Sort by name
  filteredRooms = [...filteredRooms].sort((a, b) => a.name.localeCompare(b.name));

  roomSelect.innerHTML = `<option value="">All Rooms</option>` +
    filteredRooms.map(room => {
      const areaLabel = !selectedArea && room.area ? `[${room.area}] ` : '';
      return `<option value="${room.id}">${areaLabel}${escapeHtml(room.name)} (#${room.id})</option>`;
    }).join('');
}

// ============================================================================
// Rendering
// ============================================================================

function renderList(): void {
  if (viewMode === 'doors') {
    renderDoorList();
  } else {
    renderExitList();
  }
}

function renderDoorList(): void {
  const list = getElement<HTMLElement>('door-list');
  if (!list) return;

  const areaSelectEl = getElement<HTMLSelectElement>('area-select');
  const roomSelectEl = getElement<HTMLSelectElement>('room-select');
  const filterTypeEl = getElement<HTMLSelectElement>('type-select');
  const searchInputEl = getElement<HTMLInputElement>('search-input');

  const filterArea = areaSelectEl?.value ?? '';
  const filterRoom = roomSelectEl?.value ?? '';
  const filterType = filterTypeEl?.value ?? '';
  const searchTerm = (searchInputEl?.value ?? '').toLowerCase();

  let filteredDoors = doors;

  // Filter by area (check if entry or exit room is in the area)
  if (filterArea) {
    const roomsInArea = new Set(rooms.filter(r => r.area === filterArea).map(r => r.id));
    filteredDoors = filteredDoors.filter(d =>
      roomsInArea.has(d.entryRoomId) || (d.exitRoomId && roomsInArea.has(d.exitRoomId))
    );
  }

  // Filter by room (check if entry or exit room matches)
  if (filterRoom) {
    const roomId = parseInt(filterRoom);
    filteredDoors = filteredDoors.filter(d =>
      d.entryRoomId === roomId || d.exitRoomId === roomId
    );
  }

  if (filterType) {
    filteredDoors = filteredDoors.filter(d => d.doorType === filterType);
  }

  if (searchTerm) {
    filteredDoors = filteredDoors.filter(d =>
      d.name.toLowerCase().includes(searchTerm) ||
      (d.description && d.description.toLowerCase().includes(searchTerm))
    );
  }

  // Update count display
  const countEl = getElement<HTMLElement>('door-count');
  if (countEl) {
    const totalDoors = doors.length;
    const shownDoors = filteredDoors.length;
    if (totalDoors === shownDoors) {
      countEl.textContent = `${totalDoors} door${totalDoors !== 1 ? 's' : ''}`;
    } else {
      countEl.textContent = `Showing ${shownDoors} of ${totalDoors} doors`;
    }
  }

  list.innerHTML = filteredDoors
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(door => {
      const entryRoom = rooms.find(r => r.id === door.entryRoomId);
      const exitRoom = door.exitRoomId ? rooms.find(r => r.id === door.exitRoomId) : null;
      const roomsInfo = exitRoom
        ? `${entryRoom?.name || '?'} ↔ ${exitRoom.name}`
        : `${entryRoom?.name || '?'} →`;

      return `
        <li data-id="${door.id}" class="${door.id === selectedDoorId ? 'selected' : ''}">
          <span class="door-id">#${door.id}</span>
          <div class="door-name">${escapeHtml(door.name)}</div>
          <div class="door-type"><span class="door-type-badge ${door.doorType}">${formatDoorType(door.doorType)}</span></div>
          <div class="door-rooms">${escapeHtml(roomsInfo)}</div>
        </li>
      `;
    })
    .join('');

  list.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const id = parseInt(li.dataset.id!);
      selectDoor(id);
    });
  });
}

function renderExitList(): void {
  const list = getElement<HTMLElement>('door-list');
  if (!list) return;

  const areaSelectEl = getElement<HTMLSelectElement>('area-select');
  const roomSelectEl = getElement<HTMLSelectElement>('room-select');
  const searchInputEl = getElement<HTMLInputElement>('search-input');

  const filterArea = areaSelectEl?.value ?? '';
  const filterRoom = roomSelectEl?.value ?? '';
  const searchTerm = (searchInputEl?.value ?? '').toLowerCase();

  // Build list of all room exits
  interface ExitInfo {
    fromRoom: Room;
    toRoom: Room | undefined;
    direction: string;
    hasDoor: boolean;
  }

  let exits: ExitInfo[] = [];
  for (const room of rooms) {
    if (!room.exits) continue;
    for (const [direction, toRoomId] of Object.entries(room.exits)) {
      const toRoom = rooms.find(r => r.id === toRoomId);
      // Check if a door already exists for this exit
      const hasDoor = doors.some(d =>
        (d.entryRoomId === room.id && d.entryDirection === direction) ||
        (d.exitRoomId === room.id && d.exitDirection === direction)
      );
      exits.push({ fromRoom: room, toRoom, direction, hasDoor });
    }
  }

  // Filter by area
  if (filterArea) {
    exits = exits.filter(e => e.fromRoom.area === filterArea);
  }

  // Filter by room
  if (filterRoom) {
    const roomId = parseInt(filterRoom);
    exits = exits.filter(e => e.fromRoom.id === roomId || e.toRoom?.id === roomId);
  }

  // Filter by search
  if (searchTerm) {
    exits = exits.filter(e =>
      e.fromRoom.name.toLowerCase().includes(searchTerm) ||
      (e.toRoom && e.toRoom.name.toLowerCase().includes(searchTerm)) ||
      e.direction.toLowerCase().includes(searchTerm)
    );
  }

  // Sort by area, then room name, then direction
  exits.sort((a, b) => {
    const areaA = a.fromRoom.area || '';
    const areaB = b.fromRoom.area || '';
    if (areaA !== areaB) return areaA.localeCompare(areaB);
    if (a.fromRoom.name !== b.fromRoom.name) return a.fromRoom.name.localeCompare(b.fromRoom.name);
    return a.direction.localeCompare(b.direction);
  });

  // Update count display
  const countEl = getElement<HTMLElement>('door-count');
  if (countEl) {
    const totalExits = rooms.reduce((sum, r) => sum + Object.keys(r.exits || {}).length, 0);
    const shownExits = exits.length;
    const withDoors = exits.filter(e => e.hasDoor).length;
    if (totalExits === shownExits) {
      countEl.textContent = `${totalExits} exits (${withDoors} with doors)`;
    } else {
      countEl.textContent = `Showing ${shownExits} of ${totalExits} exits`;
    }
  }

  list.innerHTML = exits.map(exit => {
    const areaLabel = exit.fromRoom.area ? `[${exit.fromRoom.area}] ` : '';
    return `
      <li class="exit-item" data-from-room="${exit.fromRoom.id}" data-direction="${exit.direction}" data-to-room="${exit.toRoom?.id || ''}">
        <div class="exit-info">
          <div class="exit-direction">${exit.direction}</div>
          <div class="exit-rooms">${areaLabel}${escapeHtml(exit.fromRoom.name)} → ${exit.toRoom ? escapeHtml(exit.toRoom.name) : '?'}</div>
          ${exit.hasDoor ? '<div class="exit-has-door">Has door</div>' : ''}
        </div>
        ${!exit.hasDoor ? `<button class="btn-small create-door-btn">+ Door</button>` : ''}
      </li>
    `;
  }).join('');

  // Add click handlers for create door buttons
  list.querySelectorAll('.create-door-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const li = (e.target as HTMLElement).closest('li');
      if (!li) return;
      const fromRoomId = parseInt(li.dataset.fromRoom!);
      const direction = li.dataset.direction!;
      const toRoomId = li.dataset.toRoom ? parseInt(li.dataset.toRoom) : null;
      createDoorFromExit(fromRoomId, direction, toRoomId);
    });
  });
}

async function createDoorFromExit(fromRoomId: number, direction: string, toRoomId: number | null): Promise<void> {
  const fromRoom = rooms.find(r => r.id === fromRoomId);
  const toRoom = toRoomId ? rooms.find(r => r.id === toRoomId) : null;

  const defaultName = `${fromRoom?.name || 'Room'} ${direction} door`;
  const name = prompt('Enter door name:', defaultName);
  if (!name) return;

  // Find the reverse direction for the exit side
  const reverseDirections: Record<string, string> = {
    north: 'south', south: 'north',
    east: 'west', west: 'east',
    up: 'down', down: 'up',
    northeast: 'southwest', southwest: 'northeast',
    northwest: 'southeast', southeast: 'northwest',
  };

  try {
    const response = await fetch('/api/doors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        doorType: 'physical',
        entryRoomId: fromRoomId,
        entryDirection: direction,
        exitRoomId: toRoomId,
        exitDirection: toRoomId ? reverseDirections[direction] || direction : null,
      }),
    });

    const data = await response.json();
    if (data.success) {
      doors.push(data.door);
      // Switch to doors view and select the new door
      viewMode = 'doors';
      updateViewToggle();
      selectDoor(data.door.id);
      showToast('Door created successfully!', 'success');
    } else {
      showToast('Failed to create door: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to create door:', error);
    showToast('Failed to create door', 'error');
  }
}

function updateViewToggle(): void {
  document.querySelectorAll('#view-toggle .view-btn').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.view === viewMode);
  });

  const title = getElement<HTMLElement>('list-panel-title');
  if (title) {
    title.textContent = viewMode === 'doors' ? 'Doors' : 'Room Exits';
  }

  // Show/hide type filter (only relevant for doors)
  const typeFilter = getElement<HTMLElement>('type-select')?.closest('.filter-row');
  if (typeFilter) {
    (typeFilter as HTMLElement).style.display = viewMode === 'doors' ? '' : 'none';
  }

  renderList();
}

function formatDoorType(type: string): string {
  return type.replace(/_/g, ' ');
}

function selectDoor(id: number): void {
  selectedDoorId = id;
  const door = doors.find(d => d.id === id);

  const noDoorSelected = getElement<HTMLElement>('no-door-selected');
  const doorForm = getElement<HTMLElement>('door-form');

  if (!door) {
    if (noDoorSelected) noDoorSelected.style.display = 'flex';
    if (doorForm) doorForm.style.display = 'none';
    return;
  }

  if (noDoorSelected) noDoorSelected.style.display = 'none';
  if (doorForm) doorForm.style.display = 'block';

  const formTitle = getElement<HTMLElement>('door-form-title');
  const idDisplay = getElement<HTMLElement>('door-id-display');
  if (formTitle) formTitle.textContent = 'Edit Door';
  if (idDisplay) idDisplay.textContent = `ID: ${door.id}`;

  // Basic fields
  const nameInput = getElement<HTMLInputElement>('door-name');
  const typeSelect = getElement<HTMLSelectElement>('door-type');
  const descInput = getElement<HTMLTextAreaElement>('door-description');
  const hiddenCheck = getElement<HTMLInputElement>('door-hidden');

  if (nameInput) nameInput.value = door.name;
  if (typeSelect) typeSelect.value = door.doorType;
  if (descInput) descInput.value = door.description || '';
  if (hiddenCheck) hiddenCheck.checked = door.isHidden;

  // Room fields
  const entryRoomSelect = getElement<HTMLSelectElement>('entry-room-id');
  const entryDirSelect = getElement<HTMLSelectElement>('entry-direction');
  const exitRoomSelect = getElement<HTMLSelectElement>('exit-room-id');
  const exitDirSelect = getElement<HTMLSelectElement>('exit-direction');

  if (entryRoomSelect) entryRoomSelect.value = String(door.entryRoomId);
  if (entryDirSelect) entryDirSelect.value = door.entryDirection;
  if (exitRoomSelect) exitRoomSelect.value = door.exitRoomId ? String(door.exitRoomId) : '';
  if (exitDirSelect) exitDirSelect.value = door.exitDirection || '';

  // State fields
  const defaultStateSelect = getElement<HTMLSelectElement>('default-state');
  const autoCloseInput = getElement<HTMLInputElement>('auto-close-seconds');

  if (defaultStateSelect) defaultStateSelect.value = door.defaultState;
  if (autoCloseInput) autoCloseInput.value = String(door.autoCloseSeconds || 0);

  // Lock fields
  const hasLockCheck = getElement<HTMLInputElement>('has-lock');
  const keyItemTagInput = getElement<HTMLInputElement>('key-item-tag');
  const autoLockInput = getElement<HTMLInputElement>('auto-lock-seconds');
  const pickDiffMinInput = getElement<HTMLInputElement>('pick-difficulty-min');
  const pickDiffMaxInput = getElement<HTMLInputElement>('pick-difficulty-max');
  const bashDiffInput = getElement<HTMLInputElement>('bash-difficulty');

  if (hasLockCheck) hasLockCheck.checked = door.hasLock;
  if (keyItemTagInput) keyItemTagInput.value = door.keyItemTag || '';
  if (autoLockInput) autoLockInput.value = String(door.autoLockSeconds || 0);
  if (pickDiffMinInput) pickDiffMinInput.value = String(door.pickDifficultyMin);
  if (pickDiffMaxInput) pickDiffMaxInput.value = String(door.pickDifficultyMax);
  if (bashDiffInput) bashDiffInput.value = String(door.bashDifficulty);

  updateLockOptionsVisibility();

  // Trigger fields
  const triggerTextInput = getElement<HTMLInputElement>('trigger-text');
  const passageSelfInput = getElement<HTMLInputElement>('passage-message-self');
  const passageRoomInput = getElement<HTMLInputElement>('passage-message-room');
  const itemDisplayInput = getElement<HTMLInputElement>('item-display-name');

  if (triggerTextInput) triggerTextInput.value = door.triggerText || '';
  if (passageSelfInput) passageSelfInput.value = door.passageMessageSelf || '';
  if (passageRoomInput) passageRoomInput.value = door.passageMessageRoom || '';
  if (itemDisplayInput) itemDisplayInput.value = door.itemDisplayName || '';

  // Portal fields
  const spawnTriggerInput = getElement<HTMLInputElement>('spawn-trigger-text');
  const durationInput = getElement<HTMLInputElement>('duration-seconds');
  const appearMsgInput = getElement<HTMLInputElement>('appear-message');
  const disappearMsgInput = getElement<HTMLInputElement>('disappear-message');

  if (spawnTriggerInput) spawnTriggerInput.value = door.spawnTriggerText || '';
  if (durationInput) durationInput.value = door.durationSeconds !== null ? String(door.durationSeconds) : '';
  if (appearMsgInput) appearMsgInput.value = door.appearMessage || '';
  if (disappearMsgInput) disappearMsgInput.value = door.disappearMessage || '';

  // Permission fields
  const reqLevelInput = getElement<HTMLInputElement>('required-level');
  const reqClassesInput = getElement<HTMLInputElement>('required-classes');
  const reqQuestInput = getElement<HTMLInputElement>('required-quest-flag');
  const reqItemInput = getElement<HTMLInputElement>('required-item-tag');
  const denialMsgInput = getElement<HTMLTextAreaElement>('denial-message');

  if (reqLevelInput) reqLevelInput.value = String(door.requiredLevel || 0);
  if (reqClassesInput) reqClassesInput.value = (door.requiredClasses || []).join(', ');
  if (reqQuestInput) reqQuestInput.value = door.requiredQuestFlag || '';
  if (reqItemInput) reqItemInput.value = door.requiredItemTag || '';
  if (denialMsgInput) denialMsgInput.value = door.denialMessage || '';

  // Update visible sections based on door type
  updateVisibleSections(door.doorType);

  // Update preview
  updatePreview(door);

  renderDoorList();
}

function updateVisibleSections(doorType: string): void {
  const visibleSections = DOOR_TYPE_SECTIONS[doorType] || ['basic', 'rooms'];

  // Update tab button visibility (basic and rooms are always visible)
  const conditionalTabs = ['state', 'locks', 'triggers', 'portal', 'permissions'];
  for (const tab of conditionalTabs) {
    const tabBtn = getElement<HTMLButtonElement>(`tab-btn-${tab}`);
    if (tabBtn) {
      tabBtn.style.display = visibleSections.includes(tab) ? '' : 'none';
    }
  }

  // If current tab is hidden, switch to basic (basic and rooms are always visible)
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) {
    const tabName = (activeTab as HTMLElement).dataset.tab;
    if (tabName && tabName !== 'basic' && tabName !== 'rooms' && !visibleSections.includes(tabName)) {
      switchToTab('basic');
    }
  }

  // Show/hide item display name field based on door type
  const itemDisplayGroup = getElement<HTMLElement>('item-display-group');
  if (itemDisplayGroup) {
    itemDisplayGroup.style.display =
      (doorType === 'special' || doorType === 'temporary_portal') ? '' : 'none';
  }
}

function updateLockOptionsVisibility(): void {
  const hasLockCheck = getElement<HTMLInputElement>('has-lock');
  const lockOptions = getElement<HTMLElement>('lock-options');
  if (hasLockCheck && lockOptions) {
    lockOptions.style.display = hasLockCheck.checked ? '' : 'none';
  }
}

function updatePreview(door: Door): void {
  const content = getElement<HTMLElement>('preview-content');
  if (!content) return;

  const entryRoom = rooms.find(r => r.id === door.entryRoomId);
  const exitRoom = door.exitRoomId ? rooms.find(r => r.id === door.exitRoomId) : null;

  let html = `
    <div class="preview-name">${escapeHtml(door.name)}</div>
    <div class="preview-type"><span class="door-type-badge ${door.doorType}">${formatDoorType(door.doorType)}</span></div>
  `;

  if (door.description) {
    html += `<div class="preview-desc">${escapeHtml(door.description)}</div>`;
  }

  // Properties
  const props: string[] = [];
  if (door.isHidden) props.push('Hidden');
  if (door.hasLock) props.push('Locked');
  if (door.requiredLevel && door.requiredLevel > 0) props.push(`Level ${door.requiredLevel}+`);

  if (props.length > 0) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Properties</div>
        <div>${props.join(', ')}</div>
      </div>
    `;
  }

  // Physical door info
  if (door.doorType === 'physical') {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">State</div>
        <div class="preview-property">Default: ${door.defaultState}</div>
        ${door.autoCloseSeconds ? `<div class="preview-property">Auto-close: ${door.autoCloseSeconds}s</div>` : ''}
      </div>
    `;

    if (door.hasLock) {
      const pickLabel = door.pickDifficultyMax >= 500 ? 'unpickable' :
        (door.pickDifficultyMin === door.pickDifficultyMax ?
          String(door.pickDifficultyMin) :
          `${door.pickDifficultyMin}-${door.pickDifficultyMax}`);
      html += `
        <div class="preview-section">
          <div class="preview-section-title">Lock</div>
          ${door.keyItemTag ? `<div class="preview-property">Key: ${escapeHtml(door.keyItemTag)}</div>` : ''}
          <div class="preview-property">Pick: ${pickLabel}</div>
          <div class="preview-property">Bash: ${door.bashDifficulty}${door.bashDifficulty >= 500 ? ' (unbashable)' : ''}</div>
        </div>
      `;
    }
  }

  // Trigger info
  if (door.triggerText) {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Trigger</div>
        <div class="preview-property">"${escapeHtml(door.triggerText)}"</div>
      </div>
    `;
  }

  // Portal info
  if (door.doorType === 'temporary_portal') {
    html += `
      <div class="preview-section">
        <div class="preview-section-title">Portal</div>
        ${door.spawnTriggerText ? `<div class="preview-property">Spawn: "${escapeHtml(door.spawnTriggerText)}"</div>` : ''}
        ${door.durationSeconds ? `<div class="preview-property">Duration: ${door.durationSeconds}s</div>` : ''}
      </div>
    `;
  }

  content.innerHTML = html;

  // Update connection diagram
  const entryRoomPreview = document.querySelector('#entry-room-preview .room-name');
  const exitRoomPreview = document.querySelector('#exit-room-preview .room-name');
  const entryDirLabel = getElement<HTMLElement>('entry-dir-label');
  const exitDirLabel = getElement<HTMLElement>('exit-dir-label');

  if (entryRoomPreview) {
    entryRoomPreview.textContent = entryRoom?.name || `Room #${door.entryRoomId}`;
  }
  if (exitRoomPreview) {
    exitRoomPreview.textContent = exitRoom?.name || (door.exitRoomId ? `Room #${door.exitRoomId}` : 'None');
  }
  if (entryDirLabel) {
    entryDirLabel.textContent = door.entryDirection;
  }
  if (exitDirLabel) {
    exitDirLabel.textContent = door.exitDirection || '-';
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

async function createDoor(): Promise<void> {
  const name = prompt('Enter door name:');
  if (!name) return;

  // Use the first available room, or show error if no rooms exist
  if (rooms.length === 0) {
    showToast('No rooms available. Create a room first.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/doors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        doorType: 'physical',
        entryRoomId: rooms[0].id,
        entryDirection: 'north',
      }),
    });

    if (!response.ok) {
      showToast(`Failed to create door: HTTP ${response.status}`, 'error');
      return;
    }
    const data = await response.json();
    if (data.success) {
      doors.push(data.door);
      selectDoor(data.door.id);
      showToast('Door created successfully!', 'success');
    } else {
      showToast('Failed to create door: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to create door:', error);
    showToast('Failed to create door', 'error');
  }
}

async function createDoorForRoom(roomId: number, roomName: string): Promise<void> {
  const name = prompt(`Enter door name for ${roomName}:`);
  if (!name) return;

  try {
    const response = await fetch('/api/doors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        doorType: 'physical',
        entryRoomId: roomId,
        entryDirection: 'north',
      }),
    });

    if (!response.ok) {
      showToast(`Failed to create door: HTTP ${response.status}`, 'error');
      return;
    }
    const data = await response.json();
    if (data.success) {
      doors.push(data.door);
      selectDoor(data.door.id);
      showToast('Door created! Configure the settings below.', 'success');
    } else {
      showToast('Failed to create door: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to create door:', error);
    showToast('Failed to create door', 'error');
  }
}

async function saveDoor(): Promise<void> {
  if (!selectedDoorId) return;

  const doorData = gatherFormData();

  try {
    const response = await fetch(`/api/doors/${selectedDoorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doorData),
    });

    const data = await response.json();
    if (data.success) {
      const index = doors.findIndex(d => d.id === selectedDoorId);
      if (index !== -1) {
        doors[index] = data.door;
      }
      selectDoor(selectedDoorId);
      showToast('Door saved successfully!', 'success');
    } else {
      showToast('Failed to save door: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to save door:', error);
    showToast('Failed to save door', 'error');
  }
}

async function deleteDoor(): Promise<void> {
  if (!selectedDoorId) return;

  const door = doors.find(d => d.id === selectedDoorId);
  if (!confirm(`Are you sure you want to delete "${door?.name}"?`)) return;

  try {
    const response = await fetch(`/api/doors/${selectedDoorId}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    if (data.success) {
      doors = doors.filter(d => d.id !== selectedDoorId);
      selectedDoorId = null;
      const noDoorSelected = getElement<HTMLElement>('no-door-selected');
      const doorForm = getElement<HTMLElement>('door-form');
      if (noDoorSelected) noDoorSelected.style.display = 'flex';
      if (doorForm) doorForm.style.display = 'none';
      renderList();
      showToast('Door deleted successfully!', 'success');
    } else {
      showToast('Failed to delete door: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to delete door:', error);
    showToast('Failed to delete door', 'error');
  }
}

async function duplicateDoor(): Promise<void> {
  if (!selectedDoorId) return;

  const door = doors.find(d => d.id === selectedDoorId);
  if (!door) return;

  const newName = prompt('Enter name for duplicate:', door.name + ' (copy)');
  if (!newName) return;

  const duplicateData = { ...gatherFormData(), name: newName };

  try {
    const response = await fetch('/api/doors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateData),
    });

    const data = await response.json();
    if (data.success) {
      doors.push(data.door);
      selectDoor(data.door.id);
      showToast('Door duplicated successfully!', 'success');
    } else {
      showToast('Failed to duplicate door: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to duplicate door:', error);
    showToast('Failed to duplicate door', 'error');
  }
}

function gatherFormData(): Partial<Door> {
  const doorType = (getElement<HTMLSelectElement>('door-type')?.value) || 'physical';

  const data: Record<string, unknown> = {
    name: getElement<HTMLInputElement>('door-name')?.value || '',
    doorType,
    description: getElement<HTMLTextAreaElement>('door-description')?.value || null,
    isHidden: getElement<HTMLInputElement>('door-hidden')?.checked || false,

    // Room data
    entryRoomId: parseInt(getElement<HTMLSelectElement>('entry-room-id')?.value || '0'),
    entryDirection: getElement<HTMLSelectElement>('entry-direction')?.value || 'north',
    exitRoomId: parseInt(getElement<HTMLSelectElement>('exit-room-id')?.value || '0') || null,
    exitDirection: getElement<HTMLSelectElement>('exit-direction')?.value || null,
  };

  // State data (for physical doors)
  if (doorType === 'physical') {
    data.defaultState = getElement<HTMLSelectElement>('default-state')?.value || 'closed';
    const autoClose = parseInt(getElement<HTMLInputElement>('auto-close-seconds')?.value || '0');
    data.autoCloseSeconds = autoClose > 0 ? autoClose : null;

    // Lock data
    data.hasLock = getElement<HTMLInputElement>('has-lock')?.checked || false;
    data.keyItemTag = getElement<HTMLInputElement>('key-item-tag')?.value || null;
    const autoLock = parseInt(getElement<HTMLInputElement>('auto-lock-seconds')?.value || '0');
    data.autoLockSeconds = autoLock > 0 ? autoLock : null;
    data.pickDifficultyMin = parseInt(getElement<HTMLInputElement>('pick-difficulty-min')?.value || '0') || 0;
    data.pickDifficultyMax = parseInt(getElement<HTMLInputElement>('pick-difficulty-max')?.value || '0') || 0;
    data.bashDifficulty = parseInt(getElement<HTMLInputElement>('bash-difficulty')?.value || '0') || 0;
  }

  // Trigger data
  if (['special', 'triggered_passageway', 'temporary_portal'].includes(doorType)) {
    data.triggerText = getElement<HTMLInputElement>('trigger-text')?.value || null;
    data.passageMessageSelf = getElement<HTMLInputElement>('passage-message-self')?.value || null;
    data.passageMessageRoom = getElement<HTMLInputElement>('passage-message-room')?.value || null;
  }

  // Item display (for special and temporary_portal)
  if (['special', 'temporary_portal'].includes(doorType)) {
    data.itemDisplayName = getElement<HTMLInputElement>('item-display-name')?.value || null;
  }

  // Portal data
  if (doorType === 'temporary_portal') {
    data.isTemporary = true;
    data.spawnTriggerText = getElement<HTMLInputElement>('spawn-trigger-text')?.value || null;
    const duration = parseInt(getElement<HTMLInputElement>('duration-seconds')?.value || '60');
    data.durationSeconds = duration > 0 ? duration : 60;
    data.appearMessage = getElement<HTMLInputElement>('appear-message')?.value || null;
    data.disappearMessage = getElement<HTMLInputElement>('disappear-message')?.value || null;
  } else {
    data.isTemporary = false;
  }

  // Permission data (for all except open_passageway)
  if (doorType !== 'open_passageway') {
    const reqLevel = parseInt(getElement<HTMLInputElement>('required-level')?.value || '0');
    data.requiredLevel = reqLevel > 0 ? reqLevel : null;

    const reqClassesStr = getElement<HTMLInputElement>('required-classes')?.value || '';
    const reqClasses = reqClassesStr.split(',').map(c => c.trim()).filter(c => c);
    data.requiredClasses = reqClasses.length > 0 ? reqClasses : null;

    data.requiredQuestFlag = getElement<HTMLInputElement>('required-quest-flag')?.value || null;
    data.requiredItemTag = getElement<HTMLInputElement>('required-item-tag')?.value || null;
    data.denialMessage = getElement<HTMLTextAreaElement>('denial-message')?.value || null;
  }

  return data as Partial<Door>;
}

// ============================================================================
// Tab Handling
// ============================================================================

function setupTabs(): void {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = (btn as HTMLElement).dataset.tab;
      if (tabName) {
        switchToTab(tabName);
      }
    });
  });
}

function switchToTab(tabName: string): void {
  // Update button states
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update content visibility
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  const tabContent = document.getElementById(`tab-${tabName}`);
  if (tabContent) tabContent.classList.add('active');
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
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  await Promise.all([fetchDoors(), fetchRooms()]);
  setupTabs();

  // Handle URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const doorIdParam = urlParams.get('doorId');
  const newDoorForRoomParam = urlParams.get('newDoorForRoom');

  if (doorIdParam) {
    // Select a specific door
    const doorId = parseInt(doorIdParam);
    if (!isNaN(doorId) && doors.some(d => d.id === doorId)) {
      selectDoor(doorId);
    }
  } else if (newDoorForRoomParam) {
    // Create a new door with room pre-filled
    const roomId = parseInt(newDoorForRoomParam);
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      await createDoorForRoom(roomId, room.name);
    }
  }

  // Clear URL parameters after handling (keeps URL clean)
  if (doorIdParam || newDoorForRoomParam) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Helper to safely add event listeners
  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`Element #${id} not found for event listener`);
  };

  // Event listeners
  addListener('new-door-btn', 'click', createDoor);
  addListener('door-form', 'submit', (e) => {
    e.preventDefault();
    saveDoor();
  });
  addListener('delete-door-btn', 'click', deleteDoor);
  addListener('duplicate-door-btn', 'click', duplicateDoor);

  // View toggle
  document.querySelectorAll('#view-toggle .view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      viewMode = (btn as HTMLElement).dataset.view as 'doors' | 'exits';
      updateViewToggle();
    });
  });

  // Filters
  addListener('area-select', 'change', () => {
    updateRoomFilterDropdown();
    renderList();
  });
  addListener('room-select', 'change', renderList);
  addListener('type-select', 'change', renderList);
  addListener('search-input', 'input', renderList);

  // Type change handler
  addListener('door-type', 'change', (e) => {
    updateVisibleSections((e.target as HTMLSelectElement).value);
  });

  // Lock checkbox handler
  addListener('has-lock', 'change', updateLockOptionsVisibility);

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
});

})();
