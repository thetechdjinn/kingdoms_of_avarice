-- Fix max_stack for stackable items that were created with default value of 1
-- Run this script to update existing item templates
-- This script is idempotent - safe to run multiple times

BEGIN;

-- Update crafting materials to have max_stack = 99 (only if currently 1 and stackable)
UPDATE item_templates SET max_stack = 99 WHERE name = 'Iron Ore' AND max_stack = 1 AND (flags->>'stackable')::boolean = true;
UPDATE item_templates SET max_stack = 99 WHERE name = 'Iron Ingot' AND max_stack = 1 AND (flags->>'stackable')::boolean = true;
UPDATE item_templates SET max_stack = 99 WHERE name = 'Leather Scraps' AND max_stack = 1 AND (flags->>'stackable')::boolean = true;
UPDATE item_templates SET max_stack = 99 WHERE name = 'Wooden Handle' AND max_stack = 1 AND (flags->>'stackable')::boolean = true;
UPDATE item_templates SET max_stack = 99 WHERE name = 'Magic Dust' AND max_stack = 1 AND (flags->>'stackable')::boolean = true;
UPDATE item_templates SET max_stack = 99 WHERE name = 'Fire Essence' AND max_stack = 1 AND (flags->>'stackable')::boolean = true;

-- Update Gold Coin to have max_stack = 100 (only if currently 1 and stackable)
UPDATE item_templates SET max_stack = 100 WHERE name = 'Gold Coin' AND max_stack = 1 AND (flags->>'stackable')::boolean = true;

-- Generic update: set max_stack = 99 for any item with stackable flag but max_stack = 1
UPDATE item_templates 
SET max_stack = 99 
WHERE (flags->>'stackable')::boolean = true 
  AND max_stack = 1;

COMMIT;

-- Verify the changes
SELECT id, name, max_stack, flags->>'stackable' as stackable 
FROM item_templates 
WHERE (flags->>'stackable')::boolean = true
ORDER BY id;
