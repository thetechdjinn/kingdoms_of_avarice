# TODOs

This file will contain a list of TODOs for the project. Primarily a reminder of things that need
fixing, improving, or adding new features to the project.

## Locks, Keys and Lockpicking

- @notes/Locks_Keys_and_Lockpicking.md

## Mobs and NPCs

- @notes/Mob_and_NPC_Requirements.md

## Fix You Notice Sneaking Text Color

- When a character is noticed sneaking into the room. The You notice is darker green than the
  "sneaking into the room" text. This needs to be fixed. The persons name should remain red.

## Design the Spell that Unlocks a Lock

- Lockpicking is now designed, but I don't yet have a direct translation to a spell that can unlock a lock.
- The harder the lock, the higher the change the spell should fail.

## Cache Class/Race Dodge Bonuses in `combatStatProvider.ts`

- `getCombatStatsWithDodge()` makes DB calls to `progressionRepo.getCharacterProgression()`, `progressionRepo.getClassById()`, and `characterRepo.findCharacterById()` every time a defender is hit during combat.
- These values (class dodge bonus, race dodge bonus) rarely change and should be cached on the socket/character object at login or level-up, not fetched per-hit.
- This is the only remaining DB read during active combat rounds. Caching it would make combat fully in-memory.

## Fix Player Offensive Spells Not Applying Status Effects

- Player offensive spells don't pass `statusEffect` or `effectDuration` into the
  `activeSpell` combat state object (`spellCommands.ts:162-170`). The activeSpell only
  stores damage fields.
- NPC offensive spells correctly apply status effects after damage (`combat.ts:880`),
  but `processSpellCombat()` (player path) has no equivalent code.
- A fireball + burning DoT works for NPCs but not players.
- Fix: add statusEffect/effectDuration to the activeSpell interface and add effect
  application logic in `processSpellCombat()` after damage is dealt.

## Fix Telegraph Messages for Player Spell Casting

- Telegraph messages only work for NPC spell casting (`combat.ts:729`). Player casting in
  `spellCommands.ts` never reads `telegraphMessage`. Setting a telegraph on a player spell
  does nothing.
- Wire up telegraph for player casting: broadcast the message to the room before the spell
  resolves, replacing `{name}` with the caster's name.

## Fix NPC Between-Round Spells + Melee in Same Round

- When NPC spell AI selects a between-round spell (heal/buff/debuff), the NPC casts it AND
  gets full deferred melee attacks in the same round (combat.ts:1337-1339).
- In-round offensive spells correctly replace melee (line 1342), but between-round spells
  don't. An NPC casting a heal and getting full melee is too strong.
- Fix options: between-round spells should either skip melee for that round entirely, or
  reduce attacks per round (e.g., half swings). Needs game design decision on which approach.

## Rework Spell Damage/Healing System

- **Replace dice notation with min/max ranges:** Remove `damageDice` and `healingDice`
  (e.g., "1d6+2") fields. Replace with `minDamage`/`maxDamage` and `minHealing`/`maxHealing`
  number fields. Combat rolls randomly between min and max.
- **Replace stat-based scaling with level-based scaling:** Remove `damageScalingStat`,
  `damageScalingFactor`, `healingScalingStat`, `healingScalingFactor`. Add universal fields:
  `scalingPerLevel` (% bonus per caster level) and `maxScaling` (% cap).
- Formula: `bonusPercent = min(level * scalingPerLevel, maxScaling)`, applied to both min
  and max values. Example: Magic Missile min 3, max 6, 10%/level, cap 50%: at level 5+
  becomes 4-9 damage.
- Applies to ALL spell types (damage and healing) — one set of scaling fields per spell.
- Requires changes to: spell template schema, spell editor, `processSpellCombat()` (player),
  `processNpcSpellCombat()` (NPC), `handleHealingSpell()`, `handleOffensiveSpell()`.
- Previously discussed and agreed upon.

## Spell Difficulty / Fizzle System

- Spells currently always succeed when cast. Need a casting difficulty check.
- Each spell has a **Cast Difficulty** value. The caster has a **Spellcasting Ability** stat
  (derived from intelligence, class, level, possibly items).
- If the spellcasting check fails, the spell fizzles (mana still consumed, no effect).
- Need fizzle messages in the editor (e.g., "Your spell fizzles!" or custom per-spell).
- Higher level spells are harder to cast; casters improve with level.

## Magic Resistance System

- New derived stat: **Magic Resistance** — reduces spell effects on the target.
- Calculated primarily from **Wisdom**, with some contribution from **Constitution**, plus
  item bonuses (new `magic_resistance` modifier on items).
- **Effect on damage/healing spells:** Does NOT outright resist direct damage or healing, but
  can reduce the amount. Works like armor's damage resistance but for magic. Example: 20
  damage spell hits a target with high magic resistance, they take only 14.
- **Effect on debuffs/buffs:** Can outright resist (negate) debuffs and unwanted buffs.
  Example: a Witch Hunter with high magic resistance may completely resist a poison debuff.
  This is where the existing `saveStat`/`saveDifficulty` fields could be wired up.
- **Class flavor:** Anti-magic classes (Witch Hunter, etc.) would have high innate magic
  resistance or class bonuses to it.
