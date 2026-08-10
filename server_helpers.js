const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.sqlite');
let db;

function initDb() {
  db = new Database(DB_PATH);
  // Create tables if not exist
  db.prepare(
    `CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      ts INTEGER NOT NULL
    )`
  ).run();

  // Insert sample metric if empty
  const count = db.prepare('SELECT COUNT(1) as c FROM metrics').get();
  if (count.c === 0) {
    const insert = db.prepare('INSERT INTO metrics (name, value, ts) VALUES (?, ?, ?)');
    insert.run('visitors', 120, Date.now());
    insert.run('signups', 12, Date.now());
  }
}

function getMetrics() {
  if (!db) initDb();
  return db.prepare('SELECT id, name, value, ts FROM metrics ORDER BY ts DESC').all();
}

function seedDb() {
  if (!db) initDb();
  db.prepare('DELETE FROM metrics').run();
  const insert = db.prepare('INSERT INTO metrics (name, value, ts) VALUES (?, ?, ?)');
  insert.run('visitors', 200, Date.now());
  insert.run('signups', 25, Date.now());
}

module.exports = { initDb, getMetrics, seedDb };
