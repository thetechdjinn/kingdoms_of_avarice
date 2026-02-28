# Merchants Planning

## Core Design

We will add merchants to the game. Originally I planned to make merchants a part of rooms, but I believe they now should be part of the mob / npc system.

**Reasoning:**

- While we could make merchants a part of rooms, it would be more flexible to make them a part of the mob / npc system.
- If the merchant is killed by a player, it should prevent people from buying items from the merchant until the merchant is respawned.
- If we want a specific room to be a shop, we just pin the merchant to that room. (no roaming)
- If we want a merchant to be roaming, we can just make the merchant roam around a specific area or areas using existing roaming code.
- We can make a trainer also capable of being a merchant. (sell scrolls, thieves tools etc.)
- Roaming merchants can also be part of quests and also provide essence since they could be hard to find given their mobile nature.

### Merchant Template

Merchants will have a merchant template that will function similar to the npc / mob template.

There should be a merchant_enabled boolean that will determine if the merchant is enabled.

### Merchant Inventory

Merchants will have a merchant inventory that will function similar to the npc / mob drop table.

- It will be a list of items that the merchant can sell to players
- The amount of items in inventory will be determined by the item and its rarity.
- Some items may have a maximum quantity that can exist.
- Items actual set value is determined at creation, but can be sold for more or less based on faction / reputation and charisma.
- The only mark up or mark down on items is based on the merchant's faction reputation and charisma. At neutral reputation, the merchant will sell items at their set value.
- Merchants will have a maximum inventory of an item.
  - This inventory cannot exceed the maximum quantity of the item in the world.
- Restocking happens at the top of each hour for all merchants.
- Common items restock automatically up to their max stock.
- Non-common items (uncommon, rare, limited, unique) require a percentage roll (1-100) to restock. The roll chance is set per item in the merchant inventory table.
  - An uncommon item might have a 20% chance to restock each hour.
  - A rare or limited item could be as low as 1%.
