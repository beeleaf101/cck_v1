// CCK SIS - Database Data Sync Module
// Handles syncing all data to the Cloudflare D1 database with semester labels

// =====================================================
// DATA SYNC STATE
// =====================================================
const DataSync = {
    isSyncing: false,
    lastSync: null,
    progress: 0,
    status: ''
};

// =====================================================
// SEMESTER DEFINITIONS
// =====================================================
// Grade points used when saving historical grades (same scale as historical_grades.json)
const GRADE_POINTS_FOR_SYNC = { 'A+': 4.0, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0,
    'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0.0, '(FA)': 0.0 };

const SEMESTER_DEFINITIONS = {
    'spring2024': { label: 'Spring 2024', year: 2024, term: 'spring', start: '2024-01-15', end: '2024-05-15' },
    'fall2024': { label: 'Fall 2024', year: 2024, term: 'fall', start: '2024-09-01', end: '2024-12-20' },
    'spring2025': { label: 'Spring 2025', year: 2025, term: 'spring', start: '2025-01-15', end: '2025-05-15' },
    'fall2025': { label: 'Fall 2025', year: 2025, term: 'fall', start: '2025-09-01', end: '2025-12-20' },
    'spring2026': { label: 'Spring 2026', year: 2026, term: 'spring', start: '2026-01-15', end: '2026-05-15' },
    'fall2026': { label: 'Fall 2026', year: 2026, term: 'fall', start: '2026-09-01', end: '2026-12-20' }
};

// getSupabaseClient() and isDbConnected() come from js/d1-client.js

// =====================================================
// INITIALIZE SEMESTERS IN DATABASE
// =====================================================
async function initializeSemestersInDB() {
    if (!isDbConnected()) {
        console.log('Database not connected');
        return { success: false, error: 'Not connected' };
    }
    
    var client = getSupabaseClient();
    
    try {
        var semesters = [];
        var keys = Object.keys(SEMESTER_DEFINITIONS);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var def = SEMESTER_DEFINITIONS[key];
            semesters.push({
                semester_key: key,
                label: def.label,
                year: def.year,
                term: def.term,
                start_date: def.start,
                end_date: def.end,
                is_current: key === 'spring2026',
                is_planning: key === 'fall2026'
            });
        }
        
        var result = await client.from('semesters').upsert(semesters, { onConflict: 'semester_key', ignoreDuplicates: true });
        
        if (result.error) throw result.error;
        
        console.log('Initialized', semesters.length, 'semesters in database');
        return { success: true, count: semesters.length };
    } catch (error) {
        console.error('Failed to initialize semesters:', error);
        return { success: false, error: error };
    }
}

// =====================================================
// GET SEMESTER ID FROM KEY
// =====================================================
async function getSemesterIdFromKey(semesterKey) {
    if (!isDbConnected()) return null;
    
    var client = getSupabaseClient();
    
    try {
        var result = await client
            .from('semesters')
            .select('id')
            .eq('semester_key', semesterKey)
            .single();
        
        if (result.data) return result.data.id;
        return null;
    } catch (error) {
        console.error('Failed to get semester ID:', error);
        return null;
    }
}

// =====================================================
// SYNC ALL STUDENTS TO DATABASE
// =====================================================
async function syncStudentsToDatabase(semesterKey) {
    if (!isDbConnected()) return { success: false, error: 'Not connected' };
    if (!AppState || !AppState.students || !AppState.students.length) return { success: false, error: 'No student data loaded' };
    
    var client = getSupabaseClient();
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    updateSyncStatus('Syncing students...', 10);
    
    try {
        var semesterId = await getSemesterIdFromKey(semesterKey);
        
        var students = [];
        for (var i = 0; i < AppState.students.length; i++) {
            var s = AppState.students[i];
            var gpa = parseFloat(s.gpa);
            var cgpa = parseFloat(s.cgpa);
            students.push({
                student_id: s.student_id || s.id || ('STU' + i),
                name: s.name || 'Unknown',
                name_ar: s.name_ar || null,
                civil_id: s.civil_id || null,
                email: s.email || null,
                phone: s.phone || null,
                gender: s.gender || null,
                nationality: s.nationality || null,
                major: s.major || s.program || null,
                program_code: s.program_code || null,
                level: s.level != null ? String(s.level) : null,
                gpa: isNaN(gpa) ? null : gpa,
                cgpa: isNaN(cgpa) ? (isNaN(gpa) ? null : gpa) : cgpa,
                enrolled_credits: parseInt(s.enrolled_credits) || 0,
                student_type: s.student_type || null,
                language: s.language || null,
                degree_class: s.degree_class || null,
                admit_term: s.admit_term || null,
                status: s.status || 'active',
                admission_semester_id: semesterId,
                metadata: { synced_at: new Date().toISOString(), semester: semesterKey }
            });
        }
        
        // Save (insert or replace by student_id). Students are never mass-deleted here,
        // so a failed sync can't wipe the table; single deletes go through the Students page.
        // Batch save
        var batchSize = 100;
        var inserted = 0;
        for (var i = 0; i < students.length; i += batchSize) {
            var batch = students.slice(i, i + batchSize);
            var result = await client.from('students').upsert(batch);
            if (result.error) throw result.error;
            inserted += batch.length;
            updateSyncStatus('Synced ' + inserted + '/' + students.length + ' students...', 10 + Math.round((inserted / students.length) * 20));
        }
        
        console.log('Synced', students.length, 'students to database');
        return { success: true, count: students.length };
    } catch (error) {
        console.error('Failed to sync students:', error);
        return { success: false, error: error };
    }
}

