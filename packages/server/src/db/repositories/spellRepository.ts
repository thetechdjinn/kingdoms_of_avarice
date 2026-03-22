import { query } from '../index.js';
import {
  Spell,
  CharacterSpell,
  SpellType,
  SpellTargetType,
  SpellScalingStat,
} from '@koa/shared';

// Database row type for spells table
interface DbSpell {
  id: number;
  name: string;
  mnemonic: string;
  description: string | null;
  spell_type: string;
  target_type: string;
  mana_cost: number;
  min_damage: number | null;
  max_damage: number | null;
  min_healing: number | null;
  max_healing: number | null;
  hits_per_cast: number;
  status_effect: string | null;
  effect_duration: number | null;
  level_required: number;
  class_restrictions: string[] | null;
  is_attack_spell: boolean;
  scaling_per_level: string | null;     // DECIMAL comes as string
  damage_scaling_stat: string | null;
  damage_scaling_factor: string | null;
  healing_scaling_stat: string | null;
  healing_scaling_factor: string | null;
  cast_difficulty: number;
  fizzle_message: string | null;
  hit_message_self: string | null;
  hit_message_target: string | null;
  hit_message_room: string | null;
  telegraph_message: string | null;
  save_stat: string | null;
  save_difficulty: number;
  created_at: Date;
  updated_at: Date;
}

// Database row type for character_spells table
interface DbCharacterSpell {
  id: number;
  character_id: number;
  spell_id: number;
  learned_at: Date;
}

// Convert database row to Spell interface
function dbToSpell(row: DbSpell): Spell {
  return {
    id: row.id,
    name: row.name,
    mnemonic: row.mnemonic,
    description: row.description ?? '',
    spellType: row.spell_type as SpellType,
    targetType: row.target_type as SpellTargetType,
    manaCost: row.mana_cost,
    minDamage: row.min_damage,
    maxDamage: row.max_damage,
    minHealing: row.min_healing,
    maxHealing: row.max_healing,
    hitsPerCast: row.hits_per_cast ?? 1,
    statusEffect: row.status_effect,
    effectDuration: row.effect_duration,
    levelRequired: row.level_required,
    classRestrictions: row.class_restrictions ?? [],
    isAttackSpell: row.is_attack_spell,
    scalingPerLevel: row.scaling_per_level ? parseFloat(row.scaling_per_level) : null,
    damageScalingStat: row.damage_scaling_stat as SpellScalingStat | null,
    damageScalingFactor: row.damage_scaling_factor ? (isNaN(parseFloat(row.damage_scaling_factor)) ? null : parseFloat(row.damage_scaling_factor)) : null,
    healingScalingStat: row.healing_scaling_stat as SpellScalingStat | null,
    healingScalingFactor: row.healing_scaling_factor ? (isNaN(parseFloat(row.healing_scaling_factor)) ? null : parseFloat(row.healing_scaling_factor)) : null,
    castDifficulty: row.cast_difficulty ?? 0,
    fizzleMessage: row.fizzle_message,
    hitMessageSelf: row.hit_message_self,
    hitMessageTarget: row.hit_message_target,
    hitMessageRoom: row.hit_message_room,
    telegraphMessage: row.telegraph_message,
    saveStat: row.save_stat as SpellScalingStat | null,
    saveDifficulty: row.save_difficulty ?? 0,
  };
}

// Convert database row to CharacterSpell interface
function dbToCharacterSpell(row: DbCharacterSpell): CharacterSpell {
  return {
    id: row.id,
    characterId: row.character_id,
    spellId: row.spell_id,
    learnedAt: row.learned_at,
  };
}

// ============================================================================
// Spell Definition Operations
// ============================================================================

/**
 * Get a spell by its ID
 */
export async function getSpellById(id: number): Promise<Spell | null> {
  const result = await query<DbSpell>(
    'SELECT * FROM spells WHERE id = $1',
    [id]
  );
  return result.rows[0] ? dbToSpell(result.rows[0]) : null;
}

/**
 * Get a spell by its mnemonic (e.g., 'mmis', 'heal')
 */
export async function getSpellByMnemonic(mnemonic: string): Promise<Spell | null> {
  const result = await query<DbSpell>(
    'SELECT * FROM spells WHERE LOWER(mnemonic) = LOWER($1)',
    [mnemonic]
  );
  return result.rows[0] ? dbToSpell(result.rows[0]) : null;
}

