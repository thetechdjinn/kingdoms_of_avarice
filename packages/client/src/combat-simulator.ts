import {
  COMBAT_LEVEL_ACCURACY_BONUS,
  CRIT_SOFT_CAP,
  DODGE_SOFT_CAP,
  DODGE_STAT_CONTRIBUTION,
  DODGE_MIN_ATTACKER_ACCURACY,
} from '@koa/shared';
import {
  calculateSpellcasting,
  calculateStartingHp,
  getConBreakpointBonus,
  getRaceHpPerLevelBonus,
} from '@koa/shared';
import type { ClassDefinition, RaceDefinition, NpcTemplate, NpcAttack, ItemTemplate, Spell, StatusEffectDefinition } from '@koa/shared';
import { renderNav } from './components/nav.js';
import { initAuth, escapeHtml } from './components/index.js';

// ============================================================================
// Types
// ============================================================================

interface PlayerConfig {
  level: number;
  combatLevel: number;
  magicLevel: number;
  magicSchool: string;
  classCritBonus: number;
  classDodgeBonus: number;
  raceDodgeBonus: number;
  classHpAdj: number;
  hpPerLevelMin: number;
  hpPerLevelMax: number;
  raceBaseHp: number;
  raceBaseCon: number;
  raceHpPerLevelBonus: number;
  raceBaseStats: {
    strength: number;
    agility: number;
    constitution: number;
    intellect: number;
    wisdom: number;
    charisma: number;
  };
  str: number;
  dex: number;
  int: number;
  con: number;
  wis: number;
  cha: number;
  weaponMinDmg: number;
  weaponMaxDmg: number;
  weaponSpeed: number;
  weaponAccBonus: number;
  weaponCritMod: number;
  armorClass: number;
  damageReduction: number;
  defenseBonus: number;
  dodgeBonus: number;
  // Spell-derived modifiers
  buffAcBonus: number;
  buffDrBonus: number;
  buffDodgeBonus: number;
  buffDefenseBonus: number;
  buffAccuracyBonus: number;
  buffDamageModifier: number;
  buffSpellcastingBonus: number;
  buffMaxHp: number;
  // Active offensive/healing spell
  offensiveSpell: Spell | null;
  healingSpell: Spell | null;
  maxMana: number;
}

interface NpcConfig {
  level: number;
  hp: number;
  baseAccuracy: number;
  baseDefense: number;
  damageReduction: number;
  baseCritChance: number;
  baseDodge: number;
  attacks: NpcAttack[];
}

// ============================================================================
// Data stores
// ============================================================================

let classes: ClassDefinition[] = [];
let races: RaceDefinition[] = [];
let npcTemplates: NpcTemplate[] = [];
let characters: Array<{
  id: number; name: string; race: string; class: string; level: number;
  maxHealth: number; maxMana: number;
  strength: number; dexterity: number; intelligence: number;
  constitution: number; wisdom: number; charisma: number;
}> = [];
let itemTemplates: ItemTemplate[] = [];
let characterSpells: Spell[] = [];
let effectDefinitions: StatusEffectDefinition[] = [];
let activeSpellIds: Set<number> = new Set(); // Selected spells for simulation

// ============================================================================
// Combat Formulas (replicated from server combatCalculations.ts)
// ============================================================================

const SPEED_DIVISOR_BASE = 1.558;
const SPEED_DIVISOR_PER_LEVEL = 0.073;
const SPEED_DIVISOR_PER_COMBAT = 0.007;
const SPEED_DIVISOR_LEVEL_COMBAT_INTERACTION = 0.035;
const BASE_ENERGY_POOL = 1000;
const ENERGY_PER_DEX_ABOVE_50 = 5;
const MAX_ATTACKS_PER_ROUND = 6;

function calcAccuracy(
  characterLevel: number,
  combatLevel: number,
  dex: number,
  int: number,
  cha: number,
  equipmentBonus: number,
): number {
  const combatBonus = (COMBAT_LEVEL_ACCURACY_BONUS as Record<number, number>)[combatLevel] ?? 0;
  const levelBonus = characterLevel * 2;
  const dexBonus = Math.floor(dex / 10);
  const intBonus = Math.floor(int / 20);
  const chaBonus = Math.floor(cha / 10 * 1.2);
  const total = combatBonus + levelBonus + dexBonus + intBonus + chaBonus + equipmentBonus;
  return Math.max(1, total);
}

function calcDefense(armorClass: number, equipmentBonus: number): number {
  return Math.max(1, armorClass + equipmentBonus);
}

function calcMissChance(accuracy: number, defense: number): number {
  const acc = Math.max(1, accuracy);
  const def = Math.max(1, defense);
  const accSq = acc * acc;
  const defSq = def * def;
  const missChance = defSq / (accSq + defSq);
  return Math.min(0.95, Math.max(0.05, missChance));
}

function calcHitChance(accuracy: number, defense: number): number {
  return 1 - calcMissChance(accuracy, defense);
}

function calcCritChance(
  intelligence: number,
  dexterity: number,
  charisma: number,
  classCritBonus: number,
  weaponCritMod: number,
): number {
  const BASE_CRIT = 3;

  const intBonus = Math.floor((intelligence - 50) / 10);
  const dexBonus = Math.floor((dexterity - 50) / 20);
  const chaBonus = Math.max(0, Math.floor((charisma - 50) / 25));

  let totalCrit = BASE_CRIT + intBonus + dexBonus + chaBonus + classCritBonus + weaponCritMod;

  if (totalCrit > CRIT_SOFT_CAP) {
    const excess = totalCrit - CRIT_SOFT_CAP;
    totalCrit = CRIT_SOFT_CAP + Math.floor(excess / 3);
  }

  return Math.max(BASE_CRIT, Math.min(60, totalCrit));
}

function calcEffectiveWeaponCost(baseWeaponSpeed: number, characterLevel: number, combatLevel: number): number {
  const speedDivisor = SPEED_DIVISOR_BASE
    + (SPEED_DIVISOR_PER_LEVEL * characterLevel)
    + (SPEED_DIVISOR_PER_COMBAT * combatLevel)
    + (SPEED_DIVISOR_LEVEL_COMBAT_INTERACTION * characterLevel * combatLevel);
  return Math.max(1, Math.floor(baseWeaponSpeed / speedDivisor));
}

function calcRoundEnergy(dex: number, encumbranceRatio: number): number {
  const dexBonus = Math.max(0, dex - 50) * ENERGY_PER_DEX_ABOVE_50;
  const encPercent = encumbranceRatio * 100;
  let encMod: number;
  if (encPercent < 50) {
    encMod = 1.0 + ((50 - encPercent) / 100);
  } else {
    encMod = 1.0 - ((encPercent - 50) / 100);
  }
  encMod = Math.max(0.5, encMod);
  return Math.floor((BASE_ENERGY_POOL + dexBonus) * encMod);
}

function calcSwings(energy: number, weaponCost: number): { swings: number; bonusCritChance: number } {
  const cost = Math.max(1, weaponCost);
  let swings = Math.floor(energy / cost);
  let bonusCritChance = 0;
  if (swings > MAX_ATTACKS_PER_ROUND) {
    bonusCritChance = (swings - MAX_ATTACKS_PER_ROUND) * 1;
    swings = MAX_ATTACKS_PER_ROUND;
  }
  return { swings, bonusCritChance };
}