// =====================================================
// SYNC ALL COURSES TO DATABASE
// =====================================================
async function syncCoursesToDatabase(semesterKey) {
    if (!isDbConnected()) return { success: false, error: 'Not connected' };
    if (!AppState || !AppState.courses || !AppState.courses.length) return { success: false, error: 'No course data loaded' };
    
    var client = getSupabaseClient();
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    updateSyncStatus('Syncing courses...', 35);
    
    try {
        var courses = [];
        for (var i = 0; i < AppState.courses.length; i++) {
            var c = AppState.courses[i];
            courses.push({
                code: c.code || c.course_code || ('CRS' + i),
                name: c.name || c.title || c.course_name || 'Unknown Course',
                credits: parseInt(c.credits) || 3,
                program_code: c.program_code || c.program || null,
                semester_number: parseInt(c.semester) || null,
                course_type: c.type || 'core',
                prerequisites: c.prerequisite ? [c.prerequisite] : [],
                sections: c.sections || [],
                is_active: true,
                metadata: {
                    original_data: c,
                    synced_at: new Date().toISOString(),
                    semester: semesterKey
                }
            });
        }
        
        // Remove duplicates by code
        var uniqueCourses = [];
        var seenCodes = {};
        for (var i = 0; i < courses.length; i++) {
            var key = courses[i].code + '_' + (courses[i].program_code || 'none');
            if (!seenCodes[key]) {
                seenCodes[key] = true;
                uniqueCourses.push(courses[i]);
            }
        }
        
        // Delete existing courses first
        await client.from('courses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        var batchSize = 50;
        var inserted = 0;
        for (var i = 0; i < uniqueCourses.length; i += batchSize) {
            var batch = uniqueCourses.slice(i, i + batchSize);
            var result = await client.from('courses').insert(batch);
            if (result.error && result.error.code !== '23505') throw result.error;
            inserted += batch.length;
            updateSyncStatus('Synced ' + inserted + '/' + uniqueCourses.length + ' courses...', 35 + Math.round((inserted / uniqueCourses.length) * 15));
        }
        
        console.log('Synced', uniqueCourses.length, 'courses to database');
        return { success: true, count: uniqueCourses.length };
    } catch (error) {
        console.error('Failed to sync courses:', error);
        return { success: false, error: error };
    }
}

// =====================================================
// SYNC ALL INSTRUCTORS TO DATABASE
// =====================================================
async function syncInstructorsToDatabase(semesterKey) {
    if (!isDbConnected()) return { success: false, error: 'Not connected' };
    if (!AppState || !AppState.instructors || !AppState.instructors.length) return { success: false, error: 'No instructor data loaded' };
    
    var client = getSupabaseClient();
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    updateSyncStatus('Syncing instructors...', 55);
    
    try {
        var instructors = [];
        for (var i = 0; i < AppState.instructors.length; i++) {
            var inst = AppState.instructors[i];
            instructors.push({
                instructor_id: inst.id || ('INS' + (i + 1).toString().padStart(4, '0')),
                name: inst.name || 'Unknown Instructor',
                title: inst.title || null,
                courses: inst.courses || [],
                email: inst.email || null,
                department: inst.department || null,
                specializations: inst.specializations || [],
                max_courses_per_semester: 4,
                is_active: true,
                metadata: {
                    original_data: inst,
                    synced_at: new Date().toISOString(),
                    semester: semesterKey
                }
            });
        }
        
        // Delete existing instructors first
        await client.from('instructors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        var result = await client.from('instructors').insert(instructors);
        if (result.error) throw result.error;
        
        console.log('Synced', instructors.length, 'instructors to database');
        return { success: true, count: instructors.length };
    } catch (error) {
        console.error('Failed to sync instructors:', error);
        return { success: false, error: error };
    }
}

// =====================================================
// SYNC ALL ENROLLMENTS TO DATABASE
// =====================================================
async function syncEnrollmentsToDatabase(semesterKey) {
    if (!isDbConnected()) return { success: false, error: 'Not connected' };
    if (!AppState || !AppState.enrollments || !AppState.enrollments.length) return { success: false, error: 'No enrollment data loaded' };
    
    var client = getSupabaseClient();
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    // Enrollments always belong to the semester the app loads them from (see /api/data)
    semesterKey = AppState.enrollmentSemester || semesterKey;
    updateSyncStatus('Syncing enrollments...', 60);
    
    try {
        var semesterId = await getSemesterIdFromKey(semesterKey);
        if (!semesterId) {
            await initializeSemestersInDB();
            semesterId = await getSemesterIdFromKey(semesterKey);
        }
        
        var enrollments = [];
        for (var i = 0; i < AppState.enrollments.length; i++) {
            var e = AppState.enrollments[i];
            enrollments.push({
                semester_id: semesterId,
                student_id: e.student_id || e.studentId,
                student_name: e.student_name || null,
                course_code: e.course_code || e.courseCode || e.code,
                course_name: e.course_name || null,
                section: e.section || '1',
                time: e.time || '',
                teaching_method: e.teaching_method || '',
                instructor: e.instructor || null,
                grade: e.grade || null,
                status: e.status || (e.grade ? 'completed' : 'enrolled'),
                metadata: { synced_at: new Date().toISOString() }
            });
        }
        
        // Delete existing enrollments for this semester
        await client.from('enrollments').delete().eq('semester_id', semesterId);
        
        var batchSize = 100;
        var inserted = 0;
        for (var i = 0; i < enrollments.length; i += batchSize) {
            var batch = enrollments.slice(i, i + batchSize);
            var result = await client.from('enrollments').insert(batch);
            if (result.error && result.error.code !== '23505') throw result.error;
            inserted += batch.length;
            updateSyncStatus('Synced ' + inserted + '/' + enrollments.length + ' enrollments...', 60 + Math.round((inserted / enrollments.length) * 15));
        }
        
        console.log('Synced', enrollments.length, 'enrollments to database');
        return { success: true, count: enrollments.length };
    } catch (error) {
        console.error('Failed to sync enrollments:', error);
        return { success: false, error: error };
    }
}

// =====================================================
// SYNC HISTORICAL GRADES TO DATABASE
// =====================================================
async function syncHistoricalGradesToDatabase() {
    if (!isDbConnected()) return { success: false, error: 'Not connected' };
    // Never wipe the table because nothing was loaded
    if (typeof HistoricalData === 'undefined' || !HistoricalData.records || !HistoricalData.records.length) {
        return { success: false, error: 'No historical data loaded' };
    }
    
    var client = getSupabaseClient();
    
    updateSyncStatus('Syncing historical grades...', 78);
    
    try {
        var records = [];
        for (var i = 0; i < HistoricalData.records.length; i++) {
            var r = HistoricalData.records[i];
            records.push({
                semester_label: r.semester || 'Unknown',
                student_id: r.student_id || r.studentId,
                student_name: r.student_name || r.studentName,
                course_code: r.course_code || r.courseCode,
                course_name: r.course_name || r.courseName,
                grade: r.grade,
                grade_points: (typeof GRADE_POINTS_FOR_SYNC !== 'undefined' && r.grade in GRADE_POINTS_FOR_SYNC) ? GRADE_POINTS_FOR_SYNC[r.grade] : null,
                credit_hours: parseInt(r.credit_hours) || 3,
                gpa: parseFloat(r.gpa) || null,
                cgpa: parseFloat(r.cgpa) || null
            });
        }
        
        // Replace the existing records instead of adding duplicates on every sync
        var del = await client.from('historical_grades').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (del.error) throw del.error;

        var batchSize = 100;
        var inserted = 0;
        for (var i = 0; i < records.length; i += batchSize) {
            var batch = records.slice(i, i + batchSize);
            var result = await client.from('historical_grades').insert(batch);
            if (result.error && result.error.code !== '23505') throw result.error;
            inserted += batch.length;
            updateSyncStatus('Synced ' + inserted + '/' + records.length + ' historical grades...', 78 + Math.round((inserted / records.length) * 10));
        }
        
        console.log('Synced', records.length, 'historical grade records to database');
        return { success: true, count: records.length };
    } catch (error) {
        console.error('Failed to sync historical grades:', error);
        return { success: false, error: error };
    }
}

// =====================================================
// SYNC COURSE ALLOCATION TO DATABASE
// =====================================================
async function syncAllocationToDatabase(semesterKey) {
    if (!isDbConnected()) return { success: false, error: 'Not connected' };
    
    var client = getSupabaseClient();
    semesterKey = semesterKey || AppState.currentSemester || 'spring2026';
    
    // Get allocation from localStorage or AppState
    var allocationKey = 'cck_allocation_' + semesterKey;
    var savedData = localStorage.getItem(allocationKey);
    var results = null;
    
    if (savedData) {
        try {
            var parsed = JSON.parse(savedData);
            results = parsed.results || parsed;
        } catch (e) {}
    }
    
    if (!results && AppState.savedAllocation) {
        results = AppState.savedAllocation.results || AppState.savedAllocation;
    }
    
    if (!results || !Array.isArray(results) || results.length === 0) {
        console.log('No allocation data to sync for', semesterKey);
        return { success: true, count: 0 };
    }
    
    updateSyncStatus('Syncing course allocation for ' + semesterKey + '...', 90);
    
    try {
        var semesterId = await getSemesterIdFromKey(semesterKey);
        if (!semesterId) return { success: false, error: 'Semester not found' };
        
        // Delete existing allocations for this semester
        await client.from('course_allocations').delete().eq('semester_id', semesterId);
        
        var allocations = [];
        for (var i = 0; i < results.length; i++) {
            var a = results[i];
            allocations.push({
                semester_id: semesterId,
                course_code: a.courseCode || a.code,
                course_name: a.courseName || a.name,
                section: a.section || '1',
                instructor_name: a.instructor || a.fullInstructor,
                room: a.room,
                day_of_week: a.day,
                start_time: a.startTime,
                end_time: a.endTime,
                predicted_enrollment: a.predicted || 0,
                capacity: a.capacity || 35,
                status: 'planned',
                metadata: {
                    sections: a.sections,
                    time: a.time,
                    synced_at: new Date().toISOString()
                }
            });
        }
        
        var result = await client.from('course_allocations').insert(allocations);
        if (result.error) throw result.error;
        
        console.log('Synced', allocations.length, 'allocations for', semesterKey);
        return { success: true, count: allocations.length };
    } catch (error) {
        console.error('Failed to sync allocation:', error);
        return { success: false, error: error };
    }
}

// =====================================================
// FULL SYNC - ALL DATA
// =====================================================
async function syncAllDataToDatabase() {
    if (!isDbConnected()) {
        showToast('Database not connected. Log in as admin first.', 'error');
        return { success: false, error: 'Not connected' };
    }
    
    if (DataSync.isSyncing) {
        showToast('Sync already in progress...', 'warning');
        return { success: false, error: 'Already syncing' };
    }
    
    DataSync.isSyncing = true;
    DataSync.progress = 0;
    showSyncModal();
    
    try {
        var results = {};
        
        // Initialize semesters first
        updateSyncStatus('Initializing semesters...', 5);
        results.semesters = await initializeSemestersInDB();
        
        // Sync students
        results.students = await syncStudentsToDatabase();
        
        // Sync courses
        results.courses = await syncCoursesToDatabase();
        
        // Sync instructors
        results.instructors = await syncInstructorsToDatabase();
        
        // Sync enrollments
        results.enrollments = await syncEnrollmentsToDatabase();
        
        // Sync historical grades
        if (typeof HistoricalData !== 'undefined' && HistoricalData.loaded) {
            results.historicalGrades = await syncHistoricalGradesToDatabase();
        }
        
        // Sync allocations for all semesters with data
        var semesterKeys = Object.keys(SEMESTER_DEFINITIONS);
        for (var i = 0; i < semesterKeys.length; i++) {
            var key = semesterKeys[i];
            var allocResult = await syncAllocationToDatabase(key);
            if (allocResult.count > 0) {
                results['allocation_' + key] = allocResult;
            }
        }
        
        updateSyncStatus('Sync complete!', 100);
        DataSync.lastSync = new Date();
        DataSync.isSyncing = false;
        
        setTimeout(function() {
            hideSyncModal();
            showToast('All data synced to database successfully!', 'success');
        }, 1500);
        
        return { success: true, results: results };
    } catch (error) {
        console.error('Full sync failed:', error);
        DataSync.isSyncing = false;
        hideSyncModal();
        showToast('Sync failed: ' + error.message, 'error');
        return { success: false, error: error };
    }
}

// =====================================================
// DELETE ALL DATA (PASSWORD PROTECTED)
// =====================================================
async function deleteAllDatabaseData(password) {
    if (!isDbConnected()) {
        showToast('Database not connected', 'error');
        return { success: false, error: 'Not connected' };
    }
    if (!password) {
        showToast('Enter the admin password', 'error');
        return { success: false, error: 'No password' };
    }
    
    // Confirm deletion
    var confirmed = confirm('⚠️ WARNING: This will DELETE ALL DATA from the database!\n\nThis includes:\n- All students\n- All courses\n- All instructors\n- All enrollments\n- All allocations\n- All historical grades\n\nThis action CANNOT be undone!\n\nAre you absolutely sure?');
    
    if (!confirmed) {
        showToast('Deletion cancelled', 'info');
        return { success: false, error: 'Cancelled by user' };
    }
    
    showSyncModal();
    updateSyncStatus('Deleting all data...', 10);
    
    try {
        // The server checks the admin password and deletes everything in one batch
        var res = await window.api.deleteAllData(password);
        if (res.error) {
            hideSyncModal();
            showToast(res.error.status === 403 ? 'Incorrect password!' : 'Delete failed: ' + res.error.message, 'error');
            return { success: false, error: res.error.message };
        }
        
        updateSyncStatus('Clearing local storage...', 95);
        // Clear localStorage allocation and timetable data
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && (key.startsWith('cck_allocation_') || key.startsWith('cck_timetable_') || key.startsWith('cck_demands_'))) {
                keysToRemove.push(key);
            }
        }
        for (var i = 0; i < keysToRemove.length; i++) {
            localStorage.removeItem(keysToRemove[i]);
        }
        
        updateSyncStatus('Deletion complete!', 100);
        
        setTimeout(function() {
            hideSyncModal();
            showToast('All database data has been deleted', 'success');
            // Reload page to reset state
            location.reload();
        }, 1500);
        
        return { success: true };
    } catch (error) {
        console.error('Delete failed:', error);
        hideSyncModal();
        showToast('Delete failed: ' + error.message, 'error');
        return { success: false, error: error };
    }
}

