# Inkwell — Writing Tracker

**Version 1.3.2**

Inkwell is a local-first desktop app for writers who want to track ideas from a
spark all the way to publication. Capture ideas, promote them into projects, walk
each project through a milestone pipeline, stay ahead of deadlines, and keep notes
on the publications you pitch — all stored in `.inkwell` files you own, with no
account, server, or network connection.

Built with Electron, React, Vite, shadcn/ui, and SQLite (better-sqlite3 + Drizzle).

## Features

- **Today** — what needs you now: overdue items, the next 7 days (complete or
  snooze in place), active projects with no dates, and ideas ready to promote.
- **Ideas** — capture ideas with status tracking (New, Developing, Parked,
  Published), categories, tags and notes. **Promote** an idea to a project in one
  click.
- **Projects** — a list with stage progress and next due date (or a Board view).
  Each project has its own page: inline-editable title, status, type and outlet,
  stages, dates, notes, recurrence and publication history. No edit dialog.
- **Per-project stages** — every project owns its stage sequence. Start from a
  template, then add, rename, reorder, date or delete stages for that project
  alone. Save any project's stages as a template.
- **Schedule** — deadlines and dated project stages together, as an Agenda or a
  Month calendar. The same view appears on each project's Dates tab. Recurring
  projects schedule their next occurrence when a deadline or "Submitted" stage is
  completed, or you can skip an occurrence.
- **Publications** — outlets with guidelines link, rate, notes, the projects aimed
  at them, and a history of pieces. Finishing a project's last stage offers
  **Mark published**, which records the history entry for you.
- **Settings** — appearance, project types, and stage templates.
- **Safe upgrades** — opening a file from an older version makes a backup first.
- **Native file menu** — New / Open / Save / Save As, plus Recent Files.
- Dark / light mode.

## Installation (Windows)

Inkwell ships as a Windows desktop application.

