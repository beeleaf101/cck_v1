#!/usr/bin/env python3
"""Clicks every safe button on every screen, for every role, and records JavaScript errors.

    python3 tests/e2e/crawl_ui.py [--base http://127.0.0.1:8788] [--out tests/results/crawl.json]

Buttons that delete, reset, import, log out or send data away are skipped. Confirm dialogs
are dismissed, so nothing destructive is accepted. Uses the synthetic accounts unless
CCK_E2E_ACCOUNTS points to a private accounts file.
"""
import json, os, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://127.0.0.1:8788'
ACC = {'admin': ['admin', 'Test-Admin-Pass-01'],
       'staff': {'hod': 'Test-Hod-Pass-01', 'reg1': 'Test-Reg1-Pass-01', 'reg2': 'Test-Reg2-Pass-01',
                 'facility': 'Test-Fac-Pass-01', 'nehad': 'Test-Nehad-Pass-01'},
       'student': ['T900001', str(300000000000 + 7919)]}
if os.environ.get('CCK_E2E_ACCOUNTS'):
    ACC.update(json.load(open(os.environ['CCK_E2E_ACCOUNTS'])))
SKIP = re.compile(r'delete|remove|log ?out|sign ?out|clear|reset|import|wipe|sync|upload|discard|drop|danger|password|reject|approve all', re.I)
report = {'screens': [], 'errors': [], 'clicked': 0, 'skipped': 0, 'downloads': []}


def attach(pg, tag):
    pg.on('pageerror', lambda e: report['errors'].append({'where': tag, 'error': str(e)[:300], 'at': ' | '.join((e.stack or '').split('\n')[1:3])[:300]}))
    pg.on('dialog', lambda d: d.dismiss())
    pg.on('download', lambda d: report['downloads'].append({'where': tag, 'file': d.suggested_filename}))


def click_all(pg, tag, scope='body', limit=80):
    seen = set()
    for _ in range(3):  # buttons can appear after clicks
        buttons = pg.locator(f'{scope} button:visible, {scope} [role=button]:visible, {scope} .btn:visible')
        n = buttons.count()
        progressed = False
        for i in range(min(n, limit)):
            b = buttons.nth(i)
            try:
                label = (b.inner_text(timeout=500) or b.get_attribute('title') or b.get_attribute('aria-label') or '').strip()[:60]
                onclick = b.get_attribute('onclick') or ''
            except Exception:
                continue
            key = label + '|' + onclick
            if key in seen:
                continue
            seen.add(key)
            if SKIP.search(label) or SKIP.search(onclick) or not (label or onclick):
                report['skipped'] += 1
                continue
            before = len(report['errors'])
            try:
                b.click(timeout=1500)
                pg.wait_for_timeout(350)
                report['clicked'] += 1
                progressed = True
            except Exception:
                continue
            if len(report['errors']) > before:
                report['errors'][-1]['after_click'] = label or onclick
            pg.keyboard.press('Escape')
            close_modals(pg)
        if not progressed:
            break
    report['screens'].append({'screen': tag, 'buttons_seen': len(seen)})


CLOSE_JS = """() => { let n = 0;
  document.querySelectorAll('[id*=modal], .modal, .modal-overlay, [class*=overlay]').forEach(m => {
    const st = getComputedStyle(m); if (st.display === 'none' || st.visibility === 'hidden' || m.offsetParent === null && st.position !== 'fixed') return;
    const btn = [...m.querySelectorAll('button, .close, [class*=close]')].find(b => /^(×|✕|x|close|cancel|done|ok)$/i.test((b.textContent || '').trim()) || /close/i.test(b.className));
    if (btn) { btn.click(); n++; } else if (st.position === 'fixed') { m.style.display = 'none'; n++; }
  }); return n; }"""


def close_modals(pg):
    try:
        return pg.evaluate(CLOSE_JS)
    except Exception:
        return 0


