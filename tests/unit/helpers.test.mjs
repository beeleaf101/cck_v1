// Unit tests: the Worker's pure helper functions, with no database involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, timingSafeEqual, cleanStudent, cleanRegistrationRequest,
  filterForStudent, plainText, toNumberOrNull, storageKeyFor, canRead,
} from '../../src/worker.js';

test('UT-01 password hash uses PBKDF2 with a label that matches its rounds', async () => {
  const h = await hashPassword('correct horse battery');
  const [scheme, rounds, salt, hash] = h.split('$');
  assert.equal(scheme, 'pbkdf2');
  assert.equal(rounds, '20000');
  assert.ok(salt.length >= 20 && hash.length >= 40);
});

test('UT-02 the same password hashes differently each time (random salt)', async () => {
  assert.notEqual(await hashPassword('same-password-1'), await hashPassword('same-password-1'));
});

test('UT-03 verifyPassword accepts the right password and refuses a wrong one', async () => {
  const h = await hashPassword('Right-Password-9');
  assert.equal(await verifyPassword('Right-Password-9', h), true);
  assert.equal(await verifyPassword('right-password-9', h), false);
  assert.equal(await verifyPassword('', h), false);
});

test('UT-04 verifyPassword refuses malformed or empty stored hashes', async () => {
  for (const bad of ['', null, 'plain-text', 'md5$abc', 'pbkdf2$$$']) {
    assert.equal(await verifyPassword('x', bad), false);
  }
});

