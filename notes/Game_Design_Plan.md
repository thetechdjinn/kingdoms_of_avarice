# Game Design Plan

** Important:** The underlying engine should agnostic of specific hard-coded classes and races. They should be data driven not specific to
any one class or race. ie, having spells should not be hard coded in the engine, but the ability to implement a spell with the engine
should be possible. I will try to dictate what type of abilities the engine needs to accomplish this.

## Player Characters

Player characters will have a similar makeup to MajorMUD characters with classes and races. They will have a lot of different
stats and abilities that will be unlocked as they progress through the game. Some will have spells or other special abilities that
will be unlocked as they progress through the game for those specific clases or races.

For instance, a Goblin Druide will have the core abilities that make it a Druid, but racial modifiers from the goblin race.

**Druids:** 4-7 HPs per level, Druid-3 Spells, A physical combat rating of 3, Can use only blunt weapons, limited to leather armor types.
**Goblins:** Strength range 30-70max, dexterity range 55-125max, intelligence range 45-115max, constitution range 40-100max, charisma range 40-100max, Special abilities: Night vision, Racial stealth.

So, we need abilities that can be applied to any class or race and spells that can be of different types and have different effects and how those affects are applied. (Damage over Time, Healing over Time, see invisble, fireall direct damage.)

### Leveling Up

When leveling up, a player will get a HP roll based on a range provided by their class and race combined abilities. They will also be able to atain new attributes, abilities, and spells if it's part of their Class or Race for that level.

They will also have an experience table that will be basically the same for all classes, but they will also have an essence that each class must obtain to level up. This essense will be like a mastery of the class that is required.

### Essence or Mastery

The character will complete tasks or quests to obtain essense. They may "spend" essence before they level to unlock new attributes or empower their class. If they do this, they must again regain that essense or they cannot level up again until they do. This provides options to improve your character before you level up if deemed worthy by the player.

## Classes

Classes will defind the major attributes of the player character.

Classes will provide the specific toolsets that a player character is built around.

## Races

Races will provide modifiers to the class chosen. Some races will be better suited to certain classes than others.

Races can provide racial traits like night vision, racial steath, etc.

## Attributes

Attributes will provide the specific toolsets that a player character is built around. Attributes will be things like strength, dexterity, intelligence, constitution, charisma, and wisdom. There will be other attributes also like stealth, lockpicking, immunity, and resistance.

### Spellcasting Ability

Spellcasting ability will provide the specific toolsets that a player character is built around. Spellcasting ability will be things like intelligence, wisdom, and charisma. There will be other attributes also like spell resistance, spell immunity, and spellcasting proficiency.

Spellcasting ability will be determined the stats of the player character and any attributes that may affect them like items and enchantments, etc. The spells themselves will have difficulty levels to cast and a player can always fail to cast a spell even if they have a very high spellcasting ability as there is always a chance to fail when the spell is cast.

## Stealth

Stealth is an attribute that can be provided via the class or the race and combining a stealthy class with a stealthy race (liek a rogue goblin) will provide a signficate advanage in stealth.

### Using Stealth

Stealth can be used by typing "sneak". You can type as short as "sn" to sneak or anything up to the full word "sneak".

When yuou type sneak, a stealth roll should be made and if you fail, a fail message should be displayed to the user and anyone in the room with them. If you succeed. No message is sent to anyone, but the player will be able to move silently. When a player moves silently, there is a chance that they may break their stealth and be detected by a player or monster. When this happens, a message should be displayed to the user and anyone in the room with them.

### Stealth During Combat

A player cannot attempt to sneak while be engaged in combat or any other player or NPC engaging them in combat. If a player attempts to sneak while engaged in combat, a message should be displayed to the user that they cannot sneak while engaged in combat.

## Combat

Combat will be a live system where combat arounds occur every four seconds. (the seconds per round should be configurable) This timer will be global and always running. If a player engages in combat, it will note "_COMBAT ENGAGED_" and the player or monsters attack will be scheduled to occur when the combat timer is exected to execute.

If a player is casting a direct damage attack spell, that spell will have to wait until the combat round occurs before it can be cast. Players will be able to cast non-direct damage spells at any time provided they have met their cooldown and they have enough mana to cast it.

For instance: You can cast a Damage Over Time or healing spell at any time provided you have met your cooldown for that spell and you have enough mana to cast it.

### Combat Level

Combat level is the ability level of the player character to perform physical combat. The range of 1-5. A Priest or Mage may only have a combat level of 1, whereas a warrior may have a combat of a 4 while a Witchhuunter or Ranger may have a combat level of 5.

The combat level will determine the amount of damage a player character can deal in physical combat, while a mage who may be combat level 1 can use it's spells to deal heavy damage to a player as that spell damage is not related to combat damage. Combat damage is swinging some sort of weapon.

### Dying in Combat or in the Game.

When a character dies, he should be transported to a spawn room.

