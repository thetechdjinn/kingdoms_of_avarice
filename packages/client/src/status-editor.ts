/**
 * Status Effect Editor — three-panel with tabs, spell reverse lookup.
 * Uses shared components: initAuth, ListPanel, setupTabs, showToast, showConfirm, showPromptFields.
 */

import { StatusEffectDefinition, StatusEffectCategory, StackingBehavior } from '@koa/shared';
import { initAuth, ListPanel, setupTabs, showToast, showConfirm, showPromptFields, escapeHtml } from './components/index.js';
import { renderNav } from './components/nav.js';

interface SpellRef {
  id: number;
  name: string;
  levelRequired: number;
  statusEffect: string | null;
}

(async function () {
  renderNav({ activePage: 'status-editor', helpDoc: 'Spell_and_Effects_Guide.md' });
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let effects: StatusEffectDefinition[] = [];
  let spells: SpellRef[] = [];
  let selectedEffectId: string | null = null;

  // ============================================================================
  // DOM References
  // ============================================================================

  const effectForm = document.getElementById('effect-form') as HTMLFormElement;
  const noEffectSelected = document.getElementById('no-effect-selected') as HTMLDivElement;
  const formTitle = document.getElementById('effect-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('effect-id-display') as HTMLSpanElement;
  const effectCount = document.getElementById('effect-count') as HTMLSpanElement;
  const previewContent = document.getElementById('preview-content') as HTMLDivElement;
  const spellRefContent = document.getElementById('spell-ref-content') as HTMLDivElement;

  // Basic tab
  const idInput = document.getElementById('effect-id') as HTMLInputElement;
  const nameInput = document.getElementById('effect-name') as HTMLInputElement;
  const descriptionInput = document.getElementById('effect-description') as HTMLTextAreaElement;
  const categorySelect = document.getElementById('effect-category') as HTMLSelectElement;
  const stackingSelect = document.getElementById('effect-stacking') as HTMLSelectElement;
  const maxStacksInput = document.getElementById('effect-max-stacks') as HTMLInputElement;
  const maxStacksGroup = document.getElementById('max-stacks-group') as HTMLDivElement;

  // Modifier field mapping: [elementId, fieldName]
  const modifierFields: Array<[string, string]> = [
    ['effect-accuracy', 'accuracyModifier'], ['effect-defense', 'defenseModifier'],
    ['effect-energy', 'energyModifier'], ['effect-damage', 'damageModifier'],
    ['effect-speed', 'speedModifier'], ['effect-crit-chance', 'criticalChanceModifier'],
    ['effect-dodge', 'dodgeModifier'], ['effect-armor-class', 'armorClassModifier'],
    ['effect-damage-reduction', 'damageReductionModifier'], ['effect-magic-resist', 'magicResistance'],
    ['effect-spellcasting', 'spellcastingModifier'], ['effect-healing-received', 'healingReceived'],
    ['effect-stealth', 'stealthModifier'], ['effect-perception', 'perceptionModifier'],
    ['effect-lockpicking', 'lockpickingModifier'], ['effect-vision', 'visionModifier'],
    ['effect-str', 'strengthModifier'], ['effect-dex', 'dexterityModifier'],
    ['effect-con', 'constitutionModifier'], ['effect-int', 'intelligenceModifier'],
    ['effect-wis', 'wisdomModifier'], ['effect-cha', 'charismaModifier'],
    ['effect-max-hp', 'maxHpModifier'], ['effect-max-mana', 'maxManaModifier'],
  ];

  // Flag field mapping: [elementId, fieldName]
  const flagFields: Array<[string, string]> = [
    ['effect-blocks-regen', 'blocksRegen'], ['effect-blocks-movement', 'blocksMovement'],
    ['effect-is-blind', 'isBlind'], ['effect-blocks-casting', 'blocksCasting'],
    ['effect-blocks-combat', 'blocksCombat'], ['effect-blocks-stealth', 'blocksStealth'],
  ];

  // ============================================================================
  // List Panel
  // ============================================================================

  const listPanel = new ListPanel<StatusEffectDefinition>({
    listElement: document.getElementById('effect-list')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    filterSelect: document.getElementById('category-select') as HTMLSelectElement,
    onSelect: (item) => selectEffect(item.id),
    getId: (item) => item.id,
    renderItem: (item) => `
      <div class="effect-name">${escapeHtml(item.name)}</div>
      <div class="effect-meta">
        <span class="effect-id">${escapeHtml(item.id)}</span>
        <span class="cat-badge ${item.category}">${escapeHtml(item.category)}</span>
      </div>
    `,
    filterFn: (item, search) =>
      item.name.toLowerCase().includes(search) ||
      item.id.toLowerCase().includes(search) ||
      item.description.toLowerCase().includes(search),
    dropdownFilterFn: (item, value) => item.category === value,
    sortFn: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    onRender: updateCount,
  });

  // ============================================================================
  // Tabs
  // ============================================================================

  setupTabs({ container: effectForm });

  // ============================================================================
  // API
  // ============================================================================

  async function fetchEffects(): Promise<void> {
    try {
      const res = await fetch('/api/status-effects', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.definitions)) {
        effects = data.definitions;
        listPanel.setItems(effects);
        listPanel.setSelected(selectedEffectId);
      } else {
        showToast('Failed to load status effects', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch effects:', error);
      showToast('Failed to connect to server', 'error');
    }
  }

  async function fetchSpells(): Promise<void> {
    try {
      const res = await fetch('/api/spells', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        spells = data.spells || [];
      }
    } catch (error) {
      console.error('Failed to fetch spells:', error);
    }
  }

  async function saveEffect(effectData: Partial<StatusEffectDefinition>, forceNew = false): Promise<StatusEffectDefinition | null> {
    try {
      const isNew = forceNew || !selectedEffectId;
      const url = isNew ? '/api/status-effects' : `/api/status-effects/${selectedEffectId}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(effectData),
      });

      const data = await res.json();
      if (data.success) {
        showToast(isNew ? 'Effect created' : 'Effect saved', 'success');
        await fetchEffects();
        return data.definition;
      } else {
        showToast(data.message || 'Failed to save effect', 'error');
        return null;
      }
    } catch (error) {
      console.error('Failed to save effect:', error);
      showToast('Failed to save effect', 'error');
      return null;
    }
  }

  async function deleteEffect(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/status-effects/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Effect deleted', 'success');
        await fetchEffects();
        return true;
      } else {
        showToast(data.message || 'Failed to delete effect', 'error');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete effect:', error);
      showToast('Failed to delete effect', 'error');
      return false;
    }
  }

  // ============================================================================
  // Selection & Form
  // ============================================================================

  function selectEffect(id: string): void {
    const effect = effects.find(e => e.id === id);
    if (!effect) { clearForm(); return; }

    selectedEffectId = id;
    noEffectSelected.style.display = 'none';
    effectForm.style.display = 'block';
    formTitle.textContent = 'Edit Status Effect';
    idDisplay.textContent = `ID: ${effect.id}`;

    // Basic
    idInput.value = effect.id;
    idInput.disabled = true;
    nameInput.value = effect.name;
    descriptionInput.value = effect.description || '';
    categorySelect.value = effect.category;
    stackingSelect.value = effect.stackingBehavior;
    maxStacksInput.value = String(effect.maxStacks);
    updateMaxStacksVisibility();

    // Modifiers
    for (const [elemId, field] of modifierFields) {
      const el = document.getElementById(elemId) as HTMLInputElement;
      if (el) el.value = String((effect as unknown as Record<string, unknown>)[field] ?? 0);
    }

    // Periodic
    const tickDmgMin = document.getElementById('effect-tick-damage-min') as HTMLInputElement | null;
    const tickDmgMax = document.getElementById('effect-tick-damage-max') as HTMLInputElement | null;
    const tickHealMin = document.getElementById('effect-tick-healing-min') as HTMLInputElement | null;
    const tickHealMax = document.getElementById('effect-tick-healing-max') as HTMLInputElement | null;
    const tickMsg = document.getElementById('effect-tick-message') as HTMLInputElement | null;
    const wearOff = document.getElementById('effect-wear-off') as HTMLInputElement | null;
    const showTickCb = document.getElementById('effect-show-tick-message') as HTMLInputElement | null;
    if (tickDmgMin) tickDmgMin.value = effect.tickDamageMin?.toString() || '';
    if (tickDmgMax) tickDmgMax.value = effect.tickDamageMax?.toString() || '';
    if (tickHealMin) tickHealMin.value = effect.tickHealingMin?.toString() || '';
    if (tickHealMax) tickHealMax.value = effect.tickHealingMax?.toString() || '';
    if (tickMsg) tickMsg.value = effect.tickMessage || '';
    if (wearOff) wearOff.value = effect.wearOffMessage || '';
    if (showTickCb) showTickCb.checked = !effect.silentTick;
    updateTickMessageVisibility();

    // Flags
    for (const [elemId, field] of flagFields) {
      const el = document.getElementById(elemId) as HTMLInputElement;
      if (el) el.checked = !!(effect as unknown as Record<string, unknown>)[field];
    }

    listPanel.setSelected(id);
    updatePreview(effect);
    updateSpellReferences(id);
  }

  function clearForm(): void {
    selectedEffectId = null;
    noEffectSelected.style.display = 'flex';
    effectForm.style.display = 'none';
    idDisplay.textContent = '';
    previewContent.innerHTML = '<p class="hint">Select an effect to see preview</p>';
    spellRefContent.innerHTML = '<p class="hint">Select an effect to see spell references</p>';
    listPanel.setSelected(null);
  }

  function updateMaxStacksVisibility(): void {
    maxStacksGroup.style.display = stackingSelect.value === 'stack' ? 'block' : 'none';
  }

  function updateTickMessageVisibility(): void {
    const cb = document.getElementById('effect-show-tick-message') as HTMLInputElement | null;
    const group = document.getElementById('tick-message-group');
    if (cb && group) group.style.display = cb.checked ? 'block' : 'none';
  }

  // ============================================================================
  // Gather Form Data
  // ============================================================================

  function gatherFormData(): Partial<StatusEffectDefinition> {
    const maxStacks = parseInt(maxStacksInput.value, 10);
    const tickDamageMin = parseInt((document.getElementById('effect-tick-damage-min') as HTMLInputElement).value, 10);
    const tickDamageMax = parseInt((document.getElementById('effect-tick-damage-max') as HTMLInputElement).value, 10);
    const tickHealingMin = parseInt((document.getElementById('effect-tick-healing-min') as HTMLInputElement).value, 10);
    const tickHealingMax = parseInt((document.getElementById('effect-tick-healing-max') as HTMLInputElement).value, 10);

    // If only one of min/max is set, use it for both (fixed damage value)
    let resolvedTickDmgMin = isNaN(tickDamageMin) ? undefined : tickDamageMin;
    let resolvedTickDmgMax = isNaN(tickDamageMax) ? undefined : tickDamageMax;
    if (resolvedTickDmgMin !== undefined && resolvedTickDmgMax === undefined) resolvedTickDmgMax = resolvedTickDmgMin;
    if (resolvedTickDmgMax !== undefined && resolvedTickDmgMin === undefined) resolvedTickDmgMin = resolvedTickDmgMax;

    let resolvedTickHealMin = isNaN(tickHealingMin) ? undefined : tickHealingMin;
    let resolvedTickHealMax = isNaN(tickHealingMax) ? undefined : tickHealingMax;
    if (resolvedTickHealMin !== undefined && resolvedTickHealMax === undefined) resolvedTickHealMax = resolvedTickHealMin;
    if (resolvedTickHealMax !== undefined && resolvedTickHealMin === undefined) resolvedTickHealMin = resolvedTickHealMax;

    const data: Partial<StatusEffectDefinition> = {
      name: nameInput.value.trim(),
      description: descriptionInput.value.trim() || '',
      category: categorySelect.value as StatusEffectCategory,
      stackingBehavior: stackingSelect.value as StackingBehavior,
      maxStacks: isNaN(maxStacks) || maxStacks < 1 ? 1 : maxStacks,
      tickDamageMin: resolvedTickDmgMin,
      tickDamageMax: resolvedTickDmgMax,
      tickHealingMin: resolvedTickHealMin,
      tickHealingMax: resolvedTickHealMax,
      tickMessage: (document.getElementById('effect-tick-message') as HTMLInputElement | null)?.value ?? undefined,
      wearOffMessage: (document.getElementById('effect-wear-off') as HTMLInputElement | null)?.value ?? undefined,
      silentTick: !(document.getElementById('effect-show-tick-message') as HTMLInputElement | null)?.checked,
    };

    // Modifiers
    for (const [elemId, field] of modifierFields) {
      const el = document.getElementById(elemId) as HTMLInputElement | null;
      if (el) (data as Record<string, unknown>)[field] = parseInt(el.value, 10) || 0;
    }

    // Flags
    for (const [elemId, field] of flagFields) {
      const el = document.getElementById(elemId) as HTMLInputElement | null;
      if (el) (data as Record<string, unknown>)[field] = el.checked;
    }

    return data;
  }

  // ============================================================================
  // Preview
  // ============================================================================

  function formatModifier(label: string, value: number, suffix: string = ''): string {
    if (value === 0) return '';
    const cls = value > 0 ? 'positive' : 'negative';
    const sign = value > 0 ? '+' : '';
    return `<div class="preview-modifier">${escapeHtml(label)}: <span class="mod-value ${cls}">${sign}${value}${suffix}</span></div>`;
  }

  function updatePreview(effect: StatusEffectDefinition): void {
    let html = `
      <div class="preview-name">${escapeHtml(effect.name)}</div>
      <div class="preview-id">ID: <code>${escapeHtml(effect.id)}</code></div>
      <div class="preview-desc">${escapeHtml(effect.description || 'No description.')}</div>
      <div class="preview-badges">
        <span class="cat-badge ${effect.category}">${escapeHtml(effect.category)}</span>
        <span class="cat-badge" style="background:#1a1a2e;color:#888;">${escapeHtml(effect.stackingBehavior)}</span>
        ${effect.stackingBehavior === 'stack' ? `<span class="cat-badge" style="background:#1a1a2e;color:#888;">max ${effect.maxStacks}</span>` : ''}
      </div>
    `;

    // Modifiers
    const modLines = [
      formatModifier('Accuracy', effect.accuracyModifier ?? 0),
      formatModifier('Defense', effect.defenseModifier ?? 0),
      formatModifier('Energy', effect.energyModifier ?? 0, '%'),
      formatModifier('Damage', effect.damageModifier ?? 0, '%'),
      formatModifier('Speed', effect.speedModifier ?? 0, '%'),
      formatModifier('Crit', effect.criticalChanceModifier ?? 0, '%'),
      formatModifier('Dodge', effect.dodgeModifier ?? 0, '%'),
      formatModifier('Armor Class', effect.armorClassModifier ?? 0),
      formatModifier('Dmg Reduction', effect.damageReductionModifier ?? 0),
      formatModifier('Magic Resist', effect.magicResistance ?? 0, '%'),
      formatModifier('Spellcasting', effect.spellcastingModifier ?? 0),
      formatModifier('Healing Recv', effect.healingReceived ?? 0, '%'),
      formatModifier('Stealth', effect.stealthModifier ?? 0),
      formatModifier('Perception', effect.perceptionModifier ?? 0),
      formatModifier('Lockpicking', effect.lockpickingModifier ?? 0),
      formatModifier('Vision', effect.visionModifier ?? 0),
      formatModifier('STR', effect.strengthModifier ?? 0),
      formatModifier('DEX', effect.dexterityModifier ?? 0),
      formatModifier('CON', effect.constitutionModifier ?? 0),
      formatModifier('INT', effect.intelligenceModifier ?? 0),
      formatModifier('WIS', effect.wisdomModifier ?? 0),
      formatModifier('CHA', effect.charismaModifier ?? 0),
      formatModifier('Max HP', effect.maxHpModifier ?? 0),
      formatModifier('Max Mana', effect.maxManaModifier ?? 0),
    ].filter(Boolean);

    if (modLines.length > 0) {
      html += `<div class="preview-section"><div class="preview-section-title">Modifiers</div>${modLines.join('')}</div>`;
    }

    // Periodic
    const hasDmg = effect.tickDamageMin != null && effect.tickDamageMax != null;
    const hasHeal = effect.tickHealingMin != null && effect.tickHealingMax != null;
    if (hasDmg || hasHeal) {
      html += `<div class="preview-section"><div class="preview-section-title">Periodic (every 5s)</div>`;
      if (hasDmg) html += `<div class="preview-modifier">Damage: <span class="mod-value negative">${effect.tickDamageMin}-${effect.tickDamageMax}</span>/tick</div>`;
      if (hasHeal) html += `<div class="preview-modifier">Healing: <span class="mod-value positive">${effect.tickHealingMin}-${effect.tickHealingMax}</span>/tick</div>`;
      if (effect.tickMessage && !effect.silentTick) html += `<div class="preview-message">"${escapeHtml(effect.tickMessage)}"</div>`;
      if (effect.silentTick) html += `<div class="preview-modifier" style="color:#888;">Silent ticks</div>`;
      html += `</div>`;
    }

    if (effect.wearOffMessage) {
      html += `<div class="preview-section"><div class="preview-section-title">Wear Off</div><div class="preview-message">"${escapeHtml(effect.wearOffMessage)}"</div></div>`;
    }

    // Flags
    const activeFlags: string[] = [];
    if (effect.blocksRegen) activeFlags.push('Blocks Regen');
    if (effect.blocksMovement) activeFlags.push('Blocks Movement');
    if (effect.isBlind) activeFlags.push('Blind');
    if (effect.blocksCasting) activeFlags.push('Blocks Casting');
    if (effect.blocksCombat) activeFlags.push('Blocks Combat');
    if (effect.blocksStealth) activeFlags.push('Blocks Stealth');

    if (activeFlags.length > 0) {
      html += `<div class="preview-section"><div class="preview-section-title">Flags</div><div class="preview-flags">${activeFlags.map(f => `<span class="preview-flag">${escapeHtml(f)}</span>`).join('')}</div></div>`;
    }

    previewContent.innerHTML = html;
  }

  function updateSpellReferences(effectId: string): void {
    const refs = spells.filter(s => s.statusEffect === effectId).sort((a, b) => a.levelRequired - b.levelRequired);

    if (refs.length === 0) {
      spellRefContent.innerHTML = '<p class="no-refs">No spells reference this effect</p>';
      return;
    }

    spellRefContent.innerHTML = `<ul class="spell-ref-list">${refs.map(s => `
      <li>
        <span class="spell-ref-name">${escapeHtml(s.name)}</span>
        <span class="spell-ref-level">Lv ${s.levelRequired}</span>
      </li>
    `).join('')}</ul>`;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function updateCount(filtered: number, total: number): void {
    effectCount.textContent = filtered === total ? `${total}` : `${filtered}/${total}`;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // New effect
  document.getElementById('new-effect-btn')?.addEventListener('click', async () => {
    const result = await showPromptFields('New Status Effect', [
      { key: 'id', label: 'Effect ID', required: true, placeholder: 'poisoned' },
      { key: 'name', label: 'Display Name', required: true, placeholder: 'Poisoned' },
    ]);
    if (!result) return;

    const id = result.id.toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      showToast('ID must start with a letter and contain only lowercase letters, numbers, underscores', 'warning');
      return;
    }
    if (effects.some(e => e.id === id)) {
      showToast(`Effect ID "${id}" already exists`, 'warning');
      return;
    }

    const saved = await saveEffect({
      id,
      name: result.name,
      description: '',
      category: 'buff' as StatusEffectCategory,
      stackingBehavior: 'refresh' as StackingBehavior,
      maxStacks: 1,
    }, true);
    if (saved) selectEffect(saved.id);
  });

  // Save
  effectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedEffectId) return;

    const data = gatherFormData();
    if (!data.name?.trim()) {
      showToast('Display name is required', 'warning');
      nameInput.focus();
      return;
    }

    const saved = await saveEffect(data);
    if (saved) selectEffect(saved.id);
  });

  // Delete
  document.getElementById('delete-effect-btn')?.addEventListener('click', async () => {
    if (!selectedEffectId) return;
    const effect = effects.find(e => e.id === selectedEffectId);
    const name = effect?.name || selectedEffectId;
    const refs = spells.filter(s => s.statusEffect === selectedEffectId);

    let message = `Delete effect "${name}"?`;
    if (refs.length > 0) {
      message += ` ${refs.length} spell(s) reference this effect and will stop applying it.`;
    }

    const confirmed = await showConfirm(message, { confirmText: 'Delete', dangerous: true });
    if (!confirmed) return;

    const success = await deleteEffect(selectedEffectId);
    if (success) clearForm();
  });

  // Duplicate
  document.getElementById('duplicate-effect-btn')?.addEventListener('click', async () => {
    if (!selectedEffectId) return;

    const result = await showPromptFields('Duplicate Status Effect', [
      { key: 'id', label: 'New Effect ID', required: true, defaultValue: selectedEffectId + '_copy' },
      { key: 'name', label: 'Display Name', required: true, defaultValue: nameInput.value + ' (copy)' },
    ]);
    if (!result) return;

    const newId = result.id.toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(newId)) {
      showToast('ID must start with a letter and contain only lowercase letters, numbers, underscores', 'warning');
      return;
    }
    if (effects.some(e => e.id === newId)) {
      showToast(`Effect ID "${newId}" already exists`, 'warning');
      return;
    }

    const data = { ...gatherFormData(), id: newId, name: result.name };
    const saved = await saveEffect(data, true);
    if (saved) selectEffect(saved.id);
  });

  // Stacking behavior toggle
  stackingSelect.addEventListener('change', updateMaxStacksVisibility);

  // Show tick message toggle
  document.getElementById('effect-show-tick-message')?.addEventListener('change', updateTickMessageVisibility);

  // Import
  document.getElementById('import-btn')?.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const definitions = data.definitions || data;

        if (!Array.isArray(definitions) || definitions.length === 0) {
          showToast('No effect definitions found in file', 'warning');
          return;
        }

        const confirmed = await showConfirm(
          `Import ${definitions.length} effect(s)? Existing effects with matching IDs will be updated.`,
        );
        if (!confirmed) return;

        const res = await fetch('/api/status-effects/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ definitions, merge: true }),
        });

        const result = await res.json();
        if (result.success) {
          const { created, updated, errors } = result.results;
          showToast(`Imported: ${created} created, ${updated} updated`, 'success');
          if (errors.length > 0) showToast(`${errors.length} error(s) during import`, 'warning');
          await fetchEffects();
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

  // Export
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/status-effects/export/all', { credentials: 'include' });
      if (!res.ok) { showToast(`Export failed: ${res.status}`, 'error'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'status_effects_export.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Effects exported successfully', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Failed to export effects', 'error');
    }
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchEffects(), fetchSpells()]);
})();
