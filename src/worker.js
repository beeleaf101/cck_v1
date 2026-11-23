// CCK SIS - Cloudflare Worker
// Serves the website (./public) and a JSON API backed by the D1 database.
// Private data (students, enrollments, grades) is only returned to logged-in users:
//   - admin:   everything
//   - student: their own records; other students in enrollments are anonymised

const SESSION_COOKIE = 'cck_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_SECONDS = 15 * 60;
// Kept modest so a login fits the Workers Free plan's 10 ms CPU budget.
// Stored hashes record their own iteration count, so this can be raised later.
const PBKDF2_ITERATIONS = 20000;

// Tables the admin "query" endpoint may touch. Login tables are never exposed.
const QUERY_TABLES = new Set([
  'semesters', 'students', 'courses', 'instructors', 'enrollments', 'course_allocations',
  'timetables', 'timetable_entries', 'course_demand', 'historical_grades',
  'analytics_snapshots', 'system_settings', 'audit_log',
]);
const JSON_COLUMNS = new Set([
  'metadata', 'prerequisites', 'sections', 'courses', 'specializations',
  'enrollment_by_program', 'grade_distribution', 'value', 'details',
]);
const BOOL_COLUMNS = new Set(['is_current', 'is_planning', 'is_active']);
const STUDENT_FIELDS = [
  'student_id', 'name', 'name_ar', 'civil_id', 'email', 'phone', 'gender', 'nationality',
  'major', 'program_code', 'level', 'gpa', 'cgpa', 'enrolled_credits', 'student_type',
  'language', 'degree_class', 'admit_term', 'status',
];
const ENROLLMENT_FIELDS = [
  'student_id', 'student_name', 'course_code', 'course_name', 'section', 'time',
  'teaching_method', 'instructor', 'status', 'grade',
];
const NOT_PASSED = new Set(['F', '(FA)', '(W)', 'NP', 'NG']);

// Staff portals: role -> page. The admin can open every page.
const STAFF_PORTALS = {
  hod: { page: '/hod.html', label: 'HOD Portal' },
  reg1: { page: '/registration1.html', label: 'Registration 1' },
  reg2: { page: '/registration2.html', label: 'Registration 2' },
  facility: { page: '/facility.html', label: 'Facility Management' },
  nehad: { page: '/nehad.html', label: 'Course Structure' },
};
const STAFF_ROLES = new Set(Object.keys(STAFF_PORTALS));
// Keys are paths without ".html": Cloudflare serves /hod.html also as /hod and /hod/
const PROTECTED_PAGES = {
  '/admin': ['admin'],
  '/hod': ['admin', 'hod'],
  '/hod_main.js': ['admin', 'hod'],
  '/registration1': ['admin', 'reg1'],
  '/registration2': ['admin', 'reg2'],
  '/facility': ['admin', 'facility'],
  '/nehad': ['admin', 'nehad'],
};

// Shared portal data (former localStorage keys)
const STATUS_KEYS = new Set(['cck_hod_status_v3', 'cck_reg1_status', 'cck_reg2_status', 'cck_fac_status', 'cck_nehad_status']);
const ADMIN_ONLY_KEYS = new Set(['cck_nehad_timetable_approved', 'cck_sync_log_v3']);
const PER_USER_KEYS = new Set(['cck_joined_clubs']);           // stored per student
const STUDENT_READABLE_KEYS = new Set([
  'cck_active_sem_key', 'cck_current_semester', 'cck_semesters_v3', 'cck_courses_v3', 'cck_credits_v3',
  'cck_credits_shared', 'cck_sections_v3', 'cck_rooms_shared', 'cck_app_rooms', 'cck_facility_rooms',
  'cck_nehad_timetable_approved', 'cck_course_rules', 'cck_course_rules_data', 'cck_course_rules_ts',
  'cck_tutoring_shared', 'cck_registration_requests',
]);
const STATE_KEY_RE = /^cck_[A-Za-z0-9_]{1,80}$/;
const MAX_STATE_BYTES = 1_500_000;
const FAILED = new Set(['F', '(FA)']);