function calcAvgNormalDmg(minDmg: number, maxDmg: number, dr: number): number {
  const avg = (minDmg + maxDmg) / 2 - dr;
  return Math.max(1, avg);
}

function calcAvgCritDmg(minDmg: number, maxDmg: number, dr: number): number {
  // Critical: maxDamage + random(min..max)
  const bonusAvg = (minDmg + maxDmg) / 2;
  const avg = maxDmg + bonusAvg - dr;
  return Math.max(1, avg);
}

function calcPlayerHp(player: PlayerConfig): number {
  // Starting HP at level 1
  let hp = calculateStartingHp(
    player.raceBaseHp,
    player.raceBaseCon,
    player.classHpAdj,
    player.con,
  );

  // HP per level for levels 2+
  if (player.level > 1) {
    const avgPerLevel = (player.hpPerLevelMin + player.hpPerLevelMax) / 2;
    const conBreakpoint = getConBreakpointBonus(player.con);
    const hpPerLevel = avgPerLevel + conBreakpoint + player.raceHpPerLevelBonus;
    hp += hpPerLevel * (player.level - 1);
  }

  return Math.floor(hp);
}

// Replicate getEquipmentAccuracyBonus: accuracy from stat modifiers on items
function calcItemAccuracyBonus(item: ItemTemplate): number {
  const mods = item.stat_modifiers;
  if (!mods) return 0;
  const dexBonus = Math.floor((mods.dexterity || 0) / 10);
  const intBonus = Math.floor((mods.intelligence || 0) / 20);
  const chaBonus = Math.floor(((mods.charisma || 0) / 10) * 1.2);
  return dexBonus + intBonus + chaBonus;
}

