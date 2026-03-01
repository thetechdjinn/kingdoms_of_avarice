# Mob/NPC Spell Casting

## Core Design

Mobs and NPCs should be able to cast spells during combat. The system should leverage
the existing spell definitions (spells table) and status effect infrastructure, adding
NPC-specific spell configuration and AI decision-making.

---

## Spell Categories & Timing

### 1. In-Round Spells (Direct Damage)

- **Types**: Offensive spells (SpellType.OFFENSIVE)
- **Timing**: Execute during the NPC's normal combat round, replacing or supplementing
  melee attacks
- **Behavior**: NPC picks either a melee attack OR a damage spell for the round
  (not both)
- **Mana**: Deducted when the spell fires during the combat round
- **Combat State**: Does NOT break combat — NPC remains engaged with targets
- **Targeting**: Current combat target(s)

### 2. Between-Round Spells (Buffs, Debuffs, HoT, DoT, AoE)

- **Types**: Buff, Debuff, Healing (HoT), DoT application, Area Effect
- **Timing**: Cast between combat rounds (after one round resolves, before the next)
- **Behavior**: Casting does NOT replace the melee attack — it is a bonus action
  between rounds. However, it breaks combat engagement.
- **Combat Break**: Casting a between-round spell BREAKS COMBAT for the caster
  - All targets are cleared from the caster's combat state
  - The caster must re-engage before the next combat round fires
  - Re-engaging places the caster at the END of the combat processing order
  - For NPCs: auto-re-engage immediately after casting (behavior system)
  - For players: must issue `attack` command or offensive spell before the next
    round tick to participate in that round
  - If the caster re-engages in time, they still get their normal attack that
    round — but they go LAST in combat order
  - If the caster does NOT re-engage before the round fires, they miss the round
- **Mana**: Deducted immediately when the spell is cast
- **Net Effect**: The tactical cost is losing your combat position (moved to end
  of processing order), not losing your attack. Fast re-engagement means you get
  both the spell AND your attack, but you swing last.

---

## Combat Break Mechanic (Applies to BOTH NPCs and Players)

### Current Behavior
- Player offensive spells: Set combatAction='spell', stay in combat, fire each round
- Player non-damage spells (heal/buff/debuff): Instant cast, do NOT break combat
- NPCs: Only have melee attacks, no spell casting

