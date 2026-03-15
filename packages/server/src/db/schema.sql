-- Kingdoms of Avarice Database Schema

-- Players table (account level)
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    max_characters INTEGER,  -- NULL = use global default from game_settings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    brief_mode BOOLEAN DEFAULT FALSE,
    current_room_id INTEGER DEFAULT 1
);

-- Characters table (one player can have multiple characters)
CREATE TABLE IF NOT EXISTS characters (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    name VARCHAR(50) UNIQUE NOT NULL,
    last_name VARCHAR(50),
    race VARCHAR(50) NOT NULL,
    class VARCHAR(50) NOT NULL,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    health INTEGER NOT NULL,
    max_health INTEGER NOT NULL,
    mana INTEGER DEFAULT 0,
    max_mana INTEGER DEFAULT 0,
    strength INTEGER NOT NULL,
    intelligence INTEGER NOT NULL,
    dexterity INTEGER NOT NULL,
    constitution INTEGER NOT NULL,
    wisdom INTEGER NOT NULL DEFAULT 10,
    charisma INTEGER NOT NULL DEFAULT 10,
    current_room_id INTEGER DEFAULT 1,
    gold INTEGER DEFAULT 0,
    -- Character Points (CP) system
    unspent_cp INTEGER DEFAULT 100,  -- CP available to spend on stats
    cp_spent JSONB DEFAULT '{}',     -- Points spent per stat: {"strength": 10, "agility": 5, ...}
    -- Appearance fields
    gender VARCHAR(10) DEFAULT 'male',
    hair VARCHAR(100),
    eye_color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    area VARCHAR(100),
    terrain VARCHAR(20) DEFAULT 'indoor',
    features JSONB DEFAULT '{}',
    tag VARCHAR(100)
);

-- Room exits
CREATE TABLE IF NOT EXISTS room_exits (
    id SERIAL PRIMARY KEY,
    from_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    to_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,
    UNIQUE(from_room_id, direction)
);

-- Doors (connections between rooms with various mechanics)
CREATE TABLE IF NOT EXISTS doors (
    id SERIAL PRIMARY KEY,

    -- Identity
    name VARCHAR(100) NOT NULL,
    door_type VARCHAR(50) NOT NULL CHECK (door_type IN (
        'open_passageway',
        'physical',
        'special',
        'triggered_passageway',
        'temporary_portal'
    )),
    description TEXT,

    -- Connection (entry side is required, exit side is optional for one-way doors)
    entry_room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    entry_direction VARCHAR(20) NOT NULL,
    exit_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    exit_direction VARCHAR(20),

    -- State (for physical doors)
    default_state VARCHAR(20) DEFAULT 'closed' CHECK (default_state IN ('open', 'closed', 'locked')),

    -- Auto-reset timer (NULL = no auto-reset, otherwise seconds until door resets to default_state)
    auto_reset_seconds INTEGER DEFAULT 120,

    -- Lock properties (for physical doors)
    has_lock BOOLEAN DEFAULT FALSE,
    key_item_tag VARCHAR(100),  -- Tag that matches item's key_tag in flags to unlock
    pick_difficulty_min INTEGER DEFAULT 0,  -- 0-500+, minimum lockpicking skill needed (below = auto-fail)
    pick_difficulty_max INTEGER DEFAULT 0,  -- 0-500+, lockpicking skill for guaranteed success (500+ = unpickable)
    bash_difficulty INTEGER DEFAULT 0,  -- 0-500+, difficulty to bash door (500+ = unbashable)

    -- Visibility
    is_hidden BOOLEAN DEFAULT FALSE,

    -- Trigger text (for special doors, triggered passageways, temporary portals)
    trigger_text VARCHAR(100),

    -- Passage messages
    passage_message_self TEXT,
    passage_message_room TEXT,

    -- Special door display (how it appears on "Also here:" line)
    item_display_name VARCHAR(100),

    -- Temporary portal properties
    is_temporary BOOLEAN DEFAULT FALSE,           -- If true, portal must be spawned before use
    spawn_trigger_text VARCHAR(100),              -- Text to speak to spawn the portal (e.g., "Valar Morghulis")
    duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    appear_message TEXT,                          -- Custom message when portal spawns (e.g., "A portal tears open reality!")
    disappear_message TEXT,                       -- Custom message when portal expires (e.g., "The portal collapses!")

    -- Permission requirements (Phase 10)
    required_level INTEGER,                       -- Minimum character level to use this door (NULL = no requirement)
    max_level INTEGER,                            -- Maximum character level to use this door (NULL = no requirement)
    required_classes TEXT[],                      -- Array of class IDs that can use this door (NULL/empty = no restriction)
    required_quest_flag VARCHAR(100),             -- Quest flag that must be completed (NULL = no requirement)
    required_item_tag VARCHAR(100),               -- Item tag that must be in inventory (NULL = no requirement, item not consumed)
    denial_message TEXT,                          -- Custom message when permission check fails

    -- Ensure temporary portals have required spawn trigger text
    CONSTRAINT temporary_portal_requires_spawn_trigger CHECK (
        is_temporary = FALSE OR spawn_trigger_text IS NOT NULL
    ),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure entry direction is unique per room (one door per direction)
    UNIQUE(entry_room_id, entry_direction)
);

