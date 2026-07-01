# Room Creation Guide

This guide covers all methods for creating and managing rooms in Kingdoms of Avarice.

## Prerequisites

**Required Role:** Developer or System Admin

Room creation tools require the **Developer** or **Admin** role. See [RBAC_Guide.md](./RBAC_Guide.md) for details on roles and permissions.

## Table of Contents

1. [In-Game Admin Commands](#in-game-admin-commands)
2. [Web-Based Room Editor](#web-based-room-editor)
3. [REST API](#rest-api)
4. [Direct Database Import](#direct-database-import)

---

## In-Game Admin Commands

While playing the game, users with Developer or Admin role can use `@` commands to create and manage rooms in real-time.

### Creating a Room

```
@create room <name>
```

Creates a new room with the specified name. The room inherits the area from your current location.

**Example:**

```
@create room The Dark Cellar
```

### Editing the Current Room

```
@edit <field> <value>
```

Fields:

- `name` - Room name
- `desc` or `description` - Room description
- `area` - Area name (creates new area if it doesn't exist)

**Examples:**

```
@edit name The Haunted Cellar
@edit desc A damp, musty cellar filled with cobwebs and the faint sound of dripping water.
@edit area Arindale Underground
```

### Linking Rooms

```
@link <direction> <room_id> [oneway]
```

Creates an exit from the current room to the target room. By default, creates a two-way link.

**Directions:** north, south, east, west, up, down, northeast, northwest, southeast, southwest

**Examples:**

```
@link north 7
@link down 12 oneway
```

### Unlinking Rooms

```
@unlink <direction> [oneway]
```

Removes an exit. By default, removes both directions.

**Example:**

```
@unlink north
```

### Navigation & Information

| Command               | Description                    |
| --------------------- | ------------------------------ |
| `@goto <room_id>`     | Teleport to a room             |
| `@rooms`              | List all rooms grouped by area |
| `@roominfo [room_id]` | Show detailed room information |
| `@help`               | Show all admin commands        |

### Deleting a Room

```
@delete room <room_id>
```

**Note:** Cannot delete room ID 1 (the starting room).

---

## Web-Based Room Editor

Access the visual room editor at: `http://localhost:3000/editor.html`

### Features

- **Room List Panel** - Browse and filter rooms by area
- **Room Editor Panel** - Edit room properties and exits
- **Map Preview** - Visual representation of connected rooms

### Creating a New Room

1. Click **+ New Room** button
2. Enter the room name when prompted
3. Edit the room's properties in the editor panel
4. Click **Save Room**

### Editing a Room

1. Select a room from the list
2. Modify the fields:
   - **Name** - Room display name
   - **Area** - Type existing area or create new one
   - **Description** - Full room description
3. Click **Save Room**

### Managing Exits

**Adding an Exit:**

1. Select direction from dropdown
2. Select target room
3. Check/uncheck "Two-way" for bidirectional linking
4. Click **Add Exit**

**Removing an Exit:**

- Click the **×** button next to the exit

### Managing Areas

1. Click the **⚙** button next to the area filter
2. View all areas with room counts
3. Click **Rename** to rename an area (updates all rooms)

### Managing Doors

The Room Editor includes a **Doors** section that shows all doors connected to the currently selected room. Doors add mechanics (locks, triggers, permissions) on top of regular exits.

**Viewing Doors:**
- The Doors section appears below the Exits section
- Shows door name, direction, type, and connection

**Editing a Door:**
- Click any door in the list to open it in the Door Editor
- The door will be pre-selected for editing

**Creating a New Door:**
1. Click **+ New Door for This Room**
2. Enter a door name when prompted
3. You'll be taken to the Door Editor with the door created and entry room pre-filled
4. Configure the door type, exit room, direction, and other settings

**Quick Access:**
- Click **Open Door Editor** to access the full Door Editor for bulk management

For detailed door configuration options, see [Door_System_Guide.md](./Door_System_Guide.md).

---

## REST API

The server exposes REST endpoints for programmatic room management.

### Base URL

```
http://localhost:3001/api
```

### Endpoints

#### List All Rooms

```http
GET /api/rooms
```

**Response:**

```json
{
  "success": true,
  "rooms": [
    {
      "id": 1,
      "name": "Town Square",
      "description": "A bustling town square...",
      "area": "Arindale",
      "exits": {
        "north": 2,
        "east": 3,
        "south": 4,
        "west": 5
      }
    }
  ]
}
```

#### Get Single Room

```http
GET /api/rooms/:id
```

#### Create Room

```http
POST /api/rooms
Content-Type: application/json

{
  "name": "The Dark Forest",
  "description": "Twisted trees block out the sunlight...",
  "area": "Wilderness"
}
```

**Response:**

```json
{
  "success": true,
  "room": {
    "id": 7,
    "name": "The Dark Forest",
    "description": "Twisted trees block out the sunlight...",
    "area": "Wilderness",
    "exits": {}
  }
}
```

#### Update Room

```http
PUT /api/rooms/:id
Content-Type: application/json

{
  "name": "The Haunted Forest",
  "description": "Updated description...",
  "area": "Dark Lands"
}
```

#### Delete Room

```http
DELETE /api/rooms/:id
```

#### Create Exit

```http
POST /api/rooms/:id/exits
Content-Type: application/json

{
  "direction": "north",
  "toRoomId": 8,
  "bidirectional": true
}
```

#### Delete Exit

```http
DELETE /api/rooms/:id/exits/:direction?bidirectional=true
```

#### List Areas

```http
GET /api/areas
```

#### Rename Area

```http
PUT /api/areas/:name
Content-Type: application/json

{
  "newName": "New Area Name"
}
```

---

## Direct Database Import

For bulk imports, you can insert directly into the database (the local Turso / libSQL SQLite file, `data.db`).

### Database Schema

#### Rooms Table

```sql
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    area VARCHAR(100)
);
```

#### Room Exits Table

```sql
CREATE TABLE room_exits (
    id SERIAL PRIMARY KEY,
    from_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    to_room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,
    UNIQUE(from_room_id, direction)
);
```

### Import Format

#### SQL Import

```sql
-- Insert rooms
INSERT INTO rooms (name, description, area) VALUES
('Forest Entrance', 'The edge of a dark forest stretches before you.', 'Dark Forest'),
('Forest Path', 'A winding path through ancient trees.', 'Dark Forest'),
('Forest Clearing', 'A small clearing with a mossy stone altar.', 'Dark Forest');

-- Get the IDs of inserted rooms and create exits
-- Assuming IDs 7, 8, 9 were assigned:
INSERT INTO room_exits (from_room_id, to_room_id, direction) VALUES
(7, 8, 'north'),
(8, 7, 'south'),
(8, 9, 'east'),
(9, 8, 'west');
```

#### JSON Import Format

For programmatic imports via the API, use this format:

```json
{
  "rooms": [
    {
      "name": "Forest Entrance",
      "description": "The edge of a dark forest stretches before you.",
      "area": "Dark Forest"
    },
    {
      "name": "Forest Path",
      "description": "A winding path through ancient trees.",
      "area": "Dark Forest"
    }
  ],
  "exits": [
    {
      "fromRoomName": "Forest Entrance",
      "toRoomName": "Forest Path",
      "direction": "north",
      "bidirectional": true
    }
  ]
}
```

**Note:** The JSON format above is for reference. To import, you would need to:

1. Create each room via `POST /api/rooms`
2. Note the returned IDs
3. Create exits via `POST /api/rooms/:id/exits`

### Bulk Import Script Example

```javascript
// Example Node.js script for bulk import
const rooms = [
  { name: "Room A", description: "Description A", area: "Area 1" },
  { name: "Room B", description: "Description B", area: "Area 1" },
];

const exits = [{ from: "Room A", to: "Room B", direction: "north" }];

async function importRooms() {
  const roomIds = new Map();

  // Create rooms
  for (const room of rooms) {
    const res = await fetch("http://localhost:3001/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(room),
    });
    const data = await res.json();
    roomIds.set(room.name, data.room.id);
  }

  // Create exits
  for (const exit of exits) {
    const fromId = roomIds.get(exit.from);
    const toId = roomIds.get(exit.to);

    await fetch(`http://localhost:3001/api/rooms/${fromId}/exits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: exit.direction,
        toRoomId: toId,
        bidirectional: true,
      }),
    });
  }
}

