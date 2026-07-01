# Docker Deployment

[← Back to Documentation](README.md)

Kingdoms of Avarice ships as a single self-contained Docker image: the server serves the web client, the REST API, and the game WebSocket on one port, backed by a local Turso/libSQL database file. There is no separate database server.

There are two ways to run it:

- **[Demo / ephemeral](#demo--ephemeral-mode)** — pull and run, zero config, everything wiped when the container is removed. For trying it out.
- **[Persistent game server](#persistent-game-server-mode)** — a real deployment with a data volume, your own admin, and stable logins.

Published image: **`dcbrown73/kingdoms-of-avarice`** (tags: `latest`, and versioned tags like `v0.2.0`).

---

## Demo / ephemeral mode

Use this to try the game with no setup. The database lives inside the container and is **destroyed when the container is removed** — nothing persists.

```bash
# 1. Start it (detached, named "koa")
docker run -d --name koa -p 3001:3001 dcbrown73/kingdoms-of-avarice:latest

# 2. Read the auto-generated admin login (username is always "admin")
docker logs koa | grep -A5 "no admin configured"
```

Step 2 prints a banner; the **password is random and shown only here** (a new one is generated on every fresh start):

```
  Kingdoms of Avarice - no admin configured, so one was generated:

      username: admin
      password: bmM7-LnQb-r9SC-fmmB
```

3. Open **http://localhost:3001** and log in as `admin` with that password.
4. When you're done:

```bash
docker rm -f koa      # stops and removes the container — the world is wiped
```

Notes:
- No `JWT_SECRET` needed — one is generated automatically for the session.
- Want a login you choose instead of a random one? Add `-e BOOTSTRAP_ADMIN_USERNAME=admin -e BOOTSTRAP_ADMIN_PASSWORD=yourpass` to the `docker run` command. It's still ephemeral (no volume), just with a known password.

---

## Persistent game server mode

Use this for a real server. Data is stored in a Docker **volume** so it survives restarts and image updates, you set your **own admin**, and you set a fixed **`JWT_SECRET`** so logins stay valid across restarts.

### With docker compose (recommended)

1. Download [`docker-compose.yml`](../docker-compose.yml) (you only need this one file; no source checkout required).
2. Edit the `environment:` values — at minimum set a long random `JWT_SECRET` and your `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`.
3. Start it:

```bash
docker compose up -d
docker compose logs -f      # watch startup
```

The compose file pulls the published image, maps port 3001, and stores the database in a named volume (`koa-data`) at `/data/data.db` inside the container.

### With plain docker run (no compose)

```bash
docker volume create koa-data

docker run -d --name koa -p 3001:3001 \
  -e JWT_SECRET="a-long-random-secret" \
  -e BOOTSTRAP_ADMIN_USERNAME="admin" \
  -e BOOTSTRAP_ADMIN_PASSWORD="your-strong-password" \
  -v koa-data:/data \
  --restart unless-stopped \
  dcbrown73/kingdoms-of-avarice:latest
```

### What happens on first boot vs. later boots

| | First boot (empty volume) | Every later boot |
| --- | --- | --- |
| Database schema | created | re-checked (idempotent, no changes) |
| Game content (rooms, NPCs, items…) | imported from the shipped data | **not** re-imported — your in-game edits are preserved |
| Admin account | created from `BOOTSTRAP_ADMIN_*` (or a logged random one) | not touched — it already exists |

So the admin is created **once**. On restarts the server just re-checks the schema and starts serving.

### Setting up your admin identity

The bootstrap admin gets full `admin` + `player` roles and skips the pending-approval gate, so you can log in immediately. From there:

1. Log in as the bootstrap admin.
2. Register your own account under any name at the login/registration screen (it starts as `pending`).
3. Open **Admin → Users** and set your account's role to **Admin** (this also approves it).
4. Use your own account from then on. See [Database Setup → First Admin Account](Database_Setup.md#first-admin-account-bootstrap) for the full explanation.

New players who register later stay `pending` until an admin approves them under Admin → Users.

---

## Updating to a new image version

Data lives in the volume, not the image, so updating is safe:

```bash
# docker compose
docker compose pull
docker compose up -d

# plain docker run
docker pull dcbrown73/kingdoms-of-avarice:latest
docker rm -f koa
# ...re-run the same `docker run ...` command; the -v koa-data:/data keeps your data
```

Content is not re-imported and your world is preserved. For a major version bump, check the release notes in case it needs a migration or a fresh import.

---

## Backups

The entire game state is a single SQLite/libSQL file inside the `koa-data` volume (`/data/data.db`). For a **consistent** backup, stop the container first (a hot copy can miss un-checkpointed WAL data):

```bash
docker compose stop            # or: docker stop koa
# copy the DB file out of the volume
docker run --rm -v koa-data:/data -v "$PWD:/backup" busybox \
  cp /data/data.db /backup/koa-backup.db
docker compose start           # or: docker start koa
```

Restore by copying a backup file back into the volume (with the container stopped) at `/data/data.db`.

---

## Running behind HTTPS / a reverse proxy

Serving over plain HTTP works out of the box (the default). Only when you put the server behind an HTTPS-terminating reverse proxy (nginx, Traefik, Caddy…) should you set:

```
NODE_ENV=production
```

This enables **Secure cookies** (sent only over HTTPS) and enforces that `JWT_SECRET` is set. Do **not** set `NODE_ENV=production` for a plain-HTTP deployment — Secure cookies would prevent login.

At the proxy, forward the client IP (`X-Forwarded-For`) and allow WebSocket upgrades for the `/game` path so real-time gameplay works.

---

## Environment variable reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `TURSO_PATH` | `/data/data.db` | Path to the local database file. Mount a volume here to persist it. |
| `JWT_SECRET` | auto-generated | Signs session tokens. **Set a fixed value** for a persistent server so logins survive restarts; if unset, a new one is generated each boot (fine for demo). |
| `BOOTSTRAP_ADMIN_USERNAME` | *(unset)* | First admin's username, created only on a fresh database. Must be set together with the password. |
| `BOOTSTRAP_ADMIN_PASSWORD` | *(unset)* | First admin's password. If both bootstrap vars are unset, a random `admin` password is printed to the logs instead. |
| `NODE_ENV` | *(unset)* | Set to `production` **only** behind an HTTPS reverse proxy (enables Secure cookies). Leave unset for plain HTTP. |
| `PORT` | `3001` | Port the server listens on inside the container. |
| `EMERGENCY_ACCESS_TOKEN` | *(unset)* | Optional token to bypass IP access rules if you lock yourself out. |

---

## Building and publishing the image (maintainer)

```bash
# Single-arch (matches your machine)
docker build -t dcbrown73/kingdoms-of-avarice:latest .
docker push dcbrown73/kingdoms-of-avarice:latest

# Multi-arch (recommended for Docker Hub — covers amd64 servers and arm64 Macs)
docker login
docker buildx build --platform linux/amd64,linux/arm64 \
  -t dcbrown73/kingdoms-of-avarice:latest \
  -t dcbrown73/kingdoms-of-avarice:v0.2.0 \
  --push .
```

> The image uses a Debian (`bookworm`) base on purpose: the native `@tursodatabase/database` engine ships glibc prebuilt binaries for `linux/amd64` and `linux/arm64` but none for musl. **Do not switch the base image to Alpine.**

When pushing versioned releases, push both the version tag and `latest` so `latest` always points at the newest build.

---

## Troubleshooting

**I can't find the admin password.** It prints only on the **first** boot of a fresh database, early in the logs. Run `docker logs <container> | grep -A5 "no admin configured"`. If the database already existed (persistent volume), no new password is generated — use the one from first boot, or your `BOOTSTRAP_ADMIN_PASSWORD`.

**Login doesn't work / I get logged out immediately.** You likely set `NODE_ENV=production` while serving over plain HTTP, which makes cookies Secure (HTTPS-only). Remove it, or put the server behind HTTPS.

**My world reset after a restart.** You ran without a mounted volume (ephemeral mode). Use a `-v koa-data:/data` volume (or docker compose) to persist data.

**Logins are invalid after every restart.** You didn't set a fixed `JWT_SECRET`, so a new one is generated each boot. Set `JWT_SECRET` to a stable value.

**Port 3001 is already in use.** Change the host side of the mapping, e.g. `-p 8080:3001`, and browse to `http://localhost:8080`.

---

[← Back to Documentation](README.md)
