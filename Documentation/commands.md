# Commands Reference

[← Back to Documentation](README.md)

This document lists all available commands in Kingdoms of Avarice.

## Help System

| Command | Description |
| ------- | ----------- |
| `help` | Show player commands |
| `help actions` | List all available social actions |
| `help staff` | View staff commands (MODERATOR+) |
| `help developer` | View developer commands (DEVELOPER+) |
| `@help` | Full admin command reference (MODERATOR+) |

## Player Commands

### Movement

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `north` | `n` | Move north |
| `south` | `s` | Move south |
| `east` | `e` | Move east |
| `west` | `w` | Move west |
| `northeast` | `ne` | Move northeast |
| `northwest` | `nw` | Move northwest |
| `southeast` | `se` | Move southeast |
| `southwest` | `sw` | Move southwest |
| `up` | `u` | Move up |
| `down` | `d` | Move down |

### Looking & Information

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `look` | `l` | Look around the current room |
| `look <direction>` | | Peek into an adjacent room |
| `look <item>` | | Examine an item |
| `look in <container>` | | View container contents |
| `examine <item>` | `exa` | Examine an item in detail |
| `who` | | See who is online |
| `brief` | | Toggle brief mode (hide room descriptions when moving) |

### Doors

| Command | Description |
| ------- | ----------- |
| `open <direction>` | Open a door |
| `close <direction>` | Close a door |
| `unlock <direction>` | Unlock a locked door (requires key) |
| `lock <direction>` | Lock an unlocked door (requires key) |
| `pick <direction>` | Pick the lock on a door (requires thief skills) |
| `bash <direction>` | Bash a door open (uses strength) |

### Items & Inventory

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `get <item>` | `take`, `g` | Pick up an item |
| `get <item> from <container>` | | Get item from container |
| `drop <item>` | | Drop an item |
| `put <item> in <container>` | | Put item in container |
| `inventory` | `inv`, `i` | List items you are carrying |
| `search` | | Search for hidden items |

### Equipment

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `wield <item>` | | Wield a weapon |
| `wear <item>` | | Wear armor or accessories |
| `remove <item>` | `rem` | Remove equipped item |
| `equipment` | `eq` | List equipped items |

### Using Items

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `use <item>` | | Use a consumable item |
| `eat <item>` | | Eat food |
| `drink <item>` | | Drink a beverage |
| `quaff <item>` | | Quaff a potion |
| `light <item>` | | Light a torch or lantern |
| `extinguish <item>` | `douse` | Put out a light source |
| `repair <item>` | | Repair a damaged item |

### Crafting

| Command | Description |
| ------- | ----------- |
| `recipes` | List known crafting recipes |
| `craft <recipe>` | Craft an item |
| `enchantments` | List known enchantments |
| `enchant <item> with <enchantment>` | Enchant an item |

### Combat

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `attack <target>` | `att`, `kill`, `k`, `a` | Attack a target |
| `flee` | `fl` | Attempt to flee from combat |

### Magic

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `spells` | `sp`, `spellbook` | View your spellbook |
| `<mnemonic> <target>` | | Cast a spell (e.g., `mmis goblin`) |

### Progression

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `train` | `tr` | Level up (in training room) |
| `train stats` | | Allocate CP to stats (in training room) |
| `status` | `st`, `sta`, `stat`, `statu` | View your character sheet |

### Banking

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `bank` | `bal`, `balance` | Check bank balance (works anywhere) |
| `deposit all` | `dep all` | Deposit all carried currency (in bank room) |
| `deposit <amount>` | `dep` | Deposit copper farthings (in bank room) |
| `deposit <amount> <type>` | | Deposit specific currency type (in bank room) |
| `withdraw all` | `wit all` | Withdraw all funds as denominations (in bank room) |
| `withdraw <amount>` | `wit` | Withdraw copper, auto-converts to highest denominations (in bank room) |
| `withdraw <amount> <type>` | | Withdraw as specific currency type (in bank room) |

**Notes:**
- Bank balance is stored in copper farthings
- `bank` is informational-only and works while dead or dropped
- Withdrawals auto-convert to the highest denominations for weight efficiency
- Bank rooms are configured by developers in the Room Editor

### Social

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `/me <text>` | `me` | Custom emote (e.g., `/me waves goodbye`) |
| `<action>` | | Perform a social action (e.g., `dance`, `bow`, `wave`) |
| `<action> <player>` | | Target a player with an action (e.g., `wave bob`) |
| `help actions` | | List all available social actions |

