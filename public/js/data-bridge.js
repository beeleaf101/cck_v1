// =====================================================
// CCK SIS - DATA BRIDGE
// Shared module included by all portals.
// Reads instructor_assignments from Supabase and
// injects them into AppState so timetable generation
// always uses the latest HOD data.
//
// USAGE: Include AFTER supabase-client.js and app.js
//   <script src="js/data-bridge.js"></script>
// =====================================================

const DataBridge = {
    version: '1.0.0',
    isLoaded: false,
    lastSync: null,
    assignmentsByInstructor: {},   // { instructorName: [courseCode, ...] }
    assignmentsByCourse: {},       // { courseCode: instructorName }
    auditBuffer: [],               // queued audit entries if DB unavailable
    PORTAL_NAME: (function() {
        const path = window.location.pathname;
        if (path.includes('hod'))    return 'HOD Portal';
        if (path.includes('index') || path === '/') return 'Admin Portal';
        if (path.includes('student')) return 'Student Portal';
        return 'CCK Portal';
    })()
};

// ─── HELPERS ──────────────────────────────────────────────────────
function _getClient() {
    // Guard: only return a client that has a working .from method
    function valid(c) { return c && typeof c.from === 'function'; }
    if (typeof getSupabaseClient === 'function') {
        const c = getSupabaseClient();
        if (valid(c)) return c;
    }
    if (valid(window._sb)) return window._sb;
    if (typeof supabaseClient !== 'undefined' && valid(supabaseClient)) return supabaseClient;
    return null;
}

function _getSemester() {
    if (typeof AppState !== 'undefined' && AppState.currentSemester) return AppState.currentSemester;
    return localStorage.getItem('cck_current_semester') || 'spring2026';
}

// ─── LOAD HOD ASSIGNMENTS FROM DATABASE ───────────────────────────
/**
 * Fetches instructor_assignments from Supabase and merges them into
 * AppState.instructors[].courses so timetable generation uses HOD data.
 * Falls back to localStorage if DB unavailable.
 */
async function loadHODAssignments(semesterKey) {
    semesterKey = semesterKey || _getSemester();
    const localKey = 'cck_hod_assignments';

    const client = _getClient();

    // ── Try Supabase first ──
    if (client) {
        try {
            const { data, error } = await client
                .from('instructor_assignments')
                .select('instructor_id, instructor_name, course_code')
                .eq('semester', semesterKey)
                .eq('is_active', true);

            if (!error && data && data.length > 0) {
                // Build lookup maps
                DataBridge.assignmentsByInstructor = {};
                DataBridge.assignmentsByCourse = {};

                data.forEach(row => {
                    const name = row.instructor_name;
                    const code = row.course_code;
                    if (!DataBridge.assignmentsByInstructor[name]) {
                        DataBridge.assignmentsByInstructor[name] = [];
                    }
                    DataBridge.assignmentsByInstructor[name].push(code);
                    DataBridge.assignmentsByCourse[code] = name;
                });

                // Merge DB data with localStorage — keep whichever has more records
                // (avoids overwriting full HOD assignment data with a partial DB record)
                const localFormat = {};
                data.forEach(row => {
                    const id = row.instructor_id || row.instructor_name;
                    if (!localFormat[id]) localFormat[id] = [];
                    if (!localFormat[id].includes(row.course_code)) {
                        localFormat[id].push(row.course_code);
                    }
                });
                try {
                    const existingRaw = localStorage.getItem(localKey);
                    if (existingRaw) {
                        const existing = JSON.parse(existingRaw);
                        const existingCount = Object.keys(existing).length;
                        const dbCount = Object.keys(localFormat).length;
                        if (existingCount > dbCount) {
                            // Existing localStorage has more data — merge DB on top, don't replace
                            Object.entries(localFormat).forEach(([id, codes]) => {
                                if (!existing[id]) existing[id] = [];
                                codes.forEach(c => { if (!existing[id].includes(c)) existing[id].push(c); });
                            });
                            localStorage.setItem(localKey, JSON.stringify(existing));
                        } else {
                            localStorage.setItem(localKey, JSON.stringify(localFormat));
                        }
                    } else {
                        localStorage.setItem(localKey, JSON.stringify(localFormat));
                    }
                } catch(e) {
                    localStorage.setItem(localKey, JSON.stringify(localFormat));
                }

                DataBridge.isLoaded = true;
                DataBridge.lastSync = new Date();
                console.log(`[DataBridge] Loaded ${data.length} assignments from DB for ${semesterKey}`);

                // Inject into AppState
                _injectIntoAppState();
                return { source: 'database', count: data.length };
            }
        } catch (e) {
            console.warn('[DataBridge] DB load failed, falling back to localStorage:', e.message);
        }
    }

    // ── Fallback: localStorage ──
    const saved = localStorage.getItem(localKey);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            DataBridge.assignmentsByInstructor = {};
            DataBridge.assignmentsByCourse = {};

            // localStorage format: { instructorId: [courseCode, ...] }
            // We need instructor names — map via AppState if available
            const instructors = (typeof AppState !== 'undefined' && AppState.instructors) || [];
            Object.entries(parsed).forEach(([idOrName, codes]) => {
                const ins = instructors.find(i => i.id === idOrName || i.name === idOrName);
                const name = ins?.name || idOrName;
                DataBridge.assignmentsByInstructor[name] = codes;
                codes.forEach(code => {
                    DataBridge.assignmentsByCourse[code] = name;
                });
            });

            DataBridge.isLoaded = true;
            _injectIntoAppState();
            console.log('[DataBridge] Loaded assignments from localStorage (offline mode)');
            return { source: 'localStorage', count: Object.keys(parsed).length };
        } catch (e) {
            console.warn('[DataBridge] localStorage parse failed:', e.message);
        }
    }

    console.log('[DataBridge] No assignment data found');
    return { source: 'none', count: 0 };
}

