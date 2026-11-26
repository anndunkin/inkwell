import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { InkwellDB } from "../../electron/db";

/** Build a file exactly as Inkwell 1.2.x wrote it (no schema version, JSON publications, global milestone names). */
function makeV1File(file: string) {
  const raw = new Database(file);
  raw.exec(`
    CREATE TABLE ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, category TEXT NOT NULL DEFAULT 'general', status TEXT NOT NULL DEFAULT 'new', tags TEXT NOT NULL DEFAULT '[]', notes TEXT, created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, type TEXT NOT NULL DEFAULT 'article', status TEXT NOT NULL DEFAULT 'active', idea_id INTEGER, publication TEXT, is_recurring INTEGER NOT NULL DEFAULT 0, recurring_interval TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE publication_history (id INTEGER PRIMARY KEY AUTOINCREMENT, publication TEXT NOT NULL, project_id INTEGER, project_title TEXT NOT NULL DEFAULT '', published_date TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE milestones (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_started', due_date TEXT, completed_at TEXT, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE deadlines (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, project_id INTEGER, due_date TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'pending', notes TEXT, created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE publication_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, publication_name TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
  `);
  raw.prepare("INSERT INTO settings VALUES ('publications', ?)").run(JSON.stringify(["The Atlantic", "Politico"]));
  raw.prepare("INSERT INTO settings VALUES ('milestoneNames', ?)").run(JSON.stringify(["First Draft", "With Editor", "Published"]));
  raw.prepare("INSERT INTO settings VALUES ('projectTypes', ?)").run(JSON.stringify(["article"]));
  raw.prepare("INSERT INTO publication_notes (publication_name, notes) VALUES ('The Atlantic', 'Editor: jane@example.com')").run();
  raw.prepare("INSERT INTO ideas (title, created_at) VALUES ('Idea one', 'x')").run();
  // Project 1 targets an outlet in the list (different case), project 2 an outlet that is not in the list, project 3 none.
  raw.prepare("INSERT INTO projects (title, publication, created_at) VALUES ('Piece A', 'the atlantic', 'x'), ('Piece B', 'Ghost Outlet', 'x'), ('Piece C', NULL, 'x')").run();
  // Milestones created out of display order: Published first, then First Draft.
  raw.prepare("INSERT INTO milestones (project_id, name, status, sort_order, created_at) VALUES (1, 'Published', 'not_started', 1, 'x'), (1, 'First Draft', 'completed', 2, 'x'), (1, 'Custom Stage', 'not_started', 3, 'x'), (1, 'With Editor', 'not_started', 4, 'x')").run();
  raw.prepare("INSERT INTO publication_history (publication, project_title, published_date, created_at) VALUES ('Politico', 'Old piece', '2026-01-01', 'x'), ('Ghost Outlet', 'Another', '2026-02-02', 'x')").run();
  raw.prepare("INSERT INTO deadlines (title, project_id, due_date, created_at) VALUES ('Draft due', 1, '2026-12-01', 'x')").run();
  raw.close();
}

describe("migration to schema v2", () => {
  let dir: string;
  let file: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "inkwell-mig-")); file = path.join(dir, "My Writing.inkwell"); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("makes a verified backup before touching an old file", () => {
    makeV1File(file);
    const db = new InkwellDB(file);
    const info = db.migration!;
    expect(info.fromVersion).toBe(1);
    expect(info.toVersion).toBe(2);
    expect(info.backupPath && existsSync(info.backupPath)).toBe(true);
    db.close();

    // The backup is the untouched v1 data: no publications table, and a project row with no publication_id column.
    const backup = new Database(info.backupPath!, { readonly: true });
    const tables = (backup.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(t => t.name);
    expect(tables).not.toContain("publications");
    const cols = (backup.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map(c => c.name);
    expect(cols).not.toContain("publication_id");
    expect((backup.prepare("SELECT COUNT(*) c FROM projects").get() as { c: number }).c).toBe(3);
    backup.close();
  });

  it("moves outlets into a table with notes and links projects by id", () => {
    makeV1File(file);
    const db = new InkwellDB(file);
    const names = db.getAllPublications().map(p => p.name).sort();
    expect(names).toEqual(["Ghost Outlet", "Politico", "The Atlantic"]);
    const atlantic = db.getPublicationByName("the ATLANTIC")!;
    expect(atlantic.notes).toBe("Editor: jane@example.com");

    const [a, b, c] = db.getAllProjects();
    expect(a.publicationId).toBe(atlantic.id);
    expect(a.publication).toBe("The Atlantic"); // canonical spelling
    expect(b.publicationId).toBe(db.getPublicationByName("Ghost Outlet")!.id);
    expect(c.publicationId).toBeNull();
    db.close();
  });

  it("bakes the old displayed order into each project's own sequence and seeds a default template", () => {
    makeV1File(file);
    const db = new InkwellDB(file);
    expect(db.getMilestonesForProject(1).map(m => m.name)).toEqual(["First Draft", "With Editor", "Published", "Custom Stage"]);
    const t = db.getDefaultMilestoneTemplate()!;
    expect(t.name).toBe("Standard");
    expect(JSON.parse(t.stages)).toEqual(["First Draft", "With Editor", "Published"]);
    // Existing data is preserved.
    expect(db.getAllDeadlines()).toHaveLength(1);
    expect(db.getAllIdeas()).toHaveLength(1);
    expect(db.getAllPublicationHistory()).toHaveLength(2);
    db.close();
  });

  it("migrates exactly once and does not back up again", () => {
    makeV1File(file);
    new InkwellDB(file).close();
    const second = new InkwellDB(file);
    expect(second.migration).toBeNull();
    second.close();
    expect(readdirSync(dir).filter(f => f.includes("backup") && f.endsWith(".inkwell"))).toHaveLength(1);
  });

  it("creates no backup for a brand-new file", () => {
    const db = new InkwellDB(file);
    expect(db.migration).toBeNull();
    db.close();
    expect(readdirSync(dir).filter(f => f.includes("backup"))).toHaveLength(0);
  });
});
