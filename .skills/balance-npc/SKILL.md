---
name: balance-npc
description: Generate balanced NPC/mob stat blocks for Kingdoms of Avarice using combat formulas and reference data
allowed-tools: Agent, Read, Glob, Grep, Write, Edit, Bash(ls:*)
---

# NPC/Mob Balancer

Generate mechanically balanced NPC stat blocks for Kingdoms of Avarice, a MajorMUD-inspired web MUD. NPCs use pre-computed static values that feed directly into the game's combat resolution. This skill produces stat blocks, attack definitions, and drop table recommendations.

## Input

$ARGUMENTS

Accept one or more of:
- **Target level** (required): What level player should fight this mob
- **Archetype**: `normal` (default), `elite`, `boss`, `swarm`
- **Combat style**: `melee` (default), `ranged`, `caster`, `hybrid`
- **Difficulty**: `easy`, `medium` (default), `hard`
- **Name and theme**: For descriptions and attack flavor text
- **Quantity**: How many variants to generate (default 1)

If the input is vague (e.g., "some level 5 sewer mobs"), generate 3-4 varied mobs appropriate for the theme.

## Workflow

### Phase 1: Reference Loading

1. Read the progression table from `data/global/progression/progression_table.json` for XP calibration.
2. Read existing NPCs at similar levels from `data/areas/*/npcs.json` to calibrate against live data.
3. Read drop tables from `data/global/drop_tables.json` for currency range reference.
4. If the user specified an area, read `areas/<area>/plan.md` for lore context.

### Phase 2: Stat Calculation

1. Look up the base stats for the target level from the Base Stats Table below.
2. Apply the archetype multiplier.
3. Apply the difficulty adjustment.
4. Apply the combat style modifier.
5. Round all values to integers.
6. Cross-check against existing mobs at the same level. If the computed stats are significantly different from existing mobs, note the discrepancy and favor consistency with existing data.

### Phase 3: Attack Definition

1. Generate attack definitions with damage ranges, attacks per round, and hit/miss verbs.
2. All attack percentages must total exactly 100.
3. For casters: generate a melee fallback attack (40-60% weight) plus spell attacks. Ensure `maxMana` can sustain at least 3-4 casts of the cheapest spell.
4. For hybrid: 60-70% melee, 30-40% spell.
5. Choose thematic verbs appropriate to the creature (see Attack Verb Reference below).

### Phase 4: Reward Calibration

1. Calculate XP reward from the Zone XP Table below.
2. Essence reward: 0 for most mobs. Small amounts (1-5) for class-themed mobs with `essenceClass` set.
3. Recommend a drop table with currency range from the Currency Drop Table below.
4. Optionally recommend item drops if the user specified loot.

### Phase 5: Output

Output the complete NPC as a JSON object matching the `data/areas/*/npcs.json` export format. Include:

1. A human-readable stat summary block (as a markdown table) for review.
2. The full NPC JSON.
3. A companion drop table JSON if the mob needs one.
4. A brief description (2-4 sentences) for the NPC's `description` field, written in MUD style.

Present the output to the user for review. Do NOT write files unless the user explicitly asks you to.

## Combat Formula Reference

**Miss Chance** (squared formula):
```
missChance = defense^2 / (accuracy^2 + defense^2)
```
Clamped to 5%-95%. Equal accuracy and defense = 50% miss. Attacker at 2x defense = 20% miss.

**Player Accuracy** (for reference):
```
accuracy = combatLevelBonus + (level * 2) + floor(DEX/10) + floor(INT/20) + floor(CHA/10 * 1.2) + equipBonus
```
Combat level bonuses: 1=0, 2=10, 3=20, 4=35, 5=50.

A typical level 5 player with combat level 1 and 50 in all stats has ~22 accuracy before equipment.

**NPC Defense** is the equivalent of player armor class. Higher defense = more misses from the player.

**NPC Accuracy** determines how often the NPC hits the player. A typical level 5 player has ~65-75 defense (10 base + equipment AC).

**Damage**: `random(minDamage, maxDamage) - damageReduction`. Minimum 1 per hit.

**Critical**: `maxDamage + random(minDamage, maxDamage) - damageReduction`.

**NPC attacks per round**: Static integer per attack definition. NPCs do not use the player energy system.

**Target combat duration**: A same-level player fighting a normal-medium mob should take 3-8 combat rounds (12-32 seconds at 4s per round). This means the mob should die in roughly 6-16 player hits while dealing meaningful but survivable damage.

