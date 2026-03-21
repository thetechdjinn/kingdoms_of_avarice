# NPC Editor

This is the design document for the rewrite of the NPC Editor. The most complex editor
in the project with 8 tabs.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Layout

Three-panel: NPC list (left, ~270px), 8-tab form (center, max-width 800px), preview +
spawn panel (right, 300px). Preview hides at 900px, shrinks to 250px at 1200px.

## NPC List Panel

Status: Needs improvement.

Shows NPC name, level, hostile status, ID. Search filters by name or ID.

> **Claude:** Only has name/ID search. No filters for level range, hostile/passive,
> merchant/non-merchant. Add filter dropdowns as NPC count grows. Fine for now but
> will need it eventually.

## Preview Panel

Status: Good. Keep and enhance.

Shows live balance metrics that update as form values change. Also has a spawn button
to test the NPC in-game.

### Balance Metrics (Current)

- **Effective HP**: `maxHealth / (1 - damageReduction/100)` — shows true survivability
  accounting for DR. Shows infinity if DR >= 100.
- **Per-Attack DPS**: `(minDmg + maxDmg)/2 * attacksPerRound * (percentage/100)` — for
  each attack in the attacks list.
- **Total DPS**: Sum of all attack DPS values.
- **Spell Count**: Number of spells configured.

> **Claude:** The balance preview is one of the best features across all editors. It
> gives immediate feedback on whether an NPC is over/under-tuned without needing to
> spawn and test in-game. Keep it.
>
> **Proposed enhancements:**
> - `[PROPOSED]` Show estimated time-to-kill (how long a typical player at the NPC's
>   level would take to kill it, based on effective HP vs expected player DPS).
> - `[PROPOSED]` Show XP/minute efficiency (XP reward / estimated kill time) to help
>   balance grinding.
> - `[PROPOSED]` Show spell DPS alongside melee DPS (currently only counts attacks,
>   not spell damage).
> - `[PROPOSED]` Show a threat level indicator (e.g., "Easy / Normal / Hard / Boss")
>   based on combined stats.
>
> These are nice-to-haves, not blockers. The current metrics are already useful.

### Spawn Controls

Status: Good.

Room ID input and Spawn button to create an instance in-game for testing.

> **Claude:** Room ID should use SearchableSelect (same as Spawn Room on Basic tab).
> Otherwise works well — quick way to test an NPC without leaving the editor.

---

## Tab 1: Basic

### Enabled (NEW FIELD)

Status: **New field needed.**

> **Claude:** Add an Enabled checkbox (default checked) at the top of the Basic tab.
> When disabled, the NPC template is preserved but does not spawn. Useful for:
> - Drafting NPCs before they're ready for the game
> - Temporarily removing an NPC without deleting the configuration
> - Seasonal or event NPCs that get toggled on/off
>
> The spawn system (`initializeNpcWorld`, `spawnNpcFromTemplate`) should skip templates
> where enabled = false. Disabled NPCs should appear visually distinct in the list
> panel (grayed out or with a "disabled" badge), same pattern the Quest Editor uses
> for its enabled flag.

### Name

Status: Good

Text input, required. Lowercase for common mobs ("serpentine warrior"), capitalized
for named NPCs ("Goran"). The case of the name is how it displays in-game.

### Level

Status: Good. Number, min 1, default 1.

> **Claude:** Drives XP distribution (level-weighted split), essence gating, and level
> gap checks (only players within +/-5 levels get rewards). Important balance field.

### Description

Status: Good. Textarea, 3 rows. Flavor/lore text.

### Spawn Room ID

Status: Needs improvement.

Number input for room ID.

> **Claude:** Raw number input. Developer must know room IDs. Replace with
> SearchableSelect showing room name + ID, same component as other editors.

### Respawn Time

Status: Good. Number in seconds, 0 or empty = no respawn.

> **Claude:** Could use hint text with common values: "e.g., 300 = 5 minutes,
> 3600 = 1 hour, 0 = no respawn"

### Max Active

Status: Good but not enforced.

Number, min 1, default 1. Maximum concurrent instances.

