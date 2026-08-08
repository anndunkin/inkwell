// When packaged inside an asar, native modules must be loaded from the
// asarUnpack path so the .node binding is accessible on disk.
// Detection: __dirname.includes("app.asar") is the reliable packaged signal.
// Path:      process.resourcesPath gives the resources/ dir reliably on Windows.
import path from "path";
import type BetterSqlite3 from "better-sqlite3";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _require = require;

function loadDatabase(): typeof BetterSqlite3 {
  // Detect a packaged build by checking whether __dirname is inside an asar.
  // This is the only reliable signal at module-load time: app.isPackaged may
  // not be set yet (it is set after app.whenReady), and process.resourcesPath
  // is defined even in dev mode when Electron is launched via `electron .`.
  //
  // When packaged:
  //   __dirname = C:\...\resources\app.asar\electron\dist
  // When dev / test:
  //   __dirname = /home/user/workspace/inkwell/electron/dist  (no "app.asar")
  const isPackaged = __dirname.includes("app.asar");

  if (isPackaged) {
    // process.resourcesPath always points to the resources/ directory in a
    // packaged build, regardless of __dirname depth.
    //   Windows: C:\Program Files\Inkwell\resources
    const unpackedPath = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "better-sqlite3"
    );
    return _require(unpackedPath);
  }

  // Dev / test / CI: plain Node resolve
  return _require("better-sqlite3");
}

const Database = loadDatabase() as unknown as typeof BetterSqlite3;

import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, desc } from "drizzle-orm";
import { ideas, projects, deadlines, publicationHistory, milestones, publicationNotes } from "../shared/schema";
import type {
  Idea,
  InsertIdea,
  Project,
  InsertProject,
  Deadline,
  InsertDeadline,
  PublicationHistory,
  InsertPublicationHistory,
  Milestone,
  InsertMilestone,
  PublicationNote,
} from "../shared/schema";

/**
 * Add one recurring interval to a YYYY-MM-DD date, returning YYYY-MM-DD.
 * weekly +7d, biweekly +14d, monthly +1mo, quarterly +3mo, annual/annually +1yr.
 */
