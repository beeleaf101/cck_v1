// CCK SIS - Database Integration with Semester Support
// Handles all database operations with semester-aware queries

// =====================================================
// DATABASE STATE
// =====================================================
const DatabaseState = {
    isConnected: false,
    currentSemesterId: null,
    currentSemesterKey: null,
    lastSync: null,
    syncInProgress: false
};

// =====================================================
// INITIALIZATION
// =====================================================

async function initializeDatabase() {
    console.log('Initializing database connection...');
    
    if (typeof isSupabaseConfigured !== 'function' || !isSupabaseConfigured()) {
        console.log('Not logged in as admin - database features use local storage until login');
        DatabaseState.isConnected = false;
        updateConnectionStatus(false);
        return false;
    }

    try {
        if (typeof db !== 'undefined' && db.init) {
            const connected = await db.init();
            DatabaseState.isConnected = connected;
            updateConnectionStatus(connected);
            
            if (connected) {
                console.log('Database connected successfully');
                await loadCurrentSemesterFromDB();
            }
            
            return connected;
        }
    } catch (error) {
        console.error('Database initialization failed:', error);
    }
    
    DatabaseState.isConnected = false;
    updateConnectionStatus(false);
    return false;
}

function updateConnectionStatus(isConnected) {
    const indicator = document.getElementById('db-status-indicator');
    if (indicator) {
        indicator.innerHTML = isConnected 
            ? '<span style="color: #10B981;">● Connected</span>'
            : '<span style="color: #F59E0B;">● Offline</span>';
    }
}

// =====================================================
// SEMESTER MANAGEMENT
// =====================================================

// Load current semester from database
async function loadCurrentSemesterFromDB() {
    if (!DatabaseState.isConnected) return;
    
    try {
        const client = getSupabaseClient();
        if (!client) return;
        
        // Get current semester setting
        const { data: setting } = await client
            .from('system_settings')
            .select('value')
            .eq('key', 'current_semester')
            .single();
        
        if (setting) {
            // The API already decodes JSON values; older data may still be a JSON string
            let semesterKey = setting.value;
            if (typeof semesterKey === 'string' && semesterKey.startsWith('"')) semesterKey = JSON.parse(semesterKey);
            await setSemesterContext(semesterKey);
        }
    } catch (error) {
        console.log('Could not load semester from DB:', error.message);
    }
}

// Set the semester context for all queries
async function setSemesterContext(semesterKey) {
    if (!DatabaseState.isConnected) {
        DatabaseState.currentSemesterKey = semesterKey;
        return;
    }
    
    try {
        const client = getSupabaseClient();
        if (!client) return;
        
        // Get semester ID
        const { data: semester } = await client
            .from('semesters')
            .select('id, label')
            .eq('semester_key', semesterKey)
            .single();
        
        if (semester) {
            DatabaseState.currentSemesterId = semester.id;
            DatabaseState.currentSemesterKey = semesterKey;
            console.log('Semester context set:', semester.label);
        }
    } catch (error) {
        console.log('Could not set semester context:', error.message);
        DatabaseState.currentSemesterKey = semesterKey;
    }
}

// Save current semester to database
async function saveCurrentSemesterToDB(semesterKey) {
    if (!DatabaseState.isConnected) return;
    
    try {
        const client = getSupabaseClient();
        if (!client) return;
        
        // Insert or replace the setting in one step (no gap where it is missing)
        await client
            .from('system_settings')
            .upsert({
                key: 'current_semester',
                value: JSON.stringify(semesterKey),
                description: 'Currently active semester',
                updated_at: new Date().toISOString()
            });
        
        // Update semesters table
        await client
            .from('semesters')
            .update({ is_current: false })
            .neq('semester_key', semesterKey);
        
        await client
            .from('semesters')
            .update({ is_current: true })
            .eq('semester_key', semesterKey);
        
        console.log('Saved current semester to DB:', semesterKey);
    } catch (error) {
        console.error('Failed to save semester to DB:', error);
    }
}

// =====================================================
// COURSE ALLOCATIONS (Semester-Specific)
// =====================================================