// =====================================================
// UI HELPERS
// =====================================================
function updateSyncStatus(status, progress) {
    DataSync.status = status;
    DataSync.progress = progress;
    
    var statusEl = document.getElementById('sync-status-text');
    var progressEl = document.getElementById('sync-progress-bar');
    var percentEl = document.getElementById('sync-progress-percent');
    
    if (statusEl) statusEl.textContent = status;
    if (progressEl) progressEl.style.width = progress + '%';
    if (percentEl) percentEl.textContent = progress + '%';
    
    console.log('[Sync]', progress + '%', status);
}

function showSyncModal() {
    var existing = document.getElementById('sync-modal');
    if (existing) existing.remove();
    
    var modal = document.createElement('div');
    modal.id = 'sync-modal';
    modal.innerHTML = '<div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">' +
        '<div style="background: white; border-radius: 16px; padding: 32px; width: 400px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">' +
        '<div class="spinner" style="width: 48px; height: 48px; margin: 0 auto 20px;"></div>' +
        '<h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Syncing Data</h3>' +
        '<p id="sync-status-text" style="color: #6B7280; margin-bottom: 20px;">Initializing...</p>' +
        '<div style="background: #E5E7EB; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 8px;">' +
        '<div id="sync-progress-bar" style="background: linear-gradient(90deg, #B91C1C, #DC2626); height: 100%; width: 0%; transition: width 0.3s;"></div>' +
        '</div>' +
        '<div id="sync-progress-percent" style="font-size: 14px; color: #374151; font-weight: 600;">0%</div>' +
        '</div></div>';
    
    document.body.appendChild(modal);
}

