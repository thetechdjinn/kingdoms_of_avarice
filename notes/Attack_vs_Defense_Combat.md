**NOTE:** This is based on research and not currently implemented in code. It's a reference for now with possible future implementation.

# Attack vs Defense During Combat - Based on MajorMUD Research

I'll search for information about MajorMUD's combat mechanics and how attack and defense are calculated.Based on my research into MajorMUD's combat system, here's how attack and defense calculations work during a combat swing:

## Hit/Miss Determination

The basic formula for determining if an attack hits uses accuracy vs. defense:

**Miss Chance = ((D×D) / (A×A)) / 100**

Where:

- D = total defensive stats (AC + hidden AC like shadow, prev)
- A = total accuracy stats

Secondary defenses factor in at 1:1 ratio — for example, 20 prev equals 20 AC, and shadow adds a flat 10. The formula was implemented with division by 10 twice (rather than 100), which became important when combat changes occurred between versions.

There's a cap on hit rates — at high levels, combat tends to result in either 5 misses or 5 hits because the range of AC and accuracy values that don't return capped results is quite narrow.

## Accuracy Calculation

Accuracy is determined by multiple factors including level, stats, and combat class. Testing showed that at base stats (all 50), accuracy increased with level from roughly 6% at level 1 to 72% at level 25 against a test monster. Strength is the main stat contributor to accuracy — going from 50 to 100 strength improved hit rate from 45% to 61%. Agility provides a smaller bonus (45% to 55% over the same range), while intellect and charm have no effect on accuracy.

Combat class creates hard accuracy caps:

- Combat-5: 95-99% (possibly uncapped)
- Combat-4: 90-95%
- Combat-3: 85-90%
- Combat-2: 80-85%
- Combat-1: 75-80%

The accuracy bonus from level and combat class follows a pattern based on square numbers (levels 4, 9, 16, 25 show larger accuracy increases). Each combat level adds a base of 6 accuracy (Combat-1 has base 13, Combat-2 has 19, etc.).

## Damage Calculation

For regular attacks, damage is calculated as a random value between the weapon's min and max damage. Damage Reduction (DR) from armor is then subtracted.

**Special attacks use multipliers with an important distinction:**

- **Bash**: 3.3 × (weapon damage - monster DR). DR is calculated _before_ the multiplier, making bash less efficient against high-DR enemies.
- **Smash**: 6.0 × (weapon damage - DR). Same DR timing as bash.
- **Critical hits**: random(2.0 to 4.0) × max damage, then DR subtracted _after_. This makes crits much more efficient at penetrating high-DR enemies.

For crits specifically, the formula is: ((random 2.00 to 4.00) × weapon max damage) - monster DR

## Magic Resistance

For non-antimagic spells:
**Damage reduction = Damage × ((MR-50)/200)**
MR is capped at 150, meaning maximum 50% damage reduction. Note that the damage shown to the user doesn't include this calculation.

For antimagic spells:
**Damage = Damage - (Damage × (MR/200))**
There's no maximum cap for antimagic resistance.

## Dodge

The dodge formula was changed so it's now checked against the attacker's accuracy to determine if the defender dodged. Your chance to dodge varies depending on the attackers you battle.

It's possible to take zero damage from an attack if your damage reduction exceeds the attack's damage value — the attack will "glance" off your armor.

This system creates interesting tactical choices: bash provides consistent high damage but struggles against armored foes, while critical hits are less consistent but can penetrate heavy armor effectively.
