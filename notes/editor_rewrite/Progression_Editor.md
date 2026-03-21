# Progression Editor

This is the design document for the rewrite of the Progression Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

**Note:** After Phase 1 (remove Abilities, Talents, Events), this editor will only have
two tabs: Classes and Races.

## Layout

Two-panel layout (no preview panel): entity list (left, 300px fixed), form (right, flex).
Top-level tabs in the navbar switch between Classes and Races. Each tab has its own list
and form.

> **Claude:** This is the only editor without a preview panel. For classes and races,
> a preview showing how the class/race appears in character creation (description, stat
> ranges, abilities) would be helpful. Consider adding a preview panel or at least a
> collapsible preview section within the form.

## Classes Tab

### Class List Panel

Status: Good. Simple list with display name and essence multiplier.

> **Claude:** No search or filter. Fine at 10-20 classes, but add a search input for
> consistency with other editors.

### Class ID

Status: Good. Pattern `[a-z][a-z0-9_]*`, immutable after creation.

> **Claude:** Same good pattern as Status Effect Editor. Prevents breaking references.

### Display Name / Description

Status: Good. Text input + textarea.

### Essence Multiplier

Status: Good. Number input, step 0.1, min 0.1, default 1.0.

> **Claude:** Controls how much essence this class earns. The label could use a hint
> explaining what it does: "Multiplier applied to essence earned (1.0 = normal,
> 1.5 = 50% more, 0.5 = half)".

### Resource Type

Status: Good. Dropdown: None, Mana, Kai, Rage, Focus.

> **Claude:** Hardcoded options. If new resource types are added, requires HTML change.
> Low priority — resource types are fundamental and rarely change.

### Playable

Status: Good. Checkbox, default checked.

> **Claude:** Needs hint text: "Uncheck to hide from character creation. NPC-only classes
> should be non-playable."

### Subscribed Tags

Status: Needs improvement.

Comma-separated text for tags.

> **Claude:** Same comma-separated text issue. Replace with tag-input component (type,
> enter to add chip, X to remove). However, subscribed tags are a niche feature tied
> to the event system which is being removed in Phase 1. Verify if this field has any
> remaining purpose after events are removed. If not, remove it.

### Combat & Magic Section

#### Combat Level

Status: Good. Number 1-5, default 3.

> **Claude:** Needs hint text explaining what combat level affects. Currently no
> guidance on what 1 vs 5 means for the player.

#### Magic Level

Status: Good. Number 0-3, default 0.

> **Claude:** Same — needs hint explaining what each level means. 0 = no magic,
> 3 = full caster?

#### Magic School

Status: Good. Dropdown: None, Mage, Priest, Druid, Bardic, Kai.

> **Claude:** Hardcoded options. Same concern as resource type — rarely changes but
> should ideally be dynamic. Low priority.

### Special Abilities

Status: **Redesign. Same checkbox + value approach as Race Traits.**

Four hardcoded checkboxes: Stealth, Lockpicking, Traps, Pickpocket.

> **Claude:** The editor shows 4 checkboxes but the seed data has 10 different
> special abilities: stealth, lockpicking, traps, pickpocket, dodge, enhanced_crits,
> tracking, magic_resist, no_magic_items, anti_magic, martial_arts. The editor is
> missing most of them.
>
> **Redesign to match the Race Traits pattern:** A checkbox list of all known class
> abilities. When checked, a value input appears for abilities that take numeric
> values. Boolean abilities are checkbox-only.
>
> **Known class abilities (current + planned):**
>
> *Boolean abilities:*
> - Stealth — enables hide/sneak commands
> - Lockpicking — enables lock picking
> - Traps — enables trap detection/disarm (not yet implemented)
> - Pickpocket — enables pickpocket command (not yet implemented)
> - Tracking — enables track command (not yet implemented)
> - Martial Arts — unarmed combat bonus (not yet implemented)
> - Anti Magic — anti-magic class flag (not yet implemented)
> - No Magic Items — cannot use magic items (not yet implemented)
>
> *Numeric abilities:*
> - Dodge — additional dodge bonus (flat %)
> - Enhanced Crits — additional crit bonus (flat %)
> - Magic Resistance — class bonus to magic resistance
> - Spellcasting — class bonus to spell casting ability
>
> Like Race Traits, this should be driven by a configuration source so new abilities
> can be added without code changes. The trait definition specifies: id, display name,
> description, boolean vs numeric, and which entity types it applies to (class, race,
> or both).
>
> **Consider unifying Race Traits and Class Special Abilities into one system.** Both
> are checkbox + optional value lists of capabilities. A shared "trait definition"
> table could serve both, with a flag for whether each trait is available for races,
> classes, or both.

