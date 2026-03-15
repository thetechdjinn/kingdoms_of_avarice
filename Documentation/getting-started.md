# Getting Started

[← Back to Documentation](README.md)

This guide will help you set up and run Kingdoms of Avarice.

## Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher
- **PostgreSQL** 14 or higher

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Kingdoms_of_Avarice
```

### 2. Set Up PostgreSQL

You need a running PostgreSQL server with a database and user for the game. See the **[Database Setup Guide](Database_Setup.md)** for full instructions, including:

- **[Docker quick start](Database_Setup.md#option-a-docker-quick-start)** - Fastest option, no PostgreSQL installation needed
- **[Existing PostgreSQL](Database_Setup.md#option-b-existing-postgresql-installation)** - Configure an already-installed server (includes `pg_hba.conf` setup)

### 3. Configure Environment

After setting up the database, create a `.env` file in the project root:

```env
DB_NAME=kingdoms_of_avarice
DB_USER=koa
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
JWT_SECRET=pick-a-random-secret-string
```

### 4. Run Setup

```bash
npm run setup
```

This single command runs the full installation process:
1. Installs all dependencies (`npm install`)
2. Builds shared TypeScript types (`npm run build:shared`)
3. Runs database migrations - creates all tables and seeds infrastructure settings (`npm run migrate`)
4. Imports all game data - rooms, NPCs, items, spells, doors, factions, etc. (`npm run data:import`)

### 5. Start the Game

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

## Creating an Admin Account

1. Register a new account through the game interface at http://localhost:3000
2. Run the admin creation script:

```bash
cd packages/server
npx tsx src/db/create-admin.ts <username>
```

This grants the Admin role to the specified account, giving access to admin tools, developer editors, and staff commands.

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

To reset your database to the baseline game state:

```bash
dropdb kingdoms_of_avarice
createdb -O koa kingdoms_of_avarice
npm run migrate
npm run data:import
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