- Quest items can appear in a merchant inventory, but this will be uncommon. When they do, they will typically be common items used for quests (e.g., crafting materials in the future). Most quest items will not appear in merchant inventories.
- Items will have a maximum quantity that can be in stock.
- A merchant may refuse to sell a rare item to a player with a negative reputation with their faction.
- A merchant may refuse to sell a limited item to a player without a positive reputation with their faction. (ie, won't sell to a neutral or negative reputation player)
- Merchant inventories are persistent in the database.

### Merchant Reputation

A merchant's faction will be what faction is used to determine price based on the player's reputation with the merchant's faction.

- Merchants can refuse to sell to players with negative reputation with their faction or if the player haggles too much.

### Merchants Can Buy Items

Merchants can also buy items from players.

- Merchants can buy items, but if the item isn't part of their inventory table, they will not sell it.
- If a limited item is sold to a merchant, its quantity existing in the realm will be reduced by 1 allowing another one to be sold / found by another player.
- When a merchant purchases an item, they pay half of the item's set value with adjustments to the price based on the player's reputation and charisma with the merchant's faction.
- If the merchant purchases an item:
  - The item will be added to their inventory only if they stock that item.
  - If the item is not something they stock, it will be destroyed. (so it can respawn / restock where it is normally sold / found)

### Item Value Testing

- The editor should have tools to test the value of items based on reputation and charisma for both buying and selling.

### Identifying Merchants

- Merchants may be in a shop and that should naturally identify them.
- If you look at a merchant, it should identify them as a merchant by saying Merchant in front of their name.
- Their name specifically as shown in rooms should not specify they are merchants.
- If the player isn't sure, they can use look, or list to see if the merchant is a merchant.

### Merchant Combat and Respawning

If a merchant is attacked, the merchant will attempt to defend itself and will not be able to sell items until it is respawned.

- Merchants will have a respawn timer similar to mobs.
- Merchants will have a combat timer similar to mobs.
- Merchants will not sell items while in combat.
- If a merchant is attacked, but not killed. The merchant will be hostile to the player for a period of time set by the merchant template.
- If a merchant is killed, the respawn time is set by the merchant template.
- Merchants by default will leave a corpse when killed. That corpse will remain until the merchant is respawned.
  - If this is not yet implemented, we can implement it for mobs / npcs as a part of this feature.
- When a merchant is respawned, their inventory will be as it was when it was killed.

### Merchant Currency

- While merchants can buy and sell items, they do not have currency.
- They cannot be robbed and do not drop currency on death unless it's part of their drop table.
- Currency accepted by merchants for items sold does not go into an inventory as merchants do not have currency.
- Currency paid to sellers of items to the merchant is spawned in the exact amount on the player when the transaction is completed.
  - That currency should be stacked with any existing currency the player has.

#### Merchant Drops vs Inventory

- Merchants do not drop inventory items when killed.
- Merchants can have drop tables like mobs and npcs, but this should default to disabled as a best practice. It can be enabled on a per merchant basis if needed.

### Merchants AI

As configured for mobs / NPCs, merchants can utilize AI in a basic form to talk about things with the players. This can be enabled or disabled by the merchant template.

#### Merchant AI Guardrails

Merchants should have guardrails to limit their actions and discussions to things that are relevant to the player.

- Merchants should not attack players unless they are attacked by the player.
- Merchants should not use support spells unless they are in combat or need to heal themselves.
- Merchants should not use combat spells unless they are in combat.
  - Add creating spells for mobs / npcs as its own project to develop in phases.
- While merchants can use AI to chat with players, their haggling should not be AI. What they will accept or reject should be based on the player's reputation and charisma with the merchant's faction as the mechanics for haggling already exists.
- If it is detected that the player is attempting to hack the AI, it should automatically disable AI and the merchant should refuse to do business with the player.
- Hacking the AI would be detected attempts at prompt injection or attempts to subvert the AI into doing things it shouldn't do.
- AI should first resolve the safety of the player's input and only when determined safe, should it be processed with the merchant's AI response.
- We should build a system to help safeguard AI in the future, but that will be done in the future.

## Merchant Commands

There will be a few commands that will allow players to interact with merchants.

- `list` - Lists the items available for sale.
- `buy` - Buys an item from the merchant.
- `sell` - Sells an item to the merchant.
- `haggle` - Attempts to haggle with the merchant.
- `price` - Shows the current price the merchant is offering for an item.

- When haggling, it affects the price of all items the merchant is offering for sale and the price of the item the player is trying to sell to the merchant.
- In the case of multiple merchants in the same room, the player will be asked to clarify which merchant they are speaking to by using the command followed by the merchant's name.
- Players must buy or sell items one at a time. Buying or selling multiple items at once is not allowed.
- When buying or selling items. The currency uses copper as the base unit. Then rebalance all currency into the least amount of coins possible the way the bank works.
- Haggling mechanics are referenced in notes/mob_npc/05_Economy_and_Factions.md

**List:**

- Lists the items available for sale and their current price.
  - 'list'
  - 'list <merchant name>'

**Buy:**

- Buys an item from the merchant for the current listed price.
  - 'buy <item name>'
  - 'buy <merchant name> <item name>'

**Sell:**

- Sells an item to the merchant for the current listed price.
  - 'sell <item name>'
  - 'sell <merchant name> <item name>'

**Haggle:**

- Attempts to haggle with the merchant.
  - 'haggle'
  - 'haggle <merchant name>'

**Price:**

- Shows the current price the merchant is offering for an item.
  - 'price <item name>'
  - 'price <merchant name> <item name>'

## Chatting with Merchants

Merchants can use AI to chat with players.

- Merchants should have a predefined set of responses to common questions.
- This should be configurable by a table referenced by the merchant template.
- Text like ">merchant_name hello" or ">merchant_name greet" can trigger a set response.
  - The ">" is the arrow pointing to the person speaking to. This should work on any player, mob, or npc.
    - Example: ">Bob Hello: The room would see "Player_A says to Bob: Hello" and the player A would see "You say to Bob: Hello"
    - If there is no Bob in the room, it will notify the player that there is no Bob in the room.
- All discussions with the merchant should start with ">merchant_name".
  - The only exceptions are the commands listed above. (list, buy, sell, haggle, price)

## Update Mob / NPC Editor for Merchants

---

# Update to Mobs / NPC System

While mobs and npcs have combat, the ability to cast spells was not added to them. We must resolve this.

- They should be able to cast normal combat spells.
  - Area spells and single target spells.
- They should be able to cast support spells.
  - Buffs, debuffs, HoE and DoT spells.

---

# Update to Items

## Item Traits

- Items should be able to be limited to a certain quantity in the world.
- Items should not appear in shops or be dropped if all items of that type are at their maximum quantity.
- Any items spawned by an admin, that are already at their maximum quantity, will not be spawned.
- Items should be based in copper, not gold.
  - While their base value is in copper, their value should be displayed in a minimum coin denomination. (ie, a mace worth 1224 copper, would be displayed for sale at 12 gold, 2 silver and 4 copper)
- Limited items are tracked via a `max_in_world` field (INTEGER, nullable) on `item_templates`. NULL means unlimited.
  - The current world count is checked via `SELECT COUNT(*) FROM item_instances WHERE template_id = :id` at spawn/restock/drop checkpoints only.
  - This covers all locations (on players, on ground, in merchant inventory, equipped) since `item_instances` tracks all of them regardless of `location_type`.
  - When a limited item is destroyed (sold to a merchant who doesn't stock it, cleaned up by maintenance, or consumed), the count naturally decreases, allowing the next restock/drop to succeed.
- Add `rarity` field (VARCHAR) to `item_templates`.
  - Common, uncommon, rare, limited, unique, quest.
  - Quest items cannot be sold or dropped.
  - Unique items are typically crafted items. When crafted, the unique flag is set marking them as unique. Crafting does not exist yet but the rarity tier is in place for when it does.

## Items Clean Up Maintenance

During the game, items and coinage can be dropped after combat and maybe left on the ground. Occasionally someone may drop an item they no longer want. A clean up maintenance cycle should be run periodically that cleans up items left on the ground.

- Only common items should be cleaned up.
- Rare items that are not cleaned up should become hidden in the room at clean up.
  - Hidden items must be searched for to find.
  - When searching for hidden items, it does not unhide them, but the person that found them may pick them up.
  - Players who did not find them in a search, will not be able to pick them up without finding them in a search.
  - If a player finds them in a search, but leaves the room. They will have to search again to find them if they come back into the room.
  - Search / Found state should be in-memory on the player. When the player leaves the room, the state is lost.
- An admin should be able to clean up even rare items, but standard clean up should not clean up rare items.
- Admins should be able to purge items from the game even if they are on players who are online or offline.

# Add to TODOs List

- Create AI guardrails system for any AI usage.
- Create Spells system for mobs / npcs since it doesn't currently exist.
