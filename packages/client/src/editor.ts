(function() {

// Role constants (mirrors @koa/shared Role enum)
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';

// Door type (mirrors @koa/shared DoorType enum values)
type DoorType = 'open_passageway' | 'physical' | 'special' | 'triggered_passageway' | 'temporary_portal';

// These interfaces mirror @koa/shared types for client-side use
// Keep in sync with packages/shared/src/index.ts
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

// ============================================================================
// UI Helper Functions
// ============================================================================

/**
 * Set up a collapsible section with header click toggle
 */
function setupCollapsibleSection(headerId: string, contentId: string): void {
  const header = document.getElementById(headerId);
  const content = document.getElementById(contentId);
  const collapseIcon = header?.querySelector('.collapse-icon');

  if (header && content) {
    header.addEventListener('click', () => {
      const isExpanded = content.style.display !== 'none';
      content.style.display = isExpanded ? 'none' : 'block';
      if (collapseIcon) {
        collapseIcon.textContent = isExpanded ? '▶' : '▼';
      }
    });
  }
}

/**
 * Set up a checkbox that toggles visibility of an options container
 */
function setupCheckboxToggle(checkboxId: string, optionsId: string): void {
  const checkbox = document.getElementById(checkboxId);
  const options = document.getElementById(optionsId);

  if (checkbox && options) {
    checkbox.addEventListener('change', () => {
      const isEnabled = (checkbox as HTMLInputElement).checked;
      options.style.display = isEnabled ? 'block' : 'none';
    });
  }
}

interface Room {
  id: number;
  name: string;
  description: string | null;
  area: string | null;
  terrain: string;
  exits: Record<string, number>;
  features: RoomFeatures;
}

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
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

let rooms: Room[] = [];
let doors: Door[] = [];
let selectedRoomId: number | null = null;
let areas: string[] = [];
let currentUser: AuthInfo | null = null;
let mapViewMode: 'room' | 'area' = 'room';

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

    // Check if user has Developer or Admin role
    const roles = data.roles || [];
    const hasDeveloperAccess = roles.includes(ROLE_DEVELOPER) || roles.includes(ROLE_ADMIN);

    if (!hasDeveloperAccess) {
      // Redirect to game - no access
      window.location.href = '/';
      return false;
    }

    // Update nav with username
    const usernameEl = document.getElementById('nav-username');
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username;
    }

    // Show Admin dropdown if user is admin
    const isAdmin = roles.includes(ROLE_ADMIN);
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

async function fetchRooms(): Promise<void> {
  try {
    const response = await fetch('/api/rooms');
    const data = await response.json();
    if (data.success) {
      rooms = data.rooms;
      renderRoomList();
      updateTargetRoomSelect();
    }
  } catch (error) {
    console.error('Failed to fetch rooms:', error);
  }
}

async function fetchDoors(): Promise<void> {
  try {
    const response = await fetch('/api/doors');
    const data = await response.json();
    if (data.success) {
      doors = data.doors;
    }
  } catch (error) {
    console.error('Failed to fetch doors:', error);
  }
}

async function fetchAreas(): Promise<void> {
  try {
    const response = await fetch('/api/areas');
    const data = await response.json();
    if (data.success) {
      areas = data.areas;
      updateAreaFilter();
      updateAreaSuggestions();
      updateExitAreaFilter();
    }
  } catch (error) {
    console.error('Failed to fetch areas:', error);
  }
}

interface ClassInfo {
  class_id: string;
  display_name: string;
}

let availableClassesData: ClassInfo[] = [];

async function fetchClasses(): Promise<void> {
  try {
    const response = await fetch('/api/progression/classes');
    const data = await response.json();
    if (data.success && Array.isArray(data.classes)) {
      availableClassesData = data.classes.map((c: { class_id: string; display_name: string }) => ({
        class_id: c.class_id,
        display_name: c.display_name
      }));
      populateTrainingClassSelect();
    } else {
      console.error('Failed to fetch classes:', data.message || 'Unknown error');
      availableClassesData = [];
      populateTrainingClassSelect();
      showToast('Failed to load classes for training room settings', 'error');
    }
  } catch (error) {
    console.error('Failed to fetch classes:', error);
    availableClassesData = [];
    populateTrainingClassSelect();
    showToast('Failed to load classes for training room settings', 'error');
  }
}

function populateTrainingClassSelect(): void {
  const container = document.getElementById('room-training-classes');
  if (!container) return;

  container.innerHTML = availableClassesData.map(c => `
    <label class="class-select-item">
      <input type="checkbox" class="training-class-checkbox" value="${escapeHtml(c.class_id)}" />
      <span class="class-name">${escapeHtml(c.display_name)}</span>
    </label>
  `).join('');
}

function populateRespawnAreasSelect(currentRoomArea: string | null): void {
  const container = document.getElementById('room-respawn-areas');
  if (!container) return;

  // Filter out the current room's area (it's automatically served)
  const otherAreas = areas.filter(a => a !== currentRoomArea);

  if (otherAreas.length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 0.9rem;">No other areas available</p>';
    return;
  }

  container.innerHTML = otherAreas.map(area => `
    <label class="class-select-item">
      <input type="checkbox" class="respawn-area-checkbox" value="${escapeHtml(area)}" />
      <span class="class-name">${escapeHtml(area)}</span>
    </label>
  `).join('');
}

function renderRoomList(): void {
  const list = document.getElementById('room-list')!;
  const filterArea = (document.getElementById('area-select') as HTMLSelectElement).value;

  const filteredRooms = filterArea
    ? rooms.filter(r => r.area === filterArea)
    : rooms;

  list.innerHTML = filteredRooms
    .sort((a, b) => a.id - b.id)
    .map(room => `
      <li data-id="${room.id}" class="${room.id === selectedRoomId ? 'selected' : ''}">
        <span class="room-id">#${room.id}</span>
        <div class="room-name">${escapeHtml(room.name)}</div>
        <div class="room-area">${escapeHtml(room.area || 'No area')}</div>
      </li>
    `)
    .join('');

  list.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const id = parseInt(li.dataset.id!);
      selectRoom(id);
    });
  });
}

