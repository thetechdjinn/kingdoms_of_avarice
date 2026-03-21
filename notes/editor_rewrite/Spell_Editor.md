# Spell Editor

This is the design document for the rewrite of the Spell Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Layout

Three-panel: spell list (left), tabbed form (center, max-width 800px), preview (right,
300px). Preview hides at 900px, shrinks to 250px at 1200px.

## Spell List Panel

Status: Good

Type filter dropdown (offensive/healing/buff/debuff/utility) and search input that
filters by name, mnemonic, or description. List shows mnemonic badge, spell name,
color-coded type badge, and level. Sorted by level then alphabetically.

> **Claude:** Better than most editors with both type filter and multi-field search.
> Color-coded type badges (red/green/blue/purple/yellow) are helpful. Same debounce
> concern as other editors at 300+ spells, but fine for now.

## Basic Tab

### Name

Status: Good. Plain text input, required.

### Mnemonic

Status: Good

2-10 character identifier used for casting (e.g., player types `mmis` for Magic Missile).
Lowercased on save.

> **Claude:** Uniqueness is only validated server-side. Could add client-side check
> against loaded spells, but low priority since the server rejects duplicates anyway.

### Description

Status: Good. Textarea, flavor text only. Not used in game logic.

### Telegraph Message

Status: **BUG — only works for NPCs.**

Text field with `{name}` placeholder. Intended to broadcast a warning message before
the spell resolves (e.g., "Goran begins channeling dark energy...").

> **Claude:** Traced the code. Telegraph messages are only processed in NPC combat
> spell casting (`combat.ts:729`). Player spell casting in `spellCommands.ts` never
> reads this field. When you set a telegraph on a player spell, nothing happens.
>
> **Fix needed:** Wire up telegraph for player casting too. When a player casts an
> offensive spell, broadcast the telegraph message to the room before the spell
> resolves. Added to TODO.md.

### Spell Type

Status: Good. Dropdown: offensive, healing, buff, debuff, utility.

> **Claude:** Utility type exists in the editor but `handleUtilitySpell()` in
> `spellCommands.ts` just returns "not yet implemented." Keep the option but mark it
> in the editor or help docs as not yet available.

### Target Type

Status: Good. Dropdown: enemy, self, ally, room/AoE.

> **Claude:** Used for both player and NPC casting. Room/AoE targets all enemies in the
> room (for NPCs) or all NPC targets. Works correctly.

### Mana Cost

Status: Good. Number input, default 5.

### Cast Difficulty (NEW FIELD)

Status: **New field needed.**

> **Claude:** Spells currently always succeed. Need a **Cast Difficulty** field (number)
> that is checked against the caster's spellcasting ability. If the check fails, the
> spell fizzles (mana consumed, no effect). Higher values = harder to cast. Combined
> with level scaling on the caster side, this creates a natural progression where low
> level casters can't reliably cast high level spells.
>
> Ties into the Spell Difficulty / Fizzle system in TODO.md. The editor field goes in
> the Basic tab next to Mana Cost. Also consider a **Fizzle Message** field (optional
> custom text when the spell fails).

### Attack Spell Checkbox

Status: **Unclear purpose / possibly redundant.**

> **Claude:** The `isAttackSpell` flag is set in the form but never checked by game
> logic. The system determines if a player is casting an attack spell by checking
> `combatState.combatAction === 'spell'` and the presence of `combatState.activeSpell`,
> both of which are set by `handleOffensiveSpell()`. The checkbox doesn't drive any
> behavior.
>
> Need to determine: was this intended to allow non-offensive spells to be used as
> combat actions (e.g., a buff that replaces your melee for the round)? Or is it just
> dead UI? If dead, remove it.

## Effects Tab

> **Claude:** The old Damage Section details (dice→min/max rework, level-based scaling)
> are now incorporated into the Type-Specific Effects Tab above under the Offensive
> type. The scaling system (Scaling % Per Level + Max Scaling %) is universal across
> all spell types that have numeric values (damage and healing).

### Type-Specific Effects Tab (Replaces Current Effects Tab)

Status: **Redesign. Follow the Item Editor's Type Data pattern.**

> **Claude:** Same UX fix as Item Editor: show the active spell type in the tab label
> or as a header (e.g., "Effects (Offensive)" or a prominent "Offensive Spell" header
> at the top of the section). Without this, you land on the tab and see fields with no
> context for which spell type you're editing.

