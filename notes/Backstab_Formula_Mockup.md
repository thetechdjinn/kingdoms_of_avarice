# Backstab Formula Mockup

## Proposed Formula

```
Backstab_Min = (Effective_Weapon_Max × BASE_MIN_MULTIPLIER) + (Level × LEVEL_BONUS_MIN)
Backstab_Max = (Effective_Weapon_Max × BASE_MAX_MULTIPLIER) + (Level × LEVEL_BONUS_MAX)
```

### Default Configuration Values

| Setting              | Default Value | Description                          |
|----------------------|---------------|--------------------------------------|
| BASE_MIN_MULTIPLIER  | 2.0           | Multiplier for minimum backstab damage |
| BASE_MAX_MULTIPLIER  | 3.0           | Multiplier for maximum backstab damage |
| LEVEL_BONUS_MIN      | 0.20          | Flat bonus to min damage per level   |
| LEVEL_BONUS_MAX      | 0.50          | Flat bonus to max damage per level   |

> **Implementation Note:** All multipliers and level bonus values must be configurable via game settings to allow for balance adjustments without code changes.

---

## Weapon Tier Definitions

> **Note:** Backstabs require one-handed weapons only. Two-handed weapons cannot be used for backstabs.

| Tier | Weapon Example       | Normal Damage | Typical Level Range |
|------|----------------------|---------------|---------------------|
| 1    | Rusty Dagger         | 4-8           | 1-5                 |
| 2    | Iron Shortsword      | 7-14          | 5-15                |
| 3    | Fine Rapier          | 10-20         | 12-25               |
| 4    | Assassin's Blade     | 14-28         | 22-35               |
| 5    | Shadowfang Dagger    | 18-36         | 32-40               |

---

## Backstab Damage by Weapon Tier and Level

### Tier 1: Rusty Dagger (4-8 normal)

| Level | Min | Max | Spread | Avg Damage |
|-------|-----|-----|--------|------------|
| 1     | 16  | 25  | 9      | 20.5       |
| 10    | 18  | 29  | 11     | 23.5       |
| 20    | 20  | 34  | 14     | 27.0       |
| 30    | 22  | 39  | 17     | 30.5       |
| 40    | 24  | 44  | 20     | 34.0       |

### Tier 2: Iron Shortsword (7-14 normal)

| Level | Min | Max | Spread | Avg Damage |
|-------|-----|-----|--------|------------|
| 1     | 28  | 43  | 15     | 35.5       |
| 10    | 30  | 47  | 17     | 38.5       |
| 20    | 32  | 52  | 20     | 42.0       |
| 30    | 34  | 57  | 23     | 45.5       |
| 40    | 36  | 62  | 26     | 49.0       |

### Tier 3: Fine Rapier (10-20 normal)

| Level | Min | Max | Spread | Avg Damage |
|-------|-----|-----|--------|------------|
| 1     | 40  | 61  | 21     | 50.5       |
| 10    | 42  | 65  | 23     | 53.5       |
| 20    | 44  | 70  | 26     | 57.0       |
| 30    | 46  | 75  | 29     | 60.5       |
| 40    | 48  | 80  | 32     | 64.0       |

### Tier 4: Assassin's Blade (14-28 normal)

| Level | Min | Max | Spread | Avg Damage |
|-------|-----|-----|--------|------------|
| 1     | 56  | 85  | 29     | 70.5       |
| 10    | 58  | 89  | 31     | 73.5       |
| 20    | 60  | 94  | 34     | 77.0       |
| 30    | 62  | 99  | 37     | 80.5       |
| 40    | 64  | 104 | 40     | 84.0       |

### Tier 5: Shadowfang Dagger (18-36 normal)

| Level | Min | Max | Spread | Avg Damage |
|-------|-----|-----|--------|------------|
| 1     | 72  | 109 | 37     | 90.5       |
| 10    | 74  | 113 | 39     | 93.5       |
| 20    | 76  | 118 | 42     | 97.0       |
| 30    | 78  | 123 | 45     | 100.5      |
| 40    | 80  | 128 | 52     | 104.0      |

