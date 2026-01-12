# Items System Architecture

This document outlines the architecture for the item system in Kingdoms of Avarice.

## Design Principles

1. **Template + Instance Pattern** - Item templates define base properties; instances track actual objects in the game world
2. **Extensibility** - JSONB fields allow future features (enchanting, glyphs, enhancements) without schema changes
3. **Persistence** - All items persist across server restarts
4. **Flexible Location** - Items can exist in rooms, inventories, equipped, inside containers, or on NPCs

---

## Equipment Slots

### Armor Slots

| Slot           | Description                     |
| -------------- | ------------------------------- |
| `head`         | Helmets, hoods, circlets        |
| `face`         | Masks, eyewear                  |
| `neck`         | Amulets, necklaces, pendants    |
| `back`         | Capes, cloaks                   |
| `body`         | Breastplates, tunics, chainmail |
| `arms`         | Armbands, bracers, sleeves      |
| `hands`        | Gloves, gauntlets               |
| `wrist_left`   | Left wrist slot                 |
| `wrist_right`  | Right wrist slot                |
| `finger_left`  | Left ring slot                  |
| `finger_right` | Right ring slot                 |
| `waist`        | Belts, baldrics                 |
| `legs`         | Greaves, leggings, pants        |
| `feet`         | Boots, shoes, sabatons          |

### Combat Slots

| Slot        | Description                                 |
| ----------- | ------------------------------------------- |
| `main_hand` | Primary weapon (swords, axes, maces)        |
| `off_hand`  | Secondary weapon (dual-wield) or held items |
| `shield`    | Defensive off-hand items                    |
| `held`      | Special held items (not weapons/shields)    |

**Total: 18 equipment slots**

---

## Database Schema

### Item Templates Table (`item_templates`)

Defines the blueprint for each item type.

```sql
CREATE TABLE IF NOT EXISTS item_templates (
    id SERIAL PRIMARY KEY,

    -- Identity & Description
    name VARCHAR(100) NOT NULL,
    short_desc VARCHAR(255) NOT NULL,      -- For inventory lists
    long_desc TEXT,                         -- For examination
    room_desc VARCHAR(255),                 -- How it appears on the ground
    keywords TEXT[] NOT NULL DEFAULT '{}',  -- Aliases for commands ("sword", "iron sword")

    -- Physical Properties
    weight INTEGER NOT NULL DEFAULT 0,      -- In arbitrary units
    size INTEGER NOT NULL DEFAULT 1,        -- Bulk (1=tiny, 5=huge)
    base_value INTEGER NOT NULL DEFAULT 0,  -- Base gold value

    -- Classification
    item_type VARCHAR(50) NOT NULL,         -- weapon, armor, container, consumable, misc, key, light
    equipment_slot VARCHAR(50),             -- Which slot this equips to (NULL if not equippable)

    -- Flags (JSONB for flexibility)
    flags JSONB NOT NULL DEFAULT '{}',
    -- Possible flags:
    --   takeable: boolean (default true)
    --   hidden: boolean (requires search to find)
    --   no_drop: boolean (quest items)
    --   stackable: boolean
    --   cursed: boolean (can't remove once equipped)
    --   two_handed: boolean (weapons)
    --   throwable: boolean

    -- Stacking
    max_stack INTEGER DEFAULT 1,            -- Max stack size (1 = not stackable)

    -- Container Properties (if item_type = 'container')
    container_capacity INTEGER,             -- Max items it can hold
    container_weight_limit INTEGER,         -- Max weight it can hold

    -- Weapon Properties (JSONB for flexibility)
    weapon_data JSONB,
    -- Structure:
    --   damage_dice: string (e.g., "1d8", "2d6")
    --   damage_type: string (slashing, piercing, bludgeoning, fire, ice, etc.)
    --   attack_speed: integer (lower = faster)
    --   crit_modifier: number
    --   range: string (melee, ranged, thrown)
    --   skill_type: string (swords, axes, bludgeons, etc.)

    -- Armor Properties (JSONB for flexibility)
    armor_data JSONB,
    -- Structure:
    --   armor_class: integer
    --   weight_class: string (light, medium, heavy)
    --   resistances: object (fire: 10, ice: 5, etc.)

    -- Consumable Properties (JSONB for flexibility)
    consumable_data JSONB,
    -- Structure:
    --   charges: integer (for wands/staffs, NULL for single-use)
    --   effect_type: string (heal, buff, damage, etc.)
    --   effect_value: integer
    --   duration: integer (seconds, 0 for instant)

    -- Light Source Properties
    light_data JSONB,
    -- Structure:
    --   radius: integer
    --   fuel_max: integer (NULL for permanent)
    --   fuel_rate: integer (fuel consumed per minute)

    -- Requirements
    requirements JSONB,
    -- Structure:
    --   level: integer
    --   strength: integer
    --   dexterity: integer
    --   class: string[]
    --   race: string[]

    -- Stat Modifications when equipped
    stat_modifiers JSONB,
    -- Structure:
    --   strength: integer
    --   dexterity: integer
    --   constitution: integer
    --   intelligence: integer
    --   max_health: integer
    --   max_mana: integer

    -- Future extensibility for enchanting/glyphs/enhancements
    effect_slots INTEGER DEFAULT 0,         -- Number of enchantment slots
    base_effects JSONB,                     -- Built-in magical effects

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_item_templates_type ON item_templates(item_type);
CREATE INDEX idx_item_templates_slot ON item_templates(equipment_slot);
CREATE INDEX idx_item_templates_keywords ON item_templates USING GIN(keywords);
```

