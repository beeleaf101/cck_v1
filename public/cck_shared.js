/**
 * CCK_SHARED.JS v3.0 — Matches real Supabase schema
 * Column mapping from actual DB:
 *   semesters     → id(uuid), semester_key(text), label, year, term, is_current, is_planning
 *   instructors   → id(bigint), instructor_id(text), name, employment_type, time_from, time_to, max_credits
 *   instructor_assignments → instructor_id, instructor_name, course_code, semester(=semester_key), status
 *   rooms         → id(uuid), room_id(text), name, room_type, building, capacity
 *   course_sections    → id(text), semester_key, course_code, instructor_id, days[], start_time, end_time
 *   room_assignments   → id(text), semester_key, section_id, room_id(=rooms.room_id)
 *   semester_credits   → semester_key, course_code, credits
 */

window.CCK = window.CCK || {};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

CCK.DAYS_ORDER = ['Su','M','T','W','Th'];
CCK.DAY_LABELS = { Su:'Sunday', M:'Monday', T:'Tuesday', W:'Wednesday', Th:'Thursday' };
CCK.DAY_FULL   = { Su:'Sun', M:'Mon', T:'Tue', W:'Wed', Th:'Thu' };

CCK.PORTALS = {
  hod:      { label:'HOD',            color:'#6366F1' },
  reg1:     { label:'Registration 1', color:'#0EA5E9' },
  reg2:     { label:'Registration 2', color:'#10B981' },
  facility: { label:'Facility',       color:'#F59E0B' },
  admin:    { label:'Admin',          color:'#EF4444'  }
};

