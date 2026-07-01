-- ============================================================================
-- Kingdoms of Avarice - Consolidated libSQL/SQLite Schema (Phase 2.2)
-- ============================================================================
-- This file is the consolidated libSQL/Turso schema generated for Phase 2.2,
-- translated from the live PostgreSQL `pg_dump --schema-only` output.
--
-- Notes:
--   * All PostgreSQL `text[]`/`ARRAY` and `jsonb`/`json` columns are stored as
--     TEXT here and hold JSON-encoded values at runtime (e.g. '[]', '{}', or a
--     JSON array/object string). Array/jsonb defaults are translated to the
--     equivalent JSON string literals.
--   * Postgres sequences + `ALTER COLUMN id SET DEFAULT nextval(...)` +
--     `..._pkey PRIMARY KEY (id)` are folded into `id INTEGER PRIMARY KEY
--     AUTOINCREMENT` inline.
--   * Primary keys, foreign keys, unique constraints, and check constraints
--     that pg_dump emitted as separate `ALTER TABLE` statements are folded
--     inline (SQLite cannot ALTER TABLE ADD CONSTRAINT).
--   * GIN indexes are dropped (unsupported); btree indexes are kept without
--     `USING btree`. Partial and expression indexes are preserved.
--   * The single plpgsql `updated_at` trigger (on status_effect_definitions)
--     is reimplemented as a SQLite AFTER UPDATE trigger.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- actions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,
    description TEXT,
    first_person_no_target TEXT NOT NULL,
    room_no_target TEXT NOT NULL,
    first_person_with_target TEXT,
    target_perspective TEXT,
    room_with_target TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- character_inventory
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER,
    item_id INTEGER,
    quantity INTEGER DEFAULT 1,
    equipped INTEGER DEFAULT 0,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- ----------------------------------------------------------------------------
