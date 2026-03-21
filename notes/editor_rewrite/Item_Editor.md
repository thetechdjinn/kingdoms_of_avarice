# Item Editor

This is the design document for the rewrite of the Item Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Layout

Three-panel: item list (left, 200px), tabbed form (center, flex, max-width 800px),
preview + spawn (right, 300px). Preview hides at 900px viewport, shrinks to 250px
at 1200px.

## Item List Panel

Status: Good, but could use improvements.

The list panel has a type filter dropdown (All Types, Weapons, Armor, Containers,
Consumables, Light Sources, Tools, Keys, Miscellaneous) and a search box that filters
by name. Items show name, type, and ID. Sorted alphabetically.

> **Claude:** This is better than most editors since it already has both a type filter
> AND a search input. The combination works well for narrowing down items. The main
> concern is that the list re-renders the full DOM on every keystroke. At 500+ items
> this will get sluggish. Adding a debounce (150-200ms) on the search input would help.
> Not a redesign issue, just a performance fix during implementation.

## Item List Footer (Import/Export)

Status: Good

Import and Export buttons at the bottom of the list panel. Import opens a modal with
file input, merge checkbox, and shows created/updated/error counts after import.
Export downloads a JSON file.

> **Claude:** This is a good pattern that some other editors are missing (Door, Progression,
> Faction). We should standardize import/export across all editors during the rewrite.

## Tabs

Status: Good

Five tabs: Basic, Type Data, Requirements, Modifiers, Flags. Clean tab bar with
active state highlighting.

> **Claude:** The tab structure is well-organized. Each tab has a clear purpose and the
> cognitive load per tab is reasonable. No changes needed to the tab structure itself.

## Basic Tab

Status: Mostly good. Some fields need discussion.

Fields: Name, Type (dropdown), Short Description, Long Description (textarea),
Room Description, Keywords (comma-separated text), Weight, Size, Base Value in Copper,
Equipment Slot (18 options), Max Stack, Effect Slots, Rarity (6 options), Max in World.

### Name

Status: Good. Plain text input.

### Type

Status: Good. Dropdown with 8 item types. Changing type shows/hides relevant sections
in the Type Data tab. This is the core UX mechanic of the editor and it works well.

### Short Description / Long Description / Room Description

Status: Short desc and room desc are dead weight. Needs cleanup.

Three description fields with no guidance on when each is used in-game.

> **Claude:** Traced the code. Here's what's actually used:
>
> - **`name`** is the primary display field used everywhere in gameplay (pick up, drop,
>   examine, buy, sell, combat, inventory, room listing). This is the only field that
>   matters for identifying the item.
> - **`short_desc`** is a legacy fallback only. `getItemName()` says: "uses name, falls
>   back to short_desc for legacy." Only referenced as a null fallback and in the
>   `@iteminfo` admin debug command. No functional purpose.
> - **`room_desc`** is stored in the database but **never read by any game logic**. It
>   exists only in the repository, route, and import layers. No code displays it to
>   players. Items in rooms are shown using `name` via `withArticle()`.
> - **`long_desc`** is the examine text, shown when a player looks at the item.
>
>> **Decision:** Remove `short_desc` and `room_desc` from the editor. `name` is sufficient.
> `short_desc` is legacy dead code, `room_desc` was never wired up. Drop the columns in a
> migration or leave them in the DB but remove from the editor UI. The `long_desc` field
> stays as the examine text. Rename it to "Examine Description" with hint: "Shown when a
> player examines this item."

### Keywords

Status: Works but could be better.

Comma-separated text field. Used for search/targeting (e.g., player types "get sword"
and keywords help match the item).

> **Claude:** This is a candidate for a tag-input component (type a word, press enter to
> add as a chip, click X to remove). Prevents formatting issues with commas and spaces.
> Same component could be reused for class/race restrictions in Requirements tab.

### Weight / Size / Base Value

Status: Good. Number inputs with min 0.