// Save course allocation for current semester
async function saveAllocationToDatabase(allocationResults) {
    const semesterKey = AppState.currentSemester || 'spring2026';
    
    // Always save to localStorage
    localStorage.setItem('cck_allocation_' + semesterKey, JSON.stringify({
        results: allocationResults.results || allocationResults,
        savedAt: new Date().toISOString(),
        semester: semesterKey
    }));
    
    if (!DatabaseState.isConnected) {
        console.log('Offline - allocation saved to localStorage only');
        return { success: true, offline: true };
    }
    
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false, error: 'No client' };
        
        // Get semester ID
        const { data: semester } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (!semester) {
            console.error('Semester not found:', semesterKey);
            return { success: false, error: 'Semester not found' };
        }
        
        const semesterId = semester.id;
        const results = allocationResults.results || allocationResults;
        
        // Delete existing allocations for this semester
        await client
            .from('course_allocations')
            .delete()
            .eq('semester_id', semesterId);
        
        // Prepare allocation records
        const allocations = results.map(a => ({
            semester_id: semesterId,
            course_code: a.courseCode,
            course_name: a.courseName,
            section: a.section || '1',
            instructor_name: a.instructor || a.fullInstructor,
            room: a.room,
            day_of_week: a.day,
            start_time: a.startTime,
            end_time: a.endTime,
            predicted_enrollment: a.predicted,
            capacity: a.capacity || 35,
            status: 'planned',
            metadata: {
                sections: a.sections,
                time: a.time,
                savedAt: new Date().toISOString()
            }
        }));
        
        // Insert in batches
        const batchSize = 50;
        for (let i = 0; i < allocations.length; i += batchSize) {
            const batch = allocations.slice(i, i + batchSize);
            const { error } = await client
                .from('course_allocations')
                .insert(batch);
            
            if (error) throw error;
        }
        
        console.log('Saved ' + allocations.length + ' allocations for ' + semesterKey + ' to database');
        return { success: true, count: allocations.length };
    } catch (error) {
        console.error('Failed to save allocation to database:', error);
        return { success: false, error };
    }
}

// Load course allocation for specific semester
async function loadAllocationFromDatabase(semesterKey) {
    // Try localStorage first
    const localKey = 'cck_allocation_' + semesterKey;
    const localData = localStorage.getItem(localKey);
    
    if (!DatabaseState.isConnected) {
        if (localData) {
            return { success: true, data: JSON.parse(localData), source: 'local' };
        }
        return { success: false, error: 'Offline and no local data' };
    }
    
    try {
        const client = getSupabaseClient();
        if (!client) {
            if (localData) return { success: true, data: JSON.parse(localData), source: 'local' };
            return { success: false, error: 'No client' };
        }
        
        // Get semester ID
        const { data: semester } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (!semester) {
            if (localData) return { success: true, data: JSON.parse(localData), source: 'local' };
            return { success: false, error: 'Semester not found' };
        }
        
        // Load allocations
        const { data: allocations, error } = await client
            .from('course_allocations')
            .select('*')
            .eq('semester_id', semester.id)
            .order('course_code');
        
        if (error) throw error;
        
        if (allocations && allocations.length > 0) {
            // Convert to app format
            const results = allocations.map(a => ({
                courseCode: a.course_code,
                courseName: a.course_name,
                section: a.section,
                sections: a.metadata?.sections || 1,
                instructor: a.instructor_name,
                fullInstructor: a.instructor_name,
                room: a.room,
                day: a.day_of_week,
                startTime: a.start_time,
                endTime: a.end_time,
                time: a.metadata?.time || (a.start_time + '-' + a.end_time),
                predicted: a.predicted_enrollment,
                capacity: a.capacity
            }));
            
            return { 
                success: true, 
                data: { results, savedAt: allocations[0]?.created_at },
                source: 'database'
            };
        }
        
        // Fall back to localStorage
        if (localData) {
            return { success: true, data: JSON.parse(localData), source: 'local' };
        }
        
        return { success: false, error: 'No allocation data found' };
    } catch (error) {
        console.error('Failed to load allocation from database:', error);
        if (localData) {
            return { success: true, data: JSON.parse(localData), source: 'local' };
        }
        return { success: false, error };
    }
}

// =====================================================
// TIMETABLES (Semester-Specific)
// =====================================================

