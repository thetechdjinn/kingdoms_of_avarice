-- Sample Item Templates and Instances for Testing
-- Run this after the schema migration

-- ============================================================================
-- ITEM TEMPLATES (Blueprints)
-- ============================================================================

-- Weapons
INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, equipment_slot, flags, weapon_data)
VALUES 
(
    'Rusty Iron Sword',
    'a rusty iron sword',
    'This iron sword has seen better days. Rust covers most of the blade, but it still looks sharp enough to do some damage.',
    'A rusty iron sword lies here.',
    ARRAY['sword', 'iron sword', 'rusty sword', 'rusty iron sword'],
    5, 2, 15,
    'weapon', 'main_hand',
    '{"takeable": true}',
    '{"damage_dice": "1d6", "damage_type": "slashing", "attack_speed": 3, "range": "melee", "skill_type": "swords"}'
),
(
    'Steel Longsword',
    'a gleaming steel longsword',
    'A well-crafted longsword made of polished steel. The blade is perfectly balanced and razor-sharp.',
    'A gleaming steel longsword rests against the wall.',
    ARRAY['sword', 'longsword', 'steel sword', 'steel longsword'],
    6, 2, 100,
    'weapon', 'main_hand',
    '{"takeable": true}',
    '{"damage_dice": "1d8", "damage_type": "slashing", "attack_speed": 3, "range": "melee", "skill_type": "swords"}'
),
(
    'Iron Dagger',
    'an iron dagger',
    'A simple iron dagger with a leather-wrapped handle. Small but deadly in the right hands.',
    'An iron dagger lies on the ground.',
    ARRAY['dagger', 'iron dagger', 'knife'],
    1, 1, 10,
    'weapon', 'main_hand',
    '{"takeable": true}',
    '{"damage_dice": "1d4", "damage_type": "piercing", "attack_speed": 2, "range": "melee", "skill_type": "daggers"}'
),
(
    'Wooden Club',
    'a heavy wooden club',
    'A crude but effective weapon - just a thick piece of hardwood shaped into a club.',
    'A heavy wooden club lies here.',
    ARRAY['club', 'wooden club'],
    4, 2, 5,
    'weapon', 'main_hand',
    '{"takeable": true}',
    '{"damage_dice": "1d6", "damage_type": "bludgeoning", "attack_speed": 4, "range": "melee", "skill_type": "bludgeons"}'
),
(
    'Battle Axe',
    'a fearsome battle axe',
    'A large two-handed axe with a crescent-shaped blade. It requires both hands to wield effectively.',
    'A fearsome battle axe leans against the wall.',
    ARRAY['axe', 'battle axe', 'battleaxe'],
    10, 3, 150,
    'weapon', 'main_hand',
    '{"takeable": true, "two_handed": true}',
    '{"damage_dice": "1d12", "damage_type": "slashing", "attack_speed": 5, "range": "melee", "skill_type": "axes"}'
);