### Item Instances Table (`item_instances`)

Tracks actual items in the game world.

```sql
CREATE TABLE IF NOT EXISTS item_instances (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES item_templates(id) ON DELETE CASCADE,

    -- Location (polymorphic)
    location_type VARCHAR(50) NOT NULL,     -- room, player, equipped, container, npc
    location_id INTEGER NOT NULL,           -- ID of room/player/container/npc
    equipped_slot VARCHAR(50),              -- Which slot if location_type = 'equipped'

    -- Instance-specific state
    quantity INTEGER NOT NULL DEFAULT 1,    -- For stacked items
    condition VARCHAR(50) DEFAULT 'pristine', -- pristine, good, worn, damaged, broken

    -- Consumable state
    charges_remaining INTEGER,              -- Current charges (for wands, etc.)
    fuel_remaining INTEGER,                 -- Current fuel (for light sources)

    -- Custom modifications (for future enchanting/glyphs/enhancements)
    custom_data JSONB DEFAULT '{}',
    -- Structure:
    --   enchantments: array of enchantment objects
    --   glyphs: array of glyph objects
    --   enhancements: array of enhancement objects
    --   custom_name: string (player-renamed items)
    --   creator: string (who crafted it)
    --   bound_to: integer (player_id if soulbound)

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_item_instances_template ON item_instances(template_id);
CREATE INDEX idx_item_instances_location ON item_instances(location_type, location_id);
CREATE INDEX idx_item_instances_equipped ON item_instances(location_id, equipped_slot)
    WHERE location_type = 'equipped';
```

### Container Contents View

For convenience when querying container contents:

```sql
CREATE VIEW container_contents AS
SELECT
    ii.id AS instance_id,
    ii.template_id,
    it.name,
    it.short_desc,
    ii.quantity,
    ii.location_id AS container_id
FROM item_instances ii
JOIN item_templates it ON ii.template_id = it.id
WHERE ii.location_type = 'container';
```

---

## TypeScript Interfaces

### Shared Types (`@koa/shared`)

