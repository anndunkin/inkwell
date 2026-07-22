import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { InkwellDB } from "./db";
import { FileSession } from "./fileOps";
import { buildMenu } from "./menu";
import type {
  InsertIdea,
  InsertProject,
  InsertDeadline,
  InsertPublicationHistory,
  InsertMilestone,
} from "../shared/schema";

// ---- Crash logging ----
// Write errors to a log file on disk so we can diagnose silent failures
// in production where there is no visible console.
function getLogPath(): string {
  // app.getPath('userData') is available before app.whenReady on most platforms.
  // Fall back to the temp dir if it isn't.
  try {
    return path.join(app.getPath("userData"), "inkwell-crash.log");
  } catch {
    return path.join(require("os").tmpdir(), "inkwell-crash.log");
  }
}

function writeLog(label: string, err: unknown): void {
  const msg = (err instanceof Error ? err.stack : String(err)) ?? String(err);
  const line = `[${new Date().toISOString()}] ${label}\n${msg}\n\n`;
  try { appendFileSync(getLogPath(), line); } catch { /* non-fatal */ }
}

// Surface unhandled errors as a visible dialog rather than a silent quit.
process.on("uncaughtException", (err) => {
  writeLog("uncaughtException", err);
  const msg = (err instanceof Error ? err.stack : String(err)) ?? String(err);
  if (app.isReady()) {
    dialog.showErrorBox("Inkwell — Unexpected Error", msg);
  } else {
    process.stderr.write(msg + "\n");
  }
  app.exit(1);
});

process.on("unhandledRejection", (reason) => {
  writeLog("unhandledRejection", reason);
  const msg = (reason instanceof Error ? reason.stack : String(reason)) ?? String(reason);
  if (app.isReady()) {
    dialog.showErrorBox("Inkwell — Unhandled Promise Rejection", msg);
  } else {
    process.stderr.write(msg + "\n");
  }
  app.exit(1);
});

// Dev mode = unpackaged AND not explicitly forced to production (e.g. e2e tests
// run the built app via `electron .` with NODE_ENV=production and no Vite server).
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";
const DEV_URL = "http://localhost:5173";
const RECENT_FILES_MAX = 10;
const RECENT_FILES_MENU = 5;

let mainWindow: BrowserWindow | null = null;
const session = new FileSession();
/** Set while we programmatically close the window after a quit confirmation. */
let forceQuit = false;

function recentFilesPath(): string {
  return path.join(app.getPath("userData"), "recent-files.json");
}

function getRecentFiles(): string[] {
  try {
    const raw = readFileSync(recentFilesPath(), "utf-8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list.filter((p) => typeof p === "string" && existsSync(p));
  } catch {
    // No recent-files.json yet, or it is unreadable — start fresh.
  }
  return [];
}

function addRecentFile(filePath: string) {
  const list = [filePath, ...getRecentFiles().filter((p) => p !== filePath)].slice(0, RECENT_FILES_MAX);
  try {
    writeFileSync(recentFilesPath(), JSON.stringify(list, null, 2));
  } catch {
    // Non-fatal: recent files are a convenience, not core data.
  }
}

function defaultDocumentsDir(): string {
  const dir = path.join(app.getPath("documents"), "Inkwell");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function fileTitle(): string {
  const name = session.currentPath ? path.basename(session.currentPath) : "Untitled";
  return `Inkwell — ${name}${session.isDirty ? "*" : ""}`;
}

function updateTitle() {
  mainWindow?.setTitle(fileTitle());
}

function setDirty(value: boolean) {
  session.isDirty = value;
  updateTitle();
}

function openDatabase(filePath: string) {
  session.open(filePath);
  updateTitle();
  addRecentFile(filePath);
  refreshMenu();
  spawnRecurringForActiveDb();
}

/** Generate any missing next occurrences for all recurring projects. */
function spawnRecurringForActiveDb() {
  const db = session.db;
  if (!db) return;
  let spawned = false;
  for (const project of db.getAllProjects()) {
    if (project.isRecurring && project.recurringInterval) {
      if (db.spawnNextRecurringDeadline(project.id)) spawned = true;
    }
  }
  if (spawned) setDirty(true);
}

/** Open the default file on launch, creating it in ~/Documents/Inkwell if needed. */
function openInitialDatabase() {
  // Tests set INKWELL_TEST_DB to a temp path for a clean, isolated database.
  const testDb = process.env.INKWELL_TEST_DB;
  if (testDb) {
    session.newFile(testDb);
    updateTitle();
    return;
  }
  const recent = getRecentFiles();
  if (recent.length > 0 && existsSync(recent[0])) {
    openDatabase(recent[0]);
    return;
  }
  const defaultFile = path.join(defaultDocumentsDir(), "My Writing.inkwell");
  openDatabase(defaultFile);
}

function refreshMenu() {
  buildMenu({
    isDev,
    recentFiles: getRecentFiles().slice(0, RECENT_FILES_MENU),
    handlers: {
      newFile: () => void doNewFile(),
      open: () => void doOpen(),
      save: () => void doSave(),
      saveAs: () => void doSaveAs(),
      openRecent: (p) => {
        if (existsSync(p)) {
          openDatabase(p);
          reloadRenderer();
        }
      },
      about: showAbout,
    },
  });
}

function reloadRenderer() {
  mainWindow?.webContents.send("inkwell:refresh");
}

// ---- File operations (also exposed via IPC) ----

async function doNewFile(): Promise<{ success: boolean; path?: string }> {
  if (!(await confirmDiscardIfDirty())) return { success: false };
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "New Inkwell File",
    defaultPath: path.join(defaultDocumentsDir(), "Untitled.inkwell"),
    filters: [{ name: "Inkwell File", extensions: ["inkwell"] }],
  });
  if (result.canceled || !result.filePath) return { success: false };
  session.newFile(result.filePath);
  updateTitle();
  addRecentFile(result.filePath);
  refreshMenu();
  reloadRenderer();
  return { success: true, path: result.filePath };
}