/**
 * Get all spells
 */
export async function getAllSpells(): Promise<Spell[]> {
  const result = await query<DbSpell>(
    'SELECT * FROM spells ORDER BY level_required, name'
  );
  return result.rows.map(dbToSpell);
}

/**
 * Get all spells available to a specific class
 */
export async function getSpellsForClass(className: string): Promise<Spell[]> {
  const result = await query<DbSpell>(
    `SELECT * FROM spells
     WHERE class_restrictions IS NULL
        OR array_length(class_restrictions, 1) IS NULL
        OR $1 = ANY(class_restrictions)
     ORDER BY level_required, name`,
    [className]
  );
  return result.rows.map(dbToSpell);
}

/**
 * Get all spells of a specific type
 */
export async function getSpellsByType(spellType: SpellType): Promise<Spell[]> {
  const result = await query<DbSpell>(
    'SELECT * FROM spells WHERE spell_type = $1 ORDER BY level_required, name',
    [spellType]
  );
  return result.rows.map(dbToSpell);
}

/**
 * Get all attack spells (ones that replace melee combat)
 */
export async function getAttackSpells(): Promise<Spell[]> {
  const result = await query<DbSpell>(
    'SELECT * FROM spells WHERE is_attack_spell = TRUE ORDER BY level_required, name'
  );
  return result.rows.map(dbToSpell);
}

/**
 * Get all mnemonics in the system (for command registration)
 */
export async function getAllMnemonics(): Promise<string[]> {
  const result = await query<{ mnemonic: string }>(
    'SELECT mnemonic FROM spells ORDER BY mnemonic'
  );
  return result.rows.map(row => row.mnemonic);
}

// ============================================================================
// Character Spell Operations (Learned Spells)
// ============================================================================

/**
 * Get all spells learned by a character
 */
export async function getCharacterSpells(characterId: number): Promise<Spell[]> {
  const result = await query<DbSpell>(
    `SELECT s.* FROM spells s
     JOIN character_spells cs ON s.id = cs.spell_id
     WHERE cs.character_id = $1
     ORDER BY s.level_required, s.name`,
    [characterId]
  );
  return result.rows.map(dbToSpell);
}

/**
 * Check if a character has learned a specific spell
 */
export async function hasSpell(characterId: number, spellId: number): Promise<boolean> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM character_spells WHERE character_id = $1 AND spell_id = $2',
    [characterId, spellId]
  );
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Check if a character has learned a spell by mnemonic
 */
