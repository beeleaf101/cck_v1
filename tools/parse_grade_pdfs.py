#!/usr/bin/env python3
"""
Extract grade records from CCK "Semester Results" PDF reports.

    python3 tools/parse_grade_pdfs.py OUT.json report1.pdf report2.pdf ...

Two report layouts exist:
  * long  (2021-2023): one row per student+course. The table is cut in half:
    pages 1..P/2 hold Year/Semester/ID/Name/Course, pages P/2+1..P hold Grade/CH/GPA/CGPA.
  * pivot (2015-2020): one row per student, courses as columns (Grade / Total Points / Cr. H).
    The table is a grid of R row-pages x C column-pages.

Rows on the different page parts are matched by their vertical position.
Output records use the same shape as historical_grades.json records.
"""
import json
import re
import sys
from collections import defaultdict

import pdfplumber

SID = re.compile(r'^20\d{7}$')
CODE = re.compile(r'^[A-Z]{2,4}\d{3,4}[A-Za-z]?\.?$')
GRADE = re.compile(r'^(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|\(FA\)|\(W\)|\(CR\)|\(I\)|W|FA|I|NP|NG|PASS|P|CR|IP|AU)$')
NUM = re.compile(r'^-?\d+(\.\d+)?$')
TOL = 4.0


def words(page):
    return page.extract_words(keep_blank_chars=False, use_text_flow=False, x_tolerance=1.5, y_tolerance=2)


def cx(w):
    return (w['x0'] + w['x1']) / 2


def cy(w):
    return (w['top'] + w['bottom']) / 2


def semester_label(pdf):
    text = ' '.join(w['text'] for w in words(pdf.pages[0]) if w['top'] < 110)
    m = re.search(r'(Fall|Spring|Summer)\S*\s*(?:Semester)?\s*,\s*(\d{4})/(\d{4})', text)
    if not m:
        raise ValueError('semester title not found')
    return f'{m.group(1)} {m.group(2)}-{m.group(3)}'


def id_rows(ws):
    """Student-ID tokens on a page, sorted top to bottom."""
    return sorted([w for w in ws if SID.match(w['text']) and w['x0'] < 400], key=cy)


def band(rows, i, page_bottom):
    """Vertical band belonging to row i: halfway to its neighbours."""
    y = cy(rows[i])
    top = (cy(rows[i - 1]) + y) / 2 if i > 0 else y - 14
    bot = (cy(rows[i + 1]) + y) / 2 if i + 1 < len(rows) else min(y + 14, page_bottom)
    return top, bot


def norm_grade(g):
    g = g.strip()
    return {'W': '(W)', 'FA': '(FA)', 'I': '(I)', 'CR': '(CR)'}.get(g, g)


def to_num(t):
    return float(t) if t is not None and NUM.match(t) else None


