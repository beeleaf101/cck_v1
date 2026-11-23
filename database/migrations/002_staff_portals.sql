-- Migration 002: staff portal accounts and shared portal data
-- Run once on a database created from an earlier schema.sql.

-- Staff accounts get a role (admin, hod, reg1, reg2, facility, nehad)
ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';

-- Sessions: allow the new roles (SQLite cannot change a CHECK, so recreate; this logs everyone out)
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student', 'hod', 'reg1', 'reg2', 'facility', 'nehad')),
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Shared portal data (former localStorage keys)
CREATE TABLE IF NOT EXISTS shared_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by TEXT,
    updated_role TEXT,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shared_state_updated ON shared_state(updated_at);
