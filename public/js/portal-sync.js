/**
 * portal-sync.js  v1.0  — CCK Portal Change Tracking & Sync
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 *   1. Each portal (HOD, Reg1, Reg2, Facility) writes a structured change-log
 *      entry every time data is saved.  The log key is  cck_changes_log_v3.
 *   2. The Admin "Portal Review" tab gains a "Changes" sub-tab showing every
 *      logged change per portal with diffs, timestamps, and a source badge.
 *   3. A "Sync All" button propagates the approved portal data into every
 *      admin section (courses, instructors, rooms) so other pages pick it up.
 *   4. Where Supabase is available the same entries are written to audit_log.
 *
 * HOW IT HOOKS IN
 *   Include this file AFTER cck_shared.js and AFTER each portal's own script.
 *   In index.html it is loaded once and patches the prRenderRoot pipeline.
 *   In registration1/2, hod, facility it wraps their save functions.
 *
 * STORAGE KEYS
 *   cck_changes_log_v3   [{id, portal, semKey, action, entityType,
 *                          entityId, label, oldValue, newValue,
 *                          timestamp, synced}]
 *   cck_sync_log_v3      [{timestamp, portal, itemCount, status}]
 */

(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────────
  // 1.  CHANGE LOG  (shared across all pages)
  // ──────────────────────────────────────────────────────────────────────────

  const LS_CHANGES = 'cck_changes_log_v3';
  const LS_SYNC    = 'cck_sync_log_v3';
  const MAX_ENTRIES = 1000;

  const PORTAL_META = {
    hod:      { label: 'HOD',            color: '#6366F1', bg: '#EEF2FF', icon: '✏️' },
    reg1:     { label: 'Registration 1', color: '#0EA5E9', bg: '#F0F9FF', icon: '📋' },
    reg2:     { label: 'Registration 2', color: '#10B981', bg: '#ECFDF5', icon: '👤' },
    facility: { label: 'Facility',       color: '#F59E0B', bg: '#FFFBEB', icon: '🏛️' },
    admin:    { label: 'Admin',          color: '#EF4444', bg: '#FEF2F2', icon: '⚙️' },
  };

  const ACTION_META = {
    credit_change:       { label: 'Credit Changed',        icon: '💳' },
    instructor_assign:   { label: 'Instructor Assigned',   icon: '🔗' },
    instructor_unassign: { label: 'Instructor Unassigned', icon: '✂️'  },
    instructor_update:   { label: 'Instructor Updated',    icon: '✏️' },
    room_add:            { label: 'Room Added',            icon: '➕' },
    room_update:         { label: 'Room Updated',          icon: '🔧' },
    room_delete:         { label: 'Room Deleted',          icon: '🗑️' },
    section_add:         { label: 'Section Added',         icon: '📅' },
    section_update:      { label: 'Section Updated',       icon: '📅' },
    section_delete:      { label: 'Section Deleted',       icon: '❌' },
    room_assign:         { label: 'Room Assigned',         icon: '🏛️' },
    submit:              { label: 'Submitted to Admin',    icon: '📤' },
    approve:             { label: 'Approved by Admin',     icon: '✅' },
    reject:              { label: 'Returned to Portal',    icon: '↩️' },
    sync:                { label: 'Synced to Admin',       icon: '🔄' },
  };

  // ── Public API ──────────────────────────────────────────────────────────

  const PSYNC = {};

  /** Write one change-log entry */
  PSYNC.logChange = function (portal, action, entityType, entityId, label, oldValue, newValue) {
    const semKey = (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
      ? CCK.getActiveSemKey() : (localStorage.getItem('cck_active_sem_key') || 'spring2026');

    const entry = {
      id:         `CH_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      portal, semKey, action, entityType, entityId,
      label:      label || entityId,
      oldValue:   oldValue !== undefined ? oldValue : null,
      newValue:   newValue !== undefined ? newValue : null,
      timestamp:  new Date().toISOString(),
      synced:     false,
    };

    const log = PSYNC.getChanges();
    log.unshift(entry);                        // newest first
    if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
    localStorage.setItem(LS_CHANGES, JSON.stringify(log));

    // Also push to CCK audit log if available
    if (typeof CCK !== 'undefined' && CCK.log) {
      CCK.log(portal, action, entityType, entityId, oldValue, newValue);
    }

    // Async Supabase push (fire-and-forget)
    PSYNC._pushToSupabase(entry);

    // Dispatch so the admin tab badge can refresh without polling
    window.dispatchEvent(new CustomEvent('cck-change-logged', { detail: entry }));
    return entry;
  };

  /** Read all change-log entries (optionally filtered) */
  PSYNC.getChanges = function (filters) {
    let log;
    try { log = JSON.parse(localStorage.getItem(LS_CHANGES) || '[]'); }
    catch (e) { log = []; }
    if (!filters) return log;
    if (filters.portal)   log = log.filter(e => e.portal   === filters.portal);
    if (filters.semKey)   log = log.filter(e => e.semKey   === filters.semKey);
    if (filters.action)   log = log.filter(e => e.action   === filters.action);
    if (filters.unsynced) log = log.filter(e => !e.synced);
    return log;
  };

  /** Mark entries as synced */
  PSYNC.markSynced = function (ids) {
    const log = PSYNC.getChanges();
    const idSet = new Set(ids);
    log.forEach(e => { if (idSet.has(e.id)) e.synced = true; });
    localStorage.setItem(LS_CHANGES, JSON.stringify(log));
  };

  /** Clear all change log entries */
  PSYNC.clearChanges = function (portalFilter) {
    if (portalFilter) {
      const log = PSYNC.getChanges().filter(e => e.portal !== portalFilter);
      localStorage.setItem(LS_CHANGES, JSON.stringify(log));
    } else {
      localStorage.removeItem(LS_CHANGES);
    }
  };

  /** Push to Supabase audit_log (silent fail) */
  PSYNC._pushToSupabase = async function (entry) {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client) return;
    try {
      await client.from('audit_log').insert({
        portal:      entry.portal,
        action:      entry.action,
        entity_type: entry.entityType,
        entity_id:   String(entry.entityId),
        description: entry.label,
        details: {
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          entryId:  entry.id,
        },
        semester:     entry.semKey,
        performed_by: entry.portal,
      });
    } catch (_) { /* silent */ }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 2.  SYNC ALL  — pull portal data into admin's live stores
  // ──────────────────────────────────────────────────────────────────────────

  PSYNC.syncAll = async function (semKey, onProgress) {
    semKey = semKey || (typeof CCK !== 'undefined' && CCK.getActiveSemKey
      ? CCK.getActiveSemKey() : 'spring2026');
    const results = [];
    const progress = msg => { if (onProgress) onProgress(msg); };

    // ── 2a. Sync credits (Reg 1) ─────────────────────────────────────────
    progress('Syncing credits from Registration 1…');
    try {
      const reg1Changes = JSON.parse(localStorage.getItem('cck_reg1_changes') || '{}');
      const sharedCredits = JSON.parse(localStorage.getItem('cck_credits_shared') || '{}');
      const v3Credits = JSON.parse(localStorage.getItem('cck_credits_v3') || '{}');

      // Merge into v3 credits for this semester
      if (!v3Credits[semKey]) v3Credits[semKey] = {};
      let creditCount = 0;
      Object.entries(sharedCredits).forEach(([code, cr]) => {
        v3Credits[semKey][code] = cr;
        creditCount++;
      });
      // Unsaved reg1 changes go in too
      Object.entries(reg1Changes).forEach(([code, ch]) => {
        v3Credits[semKey][code] = ch.newVal;
      });
      localStorage.setItem('cck_credits_v3', JSON.stringify(v3Credits));

      // Sync to Supabase courses table
      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      let dbSynced = 0;
      if (client) {
        for (const [code, credits] of Object.entries(v3Credits[semKey] || {})) {
          try {
            await client.from('courses').update({ credits }).eq('code', code);
            dbSynced++;
          } catch (_) {}
        }
      }

      results.push({ portal: 'reg1', label: 'Registration 1 Credits', count: creditCount, dbSynced });
      PSYNC.logChange('admin', 'sync', 'credits', semKey,
        `Synced ${creditCount} credits from Reg1`, null, { count: creditCount });
      progress(`✅ Credits synced: ${creditCount} courses`);
    } catch (err) {
      results.push({ portal: 'reg1', label: 'Registration 1 Credits', error: err.message });
      progress(`⚠️ Credits sync error: ${err.message}`);
    }

    // ── 2b. Sync HOD assignments ──────────────────────────────────────────
    progress('Syncing instructor assignments from HOD…');
    try {
      const v3Assign = JSON.parse(localStorage.getItem('cck_assignments_v3') || '{}');
      const hodLegacy = JSON.parse(localStorage.getItem('cck_hod_assignments') || '{}');

      // Merge legacy into v3 if v3 for this semester is empty
      if (!v3Assign[semKey] || !Object.keys(v3Assign[semKey]).length) {
        if (Object.keys(hodLegacy).length) {
          v3Assign[semKey] = hodLegacy;
          localStorage.setItem('cck_assignments_v3', JSON.stringify(v3Assign));
        }
      }

      const assignments = v3Assign[semKey] || {};
      const instructorCourseCount = Object.values(assignments).reduce((s, arr) => s + arr.length, 0);

      // Sync to Supabase instructor_assignments table
      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      let dbSynced = 0;
      if (client) {
        for (const [insId, codes] of Object.entries(assignments)) {
          for (const code of codes) {
            try {
              await client.from('instructor_assignments').upsert({
                instructor_id:   insId,
                course_code:     code,
                semester:        semKey,
                status:          'assigned',
              }, { onConflict: 'instructor_id,course_code,semester' });
              dbSynced++;
            } catch (_) {}
          }
        }
      }

      results.push({ portal: 'hod', label: 'HOD Assignments', count: instructorCourseCount, dbSynced });
      PSYNC.logChange('admin', 'sync', 'assignments', semKey,
        `Synced ${instructorCourseCount} HOD assignments`, null, { count: instructorCourseCount });
      progress(`✅ HOD assignments synced: ${instructorCourseCount} instructor-course pairs`);
    } catch (err) {
      results.push({ portal: 'hod', label: 'HOD Assignments', error: err.message });
      progress(`⚠️ HOD sync error: ${err.message}`);
    }

    // ── 2c. Sync Reg2 instructor details ─────────────────────────────────
    progress('Syncing instructor data from Registration 2…');
    try {
      const reg2Data = JSON.parse(localStorage.getItem('cck_reg2_inst') || '{}');
      const instShared = JSON.parse(localStorage.getItem('cck_inst_shared') || '{}');

      // Merge reg2 details into inst_shared
      let updateCount = 0;
      Object.entries(reg2Data).forEach(([insId, data]) => {
        instShared[insId] = { ...(instShared[insId] || {}), ...data };
        updateCount++;
      });
      localStorage.setItem('cck_inst_shared', JSON.stringify(instShared));

      // Sync to Supabase instructors table
      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      let dbSynced = 0;
      if (client) {
        for (const [insId, data] of Object.entries(reg2Data)) {
          try {
            const updateData = {};
            if (data.employment)    updateData.employment_type = data.employment;
            if (data.qualification) updateData.qualification   = data.qualification;
            if (data.timeFrom)      updateData.time_from       = data.timeFrom;
            if (data.timeTo)        updateData.time_to         = data.timeTo;
            if (data.maxCredits)    updateData.max_credits     = data.maxCredits;
            if (data.teachDepts)    updateData.department      = (data.teachDepts || []).join(', ');

            if (Object.keys(updateData).length) {
              await client.from('instructors')
                .update(updateData).eq('instructor_id', insId);
              dbSynced++;
            }
          } catch (_) {}
        }
      }

      results.push({ portal: 'reg2', label: 'Reg2 Instructor Data', count: updateCount, dbSynced });
      PSYNC.logChange('admin', 'sync', 'instructors', semKey,
        `Synced ${updateCount} instructor records from Reg2`, null, { count: updateCount });
      progress(`✅ Instructor data synced: ${updateCount} records`);
    } catch (err) {
      results.push({ portal: 'reg2', label: 'Reg2 Instructor Data', error: err.message });
      progress(`⚠️ Reg2 sync error: ${err.message}`);
    }

    // ── 2d. Sync Facility rooms ───────────────────────────────────────────
    progress('Syncing room data from Facility…');
    try {
      const facRooms = JSON.parse(
        localStorage.getItem('cck_rooms_shared') ||
        localStorage.getItem('cck_facility_rooms') ||
        localStorage.getItem('cck_app_rooms') || '[]'
      );

      if (facRooms.length) {
        // Merge into CCK rooms store
        if (typeof CCK !== 'undefined' && CCK._rooms !== undefined) {
          CCK._rooms = facRooms;
        }
        // Also update the v3 rooms key
        localStorage.setItem('cck_rooms_v3', JSON.stringify(facRooms));

        // Sync to Supabase rooms table
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        let dbSynced = 0;
        if (client) {
          for (const room of facRooms) {
            try {
              await client.from('rooms').upsert({
                room_id:   room.id || room.room_id,
                name:      room.name,
                room_type: room.type || room.room_type || 'classroom',
                building:  room.building || '',
                capacity:  room.capacity || 35,
              }, { onConflict: 'room_id' });
              dbSynced++;
            } catch (_) {}
          }
        }

        results.push({ portal: 'facility', label: 'Facility Rooms', count: facRooms.length, dbSynced });
        PSYNC.logChange('admin', 'sync', 'rooms', semKey,
          `Synced ${facRooms.length} rooms from Facility`, null, { count: facRooms.length });
        progress(`✅ Rooms synced: ${facRooms.length} rooms`);
      } else {
        results.push({ portal: 'facility', label: 'Facility Rooms', count: 0, dbSynced: 0 });
        progress('ℹ️ No facility rooms found to sync');
      }
    } catch (err) {
      results.push({ portal: 'facility', label: 'Facility Rooms', error: err.message });
      progress(`⚠️ Facility sync error: ${err.message}`);
    }

    // ── 2e. Mark all unsynced entries for this semester as synced ────────
    const unsyncedIds = PSYNC.getChanges({ unsynced: true, semKey }).map(e => e.id);
    PSYNC.markSynced(unsyncedIds);

    // ── 2f. Write sync log ────────────────────────────────────────────────
    const syncLog = JSON.parse(localStorage.getItem(LS_SYNC) || '[]');
    syncLog.unshift({ timestamp: new Date().toISOString(), semKey, results });
    if (syncLog.length > 50) syncLog.length = 50;
    localStorage.setItem(LS_SYNC, JSON.stringify(syncLog));

    progress('🎉 Sync complete!');
    window.dispatchEvent(new CustomEvent('cck-sync-complete', { detail: { semKey, results } }));
    return results;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 3.  PORTAL INSTRUMENTATION  (auto-wrap save functions per portal page)
  // ──────────────────────────────────────────────────────────────────────────

  PSYNC._patchPortal = function () {
    // Detect which portal we're on by looking at the page title or a known var
    const title = document.title || '';
    const isReg1     = title.includes('Registration 1') || typeof changes !== 'undefined';
    const isReg2     = title.includes('Registration 2');
    const isHOD      = title.includes('HOD') || typeof hodData !== 'undefined';
    const isFacility = title.includes('Facility') || title.includes('facility');

    if (isReg1)     PSYNC._patchReg1();
    if (isReg2)     PSYNC._patchReg2();
    if (isHOD)      PSYNC._patchHOD();
    if (isFacility) PSYNC._patchFacility();
  };

  // ── Reg1: wrap markChange & submitToAdmin ────────────────────────────
  PSYNC._patchReg1 = function () {
    if (PSYNC._reg1Patched) return;
    PSYNC._reg1Patched = true;

    const _orig_markChange = global.markChange;
    if (typeof _orig_markChange === 'function') {
      global.markChange = function (code, val) {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 1) {
          const oldVal = (global.base && global.base[code]) || 3;
          if (n !== oldVal) {
            PSYNC.logChange('reg1', 'credit_change', 'course', code,
              `Credit changed: ${code}`, oldVal, n);
          }
        }
        return _orig_markChange.apply(this, arguments);
      };
    }

    const _orig_saveRow = global.saveRow;
    if (typeof _orig_saveRow === 'function') {
      global.saveRow = async function (code) {
        const input = document.getElementById('cr-' + code);
        const n = parseInt(input?.value);
        const oldVal = (global.base && global.base[code]) || 3;
        if (!isNaN(n) && n !== oldVal) {
          PSYNC.logChange('reg1', 'credit_change', 'course', code,
            `Saved credit: ${code}`, oldVal, n);
        }
        return _orig_saveRow.apply(this, arguments);
      };
    }

    // submitToAdmin: already notifies — we just add a change-log entry
    const _orig_submit = global.submitToAdmin;
    if (typeof _orig_submit === 'function') {
      global.submitToAdmin = async function () {
        const semKey = (typeof CCK !== 'undefined') ? CCK.getActiveSemKey() : 'spring2026';
        PSYNC.logChange('reg1', 'submit', 'semester', semKey,
          'Reg1 submitted to Admin', null, { semKey });
        return _orig_submit.apply(this, arguments);
      };
    }
  };

  // ── Reg2: wrap save instructor & submitToAdmin ────────────────────────
  PSYNC._patchReg2 = function () {
    if (PSYNC._reg2Patched) return;
    PSYNC._reg2Patched = true;

    // Reg2 saves via localStorage key 'cck_reg2_inst' whenever saveInstructor runs.
    // We patch localStorage.setItem to detect the key.
    const _origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cck_reg2_inst' && !PSYNC._inReg2StoragePatch) {
        PSYNC._inReg2StoragePatch = true;
        try {
          const oldRaw = localStorage.getItem('cck_reg2_inst') || '{}';
          const oldData = JSON.parse(oldRaw);
          const newData = JSON.parse(value);

          // Diff: find changed instructors
          Object.entries(newData).forEach(([insId, newD]) => {
            const oldD = oldData[insId] || {};
            const changed = JSON.stringify(oldD) !== JSON.stringify(newD);
            if (changed) {
              // Build a human-readable summary of what changed
              const diffs = [];
              if (oldD.employment !== newD.employment)
                diffs.push(`employment: ${oldD.employment || '—'} → ${newD.employment}`);
              if (oldD.maxCredits !== newD.maxCredits)
                diffs.push(`maxCredits: ${oldD.maxCredits || '—'} → ${newD.maxCredits}`);
              if (JSON.stringify(oldD.teachDepts) !== JSON.stringify(newD.teachDepts))
                diffs.push(`depts: ${(oldD.teachDepts||[]).join(',') || '—'} → ${(newD.teachDepts||[]).join(',')}`);

              if (diffs.length) {
                PSYNC.logChange('reg2', 'instructor_update', 'instructor', insId,
                  `Updated: ${insId} (${diffs.join('; ')})`, oldD, newD);
              }
            }
          });
        } catch (_) {}
        PSYNC._inReg2StoragePatch = false;
      }
      return _origSet.apply(this, arguments);
    };

    const _orig_submit = global.submitToAdmin;
    if (typeof _orig_submit === 'function') {
      global.submitToAdmin = async function () {
        const semKey = (typeof CCK !== 'undefined') ? CCK.getActiveSemKey() : 'spring2026';
        PSYNC.logChange('reg2', 'submit', 'semester', semKey,
          'Reg2 submitted to Admin', null, { semKey });
        return _orig_submit.apply(this, arguments);
      };
    }
  };

  // ── HOD: wrap assignment toggles ─────────────────────────────────────
  PSYNC._patchHOD = function () {
    if (PSYNC._hodPatched) return;
    PSYNC._hodPatched = true;

    // HOD saves to 'cck_assignments_v3' or 'cck_hod_assignments'
    const _origSet = Storage.prototype.setItem;
    if (!PSYNC._storagePatched) {
      PSYNC._storagePatched = true;
      Storage.prototype.setItem = function (key, value) {
        if ((key === 'cck_assignments_v3' || key === 'cck_hod_assignments') && !PSYNC._inHodStoragePatch) {
          PSYNC._inHodStoragePatch = true;
          try {
            const semKey = (typeof CCK !== 'undefined') ? CCK.getActiveSemKey() : 'spring2026';
            const oldRaw  = localStorage.getItem(key) || (key === 'cck_assignments_v3' ? '{}' : '{}');
            const oldData = JSON.parse(oldRaw);
            const newData = JSON.parse(value);

            const oldSem = (key === 'cck_assignments_v3') ? (oldData[semKey] || {}) : oldData;
            const newSem = (key === 'cck_assignments_v3') ? (newData[semKey] || {}) : newData;

            // Find added assignments
            Object.entries(newSem).forEach(([insId, codes]) => {
              const oldCodes = oldSem[insId] || [];
              codes.forEach(code => {
                if (!oldCodes.includes(code)) {
                  PSYNC.logChange('hod', 'instructor_assign', 'assignment',
                    `${insId}→${code}`,
                    `Assigned ${insId} to ${code}`, null, { insId, code });
                }
              });
            });
            // Find removed assignments
            Object.entries(oldSem).forEach(([insId, codes]) => {
              const newCodes = newSem[insId] || [];
              codes.forEach(code => {
                if (!newCodes.includes(code)) {
                  PSYNC.logChange('hod', 'instructor_unassign', 'assignment',
                    `${insId}→${code}`,
                    `Unassigned ${insId} from ${code}`, { insId, code }, null);
                }
              });
            });
          } catch (_) {}
          PSYNC._inHodStoragePatch = false;
        }
        return _origSet.apply(this, arguments);
      };
    }

    const _orig_submit = global.submitToAdmin;
    if (typeof _orig_submit === 'function') {
      global.submitToAdmin = async function () {
        const semKey = (typeof CCK !== 'undefined') ? CCK.getActiveSemKey() : 'spring2026';
        PSYNC.logChange('hod', 'submit', 'semester', semKey,
          'HOD submitted to Admin', null, { semKey });
        return _orig_submit.apply(this, arguments);
      };
    }
  };

  // ── Facility: wrap room saves ─────────────────────────────────────────
  PSYNC._patchFacility = function () {
    if (PSYNC._facilityPatched) return;
    PSYNC._facilityPatched = true;

    const _origSet = Storage.prototype.setItem;
    if (!PSYNC._facilityStoragePatched) {
      PSYNC._facilityStoragePatched = true;
      const FAC_KEYS = new Set(['cck_rooms_shared', 'cck_facility_rooms', 'cck_app_rooms', 'cck_rooms_v3']);
      Storage.prototype.setItem = function (key, value) {
        if (FAC_KEYS.has(key) && !PSYNC._inFacStoragePatch) {
          PSYNC._inFacStoragePatch = true;
          try {
            const oldRaw  = localStorage.getItem(key) || '[]';
            const oldRooms = JSON.parse(oldRaw);
            const newRooms = JSON.parse(value);

            // Index old rooms
            const oldIdx = {};
            (Array.isArray(oldRooms) ? oldRooms : []).forEach(r => {
              oldIdx[r.id || r.room_id] = r;
            });

            (Array.isArray(newRooms) ? newRooms : []).forEach(room => {
              const rid = room.id || room.room_id;
              const old = oldIdx[rid];
              if (!old) {
                PSYNC.logChange('facility', 'room_add', 'room', rid,
                  `Room added: ${rid} (${room.name || ''})`, null, room);
              } else if (JSON.stringify(old) !== JSON.stringify(room)) {
                PSYNC.logChange('facility', 'room_update', 'room', rid,
                  `Room updated: ${rid}`, old, room);
              }
              delete oldIdx[rid];
            });
            // Remaining in oldIdx were deleted
            Object.keys(oldIdx).forEach(rid => {
              PSYNC.logChange('facility', 'room_delete', 'room', rid,
                `Room deleted: ${rid}`, oldIdx[rid], null);
            });
          } catch (_) {}
          PSYNC._inFacStoragePatch = false;
        }
        return _origSet.apply(this, arguments);
      };
    }

    const _orig_submit = global.submitToAdmin;
    if (typeof _orig_submit === 'function') {
      global.submitToAdmin = async function () {
        const semKey = (typeof CCK !== 'undefined') ? CCK.getActiveSemKey() : 'spring2026';
        PSYNC.logChange('facility', 'submit', 'semester', semKey,
          'Facility submitted to Admin', null, { semKey });
        return _orig_submit.apply(this, arguments);
      };
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 4.  ADMIN UI  — extends the Portal Review section in index.html
  // ──────────────────────────────────────────────────────────────────────────

  /** Inject the "Changes" tab and "Sync All" button into the Portal Review section */
  PSYNC.injectAdminUI = function () {
    // Watch for the pr-root to be rendered, then patch it
    const observer = new MutationObserver(() => {
      const root = document.getElementById('pr-root');
      if (!root || !root.innerHTML.trim()) return;
      PSYNC._addChangesTab(root);
    });

    const sec = document.getElementById('section-portal-review');
    if (sec) observer.observe(sec, { childList: true, subtree: true });

    // Also hook the nav link click
    const navLink = document.querySelector('[data-section="portal-review"]');
    if (navLink) {
      navLink.addEventListener('click', () => {
        setTimeout(() => {
          const root = document.getElementById('pr-root');
          if (root && root.innerHTML.trim()) PSYNC._addChangesTab(root);
        }, 100);
      });
    }

    // Badge: update on change events
    window.addEventListener('cck-change-logged', () => PSYNC._updateChangeBadge());
    window.addEventListener('cck-sync-complete', () => PSYNC._updateChangeBadge());
  };

  PSYNC._addChangesTab = function (root) {
    if (document.getElementById('pr-tab-changes')) return; // Already added

    // 1. Add "Changes" and "Sync" tabs to the tab bar
    const tabBar = root.querySelector('.pr-tabs');
    if (!tabBar) return;

    const changesTab = document.createElement('button');
    changesTab.className = 'pr-tab';
    changesTab.id = 'pr-tab-changes';
    changesTab.innerHTML = 'Changes <span id="pr-changes-badge" style="background:#6366F1;color:white;border-radius:8px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:3px;display:none">0</span>';
    changesTab.onclick = function () { PSYNC._openChangesTab(changesTab); };
    tabBar.appendChild(changesTab);

    // 2. Add Sync All button to tab bar area (right side)
    const syncBtn = document.createElement('button');
    syncBtn.id = 'pr-sync-all-btn';
    syncBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0">
        <polyline points="23 4 23 10 17 10"/>
        <polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
      Sync All
    `;
    syncBtn.style.cssText = `
      margin-left:auto;padding:7px 14px;background:#6366F1;color:white;border:none;
      border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;
      display:inline-flex;align-items:center;gap:6px;transition:background .15s;flex-shrink:0;
    `;
    syncBtn.onmouseover = () => syncBtn.style.background = '#4F46E5';
    syncBtn.onmouseout  = () => syncBtn.style.background = '#6366F1';
    syncBtn.onclick     = () => PSYNC._doSyncAll();
    tabBar.appendChild(syncBtn);

    // 3. Add changes panel placeholder
    const panel = document.createElement('div');
    panel.id = 'pr-panel-changes';
    panel.className = 'pr-panel';
    root.appendChild(panel);

    PSYNC._updateChangeBadge();
  };

  PSYNC._openChangesTab = function (btn) {
    // Deactivate other tabs
    document.querySelectorAll('#pr-root .pr-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#pr-root .pr-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');

    const panel = document.getElementById('pr-panel-changes');
    if (panel) {
      panel.classList.add('active');
      PSYNC._renderChangesPanel(panel);
    }
  };

  PSYNC._updateChangeBadge = function () {
    const semKey = (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
      ? CCK.getActiveSemKey() : 'spring2026';
    const unsynced = PSYNC.getChanges({ semKey, unsynced: true })
      .filter(e => e.portal !== 'admin').length;
    const badge = document.getElementById('pr-changes-badge');
    if (badge) {
      badge.style.display = unsynced > 0 ? 'inline' : 'none';
      badge.textContent = unsynced;
    }
  };

  // ── Render the Changes panel ─────────────────────────────────────────
  PSYNC._renderChangesPanel = function (panel) {
    const semKey = (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
      ? CCK.getActiveSemKey() : 'spring2026';
    const semLabel = (typeof CCK !== 'undefined' && CCK.getSemesterByKey)
      ? (CCK.getSemesterByKey(semKey)?.label || semKey) : semKey;

    // All portals' changes for this semester, excluding 'admin' sync entries
    const allChanges = PSYNC.getChanges({ semKey }).filter(e => e.portal !== 'admin');

    const portals = ['hod', 'reg1', 'reg2', 'facility'];
    const byPortal = {};
    portals.forEach(p => { byPortal[p] = allChanges.filter(e => e.portal === p); });

    const totalUnsynced = allChanges.filter(e => !e.synced).length;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#0F172A">Change Log</div>
          <div style="font-size:11px;color:#64748B;margin-top:2px">
            ${semLabel} · ${allChanges.length} total changes · 
            <span style="color:${totalUnsynced ? '#6366F1' : '#15803D'};font-weight:600">
              ${totalUnsynced > 0 ? `${totalUnsynced} pending sync` : 'All synced ✓'}
            </span>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="PSYNC._exportChangesCSV()" style="padding:6px 12px;border:1.5px solid #E2E8F0;background:white;border-radius:7px;font-size:11px;font-weight:600;color:#64748B;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:5px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button onclick="PSYNC._clearChanges()" style="padding:6px 12px;border:1.5px solid #FECACA;background:white;border-radius:7px;font-size:11px;font-weight:600;color:#DC2626;cursor:pointer;font-family:inherit;">
            Clear Log
          </button>
        </div>
      </div>

      <!-- Portal selector tabs -->
      <div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap;" id="pr-changes-portal-tabs">
        <button class="pr-chg-ptab active" data-portal="all" onclick="PSYNC._filterPortal(this,'all')">
          All <span style="background:#64748B;color:white;border-radius:8px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:3px">${allChanges.length}</span>
        </button>
        ${portals.map(p => {
          const meta = PORTAL_META[p];
          const cnt = byPortal[p].length;
          const unsync = byPortal[p].filter(e => !e.synced).length;
          return `<button class="pr-chg-ptab" data-portal="${p}" onclick="PSYNC._filterPortal(this,'${p}')"
            style="border-left:2px solid ${meta.color};">
            ${meta.icon} ${meta.label}
            <span style="background:${meta.color};color:white;border-radius:8px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:3px">${cnt}</span>
            ${unsync > 0 ? `<span style="background:#FEF3C7;color:#92400E;border-radius:8px;padding:1px 5px;font-size:9px;font-weight:700;margin-left:2px">${unsync} new</span>` : ''}
          </button>`;
        }).join('')}
      </div>

      <!-- Change entries -->
      <div id="pr-changes-list" style="display:flex;flex-direction:column;gap:2px;">
        ${PSYNC._renderChangeEntries(allChanges)}
      </div>

      <!-- Styles for this component -->
      <style>
        .pr-chg-ptab {
          padding:6px 12px;border:1.5px solid #E2E8F0;background:white;border-radius:7px;
          font-size:11px;font-weight:600;color:#374151;cursor:pointer;font-family:inherit;
          display:inline-flex;align-items:center;gap:4px;transition:all .15s;
        }
        .pr-chg-ptab:hover { background:#F8FAFC; }
        .pr-chg-ptab.active { background:#0F172A;color:white;border-color:#0F172A; }
        .pr-chg-ptab.active span { background:rgba(255,255,255,.25) !important; color:white !important; }
        .pr-chg-entry {
          background:white;border:1px solid #F1F5F9;border-radius:8px;padding:10px 14px;
          display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:start;
          transition:background .1s;
        }
        .pr-chg-entry:hover { background:#FAFBFF; }
        .pr-chg-entry.synced { opacity:.65; }
        .pr-chg-icon { width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0; }
        .pr-chg-diff { display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px; }
        .pr-chg-old { padding:1px 6px;background:#FEF2F2;color:#991B1B;border-radius:4px;font-size:10px;font-weight:600;font-family:monospace;text-decoration:line-through;opacity:.7; }
        .pr-chg-new { padding:1px 6px;background:#F0FDF4;color:#166534;border-radius:4px;font-size:10px;font-weight:600;font-family:monospace; }
        .pr-chg-arr { color:#64748B;font-size:11px; }
        .pr-portal-badge { padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:.04em; }
        .pr-sync-dot { width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:5px; }
      </style>
    `;
  };

  PSYNC._renderChangeEntries = function (entries) {
    if (!entries.length) {
      return `<div style="padding:36px;text-align:center;color:#64748B;font-size:13px;background:white;border-radius:8px;border:1px solid #F1F5F9">
        No changes recorded yet. Changes are logged automatically when portals save data.
      </div>`;
    }

    return entries.map(entry => {
      const meta   = PORTAL_META[entry.portal] || PORTAL_META.admin;
      const aType  = ACTION_META[entry.action] || { label: entry.action, icon: '📝' };
      const ts     = new Date(entry.timestamp);
      const tsStr  = ts.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
                   + ' · ' + ts.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

      // Build diff display
      let diffHTML = '';
      if (entry.action === 'credit_change' && entry.oldValue !== null && entry.newValue !== null) {
        diffHTML = `<div class="pr-chg-diff">
          <span class="pr-chg-old">${entry.oldValue} cr</span>
          <span class="pr-chg-arr">→</span>
          <span class="pr-chg-new">${entry.newValue} cr</span>
        </div>`;
      } else if (entry.action === 'instructor_assign' && entry.newValue) {
        const v = entry.newValue;
        diffHTML = `<div class="pr-chg-diff">
          <span style="padding:1px 6px;background:#EFF6FF;color:#1D4ED8;border-radius:4px;font-size:10px;font-weight:600;font-family:monospace">${v.insId || ''}</span>
          <span class="pr-chg-arr">→</span>
          <span class="pr-chg-new">${v.code || ''}</span>
        </div>`;
      } else if (entry.action === 'instructor_unassign' && entry.oldValue) {
        const v = entry.oldValue;
        diffHTML = `<div class="pr-chg-diff">
          <span class="pr-chg-old">${v.insId || ''} ↛ ${v.code || ''}</span>
        </div>`;
      } else if (entry.action === 'instructor_update' && entry.oldValue !== null) {
        // Show key fields that changed
        const old = entry.oldValue || {};
        const nw  = entry.newValue || {};
        const fields = [];
        ['employment','maxCredits'].forEach(f => {
          if (old[f] !== nw[f]) fields.push(`${f}: ${old[f]||'—'} → ${nw[f]||'—'}`);
        });
        if (fields.length) {
          diffHTML = `<div class="pr-chg-diff">${fields.map(f =>
            `<span style="font-size:10px;color:#64748B;background:#F8FAFC;padding:1px 6px;border-radius:4px;font-family:monospace">${f}</span>`
          ).join('')}</div>`;
        }
      } else if (entry.action === 'room_add' && entry.newValue) {
        const r = entry.newValue;
        diffHTML = `<div class="pr-chg-diff">
          <span class="pr-chg-new">${r.type || 'room'} · Cap ${r.capacity || '—'}</span>
        </div>`;
      } else if (entry.action === 'room_update') {
        diffHTML = `<div class="pr-chg-diff"><span style="font-size:10px;color:#64748B">Details updated</span></div>`;
      }

      return `
        <div class="pr-chg-entry ${entry.synced ? 'synced' : ''}" data-portal="${entry.portal}">
          <div class="pr-chg-icon" style="background:${meta.bg};font-size:13px">${aType.icon}</div>
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px">
              <span class="pr-portal-badge" style="background:${meta.bg};color:${meta.color}">${meta.label}</span>
              <span style="font-size:12px;font-weight:600;color:#0F172A">${entry.label}</span>
            </div>
            ${diffHTML}
            <div style="font-size:10px;color:#64748B;margin-top:4px;display:flex;align-items:center;gap:8px">
              <span>${tsStr}</span>
              <span style="font-family:monospace;color:#CBD5E1">${entry.entityType}:${entry.entityId}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
            <div class="pr-sync-dot" style="background:${entry.synced ? '#15803D' : '#6366F1'}" title="${entry.synced ? 'Synced' : 'Pending sync'}"></div>
            ${!entry.synced ? `<span style="font-size:9px;color:#6366F1;font-weight:700;white-space:nowrap">Pending</span>` : `<span style="font-size:9px;color:#64748B">Synced</span>`}
          </div>
        </div>
      `;
    }).join('');
  };

  PSYNC._filterPortal = function (btn, portal) {
    // Update active tab
    document.querySelectorAll('#pr-changes-portal-tabs .pr-chg-ptab')
      .forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    // Filter entries
    const semKey = (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
      ? CCK.getActiveSemKey() : 'spring2026';
    let entries = PSYNC.getChanges({ semKey }).filter(e => e.portal !== 'admin');
    if (portal !== 'all') entries = entries.filter(e => e.portal === portal);

    const list = document.getElementById('pr-changes-list');
    if (list) list.innerHTML = PSYNC._renderChangeEntries(entries);
  };

  // ── Sync All UI handler ───────────────────────────────────────────────
  PSYNC._doSyncAll = async function () {
    const btn = document.getElementById('pr-sync-all-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;animation:prSpin 1s linear infinite">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg> Syncing…`;
    }

    // Show progress modal
    const modal = document.createElement('div');
    modal.id = 'pr-sync-modal';
    modal.style.cssText = `position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.5);backdrop-filter:blur(4px)`;
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;width:480px;max-width:94vw;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,.22)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:36px;height:36px;border-radius:9px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;font-size:16px">🔄</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:#0F172A">Sync All Portals</div>
            <div style="font-size:11px;color:#64748B">Pulling data from all portals into Admin</div>
          </div>
        </div>
        <div id="pr-sync-progress" style="display:flex;flex-direction:column;gap:6px;min-height:120px;max-height:260px;overflow-y:auto;font-size:12px;font-family:monospace;color:#374151;background:#F8FAFC;border-radius:8px;padding:12px;border:1px solid #E2E8F0"></div>
        <div id="pr-sync-done" style="display:none;margin-top:12px;text-align:right">
          <button onclick="document.getElementById('pr-sync-modal').remove()" style="padding:8px 20px;background:#0F172A;color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Close</button>
        </div>
      </div>
      <style>@keyframes prSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(modal);

    const progressEl = document.getElementById('pr-sync-progress');
    const log = msg => {
      if (progressEl) {
        const line = document.createElement('div');
        line.style.cssText = 'padding:2px 0;border-bottom:1px solid #F1F5F9;';
        line.textContent = msg;
        progressEl.appendChild(line);
        progressEl.scrollTop = progressEl.scrollHeight;
      }
    };

    try {
      const semKey = (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
        ? CCK.getActiveSemKey() : 'spring2026';
      const results = await PSYNC.syncAll(semKey, log);

      // Summary
      const ok = results.filter(r => !r.error);
      const err = results.filter(r => r.error);
      log('');
      log(`✅ Sync complete: ${ok.length} portals synced${err.length ? `, ${err.length} with errors` : ''}`);
      log(`📦 Total items: ${ok.reduce((s, r) => s + (r.count || 0), 0)}`);

      // Show close button
      const doneEl = document.getElementById('pr-sync-done');
      if (doneEl) doneEl.style.display = 'block';

      // Refresh the changes panel
      PSYNC._updateChangeBadge();
      const changesPanel = document.getElementById('pr-panel-changes');
      if (changesPanel && changesPanel.classList.contains('active')) {
        PSYNC._renderChangesPanel(changesPanel);
      }

      // Show toast
      if (typeof prShowToast === 'function') {
        prShowToast(`Synced ${ok.length} portals successfully`, 'ok');
      }
    } catch (err) {
      log(`❌ Sync failed: ${err.message}`);
      const doneEl = document.getElementById('pr-sync-done');
      if (doneEl) doneEl.style.display = 'block';
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sync All`;
    }
  };

  // ── Export changes to CSV ─────────────────────────────────────────────
  PSYNC._exportChangesCSV = function () {
    const semKey = (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
      ? CCK.getActiveSemKey() : 'spring2026';
    const entries = PSYNC.getChanges({ semKey }).filter(e => e.portal !== 'admin');

    const header = ['ID', 'Portal', 'Action', 'Entity Type', 'Entity ID', 'Label', 'Old Value', 'New Value', 'Timestamp', 'Synced'];
    const rows = entries.map(e => [
      e.id, e.portal, e.action, e.entityType, e.entityId,
      `"${(e.label || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(e.oldValue || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(e.newValue || '').replace(/"/g, '""')}"`,
      e.timestamp, e.synced ? 'Yes' : 'No',
    ]);

    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cck_changes_${semKey}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  PSYNC._clearChanges = function () {
    if (!confirm('Clear all change log entries? This cannot be undone.')) return;
    localStorage.removeItem(LS_CHANGES);
    const panel = document.getElementById('pr-panel-changes');
    if (panel && panel.classList.contains('active')) PSYNC._renderChangesPanel(panel);
    PSYNC._updateChangeBadge();
    if (typeof prShowToast === 'function') prShowToast('Change log cleared', 'info');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 5.  INIT
  // ──────────────────────────────────────────────────────────────────────────

  PSYNC.init = function () {
    const isAdminPage = !!document.getElementById('admin-portal');
    const isPortalPage = !isAdminPage;

    if (isAdminPage) {
      // Index.html — inject admin UI extensions
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', PSYNC.injectAdminUI);
      } else {
        PSYNC.injectAdminUI();
      }
    }

    if (isPortalPage) {
      // Portal pages — patch save functions after DOMContentLoaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', PSYNC._patchPortal);
      } else {
        // Scripts may not be parsed yet; wait a tick
        setTimeout(PSYNC._patchPortal, 200);
      }
    }
  };

  // Expose globally
  global.PSYNC = PSYNC;
  PSYNC.init();

})(window);
