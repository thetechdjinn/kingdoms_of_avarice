# Status Effect Editor

This is the design document for the rewrite of the Status Effect Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## System Overview

The status effect system is **fully functional and actively used in gameplay.** Effects
are defined in two places:

1. **Hardcoded registry** — 11 built-in effects (blessed, shielded, hasted, strengthened,
   cursed, slowed, blinded, poisoned, burning, regenerating, entangled)
2. **Database definitions** — managed via this editor, loaded at startup, takes priority
   over hardcoded effects

Spells reference effects by ID. When a buff/debuff spell is cast, it looks up the effect
definition and applies it with all its modifiers, tick damage, flags, etc. The Status
Effect Editor manages the "what does the effect do" while the Spell Editor manages
"what triggers the effect."

Effects are also applied by: `@effect` admin command, NPC offensive spells (as secondary
effects), and potentially items in the future.

## Layout

Three-panel: effect list (left), tabbed form (center, max-width 800px), preview (right,
300px). Preview hides at 900px, shrinks to 250px at 1200px.

## Effect List Panel

Status: Good

Category filter dropdown (buff/debuff/dot/hot/control) and search input (filters by
name, ID, description). Color-coded category badges. Sorted by category then
alphabetically.

> **Claude:** Good filtering and search. Same debounce concern as other editors at scale.
> Fine for now.

## Basic Tab

### Effect ID

Status: Good

Lowercase text input, pattern `[a-z_]+`, immutable after creation. This is the ID that
spells reference (e.g., "poisoned", "burning").

> **Claude:** Immutable IDs are a good pattern — prevents breaking spell references.
> No changes needed.

### Display Name

Status: Good. The human-readable name shown to players.

### Description

Status: Good. Textarea, shown in preview.

### Category

Status: Good. Dropdown: buff, debuff, dot, hot, control.

> **Claude:** The category drives list filtering and color-coding. It's also useful for
> the magic resistance system — debuffs can be resisted, buffs from hostile sources can
> be resisted by anti-magic characters. The category helps determine resistance behavior.

### Stacking Behavior

Status: Good. Dropdown: replace, refresh, stack.

- **Replace**: new application replaces existing
- **Refresh**: resets duration without stacking
- **Stack**: multiple applications stack (up to max stacks), multiplying effects

### Max Stacks

Status: Good. Only shown when stacking behavior is "stack". Number input, default 1.

> **Claude:** Conditional visibility is well done. The stack count multiplies tick
> damage/healing and modifiers, so this is an important balance lever.

## Modifiers Tab

Status: Good. All modifiers are actively used in combat.

Fields: Accuracy Modifier, Defense Modifier, Energy Modifier %, Damage Modifier %.

> **Claude:** The current editor only shows 4 modifiers (accuracy, defense, energy%,
> damage%). The `EffectModifiers` interface also has `speedModifier` which exists in code
> but is missing from the editor.
>
> **Expanded modifier list for the redesign:**
>
> **Stat Modifiers (same as Item Editor — affects all derived calculations):**
> - Strength — ripples to: melee damage, encumbrance capacity, bash chance
> - Dexterity — ripples to: dodge, accuracy, lockpicking, stealth
> - Constitution — ripples to: HP pool, damage resistance
> - Intelligence — ripples to: spellcasting, crit chance, lockpicking
> - Wisdom — ripples to: magic resistance, perception
> - Charisma — ripples to: merchant prices, certain combat calcs
> - Max HP — direct bonus/penalty to health pool
> - Max Mana — direct bonus/penalty to mana pool
>
> These work the same way item stat modifiers do: they adjust the effective stat value,
> which then flows through every calculation that uses that stat. A "Strengthened"
> buff giving +10 STR makes the player hit harder, carry more, and bash doors better
> without needing separate modifiers for each.
>
> **Combat Modifiers (current + additions):**
> - Accuracy Modifier — "Added to hit chance"
> - Defense Modifier — "Added to defense"
> - Energy Modifier % — "Multiplies attack energy per round (attack speed)"
> - Damage Modifier % — "Multiplies weapon damage dealt"
> - Speed Modifier % — "Movement speed (negative = faster, positive = slower)"
>   **Already in code but missing from editor. Must add.**
> - Critical Chance — "Bonus/penalty to critical hit chance"
> - Dodge % — "Chance to fully avoid an attack (separate from defense)"
>
> **Magic Modifiers:**
> - Magic Resistance — "Reduces incoming spell damage, helps resist debuffs"
> - Spellcasting — "Bonus/penalty to casting ability (large negative = silenced)"
>
> **Skill Modifiers:**
> - Stealth — "Bonus/penalty to stealth checks (hiding/sneaking)"
> - Perception — "Ability to detect hidden/sneaking players"
> - Lockpicking — "Bonus/penalty to lockpicking skill"
>
> **Resource Modifiers:**
> - Healing Received % — "Modifies incoming healing (curse halves healing, buff boosts)"
>
> The editor should group these into collapsible sections by category so the form
> doesn't become overwhelming. Most effects will only use 1-2 modifiers.