async function saveTimetableToDatabase(timetables, majorNames) {
    if (!DatabaseState.isConnected) {
        console.log('Database not connected - timetable saved locally only');
        return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    try {
        // Get current semester
        const semesterKey = AppState.currentSemester || 'spring2026';
        const { data: semester, error: semError } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();

        if (semError || !semester) {
            console.error('No semester found:', semError);
            return;
        }

        // Count total courses
        let totalCourses = 0;
        for (const majorData of Object.values(timetables.majors || {})) {
            totalCourses += majorData.courses?.length || 0;
        }

        // Delete existing timetables for this semester first
        const { data: existingTimetables } = await client
            .from('timetables')
            .select('id')
            .eq('semester_id', semester.id);
        
        if (existingTimetables && existingTimetables.length > 0) {
            for (const tt of existingTimetables) {
                await client.from('timetable_entries').delete().eq('timetable_id', tt.id);
            }
            await client.from('timetables').delete().eq('semester_id', semester.id);
        }

        // Create timetable record
        const { data: timetableRecord, error: timetableError } = await client
            .from('timetables')
            .insert({
                semester_id: semester.id,
                program_code: majorNames.join(', ').substring(0, 200),
                program_name: `Generated Timetable - ${new Date().toLocaleDateString()}`,
                status: 'draft',
                metadata: {
                    programs: majorNames,
                    generated_at: new Date().toISOString(),
                    total_courses: totalCourses
                }
            })
            .select()
            .single();

        if (timetableError) {
            console.error('Error creating timetable:', timetableError);
            return;
        }

        console.log('Created timetable record:', timetableRecord.id);

        // Create timetable entries
        const entries = [];
        
        for (const [majorName, majorData] of Object.entries(timetables.majors || {})) {
            if (majorData.byLevel) {
                for (const [level, courses] of Object.entries(majorData.byLevel)) {
                    for (const course of courses) {
                        // Parse schedule to get day and times
                        const slots = parseSchedule(course.time || '');
                        
                        if (slots.length > 0) {
                            for (const slot of slots) {
                                entries.push({
                                    timetable_id: timetableRecord.id,
                                    course_code: course.code,
                                    course_name: course.name,
                                    section: course.section || '01',
                                    instructor_name: course.instructor || 'TBA',
                                    room: course.room || 'TBA',
                                    day_of_week: slot.day,
                                    start_time: slot.startTime,
                                    end_time: slot.endTime,
                                    metadata: {
                                        major: majorName,
                                        level: level,
                                        original_time: course.time,
                                        students: course.students || 0
                                    }
                                });
                            }
                        } else {
                            // No schedule parsed, save with placeholder
                            entries.push({
                                timetable_id: timetableRecord.id,
                                course_code: course.code,
                                course_name: course.name,
                                section: course.section || '01',
                                instructor_name: course.instructor || 'TBA',
                                room: course.room || 'TBA',
                                day_of_week: 'TBA',
                                start_time: '08:00:00',
                                end_time: '09:00:00',
                                metadata: {
                                    major: majorName,
                                    level: level,
                                    original_time: course.time || 'Not scheduled',
                                    students: course.students || 0
                                }
                            });
                        }
                    }
                }
            }
        }

        // Batch insert entries
        if (entries.length > 0) {
            const batchSize = 50;
            let insertedCount = 0;
            
            for (let i = 0; i < entries.length; i += batchSize) {
                const batch = entries.slice(i, i + batchSize);
                const { data, error } = await client
                    .from('timetable_entries')
                    .insert(batch)
                    .select();
                
                if (error) {
                    console.error('Error inserting entries batch:', error);
                } else {
                    insertedCount += data?.length || batch.length;
                }
            }
            
            console.log('Saved timetable with ' + insertedCount + ' entries to database');
            if (typeof showToast === 'function') {
                showToast('Timetable saved to database (' + insertedCount + ' entries)', 'success');
            }
        }

    } catch (error) {
        console.error('Error saving timetable to database:', error);
    }
}

// Parse schedule string to get day and times
function parseSchedule(timeStr) {
    if (!timeStr) return [];
    
    const slots = [];
    const dayMap = {
        'Sun': 'Sunday', 'Mon': 'Monday', 'Tue': 'Tuesday', 
        'Wed': 'Wednesday', 'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday',
        'U': 'Sunday', 'M': 'Monday', 'T': 'Tuesday', 'W': 'Wednesday', 
        'R': 'Thursday', 'F': 'Friday', 'S': 'Saturday'
    };
    
    // Match patterns like "Sun/Tue 08:00-09:15" or "MW 10:00-11:30"
    const match = timeStr.match(/([A-Za-z\/]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (match) {
        const daysStr = match[1];
        const startTime = match[2];
        const endTime = match[3];
        
        // Split days by / or parse letter codes
        let days = [];
        if (daysStr.includes('/')) {
            days = daysStr.split('/').map(d => dayMap[d] || d);
        } else {
            for (const char of daysStr) {
                if (dayMap[char]) days.push(dayMap[char]);
            }
        }
        
        for (const day of days) {
            slots.push({
                day: day,
                startTime: startTime.length === 4 ? '0' + startTime : startTime,
                endTime: endTime.length === 4 ? '0' + endTime : endTime
            });
        }
    }
    
    return slots;
}

async function loadTimetableFromDatabase(programCode, semesterKey) {
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    // Try localStorage first
    const localKey = 'cck_timetable_' + semesterKey + '_' + programCode;
    const localData = localStorage.getItem(localKey);
    
    if (!DatabaseState.isConnected) {
        if (localData) return { success: true, data: JSON.parse(localData), source: 'local' };
        return { success: false };
    }
    
    try {
        const client = getSupabaseClient();
        if (!client) {
            if (localData) return { success: true, data: JSON.parse(localData), source: 'local' };
            return { success: false };
        }
        
        // Get semester and timetable
        const { data: semester } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (!semester) {
            if (localData) return { success: true, data: JSON.parse(localData), source: 'local' };
            return { success: false };
        }
        
        const { data: timetable } = await client
            .from('timetables')
            .select('*, timetable_entries(*)')
            .eq('semester_id', semester.id)
            .eq('program_code', programCode)
            .single();
        
        if (timetable && timetable.timetable_entries) {
            const entries = timetable.timetable_entries.map(e => ({
                code: e.course_code,
                courseCode: e.course_code,
                name: e.course_name,
                courseName: e.course_name,
                section: e.section,
                instructor: e.instructor_name,
                room: e.room,
                day: e.day_of_week,
                startTime: e.start_time,
                endTime: e.end_time
            }));
            
            return { success: true, data: { entries }, source: 'database' };
        }
        
        if (localData) return { success: true, data: JSON.parse(localData), source: 'local' };
        return { success: false };
    } catch (error) {
        console.error('Failed to load timetable:', error);
        if (localData) return { success: true, data: JSON.parse(localData), source: 'local' };
        return { success: false, error };
    }
}

// =====================================================
// ENROLLMENTS (Semester-Specific)
// =====================================================

async function saveEnrollmentsToDatabase(enrollments, semesterKey) {
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    if (!DatabaseState.isConnected) {
        return { success: false, offline: true };
    }
    
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false };
        
        const { data: semester } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (!semester) return { success: false, error: 'Semester not found' };
        
        // Delete existing enrollments for this semester first
        await client
            .from('enrollments')
            .delete()
            .eq('semester_id', semester.id);
        
        const records = enrollments.map(e => ({
            semester_id: semester.id,
            student_id: e.student_id,
            course_code: e.course_code,
            section: e.section || '1',
            grade: e.grade,
            status: e.status || 'enrolled'
        }));
        
        // Insert in batches
        const batchSize = 100;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            const { error } = await client
                .from('enrollments')
                .insert(batch);
            if (error) throw error;
        }
        
        return { success: true, count: records.length };
    } catch (error) {
        console.error('Failed to save enrollments:', error);
        return { success: false, error };
    }
}

