import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { MessageType, GameMessage } from '@koa/shared';
import 'xterm/css/xterm.css';

let terminal: Terminal | null = null;
let socket: WebSocket | null = null;

function initTerminal(): void {
  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) return;

  terminal = new Terminal({
    cursorBlink: false,
    fontSize: 16,
    fontFamily: 'Courier New, monospace',
    theme: {
      background: '#0a0a0a',
      foreground: '#00ff00',
      cursor: '#0a0a0a',
      cursorAccent: '#0a0a0a',
    },
    disableStdin: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer);
  fitAddon.fit();

  window.addEventListener('resize', () => fitAddon.fit());

  const commandInput = document.getElementById('command-input') as HTMLInputElement;
  if (commandInput) {
    commandInput.focus();
  }
}

function handleCommandInput(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;

  const input = event.target as HTMLInputElement;
  const command = input.value.trim();

  if (command) {
    if (terminal) {
      terminal.write(`\x1b[1;32m> ${command}\x1b[0m\r\n`);
    }
    sendCommand(command);
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
      terminal.write(message.payload);
      terminal.write('\r\n');
      break;
    case MessageType.ERROR:
      terminal.write(`\x1b[31m${message.payload}\x1b[0m`);
      terminal.write('\r\n');
      break;
    case MessageType.SYSTEM:
      terminal.write(`\x1b[33m${message.payload}\x1b[0m`);
      terminal.write('\r\n');
      break;
  }
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
      if (successEl) successEl.textContent = 'Account created! You can now login.';
      form.reset();
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
      const isDeveloper = roles.includes('developer') || roles.includes('admin');
      
      // Show/hide Developer menu based on roles
      const developerMenu = document.getElementById('developer-menu');
      const menuDivider = document.getElementById('menu-divider');
      if (developerMenu) {
        developerMenu.style.display = isDeveloper ? 'block' : 'none';
      }
      if (menuDivider) {
        menuDivider.style.display = isDeveloper ? 'block' : 'none';
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