- **Item support:** Add `magic_resistance` to the stat modifiers on items (both Item Editor
  Modifiers tab and the StatModifiers interface). Magic items like wards, amulets, or
  enchanted armor could boost magic resistance.
- Ties into: spell editor (cast difficulty field), item editor (magic_resistance modifier),
  progression editor (class/race magic resistance bonuses), combat calculations.

## Multi-Hit Spells (Hits Per Cast)

- Currently all spells hit exactly once per combat round. Need a new field on spell templates
  for spells that hit multiple times per cast (e.g., Meteor Swarm = 4 hits).
- New field: `hitsPerCast` (number, default 1). Each hit rolls damage independently.
- Not based on melee energy — fixed number of hits per round.
- Requires changes to `processSpellCombat()` (player) and `processNpcSpellCombat()` (NPC)
  to loop over hits.

## Armor/Weapon Weight Penalties

- There is a general encumbrance system based on total inventory weight vs strength, but no
  per-item penalties based on armor type or weapon weight.
- Heavy armor (chainmail, scalemail, platemail) should apply penalties to: movement speed,
  defense (dodge), and stealth. A mage in plate should be much slower and easier to hit than
  one in robes.
- Weapons that are too heavy for the wielder (based on strength requirement vs actual strength)
  should apply a negative accuracy modifier. A weak character wielding a greataxe should miss
  more often.
- These penalties would work alongside the existing encumbrance system, not replace it.
- Ties into the armor type system (Robe/Leather/Chainmail/Scalemail/Platemail) being added
  to the Item and Progression editors.

## Allow "wear" Command to Work for Weapons

- Currently `handleWear()` rejects weapons with "Use 'wield' for weapons." Players shouldn't
  need to remember which command to use. `wear sword` should work the same as `wield sword`.
- Fix: if the item is a weapon, delegate to `handleWield()` instead of rejecting.

## Enforce Item Requirements on Equip/Wield

- `handleWield()` and `handleWear()` in `itemCommands.ts` do not check any item requirements
  before equipping. Requirements are stored and displayed on examine but never enforced.
- A level 1 character can equip any item regardless of level, stat, class, or race restrictions.
- Need to add checks for: level_required, stat minimums (str, dex, int, con, wis, cha),
  allowed classes, allowed races, and armor type by class (once that system is built).
- Should show a clear error message on failure (e.g., "You need level 10 to wield this",
  "Only warriors can wear this").

## Implement Luminance / Darkness System

- Additive luminance system: room darkness + player vision + light sources >= 0 means visible.
- **Rooms**: new "Darkness Level" field (0 = normal, -100 = dim, -200 = dark, -300 = pitch
  black, -500 = magical darkness).
- **Races**: new "Base Vision" field (+100 normal, +150 low-light, +200 darkvision, etc.).
- **Light source items**: rename "Light Radius" to "Luminance" (e.g., candle +50, torch +100,
  lantern +150, magical orb +300).
- **Spells**: "Light" spell adds luminance, "Darkness" spell reduces room value.
- **Status effects**: "Blinded" could set player vision to 0.
- **Fuel consumption**: wire up Fuel Rate so torches/lanterns burn fuel over time and
  extinguish when empty. Max Fuel already works (on/off state), needs tick-based drain.
- Editor fields for darkness level (rooms), base vision (races), and luminance (items) are
  being added as "(not yet implemented)" during the editor rewrite.

## Implement Consumable Duration (DoT/HoT from Items)

- The `duration` field on consumable items exists in the data model and editor but is never
  read by `applyConsumableEffect()` in `itemCommands.ts`. All consumable effects are instant.
- Wire up duration so consumables can apply effects over time:
  - Poison flask: deals damage over duration (DoT)
  - Regeneration flask: heals over duration (HoT)
  - Buff potion: applies stat modifier for duration
- Could leverage the existing status effect system (apply a status effect with the item's
  duration) rather than building a separate timer.

## Make Terrain Types Dynamic

- Terrain types are hardcoded in two disconnected places: `commandQueue.json` (server, defines
  multipliers) and `editor.html` (client, hardcoded `<option>` elements with speed text).
- Adding a new terrain requires editing both files and hoping they match.
- Should be configurable: either a DB table or an API endpoint that serves the terrain config.
- Room Editor dropdown should fetch terrain types from the server so they stay in sync.

## Refactor: Move `getPlayerLocation` out of `adminCommands.ts`

- `getPlayerLocation` and `setPlayerLocation` are imported from `adminCommands.ts` by 20+ modules (combat, stealth, social, save loop, etc.). This makes `adminCommands` a dependency hub and creates a fragile circular import risk.
- Move these functions to a dedicated low-level module (e.g. `playerState.ts` or `world.ts`) and update all imports.
- Affected imports: `combatCommands`, `trainingCommands`, `groupManager`, `combatMessaging`, `tickProcessor`, `combatEntity`, `droppedStateManager`, `commands`, `spellCommands`, `merchantCommands`, `playerUtils`, `itemCommands`, `npcBehavior`, `stealthState`, `socket`, `characterSaveLoop`, `socialCommands`, `statusEffects`, `stealthCommands`, `actionCommands`, `bankCommands`.