// localStorage keys (versioned to avoid stale data)
const LS = {
  ACTIVE_SEM_KEY: 'cck_active_sem_key',   // stores semester_key e.g. 'spring2026'
  SEMESTERS:      'cck_semesters_v3',
  INSTRUCTORS:    'cck_instructors_v3',
  COURSES:        'cck_courses_v3',
  ASSIGNMENTS:    'cck_assignments_v3',    // { [semKey]: { [insId]: [codes] } }
  HOD_STATUS:     'cck_hod_status_v3',    // { [semKey]: 'draft'|'submitted'|'approved' }
  CREDITS:        'cck_credits_v3',        // { [semKey]: { [code]: n } }
  SECTIONS:       'cck_sections_v3',       // { [semKey]: [ sectionObj ] }
  AVAILABILITY:   'cck_avail_v3',          // { [semKey]: { [insId]: availObj } }
  ROOMS:          'cck_rooms_v3',
  ROOM_ASSIGNS:   'cck_room_assigns_v3',  // { [semKey]: [ assignObj ] }
  NOTIFICATIONS:  'cck_notifications_v3',
  REG2_STATUS:    'cck_reg2_status_v3',
  FAC_STATUS:     'cck_fac_status_v3',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. SEMESTER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

CCK._semesters = null;

// Derive a status string from the DB booleans
CCK._semStatus = function(s) {
  if (s.is_current)  return 'active';
  if (s.is_planning) return 'planning';
  return 'archived';
};

CCK.loadSemesters = async function() {
  // Use cache if valid
  const cached = localStorage.getItem(LS.SEMESTERS);
  if (cached) {
    try {
      const arr = JSON.parse(cached);
      if (arr && arr.length) { CCK._semesters = arr; return arr; }
    } catch(e) {}
  }

  // Try Supabase — uses real column names
  const client = typeof getSupabaseClient==='function' ? getSupabaseClient() : null;
  if (client) {
    try {
      const { data, error } = await client
        .from('semesters')
        .select('id, semester_key, label, year, term, is_current, is_planning')
        .order('year').order('term');
      if (!error && data && data.length) {
        // Add a derived 'status' field for convenience
        const enriched = data.map(s => ({ ...s, status: CCK._semStatus(s) }));
        CCK._semesters = enriched;
        localStorage.setItem(LS.SEMESTERS, JSON.stringify(enriched));
        return enriched;
      }
    } catch(e) { console.warn('[CCK] Semesters load failed:', e.message); }
  }

  // Offline fallback
  CCK._semesters = [
    { id:'offline-1', semester_key:'spring2025', label:'Spring 2025', year:2025, term:'Spring', is_current:false, is_planning:false, status:'archived' },
    { id:'offline-2', semester_key:'fall2025',   label:'Fall 2025',   year:2025, term:'Fall',   is_current:false, is_planning:false, status:'archived' },
    { id:'offline-3', semester_key:'spring2026', label:'Spring 2026', year:2026, term:'Spring', is_current:true,  is_planning:false, status:'active'   },
    { id:'offline-4', semester_key:'fall2026',   label:'Fall 2026',   year:2026, term:'Fall',   is_current:false, is_planning:true,  status:'planning' },
  ];
  return CCK._semesters;
};

CCK.getSemesters    = function() { return CCK._semesters || []; };
CCK.getSemesterByKey = function(key) { return (CCK._semesters||[]).find(s => s.semester_key === key); };
CCK.getSemesterById  = function(id)  { return (CCK._semesters||[]).find(s => s.id === id); };

CCK.getActiveSemKey = function() {
  const stored = localStorage.getItem(LS.ACTIVE_SEM_KEY);
  if (stored) return stored;
  const active = (CCK._semesters||[]).find(s => s.is_current);
  return active ? active.semester_key : 'spring2026';
};

CCK.setActiveSemKey = function(key) {
  localStorage.setItem(LS.ACTIVE_SEM_KEY, key);
  window.dispatchEvent(new CustomEvent('cck-semester-changed', { detail: { key } }));
};

CCK.getActiveSemester = function() {
  return CCK.getSemesterByKey(CCK.getActiveSemKey()) || CCK._semesters?.[2] || {};
};

CCK.isArchived  = function(key) { const s=CCK.getSemesterByKey(key||CCK.getActiveSemKey()); return s?.status==='archived'; };
CCK.isActive    = function(key) { const s=CCK.getSemesterByKey(key||CCK.getActiveSemKey()); return s?.status==='active';   };
CCK.isPlanning  = function(key) { const s=CCK.getSemesterByKey(key||CCK.getActiveSemKey()); return s?.status==='planning'; };
CCK.isReadOnly  = function(key) { return CCK.isArchived(key); };

/**
 * Build the semester selector dropdown and inject into a container element.
 * Reloads the page on change so all portal data refreshes.
 */
CCK.buildSemesterSelector = function(containerId) {
  const el = document.getElementById(containerId);
  if (!el || !CCK._semesters) return;
  const cur = CCK.getActiveSemKey();
  const icons = { archived:'🗄', active:'✅', planning:'📋' };
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748B;">Semester</span>
      <select style="background:#1E293B;color:#F1F5F9;border:1px solid #334155;border-radius:6px;padding:5px 12px;font-size:13px;cursor:pointer;outline:none;"
        onchange="CCK.setActiveSemKey(this.value); location.reload();">
        ${CCK._semesters.map(s=>`
          <option value="${s.semester_key}" ${s.semester_key===cur?'selected':''}>
            ${icons[s.status]||'📅'} ${s.label}
          </option>`).join('')}
      </select>
      ${CCK.isArchived(cur) ? `<span style="background:#374151;color:#6B7280;font-size:11px;padding:3px 8px;border-radius:4px;font-weight:700;letter-spacing:.04em;">READ ONLY</span>` : ''}
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. INSTRUCTORS  (instructors.instructor_id is the FK used everywhere)
// ─────────────────────────────────────────────────────────────────────────────

CCK._instructors = null;

CCK.getInstructors = async function() {
  if (CCK._instructors) return CCK._instructors;

  // Try Supabase first (has availability columns we added)
  const client = typeof getSupabaseClient==='function' ? getSupabaseClient() : null;
  if (client) {
    try {
      const { data, error } = await client
        .from('instructors')
        .select('id, instructor_id, name, title, department, email, employment_type, time_from, time_to, max_credits, qualification, available_days, morning_available, evening_available, pay_rate, pay_amount')
        .order('name');
      if (!error && data && data.length) {
        // Normalize: add a .courses array from instructors.json if available
        CCK._instructors = data;
        localStorage.setItem(LS.INSTRUCTORS, JSON.stringify(data));
        return data;
      }
    } catch(e) { console.warn('[CCK] Instructors from DB failed:', e.message); }
  }

  // Fallback to localStorage cache
  const cached = localStorage.getItem(LS.INSTRUCTORS);
  if (cached) { try { CCK._instructors = JSON.parse(cached); return CCK._instructors; } catch(e){} }

  // Fallback to instructors.json
  try {
    const res = await fetch('instructors.json');
    const raw = await res.json();
    // Map instructors.json format to DB format
    CCK._instructors = raw.map(i => ({
      instructor_id: i.id,
      name: i.name,
      title: i.title || '',
      department: i.department || '',
      email: i.email || '',
      employment_type: 'Full-Time',
      time_from: '09:00',
      time_to: '17:00',
      max_credits: 21,
      available_days: ['Su','M','T','W','Th'],
      morning_available: true,
      evening_available: false,
      courses: i.courses || []
    }));
    localStorage.setItem(LS.INSTRUCTORS, JSON.stringify(CCK._instructors));
  } catch(e) { CCK._instructors = []; }
  return CCK._instructors;
};

CCK.getInstructorById   = function(insId) { return (CCK._instructors||[]).find(i=>i.instructor_id===insId); };
CCK.getInstructorByName = function(name)  { return (CCK._instructors||[]).find(i=>i.name===name||i.name.includes(name)); };

// ─────────────────────────────────────────────────────────────────────────────
// 3. COURSES
// ─────────────────────────────────────────────────────────────────────────────

CCK._courses = null;

CCK.getCourses = async function() {
  if (CCK._courses) return CCK._courses;

  const client = typeof getSupabaseClient==='function' ? getSupabaseClient() : null;
  if (client) {
    try {
      const { data, error } = await client.from('courses').select('id, code, name, credits, program_code').order('code');
      if (!error && data && data.length) {
        CCK._courses = data;
        localStorage.setItem(LS.COURSES, JSON.stringify(data));
        return data;
      }
    } catch(e) {}
  }

  const cached = localStorage.getItem(LS.COURSES);
  if (cached) { try { CCK._courses=JSON.parse(cached); return CCK._courses; } catch(e){} }

  try {
    const res = await fetch('courses.json');
    CCK._courses = await res.json();
    localStorage.setItem(LS.COURSES, JSON.stringify(CCK._courses));
  } catch(e) { CCK._courses = []; }
  return CCK._courses;
};

CCK.getCourseByCode = function(code) { return (CCK._courses||[]).find(c=>c.code===code); };

CCK.getCredits = function(code, semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.CREDITS)||'{}');
  if (all[semKey]?.[code] !== undefined) return all[semKey][code];
  return CCK.getCourseByCode(code)?.credits ?? 3;
};