async function doOpen(): Promise<{ success: boolean; path?: string }> {
  if (!(await confirmDiscardIfDirty())) return { success: false };
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Open Inkwell File",
    properties: ["openFile"],
    filters: [{ name: "Inkwell File", extensions: ["inkwell"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  openDatabase(result.filePaths[0]);
  reloadRenderer();
  return { success: true, path: result.filePaths[0] };
}

async function doSave(): Promise<{ success: boolean; path?: string }> {
  if (!session.currentPath) return doSaveAs();
  const saved = session.save();
  updateTitle();
  return { success: true, path: saved ?? undefined };
}

async function doSaveAs(): Promise<{ success: boolean; path?: string }> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Save Inkwell File As",
    defaultPath: session.currentPath ?? path.join(defaultDocumentsDir(), "My Writing.inkwell"),
    filters: [{ name: "Inkwell File", extensions: ["inkwell"] }],
  });
  if (result.canceled || !result.filePath) return { success: false };

  const target = session.saveAs(result.filePath);
  updateTitle();
  addRecentFile(target);
  refreshMenu();
  return { success: true, path: target };
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!session.isDirty || !mainWindow) return true;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save changes before continuing?",
    detail: session.currentPath
      ? `Unsaved changes in ${path.basename(session.currentPath)} will be lost.`
      : "Unsaved changes will be lost.",
  });
  if (response === 0) {
    await doSave();
    return true;
  }
  if (response === 1) return true;
  return false;
}

function showAbout() {
  dialog.showMessageBox(mainWindow!, {
    type: "info",
    title: "About Inkwell",
    message: "Inkwell",
    detail: `Writing Tracker\nVersion ${app.getVersion()}\n\nCopyright © 2026 Ann Dunkin`,
  });
}

// ---- IPC registration ----

