import { Terminal } from '@xterm/xterm';
import { MessageType, GameMessage, VitalsData, ResourceType, Character, TrainingFormPayload, TrainingSubmitPayload } from '@koa/shared';
import { TrainingForm, TrainingFormResult } from './forms/TrainingForm.js';
import '@xterm/xterm/css/xterm.css';

let terminal: Terminal | null = null;
let socket: WebSocket | null = null;
let currentVitals: VitalsData | null = null;
let statlineDisplayed = false;
let currentUsername: string = '';
let selectedCharacterId: number | null = null;
let isInGame: boolean = false;
let canBypassExitTimer: boolean = false;
let activeTrainingForm: TrainingForm | null = null;

// Types for API responses
interface ClassDefinition {
  class_id: string;
  display_name: string;
  description: string | null;
  combat_level?: number;
  magic_level?: number;
  magic_school?: string;
  stealth?: boolean;
  playable: boolean;
}

interface RaceDefinition {
  race_id: string;
  display_name: string;
  description: string | null;
  base_stats?: Record<string, { min: number; max: number }>;
  stat_modifiers?: Record<string, number> | null;
  allowed_classes: string[] | null;
  playable: boolean;
}

// Cache for race and class data
let cachedRaces: RaceDefinition[] = [];
let cachedClasses: ClassDefinition[] = [];

// Fixed terminal dimensions (classic MUD style)
const TERMINAL_COLS = 80;
const TERMINAL_ROWS = 25;

// Filter input to printable ASCII characters only (security)
function sanitizeInput(input: string): string {
  // Allow printable ASCII characters (space through tilde: 0x20-0x7E)
  return input.replace(/[^\x20-\x7E]/g, '');
}

// Calculate font size to fill ~95% of viewport height
function calculateFontSize(): number {
  const navHeight = 45; // Approximate nav bar height
  const commandBarHeight = 50; // Approximate command bar height
  const padding = 20; // Terminal padding
  const availableHeight = window.innerHeight * 0.95 - navHeight - commandBarHeight - padding;
  // Each row is approximately 1.2x the font size in height
  const fontSize = Math.floor(availableHeight / (TERMINAL_ROWS * 1.2));
  return Math.max(12, Math.min(fontSize, 32)); // Clamp between 12 and 32
}

function initTerminal(): void {
  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) return;

  terminal = new Terminal({
    cols: TERMINAL_COLS,
    rows: TERMINAL_ROWS,
    cursorBlink: false,
    fontSize: calculateFontSize(),
    fontFamily: 'Courier New, monospace',
    theme: {
      background: '#0a0a0a',
      foreground: '#00ff00',
      cursor: '#0a0a0a',
      cursorAccent: '#0a0a0a',
      magenta: '#aa00aa',
      brightMagenta: '#ff55ff',
    },
    disableStdin: true,
  });

  terminal.open(terminalContainer);

  // Keep focus on command input
  setupAutoFocus();
}

// Store references to event handlers so we can remove them
let terminalClickHandler: (() => void) | null = null;
let windowFocusHandler: (() => void) | null = null;

function setupAutoFocus(): void {
  const commandInput = document.getElementById('command-input') as HTMLInputElement;
  if (!commandInput) return;

  // Remove previous listeners if they exist
  const terminalContainer = document.getElementById('terminal-container');
  if (terminalClickHandler && terminalContainer) {
    terminalContainer.removeEventListener('click', terminalClickHandler);
  }
  if (windowFocusHandler) {
    window.removeEventListener('focus', windowFocusHandler);
  }

  // Initial focus
  commandInput.focus();

  // Create new handlers
  terminalClickHandler = () => commandInput.focus();
  windowFocusHandler = () => commandInput.focus();

  // Re-focus when clicking anywhere in the terminal container
  if (terminalContainer) {
    terminalContainer.addEventListener('click', terminalClickHandler);
  }

  // Re-focus when window gains focus
  window.addEventListener('focus', windowFocusHandler);
}

function handleCommandInput(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;

  const input = event.target as HTMLInputElement;
  const command = sanitizeInput(input.value.trim());

  // Scroll to bottom when user presses enter (in case they scrolled up)
  if (terminal) {
    terminal.scrollToBottom();
  }

  if (command) {
    if (terminal) {
      clearStatline();
      terminal.write(`\x1b[1;37m${command}\x1b[0m\r\n`);
    }
    sendCommand(command);
  } else {
    // Empty enter re-renders the room (respects brief mode)
    sendCommand('glance');
  }

  input.value = '';
}

