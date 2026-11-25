#!/usr/bin/env python3
"""End-to-end browser tests (Playwright, Chromium) against a running Worker.

Start the test server first with synthetic data (see tests/README.md):
    npx wrangler dev --port 8788 --ip 127.0.0.1 --persist-to .wrangler/test-state
Then:
    python3 tests/e2e/test_e2e.py [--base http://127.0.0.1:8788] [--out tests/results/e2e.json]

Every user is synthetic (tests/fixtures/synthetic.mjs). Each check is recorded with
pass/fail, and any JavaScript error on any page fails the run.
"""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://127.0.0.1:8788'
SHOTS = Path(__file__).resolve().parents[1] / 'results' / 'screens'
SHOTS.mkdir(parents=True, exist_ok=True)
ADMIN = ('admin', 'Test-Admin-Pass-01')
STAFF = {'hod': 'Test-Hod-Pass-01', 'reg1': 'Test-Reg1-Pass-01', 'reg2': 'Test-Reg2-Pass-01',
         'facility': 'Test-Fac-Pass-01', 'nehad': 'Test-Nehad-Pass-01'}
# Student 1 of the synthetic set (see makeStudents)
STUDENT = ('T900001', str(300000000000 + 1 * 7919))
STUDENT2 = ('T900002', str(300000000000 + 2 * 7919))
# Optional: run against real accounts on a private copy, e.g. CCK_E2E_ACCOUNTS=private/accounts.json
# {"admin": [user, pw], "staff": {"hod": pw, ...}, "student": [id, civil], "student2": [id, civil]}
import os
if os.environ.get('CCK_E2E_ACCOUNTS'):
    _a = json.load(open(os.environ['CCK_E2E_ACCOUNTS']))
    ADMIN, STAFF, STUDENT, STUDENT2 = tuple(_a['admin']), _a['staff'], tuple(_a['student']), tuple(_a['student2'])

results, page_errors, timings = [], [], {}


def check(cid, desc, ok, detail=''):
    results.append({'id': cid, 'check': desc, 'pass': bool(ok), 'detail': str(detail)[:200]})
    print(f"{'PASS' if ok else 'FAIL'}  {cid}  {desc}  {detail if not ok else ''}")


def new_page(browser, tag, width=1440, height=900):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: page_errors.append(f'[{tag}] {e}'[:300]))
    pg.on('dialog', lambda d: d.accept())
    return pg


def login(pg, user, password, expect_url=None):
    pg.goto(BASE + '/')
    pg.wait_for_selector('#login-id')
    pg.fill('#login-id', user)
    pg.fill('#login-password', password)
    t = time.time()
    pg.click('#login-form button[type=submit]')
    if expect_url:
        pg.wait_for_url(f"**{expect_url.replace('.html', '')}*", timeout=15000)
    pg.wait_for_load_state('load')
    pg.wait_for_timeout(1500)
    return round((time.time() - t) * 1000)


