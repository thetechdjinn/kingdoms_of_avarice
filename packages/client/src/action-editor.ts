/**
 * Action Editor - IIFE for managing social actions
 */

interface Action {
  id: number;
  command: string;
  description: string | null;
  firstPersonNoTarget: string;
  roomNoTarget: string;
  firstPersonWithTarget: string | null;
  targetPerspective: string | null;
  roomWithTarget: string | null;
  createdAt: string;
  updatedAt: string;
}

(async function () {
  // ============================================================================
  // Authentication & Initialization
  // ============================================================================

  async function checkAuth(): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        window.location.href = '/';
        return false;
      }
      const data = await res.json();
      if (!data.authenticated) {
        window.location.href = '/';
        return false;
      }

      const roles = data.roles || [];
      const hasDeveloperAccess = roles.includes('developer') || roles.includes('admin');

      if (!hasDeveloperAccess) {
        window.location.href = '/';
        return false;
      }

      // Update username display
      const usernameEl = document.getElementById('nav-username');
      if (usernameEl) usernameEl.textContent = data.username || 'User';

      // Show admin dropdown for admin users
      const isAdmin = roles.includes('admin');
      const adminDropdown = document.getElementById('nav-admin-dropdown');
      if (adminDropdown) {
        adminDropdown.style.display = isAdmin ? 'flex' : 'none';
      }

      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/';
      return false;
    }
  }

  const authenticated = await checkAuth();
  if (!authenticated) {
    return;
  }

  // Logout handler
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });

  // User dropdown toggle
  const userBtn = document.getElementById('nav-username');
  const userDropdown = document.getElementById('user-dropdown');
  userBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown?.classList.toggle('show');
  });
  document.addEventListener('click', () => userDropdown?.classList.remove('show'));

  // ============================================================================
  // State & DOM Elements
  // ============================================================================

  let actions: Action[] = [];
  let selectedActionId: number | null = null;

  const actionList = document.getElementById('action-list') as HTMLUListElement;
  const actionForm = document.getElementById('action-form') as HTMLFormElement;
  const noActionSelected = document.getElementById('no-action-selected') as HTMLDivElement;
  const formTitle = document.getElementById('action-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('action-id-display') as HTMLSpanElement;
  const previewContent = document.getElementById('preview-content') as HTMLDivElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;

  // Form fields
  const commandInput = document.getElementById('action-command') as HTMLInputElement;
  const descriptionInput = document.getElementById('action-description') as HTMLInputElement;
  const firstPersonNoTargetInput = document.getElementById('action-first-person-no-target') as HTMLInputElement;
  const roomNoTargetInput = document.getElementById('action-room-no-target') as HTMLInputElement;
  const firstPersonWithTargetInput = document.getElementById('action-first-person-with-target') as HTMLInputElement;
  const targetPerspectiveInput = document.getElementById('action-target-perspective') as HTMLInputElement;
  const roomWithTargetInput = document.getElementById('action-room-with-target') as HTMLInputElement;

  // ============================================================================
  // API Functions
  // ============================================================================

  async function fetchActions(): Promise<void> {
    try {
      const res = await fetch('/api/actions', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        actions = data.actions;
        renderActionList();
      }
    } catch (error) {
      console.error('Failed to fetch actions:', error);
    }
  }

  async function saveAction(actionData: Partial<Action>): Promise<Action | null> {
    try {
      const isNew = !selectedActionId;
      const url = isNew ? '/api/actions' : `/api/actions/${selectedActionId}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(actionData),
      });

      const data = await res.json();
      if (data.success) {
        await fetchActions();
        return data.action;
      } else {
        alert(data.message || 'Failed to save action');
        return null;
      }
    } catch (error) {
      console.error('Failed to save action:', error);
      alert('Failed to save action');
      return null;
    }
  }

  async function deleteAction(id: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/actions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        await fetchActions();
        return true;
      } else {
        alert(data.message || 'Failed to delete action');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete action:', error);
      alert('Failed to delete action');
      return false;
    }
  }

  // ============================================================================
  // UI Rendering
  // ============================================================================

  function renderActionList(): void {
    const searchTerm = searchInput.value.toLowerCase();
    const filtered = actions.filter(a =>
      a.command.toLowerCase().includes(searchTerm) ||
      (a.description?.toLowerCase().includes(searchTerm) ?? false)
    );

    actionList.innerHTML = '';
    for (const action of filtered) {
      const li = document.createElement('li');
      li.className = 'action-list-item' + (action.id === selectedActionId ? ' selected' : '');
      li.dataset.id = String(action.id);

      li.innerHTML = `
        <span class="action-command">${escapeHtml(action.command)}</span>
        <span class="action-desc">${escapeHtml(action.description || '')}</span>
      `;

      li.addEventListener('click', () => selectAction(action.id));
      actionList.appendChild(li);
    }
  }

  function selectAction(id: number): void {
    selectedActionId = id;
    const action = actions.find(a => a.id === id);
    if (!action) return;

    noActionSelected.style.display = 'none';
    actionForm.style.display = 'block';
    formTitle.textContent = 'Edit Action';
    idDisplay.textContent = `ID: ${action.id}`;

    // Fill form
    commandInput.value = action.command;
    descriptionInput.value = action.description || '';
    firstPersonNoTargetInput.value = action.firstPersonNoTarget;
    roomNoTargetInput.value = action.roomNoTarget;
    firstPersonWithTargetInput.value = action.firstPersonWithTarget || '';
    targetPerspectiveInput.value = action.targetPerspective || '';
    roomWithTargetInput.value = action.roomWithTarget || '';

    renderActionList();
    updatePreview();
  }

  function clearForm(): void {
    selectedActionId = null;
    commandInput.value = '';
    descriptionInput.value = '';
    firstPersonNoTargetInput.value = '';
    roomNoTargetInput.value = '';
    firstPersonWithTargetInput.value = '';
    targetPerspectiveInput.value = '';
    roomWithTargetInput.value = '';

    noActionSelected.style.display = 'block';
    actionForm.style.display = 'none';
    idDisplay.textContent = '';
    previewContent.innerHTML = '<p class="hint">Select an action to see preview</p>';
    renderActionList();
  }

  function updatePreview(): void {
    const command = commandInput.value || 'action';
    const selfNoTarget = firstPersonNoTargetInput.value || '(not set)';
    const roomNoTarget = roomNoTargetInput.value || '(not set)';
    const selfWithTarget = firstPersonWithTargetInput.value;
    const targetMsg = targetPerspectiveInput.value;
    const roomWithTarget = roomWithTargetInput.value;

    const playerName = 'You';
    const targetName = 'Bob';
    const otherPlayerName = 'Alice';

    let html = `<h4>Command: ${escapeHtml(command)}</h4>`;

    // No target preview
    html += `<div class="preview-section">`;
    html += `<h5>No Target</h5>`;
    html += `<div class="preview-line"><span class="label">You see:</span> ${escapeHtml(selfNoTarget)}</div>`;
    html += `<div class="preview-line"><span class="label">Others see:</span> ${escapeHtml(replacePlaceholders(roomNoTarget, otherPlayerName))}</div>`;
    html += `</div>`;

    // With target preview
    if (selfWithTarget && targetMsg && roomWithTarget) {
      html += `<div class="preview-section">`;
      html += `<h5>With Target (${escapeHtml(command)} bob)</h5>`;
      html += `<div class="preview-line"><span class="label">You see:</span> ${escapeHtml(replacePlaceholders(selfWithTarget, playerName, targetName))}</div>`;
      html += `<div class="preview-line"><span class="label">Target sees:</span> ${escapeHtml(replacePlaceholders(targetMsg, otherPlayerName, playerName))}</div>`;
      html += `<div class="preview-line"><span class="label">Others see:</span> ${escapeHtml(replacePlaceholders(roomWithTarget, otherPlayerName, targetName))}</div>`;
      html += `</div>`;
    } else {
      html += `<div class="preview-section muted">`;
      html += `<h5>With Target</h5>`;
      html += `<p>Targeting disabled (fill all three target fields to enable)</p>`;
      html += `</div>`;
    }

    previewContent.innerHTML = html;
  }

  function replacePlaceholders(template: string, player: string, target?: string): string {
    let result = template.replace(/\{player\}/gi, player);
    if (target) {
      result = result.replace(/\{target\}/gi, target);
    }
    return result;
  }

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // New action button
  document.getElementById('new-action-btn')?.addEventListener('click', () => {
    selectedActionId = null;
    noActionSelected.style.display = 'none';
    actionForm.style.display = 'block';
    formTitle.textContent = 'New Action';
    idDisplay.textContent = '';

    commandInput.value = '';
    descriptionInput.value = '';
    firstPersonNoTargetInput.value = '';
    roomNoTargetInput.value = '';
    firstPersonWithTargetInput.value = '';
    targetPerspectiveInput.value = '';
    roomWithTargetInput.value = '';

    commandInput.focus();
    renderActionList();
    updatePreview();
  });

  // Form submission
  actionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const actionData = {
      command: commandInput.value.trim(),
      description: descriptionInput.value.trim() || null,
      firstPersonNoTarget: firstPersonNoTargetInput.value.trim(),
      roomNoTarget: roomNoTargetInput.value.trim(),
      firstPersonWithTarget: firstPersonWithTargetInput.value.trim() || null,
      targetPerspective: targetPerspectiveInput.value.trim() || null,
      roomWithTarget: roomWithTargetInput.value.trim() || null,
    };

    const saved = await saveAction(actionData);
    if (saved) {
      selectAction(saved.id);
    }
  });

  // Delete button
  document.getElementById('delete-action-btn')?.addEventListener('click', async () => {
    if (!selectedActionId) return;
    if (!confirm('Are you sure you want to delete this action?')) return;

    const success = await deleteAction(selectedActionId);
    if (success) {
      clearForm();
    }
  });

  // Duplicate button
  document.getElementById('duplicate-action-btn')?.addEventListener('click', () => {
    if (!selectedActionId) return;

    selectedActionId = null;
    formTitle.textContent = 'New Action';
    idDisplay.textContent = '';
    commandInput.value = commandInput.value + '_copy';
    commandInput.focus();
    renderActionList();
    updatePreview();
  });

  // Search
  searchInput.addEventListener('input', renderActionList);

  // Live preview updates
  [commandInput, descriptionInput, firstPersonNoTargetInput, roomNoTargetInput,
   firstPersonWithTargetInput, targetPerspectiveInput, roomWithTargetInput].forEach(input => {
    input.addEventListener('input', updatePreview);
  });

  // ============================================================================
  // Import/Export
  // ============================================================================

  const importModal = document.getElementById('import-modal') as HTMLDivElement;
  const importFile = document.getElementById('import-file') as HTMLInputElement;
  const importMerge = document.getElementById('import-merge') as HTMLInputElement;

  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/actions/export/all', { credentials: 'include' });
      if (!res.ok) {
        alert(`Export failed: ${res.status} ${res.statusText}`);
        return;
      }
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'actions_export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export actions');
    }
  });

  document.getElementById('import-btn')?.addEventListener('click', () => {
    importModal.style.display = 'flex';
  });

  document.getElementById('close-import-modal')?.addEventListener('click', () => {
    importModal.style.display = 'none';
    importFile.value = '';
  });

  document.getElementById('do-import-btn')?.addEventListener('click', async () => {
    const file = importFile.files?.[0];
    if (!file) {
      alert('Please select a file');
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const actionsToImport = data.actions || data;

      const res = await fetch('/api/actions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          actions: actionsToImport,
          merge: importMerge.checked,
        }),
      });

      if (!res.ok) {
        alert(`Import failed: ${res.status} ${res.statusText}`);
        return;
      }

      const result = await res.json();
      if (result.success) {
        const { created, updated, errors } = result.results;
        let message = `Import complete: ${created} created, ${updated} updated`;
        if (errors.length > 0) {
          message += `\n\nErrors:\n${errors.join('\n')}`;
        }
        alert(message);
        await fetchActions();
        importModal.style.display = 'none';
        importFile.value = '';
      } else {
        alert(result.message || 'Import failed');
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to parse import file');
    }
  });

  // Close modal on outside click
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) {
      importModal.style.display = 'none';
      importFile.value = '';
    }
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await fetchActions();
})();
