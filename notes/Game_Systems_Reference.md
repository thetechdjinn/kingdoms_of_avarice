# Game Systems Reference

This document provides detailed specifications for core game systems. It serves as a technical reference for implementation and can be updated as the design evolves.

---

## 1. Player Attributes

### Primary Attributes

| Attribute | Abbreviation | Description |
|-----------|--------------|-------------|
| Strength | STR | Physical power, affects melee damage and carrying capacity |
| Dexterity | DEX | Agility and reflexes, affects attack speed and dodge |
| Intelligence | INT | Mental acuity, affects spell power and mana pool |
| Constitution | CON | Physical resilience, affects health points and stamina |
| Charisma | CHA | Force of personality, affects NPC interactions and certain abilities |
| Wisdom | WIS | Insight and perception, affects spell resistance and awareness |

### Secondary Attributes

| Attribute | Description |
|-----------|-------------|
| Stealth | Ability to move undetected |
| Lockpicking | Ability to open locked containers/doors |
| Perception | Awareness of hidden things and traps |
| Shadow | Defensive evasion stat |
| Accuracy | Chance to hit in combat |
| Armor Class (AC) | Defensive rating against attacks |

### Attribute Effects on Combat

Per 10 points of stat:
- **Agility:** +1 Accuracy
- **Charisma:** +1.2 Accuracy

---

## 2. Classes and Races

### Design Philosophy

Classes and races are **data-driven**, not hard-coded. The engine provides the mechanics; specific classes and races are defined through configuration and can be created, modified, or deleted at any time.

### Class Definition Structure

A class defines:
- **HP per level:** Range (min-max) for HP rolls on level up
- **Spell Tier Access:** Which spell types and tiers the class can use (e.g., Mage-3, Priest-2)
- **Combat Level:** Physical combat rating (1-5)
- **Weapon Restrictions:** What weapon types can be used
- **Armor Restrictions:** What armor types can be worn
- **Class Abilities:** Special abilities unlocked at certain levels
- **Experience Table:** XP required per level
- **Essence Requirements:** Essence required per level

### Race Definition Structure

A race defines:
- **Attribute Ranges:** Min-max for each primary attribute
- **Attribute Modifiers:** Bonuses/penalties to base stats
- **Racial Abilities:** Special abilities (night vision, racial stealth, etc.)
- **Racial Traits:** Resistances, immunities, or other passive effects

### Example: Class + Race Combination

**Goblin Druid:**
- Class (Druid): 4-7 HP/level, Druid-3 Spells, Combat Level 3, blunt weapons only, leather armor only
- Race (Goblin): STR 30-70, DEX 55-125, INT 45-115, CON 40-100, CHA 40-100, Night Vision, Racial Stealth

---

## 3. Combat System

### Combat Rounds

- Combat occurs in **rounds** on a global timer
- Default: 4 seconds per round (configurable)
- Timer runs continuously; actions queue for next round execution

### Combat Level (1-5)

Combat level represents physical combat proficiency and affects:
- **Attack Speed:** Higher combat level = more energy per round = more swings
- **Accuracy:** Higher combat level = better chance to hit
- **Damage Potential:** More attacks mean more damage output

| Combat Level | Typical Classes |
|--------------|-----------------|
| 1 | Mage, Priest |
| 2 | Warlock |
| 3 | Druid |
| 4 | Warrior |
| 5 | Witchunter, Ranger |

### Action Points / Energy System

Each round provides a base energy pool. Swings consume energy based on weapon speed.

**Energy Calculation Factors:**
1. Combat Level (most significant)
2. Character Level
3. Agility stat
4. Encumbrance (50% = baseline, less = bonus, more = penalty)

**Swing Calculation:**
```
Swings = floor(Available Energy / Weapon Speed)
Remaining Energy carries to next round
```

