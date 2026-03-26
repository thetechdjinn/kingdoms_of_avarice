/**
 * Action Editor — two-panel layout with inline previews.
 * Uses shared components: initAuth, ListPanel, showToast, showConfirm.
 */

import { Action } from '@koa/shared';
import { initAuth, ListPanel, showToast, showConfirm, escapeHtml } from './components/index.js';
import { renderNav } from './components/nav.js';

(async function () {
  renderNav({ activePage: 'action-editor', helpDoc: 'Actions_and_Emotes_Guide.md' });
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let actions: Action[] = [];
  let selectedActionId: number | null = null;

  // ============================================================================
  // DOM References
  // ============================================================================

  const actionForm = document.getElementById('action-form') as HTMLFormElement;
  const noActionSelected = document.getElementById('no-action-selected') as HTMLDivElement;
  const formTitle = document.getElementById('action-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('action-id-display') as HTMLSpanElement;
  const actionCount = document.getElementById('action-count') as HTMLSpanElement;
  const targetingStatus = document.getElementById('targeting-status') as HTMLDivElement;

  // Form inputs
  const commandInput = document.getElementById('action-command') as HTMLInputElement;
  const descriptionInput = document.getElementById('action-description') as HTMLInputElement;
  const selfNoTargetInput = document.getElementById('action-self-no-target') as HTMLInputElement;
  const roomNoTargetInput = document.getElementById('action-room-no-target') as HTMLInputElement;
  const selfWithTargetInput = document.getElementById('action-self-with-target') as HTMLInputElement;
  const targetPerspectiveInput = document.getElementById('action-target-perspective') as HTMLInputElement;
  const roomWithTargetInput = document.getElementById('action-room-with-target') as HTMLInputElement;

  // Inline preview elements
  const previewSelfNoTarget = document.getElementById('preview-self-no-target') as HTMLDivElement;
  const previewRoomNoTarget = document.getElementById('preview-room-no-target') as HTMLDivElement;
  const previewSelfWithTarget = document.getElementById('preview-self-with-target') as HTMLDivElement;
  const previewTargetPerspective = document.getElementById('preview-target-perspective') as HTMLDivElement;
  const previewRoomWithTarget = document.getElementById('preview-room-with-target') as HTMLDivElement;

  // ============================================================================
  // List Panel
  // ============================================================================

  const listPanel = new ListPanel<Action>({
    listElement: document.getElementById('action-list')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    onSelect: (item) => selectAction(item.id),
    getId: (item) => item.id,
    renderItem: (item) => `
      <span class="action-command">${escapeHtml(item.command)}</span>
      <span class="action-desc">${escapeHtml(item.description || '')}</span>
    `,
    filterFn: (item, search) =>
      item.command.toLowerCase().includes(search) ||
      (item.description?.toLowerCase().includes(search) ?? false),
    sortFn: (a, b) => a.command.localeCompare(b.command),
    onRender: updateCount,
  });

  // ============================================================================
  // API
  // ============================================================================

  async function fetchActions(): Promise<void> {
    try {
      const res = await fetch('/api/actions', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        actions = data.actions;
        listPanel.setItems(actions);
        listPanel.setSelected(selectedActionId);
      } else {
        showToast(data.message || 'Failed to fetch actions', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch actions:', error);
      showToast('Failed to fetch actions', 'error');
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
        showToast(isNew ? 'Action created' : 'Action saved', 'success');
        await fetchActions();
        return data.action;
      } else {
        showToast(data.message || 'Failed to save action', 'error');
        return null;
      }
    } catch (error) {
      console.error('Failed to save action:', error);
      showToast('Failed to save action', 'error');
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
        showToast('Action deleted', 'success');
        await fetchActions();
        return true;
      } else {
        showToast(data.message || 'Failed to delete action', 'error');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete action:', error);
      showToast('Failed to delete action', 'error');
      return false;
    }
  }

  // ============================================================================
  // Selection & Form
  // ============================================================================

  function selectAction(id: number): void {
    selectedActionId = id;
    const action = actions.find(a => a.id === id);
    if (!action) return;

    noActionSelected.style.display = 'none';
    actionForm.style.display = 'block';
    formTitle.textContent = 'Edit Action';
    idDisplay.textContent = `ID: ${action.id}`;

    commandInput.value = action.command;
    descriptionInput.value = action.description || '';
    selfNoTargetInput.value = action.firstPersonNoTarget;
    roomNoTargetInput.value = action.roomNoTarget;
    selfWithTargetInput.value = action.firstPersonWithTarget || '';
    targetPerspectiveInput.value = action.targetPerspective || '';
    roomWithTargetInput.value = action.roomWithTarget || '';

    listPanel.setSelected(id);
    updateAllPreviews();
  }

  function clearForm(): void {
    selectedActionId = null;
    commandInput.value = '';
    descriptionInput.value = '';
    selfNoTargetInput.value = '';
    roomNoTargetInput.value = '';
    selfWithTargetInput.value = '';
    targetPerspectiveInput.value = '';
    roomWithTargetInput.value = '';

    noActionSelected.style.display = 'flex';
    actionForm.style.display = 'none';
    idDisplay.textContent = '';
    listPanel.setSelected(null);
  }

  function showNewForm(): void {
    selectedActionId = null;
    noActionSelected.style.display = 'none';
    actionForm.style.display = 'block';
    formTitle.textContent = 'New Action';
    idDisplay.textContent = '';

    commandInput.value = '';
    descriptionInput.value = '';
    selfNoTargetInput.value = '';
    roomNoTargetInput.value = '';
    selfWithTargetInput.value = '';
    targetPerspectiveInput.value = '';
    roomWithTargetInput.value = '';

    listPanel.setSelected(null);
    commandInput.focus();
    updateAllPreviews();
  }

  // ============================================================================
  // Inline Previews
  // ============================================================================

  function replacePlaceholders(template: string, player: string, target?: string): string {
    let result = template.replace(/\{player\}/g, player);
    if (target !== undefined) {
      result = result.replace(/\{target\}/g, target);
    }
    return result;
  }

  function setPreview(el: HTMLDivElement, label: string, text: string, active: boolean): void {
    if (!text) {
      el.className = 'inline-preview';
      el.textContent = 'Type a message to see preview';
      return;
    }
    el.className = active ? 'inline-preview active' : 'inline-preview disabled';
    el.innerHTML = `<span class="preview-label">${escapeHtml(label)}</span>${escapeHtml(text)}`;
  }

  function isTargetingEnabled(): boolean {
    return !!(
      selfWithTargetInput.value.trim() &&
      targetPerspectiveInput.value.trim() &&
      roomWithTargetInput.value.trim()
    );
  }

  function updateTargetingStatus(): void {
    const enabled = isTargetingEnabled();
    const anyFilled = !!(
      selfWithTargetInput.value.trim() ||
      targetPerspectiveInput.value.trim() ||
      roomWithTargetInput.value.trim()
    );

    if (enabled) {
      targetingStatus.className = 'targeting-status enabled';
      targetingStatus.textContent = 'Targeting enabled';
    } else if (anyFilled) {
      // Some fields filled but not all
      const missing: string[] = [];
      if (!selfWithTargetInput.value.trim()) missing.push('self');
      if (!targetPerspectiveInput.value.trim()) missing.push('target');
      if (!roomWithTargetInput.value.trim()) missing.push('room');
      targetingStatus.className = 'targeting-status disabled';
      targetingStatus.textContent = `Targeting disabled: missing ${missing.join(', ')} message${missing.length > 1 ? 's' : ''}`;
    } else {
      targetingStatus.className = 'targeting-status disabled';
      targetingStatus.textContent = 'Targeting disabled: fill all three fields to enable';
    }
  }

  function updateAllPreviews(): void {
    // No-target previews
    const selfNoTarget = selfNoTargetInput.value;
    const roomNoTarget = roomNoTargetInput.value;

    setPreview(previewSelfNoTarget, 'You see:', selfNoTarget, true);
    setPreview(
      previewRoomNoTarget,
      'Others see:',
      roomNoTarget ? replacePlaceholders(roomNoTarget, 'Alice') : '',
      true,
    );

    // With-target previews
    const targeting = isTargetingEnabled();
    updateTargetingStatus();

    const selfWithTarget = selfWithTargetInput.value;
    const targetPersp = targetPerspectiveInput.value;
    const roomWithTarget = roomWithTargetInput.value;

    if (targeting) {
      setPreview(
        previewSelfWithTarget,
        'You see:',
        replacePlaceholders(selfWithTarget, 'You', 'Bob'),
        true,
      );
      setPreview(
        previewTargetPerspective,
        'Target sees:',
        replacePlaceholders(targetPersp, 'Alice', 'you'),
        true,
      );
      setPreview(
        previewRoomWithTarget,
        'Others see:',
        replacePlaceholders(roomWithTarget, 'Alice', 'Bob'),
        true,
      );
    } else {
      setPreview(
        previewSelfWithTarget,
        '',
        selfWithTarget ? replacePlaceholders(selfWithTarget, 'You', 'Bob') : '',
        false,
      );
      setPreview(
        previewTargetPerspective,
        '',
        targetPersp ? replacePlaceholders(targetPersp, 'Alice', 'you') : '',
        false,
      );
      setPreview(
        previewRoomWithTarget,
        '',
        roomWithTarget ? replacePlaceholders(roomWithTarget, 'Alice', 'Bob') : '',
        false,
      );
    }
  }

  function updateCount(filtered: number, total: number): void {
    actionCount.textContent = filtered === total ? `${total}` : `${filtered}/${total}`;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // New action
  document.getElementById('new-action-btn')?.addEventListener('click', showNewForm);

  // Form submission
  actionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const command = commandInput.value.trim();
    if (!command) {
      showToast('Command is required', 'warning');
      commandInput.focus();
      return;
    }

    // Check for duplicate command
    const duplicate = actions.find(a => a.command.toLowerCase() === command.toLowerCase() && a.id !== selectedActionId);
    if (duplicate) {
      showToast(`Action "${command}" already exists`, 'warning');
      commandInput.focus();
      return;
    }

    const firstPersonNoTarget = selfNoTargetInput.value.trim();
    const roomNoTarget = roomNoTargetInput.value.trim();

    if (!firstPersonNoTarget) {
      showToast('Self message (no target) is required', 'warning');
      selfNoTargetInput.focus();
      return;
    }
    if (!roomNoTarget) {
      showToast('Room message (no target) is required', 'warning');
      roomNoTargetInput.focus();
      return;
    }

    if (firstPersonNoTarget.includes('{target}') || roomNoTarget.includes('{target}')) {
      showToast('Warning: "No target" messages should not contain {target} placeholder', 'error');
      return;
    }

    const actionData = {
      command,
      description: descriptionInput.value.trim() || null,
      firstPersonNoTarget,
      roomNoTarget,
      firstPersonWithTarget: selfWithTargetInput.value.trim() || null,
      targetPerspective: targetPerspectiveInput.value.trim() || null,
      roomWithTarget: roomWithTargetInput.value.trim() || null,
    };

    const saved = await saveAction(actionData);
    if (saved) {
      selectAction(saved.id);
    }
  });

  // Delete
  document.getElementById('delete-action-btn')?.addEventListener('click', async () => {
    if (!selectedActionId) return;
    const action = actions.find(a => a.id === selectedActionId);
    const name = action?.command || 'this action';

    const confirmed = await showConfirm(
      `Delete action "${name}"? This cannot be undone.`,
      { confirmText: 'Delete', dangerous: true },
    );
    if (!confirmed) return;

    const success = await deleteAction(selectedActionId);
    if (success) clearForm();
  });

  // Duplicate
  document.getElementById('duplicate-action-btn')?.addEventListener('click', async () => {
    if (!selectedActionId) return;

    const baseCommand = commandInput.value.trim();
    let newCommand = baseCommand + '_copy';

    // Auto-increment if _copy already exists
    const existing = actions.map(a => a.command.toLowerCase());
    let counter = 2;
    while (existing.includes(newCommand.toLowerCase())) {
      newCommand = `${baseCommand}_${counter}`;
      counter++;
    }

    // Capture current form values before clearing selection
    const actionData = {
      command: newCommand,
      description: descriptionInput.value.trim() || null,
      firstPersonNoTarget: selfNoTargetInput.value.trim(),
      roomNoTarget: roomNoTargetInput.value.trim(),
      firstPersonWithTarget: selfWithTargetInput.value.trim() || null,
      targetPerspective: targetPerspectiveInput.value.trim() || null,
      roomWithTarget: roomWithTargetInput.value.trim() || null,
    };

    // Clear selection so saveAction creates a new entry
    selectedActionId = null;

    const saved = await saveAction(actionData);
    if (saved) {
      selectAction(saved.id);
    }
  });

  // Live preview on all message inputs
  const previewInputs = [
    selfNoTargetInput, roomNoTargetInput,
    selfWithTargetInput, targetPerspectiveInput, roomWithTargetInput,
  ];
  for (const input of previewInputs) {
    input.addEventListener('input', updateAllPreviews);
  }

  // ============================================================================
  // Import / Export
  // ============================================================================

  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/actions/export/all', { credentials: 'include' });
      if (!res.ok) {
        showToast(`Export failed: ${res.status}`, 'error');
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
      showToast(`Exported ${actions.length} action${actions.length === 1 ? '' : 's'}`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Failed to export actions', 'error');
    }
  });

  document.getElementById('import-btn')?.addEventListener('click', () => {
    // Create a file input dynamically
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const actionsToImport = data.actions || data;

        if (!Array.isArray(actionsToImport) || actionsToImport.length === 0) {
          showToast('No actions found in file', 'warning');
          return;
        }

        const mergeCheckbox = document.getElementById('import-merge') as HTMLInputElement;
        const merge = mergeCheckbox?.checked ?? true;

        const mergeNote = merge
          ? 'Existing actions with matching commands will be updated.'
          : 'Only new actions will be created; existing ones will be skipped.';
        const confirmed = await showConfirm(
          `Import ${actionsToImport.length} action${actionsToImport.length === 1 ? '' : 's'}? ${mergeNote}`,
        );
        if (!confirmed) return;

        const res = await fetch('/api/actions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ actions: actionsToImport, merge }),
        });

        if (!res.ok) {
          showToast(`Import failed: ${res.status}`, 'error');
          return;
        }

        const result = await res.json();
        if (result.success) {
          const { created, updated, errors } = result.results;
          showToast(`Imported: ${created} created, ${updated} updated`, 'success');
          if (errors.length > 0) {
            showToast(`${errors.length} error${errors.length === 1 ? '' : 's'} during import`, 'warning');
          }
          await fetchActions();
        } else {
          showToast(result.message || 'Import failed', 'error');
        }
      } catch (error) {
        console.error('Import failed:', error);
        showToast('Failed to parse import file', 'error');
      }
    });

    fileInput.click();
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await fetchActions();
})();
