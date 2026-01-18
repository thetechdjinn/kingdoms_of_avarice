import {
  ENCUMBRANCE_CRIT_THRESHOLDS,
  CRIT_SOFT_CAP,
  COMBAT_LEVEL_ENERGY_MULTIPLIER,
  DODGE_SOFT_CAP,
  DODGE_STAT_CONTRIBUTION,
  DODGE_MIN_ATTACKER_ACCURACY,
} from '@koa/shared';

interface AuthInfo {
  authenticated: boolean;
  playerId?: number;
  username?: string;
  roles?: string[];
}

interface WeaponTemplate {
  id: number;
  name: string;
  weapon_data: {
    min_damage: number;
    max_damage: number;
    damage_type: string;
    attack_speed: number;
  };
}

let weapons: WeaponTemplate[] = [];

// ============================================================================
// Authentication
// ============================================================================

async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (!response.ok) {
      window.location.href = '/';
      return false;
    }
    const data: AuthInfo = await response.json();

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

    const usernameEl = document.getElementById('nav-username');
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username;
    }

    // Show developer dropdown
    const devDropdown = document.getElementById('nav-dev-dropdown');
    if (devDropdown) {
      devDropdown.style.display = 'flex';
    }

    // Show admin dropdown if admin
    const isAdmin = roles.includes('admin');
    const adminDropdown = document.getElementById('nav-admin-dropdown');
    if (adminDropdown) {
      adminDropdown.style.display = isAdmin ? 'flex' : 'none';
    }

    return true;
  } catch (error) {
    console.error('Failed to check auth:', error);
    window.location.href = '/';
    return false;
  }
}

async function handleLogout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Ignore errors
  }
  window.location.href = '/';
}

// ============================================================================
// Load Weapons
// ============================================================================

async function loadWeapons(): Promise<void> {
  try {
    const response = await fetch('/api/items/templates?type=weapon', { credentials: 'include' });
    if (!response.ok) {
      console.error('Failed to load weapons');
      return;
    }
    const data = await response.json();
    weapons = data.templates || [];
    populateWeaponSelect();
  } catch (error) {
    console.error('Failed to load weapons:', error);
  }
}

function populateWeaponSelect(): void {
  const select = document.getElementById('weapon-select') as HTMLSelectElement;
  if (!select) return;

  // Keep the custom option
  select.innerHTML = '<option value="custom">-- Custom Speed --</option>';

  // Sort weapons by attack speed
  const sortedWeapons = [...weapons].sort((a, b) => {
    const speedA = a.weapon_data?.attack_speed || 0;
    const speedB = b.weapon_data?.attack_speed || 0;
    return speedA - speedB;
  });

  for (const weapon of sortedWeapons) {
    if (!weapon.weapon_data) continue;
    const option = document.createElement('option');
    option.value = String(weapon.id);
    const speed = weapon.weapon_data.attack_speed || 0;
    const minDmg = weapon.weapon_data.min_damage ?? 1;
    const maxDmg = weapon.weapon_data.max_damage ?? 4;
    option.textContent = `${weapon.name} (${speed})`;
    option.dataset.speed = String(speed);
    option.dataset.damage = `${minDmg}-${maxDmg}`;
    option.dataset.type = weapon.weapon_data.damage_type || '';
    select.appendChild(option);
  }
}

// ============================================================================
// Calculations (using constants from @koa/shared)
// ============================================================================

interface CalculationInputs {
  combatLevel: number;
  characterLevel: number;
  intelligence: number;
  dexterity: number;
  encumbrance: number;
  weaponSpeed: number;
  classCritBonus: number;
  weaponCrit: number;
  maxAttacks: number;
  // Dodge inputs
  classDodgeBonus: number;
  raceDodgeBonus: number;
  equipDodgeBonus: number;
  charisma: number;
  attackerAccuracy: number;
}

