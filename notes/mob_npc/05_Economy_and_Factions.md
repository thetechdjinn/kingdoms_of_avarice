# Economy and Factions

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## Factions

- Alignments are replaced with Factions.
- There can be many factions within the world.
- NPCs and Mobs can be members of multiple factions (many-to-many relationship).
  - Example: A city guard belongs to both the city faction and the guards faction.
- Factions have a name, description, and type:
  - City factions (cities, kingdoms, etc)
  - Tribal factions (tribes, clans, etc.)
  - Merchant factions (armor merchants, weapon merchants, etc.)
  - Guild factions (blacksmiths, tailors, thieves)
- Players have a numeric faction reputation per faction. Positive or negative, with 0 being neutral.
- Players begin with default faction reputations (configurable by starting location, race, or class in the future).
- Each NPC/mob is configured with a **single primary faction** used for interaction checks. To start, we keep this simple — one faction drives the NPC's behavior toward the player. Multi-faction checks may be added later.

### Faction Data Model

- `factions` table: id, name, description, type
- `npc_factions` table: npc_template_id, faction_id (many-to-many)
- `player_faction_reputation` table: character_id, faction_id, reputation (integer)
- Each NPC template has a `primary_faction_id` that determines which faction reputation is checked during interactions.

### Reputation Ranges

- 0 is neutral — no effect on pricing or behavior.
- Merchants may require a minimum reputation to sell certain items. Powerful weapons may require high reputation; common items can be sold at neutral or even negative reputation (with a price surcharge).
- Negative reputation triggers escalating consequences (price increases, refusal to sell, refusal to talk, hostility).

### Cross-Faction Effects (Deferred)

Cross-faction reputation effects (e.g., positive reputation with Silvermere causing negative reputation with rival Avindale) will not be implemented at this time. The schema should support a future `faction_relationships` table.

## Merchant Discounts

All prices are initially offered at MSRP. Discounts are calculated from faction reputation and charisma.

### Reputation Modifier

- Charisma midpoint is **50** (neutral — neither ugly nor beautiful). Races like orcs have lower typical charisma but still have a beauty scale relative to their charisma score.
- Each 10 points of charisma above 50 = +1 reputation modifier.
- Each 10 points of charisma below 50 = -1 reputation modifier.
- **Total Reputation** = Faction Reputation + Charisma Reputation Modifier
- For each positive 10 points of total reputation above zero → 1% discount (max 10%).
- For each negative 10 points of total reputation below zero → 2% surcharge above MSRP (max 10%).
- If the calculated price exceeds 10% above MSRP, the merchant will not sell to the player.

### Haggle Reputation

Haggling uses a separate per-player-per-merchant reputation scale (1-10) with cooldown:

- Each haggle attempt adds 1 point to haggle reputation.
- A player with good faction reputation and charisma receives a better discount when haggling.
- At haggle rep 4: price returns to base MSRP (or MSRP + negative reputation modifier).
- At haggle rep 5+: 2% added to price per point above 4.
- At haggle rep 10: merchant refuses to sell until reputation improves.
- Haggle reputation cools down 1 point every 5 minutes. **Cooldown ticks while offline** — logging out and returning the next day will have completed the cooldown.
- With negative faction reputation, haggling does not work. Each haggle attempt with negative rep stacks an additional +2% surcharge until the merchant refuses to sell and asks the player to leave.

## Loot and Drops

- Mobs and NPCs can drop items.
- Drop tables are **per-template** and assigned to a mob/NPC template.
- Each drop table entry has:
  - An item template with its drop percentage.
  - A currency drop percentage.
  - A currency drop amount range in copper (e.g., 50-250).
  - Flaggable acceptable currency denominations (e.g., only drop silver and copper, no gold).
- Example: A roll of 245 copper can be displayed as 2 gold, 4 silver, 5 copper. If gold is disabled, it becomes 24 silver, 5 copper.
- Loot drops to the room floor. All players are eligible to pick it up.
- Loot dropping does not display a message to the room. Players must `look` to see dropped items.
- Quest items are **not dropped** — they are assigned directly to the completing player's inventory via event emission. Quest items are **no-drop** (cannot be dropped, sold, or given away).

## Currency System

- Currency denominations are defined within the game (copper, silver, gold, platinum, etc.).
- All values break down to a single integer stored as copper — this is the player's total wealth.
- The existing single `currency` integer on characters already represents copper. No schema migration is needed.
- When dropping currency, the random value is calculated in copper, then converted to the appropriate denominations for display based on the mob's allowed denomination flags.
