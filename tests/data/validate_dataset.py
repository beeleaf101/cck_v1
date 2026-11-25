#!/usr/bin/env python3
"""Data validation for the private CCK data files before they are imported.

Usage:  python3 tests/data/validate_dataset.py <folder with students.json, enrollments.json,
        historical_grades.json> [--out tests/results/data.json]

The data itself is never stored in the repository. This script only reads it and writes
counts and pass/fail results (no names or IDs) so they can be shared in reports.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALID_GRADES = {'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F',
                '(FA)', '(W)', '(CR)', 'PASS', '(AG)', '(I)', 'NP', 'NG'}
SEM_RE = re.compile(r'^(Fall|Spring|Summer) (20\d\d)-(20\d\d)$')
ID_RE = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
CIVIL_RE = re.compile(r'^\d{12}$')
CODE_RE = re.compile(r'^[A-Z]{2,6}\d{3,4}[A-Z]?$')


def load(folder, name):
    p = Path(folder) / name
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding='utf-8'))


def run(folder):
    results = []

    def check(cid, desc, ok, detail=''):
        results.append({'id': cid, 'check': desc, 'pass': bool(ok), 'detail': detail})

    students = load(folder, 'students.json')
    enrollments = load(folder, 'enrollments.json')
    grades = load(folder, 'historical_grades.json')
    if isinstance(grades, dict):
        grades = grades.get('records', [])
    courses = json.loads((ROOT / 'public' / 'courses.json').read_text(encoding='utf-8'))
    course_codes = {c['code'] for c in courses}
    summary = {}

    if students is not None:
        ids = [s.get('student_id') for s in students]
        civ = [s.get('civil_id') for s in students if s.get('civil_id')]
        summary['students'] = len(students)
        summary['students_by_status'] = dict(Counter(s.get('status') for s in students))
        check('DV-01', 'Every student has an ID and a name', all(s.get('student_id') and s.get('name') for s in students))
        check('DV-02', 'Student IDs are unique', len(ids) == len(set(ids)), f'{len(ids) - len(set(ids))} duplicates')
        check('DV-03', 'Student IDs use only letters, digits, - and _', all(ID_RE.match(str(i)) for i in ids))
        check('DV-04', 'Civil IDs are 12 digits', all(CIVIL_RE.match(str(c)) for c in civ), f'{len(civ)} present')
        check('DV-05', 'Civil IDs are unique', len(civ) == len(set(civ)), f'{len(civ) - len(set(civ))} duplicates')
        check('DV-06', 'Status is active, graduated or inactive',
              all(s.get('status') in ('active', 'graduated', 'inactive') for s in students))
        bad_gpa = [s for s in students if isinstance(s.get('gpa'), (int, float)) and not 0 <= s['gpa'] <= 4.5]
        check('DV-07', 'Numeric GPAs are between 0 and 4.5', not bad_gpa, f'{len(bad_gpa)} out of range')
        text_gpa = Counter(s['gpa'] for s in students if isinstance(s.get('gpa'), str))
        check('DV-08', 'Text GPAs are only known labels such as "Not Given"',
              set(text_gpa) <= {'Not Given', ''}, dict(text_gpa))

    if enrollments is not None:
        known = set(s['student_id'] for s in students or [])
        summary['enrollments'] = len(enrollments)
        keyset = Counter((e['student_id'], e['course_code'], str(e.get('section')), e.get('teaching_method') or '', e.get('time') or '')
                         for e in enrollments)
        dup = sum(n - 1 for n in keyset.values() if n > 1)
        check('DV-09', 'No duplicate enrollment rows', dup == 0, f'{dup} duplicates')
        orphans = [e for e in enrollments if known and e['student_id'] not in known]
        check('DV-10', 'Every enrollment belongs to a known student', not orphans, f'{len(orphans)} orphans')
        unknown_c = sorted({e['course_code'] for e in enrollments} - course_codes)
        check('DV-11', 'Every enrolled course is in the course catalogue', not unknown_c, f'{len(unknown_c)} unknown')
        summary['enrolled_students'] = len({e['student_id'] for e in enrollments})

    if grades is not None:
        known = set(s['student_id'] for s in students or [])
        summary['grade_records'] = len(grades)
        summary['grades_by_verification'] = dict(Counter(g.get('verification') for g in grades))
        summary['terms'] = len({g.get('semester') for g in grades})
        exact = Counter((g['student_id'], g['course_code'], g.get('semester'), g.get('grade')) for g in grades)
        dup = sum(n - 1 for n in exact.values() if n > 1)
        check('DV-12', 'No duplicate grade records (same student, course, term and grade)', dup == 0, f'{dup} duplicates')
        bad = Counter(g.get('grade') for g in grades if g.get('grade') not in VALID_GRADES)
        check('DV-13', 'Every grade is a known letter or code', not bad, dict(bad))
        check('DV-14', 'Every term label reads "Fall|Spring|Summer YYYY-YYYY" with consecutive years',
              all((m := SEM_RE.match(str(g.get('semester')))) and int(m[3]) == int(m[2]) + 1 for g in grades))
        check('DV-15', 'Verification is "confirmed" or "unverified"',
              all(g.get('verification') in ('confirmed', 'unverified') for g in grades))
        unv_new = [g for g in grades if g.get('verification') == 'unverified' and int(str(g.get('semester'))[-4:]) > 2020]
        check('DV-16', 'Only the 2015-2020 pivot exports carry unverified grades', not unv_new, f'{len(unv_new)} after 2020')
        gp_bad = [g for g in grades if g.get('grade_points') is not None and not 0 <= float(g['grade_points']) <= 4.5]
        check('DV-17', 'Grade points are between 0 and 4.5', not gp_bad, f'{len(gp_bad)} out of range')
        orph = {g['student_id'] for g in grades} - known if known else set()
        check('DV-18', 'Every graded student is in the student list', not orph, f'{len(orph)} unknown students')
        codes_bad = {g['course_code'] for g in grades if not CODE_RE.match(str(g['course_code']))}
        check('DV-19', 'Course codes have the form ABC1234', not codes_bad, f'{len(codes_bad)} malformed')
        terms = sorted({g['semester'] for g in grades}, key=lambda t: (int(t[-9:-5]), ['Fall', 'Spring', 'Summer'].index(t.split()[0])))
        summary['first_term'], summary['last_term'] = terms[0], terms[-1]

    return {'summary': summary, 'checks': results,
            'passed': sum(r['pass'] for r in results), 'failed': sum(not r['pass'] for r in results)}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    out = run(sys.argv[1])
    for r in out['checks']:
        print(f"{'PASS' if r['pass'] else 'FAIL'}  {r['id']}  {r['check']}  {r['detail']}")
    print(json.dumps(out['summary'], indent=1))
    if '--out' in sys.argv:
        Path(sys.argv[sys.argv.index('--out') + 1]).write_text(json.dumps(out, indent=1))
    sys.exit(1 if out['failed'] else 0)
