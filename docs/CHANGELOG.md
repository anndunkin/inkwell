# Changelog

All notable changes to Inkwell are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.1] - 2026-11-26

### Fixed
- Completing a deadline on Today or Schedule could leave it showing as open and overdue. For a recurring project whose next occurrence could not be created (for example no recurrence interval set), the completion was saved but the screens were not refreshed. The next-occurrence step can no longer fail a completion, and the screens now always re-read the saved data. An end-to-end test covers completing items on Today and checking Schedule.

## [1.3.0] - 2026-11-25

Phases 2 to 5 of the structure redesign. Opening an older file upgrades it to schema version 2 after making an automatic backup.

### Added
- **Today** page replaces the Dashboard: overdue items, the next 7 days (complete or snooze in place), active projects with no dates, and ideas waiting to be promoted.
- **Schedule** page replaces Deadlines. Deadlines and dated project stages appear together in an Agenda or a Month calendar, with search and project, priority and completed filters. The same Agenda/Calendar view appears on each project's Dates tab.
- **Project page** (`/projects/:id`) replaces the nine-field edit dialog. Title, status, type and outlet save as you edit; stage details, description, notes, recurrence and history live on the page.
- **Per-project stage sequences.** Every project owns its stages: add, rename, reorder, set due dates and notes, delete. Start from a template, add stages from another template later, or save a project's stages as a new template.
- **Stage templates** in Settings: create, rename, edit, reorder, choose the default.
- **Promote** button on ideas (also on Today). Promoting creates the project, moves the idea to Developing, and opens the project. Promoting twice opens the existing project.
- **Mark published** banner when a project's last stage is complete: sets the project completed, the idea published, and logs publication history.
- **Projects list** (default) with stage progress and next due date, plus the Board view; completed and cancelled projects are hidden by default.
- **Publications** are now real records with a master/detail page: rename, guidelines link, rate, notes, projects aimed at the outlet, and history.
- One-time notice after an upgrade, naming the backup file.

### Changed
- Navigation is Today, Ideas, Projects, Schedule, Publications; Settings and the theme toggle moved to the sidebar footer.
- Settings now holds only preferences: appearance, project types and stage templates. Outlets moved to Publications.
- Opening a file that fails to load keeps the previously open file and shows an error.
- A recurring project's next occurrence is still created when its deadline or its "Submitted" stage is completed; the project page has a "Schedule next occurrence" button.

### Testing
- New end-to-end suite opens a generated 1.2.x file in Electron and checks the upgrade notice, the backup, data integrity, the legacy project page, and that reopening makes no second backup. The test-only `INKWELL_TEST_OPEN_DB` variable opens an existing file without resetting it.

### Data format
- Schema version 2 adds `publications`, `milestone_templates` and `projects.publication_id`. Older files are upgraded in one transaction after `VACUUM INTO` writes `<name>.pre-v2-backup-<timestamp>.inkwell` beside the original; if the backup cannot be written the file is left untouched. Projects keep the old outlet name text as well, so older readers still work, but files saved by 1.3.0 should be opened with 1.3.0 or later.

## [1.2.9] — 2026-11-25

Delete confirmations everywhere, always-visible action menus, pinned dialog footers, local-date fixes (see the root `CHANGELOG.md`).

## [1.2.8] — 2026-11-02

Security and dependency updates (see the root `CHANGELOG.md`).

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
