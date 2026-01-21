# Currency System

## Overview

Kingdoms of Avarice uses a multi-tier currency system with five denominations. Each tier is a multiple of the previous tier, allowing players to consolidate wealth into higher-value coins to reduce inventory weight.

## Currency Types

| Currency | Conversion | Weight |
|----------|------------|--------|
| Copper (farthings) | Base unit | 25 coins = 1 enc |
| Silver (nobles) | 10 copper = 1 silver | 25 coins = 1 enc |
| Gold (crowns) | 10 silver = 1 gold | 15 coins = 1 enc |
| Platinum (pieces) | 10 gold = 1 platinum | 10 coins = 1 enc |
| Runic (coins) | 100 platinum = 1 runic | 4 coins = 1 enc |

**Note:** "Runic" is both singular and plural.

## Coin Descriptions

- **Copper:** The copper farthings look like they've been around forever.
- **Silver:** The silver nobles glitter with use.
- **Gold:** The gold crowns are rustic and used.
- **Platinum:** The platinum pieces shine as though they were new.
- **Runic:** The runic coins glitter like nothing you have ever seen before.

## Inventory Display

Currency is displayed separately from regular items in the inventory:

```
You are carrying:
  iron sword (main-hand), leather armor (body), steel helmet (head)
  health potion, torch, rope

You have: 0 runic, 0 platinum, 15 gold, 5 silver, and 103 copper.
Wealth: 1553 copper farthings.

Encumbrance: 425/480 Light (89%)
```

### Display Format

- Items are shown in paragraph form, comma-separated
- Equipped items are listed first with their slot in parentheses
- Non-equipped inventory items follow
- Currency section appears after items
- "You have:" is displayed in green
- Currency values are displayed in blue
- "Wealth:" is displayed in green
- Total wealth value is displayed in blue
- Encumbrance includes currency weight

## Weight Calculation

Currency contributes to character encumbrance based on weight:

| Currency | Coins per Encumbrance Point |
|----------|----------------------------|
| Copper | 25 |
| Silver | 25 |
| Gold | 15 |
| Platinum | 10 |
| Runic | 4 |

Higher-value currencies are denser and thus heavier per coin. The primary reason runic coins have a high platinum-to-runic conversion rate (100:1) is to allow consolidating a large amount of coins (and therefore weight) into a single denomination.

## Customizable Runic Name

The name "runic" can be customized by game administrators via the `currency_runic_name` setting in the game settings table. This allows servers to use thematic currency names appropriate to their world.

## Dropping and Picking Up Currency

Currency can be dropped and picked up as physical items in rooms.

### Drop Command

Use `drop <amount> <currency_type>` to drop currency:
```
drop 50 gold
drop 100 copper
drop 10 platinum
```

Abbreviations are supported:
- `c` = copper
- `s` = silver
- `g` = gold
- `p` = platinum
- `r` = runic

Example: `drop 50 g` drops 50 gold coins.

### Get Command

Two forms are supported:

1. **Get all coins of a type**: `get <currency_type>`
   ```
   get gold       - picks up ALL gold coins in room
   get copper     - picks up ALL copper coins in room
   g g            - short form: get gold
   ```

2. **Get specific amount**: `get <amount> <currency_type>`
   ```
   get 50 gold    - picks up exactly 50 gold coins
   get 100 copper - picks up exactly 100 copper coins
   g 50 g         - short form: get 50 gold
   ```

If you request more coins than are available, you'll pick up whatever is there.

### Currency Items in Rooms

When currency is dropped, it appears as a stackable item in the room:
- Multiple drops of the same currency type combine into one stack
- Picking up currency adds directly to your character's currency (not inventory)

## Future Features

The following features are planned but not yet implemented:

### Banks
- Depositing and withdrawing currency
- Currency auto-conversion to highest denominations on withdrawal

### Shops
- Buying and selling items
- Currency auto-conversion during transactions

### Training
- Paying gold to train to the next level
- Currency auto-conversion during training transactions

### Thievery
- Stealing random amounts of coins from other players/NPCs
- Random selection between stealing items or currency
