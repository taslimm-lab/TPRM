const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.sqlite');
let db;

function initDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
      db.serialize(() => {
        db.run(
          `CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            value REAL NOT NULL,
            ts INTEGER NOT NULL
          )`,
        );
        db.run(
          `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            displayName TEXT
          )`,
        );
        db.run(
          `CREATE TABLE IF NOT EXISTS audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actorId INTEGER,
            action TEXT NOT NULL,
            resource TEXT,
            details TEXT,
            ts INTEGER NOT NULL
          )`,
        );
        db.run(
          `CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource TEXT NOT NULL,
            action TEXT NOT NULL,
            role TEXT,
            userId INTEGER,
            allow INTEGER NOT NULL DEFAULT 1,
            ts INTEGER NOT NULL
          )`,
        );
        db.run(
          `CREATE TABLE IF NOT EXISTS oauth_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            providerId TEXT NOT NULL,
            userId INTEGER NOT NULL,
            ts INTEGER NOT NULL
          )`,
        );
        db.get('SELECT COUNT(1) as c FROM metrics', (err, row) => {
          if (err) return reject(err);
          if (!row || row.c === 0) {
            const stmt = db.prepare('INSERT INTO metrics (name, value, ts) VALUES (?, ?, ?)');
            stmt.run('visitors', 120, Date.now());
            stmt.run('signups', 12, Date.now());
            stmt.finalize(resolve);
          } else {
            resolve();
          }
        });
      });
    });
  });
}

function getMetrics() {
  return new Promise((resolve, reject) => {
    if (!db) return initDb().then(() => getMetrics()).then(resolve).catch(reject);
    db.all('SELECT id, name, value, ts FROM metrics ORDER BY ts DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function seedDb() {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        db.serialize(() => {
          db.run('DELETE FROM metrics', (err) => {
            if (err) return reject(err);
            const stmt = db.prepare('INSERT INTO metrics (name, value, ts) VALUES (?, ?, ?)');
            stmt.run('visitors', 200, Date.now());
            stmt.run('signups', 25, Date.now());
            stmt.finalize((err) => (err ? reject(err) : resolve()));
          });
        });
      })
      .catch(reject);
  });
}

// User helpers
function createUser(email, passwordHash, role = 'ADMIN', displayName = '') {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        const stmt = db.prepare('INSERT OR REPLACE INTO users (email, password, role, displayName) VALUES (?, ?, ?, ?)');
        stmt.run(email, passwordHash, role, displayName, function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, email, role, displayName });
        });
      })
      .catch(reject);
  });
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        db.get('SELECT id, email, password, role, displayName FROM users WHERE email = ?', [email], (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      })
      .catch(reject);
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        db.get('SELECT id, email, role, displayName FROM users WHERE id = ?', [id], (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      })
      .catch(reject);
  });
}

function listUsers() {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        db.all('SELECT id, email, role, displayName FROM users ORDER BY id ASC', (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      })
      .catch(reject);
  });
}

function updateUser(id, { email, role, displayName }) {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        const stmt = db.prepare('UPDATE users SET email = COALESCE(?, email), role = COALESCE(?, role), displayName = COALESCE(?, displayName) WHERE id = ?');
        stmt.run(email || null, role || null, displayName || null, id, function (err) {
          if (err) return reject(err);
          resolve({ id, changes: this.changes });
        });
      })
      .catch(reject);
  });
}

function deleteUser(id) {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
          if (err) return reject(err);
          resolve({ id, deleted: this.changes > 0 });
        });
      })
      .catch(reject);
  });
}

function logAudit(actorId, action, resource = null, details = null) {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        const ts = Date.now();
        const stmt = db.prepare('INSERT INTO audits (actorId, action, resource, details, ts) VALUES (?, ?, ?, ?, ?)');
        stmt.run(actorId || null, action, resource || null, details || null, ts, function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, actorId, action, resource, details, ts });
        });
      })
      .catch(reject);
  });
}

function getAudits(limit = 100) {
  return new Promise((resolve, reject) => {
    initDb()
      .then(() => {
        db.all('SELECT id, actorId, action, resource, details, ts FROM audits ORDER BY ts DESC LIMIT ?', [limit], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      })
      .catch(reject);
  });
}

module.exports = {
  initDb,
  getMetrics,
  seedDb,
  createUser,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
  // audit helpers
  logAudit,
  getAudits,
  // permissions
  listPermissions: function () {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          db.all('SELECT id, resource, action, role, userId, allow, ts FROM permissions ORDER BY id DESC', (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          });
        })
        .catch(reject);
    });
  },
  createPermission: function ({ resource, action, role = null, userId = null, allow = 1 }) {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          const ts = Date.now();
          const stmt = db.prepare('INSERT INTO permissions (resource, action, role, userId, allow, ts) VALUES (?, ?, ?, ?, ?, ?)');
          stmt.run(resource, action, role, userId, allow ? 1 : 0, ts, function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, resource, action, role, userId, allow: allow ? 1 : 0, ts });
          });
        })
        .catch(reject);
    });
  },
  deletePermission: function (id) {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          db.run('DELETE FROM permissions WHERE id = ?', [id], function (err) {
            if (err) return reject(err);
            resolve({ id, deleted: this.changes > 0 });
          });
        })
        .catch(reject);
    });
  },
  deletePermissionsFor: function (resource, action, scope = 'role') {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          let q = 'DELETE FROM permissions WHERE resource = ? AND action = ?';
          const params = [resource, action];
          if (scope === 'role') q += ' AND role IS NOT NULL';
          else if (scope === 'user') q += ' AND userId IS NOT NULL';
          // scope === 'all' deletes both role and user specific entries
          db.run(q, params, function (err) {
            if (err) return reject(err);
            resolve({ resource, action, deleted: this.changes });
          });
        })
        .catch(reject);
    });
  },

  // OAuth helpers
  findUserByProvider: function (provider, providerId) {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          db.get('SELECT userId FROM oauth_accounts WHERE provider = ? AND providerId = ? LIMIT 1', [provider, providerId], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.userId : null);
          });
        })
        .catch(reject);
    });
  },

  linkOAuthAccount: function (provider, providerId, userId) {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          const ts = Date.now();
          const stmt = db.prepare('INSERT INTO oauth_accounts (provider, providerId, userId, ts) VALUES (?, ?, ?, ?)');
          stmt.run(provider, providerId, userId, ts, function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, provider, providerId, userId, ts });
          });
        })
        .catch(reject);
    });
  },
  // check permission for a given user/role/resource/action
  isAllowedFor: function (userId, role, resource, action) {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          // Admin shortcut
          if (role === 'ADMIN') return resolve(true);
          // Look for user-specific rule first, then role-specific, then wildcard resource/action
          const q = `SELECT allow, role, userId FROM permissions WHERE (userId = ? OR role = ? OR role IS NULL) AND (resource = ? OR resource = '*' ) AND (action = ? OR action = '*') ORDER BY userId DESC, id DESC LIMIT 1`;
          db.get(q, [userId || null, role || null, resource, action], (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(false);
            resolve(!!row.allow);
          });
        })
        .catch(reject);
    });
  },
  // health helpers
  pingDb: function () {
    return new Promise((resolve, reject) => {
      initDb()
        .then(() => {
          db.get('SELECT 1 as ok', (err, row) => {
            if (err) return reject(err);
            resolve(!!row);
          });
        })
        .catch(reject);
    });
  },
  closeDb: function () {
    return new Promise((resolve, reject) => {
      if (!db) return resolve();
      db.close((err) => {
        if (err) return reject(err);
        db = null;
        resolve();
      });
    });
  },
};