function hideSyncModal() {
    var modal = document.getElementById('sync-modal');
    if (modal) modal.remove();
}

// Show delete password prompt
function showDeleteDataPrompt() {
    var modal = document.createElement('div');
    modal.id = 'delete-modal';
    modal.innerHTML = '<div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">' +
        '<div style="background: white; border-radius: 16px; padding: 32px; width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">' +
        '<div style="text-align: center; margin-bottom: 24px;">' +
        '<div style="width: 56px; height: 56px; background: #FEE2E2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" style="width: 28px; height: 28px;"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>' +
        '</div>' +
        '<h3 style="font-size: 18px; font-weight: 600; color: #1F2937; margin-bottom: 8px;">Delete All Database Data</h3>' +
        '<p style="color: #6B7280; font-size: 14px;">Enter the admin password to delete all data from the database.</p>' +
        '</div>' +
        '<div style="margin-bottom: 20px;">' +
        '<input type="password" id="delete-password-input" placeholder="Enter password" style="width: 100%; padding: 12px 16px; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 14px; text-align: center;">' +
        '</div>' +
        '<div style="display: flex; gap: 12px;">' +
        '<button onclick="closeDeleteModal()" style="flex: 1; padding: 12px; border: 1px solid #E5E7EB; border-radius: 8px; background: white; cursor: pointer; font-size: 14px;">Cancel</button>' +
        '<button onclick="confirmDeleteData()" style="flex: 1; padding: 12px; border: none; border-radius: 8px; background: #DC2626; color: white; cursor: pointer; font-size: 14px; font-weight: 600;">Delete All</button>' +
        '</div>' +
        '</div></div>';
    
    document.body.appendChild(modal);
    document.getElementById('delete-password-input').focus();
}

