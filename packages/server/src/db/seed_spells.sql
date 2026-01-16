-- Seed spell data for Kingdoms of Avarice
-- Mnemonics follow MajorMUD-style short commands

INSERT INTO spells (name, mnemonic, description, spell_type, target_type, mana_cost, damage_dice, healing_dice, status_effect, effect_duration, level_required, class_restrictions, is_attack_spell) VALUES

-- Offensive Spells (Mage)
('Magic Missile', 'mmis', 'A bolt of magical energy strikes your target.', 'offensive', 'enemy', 5, '2d4+2', NULL, NULL, NULL, 1, ARRAY['Mage'], TRUE),
('Burning Hands', 'burn', 'Flames shoot from your fingertips.', 'offensive', 'enemy', 8, '2d6+3', NULL, NULL, NULL, 3, ARRAY['Mage'], TRUE),
('Fireball', 'fire', 'A ball of fire explodes on your target.', 'offensive', 'enemy', 15, '3d6+5', NULL, NULL, NULL, 7, ARRAY['Mage'], TRUE),
('Lightning Bolt', 'lbol', 'A bolt of lightning arcs toward your foe.', 'offensive', 'enemy', 20, '4d6+4', NULL, NULL, NULL, 10, ARRAY['Mage'], TRUE),

-- Offensive Spells (Cleric)
('Smite', 'smit', 'Divine wrath strikes your enemy.', 'offensive', 'enemy', 8, '2d6+2', NULL, NULL, NULL, 3, ARRAY['Cleric', 'Paladin'], TRUE),
('Holy Fire', 'hfir', 'Sacred flames burn the unholy.', 'offensive', 'enemy', 14, '3d6+3', NULL, NULL, NULL, 8, ARRAY['Cleric', 'Paladin'], TRUE),

-- Healing Spells
('Minor Heal', 'mhea', 'A small amount of healing energy restores health.', 'healing', 'self', 6, NULL, '1d8+3', NULL, NULL, 1, ARRAY['Cleric', 'Paladin'], FALSE),
('Heal', 'heal', 'Healing energy restores a moderate amount of health.', 'healing', 'self', 12, NULL, '2d8+5', NULL, NULL, 5, ARRAY['Cleric', 'Paladin'], FALSE),
('Greater Heal', 'ghea', 'Powerful healing energy restores significant health.', 'healing', 'self', 25, NULL, '4d8+8', NULL, NULL, 12, ARRAY['Cleric', 'Paladin'], FALSE),

-- Ranger Spells
('Thorn Strike', 'thor', 'Nature''s thorns pierce your foe.', 'offensive', 'enemy', 6, '2d4+3', NULL, NULL, NULL, 2, ARRAY['Ranger'], TRUE),
('Entangle', 'enta', 'Vines wrap around your target.', 'debuff', 'enemy', 10, NULL, NULL, 'entangled', 30, 5, ARRAY['Ranger'], FALSE),

-- Buff Spells
('Bless', 'bles', 'Divine favor improves your accuracy.', 'buff', 'self', 10, NULL, NULL, 'blessed', 120, 2, ARRAY['Cleric', 'Paladin'], FALSE),
('Shield', 'shld', 'A magical barrier protects you.', 'buff', 'self', 8, NULL, NULL, 'shielded', 90, 2, ARRAY['Mage'], FALSE),
('Haste', 'hast', 'Your movements quicken.', 'buff', 'self', 15, NULL, NULL, 'hasted', 60, 8, ARRAY['Mage'], FALSE),

-- Debuff Spells
('Curse', 'curs', 'A dark curse weakens your foe.', 'debuff', 'enemy', 10, NULL, NULL, 'cursed', 60, 4, ARRAY['Mage'], FALSE),
('Slow', 'slow', 'Your target''s movements become sluggish.', 'debuff', 'enemy', 12, NULL, NULL, 'slowed', 45, 6, ARRAY['Mage'], FALSE);
