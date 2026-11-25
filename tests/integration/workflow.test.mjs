// Integration tests: the portal approval workflow, student registration requests,
// data import and request hardening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, Client, loggedIn } from '../helpers/harness.mjs';
import { ADMIN, STAFF } from '../fixtures/synthetic.mjs';

const pw = Object.fromEntries(STAFF.map((s) => [s.username, s.password]));
const put = (c, key, value) => c.call('PUT', `/api/state/${key}`, { value: typeof value === 'string' ? value : JSON.stringify(value) });
const read = async (c, key) => (await c.call('GET', '/api/state')).data.state[key];

test('IT-27 each portal can save a draft and submit, but not approve', async () => {
  const { env } = await makeEnv();
  const pairs = [['hod', 'cck_hod_status_v3'], ['reg1', 'cck_reg1_status'], ['reg2', 'cck_reg2_status'],
    ['facility', 'cck_fac_status'], ['nehad', 'cck_nehad_status']];
  for (const [user, key] of pairs) {
    const c = await loggedIn(env, user, pw[user], `10.8.0.${user.length}`);
    assert.equal((await put(c, key, { spring2026: 'draft' })).status, 200, user);
    assert.equal((await put(c, key, { spring2026: 'submitted' })).status, 200, user);
    const r = await put(c, key, { spring2026: 'approved' });
    assert.equal(r.status, 403, `${user} must not approve`);
  }
});

test('IT-28 the admin approves a submission and the portal sees it', async () => {
  const { env } = await makeEnv();
  const reg1 = await loggedIn(env, 'reg1', pw.reg1, '10.8.1.1');
  await put(reg1, 'cck_credits_v3', { spring2026: { CSIT1100: 4 } });
  await put(reg1, 'cck_reg1_status', { spring2026: 'submitted' });
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password, '10.8.1.2');
  assert.equal(JSON.parse(await read(admin, 'cck_reg1_status')).spring2026, 'submitted');
  assert.equal((await put(admin, 'cck_reg1_status', { spring2026: 'approved' })).status, 200);
  assert.equal(JSON.parse(await read(reg1, 'cck_reg1_status')).spring2026, 'approved');
  const hod = await loggedIn(env, 'hod', pw.hod, '10.8.1.3');
  assert.equal(JSON.parse(await read(hod, 'cck_credits_v3')).spring2026.CSIT1100, 4);
});

test('IT-29 a portal cannot keep an approval it was refused by resubmitting approved', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  await put(admin, 'cck_hod_status_v3', { fall2026: 'approved' });
  const hod = await loggedIn(env, 'hod', pw.hod, '10.8.2.1');
  // leaving an existing approval in place is fine; adding a new one is not
  assert.equal((await put(hod, 'cck_hod_status_v3', { fall2026: 'approved', spring2027: 'draft' })).status, 200);
  assert.equal((await put(hod, 'cck_hod_status_v3', { fall2026: 'approved', spring2027: 'approved' })).status, 403);
});

test('IT-30 admin-only keys are refused for staff', async () => {
  const { env } = await makeEnv();
  const nehad = await loggedIn(env, 'nehad', pw.nehad);
  assert.equal((await put(nehad, 'cck_nehad_timetable_approved', { ok: true })).status, 403);
  assert.equal((await put(nehad, 'cck_sync_log_v3', [])).status, 403);
});

test('IT-31 a student can submit a registration request and the admin can review it', async () => {
  const { env, people } = await makeEnv();
  const me = people[2];
  const s = await loggedIn(env, me.student_id, me.civil_id, '10.9.0.1');
  const req = [{ id: 111, studentId: me.student_id, courses: [{ code: 'CSIT2300', name: 'Databases', credits: 3 }], validation: [], status: 'pending' }];
  assert.equal((await put(s, 'cck_registration_requests', req)).status, 200);
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password, '10.9.0.2');
  const list = JSON.parse(await read(admin, 'cck_registration_requests'));
  assert.equal(list.length, 1);
  assert.equal(list[0].studentName, me.name);
  list[0].status = 'approved';
  assert.equal((await put(admin, 'cck_registration_requests', list)).status, 200);
  assert.equal(JSON.parse(await read(s, 'cck_registration_requests'))[0].status, 'approved');
});

test('IT-32 a student cannot approve their own request, see others\' or edit a reviewed one', async () => {
  const { env, people } = await makeEnv();
  const [a, b] = people;
  const sa = await loggedIn(env, a.student_id, a.civil_id, '10.9.1.1');
  const sb = await loggedIn(env, b.student_id, b.civil_id, '10.9.1.2');
  assert.equal((await put(sa, 'cck_registration_requests', [{ id: 1, studentId: a.student_id, courses: [{ code: 'CSIT1100' }], status: 'approved' }])).status, 403);
  await put(sa, 'cck_registration_requests', [{ id: 1, studentId: a.student_id, courses: [{ code: 'CSIT1100' }] }]);
  await put(sb, 'cck_registration_requests', [{ id: 2, studentId: b.student_id, courses: [{ code: 'CSIT1200' }] }]);
  assert.deepEqual(JSON.parse(await read(sa, 'cck_registration_requests')).map((r) => r.id), [1]);
  // B tries to overwrite A's request: ignored
  await put(sb, 'cck_registration_requests', [{ id: 1, studentId: a.student_id, courses: [{ code: 'MATH1100' }] }]);
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password, '10.9.1.3');
  let all = JSON.parse(await read(admin, 'cck_registration_requests'));
  assert.equal(all.find((r) => r.id === 1).courses[0].code, 'CSIT1100');
  // after the admin rejects it, A cannot quietly change the courses
  all = all.map((r) => (r.id === 1 ? { ...r, status: 'rejected', reviewNotes: 'Missing prerequisite' } : r));
  await put(admin, 'cck_registration_requests', all);
  await put(sa, 'cck_registration_requests', [{ id: 1, studentId: a.student_id, courses: [{ code: 'CSIT4290' }], status: 'rejected' }]);
  const after = JSON.parse(await read(admin, 'cck_registration_requests')).find((r) => r.id === 1);
  assert.equal(after.courses[0].code, 'CSIT1100');
  assert.equal(after.status, 'rejected');
});

