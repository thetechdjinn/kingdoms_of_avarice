I want to add items to the game. Below is a list of things we should consider in this implementation.

## Core Item Properties

Identity & Description

Unique IDs for each item instance
Short name (for inventory lists) vs. long description (for examination)
Keywords/aliases for player commands ("get sword" vs "get iron longsword")
Room description (how it appears when lying on the ground)

## Physical Properties

Weight (affects carrying capacity, strength requirements)
Size/bulk (separate from weight - a pillow vs. a cannonball)
Material type (affects durability, value, interactions)
Durability/condition system (pristine → broken)
Value (for trading, theft detection)

## Functional Considerations

### Container System

Items that hold other items (bags, chests, corpses)
Capacity limits (by weight, count, or size)
Lockable containers with key requirements
Liquid containers with volume tracking

### Stackability

Stackable items (arrows, coins, potions)
Non-stackable items (each unique, even if same type)
Max stack sizes

### Item Flags/States

takeable/fixed (your immovable statue idea)
hidden (requires search to find)
cursed (can't remove once worn/wielded)
no_drop (quest items that can't be discarded)
decays (food spoiling, corpses decomposing)
quest_item flags
bound (cannot trade/drop)

## Equipment System

Wear Locations

Define body slots (head, neck, torso, hands, fingers, wielded, off-hand, etc.)
Some slots might allow multiple items (10 fingers for rings)
Layering (shirt under chainmail under cloak)

## Equipment Stats

Armor class/defense rating
Weight class penalties (light/medium/heavy armor affecting movement, spell casting)
Skill/class/level requirements
Stat modifications (strength, dexterity, etc.)

## Weapon Properties

Damage dice (1d8, 2d6, etc.)
Damage types (slashing, piercing, bludgeoning, elemental)
Attack speed/weapon weight
One-handed vs two-handed vs dual-wieldable
Skill requirements (swords, axes, exotic weapons)
Critical hit modifiers
Range (melee vs ranged, throwing weapons)

## Special Item Types

### Consumables

Single-use items (potions, scrolls, food)
Charges (wands, staffs)
Duration effects vs instant effects

### Light Sources

Torches, lanterns with fuel tracking
Magical light items
Illumination radius

### Keys & Unlocking

Key items that open specific doors/containers
Master keys, skeleton keys
Lockpicks (consumable or tool-based)

### Crafting Components

Raw materials
Intermediate components
Recipes/blueprints as items

### Special Interactive Items

Portals
Vehicles/mounts
Instruments (playable items)
Books/scrolls with readable text
Furniture (sittable, usable)

## Advanced Systems

Magic Items

Enchantment slots
Magical effects (on-hit, passive auras, activated abilities)
Identification system (unknown magical properties until identified)
Artifact-level items with unique properties

## Item Relationships

Set bonuses (wearing complete armor sets)
Required pairs (left/right gloves)
Incompatibilities (can't wear two cloaks)

## Ownership & Economics

Owner tracking (for theft systems)
Shop items (buyable/sellable flags, merchant pricing)
Rent/decay timers for dropped items
Unique/limited items (only one exists in game)

## Spawning & Persistence

Respawn timers for items in rooms
Load points (where items initially appear)
Reset behavior (do player-dropped items persist through resets?)
Unique item tracking (prevent duplication)

## Technical Architecture

Data Structure
Consider separating item templates (the blueprint) from item instances (actual objects in the game):

Templates define base properties
Instances track current state (damage, location, owner, condition)
Allows efficient memory usage and easy updates to all items of a type

## Location Tracking

Items can be:

In a room
In a player's inventory
Equipped on a player
Inside a container
Being carried by an NPC
Your system should elegantly handle transitions between these states

## Event System

onPickup, onDrop, onWear, onRemove triggers
onUse, onConsume handlers
Environmental interactions (item + item combinations)

## Quality of Life

Automatic currency conversion (100 copper = 1 silver)
Item comparison commands (compare two weapons)
Repair system for damaged equipment
Enchanting/upgrading systems
Item lending/trading between players
Item history (who crafted it, notable kills, previous owners)
