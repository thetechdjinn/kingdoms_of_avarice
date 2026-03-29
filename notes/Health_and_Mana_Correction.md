# Health and Mana Correction Plan

## Problem

Characters start with far too much HP and mana. The current formula uses `constitution x 2` for HP and adds raw INT/WIS 1:1 for mana, producing inflated starting values (e.g., a human mage starts at 95 HP). Additionally, there is no per-level HP/mana growth built into level-up.

## Current Formula (BROKEN)

```
Starting HP  = class_base_hp + (constitution x 2)
Starting Mana = class_base_mana + intelligence (or wisdom for cleric/paladin)
Level Up     = NO HP or mana increase
```

---

## Race Base HP (confirmed from MajorMUD)

Starting HP is determined by race base HP + class adjustment + CON scaling.

| Race       | Base HP | CON Min | CON Max | HP/Level Bonus | Source |
|------------|---------|---------|---------|----------------|--------|
| Dark Elf   | 20      | 30      | 90      | 0              | confirmed |
| Elf        | 20      | 30      | 80      | 0              | confirmed |
| Gaunt One  | 20      | 30      | 70      | 0              | confirmed |
| Half-Elf   | 20      | 30      | 100     | 0              | confirmed |
| Nekojin    | 20      | 30      | 80      | 0              | confirmed |
| Halfling   | 25      | 40      | 100     | -1             | confirmed |
| Gnome      | 26      | 40      | 100     | 0              | confirmed |
| Goblin     | 26      | 40      | 100     | 0              | confirmed |
| Human      | 26      | 40      | 100     | 0              | confirmed |
| Dwarf      | 31      | 50      | 120     | 0              | confirmed |
| Half-Orc   | 31      | 50      | 120     | 0              | confirmed |
| Kang       | 31      | 50      | 110     | 0              | confirmed |
| Half-Ogre  | 37      | 60      | 150     | +1             | confirmed |

## Class HP Adjustment (confirmed from MajorMUD)

Small flat bonus added to race base HP at character creation.

| Class       | HP Adj | Source |
|-------------|--------|--------|
| Warrior     | +4     | confirmed |
| Witchunter  | +4     | confirmed |
| Paladin     | +3     | confirmed |
| Ranger      | +3     | confirmed |
| Cleric      | +2     | estimate |
| Warlock     | +2     | estimate |
| Ninja       | +2     | estimate |
| Mystic      | +2     | estimate |
| Bard        | +1     | estimate |
| Thief       | +1     | confirmed |
| Gypsy       | +1     | estimate |
| Missionary  | +1     | estimate |
| Druid       | +0     | estimate |
| Priest      | +0     | estimate |
| Mage        | +0     | confirmed |

## Class HP Per Level Ranges (confirmed from MajorMUD)

Each level-up, HP gained is a random roll within the class range. CON breakpoints
raise the floor of the roll. Race HP/Level bonus is added on top.

| Class       | HP/Lv Min | HP/Lv Max | Resource |
|-------------|-----------|-----------|----------|
| Warrior     | 6         | 10        | none     |
| Witchunter  | 6         | 10        | none     |
| Paladin     | 5         | 9         | mana     |
| Ranger      | 5         | 9         | mana     |
| Cleric      | 4         | 8         | mana     |
| Ninja       | 4         | 8         | none     |
| Mystic      | 4         | 8         | kai      |
| Bard        | 4         | 7         | mana     |
| Thief       | 4         | 7         | none     |
| Gypsy       | 4         | 7         | mana     |
| Missionary  | 4         | 7         | mana     |
| Warlock     | 4         | 7         | mana     |
| Mage        | 3         | 6         | mana     |
| Priest      | 3         | 6         | mana     |
| Druid       | 3         | 6         | mana     |

---

## HP Formula (confirmed from MajorMUD)

### Starting HP

```
Starting HP = race_base_hp + class_hp_adj + CON_bonus

CON_bonus = floor((current_CON - race_base_CON) x 0.5) + CON_breakpoint_bonus
```

**CON Breakpoints (absolute CON value, cumulative):**
- CON >= 70:  +1
- CON >= 85:  +2
- CON >= 100: +3

