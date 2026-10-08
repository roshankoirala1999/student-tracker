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

Regression tests create an isolated temporary database and exercise authentication, CSRF protection, ownership checks, class ordering/renaming, attendance, CSV/XLSX round-trips, and student deletion cleanup. They do not touch your development or production records. Live MongoDB deployment and multi-user load testing remain deployment checks.

## Dashboard

- Actual class, section, student, and attendance-enabled class counts.
- Search (press `/`), alphabetical sort, and grid/list layouts.
- Monthly calendar navigation and a personal checklist saved per account on the current device. Checklist items are not synced to the server.
- Responsive navigation, light/dark themes, keyboard focus indicators, and reduced-motion support.
- Original CSS book illustration and animated cards; no proprietary website assets are copied.

## Design references and assets

The information hierarchy was informed by [MyStudyLife](https://mystudylife.com/dashboard-school-planner/) and [Todoist](https://www.todoist.com/help/articles/board-layout-in-todoist-nutzen-AiAVsyEI). Icons use the existing [Lucide](https://lucide.dev/license) package (ISC). The existing Google Fonts link loads Plus Jakarta Sans with system-font fallbacks. Illustrations are authored in CSS and need no image download.

## Import formats

CSV routes accept `csvContent`. Excel routes return real `.xlsx` workbooks and accept a base64 data URL in `fileData`. Excel uploads are limited to 5 MB, 5,000 rows, and 250 columns. Convert legacy `.xls` files to `.xlsx` first. Replace spreadsheet formulas with values before uploading. Existing roster and marks validation also applies to Excel imports.
