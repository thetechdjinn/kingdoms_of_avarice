# Database Setup

[← Back to Documentation](README.md)

Kingdoms of Avarice requires a PostgreSQL database. This guide covers two approaches:

- **[Option A: Docker](#option-a-docker-quick-start)** - Fastest way to get running. No PostgreSQL installation required.
- **[Option B: Existing PostgreSQL](#option-b-existing-postgresql-installation)** - Configure an already-installed PostgreSQL server.

---

## Option A: Docker (Quick Start)

If you have Docker installed, this is the easiest way to get a PostgreSQL server running without installing or configuring PostgreSQL on your system.

### 1. Start a PostgreSQL Container

```bash
docker run -d \
  --name koa-postgres \
  -e POSTGRES_USER=koa \
  -e POSTGRES_PASSWORD=koa_password \
  -e POSTGRES_DB=kingdoms_of_avarice \
  -p 5432:5432 \
  postgres:16
```

This creates a container with the database, user, and password already configured.

### 2. Configure Your .env File

Create a `.env` file in the project root:

```env
DB_NAME=kingdoms_of_avarice
DB_USER=koa
DB_PASSWORD=koa_password
DB_HOST=localhost
DB_PORT=5432
JWT_SECRET=pick-any-random-string-here
```

### 3. Run Setup

```bash
npm run setup
```

That's it. The database is ready.

### Managing the Container

```bash
docker stop koa-postgres      # Stop the database
docker start koa-postgres     # Start it again
docker rm koa-postgres        # Remove the container (data is lost)
```

### Persisting Data Across Container Restarts

By default, removing the container deletes all data. To persist data on your host machine, add a volume:

```bash
docker run -d \
  --name koa-postgres \
  -e POSTGRES_USER=koa \
  -e POSTGRES_PASSWORD=koa_password \
  -e POSTGRES_DB=kingdoms_of_avarice \
  -p 5432:5432 \
  -v koa-pgdata:/var/lib/postgresql/data \
  postgres:16
```

### Using Docker Compose

Alternatively, create a `docker-compose.yml` in the project root:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: koa-postgres
    environment:
      POSTGRES_USER: koa
      POSTGRES_PASSWORD: koa_password
      POSTGRES_DB: kingdoms_of_avarice
    ports:
      - "5432:5432"
    volumes:
      - koa-pgdata:/var/lib/postgresql/data

volumes:
  koa-pgdata:
```

Then:

```bash
docker compose up -d           # Start
docker compose down            # Stop
docker compose down -v         # Stop and delete data
```

---

## Option B: Existing PostgreSQL Installation

If you already have PostgreSQL installed on your system, follow these steps to create the database and user.

### 1. Create the Database User

Connect as the PostgreSQL superuser (usually `postgres`):

```bash
sudo -u postgres psql
```

On Windows, open a command prompt and run:

```cmd
psql -U postgres
```

Then create the user and database:

```sql
CREATE USER koa WITH PASSWORD 'your_password_here';
CREATE DATABASE kingdoms_of_avarice OWNER koa;
\q
```

### 2. Configure Authentication (pg_hba.conf)

PostgreSQL controls client authentication through `pg_hba.conf`. You need to ensure the `koa` user can connect with a password.

#### Find pg_hba.conf

The file location depends on your OS and installation:

| OS | Typical Location |
|----|-----------------|
| Ubuntu/Debian | `/etc/postgresql/<version>/main/pg_hba.conf` |
| RHEL/CentOS/Fedora | `/var/lib/pgsql/<version>/data/pg_hba.conf` |
| macOS (Homebrew) | `/opt/homebrew/var/postgresql@16/pg_hba.conf` |
| Windows | `C:\Program Files\PostgreSQL\<version>\data\pg_hba.conf` |

You can also find it from within `psql`:

```sql
SHOW hba_file;
```

#### Add or Verify the Authentication Rule

Open `pg_hba.conf` in a text editor and look for lines controlling local connections. You need an entry that allows the `koa` user to connect to the `kingdoms_of_avarice` database using password authentication.

Add this line (or verify a matching rule already exists):

```
# TYPE  DATABASE                USER  ADDRESS        METHOD
host    kingdoms_of_avarice     koa   127.0.0.1/32   md5
host    kingdoms_of_avarice     koa   ::1/128        md5
```

If you see existing lines like `host all all 127.0.0.1/32 md5` or `scram-sha-256`, those already cover the `koa` user and no changes are needed.

**Common authentication methods:**

| Method | Description |
|--------|-------------|
| `md5` | Password authentication (MD5 hashed) |
| `scram-sha-256` | Password authentication (more secure, PostgreSQL 10+) |
| `peer` | OS username must match DB username (local socket only, won't work for TCP) |
| `trust` | No password required (not recommended for production) |

**Important:** If the default method is `peer` for local connections, password authentication over TCP (which the game uses) will fail. Either add the `host` lines above or change `peer` to `md5` for the relevant entries.

#### Restart PostgreSQL

After editing `pg_hba.conf`, restart PostgreSQL for changes to take effect:

```bash
# Linux (systemd)
sudo systemctl restart postgresql

# macOS (Homebrew)
brew services restart postgresql@16

# Windows
net stop postgresql-x64-16 && net start postgresql-x64-16
```

### 3. Test the Connection

Verify the user can connect:

```bash
psql -U koa -h localhost -d kingdoms_of_avarice
```

Enter the password when prompted. If you get a `psql` prompt, the connection is working. Type `\q` to exit.

### 4. Configure Your .env File

Create a `.env` file in the project root:

```env
DB_NAME=kingdoms_of_avarice
DB_USER=koa
DB_PASSWORD=your_password_here
DB_HOST=localhost
DB_PORT=5432
JWT_SECRET=pick-any-random-string-here
```

### 5. Run Setup

```bash
npm run setup
```

---

## Resetting the Database

To completely reset the game database (drops all data and reimports from JSON):

```bash
dropdb -U koa kingdoms_of_avarice
createdb -U koa kingdoms_of_avarice
npm run migrate
npm run data:import
```

With Docker:

```bash
docker exec koa-postgres dropdb -U koa kingdoms_of_avarice
docker exec koa-postgres createdb -U koa kingdoms_of_avarice
npm run migrate
npm run data:import
```

---

## Troubleshooting

### "password authentication failed for user koa"

- Verify the password in `.env` matches what you set during `CREATE USER`
- Check `pg_hba.conf` allows password auth for the `koa` user (see step 2 above)
- Restart PostgreSQL after editing `pg_hba.conf`

### "could not connect to server: Connection refused"

- Verify PostgreSQL is running: `sudo systemctl status postgresql` (Linux) or `docker ps` (Docker)
- Check that `DB_HOST` and `DB_PORT` in `.env` are correct
- If PostgreSQL is not listening on TCP, check `postgresql.conf` for `listen_addresses = 'localhost'`

### "database 'kingdoms_of_avarice' does not exist"

- Create it: `createdb -U koa kingdoms_of_avarice` (or `CREATE DATABASE` in psql)
- With Docker, the database is created automatically by the `POSTGRES_DB` environment variable

### "role 'koa' does not exist"

- Create the user first: `sudo -u postgres createuser -P koa`
- With Docker, the user is created automatically by the `POSTGRES_USER` environment variable

---

[← Back to Documentation](README.md)