function sendCommand(command: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const message: GameMessage = {
    type: MessageType.COMMAND,
    payload: command,
    timestamp: Date.now(),
  };

  socket.send(JSON.stringify(message));
}

function handleServerMessage(message: GameMessage): void {
  if (!terminal) return;

  switch (message.type) {
    case MessageType.OUTPUT:
      clearStatline();
      terminal.write(message.payload);
      terminal.write('\r\n');
      renderStatline();
      break;
    case MessageType.ERROR:
      clearStatline();
      terminal.write(`\x1b[31m${message.payload}\x1b[0m`);
      terminal.write('\r\n');
      renderStatline();
      break;
    case MessageType.SYSTEM:
      clearStatline();
      terminal.write(`\x1b[33m${message.payload}\x1b[0m`);
      terminal.write('\r\n');
      renderStatline();
      break;
    case MessageType.VITALS:
      try {
        currentVitals = JSON.parse(message.payload) as VitalsData;
        clearStatline();
        renderStatline();
      } catch {
        console.error('Failed to parse vitals');
      }
      break;
    case MessageType.LOGOUT:
      // Server requested game exit (via 'x' command) - return to landing page
      handleGameExit();
      break;

    case MessageType.TRAINING_FORM:
      try {
        const trainingData = JSON.parse(message.payload) as TrainingFormPayload;
        handleTrainingForm(trainingData);
      } catch {
        console.error('Failed to parse training form data');
      }
      break;
  }
}

// Get ANSI color code based on percentage of max
function getStatColor(current: number, max: number): string {
  const percent = (current / max) * 100;
  if (percent <= 25) {
    return '\x1b[1;31m'; // Bold red for <= 25%
  } else if (percent <= 50) {
    return '\x1b[1;33m'; // Bold yellow for <= 50%
  } else {
    return '\x1b[1;37m'; // Bold white for > 50%
  }
}

// Clear the statline from the terminal
function clearStatline(): void {
  if (!terminal || !statlineDisplayed) return;
  // Don't manipulate terminal while training form is active
  if (activeTrainingForm) return;
  // Move to beginning of line and clear it
  terminal.write('\r\x1b[K');
  statlineDisplayed = false;
}

// Render the statline at the current cursor position
function renderStatline(): void {
  if (!terminal || !currentVitals) return;
  // Don't render statline while training form is active
  if (activeTrainingForm) return;

  const hpColor = getStatColor(currentVitals.hp, currentVitals.maxHp);
  const reset = '\x1b[0m';

  let statline = `[HP=${hpColor}${currentVitals.hp}${reset}`;

  // Add secondary resource if applicable
  if (currentVitals.resourceType !== ResourceType.NONE &&
      currentVitals.resource !== undefined &&
      currentVitals.maxResource !== undefined) {
    const resourceColor = getStatColor(currentVitals.resource, currentVitals.maxResource);
    statline += `/${currentVitals.resourceType}=${resourceColor}${currentVitals.resource}${reset}`;
  }

  statline += ']: ';

  // Add status indicator if resting or meditating
  if (currentVitals.status === 'resting') {
    statline += '(resting) ';
  } else if (currentVitals.status === 'meditating') {
    statline += '(meditating) ';
  }

  terminal.write(statline);
  statlineDisplayed = true;
}

async function handleLogin(event: Event): Promise<void> {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const username = (form.querySelector('#username') as HTMLInputElement).value;
  const password = (form.querySelector('#password') as HTMLInputElement).value;
  const errorEl = document.getElementById('login-error');

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      currentUsername = username;
      showLandingPage();
    } else {
      if (errorEl) errorEl.textContent = data.message || 'Login failed';
    }
  } catch {
    if (errorEl) errorEl.textContent = 'Connection error';
  }
}

// Handle exiting the game (via 'x' command) - returns to landing page, stays logged in
function handleGameExit(): void {
  if (socket) {
    socket.close();
    socket = null;
  }

  if (terminal) {
    terminal.dispose();
    terminal = null;
  }

  // Reset game state but NOT login state
  selectedCharacterId = null;
  sessionStorage.removeItem('activeCharacterId');

  // Clear in-game state
  isInGame = false;
  removeExitProtection();

  // Return to hub (not login)
  showHub();
}

