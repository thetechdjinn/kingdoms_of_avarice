-- Actions system schema for Kingdoms of Avarice
-- Actions are pre-defined social actions (dance, bow, wave, etc.)

CREATE TABLE IF NOT EXISTS actions (
    id SERIAL PRIMARY KEY,

    -- Command name (what the player types)
    command VARCHAR(50) NOT NULL,

    -- Description for help/listing
    description TEXT,

    -- Messages when no target is specified
    first_person_no_target TEXT NOT NULL,  -- Sent to the actor: "You dance a little jig!"
    room_no_target TEXT NOT NULL,          -- Sent to the room: "{player} dances a little jig!"

    -- Messages when a target is specified (NULL means action doesn't support targeting)
    first_person_with_target TEXT,         -- Sent to actor: "You dance with {target}!"
    target_perspective TEXT,               -- Sent to target: "{player} dances with you!"
    room_with_target TEXT,                 -- Sent to room (excluding actor & target): "{player} dances with {target}!"

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Case-insensitive unique index on command
CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_command_lower ON actions(LOWER(command));
