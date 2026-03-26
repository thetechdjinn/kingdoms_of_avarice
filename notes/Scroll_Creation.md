# Scroll System Design

## Overview

Scrolls are consumable items that interact with the spell system. Two distinct scroll types:

1. **Learning Scrolls** - Permanently teach a spell to the reader. Always succeeds, always consumed.
2. **Casting Scrolls** - Cast a spell once on behalf of the reader without learning it. Per-scroll fizzle chance.

Both are `ItemType.CONSUMABLE` items using the existing consumable pipeline (`use`/`read` commands). They extend `ConsumableData` with new `effect_type` values and a `spell_id` reference.

**Scrolls are the only way players learn spells.** There is no trainer NPC or menu-based spell learning. Players must obtain a learning scroll (buy from merchant, quest reward, loot drop) and read it. This creates scarcity: common spells are cheap at merchants, powerful spells are rare drops or quest rewards, making spell acquisition a meaningful part of progression.

The `@learn` staff command remains as an admin/testing tool that bypasses this requirement.

---

## Type 1: Learning Scrolls

### Concept

A Mage reaches level 5 and buys a "scroll of fireball" from a merchant. They `read scroll`, the scroll is consumed, and Fireball is added to their spellbook (`sp` command). They can now cast it normally.

### Behavior

- `effect_type: 'learn_spell'`
- `spell_id` in consumable_data points to the spell template
- **Always succeeds. Always consumed.** Reading a scroll is like reading a book: you learn what's in it.
- The spell's `class_restrictions` and `level_required` still gate who can use the scroll. A Warrior can't read a Mage-only scroll. A level 3 character can't read a level 5 scroll. These checks happen via the item's `requirements` field on the template, validated before use.
- On use:
  1. Look up the spell by `spell_id`
  2. Check the reader doesn't already know the spell (only failure case: returns early, scroll NOT consumed)
  3. Call `spellRepo.learnSpell(characterId, spellId)`
  4. Consume the scroll (delete instance / decrement charges)
  5. Display: `"You study the scroll intently. The words of power burn into your memory as the parchment crumbles to dust."`
  6. Display: `"Learned: {spell name} ({mnemonic}) - {mana cost} mana"`
  7. Broadcast to room: `"{player} reads a scroll, which crumbles to dust."`

### Already Known

If the reader already knows the spell, the scroll is preserved:
- `"You already know this spell."`

This is the only case where the scroll is not consumed. It prevents accidentally wasting a scroll you don't need.

### Bad Data Guard

If `spell_id` references a spell that doesn't exist in the database:
- `"The writing on this scroll is illegible."`
- Scroll is NOT consumed (this is a data error, not a player error)

### Merchant Integration

Spell merchants stock learning scrolls as inventory items. A player browses a magic shop, buys "scroll of fireball" for gold, then reads it. This means:
- Spell cost is the merchant's price for the scroll
- Scrolls can be traded between players, dropped, looted
- Rare spells can be gated behind quest rewards or rare drops rather than merchant stock
- Merchants can have limited stock (`max_stock` on merchant_inventory), creating scarcity

---

## Type 2: Casting Scrolls

### Concept

A Warrior finds a "scroll of lightning bolt" in a dungeon. They `read scroll goblin` and it casts Lightning Bolt at the goblin. The Warrior never learns the spell. The scroll is consumed.

The scroll contains the magic, not the reader. This lets any class use any spell type as a one-shot consumable.

### Behavior

