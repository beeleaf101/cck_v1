// =====================================================
// CCK SIS - APP PATCH (app-patch.js)
// Include this AFTER app.js and data-bridge.js in index.html
// Adds:
//   1. HOD assignment reading before timetable generation
//   2. Audit log panel in admin dashboard
//   3. Change notification badge when HOD has updates
// =====================================================

// ─── 1. PATCH: Timetable generation reads HOD assignments ─────────
// We hook into the existing generateCourseAllocation function.
// After AppState loads, the DataBridge has already injected HOD
// courses into AppState.instructors[].courses — so the existing
// instructorCourses mapping loop automatically picks them up.
// This patch ensures HOD data is fresh before each generation.

const _originalGenerateCourseAllocation = window.generateCourseAllocation;
if (typeof _originalGenerateCourseAllocation === 'function') {
    window.generateCourseAllocation = async function(...args) {
        // Reload HOD assignments from DB just before generating
        if (typeof loadHODAssignments === 'function') {
            console.log('[Patch] Loading HOD assignments before timetable generation...');
            const result = await loadHODAssignments();
            console.log(`[Patch] HOD assignments loaded: ${result.count} from ${result.source}`);
        }
        return _originalGenerateCourseAllocation.apply(this, args);
    };
}

// Also patch generateTimetables if it exists
const _originalGenerateTimetables = window.generateTimetables;
if (typeof _originalGenerateTimetables === 'function') {
    window.generateTimetables = async function(...args) {
        if (typeof loadHODAssignments === 'function') {
            await loadHODAssignments();
        }
        return _originalGenerateTimetables.apply(this, args);
    };
}

// ─── 2. PATCH: Admin dashboard shows HOD change notification ──────
const _originalLoadAdminDashboard = window.loadAdminDashboard;
if (typeof _originalLoadAdminDashboard === 'function') {
    window.loadAdminDashboard = async function(...args) {
        const result = _originalLoadAdminDashboard.apply(this, args);
        // After dashboard loads, inject audit panel
        setTimeout(injectAuditPanel, 600);
        return result;
    };
}

// Also catch navigation to dashboard
const _originalShowSection = window.showSection;
if (typeof _originalShowSection === 'function') {
    window.showSection = function(sectionId, ...args) {
        const result = _originalShowSection.call(this, sectionId, ...args);
        if (sectionId === 'section-dashboard') {
            setTimeout(injectAuditPanel, 800);
        }
        if (sectionId === 'section-instructors') {
            setTimeout(injectHODSyncBanner, 600);
        }
        return result;
    };
}

