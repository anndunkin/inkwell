import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { InkwellDB } from "../../electron/db";
import { FileSession } from "../../electron/fileOps";

describe("InkwellDB CRUD", () => {
  let db: InkwellDB;

  beforeEach(() => {
    db = new InkwellDB(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("ideas", () => {
    it("creates and reads an idea", () => {
      const created = db.createIdea({
        title: "Grid resilience",
        description: "Article on the power grid",
        category: "article",
        status: "new",
        tags: '["energy"]',
        notes: "",
        createdAt: "",
      });
      expect(created.id).toBeGreaterThan(0);
      expect(created.title).toBe("Grid resilience");
      expect(created.createdAt).not.toBe("");

      const all = db.getAllIdeas();
      expect(all).toHaveLength(1);
      expect(db.getIdea(created.id)?.title).toBe("Grid resilience");
    });

    it("updates an idea", () => {
      const created = db.createIdea({ title: "A", category: "general", status: "new", tags: "[]", createdAt: "" });
      const updated = db.updateIdea(created.id, { status: "developing", title: "A revised" });
      expect(updated?.status).toBe("developing");
      expect(updated?.title).toBe("A revised");
    });

    it("deletes an idea", () => {
      const created = db.createIdea({ title: "Temp", category: "general", status: "new", tags: "[]", createdAt: "" });
      expect(db.deleteIdea(created.id)).toBe(true);
      expect(db.getAllIdeas()).toHaveLength(0);
      expect(db.deleteIdea(9999)).toBe(false);
    });
  });

  describe("projects", () => {
    it("creates, updates, deletes a project", () => {
      const created = db.createProject({ title: "Book", type: "book", status: "active", ideaId: null, createdAt: "" });
      expect(created.title).toBe("Book");

      const updated = db.updateProject(created.id, { status: "completed" });
      expect(updated?.status).toBe("completed");

      expect(db.deleteProject(created.id)).toBe(true);
      expect(db.getAllProjects()).toHaveLength(0);
    });
  });

  describe("deadlines", () => {
    it("creates, updates, deletes a deadline", () => {
      const created = db.createDeadline({
        title: "Submit draft",
        projectId: null,
        dueDate: "2026-07-01",
        priority: "high",
        status: "pending",
        createdAt: "",
      });
      expect(created.dueDate).toBe("2026-07-01");

      const updated = db.updateDeadline(created.id, { status: "completed" });
      expect(updated?.status).toBe("completed");

      expect(db.deleteDeadline(created.id)).toBe(true);
      expect(db.getAllDeadlines()).toHaveLength(0);
    });
  });

  describe("publication notes", () => {
    it("upserts notes: inserts then updates the same publication", () => {
      const inserted = db.upsertPublicationNote("The Atlantic", "Editor: jane@theatlantic.com");
      expect(inserted.publicationName).toBe("The Atlantic");
      expect(inserted.notes).toBe("Editor: jane@theatlantic.com");
      expect(inserted.updatedAt).not.toBe("");

      const updated = db.upsertPublicationNote("The Atlantic", "Pays $1/word, 1500 word max");
      expect(updated.notes).toBe("Pays $1/word, 1500 word max");

      const all = db.getAllPublicationNotes();
      expect(all).toHaveLength(1);
      expect(all[0].notes).toBe("Pays $1/word, 1500 word max");
    });
  });
});

describe("FileSession file operations", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "inkwell-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens a new file and starts not dirty", () => {
    const session = new FileSession();
    const file = path.join(dir, "a.inkwell");
    session.newFile(file);
    expect(existsSync(file)).toBe(true);
    expect(session.currentPath).toBe(file);
    expect(session.isDirty).toBe(false);
    session.close();
  });

  it("tracks dirty state on mutation and clears on save", () => {
    const session = new FileSession();
    session.newFile(path.join(dir, "b.inkwell"));
    session.db!.createIdea({ title: "x", category: "general", status: "new", tags: "[]", createdAt: "" });
    session.markDirty();
    expect(session.isDirty).toBe(true);

    const saved = session.save();
    expect(saved).toBe(session.currentPath);
    expect(session.isDirty).toBe(false);
    session.close();
  });

  it("saveAs copies data to a new file and switches active path", () => {
    const session = new FileSession();
    const original = path.join(dir, "orig.inkwell");
    session.newFile(original);
    session.db!.createIdea({ title: "carry over", category: "general", status: "new", tags: "[]", createdAt: "" });

    const target = path.join(dir, "copy.inkwell");
    const result = session.saveAs(target);

    expect(result).toBe(target);
    expect(session.currentPath).toBe(target);
    expect(existsSync(target)).toBe(true);
    // Data copied into the new file
    expect(session.db!.getAllIdeas().map((i) => i.title)).toContain("carry over");
    session.close();
  });

  it("save returns null when there is no current path", () => {
    const session = new FileSession();
    expect(session.save()).toBeNull();
  });
});
