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

### Installation

```bash
# Install dependencies
npm install

# Build shared types
npm run build:shared

# Start development servers
npm run dev
```

This will start:

- Frontend on http://localhost:3000
- Backend on http://localhost:3001

### Test Login

Use these credentials to test:

- **Username:** testuser
- **Password:** password

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
