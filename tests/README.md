# CCK SIS tests

All tests use **synthetic people** (`tests/fixtures/synthetic.mjs`): no real student data is
in the repository or needed to run them.

| Level | Where | Tool | What it covers |
|---|---|---|---|
| Unit | `tests/unit/` | `node:test` | Password hashing, input cleaning, request sanitising, privacy filters |
| Integration / security | `tests/integration/` | `node:test` + in-memory SQLite (`tests/helpers/d1-shim.mjs`) | Every API route through the real Worker: login, lockout, sessions, roles, page guards, approval workflow, imports, CSRF, headers |
| Data validation | `tests/data/validate_dataset.py` | Python | The private JSON files before import: duplicates, IDs, grades, terms, orphans |
| End-to-end | `tests/e2e/test_e2e.py` | Playwright (Chromium) | Real browsers for admin, the five portals and students, from login to approval |
| Load | `tests/perf/load_test.py` | Python threads | 100 simulated students signing in and loading their data at once |

## Run

```bash
npm test                                  # unit + integration (about 2 s, no server needed)
bash tests/run_all.sh                     # everything, starts its own local Worker on port 8788
CCK_DATA_DIR=../private-data bash tests/run_all.sh   # also validate the real data files
```

Requirements: Node 22+, Python 3.10+, `pip install playwright && playwright install chromium`.
Results are written to `tests/results/` as JSON (counts only, never names or IDs).
GitHub Actions runs `npm test` on every push (`.github/workflows/test.yml`).
