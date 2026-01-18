(function() {

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
    damage_dice: string;
    damage_type: string;
    attack_speed: number;
  };
}

// Combat level multipliers (from game settings)
const COMBAT_LEVEL_MULTIPLIERS: Record<number, number> = {
  1: 0.6,
  2: 0.75,
  3: 0.9,
  4: 1.0,
  5: 1.15,
};

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
    option.textContent = `${weapon.name} (${speed})`;
    option.dataset.speed = String(speed);
    option.dataset.damage = weapon.weapon_data.damage_dice || '';
    option.dataset.type = weapon.weapon_data.damage_type || '';
    select.appendChild(option);
  }
}

// ============================================================================
// Calculations
// ============================================================================

// Encumbrance crit thresholds (MajorMUD-style)
const ENCUMBRANCE_CRIT_THRESHOLDS = {
  LIGHT: { maxRatio: 0.32, bonus: 20 },
  MEDIUM: { maxRatio: 0.65, bonus: 10 },
  HEAVY: { maxRatio: 1.0, bonus: 0 },
};

const CRIT_SOFT_CAP = 40;

// Dodge constants (MajorMUD-style)
const DODGE_SOFT_CAP = 52;
const DODGE_STAT_CONTRIBUTION = {
  agilityPer10: 2,   // +2% dodge per 10 AGI
  charmPer10: 1,     // +1% dodge per 10 CHA
};
const DODGE_MIN_ATTACKER_ACCURACY = 8;

interface CalculationInputs {
  baseEnergy: number;
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
  charisma: number;
  attackerAccuracy: number;
}

interface CalculationResults {
  combatMult: number;
  levelMult: number;
  dexMult: number;
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
  // Combat level multiplier
  const combatMult = COMBAT_LEVEL_MULTIPLIERS[inputs.combatLevel] ?? 1.0;

  // Character level bonus (2% per level above 1)
  const levelMult = 1 + (inputs.characterLevel - 1) * 0.02;

  // Dexterity bonus for energy (1% per 10 DEX above 50)
  const dexBonus = Math.max(0, (inputs.dexterity - 50) / 10) * 0.01;
  const dexMult = 1 + dexBonus;

  // Encumbrance modifier for energy (50% = baseline)
  const encRatio = inputs.encumbrance / 100;
  const encOffset = 0.5 - encRatio;
  const encMult = Math.max(0.5, 1 + encOffset * 0.5);

  // Calculate effective energy
  const effectiveEnergy = Math.floor(
    inputs.baseEnergy * combatMult * levelMult * dexMult * encMult
  );

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

  // Base dodge from class and race
  const baseDodge = inputs.classDodgeBonus + inputs.raceDodgeBonus;

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
    combatMult,
    levelMult,
    dexMult,
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
    baseEnergy: getNumberValue('base-energy', 20000),
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

  // Update output values
  setText('out-combat-mult', `${results.combatMult}x`);
  setText('out-level-mult', `${results.levelMult.toFixed(2)}x`);
  setText('out-dex-mult', `${results.dexMult.toFixed(3)}x`);
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

function updateBreakdownTable(baseInputs: CalculationInputs): void {
  const tbody = document.getElementById('breakdown-tbody');
  if (!tbody) return;

  // Update combat level display
  setText('breakdown-combat-level', String(baseInputs.combatLevel));

  tbody.innerHTML = '';

  // Show levels 1, 5, 10, 15, 20, 25, 30 (plus current level if not in list)
  const levels = [1, 5, 10, 15, 20, 25, 30];
  if (!levels.includes(baseInputs.characterLevel)) {
    levels.push(baseInputs.characterLevel);
    levels.sort((a, b) => a - b);
  }

  for (const level of levels) {
    const inputs = { ...baseInputs, characterLevel: level };
    const results = calculate(inputs);

    const tr = document.createElement('tr');
    if (level === baseInputs.characterLevel) {
      tr.className = 'current-row';
    }

    tr.innerHTML = `
      <td>${level}</td>
      <td>${results.effectiveEnergy.toLocaleString()}</td>
      <td>${results.actualSwings}</td>
      <td>${results.totalCrit}%</td>
    `;

    tbody.appendChild(tr);
  }
}

function onWeaponSelect(): void {
  const select = document.getElementById('weapon-select') as HTMLSelectElement;
  const speedInput = document.getElementById('weapon-speed') as HTMLInputElement;
  const statsDiv = document.getElementById('weapon-stats');

  if (!select || !speedInput) return;

  const selectedOption = select.selectedOptions[0];

  if (select.value === 'custom') {
    if (statsDiv) statsDiv.style.display = 'none';
    speedInput.disabled = false;
  } else {
    const speed = selectedOption?.dataset.speed;
    const damage = selectedOption?.dataset.damage;
    const type = selectedOption?.dataset.type;

    if (speed) {
      speedInput.value = speed;
      speedInput.disabled = true;
    }

    if (statsDiv) {
      statsDiv.style.display = 'block';
      setText('weapon-damage', damage || '-');
      setText('weapon-type', type || '-');
    }
  }

  updateDisplay();
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
    'encumbrance', 'class-crit-bonus', 'weapon-crit', 'max-attacks', 'base-energy',
    'class-dodge-bonus', 'race-dodge-bonus', 'charisma', 'attacker-accuracy'
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

})();
