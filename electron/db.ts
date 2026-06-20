// When packaged inside an asar, native modules must be loaded from the
// asarUnpack path (app.asar.unpacked) so the .node binding is accessible.
// In dev / tests / CI the regular node_modules path works fine.
import path from "path";
import type BetterSqlite3 from "better-sqlite3";

// Detect whether we're running inside a packaged Electron app.
// When running under plain Node (unit tests, migration scripts) the `electron`
// module is not available, so we fall back gracefully.
function isPackaged(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    return app?.isPackaged ?? false;
  } catch {
    return false;
  }
}

function loadDatabase(): typeof BetterSqlite3 {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _require = require;
  if (isPackaged()) {
    // Load the native module from the unpacked directory next to the asar
    const unpackedPath = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "better-sqlite3"
    );
    return _require(unpackedPath);
  }
  return _require("better-sqlite3");
}

const Database = loadDatabase() as unknown as typeof BetterSqlite3;

import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { ideas, projects, deadlines } from "../shared/schema";
import type {
  Idea,
  InsertIdea,
  Project,
  InsertProject,
  Deadline,
  InsertDeadline,
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
    notes TEXT,
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
  }

  close() {
    this.sqlite.close();
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
