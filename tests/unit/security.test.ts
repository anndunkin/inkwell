import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InkwellDB } from "../../electron/db";

// Security-focused tests for the Inkwell SQLite/IPC layer. The renderer talks to
// these db methods over contextBridge IPC, so any string a user types on a page
// (project title, milestone name, publication name, notes) ends up here. These
// tests assert that untrusted input is stored as data, never executed as SQL,
// and that malformed input fails safely rather than corrupting the database.

describe("SQL injection prevention", () => {
  let db: InkwellDB;

  beforeEach(() => {
    db = new InkwellDB(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  const INJECTIONS = [
    "'; DROP TABLE projects; --",
    '" OR "1"="1',
    "1); DELETE FROM milestones; --",
    "Robert'); DROP TABLE deadlines;--",
  ];

  it("stores injection strings as literal project titles, not executed SQL", () => {
    for (const payload of INJECTIONS) {
      const created = db.createProject({ title: payload, type: "article", status: "active", ideaId: null, createdAt: "" });
      // The value is round-tripped verbatim...
      expect(created.title).toBe(payload);
      expect(db.getProject(created.id)?.title).toBe(payload);
    }
    // ...and no table was dropped: every prepared statement still works.
    expect(() => db.getAllProjects()).not.toThrow();
    expect(() => db.getAllMilestones()).not.toThrow();
    expect(() => db.getAllDeadlines()).not.toThrow();
    expect(db.getAllProjects()).toHaveLength(INJECTIONS.length);
  });

  it("stores injection strings as literal milestone names", () => {
    const project = db.createProject({ title: "P", type: "article", status: "active", ideaId: null, createdAt: "" });
    const payload = "'; DROP TABLE milestones; --";
    const m = db.createMilestone({ projectId: project.id, name: payload, status: "not_started", dueDate: null, completedAt: null, notes: null, sortOrder: 0, createdAt: "" });
    expect(m.name).toBe(payload);
    expect(db.getMilestonesForProject(project.id)[0].name).toBe(payload);
    expect(() => db.getAllMilestones()).not.toThrow();
  });

  it("stores injection strings as literal publication names and notes", () => {
    const payload = '" OR "1"="1';
    const note = "'; DELETE FROM publication_notes; --";
    const saved = db.upsertPublicationNote(payload, note);
    expect(saved.publicationName).toBe(payload);
    expect(saved.notes).toBe(note);
    const all = db.getAllPublicationNotes();
    expect(all).toHaveLength(1);
    expect(all[0].publicationName).toBe(payload);
  });
});

describe("IPC input validation / edge cases", () => {
  let db: InkwellDB;

  beforeEach(() => {
    db = new InkwellDB(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("accepts empty strings for required text fields", () => {
    const created = db.createProject({ title: "", type: "article", status: "active", ideaId: null, createdAt: "" });
    expect(created.title).toBe("");
    expect(db.getProject(created.id)?.title).toBe("");
  });

  it("handles very long strings (>10k chars) without truncation", () => {
    const long = "x".repeat(20000);
    const created = db.createIdea({ title: long, category: "general", status: "new", tags: "[]", createdAt: "" });
    const fetched = db.getIdea(created.id);
    expect(fetched?.title).toHaveLength(20000);
    expect(fetched?.title).toBe(long);
  });

  it("preserves special characters, path-like strings, and null bytes verbatim", () => {
    const specials = [
      "<script>alert('xss')</script>",
      "../../etc/passwd",
      "line1\nline2\ttabbed",
      "null\0byte",
      "emoji 🖋️ unicode café",
    ];
    for (const s of specials) {
      const created = db.createIdea({ title: s, category: "general", status: "new", tags: "[]", createdAt: "" });
      expect(db.getIdea(created.id)?.title).toBe(s);
    }
  });

  it("throws (does not crash the process) when a NOT NULL field is null/undefined", () => {
    // A malformed IPC payload must surface as a rejected promise on the handler,
    // not silently write a bad row. better-sqlite3 enforces NOT NULL constraints.
    expect(() => db.createProject({ title: null as unknown as string, type: "article", status: "active", ideaId: null, createdAt: "" })).toThrow();
    expect(() => db.createProject({ title: undefined as unknown as string, type: "article", status: "active", ideaId: null, createdAt: "" })).toThrow();
  });

  it("returns false rather than throwing when deleting a non-existent row", () => {
    expect(db.deleteProject(999999)).toBe(false);
    expect(db.deleteIdea(999999)).toBe(false);
    expect(db.deleteMilestone(999999)).toBe(false);
    expect(db.deleteDeadline(999999)).toBe(false);
  });
});

describe("Database file path handling", () => {
  // InkwellDB itself performs no path validation: it opens whatever filename it
  // is handed (":memory:", a temp file, or a real .inkwell path). Path safety is
  // enforced one layer up — electron/main.ts only ever passes paths chosen by the
  // user through the OS file dialog, which is filtered to the "inkwell" extension
  // (see doNewFile / doOpen / doSaveAs). This test documents that contract.
  it("opens an in-memory database without requiring an .inkwell path", () => {
    const db = new InkwellDB(":memory:");
    expect(() => db.getAllProjects()).not.toThrow();
    db.close();
  });
});

describe("Data integrity", () => {
  let db: InkwellDB;

  beforeEach(() => {
    db = new InkwellDB(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("cascades: deleting a project deletes its milestones and deadlines", () => {
    const project = db.createProject({ title: "Doomed", type: "article", status: "active", ideaId: null, createdAt: "" });
    db.createMilestone({ projectId: project.id, name: "First Draft", status: "not_started", dueDate: null, completedAt: null, notes: null, sortOrder: 0, createdAt: "" });
    db.createDeadline({ title: "Due", projectId: project.id, dueDate: "2026-07-01", priority: "medium", status: "pending", createdAt: "" });

    // A milestone/deadline for a different project must survive the cascade.
    const other = db.createProject({ title: "Keep", type: "article", status: "active", ideaId: null, createdAt: "" });
    db.createMilestone({ projectId: other.id, name: "Keep Draft", status: "not_started", dueDate: null, completedAt: null, notes: null, sortOrder: 0, createdAt: "" });
    db.createDeadline({ title: "Keep Due", projectId: other.id, dueDate: "2026-07-02", priority: "medium", status: "pending", createdAt: "" });

    expect(db.deleteProject(project.id)).toBe(true);

    expect(db.getMilestonesForProject(project.id)).toHaveLength(0);
    expect(db.getAllDeadlines().filter(d => d.projectId === project.id)).toHaveLength(0);

    expect(db.getMilestonesForProject(other.id)).toHaveLength(1);
    expect(db.getAllDeadlines().filter(d => d.projectId === other.id)).toHaveLength(1);
  });

  it("keeps publication_history rows when a publication is unlinked (no orphan deletion)", () => {
    const hist = db.createPublicationHistory({ publication: "The Atlantic", projectId: null, projectTitle: "Essay", publishedDate: "2026-06-01", notes: null, createdAt: "" });
    // Changing the settings-stored publication list does not touch history rows.
    db.setSetting("publications", JSON.stringify(["Politico"]));
    const all = db.getAllPublicationHistory();
    expect(all.some(h => h.id === hist.id && h.publication === "The Atlantic")).toBe(true);
  });

  it("keeps settings keyed and idempotent (no duplicate rows on repeated writes)", () => {
    // Settings is a key/value store; writing the same key twice must not create a
    // second row. INSERT OR REPLACE keeps each key unique.
    db.setSetting("milestoneNames", JSON.stringify(["A"]));
    db.setSetting("milestoneNames", JSON.stringify(["A", "B"]));
    expect(db.getSetting("milestoneNames")).toBe(JSON.stringify(["A", "B"]));
    const rows = (db.sqlite.prepare("SELECT COUNT(*) as c FROM settings WHERE key = ?").get("milestoneNames") as { c: number }).c;
    expect(rows).toBe(1);
  });
});