- `effect_type: 'cast_spell'`
- `spell_id` in consumable_data points to the spell template
- On use:
  1. Look up the spell by `spell_id`
  2. Check fizzle (roll against the scroll's `fizzle_chance`)
  3. If fizzle: consume scroll, display fizzle message, done
  4. If success: execute the spell's effect via the existing spell pipeline
  5. No mana cost (the scroll IS the mana source)
  6. Consume the scroll
  7. Display spell messages (or scroll-specific overrides)

### Requirements

**Scrolls define their own requirements** via the item template's `requirements` field, independent of the spell's own class/level restrictions. A "teleport scroll" might require level 10 even if the Teleport spell normally requires level 20 and Mage class. The scroll's item requirements are all that matter for casting scrolls.

This means:
- A Warrior CAN use a "scroll of teleport" if the scroll's requirements allow it
- A level 5 character CANNOT use a scroll with `requirements.level: 10`
- Class restrictions on the scroll item are optional (most casting scrolls won't have them)

### Fizzle Mechanics

**Per-scroll fizzle chance** stored as `fizzle_chance` (0-100) in consumable_data. This is set by the content creator on each individual scroll template. There is no formula or stat-based calculation; the scroll's data is the sole authority.

- `fizzle_chance: 0` or omitted: never fizzles
- `fizzle_chance: 15`: 15% chance of failure
- `fizzle_chance: 50`: coin flip (powerful scroll in the hands of a novice)

**The scroll is always consumed, fizzle or not.** The magic is released either way; on a fizzle it just dissipates uselessly. This prevents retry-spam and makes scrolls feel valuable.

**Fizzle message:** `"You struggle to read the scroll, but the magic fizzles and dissipates. The parchment crumbles to dust."` (Could also use the spell's `fizzle_message` if defined.)

### Spell Types via Casting Scrolls

All spell types are valid, but **casting scrolls are always one-shot, instant effects**. They do NOT engage the combat round system. An offensive casting scroll deals its damage immediately and is done; it does not become a repeating attack spell like Magic Missile would when cast normally. Think of it as a single burst of magic released from the scroll.

| Spell Type | Example | Target | Behavior |
|---|---|---|---|
| Offensive | "scroll of lightning bolt" | `read scroll goblin` | One hit of direct damage, does not engage combat rounds |
| Healing | "scroll of healing" | `read scroll` or `read scroll bob` | Instant heal, one-shot |
| Buff | "scroll of haste" | `read scroll` | Applies buff to self |
| Debuff | "scroll of weakness" | `read scroll goblin` | Applies debuff to target |
| Utility | "scroll of teleport" | `read scroll` | Teleport, detect, etc. |

**Offensive scroll detail:** The scroll deals damage using the spell's min/max damage range (with scaling if applicable), broadcasts hit messages, and that's it. It does not set `combatState.activeSpell`, does not add the target to combat targets, and does not initiate combat rounds. The reader is not "in combat" after reading an offensive scroll (though the target's aggro response may initiate combat separately).

**Scrolls ignore the `is_attack_spell` flag.** This flag only matters when a character casts a learned spell (it tells the combat system to replace melee attacks with the spell each round). Scrolls never enter the combat system, so the flag is irrelevant. A casting scroll referencing Magic Missile (`is_attack_spell: true`) works identically to one referencing a non-attack offensive spell. The scroll handler reads `min_damage`/`max_damage`, rolls once, applies damage, done.

This means **any offensive spell can go on a scroll** without needing duplicate "scroll-friendly" spell definitions. The same spell works both ways: learned by a Mage and cast repeatedly via combat rounds, or read once off a scroll for instant one-shot damage by anyone. Content creators pick the spell, the scroll handler does the rest.

---

## Utility Spell Implementation

The utility spell type exists in the codebase (`SpellType.UTILITY`) but `handleUtilitySpell()` in `spellCommands.ts:798` is a stub that refuses to cast. This needs to be wired up as part of scroll work since casting scrolls will invoke utility spells.

### Utility Spell Subtypes

Utility spells need a way to declare what they do. Unlike offensive (damage) or healing (restore HP) spells, utility effects vary widely. Options:

**A utility_action field on the spell:**

| utility_action | Behavior | Extra Data |
|---|---|---|
| `teleport` | Move caster to a destination room | `destination_room_id` on spell or scroll |
| `detect_hidden` | Reveal hidden players/NPCs in room | Duration-based, uses status effect |
| `light` | Illuminate a dark room temporarily | Duration-based, uses status effect or room effect |
| `recall` | Return to respawn/home room | Uses player's bound respawn room |
| `identify` | Reveal item stats | Targets an item in inventory |

The simplest approach: utility spells that apply a status effect already work through the buff/debuff pipeline. The new cases are spells with positional effects (teleport, recall) which need a `destination_room_id` or similar.

### Teleport Implementation

Teleport scrolls have a fixed `destination_room_id` set on the scroll's consumable_data. The destination is baked into the scroll by the content creator.

**One-way teleport:**
1. Scroll has `destination_room_id`
2. On use: move player to destination room, run room entry logic (look, aggro checks)
3. Broadcast departure: `"{player} vanishes in a flash of light."`
4. Broadcast arrival: `"{player} appears in a flash of light."`

### Two-Way Portal Implementation

The `TEMPORARY_PORTAL` door type already exists in `doorStateManager.ts` with the full lifecycle needed:

- `spawnPortal(doorId)` -- activates a portal, starts `durationSeconds` expiration timer
- `despawnPortal(doorId)` -- manually deactivates
- `expirePortal(door)` -- fires on timer expiry, removes portal, broadcasts `disappearMessage`
- `activePortals` Map -- tracks which portals are currently live
- `isPortalActive(doorId)` -- gates passage ("There is nothing there." if inactive)
- `itemDisplayName` -- shows on "Also here:" line when active (e.g., "a shimmering portal")
- `triggerText` -- how players enter it (only responds when active)

**Two modes are supported:**

**Mode 1: Both sides predefined (placed doors)**
Standard `TEMPORARY_PORTAL` door with `room1_id` and `room2_id` both set in the database. Used for designed content: a portal that appears in a specific dungeon room and leads to a specific destination. Both sides are known at design time. This works today unchanged.

**Mode 2: Dynamic origin (scroll-spawned portals)**
A portal scroll has a predefined `destination_room_id`, but the origin is wherever the caster is standing when they read the scroll. At spawn time, the caster's current room becomes the return side.

To support this, `activePortals` extends from `Map<number, number>` (doorId -> timestamp) to:

```typescript
Map<number, { spawnedAt: number, originRoomId?: number }>
```

`spawnPortal()` gains an optional `originRoomId` parameter:

```typescript
spawnPortal(doorId: number, originRoomId?: number): boolean
```

`getDestinationRoom(doorId, fromRoomId)` checks:
- If the active portal has an `originRoomId`, use it as the dynamic side
- Otherwise use the DB-defined rooms as today

The door definition for a scroll-spawnable portal has `room1_id` as null (determined at cast time) and `room2_id` as the destination. One null check in the spawn path. Everything else (timer, expiration, visibility, trigger text, messages) is reused as-is.

**Scroll portal flow:**
1. Player reads a portal scroll
2. `handleRead` resolves the spell as utility/portal
3. Calls `spawnPortal(portalDoorId, socket.currentRoomId)` -- origin is the caster's room
4. Portal appears in both rooms with `itemDisplayName` on "Also here:" line
5. Both rooms can `enter portal` (or whatever `triggerText` is set to)
6. After `durationSeconds`, portal expires and broadcasts disappearance

### Learned Teleport Spells

For caster classes that learn a teleport spell and can cast it repeatedly (with mana), the destination could come from the spell definition itself. A "Town Portal" spell might always go to the caster's respawn room. A "Gate" spell might go to a fixed location. This is separate from scroll behavior and will be designed when specific utility spells are created.

---

## Data Model Changes

### ConsumableData Extension

```typescript
export interface ConsumableData {
  charges?: number;
  effect_type: string;          // Add: 'learn_spell', 'cast_spell'
  effect_value: number;         // Unused for scroll types (set to 0)
  duration?: number;
  spell_id?: number;            // NEW: reference to spells table (soft ref, not FK)
  fizzle_chance?: number;       // NEW: 0-100, for casting scrolls (0 or omitted = never fails)
  destination_room_id?: number; // NEW: for teleport/utility scrolls
  use_message_self?: string;    // Custom self message: "You eat {item} and feel nourished."
  use_message_target?: string;  // Custom target message: "{player} reads a scroll and you feel weakened."
  use_message_room?: string;    // Custom room message: "{player} eats {item}."
}
```

No schema migration needed. `consumable_data` is already a JSONB column, so new fields are additive.

### Spell Table Addition

Add `destination_room_id INTEGER` to the `spells` table for utility spells that need a target location. Or handle this purely on the scroll side via `consumable_data.destination_room_id`. If utility teleport spells can be learned and cast normally (by Mages), then the spell itself needs the destination. If teleport is scroll-only, the scroll's consumable_data is sufficient.

### Item Template Examples

**Learning scroll (merchant stock):**
```json
{
  "name": "scroll of fireball",
  "keywords": ["scroll", "fireball"],
  "item_type": "consumable",
  "weight": 1,
  "base_value": 500,
  "requirements": { "level": 5, "class": ["mage", "warlock"] },
  "consumable_data": {
    "effect_type": "learn_spell",
    "effect_value": 0,
    "spell_id": 12
  }
}
```

**Casting scroll (teleport, never fizzles):**
```json
{
  "name": "scroll of teleportation",
  "keywords": ["scroll", "teleportation", "teleport"],
  "item_type": "consumable",
  "weight": 1,
  "base_value": 300,
  "consumable_data": {
    "effect_type": "cast_spell",
    "effect_value": 0,
    "spell_id": 25,
    "fizzle_chance": 0,
    "destination_room_id": 1
  }
}
```

**Casting scroll (loot drop, can fizzle):**
```json
{
  "name": "scroll of lightning bolt",
  "keywords": ["scroll", "lightning"],
  "item_type": "consumable",
  "weight": 1,
  "base_value": 150,
  "requirements": { "level": 8 },
  "consumable_data": {
    "effect_type": "cast_spell",
    "effect_value": 0,
    "spell_id": 7,
    "fizzle_chance": 20
  }
}
```

---

## Command Integration

### `read` command

`read` is a **separate command** with its own handler (`handleRead`), not an alias for `use`. Scrolls can only be activated via `read`. `use` remains unchanged and does not work on scrolls.

```
read scroll            -> handleRead: find scroll, execute spell effect
read missile goblin    -> handleRead: find scroll by keyword "missile", target "goblin"
use healing potion     -> handleUse: works as before, unchanged
use scroll             -> handleUse: scroll is not a standard consumable, nothing happens
```

This separation keeps `handleUse` untouched (no arg-splitting changes, no scroll awareness) and gives `read` a clean syntax: `read <item keyword> [target]`. The first arg is always the item keyword, the optional second arg is the target for offensive/debuff spells.

The `help` command will include a scrolls section explaining the `read` command and its syntax.

### `handleRead` flow

`handleRead(socket, args, connectedPlayers)` is a new command handler. Syntax: `read <item keyword> [target]`.

```
handleRead(socket, args, connectedPlayers)
  -> args[0] = item keyword, args[1] = optional target
  -> find scroll in inventory by keyword
  -> reject if not a consumable with effect_type 'learn_spell' or 'cast_spell'
  -> if learn_spell: learn the spell, consume scroll
  -> if cast_spell:
     -> fizzle check (roll against consumableData.fizzle_chance)
     -> if fizzle: consume, message, done
     -> dispatch by spell type:
        offensive: calculate damage, apply once, broadcast (NO combat round engagement)
        healing: apply heal to self or target
        buff: apply status effect to self
        debuff: apply status effect to target
        utility: dispatch to utility handler (teleport, etc.)
     -> consume scroll
```

This does NOT reuse `handleOffensiveSpell` directly because that handler sets up combat rounds and `activeSpell` state. Scroll offensive effects need their own one-shot damage path. Healing, buff, and debuff handlers may be partially reusable since they're already instant effects.

---

## Implementation Phases

### Phase 1: Learning Scrolls + `read` Command
- Add `read` as a new command with its own `handleRead` handler in command processor
- Add `learn_spell` handling in `handleRead`
- Look up spell by `spell_id`, validate already-known
- Call `spellRepo.learnSpell()`, consume scroll, display messages
- Create test learning scroll item templates
- Verify merchants can stock and sell learning scrolls

### Phase 2: Casting Scrolls
- Add `cast_spell` handler that branches into spell pipeline
- Per-scroll `fizzle_chance` roll (0 = never fails)
- Always consume scroll (fizzle or not)
- Pass target args through for offensive/debuff scrolls
- Skip mana cost and learned-spell checks
- Use scroll's item `requirements` instead of spell's restrictions
- Create test casting scroll item templates

### Phase 3: Utility Spell Wiring + Portal Scrolls
- Implement `handleUtilitySpell()` in spellCommands.ts (currently a stub)
- One-way teleport: move player to `destination_room_id` with departure/arrival broadcasts
- Two-way portal: extend `TEMPORARY_PORTAL` system in doorStateManager.ts
  - Extend `activePortals` Map to store optional `originRoomId`
  - Add `originRoomId` parameter to `spawnPortal()`
  - Update `getDestinationRoom()` to check dynamic origin
  - Scroll-spawned portals call `spawnPortal(doorId, casterRoomId)`
  - Pre-defined portals continue working unchanged (both rooms in DB)
- Other utility subtypes as needed (detect, identify, recall)
- Works both as learned spells (for caster classes) and via casting scrolls (for anyone)

### Phase 4: Editor Support & Custom Consumable Messages
- Add `learn_spell` and `cast_spell` options to item editor consumable effect type dropdown
- Add spell picker (SearchableSelect) for scroll `spell_id` selection
- Add fizzle_chance input (shown only for `cast_spell`)
- Add destination room picker (shown only for `cast_spell`, for teleport scrolls)
- Add `use_message_self` and `use_message_room` optional fields to ConsumableData
- Custom message support in `handleUse()`: `{player}` and `{item}` placeholders with fallback to defaults
- Add custom message inputs to item editor consumable section (all consumable types)
- Update help system with casting scroll syntax: `read <scroll> <target>`
- Update commands.md documentation

---

## Decided

- **`read` is a separate command, not a `use` alias.** Scrolls are activated exclusively via `read`. `use` is unchanged and does not handle scrolls. This avoids arg-splitting complexity in `handleUse` and gives `read` a clean `read <item> [target]` syntax.
- **Fizzle is per-scroll, set by the creator.** No formula, no stat interaction. The `fizzle_chance` field on the scroll is the only authority.
- **Teleport scrolls have a fixed destination** set in `consumable_data.destination_room_id`.
- **Two-way portals** use the existing `TEMPORARY_PORTAL` door system. Supports both modes: both sides predefined (placed doors) and dynamic origin (scroll-spawned, caster's room becomes return side). Small extension to `activePortals` Map and `spawnPortal()` to support the dynamic case.
- **Crafting scrolls is a future feature.** Not part of this implementation.
- **Casting scrolls do NOT engage combat rounds.** Offensive scrolls deal one-shot direct damage. They do not set `activeSpell` or initiate repeating attack rounds. The target's aggro response may start combat, but the scroll itself doesn't.
- **Scrolls ignore `is_attack_spell`.** Any offensive spell can go on a scroll without needing alternate spell definitions. The scroll handler reads the spell's damage data and rolls once; the combat-round flag is irrelevant.
- **Quest scrolls don't need special handling.** Any scroll can have `fizzle_chance: 0` to guarantee success. Quest association is handled by the quest system, not the scroll. (The `quest` rarity exists on items but is cosmetic/informational.)

## Scroll / Spell NPC Interaction Rules

**Any spell or scroll that targets an NPC triggers an NPC response.** The response depends on the spell type and the NPC's configuration.

| Scroll/Spell Type | Target | NPC Response |
|---|---|---|
| Offensive | NPC | Aggro. The NPC was attacked. |
| Debuff | NPC | Aggro. Hostile effect applied. |
| Healing | NPC | NPC-defined response (see below) |
| Buff | NPC | NPC-defined response (see below) |
| Healing | Self / ally | No response. NPC is not involved. |
| Buff | Self | No response. NPC is not involved. |
| Utility | Self / room | No response. Teleporting, detecting, etc. |

### Non-hostile spell targeting

When a player targets a non-hostile NPC with a beneficial spell (healing, buff), the NPC's response is configurable rather than hardcoded. This preserves the ability to use beneficial spell targeting as a quest mechanic or NPC interaction.

Possible NPC responses to beneficial spells:
- **Ignore** (default): NPC doesn't react. The spell has no mechanical effect on the NPC but the action was registered.
- **Dialogue trigger**: NPC responds with a message (e.g., "The wounded soldier looks at you gratefully."). Could tie into the merchant response / keyword system.
- **Quest trigger**: The act of casting on the NPC satisfies a quest step (e.g., "Heal the wounded soldier at the gate").

The implementation of NPC responses to beneficial spells is deferred; the important thing is that **the event is fired** so it can be hooked into later. For now, beneficial spells targeting NPCs should at minimum not crash and should produce a player-facing message like `"You cast {spell} on {npc}."` without mechanical effect.

A future "NPC awareness of magic" system (guards reacting to nearby spellcasting, anti-magic zones) is a separate concern and out of scope for scrolls.

## Open Questions

None. All design decisions are resolved. Implementation can proceed phase by phase.
