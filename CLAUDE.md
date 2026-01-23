# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kingdoms of Avarice is a web-based MUD (Multi-User Dungeon) inspired by MajorMUD. TypeScript monorepo with real-time WebSocket communication and a terminal-style xterm.js interface.

## Commands

```bash
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
- Additional: `itemCommands.ts`, `adminCommands.ts`, `progressionCommands.ts`

**Shared Types:**

- Enums: `MessageType`, `Role`, `ItemType`, `EquipmentSlot`, `ResourceType`
- Interfaces: `GameMessage`, `VitalsData`, `Character`, `RoomData`

### Multiple Entry Points

Vite serves multiple pages: `index.html` (game), `editor.html` (rooms), `item-editor.html`, `progression-editor.html`, `admin.html`, `docs.html`

## Code Conventions

### Text Output

- Use `\r\n` for line endings in MUD output
- Word-wrap to 80 characters using `wordWrap()` from `utils/textFormat.js`
- Use `.join('\r\n')` when combining lines

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

**Key tables:** `players`, `rooms`, `room_exits`, `item_templates`, `item_instances`, `character_progression`, `talent_unlocks`, `game_settings`, `ip_access`

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

## Git Conventions

- **Never** include `Co-Authored-By` lines in commits or pull requests
- **Never** amend a commit without explicit user approval
- Keep commit messages concise with a summary line and optional bullet points for details
