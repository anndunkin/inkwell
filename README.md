# Inkwell — Writing Tracker

Desktop application for tracking writing ideas, projects, and deadlines.
Built with Electron, React, Vite, shadcn/ui, and SQLite.

## Features
- Writing ideas board with status tracking (New → Developing → Parked → Published)
- Project kanban (Active / On Hold / Completed / Cancelled)
- Deadline tracker with priority levels and overdue alerts
- Dashboard with at-a-glance stats
- Native file menu: New / Open / Save / Save As (.inkwell files)
- Data stored locally in SQLite files you control
- Dark/light mode

## Installation
Download the latest installer from [Releases](https://github.com/anndunkin/inkwell/releases).
- **Windows**: Run `Inkwell-Setup-x.x.x.exe`
- **macOS**: Open `Inkwell-x.x.x.dmg`, drag to Applications

## Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
npm install
npm run rebuild   # rebuild native modules (better-sqlite3) for Electron
```

> `npm install` runs `electron-rebuild` automatically via the `postinstall` hook.
> If you switch between running tests (Node) and the app (Electron), use
> `npm run rebuild:node` / `npm run rebuild` to re-target the native module.

### Run in development
```bash
npm run dev
```
This starts the Vite dev server on port 5173 and launches Electron pointing at it
with hot reload for the renderer.

### Run tests
```bash
npm test          # unit tests (Vitest) — rebuilds better-sqlite3 for Node first
npm run test:e2e  # end-to-end tests (Playwright + Electron) — builds the app first
```

### Build
```bash
npm run build     # build the renderer (dist/renderer) + main/preload (electron/dist)
```

### Build installer
```bash
npm run dist      # produce a platform installer via electron-builder (output: release/)
```

## Data Files
Inkwell stores data in `.inkwell` files (SQLite databases).
- **New file**: File > New File — choose where to save
- **Open existing**: File > Open
- **Save**: Cmd/Ctrl+S
- **Save As**: Cmd/Ctrl+Shift+S

Default location on first launch: `~/Documents/Inkwell/My Writing.inkwell`

The five most recently opened files appear under **File > Recent Files**.

## Architecture
- The Electron **main process** (`electron/main.ts`) owns all SQLite access through
  `better-sqlite3` + Drizzle ORM (`electron/db.ts`). There is no HTTP server.
- The **preload** script (`electron/preload.ts`) exposes a typed `window.inkwell`
  API to the renderer via `contextBridge` with `contextIsolation: true` and
  `nodeIntegration: false`.
- The **renderer** (React + Vite) calls `window.inkwell.*` through a thin wrapper
  (`client/src/lib/ipc.ts`) wired into React Query.

## Tech Stack
- Electron 28+
- React 18 + Vite
- TypeScript
- shadcn/ui + Tailwind CSS
- better-sqlite3
- Drizzle ORM
- Vitest (unit tests)
- Playwright (e2e tests)
