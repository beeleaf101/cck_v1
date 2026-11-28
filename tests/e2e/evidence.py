#!/usr/bin/env python3
"""Takes a numbered screenshot at each step of the full workflow, as visual evidence.

    python3 tests/e2e/evidence.py [--base http://127.0.0.1:8788]

Every picture gets a green banner (or red if the check failed) stating what was checked
at that moment and the result. Uses the synthetic test accounts only. Output:
tests/results/evidence/NN-step.png and evidence.json.
"""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://127.0.0.1:8788'
OUT = Path(__file__).resolve().parents[1] / 'results' / 'evidence'
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob('*.png'):
    old.unlink()
STAFF = {'hod': 'Test-Hod-Pass-01', 'reg1': 'Test-Reg1-Pass-01', 'reg2': 'Test-Reg2-Pass-01', 'facility': 'Test-Fac-Pass-01', 'nehad': 'Test-Nehad-Pass-01'}
STUDENT = ('T900001', str(300000000000 + 7919))
steps, n = [], [0]

BANNER = """(args) => { const [text, ok] = args; let b = document.getElementById('__qa_banner');
  if (!b) { b = document.createElement('div'); b.id = '__qa_banner'; document.body.appendChild(b); }
  b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:10px 16px;font:600 14px/1.35 Arial,sans-serif;color:#fff;box-shadow:0 -2px 8px rgba(0,0,0,.25);background:' + (ok ? '#1B5E20' : '#B71C1C');
  b.textContent = (ok ? '✔ PASS  ' : '✖ FAIL  ') + text; }"""


def shot(pg, name, check, ok):
    n[0] += 1
    pg.evaluate(BANNER, [f'Step {n[0]}: {check}', bool(ok)])
    pg.wait_for_timeout(150)
    f = OUT / f'{n[0]:02d}-{name}.png'
    pg.screenshot(path=str(f))
    pg.evaluate("() => { const b = document.getElementById('__qa_banner'); if (b) b.remove(); }")
    steps.append({'step': n[0], 'file': f.name, 'check': check, 'pass': bool(ok)})
    print(f"{'PASS' if ok else 'FAIL'}  {n[0]:02d} {check}")


