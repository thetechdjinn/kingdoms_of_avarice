# Stealth Implementation

Characters with a class or a race that that has stealth as a trait will gain the ability to use stealth then beable to hide, sneak or backstab as an init attack if they can gain surprise on the victim whether it's a real player character or a NPC or monster in the game.

## Gaining Access to Stealth

The only way a character can gain stealth is by having a class or a race that has the "stealth" ability.

In MajorMUD races like Elf, Dark-Elf, Goblin, Halfling, and Nekojin had innate racial steath capabilities.

In MajorMUD classes like Thief, Ninja, Ranger, Bard, Gypsy, Missionary, and Mystic had stealth as a class ability.

Combining a race with stealth and class with steal provided a higher base stealth starting point providing better overall steath.  At least in the early game.

## How Stealth was Calculated:

The stealth stat was derived from multiple attributes. For every 10 points added to a stat, the stealth bonuses were:

- Agility: +2.5 Stealth
- Intellect: +1 Stealth
- Charm: +2.5 Stealth 

So Agility and Charm were the primary stealth drivers, with Intellect providing a smaller bonus.
Additionally:

- Stat thresholds: When stats reached the 60/75/90 levels, characters saw big increases in their respective skills 
- Encumbrance: Heavy encumbrance penalized stealth rolls
- Level: Characters gained stealth through class level progression

## How Stealth Functioned In-Game

A character with stealth could lurk in wait, concealed in the shadows of the room by typing HIDE, which could be used for a backstab. 
They could also sneak into a room by typing SNEAK and then moving. A hiding character lurks in the shadows and cannot be seen at all 
provided a stealth check is passed. Only when someone uses the SEARCH command will the hider be found.

## Environmental Factors

If you have a high stealth and are sneaking around an area with no users or monsters then you will almost never fail. 
As soon as you start sneaking through areas with users in them you will incur a penalty based on the number of users/monsters in the area. 

Specifically, the players, NPC, or monster's perception skill would negatively impact a characters stealth roll.  The higher the perception
one of the players, NPCs, or monsters had.  The larger the negative impact on the players stealth roll.   The more monsters, NPCs, or players 
in the room the player was sneaking into or out of.  The higher the chance of breaking stealth as each monster, NPC, or player had a chance 
to detect the stealthy player.

## Stealthy Attacks

Playesr with stealth could also use backstab attacks for their initial attack.  Once an attack landed, the players was no longer sneaking or hiding  
This could only be done with a 1-handed weapon as players are
unable to backstab with a two-handed weapon.  There were alsoA successful backstab 

The stealth value was also used in backstab accuracy calculations, where backstabs use stats but also add in the player's total stealth and ignore 
most of the usual accuracy bonuses, instead using BS-specific ones. 

Weapons would have Backstab Accuracy stats (ie, -10 to backstab accuracy), most of the time they had negative values making it harder to land a backstab.

Armor and other items could have Stealth values were chainmail armor may have a high negative stealth value where a robe may have no negative stleath 
value.

See Attack Damage for more information about backstab damage.

---

# The Secondary Perception Stat

## How Perception Worked

Perception was a derived (secondary) stat, not a base stat you directly increased. The perception formula was approximately: 

Intellect × (6/10) + Willpower × (2/10) + Charm × (1/10) 

So Intellect was the primary contributor, with Willpower and Charm adding smaller amounts.

In terms of stat increases: For every 10 points added to Intellect, you gained +6 Perception. For every 10 points added to Willpower, you gained +2 Perception. 
For every 10 points added to Charm, you gained +1 Perception. 

## Perception's Role in Detection

Perception's most common function was used while searching for secret doors and traps, and while searching rooms for concealed items. It also affected your 
chances of surviving a backstab attempt — characters with high Perception had a much greater probability of foiling an ambush's surprise attack. 

## The Search Command

A hiding character lurks in the shadows, and cannot be seen at all provided a stealth check is passed. Only when someone uses the SEARCH command will the 
hider be found. 

When you used the SEARCH command, your perception was pitted against the hidden character's stealth to determine if you found them.

## Perception vs. Backstab Defense

For backstabs, the game used a player's armor class divided by 2 plus their perception divided by 2 as the defensive calculation. So a target with high perception 
or AC will prove to be a difficult target for backstab attempts.

## Special Abilities

Some monsters and the Gaunt One race had a "See Hidden" ability that allowed them to automatically detect hidden players without needing to search. 
See Hidden would allow mobs to see hidden players. , but if they were sneaking too then it didn't always work. Since most people who are hiding were 
also sneaking prior to trying to hide, most monsters never saw you.  This bug was eventually fixed.

Perception was your defense against being found (via SEARCH) and against being successfully backstabbed, while Stealth was the attacker's offensive stat for 
remaining hidden and landing backstabs.

---

# Attack Damage

## Normal Weapon Damage

For regular attacks, damage was calculated as a random value between the weapon's minimum and maximum damage, modified by:

- Strength: Added to maximum damage (strength above 50)
- Damage Resistance (DR): Subtracted from damage

For special attacks, different multipliers applied:

- ash: Uses a static multiplier of 3.3 × random(min dmg to max dmg), with DR calculated before the multiplier
- Smash: 6x multiplier, with DR calculated before the multiplier 
- Critical hits: DR is calculated after the multiplier, making them very efficient at penetrating high-DR enemies. A crit 
  only uses your total max damage in the calculation. 

## Backstab Damage

Backstab damage worked differently from normal combat in several key ways:

1. Level-based scaling: Backstab does very high damage at higher levels Kyau — the damage scaled significantly with character level. Improved backstab 
   damage was most noticeable at higher levels. 

2. Class-specific bonuses: Different classes had different backstab bonuses built in. Thieves were supposed to have the best backstabbing bonuses of 
   sneaking/backstabbing classes, with ninjas second. 

3. Equipment bonuses: Gear could add modifiers like +BS min damage, +BS max damage, and +BS accuracy. You could increase backstab effectiveness 
   like "BS min damage +5" or scale it per level such as "min damage +1 per level." 

4. Accuracy calculation: Backstabs use stats, but also add in the player's total stealth, ignore most of the usual accuracy bonuses and instead use BS-specific ones. 

5. Defense calculation: For backstabs, the game used a player's armor class /2 plus their perception /2  as the defensive calculation, rather than full AC plus 
   secondary defenses used in normal combat.  

6. Secondary AC ignored: Secondary AC only works in some cases. Backstabbing would ignore secondary AC.

Note: I'm not sure we have added secondary AC to the system yet.