-- Spell system schema for Kingdoms of Avarice

-- Spell type enumeration (stored as text for flexibility)
-- Types: offensive, healing, buff, debuff, utility

-- Spell target type enumeration
-- Targets: self, enemy, ally, room

-- Spells table (spell definitions)
CREATE TABLE IF NOT EXISTS spells (
    id SERIAL PRIMARY KEY,

    -- Identity
    name VARCHAR(100) NOT NULL,
    mnemonic VARCHAR(10) NOT NULL,  -- Command shortcut (e.g., 'mmis', 'heal')
    description TEXT,

    -- Classification
    spell_type VARCHAR(20) NOT NULL CHECK (spell_type IN ('offensive', 'healing', 'buff', 'debuff', 'utility')),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('self', 'enemy', 'ally', 'room')),

    -- Cost
    mana_cost INTEGER NOT NULL DEFAULT 0,

    -- Effects (dice notation for damage/healing, e.g., '2d6+4')
    damage_dice VARCHAR(20),    -- For offensive spells
    healing_dice VARCHAR(20),   -- For healing spells

    -- Status effect (for buffs/debuffs)
    status_effect VARCHAR(50),  -- Effect ID to apply
    effect_duration INTEGER,    -- Duration in seconds

    -- Requirements
    level_required INTEGER NOT NULL DEFAULT 1,
    class_restrictions TEXT[],  -- Empty array = all classes, otherwise list of class names

    -- Combat behavior
    is_attack_spell BOOLEAN NOT NULL DEFAULT FALSE,  -- If true, replaces melee combat action

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Character spells (learned spells per character)
CREATE TABLE IF NOT EXISTS character_spells (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    spell_id INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
    learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: character can only learn a spell once
    UNIQUE(character_id, spell_id)
);

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_spells_mnemonic_lower ON spells(LOWER(mnemonic));  -- Case-insensitive unique
CREATE INDEX IF NOT EXISTS idx_spells_type ON spells(spell_type);
CREATE INDEX IF NOT EXISTS idx_spells_class ON spells USING GIN(class_restrictions);
CREATE INDEX IF NOT EXISTS idx_spells_level_name ON spells(level_required, name);  -- For sorted listings
CREATE INDEX IF NOT EXISTS idx_character_spells_character ON character_spells(character_id);
CREATE INDEX IF NOT EXISTS idx_character_spells_spell ON character_spells(spell_id);
