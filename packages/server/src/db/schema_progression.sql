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
    
    -- Stat modifiers (applied to base stats)
    stat_modifiers JSONB DEFAULT '{}',
    
    -- Special traits/abilities granted by race
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
-- GAME EVENTS (Actions that generate XP and essence)
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    description TEXT,
    
    -- Tags this event emits
    emitted_tags TEXT[] DEFAULT '{}',
    
    -- Base values
    base_essence_value INTEGER DEFAULT 0,
    base_xp_value INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ABILITY DEFINITIONS (Skills, Spells, Techniques)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ability_definitions (
    id SERIAL PRIMARY KEY,
    ability_id VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Classification
    ability_type VARCHAR(50) NOT NULL,  -- 'skill', 'spell', 'technique', 'passive'
    
    -- Tags for essence generation when used
    emitted_tags TEXT[] DEFAULT '{}',
    
    -- Resource cost
    resource_cost INTEGER DEFAULT 0,
    resource_type VARCHAR(20),  -- 'mana', 'kai', 'stamina', etc.
    
    -- Cooldown (in seconds, 0 = no cooldown)
    cooldown INTEGER DEFAULT 0,
    
    -- Effect data (flexible JSONB for different ability types)
    effect_data JSONB DEFAULT '{}',
    
    -- Requirements to learn/use
    requirements JSONB DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TALENT DEFINITIONS (Purchasable with essence)
-- ============================================================================

CREATE TABLE IF NOT EXISTS talent_definitions (
    id SERIAL PRIMARY KEY,
    talent_id VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Restrictions
    class_restriction VARCHAR(50),  -- NULL = available to all
    
    -- Cost
    essence_cost INTEGER NOT NULL DEFAULT 0,
    
    -- Requirements
    prerequisite_level INTEGER DEFAULT 1,
    prerequisite_talents JSONB DEFAULT '[]',
    
    -- Effects
    effect_modifiers JSONB DEFAULT '{}',
    grants_ability VARCHAR(50) REFERENCES ability_definitions(ability_id) ON DELETE SET NULL,

    -- Tree positioning (for UI)
    tree_tier INTEGER DEFAULT 1,
    tree_position INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure JSONB arrays are actually arrays
    CONSTRAINT prerequisite_talents_is_array CHECK (jsonb_typeof(prerequisite_talents) = 'array')
);

-- ============================================================================
-- CLASS ABILITIES (Which abilities each class can learn)
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_abilities (
    id SERIAL PRIMARY KEY,
    class_id VARCHAR(50) NOT NULL REFERENCES class_definitions(class_id) ON DELETE CASCADE,
    ability_id VARCHAR(50) NOT NULL REFERENCES ability_definitions(ability_id) ON DELETE CASCADE,
    
    -- When this ability becomes available
    required_level INTEGER DEFAULT 1,
    
    -- Is it auto-learned or must be trained?
    auto_learn BOOLEAN DEFAULT FALSE,
    
    -- Training cost (if not auto-learned)
    training_cost INTEGER DEFAULT 0,
    
    UNIQUE(class_id, ability_id)
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
    
    -- Unlocked talents (array of talent_ids)
    unlocked_talents JSONB DEFAULT '[]'
        CHECK (jsonb_typeof(unlocked_talents) = 'array'),

    -- Learned abilities (array of ability_ids)
    learned_abilities JSONB DEFAULT '[]'
        CHECK (jsonb_typeof(learned_abilities) = 'array'),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ACTIVITY TRACKER (For diminishing returns)
-- ============================================================================

CREATE TABLE IF NOT EXISTS character_activity_tracker (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    event_id VARCHAR(50) NOT NULL REFERENCES game_events(event_id) ON DELETE CASCADE,
    count INTEGER DEFAULT 0,
    last_reset_level INTEGER DEFAULT 1,
    last_reset_region VARCHAR(50),

    UNIQUE(character_id, event_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_class_definitions_class_id ON class_definitions(class_id);
CREATE INDEX IF NOT EXISTS idx_class_definitions_playable ON class_definitions(playable);
CREATE INDEX IF NOT EXISTS idx_race_definitions_race_id ON race_definitions(race_id);
CREATE INDEX IF NOT EXISTS idx_race_definitions_playable ON race_definitions(playable);
CREATE INDEX IF NOT EXISTS idx_game_events_event_id ON game_events(event_id);
CREATE INDEX IF NOT EXISTS idx_game_events_tags ON game_events USING GIN(emitted_tags);
CREATE INDEX IF NOT EXISTS idx_ability_definitions_ability_id ON ability_definitions(ability_id);
CREATE INDEX IF NOT EXISTS idx_ability_definitions_type ON ability_definitions(ability_type);
CREATE INDEX IF NOT EXISTS idx_talent_definitions_talent_id ON talent_definitions(talent_id);
CREATE INDEX IF NOT EXISTS idx_talent_definitions_class ON talent_definitions(class_restriction);
CREATE INDEX IF NOT EXISTS idx_class_abilities_class ON class_abilities(class_id);
CREATE INDEX IF NOT EXISTS idx_class_abilities_ability ON class_abilities(ability_id);
CREATE INDEX IF NOT EXISTS idx_character_progression_character ON character_progression(character_id);
CREATE INDEX IF NOT EXISTS idx_character_activity_tracker_character ON character_activity_tracker(character_id);