/**
 * Merges HOD assignments into AppState.instructors so that
 * generateCourseAllocation() uses the HOD data automatically.
 */
function _injectIntoAppState() {
    if (typeof AppState === 'undefined' || !AppState.instructors) return;

    // Also try id-keyed format from cck_hod_assignments
    let idKeyedAssignments = {};
    try {
        const raw = localStorage.getItem('cck_hod_assignments');
        if (raw) idKeyedAssignments = JSON.parse(raw) || {};
    } catch(e) {}

    AppState.instructors.forEach(inst => {
        // Try name-keyed (DataBridge format from Supabase)
        const byName = DataBridge.assignmentsByInstructor[inst.name];
        // Try id-keyed (HOD portal localStorage format)
        const byId = idKeyedAssignments[inst.id];
        // Pick whichever has more courses
        const best = (byId && (!byName || byId.length >= byName.length)) ? byId : byName;
        if (best && best.length > 0) {
            inst.courses = best;
            inst._hodAssigned = true;
        }
    });

    console.log('[DataBridge] Injected HOD assignments into AppState.instructors');
}

// ─── SAVE HOD ASSIGNMENTS TO DATABASE ─────────────────────────────
/**
 * Saves instructor assignments to Supabase + logs audit entry.
 * Called by hod.html on every save/assign action.
 * @param {string} instructorId    - local id
 * @param {string} instructorName  - full name
 * @param {string[]} courseCodes   - array of course codes
 * @param {string} action          - 'assign_course' | 'remove_course' | 'save_all'
 * @param {string} note            - optional description
 */
async function saveHODAssignment(instructorId, instructorName, courseCodes, action, note) {
    const semester = _getSemester();
    const client = _getClient();
    const portal = DataBridge.PORTAL_NAME;
    const timestamp = new Date().toISOString();

    // Always save to localStorage first (instant, never fails)
    const localSaved = JSON.parse(localStorage.getItem('cck_hod_assignments') || '{}');
    localSaved[instructorId] = courseCodes;
    localStorage.setItem('cck_hod_assignments', JSON.stringify(localSaved));

    // Update local bridge state
    DataBridge.assignmentsByInstructor[instructorName] = courseCodes;
    courseCodes.forEach(code => { DataBridge.assignmentsByCourse[code] = instructorName; });

    if (!client) {
        console.log('[DataBridge] Offline — saved to localStorage only');
        _queueAuditEntry(portal, action, instructorName, courseCodes, note, semester, timestamp);
        return { success: true, offline: true };
    }

    try {
        // Delete existing active assignments for this instructor+semester
        await client
            .from('instructor_assignments')
            .update({ is_active: false, updated_at: timestamp })
            .eq('instructor_name', instructorName)
            .eq('semester', semester);

        // Insert new assignments
        if (courseCodes.length > 0) {
            const records = courseCodes.map(code => ({
                instructor_id:   instructorId,
                instructor_name: instructorName,
                course_code:     code,
                semester:        semester,
                assigned_by:     portal,
                assigned_at:     timestamp,
                is_active:       true
            }));

            const { error: insertErr } = await client
                .from('instructor_assignments')
                .upsert(records, {
                    onConflict: 'instructor_name,course_code,semester',
                    ignoreDuplicates: false
                });

            if (insertErr) throw insertErr;
        }

        // Write audit log
        await _writeAuditLog(client, {
            portal,
            action,
            entity_type:  'instructor_assignment',
            entity_id:    instructorName,
            description:  note || `${portal}: ${action.replace(/_/g,' ')} for ${instructorName} — ${courseCodes.length} course(s)`,
            details: {
                instructor_id:   instructorId,
                instructor_name: instructorName,
                course_codes:    courseCodes,
                semester,
                timestamp,
                previous_count:  (DataBridge.assignmentsByInstructor[instructorName] || []).length
            },
            performed_by: portal,
            semester
        });

        // Flush any queued audit entries from offline period
        await _flushAuditQueue(client);

        DataBridge.lastSync = new Date();
        console.log(`[DataBridge] Saved ${courseCodes.length} assignments for ${instructorName} to DB`);
        return { success: true, count: courseCodes.length };

    } catch (e) {
        console.error('[DataBridge] DB save failed:', e.message);
        _queueAuditEntry(portal, action, instructorName, courseCodes, note, semester, timestamp);
        return { success: false, offline: true, error: e.message };
    }
}