> **Claude:** This value is stored but the spawn system doesn't currently enforce it.
> The editor should still have the field for when enforcement is implemented. Add
> hint: "(not yet enforced — planned feature)"

### Hostile

Status: Good. Checkbox, default checked.

> **Claude:** Controls whether the NPC aggros on players entering the room. Checked
> in `checkHostileAggro()`. Unchecking creates a passive NPC (merchant, quest giver,
> etc.). Well understood, no changes needed.

### Proper Name

Status: Good. Checkbox, default unchecked.

> **Claude:** Heavily used throughout combat and messaging (30+ references in
> combat.ts alone). Controls article handling:
> - Unchecked (common noun): "The serpentine warrior attacks you!"
> - Checked (proper noun): "Goran attacks you!"
>
> Affects subject ("The X" vs "X"), object ("the X" vs "X"), possessive ("The X's" vs
> "X's"), and room listings ("A serpentine warrior" vs "Goran").
>
> The name field controls the case (lowercase vs capitalized). This checkbox controls
> whether articles (a/an/the) are prepended. Both are needed. No changes.

---

## Tab 2: Combat

### Max Health

Status: Good. Number, min 1, default 100.

> **Claude:** Used as initial HP on spawn and for regen calculations. No changes needed.

### Max Mana

Status: Good. Number, min 0, default 0.

> **Claude:** Required for NPC spell casting. 0 = NPC cannot cast spells (even if spells
> are assigned). No changes needed.

### Spell Power

Status: Good, needs tooltip explanation.

Number, min 0, default 0.

> **Claude:** This is the NPC's universal casting stat. Since NPCs don't have individual
> stats like INT or WIS, Spell Power is a single value that drives both damage and
> healing spell scaling. The formula is:
> `scalingBonus = floor(spellPower * spell.scalingFactor)`
>
> Add a tooltip/mouseover explaining this with examples:
> "NPC casting ability. Multiplied by the spell's scaling factor to calculate bonus
> damage or healing. Example: a spell with 50% scaling factor on an NPC with Spell
> Power 20 adds +10 bonus damage. Same spell on an NPC with Spell Power 50 adds +25
> bonus damage. Set to 0 for NPCs that only use fixed-damage spells (no scaling)."
>
> **Note:** Once the spell system switches to level-based scaling (see Spell Editor),
> this field may become redundant since NPC level would drive scaling instead. For now,
> keep it and document it clearly.

### Base Accuracy

Status: Good, needs detailed tooltip. Number, min 0, default 50.

> **Claude:** For NPCs, this is the primary accuracy knob. NPCs don't have DEX/INT/CHA
> stats, so Base Accuracy is the main contributor to hit chance (level also adds +2 per
> level). It's compared against the defender's total defense using the formula:
> `missChance = defense² / (accuracy² + defense²)`, clamped to 5%-95%.
>
> Add tooltip with practical examples:
> "How often this NPC hits its target. Combined with level bonus (+2 per level).
> Compared against defender's defense to determine miss chance.
> Examples (NPC total accuracy vs player total defense):
> - 50 vs 50: hits ~50% of the time (even match)
> - 75 vs 50: hits ~69% (NPC favored)
> - 100 vs 50: hits ~80% (NPC strongly favored)
> - 50 vs 75: hits ~31% (player favored)
> A level 5 NPC with Base Accuracy 50 has roughly 60 total accuracy (50 + 5*2)."

### Base Defense

Status: Good, needs detailed tooltip. Number, min 0, default 50.

> **Claude:** Same formula as accuracy but from the defender's perspective. When this
> NPC is attacked, its Base Defense is the primary contributor to its ability to avoid
> hits (level also adds +2 per level on the defense side).
>
> Add tooltip with practical examples:
> "How well this NPC avoids being hit. Combined with level bonus (+2 per level).
> Compared against attacker's accuracy to determine miss chance.
> Examples (player total accuracy vs NPC total defense):
> - 50 vs 50: player misses ~50% (even match)
> - 50 vs 75: player misses ~69% (NPC hard to hit)
> - 50 vs 100: player misses ~80% (NPC very hard to hit)
> - 75 vs 50: player misses ~31% (NPC easy to hit)
> A tanky NPC should have 70-100+. A glass cannon should have 20-40."