-- Armor
INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, equipment_slot, flags, armor_data)
VALUES 
(
    'Leather Cap',
    'a leather cap',
    'A simple cap made of hardened leather. It offers minimal protection but is better than nothing.',
    'A leather cap lies here.',
    ARRAY['cap', 'leather cap', 'hat'],
    1, 1, 8,
    'armor', 'head',
    '{"takeable": true}',
    '{"armor_class": 1, "weight_class": "light"}'
),
(
    'Iron Helm',
    'an iron helm',
    'A sturdy iron helmet that covers the head and cheeks. Dented but still functional.',
    'An iron helm sits on the ground.',
    ARRAY['helm', 'helmet', 'iron helm', 'iron helmet'],
    4, 2, 35,
    'armor', 'head',
    '{"takeable": true}',
    '{"armor_class": 3, "weight_class": "heavy"}'
),
(
    'Leather Vest',
    'a leather vest',
    'A vest made of thick, boiled leather. It provides decent protection while remaining flexible.',
    'A leather vest lies crumpled on the floor.',
    ARRAY['vest', 'leather vest', 'armor'],
    5, 2, 25,
    'armor', 'body',
    '{"takeable": true}',
    '{"armor_class": 2, "weight_class": "light"}'
),
(
    'Chainmail Shirt',
    'a chainmail shirt',
    'A shirt made of interlocking iron rings. Heavy but offers excellent protection.',
    'A chainmail shirt lies in a heap.',
    ARRAY['chainmail', 'chain mail', 'chain shirt', 'mail'],
    15, 3, 150,
    'armor', 'body',
    '{"takeable": true}',
    '{"armor_class": 5, "weight_class": "medium"}'
),
(
    'Wooden Shield',
    'a wooden shield',
    'A round shield made of oak planks bound with iron. Battered but serviceable.',
    'A wooden shield leans against the wall.',
    ARRAY['shield', 'wooden shield'],
    6, 2, 20,
    'armor', 'shield',
    '{"takeable": true}',
    '{"armor_class": 2, "weight_class": "medium"}'
),
(
    'Leather Gloves',
    'a pair of leather gloves',
    'Simple leather gloves that protect the hands while maintaining dexterity.',
    'A pair of leather gloves lies here.',
    ARRAY['gloves', 'leather gloves'],
    1, 1, 5,
    'armor', 'hands',
    '{"takeable": true}',
    '{"armor_class": 1, "weight_class": "light"}'
),
(
    'Leather Boots',
    'a pair of leather boots',
    'Sturdy leather boots with thick soles. Good for long journeys.',
    'A pair of leather boots sits here.',
    ARRAY['boots', 'leather boots', 'shoes'],
    2, 1, 12,
    'armor', 'feet',
    '{"takeable": true}',
    '{"armor_class": 1, "weight_class": "light"}'
);

-- Containers
INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, flags, container_capacity, container_weight_limit)
VALUES 
(
    'Leather Backpack',
    'a leather backpack',
    'A sturdy leather backpack with multiple compartments. Perfect for carrying supplies on long journeys.',
    'A leather backpack lies here.',
    ARRAY['backpack', 'pack', 'bag', 'leather backpack'],
    2, 2, 25,
    'container',
    '{"takeable": true}',
    20, 100
),
(
    'Wooden Chest',
    'a wooden chest',
    'A heavy wooden chest bound with iron bands. It looks like it could hold quite a bit.',
    'A wooden chest sits here.',
    ARRAY['chest', 'wooden chest', 'box'],
    15, 3, 50,
    'container',
    '{"takeable": false}',
    50, 500
),
(
    'Small Pouch',
    'a small leather pouch',
    'A small leather pouch that can be worn on a belt. Good for coins and small items.',
    'A small leather pouch lies here.',
    ARRAY['pouch', 'small pouch', 'leather pouch', 'bag'],
    0, 1, 5,
    'container',
    '{"takeable": true}',
    10, 20
);

-- Misc Items
INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, flags, max_stack)
VALUES 
(
    'Gold Coin',
    'a gold coin',
    'A shiny gold coin stamped with the royal crest. Legal tender throughout the realm.',
    'A gold coin glints on the ground.',
    ARRAY['coin', 'gold', 'gold coin', 'money'],
    0, 1, 1,
    'misc',
    '{"takeable": true, "stackable": true}',
    100
),
(
    'Old Key',
    'an old brass key',
    'A tarnished brass key with an ornate handle. It must open something important.',
    'An old brass key lies here.',
    ARRAY['key', 'brass key', 'old key'],
    0, 1, 0,
    'key',
    '{"takeable": true, "no_drop": false}',
    1
),
(
    'Stone Statue',
    'a large stone statue',
    'A life-sized statue of a warrior carved from granite. It is far too heavy to move.',
    'A large stone statue stands here, watching silently.',
    ARRAY['statue', 'stone statue'],
    500, 5, 0,
    'misc',
    '{"takeable": false}',
    1
);

