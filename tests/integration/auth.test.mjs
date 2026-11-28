// Integration tests: login, sessions, lockout and passwords, run through the real Worker
// with an in-memory database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, Client, loggedIn } from '../helpers/harness.mjs';
import { ADMIN, STAFF } from '../fixtures/synthetic.mjs';

test('IT-01 admin logs in and gets an HttpOnly, SameSite=Strict session cookie', async () => {
  const { env } = await makeEnv();
  const c = new Client(env);
  const r = await c.raw('POST', '/api/auth/login', { body: { id: ADMIN.username, password: ADMIN.password } });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /cck_session=[0-9a-f]{64}/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Secure/i);
  assert.equal((await r.json()).role, 'admin');
});

test('IT-02 every staff account logs in and is sent to its own portal', async () => {
  const { env } = await makeEnv();
  const pages = { hod: '/hod.html', reg1: '/registration1.html', reg2: '/registration2.html', facility: '/facility.html', nehad: '/nehad.html' };
  for (const u of STAFF) {
    const r = await new Client(env).login(u.username, u.password);
    assert.equal(r.status, 200, u.username);
    assert.equal(r.data.role, u.role);
    assert.equal(r.data.redirect, pages[u.role]);
  }
});

test('IT-03 a student logs in with Student ID and Civil ID and sees only themself', async () => {
  const { env, people } = await makeEnv();
  const p = people[3];
  const c = await loggedIn(env, p.student_id, p.civil_id);
  const me = await c.call('GET', '/api/auth/me');
  assert.equal(me.data.role, 'student');
  assert.equal(me.data.user.student_id, p.student_id);
});

test('IT-04 wrong password and unknown user give the same message', async () => {
  const { env, people } = await makeEnv();
  const a = await new Client(env).login(ADMIN.username, 'wrong-password');
  const b = await new Client(env, '10.0.0.2').login('nobody-here', 'whatever');
  const c = await new Client(env, '10.0.0.3').login(people[0].student_id, '000000000000');
  for (const r of [a, b, c]) {
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'Invalid ID or password');
  }
});

test('IT-05 empty login fields are refused', async () => {
  const { env } = await makeEnv();
  assert.equal((await new Client(env).login('', '')).status, 400);
});

test('IT-06 five wrong passwords lock that account from that address for 15 minutes', async () => {
  const { env } = await makeEnv();
  const c = new Client(env, '10.1.1.1');
  for (let i = 0; i < 5; i++) assert.equal((await c.login('admin', 'bad-' + i)).status, 401);
  const locked = await c.login('admin', ADMIN.password);
  assert.equal(locked.status, 429);
});

test('IT-07 one locked account does not lock other people on the same campus address', async () => {
  const { env, people } = await makeEnv();
  const ip = '10.2.2.2';
  for (let i = 0; i < 5; i++) await new Client(env, ip).login(people[0].student_id, 'bad');
  assert.equal((await new Client(env, ip).login(people[0].student_id, people[0].civil_id)).status, 429);
  // a classmate behind the same IP can still log in
  assert.equal((await new Client(env, ip).login(people[1].student_id, people[1].civil_id)).status, 200);
});

test('IT-08 fifty failures from one address block that address (password spraying)', async () => {
  const { env, people } = await makeEnv();
  const ip = '10.3.3.3';
  for (let i = 0; i < 50; i++) await new Client(env, ip).login(`guess-${i}`, 'bad');
  assert.equal((await new Client(env, ip).login(people[2].student_id, people[2].civil_id)).status, 429);
  assert.equal((await new Client(env, '10.3.3.4').login(people[2].student_id, people[2].civil_id)).status, 200);
});

test('IT-09 logout ends the session on the server', async () => {
  const { env } = await makeEnv();
  const c = await loggedIn(env, ADMIN.username, ADMIN.password);
  const saved = c.cookie;
  await c.call('POST', '/api/auth/logout', {});
  c.cookie = saved; // replaying the old cookie must not work
  assert.equal((await c.call('GET', '/api/data')).status, 401);
});

