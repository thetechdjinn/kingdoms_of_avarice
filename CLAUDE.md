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
| Function | Usage |
|----------|-------|
| `colors.cyan()` | Room items ("You notice...") |
| `colors.item()` | Item names in messages |
| `colors.green()` | Success, healing |
| `colors.red()` | Errors, damage |
| `colors.gold()` | Currency |

### Imports
- Use `.js` extension for local imports (ESM requirement)
- Group: external packages first, then internal modules

### Command Handlers
Return `CommandResponse` objects:
```typescript
return {
  type: MessageType.OUTPUT,
  message: `You pick up ${colors.item(withArticle(itemName))}.`
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
```

**Key tables:** `players`, `rooms`, `room_exits`, `item_templates`, `item_instances`, `character_progression`, `talent_unlocks`

## Role System
Six levels: PENDING, PLAYER, MODERATOR, DEVELOPER, SYSOP, ADMIN. JWT tokens in httpOnly cookies.
