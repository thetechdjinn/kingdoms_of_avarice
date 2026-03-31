# Combat Energy System

This document explains the attack energy mechanics that determine how many swings (attacks) a character can make per combat round.

## Overview

Each combat round, characters have a pool of **energy** that determines how many attacks they can perform. The number of attacks (swings) is calculated by dividing available energy by the weapon's **speed** (energy cost per swing).

```
swings = floor(energy / weaponSpeed)
```

The maximum attacks per round is capped at **6 swings**. Any excess energy beyond what's needed for 6 swings converts to bonus critical hit chance (+1% per excess swing worth of energy).

## Database Configuration

All combat settings are stored in the `game_settings` table and can be modified without code changes:

| Setting Key                    | Default | Description                           |
|--------------------------------|---------|---------------------------------------|
| `combat_base_energy`           | 20000   | Base energy before multipliers        |
| `combat_default_weapon_speed`  | 1500    | Speed for weapons without attack_speed|
| `combat_max_attacks_per_round` | 6       | Maximum swings per round              |
| `combat_round_interval_ms`     | 4000    | Time between combat rounds (ms)       |
| `combat_unarmed_speed`         | 900     | Speed when fighting unarmed           |
| `combat_level_multipliers`     | JSON    | Energy multipliers by combat level    |
| `combat_level_accuracy_bonus`  | JSON    | Accuracy bonus by combat level        |

**Example SQL to modify settings:**
```sql
-- Change base energy
UPDATE game_settings SET value = '25000' WHERE key = 'combat_base_energy';

-- Change combat level multipliers
UPDATE game_settings
SET value = '{"1": 0.5, "2": 0.7, "3": 0.85, "4": 1.0, "5": 1.2}'
WHERE key = 'combat_level_multipliers';
```

Settings are cached for 1 minute to avoid database hits on every combat round.

## Scale

Energy and weapon speed use large values (thousands) to allow fine-grained weapon balancing, similar to MajorMUD's system. This allows subtle differences between weapons - e.g., speed 1650 vs 1725 is only a 4.5% difference, impossible to express with single-digit integers.

**MajorMUD Reference Values:**
- Curved Bone Dagger (fastest): ~700
- Battle Axe: ~1725
- Vorpal Sword: ~3000

## Energy Calculation Formula

```
totalEnergy = baseEnergy × combatMult × levelMult × dexMult × encMult
```

Where:
- **baseEnergy** = 20,000 (constant)
- **combatMult** = Combat level multiplier (see table below)
- **levelMult** = 1 + (characterLevel - 1) × 0.02
- **dexMult** = 1 + max(0, (DEX - 50) / 10) × 0.01
- **encMult** = 1 + (0.5 - encumbranceRatio) × 0.5 (minimum 0.5)

### Combat Level Multipliers

| Combat Level | Multiplier | Example Classes        |
|--------------|------------|------------------------|
| 1            | 0.60       | Mage, Priest           |
| 2            | 0.75       | Warlock                |
| 3            | 0.90       | Druid                  |
| 4            | 1.00       | Warrior                |
| 5            | 1.15       | Witchunter, Ranger     |

### Encumbrance Effects

| Encumbrance % | Energy Modifier |
|---------------|-----------------|
| 0%            | +25%            |
| 25%           | +12.5%          |
| 50% (baseline)| No change       |
| 75%           | -12.5%          |
| 100%          | -25%            |

## Energy by Combat Level & Character Level

*Assuming 50 DEX, 50% encumbrance (baseline conditions)*

| Combat Level | Level 1  | Level 10 | Level 25 | Level 50 |
|--------------|----------|----------|----------|----------|
| 1 (Mage)     | 12,000   | 14,160   | 17,760   | 23,760   |
| 2 (Warlock)  | 15,000   | 17,700   | 22,200   | 29,700   |
| 3 (Druid)    | 18,000   | 21,240   | 26,640   | 35,640   |
| 4 (Warrior)  | 20,000   | 23,600   | 29,600   | 39,600   |
| 5 (Ranger)   | 23,000   | 27,140   | 34,040   | 45,540   |

