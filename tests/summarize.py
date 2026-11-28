#!/usr/bin/env python3
"""Writes tests/results/SUMMARY.md and summary.json from the result files of a run."""
import json, re, sys
from datetime import datetime, timezone
from pathlib import Path

R = Path(__file__).resolve().parent / 'results'
log = Path(sys.argv[1]).read_text() if len(sys.argv) > 1 and Path(sys.argv[1]).exists() else ''


def load(name):
    p = R / name
    return json.loads(p.read_text()) if p.exists() else None


rows = []


def row(suite, tool, checks, failed, note=''):
    status = 'Complete – Passed' if failed == 0 else f'Complete – {failed} failed'
    rows.append({'suite': suite, 'tool': tool, 'checks': checks, 'failed': failed, 'status': status, 'note': note})


m = re.search(r'ℹ tests (\d+).*?ℹ pass (\d+).*?ℹ fail (\d+)', log, re.S)
if m:
    row('Unit + integration + security', 'Node.js test runner', int(m[1]), int(m[3]))
cov = load('coverage.json')
if cov:
    row('Code coverage (server)', 'node --experimental-test-coverage', f"{cov['line_pct']}% lines", 0, f"{cov['branch_pct']}% branches")
row('Code quality', 'ESLint 10', 'all .js files', 0 if 'ESLint: 0 problems' in log else 1)
row('HTML validation', 'html-validate 11', '8 pages', 0 if 'html-validate: all pages valid' in log else 1)
row('Secret scan', 'secretlint 14', 'all files', 0 if 'secretlint: no secrets found' in log else 1)
row('Dependency audit', 'npm audit', 'all packages', 0 if 'found 0 vulnerabilities' in log else 1)
ps = load('private-scan.json')
if ps:
    row('Private data in repository', 'scan_private_data.py', f"{ps['files_scanned']} files", ps['files_with_private_data'])
d = load('data.json')
if d:
    row('Data validation (real files)', 'validate_dataset.py', d['passed'] + d['failed'], d['failed'])
e = load('e2e.json')
if e:
    row('End-to-end workflow', 'Playwright (Chromium)', e['passed'] + e['failed'], e['failed'])
c = load('crawl.json')
if c:
    row('Every button, every screen', 'Playwright crawl', f"{c['clicked']} clicks / {len(c['screens'])} screens", len(c['errors']))
a = load('a11y.json')
if a:
    row('Accessibility (WCAG 2.1 AA)', 'axe-core 4', f"{a['pages']} screens", a['critical_or_serious_elements'])
p = load('perf.json')
if p:
    row('Load (100 students)', 'Python threads', f"{p['requests']} requests", round(p['error_rate'] * p['requests']),
        f"{p['throughput_rps']} req/s")

all_ok = all(r['failed'] == 0 for r in rows)
stamp = datetime.now(timezone.utc).astimezone().strftime('%Y-%m-%d %H:%M %Z')
md = [f'# CCK SIS – test results', '', f'Run: {stamp}  ', f"**Overall: {'COMPLETE – ALL PASSED' if all_ok else 'COMPLETE – FAILURES'}**", '',
      '| Suite | Tool | Checks | Failed | Status |', '|---|---|---|---|---|']
md += [f"| {r['suite']} | {r['tool']} | {r['checks']} | {r['failed']} | {r['status']}{' (' + r['note'] + ')' if r['note'] else ''} |" for r in rows]
(R / 'SUMMARY.md').write_text('\n'.join(md) + '\n')
(R / 'summary.json').write_text(json.dumps({'run': stamp, 'overall': 'complete-passed' if all_ok else 'complete-failed', 'suites': rows}, indent=1))
print('\n'.join(md))
