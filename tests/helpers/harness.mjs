// Builds a Worker environment with an in-memory database and synthetic people,
// and a tiny client that keeps its own session cookie like a browser would.
import worker, { hashPassword } from '../../src/worker.js';
import { D1Shim } from './d1-shim.mjs';
import { STAFF, ADMIN, makeStudents, makeEnrollments, makeGrades } from '../fixtures/synthetic.mjs';

export const BASE = 'https://cck-sis.test';

// Static files are not under test here; the assets binding answers with a marker page
const ASSETS = {
  async fetch(request) {
    const p = new URL(request.url).pathname;
    return new Response(`<!doctype html><title>asset ${p}</title>`, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0' },
    });
  },
};

let cachedHashes = null;
async function hashes() {
  // Hashing is slow on purpose (PBKDF2), so do it once for all tests
  if (!cachedHashes) {
    cachedHashes = {};
    for (const u of [ADMIN, ...STAFF]) cachedHashes[u.username] = await hashPassword(u.password);
  }
  return cachedHashes;
}

export async function makeEnv({ students = 40, withData = true } = {}) {
  const DB = new D1Shim();
  const h = await hashes();
  for (const u of [ADMIN, ...STAFF]) {
    DB.db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(u.username, h[u.username], u.role);
  }
  const people = makeStudents(students);
  if (withData) {
    const ins = DB.db.prepare(`INSERT INTO students (student_id, name, civil_id, email, major, level, gpa, cgpa, status, gender)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const s of people) ins.run(s.student_id, s.name, s.civil_id, s.email, s.major, s.level, s.gpa, s.cgpa, s.status, s.gender);
    const sem = DB.db.prepare("SELECT id FROM semesters WHERE semester_key = 'spring2026'").get();
    const insE = DB.db.prepare(`INSERT INTO enrollments (semester_id, student_id, student_name, course_code, course_name, section, time, teaching_method, instructor, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const e of makeEnrollments(people)) insE.run(sem.id, e.student_id, e.student_name, e.course_code, e.course_name, e.section, e.time, e.teaching_method, e.instructor, 'enrolled');
    const insG = DB.db.prepare(`INSERT INTO historical_grades (semester_label, student_id, student_name, course_code, course_name, grade, grade_points, credit_hours, verification)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const g of makeGrades(people)) insG.run(g.semester, g.student_id, g.student_name, g.course_code, g.course_name, g.grade, g.grade_points, 3, g.verification);
  }
  return { env: { DB, ASSETS }, people };
}

export class Client {
  constructor(env, ip = '10.0.0.1') {
    this.env = env;
    this.ip = ip;
    this.cookie = null;
  }
  async raw(method, path, { body, headers = {}, json = true } = {}) {
    const h = { 'cf-connecting-ip': this.ip, ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload;
    if (body !== undefined) {
      payload = json ? JSON.stringify(body) : body;
      if (json && !h['content-type']) h['content-type'] = 'application/json';
    }
    const res = await worker.fetch(new Request(BASE + path, { method, headers: h, body: payload, redirect: 'manual' }), this.env);
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = set.match(/cck_session=([^;]*)/);
      this.cookie = m && m[1] ? `cck_session=${m[1]}` : null;
    }
    return res;
  }
  async call(method, path, body, opts = {}) {
    const res = await this.raw(method, path, { body, ...opts });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  login(id, password) {
    return this.call('POST', '/api/auth/login', { id, password });
  }
}

export async function loggedIn(env, id, password, ip) {
  const c = new Client(env, ip);
  const r = await c.login(id, password);
  if (r.status !== 200) throw new Error(`login failed for ${id}: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}
