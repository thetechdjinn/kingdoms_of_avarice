# Kingdoms of Avarice

A web-based **MUD** (Multi-User Dungeon) inspired by MajorMUD. It runs entirely in
your browser as a terminal-style game (xterm.js) backed by a real-time WebSocket
server. This image is fully self-contained: one container serves the game client,
the REST API, and the game WebSocket on a single port, backed by a local embedded
SQLite/libSQL database file. No external database or services required.

Play by opening the container's port in a browser: **http://localhost:3001**

- **Source:** https://github.com/thetechdjinn/kingdoms_of_avarice
- **Port:** `3001` (HTTP + WebSocket)
- **Architectures:** `linux/amd64`, `linux/arm64`
- **Tags:** `latest` (newest), plus versioned tags such as `v0.2.0`

---

## Quick start (demo / ephemeral)

Try it with a single command. This runs a throwaway instance with a fresh
database that is wiped when the container is removed:

```bash
docker run --rm -p 3001:3001 dcbrown73/kingdoms-of-avarice:latest
```

Then open **http://localhost:3001** in your browser.

On first boot the container creates the database, imports all game content
(rooms, items, NPCs, spells, etc.), and starts the server. Give it a few seconds
until you see `Server running on 0.0.0.0:3001` in the logs.

### Finding the admin login (demo mode)

Because you did not configure an admin, the container generates one and prints it
to the logs. Watch the startup output (or run `docker logs <container>`) for a
banner like:

```
======================================================================
  Kingdoms of Avarice - no admin configured, so one was generated:

      username: admin
      password: Eb7J-G3Ez-ghyT-bsWm
  ...
======================================================================
```

Log in with those credentials. The password is random and different on every
fresh database, and it only ever appears in your logs (nothing is baked into the
image). This account has full admin rights, so from **Admin > Users** you can
create and promote your own account.

---

## Persistent deployment

For a server whose characters and world survive restarts, mount a volume for the
database and set a fixed `JWT_SECRET` (so logins survive restarts) and a
`BOOTSTRAP_ADMIN_*` pair (so you choose the admin credentials).

### `docker run`

```bash
docker run -d --name koa \
  -p 3001:3001 \
  -v koa-data:/data \
  -e JWT_SECRET="a-long-random-secret" \
  -e BOOTSTRAP_ADMIN_USERNAME="admin" \
  -e BOOTSTRAP_ADMIN_PASSWORD="choose-a-strong-password" \
  dcbrown73/kingdoms-of-avarice:latest
```

### `docker compose`

```yaml
services:
  koa:
    image: dcbrown73/kingdoms-of-avarice:latest
    ports:
      - "3001:3001"
    environment:
      JWT_SECRET: "a-long-random-secret"
      BOOTSTRAP_ADMIN_USERNAME: "admin"
      BOOTSTRAP_ADMIN_PASSWORD: "choose-a-strong-password"
    volumes:
      - koa-data:/data
    restart: unless-stopped

volumes:
  koa-data:
```

### Setting the admin login (persistent mode)

- Set both `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD`. On the
  **first boot of a fresh database**, exactly that admin account is created (with
  `player` + `admin` roles, skipping the approval queue). It logs in immediately.
- These variables only take effect while the database is empty. On later restarts
  they are ignored and your existing data is preserved. To change the admin
  password afterward, log in and use **Admin > Users**, or the in-repo
  `create-admin.ts` helper.
- If you leave the bootstrap variables unset, the demo behavior applies even in a
  persistent setup: a random `admin` password is generated and printed to the logs
  on first boot.

### Data persistence and updates

- The database lives at `/data/data.db` (override with `TURSO_PATH`). Mount a
  volume at `/data` to persist it.
- **Game content is imported only on first boot** (when the database file does not
  yet exist). On an existing volume the import is skipped, so your edits and world
  state are never overwritten on restart.
- To upgrade, pull a newer tag and recreate the container against the same volume;
  your characters and world are preserved.

---

## Running behind HTTPS / a reverse proxy

The container serves **plain HTTP** and is designed to sit behind a TLS-terminating
reverse proxy (nginx, Traefik, Caddy) in production. When you do that, set:

```
NODE_ENV=production      # enables Secure cookies (breaks login over plain HTTP, so only set behind HTTPS)
TRUST_PROXY=true         # trust X-Forwarded-For for the real client IP (needed for IP access control)
TRUST_PROXY_TLS=true     # emit the HSTS header (only when TLS terminates at the proxy)
```

Forward the client IP and allow WebSocket upgrades for the `/game` path at the
proxy. Do **not** set `NODE_ENV=production` for a plain-HTTP deployment.

---

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TURSO_PATH` | `/data/data.db` | Path to the local database file. Mount a volume here to persist it. |
| `JWT_SECRET` | auto-generated | Signs session tokens. Set a fixed value so logins survive restarts; if unset, a new one is generated each boot. |
| `BOOTSTRAP_ADMIN_USERNAME` | *(unset)* | First admin's username, created only on a fresh database. Must be set with the password. |
| `BOOTSTRAP_ADMIN_PASSWORD` | *(unset)* | First admin's password. If both bootstrap vars are unset, a random `admin` password is printed to the logs. |
| `PORT` | `3001` | Port the server listens on inside the container. |
| `NODE_ENV` | *(unset)* | Set to `production` only behind an HTTPS reverse proxy (enables Secure cookies). |
| `TRUST_PROXY` | `false` | Set to `true` behind a proxy so `X-Forwarded-For` is trusted for client-IP detection. |
| `TRUST_PROXY_TLS` | `false` | Set to `true` only behind a TLS proxy to emit the HSTS header. |
| `EMERGENCY_ACCESS_TOKEN` | *(unset)* | Optional token to bypass IP access rules if you lock yourself out. |

---

## Notes

- The image uses a Debian (`bookworm`) base because the native database engine
  ships prebuilt binaries for glibc (amd64/arm64) but not musl. It is not
  Alpine-based by design.
- One container is all you need: it serves the client, API, and WebSocket together.
