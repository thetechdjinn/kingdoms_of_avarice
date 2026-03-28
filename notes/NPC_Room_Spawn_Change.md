# Room-Based NPC Spawn System

## Context

NPC spawn config currently lives on the NPC template (`spawn_room_id`, `max_active`, `respawn_time`). This limits each template to a single spawn room, which doesn't scale for areas with 70+ rooms where you want the same mob spread across many locations. Moving spawn configuration to a per-room table allows one NPC template to spawn in multiple rooms with independent per-room max counts and respawn timers.

## New Table: `room_spawns`

```sql
CREATE TABLE IF NOT EXISTS room_spawns (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  npc_id INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  max_active INTEGER NOT NULL DEFAULT 1 CHECK (max_active >= 1),
  respawn_seconds INTEGER NOT NULL DEFAULT 60 CHECK (respawn_seconds >= 0),
  UNIQUE(room_id, npc_id)
);
```

Each NPC instance tracks which spawn point created it via `spawn_room_id` on `npc_instances`. Respawn and maxActive checks are scoped to the (npc_id, room_id) pair.

---

## Implementation Plan

### Phase 1: Database + Repository

**1a. Migration** (`packages/server/src/db/migrate.ts`)
- Create `room_spawns` table with indexes on `room_id` and `npc_id`
- Add `spawn_room_id INTEGER REFERENCES rooms(id)` column to `npc_instances`
- One-time data migration (guarded by `game_settings` flag `room_spawns_migrated`):
  - Copy existing `npcs.spawn_room_id` / `max_active` / `respawn_time` into `room_spawns`
  - Backfill `npc_instances.spawn_room_id` from `npcs.spawn_room_id`
- Do NOT drop old columns from `npcs` yet (avoids breaking in-flight data)

**1b. Shared types** (`packages/shared/src/index.ts`)
- Add `RoomSpawn` interface: `{ id, roomId, npcId, maxActive, respawnSeconds }`
- Remove `spawnRoomId`, `maxActive`, `respawnTime` from `NpcTemplate` interface

**1c. New repository** (`packages/server/src/db/repositories/spawnRepository.ts`)
- `getAllSpawns()` — for npcManager init
- `getSpawnsByRoom(roomId)` — for room editor API
- `getSpawnsByNpc(npcId)` — for NPC editor read-only display
- `createSpawn({ roomId, npcId, maxActive, respawnSeconds })`
- `updateSpawn(id, { maxActive?, respawnSeconds? })`
- `deleteSpawn(id)`

**1d. Update npcRepository** (`packages/server/src/db/repositories/npcRepository.ts`)
- `DbNpcInstance`: add `spawn_room_id: number | null`
- `createInstance()`: add `spawnRoomId` param, include in INSERT
- `saveInstances()`: add `spawnRoomId` to upsert
- `getAllInstances()`: already returns `SELECT *`, will pick up new column
- `dbToTemplate()`: stop mapping `spawn_room_id`, `max_active`, `respawn_time`
- `CreateNpcTemplateInput` / `updateTemplate()`: remove `spawnRoomId`, `maxActive`, `respawnTime` field mappings

### Phase 2: NPC Manager Refactor

**2a. In-memory spawn config** (`packages/server/src/game/npcManager.ts`)
- Add new Map: `const spawnConfigs = new Map<string, RoomSpawn>()` keyed by `${npcId}_${roomId}`
- Add helper: `getSpawnConfig(npcId, roomId)` to look up config
- Export `reloadSpawnConfigs()` for `@reload spawns`

**2b. NpcCombatInstance** — Add field: `spawnRoomId: number`

**2c. initializeNpcManager()**
- After loading templates, load spawn configs via `spawnRepo.getAllSpawns()`
- Populate `spawnConfigs` Map
- When loading existing DB instances: read `inst.spawn_room_id` and pass to `createNpcCombatEntity()`
- When handling dead instances: look up spawn config for `(inst.npc_id, inst.spawn_room_id)` to get respawn_seconds; queue respawn only if config exists
- Initial spawn loop: iterate `spawnConfigs` instead of templates. For each config, count live instances with matching (templateId, spawnRoomId), spawn up to maxActive

**2d. spawnNpcFromTemplate()**
- Add param: `spawnRoomId: number` (the origin spawn room, may differ from actual roomId for `@spawn`)
- Pass to `npcRepo.createInstance()`
- Store on `NpcCombatInstance`

**2e. queueRespawn()**
- Change maxActive check: look up spawn config for maxActive
- Change liveCount filter: scope by both `templateId` AND `spawnRoomId`
- Change pendingCount filter: scope by both `templateId` AND `spawnRoomId`

**2f. processRespawnQueue()**
- Change maxActive guard: look up spawn config, scope liveCount by (templateId, spawnRoomId)

**2g. processCorpseCleanup()**
- Read `npc.spawnRoomId` instead of `template.spawnRoomId`; look up spawn config for respawnSeconds

**2h. reloadNpcTemplates()**
- Also reload spawn configs
- Initial spawn check: iterate spawn configs instead of templates

**2i. spawnNpcPublic()**
- Pass `roomId` as `spawnRoomId` (manual spawns use the target room as origin)

