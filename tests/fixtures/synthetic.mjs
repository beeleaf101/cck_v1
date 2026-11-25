// Synthetic test people and records. No real student data is ever used in the test suite.
// The generator is deterministic, so every run sees exactly the same data.

export const ADMIN = { username: 'admin', password: 'Test-Admin-Pass-01', role: 'admin' };
export const STAFF = [
  { username: 'hod', password: 'Test-Hod-Pass-01', role: 'hod' },
  { username: 'reg1', password: 'Test-Reg1-Pass-01', role: 'reg1' },
  { username: 'reg2', password: 'Test-Reg2-Pass-01', role: 'reg2' },
  { username: 'facility', password: 'Test-Fac-Pass-01', role: 'facility' },
  { username: 'nehad', password: 'Test-Nehad-Pass-01', role: 'nehad' },
];

const MAJORS = ['Computer Science', 'Information Technology', 'Business Administration', 'Engineering Technology'];
const COURSES = [
  ['CSIT1100', 'Introduction to Programming'], ['CSIT1200', 'Data Structures'], ['CSIT2300', 'Databases'],
  ['CSIT3100', 'Software Engineering'], ['MATH1100', 'Calculus I'], ['ENGL1100', 'Academic English'],
  ['BUSI1100', 'Principles of Management'], ['CSIT4290', 'Integrated Project II'],
];
const GRADES = [['A', 4], ['A-', 3.7], ['B+', 3.3], ['B', 3], ['C+', 2.3], ['C', 2], ['D', 1], ['F', 0]];

// Small seeded random generator (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStudents(n = 40) {
  const r = rng(42);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const id = `T${String(900000 + i)}`;
    const gpa = Math.round(r() * 400) / 100;
    out.push({
      student_id: id,
      name: `Test Student ${String(i).padStart(3, '0')}`,
      civil_id: String(300000000000 + i * 7919),
      email: `${id.toLowerCase()}@example.test`,
      major: MAJORS[i % MAJORS.length],
      level: `Level ${1 + (i % 4)}`,
      gpa, cgpa: gpa,
      status: i % 10 === 0 ? 'graduated' : 'active',
      gender: i % 2 ? 'M' : 'F',
    });
  }
  return out;
}

export function makeEnrollments(students) {
  const out = [];
  students.filter((s) => s.status === 'active').forEach((s, i) => {
    for (let k = 0; k < 3; k++) {
      const [code, name] = COURSES[(i + k) % COURSES.length];
      out.push({
        student_id: s.student_id, student_name: s.name, course_code: code, course_name: name,
        section: String(1 + (i % 2)), time: k % 2 ? 'MW 10:00-11:15' : 'SU-TU 12:00-13:15',
        teaching_method: 'Lecture', instructor: `Instructor ${1 + ((i + k) % 5)}`,
      });
    }
  });
  return out;
}

export function makeGrades(students) {
  const r = rng(7);
  const out = [];
  students.forEach((s, i) => {
    for (let k = 0; k < 4; k++) {
      const [code, name] = COURSES[(i + k + 2) % COURSES.length];
      const [grade, points] = GRADES[Math.floor(r() * GRADES.length)];
      out.push({
        semester: k < 2 ? 'Fall 2024' : 'Spring 2025', student_id: s.student_id, student_name: s.name,
        course_code: code, course_name: name, grade, grade_points: points,
        verification: k === 3 && i % 5 === 0 ? 'unverified' : 'confirmed',
      });
    }
  });
  return out;
}
