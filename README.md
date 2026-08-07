# Inkwell — Writing Tracker

**Version 1.1.0**

Inkwell is a local-first desktop app for writers who want to track ideas from a
spark all the way to publication. Capture ideas, promote them into projects, walk
each project through a milestone pipeline, stay ahead of deadlines, and keep notes
on the publications you pitch — all stored in `.inkwell` files you own, with no
account, server, or network connection.

Built with Electron, React, Vite, shadcn/ui, and SQLite (better-sqlite3 + Drizzle).

## Features

- **Ideas board** — capture writing ideas with status tracking
  (New → Developing → Parked → Published), categories, tags, and notes.
- **Projects** — kanban board (Active / On Hold / Completed / Cancelled) with a
  project **type**, an optional **target publication**, and optional
  **recurring** scheduling (weekly / biweekly / monthly / quarterly / annual).
- **Milestone pipeline** — each project shows a horizontal progress pipeline of
  stage chips (e.g. First Draft → With Editor → Copy Edit → Published). Click a
  chip to mark it complete and advance to the next stage, optionally setting a due
  date; completed stages are checked off and the active stage is highlighted.
- **Deadlines** — priority-based deadline tracker grouped into Overdue, Due This
  Week, Upcoming, and Completed/Missed. Recurring projects **auto-spawn** their
  next deadline when the current one passes or is completed.
- **Publications** — track the outlets you write for, with per-publication
  freeform **notes** (editor contacts, submission guidelines, rates) and a
  publication history.
- **Dashboard** — at-a-glance stats plus an Upcoming list that merges deadlines
  and due-dated milestones, **sorted soonest-first**.
- **Settings** — editable lists for project types, publications, and the
  milestone-name sequence that drives the pipeline order.
- **Native file menu** — New / Open / Save / Save As, plus Recent Files.
- Dark / light mode.

## Installation (Windows)

Inkwell ships as a Windows desktop application.

1. Go to [Releases](https://github.com/anndunkin/inkwell/releases).
2. Download the latest `Inkwell-Setup-1.1.0.exe`.
3. Run the installer and launch Inkwell from the Start menu.

## Using Inkwell

- **Dashboard** — overview stats and an Upcoming panel that combines deadlines and
  milestone due dates, sorted by soonest due date.
- **Ideas** — add ideas with a title, category, status, tags, and notes; filter
  and search; edit or delete from each card.
- **Projects** — create projects, optionally link an idea, set a type / target
  publication, and mark a project recurring. Each project card carries a milestone
  pipeline you advance stage by stage.
- **Deadlines** — add deadlines with a due date and priority; recurring projects
  generate their next occurrence automatically.
- **Publications** — keep notes on each outlet and review your publication history.
- **Settings** — customize the dropdown lists and the milestone sequence.

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

## Development

### Prerequisites
- Node.js 18+
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
[`docs/SECURITY.md`](docs/SECURITY.md)). E2E tests drive the built Electron app.

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

- Electron 28+
- React 18 + Vite + TypeScript
- shadcn/ui + Tailwind CSS
- better-sqlite3 + Drizzle ORM
- Vitest (unit) + Playwright (e2e)

## Version History

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

