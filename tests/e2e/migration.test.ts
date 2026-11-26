import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

// Builds a file exactly as Inkwell 1.2.x wrote it. Runs under Electron's own Node
// (ELECTRON_RUN_AS_NODE) so it uses the same better-sqlite3 build as the app.
const MAKE_V1 = `
const Database = require(process.argv[2]);
const raw = new Database(process.argv[3]);
raw.exec(\`
  CREATE TABLE ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, category TEXT NOT NULL DEFAULT 'general', status TEXT NOT NULL DEFAULT 'new', tags TEXT NOT NULL DEFAULT '[]', notes TEXT, created_at TEXT NOT NULL DEFAULT '');
  CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, type TEXT NOT NULL DEFAULT 'article', status TEXT NOT NULL DEFAULT 'active', idea_id INTEGER, publication TEXT, is_recurring INTEGER NOT NULL DEFAULT 0, recurring_interval TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT '');
  CREATE TABLE publication_history (id INTEGER PRIMARY KEY AUTOINCREMENT, publication TEXT NOT NULL, project_id INTEGER, project_title TEXT NOT NULL DEFAULT '', published_date TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL DEFAULT '');
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE milestones (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_started', due_date TEXT, completed_at TEXT, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '');
  CREATE TABLE deadlines (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, project_id INTEGER, due_date TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'pending', notes TEXT, created_at TEXT NOT NULL DEFAULT '');
  CREATE TABLE publication_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, publication_name TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
\`);
raw.prepare("INSERT INTO settings VALUES ('publications', ?)").run(JSON.stringify(["The Atlantic", "Politico"]));
raw.prepare("INSERT INTO settings VALUES ('milestoneNames', ?)").run(JSON.stringify(["First Draft", "With Editor", "Published"]));
raw.prepare("INSERT INTO publication_notes (publication_name, notes) VALUES ('The Atlantic', 'Editor: jane@example.com')").run();
raw.prepare("INSERT INTO projects (title, publication, created_at) VALUES ('Legacy piece', 'the atlantic', 'x')").run();
raw.prepare("INSERT INTO milestones (project_id, name, status, sort_order, created_at) VALUES (1, 'Published', 'not_started', 1, 'x'), (1, 'First Draft', 'completed', 2, 'x'), (1, 'With Editor', 'not_started', 3, 'x')").run();
raw.prepare("INSERT INTO deadlines (title, project_id, due_date, created_at) VALUES ('Legacy deadline', 1, '2099-01-01', 'x')").run();
raw.close();
`;

let app: ElectronApplication;
let page: Page;
let dir: string;
let file: string;
let before: Buffer;

test.beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "inkwell-e2e-mig-"));
  file = path.join(dir, "Legacy.inkwell");
  const script = path.join(dir, "make-v1.cjs");
  writeFileSync(script, MAKE_V1);
  const electronBin = (await import("electron")).default as unknown as string;
  const res = spawnSync(electronBin, [script, path.resolve("node_modules/better-sqlite3"), file], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8",
  });
  expect(res.status, res.stderr).toBe(0);
  expect(existsSync(file)).toBe(true);

  app = await electron.launch({ args: ["."], env: { ...process.env, INKWELL_TEST_OPEN_DB: file, NODE_ENV: "production" } });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
});

test("opening a 1.2.x file shows the upgrade notice naming the backup", async () => {
  const notice = page.getByTestId("migration-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("pre-v2-backup");
  await page.getByTestId("button-dismiss-notice").click();
  await expect(notice).toHaveCount(0);
});

test("a backup of the original file exists beside it and is the old format", async () => {
  const backups = readdirSync(dir).filter(f => f.includes(".pre-v2-backup-"));
  expect(backups).toHaveLength(1);
  expect(statSync(path.join(dir, backups[0])).size).toBeGreaterThan(0);
  // Read the backup with the app's own SQLite build: no publications table, no publication_id column.
  const probe = path.join(dir, "probe.cjs");
  writeFileSync(probe, `
    const D = require(process.argv[2]); const b = new D(process.argv[3], { readonly: true });
    const tables = b.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const cols = b.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
    console.log(JSON.stringify({ tables, cols, projects: b.prepare("SELECT COUNT(*) c FROM projects").get().c }));
  `);
  const electronBin = (await import("electron")).default as unknown as string;
  const res = spawnSync(electronBin, [probe, path.resolve("node_modules/better-sqlite3"), path.join(dir, backups[0])], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8",
  });
  const info = JSON.parse(res.stdout.trim());
  expect(info.tables).not.toContain("publications");
  expect(info.cols).not.toContain("publication_id");
  expect(info.projects).toBe(1);
});

test("upgraded data is intact: outlet record, notes, linked project, own stages in old order, deadline", async () => {
  const data = await page.evaluate(async () => {
    const [pubs, projects, ms, templates, deadlines] = await Promise.all([
      window.inkwell.publications.getAll(), window.inkwell.projects.getAll(), window.inkwell.milestones.getAll(),
      window.inkwell.templates.getAll(), window.inkwell.deadlines.getAll(),
    ]);
    return { pubs, projects, ms, templates, deadlines };
  });
  const atlantic = data.pubs.find(p => p.name === "The Atlantic");
  expect(atlantic?.notes).toContain("jane@example.com");
  expect(data.projects[0].publicationId).toBe(atlantic?.id);
  const names = data.ms.filter(m => m.projectId === data.projects[0].id).sort((a, b) => a.sortOrder - b.sortOrder).map(m => m.name);
  expect(names).toEqual(["First Draft", "With Editor", "Published"]);
  expect(data.templates.find(t => t.isDefault)?.name).toBe("Standard");
  expect(data.deadlines.map(d => d.title)).toContain("Legacy deadline");
});

test("the legacy project opens on its page with its stages and outlet", async () => {
  await page.getByTestId("nav-projects").click();
  await page.getByText("Legacy piece").click();
  await expect(page.getByTestId("project-page")).toBeVisible();
  await expect(page.locator('[data-testid^="stage-"]')).toHaveCount(3);
  await expect(page.getByTestId("select-page-outlet")).toContainText("The Atlantic");
});

test("reopening the upgraded file does not make a second backup", async () => {
  await app.close();
  app = await electron.launch({ args: ["."], env: { ...process.env, INKWELL_TEST_OPEN_DB: file, NODE_ENV: "production" } });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("text-greeting")).toBeVisible();
  await expect(page.getByTestId("migration-notice")).toHaveCount(0);
  expect(readdirSync(dir).filter(f => f.includes(".pre-v2-backup-"))).toHaveLength(1);
});