> **Claude:** "Base Value (Copper)" is correctly named. The merchant system uses this as
> the base for buy/sell price calculations (modified by faction rep, charisma, and haggling).
> Sell price is 50% of base value with the same modifiers. The examine command shows
> "It looks to be worth about [denominations]" using the raw base value.
>
> Consider adding hint text: "(merchant prices are calculated from this)" to explain why
> it says "Base" instead of just "Value."
>
> The preview panel already converts to denominations (gold/silver/copper). Could also add
> a small inline display next to the input showing the denomination breakdown as you type.

### Effect Slots

Status: Rename needed.

> **Claude:** This field controls how many enchantments can be applied to an item (the
> enchantment system in `itemCommands.ts` checks `currentEnchantments.length >= template.effect_slots`).
> The label "Effect Slots" is unclear. Rename to "Enchantment Slots" to match the actual
> mechanic. Add hint text: "Maximum number of enchantments that can be applied to this item."

### Equipment Slot

Status: Good. 18-option dropdown.

Options: None, Head, Face, Neck, Torso, Arms, Hands, Waist, Legs, Feet, Finger, Ears,
Back, Shield, Weapon, Light, Held, Off Hand.

> **Claude:** 18 options is manageable in a standard dropdown. No SearchableSelect needed
> here. The options are hardcoded in HTML though. Same concern as terrain types - if new
> slots are ever added, two files need updating. Low priority, note for future.

### Max Stack

Status: **Remove.**

> **Claude:** Max stack limits how high a stack can go, but weight already scales with
> quantity (`totalWeight += itemWeight * quantity`), so encumbrance naturally limits
> hoarding. The Stackable flag on the Flags tab is the meaningful control: stackable
> items merge into "iron ore (2)", non-stackable items show as separate entries
> (e.g., "statue, statue"). Max stack adds nothing useful. Remove from editor and
> default to unlimited in the DB for stackable items.

### Effect Slots

(See above — rename to Enchantment Slots.)

### Rarity

Status: Good. 6-option dropdown (common, uncommon, rare, limited, unique, quest).

### Max in World

Status: Good. Optional number. Only relevant for rare/unique items.

> **Claude:** Consider disabling or hiding this field when rarity is "common" since it
> doesn't make practical sense to limit common items. Minor UX improvement.

## Type Data Tab

Status: Good overall. This is the editor's strongest feature. One UX fix needed.

Type-specific sections show/hide based on the item type selected in Basic tab.
Each type has its own set of fields.

> **Claude:** The tab label just says "Type Data" with no indication of which type is
> active. When you land on this tab, you see fields but don't immediately know if you're
> looking at weapon data or armor data without scrolling back to the Basic tab to check.
> **Show the active type in the tab or as a header inside the tab** — e.g., tab label
> changes to "Type Data (Weapon)" or a header at the top of the section says "Weapon
> Data" in a prominent style. Same fix applies to the Spell Editor's Effects tab.

### Weapon Data

Status: Good

Fields: Min/Max Damage, Damage Type (9 options), Attack Speed, Crit Modifier, Range
(melee/ranged/thrown), Backstab Modifiers (accuracy, min/max damage bonus), Attack
Verbs (Hit 1p, Hit 3p, Miss 1p, Miss 3p with placeholders).

