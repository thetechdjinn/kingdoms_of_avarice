# Kingdoms of Avarice

A web-based MUD (Multi-User Dungeon) game inspired by the classic MajorMUD.

## Tech Stack

- **Frontend:** Vite + TypeScript + xterm.js
- **Backend:** Node.js + Express + WebSocket
- **Database:** PostgreSQL

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+

### 1. Set Up PostgreSQL

You need a running PostgreSQL server. See the [Database Setup Guide](Documentation/Database_Setup.md) for detailed instructions, including a Docker quick start option.

### 2. Configure Environment

Create a `.env` file in the project root:

```env
DB_NAME=kingdoms_of_avarice
DB_USER=koa
DB_PASSWORD=<password>
DB_HOST=localhost
DB_PORT=5432
JWT_SECRET=<secret>
```

### 3. Install and Set Up

```bash
npm run setup
```

This single command:
1. Installs all dependencies
2. Builds shared TypeScript types
3. Runs database migrations (creates tables, seeds settings)
4. Imports all game data (rooms, NPCs, items, spells, doors, etc.)

### 4. Start the Game

```bash
npm run dev
```

This will start:

- Frontend on http://localhost:3000
- Backend on http://localhost:3001

### 5. Create an Account

1. Open http://localhost:3000 and register a new account
2. To grant admin access:

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
