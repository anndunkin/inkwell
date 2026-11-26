# Changelog

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

## [1.2.9] - 2026-11-25

Phase 1 of the structure redesign: safety and polish. No data-format changes.

### Added
- Every delete now asks for confirmation. Deleting a project states how many milestones and deadlines go with it.
- Always-visible "more actions" menus replace hover-only edit and delete icons on ideas, projects, deadlines and publication history.
- Dialog footers stay pinned at the bottom so Save and Cancel remain reachable on small windows; long forms scroll.
- Dashboard greeting follows the time of day.

### Fixed
- Dates now use the local calendar everywhere. Previously "today" and recurring due dates were computed in UTC, which could be a day ahead in the evening and could shift dates by one day.
- Milestone chip names are no longer cut off at 12 characters.

## [1.2.8] - 2026-11-02

### Security
- Electron 43.4.0 -> 43.8.6 (patch release on the same major; fixes advisories against 43.4.0).
- Cleared the 2 critical and 12 high audit findings: concurrently 10.0.6, vite 8.3.5, zod 4.6.7, plus transitive fixes for shell-quote, axios, follow-redirects, joi, source-map-js, @xmldom/xmldom, brace-expansion, fast-uri, js-yaml and undici.
- `keyv` 4.5.4 and `cacheable-request` 7.0.4 overrides verified intact.

### Changed
- React / React DOM 19.3.1, @hookform/resolvers 7.0.1 (zod resolver verified against zod 4), react-hook-form 7.91.0, framer-motion 14.9.0, @daypicker/react 10.0.2, @tanstack/react-query 5.105.3, drizzle-orm 0.45.4, electron-builder 26.18.1, Tailwind CSS 4.3.4, all Radix UI packages, and related UI, type, test and build tooling.
- Verified: TypeScript check, production build, and all 29 unit tests pass.

### Notes
- Remaining 21 moderate findings are one minimatch denial-of-service advisory inside electron-builder's build-time toolchain and Vitest's development tooling; they do not ship in the installed app, and npm's only suggested "fix" is a downgrade.