async function loadEnrollmentsFromDatabase(semesterKey) {
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    if (!DatabaseState.isConnected) {
        return { success: false, offline: true };
    }
    
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false };
        
        const { data: semester } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (!semester) return { success: false, error: 'Semester not found' };
        
        const { data: enrollments, error } = await client
            .from('enrollments')
            .select('*')
            .eq('semester_id', semester.id);
        
        if (error) throw error;
        
        return { success: true, data: enrollments };
    } catch (error) {
        console.error('Failed to load enrollments:', error);
        return { success: false, error };
    }
}

// =====================================================
// ANALYTICS (Semester-Specific)
// =====================================================

async function saveAnalyticsSnapshot(semesterKey) {
    if (!DatabaseState.isConnected) return { success: false };
    
    semesterKey = semesterKey || AppState.currentSemester;
    
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false };
        
        const { data: semester } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (!semester) return { success: false };
        
        // Calculate current stats
        const stats = {
            total_students: AppState.students?.length || 0,
            total_courses: AppState.courses?.length || 0,
            total_sections: AppState.savedAllocation?.totalSections || 0,
            total_instructors: AppState.instructors?.length || 0,
            avg_gpa: calculateAverageGPA(),
            enrollment_by_program: calculateEnrollmentByProgram(),
            grade_distribution: calculateGradeDistribution()
        };
        
        // Delete today's snapshot if exists, then insert
        const today = new Date().toISOString().split('T')[0];
        await client
            .from('analytics_snapshots')
            .delete()
            .eq('semester_id', semester.id)
            .eq('snapshot_date', today);
        
        await client
            .from('analytics_snapshots')
            .insert({
                semester_id: semester.id,
                snapshot_date: today,
                ...stats
            });
        
        return { success: true };
    } catch (error) {
        console.error('Failed to save analytics:', error);
        return { success: false, error };
    }
}