### Crit Bonus / Dodge Bonus

Status: Good. Number inputs, 0-50% each.

> **Claude:** These are flat percentage bonuses added to the class's combat calculations.
> Both are actively used in `combatCalculations.ts` and `combatStatProvider.ts`. Clear
> and straightforward.

### Class Abilities Section

Status: **Being removed in Phase 1.**

Currently shows abilities assigned to this class with level requirement and auto-learn
flag. Add/remove via dropdown + level input + auto-learn checkbox.

> **Claude:** This entire section references the ability_definitions table which is being
> dropped in Phase 1. The class abilities section must be removed or redesigned.
>
> **Decision needed:** What replaces class abilities? Options:
> 1. Remove entirely — classes just have the special ability checkboxes above
> 2. Replace with spell assignments — which spells does this class learn at which levels?
>    This would duplicate what class_restrictions on spells already does, so probably
>    not needed.
> 3. Replace with a future talent/skill tree system when designed
>
> For now, remove and revisit when a replacement system is designed.

### New Fields Needed (from other editor reviews)

#### Armor Type Restrictions

From the Item Editor review: Weight Class on armor is being renamed to Armor Type with
values: Robe, Leather, Chainmail, Scalemail, Platemail.

Add a multi-select or checkbox group for which armor types this class can wear:
- Mage: Robe only
- Druid: Robe, Leather
- Rogue: Robe, Leather, Chainmail
- Warrior/Paladin: All types

The equip command would check this before allowing armor to be equipped.

#### Magic Resistance Bonus

From the Magic Resistance system design. Add a flat bonus field for class-level magic
resistance. Anti-magic classes (Witch Hunter) get high values.

> **Claude:** Could be a simple number input like crit_bonus and dodge_bonus. Or could
> be a multiplier if we want classes to scale magic resistance differently from the base
> Wisdom calculation.

#### Spellcasting Bonus

> **Claude:** With the spell difficulty / fizzle system being added, classes need a way
> to define their innate spellcasting ability. A "Spellcasting Bonus" field would feed
> into the cast difficulty check. Full casters (Mage) get high values, hybrid classes
> (Paladin) get moderate, non-casters (Warrior) get zero or negative.

---

## Races Tab

### Race List Panel

Status: Good. Shows display name and "NPC" indicator for non-playable races.

> **Claude:** No search or filter. Same as classes — add search for consistency.

### Race ID / Display Name / Description

Status: Good. Same pattern as classes. ID immutable after creation.

### Playable

Status: Good. Checkbox, default checked.

### Dodge Bonus

Status: Good. Number 0-25%, default 0.

> **Claude:** Racial dodge bonus, actively used in combat calculations. The 0-25 range
> is reasonable for a racial bonus.

### Base Stats

Status: Good overall. Minor UX issues.

Six stat ranges (STR, AGI, CON, INT, WIS, CHA), each with min/max pair. Min = starting
value, max = cap with CP investment. Defaults: min 40, max 100.

> **Claude:** The stat ranges are the core of race definition and they work well. Issues:
>
> - No validation that min <= max. A min of 80 and max of 60 would silently save.
>   Add validation.
> - No explanation of what min/max represent. Add hint: "Min = starting value at
>   character creation. Max = cap achievable through CP investment."
> - The stat names in code use `agility` and `intellect` instead of `dexterity` and
>   `intelligence`. The editor labels show "AGI" and "INT" which is fine, but the data
>   mapping is a potential confusion point for developers.
> - Default 40/100 is unexplained. Add hint or help section explaining the stat scale.

### Special Abilities

Status: **Merge into Traits section below.**

Three checkboxes: Stealth, Lockpicking, See Hidden.