function updateAreaFilter(): void {
  const select = document.getElementById('area-select') as HTMLSelectElement;
  const currentValue = select.value;

  select.innerHTML = '<option value="">All Areas</option>' +
    areas.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('');

  select.value = currentValue;
}

function updateAreaSuggestions(): void {
  const datalist = document.getElementById('area-suggestions')!;
  datalist.innerHTML = areas.map(area => `<option value="${escapeHtml(area)}">`).join('');
}

function updateExitAreaFilter(): void {
  const select = document.getElementById('exit-area-filter') as HTMLSelectElement;
  const currentValue = select.value;

  select.innerHTML = '<option value="">All Areas</option>' +
    areas.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('');

  select.value = currentValue;
}

function updateTargetRoomSelect(): void {
  const select = document.getElementById('exit-target') as HTMLSelectElement;
  const areaFilter = (document.getElementById('exit-area-filter') as HTMLSelectElement).value;

  // Include rooms with no area when filter is active (so new rooms are visible)
  const filteredRooms = rooms
    .filter(r => r.id !== selectedRoomId)
    .filter(r => !areaFilter || r.area === areaFilter || !r.area)
    .sort((a, b) => a.id - b.id);

  select.innerHTML = '<option value="">Select target room...</option>' +
    filteredRooms
      .map(room => `<option value="${room.id}">[${room.id}] ${escapeHtml(room.name)}</option>`)
      .join('');
}

