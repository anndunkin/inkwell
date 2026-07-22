# Inkwell User Guide

Inkwell helps you capture writing ideas, organize them into projects, and stay
ahead of your deadlines — all stored in local `.inkwell` files you control.

## Screenshots

> Replace these placeholders with real screenshots after a build.

- Dashboard — `docs/screenshots/dashboard.png`
- Ideas board — `docs/screenshots/ideas.png`
- Projects kanban — `docs/screenshots/projects.png`
- Deadlines tracker — `docs/screenshots/deadlines.png`

## Getting Started

When you first launch Inkwell, it creates a database at
`~/Documents/Inkwell/My Writing.inkwell`. All your ideas, projects, and deadlines
are saved into the currently open `.inkwell` file. The file status bar at the top
of the window always shows which file you are editing and whether you have unsaved
changes (an "Unsaved" badge appears next to the filename, and the title bar shows
a `*`).

## Dashboard

The Dashboard gives you an at-a-glance overview:
- **Writing Ideas** — total ideas and how many are still "new"
- **Active Projects** — active project count out of your total
- **Upcoming Deadlines** — pending deadlines **and** due-dated project milestones,
  merged into one list sorted soonest-first, with an overdue warning when
  relevant. Milestone entries are marked with a "milestone" badge.
- **Upcoming Deadlines / Active Projects / Recent Ideas** panels link straight to
  the matching page.

## Ideas

1. Click **Ideas** in the sidebar.
2. Click **New Idea**.
3. Fill in a title (required), description, type, status, tags (comma-separated),
   and notes.
4. Click **Save Idea**.

Ideas are grouped by status (New, Developing, Parked, Published). Use the search
box and the Status/Type filters to narrow the list. Hover a card to reveal the
**edit** (pencil) and **delete** (trash) actions.

## Projects

1. Click **Projects** in the sidebar.
2. Click **New Project** and complete the form. Optionally link the project to an
   existing idea.
3. Click **Create Project**.

Projects appear on a **kanban board** with columns for Active, On Hold, Completed,
and Cancelled. Toggle between **Kanban** and **List** views with the buttons in the
toolbar. Hover a card to edit or delete it. Deleting a project also removes its
milestones and deadlines.

A project can have a **type**, a target **publication**, and can be marked
**recurring** with an interval (weekly, biweekly, monthly, quarterly, annual).
Recurring projects automatically generate their next deadline once the current one
passes or is completed — so a weekly column always has its next due date waiting.

### Milestone pipeline

Each project card shows a horizontal **milestone pipeline** — a row of stage chips
(for example: First Draft → With Editor → Copy Edit → Published). The order follows
the milestone-name sequence in **Settings**.

- Completed stages are filled in and checked off.
- The current (first not-yet-completed) stage is highlighted.
- Upcoming stages are muted.

Click a chip to open the advance dialog: mark the stage **complete** and optionally
choose the **next milestone** and its due date, which adds that stage to the
pipeline. Clicking an already-completed chip lets you reopen it. Use the **+**
button at the end of the row to add a milestone directly.

## Publications

1. Click **Publications** in the sidebar.
2. Each publication card shows your history with that outlet.
3. Expand the **notes** section on a card to record editor contacts, submission
   guidelines, pay rates, or anything else. Notes save automatically when you click
   away and persist in your `.inkwell` file.

## Deadlines

1. Click **Deadlines** in the sidebar.
2. Click **New Deadline**, set a title and due date, choose a priority, and
   optionally link a project.
3. Click **Add Deadline**.

Deadlines are sorted by due date and grouped into **Overdue**, **Due This Week**,
**Upcoming**, and **Completed / Missed**. Overdue and urgent items are highlighted.
Click the check-circle to mark a deadline complete. Completing a deadline that
belongs to a recurring project automatically schedules the next occurrence.
Due-dated project milestones also appear here alongside deadlines.

## Working With Files

Inkwell behaves like a classic desktop document editor:

- **New File** creates a fresh, empty `.inkwell` database at a location you choose.
- **Open...** opens an existing `.inkwell` file.
- **Save** writes your changes durably and clears the "unsaved" indicator.
- **Save As...** copies the current data into a new file and switches to it.
- **Recent Files** lists your five most recently opened files.

If you try to create/open a new file or close the app while you have unsaved
changes, Inkwell prompts you to **Save**, **Don't Save**, or **Cancel**.

## Keyboard Shortcuts

| Action          | Windows / Linux   | macOS              |
| --------------- | ----------------- | ------------------ |
| New File        | Ctrl+N            | Cmd+N              |
| Open...         | Ctrl+O            | Cmd+O              |
| Save            | Ctrl+S            | Cmd+S              |
| Save As...      | Ctrl+Shift+S      | Cmd+Shift+S        |
| Quit            | Ctrl+Q            | Cmd+Q              |
| Cut             | Ctrl+X            | Cmd+X              |
| Copy            | Ctrl+C            | Cmd+C              |
| Paste           | Ctrl+V            | Cmd+V              |
| Select All      | Ctrl+A            | Cmd+A              |
| Actual Size     | Ctrl+0            | Cmd+0              |
| Zoom In         | Ctrl+Plus         | Cmd+Plus           |
| Zoom Out        | Ctrl+Minus        | Cmd+Minus          |

## Troubleshooting

**The app shows a blank window.**
Ensure the renderer was built (`npm run build`). In development, make sure the Vite
dev server is running on port 5173 (`npm run dev` starts both automatically).

**"Cannot find module 'better-sqlite3'" or an ABI/NODE_MODULE_VERSION error.**
The native SQLite module must match the runtime. Run `npm run rebuild` to compile it
for Electron, or `npm run rebuild:node` to compile it for plain Node (used by unit
tests). `npm test` and `npm run test:e2e` handle this automatically.

**My changes disappeared.**
Confirm you saved to the intended file. The file status bar shows the active path;
use **Save As...** to write a separate copy before experimenting.

**Where is my data stored?**
In the `.inkwell` SQLite file shown in the status bar. The default first-launch file
is `~/Documents/Inkwell/My Writing.inkwell`. Back it up like any other document.
