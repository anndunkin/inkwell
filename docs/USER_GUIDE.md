# Inkwell User Guide

Inkwell helps you capture writing ideas, organize them into projects, and stay
ahead of your deadlines — all stored in local `.inkwell` files you control.

## Getting Started

When you first launch Inkwell, it creates a database at
`~/Documents/Inkwell/My Writing.inkwell`. Everything you enter is saved into the
currently open `.inkwell` file. The file status bar at the top of the window shows
which file you are editing and whether you have unsaved changes.

The sidebar has five places: **Today**, **Ideas**, **Projects**, **Schedule** and
**Publications**. **Settings** and the dark/light toggle are at the bottom.

## Today

Today shows what needs you now:
- **Overdue** and **Due in the next 7 days** — deadlines and dated project stages
  together. Use **Done** to complete an item, or the menu to snooze it one week,
  open its project or delete it.
- **Projects with no dates** — active projects with nothing scheduled.
- **Ideas waiting** — **Promote** turns one into a project and opens it.

## Ideas

Capture ideas with a title, type, status, tags and notes. Filter by status or type
and search. **Promote to project** creates a project from the idea (using the
default stage template), moves the idea to Developing, and opens the project. If
the idea already has a project, the button becomes **Open project**. The card menu
has Edit and Delete; deleting asks for confirmation.

## Projects

The Projects page lists your open projects with outlet, current stage with progress,
next due date and status. Use the filter to see completed or cancelled work, and
switch to **Board** for status columns.

**New project** opens a quick-add row: title, type, outlet and stage template. Create
takes you to the project page.

### The project page

There is no edit dialog. Change the title, status, type and outlet right on the page;
changes save as you make them (text fields save when you click away).

- **Stages** — this project's own sequence. Click a stage to set its status, due date
  and notes, rename it, move it earlier or later, or delete it. **Add a stage** at the
  bottom. **Add from template** appends any template's missing stages.
  **Save as template** stores this project's stages as a new template.
- **Mark published** — when the last stage is complete, a banner offers to mark the
  project published. That sets the project to Completed, its idea to Published, and
  logs a publication history entry when an outlet is set.
- **Overview** — description, the idea it came from, and **Recurring**. For a recurring
  project, completing a deadline or the stage named "Submitted" creates the next
  occurrence; **Schedule next occurrence** does it on demand. **Skip this occurrence** asks for
  confirmation, marks the open deadlines skipped, closes this occurrence as cancelled
  and schedules the next one. Nothing is deleted. Skipped deadlines appear under
  "Show completed" on Schedule.
- **Dates** — this project's deadlines and stage dates as an Agenda or Month calendar,
  with **Add deadline**.
- **Notes** — free-form notes.
- **History** — where this project was published or submitted.

Deleting a project (from its menu) states how many stages and deadlines go with it
and asks for confirmation. Publication history is kept.

## Schedule

Schedule combines deadlines and dated stages from every project. Switch between
**Agenda** (Overdue, Due this week, Upcoming, Completed) and **Calendar** (month grid;
click a day to see its items). Filter by search text, project and priority, and tick
**Show completed** to include finished items. **New deadline** adds a deadline, which
you can link to a project.

## Publications

Choose an outlet on the left, or add one. On the right: rename it, add a guidelines
link and rate, and keep notes (editor contacts, pitching tips). You also see open
projects aimed at the outlet and its history; **Log a piece** records something
published elsewhere. Deleting an outlet unlinks its projects and keeps history.

## Settings

- **Appearance** — light or dark.
- **Project types** — the list used by the type menus.
- **Stage templates** — named starting sequences. Create, rename, edit, reorder and
  delete them, and mark one as the default. Changing a template never alters projects
  already created from it.

## Working With Files

Inkwell behaves like a classic desktop document editor:

- **New File** creates a fresh, empty `.inkwell` database at a location you choose.
- **Open...** opens an existing `.inkwell` file.
- **Save** writes your changes durably and clears the "unsaved" indicator.
- **Save As...** copies the current data into a new file and switches to it.
- **Recent Files** lists your five most recently opened files.

### Upgrading from 1.2.x

The first time you open a file made by an older version, Inkwell writes a backup
named `<file>.pre-v2-backup-<timestamp>.inkwell` in the same folder, then upgrades the
file and shows a notice. Your outlets become Publications, the old milestone-name list
becomes the default template "Standard", and each project receives its own copy of the
stages in the order it showed before. If the backup cannot be written, nothing changes.
To go back, close Inkwell and open the backup with the older version.

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
