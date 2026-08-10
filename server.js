const path = require('path');
const express = require('express');
const session = require('express-session');
const Redis = require('redis');
const connectRedis = require('connect-redis');
// AdminJS disabled for now to avoid package export issues on Node v24
// const AdminJS = require('adminjs');
// const AdminJSExpress = require('@adminjs/express');
const { initDb, getMetrics, seedDb } = require('./server_helpers');
const { createUser, getUserByEmail, getUserById } = require('./server_helpers');

let redisClient = null;

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
  }),
);

// Serve static files (existing index.html)
app.use(express.static(path.join(__dirname)));

// Simple API endpoint for metrics
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.json({ ok: true, metrics });
  } catch (err) {
    console.error('GET /api/metrics error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Allow creating metrics (protected role: EDITOR or ADMIN)
app.post('/api/metrics', express.json(), requireRole('EDITOR'), async (req, res) => {
  try {
    const { name, value } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, error: 'missing name' });
    const ts = Date.now();
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    const dbPath = path.join(__dirname, 'db.sqlite');
    const tempDb = new sqlite3.Database(dbPath);
    tempDb.run('INSERT INTO metrics (name, value, ts) VALUES (?, ?, ?)', [name, value || 0, ts], function (err) {
      if (err) {
        console.error('Insert metric failed', err);
        return res.status(500).json({ ok: false, error: String(err) });
      }
      res.json({ ok: true, id: this.lastID });
    });
  } catch (err) {
    console.error('POST /api/metrics error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Auth endpoints (local email/password for dev)
app.post('/api/login', express.json(), async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'missing credentials' });
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ ok: false, error: 'invalid credentials' });
    const bcrypt = require('bcrypt');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ ok: false, error: 'invalid credentials' });
    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('POST /api/login error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout failed', err);
      return res.status(500).json({ ok: false, error: 'logout failed' });
    }
    res.json({ ok: true });
  });
});

