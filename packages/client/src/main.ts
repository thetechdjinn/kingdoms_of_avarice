import { Terminal } from 'xterm';
import { MessageType, GameMessage, VitalsData, ResourceType, Character } from '@koa/shared';
import 'xterm/css/xterm.css';

let terminal: Terminal | null = null;
let socket: WebSocket | null = null;
let currentVitals: VitalsData | null = null;
let statlineDisplayed = false;
let currentUsername: string = '';
let selectedCharacterId: number | null = null;
let isInGame: boolean = false;
let canBypassExitTimer: boolean = false;

// Types for API responses
interface ClassDefinition {
  class_id: string;
  display_name: string;
  description: string | null;
  base_stats: Record<string, number> | null;
  playable: boolean;
}

interface RaceDefinition {
  race_id: string;
  display_name: string;
  description: string | null;
  stat_modifiers: Record<string, number> | null;
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
  // Move to beginning of line and clear it
  terminal.write('\r\x1b[K');
  statlineDisplayed = false;
}

// Render the statline at the current cursor position
function renderStatline(): void {
  if (!terminal || !currentVitals) return;

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

  // Clear in-game state
  isInGame = false;
  removeExitProtection();

  // Return to landing page (not login)
  showLandingPage();
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
  cachedRaces = [];
  cachedClasses = [];

  // Clear in-game state
  isInGame = false;
  removeExitProtection();

  // Hide all containers
  document.getElementById('app')!.classList.remove('game-view');
  document.getElementById('app')!.classList.add('login-view');
  document.getElementById('terminal-container')!.classList.remove('active');
  document.getElementById('landing-container')!.style.display = 'none';
  document.getElementById('character-select-container')!.style.display = 'none';
  document.getElementById('character-create-container')!.style.display = 'none';
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

      // Show/hide Developer menu based on roles
      const developerMenu = document.getElementById('developer-menu');
      const menuDivider = document.getElementById('menu-divider');
      if (developerMenu) {
        developerMenu.style.display = isDeveloper ? 'block' : 'none';
      }
      if (menuDivider) {
        menuDivider.style.display = (isDeveloper || isAdmin) ? 'block' : 'none';
      }
      
      // Show/hide Admin menu based on roles
      const adminMenu = document.getElementById('admin-menu');
      if (adminMenu) {
        adminMenu.style.display = isAdmin ? 'block' : 'none';
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
  document.getElementById('landing-container')!.style.display = 'none';
  document.getElementById('character-select-container')!.style.display = 'none';
  document.getElementById('character-create-container')!.style.display = 'none';
  document.getElementById('terminal-container')!.classList.remove('active');
}

function showLandingPage(): void {
  hideAllContainers();
  document.getElementById('app')!.classList.remove('login-view');
  document.getElementById('app')!.classList.add('game-view');

  const landingUsername = document.getElementById('landing-username');
  if (landingUsername) {
    landingUsername.textContent = currentUsername;
  }

  document.getElementById('landing-container')!.style.display = 'block';
}

async function showCharacterSelect(): Promise<void> {
  hideAllContainers();

  const characterList = document.getElementById('character-list')!;
  characterList.innerHTML = '<p class="loading">Loading characters...</p>';
  document.getElementById('character-select-container')!.style.display = 'block';

  try {
    const response = await fetch('/api/characters', { credentials: 'include' });
    const data = await response.json();

    if (!data.success) {
      characterList.innerHTML = '<p class="error">Failed to load characters</p>';
      return;
    }

    const characters: Character[] = data.characters;

    if (characters.length === 0) {
      characterList.innerHTML = '<p class="no-characters">No characters yet. Create one to begin!</p>';
    } else {
      characterList.innerHTML = characters.map(char => `
        <div class="character-card" data-id="${char.id}">
          <div class="character-card-content">
            <div class="character-name">${escapeHtml(char.name)}</div>
            <div class="character-info">Level ${char.level} ${escapeHtml(char.race)} ${escapeHtml(char.class)}</div>
          </div>
          <button class="character-delete-btn" data-id="${char.id}" data-name="${escapeHtml(char.name)}" title="Delete character">X</button>
        </div>
      `).join('');

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

async function showCharacterCreate(): Promise<void> {
  hideAllContainers();
  document.getElementById('character-create-container')!.style.display = 'block';

  // Clear form
  (document.getElementById('char-name') as HTMLInputElement).value = '';
  (document.getElementById('char-race') as HTMLSelectElement).value = '';
  (document.getElementById('char-class') as HTMLSelectElement).value = '';
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

  const baseStats = classDef.base_stats || {};
  const modifiers = race.stat_modifiers || {};

  const stats = {
    strength: (baseStats.strength || 10) + (modifiers.strength || 0),
    intelligence: (baseStats.intelligence || 10) + (modifiers.intelligence || 0),
    dexterity: (baseStats.dexterity || 10) + (modifiers.dexterity || 0),
    constitution: (baseStats.constitution || 10) + (modifiers.constitution || 0),
    wisdom: (baseStats.wisdom || 10) + (modifiers.wisdom || 0),
    charisma: (baseStats.charisma || 10) + (modifiers.charisma || 0),
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
  const raceId = (document.getElementById('char-race') as HTMLSelectElement).value;
  const classId = (document.getElementById('char-class') as HTMLSelectElement).value;
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
      body: JSON.stringify({ name, raceId, classId }),
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

  hideAllContainers();
  document.getElementById('terminal-container')!.classList.add('active');
  isInGame = true;
  setupExitProtection();
  initTerminal();
  connectWebSocketWithCharacter(selectedCharacterId);
  updateNavigation();
}

function connectWebSocketWithCharacter(characterId: number): void {
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

  // Landing page buttons
  const enterGameBtn = document.getElementById('enter-game-btn');
  if (enterGameBtn) {
    enterGameBtn.addEventListener('click', showCharacterSelect);
  }

  const landingLogoutBtn = document.getElementById('landing-logout-btn');
  if (landingLogoutBtn) {
    landingLogoutBtn.addEventListener('click', handleLogout);
  }

  // Character select buttons
  const createCharacterBtn = document.getElementById('create-character-btn');
  if (createCharacterBtn) {
    createCharacterBtn.addEventListener('click', showCharacterCreate);
  }

  const backToLandingBtn = document.getElementById('back-to-landing-btn');
  if (backToLandingBtn) {
    backToLandingBtn.addEventListener('click', showLandingPage);
  }

  // Character create form
  const charCreateForm = document.getElementById('character-create-form');
  if (charCreateForm) {
    charCreateForm.addEventListener('submit', handleCharacterCreate);
  }

  const backToSelectBtn = document.getElementById('back-to-select-btn');
  if (backToSelectBtn) {
    backToSelectBtn.addEventListener('click', showCharacterSelect);
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
});