async function handleLogout(): Promise<void> {
  // Block regular players from logging out while in-game
  if (isInGame && !canBypassExitTimer) {
    if (terminal) {
      terminal.write('\r\n\x1b[33mYou must use the "x" command to exit the game.\x1b[0m\r\n');
    }
    return;
  }

  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Ignore errors
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  if (terminal) {
    terminal.dispose();
    terminal = null;
  }

  // Reset state
  currentUsername = '';
  selectedCharacterId = null;
  sessionStorage.removeItem('activeCharacterId');
  cachedRaces = [];
  cachedClasses = [];

  // Clear in-game state
  isInGame = false;
  removeExitProtection();

  // Hide all containers
  document.getElementById('app')!.classList.remove('game-view');
  document.getElementById('app')!.classList.add('login-view');
  hideAllContainers();
  document.getElementById('login-container')!.style.display = 'block';
  (document.getElementById('username') as HTMLInputElement).value = '';
  (document.getElementById('password') as HTMLInputElement).value = '';
}

async function handleRegister(event: Event): Promise<void> {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const username = (form.querySelector('#reg-username') as HTMLInputElement).value;
  const password = (form.querySelector('#reg-password') as HTMLInputElement).value;
  const email = (form.querySelector('#reg-email') as HTMLInputElement).value;
  const errorEl = document.getElementById('register-error');
  const successEl = document.getElementById('register-success');

  if (errorEl) errorEl.textContent = '';
  if (successEl) successEl.textContent = '';

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email: email || undefined }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      form.reset();
      // Redirect to login screen with success message
      showLoginForm();
      const loginError = document.getElementById('login-error');
      if (loginError) {
        loginError.style.color = '#00ff00';
        loginError.textContent = 'Account created! Please wait for admin approval before logging in.';
      }
    } else {
      if (errorEl) errorEl.textContent = data.message || 'Registration failed';
    }
  } catch {
    if (errorEl) errorEl.textContent = 'Connection error';
  }
}

function showRegisterForm(): void {
  document.getElementById('login-container')!.style.display = 'none';
  document.getElementById('register-container')!.style.display = 'block';
}

function showLoginForm(): void {
  document.getElementById('register-container')!.style.display = 'none';
  document.getElementById('login-container')!.style.display = 'block';
}

async function updateNavigation(): Promise<void> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await response.json();
    
    if (data.authenticated) {
      const usernameEl = document.getElementById('nav-username');
      if (usernameEl) {
        usernameEl.textContent = data.username;
      }
      
      const roles: string[] = data.roles || [];
      const isAdmin = roles.includes('admin');
      const isDeveloper = roles.includes('developer') || isAdmin;

      // Track if user can bypass the 10-second exit timer
      canBypassExitTimer = isDeveloper || isAdmin;

      // Show/hide Developer nav dropdown based on roles
      const devDropdown = document.getElementById('nav-dev-dropdown');
      if (devDropdown) {
        devDropdown.style.display = isDeveloper ? 'flex' : 'none';
      }

      // Show/hide Admin nav dropdown based on roles
      const adminDropdown = document.getElementById('nav-admin-dropdown');
      if (adminDropdown) {
        adminDropdown.style.display = isAdmin ? 'flex' : 'none';
      }
    }
  } catch (error) {
    console.error('Failed to fetch user info:', error);
  }
}

async function checkExistingAuth(): Promise<void> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await response.json();

    if (data.authenticated) {
      currentUsername = data.username;

      // Check if we were in-game before refresh
      const storedCharacterId = sessionStorage.getItem('activeCharacterId');
      if (storedCharacterId) {
        const characterId = parseInt(storedCharacterId);
        // Verify this character still belongs to the user
        try {
          const charResponse = await fetch('/api/characters', { credentials: 'include' });
          const charData = await charResponse.json();
          if (charData.success && charData.characters.some((c: { id: number }) => c.id === characterId)) {
            selectedCharacterId = characterId;
            enterGame();
            return;
          }
        } catch {
          // If verification fails, fall through to hub
        }
        // Clear invalid stored character
        sessionStorage.removeItem('activeCharacterId');
      }

      showLandingPage();
    }
  } catch (error) {
    console.error('Failed to check auth:', error);
  }
}

// ============================================================================
// LANDING PAGE & CHARACTER FLOW
// ============================================================================

function hideAllContainers(): void {
  document.getElementById('login-container')!.style.display = 'none';
  document.getElementById('register-container')!.style.display = 'none';
  document.getElementById('hub-container')!.style.display = 'none';
  document.getElementById('profile-container')!.style.display = 'none';
  document.getElementById('dev-tools-container')!.style.display = 'none';
  document.getElementById('enter-game-container')!.style.display = 'none';
  document.getElementById('character-create-container')!.style.display = 'none';
  document.getElementById('terminal-container')!.classList.remove('active');
}