test('IT-10 an expired session is refused and removed', async () => {
  const { env } = await makeEnv();
  const c = await loggedIn(env, ADMIN.username, ADMIN.password);
  env.DB.db.prepare('UPDATE sessions SET expires_at = 1').run();
  assert.equal((await c.call('GET', '/api/data')).status, 401);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

test('IT-11 forged or malformed cookies are ignored', async () => {
  const { env } = await makeEnv();
  const c = new Client(env);
  for (const v of ['abc', 'f'.repeat(64), "' OR 1=1 --"]) {
    c.cookie = `cck_session=${v}`;
    assert.equal((await c.call('GET', '/api/data')).status, 401);
  }
});

test('IT-12 admin changes own password; old one stops working', async () => {
  const { env } = await makeEnv();
  const c = await loggedIn(env, ADMIN.username, ADMIN.password);
  assert.equal((await c.call('POST', '/api/auth/password', { current_password: 'nope', new_password: 'Another-Pass-123' })).status, 403);
  assert.equal((await c.call('POST', '/api/auth/password', { current_password: ADMIN.password, new_password: 'short' })).status, 400);
  assert.equal((await c.call('POST', '/api/auth/password', { current_password: ADMIN.password, new_password: 'Another-Pass-123' })).status, 200);
  assert.equal((await new Client(env, '10.9.9.9').login('admin', ADMIN.password)).status, 401);
  assert.equal((await new Client(env, '10.9.9.8').login('admin', 'Another-Pass-123')).status, 200);
});

test('IT-13 admin sets a staff password, which signs that user out', async () => {
  const { env } = await makeEnv();
  const hod = await loggedIn(env, 'hod', STAFF[0].password, '10.4.0.1');
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  const r = await admin.call('POST', '/api/admin/staff-password', { username: 'hod', new_password: 'Fresh-Hod-Pass-1' });
  assert.equal(r.status, 200);
  assert.equal((await hod.call('GET', '/api/state')).data.role, null);
  assert.equal((await new Client(env, '10.4.0.2').login('hod', 'Fresh-Hod-Pass-1')).status, 200);
});

test('IT-14 the staff-password route cannot change the admin account or be used by staff', async () => {
  const { env } = await makeEnv();
  const admin = await loggedIn(env, ADMIN.username, ADMIN.password);
  assert.equal((await admin.call('POST', '/api/admin/staff-password', { username: 'admin', new_password: 'Takeover-Pass-1' })).status, 404);
  const reg1 = await loggedIn(env, 'reg1', STAFF[1].password, '10.4.0.3');
  assert.equal((await reg1.call('POST', '/api/admin/staff-password', { username: 'hod', new_password: 'Takeover-Pass-1' })).status, 403);
});

test('IT-15 students cannot use the change-password route', async () => {
  const { env, people } = await makeEnv();
  const s = await loggedIn(env, people[0].student_id, people[0].civil_id);
  assert.equal((await s.call('POST', '/api/auth/password', { current_password: 'x', new_password: 'Something-Long-1' })).status, 403);
});

test('IT-42 login also sets a readable "signed in" flag that holds no secret, and logout clears it', async () => {
  const { env } = await makeEnv();
  const c = new Client(env);
  const r = await c.raw('POST', '/api/auth/login', { body: { id: ADMIN.username, password: ADMIN.password } });
  const cookies = r.headers.getSetCookie();
  const hint = cookies.find((x) => x.startsWith('cck_signed_in='));
  assert.ok(hint, 'hint cookie set');
  assert.match(hint, /^cck_signed_in=1;/);
  assert.doesNotMatch(hint, /HttpOnly/i);
  assert.ok(cookies.find((x) => x.startsWith('cck_session=')).includes('HttpOnly'));
  const out = await c.raw('POST', '/api/auth/logout', { body: {} });
  assert.ok(out.headers.getSetCookie().some((x) => /^cck_signed_in=;.*Max-Age=0/.test(x)));
});
