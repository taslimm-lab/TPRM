const path = require('path');
const express = require('express');
const session = require('express-session');
const Redis = require('redis');
const connectRedis = require('connect-redis');
// AdminJS disabled for now to avoid package export issues on Node v24
// const AdminJS = require('adminjs');
// const AdminJSExpress = require('@adminjs/express');
const { initDb, getMetrics, seedDb } = require('./server_helpers');

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

// Admin UI will be added later; placeholder for /admin route
app.get('/admin', (req, res) => {
  res.status(200).send('Admin UI temporarily disabled.');
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