-- Consumables
INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, flags, consumable_data)
VALUES 
(
    'Healing Potion',
    'a red healing potion',
    'A small glass vial filled with a glowing red liquid. Drinking it will restore health.',
    'A red healing potion sits here.',
    ARRAY['potion', 'healing potion', 'red potion', 'heal'],
    1, 1, 50,
    'consumable',
    '{"takeable": true}',
    '{"effect_type": "heal", "effect_value": 25}'
),
(
    'Mana Potion',
    'a blue mana potion',
    'A small glass vial filled with a shimmering blue liquid. Drinking it will restore magical energy.',
    'A blue mana potion sits here.',
    ARRAY['potion', 'mana potion', 'blue potion', 'mana'],
    1, 1, 50,
    'consumable',
    '{"takeable": true}',
    '{"effect_type": "mana", "effect_value": 20}'
),
(
    'Bread Loaf',
    'a loaf of bread',
    'A fresh loaf of crusty bread. It smells delicious.',
    'A loaf of bread lies here.',
    ARRAY['bread', 'loaf', 'food'],
    1, 1, 3,
    'consumable',
    '{"takeable": true}',
    '{"effect_type": "food", "effect_value": 10}'
);

-- Light Sources
INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, flags, light_data)
VALUES 
(
    'Torch',
    'a wooden torch',
    'A wooden torch wrapped in oil-soaked rags. It can be lit to provide illumination.',
    'A wooden torch lies here.',
    ARRAY['torch', 'light'],
    1, 1, 2,
    'light',
    '{"takeable": true}',
    '{"radius": 2, "fuel_max": 60, "fuel_rate": 1}'
),
(
    'Lantern',
    'an iron lantern',
    'A sturdy iron lantern with a glass enclosure. It provides steady light and can be refueled.',
    'An iron lantern sits here.',
    ARRAY['lantern', 'lamp', 'light'],
    2, 1, 15,
    'light',
    '{"takeable": true}',
    '{"radius": 3, "fuel_max": 120, "fuel_rate": 1}'
);

-- Hidden Items
INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, flags)
VALUES 
(
    'Sparkling Ruby',
    'sparkling ruby',
    'A beautiful ruby that catches the light. It must be worth a fortune.',
    'A sparkling ruby lies here.',
    ARRAY['ruby', 'jewel', 'sparkling'],
    0, 1, 500,
    'misc',
    '{"takeable": true, "hidden": true}'
),
(
    'Crumpled Note',
    'crumpled note',
    'A crumpled piece of parchment with faded writing. It reads: "The treasure lies beneath the old oak."',
    'A crumpled note lies here.',
    ARRAY['note', 'paper', 'parchment', 'crumpled'],
    0, 1, 5,
    'misc',
    '{"takeable": true, "hidden": true}'
);

-- ============================================================================
-- ITEM INSTANCES (Actual items in the game world)
-- Place some items in room 1 for testing
-- ============================================================================

-- Get template IDs (assuming they start at 1)
-- Weapons in room 1
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Rusty Iron Sword';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Iron Dagger';

-- Armor in room 1
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Leather Vest';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Leather Boots';

-- Misc items in room 1
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Torch';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Healing Potion';

-- The immovable statue
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Stone Statue';

-- Some gold coins (multiple of same type to test disambiguation)
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 5, 'pristine' FROM item_templates WHERE name = 'Gold Coin';

-- Containers in room 1
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Leather Backpack';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Wooden Chest';

-- Hidden items in room 1 (require search to find)
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Sparkling Ruby';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Crumpled Note';

-- ============================================================================
-- CRAFTING MATERIALS
-- ============================================================================

