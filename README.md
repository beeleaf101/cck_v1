# CCK Student Information System

A comprehensive Student Information System for Canadian College of Kuwait (CCK) featuring course management, timetable generation, academic advising, and analytics.

## Features

- **Student Portal**: View enrolled courses, timetables, study plans, and academic progress
- **Admin Portal**: Manage students, courses, instructors, and generate timetables
- **AI Timetable Generation**: Automatic conflict-free schedule generation
- **Course Advising**: Record student course selections for next semester
- **Analytics Dashboard**: Real-time insights with modern visualizations
- **Supabase Integration**: Cloud database with offline support

## Quick Start

### 1. Local Development (No Database)

Simply open `index.html` in a browser. The system will run with local JSON data.

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Then open http://localhost:8000
```

### 2. With Supabase Database

#### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be ready

#### Step 2: Run Database Schema

1. Go to SQL Editor in your Supabase dashboard
2. Copy the contents of `database/schema.sql`
3. Run the SQL to create all tables

#### Step 3: Configure Connection

Edit `js/supabase-client.js` and replace the placeholder values:

```javascript
const SUPABASE_CONFIG = {
    url: 'https://YOUR_PROJECT_ID.supabase.co',
    anonKey: 'YOUR_ANON_KEY'
};
```

You can find these values in:
- Supabase Dashboard → Settings → API
- `url` = Project URL
- `anonKey` = anon/public key

#### Step 4: Migrate Data

1. Open the application in browser
2. Open browser console (F12)
3. Run: `showMigrationUI()`
4. Click "Start Migration" to import JSON data to database

## Project Structure

```
cck-sis-v2/
├── index.html              # Main HTML file
├── app.js                  # Main application logic (8000+ lines)
├── styles.css              # All CSS styles
├── database/
│   └── schema.sql          # Supabase database schema
├── js/
│   ├── supabase-client.js  # Supabase client configuration
│   ├── database-integration.js  # Database connection layer
│   └── data-migration.js   # Data migration utilities
├── students.json           # Student data (private – not in this repo)
├── courses.json            # Course catalog (131 courses)
├── instructors.json        # Instructor data (24 instructors)
├── enrollments.json        # Enrollment records (private – not in this repo)
├── historical_grades.json  # Grade history (private – not in this repo)
├── study_plans.json        # Study plans for all programs
└── README.md               # This file
```

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `semesters` | Academic semesters (Spring 2025, Fall 2024, etc.) |
| `programs` | Degree programs (Diploma, Bachelor) |
| `students` | Student records with academic info |
| `instructors` | Faculty information |
| `courses` | Course catalog |
| `course_sections` | Course offerings per semester |
| `enrollments` | Student course enrollments |

### Advising & Scheduling

| Table | Description |
|-------|-------------|
| `advising_sessions` | Academic advising records |
| `advising_selections` | Course selections per session |
| `course_demand` | Aggregated course demand |
| `timetables` | Generated schedules |
| `timetable_entries` | Individual schedule entries |
| `rooms` | Classroom/lab information |
| `room_bookings` | Room reservations |

### Supporting Tables

| Table | Description |
|-------|-------------|
| `study_plans` | Curriculum requirements |
| `instructor_assignments` | Course assignments |
| `audit_log` | Change tracking |
| `system_settings` | Configuration |

## Default Login Credentials

### Student Portal
- **Username**: Any student ID (e.g., `202401223`)
- **Password**: `student123`

### Admin Portal
- **Username**: `admin`
- **Password**: `admin123`

## API Reference

### Database Service Methods

```javascript
// Students
await db.getStudents(filters)
await db.getStudentById(studentId)
await db.createStudent(student)
await db.updateStudent(id, updates)

// Instructors
await db.getInstructors(filters)
await db.createInstructor(instructor)

// Courses
await db.getCourses(filters)
await db.getCourseByCode(code)

// Enrollments
await db.getEnrollments(filters)
await db.createEnrollment(enrollment)
await db.bulkCreateEnrollments(enrollments)

// Advising
await db.getAdvisingSessions(filters)
await db.createAdvisingSession(session, selections)

// Timetables
await db.getTimetables(filters)
await db.createTimetable(timetable, entries)
await db.publishTimetable(id)
```

### Data Migration

```javascript
// Run full migration
await runFullMigration()

// Export data to JSON
exportDataToJson()

// Import from JSON file
await importDataFromJson(file)
```

## Offline Support

The system works offline with the following features:

- **Local Storage**: Changes are queued when offline
- **Auto-Sync**: Queued changes sync when connection restores
- **Status Indicator**: Bottom-right shows connection status
- **Graceful Fallback**: Uses local JSON when database unavailable

## Environment Variables (Optional)

For production deployment, you can use environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Technologies Used

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: Supabase (PostgreSQL)
- **Icons**: SVG icons (no external dependencies)
- **Fonts**: Inter, IBM Plex Arabic

## Data Included

- **662 Students** across 10 programs
- **131 Courses** with full details
- **24 Instructors** with specializations
- **2,527 Enrollments** for Spring 2025
- **8 Study Plans** (4 Diploma + 4 Bachelor programs)

## Support

For issues or questions, please contact the IT department at Canadian College of Kuwait.

## License

Proprietary - Canadian College of Kuwait
