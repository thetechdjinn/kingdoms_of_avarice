# Getting Started

[← Back to Documentation](README.md)

This guide covers setting up the project **from source** for local development.

> **Just want to run the game?** You don't need a source checkout. Use the prebuilt Docker image instead — see the **[Docker Deployment guide](Docker_Deployment.md)** for the demo (ephemeral) and persistent game-server setups.

## Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher

The database is a local embedded file (Turso / libSQL). There is no database server to install or run.

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Kingdoms_of_Avarice
```

### 2. Configure Environment

Create a `.env` file in the project root. The database path is optional and defaults to `./data.db`:

```env
TURSO_PATH=./data.db   # Optional — local DB file (LOCAL, not Turso Cloud)
JWT_SECRET=pick-a-random-secret-string
```

See the **[Database Setup Guide](Database_Setup.md)** for details. The database file is created automatically on first setup.

### 3. Run Setup

```bash
npm run setup
```

This single command runs the full installation process:
1. Installs all dependencies (`npm install`)
2. Builds shared TypeScript types (`npm run build:shared`)
3. Runs database migrations - creates all tables and seeds infrastructure settings (`npm run migrate`)
4. Imports all game data - rooms, NPCs, items, spells, doors, factions, etc. (`npm run data:import`)

### 4. Start the Game

```bash
npm run dev
```

This starts:

- **Frontend** on http://localhost:3000
- **Backend** on http://localhost:3001

Open http://localhost:3000 in your browser to play.

### Manual Setup (Step by Step)

If you prefer to run each step individually:

```bash
npm install              # Install dependencies
npm run build:shared     # Build shared types
npm run migrate          # Create database tables and seed settings
npm run data:import      # Import all game data
npm run dev              # Start development servers
```

## Admin Account

A fresh database creates the **first admin automatically** on startup:

- If `BOOTSTRAP_ADMIN_USERNAME` + `BOOTSTRAP_ADMIN_PASSWORD` are set in `.env`, log in with those.
- Otherwise, an `admin` account is created with a **random password printed to the server logs** on first boot (look for the "no admin configured" banner; in Docker use `docker logs <container>`).

Log in as that admin, then register your own account at http://localhost:3000 and promote it from **Admin > Users**. See [Database Setup → First Admin Account](Database_Setup.md#first-admin-account-bootstrap) for the full explanation.

To grant the Admin role to an already-registered account from the CLI (recovery, or adding more admins):

```bash
cd packages/server
npx tsx src/db/create-admin.ts <username>
```

The Admin role gives access to admin tools, developer editors, and staff commands.

## Game Data Management

All game content (rooms, NPCs, items, spells, doors, factions, drop tables, etc.) is stored as JSON files in the `data/` directory. These files are the canonical game world.

### Exporting Changes

After creating or modifying content via the in-game editors:

```bash
npm run data:export    # Export current database content to data/ as JSON
```

This overwrites the JSON files with your current database state. Commit the updated files to git to share your changes.

### Importing Data

To load game data into a database (done automatically during `npm run setup`):

```bash
npm run data:import    # Import game content from data/ into database
```

### Resetting Game Data

To reset your database to the baseline game state, delete the local database file and re-run the schema and import (the database is a single Turso/libSQL file, default `./data.db`):

```bash
rm -f data.db          # delete the local database file (path = TURSO_PATH)
npm run migrate        # recreate the schema + seed infrastructure data
npm run data:import    # reimport all game content from data/
```

## Project Structure

```
Kingdoms_of_Avarice/
├── packages/
│   ├── client/     # Frontend (Vite + xterm.js)
│   ├── server/     # Backend (Express + WebSocket)
│   └── shared/     # Shared TypeScript types
├── data/           # Game data JSON files (rooms, NPCs, items, etc.)
├── Documentation/  # This documentation
├── notes/          # Development notes
└── .env            # Environment configuration (not checked in)
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Fresh install: install, build, migrate, and import game data |
| `npm run dev` | Start frontend and backend dev servers |
| `npm run dev:client` | Start only the frontend |
| `npm run dev:server` | Start only the backend |
| `npm run build` | Build all packages for production |
| `npm run build:shared` | Build shared types (run after changing shared/) |
| `npm run migrate` | Run database migrations |
| `npm run data:export` | Export all game content to data/ as JSON |
| `npm run data:import` | Import game content from data/ into database |
| `npm run test` | Run tests |

## Next Steps

- Read the [Commands Reference](commands.md) to learn how to play
- Check the [Architecture](architecture.md) for technical details
- See the [Room Creation Guide](Room_Creation_Guide.md) to start building content

---

[← Back to Documentation](README.md)