### New Behavior
- **Offensive spells**: No change — remain in combat, fire during combat round
- **Non-damage spells cast while in combat**: BREAK COMBAT
  - Caster's `combatState.targets` is cleared
  - All entities targeting this caster continue attacking (they keep the caster
    as a target — combat is only broken from the caster's side)
  - Caster must re-engage before the next combat round to participate
  - Re-engaging places the caster at the END of the combat processing order
  - NPCs: auto-re-engage immediately after casting via behavior system
  - Players: must issue `attack <target>` or cast an offensive spell
  - If re-engaged in time: caster gets both the spell effect AND their normal
    attack that round, but attacks last in order
  - If NOT re-engaged in time: caster gets the spell effect but misses that
    round's attack entirely
  - This creates a tactical decision: casting a utility spell mid-fight risks
    losing your attack if you're slow to re-engage, and guarantees you swing
    last even if you do re-engage
- **Non-damage spells cast outside combat**: No change — instant, no penalty

### Combat Processing Order
- Currently: players processed in Map iteration order, then NPCs
- Need a combat order list that determines processing sequence each round
- When an entity re-engages after a between-round spell, they are appended
  to the END of the order list for that round
- This means entities who didn't cast between-round spells keep their
  existing position and swing first

### Implementation Notes
- `clearCombatState()` already exists but clears BOTH sides — need a new
  `breakCasterCombat()` that only clears the caster's targets without
  removing the caster from other entities' target lists
- Combat round processing needs an ordered list instead of iterating Maps
  directly, so re-engaged entities can be appended to the end
- NPCs: `processCombatBehavior()` already re-targets when targets are empty,
  so auto-re-engage is straightforward
- Players: Will need to `attack <target>` again after casting a non-damage
  spell in combat

---

## NPC Spell Configuration

### New Database Table: `npc_spells`

Links NPC templates to spells they can cast, with NPC-specific casting parameters.

```
npc_spells
  id              SERIAL PRIMARY KEY
  npc_id          INTEGER REFERENCES npcs(id) ON DELETE CASCADE
  spell_id        INTEGER REFERENCES spells(id) ON DELETE CASCADE
  priority        INTEGER DEFAULT 50        -- Higher = more likely to choose
  cast_chance     INTEGER DEFAULT 100       -- % chance to cast when conditions met (1-100)
  condition_type  VARCHAR(50) DEFAULT 'any' -- When to consider casting (see below)
  condition_value INTEGER DEFAULT 0         -- Threshold for the condition
  cooldown_rounds INTEGER DEFAULT 0         -- Rounds between casts of this spell
  UNIQUE(npc_id, spell_id)
```

### Condition Types

Determine WHEN an NPC considers casting a particular spell:

| Condition        | Value Meaning                  | Example Use                      |
|------------------|--------------------------------|----------------------------------|
| `any`            | Always eligible                | Basic damage spells              |
| `hp_below`       | Cast when own HP < X%          | Self-heal at 50% HP             |
| `hp_above`       | Cast when own HP > X%          | Offensive spells when healthy    |
| `target_hp_below`| Cast when target HP < X%       | Finish off weak targets          |
| `mana_above`     | Cast when own mana > X%        | Expensive spells when flush      |
| `no_effect`      | Cast if target lacks effect    | Apply debuff if not already on   |
| `has_allies`     | Cast if N+ allies in room      | Future: AoE buff when grouped    |
| `combat_start`   | First round of combat only     | Opening buff/debuff              |

### NPC Spell AI Decision Flow

NPCs evaluate spells at two distinct points:

```
BETWEEN ROUNDS (after round resolves, before next round fires):
1. Gather eligible non-damage spells (buff/debuff/heal/dot)
   - MANA CHECK: spell.manaCost <= npc.currentMana (skip if can't afford)
   - COOLDOWN CHECK: spell not on cooldown (skip if still cooling down)
2. Filter by condition (evaluate condition_type/value against current state)
3. Roll cast_chance for each eligible spell
4. If multiple pass: select by highest priority (ties broken randomly)
5. If selected: Cast immediately, break combat, auto-re-engage
   → NPC is moved to end of combat order for the upcoming round

DURING COMBAT ROUND (when NPC's turn comes up in combat order):
1. Gather eligible offensive spells
   - MANA CHECK: spell.manaCost <= npc.currentMana (skip if can't afford)
   - COOLDOWN CHECK: spell not on cooldown (skip if still cooling down)
2. Filter by condition
3. Roll cast_chance
4. If selected: Use as this round's attack action (replaces melee)
5. If no spell selected: proceed with normal melee attack selection

IMPORTANT: Mana check is the FIRST filter in both paths. An NPC will never
attempt to cast a spell it cannot afford. Spells that fail the mana check
are silently excluded from consideration — no wasted rounds, no failed cast
messages. The NPC simply doesn't consider spells it can't pay for, same as
the existing selectNpcAttack() behavior for melee attacks with mana costs.
```

---

## Spell Types & NPC Casting Details

### Direct Damage (Offensive)

- Uses existing spell damage_dice, damage_scaling_stat, damage_scaling_factor
- NPC scaling stat value: Could use a fixed value from the NPC template or a
  new `intellect` / `wisdom` field on the npcs table
- Spells always hit (consistent with player spell behavior)
- Replaces melee attack for that round (NPC does NOT also melee)
- Messages: "[NPC] casts [Spell Name] at you! (X damage)"

### Healing (Self-Heal / HoT)

- NPC targets self only — no intelligent NPC-to-NPC target selection for now
- Triggered when HP drops below condition threshold
- Instant heal uses healing_dice from spell definition
- HoT: Applies status effect (e.g., 'regenerating') with duration
  - If the HoT is target_type='room', the HoT effect splashes to ALL NPCs in
    the room (see AoE Targeting Rules). The NPC doesn't choose to heal others —
    it's just a natural side effect of the room-wide spell.
- Breaks combat — NPC auto-re-engages, moved to end of combat order
- NPC still gets melee attack that round (but swings last)
- Messages: "[NPC] casts [Spell Name] and recovers X HP!"

### Buff (Self-Buff)

- NPC targets self only — no intelligent NPC-to-NPC target selection for now
- Uses spell.statusEffect and spell.effectDuration
  - If the buff is target_type='room', the buff splashes to ALL NPCs in the
    room (see AoE Targeting Rules). The NPC doesn't choose to buff others —
    it's just a natural side effect of the room-wide spell.
- Breaks combat — NPC auto-re-engages, moved to end of combat order
- Condition: `combat_start` for opening buffs, `no_effect` to prevent stacking
- Messages: "[NPC] casts [Spell Name]! [Effect apply message]"

### Debuff (Target Debuff)

- NPC applies harmful status effect to target
- Uses spell.statusEffect and spell.effectDuration
- Breaks combat — NPC auto-re-engages, moved to end of combat order
- Condition: `no_effect` to avoid wasting mana re-applying
- Messages: "[NPC] casts [Spell Name] on you! [Effect apply message]"

### Area Effect (Room-Wide)

- target_type = 'room' on the spell definition
- AoE damage: Stays in combat (in-round, like offensive spells)
- AoE debuff/DoT: Breaks combat — caster auto-re-engages at end of order
- AoE buff/heal: Breaks combat — caster auto-re-engages at end of order
- Messages: "[Caster] casts [Spell Name]! [Effect on each target]"

**AoE Targeting Rules (by caster type):**

| Caster | Harmful AoE (damage/debuff/DoT) | Beneficial AoE (heal/buff/HoT) |
|--------|--------------------------------|-------------------------------|
| NPC    | All players in room (never other NPCs) | All NPCs in room (including caster, never players) |
| Player (solo) | Everything in room except the caster (NPCs + other players) | Caster only |
| Player (grouped) | Everything in room except caster's group (NPCs + non-group players) | All group members in room (including caster) |

- **NPC harmful AoE**: Hits every player in the room. Never hits other NPCs.
- **NPC beneficial AoE**: Affects the caster AND all other NPCs in the room.
  The NPC doesn't intelligently choose who to buff/heal — the spell simply
  splashes to all allied NPCs as a natural room-wide effect. Never hits players.
- **Player harmful AoE (solo)**: Hits everything in the room except the caster
  themselves — all NPCs AND all other players.
- **Player harmful AoE (grouped)**: Hits everything in the room except members
  of the caster's group — all NPCs AND all non-group players.
- **Player beneficial AoE (solo)**: Affects only the caster (no group = no one
  else to benefit).
- **Player beneficial AoE (grouped)**: Affects all members of the caster's group
  who are in the same room, including the caster.

### Damage Over Time (DoT Application)

- Applies a DoT status effect (e.g., poisoned, burning) to target
- Tick damage handled by existing status effect tick system (5s ticks)
- Breaks combat — NPC auto-re-engages, moved to end of combat order
- Messages: "[NPC] casts [Spell Name] on you! [DoT apply message]"

---

## Saving Throws (Debuff/DoT Resistance)

Debuff and DoT spells (from both NPCs and players) can be resisted via a saving
throw. Direct damage spells always hit — no save.

### Spell Definition Fields
- `save_stat`: Which defender stat is rolled to resist (e.g., WISDOM,
  CONSTITUTION). If NULL, the spell cannot be resisted (always lands).
- `save_difficulty`: Base difficulty number the defender must beat.

### Save Mechanic
- Only applies to spells that apply a status effect (debuff, DoT, control)
- Direct damage (offensive) spells are NOT resistable — they always hit
- Healing and buff spells are self/ally-targeted, no save needed
- For NPCs as defenders: use `spell_power` as their save stat value (same
  field, dual purpose — both casting power and resistance)

### Formula (TBD — refine during implementation)
```
saveRoll = random(1, 100) + (defenderStat * factor)
If saveRoll > save_difficulty + (casterLevel * factor): RESISTED
```
- Clamped to a minimum and maximum resist chance (e.g., 5%-75%)
- On resist: spell is still cast, mana is still consumed, but the effect
  does not apply. Message: "[Target] resists [Spell Name]!"

---

## Spell Telegraph System

Spells can optionally show a preparation message before resolving. This is
configurable per spell via a new field on the spell definition.

### Spell Definition Field
- `telegraph_message`: Optional TEXT. If set, this message is shown to the room
  before the spell resolves. Supports `{name}` placeholder for the caster's name.
  Example: `"{name} begins chanting an incantation..."`.
  If NULL/empty, the spell resolves instantly with no advance warning.

### Behavior
- Telegraph message is shown immediately when the spell is initiated
- The spell still resolves instantly in the same tick (no delay)
- This is purely flavor/information — NOT a cast time mechanic
- Applies to both NPC and player casts
- Useful for powerful or dramatic spells to give players context

---

## Mana System for NPCs

### Current State
- NPCs already have `maxMana` on template and `currentMana` on instance
- `selectNpcAttack()` already filters by mana affordability
- Mana restores to full on return-to-spawn (finalizeReturn)

### Required Changes
- Spell mana costs are checked BEFORE a spell enters the candidate pool.
  NPCs never attempt a spell they cannot afford — unaffordable spells are
  excluded from selection entirely, not attempted and failed.
- This is consistent with the existing `selectNpcAttack()` pattern which
  filters attacks by `a.manaCost <= npc.currentMana` before selection.
- Mana deducted at cast time:
  - In-round spells: Deducted during combat round processing
  - Between-round spells: Deducted immediately on cast
- When NPC runs out of mana for all spells: Falls back to melee-only attacks
- When NPC runs out of mana for expensive spells but can afford cheaper ones:
  Uses only the affordable spells in selection
- Mana does NOT regenerate during combat (consistent with player behavior)
- Mana restores to full on respawn / return-to-spawn

### NPC Stat Scaling
- Spells can scale damage/healing by stats (e.g., intellect × factor)
- NPCs don't currently have individual stat values
- Options:
  A. Add an `intellect` and `wisdom` column to npcs table
  B. Use the NPC's level as a proxy for stat scaling
  C. Use a fixed "spell power" value on the NPC template
- **Recommendation**: Option C — add `spell_power INTEGER DEFAULT 0` to npcs table.
  Use this as the stat value for all scaling calculations. Simple, flexible,
  doesn't require mapping NPC stats to the full player stat system.

---

## Implementation Phases

### Phase A: Database & Shared Types
- Create `npc_spells` migration (table + indexes)
- Add `spell_power` column to npcs table
- Add `telegraph_message` column to spells table (nullable TEXT, optional
  preparation message shown before the spell resolves)
- Add saving throw fields to spells table: `save_stat` (nullable, which stat
  the target rolls to resist) and `save_difficulty` (INTEGER, base difficulty)
- Add shared types: `NpcSpell` interface, update `NpcTemplate` to include spells
- Update `Spell` shared type with telegraph_message, save_stat, save_difficulty
- Add NPC spell repository (CRUD for npc_spells)

### Phase B: NPC Spell AI
- Implement spell condition evaluation (`evaluateSpellCondition()`)
- Implement spell selection logic (`selectNpcSpell()`)
- Integrate into combat round: check for spell before melee attack
- Track per-NPC spell cooldowns (in-memory Map on NpcCombatInstance)

### Phase C: NPC Spell Execution
- Implement `processNpcSpellCombat()` for in-round offensive spells
- Implement `processNpcBetweenRoundSpell()` for buff/debuff/heal/dot/aoe
- Wire into `processNpcAttackerCombat()` (spell vs melee branch)
- Handle combat break for between-round spells
- Messaging for all spell types (caster, target, room observers)

### Phase D: Combat Break & Order Mechanic (Player + NPC)
- Implement combat processing order list (replaces direct Map iteration)
- Implement `breakCasterCombat()` — clears caster's targets only, other entities
  keep the caster as their target
- On re-engage after combat break: append entity to END of combat order list
- Modify player spell handlers: non-damage spells in combat trigger combat break,
  player must `attack` again before next round to participate (at end of order)
- NPC auto-re-engage: behavior system re-targets immediately after between-round
  cast, NPC appended to end of combat order
- Test: entity that casts between-round spell and re-engages swings last
- Test: entity that fails to re-engage in time misses the round entirely

### Phase E: NPC Editor Integration
- Add "Spells" tab to NPC Editor
- List available spells, allow assigning to NPC with priority/condition/cooldown
- Add spell_power field to NPC Editor Basic tab
- Seed data: Give serpentine warrior a damage spell for testing

### Phase F: Testing & Balance
- Test NPC damage spell casting in combat rounds
- Test NPC buff/debuff/heal casting with combat break
- Test player combat break when casting non-damage spells in combat
- Test mana depletion and fallback to melee
- Test condition-based casting (heal at low HP, buff at combat start)
- Test AoE targeting: NPC AoE hits only players, player AoE hits
  everything except group (or self if solo), beneficial AoE hits group only
- Test saving throws: debuff/DoT resistance based on stat, direct damage
  always hits, resist messages
- Test telegraph messages on spells that have them configured
- Test flee-vs-cast priority (flee always wins)
- Balance spell damage/frequency against melee damage output

---

## Resolved Decisions

- **NPC-to-NPC targeted spells**: No intelligent NPC-to-NPC target selection
  for now (e.g., an NPC won't decide to heal a wounded ally). That is deferred
  as a future enhancement. However, room-wide beneficial spells (AoE buffs,
  AoE HoTs) naturally splash to all NPCs in the room as a side effect of being
  room-targeted. The casting NPC doesn't choose this — it just happens.
- **AoE targeting**: NPC AoE hits players only (never other NPCs). Solo player
  harmful AoE hits everything except the caster. Grouped player harmful AoE hits
  everything except group members. Player beneficial AoE hits group members only
  (or just self if solo). See AoE Targeting Rules table above.
- **Spell resistance/saves**: Saving throw based on stats. Targets roll against a
  relevant stat (e.g., Wisdom, Constitution) for a chance to resist debuffs and
  DoTs. This applies to BOTH NPC and player-cast debuffs/DoTs. Direct damage
  spells still always hit (no save). Details on save formula TBD during
  implementation — likely `resistChance = (defenderStat - casterStat) * factor`,
  clamped to a min/max range.
- **Spell interruption**: No. All spells are instant cast with no interruption
  mechanic. Balance via mana cost and the combat break penalty for non-damage
  spells. Interruption may be revisited as a future enhancement.
- **Flee vs cast priority**: Flee always wins. If an NPC's HP is below the flee
  threshold, it flees immediately regardless of any pending spell cast. Survival
  instinct overrides spellcasting.
- **Spell scaling**: spell_power only. A single `spell_power` value on the NPC
  template is the sole scaling mechanism. NPC level does not directly affect spell
  damage or healing. Designers explicitly set spell_power per NPC for full control.
- **Visual telegraph**: Configurable per spell. A new optional field on the spell
  definition (e.g., `cast_message` or `telegraph_message`) allows designers to add
  a preparation message that appears before the spell resolves. If set, players see
  something like "The serpentine warrior begins chanting..." before the spell
  fires. If not set, the spell resolves instantly with no advance warning. This
  applies to both NPC and player spell casts.

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/index.ts` | NpcSpell interface, NpcTemplate update |
| `packages/shared/src/spells.ts` | Spell interface: telegraph_message, save_stat, save_difficulty |
| `packages/server/src/db/migrations/` | npc_spells table, spell_power, telegraph_message, save fields |
| `packages/server/src/db/repositories/npcSpellRepository.ts` | New: CRUD for npc_spells |
| `packages/server/src/db/repositories/npcRepository.ts` | Load spells with template |
| `packages/server/src/db/repositories/spellRepository.ts` | Handle new spell fields |
| `packages/server/src/game/npcManager.ts` | Spell cooldown tracking, spell data caching |
| `packages/server/src/game/combat.ts` | NPC spell combat, AoE targeting, saving throws |
| `packages/server/src/game/npcBehavior.ts` | Spell AI decision, flee-vs-cast priority |
| `packages/server/src/game/combatCommands.ts` | breakCasterCombat() for combat break |
| `packages/server/src/game/spellCommands.ts` | Player combat break, AoE targeting, saves |
| `packages/server/src/game/statusEffects.ts` | Apply effects from NPC casts |
| `packages/server/src/routes/npcs.ts` | NPC spell CRUD endpoints |
| `packages/client/src/npc-editor.ts` | Spells tab in NPC editor |
| `packages/client/src/spell-editor.ts` | Telegraph message + save fields in editor |

---

## Phase A Cleanup (Low Priority)

Items identified during code review of Phase A. None are bugs — all are minor
consistency/robustness improvements that can be addressed opportunistically.

1. **Integer validation on NPC spell fields** (`routes/npcs.ts`)
   `validateNpcSpell()` doesn't enforce `Number.isInteger()` on priority, castChance,
   cooldownRounds, or conditionValue (only spellId gets the check). Postgres silently
   truncates floats to integers, so harmless in practice.

2. **Import handler: empty spells array doesn't clear** (`routes/npcs.ts`)
   The import handler only replaces spells when `spells.length > 0`. An import with
   `"spells": []` silently keeps existing spells. The PUT handler correctly clears on
   empty array. May be intentional (imports are additive) but is a behavioral difference.

3. **Spell import lacks transaction wrapping** (`routes/spells.ts`)
   Pre-existing: the spell import loop processes each spell individually without
   `withTransaction`. A failure midway leaves partial results. The NPC import handler
   was refactored to use transactions in Phase A but the spell import was not touched.
