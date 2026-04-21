/**
 * Local Database Layer — SQLite via better-sqlite3
 * Clean sandbox boilerplate schema.
 */
const Database = require('better-sqlite3');
const config = require('./config');

let _db = null;

function getDb() {
    if (!_db) {
        _db = new Database(config.dbPath);
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
    }
    return _db;
}

/**
 * Initialize tables & indexes. Called once on startup.
 */
function initDb() {
    const db = getDb();
    db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_queue (
      id TEXT PRIMARY KEY,
      task_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON task_queue(status);
  `);
    console.log(`📦 Database initialized at ${config.dbPath}`);
}

module.exports = {
    initDb,
};