async function selectRoom(id: number): Promise<void> {
  selectedRoomId = id;

  // Fetch fresh room data from API instead of using stale cache
  try {
    const response = await fetch(`/api/rooms/${id}`);
    const data = await response.json();
    if (data.success) {
      // Update local cache with fresh data
      const index = rooms.findIndex(r => r.id === id);
      if (index !== -1) {
        rooms[index] = data.room;
      } else {
        // Room not in cache (newly created) - add it
        rooms.push(data.room);
      }
    }
  } catch (error) {
    console.error('Failed to fetch room:', error);
  }

  const room = rooms.find(r => r.id === id);

  // Refresh doors to get latest data (in case they were edited in door editor)
  await fetchDoors();

  if (!room) {
    document.getElementById('no-room-selected')!.style.display = 'flex';
    document.getElementById('room-form')!.style.display = 'none';
    return;
  }

  document.getElementById('no-room-selected')!.style.display = 'none';
  document.getElementById('room-form')!.style.display = 'block';

  document.getElementById('room-form-title')!.textContent = 'Edit Room';
  document.getElementById('room-id-display')!.textContent = `ID: ${room.id}`;

  (document.getElementById('room-name') as HTMLInputElement).value = room.name;
  (document.getElementById('room-area') as HTMLInputElement).value = room.area || '';
  (document.getElementById('room-terrain') as HTMLSelectElement).value = room.terrain || 'indoor';
  (document.getElementById('room-description') as HTMLTextAreaElement).value = room.description || '';

  // Populate training settings
  const trainingEnabled = room.features?.training?.enabled === true;
  (document.getElementById('room-training-enabled') as HTMLInputElement).checked = trainingEnabled;

  const trainingOptions = document.getElementById('training-options');
  if (trainingOptions) {
    trainingOptions.style.display = trainingEnabled ? 'block' : 'none';
  }

  (document.getElementById('room-training-min-level') as HTMLInputElement).value =
    String(room.features?.training?.minLevel ?? 1);
  (document.getElementById('room-training-max-level') as HTMLInputElement).value =
    String(room.features?.training?.maxLevel ?? 999);

  // Set class checkboxes (null/undefined = all classes allowed, so all checked)
  const allowedClasses = room.features?.training?.allowedClasses;
  const allClassesAllowed = allowedClasses === null || allowedClasses === undefined;
  document.querySelectorAll('.training-class-checkbox').forEach((checkbox) => {
    const input = checkbox as HTMLInputElement;
    input.checked = allClassesAllowed || (Array.isArray(allowedClasses) && allowedClasses.includes(input.value));
  });

  // Populate bank settings
  const bankEnabled = room.features?.bank?.enabled === true;
  (document.getElementById('room-bank-enabled') as HTMLInputElement).checked = bankEnabled;

  // Populate respawn settings
  const respawnEnabled = room.features?.respawn?.enabled === true;
  (document.getElementById('room-respawn-enabled') as HTMLInputElement).checked = respawnEnabled;

  const respawnOptions = document.getElementById('respawn-options');
  if (respawnOptions) {
    respawnOptions.style.display = respawnEnabled ? 'block' : 'none';
  }

  (document.getElementById('room-respawn-priority') as HTMLInputElement).value =
    String(room.features?.respawn?.priority ?? 0);

  // Populate served areas checkboxes (excluding current room's area)
  populateRespawnAreasSelect(room.area);

  // Set served areas checkboxes
  const servedAreas = room.features?.respawn?.servedAreas || [];
  document.querySelectorAll('.respawn-area-checkbox').forEach((checkbox) => {
    const input = checkbox as HTMLInputElement;
    input.checked = servedAreas.includes(input.value);
  });

  renderExits(room);
  renderDoors(room);
  updateTargetRoomSelect();
  renderRoomList();
  drawMap();
}

function renderExits(room: Room): void {
  const container = document.getElementById('exits-list')!;

  if (Object.keys(room.exits).length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 0.9rem;">No exits</p>';
    return;
  }

  container.innerHTML = Object.entries(room.exits)
    .map(([direction, targetId]) => {
      const targetRoom = rooms.find(r => r.id === targetId);
      return `
        <div class="exit-item">
          <div class="exit-info">
            <span class="exit-direction">${direction}</span>
            <span class="exit-target">→ [${targetId}] ${escapeHtml(targetRoom?.name || 'Unknown')}</span>
          </div>
          <button class="delete-exit-btn" data-direction="${direction}" title="Delete exit">×</button>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.delete-exit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const direction = (btn as HTMLElement).dataset.direction!;
      await deleteExit(room.id, direction);
    });
  });
}

function renderDoors(room: Room): void {
  const container = document.getElementById('doors-list')!;

  // Find all doors connected to this room (either as entry or exit)
  const roomDoors = doors.filter(d => d.entryRoomId === room.id || d.exitRoomId === room.id);

  if (roomDoors.length === 0) {
    container.innerHTML = '<p class="no-doors">No doors for this room</p>';
    return;
  }

  container.innerHTML = roomDoors
    .map(door => {
      // Determine the direction from this room's perspective
      const isEntry = door.entryRoomId === room.id;
      const direction = isEntry ? door.entryDirection : door.exitDirection;
      const otherRoomId = isEntry ? door.exitRoomId : door.entryRoomId;
      const otherRoom = otherRoomId ? rooms.find(r => r.id === otherRoomId) : null;

      const typeDisplay = door.doorType.replace(/_/g, ' ');
      const directionDisplay = direction || '—';
      const connectionDisplay = otherRoom ? `→ ${escapeHtml(otherRoom.name)}` : (otherRoomId ? `→ Room #${otherRoomId}` : '(one-way)');

      return `
        <div class="door-item" data-door-id="${door.id}" title="Click to edit in Door Editor">
          <div class="door-info">
            <span class="door-direction">${directionDisplay}</span>
            <span class="door-name">${escapeHtml(door.name)}</span>
            <span class="door-type-badge ${door.doorType}">${typeDisplay}</span>
          </div>
          <span style="color: #888; font-size: 0.85rem;">${connectionDisplay}</span>
          <button class="edit-door-btn" data-door-id="${door.id}">Edit</button>
        </div>
      `;
    })
    .join('');

  // Add click handlers
  container.querySelectorAll('.door-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't trigger if clicking the edit button (it has its own handler)
      if ((e.target as HTMLElement).classList.contains('edit-door-btn')) return;
      const doorId = (item as HTMLElement).dataset.doorId;
      window.location.href = `/door-editor.html?doorId=${doorId}`;
    });
  });

  container.querySelectorAll('.edit-door-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const doorId = (btn as HTMLElement).dataset.doorId;
      window.location.href = `/door-editor.html?doorId=${doorId}`;
    });
  });
}

