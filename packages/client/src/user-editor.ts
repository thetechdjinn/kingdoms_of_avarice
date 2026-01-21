(function() {

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

interface UserWithDetails {
  id: number;
  username: string;
  email: string | null;
  max_characters: number | null;
  created_at: string;
  last_login: string | null;
  character_count: number;
  roles: string[];
}

interface DbCharacter {
  id: number;
  player_id: number;
  name: string;
  race: string;
  class: string;
  level: number;
  experience: number;
  health: number;
  max_health: number;
  mana: number;
  max_mana: number;
  strength: number;
  intelligence: number;
  dexterity: number;
  constitution: number;
  wisdom: number;
  charisma: number;
  current_room_id: number;
  gold: number;
  copper: number;
  silver: number;
  platinum: number;
  runic: number;
}

let currentUser: AuthInfo | null = null;
let users: UserWithDetails[] = [];
let selectedUserId: number | null = null;
let selectedUserData: UserWithDetails | null = null;
let userCharacters: DbCharacter[] = [];

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
    const isAdmin = roles.includes('admin');

    if (!isAdmin) {
      window.location.href = '/';
      return false;
    }

    const usernameEl = document.getElementById('nav-username');
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username;
    }

    // Show developer dropdown if developer or admin
    const hasDeveloperAccess = roles.includes('developer') || roles.includes('admin');
    const devDropdown = document.getElementById('nav-dev-dropdown');
    if (devDropdown) {
      devDropdown.style.display = hasDeveloperAccess ? 'flex' : 'none';
    }

    // Show admin dropdown
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
// User List
// ============================================================================

async function loadUsers(): Promise<void> {
  try {
    const response = await fetch('/api/admin/users', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      users = data.users;
      renderUserList();
    } else {
      showListError('Failed to load users');
    }
  } catch (error) {
    console.error('Failed to load users:', error);
    showListError('Failed to connect to server');
  }
}

function renderUserList(): void {
  const list = document.getElementById('user-list');
  if (!list) return;

  const searchTerm = (document.getElementById('search-input') as HTMLInputElement)?.value.toLowerCase() || '';
  const roleFilter = (document.getElementById('role-filter') as HTMLSelectElement)?.value || '';

  let filteredUsers = users;

  if (searchTerm) {
    filteredUsers = filteredUsers.filter(u =>
      u.username.toLowerCase().includes(searchTerm) ||
      (u.email && u.email.toLowerCase().includes(searchTerm))
    );
  }

  if (roleFilter) {
    filteredUsers = filteredUsers.filter(u => u.roles.includes(roleFilter));
  }

  if (filteredUsers.length === 0) {
    list.innerHTML = '<li class="empty-state">No users found</li>';
    return;
  }

  list.innerHTML = filteredUsers
    .map(user => {
      const primaryRole = getPrimaryRole(user.roles);
      return `
        <li data-id="${user.id}" class="${user.id === selectedUserId ? 'selected' : ''}">
          <div class="user-info">
            <span class="user-name">${escapeHtml(user.username)}</span>
            <span class="user-role ${primaryRole}">${primaryRole}</span>
          </div>
          <div class="user-meta">${user.character_count} character${user.character_count !== 1 ? 's' : ''}</div>
        </li>
      `;
    })
    .join('');

  list.querySelectorAll('li[data-id]').forEach(li => {
    li.addEventListener('click', () => {
      const id = parseInt((li as HTMLElement).dataset.id!);
      selectUser(id);
    });
  });
}

function getPrimaryRole(roles: string[]): string {
  const priority = ['admin', 'sysop', 'developer', 'moderator', 'player', 'pending'];
  for (const role of priority) {
    if (roles.includes(role)) return role;
  }
  return 'pending';
}

function showListError(message: string): void {
  const list = document.getElementById('user-list');
  if (list) {
    list.innerHTML = `<li class="empty-state" style="color: #ff4444;">${escapeHtml(message)}</li>`;
  }
}

// ============================================================================
// User Selection
// ============================================================================

async function selectUser(userId: number): Promise<void> {
  selectedUserId = userId;
  renderUserList();

  try {
    const response = await fetch(`/api/admin/users/${userId}`, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      selectedUserData = data.user;
      userCharacters = data.characters;
      populateUserForm();
      showUserForm();
    } else {
      showUserMessage('Failed to load user details', 'error');
    }
  } catch (error) {
    console.error('Failed to load user:', error);
    showUserMessage('Failed to load user details', 'error');
  }
}

function populateUserForm(): void {
  if (!selectedUserData) return;

  const user = selectedUserData;

  (document.getElementById('user-form-title') as HTMLElement).textContent = `Edit: ${user.username}`;
  (document.getElementById('user-id-display') as HTMLElement).textContent = `ID: ${user.id}`;

  (document.getElementById('user-username') as HTMLInputElement).value = user.username;
  (document.getElementById('user-email') as HTMLInputElement).value = user.email || '';
  (document.getElementById('user-role') as HTMLSelectElement).value = getPrimaryRole(user.roles);
  (document.getElementById('user-max-chars') as HTMLInputElement).value = user.max_characters?.toString() || '';
  (document.getElementById('user-created') as HTMLInputElement).value = formatDate(user.created_at);
  (document.getElementById('user-last-login') as HTMLInputElement).value = user.last_login ? formatDate(user.last_login) : 'Never';

  renderCharactersList();
}

function renderCharactersList(): void {
  const list = document.getElementById('characters-list');
  if (!list) return;

  if (userCharacters.length === 0) {
    list.innerHTML = '<li class="empty-state">No characters</li>';
    return;
  }

  list.innerHTML = userCharacters
    .map(char => `
      <li class="character-item">
        <div class="character-info">
          <div class="character-name">${escapeHtml(char.name)}</div>
          <div class="character-meta">Level ${char.level} ${escapeHtml(char.race)} ${escapeHtml(char.class)} - Room ${char.current_room_id}</div>
        </div>
        <div class="character-actions">
          <button class="btn-small" data-edit="${char.id}">Edit</button>
          <button class="btn-danger btn-small" data-delete="${char.id}">Delete</button>
        </div>
      </li>
    `)
    .join('');

  // Edit buttons
  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const charId = parseInt((btn as HTMLElement).dataset.edit!);
      openCharacterModal(charId);
    });
  });

  // Delete buttons
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const charId = parseInt((btn as HTMLElement).dataset.delete!);
      deleteCharacter(charId);
    });
  });
}

