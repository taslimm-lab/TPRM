# Website Backend

This workspace contains a minimal Express backend, a SQLite data store for metrics, and optional Redis-backed sessions.

Quick start (development):

1. Install dependencies
```bash
cd /Users/tquraishi/Desktop/Website
npm install
```

2. Seed DB
```bash
npm run seed
```

3a. (Optional) Start Redis via Docker Compose
```bash
docker-compose up -d
export REDIS_URL=redis://127.0.0.1:6379
```

3b. Or start Redis via Homebrew
```bash
brew install redis
brew services start redis
export REDIS_URL=redis://127.0.0.1:6379
```

4. Start the server
```bash
npm start
```

Production with Docker
----------------------

Build the image and run with Docker Compose (production):

```bash
# set a strong SESSION_SECRET first
export SESSION_SECRET="$(openssl rand -hex 32)"
docker compose -f docker-compose.prod.yml up --build -d
```

The SQLite database file is mounted at `./db.sqlite` so data persists on the host.

Endpoints
- `GET /api/metrics` — returns metrics JSON
- `POST /api/resume` — (requires Redis) checks session existence; returns 501 if Redis is not configured

Notes
- For development the server falls back to an in-memory session store when `REDIS_URL` is not set.
- Admin UI is currently disabled; it can be re-enabled once AdminJS compatibility is resolved for your Node version.
 
## New features added

- Per-resource permission storage in SQLite `permissions` table.
- Runtime `requirePermission(resource, action)` middleware in `lib/rbac.js`.
- CLI helper `bin/cli.js` with `create-admin`, `migrate`, and `list-perms` commands.
- Audit viewer improvements: filtering and JSON export in `admin/index.html`.

## CLI usage

Run the local CLI via npm script:

```bash
npm run cli -- migrate
npm run cli -- create-admin --email admin@local --password password
npm run cli -- list-perms
```

Note: the CLI requires Node and the workspace dependencies installed.

## GitHub OAuth

To enable GitHub OAuth set these environment variables (example):

```bash
export GITHUB_CLIENT_ID=your_client_id
export GITHUB_CLIENT_SECRET=your_client_secret
# Optional, defaults to http://localhost:3000
export BASE_URL=https://your-domain.example
```

Then restart the server. OAuth routes available when configured:
- `/auth/github` — start GitHub login
- `/auth/github/callback` — OAuth redirect URI

On successful login the user will be created (if missing) with `EDITOR` role by default.
# TPRM
# TPRM
