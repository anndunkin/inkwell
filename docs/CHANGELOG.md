# Changelog

All notable changes to Inkwell are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.7] — 2026-08-13

### Changed
- **Full dependency modernization** — upgraded the desktop runtime to Electron
  43.4.0 and electron-builder 26.15.3; upgraded the renderer to React 19.2.8,
  Vite 8.2.1, TypeScript 7.0.2, Tailwind CSS 4.3.3, Vitest 4.1.10, and current
  Radix UI, Drizzle, Playwright, React Query, React Hook Form, Zod, and related
  application and build tooling releases.
- **Tailwind integration** now uses the Tailwind CSS 4 Vite plugin, CSS-first
  theme tokens, and `tw-animate-css`.
- **Calendar integration** now uses the supported `@daypicker/react` package and
  its current class-name and chevron-component APIs.
- **Chart and layout wrappers** now use the Recharts 3 tooltip/legend content
  types and react-resizable-panels 4 `Group`/`Separator` APIs.
- Corrected the publication-history mutation typing and the SQLite database type
  annotation; `npm run check` is now clean.

### Security
- Retained the `keyv@4.5.4` and `cacheable-request@7.0.4` package-lock security
  pins through the dependency refresh.
- Kept `better-sqlite3` on the compatible 12.x line at 12.11.1. Version 13.x is
  intentionally excluded because it segfaults in the supported sandbox.

## [1.1.0] — 2026-07-22

### Added
- **Milestone pipeline** — projects now display a horizontal progress pipeline of
  stage chips. Clicking a chip opens a dialog to mark the stage complete and
  advance to the next stage (with an optional due date); completed stages are
  checked off, the active stage is highlighted, and upcoming stages are muted.
  Completed chips can be reopened. Pipeline order follows the milestone-name
  sequence in Settings.
- **Recurring deadline auto-spawn** — when a recurring project's deadline passes
  or is marked complete, Inkwell automatically generates the next occurrence based
  on the project's interval (weekly / biweekly / monthly / quarterly / annual).
  Runs on file open and after completing a deadline.
- **Per-publication notes** — keep freeform notes (editor contacts, submission
  guidelines, rates) on each publication card.
- **Security test suite** (`tests/unit/security.test.ts`) — SQL-injection
  resistance, input-validation edge cases, file-path handling contract, and
  data-integrity/cascade guarantees.
- **Documentation** — expanded README for v1.1.0, new `docs/SECURITY.md`
  (security model), and this changelog.

### Changed
- **Dashboard Upcoming list** now merges deadlines and due-dated milestones into a
  single list sorted soonest-first; milestone entries are labeled with a badge.
- **Milestone status values** normalized to `not_started` / `in_progress` /
  `completed` / `blocked`, with a `completedAt` timestamp set on completion.
- **Deleting a project now cascades** to remove its milestones and deadlines in a
  single transaction, preventing orphaned rows.

### Removed
- Legacy collapsible `MilestonesPanel` component, replaced by the inline
  `MilestonePipeline`.

## [1.0.0] — Initial release

### Added
- Writing **Ideas** board with status tracking (New → Developing → Parked →
  Published), categories, tags, and notes.
- **Projects** kanban (Active / On Hold / Completed / Cancelled) with project type
  and optional linked idea.
- **Deadlines** tracker with priority levels and overdue alerts.
- **Dashboard** with at-a-glance stats.
- **Publications** tracking with publication history.
- **Settings** with editable lists (project types, publications, milestone names).
- Native **file menu**: New / Open / Save / Save As, with Recent Files.
- Local-first storage in `.inkwell` SQLite files, dark/light mode.
