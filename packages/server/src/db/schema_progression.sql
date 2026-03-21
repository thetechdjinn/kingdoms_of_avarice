-- ============================================================================
-- MASTERY EXCHANGE & PROGRESSION SYSTEM (MEPS) - Database Schema
-- ============================================================================

-- ============================================================================
-- RACE DEFINITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS race_definitions (
    id SERIAL PRIMARY KEY,
    race_id VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Base stats with min (starting) and max (cap) values
    -- Format: {"strength": {"min": 40, "max": 100}, "agility": {...}, ...}
    base_stats JSONB DEFAULT '{}',

    -- Legacy stat modifiers (deprecated, use base_stats instead)
    stat_modifiers JSONB DEFAULT '{}',

    -- Special traits/abilities granted by race
    -- Format: [{"id": "night_vision", "value": 80}, {"id": "stealth", "value": true}, ...]
    traits JSONB DEFAULT '[]',

    -- Restrictions
    allowed_classes JSONB DEFAULT '[]',  -- Empty = all classes allowed

    -- Display
    playable BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure JSONB arrays are actually arrays
    CONSTRAINT traits_is_array CHECK (jsonb_typeof(traits) = 'array'),
    CONSTRAINT allowed_classes_is_array CHECK (jsonb_typeof(allowed_classes) = 'array')
);

-- ============================================================================
-- CLASS DEFINITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_definitions (
    id SERIAL PRIMARY KEY,
    class_id VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Progression
    essence_multiplier NUMERIC(4,2) DEFAULT 1.0,
    subscribed_tags TEXT[] DEFAULT '{}',
    
    -- Base stats for this class
    base_stats JSONB DEFAULT '{}',
    
    -- Reference to talent tree
    talent_tree_id VARCHAR(50),

    -- Resource type (mana, kai, rage, etc.)
    resource_type VARCHAR(20) DEFAULT 'none',

    -- Critical hit bonus (flat % bonus, e.g., 10 for Ninja/Mystic)
    crit_bonus INTEGER DEFAULT 0,

    -- Display
    playable BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PROGRESSION TABLE (Global level requirements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS progression_table (
    id SERIAL PRIMARY KEY,
    level INTEGER UNIQUE NOT NULL,
    std_xp_required INTEGER NOT NULL,
    base_essence_required INTEGER NOT NULL,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CHARACTER PROGRESSION STATE
-- ============================================================================

CREATE TABLE IF NOT EXISTS character_progression (
    id SERIAL PRIMARY KEY,
    character_id INTEGER UNIQUE NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    class_id VARCHAR(50) NOT NULL REFERENCES class_definitions(class_id),
    
    -- XP tracking
    std_xp INTEGER DEFAULT 0,
    
    -- Essence tracking
    essence_earned_this_level INTEGER DEFAULT 0,
    essence_wallet INTEGER DEFAULT 0,
    total_essence_earned INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_class_definitions_class_id ON class_definitions(class_id);
CREATE INDEX IF NOT EXISTS idx_class_definitions_playable ON class_definitions(playable);
CREATE INDEX IF NOT EXISTS idx_race_definitions_race_id ON race_definitions(race_id);
CREATE INDEX IF NOT EXISTS idx_race_definitions_playable ON race_definitions(playable);
CREATE INDEX IF NOT EXISTS idx_character_progression_character ON character_progression(character_id);
