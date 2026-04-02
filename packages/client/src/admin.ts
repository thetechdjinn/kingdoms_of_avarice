import { renderNav } from './components/nav.js';
import { initAuth } from './components/auth.js';
import { showConfirm } from './components/modal.js';

(function() {

interface PendingUser {
  id: number;
  username: string;
}

interface PlayerSummary {
  id: number;
  username: string;
  email: string | null;
  max_characters: number | null;
  created_at: string;
  last_login: string | null;
}

interface IpAccessEntry {
  id: number;
  entry: string;
  entry_type: 'ip' | 'hostname';
  resolved_ips: string[] | null;
  list_type: 'allow' | 'block';
  reason: string | null;
  created_at: string;
}

interface GameSettings {
  max_characters_per_player: number;
  ip_access_mode: 'allowlist' | 'blocklist';
  max_negative_hp_percent?: number;
  dropped_tick_interval_ms?: number;
  backstab_base_min_multiplier?: number;
  backstab_base_max_multiplier?: number;
  backstab_level_bonus_min?: number;
  backstab_level_bonus_max?: number;
  health_tick_interval_ms?: number;
  mana_tick_interval_ms?: number;
  health_regen_base_percent?: number;
  health_regen_enhanced_percent?: number;
  mana_regen_base_percent?: number;
  mana_regen_enhanced_percent?: number;
  blind_accuracy_penalty?: number;
  crit_soft_cap?: number;
  xp_overcap_percent?: number;
}

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


async function loadPendingUsers(): Promise<void> {
  const listEl = document.getElementById('pending-users-list');
  if (!listEl) return;

  try {
    const response = await fetch('/api/admin/pending-users', { credentials: 'include' });
    
    if (!response.ok) {
      listEl.innerHTML = '<p class="no-users">Error loading users</p>';
      return;
    }

    const data = await response.json();
    const users: PendingUser[] = data.users || [];

    if (users.length === 0) {
      listEl.innerHTML = '<p class="no-users">No users pending approval</p>';
      return;
    }

    listEl.innerHTML = '';
    
    for (const user of users) {
      const userItem = document.createElement('div');
      userItem.className = 'user-item';
      userItem.dataset.userId = String(user.id);
      
      const userInfo = document.createElement('div');
      userInfo.className = 'user-info';
      
      const userName = document.createElement('span');
      userName.className = 'user-name';
      userName.textContent = user.username;
      
      const userId = document.createElement('span');
      userId.className = 'user-id';
      userId.textContent = `ID: ${user.id}`;
      
      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn-approve';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', () => approveUser(user.id));
      
      userInfo.appendChild(userName);
      userInfo.appendChild(userId);
      userItem.appendChild(userInfo);
      userItem.appendChild(approveBtn);
      listEl.appendChild(userItem);
    }
  } catch (error) {
    console.error('Failed to load pending users:', error);
    listEl.innerHTML = '<p class="no-users">Error loading users</p>';
  }
}

async function approveUser(playerId: number): Promise<void> {
  const userItem = document.querySelector(`[data-user-id="${playerId}"]`);
  const button = userItem?.querySelector('.btn-approve') as HTMLButtonElement;
  
  if (button) {
    button.disabled = true;
    button.textContent = 'Approving...';
  }

  try {
    const response = await fetch('/api/admin/approve-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      // Remove the user from the list
      userItem?.remove();

      // Check if list is now empty
      const listEl = document.getElementById('pending-users-list');
      if (listEl && listEl.children.length === 0) {
        listEl.innerHTML = '<p class="no-users">No users pending approval</p>';
      }
      showToast('User approved successfully!', 'success');
    } else {
      if (button) {
        button.disabled = false;
        button.textContent = 'Approve';
      }
      showToast('Failed to approve user: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Failed to approve user:', error);
    if (button) {
      button.disabled = false;
      button.textContent = 'Approve';
    }
    showToast('Failed to approve user', 'error');
  }
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function setupTabs(): void {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      if (!tabName) return;

      // Update active tab button
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show/hide tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        (content as HTMLElement).style.display = 'none';
      });

      const targetContent = document.getElementById(`${tabName}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'block';
      }

      // Load data for the tab
      if (tabName === 'ip-access') {
        loadIpAccessEntries();
      } else if (tabName === 'settings') {
        loadSettings();
      }
    });
  });
}

// ============================================================================
// ALL PLAYERS MANAGEMENT
// ============================================================================

async function loadAllPlayers(): Promise<void> {
  const listEl = document.getElementById('all-players-list');
  if (!listEl) return;

  try {
    const [playersRes, settingsRes] = await Promise.all([
      fetch('/api/admin/players', { credentials: 'include' }),
      fetch('/api/admin/settings', { credentials: 'include' }),
    ]);

    const playersData = await playersRes.json();
    const settingsData = await settingsRes.json();

    if (!playersData.success) {
      listEl.innerHTML = '<p class="no-users">Error loading players</p>';
      return;
    }

    const players: PlayerSummary[] = playersData.players || [];
    const globalMax = settingsData.settings?.max_characters_per_player || 3;

    if (players.length === 0) {
      listEl.innerHTML = '<p class="no-users">No players found</p>';
      return;
    }

    listEl.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Max Characters</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${players.map(p => `
            <tr data-player-id="${p.id}">
              <td>${escapeHtml(p.username)}</td>
              <td>${p.email ? escapeHtml(p.email) : '<span class="muted">-</span>'}</td>
              <td>
                <input type="number" class="player-max-chars" value="${p.max_characters ?? ''}"
                       placeholder="${globalMax}" min="1" max="100" style="width: 80px" />
              </td>
              <td>
                <button class="btn-small save-player-limit-btn">Save</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Add event listeners for save buttons
    listEl.querySelectorAll('.save-player-limit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = (e.target as HTMLElement).closest('tr');
        const playerId = parseInt(row?.getAttribute('data-player-id') || '0');
        const input = row?.querySelector('.player-max-chars') as HTMLInputElement;
        const value = input?.value.trim();

        // Validate input
        if (value !== '') {
          const numValue = parseInt(value, 10);
          if (isNaN(numValue) || numValue < 1) {
            showToast('Please enter a valid positive number or leave empty for default', 'warning');
            return;
          }
        }

        await savePlayerCharacterLimit(playerId, value === '' ? null : parseInt(value, 10));
      });
    });
  } catch (error) {
    console.error('Failed to load players:', error);
    listEl.innerHTML = '<p class="no-users">Error loading players</p>';
  }
}