// ─── 3. INJECT AUDIT LOG PANEL into admin dashboard ───────────────
async function injectAuditPanel() {
    // Find the admin dashboard section
    const dashboard = document.getElementById('section-dashboard');
    if (!dashboard) return;

    // Don't double-inject
    if (document.getElementById('audit-log-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'audit-log-panel';
    panel.style.cssText = 'margin-top:24px;';

    panel.innerHTML = `
        <div style="background:white;border-radius:12px;border:1px solid #F1F5F9;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden">
            <div style="padding:16px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
                <div>
                    <h3 style="font-size:15px;font-weight:700;color:#0F172A;margin:0">Activity Log</h3>
                    <p style="font-size:12px;color:#64748B;margin:3px 0 0">Changes across all portals — HOD assignments, timetables, enrollments</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <select id="audit-semester-filter" onchange="refreshAuditPanel()" style="padding:5px 10px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;background:white;cursor:pointer">
                        <option value="">All Semesters</option>
                        <option value="spring2026" selected>Spring 2026</option>
                        <option value="fall2025">Fall 2025</option>
                        <option value="spring2025">Spring 2025</option>
                    </select>
                    <select id="audit-portal-filter" onchange="refreshAuditPanel()" style="padding:5px 10px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;background:white;cursor:pointer">
                        <option value="">All Portals</option>
                        <option value="HOD Portal">HOD Portal</option>
                        <option value="Admin Portal">Admin Portal</option>
                        <option value="Student Portal">Student Portal</option>
                    </select>
                    <button onclick="refreshAuditPanel()" style="padding:5px 12px;background:#0F172A;color:white;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><polyline points="21 3 21 9 15 9"/></svg>
                        Refresh
                    </button>
                </div>
            </div>
            <div id="audit-log-body" style="max-height:380px;overflow-y:auto">
                <div style="padding:24px;text-align:center;color:#64748B;font-size:13px">Loading activity log…</div>
            </div>
            <div style="padding:10px 20px;border-top:1px solid #F3F4F6;font-size:11px;color:#64748B;display:flex;justify-content:space-between">
                <span id="audit-last-refresh">Loading…</span>
                <span id="audit-entry-count"></span>
            </div>
        </div>

        <div style="background:white;border-radius:12px;border:1px solid #F1F5F9;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden;margin-top:16px">
            <div style="padding:16px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
                <div>
                    <h3 style="font-size:15px;font-weight:700;color:#0F172A;margin:0">HOD Assignment Status</h3>
                    <p style="font-size:12px;color:#64748B;margin:3px 0 0">Current instructor-course assignments from the HOD Portal</p>
                </div>
                <button onclick="refreshHODStatus()" style="padding:5px 12px;background:#1E40AF;color:white;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">
                    Sync from HOD
                </button>
            </div>
            <div id="hod-status-body" style="max-height:320px;overflow-y:auto">
                <div style="padding:24px;text-align:center;color:#64748B;font-size:13px">Loading HOD assignments…</div>
            </div>
        </div>
    `;

    dashboard.appendChild(panel);
    await refreshAuditPanel();
    await refreshHODStatus();
}

window.refreshAuditPanel = async function() {
    const body = document.getElementById('audit-log-body');
    const lastRefresh = document.getElementById('audit-last-refresh');
    const entryCount = document.getElementById('audit-entry-count');
    if (!body) return;

    const semFilter = document.getElementById('audit-semester-filter')?.value || '';
    const portalFilter = document.getElementById('audit-portal-filter')?.value || '';

    body.innerHTML = '<div style="padding:24px;text-align:center;color:#64748B;font-size:13px">Refreshing…</div>';

    const { data } = await loadAuditLog(100, semFilter || undefined);

    // Apply portal filter client-side
    const filtered = portalFilter ? data.filter(e => e.portal === portalFilter) : data;
    // Exclude noisy page_load entries unless nothing else
    const meaningful = filtered.filter(e => e.action !== 'page_load');
    const display = meaningful.length > 0 ? meaningful : filtered;

    body.innerHTML = renderAuditLogPanel(display.slice(0, 50));
    if (lastRefresh) lastRefresh.textContent = 'Last refreshed: ' + new Date().toLocaleTimeString();
    if (entryCount) entryCount.textContent = `Showing ${Math.min(display.length, 50)} of ${display.length} entries`;
};

window.refreshHODStatus = async function() {
    const body = document.getElementById('hod-status-body');
    if (!body) return;

    // Reload from DB
    if (typeof loadHODAssignments === 'function') {
        await loadHODAssignments();
    }

    const byInstructor = (typeof DataBridge !== 'undefined') ? DataBridge.assignmentsByInstructor : {};
    const entries = Object.entries(byInstructor);

    if (!entries.length) {
        body.innerHTML = '<div style="padding:24px;text-align:center;color:#64748B;font-size:13px">No HOD assignments found. Ask the HOD to save assignments first.</div>';
        return;
    }

    const CS_PFX = ['CST','CSIT','MAT8','ICT','ENL','GED','GEN','GECU','GEPH'];
    const isCS = c => CS_PFX.some(p => c.toUpperCase().startsWith(p));

    const rows = entries.sort((a,b) => b[1].length - a[1].length).map(([name, codes]) => {
        const csCount = codes.filter(isCS).length;
        const busCount = codes.length - csCount;
        const chips = codes.slice(0,8).map(c =>
            `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;background:${isCS(c)?'#DBEAFE':'#FEF3C7'};color:${isCS(c)?'#1E40AF':'#92400E'};margin:1px">${c}</span>`
        ).join('') + (codes.length > 8 ? `<span style="font-size:10px;color:#64748B"> +${codes.length-8} more</span>` : '');

        return `<tr>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;font-size:12px;font-weight:600;color:#0F172A;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis">${name}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;text-align:center">
                <span style="font-size:13px;font-weight:800;color:#0F172A">${codes.length}</span>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;font-size:10px;color:#64748B">
                ${csCount>0?`<span style="color:#1E40AF">${csCount} CS</span>`:''}${csCount&&busCount?' · ':''}${busCount>0?`<span style="color:#92400E">${busCount} Biz</span>`:''}
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6">${chips}</td>
        </tr>`;
    }).join('');

    body.innerHTML = `
        <table style="width:100%;border-collapse:collapse">
            <thead>
                <tr style="background:#FAFAFA">
                    <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Instructor</th>
                    <th style="padding:8px 14px;text-align:center;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Courses</th>
                    <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Dept Split</th>
                    <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#64748B;border-bottom:2px solid #F1F5F9">Assigned Courses</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="padding:10px 14px;background:#F0FDF4;border-top:1px solid #DCFCE7;font-size:11px;color:#166534;font-weight:500">
            ✓ ${entries.length} instructors with assignments — timetable generation will use this data
        </div>
    `;
};

// ─── 4. HOD sync banner in instructor management ───────────────────
function injectHODSyncBanner() {
    const section = document.getElementById('section-instructors');
    if (!section || document.getElementById('hod-sync-banner')) return;

    const hodCount = typeof DataBridge !== 'undefined'
        ? Object.keys(DataBridge.assignmentsByInstructor).length : 0;

    if (hodCount === 0) return;

    const banner = document.createElement('div');
    banner.id = 'hod-sync-banner';
    banner.style.cssText = 'margin-bottom:16px;padding:12px 16px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;display:flex;align-items:center;justify-content:space-between;';
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <div>
                <div style="font-size:13px;font-weight:600;color:#1E40AF">HOD assignments loaded</div>
                <div style="font-size:11px;color:#1D4ED8">${hodCount} instructors with HOD-assigned courses — timetable generation will use this data</div>
            </div>
        </div>
        <button onclick="refreshHODInstructorSection()" style="padding:5px 12px;background:#1E40AF;color:white;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">Refresh</button>
    `;
    section.insertBefore(banner, section.firstChild);
}

window.refreshHODInstructorSection = async function() {
    if (typeof loadHODAssignments === 'function') await loadHODAssignments();
    const banner = document.getElementById('hod-sync-banner');
    if (banner) banner.remove();
    setTimeout(injectHODSyncBanner, 200);
    if (typeof loadInstructorManagement === 'function') loadInstructorManagement();
};

// ─── 5. NOTIFICATION BADGE on sidebar ─────────────────────────────
async function checkForHODUpdates() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client) return;

    try {
        const lastSeen = localStorage.getItem('cck_audit_last_seen') || '1970-01-01';
        const { data } = await client
            .from('audit_log')
            .select('id')
            .eq('portal', 'HOD Portal')
            .gt('created_at', lastSeen)
            .neq('action', 'page_load')
            .limit(99);

        const count = data?.length || 0;
        if (count > 0) {
            // Find the "Instructors" or "Timetable" nav item and add a badge
            const navItems = document.querySelectorAll('.admin-nav-item, .nav-item, [data-section]');
            navItems.forEach(item => {
                const text = item.textContent || '';
                if (text.includes('Instructor') || text.includes('Timetable')) {
                    if (!item.querySelector('.hod-update-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'hod-update-badge';
                        badge.style.cssText = 'margin-left:auto;background:#F59E0B;color:white;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;';
                        badge.textContent = count > 9 ? '9+' : count;
                        item.style.display = 'flex';
                        item.style.alignItems = 'center';
                        item.appendChild(badge);
                    }
                }
            });
        }
    } catch(e) { /* silent */ }
}

// Mark all HOD updates as seen when visiting instructor section
const _markSeen = function() {
    localStorage.setItem('cck_audit_last_seen', new Date().toISOString());
    document.querySelectorAll('.hod-update-badge').forEach(b => b.remove());
};

// ─── BOOT ─────────────────────────────────────────────────────────
(function patchBoot() {
    // Wait for DOM + AppState to be ready
    const tryBoot = (attempts) => {
        if (typeof loadAuditLog === 'function' && typeof DataBridge !== 'undefined') {
            // Check for HOD updates after 3s
            setTimeout(checkForHODUpdates, 3000);
            // If dashboard is already showing, inject audit panel
            const dashboard = document.getElementById('section-dashboard');
            if (dashboard && dashboard.classList.contains('active')) {
                setTimeout(injectAuditPanel, 1000);
            }
        } else if (attempts > 0) {
            setTimeout(() => tryBoot(attempts - 1), 400);
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tryBoot(15));
    } else {
        setTimeout(() => tryBoot(15), 500);
    }
})();

console.log('[app-patch.js] Loaded — HOD data bridge and audit log active');
