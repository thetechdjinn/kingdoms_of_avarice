# Getting Started

[← Back to Documentation](README.md)

This guide will help you set up and run Kingdoms of Avarice.

## Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher
- **PostgreSQL** database

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Kingdoms_of_Avarice
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/kingdoms_of_avarice
JWT_SECRET=your-secret-key-here
```

### 4. Set Up Database

```bash
# Run database migrations
npm run migrate
```

### 5. Build Shared Types

```bash
npm run build:shared
```

### 6. Start Development Servers

```bash
npm run dev
```

This starts:

- **Frontend** on http://localhost:3000
- **Backend** on http://localhost:3001

## Creating an Admin Account

1. Register a new account through the game interface
2. Run the admin creation script:

```bash
cd packages/server
npx tsx src/db/create-admin.ts <username>
```

This grants the Player and Admin roles to the specified account.

## Project Structure

```
Kingdoms_of_Avarice/
├── packages/
│   ├── client/     # Frontend (Vite + xterm.js)
│   ├── server/     # Backend (Express + WebSocket)
│   └── shared/     # Shared TypeScript types
├── Documentation/  # This documentation
├── notes/          # Development notes
└── .env            # Environment configuration
```

## Next Steps

- Read the [Commands Reference](commands.md) to learn how to play
- Check the [Architecture](architecture.md) for technical details

---

[← Back to Documentation](README.md)