---

## Cross-Reference: Same Level, Different Weapons

### Level 1 Character

| Weapon               | Backstab Range | Avg  | vs Normal Max |
|----------------------|----------------|------|---------------|
| Rusty Dagger         | 16-25          | 20.5 | 3.1x          |
| Iron Shortsword      | 28-43          | 35.5 | 3.0x          |
| Fine Rapier          | 40-61          | 50.5 | 3.0x          |
| Assassin's Blade     | 56-85          | 70.5 | 3.0x          |
| Shadowfang Dagger    | 72-109         | 90.5 | 3.0x          |

### Level 20 Character

| Weapon               | Backstab Range | Avg  | vs Normal Max |
|----------------------|----------------|------|---------------|
| Rusty Dagger         | 20-34          | 27.0 | 4.3x          |
| Iron Shortsword      | 32-52          | 42.0 | 3.7x          |
| Fine Rapier          | 44-70          | 57.0 | 3.5x          |
| Assassin's Blade     | 60-94          | 77.0 | 3.4x          |
| Shadowfang Dagger    | 76-118         | 97.0 | 3.3x          |

### Level 40 Character

| Weapon               | Backstab Range | Avg   | vs Normal Max |
|----------------------|----------------|-------|---------------|
| Rusty Dagger         | 24-44          | 34.0  | 5.5x          |
| Iron Shortsword      | 36-62          | 49.0  | 4.4x          |
| Fine Rapier          | 48-80          | 64.0  | 4.0x          |
| Assassin's Blade     | 64-104         | 84.0  | 3.7x          |
| Shadowfang Dagger    | 80-128         | 104.0 | 3.6x          |

---

## Key Observations

### Damage Growth (Level 1 → Level 40)

| Weapon               | Lvl 1 Avg | Lvl 40 Avg | Growth |
|----------------------|-----------|------------|--------|
| Rusty Dagger         | 20.5      | 34.0       | +66%   |
| Iron Shortsword      | 35.5      | 49.0       | +38%   |
| Fine Rapier          | 50.5      | 64.0       | +27%   |
| Assassin's Blade     | 70.5      | 84.0       | +19%   |
| Shadowfang Dagger    | 90.5      | 104.0      | +15%   |

### Analysis

1. **Level scaling is proportionally stronger on weaker weapons** — This is intentional. It prevents end-game weapons from becoming absurdly overpowered while still rewarding leveling.

2. **Weapon upgrades remain the primary power increase** — Jumping from Battleaxe to Fine Longsword at the same level is a bigger boost than gaining 20 levels with the same weapon.

3. **Spread widens predictably** — At level 1 the spread is roughly 1.5× weapon max; by level 40 it's about 1.8× weapon max.

4. **Multiplier stays reasonable** — Even at max level with a starter weapon, the effective multiplier caps around 5.5×. With end-game weapons it stays around 3.5×.

---

## Configuration & Tuning

> **All formula constants must be exposed as configurable game settings.** This allows balance adjustments during testing and post-launch without requiring code changes.

### Configurable Constants

| Setting              | Default | Min | Max | Effect of Increase |
|----------------------|---------|-----|-----|-------------------|
| BASE_MIN_MULTIPLIER  | 2.0     | 1.0 | 5.0 | Higher floor damage on all backstabs |
| BASE_MAX_MULTIPLIER  | 3.0     | 1.5 | 6.0 | Higher ceiling damage on all backstabs |
| LEVEL_BONUS_MIN      | 0.20    | 0.0 | 1.0 | More consistent damage at high levels |
| LEVEL_BONUS_MAX      | 0.50    | 0.0 | 2.0 | Bigger lucky hits at high levels |

### Preset Profiles (Suggested)