app.get('/api/me', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) return res.json({ ok: true, user: null });
    const user = await getUserById(req.session.userId);
    res.json({ ok: true, user });
  } catch (err) {
    console.error('GET /api/me error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Registration endpoint: allow creating the first user without auth; afterwards only ADMIN can create users
app.post('/api/register', express.json(), async (req, res) => {
  try {
    const { email, password, role = 'EDITOR', displayName = '' } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'missing email or password' });

    // Prevent duplicate accounts
    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ ok: false, error: 'user already exists' });

    // Allow creating the very first user (make them ADMIN by default)
    const firstUser = await (async () => {
      const sqlite3 = require('sqlite3').verbose();
      const path = require('path');
      const dbPath = path.join(__dirname, 'db.sqlite');
      const tempDb = new sqlite3.Database(dbPath);
      return new Promise((resolve, reject) => {
        tempDb.get('SELECT COUNT(1) as c FROM users', (err, row) => {
          if (err) return reject(err);
          resolve(!row || row.c === 0);
        });
      });
    })();

    if (!firstUser) {
      // must be authenticated as ADMIN to create additional users
      if (!req.session || req.session.role !== 'ADMIN') {
        return res.status(403).json({ ok: false, error: 'admin required to create users' });
      }
    }

    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(password, 10);
    // If this is the first user, elevate to ADMIN
    const finalRole = firstUser ? 'ADMIN' : role;
    const created = await createUser(email, hash, finalRole, displayName);
    res.json({ ok: true, user: created });
  } catch (err) {
    console.error('POST /api/register error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Flexible RBAC middleware: accepts a role string or an array of allowed roles
function requireRole(required) {
  return (req, res, next) => {
    if (!req.session || !req.session.role) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    const userRole = req.session.role;
    const allowed = Array.isArray(required) ? required : [required];
    // ADMIN implicitly allowed for most editor-level actions
    if (allowed.includes(userRole) || userRole === 'ADMIN') return next();
    return res.status(403).json({ ok: false, error: 'forbidden' });
  };
}

// Serve the simple admin UI from /admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Admin: user management endpoints
const { listUsers, updateUser, deleteUser } = require('./server_helpers');

// List users (ADMIN only)
app.get('/api/users', requireRole('ADMIN'), async (req, res) => {
  try {
    const users = await listUsers();
    res.json({ ok: true, users });
  } catch (err) {
    console.error('GET /api/users error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Get a single user: ADMIN or the user themself
app.get('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.session || !req.session.userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    if (req.session.role !== 'ADMIN' && req.session.userId !== id) return res.status(403).json({ ok: false, error: 'forbidden' });
    const user = await getUserById(id);
    res.json({ ok: true, user });
  } catch (err) {
    console.error('GET /api/users/:id error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Update a user: ADMIN can update role/displayName/email; users can update their own displayName and email
app.put('/api/users/:id', express.json(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.session || !req.session.userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    const isAdmin = req.session.role === 'ADMIN';
    const isSelf = req.session.userId === id;
    if (!isAdmin && !isSelf) return res.status(403).json({ ok: false, error: 'forbidden' });
    const payload = req.body || {};
    // Non-admins cannot change role
    if (!isAdmin && payload.role) delete payload.role;
    const result = await updateUser(id, payload);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('PUT /api/users/:id error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Delete a user (ADMIN only)
app.delete('/api/users/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await deleteUser(id);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('DELETE /api/users/:id error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

 async function start() {
  // Initialize Redis client for session store
  const RedisStoreFactory = connectRedis.default || connectRedis;
  const redisUrl = process.env.REDIS_URL;
  let sessionStore = null;

  redisClient = null;
  if (redisUrl) {
    redisClient = Redis.createClient({ url: redisUrl });
    try {
      await redisClient.connect();
      // Instantiate RedisStore (connect-redis v7 exports a class)
      const redisStoreInstance = new RedisStoreFactory({ client: redisClient, prefix: 'sess:' });
      sessionStore = redisStoreInstance;
      console.log('Using Redis session store at', redisUrl);
    } catch (err) {
      console.warn('Failed to connect to Redis at', redisUrl, '; falling back to MemoryStore:', err.message || err);
      redisClient = null;
    }
  } else {
    console.log('REDIS_URL not set — using in-memory session store (development only)');
  }

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    }),
  );

   // Resume endpoint to check session existence in Redis (helps handle unknown-session errors)
  app.post('/api/resume', express.json(), async (req, res) => {
    if (!sessionStore) {
      return res.status(501).json({ ok: false, error: 'Resume check requires REDIS_URL to be set and reachable' });
    }
    // sessionStore should be a connect-redis instance with a `client` property
    const storeClient = sessionStore.client || (typeof sessionStore.getClient === 'function' ? sessionStore.getClient() : null);
    if (!storeClient || typeof storeClient.get !== 'function') {
      return res.status(501).json({ ok: false, error: 'Resume check requires a Redis-backed session store' });
    }
    try {
      const sid = req.body.sessionId || req.sessionID;
      if (!sid) return res.status(400).json({ ok: false, error: 'missing sessionId' });
      const key = `sess:${sid}`;
      const data = await storeClient.get(key);
      if (!data) {
        return res.status(404).json({ ok: false, error: 'unknown session' });
      }
      return res.json({ ok: true, sessionId: sid });
    } catch (err) {
      console.error('POST /api/resume error', err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

   try {
     await initDb();
   } catch (err) {
     console.error('Failed to initialize DB', err);
     process.exit(1);
   }

   app.listen(PORT, () => {
     console.log(`Server listening on http://localhost:${PORT}`);
   });
 }

 start().catch((err) => {
   console.error('Startup failure', err);
   process.exit(1);
 });

// Global error handler to gracefully handle unknown-session resume errors
app.use(async (err, req, res, next) => {
  try {
    if (!err) return next();
    const msg = (err && err.message) || '';
    if (msg.includes('Cannot resume unknown session') || msg.includes('unknown session')) {
      console.warn('Caught unknown-session resume error, regenerating session:', msg);
      // Try to regenerate session to give client a fresh session id
      if (req && req.session && typeof req.session.regenerate === 'function') {
        return req.session.regenerate((regenErr) => {
          if (regenErr) {
            console.error('Session regenerate failed:', regenErr);
            return res.status(500).json({ ok: false, error: 'session regeneration failed' });
          }
          return res.status(409).json({ ok: false, error: 'unknown session; new session created', sessionId: req.sessionID });
        });
      }
      return res.status(409).json({ ok: false, error: 'unknown session' });
    }
  } catch (handlerErr) {
    console.error('Error handler failed', handlerErr);
  }
  // fallback to default error handling
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: String(err) });
});