> **Claude:** The Effects tab should change its content based on spell type, just like
> the Item Editor's Type Data tab changes based on item type. Each spell type shows
> only the fields and messages relevant to that type. All message fields are optional
> with generic fallback defaults so existing spells don't break.
>
> **Placeholders for all messages:** `{caster}`, `{target}`, `{damage}`, `{healing}`,
> `{spell}`
>
> **Offensive:**
> - Min Damage, Max Damage (replaces dice notation)
> - Scaling % Per Level, Max Scaling %
> - Hits Per Cast (default 1)
> - Status Effect (optional, SearchableSelect) — for spells that do damage AND apply
>   an effect (e.g., fireball that deals damage + applies "burning" DoT)
> - Effect Duration (seconds, only shown if status effect selected)
> - Hit Messages: Self, Target, Room (with {damage})
> - Fizzle Messages: Self, Target, Room
> - Resist Messages: Self, Target, Room (magic resistance reduced damage)
>
> **BUG:** Player offensive spells don't pass `statusEffect` or `effectDuration` into
> the `activeSpell` combat state object. NPC offensive spells correctly apply status
> effects after damage (combat.ts:880), but the player `processSpellCombat()` path
> has no equivalent code. A fireball + burning DoT works for NPCs but not players.
> Must be fixed: add statusEffect/effectDuration to the activeSpell object and add
> effect application in processSpellCombat(). Added to TODO.md.
>
> **Healing:**
> - Min Healing, Max Healing (replaces dice notation)
> - Scaling % Per Level, Max Scaling %
> - Hit Messages: Self, Target, Room (with {healing})
> - Fizzle Messages: Self, Room
>
> **Buff:**
> - Status Effect (SearchableSelect from status effect definitions)
> - Duration (seconds)
> - Applied Messages: Self, Target, Room
> - Fizzle Messages: Self, Room
> - Resist Messages: Self, Target, Room (target's magic resistance blocks the buff)
>
> **Debuff:**
> - Status Effect (SearchableSelect from status effect definitions)
> - Duration (seconds)
> - Save Difficulty (for magic resistance check)
> - Applied Messages: Self, Target, Room
> - Fizzle Messages: Self, Target, Room
> - Resist Messages: Self, Target, Room
>
> **Utility:**
> - (Not yet implemented — placeholder section)
>
> **Tick and wear-off messages stay on the Status Effect Editor.** They belong to the
> ongoing effect, not the cast. A poison effect's tick message ("The venom burns in
> your veins for {damage}!") is defined on the status effect, not the spell that
> applied it. This keeps spell messages about the moment of casting and effect messages
> about the ongoing duration. Multiple spells could apply the same status effect.

### Multi-Hit Spells (NEW FEATURE)

Status: **New field needed.**

> **Claude:** Currently all spells hit exactly once per combat round. Need a new field
> for spells that should hit multiple times per cast, like Meteor Swarm (4 hits in
> MajorMUD). Proposed field:
>
> - **Hits Per Cast** (number, default 1, min 1)
> - Each hit rolls damage independently using the spell's damage dice
> - Not based on melee energy — this is a fixed number of hits per round
> - The combat spell processing loop would iterate this many times per round
>
> This fits naturally in the Effects tab, next to Damage Dice. The field is simple but
> the combat code change is the real work — `processSpellCombat()` and
> `processNpcSpellCombat()` both need to loop over hits. Added to TODO.md.

> **Claude:** The old separate Healing and Status Effects sections are now folded into
> the Type-Specific Effects Tab above. Each spell type shows only its relevant fields
> and messages.

## Requirements Tab

Status: Needs changes.

Fields: Level Required (number, default 1), Class Restrictions (comma-separated text),
Class Quick Select buttons (Warrior, Paladin, Cleric, Ranger, Rogue, Mage).

> **Claude:** Level and class restrictions are actively checked by `canUseSpell()` in
> player casting. Both work correctly.
>
> **Class Quick Select buttons are hardcoded to 6 classes in the HTML.** Adding a new
> class requires editing `spell-editor.html`. Must be dynamically populated from the
> class definitions API (`/api/progression/classes`).
>
> **Redesign the class restriction UX:**
> - Remove the comma-separated text field entirely
> - Dynamically generate toggle buttons from the class API (like quick-select, but
>   auto-populated)
> - Selected classes show as highlighted buttons (already works this way, just needs
>   to be dynamic)
> - Selected classes also appear as chips/tags with an X to remove (visual confirmation
>   of what's selected without needing to read the button states)
> - Clicking a button toggles it: adds the class as a chip, or removes it
> - Empty selection = all classes can use the spell
> - This pattern (dynamic toggle buttons + chip display) could be reused for class/race
>   restrictions in the Item Editor Requirements tab as well

## Preview Panel

Status: Good

Shows formatted spell summary: name, mnemonic, type (color-coded), target, mana cost,
level, damage/healing with scaling formula, status effect, saving throw, telegraph,
class restrictions. Updates live on form changes.

> **Claude:** Well done. The scaling formula display ("50% of Intelligence") is
> particularly helpful for understanding the spell's power curve. No changes needed.

## Creation Flow

Status: Needs improvement.

"+ New Spell" uses two prompts (name + mnemonic). Creates with defaults (offensive,
enemy, 5 mana, level 1).

> **Claude:** Same prompt() issue as other editors. Replace with inline form or modal
> that takes name + mnemonic + type upfront, since type drives which effect fields
> appear.

## Import/Export

Status: Good. Same pattern as Item Editor.

## Missing Features

> **Claude:**
>
> - `[PROPOSED]` Show which NPCs can cast this spell (reverse lookup from NPC spell
>   assignments). Helps with balance decisions.
> - `[PROPOSED]` Show which classes have access via class restrictions. Visual indicator
>   in preview.

## Deferred

> - `[DEFERRED]` Spell trees/leveling (spell upgrades at higher levels).
> - `[DEFERRED]` Cooldown configuration in editor (currently hardcoded).
> - `[DEFERRED]` Spell components/reagents.
> - `[DEFERRED]` Damage type for spells (fire/ice/holy). Needs resistance system.
> - `[DEFERRED]` Utility spell implementation.