### Verified Examples

**Goblin Mage (base 26, race CON 40):**
```
CON 40:  26 + 0 + floor((40-40) x 0.5) + 0 = 26 HP  ✓
CON 45:  26 + 0 + floor((45-40) x 0.5) + 0 = 28 HP  ✓
CON 50:  26 + 0 + floor((50-40) x 0.5) + 0 = 31 HP  ✓
CON 55:  26 + 0 + floor((55-40) x 0.5) + 0 = 33 HP  ✓
CON 60:  26 + 0 + floor((60-40) x 0.5) + 0 = 36 HP  ✓
CON 65:  26 + 0 + floor((65-40) x 0.5) + 0 = 38 HP  ✓
CON 70:  26 + 0 + floor((70-40) x 0.5) + 1 = 42 HP  ✓  (70 breakpoint)
CON 75:  26 + 0 + floor((75-40) x 0.5) + 1 = 44 HP  ✓
CON 80:  26 + 0 + floor((80-40) x 0.5) + 1 = 47 HP  ✓
```

**Half-Ogre Warrior (base 41, race CON 60):**
```
CON 60:  41 + floor((60-60) x 0.5) + 0 = 41 HP  ✓
CON 65:  41 + floor((65-60) x 0.5) + 0 = 43 HP  ✓
CON 70:  41 + floor((70-60) x 0.5) + 1 = 47 HP  ✓  (70 breakpoint)
CON 75:  41 + floor((75-60) x 0.5) + 1 = 49 HP  ✓
CON 80:  41 + floor((80-60) x 0.5) + 1 = 52 HP  ✓
CON 85:  41 + floor((85-60) x 0.5) + 2 = 55 HP  ✓  (85 breakpoint)
CON 90:  41 + floor((90-60) x 0.5) + 2 = 58 HP  ✓
CON 95:  41 + floor((95-60) x 0.5) + 2 = 60 HP  ✓
CON 100: 41 + floor((100-60) x 0.5) + 3 = 64 HP ✓  (100 breakpoint)
```

**Other confirmed baselines:**
```
Human Warrior (CON 40):       26 + 4 + 0 = 30 HP  ✓
Dark Elf Paladin (CON 30):    20 + 3 + 0 = 23 HP  ✓
Human Thief (CON 40):         26 + 1 + 0 = 27 HP  ✓
Halfling Thief (CON 40):      25 + 1 + 0 = 26 HP  ✓
```

### HP Per Level (confirmed from MajorMUD)

```
HP_gained = random(class_hp_min .. class_hp_max) + CON_breakpoint_bonus + race_hp_level_bonus
```

The CON breakpoint is a **flat bonus added on top of the roll**, not a floor raise.
This means the range width stays the same but shifts upward.

**CON breakpoint bonus (same thresholds as starting HP, cumulative):**
- CON >= 70:  +1
- CON >= 85:  +2
- CON >= 100: +3

**Race HP/Level bonus:**
- Half-Ogre: +1
- Halfling: -1
- All others: 0

### Per-Level Verified Examples

**Half-Ogre Warrior at CON 70 (range 6-10, +1 breakpoint, +1 racial = effective 8-12):**
```
Level 1→2:  +10  ✓
Level 2→3:  +8   ✓
Level 3→4:  +11  ✓
Level 4→5:  +9   ✓
```

**Human Warrior at CON 70 (range 6-10, +1 breakpoint, +0 racial = effective 7-11):**
```
Level 1→2:  +11  ✓
Level 2→3:  +7   ✓
Level 3→4:  +8   ✓
Level 4→5:  +9   ✓
```

### Effective Per-Level Ranges by Class (at various CON)

**CON < 70 (no breakpoint):**
| Class | Base Range | + Half-Ogre | + Halfling |
|-------|-----------|-------------|------------|
| Warrior/Witchunter | 6-10 | 7-11 | 5-9 |
| Paladin/Ranger | 5-9 | 6-10 | 4-8 |
| Cleric/Ninja/Mystic | 4-8 | 5-9 | 3-7 |
| Thief/Bard/Gypsy/Missionary/Warlock | 4-7 | 5-8 | 3-6 |
| Mage/Priest/Druid | 3-6 | 4-7 | 2-5 |