// =====================================================
// IMPORT PRIVATE DATA FILES (students / enrollments / historical grades)
// The files are read in the browser and sent to the database in chunks;
// they are never stored on the website or in GitHub.
// =====================================================
function detectImportKind(data) {
    if (data && !Array.isArray(data) && Array.isArray(data.records)) return 'historical';
    if (Array.isArray(data) && data.length) {
        var first = data[0];
        if ('civil_id' in first || ('name' in first && 'major' in first)) return 'students';
        if ('course_code' in first && 'student_id' in first) return 'enrollments';
    }
    return null;
}

async function uploadInChunks(kind, rows, extra, label, from, to) {
    var size = 400;
    for (var i = 0; i < rows.length; i += size) {
        var payload = Object.assign({ kind: kind, rows: rows.slice(i, i + size), replace: i === 0 }, extra || {});
        var res = await window.api.importData(payload);
        if (res.error) throw new Error(label + ': ' + res.error.message);
        var done = Math.min(i + size, rows.length);
        updateSyncStatus('Importing ' + label + ' ' + done + '/' + rows.length + '...', from + Math.round((done / rows.length) * (to - from)));
    }
}

async function importDataFiles(fileList) {
    if (!isDbConnected()) {
        showToast('Log in as admin first', 'error');
        return;
    }
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    var parsed = {};
    for (var i = 0; i < files.length; i++) {
        try {
            var data = JSON.parse(await files[i].text());
            var kind = detectImportKind(data);
            if (!kind) { showToast('Not a recognised data file: ' + files[i].name, 'error'); return; }
            parsed[kind] = data;
        } catch (e) {
            showToast('Could not read ' + files[i].name + ': ' + e.message, 'error');
            return;
        }
    }
    var summary = [];
    if (parsed.students) summary.push(parsed.students.length + ' students');
    if (parsed.enrollments) summary.push(parsed.enrollments.length + ' enrollment rows (replaces current ones)');
    if (parsed.historical) summary.push(parsed.historical.records.length + ' grade records (replaces current ones)');
    if (!confirm('Import into the database:\n- ' + summary.join('\n- ') + '\n\nContinue?')) return;

    showSyncModal();
    try {
        if (parsed.students) await uploadInChunks('students', parsed.students, null, 'students', 5, 35);
        if (parsed.enrollments) await uploadInChunks('enrollments', parsed.enrollments, null, 'enrollments', 35, 65);
        if (parsed.historical) {
            var h = parsed.historical;
            await uploadInChunks('historical_records', h.records, { grade_points: h.grade_points || GRADE_POINTS_FOR_SYNC }, 'grade records', 65, 95);
            var meta = await window.api.importData({ kind: 'historical_meta', rows: [], course_stats: h.course_stats, grade_points: h.grade_points, summary: h.summary });
            if (meta.error) throw new Error('grade statistics: ' + meta.error.message);
        }
        updateSyncStatus('Import complete!', 100);
        setTimeout(function () {
            hideSyncModal();
            showToast('Data imported. Reloading...', 'success');
            location.reload();
        }, 1200);
    } catch (e) {
        hideSyncModal();
        showToast('Import failed: ' + e.message, 'error');
    }
}