-- character_progression
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_progression (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    class_id TEXT NOT NULL,
    std_xp INTEGER DEFAULT 0,
    essence_earned_this_level INTEGER DEFAULT 0,
    essence_wallet INTEGER DEFAULT 0,
    total_essence_earned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (character_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- character_quest_flags
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_quest_flags (
    character_id INTEGER NOT NULL,
    flag TEXT NOT NULL,
    granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id, flag),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- character_quest_progress
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_quest_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    quest_step_id INTEGER NOT NULL,
    current_count INTEGER DEFAULT 0,
    UNIQUE (character_id, quest_step_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (quest_step_id) REFERENCES quest_steps(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- character_quests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    quest_id INTEGER NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    current_step INTEGER DEFAULT 1 NOT NULL,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    UNIQUE (character_id, quest_id),
    CONSTRAINT character_quests_status_check CHECK (status IN ('active', 'completed')),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- character_spells
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_spells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    spell_id INTEGER NOT NULL,
    learned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (character_id, spell_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (spell_id) REFERENCES spells(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- character_status_effects
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_status_effects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    effect_id TEXT NOT NULL,
    stacks INTEGER DEFAULT 1 NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TEXT NOT NULL,
    source_spell_id INTEGER,
    UNIQUE (character_id, effect_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (source_spell_id) REFERENCES spells(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- characters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER,
    name TEXT NOT NULL,
    race TEXT NOT NULL,
    class TEXT NOT NULL,
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    wisdom INTEGER DEFAULT 10 NOT NULL,
    charisma INTEGER DEFAULT 10 NOT NULL,
    unspent_cp INTEGER DEFAULT 100,
    cp_spent TEXT DEFAULT '{}',
    gender TEXT DEFAULT 'male',
    hair TEXT,
    eye_color TEXT,
    last_name TEXT,
    copper INTEGER DEFAULT 0,
    silver INTEGER DEFAULT 0,
    platinum INTEGER DEFAULT 0,
    runic INTEGER DEFAULT 0,
    bank_balance INTEGER DEFAULT 0,
    initial_training_complete INTEGER DEFAULT 0,
    UNIQUE (name),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- class_definitions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    essence_multiplier REAL DEFAULT 1.0,
    subscribed_tags TEXT DEFAULT '[]',
    base_stats TEXT DEFAULT '{}',
    talent_tree_id TEXT,
    resource_type TEXT DEFAULT 'none',
    playable INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    combat_level INTEGER DEFAULT 3,
    magic_level INTEGER DEFAULT 0,
    magic_school TEXT,
    crit_bonus INTEGER DEFAULT 0,
    dodge_bonus INTEGER DEFAULT 0,
    backstab_accuracy_bonus INTEGER DEFAULT 0,
    armor_type_restrictions TEXT DEFAULT '[]',
    traits TEXT DEFAULT '[]',
    stealth INTEGER DEFAULT 0,
    special_abilities TEXT DEFAULT '[]',
    hp_adj INTEGER DEFAULT 0,
    hp_per_level_min INTEGER DEFAULT 4,
    hp_per_level_max INTEGER DEFAULT 7,
    UNIQUE (class_id)
);

-- ----------------------------------------------------------------------------
-- crafting_recipes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crafting_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_template_id INTEGER NOT NULL,
    result_quantity INTEGER DEFAULT 1 NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    skill_type TEXT,
    skill_level INTEGER DEFAULT 0,
    ingredients TEXT NOT NULL,
    tools_required TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_template_id) REFERENCES item_templates(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- doors
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    door_type TEXT NOT NULL,
    description TEXT,
    entry_room_id INTEGER NOT NULL,
    entry_direction TEXT NOT NULL,
    exit_room_id INTEGER,
    exit_direction TEXT,
    default_state TEXT DEFAULT 'closed',
    is_hidden INTEGER DEFAULT 0,
    trigger_text TEXT,
    passage_message_self TEXT,
    passage_message_room TEXT,
    item_display_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    bash_difficulty INTEGER DEFAULT 0,
    is_temporary INTEGER DEFAULT 0,
    spawn_trigger_text TEXT,
    duration_seconds INTEGER,
    appear_message TEXT,
    disappear_message TEXT,
    required_level INTEGER,
    required_classes TEXT,
    required_quest_flag TEXT,
    required_item_tag TEXT,
    denial_message TEXT,
    has_lock INTEGER DEFAULT 0,
    key_item_tag TEXT,
    pick_difficulty_min INTEGER DEFAULT 0,
    pick_difficulty_max INTEGER DEFAULT 0,
    display_name TEXT,
    auto_reset_seconds INTEGER DEFAULT 120,
    max_level INTEGER,
    passage_message_arrival TEXT,
    UNIQUE (entry_room_id, entry_direction),
    CONSTRAINT doors_default_state_check CHECK (default_state IN ('open', 'closed', 'locked')),
    CONSTRAINT doors_door_type_check CHECK (door_type IN ('open_passageway', 'physical', 'special', 'triggered_passageway', 'temporary_portal')),
    CONSTRAINT doors_duration_seconds_check CHECK ((duration_seconds IS NULL) OR (duration_seconds > 0)),
    CONSTRAINT temporary_portal_requires_spawn_trigger CHECK ((is_temporary = 0) OR (spawn_trigger_text IS NOT NULL)),
    FOREIGN KEY (entry_room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (exit_room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- drop_table_entries
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drop_table_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drop_table_id INTEGER NOT NULL,
    item_template_id INTEGER,
    drop_chance REAL DEFAULT 100.00 NOT NULL,
    min_quantity INTEGER DEFAULT 1 NOT NULL,
    max_quantity INTEGER DEFAULT 1 NOT NULL,
    currency_min INTEGER DEFAULT 0,
    currency_max INTEGER DEFAULT 0,
    allowed_denominations TEXT DEFAULT '["copper","silver","gold","platinum","runic"]',
    CONSTRAINT drop_table_entries_check CHECK (max_quantity >= min_quantity),
    CONSTRAINT drop_table_entries_check1 CHECK (currency_max >= currency_min),
    CONSTRAINT drop_table_entries_currency_min_check CHECK (currency_min >= 0),
    CONSTRAINT drop_table_entries_drop_chance_check CHECK ((drop_chance >= 0) AND (drop_chance <= 100)),
    CONSTRAINT drop_table_entries_min_quantity_check CHECK (min_quantity >= 0),
    FOREIGN KEY (drop_table_id) REFERENCES drop_tables(id) ON DELETE CASCADE,
    FOREIGN KEY (item_template_id) REFERENCES item_templates(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- drop_tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drop_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
);

-- ----------------------------------------------------------------------------
-- enchantments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enchantments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    skill_type TEXT DEFAULT 'enchanting',
    skill_level INTEGER DEFAULT 0,
    applicable_types TEXT DEFAULT '[]',
    stat_modifiers TEXT,
    special_effects TEXT,
    mana_cost INTEGER DEFAULT 0,
    reagents TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- essence_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS essence_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    display_name TEXT,
    description TEXT,
    emitted_tags TEXT DEFAULT '[]',
    base_essence_value INTEGER DEFAULT 0,
    base_xp_value INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id)
);

-- ----------------------------------------------------------------------------
-- factions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS factions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    faction_type TEXT DEFAULT 'merchant' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name),
    CONSTRAINT factions_faction_type_check CHECK (faction_type IN ('city', 'tribal', 'merchant', 'guild'))
);

-- ----------------------------------------------------------------------------
-- game_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_settings (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- ip_access
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ip_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    resolved_ips TEXT,
    resolved_at TEXT,
    list_type TEXT NOT NULL,
    reason TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (entry),
    CONSTRAINT ip_access_entry_type_check CHECK (entry_type IN ('ip', 'hostname')),
    CONSTRAINT ip_access_list_type_check CHECK (list_type IN ('allow', 'block')),
    FOREIGN KEY (created_by) REFERENCES players(id)
);

-- ----------------------------------------------------------------------------
-- item_instances
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    location_type TEXT NOT NULL,
    location_id INTEGER NOT NULL,
    equipped_slot TEXT,
    quantity INTEGER DEFAULT 1 NOT NULL,
    condition TEXT DEFAULT 'pristine',
    charges_remaining INTEGER,
    fuel_remaining INTEGER,
    custom_data TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_lit INTEGER DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES item_templates(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- item_templates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_desc TEXT NOT NULL,
    long_desc TEXT,
    room_desc TEXT,
    keywords TEXT DEFAULT '[]' NOT NULL,
    weight INTEGER DEFAULT 0 NOT NULL,
    size INTEGER DEFAULT 1 NOT NULL,
    base_value INTEGER DEFAULT 0 NOT NULL,
    item_type TEXT NOT NULL,
    equipment_slot TEXT,
    flags TEXT DEFAULT '{}' NOT NULL,
    max_stack INTEGER DEFAULT 1,
    container_capacity INTEGER,
    container_weight_limit INTEGER,
    weapon_data TEXT,
    armor_data TEXT,
    consumable_data TEXT,
    light_data TEXT,
    requirements TEXT,
    stat_modifiers TEXT,
    effect_slots INTEGER DEFAULT 0,
    base_effects TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    stealth_modifier INTEGER DEFAULT 0,
    tool_data TEXT,
    rarity TEXT DEFAULT 'common',
    max_in_world INTEGER,
    spellcasting_modifier INTEGER DEFAULT 0,
    lockpicking_modifier INTEGER DEFAULT 0,
    perception_modifier INTEGER DEFAULT 0,
    critical_modifier INTEGER DEFAULT 0,
    magic_resistance_modifier INTEGER DEFAULT 0,
    trap_modifier INTEGER DEFAULT 0,
    critical_chance_modifier INTEGER DEFAULT 0,
    ac_modifier INTEGER DEFAULT 0,
    damage_resistance_modifier INTEGER DEFAULT 0,
    dodge_modifier INTEGER DEFAULT 0,
    damage_modifier INTEGER DEFAULT 0,
    energy_modifier INTEGER DEFAULT 0,
    speed_modifier INTEGER DEFAULT 0,
    defense_modifier INTEGER DEFAULT 0,
    healing_modifier INTEGER DEFAULT 0,
    vision_modifier INTEGER DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    item_type TEXT,
    weight INTEGER DEFAULT 0,
    value INTEGER DEFAULT 0,
    damage_min INTEGER,
    damage_max INTEGER,
    armor INTEGER,
    stat_bonuses TEXT
);

-- ----------------------------------------------------------------------------
-- merchant_inventory
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_template_id INTEGER NOT NULL,
    item_template_id INTEGER NOT NULL,
    max_stock INTEGER DEFAULT 10 NOT NULL,
    current_stock INTEGER DEFAULT 10 NOT NULL,
    restock_chance INTEGER DEFAULT 100 NOT NULL,
    UNIQUE (npc_template_id, item_template_id),
    CONSTRAINT merchant_inventory_current_stock_check CHECK ((current_stock >= 0) AND (current_stock <= max_stock)),
    CONSTRAINT merchant_inventory_max_stock_check CHECK (max_stock >= 0),
    CONSTRAINT merchant_inventory_restock_chance_check CHECK ((restock_chance >= 1) AND (restock_chance <= 100)),
    FOREIGN KEY (npc_template_id) REFERENCES npcs(id) ON DELETE CASCADE,
    FOREIGN KEY (item_template_id) REFERENCES item_templates(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- npc_responses
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS npc_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_template_id INTEGER NOT NULL,
    trigger_keywords TEXT NOT NULL,
    response TEXT NOT NULL,
    FOREIGN KEY (npc_template_id) REFERENCES npcs(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- npc_attacks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS npc_attacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id INTEGER NOT NULL,
    attack_type TEXT DEFAULT 'melee' NOT NULL,
    name TEXT NOT NULL,
    min_damage INTEGER DEFAULT 1 NOT NULL,
    max_damage INTEGER DEFAULT 4 NOT NULL,
    attacks_per_round INTEGER DEFAULT 1 NOT NULL,
    percentage INTEGER DEFAULT 100 NOT NULL,
    hit_message TEXT,
    miss_message TEXT,
    hit_verb TEXT DEFAULT 'hit',
    hit_verb_3p TEXT DEFAULT 'hits',
    miss_verb TEXT DEFAULT 'swing at',
    miss_verb_3p TEXT DEFAULT 'swings at',
    CONSTRAINT npc_attacks_attacks_per_round_check CHECK (attacks_per_round >= 1),
    CONSTRAINT npc_attacks_check CHECK (max_damage >= min_damage),
    CONSTRAINT npc_attacks_min_damage_check CHECK (min_damage >= 0),
    CONSTRAINT npc_attacks_percentage_check CHECK ((percentage >= 0) AND (percentage <= 100)),
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- npc_factions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS npc_factions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id INTEGER NOT NULL,
    faction_id INTEGER NOT NULL,
    UNIQUE (npc_id, faction_id),
    FOREIGN KEY (faction_id) REFERENCES factions(id) ON DELETE CASCADE,
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- npc_instances
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS npc_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id INTEGER,
    current_room_id INTEGER,
    current_health INTEGER,
    spawned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    current_mana INTEGER DEFAULT 0,
    augmentation TEXT,
    spawn_room_id INTEGER,
    FOREIGN KEY (current_room_id) REFERENCES rooms(id),
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE,
    FOREIGN KEY (spawn_room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- npc_spells
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS npc_spells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id INTEGER NOT NULL,
    spell_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 50 NOT NULL,
    cast_chance INTEGER DEFAULT 100 NOT NULL,
    condition_type TEXT DEFAULT 'any' NOT NULL,
    condition_value INTEGER DEFAULT 0 NOT NULL,
    cooldown_rounds INTEGER DEFAULT 0 NOT NULL,
    UNIQUE (npc_id, spell_id),
    CONSTRAINT npc_spells_cast_chance_check CHECK ((cast_chance >= 1) AND (cast_chance <= 100)),
    CONSTRAINT npc_spells_cooldown_rounds_check CHECK (cooldown_rounds >= 0),
    CONSTRAINT npc_spells_priority_check CHECK ((priority >= 0) AND (priority <= 100)),
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE,
    FOREIGN KEY (spell_id) REFERENCES spells(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- npcs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS npcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    spawn_room_id INTEGER,
    health INTEGER,
    max_health INTEGER,
    hostile INTEGER DEFAULT 0,
    respawn_time INTEGER,
    level INTEGER DEFAULT 1,
    experience_reward INTEGER DEFAULT 0,
    max_mana INTEGER DEFAULT 0,
    base_accuracy INTEGER DEFAULT 0,
    base_defense INTEGER DEFAULT 10,
    base_crit_chance INTEGER DEFAULT 0,
    base_dodge INTEGER DEFAULT 0,
    damage_reduction INTEGER DEFAULT 0,
    traits TEXT DEFAULT '[]',
    flee_enabled INTEGER DEFAULT 0,
    flee_hp_percent INTEGER DEFAULT 20,
    call_for_help_chance INTEGER DEFAULT 50,
    max_active INTEGER DEFAULT 1,
    interactable INTEGER DEFAULT 0,
    allowed_areas TEXT DEFAULT '[]',
    roam_enabled INTEGER DEFAULT 0,
    roam_interval INTEGER DEFAULT 60,
    roam_chance INTEGER DEFAULT 91,
    drop_table_id INTEGER,
    essence_reward INTEGER DEFAULT 0,
    essence_class TEXT,
    leave_corpse INTEGER DEFAULT 0,
    corpse_duration INTEGER DEFAULT 300,
    augmentation_enabled INTEGER DEFAULT 0,
    augmentations TEXT DEFAULT '[]',
    enter_room_message TEXT,
    exit_room_message TEXT,
    spawn_message TEXT,
    merchant_enabled INTEGER DEFAULT 0,
    primary_faction_id INTEGER,
    proper_name INTEGER DEFAULT 0,
    spell_power INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    vision_level INTEGER DEFAULT 100,
    death_message TEXT,
    combat_level INTEGER DEFAULT 1,
    FOREIGN KEY (primary_faction_id) REFERENCES factions(id),
    FOREIGN KEY (spawn_room_id) REFERENCES rooms(id)
);

-- ----------------------------------------------------------------------------
-- player_faction_reputation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_faction_reputation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    faction_id INTEGER NOT NULL,
    reputation INTEGER DEFAULT 0 NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (character_id, faction_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (faction_id) REFERENCES factions(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- player_roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER,
    role_id INTEGER,
    granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER,
    UNIQUE (player_id, role_id),
    FOREIGN KEY (granted_by) REFERENCES players(id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- players
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    brief_mode INTEGER DEFAULT 0,
    current_room_id INTEGER DEFAULT 1,
    max_characters INTEGER,
    UNIQUE (username)
);

-- ----------------------------------------------------------------------------
-- progression_table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progression_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level INTEGER NOT NULL,
    std_xp_required INTEGER NOT NULL,
    base_essence_required INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (level)
);

-- ----------------------------------------------------------------------------
-- quest_steps
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quest_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id INTEGER NOT NULL,
    step_order INTEGER NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_npc_id INTEGER,
    trigger_item_template_id INTEGER,
    trigger_room_id INTEGER,
    trigger_text TEXT,
    required_count INTEGER DEFAULT 1,
    consume_item INTEGER DEFAULT 1,
    description TEXT NOT NULL,
    completion_dialogue TEXT,
    in_progress_dialogue TEXT,
    step_xp_reward INTEGER DEFAULT 0,
    step_essence_reward INTEGER DEFAULT 0,
    step_currency_reward INTEGER DEFAULT 0,
    step_item_rewards TEXT DEFAULT '[]',
    step_faction_rewards TEXT DEFAULT '[]',
    UNIQUE (quest_id, step_order),
    CONSTRAINT quest_steps_trigger_type_check CHECK (trigger_type IN ('talk', 'kill', 'visit')),
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
    FOREIGN KEY (trigger_item_template_id) REFERENCES item_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (trigger_npc_id) REFERENCES npcs(id) ON DELETE SET NULL,
    FOREIGN KEY (trigger_room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- quests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quest_giver_npc_id INTEGER,
    min_level INTEGER DEFAULT 1,
    max_level INTEGER,
    required_races TEXT,
    required_classes TEXT,
    required_faction_id INTEGER,
    required_faction_min INTEGER,
    required_faction_max INTEGER,
    required_quest_ids TEXT DEFAULT '[]',
    xp_reward INTEGER DEFAULT 0,
    essence_reward INTEGER DEFAULT 0,
    currency_reward INTEGER DEFAULT 0,
    item_rewards TEXT DEFAULT '[]',
    faction_rewards TEXT DEFAULT '[]',
    quest_flag TEXT,
    denial_dialogue TEXT,
    completed_dialogue TEXT,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    required_quest_tags TEXT DEFAULT '[]',
    UNIQUE (tag),
    FOREIGN KEY (quest_giver_npc_id) REFERENCES npcs(id) ON DELETE SET NULL,
    FOREIGN KEY (required_faction_id) REFERENCES factions(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- race_definitions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS race_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    stat_modifiers TEXT DEFAULT '{}',
    traits TEXT DEFAULT '[]',
    allowed_classes TEXT DEFAULT '[]',
    playable INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    base_stats TEXT DEFAULT '{}',
    dodge_bonus INTEGER DEFAULT 0,
    base_hp INTEGER DEFAULT 26,
    UNIQUE (race_id)
);

-- ----------------------------------------------------------------------------
-- roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0,
    UNIQUE (name)
);

-- ----------------------------------------------------------------------------
-- room_exits
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_exits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_room_id INTEGER,
    to_room_id INTEGER,
    direction TEXT NOT NULL,
    UNIQUE (from_room_id, direction),
    FOREIGN KEY (from_room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (to_room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- room_spawns
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_spawns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    npc_id INTEGER NOT NULL,
    max_active INTEGER DEFAULT 1 NOT NULL,
    respawn_seconds INTEGER DEFAULT 60 NOT NULL,
    UNIQUE (room_id, npc_id),
    CONSTRAINT room_spawns_max_active_check CHECK (max_active >= 1),
    CONSTRAINT room_spawns_respawn_seconds_check CHECK (respawn_seconds >= 0),
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- rooms
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    area TEXT,
    terrain TEXT DEFAULT 'indoor',
    features TEXT DEFAULT '{}',
    tag TEXT,
    darkness_level INTEGER DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- spells
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mnemonic TEXT NOT NULL,
    description TEXT,
    spell_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    mana_cost INTEGER DEFAULT 0 NOT NULL,
    status_effect TEXT,
    effect_duration INTEGER,
    level_required INTEGER DEFAULT 1 NOT NULL,
    class_restrictions TEXT,
    is_attack_spell INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    damage_scaling_stat TEXT,
    damage_scaling_factor REAL,
    healing_scaling_stat TEXT,
    healing_scaling_factor REAL,
    telegraph_message TEXT,
    save_stat TEXT,
    save_difficulty INTEGER DEFAULT 0,
    min_damage INTEGER,
    max_damage INTEGER,
    min_healing INTEGER,
    max_healing INTEGER,
    hits_per_cast INTEGER DEFAULT 1 NOT NULL,
    scaling_per_level REAL,
    cast_difficulty INTEGER DEFAULT 0 NOT NULL,
    fizzle_message TEXT,
    hit_message_self TEXT,
    hit_message_target TEXT,
    hit_message_room TEXT,
    max_scaling_level INTEGER,
    fizzle_message_room TEXT,
    UNIQUE (mnemonic),
    CONSTRAINT spells_damage_scaling_stat_check CHECK ((damage_scaling_stat IS NULL) OR (damage_scaling_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma', 'intellect_wisdom'))),
    CONSTRAINT spells_healing_scaling_stat_check CHECK ((healing_scaling_stat IS NULL) OR (healing_scaling_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma', 'intellect_wisdom'))),
    CONSTRAINT spells_save_stat_check CHECK ((save_stat IS NULL) OR (save_stat IN ('none', 'strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma', 'intellect_wisdom'))),
    CONSTRAINT spells_spell_type_check CHECK (spell_type IN ('offensive', 'healing', 'buff', 'debuff', 'utility')),
    CONSTRAINT spells_target_type_check CHECK (target_type IN ('self', 'self_ally', 'enemy', 'ally', 'room'))
);

-- ----------------------------------------------------------------------------
-- status_effect_definitions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS status_effect_definitions (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    stacking_behavior TEXT NOT NULL,
    max_stacks INTEGER DEFAULT 1 NOT NULL,
    accuracy_modifier INTEGER DEFAULT 0,
    defense_modifier INTEGER DEFAULT 0,
    energy_modifier INTEGER DEFAULT 0,
    damage_modifier INTEGER DEFAULT 0,
    tick_message TEXT,
    silent_tick INTEGER DEFAULT 0,
    wear_off_message TEXT,
    blocks_regen INTEGER DEFAULT 0,
    blocks_movement INTEGER DEFAULT 0,
    is_blind INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    tick_damage_min INTEGER,
    tick_damage_max INTEGER,
    tick_healing_min INTEGER,
    tick_healing_max INTEGER,
    speed_modifier INTEGER DEFAULT 0,
    critical_chance_modifier INTEGER DEFAULT 0,
    dodge_modifier INTEGER DEFAULT 0,
    magic_resistance INTEGER DEFAULT 0,
    healing_received INTEGER DEFAULT 0,
    perception_modifier INTEGER DEFAULT 0,
    stealth_modifier INTEGER DEFAULT 0,
    spellcasting_modifier INTEGER DEFAULT 0,
    lockpicking_modifier INTEGER DEFAULT 0,
    strength_modifier INTEGER DEFAULT 0,
    dexterity_modifier INTEGER DEFAULT 0,
    constitution_modifier INTEGER DEFAULT 0,
    intelligence_modifier INTEGER DEFAULT 0,
    wisdom_modifier INTEGER DEFAULT 0,
    charisma_modifier INTEGER DEFAULT 0,
    max_hp_modifier INTEGER DEFAULT 0,
    max_mana_modifier INTEGER DEFAULT 0,
    blocks_casting INTEGER DEFAULT 0,
    blocks_combat INTEGER DEFAULT 0,
    blocks_stealth INTEGER DEFAULT 0,
    vision_modifier INTEGER DEFAULT 0,
    armor_class_modifier INTEGER DEFAULT 0,
    damage_reduction_modifier INTEGER DEFAULT 0,
    CONSTRAINT status_effect_definitions_category_check CHECK (category IN ('buff', 'debuff', 'dot', 'hot', 'control')),
    CONSTRAINT status_effect_definitions_stacking_behavior_check CHECK (stacking_behavior IN ('replace', 'refresh', 'stack'))
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_command_lower ON actions (lower(command));
CREATE INDEX IF NOT EXISTS idx_character_inventory_character ON character_inventory (character_id);
CREATE INDEX IF NOT EXISTS idx_character_progression_character ON character_progression (character_id);
CREATE INDEX IF NOT EXISTS idx_character_quests_active ON character_quests (character_id, status) WHERE (status = 'active');
CREATE INDEX IF NOT EXISTS idx_character_quests_char ON character_quests (character_id);
CREATE INDEX IF NOT EXISTS idx_character_spells_character ON character_spells (character_id);
CREATE INDEX IF NOT EXISTS idx_character_spells_spell ON character_spells (spell_id);
CREATE INDEX IF NOT EXISTS idx_character_status_effects_character ON character_status_effects (character_id);
CREATE INDEX IF NOT EXISTS idx_character_status_effects_expires ON character_status_effects (expires_at);
CREATE INDEX IF NOT EXISTS idx_characters_current_room ON characters (current_room_id);
CREATE INDEX IF NOT EXISTS idx_characters_player_id ON characters (player_id);
CREATE INDEX IF NOT EXISTS idx_class_definitions_class_id ON class_definitions (class_id);
CREATE INDEX IF NOT EXISTS idx_class_definitions_playable ON class_definitions (playable);
CREATE INDEX IF NOT EXISTS idx_doors_entry_room ON doors (entry_room_id);
CREATE INDEX IF NOT EXISTS idx_doors_exit_room ON doors (exit_room_id);
CREATE INDEX IF NOT EXISTS idx_doors_type ON doors (door_type);
CREATE INDEX IF NOT EXISTS idx_drop_table_entries_table ON drop_table_entries (drop_table_id);
CREATE INDEX IF NOT EXISTS idx_essence_events_event_id ON essence_events (event_id);
CREATE INDEX IF NOT EXISTS idx_ip_access_entry_type ON ip_access (entry_type);
CREATE INDEX IF NOT EXISTS idx_ip_access_list_type ON ip_access (list_type);
CREATE INDEX IF NOT EXISTS idx_item_instances_location ON item_instances (location_type, location_id);
CREATE INDEX IF NOT EXISTS idx_item_instances_template ON item_instances (template_id);
CREATE INDEX IF NOT EXISTS idx_item_templates_slot ON item_templates (equipment_slot);
CREATE INDEX IF NOT EXISTS idx_item_templates_type ON item_templates (item_type);
CREATE INDEX IF NOT EXISTS idx_merchant_inventory_npc ON merchant_inventory (npc_template_id);
CREATE INDEX IF NOT EXISTS idx_npc_attacks_npc ON npc_attacks (npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_factions_faction ON npc_factions (faction_id);
CREATE INDEX IF NOT EXISTS idx_npc_factions_npc ON npc_factions (npc_id);
CREATE INDEX IF NOT EXISTS idx_npc_instances_room ON npc_instances (current_room_id);
CREATE INDEX IF NOT EXISTS idx_npc_responses_npc ON npc_responses (npc_template_id);
CREATE INDEX IF NOT EXISTS idx_npc_spells_npc ON npc_spells (npc_id);
CREATE INDEX IF NOT EXISTS idx_player_faction_rep_character ON player_faction_reputation (character_id);
CREATE INDEX IF NOT EXISTS idx_player_faction_rep_faction ON player_faction_reputation (faction_id);
CREATE INDEX IF NOT EXISTS idx_player_roles_player ON player_roles (player_id);
CREATE INDEX IF NOT EXISTS idx_player_roles_role ON player_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_race_definitions_playable ON race_definitions (playable);
CREATE INDEX IF NOT EXISTS idx_race_definitions_race_id ON race_definitions (race_id);
CREATE INDEX IF NOT EXISTS idx_room_exits_from_room ON room_exits (from_room_id);
CREATE INDEX IF NOT EXISTS idx_room_spawns_npc ON room_spawns (npc_id);
CREATE INDEX IF NOT EXISTS idx_room_spawns_room ON room_spawns (room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_tag ON rooms (tag) WHERE (tag IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_spells_level_name ON spells (level_required, name);
CREATE INDEX IF NOT EXISTS idx_spells_mnemonic ON spells (mnemonic);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spells_mnemonic_lower ON spells (lower(mnemonic));
CREATE INDEX IF NOT EXISTS idx_spells_type ON spells (spell_type);
CREATE INDEX IF NOT EXISTS idx_status_effect_definitions_category ON status_effect_definitions (category);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS status_effect_definitions_set_updated_at
AFTER UPDATE ON status_effect_definitions
BEGIN
    UPDATE status_effect_definitions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
