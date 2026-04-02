import { renderNav } from './components/nav.js';
import { initAuth } from './components/auth.js';
import { showConfirm } from './components/modal.js';
import { SearchableSelect } from './components/searchable-select.js';
import type { SelectOption } from './components/searchable-select.js';

(function() {

interface QuestItemReward {
  itemTemplateId: number;
  quantity: number;
}

interface QuestFactionReward {
  factionId: number;
  amount: number;
}

interface QuestStep {
  id?: number;
  questId?: number;
  stepOrder: number;
  triggerType: string;
  triggerNpcId: number | null;
  triggerItemTemplateId: number | null;
  triggerRoomId: number | null;
  triggerText: string | null;
  requiredCount: number;
  consumeItem: boolean;
  description: string;
  completionDialogue: string | null;
  inProgressDialogue: string | null;
  stepXpReward: number;
  stepEssenceReward: number;
  stepCurrencyReward: number;
  stepItemRewards: QuestItemReward[];
  stepFactionRewards: QuestFactionReward[];
}

interface Quest {
  id: number;
  tag: string;
  name: string;
  description: string | null;
  questGiverNpcId: number | null;
  minLevel: number;
  maxLevel: number | null;
  requiredRaces: string[] | null;
  requiredClasses: string[] | null;
  requiredFactionId: number | null;
  requiredFactionMin: number | null;
  requiredFactionMax: number | null;
  requiredQuestIds: number[];
  xpReward: number;
  essenceReward: number;
  currencyReward: number;
  itemRewards: QuestItemReward[];
  factionRewards: QuestFactionReward[];
  questFlag: string | null;
  denialDialogue: string | null;
  completedDialogue: string | null;
  enabled: boolean;
  sortOrder: number;
  steps: QuestStep[];
}


let quests: Quest[] = [];
let selectedQuestId: number | null = null;
let npcOptions: SelectOption[] = [];
let questGiverSelect: SearchableSelect | null = null;
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

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function parseIntOrNull(value: string | undefined | null): number | null {
  if (!value || value.trim() === '') return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function parseCommaSeparated(value: string | undefined | null): string[] | null {
  if (!value || value.trim() === '') return null;
  const items = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  return items.length > 0 ? items : null;
}

function parseCommaNumbers(value: string | undefined | null): number[] {
  if (!value || value.trim() === '') return [];
  return value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

// ============================================================================
// NPC Data
// ============================================================================

async function fetchNpcs(): Promise<void> {
  try {
    const response = await fetch('/api/npcs', { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const templates = data.templates || [];
    npcOptions = templates.map((t: { id: number; name: string }) => ({
      value: String(t.id),
      label: `${t.name} (#${t.id})`,
    }));
  } catch (error) {
    console.error('Failed to fetch NPCs:', error);
  }
}

function getNpcLabel(id: number | null): string {
  if (id === null) return '';
  const opt = npcOptions.find(o => o.value === String(id));
  return opt ? opt.label : `Unknown NPC #${id}`;
}

// ============================================================================
// Color Markup Preview
// ============================================================================

const COLOR_PREVIEW_MAP: Record<string, string> = {
  red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef',
  magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf', gray: '#888', grey: '#888',
  gold: '#e5c07b', bold: '#fff',
  brightred: '#e06c75', brightgreen: '#98c379', brightyellow: '#e5c07b',
  brightblue: '#61afef', brightcyan: '#56b6c2', brightwhite: '#fff',
  boldcyan: '#56b6c2', boldgreen: '#98c379', boldyellow: '#e5c07b',
  boldred: '#e06c75', boldwhite: '#fff',
  item: '#61afef', npc: '#c678dd', player: '#56b6c2', system: '#e5c07b', error: '#e06c75',
};

const BOLD_TAGS = new Set(['bold', 'boldcyan', 'boldgreen', 'boldyellow', 'boldred', 'boldwhite']);

/** Variables replaced before color parsing in preview */
const PREVIEW_VARIABLES: Record<string, string> = {
  name: 'PlayerName',
};

function renderColorPreviewHtml(raw: string): string {
  if (!raw) return '';
  // Variable substitution before color parsing
  let text = raw;
  for (const [key, value] of Object.entries(PREVIEW_VARIABLES)) {
    text = text.split(`{${key}}`).join(value);
  }
  const baseColor = '#56b6c2'; // cyan
  let result = '';
  let lastIndex = 0;
  let activeColor: string | null = null;
  let activeBold = false;

  const regex = /\{(\/|[a-zA-Z]+)\}/g;
  for (const match of text.matchAll(regex)) {
    const tagName = match[1];
    const matchStart = match.index;

    // Flush text before this tag
    if (matchStart > lastIndex) {
      const chunk = escapeHtml(text.slice(lastIndex, matchStart));
      const color = activeColor ?? baseColor;
      const weight = activeBold ? 'font-weight:bold;' : '';
      result += `<span style="color:${color};${weight}">${chunk}</span>`;
    }

    if (tagName === '/') {
      activeColor = null;
      activeBold = false;
    } else {
      const lower = tagName.toLowerCase();
      const previewColor = COLOR_PREVIEW_MAP[lower];
      if (previewColor) {
        activeColor = previewColor;
        activeBold = BOLD_TAGS.has(lower);
      } else {
        // Unrecognized tag: render as literal
        const literal = escapeHtml(match[0]);
        const color = activeColor ?? baseColor;
        const weight = activeBold ? 'font-weight:bold;' : '';
        result += `<span style="color:${color};${weight}">${literal}</span>`;
      }
    }

    lastIndex = matchStart + match[0].length;
  }

  // Flush remaining text
  if (lastIndex < text.length) {
    const chunk = escapeHtml(text.slice(lastIndex));
    const color = activeColor ?? baseColor;
    const weight = activeBold ? 'font-weight:bold;' : '';
    result += `<span style="color:${color};${weight}">${chunk}</span>`;
  }

  return result;
}

function attachColorPreview(textarea: HTMLTextAreaElement): void {
  const preview = document.createElement('div');
  preview.className = 'color-preview';
  textarea.parentElement?.appendChild(preview);

  const update = () => {
    preview.innerHTML = renderColorPreviewHtml(textarea.value) || '<span style="color:#555;">Preview...</span>';
  };

  textarea.addEventListener('input', update);
  update();
}

// ============================================================================
// Data Operations
// ============================================================================

async function fetchQuests(): Promise<void> {
  try {
    const response = await fetch('/api/quests');
    if (!response.ok) throw new Error('Failed to fetch quests');
    const data = await response.json();
    quests = data.quests || [];
    renderQuestList();
  } catch (error) {
    console.error('Failed to fetch quests:', error);
    showToast('Failed to load quests', 'error');
  }
}

function renderQuestList(): void {
  const list = document.getElementById('quest-list');
  if (!list) return;
  const searchInput = getElement<HTMLInputElement>('search-input');
  const searchTerm = (searchInput?.value || '').toLowerCase();

  const filtered = searchTerm
    ? quests.filter(q => q.name.toLowerCase().includes(searchTerm) || q.tag.toLowerCase().includes(searchTerm))
    : quests;

  list.innerHTML = '';
  for (const quest of filtered) {
    const li = document.createElement('li');
    li.className = quest.id === selectedQuestId ? 'active' : '';
    const disabledClass = quest.enabled ? '' : ' quest-disabled';
    li.innerHTML = `
      <div class="quest-name${disabledClass}">${escapeHtml(quest.name)}</div>
      <div class="quest-tag">${escapeHtml(quest.tag)}${quest.enabled ? '' : ' (disabled)'}</div>
    `;
    li.addEventListener('click', () => selectQuest(quest.id));
    list.appendChild(li);
  }
}

function selectQuest(id: number): void {
  selectedQuestId = id;
  const quest = quests.find(q => q.id === id);
  if (!quest) return;

  const noSelected = getElement<HTMLElement>('no-quest-selected');
  const form = getElement<HTMLFormElement>('quest-form');
  if (noSelected) noSelected.style.display = 'none';
  if (form) form.style.display = 'block';

  const titleEl = getElement<HTMLElement>('quest-form-title');
  if (titleEl) titleEl.textContent = `Edit Quest: ${quest.name}`;
  const idEl = getElement<HTMLElement>('quest-id-display');
  if (idEl) idEl.textContent = `ID: ${quest.id}`;

  // Basic tab
  const tagInput = getElement<HTMLInputElement>('quest-tag');
  if (tagInput) tagInput.value = quest.tag;
  const nameInput = getElement<HTMLInputElement>('quest-name');
  if (nameInput) nameInput.value = quest.name;
  const descInput = getElement<HTMLTextAreaElement>('quest-description');
  if (descInput) descInput.value = quest.description || '';
  if (questGiverSelect) {
    questGiverSelect.setValue(quest.questGiverNpcId ? String(quest.questGiverNpcId) : null);
  }
  const sortInput = getElement<HTMLInputElement>('quest-sort-order');
  if (sortInput) sortInput.value = quest.sortOrder.toString();
  const flagInput = getElement<HTMLInputElement>('quest-flag');
  if (flagInput) flagInput.value = quest.questFlag || '';
  const enabledInput = getElement<HTMLInputElement>('quest-enabled');
  if (enabledInput) enabledInput.checked = quest.enabled;

  // Requirements tab
  const minLevelInput = getElement<HTMLInputElement>('quest-min-level');
  if (minLevelInput) minLevelInput.value = quest.minLevel.toString();
  const maxLevelInput = getElement<HTMLInputElement>('quest-max-level');
  if (maxLevelInput) maxLevelInput.value = quest.maxLevel?.toString() || '';
  const racesInput = getElement<HTMLInputElement>('quest-required-races');
  if (racesInput) racesInput.value = quest.requiredRaces?.join(', ') || '';
  const classesInput = getElement<HTMLInputElement>('quest-required-classes');
  if (classesInput) classesInput.value = quest.requiredClasses?.join(', ') || '';
  const reqFactionInput = getElement<HTMLInputElement>('quest-required-faction');
  if (reqFactionInput) reqFactionInput.value = quest.requiredFactionId?.toString() || '';
  const reqFactionMinInput = getElement<HTMLInputElement>('quest-required-faction-min');
  if (reqFactionMinInput) reqFactionMinInput.value = quest.requiredFactionMin?.toString() || '';
  const reqFactionMaxInput = getElement<HTMLInputElement>('quest-required-faction-max');
  if (reqFactionMaxInput) reqFactionMaxInput.value = quest.requiredFactionMax?.toString() || '';
  const reqQuestsInput = getElement<HTMLInputElement>('quest-required-quests');
  if (reqQuestsInput) reqQuestsInput.value = quest.requiredQuestIds.length > 0 ? quest.requiredQuestIds.join(', ') : '';

  // Rewards tab
  const xpInput = getElement<HTMLInputElement>('quest-xp-reward');
  if (xpInput) xpInput.value = quest.xpReward.toString();
  const essenceInput = getElement<HTMLInputElement>('quest-essence-reward');
  if (essenceInput) essenceInput.value = quest.essenceReward.toString();
  const currencyInput = getElement<HTMLInputElement>('quest-currency-reward');
  if (currencyInput) currencyInput.value = quest.currencyReward.toString();

  renderItemRewards(quest.itemRewards);
  renderFactionRewards(quest.factionRewards);

  // Dialogue tab (dispatch input event to update color previews)
  const denialInput = getElement<HTMLTextAreaElement>('quest-denial-dialogue');
  if (denialInput) { denialInput.value = quest.denialDialogue || ''; denialInput.dispatchEvent(new Event('input')); }
  const completedInput = getElement<HTMLTextAreaElement>('quest-completed-dialogue');
  if (completedInput) { completedInput.value = quest.completedDialogue || ''; completedInput.dispatchEvent(new Event('input')); }

  // Steps tab
  renderSteps(quest.steps);

  updatePreview();
  renderQuestList();
}

// ============================================================================
// Steps Management
// ============================================================================

function renderSteps(steps: QuestStep[]): void {
  const container = document.getElementById('steps-container');
  if (!container) return;

  // Destroy SearchableSelect instances on existing cards to prevent listener leaks
  container.querySelectorAll('.step-card').forEach(card => {
    const select = (card as HTMLElement & { _npcSelect?: SearchableSelect })._npcSelect;
    if (select) select.destroy();
  });

  container.innerHTML = '';

  for (let i = 0; i < steps.length; i++) {
    container.appendChild(createStepCard(steps[i], i));
  }
}

function createStepCard(step: QuestStep, index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'step-card';
  card.dataset.index = index.toString();
  // Preserve step-level rewards that have no UI fields
  card.dataset.stepItemRewards = JSON.stringify(step.stepItemRewards || []);
  card.dataset.stepFactionRewards = JSON.stringify(step.stepFactionRewards || []);

  card.innerHTML = `
    <div class="step-card-header">
      <span class="step-number">Step ${index + 1}</span>
      <div class="step-actions">
        <button type="button" class="btn-move-up" title="Move Up">&uarr;</button>
        <button type="button" class="btn-move-down" title="Move Down">&darr;</button>
        <button type="button" class="btn-remove" title="Remove">Remove</button>
      </div>
    </div>
    <div class="step-field">
      <label>Description</label>
      <input type="text" class="step-description" value="${escapeHtml(step.description)}" placeholder="What the player must do..." />
    </div>
    <div class="step-row">
      <div class="step-field">
        <label>Trigger Type</label>
        <select class="step-trigger-type">
          <option value="talk" ${step.triggerType === 'talk' ? 'selected' : ''}>Talk</option>
          <option value="kill" ${step.triggerType === 'kill' ? 'selected' : ''}>Kill</option>
          <option value="visit" ${step.triggerType === 'visit' ? 'selected' : ''}>Visit</option>
        </select>
      </div>
      <div class="step-field">
        <label>Required Count</label>
        <input type="number" class="step-required-count" min="1" value="${step.requiredCount}" />
      </div>
    </div>
    <div class="step-row-3">
      <div class="step-field">
        <label>NPC</label>
        <div class="step-npc-container"></div>
      </div>
      <div class="step-field">
        <label>Visit Room ID <span class="hint-inline">(room player must enter)</span></label>
        <input type="number" class="step-room-id" min="1" value="${step.triggerRoomId ?? ''}" placeholder="None" />
      </div>
      <div class="step-field">
        <label>Required Item <span class="hint-inline">(must have when talking)</span></label>
        <input type="number" class="step-item-id" min="1" value="${step.triggerItemTemplateId ?? ''}" placeholder="Item template ID" />
      </div>
    </div>
    <div class="step-row">
      <div class="step-field">
        <label>Trigger Text</label>
        <input type="text" class="step-trigger-text" value="${escapeHtml(step.triggerText || '')}" placeholder="Keyword for talk trigger" />
      </div>
      <div class="step-field step-field-toggle">
        <label>&nbsp;</label>
        <label class="toggle-label">
          <input type="checkbox" class="step-consume-item" ${step.consumeItem ? 'checked' : ''} />
          <span class="toggle-track"></span>
          Consume Item
        </label>
      </div>
    </div>
    <div class="step-field">
      <label>Completion Dialogue <span class="hint-inline">(shown to player when step completes, supports {color} tags)</span></label>
      <textarea class="step-completion-dialogue" rows="5" placeholder="The narrative text the player sees when this step completes. Use {boldCyan}NPC names{/} and {boldYellow}trigger phrases{/} to highlight key info.">${escapeHtml(step.completionDialogue || '')}</textarea>
    </div>
    <div class="step-field">
      <label>In-Progress Dialogue <span class="hint-inline">(NPC says if player hasn't met requirements yet)</span></label>
      <textarea class="step-in-progress-dialogue" rows="3" placeholder="e.g., Have you found the crystal key yet?">${escapeHtml(step.inProgressDialogue || '')}</textarea>
    </div>
    <div class="step-row-3">
      <div class="step-field">
        <label>Step XP</label>
        <input type="number" class="step-xp" min="0" value="${step.stepXpReward}" />
      </div>
      <div class="step-field">
        <label>Step Essence</label>
        <input type="number" class="step-essence" min="0" value="${step.stepEssenceReward}" />
      </div>
      <div class="step-field">
        <label>Step Currency</label>
        <input type="number" class="step-currency" min="0" value="${step.stepCurrencyReward}" />
      </div>
    </div>
  `;

  // Event listeners
  card.querySelector('.btn-move-up')?.addEventListener('click', () => moveStep(index, -1));
  card.querySelector('.btn-move-down')?.addEventListener('click', () => moveStep(index, 1));
  card.querySelector('.btn-remove')?.addEventListener('click', () => removeStep(index));

  // Initialize NPC search dropdown for this step
  const npcContainer = card.querySelector('.step-npc-container') as HTMLElement;
  if (npcContainer) {
    const stepNpcSelect = new SearchableSelect({
      container: npcContainer,
      placeholder: 'Search NPCs...',
      options: npcOptions,
    });
    if (step.triggerNpcId) {
      stepNpcSelect.setValue(String(step.triggerNpcId));
    }
    // Store reference on the card for retrieval in getStepsFromForm
    (card as HTMLElement & { _npcSelect?: SearchableSelect })._npcSelect = stepNpcSelect;
  }

  // Attach color previews to step dialogue textareas
  const completionTextarea = card.querySelector('.step-completion-dialogue') as HTMLTextAreaElement;
  if (completionTextarea) attachColorPreview(completionTextarea);
  const inProgressTextarea = card.querySelector('.step-in-progress-dialogue') as HTMLTextAreaElement;
  if (inProgressTextarea) attachColorPreview(inProgressTextarea);

  return card;
}

function getStepsFromForm(): QuestStep[] {
  const container = document.getElementById('steps-container');
  if (!container) return [];

  const cards = container.querySelectorAll('.step-card');
  const steps: QuestStep[] = [];

  cards.forEach((card, i) => {
    const el = card as HTMLElement;
    steps.push({
      stepOrder: i + 1,
      description: (el.querySelector('.step-description') as HTMLInputElement)?.value || '',
      triggerType: (el.querySelector('.step-trigger-type') as HTMLSelectElement)?.value || 'talk',
      requiredCount: parseInt((el.querySelector('.step-required-count') as HTMLInputElement)?.value) || 1,
      triggerNpcId: parseIntOrNull((el as HTMLElement & { _npcSelect?: SearchableSelect })._npcSelect?.getValue()),
      triggerRoomId: parseIntOrNull((el.querySelector('.step-room-id') as HTMLInputElement)?.value),
      triggerItemTemplateId: parseIntOrNull((el.querySelector('.step-item-id') as HTMLInputElement)?.value),
      triggerText: (el.querySelector('.step-trigger-text') as HTMLInputElement)?.value?.trim() || null,
      consumeItem: (el.querySelector('.step-consume-item') as HTMLInputElement)?.checked ?? true,
      completionDialogue: (el.querySelector('.step-completion-dialogue') as HTMLTextAreaElement)?.value?.trim() || null,
      inProgressDialogue: (el.querySelector('.step-in-progress-dialogue') as HTMLTextAreaElement)?.value?.trim() || null,
      stepXpReward: parseInt((el.querySelector('.step-xp') as HTMLInputElement)?.value) || 0,
      stepEssenceReward: parseInt((el.querySelector('.step-essence') as HTMLInputElement)?.value) || 0,
      stepCurrencyReward: parseInt((el.querySelector('.step-currency') as HTMLInputElement)?.value) || 0,
      stepItemRewards: JSON.parse(el.dataset.stepItemRewards || '[]'),
      stepFactionRewards: JSON.parse(el.dataset.stepFactionRewards || '[]'),
    });
  });

  return steps;
}

function addStep(): void {
  const steps = getStepsFromForm();
  steps.push({
    stepOrder: steps.length + 1,
    description: '',
    triggerType: 'talk',
    requiredCount: 1,
    triggerNpcId: null,
    triggerRoomId: null,
    triggerItemTemplateId: null,
    triggerText: null,
    consumeItem: true,
    completionDialogue: null,
    inProgressDialogue: null,
    stepXpReward: 0,
    stepEssenceReward: 0,
    stepCurrencyReward: 0,
    stepItemRewards: [],
    stepFactionRewards: [],
  });
  renderSteps(steps);
}

function removeStep(index: number): void {
  const steps = getStepsFromForm();
  steps.splice(index, 1);
  renderSteps(steps);
}

function moveStep(index: number, direction: number): void {
  const steps = getStepsFromForm();
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= steps.length) return;
  [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
  renderSteps(steps);
}

// ============================================================================
// Item & Faction Reward Management
// ============================================================================

function renderItemRewards(rewards: QuestItemReward[]): void {
  const container = document.getElementById('item-rewards-container');
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < rewards.length; i++) {
    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
      <div class="step-field">
        <label>Item Template ID</label>
        <input type="number" class="reward-item-id" min="1" value="${rewards[i].itemTemplateId}" />
      </div>
      <div class="step-field">
        <label>Quantity</label>
        <input type="number" class="reward-item-qty" min="1" value="${rewards[i].quantity}" />
      </div>
      <div class="step-field" style="align-self: end;">
        <button type="button" class="btn-remove-reward step-actions" style="padding: 4px 8px;">Remove</button>
      </div>
    `;
    row.querySelector('.btn-remove-reward')?.addEventListener('click', () => {
      row.remove();
    });
    container.appendChild(row);
  }
}

function getItemRewardsFromForm(): QuestItemReward[] {
  const container = document.getElementById('item-rewards-container');
  if (!container) return [];
  const rows = container.querySelectorAll('.step-row');
  const rewards: QuestItemReward[] = [];
  rows.forEach(row => {
    const id = parseInt((row.querySelector('.reward-item-id') as HTMLInputElement)?.value);
    const qty = parseInt((row.querySelector('.reward-item-qty') as HTMLInputElement)?.value) || 1;
    if (!isNaN(id) && id > 0) rewards.push({ itemTemplateId: id, quantity: qty });
  });
  return rewards;
}

function addItemReward(): void {
  const rewards = getItemRewardsFromForm();
  rewards.push({ itemTemplateId: 1, quantity: 1 });
  renderItemRewards(rewards);
}

function renderFactionRewards(rewards: QuestFactionReward[]): void {
  const container = document.getElementById('faction-rewards-container');
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < rewards.length; i++) {
    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
      <div class="step-field">
        <label>Faction ID</label>
        <input type="number" class="reward-faction-id" min="1" value="${rewards[i].factionId}" />
      </div>
      <div class="step-field">
        <label>Reputation Amount</label>
        <input type="number" class="reward-faction-amount" value="${rewards[i].amount}" />
      </div>
      <div class="step-field" style="align-self: end;">
        <button type="button" class="btn-remove-reward step-actions" style="padding: 4px 8px;">Remove</button>
      </div>
    `;
    row.querySelector('.btn-remove-reward')?.addEventListener('click', () => {
      row.remove();
    });
    container.appendChild(row);
  }
}

function getFactionRewardsFromForm(): QuestFactionReward[] {
  const container = document.getElementById('faction-rewards-container');
  if (!container) return [];
  const rows = container.querySelectorAll('.step-row');
  const rewards: QuestFactionReward[] = [];
  rows.forEach(row => {
    const id = parseInt((row.querySelector('.reward-faction-id') as HTMLInputElement)?.value);
    const amount = parseInt((row.querySelector('.reward-faction-amount') as HTMLInputElement)?.value) || 0;
    if (!isNaN(id) && id > 0) rewards.push({ factionId: id, amount });
  });
  return rewards;
}

function addFactionReward(): void {
  const rewards = getFactionRewardsFromForm();
  rewards.push({ factionId: 1, amount: 10 });
  renderFactionRewards(rewards);
}

// ============================================================================
// Preview
// ============================================================================

function updatePreview(): void {
  const content = document.getElementById('preview-content');
  if (!content || !selectedQuestId) return;
  const quest = quests.find(q => q.id === selectedQuestId);
  if (!quest) return;

  let stepsHtml = '';
  if (quest.steps.length > 0) {
    stepsHtml = `
      <div class="preview-section">
        <div class="preview-section-title">Steps</div>
        ${quest.steps.map(s => `
          <div class="preview-step">
            <span class="step-num">${s.stepOrder}.</span> ${escapeHtml(s.description)}
            <span class="trigger-type">[${s.triggerType}${s.requiredCount > 1 ? ` x${s.requiredCount}` : ''}]</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  let rewardsHtml = '';
  const rewardParts: string[] = [];
  if (quest.xpReward > 0) rewardParts.push(`${quest.xpReward} XP`);
  if (quest.essenceReward > 0) rewardParts.push(`${quest.essenceReward} Essence`);
  if (quest.currencyReward > 0) rewardParts.push(`${quest.currencyReward} copper`);
  if (quest.itemRewards.length > 0) rewardParts.push(`${quest.itemRewards.length} item(s)`);
  if (quest.factionRewards.length > 0) rewardParts.push(`${quest.factionRewards.length} faction(s)`);
  if (rewardParts.length > 0) {
    rewardsHtml = `
      <div class="preview-section">
        <div class="preview-section-title">Rewards</div>
        <div class="preview-stat"><span class="value">${rewardParts.join(', ')}</span></div>
      </div>
    `;
  }

  let reqHtml = '';
  const reqParts: string[] = [];
  if (quest.minLevel > 1) reqParts.push(`Level ${quest.minLevel}+`);
  if (quest.maxLevel) reqParts.push(`Level &le; ${quest.maxLevel}`);
  if (quest.requiredRaces?.length) reqParts.push(`Races: ${escapeHtml(quest.requiredRaces.join(', '))}`);
  if (quest.requiredClasses?.length) reqParts.push(`Classes: ${escapeHtml(quest.requiredClasses.join(', '))}`);
  if (quest.requiredQuestIds.length > 0) reqParts.push(`Prereqs: ${quest.requiredQuestIds.join(', ')}`);
  if (reqParts.length > 0) {
    reqHtml = `
      <div class="preview-section">
        <div class="preview-section-title">Requirements</div>
        ${reqParts.map(r => `<div class="preview-stat"><span class="value">${r}</span></div>`).join('')}
      </div>
    `;
  }

  content.innerHTML = `
    <div class="preview-name">${escapeHtml(quest.name)}</div>
    <div class="preview-section">
      <div class="preview-stat"><span class="label">Tag:</span> <span class="value">${escapeHtml(quest.tag)}</span></div>
      <div class="preview-stat"><span class="label">ID:</span> <span class="value">${quest.id}</span></div>
      <div class="preview-stat"><span class="label">Status:</span> <span class="value">${quest.enabled ? 'Enabled' : 'Disabled'}</span></div>
      <div class="preview-stat"><span class="label">Steps:</span> <span class="value">${quest.steps.length}</span></div>
      ${quest.questGiverNpcId ? `<div class="preview-stat"><span class="label">Quest Giver:</span> <span class="value">${escapeHtml(getNpcLabel(quest.questGiverNpcId))}</span></div>` : ''}
      ${quest.questFlag ? `<div class="preview-stat"><span class="label">Flag:</span> <span class="value">${escapeHtml(quest.questFlag)}</span></div>` : ''}
    </div>
    ${reqHtml}
    ${stepsHtml}
    ${rewardsHtml}
    ${quest.description ? `<div class="preview-section"><div class="preview-section-title">Description</div><div style="color: #ccc; font-size: 0.85rem;">${escapeHtml(quest.description)}</div></div>` : ''}
  `;
}

// ============================================================================
// CRUD Operations
// ============================================================================

function collectFormData(): Record<string, unknown> {
  const maxLevel = parseInt(getElement<HTMLInputElement>('quest-max-level')?.value || '0');
  return {
    tag: getElement<HTMLInputElement>('quest-tag')?.value?.trim() || '',
    name: getElement<HTMLInputElement>('quest-name')?.value?.trim() || '',
    description: getElement<HTMLTextAreaElement>('quest-description')?.value?.trim() || null,
    questGiverNpcId: parseIntOrNull(questGiverSelect?.getValue()),
    sortOrder: parseInt(getElement<HTMLInputElement>('quest-sort-order')?.value || '0') || 0,
    questFlag: getElement<HTMLInputElement>('quest-flag')?.value?.trim() || null,
    enabled: getElement<HTMLInputElement>('quest-enabled')?.checked ?? true,
    minLevel: parseInt(getElement<HTMLInputElement>('quest-min-level')?.value || '1') || 1,
    maxLevel: maxLevel > 0 ? maxLevel : null,
    requiredRaces: parseCommaSeparated(getElement<HTMLInputElement>('quest-required-races')?.value),
    requiredClasses: parseCommaSeparated(getElement<HTMLInputElement>('quest-required-classes')?.value),
    requiredFactionId: parseIntOrNull(getElement<HTMLInputElement>('quest-required-faction')?.value),
    requiredFactionMin: parseIntOrNull(getElement<HTMLInputElement>('quest-required-faction-min')?.value),
    requiredFactionMax: parseIntOrNull(getElement<HTMLInputElement>('quest-required-faction-max')?.value),
    requiredQuestIds: parseCommaNumbers(getElement<HTMLInputElement>('quest-required-quests')?.value),
    xpReward: parseInt(getElement<HTMLInputElement>('quest-xp-reward')?.value || '0') || 0,
    essenceReward: parseInt(getElement<HTMLInputElement>('quest-essence-reward')?.value || '0') || 0,
    currencyReward: parseInt(getElement<HTMLInputElement>('quest-currency-reward')?.value || '0') || 0,
    itemRewards: getItemRewardsFromForm(),
    factionRewards: getFactionRewardsFromForm(),
    denialDialogue: getElement<HTMLTextAreaElement>('quest-denial-dialogue')?.value?.trim() || null,
    completedDialogue: getElement<HTMLTextAreaElement>('quest-completed-dialogue')?.value?.trim() || null,
    steps: getStepsFromForm(),
  };
}

async function createQuest(): Promise<void> {
  try {
    const response = await fetch('/api/quests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Quest', tag: '' }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to create quest', 'error');
      return;
    }
    await fetchQuests();
    selectQuest(data.quest.id);
    showToast('Quest created', 'success');
  } catch (error) {
    console.error('Failed to create quest:', error);
    showToast('Failed to create quest', 'error');
  }
}

async function saveQuest(): Promise<void> {
  if (!selectedQuestId) return;
  const formData = collectFormData();

  if (!formData.name || (formData.name as string).length === 0) {
    showToast('Name is required', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/quests/${selectedQuestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to save quest', 'error');
      return;
    }
    await fetchQuests();
    selectQuest(selectedQuestId);
    showToast('Quest saved', 'success');
  } catch (error) {
    console.error('Failed to save quest:', error);
    showToast('Failed to save quest', 'error');
  }
}

async function deleteQuest(): Promise<void> {
  if (!selectedQuestId) return;
  if (!await showConfirm('Delete this quest? This cannot be undone.', { dangerous: true })) return;

  try {
    const response = await fetch(`/api/quests/${selectedQuestId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to delete quest', 'error');
      return;
    }
    selectedQuestId = null;
    const noSelected = getElement<HTMLElement>('no-quest-selected');
    const form = getElement<HTMLFormElement>('quest-form');
    if (noSelected) noSelected.style.display = 'block';
    if (form) form.style.display = 'none';
    await fetchQuests();
    showToast('Quest deleted', 'success');
  } catch (error) {
    console.error('Failed to delete quest:', error);
    showToast('Failed to delete quest', 'error');
  }
}

async function duplicateQuest(): Promise<void> {
  if (!selectedQuestId) return;
  const quest = quests.find(q => q.id === selectedQuestId);
  if (!quest) return;

  const formData = collectFormData();
  formData.tag = (formData.tag as string) + '_copy';
  formData.name = (formData.name as string) + ' (Copy)';
  const steps = formData.steps as QuestStep[];
  delete formData.steps;

  try {
    // Create the quest (POST only creates the quest record, not steps)
    const response = await fetch('/api/quests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Failed to duplicate quest', 'error');
      return;
    }

    // Save steps and full data to the new quest
    if (steps.length > 0) {
      await fetch(`/api/quests/${data.quest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, steps }),
      });
    }

    await fetchQuests();
    selectQuest(data.quest.id);
    showToast('Quest duplicated', 'success');
  } catch (error) {
    console.error('Failed to duplicate quest:', error);
    showToast('Failed to duplicate quest', 'error');
  }
}

// ============================================================================
// Import / Export
// ============================================================================

async function exportQuests(): Promise<void> {
  try {
    const response = await fetch('/api/quests');
    const data = await response.json();
    if (!data.success) {
      showToast('Export failed', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(data.quests, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quests.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Quests exported', 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed', 'error');
  }
}

function showImportModal(): void {
  const modal = document.getElementById('import-modal');
  if (modal) modal.style.display = 'flex';
}

function hideImportModal(): void {
  const modal = document.getElementById('import-modal');
  if (modal) modal.style.display = 'none';
}

async function doImport(): Promise<void> {
  const fileInput = getElement<HTMLInputElement>('import-file');
  const mergeInput = getElement<HTMLInputElement>('import-merge');
  if (!fileInput?.files?.length) {
    showToast('Select a file first', 'error');
    return;
  }

  try {
    const text = await fileInput.files[0].text();
    const importData = JSON.parse(text);
    const questsArray = Array.isArray(importData) ? importData : importData.quests;
    if (!Array.isArray(questsArray)) {
      showToast('Invalid file format', 'error');
      return;
    }

    const response = await fetch('/api/quests/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quests: questsArray, merge: mergeInput?.checked ?? true }),
    });
    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Import failed', 'error');
      return;
    }
    hideImportModal();
    await fetchQuests();
    showToast(`Imported: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped`, 'success', 5000);
  } catch (error) {
    console.error('Import failed:', error);
    showToast('Import failed', 'error');
  }
}

// ============================================================================
// Tabs
// ============================================================================

function setupTabs(): void {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = (btn as HTMLElement).dataset.tab;
      if (!tabName) return;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const tabContent = document.getElementById(`tab-${tabName}`);
      if (tabContent) tabContent.classList.add('active');
    });
  });
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  renderNav({ activePage: 'quest-editor', helpDoc: 'Quest_System_Guide.md' });
  const auth = await initAuth('developer');
  if (!auth) return;

  await fetchNpcs();

  // Initialize quest giver NPC search dropdown
  const giverContainer = document.getElementById('quest-giver-npc-container');
  if (giverContainer) {
    questGiverSelect = new SearchableSelect({
      container: giverContainer,
      placeholder: 'Search NPCs...',
      options: npcOptions,
    });
  }

  await fetchQuests();

  const addListener = (id: string, event: string, handler: EventListener) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  };

  addListener('new-quest-btn', 'click', createQuest);
  addListener('quest-form', 'submit', (e) => { e.preventDefault(); saveQuest(); });
  addListener('delete-quest-btn', 'click', deleteQuest);
  addListener('duplicate-quest-btn', 'click', duplicateQuest);
  addListener('search-input', 'input', renderQuestList);
  addListener('add-step-btn', 'click', addStep);
  addListener('add-item-reward-btn', 'click', addItemReward);
  addListener('add-faction-reward-btn', 'click', addFactionReward);
  addListener('import-btn', 'click', showImportModal);
  addListener('export-btn', 'click', exportQuests);
  addListener('close-import-modal', 'click', hideImportModal);
  addListener('do-import-btn', 'click', doImport);

  setupTabs();

  // Attach color previews to dialogue tab textareas
  const denialTextarea = getElement<HTMLTextAreaElement>('quest-denial-dialogue');
  if (denialTextarea) attachColorPreview(denialTextarea);
  const completedTextarea = getElement<HTMLTextAreaElement>('quest-completed-dialogue');
  if (completedTextarea) attachColorPreview(completedTextarea);
});

})();
