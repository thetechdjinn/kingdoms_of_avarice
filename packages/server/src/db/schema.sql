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
    gender VARCHAR(10) DEFAULT 'neutral',
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
    terrain VARCHAR(20) DEFAULT 'indoor'
);

-- Room exits
CREATE TABLE IF NOT EXISTS room_exits (
    id SERIAL PRIMARY KEY,
    from_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    to_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,
    UNIQUE(from_room_id, direction)
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
    
    -- Requirements & Modifiers
    requirements JSONB,
    stat_modifiers JSONB,
    
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
    -- Valid location_types: 'room' -> rooms.id, 'player' -> players.id, 
    --                       'equipped' -> players.id, 'container' -> item_instances.id
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
    gold_max INTEGER DEFAULT 0
);

-- NPC instances (spawned NPCs in the world)
CREATE TABLE IF NOT EXISTS npc_instances (
    id SERIAL PRIMARY KEY,
    npc_id INTEGER REFERENCES npcs(id) ON DELETE CASCADE,
    current_room_id INTEGER REFERENCES rooms(id),
    current_health INTEGER,
    spawned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
