# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kingdoms of Avarice is a web-based MUD (Multi-User Dungeon) inspired by MajorMUD. TypeScript monorepo with real-time WebSocket communication and a terminal-style xterm.js interface.

## Rules

- Always ensure any libraries, frameworks, or dependencies are up to date and secure
- Use the latest stable versions of libraries, frameworks, and dependencies
- Never use worktrees unless explicitly asked to do so

## Commands

```bash
npm run setup            # Fresh install: install, build, migrate, and import game data
npm install              # Install all dependencies
npm run build:shared     # Build shared types (run first, or after changing shared/)
npm run dev              # Start both frontend (localhost:3000) and backend (localhost:3001)
npm run dev:client       # Start only frontend
npm run dev:server       # Start only backend
npm run build            # Build all packages
```

**Database:**

```bash
npm run migrate                                    # Run migrations and seed data
cd packages/server && npx tsx src/db/create-admin.ts <username>  # Grant admin role
```

**Area Data:**

```bash
npm run seed:arindale    # Seed Arindale city rooms (replaces all room data)
npm run map:arindale     # Generate ANSI map → maps/arindale.txt
```

**Game Data Export/Import:**

```bash
npm run data:export      # Export all game content to data/ as JSON
npm run data:import      # Import game content from data/ (merge/upsert)
```

**Test account:** `testuser` / `password`

## Architecture

### Monorepo Structure (npm workspaces)

- `packages/shared` - TypeScript types and enums (`@koa/shared`)
- `packages/client` - Vite + xterm.js frontend (`@koa/client`)
- `packages/server` - Express + WebSocket backend (`@koa/server`)

### Communication Flow

```
Client (xterm.js) <--WebSocket--> Server (Express/ws) <--pg--> PostgreSQL
```

- **WebSocket**: Player commands sent as `COMMAND` messages, responses as `OUTPUT`/`ERROR`/`SYSTEM`
- **HTTP REST**: Auth, room/item/progression CRUD via `/api/*` routes
- **Vite proxy**: `/api/*` and `/game` WebSocket proxied to backend

### Key Layers

**Database (Repository Pattern):**

- `packages/server/src/db/repositories/` - playerRepository, roomRepository, itemRepository, etc.
- `packages/server/src/db/migrate.ts` - Auto-runs on server startup
- Use `withTransaction()` helper for ACID compliance

**Game Logic:**

- `packages/server/src/game/world.ts` - Game state management
- `packages/server/src/game/commands.ts` - Core command processor
- `packages/server/src/game/socket.ts` - WebSocket connection handler
- Additional: `itemCommands.ts`, `adminCommands.ts`, `progressionCommands.ts`, `actionCommands.ts`, `bankCommands.ts`

**Shared Types:**

- Enums: `MessageType`, `Role`, `ItemType`, `EquipmentSlot`, `ResourceType`
- Interfaces: `GameMessage`, `VitalsData`, `Character`, `RoomData`

### Multiple Entry Points

Vite serves multiple pages: `index.html` (game), `editor.html` (rooms), `item-editor.html`, `spell-editor.html`, `status-editor.html`, `progression-editor.html`, `door-editor.html`, `action-editor.html`, `admin.html`, `docs.html`

## Code Conventions

### Text Output

- Use `\r\n` for line endings in MUD output
- Word-wrap to 80 characters using `wordWrap()` from `utils/textFormat.js`
- Use `.join('\r\n')` when combining lines
- **Never use em dashes (`—`) in player-visible text** (room descriptions, item descriptions, NPC dialogue, system messages). Use periods, commas, colons, or semicolons instead. Em dashes in code comments are fine.

### Items

- Names lowercase, no articles: `"iron sword"` not `"Iron Sword"` or `"an iron sword"`
- Use `withArticle(name)` when displaying: `"You pick up an iron sword"`

### Colors (from `utils/colors.js`)

