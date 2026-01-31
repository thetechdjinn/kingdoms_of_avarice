# Stealth Implementation

Characters with a class or a race that that has stealth as a trait will gain the ability to use stealth then beable to hide, sneak or backstab as an init attack if they can gain surprise on the victim whether it's a real player character or a NPC or monster in the game.

## Gaining Access to Stealth

The only way a character can gain stealth is by having a class or a race that has the "stealth" ability.

In MajorMUD races like Elf, Dark-Elf, Goblin, Halfling, and Nekojin had innate racial steath capabilities.

In MajorMUD classes like Thief, Ninja, Ranger, Bard, Gypsy, Missionary, and Mystic had stealth as a class ability.

Combining a race with stealth and class with stealth provided a higher base stealth starting point providing better overall stealth.  At least in the early game.

## How Stealth was Calculated:

Once you had gained access to stealth (enabling the ability) You get 1 stealth point (two if you have racial and class stealth) Then stealth was calculated based 
on your stats and other modifiers.

The stealth stat was derived from multiple attributes. For every 10 points added to a stat, the stealth bonuses were:

- Dexterity: +2.5 Stealth
- Intellect: +1 Stealth
- Charm: +2.5 Stealth 

Example:

The Goblin race had a base stats in Dexterity 55, Intellect 45, Charisma, 40. 

- 1 Stealth for being Goblin (+1 more if your also a class with racial stealth)
- Dexterity of 55 = +2.5 * 5 (every 10 points) = +12.5 Stealth
- Intellect of 45 = +1 * 4 = +4 Stealth
- Charisma of 40 = +2.5 * 4 = +10 Stealth

Total Stealth for a Goblin Mage (No class stealth) at level 1 without assigning any more stats would be 12.5 (Dex) + 4 (Int) + 10 (Cha) + 1 (Racial Stealth) = 27.5 stealth at level 1.
Total Stealth for a Goblin Thief (Class stealth) at level 1 without assigning any more stats would be 12.5 (Dex) + 4 (Int) + 10 (Cha) + 1 (Racial Stealth) + 1 (Class Stealth) = 28.5 stealth at level 1.

So Dexterity and Charisma were the primary stealth drivers, with Intellect providing a smaller bonus.

Additionally:

- Stat thresholds: Each of the three stealth-contributing stats (Dexterity, Intellect, Charisma) has three thresholds (60, 75, 90). For each stat that reaches a threshold, you gain +1 stealth. With three stats and three thresholds each, the maximum bonus is +9 stealth if all three stats reach 90.
- Encumbrance: Carrying too much weight penalizes stealth based on encumbrance level:
  - None (0-17%): No penalty
  - Light (18-33%): No penalty
  - Medium (34-67%): -10 stealth
  - Heavy (68%+): -25 stealth
- Level: Characters gained stealth through class level progression.  They would gain +1 stealth for each level they obtained.

## How Stealth Functioned In-Game

A character with stealth could lurk in wait, concealed in the shadows of the room by typing HIDE, which could be used for a backstab. 
They could also sneak into a room by typing SNEAK and then moving. A hiding character lurks in the shadows and cannot be seen at all 
provided a stealth check is passed. Only when someone uses the SEARCH command will the hider be found.

### Sneak vs Hide

When sneaking, you can be seen in the room, but are not detected entering or leaving the room.  Even though someone looks around the room
and sees a player, they are still in sneak mode and can backstab a player.

When hiding, you cannot be seen in the room without searching.  Hidden player will be seen if they attempt to leave the room without first 
sneaking.   

Note:  You are either sneaking or hidden.  If you attempt to sneak while hidden, you will stop hiding and begin sneaking.

## Environmental Factors

If you have a high stealth and are sneaking around an area with no users or monsters then you will almost never fail. 
As soon as you start sneaking through areas with users in them you will incur a penalty based on the number of users/monsters in the area. 

Specifically, the players, NPC, or monster's perception skill would negatively impact a characters stealth roll.  The higher the perception
one of the players, NPCs, or monsters had.  The larger the negative impact on the players stealth roll.   The more monsters, NPCs, or players 
in the room the player was sneaking into or out of.  The higher the chance of breaking stealth as each monster, NPC, or player had a chance 
to detect the stealthy player.

## Stealthy Attacks

Playesr with stealth could also use backstab attacks for their initial attack.  Once an attack landed, the players was no longer sneaking or hiding.  
Backstabs could only be done with a 1-handed weapon as players are unable to backstab with a two-handed weapon.  (backstabbing is 1 hand weapons only!)

The stealth value was also used in backstab accuracy calculations, where backstabs use stats but also add in the player's total stealth and ignore 
most of the usual accuracy bonuses, instead using BS-specific ones. 

Weapons would have Backstab Accuracy stats (ie, -10 to backstab accuracy), most of the time they had negative values making it harder to land a backstab.

Armor and other items could have Stealth values were chainmail armor may have a high negative stealth value where a robe may have no negative stealth 
value.

See Attack Damage for more information about backstab damage.

## Breaking Stealth

