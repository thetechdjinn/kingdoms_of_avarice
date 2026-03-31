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
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('self', 'self_ally', 'enemy', 'ally', 'room')),

    -- Cost
    mana_cost INTEGER NOT NULL DEFAULT 0,

    -- Damage (offensive spells)
    min_damage INTEGER,
    max_damage INTEGER,

    -- Healing (healing spells)
    min_healing INTEGER,
    max_healing INTEGER,

    -- Multi-hit
    hits_per_cast INTEGER NOT NULL DEFAULT 1,

    -- Status effect (for buffs/debuffs)
    status_effect VARCHAR(50),  -- Effect ID to apply
    effect_duration INTEGER,    -- Duration in seconds

    -- Requirements
    level_required INTEGER NOT NULL DEFAULT 1,
    class_restrictions TEXT[],  -- Empty array = all classes, otherwise list of class names

    -- Combat behavior
    is_attack_spell BOOLEAN NOT NULL DEFAULT FALSE,  -- If true, replaces melee combat action

    -- Level scaling (% increase per caster level)
    scaling_per_level DECIMAL(4,3),  -- e.g., 0.100 = 10% per level
    max_scaling_level INTEGER,       -- Cap: scaling stops at this caster level (null = no cap)

    -- Stat scaling (% increase per 10 stat points)
    damage_scaling_stat VARCHAR(20) CHECK (damage_scaling_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma', 'intellect_wisdom')),
    damage_scaling_factor DECIMAL(4,3),  -- e.g., 0.020 = 2% per 10 points
    healing_scaling_stat VARCHAR(20) CHECK (healing_scaling_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma', 'intellect_wisdom')),
    healing_scaling_factor DECIMAL(4,3),  -- e.g., 0.020 = 2% per 10 points

    -- Fizzle mechanics
    cast_difficulty INTEGER NOT NULL DEFAULT 0,  -- 0 = always succeeds
    fizzle_message TEXT,           -- Custom fizzle message (caster sees)
    fizzle_message_room TEXT,      -- Custom fizzle message (room sees), supports {name}

    -- Custom spell messages (override defaults when set)
    hit_message_self TEXT,     -- Message to caster on hit
    hit_message_target TEXT,   -- Message to target on hit
    hit_message_room TEXT,     -- Message to room on hit

    -- NPC telegraph and save mechanics
    telegraph_message TEXT,
    save_stat VARCHAR(20) CHECK (save_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma', 'intellect_wisdom')),
    save_difficulty INTEGER DEFAULT 0,

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