# ------------------------------------------------------------------ long layout
def parse_long(pdf, sem):
    P = len(pdf.pages)
    half = P // 2
    out = []
    left_hdr = None
    right_hdr = None
    for p in range(half):
        lw = words(pdf.pages[p])
        rw = words(pdf.pages[p + half])
        rows = id_rows(lw)
        if not rows:
            continue
        # header positions (headers repeat only on the first page; keep the last seen)
        hdr = {w['text']: w for w in lw if w['top'] < cy(rows[0]) - 6}
        if 'Code' in hdr or 'Course' in hdr:
            left_hdr = lw
        rh = [w for w in rw if w['text'] in ('Grade', 'CH', 'GPA', 'CGPA')]
        if rh:
            right_hdr = {w['text']: cx(w) for w in rh}
        if right_hdr is None:
            raise ValueError('right-hand header not found')
        # course-name column: x range of the "Course Name" header on the first page
        lh = [w for w in left_hdr if w['top'] < 200]
        cname_x = None
        for a, b in zip(lh, lh[1:]):
            if a['text'] == 'Course' and b['text'] == 'Name':
                cname_x = a['x0'] - 4
        sname_x = None
        for a, b in zip(lh, lh[1:]):
            if a['text'] == 'Student' and b['text'] == 'Name':
                sname_x = a['x0'] - 30

        for i, idw in enumerate(rows):
            y = cy(idw)
            top, bot = band(rows, i, pdf.pages[p].height)
            same = [w for w in lw if abs(cy(w) - y) < TOL]
            code = next((w['text'] for w in same if CODE.match(w['text'])), None)
            code_w = next((w for w in same if CODE.match(w['text'])), None)
            # student name: words on the ID line between the ID and the course code / name column
            right_limit = min([x for x in [code_w['x0'] if code_w else None, cname_x] if x is not None] or [9999])
            name_words = [w for w in lw if top <= cy(w) < bot and w['x0'] > idw['x1'] + 2 and w['x1'] < right_limit + 1
                          and not CODE.match(w['text']) and not SID.match(w['text'])
                          and not re.fullmatch(r'\d{4}|Fall|Spring|Summer|Semester', w['text'])]
            name = ' '.join(w['text'] for w in sorted(name_words, key=lambda w: (round(cy(w)), w['x0'])))
            cname_words = [w for w in lw if top <= cy(w) < bot and cname_x is not None and w['x0'] >= cname_x - 2]
            cname = ' '.join(w['text'] for w in sorted(cname_words, key=lambda w: (round(cy(w)), w['x0'])))

            vals = [w for w in rw if abs(cy(w) - y) < TOL]

            def nearest(label, pattern):
                cands = [w for w in vals if pattern.match(w['text'])]
                if not cands or label not in right_hdr:
                    return None
                best = min(cands, key=lambda w: abs(cx(w) - right_hdr[label]))
                # must be closer to this header than to any other header
                if min(right_hdr, key=lambda k: abs(right_hdr[k] - cx(best))) != label:
                    return None
                return best['text']

            grade = nearest('Grade', GRADE)
            out.append({
                'student_id': idw['text'], 'student_name': name, 'course_code': code.rstrip('.') if code else None, 'course_name': cname,
                'grade': norm_grade(grade) if grade else None,
                'credit_hours': to_num(nearest('CH', NUM)),
                'gpa': to_num(nearest('GPA', NUM)), 'cgpa': to_num(nearest('CGPA', NUM)),
                'semester': sem,
            })
    return out


