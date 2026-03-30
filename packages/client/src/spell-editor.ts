/**
 * Spell Editor — three-panel with type-specific effects, SearchableSelect for
 * status effects, dynamic class buttons, NPC reverse lookup.
 */

import { Spell, SpellType, SpellTargetType, SpellScalingStat, calculateSpellcasting } from '@koa/shared';
import { initAuth, ListPanel, SearchableSelect, setupTabs, showToast, showConfirm, showPromptFields, escapeHtml } from './components/index.js';
import type { SelectOption } from './components/index.js';
import { renderNav } from './components/nav.js';

interface ClassDef {
  id: string;
  displayName: string;
}

interface NpcTemplate {
  id: number;
  name: string;
  level: number;
  spells?: Array<{ spellId: number }>;
}

interface StatusEffectDef {
  id: string;
  name: string;
  category: string;
}

(async function () {
  renderNav({ activePage: 'spell-editor', helpDoc: 'Spell_and_Effects_Guide.md' });
  const auth = await initAuth('developer');
  if (!auth) return;

  // ============================================================================
  // State
  // ============================================================================

  let spells: Spell[] = [];
  let classDefs: ClassDef[] = [];
  let npcTemplates: NpcTemplate[] = [];
  let statusEffects: StatusEffectDef[] = [];
  let selectedSpellId: number | null = null;
  let selectedClasses: Set<string> = new Set();

  // ============================================================================
  // DOM
  // ============================================================================

  const spellForm = document.getElementById('spell-form') as HTMLFormElement;
  const noSpellSelected = document.getElementById('no-spell-selected') as HTMLDivElement;
  const formTitle = document.getElementById('spell-form-title') as HTMLHeadingElement;
  const idDisplay = document.getElementById('spell-id-display') as HTMLSpanElement;
  const spellCount = document.getElementById('spell-count') as HTMLSpanElement;
  const previewContent = document.getElementById('preview-content') as HTMLDivElement;
  const npcRefContent = document.getElementById('npc-ref-content') as HTMLDivElement;
  const classButtonsContainer = document.getElementById('class-buttons') as HTMLDivElement;

  // Basic
  const nameInput = document.getElementById('spell-name') as HTMLInputElement;
  const mnemonicInput = document.getElementById('spell-mnemonic') as HTMLInputElement;
  const descriptionInput = document.getElementById('spell-description') as HTMLTextAreaElement;
  const spellTypeSelect = document.getElementById('spell-type') as HTMLSelectElement;
  const targetTypeSelect = document.getElementById('spell-target-type') as HTMLSelectElement;
  const manaCostInput = document.getElementById('spell-mana-cost') as HTMLInputElement;
  const castDifficultyInput = document.getElementById('spell-cast-difficulty') as HTMLInputElement;
  const fizzleMessageInput = document.getElementById('spell-fizzle-message') as HTMLInputElement;
  const fizzleMessageRoomInput = document.getElementById('spell-fizzle-message-room') as HTMLInputElement;
  const telegraphInput = document.getElementById('spell-telegraph-message') as HTMLInputElement;

  // Effects - offensive
  const minDamageInput = document.getElementById('spell-min-damage') as HTMLInputElement;
  const maxDamageInput = document.getElementById('spell-max-damage') as HTMLInputElement;
  const hitsPerCastInput = document.getElementById('spell-hits-per-cast') as HTMLInputElement;
  const dmgScalingStatSelect = document.getElementById('spell-damage-scaling-stat') as HTMLSelectElement;
  const dmgScalingFactorInput = document.getElementById('spell-damage-scaling-factor') as HTMLInputElement;

  // Effects - healing
  const minHealingInput = document.getElementById('spell-min-healing') as HTMLInputElement;
  const maxHealingInput = document.getElementById('spell-max-healing') as HTMLInputElement;
  const healScalingStatSelect = document.getElementById('spell-healing-scaling-stat') as HTMLSelectElement;
  const healScalingFactorInput = document.getElementById('spell-healing-scaling-factor') as HTMLInputElement;

  // Effects - status
  const effectDurationInput = document.getElementById('spell-effect-duration') as HTMLInputElement;
  const saveStatSelect = document.getElementById('spell-save-stat') as HTMLSelectElement;
  const saveDifficultyInput = document.getElementById('spell-save-difficulty') as HTMLInputElement;
  const saveDifficultyRow = document.getElementById('save-difficulty-row') as HTMLDivElement;

  // Effects - scaling
  const scalingPerLevelInput = document.getElementById('spell-scaling-per-level') as HTMLInputElement;
  const maxScalingLevelInput = document.getElementById('spell-max-scaling-level') as HTMLInputElement;

  // Effects - messages
  const hitMsgSelfInput = document.getElementById('spell-hit-msg-self') as HTMLInputElement;
  const hitMsgTargetInput = document.getElementById('spell-hit-msg-target') as HTMLInputElement;
  const hitMsgRoomInput = document.getElementById('spell-hit-msg-room') as HTMLInputElement;

  // Requirements
  const levelRequiredInput = document.getElementById('spell-level-required') as HTMLInputElement;

  // Effect type sections
  const sectionOffensive = document.getElementById('section-offensive') as HTMLDivElement;
  const sectionHealing = document.getElementById('section-healing') as HTMLDivElement;
  const sectionStatus = document.getElementById('section-status') as HTMLDivElement;
  const sectionUtility = document.getElementById('section-utility') as HTMLDivElement;
  const sectionScaling = document.getElementById('section-scaling') as HTMLDivElement;

  // ============================================================================
  // List Panel
  // ============================================================================

  const listPanel = new ListPanel<Spell>({
    listElement: document.getElementById('spell-list')!,
    searchInput: document.getElementById('search-input') as HTMLInputElement,
    filterSelect: document.getElementById('type-filter') as HTMLSelectElement,
    onSelect: (item) => selectSpell(item.id),
    getId: (item) => item.id,
    renderItem: (item) => `
      <div class="spell-name">${escapeHtml(item.name)}</div>
      <div class="spell-meta">
        <span class="spell-mnemonic">${escapeHtml(item.mnemonic)}</span>
        <span class="type-badge ${item.spellType}">${escapeHtml(item.spellType)}</span>
        <span class="spell-level">Lv ${item.levelRequired}</span>
      </div>
    `,
    filterFn: (item, search) =>
      item.name.toLowerCase().includes(search) ||
      item.mnemonic.toLowerCase().includes(search) ||
      item.description.toLowerCase().includes(search),
    dropdownFilterFn: (item, value) => item.spellType === value,
    sortFn: (a, b) => a.levelRequired - b.levelRequired || a.name.localeCompare(b.name),
    onRender: updateCount,
  });

  setupTabs({ container: spellForm });

  // ============================================================================
  // SearchableSelect for Status Effect
  // ============================================================================

  let statusEffectSelect: SearchableSelect;

  function getEffectOptions(categoryFilter?: string): SelectOption[] {
    let filtered = statusEffects;
    if (categoryFilter) {
      filtered = filtered.filter(e => e.category === categoryFilter);
    }
    return [
      { value: '', label: '(None)', detail: 'No status effect' },
      ...filtered.map(e => ({
        value: e.id,
        label: e.name,
        group: e.category,
        detail: e.id,
      })),
    ];
  }

  function initStatusEffectSelect(): void {
    statusEffectSelect = new SearchableSelect({
      container: document.getElementById('status-effect-select-container')!,
      placeholder: 'Search effects...',
      options: getEffectOptions(),
      onChange: () => {},
    });

    document.getElementById('effect-category-filter')?.addEventListener('change', (e) => {
      const filter = (e.target as HTMLSelectElement).value;
      const currentValue = statusEffectSelect.getValue();
      statusEffectSelect.setOptions(getEffectOptions(filter || undefined));
      if (currentValue) statusEffectSelect.setValue(currentValue);
    });
  }

  // ============================================================================
  // API
  // ============================================================================

  async function fetchSpells(): Promise<void> {
    try {
      const res = await fetch('/api/spells', { credentials: 'include' });
      if (!res.ok) {
        showToast('Failed to load spells', 'error');
        return;
      }
      const data = await res.json();
      if (data.success) {
        spells = data.spells || [];
        listPanel.setItems(spells);
        listPanel.setSelected(selectedSpellId);
      } else {
        showToast('Failed to load spells', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch spells:', error);
      showToast('Failed to load spells', 'error');
    }
  }

  async function fetchClasses(): Promise<void> {
    try {
      const res = await fetch('/api/progression/classes', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        classDefs = (data.classes || []).map((c: Record<string, unknown>) => ({
          id: (c.class_id || c.id) as string,
          displayName: (c.display_name || c.displayName || c.class_id || c.id) as string,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      showToast('Failed to load classes', 'error');
    }
  }

  async function fetchNpcTemplates(): Promise<void> {
    try {
      const res = await fetch('/api/npcs', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        npcTemplates = data.templates || [];
      }
    } catch (error) {
      console.error('Failed to fetch NPCs:', error);
      showToast('Failed to load NPCs', 'error');
    }
  }

  async function fetchStatusEffects(): Promise<void> {
    try {
      const res = await fetch('/api/status-effects', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        statusEffects = (data.definitions || []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          name: e.name as string,
          category: e.category as string,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch status effects:', error);
      showToast('Failed to load status effects', 'error');
    }
  }

  // ============================================================================
  // Selection
  // ============================================================================

  function selectSpell(id: number): void {
    const spell = spells.find(s => s.id === id);
    if (!spell) return;

    selectedSpellId = id;
    noSpellSelected.style.display = 'none';
    spellForm.style.display = 'block';
    formTitle.textContent = 'Edit Spell';
    idDisplay.textContent = `ID: ${spell.id}`;

    // Basic
    nameInput.value = spell.name;
    mnemonicInput.value = spell.mnemonic;
    descriptionInput.value = spell.description || '';
    spellTypeSelect.value = spell.spellType;
    targetTypeSelect.value = spell.targetType;
    manaCostInput.value = String(spell.manaCost);
    castDifficultyInput.value = String(spell.castDifficulty || 0);
    fizzleMessageInput.value = spell.fizzleMessage || '';
    fizzleMessageRoomInput.value = spell.fizzleMessageRoom || '';
    telegraphInput.value = spell.telegraphMessage || '';

    // Offensive
    minDamageInput.value = String(spell.minDamage ?? 0);
    maxDamageInput.value = String(spell.maxDamage ?? 0);
    hitsPerCastInput.value = String(spell.hitsPerCast ?? 1);
    dmgScalingStatSelect.value = spell.damageScalingStat || 'none';
    dmgScalingFactorInput.value = String((spell.damageScalingFactor ?? 0) * 100);

    // Healing
    minHealingInput.value = String(spell.minHealing ?? 0);
    maxHealingInput.value = String(spell.maxHealing ?? 0);
    healScalingStatSelect.value = spell.healingScalingStat || 'none';
    healScalingFactorInput.value = String((spell.healingScalingFactor ?? 0) * 100);

    // Status effect
    const categoryFilter = document.getElementById('effect-category-filter') as HTMLSelectElement;
    if (categoryFilter) {
      categoryFilter.value = '';
      statusEffectSelect.setOptions(getEffectOptions());
    }
    statusEffectSelect.setValue(spell.statusEffect || '');
    effectDurationInput.value = String(spell.effectDuration ?? 0);
    saveStatSelect.value = spell.saveStat || 'none';
    saveDifficultyInput.value = String(spell.saveDifficulty || 0);

    // Scaling
    scalingPerLevelInput.value = String((spell.scalingPerLevel ?? 0) * 100);
    maxScalingLevelInput.value = String(spell.maxScalingLevel ?? 0);

    // Messages
    hitMsgSelfInput.value = spell.hitMessageSelf || '';
    hitMsgTargetInput.value = spell.hitMessageTarget || '';
    hitMsgRoomInput.value = spell.hitMessageRoom || '';

    // Requirements
    levelRequiredInput.value = String(spell.levelRequired);
    selectedClasses = new Set(
      (spell.classRestrictions || [])
        .filter(c => c && c.trim())
        .map(c => {
          // Normalize: if a class_id matches (case-insensitive), use the canonical class_id
          const match = classDefs.find(cd => cd.id.toLowerCase() === c.toLowerCase());
          return match ? match.id : c;
        })
    );
    renderClassButtons();

    // Update UI
    updateEffectSections(spell.spellType);
    listPanel.setSelected(id);
    updatePreview(spell);
    updateSimulator();
    updateNpcReferences(id);
  }

  function clearForm(): void {
    selectedSpellId = null;
    noSpellSelected.style.display = 'flex';
    spellForm.style.display = 'none';
    idDisplay.textContent = '';
    previewContent.innerHTML = '<p class="hint">Select a spell to see preview</p>';
    npcRefContent.innerHTML = '<p class="hint">Select a spell to see NPC references</p>';
    listPanel.setSelected(null);
  }

  // ============================================================================
  // Effect Section Visibility
  // ============================================================================

  function updateEffectSections(spellType: string): void {
    sectionOffensive.style.display = spellType === 'offensive' ? 'block' : 'none';
    sectionHealing.style.display = spellType === 'healing' ? 'block' : 'none';
    sectionUtility.style.display = spellType === 'utility' ? 'block' : 'none';

    // Status effect shown for buff, debuff, and offensive (secondary effect)
    const showStatus = ['buff', 'debuff', 'offensive'].includes(spellType);
    sectionStatus.style.display = showStatus ? 'block' : 'none';

    // Save difficulty only for debuffs
    saveDifficultyRow.style.display = spellType === 'debuff' ? 'flex' : 'none';

    // Scaling shown for offensive and healing
    const showScaling = ['offensive', 'healing'].includes(spellType);
    sectionScaling.style.display = showScaling ? 'block' : 'none';
  }

  // ============================================================================
  // Class Buttons
  // ============================================================================

  function renderClassButtons(): void {
    classButtonsContainer.innerHTML = '';
    for (const cls of classDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `class-btn${selectedClasses.has(cls.id) ? ' selected' : ''}`;
      btn.textContent = cls.displayName;
      btn.addEventListener('click', () => {
        if (selectedClasses.has(cls.id)) {
          selectedClasses.delete(cls.id);
          btn.classList.remove('selected');
        } else {
          selectedClasses.add(cls.id);
          btn.classList.add('selected');
        }
      });
      classButtonsContainer.appendChild(btn);
    }
  }

  // ============================================================================
  // Gather Form Data
  // ============================================================================

  function gatherFormData(): Partial<Spell> {
    const scalingPerLevel = parseFloat(scalingPerLevelInput.value) || 0;
    const dmgFactor = parseFloat(dmgScalingFactorInput.value) || 0;
    const healFactor = parseFloat(healScalingFactorInput.value) || 0;
    const statusEffect = statusEffectSelect.getValue();

    return {
      name: nameInput.value.trim(),
      mnemonic: mnemonicInput.value.trim().toLowerCase(),
      description: descriptionInput.value.trim(),
      spellType: spellTypeSelect.value as SpellType,
      targetType: targetTypeSelect.value as SpellTargetType,
      manaCost: parseInt(manaCostInput.value) || 0,
      castDifficulty: parseInt(castDifficultyInput.value) || 0,
      fizzleMessage: fizzleMessageInput.value.trim() || null,
      fizzleMessageRoom: fizzleMessageRoomInput.value.trim() || null,
      telegraphMessage: telegraphInput.value.trim() || null,
      minDamage: Number.isFinite(parseInt(minDamageInput.value)) ? parseInt(minDamageInput.value) : null,
      maxDamage: Number.isFinite(parseInt(maxDamageInput.value)) ? parseInt(maxDamageInput.value) : null,
      hitsPerCast: parseInt(hitsPerCastInput.value) || 1,
      damageScalingStat: (dmgScalingStatSelect.value === 'none' ? null : dmgScalingStatSelect.value) as SpellScalingStat | null,
      damageScalingFactor: dmgFactor ? parseFloat((dmgFactor / 100).toFixed(4)) : null,
      minHealing: Number.isFinite(parseInt(minHealingInput.value)) ? parseInt(minHealingInput.value) : null,
      maxHealing: Number.isFinite(parseInt(maxHealingInput.value)) ? parseInt(maxHealingInput.value) : null,
      healingScalingStat: (healScalingStatSelect.value === 'none' ? null : healScalingStatSelect.value) as SpellScalingStat | null,
      healingScalingFactor: healFactor ? parseFloat((healFactor / 100).toFixed(4)) : null,
      statusEffect: statusEffect || null,
      effectDuration: parseInt(effectDurationInput.value) || null,
      saveStat: (saveStatSelect.value === 'none' ? null : saveStatSelect.value) as SpellScalingStat | null,
      saveDifficulty: parseInt(saveDifficultyInput.value) || 0,
      scalingPerLevel: scalingPerLevel ? parseFloat((scalingPerLevel / 100).toFixed(4)) : null,
      maxScalingLevel: parseInt(maxScalingLevelInput.value) || null,
      hitMessageSelf: hitMsgSelfInput.value.trim() || null,
      hitMessageTarget: hitMsgTargetInput.value.trim() || null,
      hitMessageRoom: hitMsgRoomInput.value.trim() || null,
      levelRequired: parseInt(levelRequiredInput.value) || 1,
      classRestrictions: [...new Set(Array.from(selectedClasses).filter(c => c && c.trim()))],
      isAttackSpell: spellTypeSelect.value === 'offensive',
    };
  }

  // ============================================================================
  // Preview
  // ============================================================================

  /**
   * Replicate server-side calculateSpellScaling for preview display.
   */
  function calcScaling(
    baseMin: number, baseMax: number,
    casterLevel: number, scalingPerLevel: number | null,
    statValue: number, scalingFactor: number | null,
    maxScalingLevel: number | null, spellLevelRequired: number,
  ): { min: number; max: number } {
    let bonus = 0;
    if (scalingPerLevel && scalingPerLevel > 0) {
      let levelsAbove = Math.max(0, casterLevel - spellLevelRequired);
      if (maxScalingLevel && maxScalingLevel > 0) levelsAbove = Math.min(levelsAbove, maxScalingLevel);
      bonus += levelsAbove * scalingPerLevel;
    }
    if (scalingFactor && scalingFactor > 0 && statValue > 0) {
      bonus += Math.floor(statValue / 10) * scalingFactor;
    }
    const multiplier = 1 + bonus;
    return {
      min: Math.max(1, Math.floor(baseMin * multiplier)),
      max: Math.max(1, Math.floor(baseMax * multiplier)),
    };
  }

  /**
   * Build a scaling preview table showing damage/healing at various levels and stat values.
   */
  function buildScalingTable(spell: Spell): string {
    const hasOffensive = spell.minDamage != null && spell.maxDamage != null && (spell.minDamage > 0 || spell.maxDamage > 0);
    const hasHealing = spell.minHealing != null && spell.maxHealing != null && (spell.minHealing > 0 || spell.maxHealing > 0);
    if (!hasOffensive && !hasHealing) return '';

    const hasLevelScaling = spell.scalingPerLevel != null && spell.scalingPerLevel > 0;
    const hasDmgStatScaling = hasOffensive && spell.damageScalingStat && spell.damageScalingStat !== 'none' && spell.damageScalingFactor;
    const hasHealStatScaling = hasHealing && spell.healingScalingStat && spell.healingScalingStat !== 'none' && spell.healingScalingFactor;
    if (!hasLevelScaling && !hasDmgStatScaling && !hasHealStatScaling) return '';

    const spellLvl = spell.levelRequired || 1;
    const maxCap = spell.maxScalingLevel || 0;

    // Determine which levels to show
    const levels: number[] = [];
    if (hasLevelScaling) {
      const topLevel = maxCap > 0 ? spellLvl + maxCap : spellLvl + 10;
      for (let lv = spellLvl; lv <= topLevel; lv++) levels.push(lv);
    } else {
      levels.push(spellLvl);
    }

    // Determine which stat values to show and how to label them
    const scalingStat = hasDmgStatScaling ? spell.damageScalingStat : (hasHealStatScaling ? spell.healingScalingStat : null);
    const isDualStat = scalingStat === 'intellect_wisdom';
    const hasStatScaling = hasDmgStatScaling || hasHealStatScaling;

    // For dual-stat, show avg(INT,WIS) values; label shows the split
    // Each entry: { statValue: number fed to calcScaling, label: string }
    const statEntries: { statValue: number; label: string }[] = [];
    if (hasStatScaling) {
      if (isDualStat) {
        // Show balanced INT/WIS splits: 40/40, 50/50, 60/60, 70/70, 80/80
        for (let s = 40; s <= 80; s += 10) {
          statEntries.push({ statValue: s, label: `INT ${s} / WIS ${s}` });
        }
      } else {
        for (let s = 40; s <= 120; s += 20) {
          statEntries.push({ statValue: s, label: `${scalingStat}: ${s}` });
        }
      }
    } else {
      statEntries.push({ statValue: 0, label: '' });
    }

    let html = `<div class="preview-section"><div class="preview-section-title">Scaling Preview</div>`;

    // One table per stat value
    for (const entry of statEntries) {
      if (statEntries.length > 1) {
        html += `<div class="scaling-stat-label">${entry.label}</div>`;
      }
      html += `<table class="scaling-table"><thead><tr><th>Lv</th>`;
      if (hasOffensive) html += `<th>Damage</th>`;
      if (hasHealing) html += `<th>Healing</th>`;
      html += `</tr></thead><tbody>`;

      for (const lv of levels) {
        html += `<tr><td>${lv}</td>`;
        if (hasOffensive) {
          const s = calcScaling(spell.minDamage!, spell.maxDamage!, lv,
            spell.scalingPerLevel, entry.statValue, spell.damageScalingFactor, maxCap, spellLvl);
          html += `<td>${s.min}-${s.max}</td>`;
        }
        if (hasHealing) {
          const s = calcScaling(spell.minHealing!, spell.maxHealing!, lv,
            spell.scalingPerLevel, entry.statValue, spell.healingScalingFactor, maxCap, spellLvl);
          html += `<td>${s.min}-${s.max}</td>`;
        }
        html += `</tr>`;
      }
      html += `</tbody></table>`;
    }

    html += `</div>`;
    return html;
  }

  // ============================================================================
  // Simulator
  // ============================================================================

  const simMagicLevel = document.getElementById('sim-magic-level') as HTMLSelectElement;
  const simMagicSchool = document.getElementById('sim-magic-school') as HTMLSelectElement;
  const simLevel = document.getElementById('sim-level') as HTMLInputElement;
  const simPrimaryStat = document.getElementById('sim-primary-stat') as HTMLInputElement;
  const simSecondaryStat = document.getElementById('sim-secondary-stat') as HTMLInputElement;
  const simSecondaryGroup = document.getElementById('sim-secondary-stat-group') as HTMLDivElement;
  const simRaceBaseStat = document.getElementById('sim-race-base-stat') as HTMLInputElement;
  const simRaceBaseSecondary = document.getElementById('sim-race-base-secondary') as HTMLInputElement;
  const simRaceBaseSecondaryGroup = document.getElementById('sim-race-base-secondary-group') as HTMLDivElement;
  const simEquipBonus = document.getElementById('sim-equip-bonus') as HTMLInputElement;
  const simResults = document.getElementById('sim-results') as HTMLDivElement;

  // Show/hide secondary stat fields for Druid
  simMagicSchool.addEventListener('change', () => {
    const isDruid = simMagicSchool.value === 'druid';
    simSecondaryGroup.style.display = isDruid ? '' : 'none';
    simRaceBaseSecondaryGroup.style.display = isDruid ? '' : 'none';
    updateSimulator();
  });

  // Recalculate on any input change
  for (const el of [simMagicLevel, simMagicSchool, simLevel, simPrimaryStat, simSecondaryStat, simRaceBaseStat, simRaceBaseSecondary, simEquipBonus]) {
    el.addEventListener('input', updateSimulator);
    el.addEventListener('change', updateSimulator);
  }

  // Also update simulator when spell form fields change (difficulty, damage, scaling, level)
  for (const el of [castDifficultyInput, levelRequiredInput, minDamageInput, maxDamageInput,
    hitsPerCastInput, dmgScalingStatSelect, dmgScalingFactorInput, minHealingInput, maxHealingInput,
    healScalingStatSelect, healScalingFactorInput, scalingPerLevelInput, maxScalingLevelInput]) {
    el.addEventListener('input', updateSimulator);
    el.addEventListener('change', updateSimulator);
  }

  /** Calculate effective success rate given difficulty and castChance (SP + difficulty) */
  function getSuccessRate(difficulty: number, castChance: number): number {
    if (difficulty >= 100) return 100;
    if (castChance <= 0) return 0;
    return Math.min(castChance, 97);
  }

  function updateSimulator(): void {
    const spell = getFormSpell();
    if (!spell) {
      simResults.innerHTML = '';
      return;
    }

    const magicLevel = parseInt(simMagicLevel.value) || 0;
    const magicSchool = simMagicSchool.value;
    const casterLevel = parseInt(simLevel.value) || 1;
    const primaryStat = parseInt(simPrimaryStat.value) || 40;
    const secondaryStat = parseInt(simSecondaryStat.value) || 40;
    const raceBase = parseInt(simRaceBaseStat.value) || 40;
    const raceBaseSecondary = parseInt(simRaceBaseSecondary.value) || 40;
    const equipBonus = parseInt(simEquipBonus.value) || 0;

    // Build stat objects for calculateSpellcasting
    const isDruid = magicSchool === 'druid';
    const stats = { intelligence: 40, wisdom: 40, charisma: 40 };
    const raceBaseStats: { intelligence?: number; wisdom?: number; charisma?: number } = {
      intelligence: 40, wisdom: 40, charisma: 40,
    };

    switch (magicSchool) {
      case 'mage':
        stats.intelligence = primaryStat;
        raceBaseStats.intelligence = raceBase;
        break;
      case 'priest':
      case 'kai':
        stats.wisdom = primaryStat;
        raceBaseStats.wisdom = raceBase;
        break;
      case 'bardic':
        stats.charisma = primaryStat;
        raceBaseStats.charisma = raceBase;
        break;
      case 'druid':
        stats.intelligence = primaryStat;
        stats.wisdom = secondaryStat;
        raceBaseStats.intelligence = raceBase;
        raceBaseStats.wisdom = raceBaseSecondary;
        break;
    }

    const sp = calculateSpellcasting(magicLevel, magicSchool, stats, raceBaseStats, casterLevel, equipBonus);

    // Cast success rate: roll 1-100, succeed if roll <= SP+difficulty, 3% auto-fizzle, difficulty >= 100 always succeeds
    const difficulty = spell.castDifficulty ?? 0;
    const castChance = sp + difficulty;
    const successRate = getSuccessRate(difficulty, castChance);

    let html = `<div class="form-section"><h4>Spellcasting</h4>`;
    html += `<div class="sim-stat-row"><span class="label">Spellcasting (SP):</span> <strong>${sp}</strong></div>`;
    html += `<div class="sim-stat-row"><span class="label">Cast Difficulty:</span> ${difficulty >= 0 ? '+' : ''}${difficulty}</div>`;
    html += `<div class="sim-stat-row"><span class="label">Cast Chance:</span> ${castChance} (SP ${sp} ${difficulty >= 0 ? '+' : '-'} ${Math.abs(difficulty)} difficulty)</div>`;
    html += `<div class="sim-stat-row"><span class="label">Success Rate:</span> <strong class="${successRate >= 70 ? 'sim-good' : successRate >= 40 ? 'sim-ok' : 'sim-bad'}">${successRate.toFixed(1)}%</strong>`;
    if (difficulty < 100 && castChance > 97) {
      html += ` <span class="hint-inline">(capped at 97% by 3% auto-fizzle)</span>`;
    }
    html += `</div></div>`;

    // Determine which stat value to use for damage/healing scaling
    const getScalingStatValue = (scalingStat: string | undefined): number => {
      if (!scalingStat || scalingStat === 'none') return 0;
      switch (scalingStat) {
        case 'intellect': return stats.intelligence;
        case 'wisdom': return stats.wisdom;
        case 'charisma': return stats.charisma;
        case 'strength': case 'agility': case 'constitution': return 0; // Physical stats not in simulator
        case 'intellect_wisdom': return Math.floor((stats.intelligence + stats.wisdom) / 2);
        default: return 0;
      }
    };

    // Damage/healing at these settings
    const hasOffensive = spell.minDamage != null && spell.maxDamage != null && (spell.minDamage > 0 || spell.maxDamage > 0);
    const hasHealing = spell.minHealing != null && spell.maxHealing != null && (spell.minHealing > 0 || spell.maxHealing > 0);

    if (hasOffensive || hasHealing) {
      html += `<div class="form-section"><h4>Output at Current Settings</h4>`;
      const spellLvl = spell.levelRequired || 1;
      const maxCap = spell.maxScalingLevel || 0;

      if (hasOffensive) {
        const dmgStat = getScalingStatValue(spell.damageScalingStat ?? undefined);
        const s = calcScaling(spell.minDamage!, spell.maxDamage!, casterLevel,
          spell.scalingPerLevel ?? null, dmgStat, spell.damageScalingFactor ?? null, maxCap, spellLvl);
        html += `<div class="sim-stat-row"><span class="label">Damage:</span> <strong>${s.min}-${s.max}</strong>`;
        const hpc = spell.hitsPerCast ?? 1;
        if (hpc > 1) html += ` x${hpc} hits (${s.min * hpc}-${s.max * hpc} total)`;
        html += `</div>`;
      }
      if (hasHealing) {
        const healStat = getScalingStatValue(spell.healingScalingStat ?? undefined);
        const s = calcScaling(spell.minHealing!, spell.maxHealing!, casterLevel,
          spell.scalingPerLevel ?? null, healStat, spell.healingScalingFactor ?? null, maxCap, spellLvl);
        html += `<div class="sim-stat-row"><span class="label">Healing:</span> <strong>${s.min}-${s.max}</strong></div>`;
      }
      html += `</div>`;
    }

    // Level progression table
    html += `<div class="form-section"><h4>Level Progression</h4>`;
    html += `<table class="scaling-table"><thead><tr><th>Lv</th><th>SP</th><th>Success</th>`;
    if (hasOffensive) html += `<th>Damage</th>`;
    if (hasHealing) html += `<th>Healing</th>`;
    html += `</tr></thead><tbody>`;

    const spellLvl = spell.levelRequired || 1;
    const maxCap = spell.maxScalingLevel || 0;
    const topLevel = Math.max(spellLvl + 10, casterLevel + 5);
    for (let lv = spellLvl; lv <= topLevel; lv += (lv < spellLvl + 5 ? 1 : (lv < 20 ? 2 : 5))) {
      const lvSp = calculateSpellcasting(magicLevel, magicSchool, stats, raceBaseStats, lv, equipBonus);
      const lvSuccess = getSuccessRate(spell.castDifficulty ?? 0, lvSp + (spell.castDifficulty ?? 0));
      const rowClass = lv === casterLevel ? ' class="sim-current-row"' : '';
      html += `<tr${rowClass}><td>${lv}</td><td>${lvSp}</td><td class="${lvSuccess >= 70 ? 'sim-good' : lvSuccess >= 40 ? 'sim-ok' : 'sim-bad'}">${lvSuccess.toFixed(0)}%</td>`;
      if (hasOffensive) {
        const dmgStat = getScalingStatValue(spell.damageScalingStat ?? undefined);
        const s = calcScaling(spell.minDamage!, spell.maxDamage!, lv, spell.scalingPerLevel ?? null, dmgStat, spell.damageScalingFactor ?? null, maxCap, spellLvl);
        html += `<td>${s.min}-${s.max}</td>`;
      }
      if (hasHealing) {
        const healStat = getScalingStatValue(spell.healingScalingStat ?? undefined);
        const s = calcScaling(spell.minHealing!, spell.maxHealing!, lv, spell.scalingPerLevel ?? null, healStat, spell.healingScalingFactor ?? null, maxCap, spellLvl);
        html += `<td>${s.min}-${s.max}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;

    simResults.innerHTML = html;
  }

  // Helper to get current form values for simulator
  function getFormSpell(): Partial<Spell> | null {
    if (!selectedSpellId && !nameInput.value) return null;
    return gatherFormData();
  }

  function updatePreview(spell: Spell): void {
    let html = `
      <div class="preview-name">${escapeHtml(spell.name)}</div>
      <div class="preview-mnemonic">${escapeHtml(spell.mnemonic)}</div>
      ${spell.description ? `<div class="preview-desc">${escapeHtml(spell.description)}</div>` : ''}
      <div class="preview-badges">
        <span class="type-badge ${spell.spellType}">${escapeHtml(spell.spellType)}</span>
        <span class="type-badge" style="background:#1a1a2e;color:#888;">${escapeHtml(spell.targetType)}</span>
      </div>
    `;

    // Core stats
    html += `<div class="preview-stat"><span class="label">Mana:</span> ${spell.manaCost}</div>`;
    html += `<div class="preview-stat"><span class="label">Level:</span> ${spell.levelRequired}</div>`;
    if (spell.castDifficulty) {
      html += `<div class="preview-stat"><span class="label">Cast Difficulty:</span> ${spell.castDifficulty}</div>`;
    }

    // Damage
    if (spell.minDamage != null && spell.maxDamage != null) {
      html += `<div class="preview-section"><div class="preview-section-title">Damage</div>`;
      html += `<div class="preview-stat">${spell.minDamage}-${spell.maxDamage}`;
      if (spell.hitsPerCast > 1) html += ` x${spell.hitsPerCast} hits`;
      html += `</div>`;
      if (spell.damageScalingStat && spell.damageScalingStat !== 'none' && spell.damageScalingFactor) {
        html += `<div class="preview-stat"><span class="label">Scales:</span> ${((spell.damageScalingFactor) * 100).toFixed(1)}% of ${spell.damageScalingStat}</div>`;
      }
      html += `</div>`;
    }

    // Healing
    if (spell.minHealing != null && spell.maxHealing != null) {
      html += `<div class="preview-section"><div class="preview-section-title">Healing</div>`;
      html += `<div class="preview-stat">${spell.minHealing}-${spell.maxHealing}</div>`;
      if (spell.healingScalingStat && spell.healingScalingStat !== 'none' && spell.healingScalingFactor) {
        html += `<div class="preview-stat"><span class="label">Scales:</span> ${((spell.healingScalingFactor) * 100).toFixed(1)}% of ${spell.healingScalingStat}</div>`;
      }
      html += `</div>`;
    }

    // Level scaling
    if (spell.scalingPerLevel) {
      html += `<div class="preview-section"><div class="preview-section-title">Level Scaling</div>`;
      html += `<div class="preview-stat">+${(spell.scalingPerLevel * 100).toFixed(1)}% per level`;
      if (spell.maxScalingLevel) html += ` (cap: Lv ${spell.maxScalingLevel})`;
      html += `</div></div>`;
    }

    // Scaling preview table
    html += buildScalingTable(spell);

    // Status effect
    if (spell.statusEffect) {
      const eff = statusEffects.find(e => e.id === spell.statusEffect);
      html += `<div class="preview-section"><div class="preview-section-title">Status Effect</div>`;
      html += `<div class="preview-stat">${escapeHtml(eff?.name || spell.statusEffect)}`;
      if (spell.effectDuration) html += ` (${spell.effectDuration}s)`;
      html += `</div>`;
      if (spell.saveStat && spell.saveStat !== 'none') {
        html += `<div class="preview-stat"><span class="label">Save:</span> ${spell.saveStat} DC ${spell.saveDifficulty || 0}</div>`;
      }
      html += `</div>`;
    }

    // Telegraph
    if (spell.telegraphMessage) {
      html += `<div class="preview-section"><div class="preview-section-title">Telegraph</div>`;
      html += `<div class="preview-message">"${escapeHtml(spell.telegraphMessage)}"</div></div>`;
    }

    // Requirements
    const reqParts: string[] = [];
    if (spell.levelRequired > 1) reqParts.push(`Level ${spell.levelRequired}`);
    if (spell.classRestrictions && spell.classRestrictions.length > 0) {
      const names = spell.classRestrictions.map(id => {
        const cls = classDefs.find(c => c.id === id);
        return cls?.displayName || id;
      });
      reqParts.push(names.map(n => escapeHtml(n)).join(', '));
    }
    if (reqParts.length > 0) {
      html += `<div class="preview-section"><div class="preview-section-title">Requirements</div>`;
      html += `<div class="preview-stat">${reqParts.join(' · ')}</div></div>`;
    }

    previewContent.innerHTML = html;
  }

  function updateNpcReferences(spellId: number): void {
    const refs = npcTemplates
      .filter(n => n.spells?.some(s => s.spellId === spellId))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (refs.length === 0) {
      npcRefContent.innerHTML = '<p class="no-refs">No NPCs cast this spell</p>';
      return;
    }

    npcRefContent.innerHTML = `<ul class="npc-ref-list">${refs.map(n => `
      <li>
        <span class="npc-ref-name">${escapeHtml(n.name)}</span>
        <span class="npc-ref-level">Lv ${n.level}</span>
      </li>
    `).join('')}</ul>`;
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async function saveSpell(spellData: Partial<Spell>, forceNew = false): Promise<Spell | null> {
    try {
      const isNew = forceNew || !selectedSpellId;
      const url = isNew ? '/api/spells' : `/api/spells/${selectedSpellId}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(spellData),
      });

      const data = await res.json();
      if (data.success) {
        showToast(isNew ? 'Spell created' : 'Spell saved', 'success');
        await fetchSpells();
        return data.spell;
      } else {
        showToast(data.message || 'Failed to save spell', 'error');
        return null;
      }
    } catch (error) {
      console.error('Failed to save spell:', error);
      showToast('Failed to save spell', 'error');
      return null;
    }
  }

  async function deleteSpell(id: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/spells/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        showToast('Spell deleted', 'success');
        await fetchSpells();
        return true;
      } else {
        showToast(data.message || 'Failed to delete spell', 'error');
        return false;
      }
    } catch (error) {
      console.error('Failed to delete spell:', error);
      showToast('Failed to delete spell', 'error');
      return false;
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function updateCount(filtered: number, total: number): void {
    spellCount.textContent = filtered === total ? `${total}` : `${filtered}/${total}`;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // New spell
  document.getElementById('new-spell-btn')?.addEventListener('click', async () => {
    const result = await showPromptFields('New Spell', [
      { key: 'name', label: 'Spell Name', required: true, placeholder: 'Magic Missile' },
      { key: 'mnemonic', label: 'Mnemonic', required: true, placeholder: 'mmis', maxLength: 10 },
    ]);
    if (!result) return;

    const mnemonic = result.mnemonic.trim().toLowerCase();
    if (mnemonic.length < 2) {
      showToast('Mnemonic must be at least 2 characters', 'warning');
      return;
    }
    if (spells.some(s => s.mnemonic === mnemonic)) {
      showToast(`Mnemonic "${mnemonic}" already exists`, 'warning');
      return;
    }

    const saved = await saveSpell({
      name: result.name,
      mnemonic,
      description: '',
      spellType: 'offensive' as SpellType,
      targetType: 'enemy' as SpellTargetType,
      manaCost: 5,
      levelRequired: 1,
      classRestrictions: [],
      isAttackSpell: true,
    }, true);
    if (saved) selectSpell(saved.id);
  });

  // Save
  spellForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedSpellId) return;

    const data = gatherFormData();
    if (!data.name?.trim()) {
      showToast('Name is required', 'warning');
      return;
    }
    if (!data.mnemonic || data.mnemonic.length < 2) {
      showToast('Mnemonic must be at least 2 characters', 'warning');
      return;
    }

    const saved = await saveSpell(data);
    if (saved) selectSpell(saved.id);
  });

  // Delete
  document.getElementById('delete-spell-btn')?.addEventListener('click', async () => {
    if (!selectedSpellId) return;
    const spell = spells.find(s => s.id === selectedSpellId);
    const name = spell?.name || 'this spell';
    const npcRefs = npcTemplates.filter(n => n.spells?.some(s => s.spellId === selectedSpellId));

    let message = `Delete spell "${name}"?`;
    if (npcRefs.length > 0) {
      message += ` ${npcRefs.length} NPC${npcRefs.length === 1 ? '' : 's'} have this spell assigned.`;
    }

    const confirmed = await showConfirm(message, { confirmText: 'Delete', dangerous: true });
    if (!confirmed) return;

    const success = await deleteSpell(selectedSpellId);
    if (success) clearForm();
  });

  // Duplicate
  document.getElementById('duplicate-spell-btn')?.addEventListener('click', async () => {
    if (!selectedSpellId) return;

    const result = await showPromptFields('Duplicate Spell', [
      { key: 'name', label: 'Spell Name', required: true, defaultValue: nameInput.value + ' (copy)' },
      { key: 'mnemonic', label: 'Mnemonic', required: true, defaultValue: mnemonicInput.value + '2', maxLength: 10 },
    ]);
    if (!result) return;

    const mnemonic = result.mnemonic.trim().toLowerCase();
    if (mnemonic.length < 2) {
      showToast('Mnemonic must be at least 2 characters', 'warning');
      return;
    }
    if (spells.some(s => s.mnemonic === mnemonic)) {
      showToast(`Mnemonic "${mnemonic}" already exists`, 'warning');
      return;
    }

    const data = { ...gatherFormData(), name: result.name, mnemonic };
    const saved = await saveSpell(data, true);
    if (saved) selectSpell(saved.id);
  });

  // Spell type changes effect visibility
  spellTypeSelect.addEventListener('change', () => {
    updateEffectSections(spellTypeSelect.value);
  });

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
        const spellsToImport = data.spells || data;

        if (!Array.isArray(spellsToImport) || spellsToImport.length === 0) {
          showToast('No spells found in file', 'warning');
          return;
        }

        const confirmed = await showConfirm(
          `Import ${spellsToImport.length} spell(s)? Existing spells with matching mnemonics will be updated.`,
        );
        if (!confirmed) return;

        const res = await fetch('/api/spells/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ spells: spellsToImport, merge: true }),
        });

        if (!res.ok) {
          showToast(`Import failed: ${res.status}`, 'error');
          return;
        }

        const result = await res.json();
        if (result.success) {
          const { created, updated, errors } = result.results;
          showToast(`Imported: ${created} created, ${updated} updated`, 'success');
          if (errors?.length > 0) showToast(`${errors.length} error(s)`, 'warning');
          await fetchSpells();
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
      const res = await fetch('/api/spells/export/all', { credentials: 'include' });
      if (!res.ok) { showToast('Export failed', 'error'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spells_export.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${spells.length} spells`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Failed to export spells', 'error');
    }
  });

  // ============================================================================
  // Initialize
  // ============================================================================

  await Promise.all([fetchSpells(), fetchClasses(), fetchNpcTemplates(), fetchStatusEffects()]);
  initStatusEffectSelect();
  renderClassButtons();
})();