// Spell scaling (replicates server calculateSpellScaling + getStatValueForScaling)
function calcSpellScaling(
  baseMin: number, baseMax: number, casterLevel: number,
  scalingPerLevel: number | null, statValue: number,
  scalingFactor: number | null, maxScalingLevel: number | null,
  spellLevelRequired: number,
): { min: number; max: number } {
  let bonus = 0;
  if (scalingPerLevel && scalingPerLevel > 0) {
    let levelsAbove = Math.max(0, casterLevel - spellLevelRequired);
    if (maxScalingLevel != null && maxScalingLevel > 0) levelsAbove = Math.min(levelsAbove, maxScalingLevel);
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

function getStatForSpellScaling(
  scalingStat: string | null | undefined,
  stats: { str: number; dex: number; int: number; con: number; wis: number; cha: number },
): number {
  if (!scalingStat || scalingStat === 'none') return 0;
  switch (scalingStat) {
    case 'strength': return stats.str;
    case 'agility': return stats.dex;
    case 'constitution': return stats.con;
    case 'intellect': return stats.int;
    case 'wisdom': return stats.wis;
    case 'charisma': return stats.cha;
    case 'intellect_wisdom': return Math.floor((stats.int + stats.wis) / 2);
    default: return 0;
  }
}

/** Get scaled spell damage range for a player casting a spell, after NPC DR */
function getScaledSpellDamage(spell: Spell, player: PlayerConfig, npcDr: number): { min: number; max: number } {
  const statValue = getStatForSpellScaling(spell.damageScalingStat, player);
  const scaled = calcSpellScaling(
    spell.minDamage ?? 0, spell.maxDamage ?? 0,
    player.level, spell.scalingPerLevel, statValue,
    spell.damageScalingFactor, spell.maxScalingLevel ?? null,
    spell.levelRequired,
  );
  return {
    min: Math.max(1, scaled.min - npcDr),
    max: Math.max(1, scaled.max - npcDr),
  };
}

// NPC accuracy formula from combat.ts (line 1318-1331):
// NPC uses combatLevel=3, characterLevel=npcLevel, stats all=10
// equipmentBonus = npc.template.baseAccuracy
function calcNpcAccuracy(npcLevel: number, baseAccuracy: number): number {
  const combatLevel = 3;
  // Stats are all 10 for NPCs
  const dex = 10;
  const int = 10;
  const cha = 10;
  return calcAccuracy(npcLevel, combatLevel, dex, int, cha, baseAccuracy);
}

// NPC defense is just baseDefense (set as armorClass in combatStatProvider)
function calcNpcDefense(baseDefense: number): number {
  return Math.max(1, baseDefense);
}

// NPC crit: only if baseCritChance > 0, then it goes through full calc
// with stats=10, baseCritChance as classCritBonus
// NPC crit is set directly from template — no stat-based formula
function calcNpcCritChance(_npcLevel: number, baseCritChance: number): number {
  return baseCritChance;
}

/**
 * Calculate effective dodge chance using the server-side formula.
 * Applies stat contributions, soft cap, and accuracy scaling.
 */
function calcEffectiveDodge(
  classDodge: number, raceDodge: number, equipDodge: number, buffDodge: number,
  dex: number, cha: number, attackerAccuracy: number
): number {
  const baseDodge = classDodge + raceDodge + equipDodge + buffDodge;
  if (baseDodge <= 0) return 0;

  const agiBonus = Math.floor(dex / 10) * DODGE_STAT_CONTRIBUTION.agilityPer10;
  const chaBonus = Math.floor(cha / 10) * DODGE_STAT_CONTRIBUTION.charmPer10;
  let totalDodge = baseDodge + agiBonus + chaBonus;

  if (totalDodge > DODGE_SOFT_CAP) {
    totalDodge = DODGE_SOFT_CAP + Math.floor((totalDodge - DODGE_SOFT_CAP) / 4);
  }

  if (attackerAccuracy <= DODGE_MIN_ATTACKER_ACCURACY) return 0;

  const effectiveDodge = Math.floor((totalDodge * 10) / attackerAccuracy);
  return Math.max(0, Math.min(90, effectiveDodge));
}

// ============================================================================
// Data Loading
// ============================================================================

async function loadClasses(): Promise<void> {
  try {
    const res = await fetch('/api/progression/classes', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    classes = data.classes || [];
    populateClassSelect();
  } catch (e) {
    console.error('Failed to load classes:', e);
  }
}

async function loadRaces(): Promise<void> {
  try {
    const res = await fetch('/api/progression/races', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    races = data.races || [];
    populateRaceSelect();
  } catch (e) {
    console.error('Failed to load races:', e);
  }
}

async function loadNpcs(): Promise<void> {
  try {
    const res = await fetch('/api/npcs', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    npcTemplates = data.templates || [];
    populateNpcSelect();
  } catch (e) {
    console.error('Failed to load NPCs:', e);
  }
}

async function loadCharacters(): Promise<void> {
  try {
    const res = await fetch('/api/characters/all', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    characters = data.characters || [];
    populateCharacterSelect();
  } catch (e) {
    console.error('Failed to load characters:', e);
  }
}

async function loadEffectDefinitions(): Promise<void> {
  try {
    const res = await fetch('/api/status-effects', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    effectDefinitions = data.definitions || [];
  } catch (e) {
    console.error('Failed to load effect definitions:', e);
  }
}

async function loadCharacterSpells(characterId: number): Promise<void> {
  try {
    const res = await fetch(`/api/spells/character/${characterId}`, { credentials: 'include' });
    if (!res.ok) {
      characterSpells = [];
      return;
    }
    const data = await res.json();
    characterSpells = data.spells || [];
    activeSpellIds.clear();
    populateSpellAddSelect();
    renderActiveSpells();

    // Show spell section, hide placeholder
    const section = document.getElementById('spell-select-section');
    const noChar = document.getElementById('spell-no-character');
    if (section) section.style.display = 'block';
    if (noChar) noChar.style.display = 'none';
  } catch (e) {
    console.error('Failed to load character spells:', e);
    characterSpells = [];
  }
}

function populateSpellAddSelect(): void {
  const select = document.getElementById('player-spell-add') as HTMLSelectElement;
  if (!select) return;
  select.innerHTML = '<option value="">-- Select spell to add --</option>';
  const sorted = [...characterSpells].sort((a, b) => a.name.localeCompare(b.name));
  for (const spell of sorted) {
    if (activeSpellIds.has(spell.id)) continue;
    const opt = document.createElement('option');
    opt.value = String(spell.id);
    const typeTag = spell.spellType === 'buff' ? '[Buff]' :
      spell.spellType === 'offensive' ? '[Dmg]' :
      spell.spellType === 'healing' ? '[Heal]' :
      spell.spellType === 'debuff' ? '[Debuff]' : '[Util]';
    opt.textContent = `${typeTag} ${spell.name} (${spell.mnemonic})`;
    select.appendChild(opt);
  }
}

function renderActiveSpells(): void {
  const container = document.getElementById('player-active-spells');
  if (!container) return;
  container.innerHTML = '';

  for (const spellId of activeSpellIds) {
    const spell = characterSpells.find(s => s.id === spellId);
    if (!spell) continue;

    const tag = document.createElement('div');
    tag.className = 'spell-tag';
    const typeClass = spell.spellType === 'buff' ? 'spell-tag-buff' :
      spell.spellType === 'offensive' ? 'spell-tag-offensive' :
      spell.spellType === 'healing' ? 'spell-tag-healing' :
      spell.spellType === 'debuff' ? 'spell-tag-debuff' : 'spell-tag-other';
    tag.classList.add(typeClass);

    const label = spell.spellType === 'buff' ? 'Buff' :
      spell.spellType === 'offensive' ? 'Attack' :
      spell.spellType === 'healing' ? 'Heal' :
      spell.spellType === 'debuff' ? 'Debuff' : spell.spellType;

    tag.innerHTML = `<span class="spell-tag-type">${label}</span> ${escapeHtml(spell.name)} <button class="spell-tag-remove" data-id="${spell.id}">&times;</button>`;
    container.appendChild(tag);
  }

  // Wire remove buttons
  container.querySelectorAll('.spell-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0');
      activeSpellIds.delete(id);
      populateSpellAddSelect();
      renderActiveSpells();
      updateResults();
    });
  });
}

function onSpellAdd(): void {
  const select = document.getElementById('player-spell-add') as HTMLSelectElement;
  const spellId = parseInt(select.value, 10);
  if (!spellId) return;

  activeSpellIds.add(spellId);
  select.value = '';
  populateSpellAddSelect();
  renderActiveSpells();
  updateResults();
}

async function loadItems(): Promise<void> {
  try {
    const res = await fetch('/api/items/templates', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    itemTemplates = data.templates || data.data || [];
    populateWeaponSelect();
    populateArmorSelect();
  } catch (e) {
    console.error('Failed to load items:', e);
  }
}

// ============================================================================
// Dropdowns
// ============================================================================

function populateClassSelect(): void {
  const select = document.getElementById('player-class') as HTMLSelectElement;
  if (!select) return;
  select.innerHTML = '<option value="">-- Select Class --</option>';
  const playable = classes.filter(c => c.playable !== false);
  for (const cls of playable) {
    const opt = document.createElement('option');
    opt.value = cls.class_id;
    opt.textContent = cls.display_name;
    select.appendChild(opt);
  }
}

function populateRaceSelect(): void {
  const select = document.getElementById('player-race') as HTMLSelectElement;
  if (!select) return;
  select.innerHTML = '<option value="">-- Select Race --</option>';
  const playable = races.filter(r => r.playable !== false);
  for (const race of playable) {
    const opt = document.createElement('option');
    opt.value = race.race_id;
    opt.textContent = race.display_name;
    select.appendChild(opt);
  }
}

function populateNpcSelect(): void {
  const select = document.getElementById('npc-select') as HTMLSelectElement;
  if (!select) return;
  select.innerHTML = '<option value="">-- Select NPC --</option>';
  const sorted = [...npcTemplates].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  for (const npc of sorted) {
    const opt = document.createElement('option');
    opt.value = String(npc.id);
    opt.textContent = `[Lv${npc.level}] ${npc.name}`;
    select.appendChild(opt);
  }
}

function populateCharacterSelect(): void {
  const select = document.getElementById('player-character') as HTMLSelectElement;
  if (!select) return;
  select.innerHTML = '<option value="">-- Manual Setup --</option>';
  for (const char of characters) {
    const opt = document.createElement('option');
    opt.value = String(char.id);
    opt.textContent = `[Lv${char.level}] ${char.name} (${char.race} ${char.class})`;
    select.appendChild(opt);
  }
}

function populateWeaponSelect(): void {
  const select = document.getElementById('player-weapon-select') as HTMLSelectElement;
  if (!select) return;
  select.innerHTML = '<option value="">-- Manual / Fists --</option>';
  const weapons = itemTemplates
    .filter(i => i.item_type === 'weapon')
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const w of weapons) {
    const opt = document.createElement('option');
    opt.value = String(w.id);
    const min = w.weapon_data?.min_damage ?? 0;
    const max = w.weapon_data?.max_damage ?? 0;
    opt.textContent = `${w.name} (${min}-${max})`;
    select.appendChild(opt);
  }
}

function populateArmorSelect(): void {
  const select = document.getElementById('player-armor-select') as HTMLSelectElement;
  if (!select) return;
  select.innerHTML = '<option value="">-- Manual / None --</option>';
  const armor = itemTemplates
    .filter(i => i.item_type === 'armor')
    .sort((a, b) => {
      const slotOrder = ['head', 'body', 'legs', 'hands', 'feet', 'off_hand', 'back', 'waist'];
      const aSlot = slotOrder.indexOf(a.equipment_slot || '') ?? 99;
      const bSlot = slotOrder.indexOf(b.equipment_slot || '') ?? 99;
      return aSlot - bSlot || a.name.localeCompare(b.name);
    });
  for (const a of armor) {
    const opt = document.createElement('option');
    opt.value = String(a.id);
    const ac = (a.armor_data?.armor_class ?? 0) + (a.ac_modifier ?? 0);
    const dr = a.armor_data?.damage_resistance ?? 0;
    const slot = a.equipment_slot || '?';
    opt.textContent = `${a.name} [${slot}] (AC:${ac} DR:${dr})`;
    select.appendChild(opt);
  }
}

// ============================================================================
// Selection Handlers
// ============================================================================

function onCharacterChange(): void {
  const select = document.getElementById('player-character') as HTMLSelectElement;
  const charId = parseInt(select.value, 10);
  const char = characters.find(c => c.id === charId);
  if (!char) return;

  // Find matching class and race
  const classSelect = document.getElementById('player-class') as HTMLSelectElement;
  const raceSelect = document.getElementById('player-race') as HTMLSelectElement;
  classSelect.value = char.class;
  raceSelect.value = char.race;

  // Trigger class/race auto-fill
  const cls = classes.find(c => c.class_id === char.class);
  if (cls) {
    setVal('player-combat-level', cls.combat_level ?? 1);
    setVal('player-magic-level', cls.magic_level ?? 0);
    (document.getElementById('player-magic-school') as HTMLInputElement).value = cls.magic_school || 'none';
  }

  // Set level and stats from character
  setVal('player-level', char.level);
  setVal('player-str', char.strength);
  setVal('player-dex', char.dexterity);
  setVal('player-int', char.intelligence);
  setVal('player-con', char.constitution);
  setVal('player-wis', char.wisdom);
  setVal('player-cha', char.charisma);

  // Load equipped items and spells
  loadCharacterEquipment(charId);
  loadCharacterSpells(charId);
}

async function loadCharacterEquipment(characterId: number): Promise<void> {
  try {
    const res = await fetch(`/api/characters/${characterId}/combat-stats`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();

    // Weapon stats from server calculation
    const weapon = data.weapon;
    if (weapon) {
      setVal('player-wep-min', weapon.minDamage ?? 1);
      setVal('player-wep-max', weapon.maxDamage ?? 4);
      setVal('player-wep-speed', weapon.attackSpeed ?? 4500);
      setVal('player-wep-acc', 0); // Accuracy comes from stat modifiers, already in character stats
      setVal('player-wep-crit', weapon.critModifier ?? 0);
    }

    // Armor stats from server calculation (already summed with modifiers applied)
    const armor = data.armor;
    if (armor) {
      setVal('player-ac', armor.totalArmorClass ?? 10);
      setVal('player-dr', Math.floor(armor.damageReduction ?? 0));
    }

    // Equipment modifiers from server calculation
    const mods = data.modifiers;
    if (mods) {
      setVal('player-def-bonus', mods.defenseBonus ?? 0);
      setVal('player-dodge-bonus', mods.dodgeBonus ?? 0);
    }

    // Reset selects since we loaded from character
    const weaponSelect = document.getElementById('player-weapon-select') as HTMLSelectElement;
    const armorSelect = document.getElementById('player-armor-select') as HTMLSelectElement;
    weaponSelect.value = '';
    armorSelect.value = '';

    updateResults();
  } catch (e) {
    console.error('Failed to load character combat stats:', e);
  }
}

function onWeaponSelect(): void {
  const select = document.getElementById('player-weapon-select') as HTMLSelectElement;
  const itemId = parseInt(select.value, 10);
  const item = itemTemplates.find(i => i.id === itemId);
  if (!item) return;

  setVal('player-wep-min', item.weapon_data?.min_damage ?? 1);
  setVal('player-wep-max', item.weapon_data?.max_damage ?? 4);
  setVal('player-wep-speed', item.weapon_data?.attack_speed ?? 1500);
  setVal('player-wep-acc', calcItemAccuracyBonus(item));
  setVal('player-wep-crit', item.critical_chance_modifier ?? 0);
  updateResults();
}

function onArmorSelect(): void {
  const select = document.getElementById('player-armor-select') as HTMLSelectElement;
  const itemId = parseInt(select.value, 10);
  const item = itemTemplates.find(i => i.id === itemId);
  if (!item) return;

  // Single armor piece — set its values directly
  setVal('player-ac', (item.armor_data?.armor_class ?? 0) + (item.ac_modifier ?? 0));
  setVal('player-dr', item.armor_data?.damage_resistance ?? 0);
  setVal('player-def-bonus', item.defense_modifier ?? 0);
  setVal('player-dodge-bonus', item.dodge_modifier ?? 0);
  updateResults();
}

function onClassChange(): void {
  const select = document.getElementById('player-class') as HTMLSelectElement;
  const cls = classes.find(c => c.class_id === select.value);
  if (!cls) return;

  setVal('player-combat-level', cls.combat_level ?? 1);
  setVal('player-magic-level', cls.magic_level ?? 0);
  (document.getElementById('player-magic-school') as HTMLInputElement).value = cls.magic_school || 'none';

  updateResults();
}

function onRaceChange(): void {
  const select = document.getElementById('player-race') as HTMLSelectElement;
  const race = races.find(r => r.race_id === select.value);
  if (!race || !race.base_stats) return;

  setVal('player-str', race.base_stats.strength.min);
  setVal('player-dex', race.base_stats.agility.min);
  setVal('player-int', race.base_stats.intellect.min);
  setVal('player-con', race.base_stats.constitution.min);
  setVal('player-wis', race.base_stats.wisdom.min);
  setVal('player-cha', race.base_stats.charisma.min);

  updateResults();
}

function onNpcChange(): void {
  const select = document.getElementById('npc-select') as HTMLSelectElement;
  const npc = npcTemplates.find(t => t.id === parseInt(select.value, 10));
  const detailsDiv = document.getElementById('npc-details')!;

  if (!npc) {
    detailsDiv.style.display = 'none';
    const resultsSection = document.getElementById('results-section')!;
    resultsSection.style.display = 'none';
    return;
  }

  detailsDiv.style.display = 'block';

  setVal('npc-level', npc.level);
  setVal('npc-hp', npc.maxHealth);
  setVal('npc-accuracy', npc.baseAccuracy);
  setVal('npc-defense', npc.baseDefense);
  setVal('npc-dr', npc.damageReduction);
  setVal('npc-crit', npc.baseCritChance);
  setVal('npc-dodge', npc.baseDodge);

  renderNpcAttacks(npc.attacks);
  updateResults();
}

function renderNpcAttacks(attacks: NpcAttack[]): void {
  const container = document.getElementById('npc-attacks-list')!;
  if (attacks.length === 0) {
    container.innerHTML = '<div class="npc-no-attacks">No attacks defined</div>';
    return;
  }

  container.innerHTML = '';
  for (const atk of attacks) {
    const card = document.createElement('div');
    card.className = 'npc-attack-card';
    card.innerHTML = `
      <div class="npc-attack-card-header">${escapeHtml(atk.name)}</div>
      <div class="npc-attack-card-stats">
        <span>Dmg: <span class="stat-value">${atk.minDamage}-${atk.maxDamage}</span></span>
        <span>APR: <span class="stat-value">${atk.attacksPerRound}</span></span>
        <span>Weight: <span class="stat-value">${atk.percentage}%</span></span>
        <span>Type: <span class="stat-value">${atk.attackType}</span></span>
      </div>
    `;
    container.appendChild(card);
  }
}

// ============================================================================
// Gather Input Values
// ============================================================================

function getPlayerConfig(): PlayerConfig {
  const classId = (document.getElementById('player-class') as HTMLSelectElement).value;
  const raceId = (document.getElementById('player-race') as HTMLSelectElement).value;
  const cls = classes.find(c => c.class_id === classId);
  const race = races.find(r => r.race_id === raceId);

  return {
    level: getVal('player-level', 1),
    combatLevel: getVal('player-combat-level', 1),
    magicLevel: getVal('player-magic-level', 0),
    magicSchool: (document.getElementById('player-magic-school') as HTMLInputElement)?.value || 'none',
    classCritBonus: cls?.crit_bonus ?? 0,
    classDodgeBonus: cls?.dodge_bonus ?? 0,
    raceDodgeBonus: race?.dodge_bonus ?? 0,
    classHpAdj: cls?.hp_adj ?? 0,
    hpPerLevelMin: cls?.hp_per_level_min ?? 4,
    hpPerLevelMax: cls?.hp_per_level_max ?? 8,
    raceBaseHp: race?.base_hp ?? 26,
    raceBaseCon: race?.base_stats?.constitution?.min ?? 40,
    raceHpPerLevelBonus: race?.traits ? getRaceHpPerLevelBonus(race.traits) : 0,
    raceBaseStats: {
      strength: race?.base_stats?.strength?.min ?? 40,
      agility: race?.base_stats?.agility?.min ?? 40,
      constitution: race?.base_stats?.constitution?.min ?? 40,
      intellect: race?.base_stats?.intellect?.min ?? 40,
      wisdom: race?.base_stats?.wisdom?.min ?? 40,
      charisma: race?.base_stats?.charisma?.min ?? 40,
    },
    str: getVal('player-str', 50),
    dex: getVal('player-dex', 50),
    int: getVal('player-int', 50),
    con: getVal('player-con', 50),
    wis: getVal('player-wis', 50),
    cha: getVal('player-cha', 50),
    weaponMinDmg: getVal('player-wep-min', 1),
    weaponMaxDmg: getVal('player-wep-max', 6),
    weaponSpeed: getVal('player-wep-speed', 1500),
    weaponAccBonus: getVal('player-wep-acc', 0),
    weaponCritMod: getVal('player-wep-crit', 0),
    armorClass: getVal('player-ac', 10),
    damageReduction: getVal('player-dr', 0),
    defenseBonus: getVal('player-def-bonus', 0),
    dodgeBonus: getVal('player-dodge-bonus', 0),
    ...getActiveSpellModifiers(),
  };
}

/** Sum buff modifiers from active spells and identify offensive/healing spell */
function getActiveSpellModifiers(): {
  buffAcBonus: number; buffDrBonus: number; buffDodgeBonus: number;
  buffDefenseBonus: number; buffAccuracyBonus: number; buffDamageModifier: number;
  buffSpellcastingBonus: number; buffMaxHp: number;
  offensiveSpell: Spell | null; healingSpell: Spell | null; maxMana: number;
} {
  let buffAcBonus = 0, buffDrBonus = 0, buffDodgeBonus = 0, buffDefenseBonus = 0;
  let buffAccuracyBonus = 0, buffDamageModifier = 0, buffSpellcastingBonus = 0, buffMaxHp = 0;
  let offensiveSpell: Spell | null = null;
  let healingSpell: Spell | null = null;

  for (const spellId of activeSpellIds) {
    const spell = characterSpells.find(s => s.id === spellId);
    if (!spell) continue;

    if (spell.spellType === 'offensive') {
      offensiveSpell = spell;
    } else if (spell.spellType === 'healing') {
      healingSpell = spell;
    }

    // Look up status effect for buff/debuff spells
    if (spell.statusEffect) {
      const effect = effectDefinitions.find(e => e.id === spell.statusEffect);
      if (effect) {
        buffAcBonus += effect.armorClassModifier ?? 0;
        buffDrBonus += effect.damageReductionModifier ?? 0;
        buffDodgeBonus += effect.dodgeModifier ?? 0;
        buffDefenseBonus += effect.defenseModifier ?? 0;
        buffAccuracyBonus += effect.accuracyModifier ?? 0;
        buffDamageModifier += effect.damageModifier ?? 0;
        buffSpellcastingBonus += effect.spellcastingModifier ?? 0;
        buffMaxHp += effect.maxHpModifier ?? 0;
      }
    }
  }

  // Get character's max mana from the loaded character data
  const charSelect = document.getElementById('player-character') as HTMLSelectElement;
  const charId = parseInt(charSelect?.value || '0', 10);
  const char = characters.find(c => c.id === charId);
  const maxMana = char?.maxMana ?? 0;

  return { buffAcBonus, buffDrBonus, buffDodgeBonus, buffDefenseBonus,
    buffAccuracyBonus, buffDamageModifier, buffSpellcastingBonus, buffMaxHp,
    offensiveSpell, healingSpell, maxMana };
}

function getNpcConfig(): NpcConfig | null {
  const select = document.getElementById('npc-select') as HTMLSelectElement;
  const npc = npcTemplates.find(t => t.id === parseInt(select.value, 10));
  if (!npc) return null;

  return {
    level: getVal('npc-level', npc.level),
    hp: getVal('npc-hp', npc.maxHealth),
    baseAccuracy: getVal('npc-accuracy', npc.baseAccuracy),
    baseDefense: getVal('npc-defense', npc.baseDefense),
    damageReduction: getVal('npc-dr', npc.damageReduction),
    baseCritChance: getVal('npc-crit', npc.baseCritChance),
    baseDodge: getVal('npc-dodge', npc.baseDodge),
    attacks: npc.attacks,
  };
}

// ============================================================================
// Results Calculation
// ============================================================================

function updateResults(): void {
  const player = getPlayerConfig();
  const npc = getNpcConfig();

  if (!npc) {
    const resultsSection = document.getElementById('results-section')!;
    resultsSection.style.display = 'none';
    return;
  }

  const resultsSection = document.getElementById('results-section')!;
  resultsSection.style.display = 'flex';

  updatePlayerAttackingNpc(player, npc);
  updateNpcAttackingPlayer(player, npc);
  updateMagicAnalysis(player);
  updateSummary(player, npc);
}

function updatePlayerAttackingNpc(player: PlayerConfig, npc: NpcConfig): void {
  // Player accuracy (include buff accuracy bonus)
  const playerAcc = calcAccuracy(
    player.level,
    player.combatLevel,
    player.dex,
    player.int,
    player.cha,
    player.weaponAccBonus + player.buffAccuracyBonus,
  );

  // Accuracy breakdown
  const combatBonus = (COMBAT_LEVEL_ACCURACY_BONUS as Record<number, number>)[player.combatLevel] ?? 0;
  const levelBonus = player.level * 2;
  const dexBonus = Math.floor(player.dex / 10);
  const intBonus = Math.floor(player.int / 20);
  const chaBonus = Math.floor(player.cha / 10 * 1.2);
  const eqBonus = player.weaponAccBonus + player.buffAccuracyBonus;
  const breakdown = `CB:${combatBonus} + Lv:${levelBonus} + DEX:${dexBonus} + INT:${intBonus} + CHA:${chaBonus} + Eq/Buff:${eqBonus}`;

  // NPC defense
  const npcDef = calcNpcDefense(npc.baseDefense);

  // Hit chance
  const hitChance = calcHitChance(playerAcc, npcDef);

  // Crit chance
  const playerCrit = calcCritChance(
    player.int,
    player.dex,
    player.cha,
    player.classCritBonus,
    player.weaponCritMod,
  );

  // Melee damage
  const normalDmgMin = Math.max(1, player.weaponMinDmg - npc.damageReduction);
  const normalDmgMax = Math.max(1, player.weaponMaxDmg - npc.damageReduction);
  const critDmgMin = Math.max(1, player.weaponMaxDmg + player.weaponMinDmg - npc.damageReduction);
  const critDmgMax = Math.max(1, player.weaponMaxDmg + player.weaponMaxDmg - npc.damageReduction);

  // Swings (assume light armor for simulator, encRatio 0.2)
  const encRatio = 0.2;
  const energy = calcRoundEnergy(player.dex, encRatio);
  const weaponCost = calcEffectiveWeaponCost(player.weaponSpeed, player.level, player.combatLevel);
  const { swings, bonusCritChance } = calcSwings(energy, weaponCost);
  const effectiveCrit = Math.min(60, playerCrit + Math.min(25, bonusCritChance));

  // Average melee damage per round
  const avgNormalDmg = calcAvgNormalDmg(player.weaponMinDmg, player.weaponMaxDmg, npc.damageReduction);
  const avgCritDmg = calcAvgCritDmg(player.weaponMinDmg, player.weaponMaxDmg, npc.damageReduction);
  const critFraction = effectiveCrit / 100;
  const avgDmgPerHit = avgNormalDmg * (1 - critFraction) + avgCritDmg * critFraction;
  const meleeAvgDmgPerRound = swings * hitChance * avgDmgPerHit;

  // Melee rounds to kill
  const meleeRoundsToKill = meleeAvgDmgPerRound > 0 ? Math.ceil(npc.hp / meleeAvgDmgPerRound) : Infinity;

  // Update melee DOM
  setText('res-player-acc', String(playerAcc));
  setText('res-player-acc-breakdown', breakdown);
  setText('res-npc-def', String(npcDef));
  setText('res-player-hit', `${(hitChance * 100).toFixed(1)}%`);
  setText('res-player-crit', `${effectiveCrit}%` + (bonusCritChance > 0 ? ` (${playerCrit}% + ${Math.min(25, bonusCritChance)}% excess)` : ''));
  setText('res-player-dmg', `${normalDmgMin}-${normalDmgMax}`);
  setText('res-player-crit-dmg', `${critDmgMin}-${critDmgMax}`);
  setText('res-player-swings', `${swings} (cost: ${weaponCost}, energy: ${energy})`);
  setText('res-player-dpr', meleeAvgDmgPerRound.toFixed(1));
  setText('res-player-rtk', meleeRoundsToKill === Infinity ? 'Never' : String(meleeRoundsToKill));
  setClass('res-player-hit', hitChance >= 0.8 ? 'result-value highlight' : hitChance >= 0.5 ? 'result-value' : 'result-value danger');

  // Spell damage section
  const spellSection = document.getElementById('res-spell-attack-section');
  if (spellSection) {
    if (player.offensiveSpell) {
      spellSection.style.display = 'block';
      const spell = player.offensiveSpell;
      const sp = calculateSpellcasting(
        player.magicLevel,
        player.magicSchool === 'none' ? undefined : player.magicSchool,
        { intelligence: player.int, wisdom: player.wis, charisma: player.cha },
        { intelligence: player.raceBaseStats.intellect, wisdom: player.raceBaseStats.wisdom, charisma: player.raceBaseStats.charisma },
        player.level, player.buffSpellcastingBonus,
      );
      const castChance = sp + (spell.castDifficulty ?? 0);
      const successRate = (spell.castDifficulty ?? 0) >= 100 ? 100 : castChance <= 0 ? 0 : Math.min(castChance, 97);

      // Spell damage with scaling (spells ignore defense, but DR still applies)
      const { min: spellMin, max: spellMax } = getScaledSpellDamage(spell, player, npc.damageReduction);
      const hpc = spell.hitsPerCast ?? 1;
      const avgSpellDmg = ((spellMin + spellMax) / 2) * hpc;
      const effectiveSpellDpr = avgSpellDmg * (successRate / 100);
      const castsToKill = effectiveSpellDpr > 0 ? Math.ceil(npc.hp / effectiveSpellDpr) : Infinity;
      const castsAvailable = spell.manaCost > 0 ? Math.floor(player.maxMana / spell.manaCost) : Infinity;

      setText('res-spell-name', spell.name);
      setText('res-spell-sp', String(sp));
      setText('res-spell-success', `${successRate.toFixed(1)}%`);
      setText('res-spell-dmg', `${spellMin}-${spellMax}${hpc > 1 ? ` x${hpc}` : ''}`);
      setText('res-spell-dpr', effectiveSpellDpr.toFixed(1));
      setText('res-spell-rtk', castsToKill === Infinity ? 'Never' : String(castsToKill));
      setText('res-spell-mana', `${spell.manaCost} per cast, ${castsAvailable} casts available (${player.maxMana} mana)`);
      setClass('res-spell-success', successRate >= 70 ? 'result-value highlight' : successRate >= 40 ? 'result-value' : 'result-value danger');
    } else {
      spellSection.style.display = 'none';
    }
  }
}

function updateNpcAttackingPlayer(player: PlayerConfig, npc: NpcConfig): void {
  const container = document.getElementById('npc-attack-results')!;
  const summaryDiv = document.getElementById('npc-attack-summary')!;

  // Player HP (include buff max HP and one healing spell cast with scaling)
  let playerHp = calcPlayerHp(player) + player.buffMaxHp;
  let healAmount = 0;
  if (player.healingSpell) {
    const healStatValue = getStatForSpellScaling(player.healingSpell.healingScalingStat, player);
    const scaledHeal = calcSpellScaling(
      player.healingSpell.minHealing ?? 0, player.healingSpell.maxHealing ?? 0,
      player.level, player.healingSpell.scalingPerLevel, healStatValue,
      player.healingSpell.healingScalingFactor, player.healingSpell.maxScalingLevel ?? null,
      player.healingSpell.levelRequired,
    );
    healAmount = Math.floor((scaledHeal.min + scaledHeal.max) / 2);
    playerHp += healAmount;
  }

  // Player defense (include buff AC and defense bonuses)
  const totalAc = player.armorClass + player.buffAcBonus;
  const totalDefBonus = player.defenseBonus + player.buffDefenseBonus;
  const playerDef = calcDefense(totalAc, totalDefBonus);
  const totalDr = player.damageReduction + player.buffDrBonus;

  // NPC accuracy
  const npcAcc = calcNpcAccuracy(npc.level, npc.baseAccuracy);

  // NPC crit
  const npcCrit = calcNpcCritChance(npc.level, npc.baseCritChance);

  if (npc.attacks.length === 0) {
    container.innerHTML = '<div class="result-placeholder">NPC has no attacks defined</div>';
    summaryDiv.style.display = 'none';
    return;
  }

  // Calculate total percentage for weighted average
  const totalPercentage = npc.attacks.reduce((sum, a) => sum + a.percentage, 0);

  container.innerHTML = '';
  let totalAttacksPerRound = 0;
  let totalWeightedDpr = 0;

  // Dodge reduces effective hit chance (uses full server-side formula)
  const dodgePct = calcEffectiveDodge(
    player.classDodgeBonus, player.raceDodgeBonus, player.dodgeBonus, player.buffDodgeBonus,
    player.dex, player.cha, npcAcc
  );
  const dodgeMultiplier = 1 - (dodgePct / 100);

  for (const atk of npc.attacks) {
    const rawHitChance = calcHitChance(npcAcc, playerDef);
    const effectiveHitChance = rawHitChance * dodgeMultiplier;
    const weight = totalPercentage > 0 ? atk.percentage / totalPercentage : 1 / npc.attacks.length;

    const avgNormalDmg = calcAvgNormalDmg(atk.minDamage, atk.maxDamage, totalDr);
    const avgCritDmg = calcAvgCritDmg(atk.minDamage, atk.maxDamage, totalDr);
    const critFraction = npcCrit / 100;
    const avgDmgPerHit = avgNormalDmg * (1 - critFraction) + avgCritDmg * critFraction;

    const normalDmgMin = Math.max(1, atk.minDamage - totalDr);
    const normalDmgMax = Math.max(1, atk.maxDamage - totalDr);
    const dprThisAttack = atk.attacksPerRound * effectiveHitChance * avgDmgPerHit;

    totalWeightedDpr += dprThisAttack * weight;
    totalAttacksPerRound += atk.attacksPerRound * weight;

    const dodgeNote = dodgePct > 0 ? ` (${(rawHitChance * 100).toFixed(1)}% before ${dodgePct}% dodge)` : '';
    const block = document.createElement('div');
    block.className = 'npc-attack-result';
    block.innerHTML = `
      <div class="npc-attack-result-header">${escapeHtml(atk.name)} (${atk.percentage}% chance)</div>
      <div class="result-grid">
        <div class="result-item">
          <span class="result-label">NPC Accuracy</span>
          <span class="result-value">${npcAcc}</span>
        </div>
        <div class="result-item">
          <span class="result-label">Effective Hit Chance</span>
          <span class="result-value${effectiveHitChance >= 0.8 ? ' highlight' : effectiveHitChance < 0.5 ? ' danger' : ''}">${(effectiveHitChance * 100).toFixed(1)}%${dodgeNote}</span>
        </div>
        <div class="result-item">
          <span class="result-label">Damage Per Hit</span>
          <span class="result-value">${normalDmgMin}-${normalDmgMax}</span>
        </div>
        <div class="result-item">
          <span class="result-label">Attacks Per Round</span>
          <span class="result-value">${atk.attacksPerRound}</span>
        </div>
        <div class="result-item">
          <span class="result-label">Avg Damage/Round (this attack)</span>
          <span class="result-value highlight">${dprThisAttack.toFixed(1)}</span>
        </div>
      </div>
    `;
    container.appendChild(block);
  }

  // Summary across all attacks (weighted) — dodge already factored into per-attack DPR
  summaryDiv.style.display = 'flex';
  const roundsToKill = totalWeightedDpr > 0 ? Math.ceil(playerHp / totalWeightedDpr) : Infinity;

  const hpLabel = player.healingSpell
    ? `${playerHp} (includes +${healAmount} from ${player.healingSpell.name})`
    : String(playerHp);
  const defLabel = player.buffAcBonus > 0 || player.buffDefenseBonus > 0
    ? `${playerDef} (AC:${totalAc} + Def:${totalDefBonus})`
    : String(playerDef);
  setText('res-player-hp', hpLabel);
  setText('res-player-def', defLabel);
  setText('res-npc-total-apr', totalAttacksPerRound.toFixed(1));
  setText('res-npc-total-dpr', totalWeightedDpr.toFixed(1));
  setText('res-npc-rtk', roundsToKill === Infinity ? 'Never' : String(roundsToKill));
}

function updateMagicAnalysis(player: PlayerConfig): void {
  const panel = document.getElementById('magic-analysis-panel')!;

  if (player.magicLevel <= 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const sp = calculateSpellcasting(
    player.magicLevel,
    player.magicSchool === 'none' ? undefined : player.magicSchool,
    { intelligence: player.int, wisdom: player.wis, charisma: player.cha },
    {
      intelligence: player.raceBaseStats.intellect,
      wisdom: player.raceBaseStats.wisdom,
      charisma: player.raceBaseStats.charisma,
    },
    player.level,
    player.buffSpellcastingBonus,
  );

  setText('res-sp-value', String(sp));

  // Spell difficulty table
  // Cast chance = SP / (SP + difficulty) * 100, clamped 5-95
  const difficulties = [20, 15, 10, 5, 0, -5, -10, -20, -30, -50];
  const tbody = document.getElementById('spell-difficulty-tbody')!;
  tbody.innerHTML = '';

  for (const diffOffset of difficulties) {
    // In the MUD, "difficulty" is relative to SP.
    // A spell with difficulty = SP+offset has:
    //   successRate = sp / (sp + offset) * 100, but that's not quite right.
    // Actually, the spell has an absolute difficulty. We show what happens
    // at various difficulties relative to the player's SP.
    const spellDifficulty = sp + diffOffset;
    const label = diffOffset >= 0 ? `SP + ${diffOffset}` : `SP ${diffOffset}`;

    // Simplified cast chance: SP / spellDifficulty
    // If spellDifficulty <= 0, auto-succeed
    let castChance: number;
    if (spellDifficulty <= 0) {
      castChance = 95;
    } else {
      castChance = Math.min(95, Math.max(5, (sp / spellDifficulty) * 100));
    }

    const tr = document.createElement('tr');
    const successClass = castChance >= 80 ? 'good' : castChance >= 50 ? 'moderate' : 'poor';
    tr.innerHTML = `
      <td>${label} (${Math.max(0, spellDifficulty)})</td>
      <td>${castChance.toFixed(1)}%</td>
      <td class="${successClass}">${castChance >= 80 ? 'Reliable' : castChance >= 60 ? 'Moderate' : castChance >= 40 ? 'Risky' : 'Unlikely'}</td>
    `;
    tbody.appendChild(tr);
  }
}

function updateSummary(player: PlayerConfig, npc: NpcConfig): void {
  // Player HP with buffs and healing
  let playerHp = calcPlayerHp(player) + player.buffMaxHp;
  if (player.healingSpell) {
    const healStat = getStatForSpellScaling(player.healingSpell.healingScalingStat, player);
    const scaledHeal = calcSpellScaling(
      player.healingSpell.minHealing ?? 0, player.healingSpell.maxHealing ?? 0,
      player.level, player.healingSpell.scalingPerLevel, healStat,
      player.healingSpell.healingScalingFactor, player.healingSpell.maxScalingLevel ?? null,
      player.healingSpell.levelRequired,
    );
    playerHp += Math.floor((scaledHeal.min + scaledHeal.max) / 2);
  }

  const totalAc = player.armorClass + player.buffAcBonus;
  const totalDefBonus = player.defenseBonus + player.buffDefenseBonus;
  const playerDef = calcDefense(totalAc, totalDefBonus);
  const totalDr = player.damageReduction + player.buffDrBonus;
  const npcDef = calcNpcDefense(npc.baseDefense);
  const encRatio = 0.2;

  // Player attacking NPC — use spell if selected, otherwise melee
  let playerRtk: number;
  if (player.offensiveSpell) {
    const spell = player.offensiveSpell;
    const sp = calculateSpellcasting(
      player.magicLevel,
      player.magicSchool === 'none' ? undefined : player.magicSchool,
      { intelligence: player.int, wisdom: player.wis, charisma: player.cha },
      { intelligence: player.raceBaseStats.intellect, wisdom: player.raceBaseStats.wisdom, charisma: player.raceBaseStats.charisma },
      player.level, player.buffSpellcastingBonus,
    );
    const castChance = sp + (spell.castDifficulty ?? 0);
    const successRate = (spell.castDifficulty ?? 0) >= 100 ? 100 : castChance <= 0 ? 0 : Math.min(castChance, 97);
    const { min: spellMin, max: spellMax } = getScaledSpellDamage(spell, player, npc.damageReduction);
    const hpc = spell.hitsPerCast ?? 1;
    const avgSpellDmg = ((spellMin + spellMax) / 2) * hpc;
    const spellDpr = avgSpellDmg * (successRate / 100);
    playerRtk = spellDpr > 0 ? Math.ceil(npc.hp / spellDpr) : Infinity;
  } else {
    const playerAcc = calcAccuracy(player.level, player.combatLevel, player.dex, player.int, player.cha, player.weaponAccBonus + player.buffAccuracyBonus);
    const playerHitChance = calcHitChance(playerAcc, npcDef);
    const playerCrit = calcCritChance(player.int, player.dex, player.cha, player.classCritBonus, player.weaponCritMod);
    const energy = calcRoundEnergy(player.dex, encRatio);
    const weaponCost = calcEffectiveWeaponCost(player.weaponSpeed, player.level, player.combatLevel);
    const { swings, bonusCritChance } = calcSwings(energy, weaponCost);
    const effectiveCrit = Math.min(60, playerCrit + Math.min(25, bonusCritChance));
    const avgNormalDmg = calcAvgNormalDmg(player.weaponMinDmg, player.weaponMaxDmg, npc.damageReduction);
    const avgCritDmg = calcAvgCritDmg(player.weaponMinDmg, player.weaponMaxDmg, npc.damageReduction);
    const critFraction = effectiveCrit / 100;
    const avgPlayerDmgPerHit = avgNormalDmg * (1 - critFraction) + avgCritDmg * critFraction;
    const playerDpr = swings * playerHitChance * avgPlayerDmgPerHit;
    playerRtk = playerDpr > 0 ? Math.ceil(npc.hp / playerDpr) : Infinity;
  }

  // NPC attacking Player (weighted average across attacks, with buff modifiers)
  const npcAcc = calcNpcAccuracy(npc.level, npc.baseAccuracy);
  const npcCrit = calcNpcCritChance(npc.level, npc.baseCritChance);
  const npcHitChance = calcHitChance(npcAcc, playerDef);
  const totalPercentage = npc.attacks.reduce((sum, a) => sum + a.percentage, 0);

  let npcDpr = 0;
  for (const atk of npc.attacks) {
    const weight = totalPercentage > 0 ? atk.percentage / totalPercentage : 1 / Math.max(1, npc.attacks.length);
    const avgNDmg = calcAvgNormalDmg(atk.minDamage, atk.maxDamage, totalDr);
    const avgCDmg = calcAvgCritDmg(atk.minDamage, atk.maxDamage, totalDr);
    const nCritFrac = npcCrit / 100;
    const avgDmgPerHit = avgNDmg * (1 - nCritFrac) + avgCDmg * nCritFrac;
    npcDpr += atk.attacksPerRound * npcHitChance * avgDmgPerHit * weight;
  }

  // Apply dodge to NPC DPR (uses full server-side formula)
  const sumDodgePct = calcEffectiveDodge(
    player.classDodgeBonus, player.raceDodgeBonus, player.dodgeBonus, player.buffDodgeBonus,
    player.dex, player.cha, npcAcc
  );
  const sumDodgeFraction = sumDodgePct / 100;
  const effectiveSumNpcDpr = npcDpr * (1 - sumDodgeFraction);
  const npcRtk = effectiveSumNpcDpr > 0 ? Math.ceil(playerHp / effectiveSumNpcDpr) : Infinity;

  // Display
  setText('sum-player-rtk', playerRtk === Infinity ? 'Never' : `${playerRtk} rounds`);
  setText('sum-npc-rtk', npcRtk === Infinity ? 'Never' : `${npcRtk} rounds`);

  // Who wins?
  let winner: string;
  let winnerClass: string;
  if (playerRtk === Infinity && npcRtk === Infinity) {
    winner = 'Stalemate';
    winnerClass = 'summary-value fair';
  } else if (playerRtk === Infinity) {
    winner = 'NPC';
    winnerClass = 'summary-value deadly';
  } else if (npcRtk === Infinity) {
    winner = 'Player';
    winnerClass = 'summary-value safe';
  } else if (playerRtk < npcRtk) {
    winner = 'Player';
    winnerClass = 'summary-value safe';
  } else if (npcRtk < playerRtk) {
    winner = 'NPC';
    winnerClass = 'summary-value deadly';
  } else {
    winner = 'Tie (simultaneous kill)';
    winnerClass = 'summary-value fair';
  }

  const winnerEl = document.getElementById('sum-winner')!;
  winnerEl.textContent = winner;
  winnerEl.className = winnerClass;

  // Danger rating based on ratio
  let danger: string;
  let dangerClass: string;
  if (playerRtk === Infinity && npcRtk === Infinity) {
    danger = 'Fair';
    dangerClass = 'summary-value fair';
  } else if (playerRtk === Infinity) {
    danger = 'Deadly';
    dangerClass = 'summary-value deadly';
  } else if (npcRtk === Infinity) {
    danger = 'Safe';
    dangerClass = 'summary-value safe';
  } else {
    const ratio = npcRtk / playerRtk; // Higher = safer for player
    if (ratio >= 2.5) {
      danger = 'Safe';
      dangerClass = 'summary-value safe';
    } else if (ratio >= 1.3) {
      danger = 'Fair';
      dangerClass = 'summary-value fair';
    } else if (ratio >= 1.0) {
      danger = ratio === 1.0 ? 'Fair' : 'Dangerous';
      dangerClass = ratio === 1.0 ? 'summary-value fair' : 'summary-value dangerous';
    } else {
      danger = 'Deadly';
      dangerClass = 'summary-value deadly';
    }
  }

  const dangerEl = document.getElementById('sum-danger')!;
  dangerEl.textContent = danger;
  dangerEl.className = dangerClass;
}

// ============================================================================
// Helpers
// ============================================================================

function getVal(id: string, defaultVal: number): number {
  const el = document.getElementById(id) as HTMLInputElement;
  if (!el) return defaultVal;
  const v = parseFloat(el.value);
  return isNaN(v) ? defaultVal : v;
}

function setVal(id: string, value: number): void {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.value = String(value);
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setClass(id: string, className: string): void {
  const el = document.getElementById(id);
  if (el) el.className = className;
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners(): void {
  // Character / Class / Race / NPC / Item selection
  document.getElementById('player-character')?.addEventListener('change', onCharacterChange);
  document.getElementById('player-class')?.addEventListener('change', onClassChange);
  document.getElementById('player-race')?.addEventListener('change', onRaceChange);
  document.getElementById('player-weapon-select')?.addEventListener('change', onWeaponSelect);
  document.getElementById('player-armor-select')?.addEventListener('change', onArmorSelect);
  document.getElementById('player-spell-add')?.addEventListener('change', onSpellAdd);
  document.getElementById('npc-select')?.addEventListener('change', onNpcChange);

  // All numeric inputs trigger recalculation
  const inputIds = [
    'player-level', 'player-str', 'player-dex', 'player-int',
    'player-con', 'player-wis', 'player-cha',
    'player-wep-min', 'player-wep-max', 'player-wep-speed',
    'player-wep-acc', 'player-wep-crit',
    'player-ac', 'player-dr', 'player-def-bonus', 'player-dodge-bonus',
    // NPC overrides
    'npc-level', 'npc-hp', 'npc-accuracy', 'npc-defense',
    'npc-dr', 'npc-crit', 'npc-dodge',
  ];

  for (const id of inputIds) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateResults);
      el.addEventListener('change', updateResults);
    }
  }
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  renderNav({ activePage: 'combat-simulator' });
  const auth = await initAuth('developer');
  if (!auth) return;

  setupEventListeners();

  await Promise.all([loadClasses(), loadRaces(), loadNpcs(), loadCharacters(), loadItems(), loadEffectDefinitions()]);

  // Show content
  const loadingState = document.getElementById('loading-state');
  const content = document.getElementById('simulator-content');
  if (loadingState) loadingState.style.display = 'none';
  if (content) content.style.display = 'block';

  // Initial calculation (no NPC selected yet, so results hidden)
  updateResults();
});
