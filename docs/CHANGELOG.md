# Changelog

All notable changes to Inkwell are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

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