async function createRoom(): Promise<void> {
  const name = prompt('Enter room name:');
  if (!name) return;

  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: 'A newly created room.', area: '' }),
    });

    const data = await response.json();
    if (data.success) {
      rooms.push(data.room);
      selectRoom(data.room.id);
      await fetchAreas();
      showToast('Room created successfully!', 'success');
    } else {
      showToast('Failed to create room: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to create room:', error);
    showToast('Failed to create room', 'error');
  }
}

async function saveRoom(): Promise<void> {
  if (!selectedRoomId) return;

  const name = (document.getElementById('room-name') as HTMLInputElement).value;
  const area = (document.getElementById('room-area') as HTMLInputElement).value;
  const terrain = (document.getElementById('room-terrain') as HTMLSelectElement).value;
  const description = (document.getElementById('room-description') as HTMLTextAreaElement).value;

  // Build training configuration
  const trainingEnabled = (document.getElementById('room-training-enabled') as HTMLInputElement).checked;
  const minLevelStr = (document.getElementById('room-training-min-level') as HTMLInputElement).value;
  const maxLevelStr = (document.getElementById('room-training-max-level') as HTMLInputElement).value;
  const minLevelRaw = minLevelStr === '' ? 1 : (parseInt(minLevelStr, 10) || 1);
  const maxLevelRaw = maxLevelStr === '' ? 999 : (parseInt(maxLevelStr, 10) || 999);
  // Clamp to valid range
  const minLevel = Math.max(1, Math.min(999, minLevelRaw));
  const maxLevel = Math.max(1, Math.min(999, maxLevelRaw));

  // Validate min <= max
  if (trainingEnabled && minLevel > maxLevel) {
    showToast('Minimum training level cannot exceed maximum training level.', 'error');
    return;
  }

  const allowedClasses: string[] = [];
  document.querySelectorAll('.training-class-checkbox:checked').forEach((checkbox) => {
    allowedClasses.push((checkbox as HTMLInputElement).value);
  });

  // Get current features and merge with training settings
  const currentRoom = rooms.find(r => r.id === selectedRoomId);
  const features: RoomFeatures = { ...(currentRoom?.features || {}) };

  if (trainingEnabled) {
    features.training = {
      enabled: true,
      minLevel,
      maxLevel,
      allowedClasses: allowedClasses.length > 0 ? allowedClasses : null,
    };
  } else {
    delete features.training;
  }

  // Build respawn configuration
  const respawnEnabled = (document.getElementById('room-respawn-enabled') as HTMLInputElement).checked;
  const respawnPriorityStr = (document.getElementById('room-respawn-priority') as HTMLInputElement).value;
  const respawnPriority = respawnPriorityStr === '' ? 0 : (parseInt(respawnPriorityStr, 10) || 0);

  // Collect served areas
  const servedAreas: string[] = [];
  document.querySelectorAll('.respawn-area-checkbox:checked').forEach((checkbox) => {
    servedAreas.push((checkbox as HTMLInputElement).value);
  });

  if (respawnEnabled) {
    features.respawn = {
      enabled: true,
      priority: Math.max(0, Math.min(999, respawnPriority)),
      servedAreas: servedAreas.length > 0 ? servedAreas : undefined,
    };
  } else {
    delete features.respawn;
  }

  // Build bank configuration
  const bankEnabled = (document.getElementById('room-bank-enabled') as HTMLInputElement).checked;
  if (bankEnabled) {
    features.bank = { enabled: true };
  } else {
    delete features.bank;
  }

  try {
    const response = await fetch(`/api/rooms/${selectedRoomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, area, terrain, description, features }),
    });

    const data = await response.json();
    if (data.success) {
      const index = rooms.findIndex(r => r.id === selectedRoomId);
      if (index !== -1) {
        rooms[index] = data.room;
      }
      // Update form with saved values to ensure consistency
      (document.getElementById('room-name') as HTMLInputElement).value = data.room.name;
      (document.getElementById('room-area') as HTMLInputElement).value = data.room.area || '';
      (document.getElementById('room-terrain') as HTMLSelectElement).value = data.room.terrain || 'indoor';
      (document.getElementById('room-description') as HTMLTextAreaElement).value = data.room.description || '';
      
      renderRoomList();
      await fetchAreas();
      showToast('Room saved successfully!', 'success');
    } else {
      showToast('Failed to save room: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to save room:', error);
    showToast('Failed to save room', 'error');
  }
}

async function deleteRoom(): Promise<void> {
  if (!selectedRoomId) return;

  const room = rooms.find(r => r.id === selectedRoomId);
  if (!confirm(`Are you sure you want to delete "${room?.name}"?`)) return;

  try {
    const response = await fetch(`/api/rooms/${selectedRoomId}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    if (data.success) {
      rooms = rooms.filter(r => r.id !== selectedRoomId);
      selectedRoomId = null;
      document.getElementById('no-room-selected')!.style.display = 'flex';
      document.getElementById('room-form')!.style.display = 'none';
      renderRoomList();
      await fetchAreas();
      showToast('Room deleted successfully!', 'success');
    } else {
      showToast('Failed to delete room: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to delete room:', error);
    showToast('Failed to delete room', 'error');
  }
}

async function addExit(): Promise<void> {
  if (!selectedRoomId) return;

  const direction = (document.getElementById('exit-direction') as HTMLSelectElement).value;
  const toRoomId = parseInt((document.getElementById('exit-target') as HTMLSelectElement).value);
  const bidirectional = (document.getElementById('exit-bidirectional') as HTMLInputElement).checked;

  if (!direction || isNaN(toRoomId)) {
    showToast('Please select a direction and target room', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/rooms/${selectedRoomId}/exits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, toRoomId, bidirectional }),
    });

    const data = await response.json();
    if (data.success) {
      const index = rooms.findIndex(r => r.id === selectedRoomId);
      if (index !== -1) {
        rooms[index] = data.room;
      }

      // Refresh to get updated exits for both rooms if bidirectional
      if (bidirectional) {
        await fetchRooms();
      }

      selectRoom(selectedRoomId);

      // Reset form
      (document.getElementById('exit-direction') as HTMLSelectElement).value = '';
      (document.getElementById('exit-target') as HTMLSelectElement).value = '';
      showToast('Exit added successfully!', 'success');
    } else {
      showToast('Failed to add exit: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to add exit:', error);
    showToast('Failed to add exit', 'error');
  }
}