// ─── AUDIT LOG ────────────────────────────────────────────────────
async function _writeAuditLog(client, entry) {
    try {
        await client.from('audit_log').insert({
            portal:       entry.portal,
            action:       entry.action,
            entity_type:  entry.entity_type,
            entity_id:    entry.entity_id,
            description:  entry.description,
            details:      entry.details || {},
            performed_by: entry.performed_by || entry.portal,
            semester:     entry.semester || _getSemester()
        });
    } catch (e) {
        console.warn('[DataBridge] Audit log write failed:', e.message);
    }
}

/**
 * Queue audit entries when offline; flush when connection restores.
 */
function _queueAuditEntry(portal, action, instructorName, courseCodes, note, semester, timestamp) {
    const queue = JSON.parse(localStorage.getItem('cck_audit_queue') || '[]');
    queue.push({
        portal, action,
        entity_type:  'instructor_assignment',
        entity_id:    instructorName,
        description:  note || `${portal}: ${action.replace(/_/g,' ')} for ${instructorName} (offline)`,
        details:      { instructor_name: instructorName, course_codes: courseCodes, semester, timestamp },
        performed_by: portal,
        semester
    });
    localStorage.setItem('cck_audit_queue', JSON.stringify(queue));
}

async function _flushAuditQueue(client) {
    const queue = JSON.parse(localStorage.getItem('cck_audit_queue') || '[]');
    if (!queue.length) return;
    try {
        await client.from('audit_log').insert(queue);
        localStorage.removeItem('cck_audit_queue');
        console.log(`[DataBridge] Flushed ${queue.length} queued audit entries`);
    } catch (e) {
        console.warn('[DataBridge] Queue flush failed:', e.message);
    }
}

/**
 * Log any action from any portal.
 * Call this from admin portal, student portal, etc.
 */
async function logPortalAction(action, entityType, entityId, description, details) {
    const client = _getClient();
    const entry = {
        portal:       DataBridge.PORTAL_NAME,
        action,
        entity_type:  entityType || 'general',
        entity_id:    entityId   || '',
        description,
        details:      details    || {},
        performed_by: DataBridge.PORTAL_NAME,
        semester:     _getSemester()
    };

    if (client) {
        await _writeAuditLog(client, entry);
    } else {
        _queueAuditEntry(entry.portal, action, entityId, [], description, entry.semester, new Date().toISOString());
    }
}

// ─── LOAD AUDIT LOG (for admin portal) ────────────────────────────
/**
 * Returns the last N audit entries for display in admin portal.
 */
async function loadAuditLog(limit, semesterKey) {
    limit = limit || 50;
    const client = _getClient();
    if (!client) return { data: [], source: 'none' };

    try {
        let query = client
            .from('audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (semesterKey) query = query.eq('semester', semesterKey);

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], source: 'database' };
    } catch (e) {
        console.error('[DataBridge] loadAuditLog failed:', e.message);
        return { data: [], source: 'error', error: e.message };
    }
}

