import { Terminal } from 'xterm';
import { MessageType, GameMessage, VitalsData, ResourceType } from '@koa/shared';
import 'xterm/css/xterm.css';

let terminal: Terminal | null = null;
let socket: WebSocket | null = null;
let currentVitals: VitalsData | null = null;
let statlineDisplayed = false;

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

function connectWebSocket(): void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/game`;

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
    if (terminal) {
      terminal.write('\r\n\x1b[31m*** Connection lost ***\x1b[0m\r\n');
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
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
      // Server requested logout - call the logout API and redirect to login
      handleLogout();
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
      document.getElementById('app')!.classList.remove('login-view');
      document.getElementById('app')!.classList.add('game-view');
      document.getElementById('login-container')!.style.display = 'none';
      document.getElementById('terminal-container')!.classList.add('active');
      initTerminal();
      connectWebSocket();
      
      // Fetch user info and update nav
      updateNavigation();
    } else {
      if (errorEl) errorEl.textContent = data.message || 'Login failed';
    }
  } catch {
    if (errorEl) errorEl.textContent = 'Connection error';
  }
}

async function handleLogout(): Promise<void> {
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

  document.getElementById('app')!.classList.remove('game-view');
  document.getElementById('app')!.classList.add('login-view');
  document.getElementById('terminal-container')!.classList.remove('active');
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
      // User is already logged in, show game view
      document.getElementById('app')!.classList.remove('login-view');
      document.getElementById('app')!.classList.add('game-view');
      document.getElementById('login-container')!.style.display = 'none';
      document.getElementById('terminal-container')!.classList.add('active');
      initTerminal();
      connectWebSocket();
      updateNavigation();
    }
  } catch (error) {
    console.error('Failed to check auth:', error);
  }
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
