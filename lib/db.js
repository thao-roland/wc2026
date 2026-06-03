const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'wc2026.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

let _db = null;

function getDb() {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (fs.existsSync(SCHEMA_PATH)) {
    db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  }
  _db = db;
  return db;
}

module.exports = { getDb };
