# Spell and Status Effects Guide

This guide explains how to create spells and status effects in Kingdoms of Avarice using the web editors.

## Overview

The spell system in Kingdoms of Avarice consists of two main components:

1. **Status Effects** - Temporary modifications applied to characters (buffs, debuffs, damage over time, etc.)
2. **Spells** - Castable abilities that can deal damage, heal, or apply status effects

## Creating a New Spell

### Step 1: Create the Status Effect (if needed)

If your spell will apply a buff, debuff, or damage/healing over time, you need to create the status effect first.

1. Open the **Status Effects Editor** from Developer Tools
2. Click **+ New Effect**
3. Enter an **Effect ID** (lowercase, no spaces, e.g., `burning`, `blessed`)
4. Enter a **Display Name**
5. Configure the effect properties (see Status Effect Configuration below)
6. Click **Save Effect**

### Step 2: Create the Spell

1. Open the **Spell Editor** from Developer Tools
2. Click **+ New Spell**
3. Enter the spell **Name** and **Mnemonic** (short command, e.g., `fire`, `heal`)
4. Configure the spell properties (see Spell Configuration below)
5. If using a status effect, enter the **Effect ID** you created in Step 1
6. Click **Save Spell**

### Step 3: Test the Spell

1. In-game, use `@learn <mnemonic>` to learn the spell on your character
2. Cast the spell using its mnemonic (e.g., `fire goblin`, `heal`)
3. Verify the spell behaves as expected

---

## Spell Configuration

### Basic Tab

| Field | Description |
|-------|-------------|
| **Name** | Display name shown to players |
| **Mnemonic** | Command shortcut (2-10 chars, e.g., `mmis` for Magic Missile) |
| **Description** | Flavor text describing the spell |
| **Spell Type** | offensive, healing, buff, debuff, or utility |
| **Target Type** | enemy, self, ally, or room (AoE) |
| **Mana Cost** | Resource cost to cast |
| **Attack Spell** | If checked, replaces melee combat when active |

### Effects Tab

| Field | Description |
|-------|-------------|
| **Min Damage / Max Damage** | Integer damage range for offensive spells (e.g., min 4, max 16) |
| **Min Healing / Max Healing** | Integer healing range for healing spells (e.g., min 3, max 10) |
| **Status Effect** | Effect ID to apply (e.g., `poisoned`, `blessed`) |
| **Effect Duration** | How long the effect lasts in seconds (0 = instant) |

### Requirements Tab

| Field | Description |
|-------|-------------|
| **Level Required** | Minimum character level to use this spell |
| **Class Restrictions** | Leave empty for all classes, or select specific classes |

---

## Spell Type Reference

| Type | Use For | Key Fields |
|------|---------|------------|
| **offensive** | Damage spells that replace melee combat | `minDamage`/`maxDamage`, check `isAttackSpell` |
| **healing** | Restore HP to self or allies | `minHealing`/`maxHealing` |
| **buff** | Beneficial effects on self | `statusEffect`, `effectDuration` |
| **debuff** | Harmful effects on enemies | `statusEffect`, `effectDuration` |
| **utility** | Non-combat utility spells | Varies by implementation |

---

## Status Effect Configuration

### Basic Tab

| Field | Description |
|-------|-------------|
| **Effect ID** | Unique identifier (lowercase, e.g., `poisoned`) |
| **Display Name** | Name shown to players |
| **Description** | Explanation of what the effect does |
| **Category** | buff, debuff, dot, hot, or control |
| **Stacking Behavior** | How multiple applications interact |
| **Max Stacks** | Maximum stack count (if stacking behavior is "stack") |

### Stacking Behaviors

| Behavior | Description |
|----------|-------------|
| **Replace** | New application completely replaces the old effect |
| **Refresh** | Resets duration but doesn't stack values |
| **Stack** | Multiple instances can stack up to max_stacks |

### Modifiers Tab

Combat modifiers that apply while the effect is active:

| Field | Description |
|-------|-------------|
| **Accuracy Modifier** | +/- to hit chance |
| **Defense Modifier** | +/- to defense |
| **Energy Modifier** | % change to attack energy gain |
| **Damage Modifier** | % change to damage dealt |

### Periodic Tab

For DoT (damage over time) and HoT (healing over time) effects:

| Field | Description |
|-------|-------------|
| **Tick Damage Min / Max** | Integer damage range per tick (e.g., min 1, max 4) |
| **Tick Healing Min / Max** | Integer healing range per tick (e.g., min 1, max 6) |
| **Tick Message** | Custom message shown each tick |
| **Silent Tick** | If checked, no message is shown on tick |
| **Wear Off Message** | Message shown when effect expires |

### Flags Tab

| Flag | Description |
|------|-------------|
| **Blocks Regeneration** | Prevents natural HP/mana regen |
| **Blocks Movement** | Prevents movement commands |
| **Is Blind** | Applies blind combat penalty |
| **Blocks Casting** | Prevents casting spells |
| **Blocks Combat** | Prevents entering or continuing combat |
| **Blocks Stealth** | Prevents using stealth abilities |

---

## Status Effect Category Reference

| Category | Description | Example |
|----------|-------------|---------|
| **buff** | Beneficial modifier | Blessed (+accuracy) |
| **debuff** | Harmful modifier | Cursed (-accuracy/-defense) |
| **dot** | Damage over time | Poisoned (1-4 damage/tick) |
| **hot** | Healing over time | Regenerating (1-6 heal/tick) |
| **control** | Movement restriction | Entangled (blocks movement) |

---

## Example: Creating a Poison Spell

### Step 1: Create the "poisoned" status effect

1. Open Status Effects Editor
2. Click **+ New Effect**
3. Fill in:
   - **Effect ID**: `poisoned`
   - **Display Name**: `Poisoned`
   - **Description**: `Venom courses through your veins.`
   - **Category**: `dot`
   - **Stacking Behavior**: `stack`
   - **Max Stacks**: `3`
4. Modifiers Tab: Leave at 0
5. Periodic Tab:
   - **Tick Damage Min**: `1`, **Tick Damage Max**: `4`
   - **Tick Message**: `The poison burns through your veins.`
   - **Wear Off Message**: `The poison fades from your system.`
6. Flags Tab:
   - Check **Blocks Regeneration**
7. Click **Save Effect**

### Step 2: Create the "Poison" spell

1. Open Spell Editor
2. Click **+ New Spell**
3. Fill in:
   - **Name**: `Poison`
   - **Mnemonic**: `pois`
   - **Description**: `Infect the target with deadly venom.`
   - **Spell Type**: `debuff`
   - **Target Type**: `enemy`
   - **Mana Cost**: `8`
4. Effects Tab:
   - **Status Effect**: `poisoned`
   - **Effect Duration**: `30` (seconds)
5. Requirements Tab:
   - **Level Required**: `3`
   - **Class Restrictions**: Mage, Ranger (or leave empty for all)
6. Click **Save Spell**

### Step 3: Test

1. In-game: `@learn pois`
2. Find a target: `pois <target>`
3. Verify the poison applies and ticks damage every 5 seconds

---

## Example: Creating a Buff Spell

### Step 1: Create the "empowered" status effect

1. Open Status Effects Editor
2. Create effect with:
   - **Effect ID**: `empowered`
   - **Display Name**: `Empowered`
   - **Category**: `buff`
   - **Stacking Behavior**: `refresh`
3. Modifiers Tab:
   - **Damage Modifier**: `20` (20% more damage)
4. Periodic Tab:
   - **Silent Tick**: checked (no spam for passive buffs)
   - **Wear Off Message**: `The empowerment fades.`
5. Click **Save Effect**

### Step 2: Create the "Empower" spell

1. Open Spell Editor
2. Create spell with:
   - **Name**: `Empower`
   - **Mnemonic**: `empw`
   - **Spell Type**: `buff`
   - **Target Type**: `self`
   - **Mana Cost**: `10`
   - **Status Effect**: `empowered`
   - **Effect Duration**: `120` (2 minutes)
3. Click **Save Spell**

---

## Tips

- **Mnemonic uniqueness**: Each spell must have a unique mnemonic
- **Effect ID uniqueness**: Each status effect must have a unique ID
- **Testing**: Always use `@learn` in-game to test new spells
- **Balance**: Start with conservative values and adjust based on testing
- **Duration**: Status effects tick every 5 seconds, so durations should be multiples of 5
- **Stacking**: Use `stack` behavior sparingly - it can create very powerful effects

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Spell doesn't cast | Check mana cost, level requirements, class restrictions |
| Effect not applying | Verify effect ID matches exactly (case-sensitive) |
| No tick messages | Check if Silent Tick is enabled |
| Effect wears off too fast | Increase Effect Duration in spell settings |