interface CalculationResults {
  // MajorMUD-style additive energy components
  combatContribution: number;
  levelContribution: number;
  agilityContribution: number;
  baseEnergy: number;
  encMult: number;
  effectiveEnergy: number;
  rawSwings: number;
  actualSwings: number;
  excessAttacks: number;
  statCrit: number;
  encCrit: number;
  preCap: number;
  totalCrit: number;
  carriedEnergy: number;
  // Dodge results
  baseDodge: number;
  statDodge: number;
  preCapDodge: number;
  postCapDodge: number;
  effectiveDodge: number;
}

function calculateEncumbranceCritBonus(encRatio: number): number {
  if (encRatio <= ENCUMBRANCE_CRIT_THRESHOLDS.LIGHT.maxRatio) {
    return ENCUMBRANCE_CRIT_THRESHOLDS.LIGHT.bonus;
  }
  if (encRatio <= ENCUMBRANCE_CRIT_THRESHOLDS.MEDIUM.maxRatio) {
    return ENCUMBRANCE_CRIT_THRESHOLDS.MEDIUM.bonus;
  }
  return ENCUMBRANCE_CRIT_THRESHOLDS.HEAVY.bonus;
}

function calculate(inputs: CalculationInputs): CalculationResults {
  // MajorMUD-style additive formula:
  // Base Energy = (CombatLevel * 2 + 3) * 500 + (CharLevel * 10) + ((DEX - 50) * 2)

  // Combat level is the primary factor: (CL * 2 + 3) * 500
  // Combat 1 = 2500, Combat 2 = 3500, Combat 3 = 4500, Combat 4 = 5500, Combat 5 = 6500
  // Ratio of Combat 5 to Combat 1 = 2.6x (matches MajorMUD research)
  const combatContribution = (inputs.combatLevel * 2 + 3) * 500;

  // Character level adds +10 energy per level
  const levelContribution = inputs.characterLevel * 10;

  // Agility (DEX) adds +2 energy per point above 50
  const agilityContribution = Math.max(0, (inputs.dexterity - 50)) * 2;

  // Base energy before encumbrance
  const baseEnergy = combatContribution + levelContribution + agilityContribution;

  // Encumbrance modifier (MajorMUD-style):
  // At 50% encumbrance = 1.0x (baseline)
  // At 0% encumbrance = 1.5x (+50% bonus)
  // At 100% encumbrance = 0.5x (-50% penalty)
  const encRatio = inputs.encumbrance / 100;
  let encMult: number;
  if (inputs.encumbrance < 50) {
    encMult = 1.0 + ((50 - inputs.encumbrance) / 100);
  } else {
    encMult = 1.0 - ((inputs.encumbrance - 50) / 100);
  }
  encMult = Math.max(0.5, encMult);

  // Calculate effective energy
  const effectiveEnergy = Math.floor(baseEnergy * encMult);

  // Calculate swings
  const weaponSpeed = Math.max(1, inputs.weaponSpeed);
  const rawSwings = effectiveEnergy / weaponSpeed;
  const actualSwings = Math.min(Math.floor(rawSwings), inputs.maxAttacks);
  const excessAttacks = Math.max(0, Math.floor(rawSwings) - inputs.maxAttacks);

  // Carried energy
  const carriedEnergy = effectiveEnergy - (actualSwings * weaponSpeed);

  // MajorMUD-style crit calculation
  // Base from character level (+1% per 10 levels)
  const levelCrit = Math.floor(inputs.characterLevel / 10);

  // Intelligence bonus (+1% per 10 INT above 50)
  const intCrit = Math.max(0, Math.floor((inputs.intelligence - 50) / 10));

  // Dexterity bonus (+1% per 25 DEX above 50)
  const dexCrit = Math.max(0, Math.floor((inputs.dexterity - 50) / 25));

  // Total stat-based crit
  const statCrit = levelCrit + intCrit + dexCrit;

  // Encumbrance crit bonus (light armor = more crits)
  const encCrit = calculateEncumbranceCritBonus(encRatio);

  // Pre-cap total
  const preCap = statCrit + encCrit + inputs.classCritBonus + inputs.weaponCrit;

  // Apply MajorMUD-style soft cap with diminishing returns
  let totalCrit = preCap;
  if (totalCrit > CRIT_SOFT_CAP) {
    const excessCrit = totalCrit - CRIT_SOFT_CAP;
    totalCrit = CRIT_SOFT_CAP + Math.floor(excessCrit / 3);
  }

  // Clamp to reasonable bounds
  totalCrit = Math.max(0, Math.min(60, totalCrit));

  // ============================================================================
  // Dodge Calculations (MajorMUD-style)
  // ============================================================================

  // Base dodge from class, race, and equipment
  const baseDodge = inputs.classDodgeBonus + inputs.raceDodgeBonus + inputs.equipDodgeBonus;

  // Stat contributions: +2% per 10 AGI (DEX), +1% per 10 CHA
  const agiBonus = Math.floor(inputs.dexterity / 10) * DODGE_STAT_CONTRIBUTION.agilityPer10;
  const chaBonus = Math.floor(inputs.charisma / 10) * DODGE_STAT_CONTRIBUTION.charmPer10;
  const statDodge = agiBonus + chaBonus;

  // Pre-cap total
  const preCapDodge = baseDodge + statDodge;

  // Apply soft cap at 52% with diminishing returns
  let postCapDodge = preCapDodge;
  if (postCapDodge > DODGE_SOFT_CAP) {
    const excessDodge = postCapDodge - DODGE_SOFT_CAP;
    postCapDodge = DODGE_SOFT_CAP + Math.floor(excessDodge / 4);
  }

  // Factor in attacker accuracy
  // If attacker accuracy <= 8, dodge doesn't work
  // Otherwise: effectiveDodge = (postCapDodge * 10) / attackerAccuracy
  let effectiveDodge = 0;
  if (baseDodge > 0 && inputs.attackerAccuracy > DODGE_MIN_ATTACKER_ACCURACY) {
    effectiveDodge = Math.floor((postCapDodge * 10) / inputs.attackerAccuracy);
    effectiveDodge = Math.max(0, Math.min(90, effectiveDodge));
  }

  return {
    combatContribution,
    levelContribution,
    agilityContribution,
    baseEnergy,
    encMult,
    effectiveEnergy,
    rawSwings,
    actualSwings,
    excessAttacks,
    statCrit,
    encCrit,
    preCap,
    totalCrit,
    carriedEnergy,
    // Dodge results
    baseDodge,
    statDodge,
    preCapDodge,
    postCapDodge,
    effectiveDodge,
  };
}