// ---------------------------------------------------------------- helpers

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function withSecurityHeaders(response) {
  const r = new Response(response.body, response);
  r.headers.set('x-content-type-options', 'nosniff');
  r.headers.set('x-frame-options', 'DENY');
  r.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return r;
}

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  // Requiring JSON blocks simple cross-site form posts (CSRF), together with SameSite cookies.
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected application/json');
  try { return await request.json(); } catch { throw new HttpError(400, 'Invalid JSON body'); }
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessionCookie(token, maxAge, secure) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const bits = await pbkdf2(password, unb64(salt), parseInt(iter, 10));
  return timingSafeEqual(b64(bits), hash);
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'local';
}

// ---------------------------------------------------------------- sessions

async function getSession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare('SELECT token, role, user_id, expires_at FROM sessions WHERE token = ?')
    .bind(token).first();
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return row;
}

async function requireSession(request, env, role) {
  const s = await getSession(request, env);
  if (!s) throw new HttpError(401, 'Please log in');
  if (role && s.role !== role) throw new HttpError(403, 'Not allowed');
  return s;
}

async function tooManyAttempts(env, ip) {
  const since = Math.floor(Date.now() / 1000) - LOCKOUT_SECONDS;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempted_at > ?')
    .bind(ip, since).first();
  return (row?.n || 0) >= MAX_FAILED_LOGINS;
}

async function recordFailure(env, ip, loginId) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO login_attempts (ip, login_id, attempted_at) VALUES (?, ?, ?)').bind(ip, String(loginId).slice(0, 64), now),
    env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(now - 24 * 3600),
  ]);
}

// ---------------------------------------------------------------- row helpers

function decodeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (JSON_COLUMNS.has(k) && typeof v === 'string') {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    } else if (BOOL_COLUMNS.has(k) && (v === 0 || v === 1)) {
      out[k] = v === 1;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function encodeValue(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function studentForClient(row) {
  const out = {};
  for (const f of STUDENT_FIELDS) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

// The semester whose enrollments the app works with. This is a separate setting from
// 'current_semester' (which follows the admin's semester dropdown) because the original
// app always loaded the same enrollments.json whatever semester was selected.
async function enrollmentSemester(env) {
  const row = await env.DB.prepare(
    "SELECT s.id, s.semester_key FROM semesters s JOIN system_settings ss ON ss.key = 'enrollment_data_semester' AND json_extract(ss.value, '$') = s.semester_key"
  ).first();
  if (row) return row;
  return (await env.DB.prepare("SELECT id, semester_key FROM semesters WHERE semester_key = 'spring2026'").first()) || { id: null, semester_key: null };
}

// ---------------------------------------------------------------- auth routes

function staffUser(role, username) {
  if (role === 'admin') {
    return { student_id: 'admin', name: 'System Administrator', major: 'Administration', level: 'Admin', gpa: '-', student_type: 'Admin', language: 'English' };
  }
  return { student_id: username, name: STAFF_PORTALS[role]?.label || username, role };
}

async function login(request, env) {
  const body = await readJson(request);
  const loginId = String(body.id || '').trim();
  const password = String(body.password || '').trim();
  if (!loginId || !password) throw new HttpError(400, 'Enter your ID and password');

  const ip = clientIp(request);
  if (await tooManyAttempts(env, ip)) {
    throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
  }

  let role = null;
  let userId = null;
  let user = null;

  const admin = await env.DB.prepare('SELECT username, password_hash, role FROM admin_users WHERE username = ?')
    .bind(loginId).first();
  if (admin) {
    if (await verifyPassword(password, admin.password_hash)) {
      role = admin.role || 'admin';
      userId = admin.username;
      user = staffUser(role, admin.username);
    }
  } else {
    const student = await env.DB.prepare('SELECT * FROM students WHERE student_id = ?').bind(loginId).first();
    // Students log in with their Civil ID (as in the original app)
    if (student && student.civil_id && timingSafeEqual(String(student.civil_id), password)) {
      role = 'student';
      userId = student.student_id;
      user = studentForClient(student);
    }
  }

  if (!role) {
    await recordFailure(env, ip, loginId);
    throw new HttpError(401, 'Invalid ID or password');
  }

  const token = randomToken();
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token, role, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(token, role, userId, expires),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)),
    env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip),
  ]);
  const secure = new URL(request.url).protocol === 'https:';
  return json({ role, user, redirect: STAFF_PORTALS[role]?.page || null }, 200,
    { 'set-cookie': sessionCookie(token, SESSION_TTL_SECONDS, secure) });
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, secure) });
}

