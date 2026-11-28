#!/usr/bin/env bash
# Runs the whole CCK SIS test suite and writes results to tests/results/.
#   tests/run_all.sh                      unit + integration + e2e + load (synthetic data)
#   CCK_DATA_DIR=/path tests/run_all.sh   also validates the private data files in that folder
set -u
cd "$(dirname "$0")/.."
R=tests/results; mkdir -p "$R"
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
status=0

echo "== 0. Static checks: ESLint, HTML validation, secret scan, dependency audit"
npx eslint . && echo "ESLint: 0 problems" || status=1
npx html-validate public/*.html && echo "html-validate: all pages valid" || status=1
npx secretlint "**/*" && echo "secretlint: no secrets found" || status=1
npm audit --omit=dev || status=1
if [ -n "${CCK_DATA_DIR:-}" ]; then python3 tests/static/scan_private_data.py --out "$R/private-scan.json" || status=1; fi

echo "== 1. Unit and integration tests (Node, in-memory database)"
node --no-warnings --test --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=junit --test-reporter-destination="$R/node-tests.xml" \
  tests/unit/*.test.mjs tests/integration/*.test.mjs || status=1

echo "== 2. Data validation"
if [ -n "${CCK_DATA_DIR:-}" ]; then
  python3 tests/data/validate_dataset.py "$CCK_DATA_DIR" --out "$R/data.json" || status=1
else
  echo "   skipped (set CCK_DATA_DIR to the folder with the private JSON files)"
fi

echo "== 3. Start a local Worker with synthetic data"
node --no-warnings tests/fixtures/make-seed-sql.mjs
rm -rf .wrangler/test-state
npx wrangler d1 execute cck-sis-db --local --persist-to .wrangler/test-state --file=database/schema.sql >/dev/null
npx wrangler d1 execute cck-sis-db --local --persist-to .wrangler/test-state --file="$R/test-seed.sql" >/dev/null
npx wrangler dev --port 8788 --ip 127.0.0.1 --persist-to .wrangler/test-state >"$R/wrangler.log" 2>&1 &
WPID=$!
trap 'kill $WPID 2>/dev/null; pkill -f "workerd.*8788" 2>/dev/null; pkill -f "wrangler dev --port 8788" 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8788/api/health >/dev/null && break; sleep 1; done

echo "== 4. End-to-end browser tests (Playwright)"
python3 tests/e2e/test_e2e.py --base http://127.0.0.1:8788 --out "$R/e2e.json" || status=1

echo "== 5. Click every safe button on every screen"
python3 tests/e2e/crawl_ui.py --base http://127.0.0.1:8788 --out "$R/crawl.json" || status=1

echo "== 6. Accessibility (axe-core, WCAG 2.1 AA)"
python3 tests/e2e/a11y.py --base http://127.0.0.1:8788 --out "$R/a11y.json" || status=1

echo "== 7. Load test (100 simulated students)"
python3 tests/perf/load_test.py --base http://127.0.0.1:8788 --users 100 --out "$R/perf.json" || status=1

echo; [ $status -eq 0 ] && echo "TEST RUN COMPLETE: ALL TESTS PASSED" || echo "TEST RUN COMPLETE: SOME TESTS FAILED"
if [ -n "${CCK_RUN_LOG:-}" ]; then python3 tests/summarize.py "$CCK_RUN_LOG"; fi
exit $status