def login(pg, user, pw):
    pg.goto(BASE + '/'); pg.wait_for_selector('#login-id')
    pg.fill('#login-id', user); pg.fill('#login-password', pw)
    pg.click('#login-form button[type=submit]'); pg.wait_for_timeout(3500)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    pg = ctx.new_page(); attach(pg, 'admin')
    login(pg, *ACC['admin'])
    sections = pg.eval_on_selector_all('.nav-link[data-section]', 'els => els.map(e => e.dataset.section)')
    for sec in sections:
        close_modals(pg)
        pg.click(f'.nav-link[data-section="{sec}"]', force=True); pg.wait_for_timeout(1200)
        click_all(pg, f'admin/{sec}', f'#{sec}-section' if pg.locator(f'#{sec}-section').count() else 'main')
        close_modals(pg)
    for label, fn in [('PDF export', 'exportToPDF()'), ('Excel export', 'exportToExcel()')]:
        try:
            pg.evaluate(fn); pg.wait_for_timeout(1500)
        except Exception as e:
            report['errors'].append({'where': 'admin/' + label, 'error': str(e)[:200]})
    ctx.close()

    for role, page in [('hod', '/hod'), ('reg1', '/registration1'), ('reg2', '/registration2'), ('facility', '/facility'), ('nehad', '/nehad')]:
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        pg = ctx.new_page(); attach(pg, role)
        login(pg, role, ACC['staff'][role])
        if page not in pg.url:
            report['errors'].append({'where': role, 'error': f'landed on {pg.url}'})
        tabs = pg.locator('[onclick^="showView("]:visible, [onclick^="showSection("]:visible, [onclick^="switchTab("]:visible, [onclick^="goTo("]:visible, [onclick^="setTTMode("]:visible, [onclick^="setViewMode("]:visible, [onclick^="setBpView("]:visible, nav a:visible, .nav-item:visible, [data-view]:visible, [data-tab]:visible')
        names = []
        for i in range(min(tabs.count(), 30)):
            try:
                t = tabs.nth(i).inner_text(timeout=500).strip()[:40]
            except Exception:
                t = ''
            if not SKIP.search(t):
                names.append(i)
        click_all(pg, f'{role}/home')
        for i in names:
            try:
                close_modals(pg)
                tabs.nth(i).click(timeout=1500, force=True); pg.wait_for_timeout(700)
                click_all(pg, f'{role}/tab{i}', limit=40)
            except Exception:
                pass
        ctx.close()

    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    pg = ctx.new_page(); attach(pg, 'student')
    login(pg, *ACC['student'])
    for tab in pg.eval_on_selector_all('.tab-btn[data-tab]', 'els => els.map(e => e.dataset.tab)'):
        close_modals(pg)
        pg.click(f'.tab-btn[data-tab="{tab}"]', force=True); pg.wait_for_timeout(800)
        click_all(pg, f'student/{tab}', limit=40)
    ctx.close()

    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page(); attach(pg, 'hub')
    pg.goto(BASE + '/student_hub.html'); pg.fill('#li-id', ACC['student'][0]); pg.fill('#li-pw', ACC['student'][1])
    pg.click('.login-btn'); pg.wait_for_timeout(2500)
    links = pg.locator('[onclick*="show"], .nav-item, .tab, .menu-item')
    for i in range(min(links.count(), 25)):
        try:
            links.nth(i).click(timeout=1000); pg.wait_for_timeout(400)
            report['clicked'] += 1
        except Exception:
            pass
    click_all(pg, 'hub', limit=40)
    b.close()

print(json.dumps({k: report[k] for k in ['clicked', 'skipped', 'downloads']}, indent=1))
print('screens:', len(report['screens']))
for e in report['errors']:
    print('ERROR', e)
print('errors:', len(report['errors']))
if '--out' in sys.argv:
    Path(sys.argv[sys.argv.index('--out') + 1]).write_text(json.dumps(report, indent=1))
sys.exit(1 if report['errors'] else 0)