CCK.setCredits = function(code, credits, semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.CREDITS)||'{}');
  if (!all[semKey]) all[semKey] = {};
  all[semKey][code] = credits;
  localStorage.setItem(LS.CREDITS, JSON.stringify(all));
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. HOD ASSIGNMENTS  (uses instructor_assignments table, semester = semester_key)
// ─────────────────────────────────────────────────────────────────────────────

CCK.getAssignments = function(semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.ASSIGNMENTS)||'{}');
  return all[semKey] || {};  // { [instructor_id]: [course_code, ...] }
};

CCK.setAssignments = function(insId, codes, semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.ASSIGNMENTS)||'{}');
  if (!all[semKey]) all[semKey] = {};
  all[semKey][insId] = codes;
  localStorage.setItem(LS.ASSIGNMENTS, JSON.stringify(all));
  CCK.log('hod','assign_courses','assignment',insId,null,codes);
};

CCK.getInstructorCourses = function(insId, semKey) { return CCK.getAssignments(semKey)[insId]||[]; };

CCK.getCourseInstructor  = function(code, semKey) {
  const a = CCK.getAssignments(semKey);
  for (const [id, codes] of Object.entries(a)) { if (codes.includes(code)) return id; }
  return null;
};

CCK.getHodStatus = function(semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  return (JSON.parse(localStorage.getItem(LS.HOD_STATUS)||'{}'))[semKey]||'draft';
};
CCK.setHodStatus = function(status, semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.HOD_STATUS)||'{}');
  all[semKey]=status;
  localStorage.setItem(LS.HOD_STATUS,JSON.stringify(all));
};

// Sync HOD assignments to Supabase instructor_assignments table
CCK.syncAssignmentsToSupabase = async function(semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const client = typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if (!client) return false;
  const a = CCK.getAssignments(semKey);
  if (!CCK._instructors) await CCK.getInstructors();
  const rows = [];
  Object.entries(a).forEach(([insId, codes]) => {
    const ins = CCK.getInstructorById(insId);
    codes.forEach(code => {
      rows.push({
        instructor_id: insId,
        instructor_name: ins?.name||insId,
        course_code: code,
        semester: semKey,         // ← semester_key matches DB column
        status: CCK.getHodStatus(semKey),
        is_active: true
      });
    });
  });
  try {
    // Upsert on the natural key (instructor_id + course_code + semester)
    const { error } = await client.from('instructor_assignments').upsert(rows, {
      onConflict: 'instructor_id,course_code,semester'
    });
    if (error) throw error;
    return true;
  } catch(e) { console.warn('[CCK] HOD sync failed:', e.message); return false; }
};