```typescript
// Equipment slot enum
export enum EquipmentSlot {
  HEAD = "head",
  FACE = "face",
  NECK = "neck",
  BACK = "back",
  BODY = "body",
  ARMS = "arms",
  HANDS = "hands",
  WRIST_LEFT = "wrist_left",
  WRIST_RIGHT = "wrist_right",
  FINGER_LEFT = "finger_left",
  FINGER_RIGHT = "finger_right",
  WAIST = "waist",
  LEGS = "legs",
  FEET = "feet",
  MAIN_HAND = "main_hand",
  OFF_HAND = "off_hand",
  SHIELD = "shield",
  HELD = "held",
}

// Item type classification
export enum ItemType {
  WEAPON = "weapon",
  ARMOR = "armor",
  CONTAINER = "container",
  CONSUMABLE = "consumable",
  KEY = "key",
  LIGHT = "light",
  MISC = "misc",
}

// Location types for item instances
export enum ItemLocationType {
  ROOM = "room",
  PLAYER = "player",
  EQUIPPED = "equipped",
  CONTAINER = "container",
  NPC = "npc",
}

// Item condition
export enum ItemCondition {
  PRISTINE = "pristine",
  GOOD = "good",
  WORN = "worn",
  DAMAGED = "damaged",
  BROKEN = "broken",
}

// Damage types
export enum DamageType {
  SLASHING = "slashing",
  PIERCING = "piercing",
  BLUDGEONING = "bludgeoning",
  FIRE = "fire",
  ICE = "ice",
  LIGHTNING = "lightning",
  POISON = "poison",
  HOLY = "holy",
  UNHOLY = "unholy",
}

// Item flags
export interface ItemFlags {
  takeable?: boolean; // Can be picked up (default true)
  hidden?: boolean; // Requires search to find
  no_drop?: boolean; // Cannot be dropped (quest items)
  stackable?: boolean; // Can stack with identical items
  cursed?: boolean; // Cannot be removed once equipped
  two_handed?: boolean; // Requires both hands (weapons)
  throwable?: boolean; // Can be thrown
}

// Weapon data
export interface WeaponData {
  damage_dice: string; // e.g., "1d8", "2d6+2"
  damage_type: DamageType;
  attack_speed?: number; // Lower = faster
  crit_modifier?: number; // Multiplier on critical hits
  range?: "melee" | "ranged" | "thrown";
  skill_type?: string; // swords, axes, bludgeons, etc.
}

// Armor data
export interface ArmorData {
  armor_class: number;
  weight_class?: "light" | "medium" | "heavy";
  resistances?: Partial<Record<DamageType, number>>;
}

// Consumable data
export interface ConsumableData {
  charges?: number; // For multi-use items (wands)
  effect_type: string; // heal, buff, damage, etc.
  effect_value: number;
  duration?: number; // Seconds (0 for instant)
}

// Light source data
export interface LightData {
  radius: number;
  fuel_max?: number; // NULL for permanent
  fuel_rate?: number; // Fuel consumed per minute
}

// Requirements to use/equip
export interface ItemRequirements {
  level?: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  constitution?: number;
  class?: string[];
  race?: string[];
}

// Stat modifiers when equipped
export interface StatModifiers {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  max_health?: number;
  max_mana?: number;
}

// Item template (blueprint)
export interface ItemTemplate {
  id: number;
  name: string;
  short_desc: string;
  long_desc?: string;
  room_desc?: string;
  keywords: string[];
  weight: number;
  size: number;
  base_value: number;
  item_type: ItemType;
  equipment_slot?: EquipmentSlot;
  flags: ItemFlags;
  max_stack: number;
  container_capacity?: number;
  container_weight_limit?: number;
  weapon_data?: WeaponData;
  armor_data?: ArmorData;
  consumable_data?: ConsumableData;
  light_data?: LightData;
  requirements?: ItemRequirements;
  stat_modifiers?: StatModifiers;
  effect_slots: number;
  base_effects?: unknown; // Future: magical effects
}

// Custom data for item instances (future extensibility)
export interface ItemCustomData {
  enchantments?: unknown[]; // Future: enchantment system
  glyphs?: unknown[]; // Future: glyph/inscription system
  enhancements?: unknown[]; // Future: weaponsmith enhancements
  custom_name?: string; // Player-renamed items
  creator?: string; // Who crafted it
  bound_to?: number; // Player ID if soulbound
}

// Item instance (actual object in game)
export interface ItemInstance {
  id: number;
  template_id: number;
  template: ItemTemplate; // Joined data
  location_type: ItemLocationType;
  location_id: number;
  equipped_slot?: EquipmentSlot;
  quantity: number;
  condition: ItemCondition;
  charges_remaining?: number;
  fuel_remaining?: number;
  custom_data: ItemCustomData;
}

// Simplified item for display
export interface ItemDisplay {
  instance_id: number;
  name: string;
  short_desc: string;
  quantity: number;
  condition: ItemCondition;
}
```

---

## Implementation Phases

### Phase 1: Core Items (MVP)

- [ ] Create `item_templates` and `item_instances` tables
- [ ] Create TypeScript interfaces in `@koa/shared`
- [ ] Create `itemRepository.ts` with CRUD operations
- [ ] Implement `get`, `drop` commands
- [ ] Display items in room descriptions
- [ ] Basic `inventory` command
- [ ] Keyword matching for item commands