> **Claude:** Currently any one-handed weapon can backstab. The only check is
> `flags?.two_handed`. A mace or wand can backstab just as well as a dagger.
>
> **New field:** Add `allows_backstab` boolean to weapon data (default false). The
> backstab check in `stealthCommands.ts` would check this flag instead of (or in
> addition to) the two-handed check. Daggers and short swords: true. Maces, wands,
> flails: false. Small change: one new field in weapon_data, one check in
> stealthCommands.ts, one checkbox in the editor's Weapon Data section next to the
> existing backstab modifiers.
>
> The attack verb customization is a standout feature. The placeholders
> ("e.g., slash, slashes") help developers understand first vs third person. Backstab
> modifiers are a nice touch for rogue-oriented weapons.
>
> **BUG:** Crit Modifier input has `min="1"` in the HTML, but this is an additive bonus
> to crit chance (not a multiplier). Unarmed defaults to 0, and 0 is valid. The min
> should be 0 (or allow negatives for weapons that penalize crit). This has already caused
> problems when trying to set items with no crit bonus. **Must be fixed.**
>
> Damage Type is cosmetic only: drives default verb selection and examine display. No
> resistance/vulnerability system exists, so damage type doesn't modify actual damage.
>
> Range (melee/ranged/thrown) is stored but unused by any game logic. No ranged combat
> system exists. Combat only works within the same room and no code checks range.
> **Remove from the editor.** Can be re-added if ranged combat is ever designed.
>
> Damage types are hardcoded (slashing, piercing, bludgeoning, fire, ice, lightning,
> poison, holy, shadow). Same hardcoding concern as terrain/equipment slots. Low priority.

### Armor Data

Status: Good. All fields actively used.

Fields: Armor Class, Damage Resistance, Weight Class (light/medium/heavy).

> **Claude:** AC and DR are used in combat stat calculations.
>
> **Weight Class needs to be renamed and reworked to Armor Type.** Current values
> (light/medium/heavy) are too generic and display-only. Should be changed to specific
> armor types: Robe, Leather, Chainmail, Scalemail, Platemail. These types would then
> be used to enforce class restrictions (e.g., Mages can only wear Robes, Druids can
> wear Robes or Leather). The class-side allowed armor types will be configured in the
> Progression Editor (see Progression_Editor.md).

### Container Data

Status: Good. All fields actively used.

Fields: Capacity (item count), Weight Limit.

> **Claude:** Both enforced when players add items to containers. No changes needed.

### Consumable Data

Status: Has one unused field.

Fields: Effect Type (heal/mana/damage/food/drink), Effect Value, Charges (0 = single
use), Duration.

> **Claude:** Effect Type, Effect Value, and Charges are all actively used. Charges
> decrement on use and the item is deleted at 0.
>
> **Duration is NOT YET IMPLEMENTED.** It's in the function signature but never read.
> All consumable effects are instant. Keep the field in the editor with a
> "(not yet implemented)" hint. Future use: a poison flask could apply DoT over the
> duration, a regeneration flask could apply HoT. See TODO.md for implementation task.

### Light Source Data

Status: Mostly unused scaffolding.

Fields: Light Radius, Max Fuel (0 = permanent), Fuel Rate (per minute).

> **Claude:** Max Fuel is used (distinguishes permanent vs consumable lights, checked
> on extinguish).
>
> **Rename Light Radius to Luminance.** This will be an additive value for a future
> luminance system (see TODO.md). A room has a darkness level (e.g., -200), a player
> has base vision from their race (e.g., +100 normal, +200 darkvision), and light
> sources add luminance. Total >= 0 means you can see. Example: dark cave (-200) +
> normal vision (+100) + torch (+100) = 0, can see. Keep the field in the editor
> with "(not yet implemented)" hint.
>
> **Fuel Rate is NOT YET IMPLEMENTED.** No fuel tick consumption system exists. Lights
> are simply on/off. Keep the field with "(not yet implemented)" hint. Will be needed
> when fuel consumption is wired up (see TODO.md).
>
> Max Fuel works and stays as-is.

### Tool Data

Status: Mostly good, one unused field.

Fields: Tool Type (currently only "lockpick"), Quality (1-5), Durability (1-101).

> **Claude:** Quality is actively used (added directly to lockpicking stat total in
> `calculateLockpicking()`). The current HTML input is clamped to 1-5, but the mechanics
> support any integer. **Update the input to allow negative values.** A positive quality
> makes picking easier, negative makes it harder (e.g., a crude lockpick with quality -2
> penalizes the skill check). The code already handles this: `itemBonus` is simply added
> to the total, so negatives subtract naturally. Remove the 1-5 clamp.
>
> Durability is actively used. On each pick attempt, roll 1-100. If roll > durability,
> the lockpick breaks. Durability 50 = 50% survival, 100 = 1% break chance,
> 101+ = unbreakable. The 1-101 range is correct.
>
> **Tool Type is UNUSED.** The code never checks it. All tools are assumed to be
> lockpicks. New tool types would need hardcoded handler functions (like lockpicking
> has). The dropdown only has "lockpick" as an option. Fine to keep as-is but note it's
> not checked by game logic yet.