function showUserForm(): void {
  (document.getElementById('no-user-selected') as HTMLElement).style.display = 'none';
  (document.getElementById('user-form') as HTMLElement).style.display = 'block';
}

// ============================================================================
// User Actions
// ============================================================================

async function saveUser(): Promise<void> {
  if (!selectedUserId) return;

  const username = (document.getElementById('user-username') as HTMLInputElement).value.trim();
  const email = (document.getElementById('user-email') as HTMLInputElement).value.trim() || null;
  const role = (document.getElementById('user-role') as HTMLSelectElement).value;
  const maxCharsStr = (document.getElementById('user-max-chars') as HTMLInputElement).value.trim();
  const max_characters = maxCharsStr ? parseInt(maxCharsStr) : null;

  if (username.length < 3) {
    showUserMessage('Username must be at least 3 characters', 'error');
    return;
  }

  try {
    // Update role first if changed (more critical for security)
    const currentRole = getPrimaryRole(selectedUserData?.roles || []);
    if (role !== currentRole) {
      const roleResponse = await fetch(`/api/admin/users/${selectedUserId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
        credentials: 'include',
      });

      const roleData = await roleResponse.json();
      if (!roleData.success) {
        showUserMessage(roleData.message || 'Failed to update role', 'error');
        return;
      }
    }

    // Update user details
    const updateResponse = await fetch(`/api/admin/users/${selectedUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, max_characters }),
      credentials: 'include',
    });

    const updateData = await updateResponse.json();
    if (!updateData.success) {
      showUserMessage(updateData.message || 'Failed to update user', 'error');
      return;
    }

    showUserMessage('User saved successfully!', 'success');

    // Refresh user list and details
    await loadUsers();
    await selectUser(selectedUserId);
  } catch (error) {
    console.error('Failed to save user:', error);
    showUserMessage('Failed to save user', 'error');
  }
}

