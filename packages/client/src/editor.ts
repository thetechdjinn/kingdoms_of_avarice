interface Room {
  id: number;
  name: string;
  description: string | null;
  area: string | null;
  exits: Record<string, number>;
}

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

let rooms: Room[] = [];
let selectedRoomId: number | null = null;
let areas: string[] = [];
let currentUser: AuthInfo | null = null;

async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me');
    const data: AuthInfo = await response.json();
    currentUser = data;
    
    if (!data.authenticated) {
      showLoginRequired();
      return false;
    }

    // Check if user has Developer or Admin role
    const roles = data.roles || [];
    const hasDeveloperAccess = roles.includes('developer') || roles.includes('admin');
    
    if (!hasDeveloperAccess) {
      showAccessDenied();
      return false;
    }

    // Update nav with username
    const usernameEl = document.getElementById('nav-username');
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username;
    }

    return true;
  } catch (error) {
    console.error('Failed to check auth:', error);
    showLoginRequired();
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

function showLoginRequired(): void {
  const app = document.getElementById('editor-app')!;
  app.innerHTML = `
    <div class="auth-message">
      <h1>Authentication Required</h1>
      <p>You must be logged in to access the Room Editor.</p>
      <a href="/" class="btn-primary">Go to Login</a>
    </div>
  `;
}

function showAccessDenied(): void {
  const app = document.getElementById('editor-app')!;
  app.innerHTML = `
    <div class="auth-message">
      <h1>Access Denied</h1>
      <p>You do not have permission to access the Room Editor.</p>
      <p>Developer or Admin role is required.</p>
      <a href="/" class="btn-primary">Back to Game</a>
    </div>
  `;
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

async function fetchAreas(): Promise<void> {
  try {
    const response = await fetch('/api/areas');
    const data = await response.json();
    if (data.success) {
      areas = data.areas;
      updateAreaFilter();
      updateAreaSuggestions();
    }
  } catch (error) {
    console.error('Failed to fetch areas:', error);
  }
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

function updateTargetRoomSelect(): void {
  const select = document.getElementById('exit-target') as HTMLSelectElement;
  select.innerHTML = '<option value="">Select target room...</option>' +
    rooms
      .filter(r => r.id !== selectedRoomId)
      .sort((a, b) => a.id - b.id)
      .map(room => `<option value="${room.id}">[${room.id}] ${escapeHtml(room.name)}</option>`)
      .join('');
}

function selectRoom(id: number): void {
  selectedRoomId = id;
  const room = rooms.find(r => r.id === id);

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
  (document.getElementById('room-description') as HTMLTextAreaElement).value = room.description || '';

  renderExits(room);
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
    } else {
      alert('Failed to create room: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to create room:', error);
    alert('Failed to create room');
  }
}

async function saveRoom(): Promise<void> {
  if (!selectedRoomId) return;

  const name = (document.getElementById('room-name') as HTMLInputElement).value;
  const area = (document.getElementById('room-area') as HTMLInputElement).value;
  const description = (document.getElementById('room-description') as HTMLTextAreaElement).value;

  try {
    const response = await fetch(`/api/rooms/${selectedRoomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, area, description }),
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
      (document.getElementById('room-description') as HTMLTextAreaElement).value = data.room.description || '';
      
      renderRoomList();
      await fetchAreas();
    } else {
      alert('Failed to save room: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to save room:', error);
    alert('Failed to save room');
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
    } else {
      alert('Failed to delete room: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to delete room:', error);
    alert('Failed to delete room');
  }
}

async function addExit(): Promise<void> {
  if (!selectedRoomId) return;

  const direction = (document.getElementById('exit-direction') as HTMLSelectElement).value;
  const toRoomId = parseInt((document.getElementById('exit-target') as HTMLSelectElement).value);
  const bidirectional = (document.getElementById('exit-bidirectional') as HTMLInputElement).checked;

  if (!direction || isNaN(toRoomId)) {
    alert('Please select a direction and target room');
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
    } else {
      alert('Failed to add exit: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to add exit:', error);
    alert('Failed to add exit');
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
    } else {
      alert('Failed to delete exit: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to delete exit:', error);
    alert('Failed to delete exit');
  }
}

function drawMap(): void {
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

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + offset.x, centerY + offset.y);
    ctx.stroke();
  }

  // Draw connected rooms
  for (const [direction, targetId] of Object.entries(currentRoom.exits)) {
    const offset = directionOffsets[direction];
    if (!offset) continue;

    const targetRoom = rooms.find(r => r.id === targetId);
    const x = centerX + offset.x;
    const y = centerY + offset.y;

    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#00aa00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - roomSize / 2, y - roomSize / 2, roomSize, roomSize, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const name = targetRoom?.name || `Room ${targetId}`;
    const truncated = name.length > 10 ? name.slice(0, 9) + '…' : name;
    ctx.fillText(truncated, x, y - 5);
    ctx.fillStyle = '#666';
    ctx.fillText(`#${targetId}`, x, y + 10);
  }

  // Draw current room (center)
  ctx.fillStyle = '#0e4429';
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(centerX - roomSize / 2, centerY - roomSize / 2, roomSize, roomSize, 4);
  ctx.fill();
  ctx.stroke();

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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
      alert(data.message);
      await fetchRooms();
      await fetchAreas();
      renderAreaList();
      if (selectedRoomId) {
        selectRoom(selectedRoomId);
      }
    } else {
      alert('Failed to rename area: ' + data.message);
    }
  } catch (error) {
    console.error('Failed to rename area:', error);
    alert('Failed to rename area');
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

  document.getElementById('new-room-btn')!.addEventListener('click', createRoom);
  document.getElementById('room-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    saveRoom();
  });
  document.getElementById('delete-room-btn')!.addEventListener('click', deleteRoom);
  document.getElementById('add-exit-btn')!.addEventListener('click', addExit);
  document.getElementById('area-select')!.addEventListener('change', renderRoomList);

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
    document.addEventListener('click', () => {
      userMenu.classList.remove('open');
    });
  }

  // Redraw map on resize
  window.addEventListener('resize', drawMap);
});