> **Claude:** These are just traits stored with `{ id, value: 1 }` structure. They
> duplicate what the Traits section does. Once Traits becomes a proper checkbox + value
> system, these separate checkboxes are redundant. Remove this section and fold Stealth,
> Lockpicking, and See Hidden into the Traits list as boolean traits.

### Traits

Status: **Redesign. Remove freeform text, use checkbox + value inputs.**

Currently a comma-separated text field supporting `trait` and `trait=value` formats.
Error-prone and undiscoverable.

> **Claude:** Redesign as a checkbox list of all known traits. When a trait is checked,
> a value input appears next to it. Values can be positive or negative.
>
> **Known traits (current + planned):**
>
>> *Boolean traits (checkbox only, no value):*
> - Stealth — enables hide/sneak commands
> - Lockpicking — enables lock picking
> - See Hidden — can detect hidden/sneaking players
>
> *Numeric traits (checkbox + value input, positive or negative):*
> - Base Vision — luminance system (e.g., +100 normal, +200 darkvision). Replaces the
>   separate Base Vision field proposed earlier; now just a trait with a value.
> - Magic Resistance — racial bonus to magic resistance (e.g., +15 for dwarves, -10
>   for a magically susceptible race). Replaces the separate Magic Resistance Bonus
>   field proposed earlier.
> - Poison Resistance — reduces poison tick damage (e.g., +10)
> - Fire Resistance — reduces fire damage (future, when damage types matter)
> - Cold Resistance — same (future)
>
> The trait list should be defined in a configuration source (DB table or server
> config) so new traits can be added without code changes. Each trait definition
> specifies: id, display name, description, whether it takes a numeric value or is
> boolean-only.
>
> The Special Abilities checkboxes (Stealth, Lockpicking, See Hidden) above become
> redundant — they're just traits. Merge them into this single trait system and remove
> the separate Special Abilities section.

### Allowed Classes

Status: Needs improvement.

Comma-separated class IDs. Empty = all classes allowed.

> **Claude:** Same comma-separated text problem. Replace with dynamic toggle buttons
> populated from the class definitions API (same pattern proposed for Spell Editor
> class restrictions). Selected classes show as chips with X to remove. Empty = all
> classes.

### New Fields Needed (from other editor reviews)

> **Claude:** Base Vision and Magic Resistance Bonus were originally proposed as
> separate fields but are now covered by the Traits system as numeric traits. Base
> Vision becomes the "Base Vision" trait with a value like +100 or +200. Magic
> Resistance becomes the "Magic Resistance" trait with a positive or negative value.
> No separate fields needed on the race form.

---

## Removed Tabs (Phase 1)

The following tabs are being removed in Phase 1 as they have zero gameplay integration:

- **Abilities Tab** — CRUD for ability_definitions. 6 fields: id, name, type, resource
  type, description, cost, cooldown, tags. Never used in gameplay.
- **Talents Tab** — CRUD for talent_definitions. 7 fields: id, name, class restriction,
  essence cost, level, prerequisites, grants ability. Never used in gameplay.
- **Events Tab** — CRUD for game_events. 5 fields: id, name, essence value, XP value,
  emitted tags. processGameEvent() exists but is never called.

All related database tables, repository functions, API routes, shared types, and seed
data will be removed.

---

## Creation Flow

Status: Needs improvement.

Creating a new class or race currently clears the form and the developer fills in the
ID + fields. There's no prompt(), which is better than other editors, but the ID field
validation (pattern check) only happens on form submit.

> **Claude:** The creation flow is actually better than most editors since it doesn't
> use prompt(). The main improvement would be inline validation of the ID pattern as
> you type (show red border / hint if invalid characters are entered).

## Import/Export

Status: **Missing.**

> **Claude:** This editor has no import/export functionality, unlike Item, Spell, Status
> Effect, and Action editors. Add for consistency. Classes and races are foundational
> data that should be exportable/importable for backup and environment migration.

## Help Section

> **Claude:** Help documentation should cover:
> - What combat level and magic level mean and how they affect the character
> - What essence multiplier does
> - What each resource type means
> - How special abilities work (stealth enables hide/sneak commands, etc.)
> - How crit/dodge bonuses are applied
> - What base stats min/max represent and the CP investment system
> - How traits work (checkbox + value system, boolean vs numeric)
> - How allowed classes filtering works for races
> - What "playable" means (hidden from character creation vs available)
