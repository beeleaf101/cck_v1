-- =====================================================
-- CCK SIS - COMPREHENSIVE DATABASE SCHEMA WITH SEMESTER SUPPORT
-- =====================================================
-- Run this in your Supabase SQL Editor
-- This schema supports multi-semester data management

-- =====================================================
-- 1. SEMESTERS TABLE (Core reference table)
-- =====================================================
CREATE TABLE IF NOT EXISTS semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_key VARCHAR(20) UNIQUE NOT NULL, -- e.g., 'spring2026', 'fall2025'
    label VARCHAR(50) NOT NULL,               -- e.g., 'Spring 2026', 'Fall 2025'
    year INTEGER NOT NULL,                     -- e.g., 2026, 2025
    term VARCHAR(10) NOT NULL,                 -- 'spring' or 'fall'
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT false,
    is_planning BOOLEAN DEFAULT false,         -- For future semesters
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default semesters
INSERT INTO semesters (semester_key, label, year, term, is_current, is_planning) VALUES
('fall2026', 'Fall 2026', 2026, 'fall', false, true),
('spring2026', 'Spring 2026', 2026, 'spring', true, false),
('fall2025', 'Fall 2025', 2025, 'fall', false, false),
('spring2025', 'Spring 2025', 2025, 'spring', false, false),
('fall2024', 'Fall 2024', 2024, 'fall', false, false),
('spring2024', 'Spring 2024', 2024, 'spring', false, false)
ON CONFLICT (semester_key) DO NOTHING;

-- =====================================================
-- 2. STUDENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    major VARCHAR(100),
    program_code VARCHAR(50),
    level INTEGER DEFAULT 1,
    gpa DECIMAL(3,2),
    cgpa DECIMAL(3,2),
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, graduated, suspended
    admission_semester_id UUID REFERENCES semesters(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. COURSES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    credits INTEGER DEFAULT 3,
    program_code VARCHAR(50),
    semester_number INTEGER, -- Which semester in the program (1-8)
    course_type VARCHAR(20), -- 'core', 'elective', 'general'
    prerequisites TEXT[],
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(code, program_code)
);

-- =====================================================
-- 4. INSTRUCTORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS instructors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id VARCHAR(20) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    department VARCHAR(100),
    specializations TEXT[],
    max_courses_per_semester INTEGER DEFAULT 4,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. ENROLLMENTS TABLE (Semester-specific)
-- =====================================================
CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    section VARCHAR(10) DEFAULT '1',
    grade VARCHAR(5),                          -- A+, A, A-, B+, etc.
    grade_points DECIMAL(3,2),
    status VARCHAR(20) DEFAULT 'enrolled',     -- enrolled, completed, dropped, failed
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(semester_id, student_id, course_code, section)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_enrollments_semester ON enrollments(semester_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_code);

-- =====================================================
-- 6. COURSE ALLOCATIONS TABLE (Semester-specific)
-- =====================================================
CREATE TABLE IF NOT EXISTS course_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255),
    section VARCHAR(10) DEFAULT '1',
    instructor_id UUID REFERENCES instructors(id),
    instructor_name VARCHAR(255),
    room VARCHAR(50),
    day_of_week VARCHAR(20),
    start_time TIME,
    end_time TIME,
    predicted_enrollment INTEGER,
    actual_enrollment INTEGER,
    capacity INTEGER DEFAULT 35,
    status VARCHAR(20) DEFAULT 'planned',      -- planned, confirmed, cancelled
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(semester_id, course_code, section)
);

CREATE INDEX IF NOT EXISTS idx_allocations_semester ON course_allocations(semester_id);

-- =====================================================
-- 7. TIMETABLES TABLE (Semester-specific)
-- =====================================================
CREATE TABLE IF NOT EXISTS timetables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    program_code VARCHAR(50) NOT NULL,
    program_name VARCHAR(255),
    level INTEGER,
    status VARCHAR(20) DEFAULT 'draft',        -- draft, published, archived
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(semester_id, program_code, level)
);

-- =====================================================
-- 8. TIMETABLE ENTRIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS timetable_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_id UUID REFERENCES timetables(id) ON DELETE CASCADE,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255),
    section VARCHAR(10) DEFAULT '1',
    instructor_name VARCHAR(255),
    room VARCHAR(50),
    day_of_week VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timetable_entries_timetable ON timetable_entries(timetable_id);

-- =====================================================
-- 9. COURSE ADVISING / DEMAND TABLE (Semester-specific)
-- =====================================================
CREATE TABLE IF NOT EXISTS course_demand (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255),
    student_id VARCHAR(20) NOT NULL,
    student_name VARCHAR(255),
    program_code VARCHAR(50),
    priority INTEGER DEFAULT 1,                -- 1=must take, 2=should take, 3=want to take
    status VARCHAR(20) DEFAULT 'requested',    -- requested, approved, enrolled
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(semester_id, course_code, student_id)
);