// ─── GET INSTRUCTOR FOR COURSE (used by timetable generator) ──────
/**
 * Returns the HOD-assigned instructor name for a course code.
 * Returns null if not assigned — timetable generator falls back to defaults.
 */
function getHODInstructor(courseCode) {
    return DataBridge.assignmentsByCourse[courseCode] || null;
}

/**
 * Returns all courses assigned to an instructor by HOD.
 */
function getHODCourses(instructorName) {
    return DataBridge.assignmentsByInstructor[instructorName] || [];
}

// ─── RENDER AUDIT LOG PANEL (HTML helper for admin portal) ────────
function renderAuditLogPanel(entries) {
    if (!entries || !entries.length) {
        return `<div style="padding:32px;text-align:center;color:#64748B;font-size:13px">
            No activity recorded yet.
        </div>`;
    }

    const portalColors = {
        'HOD Portal':     { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
        'Admin Portal':   { bg: '#DBEAFE', color: '#1E40AF', dot: '#1D4ED8' },
        'Student Portal': { bg: '#DCFCE7', color: '#166534', dot: '#22C55E' },
        'CCK Portal':     { bg: '#F3F4F6', color: '#374151', dot: '#9CA3AF' }
    };

    const actionIcons = {
        'assign_course':  '📌',
        'remove_course':  '🗑️',
        'save_all':       '💾',
        'quick_assign':   '⚡',
        'login':          '🔑',
        'generate':       '⚙️',
        'publish':        '📢',
        'default':        '📋'
    };

    const rows = entries.map(e => {
        const pc = portalColors[e.portal] || portalColors['CCK Portal'];
        const icon = actionIcons[e.action] || actionIcons['default'];
        const dt = new Date(e.created_at);
        const dateStr = dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        const timeStr = dt.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

        return `<tr>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;white-space:nowrap">
                <div style="font-size:12px;font-weight:600;color:#0F172A">${dateStr}</div>
                <div style="font-size:10px;color:#64748B">${timeStr}</div>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6">
                <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;background:${pc.bg};color:${pc.color}">
                    <span style="width:5px;height:5px;border-radius:50%;background:${pc.dot};display:inline-block"></span>
                    ${e.portal}
                </span>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6">
                <span style="font-size:11px">${icon} ${(e.action||'').replace(/_/g,' ')}</span>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;max-width:360px">
                <div style="font-size:12px;color:#374151">${e.description || ''}</div>
                ${e.entity_id ? `<div style="font-size:10px;color:#64748B;margin-top:2px">${e.entity_id}</div>` : ''}
            </td>
        </tr>`;
    }).join('');

    return `<table style="width:100%;border-collapse:collapse">
        <thead>
            <tr style="background:#FAFAFA">
                <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Time</th>
                <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Portal</th>
                <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Action</th>
                <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Description</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ─── AUTO-INIT ────────────────────────────────────────────────────
// Automatically load HOD assignments when the page is ready.
// Works on all portals — admin portal benefits most.
(async function autoBoot() {
    // Wait for AppState to exist (app.js may load after us)
    const waitForAppState = (resolve, attempts) => {
        if (typeof AppState !== 'undefined' && AppState.instructors?.length > 0) {
            resolve();
        } else if (attempts > 0) {
            setTimeout(() => waitForAppState(resolve, attempts - 1), 300);
        } else {
            resolve(); // give up waiting, load anyway
        }
    };

    await new Promise(resolve => waitForAppState(resolve, 20));
    await loadHODAssignments();

    // Log page load in audit (non-intrusive, won't block anything)
    setTimeout(async () => {
        try {
            const client = _getClient();
            if (client && DataBridge.PORTAL_NAME !== 'Student Portal') {
                await _writeAuditLog(client, {
                    portal:      DataBridge.PORTAL_NAME,
                    action:      'page_load',
                    entity_type: 'session',
                    entity_id:   DataBridge.PORTAL_NAME,
                    description: `${DataBridge.PORTAL_NAME} opened`,
                    semester:    _getSemester()
                });
            }
        } catch(e) { /* silent */ }
    }, 2000);
})();

// ─── EXPORTS ──────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.DataBridge        = DataBridge;
    window.loadHODAssignments  = loadHODAssignments;
    window.saveHODAssignment   = saveHODAssignment;
    window.logPortalAction     = logPortalAction;
    window.loadAuditLog        = loadAuditLog;
    window.getHODInstructor    = getHODInstructor;
    window.getHODCourses       = getHODCourses;
    window.renderAuditLogPanel = renderAuditLogPanel;
}
