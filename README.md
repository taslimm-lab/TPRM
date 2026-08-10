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

Endpoints
- `GET /api/metrics` — returns metrics JSON
- `POST /api/resume` — (requires Redis) checks session existence; returns 501 if Redis is not configured

Notes
- For development the server falls back to an in-memory session store when `REDIS_URL` is not set.
- Admin UI is currently disabled; it can be re-enabled once AdminJS compatibility is resolved for your Node version.