async function showHub(): Promise<void> {
  hideAllContainers();
  document.getElementById('app')!.classList.remove('login-view');
  document.getElementById('app')!.classList.add('game-view');

  // Update hub content username
  const hubUsername = document.getElementById('hub-username');
  if (hubUsername) {
    hubUsername.textContent = currentUsername;
  }

  // Update hub nav username
  const hubNavUsername = document.getElementById('hub-nav-username');
  if (hubNavUsername) {
    hubNavUsername.textContent = currentUsername;
  }

  // Update hub nav based on roles
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await response.json();

    if (data.authenticated) {
      const roles: string[] = data.roles || [];
      const isAdmin = roles.includes('admin');
      const isDeveloper = roles.includes('developer') || isAdmin;

      // Track if user can bypass the 10-second exit timer
      canBypassExitTimer = isDeveloper || isAdmin;

      // Show/hide hub nav items based on roles
      const devDropdown = document.getElementById('hub-dev-dropdown');
      const adminLink = document.getElementById('hub-admin-link');

      if (devDropdown) {
        devDropdown.style.display = isDeveloper ? 'block' : 'none';
      }
      if (adminLink) {
        adminLink.style.display = isAdmin ? 'block' : 'none';
      }
    }
  } catch (error) {
    console.error('Failed to fetch user info:', error);
  }

  document.getElementById('hub-container')!.style.display = 'flex';
}

// Backwards compatibility alias
function showLandingPage(): void {
  showHub();
}

async function showEnterGame(): Promise<void> {
  hideAllContainers();

  const characterList = document.getElementById('character-list')!;
  characterList.innerHTML = '<p class="loading">Loading characters...</p>';
  document.getElementById('enter-game-container')!.style.display = 'block';

  try {
    // Fetch both characters and profile (for character limit)
    const [charResponse, profileResponse] = await Promise.all([
      fetch('/api/characters', { credentials: 'include' }),
      fetch('/api/profile', { credentials: 'include' }),
    ]);
    const data = await charResponse.json();
    const profileData = await profileResponse.json();

    if (!data.success) {
      characterList.innerHTML = '<p class="error">Failed to load characters</p>';
      return;
    }

    const characters: Character[] = data.characters;

    // Update character limit info
    const limitInfo = document.getElementById('character-limit-info')!;
    const createBtn = document.getElementById('create-character-btn') as HTMLButtonElement;
    if (profileData.success) {
      const { characterCount, maxCharacters } = profileData.profile;
      limitInfo.textContent = `Characters: ${characterCount}/${maxCharacters}`;

      // Hide create button if at limit
      if (createBtn) {
        if (characterCount >= maxCharacters) {
          createBtn.style.display = 'none';
        } else {
          createBtn.style.display = 'block';
        }
      }
    }

    if (characters.length === 0) {
      characterList.innerHTML = '<p class="no-characters">No characters yet. Create one to begin!</p>';
    } else {
      characterList.innerHTML = characters.map(char => {
        const fullName = char.lastName ? `${char.name} ${char.lastName}` : char.name;
        return `
        <div class="character-card" data-id="${char.id}">
          <div class="character-card-content">
            <div class="character-name">${escapeHtml(fullName)}</div>
            <div class="character-info">Level ${char.level} ${escapeHtml(char.race)} ${escapeHtml(char.class)}</div>
          </div>
          <button class="character-delete-btn" data-id="${char.id}" data-name="${escapeHtmlAttr(fullName)}" title="Delete character">X</button>
        </div>
      `;
      }).join('');

      // Add click handlers for selecting characters
      characterList.querySelectorAll('.character-card-content').forEach(content => {
        content.addEventListener('click', () => {
          const card = content.closest('.character-card');
          const charId = parseInt(card?.getAttribute('data-id') || '0');
          if (charId) {
            selectCharacter(charId);
          }
        });
      });

      // Add click handlers for delete buttons
      characterList.querySelectorAll('.character-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // Prevent card selection
          const charId = parseInt(btn.getAttribute('data-id') || '0');
          const charName = btn.getAttribute('data-name') || 'this character';
          if (charId && confirm(`Are you sure you want to delete ${charName}? This cannot be undone.`)) {
            await deleteCharacter(charId);
          }
        });
      });
    }
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    characterList.innerHTML = '<p class="error">Connection error</p>';
  }
}