test('UT-05 timingSafeEqual compares exactly', () => {
  assert.equal(timingSafeEqual('300000007919', '300000007919'), true);
  assert.equal(timingSafeEqual('300000007919', '300000007918'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
});

test('UT-06 cleanStudent keeps text GPA values such as "Not Given"', () => {
  const s = cleanStudent({ student_id: 'T1', name: 'A', gpa: 'Not Given', cgpa: '3.25' }, { partial: false });
  assert.equal(s.gpa, 'Not Given');
  assert.equal(s.cgpa, 3.25);
});

test('UT-07 cleanStudent rejects a numeric GPA outside 0 to 4.5', () => {
  assert.throws(() => cleanStudent({ student_id: 'T1', name: 'A', gpa: 5.2 }, { partial: false }), /GPA/);
  assert.throws(() => cleanStudent({ student_id: 'T1', name: 'A', gpa: -1 }, { partial: false }), /GPA/);
});

test('UT-08 cleanStudent keeps level as text', () => {
  assert.equal(cleanStudent({ student_id: 'T1', name: 'A', level: 'Level 2 (Diploma)' }, { partial: false }).level, 'Level 2 (Diploma)');
});

test('UT-09 cleanStudent requires ID and name on create but not on update', () => {
  assert.throws(() => cleanStudent({ name: 'A' }, { partial: false }), /Student ID/);
  assert.throws(() => cleanStudent({ student_id: 'T1' }, { partial: false }), /Name/);
  assert.deepEqual(cleanStudent({ major: 'IT' }, { partial: true }), { major: 'IT' });
});

test('UT-10 cleanStudent checks the Civil ID is 12 digits', () => {
  assert.throws(() => cleanStudent({ student_id: 'T1', name: 'A', civil_id: '12345' }, { partial: false }), /Civil ID/);
  assert.equal(cleanStudent({ student_id: 'T1', name: 'A', civil_id: '300000007919' }, { partial: false }).civil_id, '300000007919');
});

test('UT-11 cleanStudent refuses IDs the edit and delete routes could not reach', () => {
  for (const id of ['T 1', 'T/1', '<b>', 'T1;DROP']) {
    assert.throws(() => cleanStudent({ student_id: id, name: 'A' }, { partial: false }), /Student ID/);
  }
});

test('UT-12 cleanStudent strips angle brackets from text fields', () => {
  assert.equal(cleanStudent({ student_id: 'T1', name: '<img src=x onerror=alert(1)>Ali' }, { partial: false }).name,
    'img src=x onerror=alert(1)Ali');
});

test('UT-13 cleanStudent drops unknown fields', () => {
  const s = cleanStudent({ student_id: 'T1', name: 'A', role: 'admin', password_hash: 'x' }, { partial: false });
  assert.deepEqual(Object.keys(s).sort(), ['name', 'student_id']);
});

test('UT-14 toNumberOrNull keeps blanks as null instead of 0', () => {
  assert.equal(toNumberOrNull(''), null);
  assert.equal(toNumberOrNull(null), null);
  assert.equal(toNumberOrNull('abc'), null);
  assert.equal(toNumberOrNull('0'), 0);
  assert.equal(toNumberOrNull('3.7'), 3.7);
});

test('UT-15 plainText removes markup and control characters and limits length', () => {
  assert.equal(plainText('<script>x</script>'), 'scriptx/script');
  assert.equal(plainText('a\u0000b\nc'), 'a b c');
  assert.equal(plainText('x'.repeat(500), 10).length, 10);
});

const student = { student_id: 'T900001', name: 'Test Student 001', email: 't@example.test', major: 'IT', level: 'Level 1', gpa: 3 };

test('UT-16 cleanRegistrationRequest takes identity from the database, not the browser', () => {
  const r = cleanRegistrationRequest({ id: 1, studentId: 'T900001', studentName: 'Someone Else', gpa: 4, courses: [{ code: 'CSIT1100', name: 'Prog', credits: 3 }] }, student);
  assert.equal(r.studentName, 'Test Student 001');
  assert.equal(r.gpa, 3);
  assert.equal(r.status, 'pending');
});

test('UT-17 cleanRegistrationRequest strips script from course names and notes', () => {
  const r = cleanRegistrationRequest({
    id: 2, courses: [{ code: 'CSIT1100', name: '<img src=x onerror=alert(1)>', credits: 3 }],
    validation: [{ courseCode: 'CSIT1100', eligible: true, issues: [], warnings: ['<b>w</b>'] }],
  }, student);
  assert.ok(!r.courses[0].name.includes('<'));
  assert.ok(!r.validation[0].warnings[0].includes('<'));
});

test('UT-18 cleanRegistrationRequest refuses bad course codes and empty lists', () => {
  assert.throws(() => cleanRegistrationRequest({ courses: [{ code: 'DROP TABLE' }] }, student), /course code/);
  assert.throws(() => cleanRegistrationRequest({ courses: [] }, student), /at least one/);
});

test('UT-19 cleanRegistrationRequest recomputes hasIssues from the validation list', () => {
  const r = cleanRegistrationRequest({
    courses: [{ code: 'CSIT2300', credits: 3 }], hasIssues: false,
    validation: [{ courseCode: 'CSIT2300', eligible: false, issues: ['Prerequisite not completed: CSIT1200'], warnings: [] }],
  }, student);
  assert.equal(r.hasIssues, true);
});

test('UT-20 filterForStudent returns only the student\'s own requests', () => {
  const all = JSON.stringify([{ id: 1, studentId: 'A' }, { id: 2, studentId: 'B' }, { id: 3, studentId: 'A' }]);
  assert.deepEqual(JSON.parse(filterForStudent('cck_registration_requests', all, 'A')).map((r) => r.id), [1, 3]);
  assert.equal(filterForStudent('cck_courses_v3', '{"x":1}', 'A'), '{"x":1}');
});

test('UT-21 per-user keys are stored under the user, shared keys are not', () => {
  assert.equal(storageKeyFor({ user_id: 'T1' }, 'cck_joined_clubs'), 'u:T1:cck_joined_clubs');
  assert.equal(storageKeyFor({ user_id: 'T1' }, 'cck_courses_v3'), 'cck_courses_v3');
});

test('UT-22 students can read only the allow-listed keys', () => {
  assert.equal(canRead({ role: 'student' }, 'cck_courses_v3'), true);
  assert.equal(canRead({ role: 'student' }, 'cck_hod_status_v3'), false);
  assert.equal(canRead({ role: 'hod' }, 'cck_hod_status_v3'), true);
});

test('UT-23 every named export of the Worker is a function (Cloudflare refuses other exports)', async () => {
  const mod = await import('../../src/worker.js');
  for (const [name, value] of Object.entries(mod)) {
    if (name === 'default') continue;
    assert.equal(typeof value, 'function', `${name} must be a function`);
  }
});