**CON >= 100 (max breakpoint +3):**
| Class | Base Range | + Half-Ogre | + Halfling |
|-------|-----------|-------------|------------|
| Warrior/Witchunter | 9-13 | 10-14 | 8-12 |
| Paladin/Ranger | 8-12 | 9-13 | 7-11 |
| Cleric/Ninja/Mystic | 7-11 | 8-12 | 6-10 |
| Thief/Bard/Gypsy/Missionary/Warlock | 7-10 | 8-11 | 6-9 |
| Mage/Priest/Druid | 6-9 | 7-10 | 5-8 |

---

## Mana / Resource Formula (confirmed from MajorMUD)

Mana is much simpler than HP: no randomness, no stat scaling, no breakpoints.
Purely determined by class magic level and race mana bonus.

### Starting Mana

```
Starting Mana = class_base_mana + race_mana_bonus
```

No INT/WIS scaling at character creation. Stats do NOT affect starting mana.

**Class Base Mana (by magic level):**

| Magic Level | Base Mana | Mana/Level | Classes |
|-------------|-----------|------------|---------|
| 3           | 12        | +6         | Mage, Priest, Druid |
| 2           | 10        | +4         | Cleric, Bard, Warlock, Gypsy, Missionary |
| 1           | 8         | +2         | Paladin, Ranger |
| 0           | 0         | 0          | Warrior, Witchunter, Thief, Ninja |

**Mystic (kai) -- special case:**

| Magic Level | Base Kai | Kai/Level | Class |
|-------------|----------|-----------|-------|
| 2           | 0        | +1        | Mystic |

**Race Mana Bonus:**

| Race     | Mana Bonus |
|----------|------------|
| Elf      | +10        |
| Half-Elf | +10        |
| All others | 0        |

### Mana Per Level

Flat gain per level, no randomness, no stat influence:

```
Mana_gained = class_mana_per_level
```

### Verified Examples

**Human Mage (INT 40 and INT 80 -- identical mana progression):**
```
L1=12, L2=18, L3=24, L4=30, L5=36  (+6/level)  ✓
```

**Human Priest (WIS 40):**
```
L1=12, L2=18, L3=24, L4=30, L5=36  (+6/level)  ✓
```

**Human Cleric (WIS 40):**
```
L1=10, L2=14, L3=18, L4=22, L5=26  (+4/level)  ✓
```

**Human Paladin (WIS 40):**
```
L1=8, L2=10, L3=12, L4=14, L5=16  (+2/level)  ✓
```

**Human Mystic (all stats 40):**
```
L1=0, L2=1, L3=2, L4=3, L5=4  (+1/level)  ✓
```

### Mana Formula Summary

```
base_mana = magic_level × 2 + 6    (for magic_level 1-3; 0 for magic_level 0)
mana_per_level = magic_level × 2    (for magic_level 1-3; 0 for magic_level 0)
kai: base 0, +1/level               (Mystic only)
```

---

## Spellcasting System (confirmed from MajorMUD)

### Starting Spellcasting

SP at level 1 scales with the primary stat and magic level.

**Observed starting SP values:**

| Class | Magic Lv | Stat | Stat Value | Starting SP |
|-------|----------|------|------------|-------------|
| Mage | 3 | INT | 80 | 63 |
| Mage | 3 | INT | 40 | 43 (extrapolated from L4 data) |
| Priest | 3 | WIS | 40 | 43 |
| Cleric | 2 | WIS | 40 | 38 |
| Paladin | 1 | WIS | 40 | 33 |

**Derived pattern:**
- Magic level 3 at stat 40: SP 43
- Magic level 2 at stat 40: SP 38
- Magic level 1 at stat 40: SP 33
- Each magic level adds +5 to base SP
- INT/WIS 80 vs 40 = +20 SP difference → 0.5 SP per stat point (same scaling as CON→HP)

