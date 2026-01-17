-- Status Effect Definitions Table
-- Stores the configuration for all status effects (buffs, debuffs, DoT, HoT, control)

CREATE TABLE IF NOT EXISTS status_effect_definitions (
    id VARCHAR(50) PRIMARY KEY,           -- e.g., 'poisoned', 'blessed'
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Classification
    category VARCHAR(20) NOT NULL CHECK (category IN ('buff', 'debuff', 'dot', 'hot', 'control')),
    stacking_behavior VARCHAR(20) NOT NULL CHECK (stacking_behavior IN ('replace', 'refresh', 'stack')),
    max_stacks INTEGER NOT NULL DEFAULT 1,

    -- Combat modifiers
    accuracy_modifier INTEGER DEFAULT 0,
    defense_modifier INTEGER DEFAULT 0,
    energy_modifier INTEGER DEFAULT 0,      -- Percentage
    damage_modifier INTEGER DEFAULT 0,      -- Percentage

    -- Periodic effects (DoT/HoT)
    tick_damage VARCHAR(20),                -- Dice notation e.g., '1d4'
    tick_healing VARCHAR(20),

    -- Messages
    tick_message VARCHAR(255),              -- Custom tick message
    silent_tick BOOLEAN DEFAULT FALSE,
    wear_off_message VARCHAR(255),

    -- Flags
    blocks_regen BOOLEAN DEFAULT FALSE,
    blocks_movement BOOLEAN DEFAULT FALSE,
    is_blind BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_effect_definitions_category ON status_effect_definitions(category);