## Weapon Speed Reference

**Default weapon speed is 1500** if not specified on the item.

### Recommended Weapon Speed Ranges

| Weapon Type       | Speed Range   | Description                    |
|-------------------|---------------|--------------------------------|
| Daggers           | 700-900       | Very fast, many attacks        |
| Short Swords      | 1000-1200     | Fast, balanced                 |
| Long Swords       | 1200-1500     | Standard speed                 |
| Maces/Axes (1H)   | 1400-1700     | Slightly slow, more damage     |
| Two-Handed Swords | 1800-2200     | Slow, high damage per hit      |
| Polearms/Great    | 2200-3000     | Very slow, highest damage      |

### Seed Item Speeds

| Weapon           | Speed | Notes                    |
|------------------|-------|--------------------------|
| Iron Dagger      | 800   | Fast piercing weapon     |
| Steel Longsword  | 1300  | Quality one-hand sword   |
| Rusty Iron Sword | 1400  | Mediocre condition       |
| Wooden Club      | 1600  | Crude bludgeon           |
| Battle Axe       | 1900  | Two-handed, high damage  |
| Unarmed (fists)  | 900   | Fast but low damage      |

## Energy Required for X Swings

| Weapon Speed | 1 swing | 2 swings | 3 swings | 4 swings | 5 swings | 6 swings |
|--------------|---------|----------|----------|----------|----------|----------|
| 700          | 700     | 1,400    | 2,100    | 2,800    | 3,500    | 4,200    |
| 800          | 800     | 1,600    | 2,400    | 3,200    | 4,000    | 4,800    |
| 900          | 900     | 1,800    | 2,700    | 3,600    | 4,500    | 5,400    |
| 1000         | 1,000   | 2,000    | 3,000    | 4,000    | 5,000    | 6,000    |
| 1200         | 1,200   | 2,400    | 3,600    | 4,800    | 6,000    | 7,200    |
| 1500 (default)| 1,500  | 3,000    | 4,500    | 6,000    | 7,500    | 9,000    |
| 1700         | 1,700   | 3,400    | 5,100    | 6,800    | 8,500    | 10,200   |
| 1900         | 1,900   | 3,800    | 5,700    | 7,600    | 9,500    | 11,400   |
| 2200         | 2,200   | 4,400    | 6,600    | 8,800    | 11,000   | 13,200   |
| 2500         | 2,500   | 5,000    | 7,500    | 10,000   | 12,500   | 15,000   |
| 3000         | 3,000   | 6,000    | 9,000    | 12,000   | 15,000   | 18,000   |

## Practical Examples: Swings by Class/Level and Weapon Speed

| Character           | Energy  | Spd 800 | Spd 1200 | Spd 1500 | Spd 1900 | Spd 2500 |
|---------------------|---------|---------|----------|----------|----------|----------|
| Mage L1             | 12,000  | 6+      | 6+       | 6+       | 6        | 4        |
| Mage L25            | 17,760  | 6+      | 6+       | 6+       | 6+       | 6+       |
| Mage L50            | 23,760  | 6+      | 6+       | 6+       | 6+       | 6+       |
| Warrior L1          | 20,000  | 6+      | 6+       | 6+       | 6+       | 6+       |
| Warrior L10         | 23,600  | 6+      | 6+       | 6+       | 6+       | 6+       |
| Warrior L25         | 29,600  | 6+      | 6+       | 6+       | 6+       | 6+       |
| Warrior L50         | 39,600  | 6+      | 6+       | 6+       | 6+       | 6+       |
| Ranger L1           | 23,000  | 6+      | 6+       | 6+       | 6+       | 6+       |
| Ranger L50          | 45,540  | 6+      | 6+       | 6+       | 6+       | 6+       |