// Load HOD assignments from Supabase (for a fresh browser)
CCK.loadAssignmentsFromSupabase = async function(semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const client = typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if (!client) return;
  try {
    const { data, error } = await client
      .from('instructor_assignments')
      .select('instructor_id, course_code, status')
      .eq('semester', semKey)
      .eq('is_active', true);
    if (error||!data) return;
    const grouped = {};
    data.forEach(r => {
      if (!grouped[r.instructor_id]) grouped[r.instructor_id]=[];
      grouped[r.instructor_id].push(r.course_code);
    });
    const all = JSON.parse(localStorage.getItem(LS.ASSIGNMENTS)||'{}');
    all[semKey] = grouped;
    localStorage.setItem(LS.ASSIGNMENTS, JSON.stringify(all));
    // Also set HOD status from first row
    if (data[0]?.status) CCK.setHodStatus(data[0].status, semKey);
  } catch(e) { console.warn('[CCK] Load assignments failed:', e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. INSTRUCTOR AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────

CCK.getAvailability = function(insId, semKey) {
  // First try per-semester overrides in localStorage
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.AVAILABILITY)||'{}');
  if ((all[semKey]||{})[insId]) return all[semKey][insId];
  // Fall back to instructor record
  const ins = CCK.getInstructorById(insId);
  return {
    employment_type:   ins?.employment_type||'Full-Time',
    available_days:    ins?.available_days||['Su','M','T','W','Th'],
    morning_available: ins?.morning_available ?? true,
    evening_available: ins?.evening_available ?? false,
    time_from:         ins?.time_from||'09:00',
    time_to:           ins?.time_to||'17:00',
    max_credits:       ins?.max_credits||21,
    pay_rate:          ins?.pay_rate||null,
    pay_amount:        ins?.pay_amount||null
  };
};

CCK.setAvailability = function(insId, data, semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.AVAILABILITY)||'{}');
  if (!all[semKey]) all[semKey]={};
  all[semKey][insId] = {...(all[semKey][insId]||{}), ...data};
  localStorage.setItem(LS.AVAILABILITY, JSON.stringify(all));
};

