// Writes tests/results/test-seed.sql: staff accounts and synthetic students for the
// browser (end-to-end) tests, which run against `wrangler dev` with its own local database.
import { writeFileSync, mkdirSync } from 'node:fs';
import { hashPassword } from '../../src/worker.js';
import { ADMIN, STAFF, makeStudents, makeEnrollments, makeGrades } from './synthetic.mjs';

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const out = [];
for (const u of [ADMIN, ...STAFF]) {
  out.push(`INSERT OR REPLACE INTO admin_users (username, password_hash, role) VALUES (${q(u.username)}, ${q(await hashPassword(u.password))}, ${q(u.role)});`);
}
const people = makeStudents(60);
for (const s of people) {
  out.push(`INSERT OR REPLACE INTO students (student_id, name, civil_id, email, major, level, gpa, cgpa, status, gender) VALUES (${[s.student_id, s.name, s.civil_id, s.email, s.major, s.level, s.gpa, s.cgpa, s.status, s.gender].map(q).join(', ')});`);
}
out.push("DELETE FROM enrollments;");
for (const e of makeEnrollments(people)) {
  out.push(`INSERT INTO enrollments (semester_id, student_id, student_name, course_code, course_name, section, time, teaching_method, instructor, status) SELECT id, ${[e.student_id, e.student_name, e.course_code, e.course_name, e.section, e.time, e.teaching_method, e.instructor, 'enrolled'].map(q).join(', ')} FROM semesters WHERE semester_key = 'spring2026';`);
}
out.push("DELETE FROM historical_grades;");
for (const g of makeGrades(people)) {
  out.push(`INSERT INTO historical_grades (semester_label, student_id, student_name, course_code, course_name, grade, grade_points, credit_hours, verification) VALUES (${[g.semester, g.student_id, g.student_name, g.course_code, g.course_name, g.grade, g.grade_points, 3, g.verification].map(q).join(', ')});`);
}
out.push("DELETE FROM shared_state; DELETE FROM sessions; DELETE FROM login_attempts;");
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../results/test-seed.sql', import.meta.url), out.join('\n') + '\n');
console.log(`wrote ${out.length} statements`);