### Key Data

Status: Good. All fields actively used.

Fields: Key Tag (text, matches door's key_item_tag), Consume On Use (checkbox),
Break Chance % (0-100).

> **Claude:** All three fields are used in the door unlock code. Note: the code field
> names are `flags.key_tag`, `flags.consumeOnUse`, and `flags.consumeChance` (stored
> in ItemFlags, not a separate key_data object).
>
> Key Tag is freeform text that must match a door's `key_item_tag` exactly. No validation
> that the tag matches any existing door. Consider autocomplete from known door key tags,
> or at minimum a hint: "Must match a door's Key Item Tag field exactly."

## Requirements Tab

Status: Needs changes. **Requirements are NOT enforced in gameplay.**

Fields: Level Required, Strength, Dexterity, Intelligence, Constitution (all numbers),
Classes (comma-separated text), Races (comma-separated text).

> **Claude:** Traced `handleWield()` and `handleWear()` in `itemCommands.ts`. Neither
> function checks any requirements before equipping. No level check, no stat check, no
> class check, no race check. A level 1 character can equip anything regardless of
> requirements. The requirements data is stored and shown on examine, but never enforced.
>
> **This needs to be wired up.** The equip/wield commands should check:
> 1. Level >= level_required
> 2. Each stat meets minimum (str, dex, int, con)
> 3. Character class is in allowed classes (or classes is empty = all)
> 4. Character race is in allowed races (or races is empty = all)
> 5. Armor type allowed by class (ties into the armor type system from Progression Editor)
>
> Added to TODO.md.
>
> For the editor itself: the stat fields are fine as number inputs. Classes and Races
> are the UX problem. Comma-separated freeform text is error-prone ("warrior" vs
> "Warrior" vs "warior"). Replace with multi-select SearchableSelect populated from
> the class/race definitions API. Prevents typos and shows valid options.
>
> Note: Wisdom and Charisma are missing from the requirements fields. If those stats
> exist on characters, they should be available as requirements too for completeness.

## Modifiers Tab

Status: Missing two stats.

Stat Modifiers: Strength, Dexterity, Constitution, Intelligence, Max Health, Max Mana
(all number inputs, positive or negative).

Combat Modifiers: Stealth (number, can be negative).

> **Claude:** All modifiers are actively enforced. Stat modifiers are applied to effective
> stats in `combatStatProvider.ts` (DEX, INT, STR, CHA all use equipment modifiers in
> combat calculations). Stealth modifier is summed from all equipped items in
> `secondaryStats.ts`.
>
> **BUG: Wisdom and Charisma are missing from the editor.** The `StatModifiers` interface
> in `shared/items.ts` defines all 8 fields (str, dex, con, int, wis, cha, max_health,
> max_mana) and CHA is already used in combat calculations (`effectiveCha` at
> `combatStatProvider.ts:92`). The editor only shows 6. **Add Wisdom and Charisma fields.**
>
> Stealth is the only combat modifier currently. **Add Magic Resistance** as a new
> combat modifier. Items like wards, amulets, or enchanted armor should be able to
> boost magic resistance. This ties into the Magic Resistance system (see TODO.md)
> where magic resistance reduces spell damage and can outright resist debuffs/buffs.
> Also add to the `StatModifiers` interface in shared types.

## Flags Tab

Status: Has two issues.

Grid of 7 checkboxes: Takeable (default checked), Hidden, No Drop, Stackable, Cursed,
Two-Handed, Throwable. Laid out in a CSS grid with auto-fill columns.

> **Claude:** Verified each flag against game logic:
>
> - **Takeable**: Used. Prevents pickup when false.
> - **Hidden**: Used. Items hidden from room listing unless revealed via search.
> - **No Drop**: Used. Prevents dropping, selling to merchants, dropping on death.
> - **Cursed**: Used. Prevents unequipping (checked in wield, wear, remove).
> - **Two-Handed**: Used. Blocks off-hand/shield slots, prevents backstab.
>> - **Stackable**: Used. The `findStackableInstance()` query in `itemRepository.ts`
>   checks this flag to decide whether to merge items into a single stack (showing
>   "iron ore (2)") or create separate instances. Non-stackable items show individually
>   (e.g., two statues show as "statue, statue" not "statue (2)"). Max stack is being
>   removed (see Basic tab) — stackable items will stack without a cap, limited only
>   by weight/encumbrance.
> - **Throwable**: **UNUSED.** No throw command exists in the game. Keep as placeholder
>   or remove. If kept, mark as "(not yet implemented)".
>
> Grid layout is clean. Hint text in parentheses works well.

## Preview Panel

Status: Good

Shows formatted item preview: name, descriptions, weight, denomination-formatted value,
rarity, type-specific stats (weapon damage/speed, armor AC/DR, etc.), stat modifiers,
flags. Updates as form changes.

> **Claude:** The preview is well done. It shows the item as a player would roughly see
> it when examining. The denomination formatting for value (converting copper to
> gold/silver/copper display) is a nice touch.
>
> One improvement: the preview doesn't show what stat bonuses look like when equipped.
> A "When equipped:" section showing the total modifier impact would help with balance
> decisions. Minor, could be deferred.

## Spawn Panel

Status: Needs a small change.

Room ID input and Quantity input with a Spawn button. Disabled until an item is selected.

> **Claude:** Room ID is a raw number input. The developer has to know the room ID.
> Should use SearchableSelect to pick a room by name. Same component being built for
> Room Editor exits.

## Creation Flow

Status: Needs improvement.

"+ New Item" button calls `prompt()` for the item name. Creates with defaults.

> **Claude:** Same `prompt()` issue as Room Editor. Replace with an inline form or modal
> that allows setting name + type upfront, since item type is the most important
> decision and drives which fields appear. Creating as default type then switching is
> an extra step.

## Duplicate

Status: Good

Prompts for new name, copies all form data to a new item. Useful for creating variants
(e.g., "iron sword" -> "steel sword").

> **Claude:** Works well. The prompt for name is acceptable here since you're just
> renaming a copy. Could still be an inline field but lower priority than the creation
> flow.

## Missing Features

> **Claude:** Items identified during audit:
>
> - `[PROPOSED]` Reverse lookup: show which drop tables contain this item and which
>   merchants sell it. Helps developers understand item distribution.
> - `[PROPOSED]` Unsaved changes warning. Currently nothing prevents clicking another
>   item and losing edits.
> - `[PROPOSED]` Key tag autocomplete from known door key tags (see Key Data section).
> - `[PROPOSED]` Inline denomination display next to Base Value input.
>
> **Deferred:**
> - `[DEFERRED]` Item set bonuses (needs set mechanic design first)
> - `[DEFERRED]` Enchantment/affix system (future feature)
> - `[DEFERRED]` Item inheritance/templates

## Help Section

> **Claude:** Like Room Editor, the Item Editor links to help via a `?` in the nav bar.
> The help documentation should cover:
> - What each description field is used for (short vs long vs room)
> - How keywords affect player commands (get, drop, look, etc.)
> - How equipment slots work and what each slot means
> - How weapon attack speed and damage interact with combat
> - How rarity and max-in-world work together
> - How consumable charges work (0 = single use)
> - How key tags connect to doors
> - How stat modifiers and requirements affect who can use the item
> - What each flag does in gameplay
>
> Same help discoverability improvements as Room Editor apply: make the help link
> more visible, open in new tab, consider inline `(?)` icons for complex fields.
