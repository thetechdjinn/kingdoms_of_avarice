# Item Editor Guide

This guide covers all the tools available for creating and managing items in Kingdoms of Avarice.

## Table of Contents

1. [Web-Based Item Editor](#web-based-item-editor)
2. [In-Game Admin Commands](#in-game-admin-commands)
3. [Import/Export](#importexport)
4. [Item Types Reference](#item-types-reference)
5. [API Reference](#api-reference)

---

## Web-Based Item Editor

Access the Item Editor at `/item-editor.html` (requires Developer or Admin role).

### Features

- **Template List**: Browse and filter all item templates by type or search
- **Tabbed Editor**: Organize item properties across multiple tabs
- **Live Preview**: See how items will appear in-game
- **Spawn Tool**: Quickly spawn items into rooms for testing
- **Import/Export**: Backup and share item definitions

### Creating an Item

1. Click **+ New Item** in the left panel
2. Enter a name for the item
3. Fill in the required fields:
   - **Name**: Internal identifier
   - **Short Description**: What players see (e.g., "a rusty sword")
   - **Type**: Determines available options and behavior

### Editor Tabs

#### Basic Tab

| Field             | Description                                          |
| ----------------- | ---------------------------------------------------- |
| Name              | Internal template name                               |
| Type              | Item category (weapon, armor, etc.)                  |
| Short Description | Displayed name (lowercase, with article)             |
| Long Description  | Shown when examining                                 |
| Room Description  | Shown in room (e.g., "A sword lies here.")           |
| Keywords          | Comma-separated words players can use to target item |
| Weight            | Affects carrying capacity                            |
| Size              | Relative size (1-5)                                  |
| Base Value        | Gold value                                           |
| Equipment Slot    | Where item is worn/wielded                           |
| Max Stack         | How many can stack (1 = no stacking)                 |
| Effect Slots      | Number of enchantments allowed                       |

#### Type Data Tab

Shows fields specific to the selected item type:

**Weapons:**

- Damage Dice (e.g., "1d8", "2d6")
- Damage Type (slashing, piercing, etc.)
- Attack Speed
- Critical Modifier
- Range (melee/ranged/thrown)

**Armor:**

- Armor Class
- Damage Resistance (flat damage reduction)
- Weight Class (light/medium/heavy)

**Containers:**

- Capacity (max items)
- Weight Limit

**Consumables:**

- Effect Type (heal, mana, damage, food, drink)
- Effect Value
- Charges (0 = single use)
- Duration (for timed effects)

**Light Sources:**

- Light Radius
- Max Fuel (0 = permanent)
- Fuel Rate (consumption per minute)

#### Requirements Tab

Set prerequisites for using/equipping:

- Level requirement
- Stat requirements (STR, DEX, INT, CON)
- Class restrictions
- Race restrictions

#### Modifiers Tab

Stat bonuses when equipped:

- Strength, Dexterity, Constitution, Intelligence
- Max Health, Max Mana

#### Flags Tab

| Flag       | Effect                          |
| ---------- | ------------------------------- |
| Takeable   | Can be picked up                |
| Hidden     | Requires `search` to find       |
| No Drop    | Cannot be dropped (quest items) |
| Stackable  | Multiple can occupy one slot    |
| Cursed     | Cannot be removed once equipped |
| Two-Handed | Blocks off-hand slot            |
| Throwable  | Can be thrown as weapon         |

---

## In-Game Admin Commands

All item commands start with `@` and require appropriate roles.

### Staff Commands (Moderator+)

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `@give <item> [qty]` | Give yourself an item by ID or name |

### Developer Commands

| Command                     | Description                             |
| --------------------------- | --------------------------------------- |
| `@items`                    | List all item templates grouped by type |
| `@iteminfo <id\|name>`      | Show detailed template information      |
| `@spawn <id\|name> [qty]`   | Spawn item in current room              |
| `@purge items`              | Remove all items from current room      |
| `@purge item <instance_id>` | Remove specific item instance           |

### Examples

```
@items                    # List all templates
@iteminfo 5               # Show template #5 details
@iteminfo "Iron Sword"    # Show by name
@spawn 5                  # Spawn one of template #5
@spawn "Healing Potion" 3 # Spawn 3 healing potions
@give 5                   # Give yourself template #5
@purge items              # Clear room of items
```

---

## Import/Export

### Exporting Items

1. In the Item Editor, click **Export**
2. A JSON file downloads containing:
   - All item templates
   - All crafting recipes
   - All enchantments

### Importing Items

1. Click **Import** in the Item Editor
2. Select a JSON file
3. Choose merge behavior:
   - **Merge** (default): Update existing items by name, create new ones
   - **No merge**: Only create items that don't exist

### JSON Format

```json
{
  "version": "1.0",
  "exported_at": "2024-01-01T00:00:00.000Z",
  "templates": [
    {
      "id": 1,
      "name": "Iron Sword",
      "short_desc": "an iron sword",
      "long_desc": "A well-crafted iron sword.",
      "room_desc": "An iron sword lies here.",
      "keywords": ["sword", "iron", "weapon"],
      "weight": 5,
      "size": 2,
      "base_value": 50,
      "item_type": "weapon",
      "equipment_slot": "main_hand",
      "flags": { "takeable": true },
      "max_stack": 1,
      "weapon_data": {
        "damage_dice": "1d8",
        "damage_type": "slashing",
        "attack_speed": 10,
        "crit_modifier": 2
      },
      "effect_slots": 2
    }
  ],
  "recipes": [],
  "enchantments": []
}
```

---

## Item Types Reference

### Weapon

Equipment that deals damage. Requires `equipment_slot` and `weapon_data`.

```json
{
  "item_type": "weapon",
  "equipment_slot": "main_hand",
  "weapon_data": {
    "damage_dice": "1d8",
    "damage_type": "slashing",
    "attack_speed": 10,
    "crit_modifier": 2,
    "range": "melee"
  }
}
```

**Damage Types:** slashing, piercing, bludgeoning, fire, ice, lightning, poison, holy, unholy

### Armor

Protective equipment. Requires `equipment_slot` and `armor_data`.

```json
{
  "item_type": "armor",
  "equipment_slot": "body",
  "armor_data": {
    "armor_class": 5,
    "damage_resistance": 2,
    "weight_class": "medium"
  }
}
```

**Equipment Slots:** head, face, neck, back, body, arms, hands, wrist_left, wrist_right, finger_left, finger_right, waist, legs, feet, main_hand, off_hand, held

### Container

Holds other items. Requires `container_capacity`.

```json
{
  "item_type": "container",
  "container_capacity": 20,
  "container_weight_limit": 100
}
```

### Consumable

Single or multi-use items with effects. Requires `consumable_data`.

```json
{
  "item_type": "consumable",
  "consumable_data": {
    "effect_type": "heal",
    "effect_value": 25,
    "charges": 0,
    "duration": 0
  }
}
```

**Effect Types:** heal, mana, damage, food, drink

### Light

Provides illumination. Requires `light_data`.

```json
{
  "item_type": "light",
  "light_data": {
    "radius": 2,
    "fuel_max": 60,
    "fuel_rate": 1
  }
}
```

### Key

Opens locked doors/containers.

```json
{
  "item_type": "key",
  "flags": { "takeable": true }
}
```

### Misc

General items without special behavior.

```json
{
  "item_type": "misc",
  "flags": { "takeable": true, "stackable": true }
}
```

---

## API Reference

All endpoints require Developer role authentication.

### Templates

| Method | Endpoint                   | Description         |
| ------ | -------------------------- | ------------------- |
| GET    | `/api/items/templates`     | List all templates  |
| GET    | `/api/items/templates/:id` | Get single template |
| POST   | `/api/items/templates`     | Create template     |
| PUT    | `/api/items/templates/:id` | Update template     |
| DELETE | `/api/items/templates/:id` | Delete template     |

### Instances

| Method | Endpoint                   | Description         |
| ------ | -------------------------- | ------------------- |
| GET    | `/api/items/instances`     | List all instances  |
| GET    | `/api/items/instances/:id` | Get single instance |
| POST   | `/api/items/instances`     | Create instance     |
| PUT    | `/api/items/instances/:id` | Update instance     |
| DELETE | `/api/items/instances/:id` | Delete instance     |

### Utility

| Method | Endpoint            | Description        |
| ------ | ------------------- | ------------------ |
| GET    | `/api/items/types`  | Get enum values    |
| GET    | `/api/items/export` | Export all data    |
| POST   | `/api/items/import` | Import templates   |
| POST   | `/api/items/spawn`  | Spawn item in room |

### Example: Create Template

```bash
curl -X POST http://localhost:3001/api/items/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Sword",
    "short_desc": "a test sword",
    "item_type": "weapon",
    "keywords": ["sword", "test"],
    "weapon_data": {
      "damage_dice": "1d6",
      "damage_type": "slashing"
    }
  }'
```

### Example: Spawn Item

```bash
curl -X POST http://localhost:3001/api/items/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": 1,
    "room_id": 1,
    "quantity": 1
  }'
```

---

## Best Practices

### Naming Conventions

- **Name**: Title case, no article ("Iron Sword")
- **Short Description**: Lowercase with article ("an iron sword")
- **Room Description**: Full sentence ("An iron sword lies here.")
- **Keywords**: Lowercase, include variations ("sword", "iron sword", "blade")

### Balance Guidelines

- **Weapons**: Base damage should scale with level requirements
- **Armor**: AC should match weight class expectations
- **Consumables**: Effect value should match item value/rarity
- **Containers**: Capacity affects gameplay significantly

### Testing Workflow

1. Create template in Item Editor
2. Use `@spawn` to place in test room
3. Test all interactions (get, drop, use, equip)
4. Adjust and repeat
5. Export for backup before major changes

---

## Troubleshooting

### Item Not Appearing

- Check `flags.hidden` is false
- Verify `location_type` and `location_id` are correct
- Ensure template exists (`@iteminfo`)

### Can't Pick Up Item

- Check `flags.takeable` is true
- Verify item is in room (not container or player)

### Can't Equip Item

- Check `equipment_slot` is set
- Verify requirements are met
- Check for slot conflicts (two-handed weapons)

### Import Fails

- Validate JSON syntax
- Ensure required fields are present
- Check for duplicate IDs if not merging