function addInterval(dateStr: string, interval: string): string {
  const d = new Date(dateStr + "T00:00:00");
  switch (interval) {
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "annual":
    case "annually": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'new',
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'article',
    status TEXT NOT NULL DEFAULT 'active',
    idea_id INTEGER,
    publication TEXT,
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurring_interval TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS publication_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication TEXT NOT NULL,
    project_id INTEGER,
    project_title TEXT NOT NULL DEFAULT '',
    published_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    due_date TEXT,
    completed_at TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS deadlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    project_id INTEGER,
    due_date TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS publication_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_name TEXT NOT NULL UNIQUE,
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
`;

/**
 * InkwellDB wraps a single SQLite database file and exposes CRUD operations.
 * The main process holds exactly one active instance at a time; opening a new
 * file (New/Open/Save As) swaps the instance via `openDatabase`.
 */
export class InkwellDB {
  readonly sqlite: Database.Database;
  private readonly db: BetterSQLite3Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.exec(SCHEMA_SQL);
    this.db = drizzle(this.sqlite);

    // Migrate existing databases: add new columns if missing.
    const migrations: string[] = [
      "ALTER TABLE projects ADD COLUMN publication TEXT",
      "ALTER TABLE projects ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE projects ADD COLUMN recurring_interval TEXT",
      "ALTER TABLE milestones ADD COLUMN completed_at TEXT",
      `CREATE TABLE IF NOT EXISTS publication_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        publication_name TEXT NOT NULL UNIQUE,
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      )`,
    ];
    for (const sql of migrations) {
      try { this.sqlite.exec(sql); } catch { /* column already exists */ }
    }

    // Seed CIO News history if this is a fresh file (no history rows yet).
    const histCount = (this.sqlite.prepare("SELECT COUNT(*) as c FROM publication_history").get() as { c: number }).c;
    if (histCount === 0) {
      this.sqlite.prepare(
        "INSERT INTO publication_history (publication, project_title, published_date, created_at) VALUES (?, ?, ?, ?)"
      ).run("CIO News", "Previous article", "2026-05-15", new Date().toISOString());
    }

    // Initialize default settings for new files.
    const defaultProjectTypes = ["article","book","essay","blog","speech","report","policy","white paper","other"];
    const defaultPublications = ["The Atlantic","Foreign Affairs","Politico","The Hill","Energy Monitor","Utility Dive","other"];
    const defaultMilestoneNames = ["First Draft","Second Draft","With Editor","Final Review","Fact Check","Copy Edit","Submitted","Published"];
    if (!this.getSetting("projectTypes")) this.setSetting("projectTypes", JSON.stringify(defaultProjectTypes));
    if (!this.getSetting("publications")) this.setSetting("publications", JSON.stringify(defaultPublications));
    if (!this.getSetting("milestoneNames")) this.setSetting("milestoneNames", JSON.stringify(defaultMilestoneNames));
  }

  close() {
    this.sqlite.close();
  }

  // ---- Settings ----
  getSetting(key: string): string | null {
    const row = this.sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  getSettings(): { milestoneNames: string[] } {
    const rawMilestoneNames = this.getSetting("milestoneNames");
    try {
      const milestoneNames = rawMilestoneNames ? JSON.parse(rawMilestoneNames) : [];
      return {
        milestoneNames: Array.isArray(milestoneNames)
          ? milestoneNames.filter((name): name is string => typeof name === "string")
          : [],
      };
    } catch {
      return { milestoneNames: [] };
    }
  }

  // ---- Ideas ----
  getAllIdeas(): Idea[] {
    return this.db.select().from(ideas).all();
  }
  getIdea(id: number): Idea | undefined {
    return this.db.select().from(ideas).where(eq(ideas.id, id)).get();
  }
  createIdea(data: InsertIdea): Idea {
    const createdAt = data.createdAt && data.createdAt !== "" ? data.createdAt : new Date().toISOString();
    return this.db.insert(ideas).values({ ...data, createdAt }).returning().get();
  }
  updateIdea(id: number, data: Partial<InsertIdea>): Idea | undefined {
    return this.db.update(ideas).set(data).where(eq(ideas.id, id)).returning().get();
  }
  deleteIdea(id: number): boolean {
    return this.db.delete(ideas).where(eq(ideas.id, id)).run().changes > 0;
  }

  // ---- Projects ----
  getAllProjects(): Project[] {
    return this.db.select().from(projects).all();
  }
  getProject(id: number): Project | undefined {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }
  createProject(data: InsertProject): Project {
    const createdAt = data.createdAt && data.createdAt !== "" ? data.createdAt : new Date().toISOString();
    return this.db.insert(projects).values({ ...data, createdAt }).returning().get();
  }
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined {
    return this.db.update(projects).set(data).where(eq(projects.id, id)).returning().get();
  }
  deleteProject(id: number): boolean {
    // Cascade: remove the project's milestones and deadlines so no orphan rows
    // remain (there are no FK constraints, so we clean up explicitly).
    const tx = this.sqlite.transaction((projectId: number) => {
      this.db.delete(milestones).where(eq(milestones.projectId, projectId)).run();
      this.db.delete(deadlines).where(eq(deadlines.projectId, projectId)).run();
      return this.db.delete(projects).where(eq(projects.id, projectId)).run().changes > 0;
    });
    return tx(id);
  }

  // ---- Publication History ----
  getAllPublicationHistory(): PublicationHistory[] {
    return this.db.select().from(publicationHistory)
      .orderBy(desc(publicationHistory.publishedDate))
      .all();
  }
  createPublicationHistory(data: InsertPublicationHistory): PublicationHistory {
    const createdAt = new Date().toISOString();
    return this.db.insert(publicationHistory).values({ ...data, createdAt }).returning().get();
  }
  updatePublicationHistory(id: number, data: Partial<InsertPublicationHistory>): PublicationHistory | undefined {
    return this.db.update(publicationHistory).set(data).where(eq(publicationHistory.id, id)).returning().get();
  }
  deletePublicationHistory(id: number): boolean {
    return this.db.delete(publicationHistory).where(eq(publicationHistory.id, id)).run().changes > 0;
  }

  // ---- Milestones ----
  getMilestonesForProject(projectId: number): Milestone[] {
    return this.db.select().from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(milestones.sortOrder, milestones.createdAt)
      .all();
  }

  getAllMilestones(): Milestone[] {
    return this.db.select().from(milestones)
      .orderBy(milestones.projectId, milestones.sortOrder)
      .all();
  }

  createMilestone(data: InsertMilestone): Milestone {
    const createdAt = new Date().toISOString();
    // sortOrder = current max for this project + 1
    const maxRow = this.sqlite
      .prepare("SELECT COALESCE(MAX(sort_order),0) as m FROM milestones WHERE project_id = ?")
      .get(data.projectId) as { m: number };
    return this.db.insert(milestones)
      .values({ ...data, sortOrder: maxRow.m + 1, createdAt })
      .returning().get();
  }

  updateMilestone(id: number, data: Partial<InsertMilestone>): Milestone | undefined {
    return this.db.update(milestones).set(data).where(eq(milestones.id, id)).returning().get();
  }

  deleteMilestone(id: number): boolean {
    return this.db.delete(milestones).where(eq(milestones.id, id)).run().changes > 0;
  }

  // ---- Deadlines ----
  getAllDeadlines(): Deadline[] {
    return this.db.select().from(deadlines).all();
  }
  getDeadline(id: number): Deadline | undefined {
    return this.db.select().from(deadlines).where(eq(deadlines.id, id)).get();
  }
  createDeadline(data: InsertDeadline): Deadline {
    const createdAt = data.createdAt && data.createdAt !== "" ? data.createdAt : new Date().toISOString();
    return this.db.insert(deadlines).values({ ...data, createdAt }).returning().get();
  }
  updateDeadline(id: number, data: Partial<InsertDeadline>): Deadline | undefined {
    return this.db.update(deadlines).set(data).where(eq(deadlines.id, id)).returning().get();
  }
  deleteDeadline(id: number): boolean {
    return this.db.delete(deadlines).where(eq(deadlines.id, id)).run().changes > 0;
  }

  /**
   * For a recurring project with a past-due latest deadline and no upcoming one,
   * generate the next occurrence (latest date + interval, rolled forward past
   * today). Returns the new deadline, or null if nothing was spawned.
   */
  spawnNextRecurringDeadline(projectId: number): Deadline | null {
    const project = this.getProject(projectId);
    if (!project || !project.isRecurring || !project.recurringInterval) return null;

    const projectDeadlines = this.db.select().from(deadlines)
      .where(eq(deadlines.projectId, projectId)).all();
    const today = new Date().toISOString().slice(0, 10);
    // No existing deadlines — create the first one due one interval from today.
    if (projectDeadlines.length === 0) {
      const firstDue = addInterval(today, project.recurringInterval);
      return this.createDeadline({
        title: project.title,
        projectId,
        dueDate: firstDue,
        priority: "medium",
        status: "pending",
        notes: null,
        createdAt: "",
      });
    }

    // A future pending deadline is already scheduled, so do not add another.
    if (projectDeadlines.some(d => d.dueDate > today && d.status === "pending")) return null;

    const latest = projectDeadlines.reduce((a, b) => (a.dueDate >= b.dueDate ? a : b));

    // Roll forward from the latest date until we land strictly after today,
    // so a long-dormant project produces a single upcoming deadline.
    let next = addInterval(latest.dueDate, project.recurringInterval);
    while (next <= today) next = addInterval(next, project.recurringInterval);

    return this.createDeadline({
      title: latest.title,
      projectId,
      dueDate: next,
      priority: latest.priority,
      status: "pending",
      notes: null,
      createdAt: "",
    });
  }

  // ---- Publication Notes ----
  getAllPublicationNotes(): PublicationNote[] {
    return this.db.select().from(publicationNotes).all();
  }

  upsertPublicationNote(publicationName: string, notes: string): PublicationNote {
    const updatedAt = new Date().toISOString();
    this.sqlite.prepare(
      `INSERT INTO publication_notes (publication_name, notes, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(publication_name) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`
    ).run(publicationName, notes, updatedAt);
    return this.db.select().from(publicationNotes)
      .where(eq(publicationNotes.publicationName, publicationName)).get()!;
  }
}