INSERT INTO item_templates (name, short_desc, long_desc, room_desc, keywords, weight, size, base_value, item_type, flags, max_stack)
VALUES 
(
    'Iron Ore',
    'a chunk of iron ore',
    'A rough chunk of iron ore. It can be smelted into iron ingots.',
    'A chunk of iron ore lies here.',
    ARRAY['ore', 'iron', 'iron ore', 'metal'],
    3, 1, 5,
    'misc',
    '{"takeable": true, "stackable": true}',
    99
),
(
    'Iron Ingot',
    'an iron ingot',
    'A bar of refined iron, ready for smithing.',
    'An iron ingot lies here.',
    ARRAY['ingot', 'iron', 'iron ingot', 'metal', 'bar'],
    2, 1, 15,
    'misc',
    '{"takeable": true, "stackable": true}',
    99
),
(
    'Leather Scraps',
    'some leather scraps',
    'Pieces of leather suitable for crafting.',
    'Some leather scraps lie here.',
    ARRAY['leather', 'scraps', 'hide'],
    1, 1, 3,
    'misc',
    '{"takeable": true, "stackable": true}',
    99
),
(
    'Wooden Handle',
    'a wooden handle',
    'A carved wooden handle, suitable for tools and weapons.',
    'A wooden handle lies here.',
    ARRAY['handle', 'wood', 'wooden handle'],
    1, 1, 2,
    'misc',
    '{"takeable": true, "stackable": true}',
    99
),
(
    'Magic Dust',
    'a pinch of magic dust',
    'Glittering dust infused with magical energy. Used in enchanting.',
    'A pinch of magic dust sparkles here.',
    ARRAY['dust', 'magic', 'magic dust', 'reagent'],
    0, 1, 25,
    'misc',
    '{"takeable": true, "stackable": true}',
    99
),
(
    'Fire Essence',
    'a vial of fire essence',
    'A small vial containing concentrated elemental fire. Hot to the touch.',
    'A vial of fire essence glows here.',
    ARRAY['essence', 'fire', 'fire essence', 'reagent', 'vial'],
    0, 1, 50,
    'misc',
    '{"takeable": true, "stackable": true}',
    99
),
(
    'Smithing Hammer',
    'a smithing hammer',
    'A heavy hammer used for metalworking. Required for blacksmithing.',
    'A smithing hammer lies here.',
    ARRAY['hammer', 'smithing hammer', 'tool'],
    5, 2, 30,
    'misc',
    '{"takeable": true}',
    1
);

-- ============================================================================
-- CRAFTING RECIPES (simplified - no dynamic template lookups)
-- ============================================================================

-- Note: Recipes and enchantments with reagent requirements should be added
-- after templates are created, using the Item Editor or API

-- ============================================================================
-- ENCHANTMENTS (simplified - no reagent requirements for now)
-- ============================================================================

INSERT INTO enchantments (name, description, skill_type, skill_level, applicable_types, stat_modifiers, special_effects, mana_cost)
VALUES 
(
    'Sharpness',
    'Increases weapon damage.',
    'enchanting',
    0,
    ARRAY['weapon'],
    '{"strength": 2}',
    NULL,
    20
),
(
    'Protection',
    'Increases armor defense.',
    'enchanting',
    0,
    ARRAY['armor'],
    '{"constitution": 2}',
    NULL,
    20
),
(
    'Flame',
    'Adds fire damage to weapons.',
    'enchanting',
    5,
    ARRAY['weapon'],
    NULL,
    '[{"type": "fire_damage", "value": 5, "chance": 25}]',
    50
);

-- ============================================================================
-- CRAFTING MATERIALS IN ROOMS
-- ============================================================================

-- Some crafting materials in room 1
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 3, 'pristine' FROM item_templates WHERE name = 'Iron Ore';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 2, 'pristine' FROM item_templates WHERE name = 'Leather Scraps';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 1, 'pristine' FROM item_templates WHERE name = 'Smithing Hammer';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 1, 2, 'pristine' FROM item_templates WHERE name = 'Magic Dust';

-- If you have a room 2, add some items there too
INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 2, 1, 'worn' FROM item_templates WHERE name = 'Steel Longsword';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 2, 1, 'pristine' FROM item_templates WHERE name = 'Chainmail Shirt';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 2, 1, 'pristine' FROM item_templates WHERE name = 'Wooden Shield';

INSERT INTO item_instances (template_id, location_type, location_id, quantity, condition)
SELECT id, 'room', 2, 1, 'damaged' FROM item_templates WHERE name = 'Iron Helm';