| Function         | Usage                        |
| ---------------- | ---------------------------- |
| `colors.cyan()`  | Room items ("You notice...") |
| `colors.item()`  | Item names in messages       |
| `colors.green()` | Success, healing             |
| `colors.red()`   | Errors, damage               |
| `colors.gold()`  | Currency                     |

### Imports

- Use `.js` extension for local imports (ESM requirement)
- Group: external packages first, then internal modules

### Room Spatial Consistency

Room exits must be geographically consistent. Two different paths covering the same geographic distance must arrive at the same room (e.g., east-then-south must reach the same place as south-then-east). Room descriptions must match exit directions (don't write "a stairway leads north" if the exit is `down`). Organic/natural areas (parks, forests, caves) may intentionally break grid consistency but must be explicitly marked as non-Euclidean in the source.

**Corner rule for grid-based areas:** Never place two buildings at the (1,1) corner of the same intersection — that is, one building 1 step along one street and another building 1 step along the perpendicular street, both pointing into the same block. This creates a conflict where south-then-west reaches a different room than west-then-south. Fix by moving at least one building 2+ steps from the intersection, or to the opposite side of its street.

**Block boundary rule:** Buildings entering from a street must fit within the block interior (3 positions between streets). A building chain of 4+ rooms in one direction will overflow onto the adjacent street. Fix by changing direction mid-chain (e.g., east-east-south instead of east-east-east-east).

### ANSI Map Generator

Run `npm run map:arindale` to generate `maps/arindale.txt` — a text-based spatial validation map following MajorMUD conventions ([maps.mud.fyi](https://maps.mud.fyi)). **Always regenerate the map after modifying room/exit data** and check for new conflicts.

The generator places rooms on a coordinate grid via BFS from the street grid, then reports:
- **Street overlaps**: Building room at a street grid position (needs fixing)
- **Building density overlaps**: Two buildings share a block interior position (expected in dense blocks)

**Map symbols** (see legend in generated file): `@` Town Square, `*` generic room, `$` shop, `B` bank, `T` training, `H` respawn, `J` jail, `G` gate, `+` cathedral, `P` park, `I` inn, `V` tavern, `K` dock, `W` wall walk, `c` castle road, `R` residential, `%` up/down access.

**When creating new areas:** Write district data → run seed → run map generator → check for street overlaps → fix any conflicts → commit. The map is the source of truth for spatial validation.

### ASCII Map Conformance (ABSOLUTE RULE)

**Every area's seed data MUST exactly match its ASCII map in `areas/<area_name>/plan.md`.** This is non-negotiable. The ASCII map is the authoritative source of truth for room count, room connectivity, and spatial layout. Seed files are derived from the map, never the other way around.

- **Room count must match exactly.** Every node in the ASCII map (labeled or `*`) becomes a room in the seed. No rooms may be added or removed.
- **Connections must match exactly.** Every `---` (east/west) and `|` (north/south) in the ASCII map becomes a bidirectional exit pair. No connections may be added, removed, or redirected unless the map explicitly uses non-standard notation (e.g., `>>` for sub-zone entrances placed with spaces instead of dashes).
- **Labeled rooms must use their designated names/types** as specified in the map's legend (e.g., `B` = Bone Heap, `L` = Retchtail's Lair, `[EN]` = Entrance).
- **After any change to seed data**, re-verify against the ASCII map. If the map needs to change, update the map FIRST in plan.md, then update the seed to match.
- **When building a new area seed**, always parse or carefully trace the ASCII map before writing any code. Count every room and every connection. Do not estimate or approximate.

### Command Handlers

Return `CommandResponse` objects:

```typescript
return {
  type: MessageType.OUTPUT,
  message: `You pick up ${colors.item(withArticle(itemName))}.`,
};
```

Use `broadcastToRoom(roomId, message, excludePlayerId)` for room-visible actions.

## Database

**Environment variables (.env):**

```
DB_NAME=kingdoms_of_avarice
DB_USER=koa
DB_PASSWORD=<password>
DB_HOST=localhost
DB_PORT=5432
JWT_SECRET=<secret>
EMERGENCY_ACCESS_TOKEN=<optional-secret>  # For emergency IP bypass
```

**Key tables:** `players`, `rooms`, `room_exits`, `item_templates`, `item_instances`, `characters` (includes `bank_balance`), `character_progression`, `talent_unlocks`, `game_settings`, `ip_access`, `actions`

## Page Flow

After login, users land on the **Hub** page with role-based navigation:

```
Login → Hub Landing Page
         ├── Enter Game → Character Select/Create → Play
         ├── Profile → Change email/password
         ├── Developer Tools (DEVELOPER+) → Room/Item/Progression editors
         └── Admin Tools (ADMIN) → Player management, IP control, settings
```

### Profile Page

Players can manage their account:

- View username and character count
- Update email address
- Change password (requires current password)

### Character Limits

- **Global default**: Set in Admin > Settings (default: 3)
- **Per-player override**: Set in Admin > Users tab for individual players
- Players cannot create characters beyond their limit
- Per-player setting of `null` uses global default

## Admin Panel

Access via Hub > Admin Tools (requires ADMIN role). Three tabs:

### Users Tab

- **Pending Approval**: Approve new player registrations
- **All Players**: View/edit per-player character limits

### IP Access Tab

- Add/remove IP access entries
- Supports two entry types:
  - **IP Address**: Direct IP matching (e.g., `192.168.1.100`)
  - **Hostname**: DNS-resolved matching (e.g., `badactor.example.com`)
- Hostnames are resolved via DNS every 5 minutes
- Each entry can be set to **allow** or **block**

### Settings Tab

- **Max Characters Per Player**: Global default character limit
- **IP Access Mode**: Blocklist (allow all, block specific) or Allowlist (block all, allow specific)
- **Max Negative HP Percent**: Death threshold as percentage of max HP (default: 50%)
- **Dropped Tick Interval**: Milliseconds between bleed/recovery ticks (default: 5000ms)
- **Backstab Configuration**:
  - **Base Min Multiplier**: Minimum damage multiplier for backstab (default: 2.0)
  - **Base Max Multiplier**: Maximum damage multiplier for backstab (default: 4.0)
  - **Level Bonus Min**: Added to min damage per level (default: 0.5)
  - **Level Bonus Max**: Added to max damage per level (default: 1.0)

## IP Access Control

The server supports allowlist/blocklist modes for IP access control:

- **Blocklist mode** (default): Allow all IPs except those explicitly blocked
- **Allowlist mode**: Block all IPs except those explicitly allowed

**Hostname DNS Resolution:**

- Hostnames are resolved on creation and every 5 minutes thereafter
- Both IPv4 (A records) and IPv6 (AAAA records) are resolved
- Resolved IPs are cached in the `resolved_ips` column

**Always allowed:**

- Localhost IPs are always bypassed regardless of mode:
  - `127.0.0.1`, `::1`, `::ffff:127.0.0.1`
  - Any IP starting with `127.`

**Emergency access:** If locked out, set `EMERGENCY_ACCESS_TOKEN` in .env and pass it via:

- HTTP Header: `X-Emergency-Token: <token>`
- Query parameter: `?emergencyToken=<token>`
- Works for both HTTP requests and WebSocket connections

**Key files:**

- `packages/server/src/middleware/ipAccess.ts` - IP check middleware
- `packages/server/src/services/dnsResolver.ts` - DNS resolution service
- `packages/server/src/db/repositories/ipAccessRepository.ts` - IP access queries
- `packages/server/src/db/repositories/settingsRepository.ts` - Settings queries

## Role System

Six levels: PENDING, PLAYER, MODERATOR, DEVELOPER, SYSOP, ADMIN. JWT tokens in httpOnly cookies.

## In-Game Commands

### Help System

Players can access different help categories based on their role:

- `help` - Player commands (all users)
- `help actions` - List all available social actions (all users)
- `help staff` - Staff commands (MODERATOR+)
- `help developer` - Developer commands (DEVELOPER+)
- `@help` - Full admin command reference (MODERATOR+)

### Staff Commands (MODERATOR+)

| Command                            | Description                             |
| ---------------------------------- | --------------------------------------- |
| `@goto <id>`                       | Teleport to a room                      |
| `@rooms`                           | List all rooms                          |
| `@roominfo [id]`                   | Show room details                       |
| `@give <id\|name> [qty]`           | Give yourself an item                   |
| `@hurt [amount] [player]`          | Damage HP (testing)                     |
| `@drain [amount] [player]`         | Drain mana (testing)                    |
| `@learn <mnemonic>`                | Learn a spell                           |
| `@spells`                          | List all spells                         |
| `@effect <id> [duration] [player]` | Apply status effect (default 60s, self) |
| `@cleareffect <id\|all>`           | Remove status effect                    |
| `@effects`                         | List available effects                  |
| `@stealth [player]`                | Show stealth/perception breakdown       |

### Developer Commands (DEVELOPER+)

| Command                       | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `@create room <name>`         | Create a new room                                        |
| `@link <dir> <id> [oneway]`   | Link rooms                                               |
| `@unlink <dir> [oneway]`      | Remove an exit                                           |
| `@edit <field> <value>`       | Edit current room                                        |
| `@delete room <id>`           | Delete a room                                            |
| `@items`                      | List item templates                                      |
| `@iteminfo <id\|name>`        | Show item details                                        |
| `@spawn <id\|name> [qty]`     | Spawn item in your inventory                             |
| `@purge items`                | Remove all room items                                    |
| `@reload [type]`              | Reload data (rooms, items, mobs, effects, doors, actions, droptables, factions, merchants, merchantresponses, quests, progression, settings, all) |
| `@setstealth <mode> [player]` | Force stealth state (none/sneaking/hidden)               |
| `@testbackstab <target>`      | Test backstab without stealth requirement                |
| `@lockpicking [player]`       | Show lockpicking skill breakdown                         |

### Player Door Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `use <key> <direction>` | Unlock a door with a key             |
| `lock <direction>`      | Lock an unlocked door (requires key) |
| `pick <direction>`      | Pick lock (requires thief skills)    |
| `bash <direction>`      | Bash door open (uses strength)       |

### Stealth Commands

| Command                  | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `hide`                   | Attempt to hide in the shadows (requires stealth ability) |
| `sneak` (sn)             | Attempt to move stealthily (requires stealth ability)     |
| `backstab <player>` (bs) | Surprise attack from stealth (requires one-handed weapon) |
| `visible` (vis)          | Stop hiding or sneaking                                   |

**Stealth Mechanics:**

- Characters need a race or class with the `stealth` trait to use stealth commands
- Hidden players are invisible in the room unless searched
- Sneaking players are visible but don't trigger entrance/exit announcements
- Stealth breaks when entering combat, casting spells, or using actions on others

**Backstab Mechanics:**

- Must be sneaking or hidden to backstab
- Requires a one-handed weapon (cannot backstab with two-handed weapons)
- Deals high damage using multiplier: 2-4x weapon max damage + level bonuses
- Accuracy based on DEX, INT, CHA, stealth, and weapon/class bonuses
- Always breaks stealth and engages combat (hit or miss)

### Chat Commands

| Command                           | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `gossip <msg>` (gos)             | Send message to gossip channel                 |
| `gossip on/off`                   | Toggle gossip channel                          |
| `auction <msg>` (auc)            | Send message to auction channel                |
| `auction on/off`                  | Toggle auction channel                         |
| `tel <player> <msg>`             | Send private telepath to a player              |
| `tel on/off`                      | Toggle receiving telepaths                     |
| `/block <player>`                | Block telepaths from a player                  |
| `/unblock <player>`              | Unblock a player                               |
| `shout <msg>` (yel)              | Shout to room and adjacent rooms               |

### Broadcast Channels

| Command                           | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `broadcast create <name> [pass]` | Create a broadcast channel                     |
| `join br <name> [pass]`          | Join a broadcast channel                       |
| `leave <channel>`                | Leave a broadcast channel                      |
| `br <msg>`                       | Send message to your broadcast channel         |
| `br`                             | List broadcast channel members                 |

**Broadcast Mechanics:**
- One channel per player at a time
- Channels can optionally be password-protected
- Channels are automatically deleted when empty
- All channel state is in-memory (resets on server restart)

### Group Commands

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `invite <player>`  | Invite a player to your group (same room)      |
| `join <leader>`    | Accept a pending group invitation              |
| `leave`            | Leave your current group                       |
| `kick <player>`    | Kick a member from the group (leader only)     |
| `group <msg>` (gr) | Send message to group chat                     |
| `group`            | Show group status (HP/mana percentages)        |

**Group Mechanics:**
- Max 6 players per group
- Must be in same room to invite/join
- Invitations expire after 60 seconds
- Leader succession: if leader leaves, first-joined member becomes leader
- Group XP bonus: +10% per additional member, max +40%
- All group state is in-memory (resets on server restart)

### Social Commands

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `/me <text>`        | Custom emote (e.g., `/me waves goodbye`)               |
| `<action>`          | Perform a social action (e.g., `dance`, `bow`, `wave`) |
| `<action> <player>` | Target a player with an action (e.g., `wave bob`)      |

**Default Actions:** `bow`, `cackle`, `cheer`, `clap`, `cry`, `dance`, `grin`, `grovel`, `hug`, `laugh`, `nod`, `poke`, `salute`, `shrug`, `sigh`, `smirk`, `wave`, `wink`, `yawn`

### Death System Commands

| Command        | Description                                  |
| -------------- | -------------------------------------------- |
| `aid <player>` | Stabilize a fallen ally (prevents bleed-out) |
| `respawn`      | Return to life at respawn room (when dead)   |

**Death Mechanics:**

- When HP drops to 0, players collapse and enter "dropped" state
- Dropped players bleed out over time (-1 HP per tick)
- Allies can use `aid` to stabilize dropped players (+1 HP recovery per tick)
- If HP falls below the death threshold (default: -50% of max HP), the player dies
- Dead players drop all items and currency, then must `respawn`
- Respawning restores full HP/mana at the designated respawn room

### Banking Commands

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `bank` (bal, balance)     | Check bank balance (works anywhere)                  |
| `deposit all` (dep)       | Deposit all carried currency (requires bank room)    |
| `deposit <amount>`        | Deposit copper (requires bank room)                  |
| `deposit <amount> <type>` | Deposit specific currency (requires bank room)       |
| `withdraw all` (wit)      | Withdraw all funds as denominations (requires bank)  |
| `withdraw <amount>`       | Withdraw copper, auto-convert to highest denominations |
| `withdraw <amount> <type>`| Withdraw specific currency type (requires bank)      |

**Banking Mechanics:**

- Bank balance is stored in copper farthings (BIGINT) on the `characters` table
- `bank` command is informational-only and works while dead or dropped
- `deposit` and `withdraw` require being in a room with the bank feature enabled
- Withdrawals auto-convert to highest denominations for weight efficiency
- All deposit/withdraw operations use database transactions for atomicity
- Bank rooms are configured via the Room Editor (Bank Settings section)

## Git Conventions

- **Never** include `Co-Authored-By` lines in commits or pull requests
- **Never** amend a commit without explicit user approval
- Keep commit messages concise with a summary line and optional bullet points for details
