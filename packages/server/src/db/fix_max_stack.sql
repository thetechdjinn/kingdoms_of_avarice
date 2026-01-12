-- Fix max_stack for stackable items that were created with default value of 1
-- Run this script to update existing item templates

BEGIN;

-- Update crafting materials to have max_stack = 99
UPDATE item_templates SET max_stack = 99 WHERE name = 'Iron Ore';
UPDATE item_templates SET max_stack = 99 WHERE name = 'Iron Ingot';
UPDATE item_templates SET max_stack = 99 WHERE name = 'Leather Scraps';
UPDATE item_templates SET max_stack = 99 WHERE name = 'Wooden Handle';
UPDATE item_templates SET max_stack = 99 WHERE name = 'Magic Dust';
UPDATE item_templates SET max_stack = 99 WHERE name = 'Fire Essence';

-- Update Gold Coin to have max_stack = 100
UPDATE item_templates SET max_stack = 100 WHERE name = 'Gold Coin';

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
