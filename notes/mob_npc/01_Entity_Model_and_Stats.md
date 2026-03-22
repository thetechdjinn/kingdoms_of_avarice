# Entity Model and Stats

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## Core Decision

Mobs and NPCs are the same game object type. This avoids complexity of managing two different systems and game object types. Behavioral differences (hostile, merchant, quest-giver) are driven by configuration, not separate types.

## Stat Block Design

### Design Principle: Pre-Computed Static Values

For players, combat values like accuracy, defense, and crit chance are computed each round from 6 base stats + equipment modifiers + class/race bonuses + level. Since mob stats never change (no leveling, no equipment swaps), we pre-compute the final combat values and store them directly on the template. Status effects (buffs/debuffs) are the only runtime modifiers and are applied on top of these static values.

### How Player Calculations Map to Mob Statics

The existing player combat chain computes these final values each round:

| Final Value | Player Calculation | Mob Equivalent |
|-------------|-------------------|----------------|
| **Accuracy** | combatLevelBonus + (level×2) + floor(DEX/10) + floor(INT/20) + floor(CHA/10×1.2) + equipBonus − encPenalty | `baseAccuracy` (single number) |
| **Defense** | baseAC(10) + armorAC + equipStatBonus + perception + shadow | `baseDefense` (single number) |
| **Crit Chance** | floor(level/10) + floor((INT−50)/10) + floor((DEX−50)/25) + classBonus + weaponCrit + encBonus, soft cap at 40% | `baseCritChance` (single number, soft cap pre-applied) |
| **Dodge** | (classDodge + raceDodge + equipDodge) + floor(DEX/10)×2 + floor(CHA/10), soft cap at 52%, then ÷ attackerAccuracy | `baseDodge` (pre-cap value, 0 for most mobs) |
| **Damage Reduction** | Sum of all armor piece damage_resistance values | `damageReduction` (single number) |

For **attacks per round**, players use an energy system: `roundEnergy = (1000 + max(0, DEX−50)×5) × encMod`, then `swings = floor(energy / effectiveWeaponCost)`. For mobs, attacks per round is defined statically per attack definition. Status effects that modify energy (haste +25%, slow −25%) scale the mob's attack count: `effectiveAttacks = max(1, round(attacksPerRound × (1 + energyModifier/100)))`.

### Runtime Formula (per combat round)

When the combat system processes an NPC, it applies status effects on top of the static values:

```
accuracy       = baseAccuracy + effectMods.accuracyModifier − (isBlind ? 10 : 0)
defense        = baseDefense + effectMods.defenseModifier
critChance     = baseCritChance  (no status modifier currently)
dodgeChance    = calculateDodgeFromBase(baseDodge, attackerAccuracy)
attacksPerRound = max(1, round(attack.attacksPerRound × (1 + effectMods.energyModifier / 100)))
minDamage      = floor(attack.minDamage × (1 + effectMods.damageModifier / 100))
maxDamage      = floor(attack.maxDamage × (1 + effectMods.damageModifier / 100))
```

These feed directly into the existing `resolveAttack()` and `calculateDamage()` functions unchanged.

### NPC Template Structure

