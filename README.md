# CCK SIS – Student Information System

Student Information System for the Canadian College of Kuwait: AI course allocation, timetable
generation, enrollment predictions, a student portal and an admin dashboard.

It runs on **Cloudflare Workers** with a **Cloudflare D1** database. The Worker serves the
website and a small JSON API; private data (students, enrollments, grades) lives only in D1 and
is returned only to logged-in users.

## How it fits together

```
Browser ──► Cloudflare Worker (src/worker.js)
              ├─ /            static site from public/
              └─ /api/*       login + data API ──► D1 database (cck-sis-db)
```

| Who | Logs in with | Can see |
|-----|--------------|---------|
| Admin | `admin` + admin password | Everything |
| Student | Student ID + Civil ID | Own record and grades; other students in course lists are anonymous |

Passwords are checked on the server. Sessions use an HttpOnly cookie. After 5 wrong
passwords from one address, login is locked for 15 minutes.

## Project structure

```
├── src/worker.js            Cloudflare Worker: website + API
├── wrangler.jsonc           Worker and D1 settings
├── database/
│   ├── schema.sql           D1 schema (all tables, views, settings)
│   └── schema.postgres.sql  Original Supabase schema, for reference
├── tools/
│   ├── build-seed.mjs       Builds SQL to load data into D1
│   └── generate_excel_timetable.py
└── public/                  The website
    ├── index.html, app.js, styles.css
    ├── courses.json, instructors.json, study_plans*.json, ...   (public data)
    └── js/
        ├── d1-client.js             Talks to the API (replaces Supabase)
        ├── database-integration.js  Allocations, timetables, semesters
        ├── data-sync.js             "Sync All Data" admin tools
        └── enrollment-prediction.js AI predictions
```

`students.json`, `enrollments.json` and `historical_grades.json` are **not** in this repo.
They contain personal data and are loaded straight into D1.

## Setup

```bash
npm install

# 1. Create the database, then put its id in wrangler.jsonc ("database_id")
npx wrangler d1 create cck-sis-db

# 2. Create the tables
npm run db:schema

# 3. Load data: put students.json, enrollments.json and historical_grades.json
#    in a private/ folder (ignored by git), then:
node tools/build-seed.mjs --admin-password "choose-a-strong-password"
npm run db:seed

# 4. Deploy
npm run deploy
```

To run locally: `npm run db:schema:local && npm run db:seed:local && npm run dev`, then open
http://localhost:8787.

### Deploy on every push

In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, pick this repo.
Cloudflare then builds and deploys each push to `main`. To use your own domain:
**the Worker → Settings → Domains & Routes → Add → Custom domain**.

## API

| Method | Path | Who |
|--------|------|-----|
| POST | `/api/auth/login` | anyone |
| POST | `/api/auth/logout` | logged in |
| GET | `/api/auth/me` | anyone |
| POST | `/api/auth/password` | admin |
| GET | `/api/data` | logged in (scoped by role) |
| GET | `/api/historical-grades` | logged in (scoped by role) |
| POST / PUT / DELETE | `/api/students[/:id]` | admin |
| POST | `/api/query` | admin (allocations, timetables, sync) |
| POST | `/api/admin/delete-all` | admin + password |
| GET | `/api/health` | anyone |

## Data statistics

| Entity | Count |
|--------|-------|
| Students | 662 |
| Courses | 131 |
| Instructors | 24 |
| Enrollment rows | 2,527 |
| Historical grade records | 2,235 |

---
Canadian College of Kuwait
