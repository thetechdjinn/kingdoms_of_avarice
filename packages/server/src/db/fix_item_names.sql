-- Fix item names to be lowercase
-- Run this script to convert all existing item template names to lowercase

BEGIN;

-- Update item_templates name field to lowercase
UPDATE item_templates SET name = LOWER(name);

-- Also update short_desc to lowercase (for legacy data)
UPDATE item_templates SET short_desc = LOWER(short_desc);

COMMIT;

-- Verify the changes
SELECT id, name, short_desc FROM item_templates ORDER BY id;
