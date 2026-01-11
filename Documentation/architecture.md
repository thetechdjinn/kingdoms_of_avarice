# Architecture

[← Back to Documentation](README.md)

This document provides a technical overview of the Kingdoms of Avarice codebase.

## Tech Stack

| Layer        | Technology                              |
| ------------ | --------------------------------------- |
| Frontend     | Vite + TypeScript + xterm.js            |
| Backend      | Node.js + Express + WebSocket           |
| Database     | PostgreSQL                              |
| Shared Types | TypeScript monorepo with shared package |

## Package Structure

### `packages/shared`

Shared TypeScript types and enums used by both client and server:

- `MessageType` - WebSocket message types (COMMAND, OUTPUT, SYSTEM, ERROR, VITALS, LOGOUT)
- `Role` - User roles (PENDING, PLAYER, MODERATOR, ADMIN, DEVELOPER, SYSOP)
- `GameMessage` - WebSocket message structure
- `VitalsData` - Player health/resource data

### `packages/client`

Frontend application:

- **xterm.js** - Terminal emulator for the game interface
- **WebSocket client** - Real-time communication with server
- **Pages**: Login, Game, Admin Panel, Room Editor

### `packages/server`

Backend application:

- **Express** - HTTP API for authentication and admin functions
- **WebSocket** - Real-time game communication
- **Game Engine** - Command processing, room management, player state
- **Database** - PostgreSQL with repository pattern

## Communication Flow

```
+----------+    WebSocket    +----------+     SQL     +------------+
|  Client  | <-------------> |  Server  | <---------> | PostgreSQL |
| (xterm)  |                 |  (Node)  |             |            |
+----------+                 +----------+             +------------+
```

1. Player types command in terminal
2. Client sends `COMMAND` message via WebSocket
3. Server processes command through game engine
4. Server sends `OUTPUT`/`SYSTEM`/`ERROR` response
5. Client renders response in terminal

## Database Schema

### Core Tables

- **players** - Account information, credentials, settings
- **player_roles** - Role assignments (many-to-many)
- **rooms** - Game world rooms with descriptions
- **room_exits** - Connections between rooms

### Key Fields

```sql
players:
  - id, username, password_hash
  - brief_mode (boolean)
  - current_room_id (persistence)

rooms:
  - id, name, description, area

room_exits:
  - from_room_id, direction, to_room_id
```

## Authentication

- JWT tokens stored in httpOnly cookies
- Role-based access control
- Session persistence across page reloads

## Game Systems

### Room Management

- Rooms organized by areas
- Bidirectional exits supported
- Room editor for developers

### Player State

- Location tracked in memory (`playerLocations` map)
- Persisted to database on movement
- Brief mode preference saved

### Broadcasting

- `broadcastToAll()` - Server-wide messages
- `broadcastToRoom()` - Room-local messages
- Used for: player movement, speech, connections

---

[← Back to Documentation](README.md)
