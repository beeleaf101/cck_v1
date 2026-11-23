-- Migration 003: audit log table
-- 17. AUDIT LOG (portal activity shown on the admin dashboard)
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    portal TEXT,
    action TEXT,
    entity_type TEXT,
    entity_id TEXT,
    description TEXT,
    details TEXT DEFAULT '{}',
    old_value TEXT,
    new_value TEXT,
    performed_by TEXT,
    semester TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
