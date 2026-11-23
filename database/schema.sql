-- =====================================================
-- CCK SIS - Cloudflare D1 (SQLite) schema
-- Converted from the original Supabase/PostgreSQL schema
-- (database/schema.postgres.sql) and adjusted to match the app code and data.
--
-- Postgres -> D1 conversions:
--   UUID DEFAULT gen_random_uuid()  -> TEXT DEFAULT (lower(hex(randomblob(16))))
--   BOOLEAN                         -> INTEGER (0/1)
--   JSONB / TEXT[]                  -> TEXT holding JSON
--   TIMESTAMPTZ DEFAULT NOW()       -> TEXT DEFAULT (datetime('now'))
--   SQL functions get_semester_id() / get_current_semester_id()
--                                   -> handled in the Worker (SQLite has no stored functions)
--
-- Changes made so the schema fits the code and data:
--   students.level is TEXT ('First Year', 'Third Year' ...), not INTEGER
--   students gets the extra fields the app uses: name_ar, civil_id, phone, gender,
--     nationality, student_type, language, degree_class, admit_term, enrolled_credits
--   enrollments gets student_name, course_name, time, teaching_method, instructor,
--     and its UNIQUE key includes teaching_method + time (a course can have a
--     Lecture row and a Lab row for the same student and section)
--   courses gets a sections column (JSON) like courses.json
--   instructors gets title and courses (JSON) like instructors.json
--   new tables for login: admin_users, sessions, login_attempts
-- =====================================================

PRAGMA foreign_keys = ON;

-- 1. SEMESTERS
CREATE TABLE IF NOT EXISTS semesters (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    semester_key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    year INTEGER NOT NULL,
    term TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    is_current INTEGER DEFAULT 0,
    is_planning INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO semesters (semester_key, label, year, term, start_date, end_date, is_current, is_planning) VALUES
('fall2026',   'Fall 2026',   2026, 'fall',   '2026-09-01', '2026-12-20', 0, 1),
('spring2026', 'Spring 2026', 2026, 'spring', '2026-01-15', '2026-05-15', 1, 0),
('fall2025',   'Fall 2025',   2025, 'fall',   '2025-09-01', '2025-12-20', 0, 0),
('spring2025', 'Spring 2025', 2025, 'spring', '2025-01-15', '2025-05-15', 0, 0),
('fall2024',   'Fall 2024',   2024, 'fall',   '2024-09-01', '2024-12-20', 0, 0),
('spring2024', 'Spring 2024', 2024, 'spring', '2024-01-15', '2024-05-15', 0, 0);

-- 2. STUDENTS
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    student_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    name_ar TEXT,
    civil_id TEXT,
    email TEXT,
    phone TEXT,
    gender TEXT,
    nationality TEXT,
    major TEXT,
    program_code TEXT,
    level TEXT,
    gpa REAL,
    cgpa REAL,
    enrolled_credits INTEGER DEFAULT 0,
    student_type TEXT,
    language TEXT,
    degree_class TEXT,
    admit_term TEXT,
    status TEXT DEFAULT 'active',
    admission_semester_id TEXT REFERENCES semesters(id),
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 3. COURSES
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    credits INTEGER DEFAULT 3,
    program_code TEXT,
    semester_number INTEGER,
    course_type TEXT,
    prerequisites TEXT DEFAULT '[]',
    sections TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(code, program_code)
);

-- 4. INSTRUCTORS
CREATE TABLE IF NOT EXISTS instructors (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    instructor_id TEXT UNIQUE,
    name TEXT NOT NULL,
    title TEXT,
    email TEXT,
    department TEXT,
    courses TEXT DEFAULT '[]',
    specializations TEXT DEFAULT '[]',
    max_courses_per_semester INTEGER DEFAULT 4,
    is_active INTEGER DEFAULT 1,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 5. ENROLLMENTS
CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    semester_id TEXT NOT NULL REFERENCES semesters(id),
    student_id TEXT NOT NULL,
    student_name TEXT,
    course_code TEXT NOT NULL,
    course_name TEXT,
    section TEXT DEFAULT '1',
    time TEXT DEFAULT '',
    teaching_method TEXT DEFAULT '',
    instructor TEXT,
    grade TEXT,
    grade_points REAL,
    status TEXT DEFAULT 'enrolled',
    enrolled_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(semester_id, student_id, course_code, section, teaching_method, time)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_semester ON enrollments(semester_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_code);

-- 6. COURSE ALLOCATIONS
CREATE TABLE IF NOT EXISTS course_allocations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    semester_id TEXT NOT NULL REFERENCES semesters(id),
    course_code TEXT NOT NULL,
    course_name TEXT,
    section TEXT DEFAULT '1',
    instructor_id TEXT,
    instructor_name TEXT,
    room TEXT,
    day_of_week TEXT,
    start_time TEXT,
    end_time TEXT,
    predicted_enrollment INTEGER,
    actual_enrollment INTEGER,
    capacity INTEGER DEFAULT 35,
    status TEXT DEFAULT 'planned',
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(semester_id, course_code, section)
);
CREATE INDEX IF NOT EXISTS idx_allocations_semester ON course_allocations(semester_id);

-- 7. TIMETABLES
CREATE TABLE IF NOT EXISTS timetables (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    semester_id TEXT NOT NULL REFERENCES semesters(id),
    program_code TEXT NOT NULL,
    program_name TEXT,
    level INTEGER,
    status TEXT DEFAULT 'draft',
    generated_at TEXT DEFAULT (datetime('now')),
    published_at TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(semester_id, program_code, level)
);