## Periodic Tab

Status: Good. DoT/HoT ticks are fully functional.

Fields: Tick Damage Range (min-max), Tick Healing Range (min-max), Tick Message (text),
Silent Tick (checkbox), Wear Off Message (text).

> **Claude:** Ticks run every 5 seconds via the regeneration system. Damage/healing is
> rolled between min and max, multiplied by stack count. Tick messages are shown unless
> silent tick is checked. Wear-off message displays when the effect expires.
>
> All of this works correctly. The tick system handles:
> - DoT damage (can kill dropped players, triggering death)
> - HoT healing (can revive dropped players from bleed-out)
> - Interrupting rest/meditation on damage ticks
>
> **UX improvements:**
> - `[PROPOSED]` The min-max range inputs use a cramped "min - max" inline layout.
>   Use two clearly labeled fields ("Min Damage" / "Max Damage") for clarity.
> - `[PROPOSED]` Add a preview of what the tick message looks like with a sample damage
>   roll. e.g., if tick message is "The venom burns!" and min-max is 2-5, show:
>   "The venom burns! (3 damage)" in the preview panel.

## Flags Tab

Status: Good. All flags are actively enforced.

Checkboxes: Blocks Regeneration, Blocks Movement, Is Blind.

> **Claude:** All three are checked in gameplay:
> - **Blocks Regeneration**: Prevents natural HP/mana regen (checked in regen system)
> - **Blocks Movement**: Movement commands get blocked with "You cannot move!" message
>   (checked in tickProcessor.ts)
> - **Is Blind**: Applies severe accuracy penalty in combat calculations
>
> These are well-labeled with hint text. No changes needed.
>
> **Additional flags for the redesign:**
> - **Blocks Casting** (silence) — prevents spell use
> - **Blocks Combat** (stun/incapacitate) — prevents attacking
> - **Blocks Stealth** — prevents hiding/sneaking
> - **Is Invisible** — hidden from room player listing (future)
>
> Some of these may overlap with the hardcoded interrupt system (stun, silence, knockdown
> exist in the registry). Need to verify and consolidate so there's one way to define
> these behaviors, not two.

## Preview Panel

Status: Good

Shows formatted effect summary: name, ID, category (color-coded), stacking behavior,
max stacks, combat modifiers, tick damage/healing ranges, tick message, wear-off
message, flags.

> **Claude:** Good coverage. Consider adding:
> - `[PROPOSED]` Show which spells apply this effect (reverse lookup). Critical for
>   understanding the effect's usage and impact.
> - `[PROPOSED]` Show effective values at different stack counts if stacking is enabled
>   (e.g., "At 3 stacks: damage 6-15/tick, accuracy -30").

## Creation Flow

Status: Needs improvement.

"+ New Effect" uses two prompts (effect ID + display name).

> **Claude:** Same prompt() issue as other editors. Replace with inline form or modal.
> The ID field is particularly important since it's immutable — the creation flow should
> make this very clear and validate the `[a-z_]+` pattern before submission.

## Import/Export

Status: Good. Same pattern as other editors. Merge by effect ID.

## Relationship to Other Editors

> **Claude:** The Status Effect Editor is tightly connected to other systems:
>
> - **Spell Editor** → Spells reference effects by ID in their status effect field.
>   The Spell Editor should use SearchableSelect populated from this editor's data.
> - **NPC Editor** → NPCs cast spells that apply effects. The `@effect` admin command
>   can also apply effects directly for testing.
> - **Item Editor** → Future: items could apply effects when equipped or used (e.g.,
>   cursed items applying a debuff, potions applying a buff). Not currently implemented
>   but the infrastructure supports it.
>
> When an effect is deleted, any spells referencing it will silently fail to apply the
> effect. Consider adding a warning when deleting: "This effect is referenced by N
> spells: [list]."

## Help Section

> **Claude:** Help documentation should cover:
> - How stacking behaviors differ (replace vs refresh vs stack with examples)
> - How tick damage/healing works (every 5 seconds, multiplied by stacks)
> - What each combat modifier does and how it's applied
> - What each flag does in gameplay
> - How effects connect to spells (the ID reference system)
> - How the hardcoded registry interacts with DB definitions (DB takes priority)
> - How to test effects in-game (`@effect` command)
