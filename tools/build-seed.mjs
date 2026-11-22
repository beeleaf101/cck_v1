#!/usr/bin/env node
// Builds SQL files to load data into the D1 database.
//
//   node tools/build-seed.mjs --data <folder with the JSON files> --out <output folder> [--admin-password <pw>]
//
// Writes:
//   <out>/seed-public.sql   courses + instructors (from public/)
//   <out>/seed-private.sql  students, enrollments, historical grades, admin login
//
// seed-private.sql contains personal data: never commit it. The default output
// folder ./private/ is in .gitignore.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const dataDir = resolve(args.data || join(root, 'private'));
const outDir = resolve(args.out || join(root, 'private'));
const semesterKey = args.semester || 'spring2026';
mkdirSync(outDir, { recursive: true });

const q = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'object') v = JSON.stringify(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const load = (dir, f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

// Multi-row INSERTs, kept small so each statement stays well under D1's size limit.
function inserts(table, cols, rows, verb = 'INSERT', chunk = 50) {
  const out = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows.slice(i, i + chunk).map((r) => `(${cols.map((c) => q(r[c])).join(', ')})`).join(',\n  ');
    out.push(`${verb} INTO ${table} (${cols.join(', ')}) VALUES\n  ${values};`);
  }
  return out.join('\n');
}

const semesterIdSql = `(SELECT id FROM semesters WHERE semester_key = '${semesterKey}')`;

// ---------- public: courses + instructors
const courses = load(join(root, 'public'), 'courses.json');
const instructors = load(join(root, 'public'), 'instructors.json');
const pub = [
  '-- Courses and instructors (public data)',
  'DELETE FROM courses;',
  inserts('courses', ['code', 'name', 'credits', 'sections'], courses.map((c) => ({ ...c, credits: Number(c.credits) || 3 }))),
  'DELETE FROM instructors;',
  inserts('instructors', ['instructor_id', 'name', 'title', 'email', 'department', 'courses'],
    instructors.map((i) => ({ ...i, instructor_id: i.id }))),
].join('\n\n');
writeFileSync(join(outDir, 'seed-public.sql'), pub + '\n');

// ---------- private: students, enrollments, grades, admin
const need = ['students.json', 'enrollments.json', 'historical_grades.json'];
const missing = need.filter((f) => !existsSync(join(dataDir, f)));
if (missing.length) {
  console.log(`Wrote ${join(outDir, 'seed-public.sql')}`);
  console.log(`Skipped seed-private.sql: missing ${missing.join(', ')} in ${dataDir}`);
  process.exit(0);
}

const students = load(dataDir, 'students.json');
const enrollments = load(dataDir, 'enrollments.json');
const hist = load(dataDir, 'historical_grades.json');
const gp = hist.grade_points || {};

const studentCols = ['student_id', 'name', 'name_ar', 'civil_id', 'email', 'phone', 'gender', 'nationality', 'major',
  'level', 'gpa', 'cgpa', 'enrolled_credits', 'student_type', 'language', 'degree_class', 'admit_term', 'status'];
const enrollCols = ['semester_id', 'student_id', 'student_name', 'course_code', 'course_name', 'section', 'time',
  'teaching_method', 'instructor', 'status'];
const gradeCols = ['semester_label', 'student_id', 'student_name', 'course_code', 'course_name', 'grade',
  'grade_points', 'credit_hours', 'gpa', 'cgpa'];

const priv = ['-- PRIVATE: personal data. Do not commit or share this file.'];
priv.push('DELETE FROM enrollments;', 'DELETE FROM historical_grades;', 'DELETE FROM students;', 'DELETE FROM sessions;');
priv.push(inserts('students', studentCols, students.map((s) => ({ ...s, status: s.status || 'active' }))));

// semester_id comes from a sub-select, so build these rows by hand
for (let i = 0; i < enrollments.length; i += 50) {
  const values = enrollments.slice(i, i + 50).map((e) => `(${[
    semesterIdSql, ...enrollCols.slice(1).map((c) => q(e[c] ?? (c === 'time' || c === 'teaching_method' ? '' : null))),
  ].join(', ')})`).join(',\n  ');
  priv.push(`INSERT OR IGNORE INTO enrollments (${enrollCols.join(', ')}) VALUES\n  ${values};`);
}

priv.push(inserts('historical_grades', gradeCols, hist.records.map((r) => ({
  ...r, semester_label: r.semester, grade_points: gp[r.grade] ?? null,
}))));

const settings = [
  ['historical_course_stats', hist.course_stats || {}, 'Per-course grade statistics (aggregate, no names)'],
  ['historical_grade_points', gp, 'Grade to grade-point mapping'],
  ['historical_summary', hist.summary || {}, 'Historical grades summary'],
];
for (const [k, v, d] of settings) {
  priv.push(`INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (${q(k)}, ${q(JSON.stringify(v))}, ${q(d)});`);
}

let adminNote = '';
if (args['admin-password']) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(args['admin-password'], salt, 20000, 32, 'sha256');
  const stored = `pbkdf2$20000$${salt.toString('base64')}$${hash.toString('base64')}`;
  priv.push(`INSERT OR REPLACE INTO admin_users (username, password_hash) VALUES ('admin', ${q(stored)});`);
  adminNote = ' + admin login';
}

writeFileSync(join(outDir, 'seed-private.sql'), priv.join('\n\n') + '\n');
console.log(`Wrote ${join(outDir, 'seed-public.sql')} (${courses.length} courses, ${instructors.length} instructors)`);
console.log(`Wrote ${join(outDir, 'seed-private.sql')} (${students.length} students, ${enrollments.length} enrollments, ${hist.records.length} grade records${adminNote})`);