test('IT-33 script in a student request is removed before the admin sees it', async () => {
  const { env, people } = await makeEnv();
  const me = people[4];
  const s = await loggedIn(env, me.student_id, me.civil_id, '10.9.2.1');
  await put(s, 'cck_registration_requests', [{
    id: 5, studentId: me.student_id, studentName: '<img src=x onerror=alert(document.cookie)>',
    courses: [{ code: 'CSIT1100', name: '<script>alert(1)</script>' }],
    validation: [{ courseCode: 'CSIT1100', eligible: true, issues: [], warnings: ['<svg onload=alert(1)>'] }],
  }]);
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password, '10.9.2.2');
  const raw = await read(admin, 'cck_registration_requests');
  assert.ok(!raw.includes('<'), raw);
  assert.equal(JSON.parse(raw)[0].studentName, me.name);
});

test('IT-34 students cannot write shared portal data', async () => {
  const { env, people } = await makeEnv();
  const s = await loggedIn(env, people[0].student_id, people[0].civil_id);
  for (const key of ['cck_courses_v3', 'cck_credits_v3', 'cck_hod_status_v3', 'cck_nehad_timetable_approved']) {
    assert.equal((await put(s, key, { hacked: true })).status, 403, key);
  }
});

test('IT-35 per-student keys are private to each student', async () => {
  const { env, people } = await makeEnv();
  const a = await loggedIn(env, people[0].student_id, people[0].civil_id, '10.9.3.1');
  const b = await loggedIn(env, people[1].student_id, people[1].civil_id, '10.9.3.2');
  await put(a, 'cck_joined_clubs', ['Robotics']);
  assert.equal(await read(b, 'cck_joined_clubs'), undefined);
  assert.equal(await read(a, 'cck_joined_clubs'), JSON.stringify(['Robotics']));
});

test('IT-36 import accepts chunks, keeps unverified marks and text GPA, and refuses oversized chunks', async () => {
  const { env } = await makeEnv({ withData: false });
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  const students = [{ student_id: 'T1', name: 'Import One', gpa: 'Not Given', level: 'Level 1' }, { student_id: 'T2', name: 'Import Two', gpa: '' }];
  assert.equal((await admin.call('POST', '/api/admin/import', { kind: 'students', rows: students })).status, 200);
  const rows = env.DB.db.prepare('SELECT student_id, gpa FROM students ORDER BY student_id').all();
  assert.equal(rows[0].gpa, 'Not Given');
  assert.equal(rows[1].gpa, null);
  const grades = [{ student_id: 'T1', course_code: 'CSIT1100', grade: 'A', verification: 'unverified', gpa: '' }];
  await admin.call('POST', '/api/admin/import', { kind: 'historical_records', rows: grades, replace: true, grade_points: { A: 4 } });
  const g = env.DB.db.prepare('SELECT verification, grade_points, gpa FROM historical_grades').get();
  assert.deepEqual({ ...g }, { verification: 'unverified', grade_points: 4, gpa: null });
  const big = Array.from({ length: 501 }, (_, i) => ({ student_id: `X${i}`, name: 'x' }));
  assert.equal((await admin.call('POST', '/api/admin/import', { kind: 'students', rows: big })).status, 400);
  assert.equal((await admin.call('POST', '/api/admin/import', { kind: 'unknown', rows: [] })).status, 400);
});

test('IT-37 enrollment import with replace does not duplicate rows', async () => {
  const { env } = await makeEnv({ withData: false });
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  const rows = [{ student_id: 'T1', course_code: 'CSIT1100', section: '1', teaching_method: 'Lecture', time: 'MW 10:00' },
    { student_id: 'T1', course_code: 'CSIT1100', section: '1', teaching_method: 'Lab', time: 'TH 12:00' }];
  for (let i = 0; i < 2; i++) await admin.call('POST', '/api/admin/import', { kind: 'enrollments', rows, replace: true });
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM enrollments').get().n, 2);
});

test('IT-38 form posts without JSON are refused (CSRF protection)', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  const r = await admin.call('POST', '/api/admin/delete-all', 'password=x', { json: false, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 415);
});

test('IT-39 every response carries the security headers', async () => {
  const { env } = await makeEnv();
  const c = new Client(env);
  for (const p of ['/api/health', '/', '/nope-api']) {
    const r = await c.raw('GET', p);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', p);
  }
  const api = await c.raw('GET', '/api/health');
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

test('IT-40 bad input never causes a server error', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  const cases = [
    ['POST', '/api/auth/login', '{not json'], ['PUT', '/api/state/cck_x', '[]'], ['PUT', '/api/state/bad-key!', '{}'],
    ['POST', '/api/query', '{"action":"drop","table":"students"}'], ['GET', '/api/does-not-exist'],
  ];
  for (const [m, p, body] of cases) {
    const r = await admin.call(m, p, body, { json: false, headers: { 'content-type': 'application/json' } });
    assert.ok(r.status >= 400 && r.status < 500, `${m} ${p} gave ${r.status}`);
  }
});

test('IT-41 oversized state values are refused', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  assert.equal((await put(admin, 'cck_big', 'x'.repeat(1_600_000))).status, 413);
});