// Sync availability back to instructors table (updates the instructor row)
CCK.syncAvailabilityToSupabase = async function(insId, semKey) {
  const avail = CCK.getAvailability(insId, semKey);
  const client = typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if (!client) return;
  try {
    await client.from('instructors').update({
      employment_type:   avail.employment_type,
      available_days:    avail.available_days,
      morning_available: avail.morning_available,
      evening_available: avail.evening_available,
      time_from:         avail.time_from||'09:00',
      time_to:           avail.time_to||'17:00',
      max_credits:       avail.max_credits,
      pay_rate:          avail.pay_rate,
      pay_amount:        avail.pay_amount
    }).eq('instructor_id', insId);
  } catch(e) { console.warn('[CCK] Availability sync:', e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. COURSE SECTIONS  (course_sections table uses semester_key)
// ─────────────────────────────────────────────────────────────────────────────

CCK.getSections = function(semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  return (JSON.parse(localStorage.getItem(LS.SECTIONS)||'{}'))[semKey]||[];
};
CCK.setSections = function(secs, semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const all = JSON.parse(localStorage.getItem(LS.SECTIONS)||'{}');
  all[semKey]=secs;
  localStorage.setItem(LS.SECTIONS, JSON.stringify(all));
};
CCK.addSection = function(sec, semKey) {
  semKey = semKey||CCK.getActiveSemKey();
  const secs = CCK.getSections(semKey);
  sec.id = `SEC_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  sec.semester_key = semKey;
  secs.push(sec);
  CCK.setSections(secs, semKey);
  return sec;
};
CCK.updateSection = function(id, upd, semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  CCK.setSections(CCK.getSections(semKey).map(s=>s.id===id?{...s,...upd}:s), semKey);
};
CCK.deleteSection = function(id, semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  CCK.setSections(CCK.getSections(semKey).filter(s=>s.id!==id), semKey);
};
CCK.getCourseSections     = function(code,  semKey) { return CCK.getSections(semKey).filter(s=>s.course_code===code); };
CCK.getInstructorSections = function(insId, semKey) { return CCK.getSections(semKey).filter(s=>s.instructor_id===insId); };

// Sync sections to Supabase course_sections table
CCK.syncSectionsToSupabase = async function(semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  const client=typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if (!client) return false;
  try {
    const { error } = await client.from('course_sections').upsert(CCK.getSections(semKey));
    return !error;
  } catch(e) { console.warn('[CCK] Sections sync:',e.message); return false; }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. ROOMS  (uses room_id as the readable key, room_type not type)
// ─────────────────────────────────────────────────────────────────────────────

CCK.DEFAULT_ROOMS = [
  {room_id:'B1-101', name:'B1-101', room_type:'classroom', building:'Building 1', capacity:35, is_active:true},
  {room_id:'B1-102', name:'B1-102', room_type:'classroom', building:'Building 1', capacity:35, is_active:true},
  {room_id:'B1-103', name:'B1-103', room_type:'classroom', building:'Building 1', capacity:30, is_active:true},
  {room_id:'B1-104', name:'B1-104', room_type:'classroom', building:'Building 1', capacity:30, is_active:true},
  {room_id:'B1-201', name:'B1-201', room_type:'classroom', building:'Building 1', capacity:40, is_active:true},
  {room_id:'B1-202', name:'B1-202', room_type:'classroom', building:'Building 1', capacity:40, is_active:true},
  {room_id:'B1-203', name:'B1-203', room_type:'classroom', building:'Building 1', capacity:35, is_active:true},
  {room_id:'B1-204', name:'B1-204', room_type:'classroom', building:'Building 1', capacity:35, is_active:true},
  {room_id:'B1-205', name:'B1-205', room_type:'classroom', building:'Building 1', capacity:30, is_active:true},
  {room_id:'B1-206', name:'B1-206', room_type:'classroom', building:'Building 1', capacity:30, is_active:true},
  {room_id:'B2-101', name:'B2-101', room_type:'classroom', building:'Building 2', capacity:40, is_active:true},
  {room_id:'B2-102', name:'B2-102', room_type:'classroom', building:'Building 2', capacity:40, is_active:true},
  {room_id:'B2-103', name:'B2-103', room_type:'classroom', building:'Building 2', capacity:35, is_active:true},
  {room_id:'B2-104', name:'B2-104', room_type:'classroom', building:'Building 2', capacity:35, is_active:true},
  {room_id:'B2-201', name:'B2-201', room_type:'classroom', building:'Building 2', capacity:40, is_active:true},
  {room_id:'B2-202', name:'B2-202', room_type:'classroom', building:'Building 2', capacity:40, is_active:true},
  {room_id:'B2-203', name:'B2-203', room_type:'classroom', building:'Building 2', capacity:35, is_active:true},
  {room_id:'B2-207', name:'B2-207', room_type:'classroom', building:'Building 2', capacity:30, is_active:true},
  {room_id:'B1-Lab1', name:'B1-Lab 1', room_type:'lab', building:'Building 1', capacity:25, is_active:true},
  {room_id:'B1-Lab2', name:'B1-Lab 2', room_type:'lab', building:'Building 1', capacity:25, is_active:true},
  {room_id:'B2-Lab1', name:'B2-Lab 1', room_type:'lab', building:'Building 2', capacity:25, is_active:true},
  {room_id:'B2-Lab2', name:'B2-Lab 2', room_type:'lab', building:'Building 2', capacity:25, is_active:true},
  {room_id:'B1-Hall', name:'B1-Hall', room_type:'hall', building:'Building 1', capacity:150, is_active:true},
  {room_id:'B2-Hall', name:'B2-Hall', room_type:'hall', building:'Building 2', capacity:150, is_active:true},
  {room_id:'B2-Audit', name:'B2-Auditorium', room_type:'hall', building:'Building 2', capacity:300, is_active:true},
];

CCK.getRooms = function() {
  const saved = localStorage.getItem(LS.ROOMS);
  if (saved) {
    try {
      const rooms = JSON.parse(saved);
      // Validate: must use room_type column name and valid values
      if (rooms.length && ['classroom','lab','hall'].includes(rooms[0].room_type)) return rooms;
    } catch(e) {}
  }
  localStorage.setItem(LS.ROOMS, JSON.stringify(CCK.DEFAULT_ROOMS));
  return JSON.parse(JSON.stringify(CCK.DEFAULT_ROOMS));
};

// Load rooms from Supabase (uses room_id as readable key, room_type for type)
CCK.loadRoomsFromSupabase = async function() {
  const client=typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if (!client) return;
  try {
    const { data, error } = await client
      .from('rooms')
      .select('room_id, name, room_type, building, capacity, is_active')
      .eq('is_active', true)
      .order('room_id');
    if (!error && data && data.length) {
      // Validate room_type values
      const valid = ['classroom','lab','hall'];
      const clean = data.filter(r => valid.includes(r.room_type));
      if (clean.length) {
        localStorage.setItem(LS.ROOMS, JSON.stringify(clean));
        return;
      }
    }
  } catch(e) { console.warn('[CCK] Rooms load:', e.message); }
};

CCK.setRooms    = function(rooms) { localStorage.setItem(LS.ROOMS, JSON.stringify(rooms)); };
CCK.getRoomById = function(roomId) { return CCK.getRooms().find(r=>r.room_id===roomId); };

// ─────────────────────────────────────────────────────────────────────────────
// 8. ROOM ASSIGNMENTS  (room_assignments table, uses room_id not uuid)
// ─────────────────────────────────────────────────────────────────────────────

CCK.getRoomAssignments = function(semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  return (JSON.parse(localStorage.getItem(LS.ROOM_ASSIGNS)||'{}'))[semKey]||[];
};

CCK.setRoomAssignment = function(sectionId, roomId, semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  const all=JSON.parse(localStorage.getItem(LS.ROOM_ASSIGNS)||'{}');
  if (!all[semKey]) all[semKey]=[];
  all[semKey]=all[semKey].filter(a=>a.section_id!==sectionId);
  if (roomId) all[semKey].push({
    id:`RA_${Date.now()}`, semester_key:semKey,
    section_id:sectionId, room_id:roomId,          // room_id = rooms.room_id e.g. 'B1-101'
    assigned_at:new Date().toISOString()
  });
  localStorage.setItem(LS.ROOM_ASSIGNS, JSON.stringify(all));
};

CCK.getRoomForSection = function(sectionId, semKey) {
  const a=CCK.getRoomAssignments(semKey).find(x=>x.section_id===sectionId);
  return a ? CCK.getRoomById(a.room_id) : null;
};

CCK.syncRoomAssignmentsToSupabase = async function(semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  const client=typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if (!client) return;
  try {
    await client.from('room_assignments').upsert(CCK.getRoomAssignments(semKey));
  } catch(e) { console.warn('[CCK] Room assign sync:',e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. ARCHIVED DATA (Spring 2025 — read from courses.json)
// ─────────────────────────────────────────────────────────────────────────────

CCK.getArchivedSections = async function(semKey) {
  const sem = CCK.getSemesterByKey(semKey||CCK.getActiveSemKey());
  if (!sem || sem.label !== 'Spring 2025') return [];
  if (!CCK._courses) await CCK.getCourses();
  const out = [];
  (CCK._courses||[]).forEach(course => {
    (course.sections||[]).forEach(sec => {
      out.push({
        course_code:     course.code,
        course_name:     course.name,
        credits:         course.credits,
        section_number:  sec.section,
        instructor_name: sec.instructor,
        method:          sec.method,
        time_string:     sec.time,
        semester_key:    semKey
      });
    });
  });
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. CONFLICT DETECTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

CCK._timeToMin = function(t) {
  if (!t) return 0;
  const [h,m]=t.split(':').map(Number); return h*60+m;
};

CCK._overlap = function(a,b) {
  const shared=(a.days||[]).filter(d=>(b.days||[]).includes(d));
  if (!shared.length) return false;
  return CCK._timeToMin(a.start_time) < CCK._timeToMin(b.end_time) &&
         CCK._timeToMin(b.start_time) < CCK._timeToMin(a.end_time);
};

CCK.checkInstructorConflicts = function(semKey) {
  const secs=CCK.getSections(semKey), out=[];
  for (let i=0;i<secs.length;i++) for (let j=i+1;j<secs.length;j++) {
    const a=secs[i],b=secs[j];
    if (!a.instructor_id||!b.instructor_id||a.instructor_id!==b.instructor_id) continue;
    if (CCK._overlap(a,b)) {
      const ins=CCK.getInstructorById(a.instructor_id);
      out.push({ type:'instructor_conflict', severity:'error',
        instructor_id:a.instructor_id, instructor_name:ins?.name||a.instructor_id,
        section_a:a, section_b:b,
        message:`${ins?.name||a.instructor_id} double-booked: ${a.course_code} §${a.section_number} and ${b.course_code} §${b.section_number}.`
      });
    }
  }
  return out;
};

CCK.checkRoomConflicts = function(semKey) {
  const secs=CCK.getSections(semKey);
  const assigns=CCK.getRoomAssignments(semKey);
  const map={}; assigns.forEach(a=>map[a.section_id]=a.room_id);
  const list=secs.filter(s=>map[s.id]); const out=[];
  for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++) {
    const a=list[i],b=list[j];
    if (map[a.id]!==map[b.id]) continue;
    if (CCK._overlap(a,b)) {
      const room=CCK.getRoomById(map[a.id]);
      out.push({ type:'room_conflict', severity:'error',
        room_id:map[a.id], room_name:room?.name,
        section_a:a, section_b:b,
        message:`Room ${room?.name} double-booked: ${a.course_code} §${a.section_number} and ${b.course_code} §${b.section_number}.`
      });
    }
  }
  return out;
};

CCK.checkAvailabilityConflicts = function(semKey) {
  semKey=semKey||CCK.getActiveSemKey(); const out=[];
  CCK.getSections(semKey).forEach(sec=>{
    if (!sec.instructor_id) return;
    const avail=CCK.getAvailability(sec.instructor_id,semKey);
    (sec.days||[]).forEach(day=>{
      if (!(avail.available_days||[]).includes(day)) {
        const ins=CCK.getInstructorById(sec.instructor_id);
        out.push({ type:'availability_conflict', severity:'warning',
          instructor_id:sec.instructor_id, instructor_name:ins?.name, section:sec, day,
          message:`${ins?.name} unavailable ${CCK.DAY_LABELS[day]} — scheduled for ${sec.course_code} §${sec.section_number}.`
        });
      }
    });
    if (avail.employment_type==='Part-Time') {
      const h=parseInt((sec.start_time||'0:0').split(':')[0]);
      if (h>=17 && !avail.evening_available) {
        const ins=CCK.getInstructorById(sec.instructor_id);
        out.push({ type:'availability_conflict', severity:'warning',
          instructor_id:sec.instructor_id, instructor_name:ins?.name, section:sec,
          message:`${ins?.name} (Part-Time) not available evenings — ${sec.course_code} starts ${sec.start_time}.`
        });
      }
    }
  });
  return out;
};

CCK.getFullConflictReport = function(semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  const ic=CCK.checkInstructorConflicts(semKey);
  const rc=CCK.checkRoomConflicts(semKey);
  const ac=CCK.checkAvailabilityConflicts(semKey);
  const all=[...ic,...rc,...ac];
  return { errors:all.filter(c=>c.severity==='error'), warnings:all.filter(c=>c.severity==='warning'),
    all, hasErrors:ic.length>0||rc.length>0, hasWarnings:ac.length>0,
    summary:`${ic.length} instructor, ${rc.length} room conflict(s), ${ac.length} availability warning(s)` };
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. NOTIFICATIONS + AUDIT LOG  (audit_log uses semester_key string)
// ─────────────────────────────────────────────────────────────────────────────

CCK.notify = function(from, to, type, message, data) {
  const n=JSON.parse(localStorage.getItem(LS.NOTIFICATIONS)||'[]');
  n.push({ id:`N_${Date.now()}`, from, to, type, message, data:data||{},
    timestamp:new Date().toISOString(), read:false });
  localStorage.setItem(LS.NOTIFICATIONS, JSON.stringify(n.slice(-100)));
};

CCK.getNotifications = function(portal) {
  return JSON.parse(localStorage.getItem(LS.NOTIFICATIONS)||'[]')
    .filter(n=>n.to===portal||n.to==='all');
};
CCK.getUnreadCount = function(portal) { return CCK.getNotifications(portal).filter(n=>!n.read).length; };

CCK.log = function(portal, action, entityType, entityId, oldVal, newVal) {
  const logs=JSON.parse(localStorage.getItem('cck_audit_log_v3')||'[]');
  logs.push({ id:`LOG_${Date.now()}`, portal, action, entityType, entityId,
    oldValue:oldVal, newValue:newVal, timestamp:new Date().toISOString(),
    semester:CCK.getActiveSemKey() });   // ← uses semester (semester_key) to match audit_log.semester
  localStorage.setItem('cck_audit_log_v3', JSON.stringify(logs.slice(-500)));
};

// Sync audit log entry to Supabase
CCK.logToSupabase = async function(portal, action, entityType, entityId, description, details) {
  const client=typeof getSupabaseClient==='function'?getSupabaseClient():null;
  if (!client) return;
  try {
    await client.from('audit_log').insert({
      portal, action, entity_type:entityType, entity_id:entityId,
      description, details:details||{},
      semester: CCK.getActiveSemKey(),
      performed_by: portal
    });
  } catch(e) {}
};

CCK.getAuditLog = function(filters) {
  let logs=JSON.parse(localStorage.getItem('cck_audit_log_v3')||'[]');
  if (filters?.portal)   logs=logs.filter(l=>l.portal===filters.portal);
  if (filters?.semester) logs=logs.filter(l=>l.semester===filters.semester);
  return logs.reverse();
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. PIPELINE STATUS
// ─────────────────────────────────────────────────────────────────────────────

CCK.getPipelineStatus = function(semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  const a=CCK.getAssignments(semKey), s=CCK.getSections(semKey), r=CCK.getRoomAssignments(semKey);
  const cr=JSON.parse(localStorage.getItem(LS.CREDITS)||'{}');
  return {
    semester: CCK.getSemesterByKey(semKey),
    hod:      { status:CCK.getHodStatus(semKey), instructors:Object.keys(a).length, courses:Object.values(a).flat().length },
    reg1:     { creditsModified:Object.keys(cr[semKey]||{}).length },
    reg2:     { status:(JSON.parse(localStorage.getItem(LS.REG2_STATUS)||'{}'))[semKey]||'draft', sections:s.length },
    facility: { status:(JSON.parse(localStorage.getItem(LS.FAC_STATUS)||'{}'))[semKey]||'draft',
                roomsAssigned:r.length, unassigned:s.length-r.length }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 13. TIMETABLE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

CCK.generateTimetable = function(semKey) {
  semKey=semKey||CCK.getActiveSemKey();
  const secs=CCK.getSections(semKey), assigns=CCK.getRoomAssignments(semKey);
  const conflicts=CCK.getFullConflictReport(semKey);
  const byIns={}, byDay={};
  CCK.DAYS_ORDER.forEach(d=>byDay[d]=[]);
  secs.forEach(sec=>{
    const k=sec.instructor_id||'unassigned';
    if (!byIns[k]) byIns[k]=[];
    const ra=assigns.find(a=>a.section_id===sec.id);
    const room=ra?CCK.getRoomById(ra.room_id):null;
    byIns[k].push({...sec, room_id:ra?.room_id||null, room_name:room?.name||'No room'});
    (sec.days||[]).forEach(d=>{ if(byDay[d]) byDay[d].push(sec); });
  });
  CCK.DAYS_ORDER.forEach(d=>byDay[d].sort((a,b)=>CCK._timeToMin(a.start_time)-CCK._timeToMin(b.start_time)));
  return {
    semester_key:semKey, semester_label:CCK.getActiveSemester().label,
    generated_at:new Date().toISOString(), conflicts, sections:secs,
    byInstructor:byIns, byDay,
    stats:{ total:secs.length, roomsAssigned:assigns.length,
      unassigned:secs.filter(s=>!assigns.find(a=>a.section_id===s.id)).length,
      errors:conflicts.errors.length, warnings:conflicts.warnings.length }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 14. UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

CCK.fmtTime = function(t) {
  if (!t) return '—';
  const [h,m]=t.split(':').map(Number), ap=h>=12?'PM':'AM';
  return `${h%12||12}:${String(m).padStart(2,'0')} ${ap}`;
};
CCK.fmtTimeRange = function(s,e) { return `${CCK.fmtTime(s)} – ${CCK.fmtTime(e)}`; };
CCK.fmtDays = function(days) { return (days||[]).map(d=>CCK.DAY_FULL[d]||d).join(', '); };
CCK.initials = function(name) {
  return name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i,'')
    .split(' ').filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
};
CCK.toast = function(msg,type,dur) {
  type=type||'info'; dur=dur||3000;
  const c={info:'#1D4ED8',success:'#10B981',warning:'#F59E0B',error:'#EF4444'};
  const t=document.createElement('div');
  t.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:9999;background:${c[type]};color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,.2);`;
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),dur);
};

// ─────────────────────────────────────────────────────────────────────────────
// 15. INIT — call on page load
// ─────────────────────────────────────────────────────────────────────────────

CCK.init = async function() {
  await CCK.loadSemesters();
  await Promise.all([CCK.getInstructors(), CCK.getCourses(), CCK.loadRoomsFromSupabase()]);
  // If active semester has HOD assignments in DB, load them
  await CCK.loadAssignmentsFromSupabase(CCK.getActiveSemKey());
  console.log(`[CCK Shared v3.0] ✅ Active: "${CCK.getActiveSemester().label}" | ${CCK._semesters?.length} semesters | ${CCK._instructors?.length} instructors | ${CCK._courses?.length} courses`);
};

if (document.readyState==='loading') {
  document.addEventListener('DOMContentLoaded', CCK.init);
} else {
  CCK.init();
}