// Backwards compatibility alias
async function showCharacterSelect(): Promise<void> {
  await showEnterGame();
}

async function showCharacterCreate(): Promise<void> {
  hideAllContainers();
  document.getElementById('character-create-container')!.style.display = 'block';

  // Clear form
  (document.getElementById('char-name') as HTMLInputElement).value = '';
  (document.getElementById('char-last-name') as HTMLInputElement).value = '';
  (document.getElementById('char-race') as HTMLSelectElement).value = '';
  (document.getElementById('char-class') as HTMLSelectElement).value = '';
  (document.getElementById('char-gender') as HTMLSelectElement).value = 'male';
  (document.getElementById('char-hair') as HTMLSelectElement).value = '';
  (document.getElementById('char-eye-color') as HTMLSelectElement).value = 'brown';
  document.getElementById('create-error')!.textContent = '';
  document.getElementById('race-description')!.textContent = '';
  document.getElementById('class-description')!.textContent = '';
  clearStatPreview();

  // Load races and classes if not cached
  await loadRacesAndClasses();

  // Populate dropdowns
  const raceSelect = document.getElementById('char-race') as HTMLSelectElement;
  const classSelect = document.getElementById('char-class') as HTMLSelectElement;

  raceSelect.innerHTML = '<option value="">Select a race...</option>' +
    cachedRaces.map(r => `<option value="${r.race_id}">${escapeHtml(r.display_name)}</option>`).join('');

  classSelect.innerHTML = '<option value="">Select a class...</option>' +
    cachedClasses.map(c => `<option value="${c.class_id}">${escapeHtml(c.display_name)}</option>`).join('');
}