async function savePlayerCharacterLimit(playerId: number, maxCharacters: number | null): Promise<void> {
  try {
    const response = await fetch(`/api/admin/players/${playerId}/max-characters`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxCharacters }),
      credentials: 'include',
    });

    const data = await response.json();
    if (data.success) {
      showToast('Character limit saved!', 'success');
    } else {
      showToast('Failed to save: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Failed to save player limit:', error);
    showToast('Failed to save player limit', 'error');
  }
}

// ============================================================================
// IP ACCESS MANAGEMENT
// ============================================================================

async function loadIpAccessEntries(): Promise<void> {
  const listEl = document.getElementById('ip-access-list');
  if (!listEl) return;

  try {
    const response = await fetch('/api/admin/ip-access', { credentials: 'include' });
    const data = await response.json();

    if (!data.success) {
      listEl.innerHTML = '<p class="no-users">Error loading IP entries</p>';
      return;
    }

    const entries: IpAccessEntry[] = data.entries || [];

    if (entries.length === 0) {
      listEl.innerHTML = '<p class="no-users">No IP access entries</p>';
      return;
    }

    listEl.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Entry</th>
            <th>Type</th>
            <th>List</th>
            <th>Resolved IPs</th>
            <th>Reason</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => `
            <tr data-entry-id="${e.id}">
              <td>${escapeHtml(e.entry)}</td>
              <td><span class="badge badge-${e.entry_type}">${e.entry_type}</span></td>
              <td><span class="badge badge-${e.list_type}">${e.list_type}</span></td>
              <td>${e.resolved_ips ? escapeHtml(e.resolved_ips.join(', ')) : '<span class="muted">-</span>'}</td>
              <td>${e.reason ? escapeHtml(e.reason) : '<span class="muted">-</span>'}</td>
              <td>
                <button class="btn-delete delete-ip-entry-btn">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Add event listeners for delete buttons
    listEl.querySelectorAll('.delete-ip-entry-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = (e.target as HTMLElement).closest('tr');
        const entryId = parseInt(row?.getAttribute('data-entry-id') || '0');
        if (await showConfirm('Are you sure you want to delete this entry?', { dangerous: true })) {
          await deleteIpEntry(entryId);
        }
      });
    });
  } catch (error) {
    console.error('Failed to load IP entries:', error);
    listEl.innerHTML = '<p class="no-users">Error loading IP entries</p>';
  }
}

async function addIpEntry(): Promise<void> {
  const entry = (document.getElementById('ip-entry') as HTMLInputElement).value.trim();
  const entryType = (document.getElementById('ip-entry-type') as HTMLSelectElement).value;
  const listType = (document.getElementById('ip-list-type') as HTMLSelectElement).value;
  const reason = (document.getElementById('ip-reason') as HTMLInputElement).value.trim();
  const messageEl = document.getElementById('ip-entry-message')!;

  if (!entry) {
    messageEl.textContent = 'Please enter an IP address or hostname';
    messageEl.className = 'message error';
    return;
  }

  try {
    const response = await fetch('/api/admin/ip-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry, entryType, listType, reason: reason || undefined }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Entry added successfully';
      messageEl.className = 'message success';
      // Clear form
      (document.getElementById('ip-entry') as HTMLInputElement).value = '';
      (document.getElementById('ip-reason') as HTMLInputElement).value = '';
      // Reload list
      await loadIpAccessEntries();
    } else {
      messageEl.textContent = data.message || 'Failed to add entry';
      messageEl.className = 'message error';
    }
  } catch (error) {
    console.error('Failed to add IP entry:', error);
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

async function deleteIpEntry(entryId: number): Promise<void> {
  try {
    const response = await fetch(`/api/admin/ip-access/${entryId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      await loadIpAccessEntries();
      showToast('IP entry deleted!', 'success');
    } else {
      showToast('Failed to delete: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Failed to delete IP entry:', error);
    showToast('Failed to delete entry', 'error');
  }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

async function loadSettings(): Promise<void> {
  try {
    const response = await fetch('/api/admin/settings', { credentials: 'include' });
    const data = await response.json();

    if (data.success) {
      const settings: GameSettings = data.settings;

      (document.getElementById('setting-max-chars') as HTMLInputElement).value =
        String(settings.max_characters_per_player);
      (document.getElementById('setting-ip-mode') as HTMLSelectElement).value =
        settings.ip_access_mode;
      (document.getElementById('setting-max-negative-hp') as HTMLInputElement).value =
        String(settings.max_negative_hp_percent ?? 50);
      (document.getElementById('setting-dropped-tick') as HTMLInputElement).value =
        String(settings.dropped_tick_interval_ms ?? 5000);
      // Backstab settings
      (document.getElementById('setting-bs-min-mult') as HTMLInputElement).value =
        String(settings.backstab_base_min_multiplier ?? 2.0);
      (document.getElementById('setting-bs-max-mult') as HTMLInputElement).value =
        String(settings.backstab_base_max_multiplier ?? 3.0);
      (document.getElementById('setting-bs-level-min') as HTMLInputElement).value =
        String(settings.backstab_level_bonus_min ?? 0.20);
      (document.getElementById('setting-bs-level-max') as HTMLInputElement).value =
        String(settings.backstab_level_bonus_max ?? 0.50);

      // Vision & Combat settings
      (document.getElementById('setting-blind-accuracy') as HTMLInputElement).value =
        String(settings.blind_accuracy_penalty ?? 10);
      (document.getElementById('setting-crit-soft-cap') as HTMLInputElement).value =
        String(settings.crit_soft_cap ?? 37);

      // Progression settings
      (document.getElementById('setting-xp-overcap') as HTMLInputElement).value =
        String(settings.xp_overcap_percent ?? 50);

      // Regen settings
      (document.getElementById('setting-health-tick') as HTMLInputElement).value =
        String(settings.health_tick_interval_ms ?? 5000);
      (document.getElementById('setting-mana-tick') as HTMLInputElement).value =
        String(settings.mana_tick_interval_ms ?? 5000);
      (document.getElementById('setting-health-base') as HTMLInputElement).value =
        String(settings.health_regen_base_percent ?? 1);
      (document.getElementById('setting-health-enhanced') as HTMLInputElement).value =
        String(settings.health_regen_enhanced_percent ?? 3);
      (document.getElementById('setting-mana-base') as HTMLInputElement).value =
        String(settings.mana_regen_base_percent ?? 2);
      (document.getElementById('setting-mana-enhanced') as HTMLInputElement).value =
        String(settings.mana_regen_enhanced_percent ?? 5);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveMaxCharactersSetting(): Promise<void> {
  const value = parseInt((document.getElementById('setting-max-chars') as HTMLInputElement).value);
  const messageEl = document.getElementById('settings-message')!;

  if (isNaN(value) || value < 1 || value > 100) {
    messageEl.textContent = 'Please enter a value between 1 and 100';
    messageEl.className = 'message error';
    return;
  }

  try {
    const response = await fetch('/api/admin/settings/max_characters_per_player', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Setting saved successfully';
      messageEl.className = 'message success';
    } else {
      messageEl.textContent = data.message || 'Failed to save';
      messageEl.className = 'message error';
    }
  } catch (error) {
    console.error('Failed to save setting:', error);
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

async function saveIpModeSetting(): Promise<void> {
  const value = (document.getElementById('setting-ip-mode') as HTMLSelectElement).value;
  const messageEl = document.getElementById('settings-message')!;

  try {
    const response = await fetch('/api/admin/settings/ip_access_mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Setting saved successfully';
      messageEl.className = 'message success';
    } else {
      messageEl.textContent = data.message || 'Failed to save';
      messageEl.className = 'message error';
    }
  } catch (error) {
    console.error('Failed to save setting:', error);
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

async function saveMaxNegativeHpSetting(): Promise<void> {
  const value = parseInt((document.getElementById('setting-max-negative-hp') as HTMLInputElement).value);
  const messageEl = document.getElementById('settings-message')!;

  if (isNaN(value) || value < 10 || value > 100) {
    messageEl.textContent = 'Please enter a value between 10 and 100';
    messageEl.className = 'message error';
    return;
  }

  try {
    const response = await fetch('/api/admin/settings/max_negative_hp_percent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Setting saved successfully';
      messageEl.className = 'message success';
    } else {
      messageEl.textContent = data.message || 'Failed to save';
      messageEl.className = 'message error';
    }
  } catch (error) {
    console.error('Failed to save setting:', error);
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

async function saveDroppedTickSetting(): Promise<void> {
  const value = parseInt((document.getElementById('setting-dropped-tick') as HTMLInputElement).value);
  const messageEl = document.getElementById('settings-message')!;

  if (isNaN(value) || value < 1000 || value > 30000) {
    messageEl.textContent = 'Please enter a value between 1000 and 30000 ms';
    messageEl.className = 'message error';
    return;
  }

  try {
    const response = await fetch('/api/admin/settings/dropped_tick_interval_ms', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Setting saved successfully';
      messageEl.className = 'message success';
    } else {
      messageEl.textContent = data.message || 'Failed to save';
      messageEl.className = 'message error';
    }
  } catch (error) {
    console.error('Failed to save setting:', error);
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

async function saveNumericSetting(settingKey: string, inputId: string, min: number, max: number, displayName: string): Promise<void> {
  const value = parseFloat((document.getElementById(inputId) as HTMLInputElement).value);
  const messageEl = document.getElementById('settings-message')!;

  if (isNaN(value) || value < min || value > max) {
    messageEl.textContent = `${displayName} must be between ${min} and ${max}`;
    messageEl.className = 'message error';
    return;
  }

  try {
    const response = await fetch(`/api/admin/settings/${settingKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Setting saved successfully';
      messageEl.className = 'message success';
    } else {
      messageEl.textContent = data.message || 'Failed to save';
      messageEl.className = 'message error';
    }
  } catch (error) {
    console.error('Failed to save setting:', error);
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
  renderNav({ activePage: 'admin', activeGroup: 'admin' });
  const auth = await initAuth('admin');
  if (!auth) return;

  const accessDenied = document.getElementById('access-denied');
  const adminPanel = document.getElementById('admin-panel');

  if (accessDenied) accessDenied.style.display = 'none';
  if (adminPanel) adminPanel.style.display = 'block';

  // Setup tabs
  setupTabs();

  // Load initial data
  await loadPendingUsers();
  await loadAllPlayers();

  // IP Access buttons
  const addIpEntryBtn = document.getElementById('add-ip-entry-btn');
  if (addIpEntryBtn) {
    addIpEntryBtn.addEventListener('click', addIpEntry);
  }

  // Settings buttons
  const saveMaxCharsBtn = document.getElementById('save-max-chars-btn');
  if (saveMaxCharsBtn) {
    saveMaxCharsBtn.addEventListener('click', saveMaxCharactersSetting);
  }

  const saveIpModeBtn = document.getElementById('save-ip-mode-btn');
  if (saveIpModeBtn) {
    saveIpModeBtn.addEventListener('click', saveIpModeSetting);
  }

  const saveMaxNegativeHpBtn = document.getElementById('save-max-negative-hp-btn');
  if (saveMaxNegativeHpBtn) {
    saveMaxNegativeHpBtn.addEventListener('click', saveMaxNegativeHpSetting);
  }

  const saveDroppedTickBtn = document.getElementById('save-dropped-tick-btn');
  if (saveDroppedTickBtn) {
    saveDroppedTickBtn.addEventListener('click', saveDroppedTickSetting);
  }

  // Backstab settings buttons
  const saveBsMinMultBtn = document.getElementById('save-bs-min-mult-btn');
  if (saveBsMinMultBtn) {
    saveBsMinMultBtn.addEventListener('click', () =>
      saveNumericSetting('backstab_base_min_multiplier', 'setting-bs-min-mult', 1.0, 5.0, 'Base Min Multiplier'));
  }

  const saveBsMaxMultBtn = document.getElementById('save-bs-max-mult-btn');
  if (saveBsMaxMultBtn) {
    saveBsMaxMultBtn.addEventListener('click', () =>
      saveNumericSetting('backstab_base_max_multiplier', 'setting-bs-max-mult', 1.5, 6.0, 'Base Max Multiplier'));
  }

  const saveBsLevelMinBtn = document.getElementById('save-bs-level-min-btn');
  if (saveBsLevelMinBtn) {
    saveBsLevelMinBtn.addEventListener('click', () =>
      saveNumericSetting('backstab_level_bonus_min', 'setting-bs-level-min', 0.0, 1.0, 'Level Bonus Min'));
  }

  const saveBsLevelMaxBtn = document.getElementById('save-bs-level-max-btn');
  if (saveBsLevelMaxBtn) {
    saveBsLevelMaxBtn.addEventListener('click', () =>
      saveNumericSetting('backstab_level_bonus_max', 'setting-bs-level-max', 0.0, 2.0, 'Level Bonus Max'));
  }

  // Vision & Combat settings
  const saveBlindAccuracyBtn = document.getElementById('save-blind-accuracy-btn');
  if (saveBlindAccuracyBtn) {
    saveBlindAccuracyBtn.addEventListener('click', () =>
      saveNumericSetting('blind_accuracy_penalty', 'setting-blind-accuracy', 1, 50, 'Blind Accuracy Penalty'));
  }

  const saveCritSoftCapBtn = document.getElementById('save-crit-soft-cap-btn');
  saveCritSoftCapBtn?.addEventListener('click', () =>
    saveNumericSetting('crit_soft_cap', 'setting-crit-soft-cap', 5, 60, 'Critical Hit Soft Cap'));

  // Progression settings
  const saveXpOvercapBtn = document.getElementById('save-xp-overcap-btn');
  saveXpOvercapBtn?.addEventListener('click', () =>
    saveNumericSetting('xp_overcap_percent', 'setting-xp-overcap', 0, 200, 'XP Overcap Percent'));

  // Regen settings
  const regenButtons: Array<[string, string, string, number, number, string]> = [
    ['save-health-tick-btn', 'health_tick_interval_ms', 'setting-health-tick', 1000, 60000, 'Health Tick Interval'],
    ['save-mana-tick-btn', 'mana_tick_interval_ms', 'setting-mana-tick', 1000, 60000, 'Mana Tick Interval'],
    ['save-health-base-btn', 'health_regen_base_percent', 'setting-health-base', 0, 100, 'Health Regen Base %'],
    ['save-health-enhanced-btn', 'health_regen_enhanced_percent', 'setting-health-enhanced', 0, 100, 'Health Regen Enhanced %'],
    ['save-mana-base-btn', 'mana_regen_base_percent', 'setting-mana-base', 0, 100, 'Mana Regen Base %'],
    ['save-mana-enhanced-btn', 'mana_regen_enhanced_percent', 'setting-mana-enhanced', 0, 100, 'Mana Regen Enhanced %'],
  ];
  for (const [btnId, key, inputId, min, max, name] of regenButtons) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => saveNumericSetting(key, inputId, min, max, name));
    }
  }

});

})();