### Phase 2: Equipment System

- [ ] Implement `wear`, `remove`, `wield` commands
- [ ] Equipment slot validation
- [ ] Two-handed weapon logic
- [ ] Display equipped items
- [ ] Apply stat modifiers from equipment

### Phase 3: Containers & Stacking

- [ ] Container logic (`put`, `get from`)
- [ ] Stack merging/splitting
- [ ] Weight/capacity limits
- [ ] Locked containers and keys

### Phase 4: Consumables & Light

- [ ] `use`, `eat`, `drink`, `quaff` commands
- [ ] Charge tracking for wands/staffs
- [ ] Light source fuel tracking
- [ ] Room darkness system

### Phase 5: Advanced Features

- [ ] Item condition/durability
- [ ] Repair system
- [ ] Hidden items and `search` command
- [ ] Cursed items

### Phase 6: Crafting & Modification (Future)

- [ ] Crafting system (create items from templates)
- [ ] Enchanting system (add magical effects)
- [ ] Glyph/inscription system
- [ ] Weaponsmith enhancements
- [ ] Custom naming

---

## Command Reference

### Phase 1 Commands

| Command                          | Description                   |
| -------------------------------- | ----------------------------- |
| `get <item>`                     | Pick up an item from the room |
| `get all`                        | Pick up all takeable items    |
| `drop <item>`                    | Drop an item from inventory   |
| `drop all`                       | Drop all items                |
| `inventory` / `i`                | List carried items            |
| `examine <item>` / `look <item>` | View item details             |

### Phase 2 Commands (Implemented)

| Command         | Aliases | Description             |
| --------------- | ------- | ----------------------- |
| `wear <item>`   |         | Equip armor/accessories |
| `remove <item>` | `rem`   | Unequip an item         |
| `wield <item>`  |         | Equip a weapon          |
| `equipment`     | `eq`    | List equipped items     |

### Phase 3 Commands

| Command                       | Description              |
| ----------------------------- | ------------------------ |
| `put <item> in <container>`   | Place item in container  |
| `get <item> from <container>` | Take item from container |
| `look in <container>`         | View container contents  |
| `open <container>`            | Open a container         |
| `close <container>`           | Close a container        |
| `lock <container>`            | Lock with key            |
| `unlock <container>`          | Unlock with key          |

### Phase 4 Commands

| Command             | Description           |
| ------------------- | --------------------- |
| `use <item>`        | Use a consumable      |
| `eat <item>`        | Consume food          |
| `drink <item>`      | Consume liquid        |
| `quaff <item>`      | Drink a potion        |
| `light <item>`      | Light a torch/lantern |
| `extinguish <item>` | Put out a light       |

---

## Keyword Matching Algorithm

When a player types `get sword`, the system should:

1. Find all items in the room
2. Match against keywords array using case-insensitive partial matching
3. If multiple matches, prompt for disambiguation:
   ```
   Which sword?
   1. rusty iron sword
   2. gleaming silver sword
   ```
4. Support numbered selection: `get 2` or `get sword 2`
5. Support `all` keyword: `get all`, `drop all sword`

---

## Location Tracking

Items can exist in these locations:

| `location_type` | `location_id`    | Description                               |
| --------------- | ---------------- | ----------------------------------------- |
| `room`          | room.id          | On the ground in a room                   |
| `player`        | player.id        | In player's inventory                     |
| `equipped`      | player.id        | Equipped on player (uses `equipped_slot`) |
| `container`     | item_instance.id | Inside another item                       |
| `npc`           | npc_instance.id  | Carried by an NPC                         |

---

## Future Considerations

### Crafting System

- Templates marked as `craftable` with recipe requirements
- Crafting skills per player
- Quality variance based on skill

### Enchanting System

- `effect_slots` on templates defines max enchantments
- Enchantments stored in `custom_data.enchantments`
- Enchanting skill determines success rate

### Glyph/Inscription System

- Similar to enchanting but different effect types
- Stored in `custom_data.glyphs`

### Weaponsmith Enhancements

- Physical improvements (sharpening, reinforcing)
- Stored in `custom_data.enhancements`
- May affect condition degradation rate
