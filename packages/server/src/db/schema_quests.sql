-- Quest system schema for Kingdoms of Avarice
-- Step-based quest workflow: discover, accept, progress, complete

-- Quest definitions
CREATE TABLE IF NOT EXISTS quests (
    id SERIAL PRIMARY KEY,
    tag VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    quest_giver_npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,

    -- Prerequisites
    min_level INTEGER DEFAULT 1,
    max_level INTEGER,
    required_races TEXT[],
    required_classes TEXT[],
    required_faction_id INTEGER REFERENCES factions(id) ON DELETE SET NULL,
    required_faction_min INTEGER,
    required_faction_max INTEGER,
    required_quest_ids INTEGER[] DEFAULT '{}',
    required_quest_tags TEXT[] DEFAULT '{}',

    -- Completion rewards
    xp_reward INTEGER DEFAULT 0,
    essence_reward INTEGER DEFAULT 0,
    currency_reward BIGINT DEFAULT 0,
    item_rewards JSONB DEFAULT '[]',
    faction_rewards JSONB DEFAULT '[]',
    quest_flag VARCHAR(100),

    -- Dialogue
    denial_dialogue TEXT,
    completed_dialogue TEXT,

    -- Metadata
    enabled BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ordered steps within a quest
CREATE TABLE IF NOT EXISTS quest_steps (
    id SERIAL PRIMARY KEY,
    quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,

    -- Trigger definition
    trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('talk', 'kill', 'visit')),
    trigger_npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,
    trigger_item_template_id INTEGER REFERENCES item_templates(id) ON DELETE SET NULL,
    trigger_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    trigger_text VARCHAR(200),
    required_count INTEGER DEFAULT 1,
    consume_item BOOLEAN DEFAULT TRUE,

    -- Display
    description TEXT NOT NULL,
    completion_dialogue TEXT,
    in_progress_dialogue TEXT,

    -- Per-step rewards (optional)
    step_xp_reward INTEGER DEFAULT 0,
    step_essence_reward INTEGER DEFAULT 0,
    step_currency_reward BIGINT DEFAULT 0,
    step_item_rewards JSONB DEFAULT '[]',
    step_faction_rewards JSONB DEFAULT '[]',

    UNIQUE(quest_id, step_order)
);

-- Per-character quest state
CREATE TABLE IF NOT EXISTS character_quests (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    current_step INTEGER NOT NULL DEFAULT 1,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    UNIQUE(character_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_character_quests_char ON character_quests(character_id);
CREATE INDEX IF NOT EXISTS idx_character_quests_active ON character_quests(character_id, status) WHERE status = 'active';

-- Kill counting for quest steps
CREATE TABLE IF NOT EXISTS character_quest_progress (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    quest_step_id INTEGER NOT NULL REFERENCES quest_steps(id) ON DELETE CASCADE,
    current_count INTEGER DEFAULT 0,

    UNIQUE(character_id, quest_step_id)
);

-- Completed quest flags (for doors, content gates)
CREATE TABLE IF NOT EXISTS character_quest_flags (
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    flag VARCHAR(100) NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (character_id, flag)
);