export async function hasSpellByMnemonic(characterId: number, mnemonic: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM character_spells cs
     JOIN spells s ON cs.spell_id = s.id
     WHERE cs.character_id = $1 AND LOWER(s.mnemonic) = LOWER($2)`,
    [characterId, mnemonic]
  );
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Learn a spell for a character
 */
export async function learnSpell(characterId: number, spellId: number): Promise<CharacterSpell | null> {
  const result = await query<DbCharacterSpell>(
    `INSERT INTO character_spells (character_id, spell_id)
     VALUES ($1, $2)
     ON CONFLICT (character_id, spell_id) DO NOTHING
     RETURNING *`,
    [characterId, spellId]
  );
  return result.rows[0] ? dbToCharacterSpell(result.rows[0]) : null;
}

/**
 * Forget a spell (remove from character's spellbook)
 */
export async function forgetSpell(characterId: number, spellId: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM character_spells WHERE character_id = $1 AND spell_id = $2',
    [characterId, spellId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get spells a character can learn (meets level req, correct class, not yet learned)
 */
export async function getAvailableSpells(
  characterId: number,
  characterClass: string,
  characterLevel: number
): Promise<Spell[]> {
  const result = await query<DbSpell>(
    `SELECT s.* FROM spells s
     WHERE s.level_required <= $1
       AND (s.class_restrictions IS NULL
            OR array_length(s.class_restrictions, 1) IS NULL
            OR $2 = ANY(s.class_restrictions))
       AND NOT EXISTS (
         SELECT 1 FROM character_spells cs
         WHERE cs.character_id = $3 AND cs.spell_id = s.id
       )
     ORDER BY s.level_required, s.name`,
    [characterLevel, characterClass, characterId]
  );
  return result.rows.map(dbToSpell);
}

/**
 * Check if a character can use a spell (has learned it, meets requirements)
 */
export async function canUseSpell(
  characterId: number,
  spellId: number,
  characterClass: string,
  characterLevel: number
): Promise<{ canUse: boolean; reason?: string }> {
  const spell = await getSpellById(spellId);
  if (!spell) {
    return { canUse: false, reason: 'Spell does not exist.' };
  }

  // Check class restriction
  if (spell.classRestrictions.length > 0 && !spell.classRestrictions.includes(characterClass)) {
    return { canUse: false, reason: `Only ${spell.classRestrictions.join(', ')} can use this spell.` };
  }

  // Check level requirement
  if (characterLevel < spell.levelRequired) {
    return { canUse: false, reason: `You must be level ${spell.levelRequired} to use this spell.` };
  }

  // Check if learned
  const learned = await hasSpell(characterId, spellId);
  if (!learned) {
    return { canUse: false, reason: 'You have not learned this spell.' };
  }

  return { canUse: true };
}

// ============================================================================
// Spell CRUD Operations (for editor)
// ============================================================================

export interface CreateSpellInput {
  name: string;
  mnemonic: string;
  description?: string;
  spellType: SpellType;
  targetType: SpellTargetType;
  manaCost: number;
  minDamage?: number;
  maxDamage?: number;
  minHealing?: number;
  maxHealing?: number;
  hitsPerCast?: number;
  statusEffect?: string;
  effectDuration?: number;
  levelRequired: number;
  classRestrictions?: string[];
  isAttackSpell: boolean;
  scalingPerLevel?: number;
  damageScalingStat?: SpellScalingStat;
  damageScalingFactor?: number;
  healingScalingStat?: SpellScalingStat;
  healingScalingFactor?: number;
  castDifficulty?: number;
  fizzleMessage?: string;
  hitMessageSelf?: string;
  hitMessageTarget?: string;
  hitMessageRoom?: string;
  telegraphMessage?: string;
  saveStat?: SpellScalingStat;
  saveDifficulty?: number;
}

/**
 * Create a new spell definition
 */
export async function createSpell(input: CreateSpellInput): Promise<Spell> {
  const result = await query<DbSpell>(
    `INSERT INTO spells (
      name, mnemonic, description, spell_type, target_type,
      mana_cost, min_damage, max_damage, min_healing, max_healing, hits_per_cast,
      status_effect, effect_duration,
      level_required, class_restrictions, is_attack_spell,
      scaling_per_level, damage_scaling_stat, damage_scaling_factor,
      healing_scaling_stat, healing_scaling_factor,
      cast_difficulty, fizzle_message,
      hit_message_self, hit_message_target, hit_message_room,
      telegraph_message, save_stat, save_difficulty
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
    RETURNING *`,
    [
      input.name, input.mnemonic.toLowerCase(), input.description || null,
      input.spellType, input.targetType, input.manaCost,
      input.minDamage ?? null, input.maxDamage ?? null,
      input.minHealing ?? null, input.maxHealing ?? null,
      input.hitsPerCast ?? 1,
      input.statusEffect || null, input.effectDuration || null,
      input.levelRequired, input.classRestrictions ?? [], input.isAttackSpell,
      input.scalingPerLevel || null,
      input.damageScalingStat || null, input.damageScalingFactor || null,
      input.healingScalingStat || null, input.healingScalingFactor || null,
      input.castDifficulty ?? 0, input.fizzleMessage || null,
      input.hitMessageSelf || null, input.hitMessageTarget || null, input.hitMessageRoom || null,
      input.telegraphMessage || null, input.saveStat || null, input.saveDifficulty ?? 0,
    ]
  );
  return dbToSpell(result.rows[0]);
}

/**
 * Update an existing spell definition
 */
export async function updateSpell(id: number, input: Partial<CreateSpellInput>): Promise<Spell | null> {
  const existing = await getSpellById(id);
  if (!existing) return null;

  const u = {
    name: input.name ?? existing.name,
    mnemonic: input.mnemonic?.toLowerCase() ?? existing.mnemonic,
    description: input.description ?? existing.description,
    spellType: input.spellType ?? existing.spellType,
    targetType: input.targetType ?? existing.targetType,
    manaCost: input.manaCost ?? existing.manaCost,
    minDamage: input.minDamage !== undefined ? input.minDamage : existing.minDamage,
    maxDamage: input.maxDamage !== undefined ? input.maxDamage : existing.maxDamage,
    minHealing: input.minHealing !== undefined ? input.minHealing : existing.minHealing,
    maxHealing: input.maxHealing !== undefined ? input.maxHealing : existing.maxHealing,
    hitsPerCast: input.hitsPerCast ?? existing.hitsPerCast,
    statusEffect: input.statusEffect !== undefined ? input.statusEffect : existing.statusEffect,
    effectDuration: input.effectDuration !== undefined ? input.effectDuration : existing.effectDuration,
    levelRequired: input.levelRequired ?? existing.levelRequired,
    classRestrictions: input.classRestrictions !== undefined ? input.classRestrictions : existing.classRestrictions,
    isAttackSpell: input.isAttackSpell ?? existing.isAttackSpell,
    scalingPerLevel: input.scalingPerLevel !== undefined ? input.scalingPerLevel : existing.scalingPerLevel,
    damageScalingStat: input.damageScalingStat !== undefined ? input.damageScalingStat : existing.damageScalingStat,
    damageScalingFactor: input.damageScalingFactor !== undefined ? input.damageScalingFactor : existing.damageScalingFactor,
    healingScalingStat: input.healingScalingStat !== undefined ? input.healingScalingStat : existing.healingScalingStat,
    healingScalingFactor: input.healingScalingFactor !== undefined ? input.healingScalingFactor : existing.healingScalingFactor,
    castDifficulty: input.castDifficulty !== undefined ? input.castDifficulty : existing.castDifficulty,
    fizzleMessage: input.fizzleMessage !== undefined ? input.fizzleMessage : existing.fizzleMessage,
    hitMessageSelf: input.hitMessageSelf !== undefined ? input.hitMessageSelf : existing.hitMessageSelf,
    hitMessageTarget: input.hitMessageTarget !== undefined ? input.hitMessageTarget : existing.hitMessageTarget,
    hitMessageRoom: input.hitMessageRoom !== undefined ? input.hitMessageRoom : existing.hitMessageRoom,
    telegraphMessage: input.telegraphMessage !== undefined ? input.telegraphMessage : existing.telegraphMessage,
    saveStat: input.saveStat !== undefined ? input.saveStat : existing.saveStat,
    saveDifficulty: input.saveDifficulty !== undefined ? input.saveDifficulty : existing.saveDifficulty,
  };

  const result = await query<DbSpell>(
    `UPDATE spells SET
      name=$1, mnemonic=$2, description=$3, spell_type=$4, target_type=$5,
      mana_cost=$6, min_damage=$7, max_damage=$8, min_healing=$9, max_healing=$10, hits_per_cast=$11,
      status_effect=$12, effect_duration=$13,
      level_required=$14, class_restrictions=$15, is_attack_spell=$16,
      scaling_per_level=$17, damage_scaling_stat=$18, damage_scaling_factor=$19,
      healing_scaling_stat=$20, healing_scaling_factor=$21,
      cast_difficulty=$22, fizzle_message=$23,
      hit_message_self=$24, hit_message_target=$25, hit_message_room=$26,
      telegraph_message=$27, save_stat=$28, save_difficulty=$29,
      updated_at=NOW()
    WHERE id = $30
    RETURNING *`,
    [
      u.name, u.mnemonic, u.description || null,
      u.spellType, u.targetType, u.manaCost,
      u.minDamage ?? null, u.maxDamage ?? null, u.minHealing ?? null, u.maxHealing ?? null,
      u.hitsPerCast ?? 1,
      u.statusEffect || null, u.effectDuration || null,
      u.levelRequired, u.classRestrictions ?? [], u.isAttackSpell,
      u.scalingPerLevel || null,
      u.damageScalingStat || null, u.damageScalingFactor || null,
      u.healingScalingStat || null, u.healingScalingFactor || null,
      u.castDifficulty ?? 0, u.fizzleMessage || null,
      u.hitMessageSelf || null, u.hitMessageTarget || null, u.hitMessageRoom || null,
      u.telegraphMessage || null, u.saveStat || null, u.saveDifficulty ?? 0,
      id,
    ]
  );
  return result.rows[0] ? dbToSpell(result.rows[0]) : null;
}

/**
 * Delete a spell definition
 */
export async function deleteSpell(id: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM spells WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get a spell by its name
 */
export async function getSpellByName(name: string): Promise<Spell | null> {
  const result = await query<DbSpell>(
    'SELECT * FROM spells WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0] ? dbToSpell(result.rows[0]) : null;
}