function getInputs(): CalculationInputs {
  return {
    combatLevel: getNumberValue('combat-level', 1),
    characterLevel: getNumberValue('character-level', 1),
    intelligence: getNumberValue('intelligence', 50),
    dexterity: getNumberValue('dexterity', 50),
    encumbrance: getNumberValue('encumbrance', 50),
    weaponSpeed: getNumberValue('weapon-speed', 7500),
    classCritBonus: getNumberValue('class-crit-bonus', 0),
    weaponCrit: getNumberValue('weapon-crit', 0),
    maxAttacks: getNumberValue('max-attacks', 6),
    // Dodge inputs
    classDodgeBonus: getNumberValue('class-dodge-bonus', 0),
    raceDodgeBonus: getNumberValue('race-dodge-bonus', 0),
    equipDodgeBonus: getNumberValue('equip-dodge-bonus', 0),
    charisma: getNumberValue('charisma', 50),
    attackerAccuracy: getNumberValue('attacker-accuracy', 50),
  };
}

function getNumberValue(id: string, defaultValue: number): number {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  if (!el) return defaultValue;
  const value = parseFloat(el.value);
  return isNaN(value) ? defaultValue : value;
}

// ============================================================================
// UI Updates
// ============================================================================

function updateDisplay(): void {
  const inputs = getInputs();
  const results = calculate(inputs);

  // Update output values (MajorMUD-style additive formula)
  setText('out-combat-energy', results.combatContribution.toLocaleString());
  setText('out-level-energy', `+${results.levelContribution}`);
  setText('out-agility-energy', `+${results.agilityContribution}`);
  setText('out-base-energy', results.baseEnergy.toLocaleString());
  setText('out-enc-mult', `${results.encMult.toFixed(2)}x`);
  setText('out-energy', results.effectiveEnergy.toLocaleString());
  setText('out-raw-swings', results.rawSwings.toFixed(2));
  setText('out-swings', String(results.actualSwings));
  setText('out-excess', String(results.excessAttacks));
  setText('out-stat-crit', `${results.statCrit}%`);
  setText('out-enc-crit', `+${results.encCrit}%`);
  setText('out-precap-crit', `${results.preCap}%`);
  setText('out-total-crit', `${results.totalCrit}%`);
  setText('out-crit-damage', '2.0x - 4.0x');

  // Dodge output values
  setText('out-base-dodge', `${results.baseDodge}%`);
  setText('out-stat-dodge', `${results.statDodge}%`);
  setText('out-precap-dodge', `${results.preCapDodge}%`);
  setText('out-postcap-dodge', `${results.postCapDodge}%`);
  setText('out-effective-dodge', `${results.effectiveDodge}%`);

  setText('out-carried', results.carriedEnergy.toLocaleString());

  // Color coding for swings
  const swingsEl = document.getElementById('out-swings');
  if (swingsEl) {
    swingsEl.className = 'output-value highlight';
    if (results.actualSwings >= inputs.maxAttacks) {
      swingsEl.className = 'output-value warning';
    }
  }

  // Color coding for crit
  const totalCritEl = document.getElementById('out-total-crit');
  if (totalCritEl) {
    totalCritEl.className = 'output-value highlight';
    if (results.totalCrit >= 40) {
      totalCritEl.className = 'output-value warning';
    }
  }

  // Color coding for encumbrance crit
  const encCritEl = document.getElementById('out-enc-crit');
  if (encCritEl) {
    encCritEl.className = 'output-value';
    if (results.encCrit >= 20) {
      encCritEl.className = 'output-value highlight';
    } else if (results.encCrit >= 10) {
      encCritEl.className = 'output-value warning';
    }
  }

  // Color coding for effective dodge
  const effectiveDodgeEl = document.getElementById('out-effective-dodge');
  if (effectiveDodgeEl) {
    effectiveDodgeEl.className = 'output-value';
    if (results.effectiveDodge >= 50) {
      effectiveDodgeEl.className = 'output-value highlight';
    } else if (results.effectiveDodge >= 25) {
      effectiveDodgeEl.className = 'output-value warning';
    }
  }

  // Update breakdown table
  updateBreakdownTable(inputs);
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function calculateSwingsPerRound(effectiveEnergy: number, weaponSpeed: number, maxAttacks: number, rounds: number): number[] {
  const swingsPerRound: number[] = [];
  let carriedEnergy = 0;

  // Prevent division by zero
  const safeWeaponSpeed = Math.max(1, weaponSpeed);

  for (let round = 0; round < rounds; round++) {
    const totalEnergy = effectiveEnergy + carriedEnergy;
    const rawSwings = totalEnergy / safeWeaponSpeed;
    const actualSwings = Math.min(Math.floor(rawSwings), maxAttacks);
    swingsPerRound.push(actualSwings);
    carriedEnergy = totalEnergy - (actualSwings * safeWeaponSpeed);
  }

  return swingsPerRound;
}

function updateBreakdownTable(baseInputs: CalculationInputs): void {
  const tbody = document.getElementById('breakdown-tbody');
  const levelRangeSelect = document.getElementById('level-range-select') as HTMLSelectElement;
  if (!tbody) return;

  // Update combat level display
  setText('breakdown-combat-level', String(baseInputs.combatLevel));

  tbody.innerHTML = '';

  // Get level range from dropdown
  const rangeValue = levelRangeSelect?.value || '1-20';
  const [startStr, endStr] = rangeValue.split('-');
  const startLevel = parseInt(startStr, 10) || 1;
  const endLevel = parseInt(endStr, 10) || 20;

  const numRounds = 4;

  // Show all levels in the selected range
  for (let level = startLevel; level <= endLevel; level++) {
    const inputs = { ...baseInputs, characterLevel: level };
    const results = calculate(inputs);

    // Calculate swings for each of the first N rounds
    const swingsPerRound = calculateSwingsPerRound(
      results.effectiveEnergy,
      inputs.weaponSpeed,
      inputs.maxAttacks,
      numRounds
    );

    const tr = document.createElement('tr');
    if (level === baseInputs.characterLevel) {
      tr.className = 'current-row';
    }

    tr.innerHTML = `
      <td>${level}</td>
      <td>${results.effectiveEnergy.toLocaleString()}</td>
      <td>${swingsPerRound.join(', ')}</td>
      <td>${results.totalCrit}%</td>
    `;

    tbody.appendChild(tr);
  }
}

let selectedWeaponId: number | null = null;

function onWeaponSelect(): void {
  const select = document.getElementById('weapon-select') as HTMLSelectElement;
  const speedInput = document.getElementById('weapon-speed') as HTMLInputElement;
  const editSection = document.getElementById('weapon-edit-section');
  const statusDiv = document.getElementById('weapon-save-status');

  if (!select || !speedInput) return;

  // Clear any previous status
  if (statusDiv) {
    statusDiv.textContent = '';
    statusDiv.className = 'weapon-save-status';
  }

  if (select.value === 'custom') {
    selectedWeaponId = null;
    if (editSection) editSection.style.display = 'none';
    speedInput.disabled = false;
  } else {
    selectedWeaponId = parseInt(select.value, 10);
    const weapon = weapons.find(w => w.id === selectedWeaponId);

    if (weapon?.weapon_data) {
      const wd = weapon.weapon_data;

      // Update the main speed input
      speedInput.value = String(wd.attack_speed || 1500);
      speedInput.disabled = true;

      // Populate edit fields
      const minDmgInput = document.getElementById('edit-min-damage') as HTMLInputElement;
      const maxDmgInput = document.getElementById('edit-max-damage') as HTMLInputElement;
      const speedEditInput = document.getElementById('edit-attack-speed') as HTMLInputElement;
      const typeSelect = document.getElementById('edit-damage-type') as HTMLSelectElement;

      if (minDmgInput) minDmgInput.value = String(wd.min_damage ?? 1);
      if (maxDmgInput) maxDmgInput.value = String(wd.max_damage ?? 6);
      if (speedEditInput) speedEditInput.value = String(wd.attack_speed || 1500);
      if (typeSelect) typeSelect.value = wd.damage_type || 'slashing';

      if (editSection) editSection.style.display = 'block';
    }
  }

  updateDisplay();
}

async function saveWeapon(): Promise<void> {
  if (!selectedWeaponId) return;

  const weapon = weapons.find(w => w.id === selectedWeaponId);
  if (!weapon) return;

  const saveBtn = document.getElementById('save-weapon-btn') as HTMLButtonElement;
  const statusDiv = document.getElementById('weapon-save-status');
  const speedInput = document.getElementById('weapon-speed') as HTMLInputElement;

  // Get values from edit fields
  const minDamage = parseInt((document.getElementById('edit-min-damage') as HTMLInputElement).value, 10) || 1;
  const maxDamage = parseInt((document.getElementById('edit-max-damage') as HTMLInputElement).value, 10) || 6;
  const attackSpeed = parseInt((document.getElementById('edit-attack-speed') as HTMLInputElement).value, 10) || 1500;
  const damageType = (document.getElementById('edit-damage-type') as HTMLSelectElement).value;

  // Validate
  if (minDamage > maxDamage) {
    if (statusDiv) {
      statusDiv.textContent = 'Min damage cannot exceed max damage';
      statusDiv.className = 'weapon-save-status error';
    }
    return;
  }

  // Disable save button during save
  if (saveBtn) saveBtn.disabled = true;
  if (statusDiv) {
    statusDiv.textContent = 'Saving...';
    statusDiv.className = 'weapon-save-status';
  }

  try {
    // We need to fetch the full template first, then update it
    const getResponse = await fetch(`/api/items/templates/${selectedWeaponId}`, { credentials: 'include' });
    if (!getResponse.ok) throw new Error('Failed to fetch weapon');

    const template = await getResponse.json();

    // Update weapon_data
    template.weapon_data = {
      ...template.weapon_data,
      min_damage: minDamage,
      max_damage: maxDamage,
      attack_speed: attackSpeed,
      damage_type: damageType,
    };

    // Save the template
    const saveResponse = await fetch(`/api/items/templates/${selectedWeaponId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(template),
    });

    if (!saveResponse.ok) throw new Error('Failed to save weapon');

    // Update local cache
    weapon.weapon_data = {
      min_damage: minDamage,
      max_damage: maxDamage,
      damage_type: damageType,
      attack_speed: attackSpeed,
    };

    // Update the dropdown option's data attributes
    const select = document.getElementById('weapon-select') as HTMLSelectElement;
    const option = select.querySelector(`option[value="${selectedWeaponId}"]`) as HTMLOptionElement;
    if (option) {
      option.dataset.speed = String(attackSpeed);
      option.dataset.damage = `${minDamage}-${maxDamage}`;
      option.dataset.type = damageType;
      option.textContent = `${weapon.name} (${attackSpeed})`;
    }

    // Update main speed input
    if (speedInput) speedInput.value = String(attackSpeed);

    if (statusDiv) {
      statusDiv.textContent = 'Saved!';
      statusDiv.className = 'weapon-save-status success';
    }

    // Recalculate with new values
    updateDisplay();

    // Clear status after 2 seconds
    setTimeout(() => {
      if (statusDiv) {
        statusDiv.textContent = '';
        statusDiv.className = 'weapon-save-status';
      }
    }, 2000);

  } catch (error) {
    console.error('Failed to save weapon:', error);
    if (statusDiv) {
      statusDiv.textContent = 'Failed to save';
      statusDiv.className = 'weapon-save-status error';
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ============================================================================
// Initialize
// ============================================================================

function showContent(): void {
  const loadingState = document.getElementById('loading-state');
  const content = document.getElementById('calculator-content');
  if (loadingState) loadingState.style.display = 'none';
  if (content) content.style.display = 'block';
}

function setupEventListeners(): void {
  // All inputs trigger recalculation
  const inputIds = [
    'weapon-speed', 'combat-level', 'character-level', 'intelligence', 'dexterity',
    'encumbrance', 'class-crit-bonus', 'weapon-crit', 'max-attacks',
    'class-dodge-bonus', 'race-dodge-bonus', 'equip-dodge-bonus', 'charisma', 'attacker-accuracy'
  ];

  for (const id of inputIds) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateDisplay);
      el.addEventListener('change', updateDisplay);
    }
  }

  // Weapon select
  const weaponSelect = document.getElementById('weapon-select');
  if (weaponSelect) {
    weaponSelect.addEventListener('change', onWeaponSelect);
  }

  // Level range select
  const levelRangeSelect = document.getElementById('level-range-select');
  if (levelRangeSelect) {
    levelRangeSelect.addEventListener('change', updateDisplay);
  }

  // Save weapon button
  const saveWeaponBtn = document.getElementById('save-weapon-btn');
  if (saveWeaponBtn) {
    saveWeaponBtn.addEventListener('click', saveWeapon);
  }

  // Update calculations when edit fields change
  const editSpeedInput = document.getElementById('edit-attack-speed');
  if (editSpeedInput) {
    editSpeedInput.addEventListener('input', () => {
      const speedInput = document.getElementById('weapon-speed') as HTMLInputElement;
      if (speedInput && selectedWeaponId) {
        speedInput.value = (editSpeedInput as HTMLInputElement).value;
        updateDisplay();
      }
    });
  }

  // Logout handler
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
    userMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    document.addEventListener('click', () => {
      userMenu.classList.remove('open');
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const hasAccess = await checkAuth();
  if (!hasAccess) return;

  setupEventListeners();
  await loadWeapons();
  showContent();
  updateDisplay();
});