-- Item templates (blueprints for items)
CREATE TABLE IF NOT EXISTS item_templates (
    id SERIAL PRIMARY KEY,
    
    -- Identity & Description
    name VARCHAR(100) NOT NULL,
    short_desc VARCHAR(255) NOT NULL,
    long_desc TEXT,
    room_desc VARCHAR(255),
    keywords TEXT[] NOT NULL DEFAULT '{}',
    
    -- Physical Properties
    weight INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 1,
    base_value INTEGER NOT NULL DEFAULT 0,
    
    -- Classification
    item_type VARCHAR(50) NOT NULL,
    equipment_slot VARCHAR(50),
    
    -- Flags
    flags JSONB NOT NULL DEFAULT '{}',
    
    -- Stacking
    max_stack INTEGER DEFAULT 1,
    
    -- Container Properties
    container_capacity INTEGER,
    container_weight_limit INTEGER,
    
    -- Type-specific data (JSONB for flexibility)
    weapon_data JSONB,
    armor_data JSONB,
    consumable_data JSONB,
    light_data JSONB,
    tool_data JSONB,
    
    -- Requirements & Modifiers
    requirements JSONB,
    stat_modifiers JSONB,

    -- Stealth modifier (negative for heavy armor, positive for stealth gear)
    stealth_modifier INTEGER DEFAULT 0,

    -- Rarity and world limits
    rarity VARCHAR(20) DEFAULT 'common',
    max_in_world INTEGER,

    -- Future extensibility
    effect_slots INTEGER DEFAULT 0,
    base_effects JSONB,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crafting recipes
CREATE TABLE IF NOT EXISTS crafting_recipes (
    id SERIAL PRIMARY KEY,
    
    -- Result
    result_template_id INTEGER NOT NULL REFERENCES item_templates(id) ON DELETE CASCADE,
    result_quantity INTEGER NOT NULL DEFAULT 1,
    
    -- Recipe info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    skill_type VARCHAR(50), -- blacksmithing, alchemy, tailoring, etc.
    skill_level INTEGER DEFAULT 0, -- minimum skill required
    
    -- Crafting requirements
    ingredients JSONB NOT NULL DEFAULT '[]', -- Array of {template_id, quantity}
    tools_required JSONB DEFAULT '[]', -- Array of template_ids that must be in inventory (not consumed)
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Validation constraint for ingredients structure
    CONSTRAINT valid_ingredients CHECK (jsonb_typeof(ingredients) = 'array')
);

-- Enchantment definitions
CREATE TABLE IF NOT EXISTS enchantments (
    id SERIAL PRIMARY KEY,
    
    -- Identity
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Requirements
    skill_type VARCHAR(50) DEFAULT 'enchanting',
    skill_level INTEGER DEFAULT 0,
    applicable_types TEXT[] DEFAULT '{}', -- item types this can be applied to
    
    -- Effects
    stat_modifiers JSONB, -- stat bonuses when equipped
    special_effects JSONB, -- special abilities/procs
    
    -- Cost
    mana_cost INTEGER DEFAULT 0,
    reagents JSONB, -- Array of {template_id, quantity} consumed
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Item instances (actual items in the game world)
CREATE TABLE IF NOT EXISTS item_instances (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES item_templates(id) ON DELETE CASCADE,
    
    -- Location (polymorphic - references different tables based on location_type)
    -- Note: Traditional FK constraints cannot be used with polymorphic associations.
    -- Valid location_types: 'room' -> rooms.id, 'player' -> characters.id (inventory),
    --                       'equipped' -> characters.id, 'container' -> item_instances.id
    -- Referential integrity is enforced at the application layer.
    location_type VARCHAR(50) NOT NULL CHECK (location_type IN ('room', 'player', 'equipped', 'container')),
    location_id INTEGER NOT NULL,
    equipped_slot VARCHAR(50),
    
    -- Instance-specific state
    quantity INTEGER NOT NULL DEFAULT 1,
    condition VARCHAR(50) DEFAULT 'pristine',
    
    -- Consumable state
    charges_remaining INTEGER,
    fuel_remaining INTEGER,
    
    -- Custom modifications
    custom_data JSONB DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NPCs table (NPC templates)
CREATE TABLE IF NOT EXISTS npcs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    spawn_room_id INTEGER REFERENCES rooms(id),
    health INTEGER,
    max_health INTEGER,
    hostile BOOLEAN DEFAULT FALSE,
    respawn_time INTEGER,
    level INTEGER DEFAULT 1,
    experience_reward INTEGER DEFAULT 0,
    gold_min INTEGER DEFAULT 0,
    gold_max INTEGER DEFAULT 0,
    proper_name BOOLEAN DEFAULT FALSE
);

-- NPC instances (spawned NPCs in the world)
CREATE TABLE IF NOT EXISTS npc_instances (
    id SERIAL PRIMARY KEY,
    npc_id INTEGER REFERENCES npcs(id) ON DELETE CASCADE,
    current_room_id INTEGER REFERENCES rooms(id),
    current_health INTEGER,
    current_mana INTEGER DEFAULT 0,
    augmentation VARCHAR(100),
    spawned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NPC attacks (per-template attack definitions)
CREATE TABLE IF NOT EXISTS npc_attacks (
    id SERIAL PRIMARY KEY,
    npc_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
    attack_type VARCHAR(50) NOT NULL DEFAULT 'melee',
    name VARCHAR(100) NOT NULL,
    min_damage INTEGER NOT NULL DEFAULT 1 CHECK (min_damage >= 0),
    max_damage INTEGER NOT NULL DEFAULT 4 CHECK (max_damage >= min_damage),
    attacks_per_round INTEGER NOT NULL DEFAULT 1 CHECK (attacks_per_round >= 1),
    percentage INTEGER NOT NULL DEFAULT 100 CHECK (percentage >= 0 AND percentage <= 100),
    mana_cost INTEGER DEFAULT 0 CHECK (mana_cost >= 0),
    hit_message TEXT,
    miss_message TEXT,
    hit_verb VARCHAR(50) DEFAULT 'hit',
    hit_verb_3p VARCHAR(50) DEFAULT 'hits',
    miss_verb VARCHAR(50) DEFAULT 'swing at',
    miss_verb_3p VARCHAR(50) DEFAULT 'swings at'
);

-- Drop tables (loot table definitions)
CREATE TABLE IF NOT EXISTS drop_tables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

-- Drop table entries (items in a loot table)
CREATE TABLE IF NOT EXISTS drop_table_entries (
    id SERIAL PRIMARY KEY,
    drop_table_id INTEGER NOT NULL REFERENCES drop_tables(id) ON DELETE CASCADE,
    item_template_id INTEGER REFERENCES item_templates(id) ON DELETE CASCADE,
    drop_chance DECIMAL(5,2) NOT NULL DEFAULT 100.00 CHECK (drop_chance >= 0 AND drop_chance <= 100),
    min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 0),
    max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= min_quantity),
    currency_min INTEGER DEFAULT 0 CHECK (currency_min >= 0),
    currency_max INTEGER DEFAULT 0 CHECK (currency_max >= currency_min)
);

-- Roles table for RBAC
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0
);