CREATE INDEX IF NOT EXISTS idx_course_demand_semester ON course_demand(semester_id);

-- =====================================================
-- 10. HISTORICAL GRADES TABLE (For predictions)
-- =====================================================
CREATE TABLE IF NOT EXISTS historical_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_id UUID REFERENCES semesters(id),
    semester_label VARCHAR(50),                -- e.g., 'Fall 2023-2024'
    student_id VARCHAR(20) NOT NULL,
    student_name VARCHAR(255),
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255),
    grade VARCHAR(5),
    grade_points DECIMAL(3,2),
    credit_hours INTEGER DEFAULT 3,
    gpa DECIMAL(3,2),
    cgpa DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historical_grades_semester ON historical_grades(semester_id);
CREATE INDEX IF NOT EXISTS idx_historical_grades_course ON historical_grades(course_code);

-- =====================================================
-- 11. ANALYTICS SNAPSHOTS TABLE (Semester-specific)
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_id UUID REFERENCES semesters(id) NOT NULL,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    total_students INTEGER,
    total_courses INTEGER,
    total_sections INTEGER,
    total_instructors INTEGER,
    avg_gpa DECIMAL(3,2),
    avg_class_size DECIMAL(5,2),
    room_utilization DECIMAL(5,2),
    enrollment_by_program JSONB,
    grade_distribution JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(semester_id, snapshot_date)
);

-- =====================================================
-- 12. SYSTEM SETTINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (key, value, description) VALUES
('current_semester', '"spring2026"', 'Currently active semester'),
('planning_semester', '"fall2026"', 'Semester for planning/allocation'),
('max_students_per_section', '35', 'Maximum students per section'),
('enrollment_growth_factor', '1.10', 'Default enrollment growth factor')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get semester ID from key
CREATE OR REPLACE FUNCTION get_semester_id(semester_key_param VARCHAR)
RETURNS UUID AS $$
    SELECT id FROM semesters WHERE semester_key = semester_key_param;
$$ LANGUAGE SQL;

-- Function to get current semester ID
CREATE OR REPLACE FUNCTION get_current_semester_id()
RETURNS UUID AS $$
    SELECT id FROM semesters WHERE is_current = true LIMIT 1;
$$ LANGUAGE SQL;

-- =====================================================
-- ROW LEVEL SECURITY (Optional - for multi-tenant)
-- =====================================================
-- Uncomment if you need RLS

-- ALTER TABLE students ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE course_allocations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VIEWS FOR EASIER QUERYING
-- =====================================================

-- View: Enrollment summary by semester
CREATE OR REPLACE VIEW enrollment_summary AS
SELECT 
    s.semester_key,
    s.label as semester_label,
    COUNT(DISTINCT e.student_id) as total_students,
    COUNT(DISTINCT e.course_code) as total_courses,
    COUNT(*) as total_enrollments,
    AVG(e.grade_points) as avg_grade_points
FROM semesters s
LEFT JOIN enrollments e ON s.id = e.semester_id
GROUP BY s.id, s.semester_key, s.label
ORDER BY s.year DESC, s.term DESC;

-- View: Course statistics by semester
CREATE OR REPLACE VIEW course_statistics AS
SELECT 
    s.semester_key,
    s.label as semester_label,
    e.course_code,
    COUNT(*) as total_enrolled,
    COUNT(CASE WHEN e.grade IN ('A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-') THEN 1 END) as passed,
    COUNT(CASE WHEN e.grade IN ('F','(FA)') THEN 1 END) as failed,
    ROUND(COUNT(CASE WHEN e.grade IN ('A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-') THEN 1 END)::DECIMAL / 
          NULLIF(COUNT(*), 0) * 100, 1) as pass_rate
FROM semesters s
LEFT JOIN enrollments e ON s.id = e.semester_id
WHERE e.course_code IS NOT NULL
GROUP BY s.id, s.semester_key, s.label, e.course_code;

-- View: Allocation summary by semester
CREATE OR REPLACE VIEW allocation_summary AS
SELECT 
    s.semester_key,
    s.label as semester_label,
    COUNT(*) as total_sections,
    COUNT(DISTINCT ca.course_code) as total_courses,
    COUNT(DISTINCT ca.instructor_name) as total_instructors,
    SUM(ca.predicted_enrollment) as total_predicted,
    AVG(ca.predicted_enrollment) as avg_section_size
FROM semesters s
LEFT JOIN course_allocations ca ON s.id = ca.semester_id
GROUP BY s.id, s.semester_key, s.label
ORDER BY s.year DESC, s.term DESC;

-- =====================================================
-- GRANT PERMISSIONS (adjust as needed)
-- =====================================================
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;