-- Kingdoms of Avarice Database Schema

-- Players table (account level)
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
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
    current_room_id INTEGER DEFAULT 1,
    gold INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    area VARCHAR(100)
);

-- Room exits
CREATE TABLE IF NOT EXISTS room_exits (
    id SERIAL PRIMARY KEY,
    from_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    to_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,
    UNIQUE(from_room_id, direction)
);

-- Items table (item templates)
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    item_type VARCHAR(50),
    weight INTEGER DEFAULT 0,
    value INTEGER DEFAULT 0,
    damage_min INTEGER,
    damage_max INTEGER,
    armor INTEGER,
    stat_bonuses JSONB
);

-- Character inventory
CREATE TABLE IF NOT EXISTS character_inventory (
    id SERIAL PRIMARY KEY,
    character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id),
    quantity INTEGER DEFAULT 1,
    equipped BOOLEAN DEFAULT FALSE
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_characters_player_id ON characters(player_id);
CREATE INDEX IF NOT EXISTS idx_characters_current_room ON characters(current_room_id);
CREATE INDEX IF NOT EXISTS idx_room_exits_from_room ON room_exits(from_room_id);
CREATE INDEX IF NOT EXISTS idx_character_inventory_character ON character_inventory(character_id);
CREATE INDEX IF NOT EXISTS idx_npc_instances_room ON npc_instances(current_room_id);
CREATE INDEX IF NOT EXISTS idx_player_roles_player ON player_roles(player_id);
CREATE INDEX IF NOT EXISTS idx_player_roles_role ON player_roles(role_id);