- Entering or exiting a room, a stealth check is made.
- A player engages (attacks) a sneaking player, stealth is immediately broken.
- A sneaking player engages (attacks another player) breaks sneak, unless that attack is a backstab attempt which maintains stealth until the attack happens.
- Using an action (e.g., `laugh player`) against a sneaking player breaks the target's stealth, similar to engaging them in combat. (This fixes a bug in MajorMUD where actions didn't reveal sneaking players.)
- Casting a spell on a player breaks stealth.
- AoE spells cast in a room will hit hidden players and break their hidden/sneaking state.

## Re-entering Stealth After Combat

- Backstabbing (or any attack) engages you in combat (*COMBAT ENGAGED*).
- You cannot attempt to hide or sneak while engaged in combat.
- To re-enter stealth, you must first break combat (e.g., by fleeing or the target dying).
- Even after breaking combat, you can only re-sneak or hide if no other player, NPC, or monster has already engaged you.

## Engaging Hidden vs Sneaking Players

- **Hidden players**: You cannot directly engage (attack) a hidden player. You must first use the SEARCH command to find them.
- **Sneaking players**: You can engage a sneaking player directly since they are visible in the room, just not detected when entering/exiting.

## Breaking Hidden 

- If a player is hidden and someone searches the room.  A perception check is made.  If successful, the person is spotted.
- Items hidden in the room are found this way also.

**Note:** You can backstab while hidden or while sneaking.

## Sneak Specifics

- When attempting to sneak you use the command "sneak" or shortened as "sn".  
- When you attempt to sneak, it will tell you "Attempting to sneak..." and a stealth roll is made, but doesn't tell you if you were successful or not.
- If you successfully made your stealth roll, when you move it will say "Sneaking..." as you are leaving the room.
- When entering the next room, you will make another stealth roll.  If you successed.  You enter the room unnoticed.  
- If someone is in the room when you enter and you fail the steath roll / perception.  It will say in red "You make a sound as you enter the room!"
- If you fail the steath roll while leaving the room or are not sneaking.  It will not show the "Sneaking..." as you are leaving the room.
- If an NPC or monster is in the room and you are currently not sneaking and attempt to start sneaking.  It will say "You may not sneak right now!".
- If you are in a room with other players, but not in combat.  You may attempt to sneak.
- If someone engaged you in combat and you try to sneak, it will say "You may not sneak right now!"

## Hide Specifics

- When you attempt to hide, you must type the command "hide"
- If you attempt to hide, but fail.  It should say "Attempting to hide... You don't think you are hidden."
- If you succeed at hiding, it will just say "Attempting to hide..."
- If an NPC or monster is in the room and you try to hide, it will say "Attempting to hide... You don't think you are hidden." (Hiding requires physical movement and repositioning which would alert any NPCs or monsters present, even if they hadn't previously detected you.)
- If someone engaged you in combat and you try to hide, it will say "You may not hide right now!"


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
See Hidden would allow mobs to see hidden players.

Perception was your defense against being found (via SEARCH) and against being successfully backstabbed, while Stealth was the attacker's offensive stat for 
remaining hidden and landing backstabs.

---

# Attack Damage

## Normal Weapon Damage

For regular attacks, damage was calculated as a random value between the weapon's minimum and maximum damage, modified by:

- Strength: Added to maximum damage (strength above 50)
- Damage Resistance (DR): Subtracted from damage

For special attacks, different multipliers applied:

- Bash: Uses a static multiplier of 3.3 × random(min dmg to max dmg), with DR calculated before the multiplier
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

## More Attack Macheanics

### The Mechanic

For normal combat, the hit/miss calculation compared:

- Attacker's accuracy (from stats, level, combat level, gear, spells, quests) vs.
- Target's full AC + secondary defense (the "hidden AC" which includes spells like Shadow, Prev, etc.)

For backstabs, the calculation was different on both sides:

- Attacker's backstab accuracy = Stats + Stealth + BS-specific accuracy bonuses (ignoring most normal accuracy bonuses)
- Target's backstab defense = (AC / 2) + (Perception / 2)

### Why This Mattered

This had significant implications:

1. Secondary AC is ignored: Spells like Shadow and Protection spells that added "hidden AC" didn't help against backstabs at all. This made even heavily buffed 
   characters vulnerable to a well-executed backstab. 

2. Perception becomes critical: Characters with high Intellect (the primary stat for Perception) had much better odds of detecting and surviving backstab 
   attempts. A high-perception character could foil an ambush's surprise attack.

3. Physical AC still matters, but halved: Heavy armor still helped somewhat, but only contributed half its normal value to backstab defense.

4. Stealth = accuracy for backstabs: The attacker's stealth stat directly fed into their backstab hit chance, making the Agility/Intellect/Charm stats that 
   boosted stealth doubly important for sneaker classes—they affected both hiding success AND backstab accuracy.

So essentially, a sneaky thief with maxed stealth could reliably land backstabs on targets with high AC + magical defenses who would otherwise be very hard to hit in normal combat, but would struggle against perceptive targets (typically mages and other high-Int characters).