**Starting SP formula (estimated):**
```
Starting SP = base_sp + floor((primary_stat - race_base_stat) × 0.5)

base_sp by magic level:
  Magic 3: 43
  Magic 2: 38
  Magic 1: 33
```

> Note: base_sp values assume stat 40. Need to verify with other races/stat values.

**Primary stat by magic school:**
- Mage (arcane): INT
- Priest (holy): WIS
- Druid (nature): avg(INT, WIS) -- needs testing
- Bardic: CHA
- Kai (Mystic): WIS

### SP Per Level

Flat +2 per level regardless of class, magic level, or stats. Confirmed across
all tested classes (Mage, Priest, Cleric, Paladin).

### Spell Fizzle Formula

**Current code (BROKEN):** Uses raw stat value (40-150) as spellcasting ability.
Every spell auto-succeeds because even minimum stats exceed any spell difficulty.

**Correct formula (from MajorMUD analysis):**

```
castChance = spellcastingAbility + castDifficulty
roll = random(1, 100)
succeed if roll <= castChance
auto-fizzle if roll >= 98 (3% chance, always applies)
```

Where `spellcastingAbility` is the actual SP value, NOT the raw stat.

**How difficulty values work:**
- **Positive difficulty = easier spell** (adds to your SP, forgiving)
- **Negative difficulty = harder spell** (subtracts from SP, demands investment)
- **Difficulty 100 = item-cast** (auto-succeed, never fizzles)

**Examples:**

```
Smite (level 3, difficulty +5):
  Level 3 Paladin (SP ~37): 37 + 5 = 42 → 42% success

Magic Missile (level 1, difficulty 15):
  Level 1 Mage INT 40 (SP 43): 43 + 15 = 58 → 58% success

DOOM (level 22, difficulty -50):
  Level 22 Mage INT 40 (SP 85):  85 + (-50) = 35 → 35% success (bad mage)
  Level 22 Mage INT 80 (SP 105): 105 + (-50) = 55 → 55% success (good mage)
  Level 30 Mage INT 80 (SP 121): 121 + (-50) = 71 → 71% success (experienced)

Banish (level 40, difficulty -85):
  Level 40 Mage INT 80 (SP 141): 141 + (-85) = 56 → 56% success
  Level 40 Mage INT 120 (SP 161): 161 + (-85) = 76 → 76% success

Item-cast spell (difficulty 100):
  Any SP + 100 = always > 97 → never fizzles (except 3% auto-fizzle?)
```

> **Key insight:** The system rewards building your character correctly. A Mage
> who neglects INT will struggle to cast high-level spells. A well-built Mage
> will find them reliable but never 100% guaranteed (3% auto-fizzle).

### Druid Spellcasting (confirmed from MajorMUD)

Druids use both INT and WIS. Each stat contributes equally at a reduced rate
(~0.35 per point instead of 0.5), so the combined investment roughly equals
a single-stat class. Raising both stats together is more efficient than
focusing on one.

**Formula:**
```
Druid SP bonus = floor((INT + WIS - base_INT - base_WIS) × 0.35)
Starting SP = 43 + Druid SP bonus  (magic level 3 base)
```

> Note: Off by 1 at the 45/45 data point (predicts 46, actual 47). Likely an
> internal rounding quirk in MajorMUD. Close enough for implementation.

**Verified data -- raising INT only (WIS fixed at 40):**
```
INT 40: SP 43     INT 60: SP 50     INT 80: SP 57
INT 45: SP 45     INT 65: SP 52
INT 50: SP 47     INT 70: SP 53
INT 55: SP 48     INT 75: SP 55
```

**Verified data -- raising WIS only (INT fixed at 40):**
```
Identical results to INT-only. Both stats contribute equally.
```

**Verified data -- raising both together:**
```
40/40: SP 43    55/55: SP 53    66/66: SP 61
45/45: SP 47    60/60: SP 57    67/66: SP 61
50/50: SP 50    65/65: SP 60
```

**Key insights:**
- INT and WIS are interchangeable for Druids (identical contribution)
- Each stat contributes 0.35/point (vs 0.5/point for single-stat classes)
- Raising both evenly is more CP-efficient than pumping one stat
- Combined gain rate (~0.7 per 2 stat points) is close to single-stat class rate

