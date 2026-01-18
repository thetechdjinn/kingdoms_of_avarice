Based on my comprehensive research, I now have sufficient information to provide a detailed answer about how dodge worked in MajorMUD.

---

# MajorMUD Dodge Mechanics

## Classes with Dodge Ability

In MajorMUD, **Ninjas and Mystics** were the only two classes that possessed the innate **Dodge** ability. This was one of their signature defensive mechanics that distinguished them from other classes and compensated for their lighter armor restrictions. [kyau](https://kyau.net/wiki/MajorMUD:Mystic)

### Base Class Dodge Bonuses

Both classes received substantial base dodge bonuses: [majormud](https://www.majormud.com/mudhelp_classes.html)

- **Ninja**: +25% base dodge
- **Mystic**: +25% base dodge

These bonuses were built into the class abilities and were not dependent on level or stats—they were intrinsic to choosing these classes. [breakintochat](https://breakintochat.com/wiki/MajorMUD)

## Dodge Formula and Calculations

### Basic Dodge Percentage

The fundamental dodge calculation in MajorMUD was relatively straightforward: **+1 dodge = +1% dodge chance**. This meant that if a character had accumulated 50 points of dodge from various sources, they would have a 50% chance to dodge incoming attacks. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2624)

### Stat Contributions to Dodge

Through extensive player testing documented on MudInfo, the primary stats that contributed to dodge were identified: [mudinfo](https://www.mudinfo.net/viewtopic.php?t=1647)

**Per 10 points of stat increase:**

- **Agility**: +2% dodge (approximately) [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)
- **Charm**: +1% dodge [mudinfo](https://www.mudinfo.net/viewtopic.php?t=1647)

Agility had roughly **twice the impact** on dodge compared to Charm. This made Agility the paramount stat for dodge-focused characters, particularly for Ninja and Mystic builds. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

### Combat Sequence

Dodge was checked **before** armor class (AC) calculations in the combat sequence: [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2624)

1. Monster determines which player character to attack
2. **Dodge roll** (if dodge triggers, combat swing ends with dodge message)
3. Roll attack hit (test Accuracy vs. AC)
4. Test if attack roll was critical
5. Roll damage if hit was successful or critical

This meant dodge provided a complete avoidance mechanism—dodged attacks dealt **zero damage** and bypassed all other defensive calculations. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2624)

## Racial Dodge Bonuses

Only one race in MajorMUD had an innate racial dodge bonus: [wiki.mud](https://wiki.mud.fyi/en/majormud/races)

- **Halfling**: +10% base dodge

This racial trait made Halflings particularly attractive for Ninja and Mystic classes, as it stacked with the class bonus for a combined **+35% dodge** before any stat or equipment contributions. [mudinfo](https://www.mudinfo.net/viewtopic.php?p=3165)

## Equipment and Quest Bonuses

### Quest Rewards

The **Apparatus/Wererat Quest** (Level 25) provided a permanent **+1% dodge** bonus upon completion. This was one of the few quest rewards in the game that directly increased dodge percentage. [wiki.mud](https://wiki.mud.fyi/majormud/quests/flags)

### Equipment Bonuses

Various equipment pieces provided dodge bonuses, including: [turbosentry](https://turbosentry.info/info/armour)

- **Armors with dodge bonuses** (typically +1 to +5 dodge)
- **Rings and accessories** (such as the white gold ring from the first alignment quest, providing +5 dodge)
- **Weapons with Quick and Nimble/Deadly properties**

High-level optimized characters could accumulate **+100 or more total dodge** from all sources combined (class, race, stats, equipment, and quests). [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

## Dodge Caps and Diminishing Returns

### Soft Cap at 52%

Player testing revealed a **soft cap at approximately 52% effective dodge**. Beyond this threshold, diminishing returns became extremely harsh: [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

**Level 35 Halfling Ninja testing results (with +35 base from race/class):** [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

| Encumbrance | Agility | Effective Dodge % |
| ----------- | ------- | ----------------- |
| 0%          | 100     | 42%               |
| 0%          | 110     | 44%               |
| 0%          | 120     | 46%               |
| 0%          | 135     | 52-53%            |
| 0%          | 140     | 52%               |
| 0%          | 150     | 52%               |

Notice that increasing Agility from 135 to 150 (+15 points, theoretically +3% dodge) provided **no additional dodge benefit** once the 52% threshold was reached. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

### High-Level Maximum Dodge

At level 59 with optimal dodge gear (including dragonfang ninjato and gunsen), characters could achieve **85-90% effective dodge**: [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

**Level 59 comparative testing:** [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

| Race            | Agility | Total Dodge Bonus | Effective Dodge % |
| --------------- | ------- | ----------------- | ----------------- |
| Halfling Ninja  | 150     | +112              | 89-90%            |
| Nekojin Ninja   | 130     | +102              | 88-89%            |
| Dark-Elf Ninja  | 120     | +102              | 87-88%            |
| Dwarf Ninja     | 90      | +102              | 86-87%            |
| Half-Ogre Ninja | 60      | +102              | 85%               |

The data shows that while diminishing returns were present, they did not impose a hard cap. However, the marginal benefit of additional dodge bonuses decreased substantially beyond certain thresholds. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

**Key observation:** A 90-point difference in Agility (150 vs. 60) with the same equipment bonuses (+102) resulted in only a **4-5% difference** in effective dodge (89-90% vs. 85%). This demonstrates severe diminishing returns at high dodge values. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

## Encumbrance Effects on Dodge

Testing revealed that **encumbrance had no linear effect on dodge**. However, a penalty appeared to apply above **light encumbrance** (approximately 32% or less): [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

**Level 59 Dwarf Ninja encumbrance testing:** [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

| Encumbrance  | Agility | Dodge Bonus | Effective Dodge % |
| ------------ | ------- | ----------- | ----------------- |
| 0%           | 90      | +102        | 86-87%            |
| 34% (Medium) | 90      | +102        | 86-87%            |

Interestingly, the encumbrance penalty could be compensated for with additional dodge bonuses from equipment or stats. This meant that characters in slightly heavier armor could maintain competitive dodge rates if they invested more heavily in Agility or dodge gear. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

## Monster Accuracy vs. Dodge

The dodge calculation was influenced by **monster accuracy**. While the exact formula was not fully documented in official sources, player research suggested: [mudinfo](https://www.mudinfo.net/viewtopic.php?t=3112)

- **If monster accuracy ≤ 8**, dodge chance was reduced to 0 [mudinfo](https://www.mudinfo.net/viewtopic.php?t=3112)
- **Otherwise**, the dodge value was multiplied by 10 and divided by the monster's accuracy rating [mudinfo](https://www.mudinfo.net/viewtopic.php?t=3112)

This meant that against **high-accuracy monsters** (those with 100+ accuracy), dodge effectiveness was significantly reduced. This created a natural balance where dodge-focused characters excelled against regular enemies but faced challenges against elite monsters with exceptional accuracy. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=3112)

## Leveling and Dodge Improvement

**Dodge did NOT improve automatically with character level**. Unlike some other combat mechanics, dodge was entirely dependent on: [mudinfo](https://www.mudinfo.net/viewtopic.php?t=1647)

1. **Class bonus** (fixed +25% for Ninja/Mystic)
2. **Racial bonus** (fixed +10% for Halfling)
3. **Stat investment** (primarily Agility, secondarily Charm)
4. **Equipment bonuses** (accumulated through better gear)
5. **Quest completion** (+1% from Wererat Quest)

This meant that a level 10 Ninja with minimal Agility investment would have similar dodge to a level 30 Ninja with the same stats and equipment, emphasizing the importance of **active stat development** rather than passive level progression.

## Strategic Implications

### Optimal Stat Progression for Dodge Builds

For Ninjas and Mystics focused on maximizing dodge: [kyau](https://kyau.net/wiki/MajorMUD:Ninja)

**Priority stat order:**

1. **Agility** (keep 20+ points higher than Intellect/Charm combo)
2. **Intellect and Charm** (raise evenly, +10 increments, Charm first)
3. **Health and Strength** (as needed for HP and weapon requirements)
4. **Willpower** (minimal investment unless magic resistance needed)

This progression maximized the **~2% dodge per 10 Agility** gain while also improving critical hit chance, accuracy, and stealth. [kyau](https://kyau.net/wiki/MajorMUD:Ninja)

### Race Selection for Dodge Optimization

**Sneaking races** (those with racial stealth) were preferred for Ninja and Mystic dodge builds: [kyau](https://kyau.net/wiki/MajorMUD:Mystic)

**Top tier (dodge-optimized):**

- **Halfling**: 150 max Agility + 10% racial dodge = highest raw dodge potential [kyau](https://kyau.net/wiki/MajorMUD:Ninja)
- **Dark-Elf**: 120 max Agility + high Intellect/Charm + stealth [kyau](https://kyau.net/wiki/MajorMUD:Ninja)
- **Elf**: 120 max Agility + exceptional Intellect/Charm balance [kyau](https://kyau.net/wiki/MajorMUD:Ninja)
- **Nekojin**: 130 max Agility + tracking ability [kyau](https://kyau.net/wiki/MajorMUD:Ninja)
- **Goblin**: 125 max Agility + stealth [kyau](https://kyau.net/wiki/MajorMUD:Ninja)

**Non-sneaking alternatives:**

- **Human, Dwarf, Gnome, Half-Elf, Half-Orc**: Lower dodge but cheaper experience costs [kyau](https://kyau.net/wiki/MajorMUD:Mystic)

The testing data confirmed that **race selection for dodge purposes was somewhat nominal**—the difference between a Halfling Ninja (90% dodge) and a Half-Ogre Ninja (85% dodge) at level 59 with optimal gear was only 5%. Players were encouraged to choose races based on overall playstyle preferences rather than purely optimizing for dodge. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

## Modified Server Variations

Some custom MajorMUD servers (particularly MudRevolution and GreaterMUD) implemented **modified dodge mechanics**: [reddit](https://www.reddit.com/r/MUD/comments/165o9jx/greatermud_realms_resetting_92_for_pvp_and_916/)

- **Reworked dodge diminishing returns** optimized specifically for Ninja and Mystic classes
- **Additional 10% dodge before diminishing returns** applied for these classes
- **Alternative soft caps** and scaling formulas

However, in **stock MajorMUD 1.11p** (the official Galacticomm/Metropolis release), the mechanics described above represented the standard implementation. [mudinfo](https://www.mudinfo.net/viewtopic.php?t=2495)

## Summary

Dodge in MajorMUD was a powerful defensive ability exclusive to Ninjas and Mystics, providing:

- **25% base class bonus** (fixed)
- **~2% per 10 Agility** (with diminishing returns beyond 52%)
- **+1% per 10 Charm** (secondary contribution)
- **+10% racial bonus** (Halflings only)
- **Variable equipment bonuses** (typically +5 to +20% from gear)
- **Practical maximum of 85-90%** effective dodge at high levels with optimal builds

Unlike critical hit chance, dodge had **no improvement from character level alone**—it required deliberate investment in Agility, appropriate gear selection, and race/class synergies. The soft cap at 52% and severe diminishing returns at 85%+ ensured that while dodge-focused characters were highly evasive, they could never achieve complete invulnerability, maintaining game balance even for the most optimized builds.