# ------------------------------------------------------------------ pivot layout
def parse_pivot(pdf, sem):
    P = len(pdf.pages)
    R = sum(1 for pg in pdf.pages if id_rows(words(pg)))
    if P % R:
        raise ValueError(f'{P} pages is not a multiple of {R} row pages')
    C = P // R
    pages = [words(pg) for pg in pdf.pages]

    # Column layout for each column-group, from its first page's header
    groups = []
    for c in range(C):
        ws = pages[c * R]
        first_data = min((cy(w) for w in ws if GRADE.match(w['text']) or NUM.match(w['text'])
                          and w['top'] > 100), default=200)
        hdr = [w for w in ws if 90 < w['top'] < first_data - 4]
        codes = sorted([w for w in hdr if CODE.match(w['text'])], key=lambda w: w['x0'])
        subs = []
        hs = sorted(hdr, key=lambda w: w['x0'])
        for w in hs:
            if w['text'] == 'Grade':
                subs.append(['grade', cx(w), w['x0']])
            elif w['text'] == 'Points' and not any(h['text'] == 'Quality' and abs(h['x0'] - w['x0']) < 25 for h in hs):
                subs.append(['points', cx(w), w['x0']])
            elif w['text'] == 'Cr.':
                subs.append(['cr', cx(w) + 6, w['x0']])
            elif w['text'] == 'CGPA' and w['top'] < first_data - 10 and not any(h['text'] == 'ACCUM' and abs(cx(h) - cx(w)) < 20 for h in hs):
                subs.append(['cgpa', cx(w), w['x0']])
            elif w['text'] in ('Cr.h',):
                subs.append(['totalcr', cx(w), w['x0']])
            elif w['text'] == 'ACCUM' or (w['text'] == 'CGPA' and any(h['text'] == 'ACCUM' and abs(cx(h) - cx(w)) < 20 for h in hs)):
                if not any(s[0] == 'standing' for s in subs):
                    subs.append(['standing', cx(w), w['x0']])
            elif w['text'] == 'Quality':
                subs.append(['quality', cx(w) + 15, w['x0']])
        # each course sub-column belongs to the nearest course code on its left
        for s in subs:
            if s[0] in ('grade', 'points', 'cr'):
                left = [cd for cd in codes if cd['x0'] <= s[2] + 12]
                s.append(left[-1]['text'] if left else None)
            else:
                s.append(None)
        groups.append(subs)

    out = []
    for r in range(R):
        rows = id_rows(pages[r])
        for i, idw in enumerate(rows):
            y = cy(idw)
            top, bot = band(rows, i, pdf.pages[r].height)
            first_sub_x = min((s[2] for s in groups[0]), default=9999)
            name_words = [w for w in pages[r] if top <= cy(w) < bot and w['x0'] > idw['x1'] + 2 and w['x1'] < first_sub_x - 2]
            name = ' '.join(w['text'] for w in sorted(name_words, key=lambda w: (round(cy(w)), w['x0'])))
            per_course = defaultdict(dict)
            extra = {}
            for c in range(C):
                subs = groups[c]
                if not subs:
                    continue
                vals = [w for w in pages[c * R + r] if abs(cy(w) - y) < TOL]
                if c == 0:
                    vals = [w for w in vals if w['x0'] > first_sub_x - 15]
                for w in vals:
                    s = min(subs, key=lambda s: abs(s[1] - cx(w)))
                    kind, code = s[0], s[3]
                    if kind in ('grade', 'points', 'cr') and code:
                        per_course[code][kind] = w['text']
                    elif kind in ('cgpa', 'totalcr', 'quality', 'standing'):
                        extra[kind] = w['text']
            courses = []
            for code, v in per_course.items():
                g = v.get('grade')
                if not g or not GRADE.match(g):
                    continue
                courses.append((code, norm_grade(g), to_num(v.get('cr')), to_num(v.get('points'))))
            # semester GPA from this report: credit-weighted grade points of graded courses
            graded = [(cr, pts) for _, g, cr, pts in courses if cr and pts is not None and g not in ('(W)', 'PASS', 'P', '(CR)', '(I)')]
            tot = sum(cr for cr, _ in graded)
            gpa = round(sum(cr * pts for cr, pts in graded) / tot, 2) if tot else None
            cgpa = to_num(extra.get('cgpa'))
            if cgpa is None:
                cgpa = to_num(extra.get('quality'))
            for code, g, cr, pts in courses:
                out.append({
                    'student_id': idw['text'], 'student_name': name, 'course_code': code, 'course_name': None,
                    'grade': g, 'credit_hours': int(cr) if cr else None, 'gpa': gpa, 'cgpa': cgpa, 'semester': sem,
                })
    return out


def parse(path):
    pdf = pdfplumber.open(path)
    sem = semester_label(pdf)
    head = ' '.join(w['text'] for w in words(pdf.pages[0]) if w['top'] < 200)
    layout = 'long' if 'Academic' in head else 'pivot'
    recs = parse_long(pdf, sem) if layout == 'long' else parse_pivot(pdf, sem)
    return sem, layout, recs


if __name__ == '__main__':
    out_path, files = sys.argv[1], sys.argv[2:]
    all_recs = []
    for f in files:
        sem, layout, recs = parse(f)
        print(f'{f.split("/")[-1]:40} {sem:18} {layout:5} {len(recs):5} records', flush=True)
        for r in recs:
            r['_source'] = f.split('/')[-1]
        all_recs.extend(recs)
    json.dump(all_recs, open(out_path, 'w'), ensure_ascii=False, indent=1)