function registerIpc() {
  const requireDb = (): InkwellDB => {
    if (!session.db) throw new Error("No active Inkwell database");
    return session.db;
  };
  const dirtyAfter = <T>(value: T): T => {
    setDirty(true);
    return value;
  };

  // Ideas
  ipcMain.handle("ideas:getAll", () => requireDb().getAllIdeas());
  ipcMain.handle("ideas:create", (_e, data: InsertIdea) => dirtyAfter(requireDb().createIdea(data)));
  ipcMain.handle("ideas:update", (_e, id: number, data: Partial<InsertIdea>) => dirtyAfter(requireDb().updateIdea(id, data)));
  ipcMain.handle("ideas:delete", (_e, id: number) => dirtyAfter(requireDb().deleteIdea(id)));

  // Projects
  ipcMain.handle("projects:getAll", () => requireDb().getAllProjects());
  ipcMain.handle("projects:create", (_e, data: InsertProject) => dirtyAfter(requireDb().createProject(data)));
  ipcMain.handle("projects:update", (_e, id: number, data: Partial<InsertProject>) => dirtyAfter(requireDb().updateProject(id, data)));
  ipcMain.handle("projects:delete", (_e, id: number) => dirtyAfter(requireDb().deleteProject(id)));

  // Deadlines
  ipcMain.handle("deadlines:getAll", () => requireDb().getAllDeadlines());
  ipcMain.handle("deadlines:create", (_e, data: InsertDeadline) => dirtyAfter(requireDb().createDeadline(data)));
  ipcMain.handle("deadlines:update", (_e, id: number, data: Partial<InsertDeadline>) => {
    const updated = dirtyAfter(requireDb().updateDeadline(id, data));
    // When a recurring project's deadline is completed, schedule the next one.
    if (data.status === "completed" && updated?.projectId) {
      requireDb().spawnNextRecurringDeadline(updated.projectId);
    }
    return updated;
  });
  ipcMain.handle("deadlines:delete", (_e, id: number) => dirtyAfter(requireDb().deleteDeadline(id)));
  ipcMain.handle("deadlines:spawnRecurring", (_e, projectId: number) => dirtyAfter(requireDb().spawnNextRecurringDeadline(projectId)));

  // File operations
  ipcMain.handle("file:currentPath", () => session.currentPath);
  ipcMain.handle("file:isDirty", () => session.isDirty);
  ipcMain.handle("file:newFile", () => doNewFile());
  ipcMain.handle("file:open", () => doOpen());
  ipcMain.handle("file:save", () => doSave());
  ipcMain.handle("file:saveAs", () => doSaveAs());
  ipcMain.handle("file:getRecentFiles", () => getRecentFiles().slice(0, RECENT_FILES_MENU));

  // Settings
  ipcMain.handle("settings:get", (_e, key: string) => requireDb().getSetting(key));
  ipcMain.handle("settings:set", (_e, key: string, value: string) => {
    requireDb().setSetting(key, value);
    setDirty(true);
  });

  // Milestones
  ipcMain.handle("milestones:getAll", () => requireDb().getAllMilestones());
  ipcMain.handle("milestones:getForProject", (_e, projectId: number) => requireDb().getMilestonesForProject(projectId));
  ipcMain.handle("milestones:create", (_e, data: InsertMilestone) => dirtyAfter(requireDb().createMilestone(data)));
  ipcMain.handle("milestones:update", (_e, id: number, data: Partial<InsertMilestone>) => dirtyAfter(requireDb().updateMilestone(id, data)));
  ipcMain.handle("milestones:delete", (_e, id: number) => dirtyAfter(requireDb().deleteMilestone(id)));

  // Publication history
  ipcMain.handle("pubHistory:getAll", () => requireDb().getAllPublicationHistory());
  ipcMain.handle("pubHistory:create", (_e, data: InsertPublicationHistory) => dirtyAfter(requireDb().createPublicationHistory(data)));
  ipcMain.handle("pubHistory:update", (_e, id: number, data: Partial<InsertPublicationHistory>) => dirtyAfter(requireDb().updatePublicationHistory(id, data)));
  ipcMain.handle("pubHistory:delete", (_e, id: number) => dirtyAfter(requireDb().deletePublicationHistory(id)));

  // Publication notes
  ipcMain.handle("pubNotes:getAll", () => requireDb().getAllPublicationNotes());
  ipcMain.handle("pubNotes:upsert", (_e, name: string, notes: string) => dirtyAfter(requireDb().upsertPublicationNote(name, notes)));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: fileTitle(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  updateTitle();

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  mainWindow.on("close", (e) => {
    // In test mode, never block close on the unsaved-changes dialog.
    if (forceQuit || !session.isDirty || process.env.INKWELL_TEST_DB) return;
    e.preventDefault();
    void handleCloseRequest();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function handleCloseRequest() {
  if (!mainWindow) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save changes before closing?",
    detail: session.currentPath
      ? `Unsaved changes in ${path.basename(session.currentPath)} will be lost.`
      : "Unsaved changes will be lost.",
  });
  if (response === 2) return; // Cancel
  if (response === 0) await doSave();
  forceQuit = true;
  mainWindow.close();
}

app.whenReady().then(() => {
  writeLog("startup", "app.whenReady fired");
  try {
    openInitialDatabase();
    writeLog("startup", "openInitialDatabase OK");
  } catch (err) {
    writeLog("startup:openInitialDatabase FAILED", err);
    dialog.showErrorBox("Inkwell — Startup Error", String(err instanceof Error ? err.stack : err));
    app.exit(1);
    return;
  }
  try {
    registerIpc();
    writeLog("startup", "registerIpc OK");
  } catch (err) {
    writeLog("startup:registerIpc FAILED", err);
    dialog.showErrorBox("Inkwell — Startup Error", String(err instanceof Error ? err.stack : err));
    app.exit(1);
    return;
  }
  refreshMenu();
  writeLog("startup", "refreshMenu OK");
  createWindow();
  writeLog("startup", "createWindow OK");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  writeLog("whenReady.catch", err);
  try {
    dialog.showErrorBox("Inkwell — Fatal Error", String(err instanceof Error ? err.stack : err));
  } catch { /* dialog may not be available */ }
  app.exit(1);
});

app.on("window-all-closed", () => {
  session.close();
  if (process.platform !== "darwin") app.quit();
});