**Example Energy Flow:**
| Round | Starting Energy | Weapon Cost | Swings | Remainder |
|-------|-----------------|-------------|--------|-----------|
| 1 | 10 | 6 | 1 | 4 |
| 2 | 10 + 4 = 14 | 6 | 2 | 2 |
| 3 | 10 + 2 = 12 | 6 | 2 | 0 |
| 4 | 10 + 0 = 10 | 6 | 1 | 4 |

Pattern repeats: 1, 2, 2, 1, 2, 2, ...

### Attack Cap

- Maximum attacks per round: **6**
- Excess potential attacks convert to **increased Critical Hit chance**

### Hit/Miss Mechanics

**Miss Chance Formula:**
```
D = Total Defensive Stats
A = Total Accuracy Stats
Miss Chance = ((D^2 / A^2) / 100)
```

The squared relationship makes large stat disparities very impactful.

**Accuracy Contributions:**
- Character Level
- Combat Level (major factor)
- Agility
- Intelligence
- Charisma
- Equipment bonuses
- Spell buffs/debuffs
- Encumbrance penalty

**Defense Contributions:**
- Armor Class (AC)
- Secondary defenses (Perception, Shadow, etc.)
- Secondary defenses add 1:1 (20 Perception = +20 AC equivalent)
- Shadow provides flat +10

**Additional Modifiers:**
- Blindness: -10 Accuracy
- Equipment bonuses
- Buff/debuff spells

---

## 4. Spell System

### Spell Targeting

Spells are one of two types:
- **Single-Target:** Requires a specific target in the same room (or self-only)
- **Area-of-Effect (AoE):** Affects all valid targets in the **current room only**

There is no range mechanic for spells; AoE spells cannot affect other rooms.

### Spell Tier System

Spell tiers determine which classes can cast which spells.

**Mage Spells:**
| Tier | Access |
|------|--------|
| Mage-3 | Mage (full access) |
| Mage-2 | Warlock |
| Mage-1 | Limited casters |

**Priest Spells:**
| Tier | Access |
|------|--------|
| Priest-3 | Priest (full access) |
| Priest-2 | Cleric |
| Priest-1 | Paladin |

**Druid Spells:**
| Tier | Access |
|------|--------|
| Druid-3 | Druid (full access) |
| Druid-2 | Nature-hybrid classes |
| Druid-1 | Limited nature casters |

Higher tier spells are more powerful. A class with Mage-2 access can cast any Mage spell of tier 2 or lower.

### Spell Types

| Type | Timing | Description |
|------|--------|-------------|
| Direct Damage | Combat round | Must wait for combat round to execute |
| Direct Healing | Instant | Can cast anytime (respects cooldown) |
| Damage over Time (DoT) | Instant cast | Can cast anytime; damage ticks over duration |
| Heal over Time (HoT) | Instant cast | Can cast anytime; healing ticks over duration |
| Buff/Debuff | Instant cast | Can cast anytime; modifies attributes for duration |
| Utility | Instant cast | Teleport, unlock, detect, etc. |

### Mana System

- Spells consume mana to cast
- Mana regenerates over time on a configurable timer
- Mana pool size affected by Intelligence and class

---

## 5. Resource Regeneration

### Configurable Timed Events

The game supports configurable timed regeneration for any resource:

| Resource | Default Interval | Notes |
|----------|------------------|-------|
| Mana | Configurable (seconds) | Regenerates automatically over time |
| Health | Configurable (seconds) | Regenerates automatically, faster when resting |

### Health Regeneration

- **Passive Regen:** Slow natural health regeneration
- **Resting Regen:** Significantly faster regeneration when resting

**Resting Restrictions:**
- Cannot rest while in combat
- Cannot rest while poisoned
- Player must explicitly enter rest state

### Generic Timed Event System

The system should support adding regeneration or other periodic effects to any attribute:
- Configurable interval (seconds between ticks)
- Configurable amount (how much regenerates per tick)
- Configurable conditions (when regeneration is allowed/blocked)

---

## 6. Essence System

### Overview