// =====================================================
// COURSE DEMAND / ADVISING (Semester-Specific)
// =====================================================

async function saveCourseDemandsToDatabase(demands, semesterKey) {
    semesterKey = semesterKey || AppState.currentSemester;
    
    // Save to localStorage
    localStorage.setItem('cck_demands_' + semesterKey, JSON.stringify(demands));
    
    if (!DatabaseState.isConnected) {
        return { success: true, offline: true };
    }
    
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false };
        
        const { data: semester } = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (!semester) return { success: false };
        
        // Delete existing demands for this semester
        await client
            .from('course_demand')
            .delete()
            .eq('semester_id', semester.id);
        
        const records = demands.map(d => ({
            semester_id: semester.id,
            course_code: d.courseCode,
            course_name: d.courseName,
            student_id: d.studentId,
            student_name: d.studentName,
            program_code: d.programCode,
            priority: d.priority || 1,
            status: 'requested'
        }));
        
        if (records.length > 0) {
            await client
                .from('course_demand')
                .insert(records);
        }
        
        return { success: true };
    } catch (error) {
        console.error('Failed to save course demands:', error);
        return { success: false, error };
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function calculateAverageGPA() {
    if (!AppState.students || AppState.students.length === 0) return 0;
    const gpas = AppState.students.filter(s => s.gpa).map(s => parseFloat(s.gpa));
    if (gpas.length === 0) return 0;
    return (gpas.reduce((a, b) => a + b, 0) / gpas.length).toFixed(2);
}

function calculateEnrollmentByProgram() {
    const byProgram = {};
    if (AppState.students) {
        AppState.students.forEach(s => {
            const prog = s.major || s.program || 'Unknown';
            byProgram[prog] = (byProgram[prog] || 0) + 1;
        });
    }
    return byProgram;
}

function calculateGradeDistribution() {
    const dist = {};
    if (AppState.enrollments) {
        AppState.enrollments.forEach(e => {
            if (e.grade) {
                dist[e.grade] = (dist[e.grade] || 0) + 1;
            }
        });
    }
    return dist;
}

// =====================================================
// INITIALIZATION
// =====================================================

// initializeDatabase() runs after an admin logs in (see handleLogin in app.js),
// because the database API only answers logged-in admins.

// Export functions
if (typeof window !== 'undefined') {
    window.initializeDatabase = initializeDatabase;
    window.saveAllocationToDatabase = saveAllocationToDatabase;
    window.loadAllocationFromDatabase = loadAllocationFromDatabase;
    window.saveTimetableToDatabase = saveTimetableToDatabase;
    window.loadTimetableFromDatabase = loadTimetableFromDatabase;
    window.saveEnrollmentsToDatabase = saveEnrollmentsToDatabase;
    window.loadEnrollmentsFromDatabase = loadEnrollmentsFromDatabase;
    window.saveCourseDemandsToDatabase = saveCourseDemandsToDatabase;
    window.saveAnalyticsSnapshot = saveAnalyticsSnapshot;
    window.setSemesterContext = setSemesterContext;
    window.saveCurrentSemesterToDB = saveCurrentSemesterToDB;
    window.DatabaseState = DatabaseState;
}