## Base Stats Table (Normal / Medium / Melee)

These are the baseline stats for a standard mob at each level. All other combinations apply multipliers to these values.

| Level | HP | Acc | Def | Crit% | Dodge% | DR | MinDmg | MaxDmg | Atk/Rnd | XP |
|-------|-----|-----|-----|-------|--------|-----|--------|--------|---------|------|
| 1 | 30 | 20 | 50 | 0 | 0 | 0 | 2 | 7 | 2 | 10 |
| 2 | 40 | 22 | 52 | 0 | 0 | 0 | 3 | 9 | 2 | 12 |
| 3 | 55 | 25 | 55 | 0 | 0 | 1 | 4 | 10 | 2 | 18 |
| 4 | 70 | 28 | 58 | 2 | 0 | 1 | 5 | 12 | 2 | 25 |
| 5 | 85 | 32 | 62 | 3 | 0 | 2 | 6 | 14 | 2 | 35 |
| 6 | 100 | 36 | 66 | 4 | 0 | 2 | 7 | 16 | 2 | 45 |
| 7 | 120 | 40 | 70 | 5 | 0 | 3 | 8 | 18 | 2 | 60 |
| 8 | 140 | 44 | 74 | 6 | 0 | 3 | 9 | 20 | 3 | 85 |
| 9 | 160 | 48 | 78 | 7 | 0 | 4 | 10 | 22 | 3 | 110 |
| 10 | 185 | 52 | 82 | 8 | 0 | 4 | 11 | 24 | 3 | 135 |
| 11 | 210 | 56 | 86 | 9 | 0 | 5 | 12 | 26 | 3 | 170 |
| 12 | 240 | 60 | 90 | 10 | 0 | 5 | 13 | 28 | 3 | 210 |
| 13 | 275 | 64 | 94 | 11 | 0 | 6 | 14 | 30 | 3 | 260 |
| 14 | 310 | 68 | 98 | 12 | 0 | 6 | 15 | 32 | 3 | 320 |
| 15 | 350 | 72 | 102 | 13 | 0 | 7 | 16 | 34 | 4 | 400 |
| 16 | 400 | 76 | 106 | 14 | 0 | 7 | 17 | 36 | 4 | 500 |
| 17 | 450 | 80 | 110 | 15 | 0 | 8 | 18 | 38 | 4 | 620 |
| 18 | 510 | 84 | 114 | 16 | 0 | 8 | 19 | 40 | 4 | 770 |
| 19 | 570 | 88 | 118 | 17 | 0 | 9 | 20 | 42 | 4 | 950 |
| 20 | 640 | 92 | 122 | 18 | 0 | 9 | 21 | 44 | 4 | 1200 |

## Archetype Multipliers

Applied to the base stats above.

| Archetype | HP | Acc | Def | Damage | Atk/Rnd | XP | Notes |
|-----------|------|------|------|--------|---------|------|-------|
| normal | 1.0x | 1.0x | 1.0x | 1.0x | +0 | 1.0x | Standard mob |
| elite | 1.5x | 1.2x | 1.2x | 1.3x | +1 | 2.0x | Named or mini-boss |
| boss | 3.0x | 1.4x | 1.4x | 1.5x | +2 | 5.0x | Quest climax, one per area |
| swarm | 0.5x | 0.8x | 0.8x | 0.7x | +0 | 0.5x | Weak, appears in groups |

## Difficulty Adjustments

Applied on top of archetype.

| Difficulty | HP | Acc | Def | Damage |
|------------|------|------|------|--------|
| easy | 0.8x | 0.9x | 0.9x | 0.85x |
| medium | 1.0x | 1.0x | 1.0x | 1.0x |
| hard | 1.2x | 1.1x | 1.1x | 1.15x |

## Combat Style Modifiers

Applied on top of archetype and difficulty.

| Style | HP | Acc | Def | Damage | Mana | Notes |
|--------|------|------|------|--------|-----------|-------|
| melee | 1.0x | 1.0x | 1.0x | 1.0x | 0 | Standard physical |
| ranged | 0.85x | 1.1x | 0.85x | 1.1x | 0 | Fragile but accurate |
| caster | 0.7x | 1.0x | 0.8x | 0.6x melee | level * 8 | Primary damage from spells |
| hybrid | 0.9x | 1.0x | 0.9x | 0.9x melee | level * 5 | Mixed melee and spells |

For casters and hybrids, spell attack damage should be 1.5-2x the melee damage range but limited by mana and lower cast frequency.

## Zone XP Table

