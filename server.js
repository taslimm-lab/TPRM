const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const { initDb, getMetrics, seedDb } = require('./server_helpers');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: '.' }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));

// Serve static files (existing index.html)
app.use(express.static(path.join(__dirname)));

// Simple API endpoint for metrics
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = getMetrics();
    res.json({ ok: true, metrics });
  } catch (err) {
    console.error('GET /api/metrics error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// AdminJS basic setup (read-only auth for dev)
const adminJs = new AdminJS({
  resources: [],
  rootPath: '/admin',
});

const adminRouter = AdminJSExpress.buildAuthenticatedRouter(adminJs, {
  authenticate: async (email, password) => {
    // Dev-only: accept any credentials when SESSION_SECRET is default
    if (process.env.SESSION_SECRET === 'dev-secret') return { email: 'dev@local' };
    return null;
  },
  cookieName: 'adminjs',
  cookiePassword: process.env.SESSION_SECRET || 'dev-secret',
});

app.use(adminJs.options.rootPath, adminRouter);

initDb();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
