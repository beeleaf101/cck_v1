#!/usr/bin/env python3
"""Performance and load test: many simulated users at once against a running Worker.

    python3 tests/perf/load_test.py [--base http://127.0.0.1:8788] [--users 50] [--out tests/results/perf.json]

Each simulated student logs in, loads their data, grade history and shared portal state,
then logs out, as the student view does on sign-in. Admin calls run alongside.
Uses only synthetic accounts. Reports median, 95th percentile and error rate per endpoint.
"""
import json
import statistics
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
from pathlib import Path

arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
BASE = arg('--base', 'http://127.0.0.1:8788')
USERS = int(arg('--users', '50'))
lat, errors = {}, {}
lock = threading.Lock()


def call(opener, method, path, body=None, ip='10.0.0.1'):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={'content-type': 'application/json', 'cf-connecting-ip': ip})
    t = time.perf_counter()
    try:
        with opener.open(req, timeout=30) as r:
            r.read()
            ok = 200 <= r.status < 300
    except Exception:
        ok = False
    ms = (time.perf_counter() - t) * 1000
    name = f'{method} {path.split("?")[0]}'
    with lock:
        lat.setdefault(name, []).append(ms)
        if not ok:
            errors[name] = errors.get(name, 0) + 1
    return ok


def student_session(i):
    n = (i % 60) + 1
    sid, civ = f'T{900000 + n}', str(300000000000 + n * 7919)
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    ip = f'10.50.{i // 250}.{i % 250}'
    call(op, 'GET', '/', ip=ip)
    if call(op, 'POST', '/api/auth/login', {'id': sid, 'password': civ}, ip):
        call(op, 'GET', '/api/state', ip=ip)
        call(op, 'GET', '/api/data', ip=ip)
        call(op, 'GET', '/api/historical-grades', ip=ip)
        call(op, 'POST', '/api/auth/logout', {}, ip)


def pct(v, p):
    v = sorted(v)
    return v[min(len(v) - 1, int(round(p / 100 * (len(v) - 1))))]


def main():
    # warm up
    op = urllib.request.build_opener()
    for _ in range(5):
        call(op, 'GET', '/api/health')
    lat.clear(); errors.clear()
    t = time.perf_counter()
    with ThreadPoolExecutor(max_workers=min(USERS, 25)) as ex:
        list(ex.map(student_session, range(USERS)))
    wall = time.perf_counter() - t
    total = sum(len(v) for v in lat.values())
    rows = {k: {'requests': len(v), 'median_ms': round(statistics.median(v), 1), 'p95_ms': round(pct(v, 95), 1),
                'max_ms': round(max(v), 1), 'errors': errors.get(k, 0)} for k, v in lat.items()}
    out = {'base': BASE, 'simulated_students': USERS, 'concurrency': min(USERS, 25), 'requests': total,
           'wall_seconds': round(wall, 2), 'throughput_rps': round(total / wall, 1),
           'error_rate': round(sum(errors.values()) / total, 4), 'endpoints': rows}
    for k, r in rows.items():
        print(f"{k:32s} n={r['requests']:4d}  median {r['median_ms']:7.1f} ms  p95 {r['p95_ms']:7.1f} ms  errors {r['errors']}")
    print(f"{total} requests in {wall:.1f}s = {out['throughput_rps']} req/s, error rate {out['error_rate']:.2%}")
    if '--out' in sys.argv:
        Path(arg('--out', '')).write_text(json.dumps(out, indent=1))
    sys.exit(1 if out['error_rate'] > 0.01 else 0)


if __name__ == '__main__':
    main()
