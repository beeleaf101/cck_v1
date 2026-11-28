#!/usr/bin/env python3
"""Checks that no real student data is in any file committed to the repository.

    CCK_DATA_DIR=<folder with students.json> python3 tests/static/scan_private_data.py [--out file]

Looks for every real Civil ID, Student ID and full name from the private file in every
tracked file. Prints only counts, never the matches themselves.
"""
import json, os, re, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
folder = os.environ.get('CCK_DATA_DIR')
if not folder:
    print('skipped: set CCK_DATA_DIR'); sys.exit(0)
students = json.load(open(Path(folder) / 'students.json'))
civil = {s['civil_id'] for s in students if s.get('civil_id')}
ids = {s['student_id'] for s in students}
names = {s['name'] for s in students if s.get('name') and len(s['name']) > 10}
files = subprocess.run(['git', 'ls-files'], cwd=root, capture_output=True, text=True).stdout.split()
hits = {}
for f in files:
    try:
        text = (root / f).read_text(encoding='utf-8')
    except Exception:
        continue
    c = sum(1 for x in set(re.findall(r'\b\d{12}\b', text)) if x in civil)
    i = sum(1 for x in set(re.findall(r'\b\d{9}\b', text)) if x in ids)
    n = sum(1 for x in names if x in text)
    if c or i or n:
        hits[f] = {'civil_ids': c, 'student_ids': i, 'names': n}
out = {'files_scanned': len(files), 'files_with_private_data': len(hits), 'details': hits}
print(json.dumps(out, indent=1))
if '--out' in sys.argv:
    Path(sys.argv[sys.argv.index('--out') + 1]).write_text(json.dumps(out, indent=1))
sys.exit(1 if hits else 0)