### Base Crit Chance

Status: Good. Number, 0-100, default 5.

> **Claude:** Flat crit percentage added to level-based crit calculation. Add tooltip:
> "Percentage chance to critically hit. Added to level-based crit bonus."

### Base Dodge

Status: Good. Number, 0-100, default 5.

> **Claude:** Chance to completely avoid an incoming attack. Add tooltip:
> "Percentage chance to dodge an attack entirely (no damage taken)."

### Damage Reduction

Status: Good. Number, 0-100, default 0.

> **Claude:** Flat percentage applied after hit: `finalDamage = damage * (1 - DR/100)`.
> Add tooltip: "Percentage of incoming damage absorbed. 25 = takes 75% of damage.
> Capped at 99."
>
> The preview panel already shows Effective HP calculated as
> `maxHealth / (1 - DR/100)`, which is helpful for understanding the real survivability.

### Interactable

Status: Placeholder.

---

## Tab 3: Behavior

### Flee Section

#### Flee Enabled

Status: Good. Checkbox, default unchecked.

> **Claude:** When enabled, NPC attempts to flee when HP drops below threshold. Checked
> every combat round. No changes needed.

#### Flee HP Threshold

Status: Good. Number, 0-100%, default 20.

> **Claude:** Only shown when flee enabled. Add tooltip: "NPC will attempt to flee when
> HP falls below this percentage. 20 = flees at 20% HP."

#### Call for Help Chance

Status: Good. Number, 0-100%, default 0.

> **Claude:** Percentage chance to summon idle hostile NPCs from adjacent rooms when
> outnumbered (2+ players targeting this NPC). Called allies copy the caller's targets.
> Only triggers once per engagement. Add tooltip: "Chance to call nearby hostile NPCs
> for help when outnumbered. 0 = never calls. Only triggers once per fight."

### Roaming Section

#### Roam Enabled

Status: Good. Checkbox, default unchecked.

#### Roam Interval

Status: Good. Number in seconds, min 1, default 60.

> **Claude:** Time between roam checks. Add tooltip: "Seconds between movement attempts.
> 60 = checks once per minute. The NPC doesn't move every interval, just rolls against
> Roam Chance."

#### Roam Chance

Status: Good. Number, 0-100%, default 10.

> **Claude:** Percentage chance to actually move each interval. Add tooltip: "Chance to
> move each interval. 10 = 10% chance every interval. With 60s interval and 10% chance,
> NPC moves roughly once every 10 minutes on average."

### Traits

Status: **Redesign. Remove freeform text, use chip/tag input.**

Currently a comma-separated text field (e.g., "see-invisible, stealth").

> **Claude:** Same problem as Progression Editor traits. Replace with a chip/tag input:
> - A SearchableSelect dropdown populated with known NPC traits
> - Selecting a trait adds it as a chip/button with an X to remove
> - Multiple traits show as a row of chips
> - No freeform text — only valid traits can be selected
>
> **Known NPC traits:**
> - `see-invisible` — NPC can target hidden players
> - `stealth` — NPC can stealth (future)
>
> As more traits are added (magic resistance, ranged attack, etc.), they appear in the
> dropdown automatically. The trait list should come from the same configuration source
> as Progression Editor traits where applicable, plus NPC-specific traits.

### Allowed Areas

Status: **Redesign. Remove freeform text, use chip/tag input.**

Currently a comma-separated text field (e.g., "Arindale, Dark Forest"). Empty = all
areas allowed.

> **Claude:** Replace with the same chip/tag input pattern:
> - A SearchableSelect dropdown populated from the areas API (same source as Room
>   Editor area filter)
> - Selecting an area adds it as a chip/button with an X to remove
> - Multiple areas show as a row of chips
> - Empty = unrestricted (NPC can roam anywhere). Show hint: "Leave empty to allow
>   all areas"
> - No freeform text — only existing areas can be selected, preventing typos
>
> This prevents issues like typing "arindale" instead of "Arindale" and the NPC
> silently ignoring the area restriction.

---