**Note:** With the scaled energy system (base 20,000), most characters at baseline get 6+ swings with typical weapons. The primary differentiator becomes:
1. **Bonus crit chance** from excess energy
2. **Encumbrance penalties** from heavy loads
3. **Very slow weapons** (2500+) for lower-level casters

## Critical Hit System

Critical hits use a stat-based formula with a base 3% chance and diminishing returns above a configurable soft cap (default 37%).

### Crit Chance Formula

```
intBonus = floor((INT - 50) / 10)        // +1% per 10 above 50, -1% per 10 below
dexBonus = floor((DEX - 50) / 20)        // +1% per 20 above 50, -1% per 20 below
chaBonus = max(0, floor((CHA - 50) / 25)) // +1% per 25 above 50, no negative

totalCrit = 3 + intBonus + dexBonus + chaBonus + classCritBonus + weaponCritMod + equipCritBonus

if (totalCrit > softCap):
    totalCrit = softCap + floor((totalCrit - softCap) / 3)

finalCrit = max(3, min(60, totalCrit))    // Floor at base 3%, hard cap 60%
```

### Crit Chance Components

| Source                | Contribution                                   |
|-----------------------|------------------------------------------------|
| Base                  | 3% (floor, never goes below this)              |
| Intelligence          | +1% per 10 INT above 50, -1% per 10 below      |
| Dexterity             | +1% per 20 DEX above 50, -1% per 20 below      |
| Charisma              | +1% per 25 CHA above 50 (no negative)           |
| Class Bonus           | Flat bonus (e.g., Ninja: +10%)                 |
| Weapon Crit Modifier  | From weapon's crit_modifier field              |
| Equipment Crit Bonus  | From other equipped items                      |

No level bonus. No encumbrance bonus.

### Soft Cap with Diminishing Returns

The soft cap (default 37%, configurable in Admin > Game Settings) prevents crit stacking from becoming overpowered:

| Pre-Cap Total | Final Crit |
|---------------|------------|
| 20%           | 20%        |
| 37%           | 37%        |
| 47%           | 40%        |
| 57%           | 43%        |
| 67%           | 47%        |

### NPC Critical Hits

NPCs use their `baseCritChance` template value directly. The stat-based formula is not applied to NPCs.

### Class Crit Bonuses

Classes can have flat crit bonuses set in the Progression Editor (`crit_bonus` field):

| Class Type           | Suggested Bonus |
|----------------------|-----------------|
| Ninja, Mystic        | +10%            |
| Most classes         | +0%             |

### Critical Damage

Critical hits deal significantly more damage using the weapon's maximum damage:

```
critDamage = maxWeaponDamage × random(2.0 to 4.0)
```

**Key difference from normal hits:**
- Normal hits: Roll between min and max damage
- Critical hits: Always use MAX damage × 2-4x multiplier
- Average crit damage: ~3x weapon maximum

**Example:** A weapon with damage 5-15:
- Normal hit: 5-15 damage (average 10)
- Critical hit: 15 × 2.0-4.0 = 30-60 damage (average 45)

## Dodge System (MajorMUD-style)

Dodge is a class-based defensive ability that allows certain characters to completely avoid incoming attacks. Like MajorMUD, dodge is checked **before** the accuracy vs. defense roll in the combat sequence.

### Classes with Dodge

Only classes with a `dodge_bonus > 0` can dodge attacks:

| Class  | Dodge Bonus |
|--------|-------------|
| Ninja  | +25%        |
| Mystic | +25%        |

### Racial Dodge Bonus

| Race     | Dodge Bonus |
|----------|-------------|
| Halfling | +10%        |

A Halfling Ninja would have a combined **+35% base dodge** before stats or equipment.

### Dodge Formula

```
baseDodge = classDodgeBonus + raceDodgeBonus + equipmentDodgeBonus
statDodge = floor(AGI/10) × 2 + floor(CHA/10) × 1
preCap = baseDodge + statDodge

if (preCap > 52):
    postCap = 52 + floor((preCap - 52) / 4)
else:
    postCap = preCap

if (attackerAccuracy <= 8):
    effectiveDodge = 0
else:
    effectiveDodge = min(90, floor((postCap × 10) / attackerAccuracy))
```

