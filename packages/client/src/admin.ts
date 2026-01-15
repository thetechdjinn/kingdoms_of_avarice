(function() {

interface PendingUser {
  id: number;
  username: string;
}

async function checkAdminAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    
    if (!response.ok) {
      // Redirect to login
      window.location.href = '/';
      return false;
    }
    
    const data = await response.json();
    
    if (data.authenticated) {
      const roles: string[] = data.roles || [];
      const isAdmin = roles.includes('admin');

      // Check admin access first before modifying UI
      if (!isAdmin) {
        window.location.href = '/';
        return false;
      }

      const usernameEl = document.getElementById('nav-username');
      if (usernameEl) {
        usernameEl.textContent = data.username;
      }

      const isDeveloper = roles.includes('developer') || isAdmin;

      // Show/hide Developer menu based on roles
      const developerMenu = document.getElementById('developer-menu');
      if (developerMenu) {
        developerMenu.style.display = isDeveloper ? 'block' : 'none';
      }

      // Show/hide Admin menu based on roles
      const adminMenu = document.getElementById('admin-menu');
      if (adminMenu) {
        adminMenu.style.display = isAdmin ? 'block' : 'none';
      }

      return isAdmin;
    }
    // Redirect to login
    window.location.href = '/';
    return false;
  } catch (error) {
    console.error('Auth check failed:', error);
    // Redirect to login on error
    window.location.href = '/';
    return false;
  }
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
    } else {
      if (button) {
        button.disabled = false;
        button.textContent = 'Approve';
      }
      alert('Failed to approve user: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to approve user:', error);
    if (button) {
      button.disabled = false;
      button.textContent = 'Approve';
    }
    alert('Failed to approve user');
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
  window.location.href = '/';
}


document.addEventListener('DOMContentLoaded', async () => {
  const isAdmin = await checkAdminAuth();
  
  const accessDenied = document.getElementById('access-denied');
  const adminPanel = document.getElementById('admin-panel');
  
  if (isAdmin) {
    if (accessDenied) accessDenied.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'block';
    await loadPendingUsers();
  } else {
    if (accessDenied) accessDenied.style.display = 'block';
    if (adminPanel) adminPanel.style.display = 'none';
  }

  // Logout button
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

})();