## Tab 4: Rewards

### Experience Reward

Status: Good. Number, min 0, default 0.

> **Claude:** Total XP split among participants (level-weighted). Players more than 5
> levels away get nothing. Add tooltip: "Total XP distributed among all players who
> participated in the kill. Split proportional to each player's level. Players more
> than 5 levels above or below this NPC receive nothing."

### Essence Reward

Status: Good. Number, min 0, default 0.

> **Claude:** Each eligible player gets the FULL amount (not split). Add tooltip:
> "Essence awarded to each eligible player (not split — everyone gets the full amount).
> Subject to level gap check (+/-5 levels) and class gate if set."

### Essence Class

Status: Needs improvement.

Freeform text for class gate (e.g., "warrior"). Null = all classes.

> **Claude:** Replace with SearchableSelect populated from class definitions API. Only
> one class can be selected (or empty for all). Prevents typos.

### Gold Min / Gold Max

Status: **Remove.**

> **Claude:** These fields provide guaranteed currency drops separate from the drop
> table. The drop table already supports currency entries with drop chance, min/max
> amounts, and denomination filtering. Having two separate currency drop systems is
> redundant and confusing. Remove gold min/max from the NPC template. All currency
> drops go through the drop table.
>
> Migration note: any existing NPCs with goldMin/goldMax values will need their
> currency moved to drop table entries (100% drop chance) before removing the fields.

### Drop Table

Status: Needs improvement.

Select dropdown populated from `/api/drop-tables`, shows "Name (ID: 123)".

> **Claude:** Works but could scale poorly with many drop tables. Replace with
> SearchableSelect. Also consider showing a summary of what the drop table contains
> (e.g., "3 items, 10-50 copper") inline or in the preview panel so the developer
> doesn't have to open the Drop Table Editor to see what loot this NPC drops.

---

## Tab 5: Appearance

Status: Good. Fields are fine, layout to be addressed during design phase.

Fields: Name Augmentations (comma-separated), Enter/Exit/Spawn Room Messages (with
{name} and {direction} placeholders), Leave Corpse (checkbox), Corpse Duration (seconds).

> **Claude:** Augmentations could use the chip/tag input pattern instead of
> comma-separated text, but it's lower priority since augmentations are custom per-NPC
> (not selected from a predefined list). Layout details deferred to design phase.

---

## Tab 6: Attacks

Status: Good. Fields and dynamic row management work well. Layout deferred to design
phase.

Each attack row has: Name, Attack Type (melee/magic/ranged), Min/Max Damage, Attacks Per
Round, Percentage (weighted selection), Mana Cost, Hit/Miss Verbs (1p/3p), optional
Hit/Miss Messages.

> **Claude:** **Remove Mana Cost from attacks.** The field is wired up (combat.ts
> deducts mana if > 0) but it's confusing having mana on melee attacks. Mana-costing
> abilities should go through the Spells tab, which already handles mana checks,
> scaling, and spell AI conditions. If a "dragon breath" special attack is needed,
> it should be a spell (offensive type) with custom hit messages, not a melee attack
> with a mana cost bolted on.

> **Claude:** Attack Type (melee/magic/ranged) is stored but never checked in game logic.
> NPCs always use the same melee resolution regardless of type. It's flavor only. Keep
> for now but note it's not functional.
>
> The percentage field across all attacks should ideally sum to 100% or less. Consider
> adding a validation warning showing the total with a note if it exceeds 100%.
>
---

## Tab 7: Spells

Status: Good. One scaling issue.

Each spell row has: Spell (select dropdown), Priority (0-100), Cast Chance (1-100%),
Condition Type (always, hp_below, hp_above, target_hp_below, mana_above, no_effect,
has_allies, combat_start), Condition Value, Cooldown Rounds.