1. Go to [Releases](https://github.com/anndunkin/inkwell/releases).
2. Download the latest `Inkwell-Setup-1.3.2.exe`.
3. Run the installer and launch Inkwell from the Start menu.

## Using Inkwell

- **Today** — start here each day.
- **Ideas** — add and filter ideas; use **Promote to project** when one is ready.
- **Projects** — create a project with a title, type, outlet and stage template;
  you land on its page to set dates and work through the stages.
- **Schedule** — add deadlines and see everything due, in a list or a calendar.
- **Publications** — keep notes on each outlet and review your history.
- **Settings** — project types and stage templates.

See [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) for a full walkthrough and keyboard
shortcuts.

## File Format

Inkwell stores each workspace in a single `.inkwell` file, which is a standard
**SQLite** database (WAL mode). Everything — ideas, projects, milestones,
deadlines, publications, notes, and settings — lives in that one file, so you can
back it up, sync it, or move it like any other document.

- **New file**: File > New File — choose where to save
- **Open existing**: File > Open
- **Save**: Ctrl+S
- **Save As**: Ctrl+Shift+S

Default location on first launch: `~/Documents/Inkwell/My Writing.inkwell`. The
five most recently opened files appear under **File > Recent Files**.

### Upgrading older files

Files from 1.2.x use schema version 1. Opening one in 1.3.0 first writes a backup
named `<file>.pre-v2-backup-<timestamp>.inkwell` next to it, then upgrades the file
(outlets become records, each project gets its own copy of the stage sequence, your
old milestone-name list becomes the default template "Standard"). If the backup
cannot be written, the file is left untouched. A notice names the backup.
Older versions of Inkwell cannot be relied on to read an upgraded file.

## Development

### Prerequisites
- Node.js 20.19+
- npm

### Setup
```bash
git clone https://github.com/anndunkin/inkwell.git
cd inkwell
npm ci            # install dependencies (runs electron-rebuild via postinstall)
```

> If you switch between running tests (Node ABI) and the app (Electron ABI),
> re-target the native module with `npm run rebuild:node` / `npm run rebuild`.

### Run in development
```bash
npm run dev       # Vite dev server on :5173 + Electron with renderer hot reload
```

### Build
```bash
npm run build     # renderer (dist/renderer) + main/preload (electron/dist)
npm run dist      # Windows installer via electron-builder (output: release/)
```

## Testing

```bash
npm run rebuild:node && npm test          # unit tests (Vitest)
xvfb-run --auto-servernum npm run test:e2e # end-to-end tests (Playwright + Electron)
```

Unit tests cover the SQLite/Drizzle data layer, recurring-deadline logic, and a
dedicated **security** suite (SQL-injection resistance, input-validation edge
cases, path-handling contract, and data-integrity/cascade guarantees — see
[`docs/SECURITY.md`](docs/SECURITY.md)). E2E tests drive the built Electron app, including upgrading a 1.2.x file (with
its backup) and completing items on Today and checking Schedule.

Pull requests also run the **Build and test Windows installer** workflow
(`.github/workflows/build-installer.yml`). It type-checks, runs the E2E suite,
builds the NSIS installer, silently installs it, launches the installed app to
confirm the packaged SQLite database opens, and uninstalls it. The installer is
attached to the run as the `Inkwell-Setup` artifact; the workflow publishes
nothing. Releases are made separately by pushing a `v*` tag. Not covered:
upgrading over an installed copy, repair, and code signing.

## Architecture

- The Electron **main process** (`electron/main.ts`) owns all SQLite access
  through `better-sqlite3` + Drizzle ORM (`electron/db.ts`). There is no HTTP
  server and no network access.
- The **preload** script (`electron/preload.ts`) exposes a typed `window.inkwell`
  API to the renderer via `contextBridge` with `contextIsolation: true` and
  `nodeIntegration: false`.
- The **renderer** (React + Vite) calls `window.inkwell.*` through a thin wrapper
  (`client/src/lib/ipc.ts`) wired into React Query.

## Tech Stack

- Electron 43 + electron-builder 26
- React 19 + Vite 8 + TypeScript 7
- shadcn/ui (Radix UI) + Tailwind CSS 4
- better-sqlite3 12 + Drizzle ORM
- Vitest 4 (unit) + Playwright (e2e)

## Version History

- **v1.3.2** (2026-11-26) — Skip this occurrence for recurring projects.
- **v1.3.1** (2026-11-26) — Fix: completing a recurring project's deadline no longer leaves
  it showing as open on Today and Schedule.
- **v1.3.0** (2026-11-25) — Structure redesign: Today and Schedule (agenda and
  calendar), project pages replacing the edit dialog, per-project stage sequences
  and templates, Publications as records, promote and mark-published flows, and a
  backed-up schema v2 migration.
- **v1.2.9** (2026-11-25) — Delete confirmations, visible action menus, pinned dialog
  footers, local-date fixes.
- **v1.2.7** (2026-08-13) — Full dependency modernization: Electron 43, React 19, Vite 8, TypeScript 7, Tailwind CSS 4, Vitest 4, current Radix UI/Drizzle/Playwright tooling, and current application dependencies. Updated the DayPicker, Recharts, and resizable-panel integrations for their new APIs; preserved the `keyv@4.5.4` and `cacheable-request@7.0.4` security pins and the safe `better-sqlite3` 12.x line.
- **v1.1.0** (2026-07-22) — Dashboard Upcoming list now merges deadlines and
  milestone due dates sorted soonest-first; recurring projects auto-spawn their
  next deadline; milestones reworked into a horizontal progress pipeline;
  per-publication notes; added a security test suite and expanded documentation.
- **v1.0.0** — Initial release: ideas board, project kanban, deadline tracker,
  dashboard, local `.inkwell` SQLite files, native file menu.

See [`docs/CHANGELOG.md`](docs/CHANGELOG.md) for the full changelog.

## Security note: pinned dependencies

`keyv` and `cacheable-request` are pinned to `4.5.4` and `7.0.4` respectively via
the `overrides` field in `package.json`. This is a deliberate protection against
the August 2026 Keyv/Cacheable npm supply chain attack, which compromised
`keyv@6.0.0`, `cacheable-request@13.0.20`, and 400+ other packages
(see the [Wiz writeup](https://www.wiz.io/blog/keyv-and-cacheable-npm-supply-chain-attack)).

These are transitive dependencies pulled in via `got` → `@electron/get` → `electron`.
**Before removing or updating these overrides**, verify that newer versions of
`keyv`/`cacheable-request` are confirmed clean against current npm security advisories.

