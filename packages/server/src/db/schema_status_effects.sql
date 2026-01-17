-- Status effects schema for Kingdoms of Avarice
-- Tracks active buffs, debuffs, and damage-over-time effects on characters

-- Character status effects table (active effects per character)
CREATE TABLE IF NOT EXISTS character_status_effects (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

    -- Effect identification (references code-based effect registry)
    effect_id VARCHAR(50) NOT NULL,

    -- Stacking (for effects like poison that can stack)
    stacks INTEGER NOT NULL DEFAULT 1,

    -- Timing
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Source tracking (optional)
    source_spell_id INTEGER REFERENCES spells(id) ON DELETE SET NULL,

    -- One instance per effect type per character
    UNIQUE(character_id, effect_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_character_status_effects_character ON character_status_effects(character_id);
CREATE INDEX IF NOT EXISTS idx_character_status_effects_expires ON character_status_effects(expires_at);
