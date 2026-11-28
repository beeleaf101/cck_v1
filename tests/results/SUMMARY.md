# CCK SIS – test results

Run: 2026-11-28 13:05 +03  
**Overall: COMPLETE – ALL PASSED**

| Suite | Tool | Checks | Failed | Status |
|---|---|---|---|---|
| Unit + integration + security | Node.js test runner | 63 | 0 | Complete – Passed |
| Code coverage (server) | node --experimental-test-coverage | 90.74% lines | 0 | Complete – Passed (83.49% branches) |
| Code quality | ESLint 10 | all .js files | 0 | Complete – Passed |
| HTML validation | html-validate 11 | 8 pages | 0 | Complete – Passed |
| Secret scan | secretlint 14 | all files | 0 | Complete – Passed |
| Dependency audit | npm audit | all packages | 0 | Complete – Passed |
| Private data in repository | scan_private_data.py | 70 files | 0 | Complete – Passed |
| Data validation (real files) | validate_dataset.py | 19 | 0 | Complete – Passed |
| End-to-end workflow | Playwright (Chromium) | 51 | 0 | Complete – Passed |
| Every button, every screen | Playwright crawl | 457 clicks / 41 screens | 0 | Complete – Passed |
| Accessibility (WCAG 2.1 AA) | axe-core 4 | 20 screens | 0 | Complete – Passed |
| Load (100 students) | Python threads | 600 requests | 0 | Complete – Passed (252.2 req/s) |