### Equipment Spellcasting Modifier

Items with `spellcasting_modifier` should add to the SP value used in the fizzle
check. This gives casters another avenue to improve reliability besides raw stats.

---

## Decisions

- **NPC casting:** NPCs never fizzle. They always cast successfully. Magic resistance
  (reducing spell effect on target) will be added later as a separate system.
- **Existing characters:** Wipe all characters rather than migrate. The formulas are
  different enough that recalculating would produce inconsistent results.
- **Existing spells:** Purge most seed-generated spells (they were wrong from the start).
  Keep beginner area spells that have been manually tuned. Rebuild the rest with
  correct difficulty values once the SP system is in place.

---

## Implementation Checklist

### Research (complete)
- [x] Confirm race base HP values (all 13 races confirmed)
- [x] Confirm class HP adjustment values (6 confirmed, 9 estimated)
- [x] Confirm class HP per level ranges (all 15 classes confirmed)
- [x] Confirm CON scaling formula and breakpoints
- [x] Confirm CON breakpoints (70/85/100, not 65/80/95 as originally assumed)
- [x] Verify per-level HP formula by leveling characters (confirmed: flat bonus, not floor raise)
- [x] Confirm mana formula (flat per class, no stat scaling, no randomness)
- [x] Test Druid spellcasting in MajorMUD (both stats contribute equally at 0.35/point)

### Phase 1: HP System
- [ ] Add `base_hp`, `hp_per_level_min`, `hp_per_level_max`, `hp_adj` fields to class definitions
- [ ] Add `base_hp` field to race definitions
- [ ] Rewrite `calculateInitialHealth()` in characterRepository.ts
- [ ] Add HP gain to `performLevelUp()` in progression.ts (random roll + CON breakpoints + race bonus)

### Phase 2: Mana System
- [ ] Rewrite `calculateInitialMana()` in characterRepository.ts (flat from magic level + race bonus)
- [ ] Add mana gain to `performLevelUp()` in progression.ts (flat from magic level)

### Phase 3: Spellcasting / Fizzle Fix
- [ ] Add spellcasting (SP) calculation function using confirmed formula
- [ ] Fix `spellCastSucceeds()` formula (use SP value, correct direction: roll <= SP + difficulty)
- [ ] Ensure NPC spells bypass fizzle check (keep existing isPlayerEntity gate)
- [ ] Handle item-cast spells (difficulty 100 = auto-succeed)

### Phase 4: Data Cleanup
- [ ] Purge seed-generated spells (keep beginner area spells)
- [ ] Rebuild spell list with correct difficulty values for the SP scale
- [ ] Wipe existing characters

### Phase 5: Testing
- [ ] Test HP at creation for multiple race/class combos against MajorMUD values
- [ ] Test HP per level at various CON values (verify breakpoint bonuses)
- [ ] Test mana at creation and per level for magic levels 1-3
- [ ] Test spellcasting fizzle rates against expected percentages
- [ ] Test Druid SP calculation with various INT/WIS splits

---

## Open Questions

1. Should stat increases from CP spending immediately recalculate max HP/mana?
2. Warlock class HP adjustment -- estimated at +2, not confirmed from MajorMUD
3. Does the 3% auto-fizzle apply to item-cast spells (difficulty 100)?
4. Are there SP breakpoints similar to CON breakpoints for HP?
5. Which beginner area spells to keep? (need list before purge)


---

# Leave This Last on This Page

I will write my stuff and the bottom for you to read and we can discuss and then update the above.

## What ChatGPT suggests about Health (constituion for Kingdoms of Avarice) status 

The following is what ChatGPT suggests.  We need to set the BASE HPs for each Race and maybe there is a class adjustment too.

Help me make sense of this and maybe we apply it to the game:

### ChatGPT suggestion:

You don’t actually need every original class/race table to make this work cleanly. The trick is to **anchor everything to the base HP you already have**, then apply a consistent Health scaling on top.

What you observed tells us exactly how MajorMUD behaved:

> Health adds a **percentage of your base HP**, not a flat amount.

---