### Dodge Components

| Source              | Contribution                              |
|---------------------|-------------------------------------------|
| Class Bonus         | Flat bonus (e.g., Ninja: +25%)            |
| Race Bonus          | Flat bonus (e.g., Halfling: +10%)         |
| Agility (DEX)       | +2% per 10 points                         |
| Charisma (CHA)      | +1% per 10 points                         |
| Equipment           | From items with dodge bonuses             |

### Soft Cap with Diminishing Returns

The 52% soft cap prevents dodge stacking from becoming overpowered:

| Pre-Cap Total | Post-Cap |
|---------------|----------|
| 30%           | 30%      |
| 52%           | 52%      |
| 60%           | 54%      |
| 72%           | 57%      |
| 92%           | 62%      |

### Attacker Accuracy Scaling

Dodge effectiveness is reduced by the attacker's accuracy:

| Attacker Accuracy | Effective Dodge (from 52% post-cap) |
|-------------------|-------------------------------------|
| 10                | 52%                                 |
| 15                | 34%                                 |
| 20                | 26%                                 |
| 30                | 17%                                 |
| ≤8                | 0% (dodge fails)                    |

### Maximum Effective Dodge

The maximum effective dodge is capped at **90%**, regardless of bonuses. This ensures attacks always have at least a 10% chance to hit.

### Combat Sequence

Dodge is checked **first** in the combat sequence:

1. Calculate defender's dodge chance
2. **Roll dodge** (if successful, attack ends with "dodges" message)
3. Roll accuracy vs. defense
4. If hit, roll for critical
5. Calculate damage

This means a successful dodge completely avoids the attack—no damage, no further rolls needed.

## Design Guidelines for Weapon Balancing

### Fast Weapons (Speed 700-1000)
- **Pros:** More excess energy converts to bonus crit, good for on-hit effects
- **Cons:** Lower damage per hit
- **Best for:** Rogues, high-crit builds, proc-based weapons

### Medium Weapons (Speed 1000-1700)
- **Pros:** Balanced crit bonus and damage per hit
- **Cons:** No specialization advantage
- **Best for:** General-purpose combat, most warriors

### Slow Weapons (Speed 1800-3000)
- **Pros:** Higher damage per hit, less wasted overkill
- **Cons:** Less bonus crit from excess energy, fewer attack chances
- **Best for:** High-strength builds, boss fights, burst damage

### Fine-Tuning Tips

The large number scale allows precise adjustments:
- **1% faster:** Reduce speed by ~15 (e.g., 1500 → 1485)
- **5% faster:** Reduce speed by ~75 (e.g., 1500 → 1425)
- **10% faster:** Reduce speed by ~150 (e.g., 1500 → 1350)

This granularity lets you create "slightly better" weapon variants without dramatic balance changes.

## Code Reference

- **Settings repository**: `packages/server/src/db/repositories/settingsRepository.ts` (`getCombatSettings`)
- **Energy calculation**: `packages/server/src/game/combatCalculations.ts` (`calculateRoundEnergy`)
- **Swing calculation**: `packages/server/src/game/combatCalculations.ts` (`calculateSwings`)
- **Crit calculation**: `packages/server/src/game/combatCalculations.ts` (`calculateCritChance`)
- **Dodge calculation**: `packages/server/src/game/combatCalculations.ts` (`calculateDodgeChance`)
- **Attack resolution**: `packages/server/src/game/combatCalculations.ts` (`resolveAttack`)
- **Combat flow**: `packages/server/src/game/combat.ts` (integrates all calculations)
- **Fallback constants**: `packages/shared/src/combat.ts` (used when DB unavailable)
- **Combat stats from equipment**: `packages/server/src/game/combatStats.ts`
- **Migration/seed**: `packages/server/src/db/migrate.ts` (seeds default settings)