// Change the admin password (checked and saved by the server)
function showChangePasswordPrompt() {
    var modal = document.createElement('div');
    modal.id = 'password-modal';
    var input = 'width: 100%; padding: 12px 16px; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 14px; margin-bottom: 12px; box-sizing: border-box;';
    modal.innerHTML = '<div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">' +
        '<form id="password-form" style="background: white; border-radius: 16px; padding: 32px; width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">' +
        '<h3 style="font-size: 18px; font-weight: 600; color: #1F2937; margin: 0 0 16px;">Change admin password</h3>' +
        '<input type="password" id="pw-current" placeholder="Current password" autocomplete="current-password" style="' + input + '">' +
        '<input type="password" id="pw-new" placeholder="New password (at least 10 characters)" autocomplete="new-password" style="' + input + '">' +
        '<input type="password" id="pw-confirm" placeholder="Repeat new password" autocomplete="new-password" style="' + input + '">' +
        '<div style="display: flex; gap: 12px; margin-top: 8px;">' +
        '<button type="button" onclick="closePasswordModal()" style="flex: 1; padding: 12px; border: 1px solid #E5E7EB; border-radius: 8px; background: white; cursor: pointer;">Cancel</button>' +
        '<button type="submit" style="flex: 1; padding: 12px; border: none; border-radius: 8px; background: #B91C1C; color: white; cursor: pointer; font-weight: 600;">Save</button>' +
        '</div></form></div>';
    document.body.appendChild(modal);
    document.getElementById('pw-current').focus();
    document.getElementById('password-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var current = document.getElementById('pw-current').value;
        var next = document.getElementById('pw-new').value;
        if (next !== document.getElementById('pw-confirm').value) {
            showToast('The new passwords do not match', 'error');
            return;
        }
        var res = await window.api.changePassword(current, next);
        if (res.error) {
            showToast(res.error.message, 'error');
            return;
        }
        closePasswordModal();
        showToast('Admin password changed', 'success');
    });
}

