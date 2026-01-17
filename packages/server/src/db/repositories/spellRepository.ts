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
  damage_dice: string | null;
  healing_dice: string | null;
  status_effect: string | null;
  effect_duration: number | null;
  level_required: number;
  class_restrictions: string[] | null;
  is_attack_spell: boolean;
  damage_scaling_stat: string | null;
  damage_scaling_factor: string | null;  // DECIMAL comes as string
  healing_scaling_stat: string | null;
  healing_scaling_factor: string | null;  // DECIMAL comes as string
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
    damageDice: row.damage_dice,
    healingDice: row.healing_dice,
    statusEffect: row.status_effect,
    effectDuration: row.effect_duration,
    levelRequired: row.level_required,
    classRestrictions: row.class_restrictions ?? [],
    isAttackSpell: row.is_attack_spell,
    damageScalingStat: row.damage_scaling_stat as SpellScalingStat | null,
    damageScalingFactor: row.damage_scaling_factor ? parseFloat(row.damage_scaling_factor) : null,
    healingScalingStat: row.healing_scaling_stat as SpellScalingStat | null,
    healingScalingFactor: row.healing_scaling_factor ? parseFloat(row.healing_scaling_factor) : null,
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
  damageDice?: string;
  healingDice?: string;
  statusEffect?: string;
  effectDuration?: number;
  levelRequired: number;
  classRestrictions?: string[];
  isAttackSpell: boolean;
  damageScalingStat?: SpellScalingStat;
  damageScalingFactor?: number;
  healingScalingStat?: SpellScalingStat;
  healingScalingFactor?: number;
}

/**
 * Create a new spell definition
 */
export async function createSpell(input: CreateSpellInput): Promise<Spell> {
  const result = await query<DbSpell>(
    `INSERT INTO spells (
      name, mnemonic, description, spell_type, target_type,
      mana_cost, damage_dice, healing_dice, status_effect, effect_duration,
      level_required, class_restrictions, is_attack_spell,
      damage_scaling_stat, damage_scaling_factor, healing_scaling_stat, healing_scaling_factor
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      input.name,
      input.mnemonic.toLowerCase(),
      input.description || null,
      input.spellType,
      input.targetType,
      input.manaCost,
      input.damageDice || null,
      input.healingDice || null,
      input.statusEffect || null,
      input.effectDuration || null,
      input.levelRequired,
      input.classRestrictions ?? [],
      input.isAttackSpell,
      input.damageScalingStat || null,
      input.damageScalingFactor || null,
      input.healingScalingStat || null,
      input.healingScalingFactor || null,
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

  const updated = {
    name: input.name ?? existing.name,
    mnemonic: input.mnemonic?.toLowerCase() ?? existing.mnemonic,
    description: input.description ?? existing.description,
    spellType: input.spellType ?? existing.spellType,
    targetType: input.targetType ?? existing.targetType,
    manaCost: input.manaCost ?? existing.manaCost,
    damageDice: input.damageDice !== undefined ? input.damageDice : existing.damageDice,
    healingDice: input.healingDice !== undefined ? input.healingDice : existing.healingDice,
    statusEffect: input.statusEffect !== undefined ? input.statusEffect : existing.statusEffect,
    effectDuration: input.effectDuration !== undefined ? input.effectDuration : existing.effectDuration,
    levelRequired: input.levelRequired ?? existing.levelRequired,
    classRestrictions: input.classRestrictions !== undefined ? input.classRestrictions : existing.classRestrictions,
    isAttackSpell: input.isAttackSpell ?? existing.isAttackSpell,
    damageScalingStat: input.damageScalingStat !== undefined ? input.damageScalingStat : existing.damageScalingStat,
    damageScalingFactor: input.damageScalingFactor !== undefined ? input.damageScalingFactor : existing.damageScalingFactor,
    healingScalingStat: input.healingScalingStat !== undefined ? input.healingScalingStat : existing.healingScalingStat,
    healingScalingFactor: input.healingScalingFactor !== undefined ? input.healingScalingFactor : existing.healingScalingFactor,
  };

  const result = await query<DbSpell>(
    `UPDATE spells SET
      name = $1, mnemonic = $2, description = $3, spell_type = $4, target_type = $5,
      mana_cost = $6, damage_dice = $7, healing_dice = $8, status_effect = $9, effect_duration = $10,
      level_required = $11, class_restrictions = $12, is_attack_spell = $13,
      damage_scaling_stat = $14, damage_scaling_factor = $15, healing_scaling_stat = $16, healing_scaling_factor = $17,
      updated_at = NOW()
    WHERE id = $18
    RETURNING *`,
    [
      updated.name,
      updated.mnemonic,
      updated.description || null,
      updated.spellType,
      updated.targetType,
      updated.manaCost,
      updated.damageDice || null,
      updated.healingDice || null,
      updated.statusEffect || null,
      updated.effectDuration || null,
      updated.levelRequired,
      updated.classRestrictions ?? [],
      updated.isAttackSpell,
      updated.damageScalingStat || null,
      updated.damageScalingFactor || null,
      updated.healingScalingStat || null,
      updated.healingScalingFactor || null,
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
