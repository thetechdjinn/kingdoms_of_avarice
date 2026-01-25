-- Default social actions for Kingdoms of Avarice
-- Placeholder syntax: {player} for actor name, {target} for target name

INSERT INTO actions (command, description, first_person_no_target, room_no_target, first_person_with_target, target_perspective, room_with_target) VALUES
('dance', 'Dance a jig', 'You dance a little jig!', '{player} dances a little jig!', 'You dance with {target}!', '{player} dances with you!', '{player} dances with {target}!'),
('bow', 'Bow respectfully', 'You bow respectfully.', '{player} bows respectfully.', 'You bow to {target}.', '{player} bows to you.', '{player} bows to {target}.'),
('wave', 'Wave to others', 'You wave.', '{player} waves.', 'You wave at {target}.', '{player} waves at you.', '{player} waves at {target}.'),
('laugh', 'Laugh out loud', 'You laugh out loud!', '{player} laughs out loud!', 'You laugh at {target}!', '{player} laughs at you!', '{player} laughs at {target}!'),
('nod', 'Nod in agreement', 'You nod.', '{player} nods.', 'You nod at {target}.', '{player} nods at you.', '{player} nods at {target}.'),
('shrug', 'Shrug your shoulders', 'You shrug.', '{player} shrugs.', 'You shrug at {target}.', '{player} shrugs at you.', '{player} shrugs at {target}.'),
('clap', 'Clap your hands', 'You clap your hands!', '{player} claps their hands!', 'You clap for {target}!', '{player} claps for you!', '{player} claps for {target}!'),
('cheer', 'Cheer enthusiastically', 'You cheer!', '{player} cheers!', 'You cheer for {target}!', '{player} cheers for you!', '{player} cheers for {target}!'),
('cry', 'Cry tears', 'You cry.', '{player} cries.', 'You cry on {target}''s shoulder.', '{player} cries on your shoulder.', '{player} cries on {target}''s shoulder.'),
('sigh', 'Sigh heavily', 'You sigh.', '{player} sighs.', 'You sigh at {target}.', '{player} sighs at you.', '{player} sighs at {target}.'),
('grin', 'Grin mischievously', 'You grin mischievously.', '{player} grins mischievously.', 'You grin at {target}.', '{player} grins at you.', '{player} grins at {target}.'),
('wink', 'Wink playfully', 'You wink.', '{player} winks.', 'You wink at {target}.', '{player} winks at you.', '{player} winks at {target}.'),
('hug', 'Give a warm hug', 'You spread your arms wide for a hug.', '{player} spreads their arms wide.', 'You hug {target} warmly.', '{player} hugs you warmly.', '{player} hugs {target} warmly.'),
('poke', 'Poke someone', 'You poke at the air.', '{player} pokes at the air.', 'You poke {target}.', '{player} pokes you.', '{player} pokes {target}.'),
('yawn', 'Yawn sleepily', 'You yawn sleepily.', '{player} yawns sleepily.', 'You yawn at {target}.', '{player} yawns at you.', '{player} yawns at {target}.'),
('grovel', 'Grovel pathetically', 'You grovel pathetically.', '{player} grovels pathetically.', 'You grovel before {target}.', '{player} grovels before you.', '{player} grovels before {target}.'),
('cackle', 'Cackle with glee', 'You cackle with glee!', '{player} cackles with glee!', 'You cackle at {target}!', '{player} cackles at you!', '{player} cackles at {target}!'),
('smirk', 'Smirk knowingly', 'You smirk knowingly.', '{player} smirks knowingly.', 'You smirk at {target}.', '{player} smirks at you.', '{player} smirks at {target}.'),
('salute', 'Salute smartly', 'You salute smartly.', '{player} salutes smartly.', 'You salute {target}.', '{player} salutes you.', '{player} salutes {target}.')
ON CONFLICT (LOWER(command)) DO NOTHING;
