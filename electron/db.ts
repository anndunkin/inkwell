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
import { ideas, projects, deadlines, publicationHistory } from "../shared/schema";
import type {
  Idea,
  InsertIdea,
  Project,
  InsertProject,
  Deadline,
  InsertDeadline,
  PublicationHistory,
  InsertPublicationHistory,
} from "../shared/schema";

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
    if (!this.getSetting("projectTypes")) this.setSetting("projectTypes", JSON.stringify(defaultProjectTypes));
    if (!this.getSetting("publications")) this.setSetting("publications", JSON.stringify(defaultPublications));
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
    return this.db.delete(projects).where(eq(projects.id, id)).run().changes > 0;
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
}