async function resetPassword(): Promise<void> {
  if (!selectedUserId || !selectedUserData) return;

  if (!confirm(`Reset password for ${selectedUserData.username}?`)) return;

  try {
    const response = await fetch(`/api/admin/users/${selectedUserId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    });

    const data = await response.json();
    if (data.success) {
      showPasswordModal(data.password);
    } else {
      showUserMessage(data.message || 'Failed to reset password', 'error');
    }
  } catch (error) {
    console.error('Failed to reset password:', error);
    showUserMessage('Failed to reset password', 'error');
  }
}

let passwordClearTimeout: ReturnType<typeof setTimeout> | null = null;

function showPasswordModal(password: string): void {
  const modal = document.getElementById('password-modal');
  const messageEl = document.getElementById('password-message');
  const displayEl = document.getElementById('password-display');

  if (!modal || !messageEl || !displayEl) return;

  messageEl.textContent = `Password has been reset for ${selectedUserData?.username}. The new password is:`;
  displayEl.textContent = password;
  displayEl.style.display = 'block';
  modal.style.display = 'flex';

  // Clear any existing timeout
  if (passwordClearTimeout) {
    clearTimeout(passwordClearTimeout);
  }

  // Auto-clear password from DOM after 60 seconds for security
  passwordClearTimeout = setTimeout(() => {
    displayEl.textContent = '(password cleared for security)';
    passwordClearTimeout = null;
  }, 60000);
}

function hidePasswordModal(): void {
  const modal = document.getElementById('password-modal');
  const displayEl = document.getElementById('password-display');

  if (modal) modal.style.display = 'none';

  // Clear password from DOM immediately when closing
  if (displayEl) displayEl.textContent = '';

  // Clear pending timeout
  if (passwordClearTimeout) {
    clearTimeout(passwordClearTimeout);
    passwordClearTimeout = null;
  }
}

function showUserMessage(message: string, type: 'success' | 'error'): void {
  const msgEl = document.getElementById('user-message')!;
  msgEl.textContent = message;
  msgEl.className = `message ${type}`;
  msgEl.style.display = 'block';

  setTimeout(() => {
    msgEl.style.display = 'none';
  }, 5000);
}

// ============================================================================
// Character Modal
// ============================================================================

function openCharacterModal(charId: number): void {
  const char = userCharacters.find(c => c.id === charId);
  if (!char) return;

  (document.getElementById('char-id') as HTMLInputElement).value = String(char.id);
  (document.getElementById('char-name') as HTMLInputElement).value = char.name;
  (document.getElementById('char-level') as HTMLInputElement).value = String(char.level);
  (document.getElementById('char-race') as HTMLInputElement).value = char.race;
  (document.getElementById('char-class') as HTMLInputElement).value = char.class;
  (document.getElementById('char-experience') as HTMLInputElement).value = String(char.experience);
  (document.getElementById('char-gold') as HTMLInputElement).value = String(char.gold);
  (document.getElementById('char-health') as HTMLInputElement).value = String(char.health);
  (document.getElementById('char-max-health') as HTMLInputElement).value = String(char.max_health);
  (document.getElementById('char-mana') as HTMLInputElement).value = String(char.mana);
  (document.getElementById('char-max-mana') as HTMLInputElement).value = String(char.max_mana);
  (document.getElementById('char-str') as HTMLInputElement).value = String(char.strength);
  (document.getElementById('char-int') as HTMLInputElement).value = String(char.intelligence);
  (document.getElementById('char-dex') as HTMLInputElement).value = String(char.dexterity);
  (document.getElementById('char-con') as HTMLInputElement).value = String(char.constitution);
  (document.getElementById('char-wis') as HTMLInputElement).value = String(char.wisdom);
  (document.getElementById('char-cha') as HTMLInputElement).value = String(char.charisma);
  (document.getElementById('char-room') as HTMLInputElement).value = String(char.current_room_id);

  hideCharMessage();
  document.getElementById('character-modal')!.style.display = 'flex';
}

function hideCharacterModal(): void {
  document.getElementById('character-modal')!.style.display = 'none';
}

async function saveCharacter(): Promise<void> {
  const charId = parseInt((document.getElementById('char-id') as HTMLInputElement).value, 10);

  const parseIntSafe = (value: string): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  const updates = {
    name: (document.getElementById('char-name') as HTMLInputElement).value.trim(),
    level: parseIntSafe((document.getElementById('char-level') as HTMLInputElement).value),
    race: (document.getElementById('char-race') as HTMLInputElement).value.trim(),
    class: (document.getElementById('char-class') as HTMLInputElement).value.trim(),
    experience: parseIntSafe((document.getElementById('char-experience') as HTMLInputElement).value),
    gold: parseIntSafe((document.getElementById('char-gold') as HTMLInputElement).value),
    health: parseIntSafe((document.getElementById('char-health') as HTMLInputElement).value),
    max_health: parseIntSafe((document.getElementById('char-max-health') as HTMLInputElement).value),
    mana: parseIntSafe((document.getElementById('char-mana') as HTMLInputElement).value),
    max_mana: parseIntSafe((document.getElementById('char-max-mana') as HTMLInputElement).value),
    strength: parseIntSafe((document.getElementById('char-str') as HTMLInputElement).value),
    intelligence: parseIntSafe((document.getElementById('char-int') as HTMLInputElement).value),
    dexterity: parseIntSafe((document.getElementById('char-dex') as HTMLInputElement).value),
    constitution: parseIntSafe((document.getElementById('char-con') as HTMLInputElement).value),
    wisdom: parseIntSafe((document.getElementById('char-wis') as HTMLInputElement).value),
    charisma: parseIntSafe((document.getElementById('char-cha') as HTMLInputElement).value),
    current_room_id: parseIntSafe((document.getElementById('char-room') as HTMLInputElement).value),
  };

  if (updates.name.length < 2) {
    showCharMessage('Name must be at least 2 characters', 'error');
    return;
  }

  if (updates.level < 1) {
    showCharMessage('Level must be at least 1', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/admin/characters/${charId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      credentials: 'include',
    });

    const data = await response.json();
    if (data.success) {
      hideCharacterModal();
      // Refresh character list
      if (selectedUserId) {
        await selectUser(selectedUserId);
      }
    } else {
      showCharMessage(data.message || 'Failed to save character', 'error');
    }
  } catch (error) {
    console.error('Failed to save character:', error);
    showCharMessage('Failed to save character', 'error');
  }
}

async function deleteCharacter(charId: number): Promise<void> {
  const char = userCharacters.find(c => c.id === charId);
  if (!char) return;

  if (!confirm(`Delete character "${char.name}"? This cannot be undone.`)) return;

  try {
    const response = await fetch(`/api/admin/characters/${charId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await response.json();
    if (data.success) {
      // Refresh character list
      if (selectedUserId) {
        await selectUser(selectedUserId);
        await loadUsers(); // Refresh user list to update character count
      }
    } else {
      showUserMessage(data.message || 'Failed to delete character', 'error');
    }
  } catch (error) {
    console.error('Failed to delete character:', error);
    showUserMessage('Failed to delete character', 'error');
  }
}

function showCharMessage(message: string, type: 'success' | 'error'): void {
  const msgEl = document.getElementById('char-message');
  if (!msgEl) return;
  msgEl.textContent = message;
  msgEl.className = `message ${type}`;
  msgEl.style.display = 'block';
}

function hideCharMessage(): void {
  const msgEl = document.getElementById('char-message');
  if (!msgEl) return;
  msgEl.style.display = 'none';
}

// ============================================================================
// Tab Handling
// ============================================================================

function setupTabs(): void {
  document.querySelectorAll('.user-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;
      if (!tabName) return;

      document.querySelectorAll('.user-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.user-section').forEach(section => {
        section.classList.remove('active');
      });
      const targetSection = document.getElementById(`tab-${tabName}`);
      if (targetSection) targetSection.classList.add('active');
    });
  });
}

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  setupTabs();
  await loadUsers();

  // Filter handlers
  const searchInput = document.getElementById('search-input');
  const roleFilter = document.getElementById('role-filter');
  if (searchInput) searchInput.addEventListener('input', renderUserList);
  if (roleFilter) roleFilter.addEventListener('change', renderUserList);

  // Save user button
  const saveUserBtn = document.getElementById('save-user-btn');
  if (saveUserBtn) saveUserBtn.addEventListener('click', saveUser);

  // Reset password button
  const resetPasswordBtn = document.getElementById('reset-password-btn');
  if (resetPasswordBtn) resetPasswordBtn.addEventListener('click', resetPassword);

  // Character modal
  const closeCharModalBtn = document.getElementById('close-character-modal');
  const cancelCharBtn = document.getElementById('cancel-character-btn');
  const saveCharBtn = document.getElementById('save-character-btn');
  if (closeCharModalBtn) closeCharModalBtn.addEventListener('click', hideCharacterModal);
  if (cancelCharBtn) cancelCharBtn.addEventListener('click', hideCharacterModal);
  if (saveCharBtn) saveCharBtn.addEventListener('click', saveCharacter);

  // Password modal
  const closePasswordModalBtn = document.getElementById('close-password-modal');
  const closePasswordBtn = document.getElementById('close-password-btn');
  if (closePasswordModalBtn) closePasswordModalBtn.addEventListener('click', hidePasswordModal);
  if (closePasswordBtn) closePasswordBtn.addEventListener('click', hidePasswordModal);

  // Click outside modals to close
  const charModal = document.getElementById('character-modal');
  const passModal = document.getElementById('password-modal');
  if (charModal) {
    charModal.addEventListener('click', (e) => {
      if (e.target === charModal) hideCharacterModal();
    });
  }
  if (passModal) {
    passModal.addEventListener('click', (e) => {
      if (e.target === passModal) hidePasswordModal();
    });
  }

  // Logout handler
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

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