> **Claude:** These fields control the NPC spell AI — when and how often to cast, not
> what the spell does. Spell behavior (damage, hits per cast, scaling, messages) is
> defined on the spell template in the Spell Editor.
>
> **Spell dropdown is a scaling issue.** Each spell row renders ALL spells as `<option>`
> elements. With 5 NPC spells and 200 game spells, that's 1000 option elements.
> Replace with SearchableSelect.
>
> The condition system is well designed. The 8 condition types cover common AI patterns
> (heal when low HP, buff at combat start, debuff when target is weak, etc.). No
> changes needed to the conditions.
>
> Hits per cast does NOT need to be on this tab — it's an intrinsic property of the
> spell template (Meteor Swarm always hits 4 times regardless of which NPC casts it).
> Already documented in the Spell Editor.

---

## Tab 8: Merchant

### Merchant Enabled

Status: Good. Checkbox that reveals the merchant section when checked.

> **Claude:** Lazy-loads inventory and responses data only when enabled. Good pattern.
> Merchants skip gold/loot drops on death (inventory persists through respawn).

### Primary Faction

Status: Good. Select dropdown populated from `/api/factions`.

> **Claude:** Could scale with many factions. Replace with SearchableSelect. The faction
> determines the base reputation used in pricing calculations.

### Merchant Inventory

Status: Needs improvement.

Item select dropdown populated from ALL item templates, sorted alphabetically. Shows
name + base value. Add button creates inventory entry. Table with editable fields:
max stock, current stock, restock chance %, base value (read-only).

> **Claude:** The item dropdown renders ALL templates — critical scaling issue with 500+
> items. Replace with SearchableSelect, ideally with type filter (weapons, armor,
> consumables, etc.) so you can narrow down before searching by name.
>
> The inline table editing saves immediately to API on field blur. This should be
> batched with the main Save button instead (see earlier note about merchant inventory
> saving separately from the main form).

### Price Calculator

Status: Good functionality, needs better explanation that these are test inputs.

Test inputs: Base Value, Faction Rep, Charisma, Haggle Rep. Calculate button shows
buy/sell prices or REFUSED.

> **Claude:** This is a **testing/simulation tool**, not merchant configuration. All
> four inputs represent hypothetical player values — the developer plugs in "what if
> a player with these stats buys from this merchant?" and sees the resulting prices.
> None of these values are stored on the merchant.
>
> The section header should make this clear: "Price Simulator — test prices with
> different player stats" or similar. Each field should be labeled as a player value:
>
> **Test Base Value** (copper):
> "Item's base value in copper to test against. Use an item's actual base value."
>
> **Test Faction Rep** (any number):
> "Simulated player reputation with this merchant's faction. Players earn faction rep
> through quests and actions. Positive = discount (1% per 10 rep, max 10%). Negative =
> surcharge (2% per 10 rep, max 10%). At -50 or worse = merchant refuses."
>
> **Test Charisma** (1-100):
> "Simulated player CHA stat. Adjusts effective rep: every 10 CHA above 50 adds +1,
> every 10 below subtracts -1. CHA 50 = no effect."
>
> **Test Haggle Rep** (0-10):
> "Simulated haggle attempts. Players gain haggle rep by using the haggle command
> (decays 1 point per 5 minutes). 0 = no effect. 1-3 = slight discount. 4 = prices
> reset to base. 5-9 = prices get worse. 10 = merchant refuses."
>
> **Results:** Buy price starts at base value. Sell price starts at 50% of base value.
> Both modified by the same formula.

### Merchant Responses

Status: Good

Keywords input (comma-separated) and response text. Table showing all responses with
delete buttons.

> **Claude:** Simple and functional. The keyword matching system works well for merchant
> dialogue. No changes needed to functionality. Keywords could use the chip/tag input
> pattern instead of comma-separated text.

> **BUG: NPCs can cast between-round spells AND do full melee in the same round.**
> When the spell AI selects a healing/buff/debuff spell (between-round timing), the NPC
> casts it and then gets deferred melee at end of round (combat.ts:1337-1339). In-round
> offensive spells correctly replace melee (line 1342). But between-round spells should
> either replace melee for that round OR the melee should be reduced (e.g., half attacks
> per round). An NPC casting a heal and getting full melee swings in the same round is
> too strong. Added to TODO.md.

Checkbox, default unchecked.

> **Claude:** This field is stored but not used in any game logic. Reserved for future
> NPC dialogue/interaction system. Keep with "(not yet implemented)" hint.