async function me(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ role: null, user: null });
  if (s.role === 'admin' || STAFF_ROLES.has(s.role)) {
    return json({ role: s.role, user: staffUser(s.role, s.user_id), redirect: STAFF_PORTALS[s.role]?.page || null });
  }
  const student = await env.DB.prepare('SELECT * FROM students WHERE student_id = ?').bind(s.user_id).first();
  if (!student) return json({ role: null, user: null });
  return json({ role: 'student', user: studentForClient(student) });
}

async function changePassword(request, env) {
  const s = await requireSession(request, env);
  if (s.role === 'student') throw new HttpError(403, 'Not allowed');
  const body = await readJson(request);
  const current = String(body.current_password || '');
  const next = String(body.new_password || '');
  if (next.length < 10) throw new HttpError(400, 'New password must be at least 10 characters');
  const admin = await env.DB.prepare('SELECT password_hash FROM admin_users WHERE username = ?').bind(s.user_id).first();
  if (!admin || !(await verifyPassword(current, admin.password_hash))) throw new HttpError(403, 'Current password is wrong');
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').bind(await hashPassword(next), s.user_id),
    env.DB.prepare("DELETE FROM sessions WHERE role != 'student' AND user_id = ? AND token != ?").bind(s.user_id, s.token),
  ]);
  return json({ ok: true });
}

