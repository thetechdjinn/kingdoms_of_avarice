# syntax=docker/dockerfile:1

# Kingdoms of Avarice — single-container image.
# The server serves the built client, the HTTP/REST API, and the game WebSocket
# on one port, backed by a local Turso/libSQL database file. See docker-compose.yml
# for the configured/persistent setup and the README for the ephemeral `docker run`.

# ---------------------------------------------------------------------------
# Stage 1: builder — install all deps and compile shared + server + client.
# Uses the full (non-slim) image so the native @tursodatabase/database module
# can install/build if a prebuilt binary is unavailable.
# ---------------------------------------------------------------------------
FROM node:22-bookworm AS builder
WORKDIR /app

# Install dependencies first for better layer caching. Copy every workspace's
# manifest so `npm ci` can resolve the workspace graph.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci

# Copy the rest of the source and build everything.
COPY . .
RUN npm run build:shared \
 && npm run build:server \
 && npm run build:client

# Drop devDependencies — the runtime runs compiled JS with node, so tsx,
# typescript, vite, and @types are not needed.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: runtime — slim image with only the compiled output, production
# dependencies, and the few source files read at runtime.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# PORT and the local DB path. TURSO_PATH points at /data, which is a VOLUME:
# mount it (compose) for persistence, or leave it unmounted (`docker run`) for an
# ephemeral instance that is wiped when the container is removed.
ENV PORT=3001 \
    TURSO_PATH=/data/data.db \
    NODE_ENV=

# Production dependency tree (incl. the native DB module) + built artifacts.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/server/dist ./packages/server/dist
# The migration runner intentionally reads the schema from src/db/turso at runtime.
COPY --from=builder /app/packages/server/src/db/turso/schema.sql ./packages/server/src/db/turso/schema.sql
# Built client (served by the server) and game content (imported on first boot).
COPY --from=builder /app/packages/client/dist ./packages/client/dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/Documentation ./Documentation
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# An empty .env keeps the dotenv preload quiet; real config comes from -e / compose.
# Strip any CR from the entrypoint so a CRLF checkout on a Windows/WSL host (where
# git core.autocrlf rewrote line endings) can't break the shebang and cause
# "exec ./docker-entrypoint.sh: no such file or directory" at container start.
RUN sed -i 's/\r$//' docker-entrypoint.sh \
 && chmod +x docker-entrypoint.sh \
 && touch .env \
 && mkdir -p /data

EXPOSE 3001
VOLUME ["/data"]
ENTRYPOINT ["./docker-entrypoint.sh"]