#### Damage Types

Damage types can come in many forms: Acid, bludgeoning, cold, force, lightning, nectroic, peircing, poison, psychic, radiant, slashing, and thunder.

#### Physical Damage Types

Bludgeoning: Blunt force (maces, hammers, falls, earthquakes, rocks, etc).
Piercing: Punctures (arrows, fangs, daggers).
Slashing: Cuts (swords, axes).

#### Elemental & Energy Damage Types

Acid: Corrosive substances.
Cold: Freezing effects (ice, frost).
Fire: Heat and combustion.
Lightning: Electrical energy.
Thunder: Sonic vibrations, concussive force.

#### Magical & Exotic Damage Types

Necrotic: Dark, life-draining energy (death magic, undead attacks).
Psychic: Mental attacks (mind control, telepathic assaults).
Radiant: Holy or divine energy (celestial attacks, holy smites).
Force: Pure magical energy (magic missiles, force barriers).

#### Damage Over Time (DoT) Types

Poison: Toxins that deal damage over time until cured or expired.
Infestation: Parasites or swarms that deal damage over time.

### Damage Resistance

Damage resistance is an attribute of a player character via their class or race or can be provided by equipment, spells, or other means like quests.

Damage resistance can also be specific to a damage type. For instance, a player character may have a resistance to fire damage, but not to cold damage. The level of resistance will determine how much damage is reduced or taken. A standard resistance level will take normal levels of damage, but an increased resistance will take less while a lower resistance will take more damage.

### Damage Immunity

Damage immunity is an attribute of a player character via their class or race or can be provided by equipment, spells, or other means like quests. Some items or monsters may have immunity to certain damage types. There could also be "safe rooms" where all damage is negated and combat is disabled.

Damage immunity can also be specific to a damage type. For instance, a player character may have immunity to fire damage, but not to cold damage. The level of immunity will determine how much damage is reduced or taken. A standard immunity level will take normal levels of damage, but an increased immunity will take less while a lower immunity will take more damage.

## Spells

Spells and spell like abilities are ability to deal direct damage, or direct healing. They can also be buffs to increase or decrease players attributes.

### Time Based Spells

There should be spell types that apply affects over time. This can be positive or negative effects that is sometimes called Damage-Over-Time (DoTs) or Heal-Over-Time (HoTs). These spells will have a duration and a tick rate. The duration is the total time the spell will last and the tick rate is the time between each effect.

These spells can be single-target or area-of-effect (AoE).

### Direct Damage Spells

Direct damage spells are spells that deal damage to a player or monster. These spells have a damage type that determines the type of damage dealt.

Spells are either **single-target** (requiring a specific target in the same room, or self-only) or **area-of-effect (AoE)** which affects all valid targets in the current room only.

### Direct Healing Spells

Direct healing spells are spells that heal a player or monster. They restore health immediately when cast.

Healing spells are either **single-target** (requiring a specific target in the same room, or self-only) or **area-of-effect (AoE)** which heals all valid targets in the current room only.

### Buff Spells

Buff spells are spells that increase or decrease player attributes. They have a duration and a buff type that determines what attributes are affected.

Buff spells are either **single-target** (requiring a specific target in the same room, or self-only) or **area-of-effect (AoE)** which affects all valid targets in the current room only.

### Other Spells

There can be spells that may trasnport you or another to another location. There can also be spells that create objects, destroy objects, or other spells that may have other effects like creating a portal that transports you to another location that has a timeout and it disappears. They may also be used to unlock doors, detect traps, or other spells that may have other effects.

## Items

**Items Already Exist:** Items already exist in the game, but we may need to make modifications to the items.

Items are objects that can be worn, used, or consumed. Items can also be sold, bought, or traded. Items can also be enchanted to provide additional effects or benefits. Items can also be destroyed or broken. Items can also be combined to create other items.

There can be item that are unmovable or immovable nor be destroyed.

Items that can be used by players charactesr may also have stat requirements like strength, dexterity, intelligence, wisdom, and charisma. They may also have level requirements to use them. They can even have class or race requirements to use them.

Some may be quest specific or no-drop items and can even have curses or blessings that affect them that affect their stats or attributes.

Some items may be throwable or require two-hands or only equiptable in a specific slot on a character. They can also be stackable so that when you have more than one, it will only show it once, but provide a count of how many you have or how many that is on the ground.

They can also be hidden if they are on the ground.

There can also be limited items that only a certain number of them can be created. These items should never clean up.

Finally, they can be "cleaned up" via a cleanup command to remove items from the game world that have little or no value. Again limited items should never clean up.

There should also be a administrative command that can remove limited items or detect what room they are in or on what players they are on.

## Rooms

**Rooms Already Exist:** Rooms already exist in the game, but we may need to make modifications to the rooms.

There should be a attribute added to roooms that can make them a respawn room or a spawn room for a newly created players character.
