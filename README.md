# Kingdoms of Avarice

A web-based MUD (Multi-User Dungeon) game inspired by the classic MajorMUD.

## Tech Stack

- **Frontend:** Vite + TypeScript + xterm.js
- **Backend:** Node.js + Express + WebSocket
- **Database:** Turso / libSQL (local embedded SQLite file)

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

The database is a local embedded file (Turso / libSQL). There is no database server, Docker, or separate installation required.

### 1. Configure Environment

Create a `.env` file in the project root. The database path is optional and defaults to `./data.db`:

```env
TURSO_PATH=./data.db   # Optional — local DB file (LOCAL, not Turso Cloud)
JWT_SECRET=<secret>
```

See the [Database Setup Guide](Documentation/Database_Setup.md) for details.

### 2. Install and Set Up

```bash
npm run setup
```

This single command:
1. Installs all dependencies
2. Builds shared TypeScript types
3. Runs database migrations (creates tables, seeds settings)
4. Imports all game data (rooms, NPCs, items, spells, doors, etc.)

### 3. Start the Game

```bash
npm run dev
```

This will start:

- Frontend on http://localhost:3000
- Backend on http://localhost:3001

### 4. Log In as Admin

The first run of a fresh database creates an admin account automatically:

- If you set `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, log in with those.
- Otherwise, a random `admin` password is printed to the server logs on first startup (look for the "no admin configured" banner). Log in with `admin` and that password.

Then open http://localhost:3000, register your own account, and promote it via **Admin > Users**. See the [Database Setup Guide](Documentation/Database_Setup.md#first-admin-account-bootstrap) for details.

To grant admin to an already-registered account from the CLI:

```bash
cd packages/server && npx tsx src/db/create-admin.ts <username>
```

### Manual Setup (Step by Step)

If you prefer to run each step individually instead of `npm run setup`:

```bash
npm install              # Install dependencies
npm run build:shared     # Build shared types
npm run migrate          # Create database tables and seed settings
npm run data:import      # Import all game data
npm run dev              # Start development servers
```

## Run with Docker

The image (`dcbrown73/kingdoms-of-avarice`) is a single self-contained container: the server serves the client, the API, and the game WebSocket on one port, backed by a local Turso/libSQL database file. There are two ways to run it — the **[full Docker Deployment guide](Documentation/Docker_Deployment.md)** covers both in detail (env vars, volumes, backups, updates, HTTPS). Quick starts:

### Demo (ephemeral — wiped when removed)

```bash
docker run -d --name koa -p 3001:3001 dcbrown73/kingdoms-of-avarice:latest
docker logs koa | grep -A5 "no admin configured"   # your admin login (username "admin")
```

Open http://localhost:3001 and log in as `admin` with the password from the logs (random, shown only there). Tear it down with `docker rm -f koa` — the world is wiped. See [Demo / ephemeral mode](Documentation/Docker_Deployment.md#demo--ephemeral-mode).

### Persistent game server

Download [`docker-compose.yml`](docker-compose.yml), set `JWT_SECRET` and `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`, then:

```bash
docker compose up -d
```

Data is stored in the `koa-data` volume (survives restarts and updates); content is imported only on first boot; your admin is created once. See [Persistent game server mode](Documentation/Docker_Deployment.md#persistent-game-server-mode).

## Project Structure

```
packages/
  shared/   # Shared TypeScript types
  client/   # Vite + xterm.js frontend
  server/   # Node.js + Express + WebSocket backend
```

## Commands (In-Game)

- `look` (l) - Look around the current room
- `<direction>` - Move in a direction (n, s, e, w, ne, nw, se, sw, u, d)
- `brief` - Toggle brief mode (hide room descriptions)
- `who` - See who is online
- `x` - Exit the game (meditate to leave)
- `help` - Show available commands

See [Documentation](Documentation/README.md) for full command reference.

## License

MIT
