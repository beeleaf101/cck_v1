#!/usr/bin/env python3
"""Accessibility check (axe-core, WCAG 2.1 A/AA rules) on every page and role.

    python3 tests/e2e/a11y.py [--base http://127.0.0.1:8788] [--out tests/results/a11y.json]

Fails on any "critical" or "serious" violation. Moderate and minor findings are
reported so they can be planned.
"""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://127.0.0.1:8788'
AXE = (Path(__file__).resolve().parents[2] / 'node_modules' / 'axe-core' / 'axe.min.js').read_text()
ACC = {'admin': ['admin', 'Test-Admin-Pass-01'],
       'staff': {'hod': 'Test-Hod-Pass-01', 'reg1': 'Test-Reg1-Pass-01', 'reg2': 'Test-Reg2-Pass-01',
                 'facility': 'Test-Fac-Pass-01', 'nehad': 'Test-Nehad-Pass-01'},
       'student': ['T900001', str(300000000000 + 7919)]}
if os.environ.get('CCK_E2E_ACCOUNTS'):
    ACC.update(json.load(open(os.environ['CCK_E2E_ACCOUNTS'])))
results = []


def scan(pg, name):
    pg.add_script_tag(content=AXE)
    r = pg.evaluate("""async () => {
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
                                        sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }));
    }""")
    results.append({'page': name, 'violations': r})
    worst = [v for v in r if v['impact'] in ('critical', 'serious')]
    print(f"{name:28s} {len(r)} rule(s) broken, {len(worst)} critical/serious")


def login(pg, user, pw):
    pg.goto(BASE + '/'); pg.wait_for_selector('#login-id')
    pg.fill('#login-id', user); pg.fill('#login-password', pw)
    pg.click('#login-form button[type=submit]'); pg.wait_for_timeout(3000)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.goto(BASE + '/'); pg.wait_for_timeout(800); scan(pg, 'login page')
    pg.goto(BASE + '/student_hub.html'); pg.wait_for_timeout(800); scan(pg, 'student hub login')
    login(pg, *ACC['admin'])
    for sec in pg.eval_on_selector_all('.nav-link[data-section]', 'e => e.map(x => x.dataset.section)'):
        pg.click(f'.nav-link[data-section="{sec}"]', force=True); pg.wait_for_timeout(900)
        scan(pg, f'admin / {sec}')
    for role, page in [('hod', '/hod'), ('reg1', '/registration1'), ('reg2', '/registration2'), ('facility', '/facility'), ('nehad', '/nehad')]:
        c = b.new_context(viewport={'width': 1440, 'height': 900}); q = c.new_page()
        login(q, role, ACC['staff'][role]); scan(q, f'portal / {role}'); c.close()
    c = b.new_context(viewport={'width': 1440, 'height': 900}); q = c.new_page()
    login(q, *ACC['student'])
    for tab in q.eval_on_selector_all('.tab-btn[data-tab]', 'e => e.map(x => x.dataset.tab)'):
        q.click(f'.tab-btn[data-tab="{tab}"]', force=True); q.wait_for_timeout(600); scan(q, f'student / {tab}')
    b.close()

summary = {}
for r in results:
    for v in r['violations']:
        k = (v['impact'], v['id'], v['help'])
        summary[k] = summary.get(k, 0) + v['nodes']
print('\nBy rule (impact, rule, elements):')
for (imp, rid, hlp), n in sorted(summary.items(), key=lambda x: ['critical', 'serious', 'moderate', 'minor'].index(x[0][0] or 'minor')):
    print(f'  {imp:9s} {rid:28s} {n:5d}  {hlp}')
bad = sum(n for (imp, _, _), n in summary.items() if imp in ('critical', 'serious'))
out = {'pages': len(results), 'critical_or_serious_elements': bad, 'by_rule': [
    {'impact': k[0], 'rule': k[1], 'help': k[2], 'elements': n} for k, n in summary.items()], 'pages_detail': results}
if '--out' in sys.argv:
    Path(sys.argv[sys.argv.index('--out') + 1]).write_text(json.dumps(out, indent=1))
sys.exit(1 if bad else 0)