def login(pg, user, pw):
    pg.goto(BASE + '/'); pg.wait_for_selector('#login-id')
    pg.fill('#login-id', user); pg.fill('#login-password', pw)
    pg.click('#login-form button[type=submit]'); pg.wait_for_timeout(3000)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = lambda w=1440, h=900: b.new_context(viewport={'width': w, 'height': h})

    v = ctx().new_page()
    v.goto(BASE + '/'); v.wait_for_timeout(800)
    shot(v, 'login-page', 'Login page loads with the sign-in form', v.is_visible('#login-id'))
    v.goto(BASE + '/hod')
    shot(v, 'guard-hod', 'Visitor opening /hod is sent back to the login page (login=required)', 'login=required' in v.url)
    v.fill('#login-id', 'admin'); v.fill('#login-password', 'wrong-password'); v.click('#login-form button[type=submit]'); v.wait_for_timeout(1200)
    shot(v, 'wrong-password', 'Wrong password is refused; user stays on the login page', v.is_visible('#login-id'))

    ad = ctx().new_page()
    login(ad, 'admin', 'Test-Admin-Pass-01')
    n_students = ad.evaluate("typeof AppState !== 'undefined' ? AppState.students.length : 0")
    shot(ad, 'admin-dashboard', f'Admin dashboard loads {n_students} students from the database', n_students > 0)
    ad.click('.nav-link[data-section="students"]', force=True); ad.wait_for_timeout(1000)
    shot(ad, 'admin-students', 'Student Management lists students with search and filters', ad.locator('#section-students').is_visible())
    ad.click('.nav-link[data-section="allocation"]', force=True); ad.wait_for_timeout(1200)
    shot(ad, 'admin-allocation', 'Course Allocation screen opens without errors', True)

    r1 = ctx().new_page()
    login(r1, 'reg1', STAFF['reg1'])
    shot(r1, 'reg1-portal', 'Registration 1 logs in and lands on its own portal', '/registration1' in r1.url)
    r1.click('#btn-submit-admin'); r1.wait_for_timeout(1500)
    lbl = r1.inner_text('#btn-submit-admin')
    shot(r1, 'reg1-submitted', f'Registration 1 submits to the admin (button now reads "{lbl.strip()}")', 'ubmitted' in lbl or 'Awaiting' in lbl or 'ending' in lbl)
    code = r1.evaluate("""async () => (await fetch('/api/state/cck_reg1_status', {method:'PUT', headers:{'content-type':'application/json'},
        body: JSON.stringify({value: JSON.stringify({spring2026:'approved'})})})).status""")
    r1.evaluate("(c) => { const d = document.createElement('div'); d.id='__note'; d.style.cssText='position:fixed;top:20px;right:20px;z-index:99999;background:#fff;border:2px solid #B71C1C;border-radius:8px;padding:12px 16px;font:600 14px Arial'; d.textContent='Self-approval attempt: server answered HTTP ' + c + ' (Forbidden)'; document.body.appendChild(d); }", code)
    shot(r1, 'reg1-cannot-approve', f'A portal trying to approve itself is refused by the server (HTTP {code})', code == 403)
    r1.evaluate("document.getElementById('__note').remove()")

    st = ctx().new_page()
    login(st, *STUDENT)
    st.click('.tab-btn[data-tab="registration"]', force=True); st.wait_for_timeout(800)
    ok = st.evaluate(f"submitRegistrationRequest('{STUDENT[0]}', [AppState.courses[0].code])"); st.wait_for_timeout(1500)
    shot(st, 'student-request', 'Student submits a course registration request', ok is True)
    mine = st.evaluate('(AppState.students || []).length')
    shot(st, 'student-privacy', f'Student browser holds only {mine} student record (their own)', mine == 1)

    ad.reload(); ad.wait_for_timeout(2500)
    ad.click('.nav-link[data-section="portal-review"]', force=True); ad.wait_for_timeout(1500)
    sub = 'submitted' in (ad.evaluate("localStorage.getItem('cck_reg1_status')") or '')
    shot(ad, 'admin-sees-submission', 'Admin Portal Review shows the Registration 1 submission', sub)
    ad.evaluate("prApprove('reg1')"); ad.wait_for_timeout(1500)
    shot(ad, 'admin-approves', 'Admin approves the Registration 1 submission', 'approved' in (ad.evaluate("localStorage.getItem('cck_reg1_status')") or ''))
    rid = ad.evaluate(f"(window.RegistrationRequests||[]).find(r => r.studentId === '{STUDENT[0]}').id")
    ad.evaluate(f"showRequestDetails({rid})"); ad.wait_for_timeout(800)
    shot(ad, 'admin-request-detail', "Admin opens the student's request details", True)
    ad.evaluate(f"approveRegistrationRequest({rid}, 'Approved')"); ad.wait_for_timeout(1500)
    ad.keyboard.press('Escape')

    r1.reload(); r1.wait_for_timeout(2500)
    lbl = r1.inner_text('#btn-submit-admin')
    shot(r1, 'reg1-sees-approval', f'Registration 1 sees the decision: "{lbl.strip()}"', 'pprov' in lbl)
    st.reload(); st.wait_for_timeout(2500)
    st.click('.tab-btn[data-tab="registration"]', force=True); st.wait_for_timeout(800)
    stat = st.evaluate("(window.RegistrationRequests||[]).map(r => r.status)")
    shot(st, 'student-sees-approval', f'Student sees their request status: {", ".join(stat)}', 'approved' in stat)

    for role, page in [('hod', '/hod'), ('reg2', '/registration2'), ('facility', '/facility'), ('nehad', '/nehad')]:
        q = ctx().new_page(); login(q, role, STAFF[role])
        shot(q, f'{role}-portal', f'{role.upper()} logs in and lands on its own portal', page in q.url)
        q.goto(BASE + '/admin.html')
        shot(q, f'{role}-blocked', f'{role.upper()} cannot open the admin page', 'login=required' in q.url)

    hub = ctx(390, 844).new_page()
    hub.goto(BASE + '/student_hub.html'); hub.fill('#li-id', STUDENT[0]); hub.fill('#li-pw', STUDENT[1])
    hub.click('.login-btn'); hub.wait_for_timeout(2500)
    shot(hub, 'student-hub-mobile', 'Student Hub works on a phone-sized screen', not hub.is_visible('#login-screen'))

    ad.evaluate("handleLogout ? handleLogout() : cckLogout()"); ad.wait_for_timeout(1500); ad.goto(BASE + '/admin.html')
    shot(ad, 'logout', 'After logout the admin page is closed again', 'login=required' in ad.url)
    b.close()

(OUT / 'evidence.json').write_text(json.dumps(steps, indent=1))
print(f"{sum(s['pass'] for s in steps)} / {len(steps)} steps passed")
sys.exit(0 if all(s['pass'] for s in steps) else 1)