### Phase 3: Death Handler + Behavior

**3a. npcDeathHandler.ts**
- Read `npc.spawnRoomId` instead of `template.spawnRoomId`
- Look up spawn config for respawn_seconds instead of `template.respawnTime`
- Guard: only queue respawn if spawn config exists and `respawnSeconds > 0`

**3b. npcBehavior.ts**
- `processReturnMovement()`: read `npc.spawnRoomId` instead of `npc.template.spawnRoomId`

### Phase 4: REST API

**4a. New spawn routes** (`packages/server/src/routes/spawns.ts`)
- `GET /api/room-spawns?room_id=X` — spawns for a room (with NPC name joined)
- `GET /api/room-spawns?npc_id=X` — spawns for an NPC (with room name joined)
- `POST /api/room-spawns` — create spawn entry
- `PUT /api/room-spawns/:id` — update max_active / respawn_seconds
- `DELETE /api/room-spawns/:id` — delete spawn entry
- All routes `requireDeveloper`

**4b. Register routes** (`packages/server/src/index.ts`)

**4c. Update NPC routes** (`packages/server/src/routes/npcs.ts`)
- Remove `spawnRoomId`, `maxActive`, `respawnTime` from create/update payloads
- On NPC delete: spawn entries cascade via FK, but also call `reloadSpawnConfigs()` after delete

### Phase 5: NPC Editor Changes

**5a. Remove spawn fields from Basic tab** (`packages/client/npc-editor.html`)
- Remove the form-row containing `npc-spawn-room`, `npc-respawn-time`, `npc-max-active`

**5b. Add read-only Spawn Locations section** (`packages/client/npc-editor.html`)
- Below the Basic tab content, add a `<div id="npc-spawn-locations">` with a table

**5c. Update npc-editor.ts**
- Remove `spawnRoomId`, `maxActive`, `respawnTime` from local interface and form handling
- Add `loadSpawnLocations(npcId)`: fetch `GET /api/room-spawns?npc_id=X`, render table with columns: Room Name, Room ID, Max Active, Respawn (s)
- Include a "Manage in Room Editor" note

### Phase 6: Room Editor Changes

**6a. Add Spawns tab** (`packages/client/editor.html`)
- New tab button alongside Basic, Features, Exits, Doors
- Tab content: spawn entry list + add form (NPC dropdown, max_active input, respawn_seconds input)

**6b. Update editor.ts**
- Load NPC templates for dropdown: `GET /api/npcs` (name + id)
- On room selection, fetch `GET /api/room-spawns?room_id=X` and render entries
- CRUD against `/api/room-spawns`

### Phase 7: @reload Command + Data Import/Export

**7a. @reload spawns** (`packages/server/src/game/adminCommands.ts`)
- Add `'spawns'` to `validTargets` array
- Add handler that calls `reloadSpawnConfigs()` from npcManager
- Include in `@reload all`
- Update `@reload` help text

**7b. Data export** (`packages/server/src/db/data-export.ts`)
- In room export: add `spawns` array to each room object with `{ npcName, maxActive, respawnSeconds }`
- In NPC export: remove `spawnRoomTag`, `respawnTime`, `maxActive` fields

**7c. Data import** (`packages/server/src/db/data-import.ts`)
- In room import phase 2: process `spawns` array, resolve NPC names to IDs, upsert into `room_spawns`
- In NPC import: remove spawn-related field handling
- Backward compat: if NPC import data has old `spawnRoomTag` fields, create room_spawn entry from it (log deprecation warning)

---

## Key Files Modified

| File | Changes |
|------|---------|
| `packages/server/src/db/migrate.ts` | New table, column, data migration |
| `packages/server/src/db/repositories/spawnRepository.ts` | **NEW** — CRUD for room_spawns |
| `packages/server/src/db/repositories/npcRepository.ts` | Instance spawn_room_id, remove template spawn fields |
| `packages/shared/src/index.ts` | Add RoomSpawn, remove 3 fields from NpcTemplate |
| `packages/server/src/game/npcManager.ts` | Spawn config map, per-instance origin, scoped maxActive |
| `packages/server/src/game/npcDeathHandler.ts` | Read spawn config instead of template fields |
| `packages/server/src/game/npcBehavior.ts` | Read npc.spawnRoomId instead of template.spawnRoomId |
| `packages/server/src/routes/spawns.ts` | **NEW** — REST API for room_spawns |
| `packages/server/src/index.ts` | Register spawn routes |
| `packages/server/src/routes/npcs.ts` | Remove spawn fields from payloads |
| `packages/client/npc-editor.html` | Remove spawn inputs, add read-only section |
| `packages/client/src/npc-editor.ts` | Remove spawn field handling, add spawn display |
| `packages/client/editor.html` | Add Spawns tab |
| `packages/client/src/editor.ts` | Spawns tab CRUD |
| `packages/server/src/game/adminCommands.ts` | @reload spawns |
| `packages/server/src/game/commands.ts` | Help text for @reload |
| `packages/server/src/db/data-export.ts` | Spawns in room export |
| `packages/server/src/db/data-import.ts` | Import spawns, backward compat |
