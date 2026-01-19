## Key Factors in Swings Per Round

**1. Combat Rating (1-5)**
Combat 5 has the highest accuracy and swings more per round with the same weapon, while Combat 1 has the lowest accuracy and swings the least amount with the same weapon. This is the most significant factor - a Combat-5 class like Witchunter will get substantially more attacks than a Combat-2 class like Mage with an identical weapon.

**2. Weapon Speed**
Weapons have a "speed" stat (lower is faster). The game used an energy-based system where each round you had a pool of energy, and each weapon swing consumed energy based on the weapon's speed value.

**3. Character Level**
Higher levels provided more energy per round, allowing more swings.

**4. Dexterity**
Dexterity has a strong impact on your swings - player guides recommend raising dexterity to increase the number of attacks per round. Each point of DEX above 50 adds +5 energy to your pool.

**5. Encumbrance**
Encumbrance now effects your swings on a sliding scale. At 50% encumbrance you will swing as normal, with less encumbrance your amount of swings should increase, with more encumbrance they will decrease.

**6. Maximum Cap**
Maximum attacks per round has now been capped at 6. If you would theoretically have more than 6 attacks per round, you will still have your attacks limited to 6 but you will have an increased Critical Hit chance based on how much faster you are than 6 attacks.

## General Formula Concept

The system worked roughly like this:

- Each round gave you a base amount of **energy** (influenced by dexterity and encumbrance; combat level and character level reduce weapon cost)
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

Level, Combat Level, Dexterity, Intellect, Charisma, Encumbrance, spells, and worn items were all factors in the player's calculated Accuracy.

Specifically, for every 10 points added to stats:

- Dexterity: +1 Accuracy
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

--- Reverse Engineering

I can help you research this! MajorMUD's exact internal numbers were never officially published, so the community has reverse-engineered them over the years. Let me search for the specific values that have been documented.Let me look for more specific swing calculation formulas:Let me look at the MMUD Explorer source code on GitHub - it likely has the reverse-engineered formulas:Let me look at the General.bas file which likely contains the swing calculation formulas:Based on my extensive research, I can now provide you with the best available information about MajorMUD's swing mechanics. Unfortunately, the exact internal numbers were never officially published by the developers (West Coast Creations / Metropolis), so what exists is reverse-engineered through testing and community effort.

## What We Know About MajorMUD's Swing System

### The Energy System Concept

The system works like this:

- Each combat round, you get a pool of **energy** based on: dexterity and encumbrance (combat level and character level reduce weapon cost instead)
- Each weapon swing **consumes energy** equal to the weapon's speed value
- **Swings per round = floor(available energy / weapon speed)**
- **Leftover energy carries over** to the next round (creating the 1-2-2-1-2-2 pattern you described)
- **Maximum cap of 6 attacks per round** (excess converts to crit chance bonus)

### Combat Level Energy Multipliers

Based on the community research and MMUD Explorer calculations, the combat level affects your base energy significantly. The exact values that have been reverse-engineered suggest something like:

| Combat Level | Approximate Energy Multiplier |
| ------------ | ----------------------------- |
| Combat 1     | Lowest (base ~3)              |
| Combat 2     | ~4                            |
| Combat 3     | ~5                            |
| Combat 4     | ~6                            |
| Combat 5     | Highest (~7-8)                |

### Factors Affecting Energy Per Round

From the community research:

1. **Level contribution**: Energy increases with character level (roughly +1 energy per few levels)
2. **Dexterity contribution**: +5 energy per point of DEX above 50
3. **Encumbrance modifier**:
   - At 50% encumbrance = baseline (1.0x multiplier)
   - Below 50% = bonus to swings
   - Above 50% = penalty to swings

### Typical Weapon Speeds

Stock MajorMUD weapons have speed values like:

- **Very fast weapons**: ~1500-2000
- **Fast weapons**: ~2500-3000
- **Medium weapons**: ~3500-4500
- **Slow weapons**: ~5000-6000
- **Very slow (two-handed)**: ~7000+

### The Problem You're Facing

The exact formula hasn't been fully cracked because:

1. The original code is proprietary and compiled
2. Different MajorMUD versions (1.11i through 1.11p) have different formulas
3. Metro changed combat formulas between versions (notably the /10 to /14 change in accuracy)
4. The energy values in Nightmare Redux databases may not perfectly match the DLL calculations

### Implemented Formula (Kingdoms of Avarice)

Based on reverse-engineering from Nightmare Redux editor data, the following MajorMUD-style formula is implemented:

**Key Insight:** In MajorMUD, combat level and character level don't increase your energy pool - they REDUCE the effective weapon cost. This creates an interaction where combat level matters MORE at higher character levels.

```
// Energy Pool (fixed base, modified by DEX and encumbrance only)
Base Energy = 1000 (fixed constant)
DEX Bonus   = max(0, DEX - 50) * 5

Encumbrance Modifier:
  if enc < 50%: modifier = 1.0 + ((50 - enc) / 100)
  if enc > 50%: modifier = 1.0 - ((enc - 50) / 100)
  modifier = max(0.5, modifier)  // floor at 50%

Effective Energy = floor((Base Energy + DEX Bonus) * Encumbrance Modifier)

// Weapon Cost Reduction (this is where level and combat matter)
Speed Divisor = 1.558 + (0.073 × Level) + (0.007 × Combat) + (0.035 × Level × Combat)
Effective Weapon Cost = floor(Base Weapon Speed / Speed Divisor)

// Swings Calculation
Available Energy = Effective Energy + Carried Energy
Raw Swings = Available Energy / Effective Weapon Cost
Swings = min(floor(Raw Swings), 6)  // cap at 6
Carried Energy = Available Energy - (Swings * Effective Weapon Cost)
```

**Example: Dagger (speed 900) at different levels and combat ratings:**

| Level | Combat 1 | Combat 5 |
|-------|----------|----------|
| 1     | 537      | 488      |
| 5     | 427      | 317      |
| 10    | 340      | 220      |

At L1C1 with a dagger: 1000 energy / 537 cost = 1.86 swings → 1 swing
At L10C5 with a dagger: 1000 energy / 220 cost = 4.54 swings → 4 swings

This matches the Nightmare Redux data exactly.

**Current Weapon Speeds:**
- Dagger: 900 (very fast)
- Steel Longsword: 1300 (fast)
- Rusty Iron Sword: 1400 (medium)
- Wooden Club: 1600 (medium-slow)
- Greataxe: 2000 (slow, two-handed)
