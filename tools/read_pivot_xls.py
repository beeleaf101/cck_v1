"""Read the 2015-2020 'Semester Results' Excel exports (one row per student, courses as columns)."""
import re
import xlrd

CODE = re.compile(r'^([A-Z]{2,4}\d{3,4}[A-Za-z]?)\s*-\s*(.*)$')


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def semester_of(sheet):
    for r in range(min(15, sheet.nrows)):
        for c in range(sheet.ncols):
            m = re.search(r'(\d{4})/(\d{4})\s*,\s*(Fall|Spring|Summer)', str(sheet.cell_value(r, c)))
            if m:
                return f'{m.group(3)} {m.group(1)}-{m.group(2)}'
    raise ValueError('semester not found')


def read(path):
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    sem = semester_of(sh)
    hr = next(r for r in range(sh.nrows) if str(sh.cell_value(r, 0)).strip() == 'SN')
    head = [str(sh.cell_value(hr, c)).strip() for c in range(sh.ncols)]
    sub = [str(sh.cell_value(hr + 1, c)).strip() for c in range(sh.ncols)]
    courses = []  # (code, name, grade_col, points_col, cr_col)
    for c, h in enumerate(head):
        m = CODE.match(h)
        if m:
            g = next(x for x in range(c, c + 6) if sub[x] == 'Grade')
            p = next(x for x in range(c, c + 6) if sub[x] == 'Points')
            cr = next(x for x in range(c, c + 6) if sub[x].startswith('Cr'))
            courses.append((m.group(1), m.group(2).strip(), g, p, cr))
    col = {h: c for c, h in enumerate(head) if h}
    rows = []
    for r in range(hr + 2, sh.nrows):
        sid = str(sh.cell_value(r, 1)).strip()
        if sid.endswith('.0'):
            sid = sid[:-2]
        if not re.fullmatch(r'20\d{7}', sid):
            continue
        cells = {}
        for code, name, g, p, cr in courses:
            grade = str(sh.cell_value(r, g)).strip()
            if grade:
                cells[code] = (grade, num(sh.cell_value(r, p)), num(sh.cell_value(r, cr)))
        rows.append({
            'student_id': sid,
            'name': ' '.join(str(sh.cell_value(r, 2)).split()),
            'cells': cells,
            'total_cr': num(sh.cell_value(r, col['Total Cr.h'])) if 'Total Cr.h' in col else None,
            'quality': num(sh.cell_value(r, col['Quality Points'])) if 'Quality Points' in col else None,
            'cgpa': num(sh.cell_value(r, col['CGPA'])) if 'CGPA' in col else None,
            'standing': str(sh.cell_value(r, col['ACCUM CGPA'])).strip() if 'ACCUM CGPA' in col else None,
        })
    return sem, courses, rows


def read_long(path):
    """2021-2024 exports: one row per student and course."""
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    sem = semester_of(sh)
    hr = next(r for r in range(sh.nrows) if any(str(sh.cell_value(r, c)).strip() == 'Student ID' for c in range(sh.ncols)))
    col = {str(sh.cell_value(hr, c)).strip(): c for c in range(sh.ncols) if str(sh.cell_value(hr, c)).strip()}
    out = []
    for r in range(hr + 1, sh.nrows):
        sid = str(sh.cell_value(r, col['Student ID'])).strip()
        if sid.endswith('.0'):
            sid = sid[:-2]
        if not re.fullmatch(r'20\d{7}', sid):
            continue
        out.append({
            'student_id': sid,
            'student_name': ' '.join(str(sh.cell_value(r, col['Student Name'])).split()),
            'course_code': str(sh.cell_value(r, col['Course Code'])).strip(),
            'course_name': ' '.join(str(sh.cell_value(r, col['Course Name'])).split()),
            'grade': str(sh.cell_value(r, col['Grade'])).strip(),
            'credit_hours': num(sh.cell_value(r, col['CH'])),
            'gpa': num(sh.cell_value(r, col['GPA'])),
            'cgpa': num(sh.cell_value(r, col['CGPA'])),
            'semester': sem,
        })
    return sem, out
