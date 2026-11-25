// Integration tests: who can see and change what (roles, page guards, privacy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, Client, loggedIn } from '../helpers/harness.mjs';
import { ADMIN, STAFF } from '../fixtures/synthetic.mjs';

const pw = Object.fromEntries(STAFF.map((s) => [s.username, s.password]));

test('IT-16 private API routes refuse visitors who are not logged in', async () => {
  const { env } = await makeEnv();
  const c = new Client(env);
  for (const [m, p, b] of [['GET', '/api/data'], ['GET', '/api/historical-grades'], ['POST', '/api/students', {}],
    ['PUT', '/api/students/T900001', {}], ['DELETE', '/api/students/T900001'], ['POST', '/api/query', {}],
    ['POST', '/api/admin/import', {}], ['POST', '/api/admin/delete-all', {}], ['PUT', '/api/state/cck_courses_v3', { value: '1' }]]) {
    assert.equal((await c.call(m, p, b)).status, 401, `${m} ${p}`);
  }
});

test('IT-17 a student sees their own record and anonymised classmates only', async () => {
  const { env, people } = await makeEnv();
  const me = people[1];
  const s = await loggedIn(env, me.student_id, me.civil_id);
  const d = (await s.call('GET', '/api/data')).data;
  assert.equal(d.students.length, 1);
  assert.equal(d.students[0].student_id, me.student_id);
  const others = d.enrollments.filter((e) => e.student_id !== me.student_id);
  assert.ok(others.length > 0);
  for (const e of others) {
    assert.match(e.student_id, /^anon-\d+$/);
    assert.equal(e.student_name, null);
  }
});

test('IT-18 a student gets only their own grade history', async () => {
  const { env, people } = await makeEnv();
  const s = await loggedIn(env, people[5].student_id, people[5].civil_id);
  const g = (await s.call('GET', '/api/historical-grades')).data;
  assert.ok(g.records.length > 0);
  assert.ok(g.records.every((r) => r.student_id === people[5].student_id));
  assert.deepEqual(Object.keys(g.student_stats), [people[5].student_id]);
});

test('IT-19 staff portals cannot read the student list or grades', async () => {
  const { env } = await makeEnv();
  for (const u of STAFF) {
    const c = await loggedIn(env, u.username, u.password, `10.5.0.${u.username.length}`);
    assert.equal((await c.call('GET', '/api/data')).status, 403, u.username);
    assert.equal((await c.call('GET', '/api/historical-grades')).status, 403, u.username);
    assert.equal((await c.call('POST', '/api/query', { action: 'select', table: 'students' })).status, 403, u.username);
  }
});

test('IT-20 only the admin can add, edit and delete students', async () => {
  const { env, people } = await makeEnv();
  const s = await loggedIn(env, people[0].student_id, people[0].civil_id);
  assert.equal((await s.call('PUT', `/api/students/${people[0].student_id}`, { gpa: 4 })).status, 403);
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password, '10.6.0.1');
  const created = await admin.call('POST', '/api/students', { student_id: 'T999999', name: 'New Test Student', civil_id: '399999999999' });
  assert.equal(created.status, 201);
  assert.equal((await admin.call('POST', '/api/students', { student_id: 'T999999', name: 'Dup' })).status, 409);
  const upd = await admin.call('PUT', '/api/students/T999999', { major: 'Information Technology', level: 'Level 2' });
  assert.equal(upd.data.student.level, 'Level 2');
  assert.equal((await admin.call('DELETE', '/api/students/T999999')).status, 200);
  assert.equal((await admin.call('DELETE', '/api/students/T999999')).status, 404);
});

const PAGES = {
  '/admin.html': ['admin'], '/hod.html': ['admin', 'hod'], '/registration1.html': ['admin', 'reg1'],
  '/registration2.html': ['admin', 'reg2'], '/facility.html': ['admin', 'facility'], '/nehad.html': ['admin', 'nehad'],
};

test('IT-21 each portal page opens only for its own role and the admin', async () => {
  const { env, people } = await makeEnv();
  const clients = {
    admin: await loggedIn(env, ADMIN.username, ADMIN.password, '10.7.0.1'),
    student: await loggedIn(env, people[0].student_id, people[0].civil_id, '10.7.0.2'),
    anon: new Client(env, '10.7.0.3'),
  };
  for (const u of STAFF) clients[u.role] = await loggedIn(env, u.username, pw[u.username], `10.7.1.${u.role.length}`);
  for (const [page, allowed] of Object.entries(PAGES)) {
    for (const [who, c] of Object.entries(clients)) {
      const r = await c.raw('GET', page);
      if (allowed.includes(who)) assert.equal(r.status, 200, `${who} ${page}`);
      else {
        assert.equal(r.status, 302, `${who} should be refused ${page}`);
        assert.match(r.headers.get('location'), /\/\?login=required/);
      }
    }
  }
});

test('IT-22 page guards also cover the short paths Cloudflare serves (/hod, /HOD.html, /hod/)', async () => {
  const { env } = await makeEnv();
  const c = new Client(env);
  for (const p of ['/hod', '/HOD.html', '/hod/', '/Registration1', '/admin', '/hod_main.js', '/%68od.html']) {
    assert.equal((await c.raw('GET', p)).status, 302, p);
  }
});

test('IT-23 public pages and the login page stay open', async () => {
  const { env } = await makeEnv();
  const c = new Client(env);
  for (const p of ['/', '/index.html', '/student_hub.html', '/courses.json']) {
    assert.equal((await c.raw('GET', p)).status, 200, p);
  }
});

test('IT-24 protected pages are not cached by the browser', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  assert.equal((await admin.raw('GET', '/admin.html')).headers.get('cache-control'), 'no-store');
});

test('IT-25 the admin query endpoint refuses login tables and unknown columns', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  for (const t of ['admin_users', 'sessions', 'login_attempts', 'shared_state', 'sqlite_master']) {
    assert.equal((await admin.call('POST', '/api/query', { action: 'select', table: t })).status, 400, t);
  }
  const bad = await admin.call('POST', '/api/query', { action: 'select', table: 'students', columns: ['name; DROP TABLE students'] });
  assert.equal(bad.status, 400);
  const ok = await admin.call('POST', '/api/query', { action: 'select', table: 'students', columns: ['student_id'], limit: 3 });
  assert.equal(ok.data.data.length, 3);
});

test('IT-26 delete-all needs the admin password, checked on the server', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  assert.equal((await admin.call('POST', '/api/admin/delete-all', { password: '2005' })).status, 403);
  assert.ok(env.DB.db.prepare('SELECT COUNT(*) n FROM students').get().n > 0);
  assert.equal((await admin.call('POST', '/api/admin/delete-all', { password: ADMIN.password })).status, 200);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM students').get().n, 0);
});