-- Player roles junction table (players can have multiple roles)
CREATE TABLE IF NOT EXISTS player_roles (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER REFERENCES players(id),
    UNIQUE(player_id, role_id)
);

-- Game settings (key-value store for global configuration)
CREATE TABLE IF NOT EXISTS game_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IP access control (allowlist/blocklist)
CREATE TABLE IF NOT EXISTS ip_access (
    id SERIAL PRIMARY KEY,
    entry TEXT NOT NULL UNIQUE,           -- IP address OR hostname
    entry_type TEXT NOT NULL CHECK (entry_type IN ('ip', 'hostname')),
    resolved_ips TEXT[],                   -- Cached resolved IPs for hostnames
    resolved_at TIMESTAMP WITH TIME ZONE,  -- When DNS was last resolved
    list_type TEXT NOT NULL CHECK (list_type IN ('allow', 'block')),
    reason TEXT,
    created_by INTEGER REFERENCES players(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Merchant inventory (stock for merchant NPCs)
CREATE TABLE IF NOT EXISTS merchant_inventory (
    id SERIAL PRIMARY KEY,
    npc_template_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
    item_template_id INTEGER NOT NULL REFERENCES item_templates(id) ON DELETE CASCADE,
    max_stock INTEGER NOT NULL DEFAULT 10 CHECK (max_stock >= 0),
    current_stock INTEGER NOT NULL DEFAULT 10 CHECK (current_stock >= 0 AND current_stock <= max_stock),
    restock_chance INTEGER NOT NULL DEFAULT 100 CHECK (restock_chance >= 1 AND restock_chance <= 100),
    UNIQUE(npc_template_id, item_template_id)
);

-- Factions (city, tribal, merchant, guild groups)
CREATE TABLE IF NOT EXISTS factions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    faction_type VARCHAR(50) NOT NULL DEFAULT 'merchant' CHECK (faction_type IN ('city', 'tribal', 'merchant', 'guild')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NPC-to-faction assignments (many-to-many)
CREATE TABLE IF NOT EXISTS npc_factions (
    id SERIAL PRIMARY KEY,
    npc_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
    faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
    UNIQUE(npc_id, faction_id)
);

-- Player reputation with factions
CREATE TABLE IF NOT EXISTS player_faction_reputation (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
    reputation INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, faction_id)
);

-- Merchant responses (keyword-triggered NPC responses for directed speech)
CREATE TABLE IF NOT EXISTS merchant_responses (
    id SERIAL PRIMARY KEY,
    npc_template_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
    trigger_keywords TEXT[] NOT NULL,
    response TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_characters_player_id ON characters(player_id);
CREATE INDEX IF NOT EXISTS idx_characters_current_room ON characters(current_room_id);
CREATE INDEX IF NOT EXISTS idx_room_exits_from_room ON room_exits(from_room_id);
CREATE INDEX IF NOT EXISTS idx_item_templates_type ON item_templates(item_type);
CREATE INDEX IF NOT EXISTS idx_item_templates_slot ON item_templates(equipment_slot);
CREATE INDEX IF NOT EXISTS idx_item_templates_keywords ON item_templates USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_item_instances_template ON item_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_item_instances_location ON item_instances(location_type, location_id);
CREATE INDEX IF NOT EXISTS idx_npc_instances_room ON npc_instances(current_room_id);
CREATE INDEX IF NOT EXISTS idx_player_roles_player ON player_roles(player_id);
CREATE INDEX IF NOT EXISTS idx_player_roles_role ON player_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_ip_access_list_type ON ip_access(list_type);
CREATE INDEX IF NOT EXISTS idx_ip_access_entry_type ON ip_access(entry_type);
CREATE INDEX IF NOT EXISTS idx_doors_entry_room ON doors(entry_room_id);
CREATE INDEX IF NOT EXISTS idx_doors_exit_room ON doors(exit_room_id);
CREATE INDEX IF NOT EXISTS idx_doors_type ON doors(door_type);
CREATE INDEX IF NOT EXISTS idx_npc_attacks_npc ON npc_attacks(npc_id);
CREATE INDEX IF NOT EXISTS idx_drop_table_entries_table ON drop_table_entries(drop_table_id);
CREATE INDEX IF NOT EXISTS idx_merchant_inventory_npc ON merchant_inventory(npc_template_id);
CREATE INDEX IF NOT EXISTS idx_npc_factions_npc ON npc_factions(npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_factions_faction ON npc_factions(faction_id);
CREATE INDEX IF NOT EXISTS idx_player_faction_rep_character ON player_faction_reputation(character_id);
CREATE INDEX IF NOT EXISTS idx_player_faction_rep_faction ON player_faction_reputation(faction_id);
CREATE INDEX IF NOT EXISTS idx_merchant_responses_npc ON merchant_responses(npc_template_id);