```typescript
interface NpcTemplate {
  // ── Identity ──
  id: number;
  name: string;
  description: string;
  level: number;

  // ── Vitals ──
  maxHp: number;
  maxMana: number;               // 0 if no spells

  // ── Pre-Computed Combat Values ──
  baseAccuracy: number;          // All accuracy bonuses baked in
  baseDefense: number;           // AC + all defense bonuses baked in
  baseCritChance: number;        // Soft cap pre-applied (0-60)
  baseDodge: number;             // Pre-soft-cap dodge total (0 for most mobs)
  damageReduction: number;       // Flat damage absorbed per hit

  // ── Attacks ──
  attacks: NpcAttack[];          // Percentages must total 100

  // ── Traits & Abilities ──
  traits: string[];              // see_hidden, stealth, pinned, etc.
  fleeEnabled: boolean;
  fleeHpPercent: number;         // Default 20 (flee below 20% HP)
  callForHelpChance: number;     // 0-100, default 50

  // ── Spawning ──
  spawnRoomId: number;
  respawnTime: number;           // Seconds
  maxActive: number;             // Max instances from this spawn room
  allowedAreas: string[];        // Roaming boundaries

  // ── Movement ──
  roamEnabled: boolean;
  roamInterval: number;          // Seconds between checks (default 60)
  roamChance: number;            // Threshold (91 = 10% chance to move)

  // ── Behavior ──
  hostile: boolean;
  interactable: boolean;

  // ── Loot ──
  dropTableId: number | null;
  experienceReward: number;
  essenceReward: number;         // 0 if none
  essenceClass: string | null;   // null = any class, "thief" = thief only

  // ── Corpse ──
  leaveCorpse: boolean;
  corpseDuration: number;        // Seconds (default 300)

  // ── Name Augmentation (enabled when array is non-empty) ──
  augmentations: string[];       // ["angry", "fat", "skinny"]

  // ── Faction ──
  primaryFactionId: number | null;

  // ── AI (dialogue, not combat) ──
  aiEnabled: boolean;
  aiPersonality: AiPersonalityConfig | null;

  // ── Room Messages ──
  enterRoomMessage: string;      // "A serpentine warrior slithers in."
  exitRoomMessage: string;       // "A serpentine warrior slithers away."
}

interface NpcAttack {
  attackType: 'melee' | 'ranged' | 'spell';
  name: string;                  // "battle axe", "fireball"
  minDamage: number;
  maxDamage: number;
  attacksPerRound: number;       // Static swings per round
  percentage: number;            // Weight (all attacks must total 100)
  manaCost: number;              // 0 for melee/ranged
  messages: {
    hitTarget: string;           // "The <mob> chops you for <damage> damage!"
    missTarget: string;          // "The <mob> swings at you, but misses!"
    hitRoom: string;             // "The <mob> chops <target> for <damage> damage!"
    missRoom: string;            // "The <mob> swings at <target>, but misses!"
  };
}
```

### Instance Data (Runtime)

```typescript
interface NpcInstance {
  instanceId: number;
  templateId: number;
  currentRoomId: number;
  currentHp: number;
  currentMana: number;
  activeEffects: Map<string, ActiveStatusEffect>;
  combatTargets: Set<number>;    // Player IDs
  behaviorState: 'idle' | 'combat' | 'fleeing' | 'returning';
  augmentation: string | null;   // Selected on spawn
  initiative: number;            // Rolled on combat start
}
```

Serialized to database: `templateId` + `currentRoomId` only. On load, a fresh instance is created with full HP/mana and no effects.

## Editor: Calculate-from-Stats Helper

Content creators shouldn't need to manually compute `baseAccuracy = 42`. The mob editor provides a **calculate helper** where you input familiar values and it computes the static results:

| Editor Input | Used To Compute |
|-------------|-----------------|
| STR | (display only — mobs have no encumbrance) |
| DEX | baseAccuracy, baseCritChance, baseDodge |
| INT | baseAccuracy, baseCritChance |
| CHA | baseAccuracy, baseDodge |
| Level | baseAccuracy, baseCritChance |
| Combat Level (1-5) | baseAccuracy (combat level bonus) |
| AC | baseDefense |
| Class Crit Bonus | baseCritChance |
| Class/Race Dodge Bonus | baseDodge |
| Weapon Crit Modifier | baseCritChance |

The editor runs the same formulas the player system uses, shows the computed result, and stores it. Content creators can also **override** any computed value directly for fine-tuning.

### Example: Serpentine Warrior (Level 5)

**Editor inputs:**

| Field | Value |
|-------|-------|
| DEX | 55 |
| INT | 35 |
| CHA | 30 |
| Level | 5 |
| Combat Level | 2 |
| AC | 18 |
| Dodge Bonus | 0 |
| Crit Bonus | 0 |
| Weapon Crit | 0 |

**Computed static values:**

| Static Field | Calculation | Result |
|-------------|-------------|--------|
| `baseAccuracy` | combatBonus(2) + level×2(10) + floor(55/10)(5) + floor(35/20)(1) + floor(30/10×1.2)(3) = | **21** |
| `baseDefense` | 18 (direct from AC input) | **18** |
| `baseCritChance` | floor(5/10)(0) + max(0,floor((35−50)/10))(0) + max(0,floor((55−50)/25))(0) + 0 + 0 = | **0** |
| `baseDodge` | 0 (no dodge bonus) | **0** |
| `damageReduction` | (set directly) | **2** |