**Default Actions:** `bow`, `cackle`, `cheer`, `clap`, `cry`, `dance`, `grin`, `grovel`, `hug`, `laugh`, `nod`, `poke`, `salute`, `shrug`, `sigh`, `smirk`, `wave`, `wink`, `yawn`

See the [Actions and Emotes Guide](Actions_and_Emotes_Guide.md) for more details.

### Other

| Command | Aliases | Description |
| ------- | ------- | ----------- |
| `rest` | `re` | Rest to regenerate faster |
| `queue` | `que`, `q` | Show queued commands |
| `cooldowns` | `cooldown`, `cd` | Show ability cooldowns |
| `x` | | Meditate and leave the realm |
| `quit` | `exit` | Shows instructions to use `x` to leave |

---

## Staff Commands (MODERATOR+)

These commands require Moderator role or higher.

| Command | Description |
| ------- | ----------- |
| `@goto <room_id>` | Teleport to a specific room |
| `@rooms` | List all rooms in the game |
| `@roominfo [id]` | Show detailed information about a room (current room if no ID given) |
| `@give <id\|name> [quantity]` | Give yourself an item |
| `@hurt [amount] [player]` | Damage HP for testing (default: 10 damage to self) |
| `@drain [amount] [player]` | Drain mana for testing (default: 10 mana from self) |
| `@learn <mnemonic>` | Learn a spell for your character |
| `@spells` | List all spells in the game |
| `@effect <id> [duration] [player]` | Apply a status effect (default: 60s to self) |
| `@cleareffect <id\|all>` | Remove a status effect |
| `@effects` | List all available status effects |
| `@help` | Show full admin command reference |

---

## Developer Commands (DEVELOPER+)

These commands require Developer role or higher.

### Room Building

| Command | Description |
| ------- | ----------- |
| `@create room <name>` | Create a new room |
| `@link <dir> <id> [oneway]` | Link current room to another |
| `@unlink <dir> [oneway]` | Remove an exit |
| `@edit <field> <value>` | Edit current room (name/desc/area) |
| `@delete room <id>` | Delete a room |

### Item Management

| Command | Description |
| ------- | ----------- |
| `@items` | List all item templates |
| `@iteminfo <id\|name>` | Show item template details |
| `@spawn <id\|name> [qty]` | Spawn item in current room |
| `@purge items` | Remove all items from room |
| `@purge item <id>` | Remove specific item instance |

### Progression System

| Command | Description |
| ------- | ----------- |
| `@classes` | List all classes |
| `@classinfo <id>` | Show class details |
| `@createclass <id> <name>` | Create a class |
| `@editclass <id> <field> <value>` | Edit a class |
| `@deleteclass <id>` | Delete a class |
| `@races` | List all races |
| `@raceinfo <id>` | Show race details |
| `@createrace <id> <name>` | Create a race |
| `@editrace <id> <field> <value>` | Edit a race |
| `@deleterace <id>` | Delete a race |
| `@abilities [type]` | List abilities |
| `@abilityinfo <id>` | Show ability details |
| `@createability <id> <type> <name>` | Create an ability |
| `@editability <id> <field> <value>` | Edit an ability |
| `@deleteability <id>` | Delete an ability |
| `@talents [class]` | List talents |
| `@talentinfo <id>` | Show talent details |
| `@createtalent <id> <name>` | Create a talent |
| `@edittalent <id> <field> <value>` | Edit a talent |
| `@deletetalent <id>` | Delete a talent |
| `@events` | List essence events |
| `@eventinfo <id>` | Show event details |
| `@createevent <id> <name>` | Create an event |
| `@editevent <id> <field> <value>` | Edit an event |
| `@deleteevent <id>` | Delete an event |
| `@classabilities <class_id>` | List abilities for a class |
| `@addclassability <class_id> <ability_id>` | Add ability to class |
| `@removeclassability <class_id> <ability_id>` | Remove ability from class |

### System

| Command | Description |
| ------- | ----------- |
| `@reload [type]` | Reload data from database (rooms, items, effects, doors, actions, all) |

---

## Tips

- **Brief Mode**: Use `brief` to toggle room descriptions. Useful once you know an area well.
- **Looking Around**: Use `look <direction>` to peek into adjacent rooms without moving.
- **Exiting Safely**: The `x` command gives you 10 seconds to change your mind. Any command cancels the exit.
- **Door Skills**: Picking locks requires thief class abilities. Bashing doors uses raw strength but may hurt you.
- **Status Effects**: Staff can apply effects to themselves or other players for testing with `@effect`.

---

[← Back to Documentation](README.md)