async function setStaffPassword(request, env) {
  await requireSession(request, env, 'admin');
  const body = await readJson(request);
  const username = String(body.username || '');
  const next = String(body.new_password || '');
  if (next.length < 10) throw new HttpError(400, 'Password must be at least 10 characters');
  const res = await env.DB.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').bind(await hashPassword(next), username).run();
  if (!res.meta.changes) throw new HttpError(404, 'No such account');
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND role != ?').bind(username, 'student').run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- shared portal data
function storageKeyFor(s, key) {
  if (PER_USER_KEYS.has(key)) return `u:${s.user_id}:${key}`;
  return key;
}

function canRead(s, key) {
  if (s.role === 'admin' || STAFF_ROLES.has(s.role)) return true;
  return STUDENT_READABLE_KEYS.has(key);
}

function parseJson(v, fallback) {
  try { return JSON.parse(v); } catch { return fallback; }
}

// Students only see their own registration requests
function filterForStudent(key, value, studentId) {
  if (key !== 'cck_registration_requests') return value;
  const list = parseJson(value, []);
  return JSON.stringify(Array.isArray(list) ? list.filter((r) => String(r.studentId) === String(studentId)) : []);
}

async function getState(request, env) {
  const s = await getSession(request, env);
  if (!s) return json({ role: null, user_id: null, state: {}, now: Date.now() });
  const since = parseInt(new URL(request.url).searchParams.get('since') || '0', 10) || 0;
  const rows = (await env.DB.prepare('SELECT key, value, updated_at FROM shared_state WHERE updated_at > ?').bind(since).all()).results;
  const state = {};
  const prefix = `u:${s.user_id}:`;
  for (const r of rows) {
    if (r.key.startsWith('u:')) {
      if (r.key.startsWith(prefix)) state[r.key.slice(prefix.length)] = r.value;
      continue;
    }
    if (PER_USER_KEYS.has(r.key) || !canRead(s, r.key)) continue;
    state[r.key] = s.role === 'student' ? filterForStudent(r.key, r.value, s.user_id) : r.value;
  }
  return json({ role: s.role, user_id: s.user_id, state, now: Date.now() });
}

async function putState(request, env, key) {
  const s = await requireSession(request, env);
  if (!STATE_KEY_RE.test(key)) throw new HttpError(400, 'Invalid key');
  const body = await readJson(request);
  const remove = body.remove === true;
  const value = remove ? null : String(body.value ?? '');
  if (value && value.length > MAX_STATE_BYTES) throw new HttpError(413, 'Value too large');
  const isStaff = s.role === 'admin' || STAFF_ROLES.has(s.role);
  const storeKey = storageKeyFor(s, key);
  const old = await env.DB.prepare('SELECT value FROM shared_state WHERE key = ?').bind(storeKey).first();
  let newValue = value;

  if (s.role === 'student') {
    if (PER_USER_KEYS.has(key)) {
      // fine: own key
    } else if (key === 'cck_registration_requests' && !remove) {
      // A student may add or withdraw their own requests, never touch others' or approve
      const current = parseJson(old?.value, []);
      const mine = parseJson(value, []).filter((r) => String(r.studentId) === String(s.user_id));
      const before = new Map((Array.isArray(current) ? current : []).filter((r) => String(r.studentId) === String(s.user_id)).map((r) => [String(r.id), r]));
      for (const r of mine) {
        const prev = before.get(String(r.id));
        if (r.status && r.status !== 'pending' && r.status !== (prev && prev.status)) {
          throw new HttpError(403, 'Only staff can approve or reject requests');
        }
      }
      const others = (Array.isArray(current) ? current : []).filter((r) => String(r.studentId) !== String(s.user_id));
      newValue = JSON.stringify(others.concat(mine));
    } else {
      throw new HttpError(403, 'Not allowed');
    }
  } else if (!isStaff) {
    throw new HttpError(403, 'Not allowed');
  } else if (s.role !== 'admin') {
    if (ADMIN_ONLY_KEYS.has(key)) throw new HttpError(403, 'Only the admin can change this');
    if (STATUS_KEYS.has(key)) {
      // Portals can save drafts and submit; only the admin can approve
      const was = parseJson(old?.value, {}) || {};
      const now = remove ? {} : (parseJson(value, {}) || {});
      for (const [sem, st] of Object.entries(now)) {
        if (st === 'approved' && was[sem] !== 'approved') throw new HttpError(403, 'Only the admin can approve');
      }
    }
  }

  if (remove) {
    await env.DB.prepare('DELETE FROM shared_state WHERE key = ?').bind(storeKey).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO shared_state (key, value, updated_by, updated_role, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by,
         updated_role = excluded.updated_role, updated_at = excluded.updated_at`
    ).bind(storeKey, newValue, s.user_id, s.role, Date.now()).run();
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------- data routes

async function getData(request, env) {
  const s = await requireSession(request, env);
  if (STAFF_ROLES.has(s.role)) throw new HttpError(403, 'Not allowed');
  const sem = await enrollmentSemester(env);
  const enrollRows = (await env.DB.prepare(
    `SELECT ${ENROLLMENT_FIELDS.join(', ')} FROM enrollments WHERE semester_id = ? ORDER BY rowid`
  ).bind(sem.id).all()).results;

  if (s.role === 'admin') {
    const students = (await env.DB.prepare('SELECT * FROM students ORDER BY rowid').all()).results.map(studentForClient);
    return json({ students, enrollments: enrollRows, enrollment_semester: sem.semester_key });
  }

  const self = await env.DB.prepare('SELECT * FROM students WHERE student_id = ?').bind(s.user_id).first();
  // Other students are replaced with stable anonymous ids so course counts still work.
  const anon = new Map();
  const enrollments = enrollRows.map((e) => {
    if (e.student_id === s.user_id) return e;
    if (!anon.has(e.student_id)) anon.set(e.student_id, `anon-${anon.size + 1}`);
    return { ...e, student_id: anon.get(e.student_id), student_name: null };
  });
  return json({ students: self ? [studentForClient(self)] : [], enrollments, enrollment_semester: sem.semester_key });
}

function buildStudentStats(records) {
  const stats = {};
  for (const r of records) {
    let st = stats[r.student_id];
    if (!st) st = stats[r.student_id] = { name: r.student_name, courses: [], passed: 0, failed: 0, cgpa: null };
    st.courses.push({ code: r.course_code, grade: r.grade, semester: r.semester });
    if (!NOT_PASSED.has(r.grade)) st.passed++;
    if (FAILED.has(r.grade)) st.failed++;
    st.cgpa = r.cgpa;
  }
  return stats;
}

async function getHistoricalGrades(request, env) {
  const s = await requireSession(request, env);
  if (STAFF_ROLES.has(s.role)) throw new HttpError(403, 'Not allowed');
  const sql = `SELECT student_id, student_name, course_code, course_name, grade, credit_hours, gpa, cgpa,
               semester_label AS semester, verification FROM historical_grades`;
  const records = s.role === 'admin'
    ? (await env.DB.prepare(`${sql} ORDER BY rowid`).all()).results
    : (await env.DB.prepare(`${sql} WHERE student_id = ? ORDER BY rowid`).bind(s.user_id).all()).results;

  const settings = (await env.DB.prepare(
    "SELECT key, value FROM system_settings WHERE key IN ('historical_course_stats', 'historical_grade_points', 'historical_summary')"
  ).all()).results;
  const get = (k) => { const row = settings.find((x) => x.key === k); return row ? JSON.parse(row.value) : null; };

  return json({
    records,
    course_stats: get('historical_course_stats') || {},
    student_stats: buildStudentStats(records),
    grade_points: get('historical_grade_points') || {},
    summary: get('historical_summary') || {},
  });
}

function cleanStudent(body, { partial }) {
  const out = {};
  for (const f of STUDENT_FIELDS) {
    if (body[f] === undefined) continue;
    let v = body[f];
    if (f === 'gpa' || f === 'cgpa') {
      // Numbers are checked; text such as "Not Given" (used in the college data) is kept as is
      if (v === '' || v === null) v = null;
      else if (Number.isFinite(Number(v))) {
        v = Number(v);
        if (v < 0 || v > 4.5) throw new HttpError(400, 'GPA must be between 0 and 4.5');
      } else v = String(v).trim().slice(0, 40);
    } else if (f === 'enrolled_credits') v = parseInt(v, 10) || 0;
    else v = v === null ? null : String(v).trim();
    out[f] = v;
  }
  if (!partial) {
    if (!out.student_id) throw new HttpError(400, 'Student ID is required');
    if (!out.name) throw new HttpError(400, 'Name is required');
  }
  if (out.civil_id && !/^[0-9]{12}$/.test(out.civil_id)) throw new HttpError(400, 'Civil ID must be 12 digits');
  return out;
}

async function createStudent(request, env) {
  await requireSession(request, env, 'admin');
  const data = cleanStudent(await readJson(request), { partial: false });
  const cols = Object.keys(data);
  try {
    await env.DB.prepare(`INSERT INTO students (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .bind(...cols.map((c) => data[c])).run();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'A student with this ID already exists');
    throw e;
  }
  const row = await env.DB.prepare('SELECT * FROM students WHERE student_id = ?').bind(data.student_id).first();
  return json({ student: studentForClient(row) }, 201);
}

async function updateStudent(request, env, studentId) {
  await requireSession(request, env, 'admin');
  const data = cleanStudent(await readJson(request), { partial: true });
  delete data.student_id;
  const cols = Object.keys(data);
  if (!cols.length) throw new HttpError(400, 'Nothing to update');
  const res = await env.DB.prepare(
    `UPDATE students SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE student_id = ?`
  ).bind(...cols.map((c) => data[c]), studentId).run();
  if (!res.meta.changes) throw new HttpError(404, 'Student not found');
  const row = await env.DB.prepare('SELECT * FROM students WHERE student_id = ?').bind(studentId).first();
  return json({ student: studentForClient(row) });
}

async function deleteStudent(request, env, studentId) {
  await requireSession(request, env, 'admin');
  const res = await env.DB.prepare('DELETE FROM students WHERE student_id = ?').bind(studentId).run();
  if (!res.meta.changes) throw new HttpError(404, 'Student not found');
  return json({ ok: true });
}

// Admin import of the private JSON files, sent from the browser in chunks
// (students.json, enrollments.json, historical_grades.json).
const IMPORT_MAX_ROWS = 500;
const toNumberOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
async function importData(request, env) {
  await requireSession(request, env, 'admin');
  const body = await readJson(request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > IMPORT_MAX_ROWS) throw new HttpError(400, `Send at most ${IMPORT_MAX_ROWS} rows per request`);
  const db = env.DB;
  const stmts = [];

  if (body.kind === 'students') {
    for (const r of rows) {
      const data = cleanStudent(r, { partial: false });
      if (!data.status) data.status = 'active';
      const cols = Object.keys(data);
      stmts.push(db.prepare(`INSERT OR REPLACE INTO students (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .bind(...cols.map((c) => data[c])));
    }
  } else if (body.kind === 'enrollments') {
    const sem = await enrollmentSemester(env);
    if (!sem.id) throw new HttpError(400, 'Enrollment semester not found');
    if (body.replace) stmts.push(db.prepare('DELETE FROM enrollments WHERE semester_id = ?').bind(sem.id));
    for (const r of rows) {
      if (!r.student_id || !r.course_code) throw new HttpError(400, 'Each enrollment needs student_id and course_code');
      stmts.push(db.prepare(
        `INSERT OR IGNORE INTO enrollments (semester_id, ${ENROLLMENT_FIELDS.join(', ')}) VALUES (?, ${ENROLLMENT_FIELDS.map(() => '?').join(', ')})`
      ).bind(sem.id, ...ENROLLMENT_FIELDS.map((f) => {
        const v = r[f];
        if (v === undefined || v === null) return f === 'time' || f === 'teaching_method' ? '' : (f === 'section' ? '1' : null);
        return String(v);
      })));
    }
  } else if (body.kind === 'historical_records') {
    if (body.replace) stmts.push(db.prepare('DELETE FROM historical_grades'));
    const gp = body.grade_points || {};
    for (const r of rows) {
      if (!r.student_id || !r.course_code) throw new HttpError(400, 'Each grade record needs student_id and course_code');
      const verification = r.verification === 'unverified' ? 'unverified' : 'confirmed';
      // per-record grade points win (the 2015-2020 exports use an older scale)
      const points = r.grade_points !== undefined ? toNumberOrNull(r.grade_points) : (gp[r.grade] ?? null);
      stmts.push(db.prepare(
        `INSERT INTO historical_grades (semester_label, student_id, student_name, course_code, course_name, grade, grade_points, credit_hours, gpa, cgpa, verification, source_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(r.semester ?? null, String(r.student_id), r.student_name ?? null, String(r.course_code), r.course_name ?? null,
        r.grade ?? null, points, parseInt(r.credit_hours, 10) || 3,
        toNumberOrNull(r.gpa), toNumberOrNull(r.cgpa), verification, r.source_file ? String(r.source_file).slice(0, 120) : null));
    }
  } else if (body.kind === 'historical_meta') {
    const meta = [
      ['historical_course_stats', body.course_stats || {}, 'Per-course grade statistics (aggregate, no names)'],
      ['historical_grade_points', body.grade_points || {}, 'Grade to grade-point mapping'],
      ['historical_summary', body.summary || {}, 'Historical grades summary'],
    ];
    for (const [k, v, d] of meta) {
      stmts.push(db.prepare('INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)').bind(k, JSON.stringify(v), d));
    }
  } else {
    throw new HttpError(400, 'Unknown import kind');
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, imported: rows.length });
}

async function deleteAllData(request, env) {
  const s = await requireSession(request, env, 'admin');
  const body = await readJson(request);
  const admin = await env.DB.prepare('SELECT password_hash FROM admin_users WHERE username = ?').bind(s.user_id).first();
  if (!admin || !(await verifyPassword(String(body.password || ''), admin.password_hash))) {
    throw new HttpError(403, 'Incorrect password');
  }
  const tables = ['timetable_entries', 'timetables', 'course_allocations', 'course_demand', 'enrollments',
    'historical_grades', 'analytics_snapshots', 'students', 'courses', 'instructors'];
  await env.DB.batch(tables.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  return json({ ok: true, tables });
}

// ---------------------------------------------------------------- admin query endpoint
// A small, safe subset of the Supabase query builder, used by the admin-only
// sync/allocation/timetable code (public/js/d1-client.js builds these requests).

const columnCache = new Map();
async function tableColumns(env, table) {
  if (!columnCache.has(table)) {
    const rows = (await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results;
    columnCache.set(table, new Set(rows.map((r) => r.name)));
  }
  return columnCache.get(table);
}

function checkTable(t) {
  if (!QUERY_TABLES.has(t)) throw new HttpError(400, `Unknown table: ${t}`);
  return t;
}

async function checkColumn(env, table, col) {
  const cols = await tableColumns(env, table);
  if (!cols.has(col)) throw new HttpError(400, `Unknown column ${table}.${col}`);
  return col;
}

async function buildWhere(env, table, q) {
  const parts = [];
  const params = [];
  for (const f of q.filters || []) {
    const col = await checkColumn(env, table, f.column);
    const v = encodeValue(f.value);
    if (f.op === 'eq') {
      if (v === null) parts.push(`${col} IS NULL`); else { parts.push(`${col} = ?`); params.push(v); }
    } else if (f.op === 'neq') {
      if (v === null) parts.push(`${col} IS NOT NULL`); else { parts.push(`(${col} != ? OR ${col} IS NULL)`); params.push(v); }
    } else if (f.op === 'in') {
      const list = Array.isArray(f.value) ? f.value.map(encodeValue) : [];
      if (!list.length) parts.push('0'); else { parts.push(`${col} IN (${list.map(() => '?').join(', ')})`); params.push(...list); }
    } else {
      throw new HttpError(400, `Unsupported filter: ${f.op}`);
    }
  }
  if (q.or && q.or.length) {
    const ors = [];
    for (const o of q.or) {
      const col = await checkColumn(env, table, o.column);
      if (o.op !== 'ilike') throw new HttpError(400, `Unsupported or-filter: ${o.op}`);
      ors.push(`${col} LIKE ?`);
      params.push(String(o.value).replace(/\*/g, '%'));
    }
    parts.push(`(${ors.join(' OR ')})`);
  }
  return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
}

async function runQuery(request, env) {
  await requireSession(request, env, 'admin');
  const q = await readJson(request);
  const table = checkTable(q.table);
  const db = env.DB;

  if (q.action === 'select') {
    const cols = q.columns && q.columns.length ? q.columns : null;
    const selected = cols ? await Promise.all(cols.map((c) => checkColumn(env, table, c))) : ['*'];
    const where = await buildWhere(env, table, q);
    let sql = `SELECT ${selected.join(', ')} FROM ${table}${where.sql}`;
    if (q.order && q.order.length) {
      const ord = [];
      for (const o of q.order) ord.push(`${await checkColumn(env, table, o.column)} ${o.ascending === false ? 'DESC' : 'ASC'}`);
      sql += ` ORDER BY ${ord.join(', ')}`;
    }
    if (q.limit) sql += ` LIMIT ${Math.max(0, parseInt(q.limit, 10) || 0)}`;
    let rows = (await db.prepare(sql).bind(...where.params).all()).results.map(decodeRow);

    for (const emb of q.embed || []) {
      const child = checkTable(emb.table);
      const fk = await checkColumn(env, child, emb.foreignKey);
      for (const row of rows) {
        row[child] = (await db.prepare(`SELECT * FROM ${child} WHERE ${fk} = ? ORDER BY rowid`).bind(row.id).all())
          .results.map(decodeRow);
      }
    }
    return json({ data: rows });
  }

  if (q.action === 'insert' || q.action === 'upsert') {
    const rows = Array.isArray(q.rows) ? q.rows : [q.rows];
    if (!rows.length) return json({ data: [] });
    if (rows.length > 1000) throw new HttpError(400, 'Too many rows in one request (max 1000)');
    const verb = q.action === 'upsert' && q.ignoreDuplicates ? 'INSERT OR IGNORE' : q.action === 'upsert' ? 'INSERT OR REPLACE' : 'INSERT';
    const statements = [];
    for (const r of rows) {
      const cols = Object.keys(r);
      for (const c of cols) await checkColumn(env, table, c);
      statements.push(db.prepare(
        `${verb} INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})${q.returning ? ' RETURNING *' : ''}`
      ).bind(...cols.map((c) => encodeValue(r[c]))));
    }
    const results = await db.batch(statements);
    const data = q.returning ? results.flatMap((r) => r.results || []).map(decodeRow) : null;
    return json({ data });
  }

  if (q.action === 'update') {
    const values = q.values || {};
    const cols = Object.keys(values);
    if (!cols.length) throw new HttpError(400, 'Nothing to update');
    for (const c of cols) await checkColumn(env, table, c);
    const where = await buildWhere(env, table, q);
    if (!where.sql) throw new HttpError(400, 'Update needs a filter');
    const res = await db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}${where.sql}${q.returning ? ' RETURNING *' : ''}`)
      .bind(...cols.map((c) => encodeValue(values[c])), ...where.params).all();
    return json({ data: q.returning ? res.results.map(decodeRow) : null });
  }

  if (q.action === 'delete') {
    const where = await buildWhere(env, table, q);
    if (!where.sql) throw new HttpError(400, 'Delete needs a filter');
    await db.prepare(`DELETE FROM ${table}${where.sql}`).bind(...where.params).run();
    return json({ data: null });
  }

  throw new HttpError(400, 'Unknown action');
}

// ---------------------------------------------------------------- router

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const m = request.method;

  if (path === '/api/health') {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM semesters').first();
    return json({ ok: true, database: r ? 'connected' : 'empty' });
  }
  if (path === '/api/auth/login' && m === 'POST') return login(request, env);
  if (path === '/api/auth/logout' && m === 'POST') return logout(request, env);
  if (path === '/api/auth/me' && m === 'GET') return me(request, env);
  if (path === '/api/auth/password' && m === 'POST') return changePassword(request, env);
  if (path === '/api/admin/staff-password' && m === 'POST') return setStaffPassword(request, env);
  if (path === '/api/state' && m === 'GET') return getState(request, env);
  const st = path.match(/^\/api\/state\/([A-Za-z0-9_]{1,90})$/);
  if (st && m === 'PUT') return putState(request, env, st[1]);
  if (path === '/api/data' && m === 'GET') return getData(request, env);
  if (path === '/api/historical-grades' && m === 'GET') return getHistoricalGrades(request, env);
  if (path === '/api/students' && m === 'POST') return createStudent(request, env);
  const sm = path.match(/^\/api\/students\/([A-Za-z0-9_-]{1,40})$/);
  if (sm && m === 'PUT') return updateStudent(request, env, sm[1]);
  if (sm && m === 'DELETE') return deleteStudent(request, env, sm[1]);
  if (path === '/api/query' && m === 'POST') return runQuery(request, env);
  if (path === '/api/admin/delete-all' && m === 'POST') return deleteAllData(request, env);
  if (path === '/api/admin/import' && m === 'POST') return importData(request, env);
  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return withSecurityHeaders(await handleApi(request, env, url));
      } catch (err) {
        if (err instanceof HttpError) return withSecurityHeaders(json({ error: err.message }, err.status));
        console.error(err);
        return withSecurityHeaders(json({ error: 'Server error' }, 500));
      }
    }
    const pageKey = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, '').replace(/\.html$/, '').replace(/\/index$/, '');
    const allowed = PROTECTED_PAGES[pageKey];
    if (allowed) {
      const s = await getSession(request, env);
      if (!s || !allowed.includes(s.role)) {
        return withSecurityHeaders(Response.redirect(new URL('/?login=required', url).toString(), 302));
      }
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