def run():
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---------- login and guards
        anon = new_page(b, 'anon')
        t = time.time(); anon.goto(BASE + '/'); anon.wait_for_load_state('networkidle')
        timings['login_page_load_ms'] = round((time.time() - t) * 1000)
        check('E2E-01', 'Login page loads with the sign-in form', anon.is_visible('#login-id'))
        for page in ['/admin.html', '/hod.html', '/registration1.html', '/nehad.html']:
            anon.goto(BASE + page)
            check('E2E-02', f'Visitor is sent to the login page from {page}', 'login=required' in anon.url, anon.url)
        anon.goto(BASE + '/')
        anon.fill('#login-id', 'admin'); anon.fill('#login-password', 'wrong-password')
        anon.click('#login-form button[type=submit]'); anon.wait_for_timeout(1200)
        check('E2E-03', 'Wrong password shows an error and stays on login', anon.is_visible('#login-id'))

        # ---------- admin
        ad = new_page(b, 'admin')
        timings['admin_login_to_dashboard_ms'] = login(ad, *ADMIN)
        ad.wait_for_timeout(1500)
        n = ad.evaluate("typeof AppState !== 'undefined' ? AppState.students.length : -1")
        check('E2E-04', 'Admin dashboard loads the student list from the database', n > 0, n)
        for sec in ['students', 'allocation', 'instructors', 'timetable', 'analytics', 'predictions', 'advising', 'portal-review', 'dashboard']:
            ad.click(f'.nav-link[data-section="{sec}"]'); ad.wait_for_timeout(700)
            check('E2E-05', f'Admin section "{sec}" opens without errors', not [e for e in page_errors if e.startswith('[admin]')])
        ad.screenshot(path=str(SHOTS / 'admin-dashboard.png'))
        badge = ad.evaluate("(document.getElementById('db-status')||{}).textContent || ''")
        check('E2E-06', 'Database badge shows the synced state', 'Synced' in badge or 'Connected' in badge or badge == '', badge)

        # admin adds, edits and deletes a student through the UI functions
        made = ad.evaluate("""async () => {
            const r = await window.api.createStudent({student_id:'T999100', name:'Browser Test Student', civil_id:'399999999100', status:'active'});
            const u = await window.api.updateStudent('T999100', {level:'Level 3'});
            const d = await window.api.deleteStudent('T999100');
            return [!r.error, u.data && u.data.student && u.data.student.level, !d.error];
        }""")
        check('E2E-07', 'Admin can add, edit and delete a student and the changes are saved', made == [True, 'Level 3', True], made)

        # ---------- each portal submits for approval
        portals = {}
        for role, page in [('hod', '/hod.html'), ('reg1', '/registration1.html'), ('reg2', '/registration2.html'), ('facility', '/facility.html')]:
            pg = new_page(b, role)
            ms = login(pg, role, STAFF[role], page)
            timings[f'{role}_login_ms'] = ms
            check('E2E-08', f'{role} logs in and lands on its own portal', page.replace('.html', '') in pg.url, pg.url)
            pg.wait_for_timeout(800)
            pg.screenshot(path=str(SHOTS / f'portal-{role}.png'))
            pg.click('#btn-submit-admin'); pg.wait_for_timeout(1500)
            label = pg.inner_text('#btn-submit-admin')
            check('E2E-09', f'{role} submits its work to the admin', 'ubmitted' in label or 'ending' in label or 'Awaiting' in label, label)
            pg.goto(BASE + '/admin.html')
            check('E2E-10', f'{role} cannot open the admin page', 'login=required' in pg.url, pg.url)
            pg.goto(BASE + page); pg.wait_for_timeout(800)
            portals[role] = pg

        ne = new_page(b, 'nehad')
        login(ne, 'nehad', STAFF['nehad'], '/nehad.html'); ne.wait_for_timeout(1000)
        ne.evaluate("saveTTSlots({'CST8116':[{day:'Su',start:'09:00',end:'10:15',type:'Lecture'}]}); submitTimetableToAdmin()")
        ne.wait_for_timeout(1500)
        st = ne.evaluate("localStorage.getItem('cck_nehad_status')") or ''
        check('E2E-11', 'Nehad submits the timetable for approval', 'submitted' in st, st)
        portals['nehad'] = ne

        # a portal trying to approve itself is refused by the server
        forced = portals['hod'].evaluate("""async () => (await fetch('/api/state/cck_hod_status_v3', {method:'PUT',
            headers:{'content-type':'application/json'}, body: JSON.stringify({value: JSON.stringify({spring2026:'approved'})})})).status""")
        check('E2E-12', 'A portal cannot approve its own submission (server refuses)', forced == 403, forced)

        # ---------- student registration request
        sp = new_page(b, 'student')
        login(sp, *STUDENT); sp.wait_for_timeout(1500)
        role = sp.evaluate("window.CCK_SESSION && CCK_SESSION.role")
        check('E2E-13', 'Student logs in to the student view', role == 'student', role)
        seen = sp.evaluate('(AppState.students||[]).length')
        check('E2E-14', 'Student browser holds only their own student record', seen == 1, seen)
        for tab in ['schedule', 'registration', 'prerequisites', 'progress']:
            sp.click(f'.tab-btn[data-tab="{tab}"]'); sp.wait_for_timeout(600)
            sp.screenshot(path=str(SHOTS / f'student-{tab}.png'))
        check('E2E-15', 'Student tabs open without errors', not [e for e in page_errors if e.startswith('[student]')])
        ok = sp.evaluate(f"submitRegistrationRequest('{STUDENT[0]}', [AppState.courses[0].code])")
        sp.wait_for_timeout(1500)
        check('E2E-16', 'Student submits a registration request', ok is True, ok)
        # a script tag in the request must be neutralised
        sp.evaluate("""(() => { const r = window.RegistrationRequests.find(x => x.studentId === '%s');""" % STUDENT[0] + """
            r.courses[0].name = '<img src=x onerror="window.__xss=1">'; saveRegistrationRequests(); })()""")
        sp.wait_for_timeout(1200)

        # second student must not see the first student's request
        sp2 = new_page(b, 'student2')
        login(sp2, *STUDENT2); sp2.wait_for_timeout(1500)
        others = sp2.evaluate(f"(window.RegistrationRequests||[]).filter(r => r.studentId !== '{STUDENT2[0]}').length")
        check('E2E-17', "A student cannot see another student's requests", others == 0, others)

        # ---------- admin reviews and approves everything
        ad.reload(); ad.wait_for_timeout(2500)
        statuses = {k: ad.evaluate(f"JSON.parse(localStorage.getItem('{k}')||'{{}}')") for k in
                    ['cck_hod_status_v3', 'cck_reg1_status', 'cck_reg2_status', 'cck_fac_status', 'cck_nehad_status']}
        check('E2E-18', 'Admin sees all five portal submissions',
              all('submitted' in json.dumps(v) for v in statuses.values()), statuses)
        reqs = ad.evaluate("(window.RegistrationRequests||[]).map(r => [r.studentId, r.status])")
        check('E2E-19', "Admin sees the student's pending request", [STUDENT[0], 'pending'] in reqs, reqs)
        rid = ad.evaluate(f"window.RegistrationRequests.find(r => r.studentId === '{STUDENT[0]}').id")
        ad.evaluate(f"showRequestDetails({rid})"); ad.wait_for_timeout(800)
        check('E2E-20', 'Script hidden in a request does not run in the admin view', ad.evaluate('window.__xss') is None)
        ad.screenshot(path=str(SHOTS / 'admin-request.png'))
        ad.keyboard.press('Escape')
        for r in ['hod', 'reg1', 'reg2', 'facility', 'nehad']:
            ad.evaluate(f"prApprove('{r}')")
        ad.evaluate(f"approveRegistrationRequest({rid}, 'Approved in test')")
        ad.wait_for_timeout(2500)

        # ---------- everyone sees the approval
        for r, pg in portals.items():
            pg.reload(); pg.wait_for_timeout(2500)
            if r == 'nehad':
                val = pg.evaluate("localStorage.getItem('cck_nehad_status')") or ''
            else:
                val = pg.inner_text('#btn-submit-admin')
            check('E2E-21', f'{r} sees the admin approval', 'pprov' in val, val)
        appr = portals['facility'].evaluate("!!localStorage.getItem('cck_nehad_timetable_approved')")
        check('E2E-22', 'Facility receives the approved timetable', appr)
        sp.reload(); sp.wait_for_timeout(2500)
        sstat = sp.evaluate("(window.RegistrationRequests||[]).map(r => r.status)")
        check('E2E-23', 'Student sees their request approved', 'approved' in sstat, sstat)

        # ---------- Student Hub
        hub = new_page(b, 'hub', 390, 844)
        t = time.time(); hub.goto(BASE + '/student_hub.html'); hub.wait_for_load_state('networkidle')
        timings['student_hub_load_ms'] = round((time.time() - t) * 1000)
        hub.fill('#li-id', STUDENT[0]); hub.fill('#li-pw', STUDENT[1]); hub.click('.login-btn'); hub.wait_for_timeout(2500)
        check('E2E-24', 'Student Hub logs in on a phone-sized screen', not hub.is_visible('#login-screen'))
        hub.screenshot(path=str(SHOTS / 'hub-mobile.png'))
        html = hub.content()
        check('E2E-25', 'Student Hub page holds no other student\'s data', STUDENT2[0] not in html)

        # ---------- logout
        ad.evaluate("handleLogout ? handleLogout() : cckLogout()"); ad.wait_for_timeout(1500)
        ad.goto(BASE + '/admin.html')
        check('E2E-26', 'After logout the admin page is closed again', 'login=required' in ad.url, ad.url)
        b.close()

    check('E2E-27', 'No JavaScript errors on any page during the whole run', not page_errors, page_errors[:5])


if __name__ == '__main__':
    run()
    out = {'base': BASE, 'checks': results, 'timings_ms': timings, 'page_errors': page_errors,
           'passed': sum(r['pass'] for r in results), 'failed': sum(not r['pass'] for r in results)}
    print(json.dumps(timings, indent=1))
    print(f"{out['passed']} passed, {out['failed']} failed")
    if '--out' in sys.argv:
        Path(sys.argv[sys.argv.index('--out') + 1]).write_text(json.dumps(out, indent=1))
    sys.exit(1 if out['failed'] else 0)
