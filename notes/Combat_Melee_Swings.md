## Key Factors in Swings Per Round

**1. Combat Rating (1-5)**
Combat 5 has the highest accuracy and swings more per round with the same weapon, while Combat 1 has the lowest accuracy and swings the least amount with the same weapon. This is the most significant factor - a Combat-5 class like Witchunter will get substantially more attacks than a Combat-2 class like Mage with an identical weapon.

**2. Weapon Speed**
Weapons have a "speed" stat (lower is faster). The game used an energy-based system where each round you had a pool of energy, and each weapon swing consumed energy based on the weapon's speed value.

**3. Character Level**
Higher levels provided more energy per round, allowing more swings.

**4. Agility**
Agility has a strong impact on your swings - player guides recommend raising agility to increase the number of attacks per round.

**5. Encumbrance**
Encumbrance now effects your swings on a sliding scale. At 50% encumbrance you will swing as normal, with less encumbrance your amount of swings should increase, with more encumbrance they will decrease.

**6. Maximum Cap**
Maximum attacks per round has now been capped at 6. If you would theoretically have more than 6 attacks per round, you will still have your attacks limited to 6 but you will have an increased Critical Hit chance based on how much faster you are than 6 attacks.

## General Formula Concept

The system worked roughly like this:

- Each round gave you a base amount of **energy** (influenced by combat level, character level, and agility)
- Each weapon swing consumed energy equal to the weapon's **speed** value
- Your swings = floor(available energy / weapon speed)
- Encumbrance modified this as a multiplier around the 50% baseline
- Remaining energy was conserved to the next round provide more energy making it possible to swing an extra round.

Example:

- A player has 10 energy and a swing uses 6 energy.
- The round occurs and 6 energy is used to swing once with 4 energy remaining.
- The next round, the player gets 10 energy again and the 4 from the previous round for a total of 14 energy allowing the player to swing two times with a remainder of 2 energy.
- The third round occurs and the player gets 10 energy again, please 2 remaining energy for a total of 12. The player can swing twice, with no remainer of energy.
- The forth round occurs and the player again has 10 enery with no remaining energy and can only swing once.
- Rolling Swing totals round by round would look like: 1, 2, 2, 1, 2, 2, 1, 2, 2

# Hit and Miss Mechanics during Combat

## The Core Formula

The chance to miss was calculated as: D=total of defensive stats, A=total of accuracy stats, (((D*D) / (A*A)) /100) = Chance to miss. This created a squared relationship where the ratio between defense and accuracy mattered significantly.

## What Contributes to Accuracy

The attacker's accuracy was built from multiple factors:

Level, Combat Level, Agility, Intellect, Charisma, Encumbrance, spells, and worn items were all factors in the player's calculated Accuracy.

Specifically, for every 10 points added to stats:

- Agility: +1 Accuracy
- Charisma: +1.2 Accuracy

Combat level (1-5) was one of the biggest factors, with Combat-5 classes having substantially higher base accuracy than Combat-1 classes.

## What Contributes to Defense

In normal combat we use a player's armour class plus their secondary defense stat (often referred to as hidden AC) which includes shadow, perception, etc.

Secondary defenses added 1:1, so 20 perception is 20 AC, shadow is a flat 10.

## The Hit/Dodge System

The formula for determining if an attack is successful has been changed. The accuracy cap dependent upon the armour class of the defender is now removed. An attacker's chance to hit is now based on a curve.

The formula for determining dodge has been changed, it is now checked against the accuracy of the attacker to determine if the defender dodged. Your chance to dodge will vary dependent upon the attackers you do battle with.

## Caps and High-Level Combat

There is a rather narrow range of values for AC and ACC that don't return the capped results -- This is one reason why high level combat is also always 6 misses or 6 hits. The system had caps that meant at high levels, combat often resulted in either near-guaranteed hits or near-guaranteed misses depending on the matchup.

## Additional Modifiers

- **Blindness**: Casting blind lost 10 accuracy.
- **Equipment**: Items could provide +accuracy bonuses
- **Spells**: Buff/debuff spells could modify accuracy
- **Encumbrance**: Affected accuracy negatively when too high

The system essentially compared your total accuracy score against the defender's total defensive score (AC + hidden defenses), with the squared relationship making large disparities very impactful.