// Set a new password for one of the staff portal accounts (HOD, Registration 1/2, Facility, Nehad)
function showStaffPasswordPrompt() {
    var modal = document.createElement('div');
    modal.id = 'password-modal';
    var input = 'width: 100%; padding: 12px 16px; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 14px; margin-bottom: 12px; box-sizing: border-box;';
    modal.innerHTML = '<div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">' +
        '<form id="staff-password-form" style="background: white; border-radius: 16px; padding: 32px; width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">' +
        '<h3 style="font-size: 18px; font-weight: 600; color: #1F2937; margin: 0 0 6px;">Set staff password</h3>' +
        '<p style="font-size: 13px; color: #6B7280; margin: 0 0 16px;">The account is signed out everywhere and must use the new password.</p>' +
        '<select id="staff-user" style="' + input + '">' +
        '<option value="hod">HOD (hod)</option><option value="reg1">Registration 1 (reg1)</option>' +
        '<option value="reg2">Registration 2 (reg2)</option><option value="facility">Facility (facility)</option>' +
        '<option value="nehad">Nehad timetable (nehad)</option></select>' +
        '<input type="password" id="staff-pw-new" placeholder="New password (at least 10 characters)" autocomplete="new-password" style="' + input + '">' +
        '<input type="password" id="staff-pw-confirm" placeholder="Repeat new password" autocomplete="new-password" style="' + input + '">' +
        '<div style="display: flex; gap: 12px; margin-top: 8px;">' +
        '<button type="button" onclick="closePasswordModal()" style="flex: 1; padding: 12px; border: 1px solid #E5E7EB; border-radius: 8px; background: white; cursor: pointer;">Cancel</button>' +
        '<button type="submit" style="flex: 1; padding: 12px; border: none; border-radius: 8px; background: #1B5E20; color: white; cursor: pointer; font-weight: 600;">Save</button>' +
        '</div></form></div>';
    document.body.appendChild(modal);
    document.getElementById('staff-password-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var username = document.getElementById('staff-user').value;
        var next = document.getElementById('staff-pw-new').value;
        if (next.length < 10) { showToast('Use at least 10 characters', 'error'); return; }
        if (next !== document.getElementById('staff-pw-confirm').value) { showToast('The new passwords do not match', 'error'); return; }
        var res = await window.api.setStaffPassword(username, next);
        if (res.error) { showToast(res.error.message, 'error'); return; }
        closePasswordModal();
        showToast('Password set for ' + username, 'success');
    });
}

function closePasswordModal() {
    var modal = document.getElementById('password-modal');
    if (modal) modal.remove();
}

function closeDeleteModal() {
    var modal = document.getElementById('delete-modal');
    if (modal) modal.remove();
}

function confirmDeleteData() {
    var passwordInput = document.getElementById('delete-password-input');
    var password = passwordInput ? passwordInput.value : '';
    closeDeleteModal();
    deleteAllDatabaseData(password);
}