| Zone | Level Range | Mob XP Range |
|------|-------------|-------------|
| Hearthstead Loop | 1-2 | 8-12 |
| Hearthstead Wilds/Cave | 2-3 | 15-20 |
| Arindale outskirts | 4-6 | 28-40 |
| Arindale Sewer | 5-8 | 35-55 |
| Warrens of Filth | 8-12 | 80-150 |
| Iridescent Menagerie | 10-14 | 120-250 |
| Sanctum of the Damned | 12-16 | 200-400 |

Target: ~40-60 kills of normal mobs to level (at the low end of a level band), supplemented by quest XP.

## Currency Drop Table

| Level Band | Currency Drop (copper) | Denominations |
|------------|----------------------|---------------|
| 1-2 | 1-12 | copper |
| 3-4 | 5-30 | copper, silver |
| 5-6 | 10-50 | copper, silver |
| 7-8 | 20-100 | copper, silver, gold |
| 9-10 | 40-200 | silver, gold |
| 11-14 | 80-400 | silver, gold |
| 15-20 | 150-800 | silver, gold, platinum |

## Attack Verb Reference

| Type | hitVerb | hitVerb3p | missVerb | missVerb3p |
|------|---------|-----------|----------|------------|
| Bite | bites | bites | swing at | swings at |
| Claw | claws | claws | swing at | swings at |
| Slash | slashes | slashes | swing at | swings at |
| Smash | smashes | smashes | swing at | swings at |
| Sting | stings | stings | lunge at | lunges at |
| Spell (fire) | blasts | blasts | cast at | casts at |
| Spell (ice) | freezes | freezes | cast at | casts at |
| Spell (poison) | poisons | poisons | cast at | casts at |
| Ranged | shoots | shoots | fire at | fires at |

## NPC JSON Format

The output JSON must match this exact structure (from the data export format):

```json
{
  "name": "mob name (lowercase, no articles)",
  "description": "2-4 sentence MUD-style description.",
  "health": 85,
  "maxHealth": 85,
  "hostile": true,
  "level": 5,
  "experienceReward": 35,
  "maxMana": 0,
  "baseAccuracy": 32,
  "baseDefense": 62,
  "baseCritChance": 3,
  "baseDodge": 0,
  "damageReduction": 2,
  "traits": [],
  "fleeEnabled": false,
  "fleeHpPercent": 20,
  "callForHelpChance": 0,
  "interactable": false,
  "allowedAreas": ["Area Name"],
  "roamEnabled": true,
  "roamInterval": 60,
  "roamChance": 10,
  "essenceReward": 0,
  "essenceClass": null,
  "leaveCorpse": true,
  "corpseDuration": 60,
  "augmentations": [],
  "enterRoomMessage": "{name} enters from the {direction}.",
  "exitRoomMessage": "{name} leaves to the {direction}.",
  "spawnMessage": "{name} appears.",
  "deathMessage": null,
  "merchantEnabled": false,
  "properName": false,
  "spellPower": 0,
  "combatLevel": 1,
  "enabled": true,
  "dropTableName": "mob name drop table",
  "attacks": [
    {
      "attackType": "melee",
      "name": "weapon or attack name",
      "minDamage": 6,
      "maxDamage": 14,
      "attacksPerRound": 2,
      "percentage": 100,
      "hitMessage": null,
      "missMessage": null,
      "hitVerb": "slashes",
      "hitVerb3p": "slashes",
      "missVerb": "swing at",
      "missVerb3p": "swings at"
    }
  ]
}
```

## Drop Table JSON Format

```json
{
  "name": "mob name drop table",
  "description": "Drops for mob name",
  "entries": [
    {
      "dropChance": 100,
      "minQuantity": 1,
      "maxQuantity": 1,
      "currencyMin": 10,
      "currencyMax": 50,
      "allowedDenominations": ["copper", "silver"],
      "itemName": null
    }
  ]
}
```

## Validation Checklist

Before presenting the output, verify:
- [ ] Attack percentages total exactly 100
- [ ] Spell attacks have non-zero `maxMana` on the NPC
- [ ] XP reward falls within the zone's expected range
- [ ] HP allows 3-8 rounds of combat for a same-level player
- [ ] If `fleeEnabled: true`, `fleeHpPercent` is set
- [ ] Name is lowercase with no articles ("sewer rat" not "A Sewer Rat")
- [ ] Description uses no em dashes
- [ ] `health` and `maxHealth` are equal
- [ ] `combatLevel` is set (1-5, most mobs use 1)