**Conservative (slower power growth):**
```
BASE_MIN_MULTIPLIER: 2.0
BASE_MAX_MULTIPLIER: 3.0
LEVEL_BONUS_MIN: 0.15
LEVEL_BONUS_MAX: 0.35
```

**Default (balanced):**
```
BASE_MIN_MULTIPLIER: 2.0
BASE_MAX_MULTIPLIER: 3.0
LEVEL_BONUS_MIN: 0.20
LEVEL_BONUS_MAX: 0.50
```

**Aggressive (faster power growth):**
```
BASE_MIN_MULTIPLIER: 2.0
BASE_MAX_MULTIPLIER: 3.0
LEVEL_BONUS_MIN: 0.30
LEVEL_BONUS_MAX: 0.75
```

---

## Design Decisions

### Level Scaling

- **Level 40 is the estimated soft cap**, but players may continue leveling beyond this point.
- The formula scales indefinitely without requiring a hard level cap.
- At extreme levels (60+), weapon quality becomes the primary balancing factor.

### No Damage Cap

- **Backstab damage will not have a hard cap.**
- Balance is maintained through careful weapon design and distribution.
- If damage becomes problematic at high levels, adjust the `LEVEL_BONUS_MIN` and `LEVEL_BONUS_MAX` settings rather than implementing caps.

### No Critical Backstabs

- **Backstabs do not have a separate critical hit system.**
- A successful backstab landing IS the critical hit.
- This simplifies the combat math and keeps backstabs feeling impactful without random spike damage.

### Stat Modifiers

- **Dexterity:** Affects backstab accuracy (chance to hit), not damage.
- **Strength:** Modifies the weapon's effective damage range before backstab calculation.

### Class-Specific Bonuses

Class-specific backstab bonuses apply to **accuracy only**, not damage. Different classes (Thief, Ninja, Ranger, etc.) will have varying backstab accuracy bonuses, with Thieves having the highest and Ninjas second. The damage formula remains the same across all classes.

#### Strength Modifier Flow

```
Base Weapon Damage (7-14)
        ↓
Strength Modifier Applied → Effective Weapon Damage (e.g., 8-16)
        ↓
Backstab Formula Uses Effective Damage → Backstab Range Calculated
```

> **Example:** A Battleaxe (7-14) wielded by a character with a Strength bonus of +2 damage becomes effectively (9-16). The backstab formula then uses 16 as the `Effective_Weapon_Max`, resulting in higher backstab damage.

This means Strength-focused rogues gain a double benefit: better normal attacks AND stronger backstabs. This is intentional and should be considered during class/stat balancing.

---

## Implementation Requirements

### Configuration System

1. All four formula constants must be stored in a game settings table/file
2. Changes to settings should take effect without server restart (hot-reload preferred)
3. Settings should be accessible via admin commands for testing
4. Consider per-class overrides if multiple classes gain backstab abilities

### Formula Pseudocode

```
function calculateBackstabDamage(weapon, characterLevel, strengthBonus):
    
    // Apply strength to weapon damage
    effectiveWeaponMin = weapon.minDamage + strengthBonus
    effectiveWeaponMax = weapon.maxDamage + strengthBonus
    
    // Load configurable constants
    config = getGameSettings()
    
    // Calculate backstab range
    backstabMin = (effectiveWeaponMax * config.BASE_MIN_MULTIPLIER) + (characterLevel * config.LEVEL_BONUS_MIN)
    backstabMax = (effectiveWeaponMax * config.BASE_MAX_MULTIPLIER) + (characterLevel * config.LEVEL_BONUS_MAX)
    
    // Roll damage
    return randomRange(backstabMin, backstabMax)
```

### Testing Checklist

- [ ] Verify formula produces expected values at levels 1, 20, and 40
- [ ] Confirm strength bonuses cascade correctly into backstab damage
- [ ] Test configuration changes apply without restart
- [ ] Validate damage ranges against mob HP at various level tiers
- [ ] Stress test at extreme levels (80+) to ensure no overflow or balance breaks