importRooms();
```

---

## Room Features

Rooms can have special features that enable specific gameplay mechanics. These are configured in the Room Editor under collapsible sections.

### Training Rooms

Training rooms allow players to level up their characters and allocate character points.

**Configuration Options:**

| Field | Description |
|-------|-------------|
| Enable Training Room | Activates training functionality for this room |
| Min Level | Minimum level required to train here (default: 1) |
| Max Level | Maximum level this room can train up to (default: 999) |
| Allowed Classes | Which classes can train here (all if none selected) |

**Example Use Cases:**
- Guild halls that only train their respective class
- Newbie training areas with level caps
- End-game training facilities with minimum level requirements

### Respawn Points

Respawn points determine where players appear after death. When a player dies, the system finds the appropriate respawn point using this fallback chain:

1. **Area Respawn Room** - A designated respawn point for the area where they died
2. **Global Default** - Configurable in game settings (`default_respawn_room_id`)
3. **Room 1** - Hardcoded last resort fallback

**Configuration Options:**

| Field | Description |
|-------|-------------|
| Mark as Respawn Point | Enables this room as a respawn location |
| Priority | Lower number = higher priority (default: 0). If multiple respawn rooms serve the same area, the lowest priority wins |
| Served Areas | Additional areas (besides this room's own area) that should respawn here |

**How It Works:**

A respawn room automatically serves its own area. Use the "Served Areas" option to make it serve additional areas. This is useful for:

- **Dungeon respawns**: Make the dungeon entrance (in the town) also serve the dungeon area
- **Regional hubs**: A central town serves multiple surrounding wilderness areas
- **Hierarchical areas**: Sub-areas respawn at a main area's respawn point

**Example Configuration:**

| Room | Area | Respawn Enabled | Served Areas | Priority |
|------|------|-----------------|--------------|----------|
| Town Square | Arindale | Yes | Arindale Sewers, Arindale Forest | 0 |
| Sewer Entrance | Arindale Sewers | Yes | | 10 |

With this setup:
- Die in **Arindale** → respawn at Town Square
- Die in **Arindale Sewers** → respawn at Town Square (priority 0 beats 10)
- Die in **Arindale Forest** → respawn at Town Square

If you wanted Arindale Sewers to have its own respawn (Sewer Entrance), remove "Arindale Sewers" from Town Square's served areas.

### Bank Rooms

Bank rooms allow players to deposit and withdraw currency using a persistent bank balance.

**Configuration Options:**

| Field | Description |
|-------|-------------|
| Mark as Bank | Enables banking functionality for this room |

**How It Works:**

When a room has the bank feature enabled, players in that room can use `deposit` and `withdraw` commands to manage their bank balance. The `bank` command to check balance works anywhere.

**Example Use Cases:**
- Town banks for safe currency storage
- Guild vaults
- Merchant district banking houses

**Setting Up a Bank Room:**

1. Open the Room Editor
2. Select or create the room
3. Expand the "Bank Settings" collapsible section
4. Check "Mark as Bank"
5. Save the room

The room's features JSON will include `"bank": {"enabled": true}`.

**Setting a Global Default:**

To configure the fallback respawn room (used when an area has no designated respawn point):

1. Go to **Admin Panel** → **Game Settings**
2. Add setting: `default_respawn_room_id` with the room ID value
3. Save

---

## Best Practices

1. **Plan your areas** - Group related rooms into areas for easier navigation and filtering
2. **Use descriptive names** - Room names should be unique and descriptive
3. **Write immersive descriptions** - Include sensory details (sights, sounds, smells)
4. **Link logically** - Ensure exits make geographic sense
5. **Test navigation** - Walk through new areas to verify all exits work correctly
6. **Backup regularly** - Export room data before major changes

---

## Troubleshooting

### "Failed to create room" Error

- Check if the database sequence is out of sync
- Run: `SELECT setval('rooms_id_seq', (SELECT MAX(id) FROM rooms));`

### Room not appearing in game

- The game world caches rooms on startup
- Restart the server or use `@goto <id>` to force a reload

### Exits not working

- Verify both rooms exist
- Check if the exit was created as one-way when it should be two-way