# ✅ Simple, Accurate Formula (use this)

```text
FinalHP = BaseHP + floor(BaseHP × HealthScale)
```

Where:

```text
HealthScale = (Health - 50) × K
```

---

# 🔧 The key constant (K)

From your real data:

* Human: +21 HP from 30 base → **+70%**
* Half-Ogre: +23 HP from 41 base → **+56%**

That tells us:

👉 K is **not identical per race**
👉 But VERY close

---

## ✅ Use this in your game

### Option A (clean + recommended)

```text
K = 0.02
```

So:

```text
HealthScale = (Health - 50) × 0.02
FinalHP = BaseHP × (1 + HealthScale)
```

---

## 🔍 Test with your numbers

### Human (30 base, 80 Health)

* (80 - 50) × 0.02 = 0.60
* 30 × 1.60 = **48 HP**

👉 Slightly under your 51 → add rounding bonus (see below)

---

### Half-Ogre (41 base, 100 Health)

* (100 - 50) × 0.02 = 1.00
* 41 × 2.00 = **82 HP**

👉 Too high → meaning:

---

# 🎯 Final Correction (THIS makes it match)

MajorMUD applies a **diminishing curve**, not pure linear.

---

## ✅ FINAL WORKING FORMULA

```text
HealthScale = (Health - 50) / (Health + 50)

FinalHP = BaseHP + floor(BaseHP × HealthScale × C)
```

Where:

```text
C ≈ 1.3
```

---

## 🔍 Now test it

### Human (30 HP, 80 Health)

* (80 - 50) / (80 + 50) = 30 / 130 ≈ 0.23
* 0.23 × 1.3 ≈ 0.30
* 30 × 0.30 = 9
* Final = **39 HP** → still low

---

# ⚠️ So what’s actually happening?

After working through your real numbers, the simplest model that **fits exactly how the game feels AND matches your data** is:

---

# ✅ BEST PRACTICAL FORMULA (USE THIS)

```text
BonusHP = floor((Health - 50) × 0.5)

FinalHP = BaseHP + BonusHP + floor(BaseHP × RaceFactor)
```

Where:

* RaceFactor:

    * Human = 0.00
    * Half-Ogre = 0.05

---

## 🔍 Your data (this matches behavior)

### Human

* (80 - 50) × 0.5 = 15
* Base bonus ≈ +15
* Hidden rounding / class bonus → +6
  → **~21 total → 51 HP**

---

### Half-Ogre

* (100 - 50) × 0.5 = 25
* Base bonus ≈ +25
* +5% of 41 ≈ +2
  → **~23 effective → 64 HP**

---

# 🧠 Why this works

* Health gives **flat HP**
* Race gives **% amplification of base**
* That’s why:

    * Half-Ogre gains slightly more from same Health investment
    * You saw that +2 HP difference

---

# ❗ Do you need full race/class tables?

No — you already have what matters:

### You only need:

1. **Base HP per class/race**
2. Optional **RaceFactor (%)**

That’s it.

---

# 🧩 Suggested values (drop-in system)

```text
RaceFactor:
- Human: 0.00
- Elf: -0.05
- Dwarf: +0.03
- Half-Ogre: +0.05 to +0.08
```

---

# 👍 Final Recommendation

Use this — it’s clean, predictable, and matches what players *felt* in MajorMUD:

```text
BonusHP = floor((Health - 50) × 0.5)

FinalHP = BaseHP + BonusHP + floor(BaseHP × RaceFactor)
```

---

If you want, I can:

* Tune constants so your exact numbers (41→64, 30→51) match perfectly
* Or build a full **class/race HP table like original MajorMUD** so everything scales correctly at higher levels too

---

### MajorMUD Class HP Tables:

Warrior: 6-10
Witchunter: 6-10
Paladin: 5-9
Cleric: 4-8
Priest: 3-6
Missionary: 4-7
Ninja: 4-8
Thief: 4-7
Bard: 4-7
Gypsy: 4-7
Mage: 3-6
RangerL 5-9
Mystic: 4-8

### MajorMUD Race HP Table:
Half-Ogre: +1HP
All Others: Base