async function showProfile(): Promise<void> {
  hideAllContainers();
  document.getElementById('profile-container')!.style.display = 'block';

  // Clear messages
  document.getElementById('email-message')!.textContent = '';
  document.getElementById('email-message')!.className = 'message';
  document.getElementById('password-message')!.textContent = '';
  document.getElementById('password-message')!.className = 'message';

  // Clear password form
  (document.getElementById('current-password') as HTMLInputElement).value = '';
  (document.getElementById('new-password') as HTMLInputElement).value = '';
  (document.getElementById('confirm-password') as HTMLInputElement).value = '';

  try {
    const response = await fetch('/api/profile', { credentials: 'include' });
    const data = await response.json();

    if (data.success) {
      document.getElementById('profile-username')!.textContent = data.profile.username;
      (document.getElementById('profile-email') as HTMLInputElement).value = data.profile.email || '';
      document.getElementById('profile-char-slots')!.textContent =
        `${data.profile.characterCount}/${data.profile.maxCharacters}`;
    }
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

async function handleSaveEmail(): Promise<void> {
  const email = (document.getElementById('profile-email') as HTMLInputElement).value.trim();
  const messageEl = document.getElementById('email-message')!;

  try {
    const response = await fetch('/api/profile/email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email || null }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Email updated successfully';
      messageEl.className = 'message success';
    } else {
      messageEl.textContent = data.message || 'Failed to update email';
      messageEl.className = 'message error';
    }
  } catch {
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

async function handleChangePassword(event: Event): Promise<void> {
  event.preventDefault();

  const currentPassword = (document.getElementById('current-password') as HTMLInputElement).value;
  const newPassword = (document.getElementById('new-password') as HTMLInputElement).value;
  const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement).value;
  const messageEl = document.getElementById('password-message')!;

  if (newPassword !== confirmPassword) {
    messageEl.textContent = 'New passwords do not match';
    messageEl.className = 'message error';
    return;
  }

  try {
    const response = await fetch('/api/profile/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Password updated successfully';
      messageEl.className = 'message success';
      // Clear the form
      (document.getElementById('current-password') as HTMLInputElement).value = '';
      (document.getElementById('new-password') as HTMLInputElement).value = '';
      (document.getElementById('confirm-password') as HTMLInputElement).value = '';
    } else {
      messageEl.textContent = data.message || 'Failed to update password';
      messageEl.className = 'message error';
    }
  } catch {
    messageEl.textContent = 'Connection error';
    messageEl.className = 'message error';
  }
}

function showDevTools(): void {
  hideAllContainers();
  document.getElementById('dev-tools-container')!.style.display = 'block';
}

async function loadRacesAndClasses(): Promise<void> {
  if (cachedRaces.length > 0 && cachedClasses.length > 0) {
    return; // Already loaded
  }

  try {
    const [racesRes, classesRes] = await Promise.all([
      fetch('/api/progression/races/playable', { credentials: 'include' }),
      fetch('/api/progression/classes/playable', { credentials: 'include' }),
    ]);

    const racesData = await racesRes.json();
    const classesData = await classesRes.json();

    if (racesData.success) {
      cachedRaces = racesData.races;
    }
    if (classesData.success) {
      cachedClasses = classesData.classes;
    }
  } catch (error) {
    console.error('Failed to load races/classes:', error);
  }
}

function updateRaceDescription(): void {
  const raceSelect = document.getElementById('char-race') as HTMLSelectElement;
  const descEl = document.getElementById('race-description')!;
  const raceId = raceSelect.value;

  const race = cachedRaces.find(r => r.race_id === raceId);
  if (race && race.description) {
    descEl.textContent = race.description;
  } else {
    descEl.textContent = '';
  }

  updateStatPreview();
}

function updateClassDescription(): void {
  const classSelect = document.getElementById('char-class') as HTMLSelectElement;
  const descEl = document.getElementById('class-description')!;
  const classId = classSelect.value;

  const classDef = cachedClasses.find(c => c.class_id === classId);
  if (classDef && classDef.description) {
    descEl.textContent = classDef.description;
  } else {
    descEl.textContent = '';
  }

  updateStatPreview();
}

function clearStatPreview(): void {
  document.getElementById('preview-str')!.textContent = '-';
  document.getElementById('preview-int')!.textContent = '-';
  document.getElementById('preview-dex')!.textContent = '-';
  document.getElementById('preview-con')!.textContent = '-';
  document.getElementById('preview-wis')!.textContent = '-';
  document.getElementById('preview-cha')!.textContent = '-';
}

function updateStatPreview(): void {
  const raceSelect = document.getElementById('char-race') as HTMLSelectElement;
  const classSelect = document.getElementById('char-class') as HTMLSelectElement;

  const raceId = raceSelect.value;
  const classId = classSelect.value;

  if (!raceId || !classId) {
    clearStatPreview();
    return;
  }

  const race = cachedRaces.find(r => r.race_id === raceId);
  const classDef = cachedClasses.find(c => c.class_id === classId);

  if (!race || !classDef) {
    clearStatPreview();
    return;
  }

  // Stats come from race base_stats (min values are starting stats)
  const raceStats = race.base_stats;

  const stats = {
    strength: raceStats?.strength?.min ?? 40,
    intelligence: raceStats?.intellect?.min ?? 40,
    dexterity: raceStats?.agility?.min ?? 40,
    constitution: raceStats?.constitution?.min ?? 40,
    wisdom: raceStats?.wisdom?.min ?? 40,
    charisma: raceStats?.charisma?.min ?? 40,
  };

  document.getElementById('preview-str')!.textContent = String(stats.strength);
  document.getElementById('preview-int')!.textContent = String(stats.intelligence);
  document.getElementById('preview-dex')!.textContent = String(stats.dexterity);
  document.getElementById('preview-con')!.textContent = String(stats.constitution);
  document.getElementById('preview-wis')!.textContent = String(stats.wisdom);
  document.getElementById('preview-cha')!.textContent = String(stats.charisma);
}

async function deleteCharacter(characterId: number): Promise<void> {
  try {
    const response = await fetch(`/api/characters/${characterId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      // Refresh the character list
      showCharacterSelect();
    } else {
      alert(data.message || 'Failed to delete character');
    }
  } catch {
    alert('Connection error');
  }
}

async function handleCharacterCreate(event: Event): Promise<void> {
  event.preventDefault();

  const name = (document.getElementById('char-name') as HTMLInputElement).value.trim();
  const lastName = (document.getElementById('char-last-name') as HTMLInputElement).value.trim();
  const raceId = (document.getElementById('char-race') as HTMLSelectElement).value;
  const classId = (document.getElementById('char-class') as HTMLSelectElement).value;
  const gender = (document.getElementById('char-gender') as HTMLSelectElement).value;
  const hair = (document.getElementById('char-hair') as HTMLSelectElement).value;
  const eyeColor = (document.getElementById('char-eye-color') as HTMLSelectElement).value;
  const errorEl = document.getElementById('create-error')!;

  errorEl.textContent = '';

  if (!name || !raceId || !classId) {
    errorEl.textContent = 'Please fill in all fields';
    return;
  }

  try {
    const response = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, lastName: lastName || undefined, raceId, classId, gender, hair: hair || undefined, eyeColor }),
      credentials: 'include',
    });

    const data = await response.json();

    if (data.success) {
      // Character created, select it and enter game
      selectCharacter(data.character.id);
    } else {
      errorEl.textContent = data.message || 'Failed to create character';
    }
  } catch {
    errorEl.textContent = 'Connection error';
  }
}

// ============================================================================
// EXIT PROTECTION (Anti-cheat)
// ============================================================================

// Handler for beforeunload - prevents accidental/intentional tab closing
function beforeUnloadHandler(e: BeforeUnloadEvent): void {
  if (isInGame && !canBypassExitTimer) {
    e.preventDefault();
    // Most browsers will show a generic message regardless of returnValue
    return;
  }
}

// Handler for navigation link clicks - prevents instant game exit
function navigationClickHandler(e: Event): void {
  if (!isInGame) return; // Not in game, allow navigation
  if (canBypassExitTimer) return; // Developer/Admin, allow navigation

  // Block navigation for regular players while in-game
  e.preventDefault();
  if (terminal) {
    terminal.write('\r\n\x1b[33mYou must use the "x" command to exit the game.\x1b[0m\r\n');
  }
}

function setupExitProtection(): void {
  // Only set up protection for regular players
  if (!canBypassExitTimer) {
    window.addEventListener('beforeunload', beforeUnloadHandler);
  }

  // Add click handlers to navigation links in the dropdown
  const editorLinks = document.querySelectorAll('#user-dropdown a.dropdown-item');
  editorLinks.forEach((link) => {
    link.addEventListener('click', navigationClickHandler);
  });
}

function removeExitProtection(): void {
  window.removeEventListener('beforeunload', beforeUnloadHandler);

  // Remove click handlers from navigation links
  const editorLinks = document.querySelectorAll('#user-dropdown a.dropdown-item');
  editorLinks.forEach((link) => {
    link.removeEventListener('click', navigationClickHandler);
  });
}

function selectCharacter(characterId: number): void {
  selectedCharacterId = characterId;
  enterGame();
}

function enterGame(): void {
  if (!selectedCharacterId) {
    console.error('No character selected');
    return;
  }

  // Store character ID for session persistence (survives refresh)
  sessionStorage.setItem('activeCharacterId', String(selectedCharacterId));

  hideAllContainers();
  document.getElementById('terminal-container')!.classList.add('active');
  isInGame = true;
  setupExitProtection();
  initTerminal();
  connectWebSocketWithCharacter(selectedCharacterId);
  updateNavigation();
}

function connectWebSocketWithCharacter(characterId: number): void {
  // Close any existing socket before creating a new one
  if (socket) {
    socket.close();
    socket = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/game?characterId=${characterId}`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Connected to game server');
  };

  socket.onmessage = (event) => {
    try {
      const message: GameMessage = JSON.parse(event.data);
      handleServerMessage(message);
    } catch {
      console.error('Failed to parse server message');
    }
  };

  socket.onclose = () => {
    isInGame = false;
    removeExitProtection();
    if (terminal) {
      terminal.write('\r\n\x1b[31m*** Connection lost ***\x1b[0m\r\n');
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Handle training form data from the server
 */
function handleTrainingForm(data: TrainingFormPayload): void {
  if (!terminal) {
    console.error('No terminal available for training form');
    return;
  }

  // Close any existing training form
  if (activeTrainingForm) {
    activeTrainingForm.destroy();
    activeTrainingForm = null;
  }

  // Convert server data format to form data format
  const formData = {
    characterName: data.characterName,
    familyName: data.familyName,
    race: data.race,
    class: data.class,
    level: data.level,
    stats: data.stats as Record<'strength' | 'agility' | 'constitution' | 'intellect' | 'wisdom' | 'charisma', { current: number; min: number; max: number; spent: number }>,
    unspentCp: data.unspentCp,
    appearance: data.appearance,
  };

  // Create and show the training form
  activeTrainingForm = new TrainingForm(terminal, formData, handleTrainingComplete);
  activeTrainingForm.show();
}

/**
 * Handle training form completion
 */
function handleTrainingComplete(result: TrainingFormResult): void {
  activeTrainingForm = null;

  // Send the result to the server
  sendTrainingSubmit(result);

  // Clear the terminal and request a room look to restore normal display
  if (terminal) {
    terminal.clear();
  }

  // Send a command to refresh the room display (terminal was cleared in both cases)
  sendCommand('glance');
}

/**
 * Send training form submission to server
 */
function sendTrainingSubmit(result: TrainingFormResult): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const payload: TrainingSubmitPayload = {
    stats: result.stats,
    cpSpent: result.cpSpent,
    cancelled: result.cancelled,
    // Only include appearance data when saving (not when cancelled)
    ...(result.cancelled ? {} : {
      familyName: result.familyName,
      appearance: result.appearance,
    }),
  };

  const message: GameMessage = {
    type: MessageType.TRAINING_SUBMIT,
    payload: JSON.stringify(payload),
    timestamp: Date.now(),
  };

  socket.send(JSON.stringify(message));
}

/**
 * Escape text for use in HTML attributes (also escapes quotes)
 */
function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already authenticated
  checkExistingAuth();

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }

  const showRegisterLink = document.getElementById('show-register');
  if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterForm();
    });
  }

  const showLoginLink = document.getElementById('show-login');
  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }

  const commandInput = document.getElementById('command-input');
  if (commandInput) {
    commandInput.addEventListener('keydown', handleCommandInput);
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Hub link in terminal nav (exits game and goes back to hub)
  const navHubLink = document.getElementById('nav-hub-link');
  if (navHubLink) {
    navHubLink.addEventListener('click', (e) => {
      e.preventDefault();
      // If in game, properly exit first
      if (isInGame) {
        handleGameExit();
      } else {
        showHub();
      }
    });
  }

  // Hub page buttons
  const hubEnterGameBtn = document.getElementById('hub-enter-game-btn');
  if (hubEnterGameBtn) {
    hubEnterGameBtn.addEventListener('click', showEnterGame);
  }

  // Hub nav profile button
  const hubProfileBtn = document.getElementById('hub-profile-btn');
  if (hubProfileBtn) {
    hubProfileBtn.addEventListener('click', showProfile);
  }

  // Hub nav logout button
  const hubLogoutBtn = document.getElementById('hub-logout-btn');
  if (hubLogoutBtn) {
    hubLogoutBtn.addEventListener('click', handleLogout);
  }

  // Hub nav user dropdown toggle
  const hubUserMenuBtn = document.getElementById('hub-nav-username');
  const hubUserMenu = hubUserMenuBtn?.closest('.nav-user-menu');
  if (hubUserMenuBtn && hubUserMenu) {
    hubUserMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hubUserMenu.classList.toggle('open');
    });
  }

  // Profile page buttons
  const saveEmailBtn = document.getElementById('save-email-btn');
  if (saveEmailBtn) {
    saveEmailBtn.addEventListener('click', handleSaveEmail);
  }

  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', handleChangePassword);
  }

  const backToHubBtn = document.getElementById('back-to-hub-btn');
  if (backToHubBtn) {
    backToHubBtn.addEventListener('click', () => showHub());
  }

  // Dev tools page buttons
  const devToolsBackBtn = document.getElementById('dev-tools-back-btn');
  if (devToolsBackBtn) {
    devToolsBackBtn.addEventListener('click', () => showHub());
  }

  // Enter game / Character select buttons
  const createCharacterBtn = document.getElementById('create-character-btn');
  if (createCharacterBtn) {
    createCharacterBtn.addEventListener('click', showCharacterCreate);
  }

  const enterGameBackBtn = document.getElementById('enter-game-back-btn');
  if (enterGameBackBtn) {
    enterGameBackBtn.addEventListener('click', () => showHub());
  }

  // Character create form
  const charCreateForm = document.getElementById('character-create-form');
  if (charCreateForm) {
    charCreateForm.addEventListener('submit', handleCharacterCreate);
  }

  const backToEnterGameBtn = document.getElementById('back-to-enter-game-btn');
  if (backToEnterGameBtn) {
    backToEnterGameBtn.addEventListener('click', showEnterGame);
  }

  // Race/class selection change handlers
  const raceSelect = document.getElementById('char-race');
  if (raceSelect) {
    raceSelect.addEventListener('change', updateRaceDescription);
  }

  const classSelect = document.getElementById('char-class');
  if (classSelect) {
    classSelect.addEventListener('change', updateClassDescription);
  }

  // User menu dropdown toggle (terminal nav)
  const userMenuBtn = document.getElementById('nav-username');
  const userMenu = userMenuBtn?.closest('.nav-user-menu');
  if (userMenuBtn && userMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('open');
    });
  }

  // Prevent dropdown menus from closing when clicking inside them
  document.querySelectorAll('.dropdown-menu').forEach((menu) => {
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  // Close all nav user dropdowns when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-user-menu.open').forEach((menu) => {
      menu.classList.remove('open');
    });
  });
});