Essence is a secondary progression currency alongside experience. It represents mastery of your class.

### Gaining Essence

- Complete tasks and quests
- Certain events (level-up clears essence, quest completion may grant essence)
- Events emit essence gains through the existing game events system

### Spending Essence

- Upgrade abilities
- Imbue weapons with enhancements
- Unlock new attributes

Spending essence before leveling requires re-earning that essence before the next level-up.

### Essence Cap

- Essence has a maximum capacity
- **Cannot overlevel:** Once full, no more essence is gained
- System should notify player when essence gain is blocked due to cap

### Exchange Rates (Event-Based)

| Event | Typical Essence Change |
|-------|------------------------|
| Level Up | Clears all essence (to 0) |
| Quest Completion | +few points |
| Upgrade Ability | -varies (e.g., -50) |
| Imbue Weapon | -varies |

---

## 7. Experience System

### Experience Cap

- Players can gain up to a configurable percentage (e.g., 10%) more XP than required to level
- Once at cap, no more experience is gained
- **System must notify player** each time they would have gained XP but cannot

### Leveling Requirements

To level up, a player needs:
1. Sufficient experience points
2. Sufficient essence (class mastery)

Both requirements must be met.

---

## 8. Death Mechanics

### On Death

When a character dies, they are transported to a spawn/respawn room.

### Configurable Penalties

Each of these should be configurable:
- **Experience Loss:** Percentage of XP lost on death
- **Essence Loss:** Percentage or flat amount of essence lost
- **Item Drops:** Whether equipped items or inventory drops on death

### Death Penalty Configuration

```
death_penalties:
  experience_loss_percent: 10
  essence_loss_percent: 5
  drop_equipped: false
  drop_inventory: true
```

---

## 9. Damage Types

### Physical Damage

| Type | Description |
|------|-------------|
| Bludgeoning | Blunt force (maces, hammers, falls) |
| Piercing | Punctures (arrows, fangs, daggers) |
| Slashing | Cuts (swords, axes) |

### Elemental & Energy Damage

| Type | Description |
|------|-------------|
| Acid | Corrosive substances |
| Cold | Freezing effects (ice, frost) |
| Fire | Heat and combustion |
| Lightning | Electrical energy |
| Thunder | Sonic vibrations, concussive force |

### Magical & Exotic Damage

| Type | Description |
|------|-------------|
| Necrotic | Dark, life-draining energy |
| Psychic | Mental attacks |
| Radiant | Holy or divine energy |
| Force | Pure magical energy |

### Damage Over Time (DoT)

| Type | Description |
|------|-------------|
| Poison | Toxins dealing periodic damage until cured or expired |
| Infestation | Parasites or swarms dealing periodic damage |

---

## 10. Banking System

### Overview

Players can deposit and withdraw currency at bank-flagged rooms. Bank balance is stored as copper farthings (BIGINT) on the characters table.

### Commands

- `bank` / `bal` / `balance` - Check balance (global, works anywhere including dead/dropped)
- `deposit` / `dep` - Deposit currency (requires bank room)
- `withdraw` / `wit` - Withdraw currency (requires bank room)

### Key Details

- Bank rooms configured via room features JSONB: `{"bank": {"enabled": true}}`
- Withdrawals auto-convert to highest denominations for weight efficiency
- All operations wrapped in database transactions for ACID compliance
- Race-condition safe: withdrawals use `WHERE bank_balance >= amount`

### Key Files

- `packages/server/src/game/bankCommands.ts` - Command handlers
- `packages/server/src/db/repositories/characterRepository.ts` - `getBankBalance()`, `addBankBalance()`
- `packages/server/src/db/repositories/roomRepository.ts` - `isBankRoom()`

---

## 11. Future Systems (Not Yet Implemented)

### Equipment Slots

- Already exist in current system
- May be expanded as needed

---

## Revision History

| Date | Changes |
|------|---------|
| 2026-01-14 | Initial creation with design clarifications |