-- 8. TIMETABLE ENTRIES
CREATE TABLE IF NOT EXISTS timetable_entries (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    timetable_id TEXT REFERENCES timetables(id) ON DELETE CASCADE,
    course_code TEXT NOT NULL,
    course_name TEXT,
    section TEXT DEFAULT '1',
    instructor_name TEXT,
    room TEXT,
    day_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_timetable ON timetable_entries(timetable_id);

-- 9. COURSE DEMAND
CREATE TABLE IF NOT EXISTS course_demand (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    semester_id TEXT NOT NULL REFERENCES semesters(id),
    course_code TEXT NOT NULL,
    course_name TEXT,
    student_id TEXT NOT NULL,
    student_name TEXT,
    program_code TEXT,
    priority INTEGER DEFAULT 1,
    status TEXT DEFAULT 'requested',
    requested_at TEXT DEFAULT (datetime('now')),
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(semester_id, course_code, student_id)
);
CREATE INDEX IF NOT EXISTS idx_course_demand_semester ON course_demand(semester_id);

-- 10. HISTORICAL GRADES
CREATE TABLE IF NOT EXISTS historical_grades (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    semester_id TEXT REFERENCES semesters(id),
    semester_label TEXT,
    student_id TEXT NOT NULL,
    student_name TEXT,
    course_code TEXT NOT NULL,
    course_name TEXT,
    grade TEXT,
    grade_points REAL,
    credit_hours INTEGER DEFAULT 3,
    gpa REAL,
    cgpa REAL,
    verification TEXT DEFAULT 'confirmed',  -- 'confirmed' or 'unverified' (see tools/build_full_dataset.py)
    source_file TEXT,                       -- export the record came from
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_historical_grades_semester ON historical_grades(semester_id);
CREATE INDEX IF NOT EXISTS idx_historical_grades_course ON historical_grades(course_code);
CREATE INDEX IF NOT EXISTS idx_historical_grades_student ON historical_grades(student_id);

-- 11. ANALYTICS SNAPSHOTS
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    semester_id TEXT NOT NULL REFERENCES semesters(id),
    snapshot_date TEXT DEFAULT (date('now')),
    total_students INTEGER,
    total_courses INTEGER,
    total_sections INTEGER,
    total_instructors INTEGER,
    avg_gpa REAL,
    avg_class_size REAL,
    room_utilization REAL,
    enrollment_by_program TEXT,
    grade_distribution TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(semester_id, snapshot_date)
);

-- 12. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS system_settings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
('current_semester', '"spring2026"', 'Currently active semester'),
('planning_semester', '"fall2026"', 'Semester for planning/allocation'),
('max_students_per_section', '35', 'Maximum students per section'),
('enrollment_growth_factor', '1.10', 'Default enrollment growth factor'),
('enrollment_data_semester', '"spring2026"', 'Semester whose enrollments the app loads');

-- 13. LOGIN: admin accounts (password stored as PBKDF2 hash, never plain text)
CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 14. LOGIN: sessions (random token kept in an HttpOnly cookie)
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 15. LOGIN: failed attempts, for lockout after repeated wrong passwords
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    login_id TEXT,
    attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, attempted_at);

-- VIEWS
DROP VIEW IF EXISTS enrollment_summary;
CREATE VIEW enrollment_summary AS
SELECT
    s.semester_key,
    s.label AS semester_label,
    COUNT(DISTINCT e.student_id) AS total_students,
    COUNT(DISTINCT e.course_code) AS total_courses,
    COUNT(e.id) AS total_enrollments,
    AVG(e.grade_points) AS avg_grade_points
FROM semesters s
LEFT JOIN enrollments e ON s.id = e.semester_id
GROUP BY s.id, s.semester_key, s.label
ORDER BY s.year DESC, s.term DESC;

DROP VIEW IF EXISTS course_statistics;
CREATE VIEW course_statistics AS
SELECT
    s.semester_key,
    s.label AS semester_label,
    e.course_code,
    COUNT(*) AS total_enrolled,
    SUM(CASE WHEN e.grade IN ('A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-') THEN 1 ELSE 0 END) AS passed,
    SUM(CASE WHEN e.grade IN ('F','(FA)') THEN 1 ELSE 0 END) AS failed,
    ROUND(SUM(CASE WHEN e.grade IN ('A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-') THEN 1 ELSE 0 END) * 100.0
          / NULLIF(COUNT(*), 0), 1) AS pass_rate
FROM semesters s
JOIN enrollments e ON s.id = e.semester_id
GROUP BY s.id, s.semester_key, s.label, e.course_code;

DROP VIEW IF EXISTS allocation_summary;
CREATE VIEW allocation_summary AS
SELECT
    s.semester_key,
    s.label AS semester_label,
    COUNT(ca.id) AS total_sections,
    COUNT(DISTINCT ca.course_code) AS total_courses,
    COUNT(DISTINCT ca.instructor_name) AS total_instructors,
    SUM(ca.predicted_enrollment) AS total_predicted,
    AVG(ca.predicted_enrollment) AS avg_section_size
FROM semesters s
LEFT JOIN course_allocations ca ON s.id = ca.semester_id
GROUP BY s.id, s.semester_key, s.label
ORDER BY s.year DESC, s.term DESC;
