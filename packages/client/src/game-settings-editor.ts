(function() {

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

let currentUser: AuthInfo | null = null;
let settings: Record<string, unknown> = {};

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
// Settings Management
// ============================================================================

async function loadSettings(): Promise<void> {
  try {
    const response = await fetch('/api/admin/settings/all', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      settings = data.settings;
      populateSettingsForm();
      showContent();
    } else {
      showError('Failed to load settings: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showError('Failed to connect to server');
  }
}

function populateSettingsForm(): void {
  // General settings
  setInputValue('max_characters_per_player', settings.max_characters_per_player ?? 3);
  setSelectValue('ip_access_mode', (settings.ip_access_mode as string) ?? 'blocklist');
  setInputValue('character_save_interval_ms', settings.character_save_interval_ms ?? 60000);

  // Combat settings
  setInputValue('combat_base_energy', settings.combat_base_energy ?? 20000);
  setInputValue('combat_default_weapon_speed', settings.combat_default_weapon_speed ?? 7500);
  setInputValue('combat_max_attacks_per_round', settings.combat_max_attacks_per_round ?? 6);
  setInputValue('combat_round_interval_ms', settings.combat_round_interval_ms ?? 4000);
  setInputValue('combat_unarmed_speed', settings.combat_unarmed_speed ?? 4500);

  // Key-value settings
  renderKeyValueEditor('combat_level_multipliers',
    (settings.combat_level_multipliers as Record<string, number>) ?? { '1': 0.6, '2': 0.75, '3': 0.9, '4': 1.0, '5': 1.15 });
  renderKeyValueEditor('combat_level_accuracy_bonus',
    (settings.combat_level_accuracy_bonus as Record<string, number>) ?? { '1': 0, '2': 10, '3': 20, '4': 35, '5': 50 });

  // Currency settings
  setInputValue('currency_runic_name', settings.currency_runic_name ?? 'runic');
  setInputValue('currency_copper_per_enc', settings.currency_copper_per_enc ?? 25);
  setInputValue('currency_silver_per_enc', settings.currency_silver_per_enc ?? 25);
  setInputValue('currency_gold_per_enc', settings.currency_gold_per_enc ?? 15);
  setInputValue('currency_platinum_per_enc', settings.currency_platinum_per_enc ?? 10);
  setInputValue('currency_runic_per_enc', settings.currency_runic_per_enc ?? 4);

  // Training settings
  setInputValue('training_base_cost', settings.training_base_cost ?? 28);
  setInputValue('training_cost_multiplier', settings.training_cost_multiplier ?? 1.8);
  setInputValue('initial_character_points', settings.initial_character_points ?? 100);
}

function setInputValue(key: string, value: unknown): void {
  const input = document.getElementById(`setting-${key}`) as HTMLInputElement;
  if (input) {
    input.value = String(value);
  }
}

function setSelectValue(key: string, value: string): void {
  const select = document.getElementById(`setting-${key}`) as HTMLSelectElement;
  if (select) {
    select.value = value;
  }
}

// ============================================================================
// Key-Value Editor
// ============================================================================

function renderKeyValueEditor(key: string, data: Record<string, number>): void {
  const container = document.getElementById(`rows-${key}`);
  if (!container) return;

  container.innerHTML = '';

  // Sort entries by key (level number)
  const entries = Object.entries(data).sort((a, b) => Number(a[0]) - Number(b[0]));

  for (const [level, value] of entries) {
    addKeyValueRow(container, key, level, value);
  }
}

function addKeyValueRow(container: HTMLElement, settingKey: string, level: string = '', value: number | string = ''): void {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const levelInput = document.createElement('input');
  levelInput.type = 'number';
  levelInput.min = '1';
  levelInput.placeholder = 'Level';
  levelInput.value = level;
  levelInput.dataset.type = 'key';

  const valueInput = document.createElement('input');
  valueInput.type = 'number';
  valueInput.step = settingKey === 'combat_level_multipliers' ? '0.01' : '1';
  valueInput.placeholder = 'Value';
  valueInput.value = String(value);
  valueInput.dataset.type = 'value';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'kv-remove';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(levelInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function getKeyValueData(key: string): Record<string, number> | null {
  const container = document.getElementById(`rows-${key}`);
  if (!container) return null;

  const data: Record<string, number> = {};
  const rows = container.querySelectorAll('.kv-row');

  for (const row of rows) {
    const keyInput = row.querySelector('input[data-type="key"]') as HTMLInputElement;
    const valueInput = row.querySelector('input[data-type="value"]') as HTMLInputElement;

    if (keyInput && valueInput) {
      const levelKey = keyInput.value.trim();
      const levelValue = parseFloat(valueInput.value);

      if (levelKey && !isNaN(levelValue)) {
        data[levelKey] = levelValue;
      }
    }
  }

  return data;
}

function setupAddRowButtons(): void {
  document.querySelectorAll('[data-add-row]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = (btn as HTMLElement).dataset.addRow;
      if (!key) return;

      const container = document.getElementById(`rows-${key}`);
      if (container) {
        addKeyValueRow(container, key);
      }
    });
  });
}

// ============================================================================
// Save Settings
// ============================================================================

async function saveSetting(key: string): Promise<void> {
  let value: unknown;

  // Check if this is a key-value editor setting
  if (key === 'combat_level_multipliers' || key === 'combat_level_accuracy_bonus') {
    value = getKeyValueData(key);
    if (!value || Object.keys(value).length === 0) {
      showSettingMessage(key, 'At least one level is required', 'error');
      return;
    }
  } else if (key === 'ip_access_mode') {
    const select = document.getElementById(`setting-${key}`) as HTMLSelectElement;
    if (!select) return;
    value = select.value;
  } else if (key === 'currency_runic_name') {
    // String field
    const input = document.getElementById(`setting-${key}`) as HTMLInputElement;
    if (!input) return;
    value = input.value.trim();
    if (!value) {
      showSettingMessage(key, 'Name cannot be empty', 'error');
      return;
    }
  } else {
    // Numeric fields
    const input = document.getElementById(`setting-${key}`) as HTMLInputElement;
    if (!input) return;
    value = Number(input.value);
    if (isNaN(value as number)) {
      showSettingMessage(key, 'Invalid number', 'error');
      return;
    }
  }

  try {
    const response = await fetch(`/api/admin/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      credentials: 'include',
    });

    const data = await response.json();
    if (data.success) {
      settings[key] = value;
      showSettingMessage(key, 'Saved!', 'success');
    } else {
      showSettingMessage(key, data.message || 'Failed to save', 'error');
    }
  } catch (error) {
    console.error('Failed to save setting:', error);
    showSettingMessage(key, 'Failed to save', 'error');
  }
}

function showSettingMessage(key: string, message: string, type: 'success' | 'error'): void {
  const msgEl = document.getElementById(`msg-${key}`);
  if (msgEl) {
    msgEl.textContent = message;
    msgEl.className = `setting-message ${type}`;
    msgEl.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
      msgEl.style.display = 'none';
    }, 3000);
  }
}

// ============================================================================
// UI Helpers
// ============================================================================

function showContent(): void {
  const loadingState = document.getElementById('loading-state');
  const settingsContent = document.getElementById('settings-content');
  if (loadingState) loadingState.style.display = 'none';
  if (settingsContent) settingsContent.style.display = 'block';
}

function showError(message: string): void {
  const loadingState = document.getElementById('loading-state');
  if (loadingState) {
    loadingState.innerHTML = `<span style="color: #ff4444;">${escapeHtml(message)}</span>`;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Tab Handling
// ============================================================================

function setupTabs(): void {
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;
      if (!tabName) return;

      // Update tab buttons
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update sections
      document.querySelectorAll('.settings-section').forEach(section => {
        section.classList.remove('active');
      });
      const targetSection = document.getElementById(`tab-${tabName}`);
      if (targetSection) targetSection.classList.add('active');
    });
  });
}

function setupSaveButtons(): void {
  document.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = (btn as HTMLElement).dataset.save;
      if (key) saveSetting(key);
    });
  });
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  setupTabs();
  setupSaveButtons();
  setupAddRowButtons();
  await loadSettings();

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