**Attack definition:**

| Field | Value |
|-------|-------|
| Attack Type | Melee |
| Name | rusty sword |
| Damage | 5-10 |
| Attacks/Round | 2 |
| Percentage | 100 |
| Mana Cost | 0 |

**Template summary:**

```
Serpentine Warrior (Level 5)
HP: 45  Mana: 0
Accuracy: 21  Defense: 18  Crit: 0%  Dodge: 0  DR: 2
Attack: rusty sword (melee) 5-10 dmg, 2/round
XP: 35  Essence: 0
Hostile: yes  Flee: yes (20%)  Call for help: 50%
Respawn: 240s  Roam: yes (60s, 10% chance)
```

### Example: Serpentine Sorcerer (Level 7)

**Editor inputs:** DEX 40, INT 70, CHA 45, Level 7, Combat Level 1, AC 14

**Computed:**

| Static Field | Calculation | Result |
|-------------|-------------|--------|
| `baseAccuracy` | combatBonus(0) + 14 + 4 + 3 + 5 = | **26** |
| `baseDefense` | 14 | **14** |
| `baseCritChance` | 0 + 2 + 0 + 0 = | **2** |
| `baseDodge` | 0 | **0** |
| `damageReduction` | | **1** |

**Attacks:**

| # | Type | Name | Damage | Attacks/Rnd | % | Mana |
|---|------|------|--------|-------------|---|------|
| 1 | Melee | staff | 3-6 | 1 | 40 | 0 |
| 2 | Spell | ice bolt | 12-20 | 1 | 35 | 8 |
| 3 | Spell | fireball | 17-30 | 1 | 25 | 15 |

When out of mana: spell percentages (60% total) redistribute to melee → melee becomes 100%.

```
Serpentine Sorcerer (Level 7)
HP: 35  Mana: 60
Accuracy: 26  Defense: 14  Crit: 2%  Dodge: 0  DR: 1
Attack 1: staff (melee) 3-6 dmg, 1/round [40%]
Attack 2: ice bolt (spell) 12-20 dmg, 1/round [35%] (8 mana)
Attack 3: fireball (spell) 17-30 dmg, 1/round [25%] (15 mana)
XP: 55  Essence: 5 (mage)
Hostile: yes  Flee: yes (20%)  Call for help: 50%
```

## Attack Selection Algorithm (Per Round)

```
1. Check mana availability
   - If mob has enough mana for ALL attacks → use original percentages
   - If mob lacks mana for SOME spell attacks → redistribute those
     percentages proportionally to remaining valid attacks
   - If mob lacks mana for ALL spell attacks → 100% to melee/ranged

2. Roll d100 against adjusted percentages to select attack

3. Apply status effect modifiers to selected attack:
   - attacksPerRound × (1 + energyModifier/100), min 1
   - damage range × (1 + damageModifier/100)

4. For each swing in attacksPerRound:
   - resolveAttack(mobAccuracy, targetDefense, mobCritChance, targetDodge)
   - If HIT or CRITICAL → calculateDamage(min, max, isCritical, 0, targetDR)
   - Send appropriate hit/miss message to target and room
```

## Traits and Abilities

- Mobs and NPCs will have a list of traits that are applied to them (see_hidden, stealth, pinned, etc.).
- Mobs and NPCs will have a list of abilities that are applied to them (call for help, backstab, etc.).
- Mobs / NPCs will emit events like experience, essence, and other configurable events.

## Name Augmentation

- Mobs can have name augmentations (cosmetic only — no stat changes).
- Name augmentations must be toggled to be enabled per template.
- If toggled, a list of augmentations must be available.
- Multiple name augmentations can be provided with a random selection chosen on spawn.
- A lack of augmentation should always be part of the random choice (i.e., some mobs spawn without an augmentation).
- Augmented names allow targeting: `attack angry` or `attack angry serpentine` to target a specific augmented mob.

**Example:**

- Mob name: serpentine warrior
- Possible Augmentations: angry, fat, skinny, etc.
- Results: "serpentine warrior", "angry serpentine warrior", "skinny serpentine warrior"