async function deleteExit(roomId: number, direction: string): Promise<void> {
  if (!confirm(`Delete exit "${direction}"?`)) return;

  try {
    const response = await fetch(`/api/rooms/${roomId}/exits/${direction}?bidirectional=true`, {
      method: 'DELETE',
    });

    const data = await response.json();
    if (data.success) {
      await fetchRooms();
      if (selectedRoomId) {
        selectRoom(selectedRoomId);
      }
      showToast('Exit deleted successfully!', 'success');
    } else {
      showToast('Failed to delete exit: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to delete exit:', error);
    showToast('Failed to delete exit', 'error');
  }
}

function drawMap(): void {
  if (mapViewMode === 'area') {
    drawAreaMap();
  } else {
    drawRoomMap();
  }
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

  // Get current area filter
  const filterArea = (document.getElementById('area-select') as HTMLSelectElement).value;

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

  // Draw connections (only to rooms in the same area if filtered)
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  for (const [direction, targetId] of Object.entries(currentRoom.exits)) {
    const offset = directionOffsets[direction];
    if (!offset) continue;

    const targetRoom = rooms.find(r => r.id === targetId);
    // Skip if area filter is active and target room is in a different area
    if (filterArea && targetRoom && targetRoom.area !== filterArea) {
      // Draw dashed line to indicate exit to different area
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

    // Check if target room is in a different area (when filtered)
    const isDifferentArea = filterArea && targetRoom && targetRoom.area !== filterArea;
    
    // Use different colors for rooms in different areas
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

    // Draw up/down indicators
    if (targetRoom) {
      const hasUp = 'up' in targetRoom.exits;
      const hasDown = 'down' in targetRoom.exits;
      if (hasUp || hasDown) {
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ffaa00';
        const indicators = (hasUp ? '↑' : '') + (hasDown ? '↓' : '');
        ctx.fillText(indicators, x + roomSize / 2 - 8, y - roomSize / 2 + 12);
      }
    }

    ctx.fillStyle = isDifferentArea ? '#666' : '#aaa';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const name = targetRoom?.name || `Room ${targetId}`;
    const truncated = name.length > 10 ? name.slice(0, 9) + '…' : name;
    ctx.fillText(truncated, x, y - 5);
    ctx.fillStyle = '#666';
    ctx.fillText(`#${targetId}`, x, y + 10);
    
    // Show area name if different from filter
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

  // Draw up/down indicators for current room
  const hasUp = 'up' in currentRoom.exits;
  const hasDown = 'down' in currentRoom.exits;
  if (hasUp || hasDown) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffaa00';
    const indicators = (hasUp ? '↑' : '') + (hasDown ? '↓' : '');
    ctx.fillText(indicators, centerX + roomSize / 2 - 8, centerY - roomSize / 2 + 12);
  }

  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const name = currentRoom.name;
  const truncated = name.length > 10 ? name.slice(0, 9) + '…' : name;
  ctx.fillText(truncated, centerX, centerY - 5);
  ctx.fillStyle = '#00aa00';
  ctx.fillText(`#${currentRoom.id}`, centerX, centerY + 10);
}

function drawAreaMap(): void {
  const canvas = document.getElementById('room-map') as HTMLCanvasElement;
  const container = document.getElementById('map-container')!;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f0f23';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const filterArea = (document.getElementById('area-select') as HTMLSelectElement).value;
  
  // Get rooms in the selected area (or all rooms if no filter)
  const areaRooms = filterArea 
    ? rooms.filter(r => r.area === filterArea)
    : rooms;

  if (areaRooms.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No rooms in this area', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Build a graph and calculate positions using a simple force-directed layout
  const positions = calculateRoomPositions(areaRooms, canvas.width, canvas.height);
  
  const roomSize = 50;

  // Draw connections first (so they're behind rooms)
  ctx.strokeStyle = '#00aa00';
  ctx.lineWidth = 2;

  for (const room of areaRooms) {
    const pos = positions.get(room.id);
    if (!pos) continue;

    for (const [direction, targetId] of Object.entries(room.exits)) {
      const targetPos = positions.get(targetId);
      
      // Check if target is in a different area
      const targetRoom = rooms.find(r => r.id === targetId);
      const isDifferentArea = targetRoom && targetRoom.area !== room.area;
      
      if (isDifferentArea) {
        // Draw dashed line to edge for exits to other areas
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#555';
      } else if (targetPos) {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#00aa00';
      } else {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      
      if (targetPos) {
        ctx.lineTo(targetPos.x, targetPos.y);
      } else {
        // Draw short line toward edge for external connections
        const angle = getDirectionAngle(direction);
        ctx.lineTo(pos.x + Math.cos(angle) * 40, pos.y + Math.sin(angle) * 40);
      }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Draw rooms
  for (const room of areaRooms) {
    const pos = positions.get(room.id);
    if (!pos) continue;

    const isSelected = room.id === selectedRoomId;
    
    // Get level-based colors
    const levelColors = getLevelColors(pos.level);
    
    // Room background
    ctx.fillStyle = isSelected ? '#0e4429' : levelColors.fill;
    ctx.strokeStyle = isSelected ? '#00ff00' : levelColors.stroke;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.roundRect(pos.x - roomSize / 2, pos.y - roomSize / 2, roomSize, roomSize, 4);
    ctx.fill();
    ctx.stroke();

    // Up/down indicators
    const hasUp = 'up' in room.exits;
    const hasDown = 'down' in room.exits;
    if (hasUp || hasDown) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'right';
      const indicators = (hasUp ? '↑' : '') + (hasDown ? '↓' : '');
      ctx.fillText(indicators, pos.x + roomSize / 2 - 2, pos.y - roomSize / 2 + 10);
    }

    // Level indicator in corner
    if (pos.level !== 0) {
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = levelColors.stroke;
      ctx.textAlign = 'left';
      ctx.fillText(`L${pos.level > 0 ? '+' : ''}${pos.level}`, pos.x - roomSize / 2 + 2, pos.y - roomSize / 2 + 10);
    }

    // Room name
    ctx.fillStyle = isSelected ? '#00ff00' : '#aaa';
    ctx.font = isSelected ? 'bold 9px sans-serif' : '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const truncated = room.name.length > 8 ? room.name.slice(0, 7) + '…' : room.name;
    ctx.fillText(truncated, pos.x, pos.y - 5);
    ctx.fillStyle = '#666';
    ctx.font = '8px sans-serif';
    ctx.fillText(`#${room.id}`, pos.x, pos.y + 8);
  }
}

function getLevelColors(level: number): { fill: string; stroke: string } {
  // Color scheme for different levels
  // Level 0 (ground): Green
  // Positive levels (up): Blue shades
  // Negative levels (down): Red/brown shades
  
  if (level === 0) {
    return { fill: '#1a1a2e', stroke: '#00aa00' };
  } else if (level > 0) {
    // Higher levels: cyan/blue tones
    const intensity = Math.min(level, 5);
    const colors = [
      { fill: '#1a2a3e', stroke: '#00aacc' },  // +1: Light cyan
      { fill: '#1a2a4e', stroke: '#00aaff' },  // +2: Cyan
      { fill: '#2a2a5e', stroke: '#5588ff' },  // +3: Blue
      { fill: '#3a2a6e', stroke: '#8866ff' },  // +4: Purple-blue
      { fill: '#4a2a7e', stroke: '#aa55ff' },  // +5+: Purple
    ];
    return colors[Math.min(intensity - 1, colors.length - 1)];
  } else {
    // Lower levels: red/brown tones
    const intensity = Math.min(Math.abs(level), 5);
    const colors = [
      { fill: '#2e1a1a', stroke: '#cc6600' },  // -1: Orange
      { fill: '#3e1a1a', stroke: '#aa4400' },  // -2: Dark orange
      { fill: '#4e1a1a', stroke: '#882200' },  // -3: Brown-red
      { fill: '#5e1a1a', stroke: '#661100' },  // -4: Dark red
      { fill: '#6e1a1a', stroke: '#440000' },  // -5+: Deep red
    ];
    return colors[Math.min(intensity - 1, colors.length - 1)];
  }
}

interface RoomLayoutInfo {
  x: number;
  y: number;
  level: number;
}

function calculateRoomPositions(areaRooms: Room[], width: number, height: number): Map<number, RoomLayoutInfo> {
  const positions = new Map<number, RoomLayoutInfo>();
  const padding = 60;

  // Simple grid-based layout using BFS from a starting room
  const visited = new Set<number>();
  const queue: { id: number; x: number; y: number; level: number }[] = [];
  
  // Start from selected room or first room
  const startRoom = areaRooms.find(r => r.id === selectedRoomId) || areaRooms[0];
  if (!startRoom) return positions;

  const spacing = 80;
  const centerX = width / 2;
  const centerY = height / 2;

  queue.push({ id: startRoom.id, x: centerX, y: centerY, level: 0 });
  visited.add(startRoom.id);

  const directionOffsets: Record<string, { x: number; y: number }> = {
    north: { x: 0, y: -spacing },
    south: { x: 0, y: spacing },
    east: { x: spacing, y: 0 },
    west: { x: -spacing, y: 0 },
    northeast: { x: spacing * 0.7, y: -spacing * 0.7 },
    northwest: { x: -spacing * 0.7, y: -spacing * 0.7 },
    southeast: { x: spacing * 0.7, y: spacing * 0.7 },
    southwest: { x: -spacing * 0.7, y: spacing * 0.7 },
  };

  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Clamp position to canvas bounds
    const x = Math.max(padding, Math.min(width - padding, current.x));
    const y = Math.max(padding, Math.min(height - padding, current.y));
    positions.set(current.id, { x, y, level: current.level });

    const room = areaRooms.find(r => r.id === current.id);
    if (!room) continue;

    for (const [direction, targetId] of Object.entries(room.exits)) {
      if (visited.has(targetId)) continue;
      
      // Only process rooms in the same area
      const targetRoom = areaRooms.find(r => r.id === targetId);
      if (!targetRoom) continue;

      visited.add(targetId);
      
      // Calculate level change for up/down
      let newLevel = current.level;
      if (direction === 'up') newLevel = current.level + 1;
      else if (direction === 'down') newLevel = current.level - 1;
      
      const offset = directionOffsets[direction];
      if (offset) {
        queue.push({ id: targetId, x: current.x + offset.x, y: current.y + offset.y, level: newLevel });
      } else {
        // For up/down, place nearby with offset
        queue.push({ id: targetId, x: current.x + 30, y: current.y + 30, level: newLevel });
      }
    }
  }

  // Place any unvisited rooms (disconnected) in remaining space
  let unvisitedIndex = 0;
  for (const room of areaRooms) {
    if (!positions.has(room.id)) {
      const col = unvisitedIndex % 4;
      const row = Math.floor(unvisitedIndex / 4);
      positions.set(room.id, {
        x: padding + col * spacing,
        y: padding + row * spacing,
        level: 0
      });
      unvisitedIndex++;
    }
  }

  return positions;
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

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showAreaModal(): void {
  const modal = document.getElementById('area-modal')!;
  modal.style.display = 'flex';
  renderAreaList();
}

function hideAreaModal(): void {
  document.getElementById('area-modal')!.style.display = 'none';
}

function renderAreaList(): void {
  const list = document.getElementById('area-list')!;
  
  // Count rooms per area
  const areaCounts = new Map<string, number>();
  for (const room of rooms) {
    const area = room.area || 'No Area';
    areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
  }

  if (areaCounts.size === 0) {
    list.innerHTML = '<li style="color: #666;">No areas yet</li>';
    return;
  }

  list.innerHTML = Array.from(areaCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([area, count]) => `
      <li>
        <div>
          <span class="area-name">${escapeHtml(area)}</span>
          <span class="area-count">(${count} room${count !== 1 ? 's' : ''})</span>
        </div>
        ${area !== 'No Area' ? `<button class="rename-btn" data-area="${escapeHtml(area)}">Rename</button>` : ''}
      </li>
    `)
    .join('');

  list.querySelectorAll('.rename-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const oldName = (btn as HTMLElement).dataset.area!;
      renameArea(oldName);
    });
  });
}

async function renameArea(oldName: string): Promise<void> {
  const newName = prompt(`Rename area "${oldName}" to:`, oldName);
  if (!newName || newName === oldName) return;

  try {
    const response = await fetch(`/api/areas/${encodeURIComponent(oldName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName }),
    });

    const data = await response.json();
    if (data.success) {
      showToast(data.message, 'success');
      await fetchRooms();
      await fetchAreas();
      renderAreaList();
      if (selectedRoomId) {
        selectRoom(selectedRoomId);
      }
    } else {
      showToast('Failed to rename area: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Failed to rename area:', error);
    showToast('Failed to rename area', 'error');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication first
  const hasAccess = await checkAuth();
  if (!hasAccess) {
    return;
  }

  await fetchRooms();
  await fetchAreas();
  await fetchClasses();
  await fetchDoors();

  document.getElementById('new-room-btn')!.addEventListener('click', createRoom);

  // Add door button - redirects to door editor with room pre-selected
  document.getElementById('add-door-btn')!.addEventListener('click', () => {
    if (selectedRoomId) {
      window.location.href = `/door-editor.html?newDoorForRoom=${selectedRoomId}`;
    } else {
      showToast('Please select a room first', 'warning');
    }
  });

  // Set up collapsible sections and checkbox toggles
  setupCollapsibleSection('training-section-header', 'training-section-content');
  setupCheckboxToggle('room-training-enabled', 'training-options');
  setupCollapsibleSection('bank-section-header', 'bank-section-content');
  setupCollapsibleSection('respawn-section-header', 'respawn-section-content');
  setupCheckboxToggle('room-respawn-enabled', 'respawn-options');

  document.getElementById('room-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    saveRoom();
  });
  document.getElementById('delete-room-btn')!.addEventListener('click', deleteRoom);
  document.getElementById('add-exit-btn')!.addEventListener('click', addExit);
  document.getElementById('area-select')!.addEventListener('change', () => {
    renderRoomList();
    drawMap();
  });
  document.getElementById('exit-area-filter')!.addEventListener('change', updateTargetRoomSelect);

  // Map view toggle
  document.getElementById('view-room-btn')!.addEventListener('click', () => {
    mapViewMode = 'room';
    document.getElementById('view-room-btn')!.classList.add('active');
    document.getElementById('view-area-btn')!.classList.remove('active');
    drawMap();
  });
  document.getElementById('view-area-btn')!.addEventListener('click', () => {
    mapViewMode = 'area';
    document.getElementById('view-area-btn')!.classList.add('active');
    document.getElementById('view-room-btn')!.classList.remove('active');
    drawMap();
  });

  // Area management
  document.getElementById('manage-areas-btn')!.addEventListener('click', showAreaModal);
  document.getElementById('close-area-modal')!.addEventListener('click', hideAreaModal);
  document.getElementById('area-modal')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideAreaModal();
  });

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
    // Prevent clicks inside the dropdown from closing it
    userMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    document.addEventListener('click', () => {
      userMenu.classList.remove('open');
    });
  }

  // Redraw map on resize
  window.addEventListener('resize', drawMap);
});

})();
