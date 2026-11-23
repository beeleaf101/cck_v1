#!/usr/bin/env python3
"""
Build the complete CCK dataset (students + grade history 2015-2024) from all exports.

    python3 -I tools/build_full_dataset.py <data_dir> <out_dir>

<data_dir> must contain the original exports (semester .xls files, student lists, ...);
see SOURCES below. Writes <out_dir>/students.json and <out_dir>/historical_grades.json
in the shapes the site's "Import data files" button expects. Output has personal data.

Grade history:
  * 2021-2024: the long-format semester exports (one row per student+course). Clean.
  * 2015-2020: the pivot exports (one row per student, a column per course). The college
    system filled every empty cell with a copy of a neighbouring student's grade, so:
      - 'confirmed'  : the grade differs from the row above, so it cannot be a copy.
      - 'unverified' : likely real but not provable: (a) the student right after a
        confirmed grade, same major and intake year, same grade (two classmates really
        getting the same grade looks exactly like a copy); (b) students with no
        confirmed grade that semester: courses at least half of their classmates
        (same major + intake year) have confirmed grades in.
      Everything else is treated as a copy and dropped.
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from read_pivot_xls import read, read_long  # noqa: E402

DATA, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
P = lambda name: os.path.join(DATA, name)

PIVOT = ['spring 2015-2016.xls', 'Fall 2016-2017.xls', 'spring 2016-2017.xls', 'summer 2016-2017.xls',
         'Fall 2017-2018.xls', 'Spring 2017-2018.xls', 'summer 2017-2018.xls', 'Fall 2018-2019.xls',
         'Spring 2018-2019.xls', 'Summer 2018-2019.xls', 'Fall 2019-2020.xls', 'Spring 2019-2020.xls',
         'Summer 2019-2020.xls']
LONG = ['Fall 2021-2022.xls', 'Spring 2021-2022.xls', 'Summer 2021-2022.xls', 'Fall 2022-2023.xls',
        'Spring 2022-2023.xls', 'Summer 2022-2023.xls', 'Fall 2023-2024.xls', 'Spring 2023-2024.xls',
        'Summer 2023-2024.xls']
TERM = {'Fall': 0, 'Spring': 1, 'Summer': 2}
GRADE_POINTS = {'A+': 4.0, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7,
                'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0.0, '(FA)': 0.0, '(W)': None, '(CR)': None, 'NP': None,
                'NG': None, 'PASS': None}
FAIL = {'F', '(FA)'}
NOT_PASSED = {'F', '(FA)', '(W)', 'NP', 'NG'}


def semkey(s):
    t, y = s.split()
    return (int(y[:4]), TERM[t])


def find(name):
    """Data files may carry a numeric prefix (01_...) from extraction."""
    for f in os.listdir(DATA):
        if f == name or re.fullmatch(r'\d+_' + re.escape(name), f):
            return P(f)
    raise FileNotFoundError(name)


def base_code(code):
    return re.sub(r'[a-z]\.?$|\.$', '', code.strip())


def clean(v):
    v = '' if v is None else str(v).strip()
    return '' if v.lower() in ('', 'none', 'null', 'nan') else v


# ------------------------------------------------------------------ students
current = json.load(open(find('students.json')))                       # 662, official list
roster = list(csv.DictReader(open(find('CCK_Students_2026-02-02.csv'), encoding='utf-8-sig')))
supa = list(csv.DictReader(open(find('students_rows.csv'), encoding='utf-8')))
pics = json.load(open(find('students_all_1080.json')))

FIELDS = ['student_id', 'name', 'name_ar', 'civil_id', 'email', 'phone', 'gender', 'nationality', 'major',
          'level', 'gpa', 'cgpa', 'enrolled_credits', 'student_type', 'language', 'degree_class', 'admit_term', 'status']
students = {}


def fill(sid, rec):
    s = students.setdefault(sid, {'student_id': sid})
    for k, v in rec.items():
        v = clean(v)
        if k in FIELDS and v and not clean(s.get(k)):
            s[k] = v


# current students are kept exactly as in the official list (no trimming); other sources only fill gaps
for s in current:
    students[s['student_id']] = {k: v for k, v in s.items() if k in FIELDS and v not in (None, '')}
    students[s['student_id']]['status'] = 'active'
for r in roster:
    fill(r['Student ID'], {'name': r['Full Name'], 'name_ar': r['Arabic Name'], 'major': r['Major'],
                           'language': r['Language'], 'student_type': r['Type'], 'gpa': r['GPA'], 'level': r['Level']})
for p in pics:
    fill(p['student_id'], {k: p.get(k) for k in ('name', 'name_ar', 'civil_id', 'email', 'phone', 'major', 'level',
                                                 'gpa', 'student_type', 'language')})
for r in supa:
    meta = json.loads(r['metadata'] or '{}')
    fill(r['student_id'], {'name': r['name'], 'email': r['email'], 'major': r['major'], 'gpa': r['gpa'],
                           'cgpa': r['cgpa'], 'admit_term': r['admit_term'] or meta.get('admit_term'),
                           'name_ar': meta.get('name_ar'), 'phone': meta.get('phone'), 'civil_id': meta.get('civil_id'),
                           'nationality': meta.get('nationality'), 'gender': meta.get('gender'),
                           'language': meta.get('language'), 'student_type': meta.get('student_type'),
                           'degree_class': meta.get('degree_class'),
                           'status': {'graduated': 'graduated', 'inactive': 'inactive'}.get(r['status'], '')})
supa_major = {r['student_id']: r['major'] for r in supa}

# ------------------------------------------------------------------ grades 2021-2024
records = []
for f in LONG:
    sem, recs = read_long(find(f))
    for r in recs:
        code = base_code(r['course_code'])
        records.append({
            'student_id': r['student_id'], 'student_name': r['student_name'], 'course_code': code,
            'course_name': r['course_name'], 'grade': r['grade'],
            'credit_hours': int(r['credit_hours']) if r['credit_hours'] is not None else 3,
            'gpa': r['gpa'], 'cgpa': r['cgpa'], 'semester': sem,
            'grade_points': GRADE_POINTS.get(r['grade']), 'verification': 'confirmed', 'source_file': f,
        })

# ------------------------------------------------------------------ grades 2015-2020
pivot_stats = Counter()
enrolled_only = []  # student-semesters with no recoverable grade
final_cgpa = {}
for f in PIVOT:
    sem, courses, rows = read(find(f))
    names = {c[0]: c[1] for c in courses}
    grp = lambda s: (supa_major.get(s) or students.get(s, {}).get('major'), s[:4])
    conf, likely = set(), set()
    for code, *_ in courses:
        prev, prev_sid, prev_real = None, None, False
        for r in rows:
            v, s = r['cells'][code], r['student_id']
            real = prev is not None and v != prev
            if real:
                conf.add((s, code))
            elif prev is not None and prev_real and grp(s) == grp(prev_sid):
                likely.add((s, code))
            prev, prev_sid, prev_real = v, s, real
    n_conf = Counter(s for s, _ in conf)
    has_likely = {s for s, _ in likely}
    peers = defaultdict(list)
    for r in rows:
        peers[grp(r['student_id'])].append(r['student_id'])
    for r in rows:
        s = r['student_id']
        if n_conf[s] == 0 and s not in has_likely:
            ps = [p for p in peers[grp(s)] if p != s and n_conf[p] > 0]
            for code, *_ in courses:
                if ps and sum((p, code) in conf for p in ps) / len(ps) >= 0.5:
                    likely.add((s, code))
    for r in rows:
        s = r['student_id']
        fill(s, {'name': r['name']})
        if r['cgpa'] is not None:
            final_cgpa[s] = r['cgpa']   # this column is the student's final CGPA, not per semester
        got = 0
        for code, *_ in courses:
            kind = 'confirmed' if (s, code) in conf else 'unverified' if (s, code) in likely else None
            if not kind:
                continue
            grade, points, cr = r['cells'][code]
            got += 1
            pivot_stats[kind] += 1
            records.append({
                'student_id': s, 'student_name': r['name'], 'course_code': base_code(code), 'course_name': names[code],
                'grade': grade, 'credit_hours': int(cr) if cr else 3, 'gpa': None, 'cgpa': None, 'semester': sem,
                'grade_points': points, 'verification': kind, 'source_file': f,
            })
        if not got:
            enrolled_only.append((s, sem))

# ------------------------------------------------------------------ de-duplicate, order, names
seen = {}
for r in records:
    k = (r['student_id'], r['course_code'], r['semester'])
    if k in seen:  # keep the confirmed / first copy
        if seen[k]['verification'] == 'unverified' and r['verification'] == 'confirmed':
            seen[k] = r
        continue
    seen[k] = r
records = sorted(seen.values(), key=lambda r: semkey(r['semester']))  # stable sort keeps file order

catalog = {c['code']: c['name'] for c in json.load(open(find('courses.json')))}
for r in records:
    if r['student_id'] in students and clean(students[r['student_id']].get('name')):
        r['student_name'] = students[r['student_id']]['name']
    r['course_name'] = catalog.get(r['course_code']) or r['course_name'] or r['course_code']

# CGPA: per-semester values exist from 2021; for earlier-only students keep their final CGPA
last = {}
for r in records:
    last[r['student_id']] = r
for sid, r in last.items():
    if r['cgpa'] is None and sid in final_cgpa:
        r['cgpa'] = final_cgpa[sid]
for s in students.values():
    if not clean(s.get('cgpa')):
        c = last.get(s['student_id'], {}).get('cgpa')
        if c is not None:
            s['cgpa'] = c
    if not clean(s.get('status')):
        s['status'] = 'inactive'
    if not clean(s.get('name')):
        s['name'] = last.get(s['student_id'], {}).get('student_name') or s['student_id']

# ------------------------------------------------------------------ statistics (same rules as before)
cs = {}
for r in records:
    s = cs.setdefault(r['course_code'], {'name': r['course_name'], 'total': 0, 'passed': 0, 'failed': 0,
                                         'withdrawn': 0, 'grades': {}})
    s['total'] += 1
    g = r['grade']
    s['grades'][g] = s['grades'].get(g, 0) + 1
    if g in FAIL:
        s['failed'] += 1
    elif g == '(W)':
        s['withdrawn'] += 1
    else:
        s['passed'] += 1
for s in cs.values():
    s['pass_rate'] = round(s['passed'] / s['total'] * 100, 1)
    s['fail_rate'] = round(s['failed'] / s['total'] * 100, 1)
    s['repeat_prediction'] = s['failed']
ss = {}
for r in records:
    st = ss.setdefault(r['student_id'], {'name': r['student_name'], 'courses': [], 'passed': 0, 'failed': 0, 'cgpa': None})
    st['courses'].append({'code': r['course_code'], 'grade': r['grade'], 'semester': r['semester']})
    st['passed'] += r['grade'] not in NOT_PASSED
    st['failed'] += r['grade'] in FAIL
    st['cgpa'] = r['cgpa']
sems = sorted({r['semester'] for r in records}, key=semkey)

out_students = [{k: s.get(k) for k in FIELDS if s.get(k) not in (None, '')} for s in
                sorted(students.values(), key=lambda s: (s.get('status') != 'active', s['student_id']))]
hist = {
    'records': records, 'course_stats': cs, 'student_stats': ss,
    'grade_points': GRADE_POINTS,
    'summary': {'total_records': len(records), 'unique_students': len(ss), 'unique_courses': len(cs), 'semesters': sems,
                'unverified_records': sum(1 for r in records if r['verification'] == 'unverified'),
                'enrolled_without_recoverable_grades': len(enrolled_only)},
}
json.dump(out_students, open(os.path.join(OUT, 'students.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(hist, open(os.path.join(OUT, 'historical_grades.json'), 'w'), ensure_ascii=False)
print('students', len(out_students), Counter(s['status'] for s in out_students))
print('records', len(records), Counter(r['verification'] for r in records), 'pivot', dict(pivot_stats))
print('per semester', {s: sum(1 for r in records if r['semester'] == s) for s in sems})
print('enrolled without grades', len(enrolled_only))