// =====================================================
// RENDER DATABASE MANAGEMENT UI
// =====================================================
function renderDatabaseManagementPanel() {
    var html = '';
    html += '<div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-top: 24px;">';
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">';
    html += '<div>';
    html += '<h3 style="font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">Database Management</h3>';
    html += '<p style="font-size: 13px; color: #6B7280; margin: 0;">Sync data to the Cloudflare D1 database or delete all records</p>';
    html += '</div>';
    html += '<div id="db-connection-status" style="padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;"></div>';
    html += '</div>';
    
    html += '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">';
    
    // Sync All Data button
    html += '<button onclick="syncAllDataToDatabase()" style="padding: 16px; border: 2px solid #10B981; border-radius: 12px; background: #F0FDF4; cursor: pointer; text-align: center;">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" style="width: 32px; height: 32px; margin: 0 auto 8px; display: block;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>';
    html += '<div style="font-weight: 600; color: #166534;">Sync All Data</div>';
    html += '<div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Upload all data to database</div>';
    html += '</button>';
    
    // Sync Current Semester button
    html += '<button onclick="syncCurrentSemesterToDatabase()" style="padding: 16px; border: 2px solid #3B82F6; border-radius: 12px; background: #EFF6FF; cursor: pointer; text-align: center;">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" style="width: 32px; height: 32px; margin: 0 auto 8px; display: block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    html += '<div style="font-weight: 600; color: #1E40AF;">Sync Current Semester</div>';
    html += '<div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Upload current semester only</div>';
    html += '</button>';
    
    // Delete All Data button
    html += '<button onclick="showDeleteDataPrompt()" style="padding: 16px; border: 2px solid #DC2626; border-radius: 12px; background: #FEF2F2; cursor: pointer; text-align: center;">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" style="width: 32px; height: 32px; margin: 0 auto 8px; display: block;"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    html += '<div style="font-weight: 600; color: #991B1B;">Delete All Data</div>';
    html += '<div style="font-size: 12px; color: #6B7280; margin-top: 4px;">Password protected</div>';
    html += '</button>';
    
    html += '</div>';
    
    // Last sync info + change admin password
    html += '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 13px; color: #6B7280; display: flex; justify-content: space-between; align-items: center;">';
    html += '<span id="last-sync-time">Last sync: Never</span>';
    html += '<span style="display: flex; gap: 8px;">';
    html += '<button onclick="document.getElementById(\'import-files-input\').click()" style="padding: 8px 14px; border: 1px solid #10B981; border-radius: 8px; background: #F0FDF4; color: #166534; cursor: pointer; font-size: 13px; font-weight: 600;">Import data files</button>';
    html += '<input type="file" id="import-files-input" accept=".json,application/json" multiple style="display: none;" onchange="importDataFiles(this.files); this.value = \'\';">';
    html += '<button onclick="showChangePasswordPrompt()" style="padding: 8px 14px; border: 1px solid #E5E7EB; border-radius: 8px; background: white; cursor: pointer; font-size: 13px;">Change admin password</button>';
    html += '<button onclick="showStaffPasswordPrompt()" style="padding: 8px 14px; border: 1px solid #E5E7EB; border-radius: 8px; background: white; cursor: pointer; font-size: 13px;">Set staff password</button>';
    html += '</span>';
    html += '</div>';
    
    html += '</div>';
    
    return html;
}

// Sync current semester only
async function syncCurrentSemesterToDatabase() {
    if (!isDbConnected()) {
        showToast('Database not connected', 'error');
        return;
    }
    
    var semesterKey = AppState.currentSemester || 'spring2026';
    
    showSyncModal();
    updateSyncStatus('Syncing ' + SEMESTER_DEFINITIONS[semesterKey].label + '...', 10);
    
    try {
        await initializeSemestersInDB();
        await syncStudentsToDatabase(semesterKey);
        await syncCoursesToDatabase(semesterKey);
        await syncInstructorsToDatabase(semesterKey);
        await syncEnrollmentsToDatabase(semesterKey);
        await syncAllocationToDatabase(semesterKey);
        
        updateSyncStatus('Complete!', 100);
        
        setTimeout(function() {
            hideSyncModal();
            showToast('Semester data synced successfully!', 'success');
        }, 1000);
    } catch (error) {
        hideSyncModal();
        showToast('Sync failed: ' + error.message, 'error');
    }
}

// Update connection status display
function updateDbConnectionDisplay() {
    var statusEl = document.getElementById('db-connection-status');
    if (!statusEl) return;
    
    if (isDbConnected()) {
        statusEl.innerHTML = '<span style="color: #10B981;">● Connected</span>';
        statusEl.style.background = '#F0FDF4';
        statusEl.style.color = '#166534';
    } else {
        statusEl.innerHTML = '<span style="color: #F59E0B;">● Offline</span>';
        statusEl.style.background = '#FFFBEB';
        statusEl.style.color = '#92400E';
    }
}

// =====================================================
// EXPORTS
// =====================================================
if (typeof window !== 'undefined') {
    window.syncAllDataToDatabase = syncAllDataToDatabase;
    window.syncCurrentSemesterToDatabase = syncCurrentSemesterToDatabase;
    window.deleteAllDatabaseData = deleteAllDatabaseData;
    window.showDeleteDataPrompt = showDeleteDataPrompt;
    window.showChangePasswordPrompt = showChangePasswordPrompt;
    window.importDataFiles = importDataFiles;
    window.closePasswordModal = closePasswordModal;
    window.closeDeleteModal = closeDeleteModal;
    window.confirmDeleteData = confirmDeleteData;
    window.renderDatabaseManagementPanel = renderDatabaseManagementPanel;
    window.updateDbConnectionDisplay = updateDbConnectionDisplay;
    window.DataSync = DataSync;
}