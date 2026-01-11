# Role-Based Access Control (RBAC) Guide

This guide covers the role-based access control system in Kingdoms of Avarice.

## Table of Contents

1. [Overview](#overview)
2. [Roles](#roles)
3. [Role Assignment](#role-assignment)
4. [Permission Matrix](#permission-matrix)
5. [API Authentication](#api-authentication)
6. [Database Schema](#database-schema)

---

## Overview

Kingdoms of Avarice uses a role-based access control system to manage user permissions. Players can have multiple roles, and each role grants specific capabilities within the game and administrative tools.

**Key Principles:**

- Players can have multiple roles simultaneously
- System Admin role grants access to everything (no need for other roles)
- New registrations receive the Pending role and must be approved before playing
- Role checks are enforced both in-game and via API middleware

---

## Roles

### Pending

- **Description:** Registered but not yet approved to play
- **Priority:** 0
- **Capabilities:** None - cannot log into the game

### Player

- **Description:** Approved player with rights to play the game
- **Priority:** 10
- **Capabilities:**
  - Log into the game
  - Create and play characters
  - Use standard game commands

### Game Moderator

- **Description:** Can assist or block players in game
- **Priority:** 20
- **Capabilities:**
  - All Player capabilities
  - Use `@goto` to teleport to rooms
  - Use `@rooms` to list all rooms
  - Use `@roominfo` to view room details
  - Use `@help` to see admin commands

### Game Sysop

- **Description:** Extended moderation capabilities
- **Priority:** 30
- **Capabilities:**
  - All Moderator capabilities
  - Additional system operations (future)

### Developer

- **Description:** Can create game content (rooms, items, monsters)
- **Priority:** 40
- **Capabilities:**
  - All Moderator capabilities
  - Access to Room Editor (`/editor.html`)
  - Use `@create room` to create rooms
  - Use `@link` and `@unlink` to manage exits
  - Use `@edit` to modify room properties
  - Use `@delete room` to remove rooms
  - Use `@reload` to refresh game data from database
  - Full access to room API endpoints

### System Admin

- **Description:** Full control over all game systems
- **Priority:** 100
- **Capabilities:**
  - **All capabilities from all roles**
  - User management
  - Role assignment
  - System configuration

---

## Role Assignment

### New Player Registration

When a player registers:

1. Account is created in the `players` table
2. `Pending` role is automatically assigned
3. Player sees message: "Your account is pending approval"
4. Player cannot log in until approved

### Approving Players

To approve a pending player (requires Admin):

```sql
-- Via database
INSERT INTO player_roles (player_id, role_id, granted_by)
SELECT p.id, r.id, <admin_player_id>
FROM players p, roles r
WHERE p.username = '<username>' AND r.name = 'player';
```

Or use the role repository function:

```typescript
import { approvePlayer } from "./db/repositories/roleRepository";
await approvePlayer(playerId, adminPlayerId);
```

### Assigning Additional Roles

```typescript
import { assignRole } from "./db/repositories/roleRepository";
import { Role } from "@koa/shared";

// Assign Developer role
await assignRole(playerId, Role.DEVELOPER, grantedByPlayerId);

// Assign Admin role
await assignRole(playerId, Role.ADMIN, grantedByPlayerId);
```

### Removing Roles

```typescript
import { removeRole } from "./db/repositories/roleRepository";
import { Role } from "@koa/shared";

await removeRole(playerId, Role.DEVELOPER);
```

---

## Permission Matrix

| Feature        | Pending | Player | Moderator | Sysop | Developer | Admin |
| -------------- | ------- | ------ | --------- | ----- | --------- | ----- |
| Login to game  | ❌      | ✅     | ✅        | ✅    | ✅        | ✅    |
| Play game      | ❌      | ✅     | ✅        | ✅    | ✅        | ✅    |
| @goto          | ❌      | ❌     | ✅        | ✅    | ✅        | ✅    |
| @rooms         | ❌      | ❌     | ✅        | ✅    | ✅        | ✅    |
| @roominfo      | ❌      | ❌     | ✅        | ✅    | ✅        | ✅    |
| @create room   | ❌      | ❌     | ❌        | ❌    | ✅        | ✅    |
| @link/@unlink  | ❌      | ❌     | ❌        | ❌    | ✅        | ✅    |
| @edit          | ❌      | ❌     | ❌        | ❌    | ✅        | ✅    |
| @delete room   | ❌      | ❌     | ❌        | ❌    | ✅        | ✅    |
| @reload        | ❌      | ❌     | ❌        | ❌    | ✅        | ✅    |
| Room Editor UI | ❌      | ❌     | ❌        | ❌    | ✅        | ✅    |
| Room API       | ❌      | ❌     | ❌        | ❌    | ✅        | ✅    |

---

## API Authentication

### Authentication Flow

1. User logs in via `POST /api/login`
2. Server validates credentials and checks roles
3. If user has `Player` role (or higher), JWT token is issued
4. Token contains: `playerId`, `username`, `roles[]`
5. Token is stored in HTTP-only cookie `koa_token`

### Checking Authentication Status

```http
GET /api/auth/me
```

**Response (authenticated):**

```json
{
  "authenticated": true,
  "playerId": 1,
  "username": "admin",
  "roles": ["player", "developer", "admin"]
}
```

**Response (not authenticated):**

```json
{
  "authenticated": false
}
```

### Protected API Endpoints

Room API endpoints require Developer or Admin role:

| Endpoint                    | Method | Required Role |
| --------------------------- | ------ | ------------- |
| `/api/rooms`                | GET    | Developer     |
| `/api/rooms/:id`            | GET    | Developer     |
| `/api/rooms`                | POST   | Developer     |
| `/api/rooms/:id`            | PUT    | Developer     |
| `/api/rooms/:id`            | DELETE | Developer     |
| `/api/rooms/:id/exits`      | POST   | Developer     |
| `/api/rooms/:id/exits/:dir` | DELETE | Developer     |
| `/api/areas`                | GET    | Developer     |
| `/api/areas/:name`          | PUT    | Developer     |

### Using Middleware

```typescript
import { requireDeveloper, requireAdmin, requireAuth } from "./middleware/auth";

// Require any authenticated user
app.get("/api/profile", requireAuth, handler);

// Require Developer or Admin role
app.post("/api/rooms", requireDeveloper, handler);

// Require Admin role only
app.delete("/api/users/:id", requireAdmin, handler);
```

---

## Database Schema

### Roles Table

```sql
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0
);
```

**Default roles:**
| id | name | priority |
|----|------|----------|
| 1 | pending | 0 |
| 2 | player | 10 |
| 3 | moderator | 20 |
| 4 | sysop | 30 |
| 5 | developer | 40 |
| 6 | admin | 100 |

### Player Roles Table

```sql
CREATE TABLE player_roles (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER REFERENCES players(id),
    UNIQUE(player_id, role_id)
);
```

### Querying Player Roles

```sql
-- Get all roles for a player
SELECT r.name, r.description, pr.granted_at
FROM roles r
JOIN player_roles pr ON r.id = pr.role_id
WHERE pr.player_id = <player_id>;

-- Get all players with a specific role
SELECT p.username, pr.granted_at
FROM players p
JOIN player_roles pr ON p.id = pr.player_id
JOIN roles r ON pr.role_id = r.id
WHERE r.name = 'developer';

-- Get pending players awaiting approval
SELECT p.id, p.username, p.created_at
FROM players p
JOIN player_roles pr ON p.id = pr.player_id
JOIN roles r ON pr.role_id = r.id
WHERE r.name = 'pending'
AND NOT EXISTS (
    SELECT 1 FROM player_roles pr2
    JOIN roles r2 ON pr2.role_id = r2.id
    WHERE pr2.player_id = p.id AND r2.name = 'player'
);
```

---

## Quick Setup: Creating an Admin User

To create the first admin user:

```sql
-- 1. Register normally through the UI, then:

-- 2. Add Player role (to allow login)
INSERT INTO player_roles (player_id, role_id)
SELECT p.id, r.id FROM players p, roles r
WHERE p.username = 'yourusername' AND r.name = 'player';

-- 3. Add Admin role
INSERT INTO player_roles (player_id, role_id)
SELECT p.id, r.id FROM players p, roles r
WHERE p.username = 'yourusername' AND r.name = 'admin';
```

Or use the provided script:

```bash
npx tsx packages/server/src/db/create-admin.ts <username>
```
