#!/bin/sh
# Container entrypoint for Kingdoms of Avarice.
#   1. Ensure the DB directory exists and a JWT secret is available.
#   2. Apply the schema (+ first-admin bootstrap on a fresh DB).
#   3. Import game content ONLY on a brand-new database.
#   4. Start the server (which serves the client, API, and game WebSocket).
set -e

DB_PATH="${TURSO_PATH:-/data/data.db}"
mkdir -p "$(dirname "$DB_PATH")"

# Zero-config friendliness: if no JWT secret is provided, generate an ephemeral
# one so login works out of the box. Set JWT_SECRET yourself (compose / -e) so
# sessions survive restarts on a persistent deployment.
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("hex"))')"
  export JWT_SECRET
  echo "[entrypoint] JWT_SECRET not set - generated an ephemeral one (set JWT_SECRET to keep logins across restarts)."
fi

# Import content only when the database file did not exist at startup. On a
# persistent volume this means content is loaded once, on first boot, and is
# never re-imported over admin edits on later restarts.
FRESH=0
[ -f "$DB_PATH" ] || FRESH=1

echo "[entrypoint] Applying schema + infrastructure (first-admin bootstrap runs on a fresh DB)..."
node packages/server/dist/db/migrate.js

if [ "$FRESH" = "1" ]; then
  echo "[entrypoint] Fresh database - importing game content..."
  node packages/server/dist/db/data-import.js
else
  echo "[entrypoint] Existing database at $DB_PATH - skipping content import (preserving your data)."
fi

echo "[entrypoint] Starting Kingdoms of Avarice on port ${PORT:-3001}..."
exec node packages/server/dist/index.js
