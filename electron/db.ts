// When packaged inside an asar, native modules must be loaded from the
// asarUnpack path so the .node binding is accessible on disk.
// Detection: __dirname.includes("app.asar") is the reliable packaged signal.
// Path:      process.resourcesPath gives the resources/ dir reliably on Windows.
import path from "path";
import fs from "fs";
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
import { ideas, projects, deadlines, publicationHistory, milestones, publicationNotes, publications, milestoneTemplates } from "../shared/schema";
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
  Publication,
  InsertPublication,
  MilestoneTemplate,
  MilestoneTemplateInput,
  PublishResult,
} from "../shared/schema";

/**
 * Add one recurring interval to a YYYY-MM-DD date, returning YYYY-MM-DD.
 * weekly +7d, biweekly +14d, monthly +1mo, quarterly +3mo, annual/annually +1yr.
 */
/** YYYY-MM-DD in the local time zone (never UTC, so dates do not shift a day). */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  return localDateStr(d);
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
    publication_id INTEGER,
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

  CREATE TABLE IF NOT EXISTS publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    notes TEXT NOT NULL DEFAULT '',
    guidelines_url TEXT,
    rate TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS milestone_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    stages TEXT NOT NULL DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 0
  );
`;

/** Schema version written into every .inkwell file. Files below this are migrated on open. */
export const SCHEMA_VERSION = 2;

const DEFAULT_PROJECT_TYPES = ["article","book","essay","blog","speech","report","policy","white paper","other"];
const DEFAULT_PUBLICATIONS = ["The Atlantic","Foreign Affairs","Politico","The Hill","Energy Monitor","Utility Dive","other"];
export const DEFAULT_MILESTONE_NAMES = ["First Draft","Second Draft","With Editor","Final Review","Fact Check","Copy Edit","Submitted","Published"];

export interface MigrationInfo {
  fromVersion: number;
  toVersion: number;
  /** Path of the automatic pre-migration copy, or null when none was needed. */
  backupPath: string | null;
}

function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean) : [];
  } catch { return []; }
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * InkwellDB wraps a single SQLite database file and exposes CRUD operations.
 * The main process holds exactly one active instance at a time; opening a new
 * file (New/Open/Save As) swaps the instance via `openDatabase`.
 */
export class InkwellDB {
  readonly sqlite: BetterSqlite3.Database;
  private readonly db: BetterSQLite3Database;

  /** Set when opening this file upgraded it from an older schema version. */
  migration: MigrationInfo | null = null;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");

    const hadData = this.tableExists("projects");
    const fromVersion = hadData ? this.readSchemaVersion() : SCHEMA_VERSION;

    // Safety copy BEFORE anything in an older file is altered.
    let backupPath: string | null = null;
    if (hadData && fromVersion < SCHEMA_VERSION) {
      backupPath = this.backupBeforeMigration(filename, fromVersion);
    }

    this.sqlite.exec(SCHEMA_SQL);
    this.db = drizzle(this.sqlite);

    this.runMigrations();
    if (hadData && fromVersion < SCHEMA_VERSION) {
      this.migrateToV2();
      this.migration = { fromVersion, toVersion: SCHEMA_VERSION, backupPath };
    }

    // Seed CIO News history if this is a fresh file (no history rows yet).
    const histCount = (this.sqlite.prepare("SELECT COUNT(*) as c FROM publication_history").get() as { c: number }).c;
    if (histCount === 0) {
      this.sqlite.prepare(
        "INSERT INTO publication_history (publication, project_title, published_date, created_at) VALUES (?, ?, ?, ?)"
      ).run("CIO News", "Previous article", "2026-05-15", new Date().toISOString());
    }

    // Defaults for new files.
    if (!this.getSetting("projectTypes")) this.setSetting("projectTypes", JSON.stringify(DEFAULT_PROJECT_TYPES));
    if (!this.getSetting("milestoneNames")) this.setSetting("milestoneNames", JSON.stringify(DEFAULT_MILESTONE_NAMES));
    if (!hadData) {
      const now = new Date().toISOString();
      const ins = this.sqlite.prepare("INSERT OR IGNORE INTO publications (name, created_at) VALUES (?, ?)");
      for (const name of DEFAULT_PUBLICATIONS) ins.run(name, now);
    }
    if (this.getAllMilestoneTemplates().length === 0) {
      this.createMilestoneTemplate({ name: "Standard", stages: parseStringList(this.getSetting("milestoneNames")), isDefault: true });
    }
    if (!hadData || fromVersion < SCHEMA_VERSION) this.setSetting("schemaVersion", String(SCHEMA_VERSION));
  }

  private tableExists(name: string): boolean {
    return !!this.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
  }

  private readSchemaVersion(): number {
    if (!this.tableExists("settings")) return 1;
    const row = this.sqlite.prepare("SELECT value FROM settings WHERE key = 'schemaVersion'").get() as { value: string } | undefined;
    const n = row ? parseInt(row.value, 10) : 1;
    return Number.isFinite(n) ? n : 1;
  }

  /** Copy the whole file with VACUUM INTO (a consistent snapshot, WAL included). */
  private backupBeforeMigration(filename: string, fromVersion: number): string | null {
    if (!filename || filename === ":memory:" || filename.startsWith("file::memory")) return null;
    const dir = path.dirname(filename);
    const base = path.basename(filename).replace(/\.inkwell$/i, "");
    let target = path.join(dir, `${base}.pre-v${SCHEMA_VERSION}-backup-${stamp()}.inkwell`);
    let n = 1;
    while (fs.existsSync(target)) target = path.join(dir, `${base}.pre-v${SCHEMA_VERSION}-backup-${stamp()}-${n++}.inkwell`);
    try {
      this.sqlite.prepare("VACUUM INTO ?").run(target);
    } catch (err) {
      // Never modify a file we could not back up.
      this.sqlite.close();
      throw new Error(`Inkwell could not create a backup of "${filename}" before upgrading it from version ${fromVersion}, so the file was left untouched. ${(err as Error).message}`);
    }
    return target;
  }

  /**
   * v1 -> v2: publications become a table (with notes), projects reference them
   * by id, milestone sequences become per-project and ordered by sort_order, and
   * the global milestone list becomes the default template. Runs once, atomically.
   */
  private migrateToV2(): void {
    const tx = this.sqlite.transaction(() => {
      const now = new Date().toISOString();
      const names = new Map<string, string>(); // lower-case -> canonical
      const add = (raw: string | null | undefined) => {
        const n = (raw ?? "").trim();
        if (n && !names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
      };
      parseStringList(this.getSetting("publications")).forEach(add);
      (this.sqlite.prepare("SELECT DISTINCT publication FROM projects WHERE publication IS NOT NULL").all() as { publication: string }[]).forEach(r => add(r.publication));
      (this.sqlite.prepare("SELECT DISTINCT publication FROM publication_history").all() as { publication: string }[]).forEach(r => add(r.publication));
      const oldNotes = this.sqlite.prepare("SELECT publication_name, notes FROM publication_notes").all() as { publication_name: string; notes: string }[];
      oldNotes.forEach(r => add(r.publication_name));

      const ins = this.sqlite.prepare("INSERT OR IGNORE INTO publications (name, created_at) VALUES (?, ?)");
      for (const name of names.values()) ins.run(name, now);
      const upd = this.sqlite.prepare("UPDATE publications SET notes = ? WHERE name = ? COLLATE NOCASE");
      for (const r of oldNotes) if (r.notes) upd.run(r.notes, r.publication_name.trim());

      // Link projects to their outlet and normalise the mirrored name.
      this.sqlite.exec(`
        UPDATE projects SET publication_id = (SELECT id FROM publications WHERE name = TRIM(projects.publication) COLLATE NOCASE)
          WHERE publication IS NOT NULL AND TRIM(publication) <> '';
        UPDATE projects SET publication = (SELECT name FROM publications WHERE id = projects.publication_id)
          WHERE publication_id IS NOT NULL;
        UPDATE projects SET publication = NULL WHERE publication IS NOT NULL AND TRIM(publication) = '';
        UPDATE publication_history SET publication = (SELECT name FROM publications WHERE name = TRIM(publication_history.publication) COLLATE NOCASE)
          WHERE EXISTS (SELECT 1 FROM publications WHERE name = TRIM(publication_history.publication) COLLATE NOCASE);
      `);

      // Default template from the old global sequence.
      const seq = parseStringList(this.getSetting("milestoneNames"));
      const stages = seq.length ? seq : DEFAULT_MILESTONE_NAMES;
      if (this.getAllMilestoneTemplates().length === 0) {
        this.createMilestoneTemplate({ name: "Standard", stages, isDefault: true });
      }

      // Old pipelines were displayed in global-sequence order, not creation order.
      // Bake that order into sort_order so each project owns its sequence.
      const rank = (name: string) => { const i = stages.findIndex(x => x.toLowerCase() === name.toLowerCase()); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
      const all = this.sqlite.prepare("SELECT id, project_id, name, sort_order FROM milestones").all() as { id: number; project_id: number; name: string; sort_order: number }[];
      const byProject = new Map<number, typeof all>();
      for (const m of all) { if (!byProject.has(m.project_id)) byProject.set(m.project_id, []); byProject.get(m.project_id)!.push(m); }
      const setOrder = this.sqlite.prepare("UPDATE milestones SET sort_order = ? WHERE id = ?");
      for (const list of byProject.values()) {
        list.sort((a, b) => rank(a.name) - rank(b.name) || a.sort_order - b.sort_order || a.id - b.id);
        list.forEach((m, i) => setOrder.run(i + 1, m.id));
      }
    });
    tx();
  }

  /** Run idempotent data and schema migrations whenever a database is opened. */
  runMigrations(): void {
    // Migrate existing databases: add new columns if missing.
    const migrations: string[] = [
      "ALTER TABLE projects ADD COLUMN publication TEXT",
      "ALTER TABLE projects ADD COLUMN publication_id INTEGER",
      "ALTER TABLE projects ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE projects ADD COLUMN recurring_interval TEXT",
      "ALTER TABLE milestones ADD COLUMN completed_at TEXT",
      "UPDATE milestones SET status = 'completed' WHERE status = 'complete'",
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
  /**
   * Create a project. When `templateId` is given, the project's own milestone
   * pipeline is seeded from that template (all stages not started).
   */
  createProject(data: InsertProject, templateId?: number | null): Project {
    const createdAt = data.createdAt && data.createdAt !== "" ? data.createdAt : new Date().toISOString();
    const tx = this.sqlite.transaction(() => {
      const outlet = this.resolveOutlet(data.publicationId, data.publication);
      const project = this.db.insert(projects).values({ ...data, publicationId: outlet?.id ?? null, publication: outlet?.name ?? null, createdAt }).returning().get();
      if (templateId) this.applyTemplateToProject(project.id, templateId);
      return project;
    });
    return tx();
  }
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined {
    const patch: Partial<InsertProject> = { ...data };
    if ("publicationId" in data || "publication" in data) {
      const outlet = this.resolveOutlet(data.publicationId, data.publication);
      patch.publicationId = outlet?.id ?? null;
      patch.publication = outlet?.name ?? null;
    }
    return this.db.update(projects).set(patch).where(eq(projects.id, id)).returning().get();
  }

  /** Find the outlet by id, else by (case-insensitive) name, creating it when new. */
  private resolveOutlet(id: number | null | undefined, name: string | null | undefined): Publication | null {
    if (id) { const p = this.getPublication(id); if (p) return p; }
    const n = (name ?? "").trim();
    if (!n) return null;
    return this.getPublicationByName(n) ?? this.createPublication({ name: n });
  }

  /** Promote an idea to a project (idempotent: returns the existing project if already promoted). */
  promoteIdea(ideaId: number, opts: { type?: string; publicationId?: number | null; templateId?: number | null } = {}): Project {
    const idea = this.getIdea(ideaId);
    if (!idea) throw new Error("Idea not found");
    const existing = this.db.select().from(projects).where(eq(projects.ideaId, ideaId)).get();
    if (existing) return existing;
    const tx = this.sqlite.transaction(() => {
      const type = opts.type ?? (idea.category && idea.category !== "general" ? idea.category : "article");
      const project = this.createProject({
        title: idea.title, description: idea.description, notes: idea.notes, type, status: "active",
        ideaId, publication: null, publicationId: opts.publicationId ?? null,
        isRecurring: false, recurringInterval: null, createdAt: "",
      }, opts.templateId ?? this.getDefaultMilestoneTemplate()?.id ?? null);
      if (idea.status === "new" || idea.status === "parked") this.updateIdea(ideaId, { status: "developing" });
      return project;
    });
    return tx();
  }

  /**
   * Mark a project published: completes it, marks its linked idea published and
   * logs the piece in the outlet's publication history (when it has an outlet).
   */
  publishProject(projectId: number, publishedDate: string): PublishResult {
    const tx = this.sqlite.transaction((): PublishResult => {
      const current = this.getProject(projectId);
      if (!current) throw new Error("Project not found");
      const project = this.updateProject(projectId, { status: "completed" })!;
      if (project.ideaId) this.updateIdea(project.ideaId, { status: "published" });
      let history: PublicationHistory | null = null;
      if (project.publication) {
        history = this.createPublicationHistory({
          publication: project.publication, projectId: project.id, projectTitle: project.title,
          publishedDate, notes: null, createdAt: "",
        });
      }
      return { project, history };
    });
    return tx();
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
   * Skip the current occurrence of a recurring project: its open deadlines are
   * marked skipped, the next occurrence is scheduled, and this occurrence is
   * closed (status cancelled) so it leaves Today and Schedule. Nothing is
   * deleted. Throws, changing nothing, if the project is not recurring, has no
   * interval, or has no open deadline to skip.
   */
  skipRecurringOccurrence(projectId: number): { skipped: number; next: Project | null } {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    if (!project.isRecurring) throw new Error("This project is not recurring.");
    if (!project.recurringInterval) throw new Error("Set a recurrence interval before skipping an occurrence.");
    const open = this.db.select().from(deadlines)
      .where(eq(deadlines.projectId, projectId)).all()
      .filter(d => d.status === "pending");
    if (open.length === 0) throw new Error("There is no open deadline to skip.");

    let next: Project | null = null;
    const tx = this.sqlite.transaction(() => {
      // Spawn first: it reads this project's latest deadline date to place the next one.
      next = this.spawnNextRecurringDeadline(projectId);
      for (const d of open) this.updateDeadline(d.id, { status: "skipped" });
      this.updateProject(projectId, { status: "cancelled" });
    });
    tx();
    return { skipped: open.length, next };
  }

  /**
   * Create the next project instance for a recurring project. The original
   * project, including its deadlines and milestones, remains unchanged.
   */
  spawnNextRecurringDeadline(projectId: number): Project | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    if (!project.isRecurring) return null;
    if (!project.recurringInterval) throw new Error('Recurring interval is not set on this project. Edit the project to set a recurrence interval (weekly, monthly, etc.).');

    const today = localDateStr();

    // Get all deadlines for this project to find the latest date.
    const projectDeadlines = this.db.select().from(deadlines)
      .where(eq(deadlines.projectId, projectId)).all();

    // A sibling with an upcoming pending deadline is the project instance that
    // was already created for this recurrence, so do not create another.
    const siblingProjects = this.db.select().from(projects)
      .where(eq(projects.title, project.title)).all()
      .filter(p => p.id !== projectId && p.isRecurring && p.publication === project.publication);

    for (const sibling of siblingProjects) {
      const siblingDeadlines = this.db.select().from(deadlines)
        .where(eq(deadlines.projectId, sibling.id)).all();
      if (siblingDeadlines.some(d => d.dueDate > today && d.status === "pending")) {
        return null;
      }
    }

    // Calculate the next due date from the original project's latest deadline.
    let nextDue: string;
    if (projectDeadlines.length === 0) {
      nextDue = addInterval(today, project.recurringInterval);
    } else {
      const latest = projectDeadlines.reduce((a, b) => (a.dueDate >= b.dueDate ? a : b));
      nextDue = addInterval(latest.dueDate, project.recurringInterval);
      while (nextDue <= today) nextDue = addInterval(nextDue, project.recurringInterval);
    }

    // Create an independent active project instance for the next recurrence.
    const newProject = this.createProject({
      title: project.title,
      description: project.description,
      type: project.type,
      status: "active",
      ideaId: null,
      publication: project.publication,
      publicationId: project.publicationId,
      isRecurring: true,
      recurringInterval: project.recurringInterval,
      notes: project.notes,
      createdAt: "",
    });

    this.createDeadline({
      title: project.title,
      projectId: newProject.id,
      dueDate: nextDue,
      priority: "medium",
      status: "pending",
      notes: null,
      createdAt: "",
    });

    // Milestones represent a fresh workflow in the new project instance.
    const originalMilestones = this.getMilestonesForProject(projectId);
    for (const milestone of originalMilestones) {
      this.createMilestone({
        projectId: newProject.id,
        name: milestone.name,
        status: "not_started",
        dueDate: null,
        notes: null,
        sortOrder: milestone.sortOrder,
        createdAt: "",
      });
    }

    // Projects without milestones retain the standard workflow from settings.
    if (originalMilestones.length === 0) {
      const stages = this.getDefaultMilestoneTemplate() ? parseStringList(this.getDefaultMilestoneTemplate()!.stages) : this.getSettings().milestoneNames;
      stages.forEach((name, index) => {
        this.createMilestone({
          projectId: newProject.id,
          name,
          status: "not_started",
          dueDate: null,
          notes: null,
          sortOrder: index + 1,
          createdAt: "",
        });
      });
    }

    return newProject;
  }

  // ---- Milestone pipeline (per project) ----
  /** Rewrite sort_order 1..n for a project in the given id order. Ids not listed keep their relative order at the end. */
  reorderMilestones(projectId: number, orderedIds: number[]): Milestone[] {
    const tx = this.sqlite.transaction(() => {
      const current = this.getMilestonesForProject(projectId).map(m => m.id);
      const rest = current.filter(id => !orderedIds.includes(id));
      const final = [...orderedIds.filter(id => current.includes(id)), ...rest];
      const set = this.sqlite.prepare("UPDATE milestones SET sort_order = ? WHERE id = ? AND project_id = ?");
      final.forEach((id, i) => set.run(i + 1, id, projectId));
    });
    tx();
    return this.getMilestonesForProject(projectId);
  }

  /** Append the template's stages that the project does not already have (case-insensitive). */
  applyTemplateToProject(projectId: number, templateId: number): Milestone[] {
    const template = this.getMilestoneTemplate(templateId);
    if (!template) throw new Error("Template not found");
    const tx = this.sqlite.transaction(() => {
      const have = new Set(this.getMilestonesForProject(projectId).map(m => m.name.toLowerCase()));
      for (const name of parseStringList(template.stages)) {
        if (have.has(name.toLowerCase())) continue;
        this.createMilestone({ projectId, name, status: "not_started", dueDate: null, completedAt: null, notes: null, sortOrder: 0, createdAt: "" });
        have.add(name.toLowerCase());
      }
    });
    tx();
    return this.getMilestonesForProject(projectId);
  }

  // ---- Milestone templates ----
  getAllMilestoneTemplates(): MilestoneTemplate[] {
    return this.db.select().from(milestoneTemplates).orderBy(milestoneTemplates.name).all();
  }
  getMilestoneTemplate(id: number): MilestoneTemplate | undefined {
    return this.db.select().from(milestoneTemplates).where(eq(milestoneTemplates.id, id)).get();
  }
  getDefaultMilestoneTemplate(): MilestoneTemplate | undefined {
    return this.db.select().from(milestoneTemplates).where(eq(milestoneTemplates.isDefault, true)).get()
      ?? this.db.select().from(milestoneTemplates).get();
  }
  private cleanStages(stages: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of stages) {
      const n = String(raw ?? "").trim();
      if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
    }
    return out;
  }
  createMilestoneTemplate(input: MilestoneTemplateInput): MilestoneTemplate {
    const name = input.name.trim();
    if (!name) throw new Error("Template name is required");
    const tx = this.sqlite.transaction(() => {
      const makeDefault = !!input.isDefault || this.getAllMilestoneTemplates().length === 0;
      if (makeDefault) this.sqlite.prepare("UPDATE milestone_templates SET is_default = 0").run();
      const t = this.db.insert(milestoneTemplates).values({ name, stages: JSON.stringify(this.cleanStages(input.stages)), isDefault: makeDefault }).returning().get();
      if (makeDefault) this.mirrorDefaultTemplate(t);
      return t;
    });
    return tx();
  }
  updateMilestoneTemplate(id: number, input: Partial<MilestoneTemplateInput>): MilestoneTemplate | undefined {
    const tx = this.sqlite.transaction(() => {
      const patch: Partial<typeof milestoneTemplates.$inferInsert> = {};
      if (input.name !== undefined) { const n = input.name.trim(); if (!n) throw new Error("Template name is required"); patch.name = n; }
      if (input.stages !== undefined) patch.stages = JSON.stringify(this.cleanStages(input.stages));
      if (input.isDefault) { this.sqlite.prepare("UPDATE milestone_templates SET is_default = 0").run(); patch.isDefault = true; }
      if (Object.keys(patch).length === 0) return this.getMilestoneTemplate(id);
      const t = this.db.update(milestoneTemplates).set(patch).where(eq(milestoneTemplates.id, id)).returning().get();
      const def = this.getDefaultMilestoneTemplate();
      if (def) this.mirrorDefaultTemplate(def);
      return t;
    });
    return tx();
  }
  deleteMilestoneTemplate(id: number): boolean {
    const all = this.getAllMilestoneTemplates();
    if (all.length <= 1) throw new Error("At least one template is required");
    const tx = this.sqlite.transaction(() => {
      const target = this.getMilestoneTemplate(id);
      const ok = this.db.delete(milestoneTemplates).where(eq(milestoneTemplates.id, id)).run().changes > 0;
      if (ok && target?.isDefault) {
        const next = this.db.select().from(milestoneTemplates).get();
        if (next) { this.sqlite.prepare("UPDATE milestone_templates SET is_default = 1 WHERE id = ?").run(next.id); this.mirrorDefaultTemplate(next); }
      }
      return ok;
    });
    return tx();
  }
  /** Keep the legacy `milestoneNames` setting equal to the default template so older readers still work. */
  private mirrorDefaultTemplate(t: MilestoneTemplate) {
    this.setSetting("milestoneNames", t.stages);
  }

  // ---- Publications (outlets) ----
  getAllPublications(): Publication[] {
    return this.db.select().from(publications).orderBy(publications.name).all();
  }
  getPublication(id: number): Publication | undefined {
    return this.db.select().from(publications).where(eq(publications.id, id)).get();
  }
  getPublicationByName(name: string): Publication | undefined {
    return this.sqlite.prepare("SELECT id, name, notes, guidelines_url AS guidelinesUrl, rate, created_at AS createdAt FROM publications WHERE name = ? COLLATE NOCASE").get(name.trim()) as Publication | undefined;
  }
  createPublication(data: Partial<InsertPublication> & { name: string }): Publication {
    const name = data.name.trim();
    if (!name) throw new Error("Publication name is required");
    const existing = this.getPublicationByName(name);
    if (existing) return existing;
    return this.db.insert(publications).values({
      name, notes: data.notes ?? "", guidelinesUrl: data.guidelinesUrl ?? null, rate: data.rate ?? null, createdAt: new Date().toISOString(),
    }).returning().get();
  }
  /** Update an outlet. A rename cascades to projects and publication history so nothing is orphaned. */
  updatePublication(id: number, data: Partial<InsertPublication>): Publication | undefined {
    const tx = this.sqlite.transaction(() => {
      const current = this.getPublication(id);
      if (!current) return undefined;
      const patch: Partial<InsertPublication> = { ...data };
      delete (patch as { createdAt?: string }).createdAt;
      if (data.name !== undefined) {
        const name = data.name.trim();
        if (!name) throw new Error("Publication name is required");
        const clash = this.getPublicationByName(name);
        if (clash && clash.id !== id) throw new Error(`A publication named "${clash.name}" already exists`);
        patch.name = name;
      }
      const updated = this.db.update(publications).set(patch).where(eq(publications.id, id)).returning().get();
      if (updated && updated.name !== current.name) {
        this.sqlite.prepare("UPDATE projects SET publication = ? WHERE publication_id = ?").run(updated.name, id);
        this.sqlite.prepare("UPDATE publication_history SET publication = ? WHERE publication = ? COLLATE NOCASE").run(updated.name, current.name);
        this.sqlite.prepare("UPDATE publication_notes SET publication_name = ? WHERE publication_name = ? COLLATE NOCASE").run(updated.name, current.name);
      }
      return updated;
    });
    return tx();
  }
  /** Delete an outlet. Projects that targeted it are unlinked; history entries keep their text. */
  deletePublication(id: number): boolean {
    const tx = this.sqlite.transaction(() => {
      this.sqlite.prepare("UPDATE projects SET publication_id = NULL, publication = NULL WHERE publication_id = ?").run(id);
      return this.db.delete(publications).where(eq(publications.id, id)).run().changes > 0;
    });
    return tx();
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
    const outlet = this.getPublicationByName(publicationName);
    if (outlet) this.sqlite.prepare("UPDATE publications SET notes = ? WHERE id = ?").run(notes, outlet.id);
    return this.db.select().from(publicationNotes)
      .where(eq(publicationNotes.publicationName, publicationName)).get()!;
  }
}
