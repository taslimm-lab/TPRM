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

module.exports = { initDb, getMetrics, seedDb, createUser, getUserByEmail, getUserById };
