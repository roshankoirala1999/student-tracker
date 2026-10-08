# Student Tracker

A React + TypeScript teaching workspace with classes, sections, students, attendance, marks, CSV/XLSX import/export, messaging, and administration.

## Run locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Without `MONGODB_URI`, development uses a local demo database saved in `server/.data/db.json`. This folder is ignored by Git. Demo teacher: `teacher1` / `TeacherPassword123!`. Demo admin: `admin` / `AdminPassword123!`. Demo storage is for local evaluation, not production.

## Production

Copy `.env.example` to `.env`, set `MONGODB_URI`, a unique `JWT_SECRET` of at least 32 characters, and an `ADMIN_BOOTSTRAP_KEY` for initial administrator setup. Configure TLS and database backups for your deployment.

```sh
npm run build
npm start
```

The compiled server defaults to production mode. Production requires MongoDB and does not use the demo database. A failed configured database connection never switches to demo data. Restart the server after correcting database configuration. The server expects one trusted reverse proxy; adjust `trust proxy` to match your infrastructure before deployment.

## Checks

```sh
npm run lint
npm test
npm run build
npm audit
```

Regression tests create an isolated temporary database and exercise authentication, CSRF protection, ownership checks, class ordering/renaming, attendance, CSV report round-trips, PDF report scope, chat deletion permissions, and student deletion cleanup. They do not touch your development or production records. Live MongoDB deployment and multi-user load testing remain deployment checks.

## Dashboard

- Actual class, section, student, and attendance-enabled class counts.
- Search (press `/`), alphabetical sort, and grid/list layouts.
- Monthly calendar navigation and a personal checklist saved per account on the current device. Checklist items are not synced to the server.
- Responsive navigation, light/dark themes, keyboard focus indicators, and reduced-motion support.
- Original CSS book illustration and animated cards; no proprietary website assets are copied.

## Design references and assets

The information hierarchy was informed by [MyStudyLife](https://mystudylife.com/dashboard-school-planner/) and [Todoist](https://www.todoist.com/help/articles/board-layout-in-todoist-nutzen-AiAVsyEI). Icons use the existing [Lucide](https://lucide.dev/license) package (ISC). The existing Google Fonts link loads Plus Jakarta Sans with system-font fallbacks. Illustrations are authored in CSS and need no image download.

## Import formats

Uploads accept **CSV only**. Download the CSV template/report, retain its headings and student identities, edit values, then upload it. Legacy Excel import endpoints return HTTP 415; legacy Excel download endpoints remain available for compatibility.

## Attendance, marks and assignments

- Attendance opens today's saved record or a new all-present roster. Toggle absences, search by name/roll/symbol, view absent students, add a note, and save. Historical days retain their date.
- Open **Attendance & marks reports · PDF / CSV** from a class, or **Reports · PDF / CSV** from a section. Choose one section or all sections, an attendance date range, or an exam/assignment. PDF reports have repeating table headings and page numbers. PDF generation is loaded only when requested.
- Attendance CSV templates cover the next day for each selected section. Fill every status with `present` or `absent`. Each uploaded section/day must contain its complete roster, consistent date and remarks. Existing day dates cannot be changed through import.
- Marks CSV uses one row per student/assessment. Blank scores remain ungraded; numeric scores must be within the assessment maximum. Validation checks every row before applying any writes. The report importer accepts up to 5 MB / 20,000 rows.
- Marks entry supports assessment filtering and ordered autosaves per cell.

## Messaging

- Search people and messages, see sent/read indicators, and retain drafts while switching conversations.
- **Delete for me** hides a message only for that account. **Unsend for everyone** replaces the sender's own message with a tombstone. Deleting an entire chat hides existing messages from that account's inbox; a new message can reopen the conversation.
- Deleting a teacher account preserves its chat history for other participants, labels the account as deleted, and prevents further replies. The administrator inbox continues to use the existing shared-mailbox model.
- Conversations refresh every seven seconds; open threads refresh every four seconds while the browser tab is visible.

## Interface motion

Shared button feedback, card entrances, dialog transitions, table hover states and form focus rings use short CSS animations. Click rings work with mouse, touch and keyboard, ignore disabled controls, and clean up after completion. The reduced-motion preference disables decorative motion. Surface animations finish without a transform so fixed dialogs are not trapped inside an animated page.
