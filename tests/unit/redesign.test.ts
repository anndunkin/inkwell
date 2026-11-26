import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InkwellDB } from "../../electron/db";

const base = { description: null, notes: null, ideaId: null, publication: null, publicationId: null, isRecurring: false, recurringInterval: null, createdAt: "" };

describe("publications", () => {
  let db: InkwellDB;
  beforeEach(() => { db = new InkwellDB(":memory:"); });
  afterEach(() => db.close());

  it("seeds default outlets in a new file and finds them case-insensitively", () => {
    expect(db.getAllPublications().length).toBeGreaterThan(0);
    expect(db.getPublicationByName("the atlantic")?.name).toBe("The Atlantic");
  });

  it("links a project by id and mirrors the name", () => {
    const pub = db.createPublication({ name: "Grid Weekly" });
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active", publicationId: pub.id });
    expect(p.publication).toBe("Grid Weekly");
    expect(p.publicationId).toBe(pub.id);
  });

  it("accepts a legacy name-only project and links or creates the outlet", () => {
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active", publication: "Brand New Outlet" });
    expect(p.publicationId).toBe(db.getPublicationByName("Brand New Outlet")!.id);
  });

  it("renaming an outlet updates its projects and history; duplicate names are rejected", () => {
    const pub = db.createPublication({ name: "Old Name" });
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active", publicationId: pub.id });
    db.createPublicationHistory({ publication: "Old Name", projectId: p.id, projectTitle: "T", publishedDate: "2026-01-01", notes: null, createdAt: "" });
    db.updatePublication(pub.id, { name: "New Name" });
    expect(db.getProject(p.id)!.publication).toBe("New Name");
    expect(db.getAllPublicationHistory().some(h => h.publication === "New Name")).toBe(true);
    expect(() => db.updatePublication(pub.id, { name: "the atlantic" })).toThrow(/already exists/);
  });

  it("deleting an outlet unlinks projects but keeps history text", () => {
    const pub = db.createPublication({ name: "Gone" });
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active", publicationId: pub.id });
    db.createPublicationHistory({ publication: "Gone", projectId: p.id, projectTitle: "T", publishedDate: "2026-01-01", notes: null, createdAt: "" });
    expect(db.deletePublication(pub.id)).toBe(true);
    expect(db.getProject(p.id)!.publicationId).toBeNull();
    expect(db.getProject(p.id)!.publication).toBeNull();
    expect(db.getAllPublicationHistory().some(h => h.publication === "Gone")).toBe(true);
  });
});

describe("per-project milestone sequences and templates", () => {
  let db: InkwellDB;
  beforeEach(() => { db = new InkwellDB(":memory:"); });
  afterEach(() => db.close());

  it("has a default template and seeds a new project's own pipeline from it", () => {
    const t = db.getDefaultMilestoneTemplate()!;
    const stages = JSON.parse(t.stages) as string[];
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active" }, t.id);
    expect(db.getMilestonesForProject(p.id).map(m => m.name)).toEqual(stages);
  });

  it("lets one project diverge without affecting another or the template", () => {
    const t = db.createMilestoneTemplate({ name: "Op-ed", stages: ["Pitch", "Draft", "Published"] });
    const a = db.createProject({ ...base, title: "A", type: "essay", status: "active" }, t.id);
    const b = db.createProject({ ...base, title: "B", type: "essay", status: "active" }, t.id);
    const [pitch, draft, pub] = db.getMilestonesForProject(a.id);
    db.updateMilestone(draft.id, { name: "Rewrite" });
    db.deleteMilestone(pitch.id);
    db.createMilestone({ projectId: a.id, name: "Legal read", status: "not_started", dueDate: null, completedAt: null, notes: null, sortOrder: 0, createdAt: "" });
    expect(db.getMilestonesForProject(a.id).map(m => m.name)).toEqual(["Rewrite", "Published", "Legal read"]);
    expect(db.getMilestonesForProject(b.id).map(m => m.name)).toEqual(["Pitch", "Draft", "Published"]);
    expect(JSON.parse(db.getMilestoneTemplate(t.id)!.stages)).toEqual(["Pitch", "Draft", "Published"]);
    expect(pub.name).toBe("Published");
  });

  it("reorders stages", () => {
    const t = db.createMilestoneTemplate({ name: "Short", stages: ["A", "B", "C"] });
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active" }, t.id);
    const [a, b, c] = db.getMilestonesForProject(p.id);
    expect(db.reorderMilestones(p.id, [c.id, a.id, b.id]).map(m => m.name)).toEqual(["C", "A", "B"]);
    // Ids from another project or omitted ids are handled safely.
    expect(db.reorderMilestones(p.id, [b.id]).map(m => m.name)).toEqual(["B", "C", "A"]);
  });

  it("applying a template appends only missing stages, case-insensitively", () => {
    const t1 = db.createMilestoneTemplate({ name: "T1", stages: ["Draft", "Edit"] });
    const t2 = db.createMilestoneTemplate({ name: "T2", stages: ["draft", "Legal", "Edit", "Ship"] });
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active" }, t1.id);
    expect(db.applyTemplateToProject(p.id, t2.id).map(m => m.name)).toEqual(["Draft", "Edit", "Legal", "Ship"]);
  });

  it("keeps exactly one default, mirrors it to the legacy setting, and refuses to delete the last template", () => {
    const t = db.createMilestoneTemplate({ name: "Book", stages: ["Outline", "Draft"], isDefault: true });
    expect(db.getAllMilestoneTemplates().filter(x => x.isDefault)).toHaveLength(1);
    expect(JSON.parse(db.getSetting("milestoneNames")!)).toEqual(["Outline", "Draft"]);
    expect(db.deleteMilestoneTemplate(t.id)).toBe(true);
    expect(db.getAllMilestoneTemplates().filter(x => x.isDefault)).toHaveLength(1);
    const only = db.getAllMilestoneTemplates();
    expect(only).toHaveLength(1);
    expect(() => db.deleteMilestoneTemplate(only[0].id)).toThrow();
  });

  it("recurring projects copy the project's own stages to the next instance", () => {
    const t = db.createMilestoneTemplate({ name: "Column", stages: ["Pitch", "File"] });
    const p = db.createProject({ ...base, title: "Weekly", type: "article", status: "active", isRecurring: true, recurringInterval: "weekly" }, t.id);
    db.createDeadline({ title: "Weekly", projectId: p.id, dueDate: "2020-01-01", priority: "medium", status: "pending", notes: null, createdAt: "" });
    const next = db.spawnNextRecurringDeadline(p.id)!;
    expect(db.getMilestonesForProject(next.id).map(m => m.name)).toEqual(["Pitch", "File"]);
  });
});

describe("idea promotion and publishing", () => {
  let db: InkwellDB;
  beforeEach(() => { db = new InkwellDB(":memory:"); });
  afterEach(() => db.close());

  it("promotes an idea once, copying details and moving it to developing", () => {
    const idea = db.createIdea({ title: "Grid", description: "d", category: "essay", status: "new", tags: "[]", notes: "n", createdAt: "" });
    const p = db.promoteIdea(idea.id);
    expect(p).toMatchObject({ title: "Grid", description: "d", notes: "n", type: "essay", ideaId: idea.id });
    expect(db.getMilestonesForProject(p.id).length).toBeGreaterThan(0);
    expect(db.getIdea(idea.id)!.status).toBe("developing");
    expect(db.promoteIdea(idea.id).id).toBe(p.id);
    expect(db.getAllProjects()).toHaveLength(1);
  });

  it("uses 'article' for a general idea", () => {
    const idea = db.createIdea({ title: "X", category: "general", status: "new", tags: "[]", createdAt: "" });
    expect(db.promoteIdea(idea.id).type).toBe("article");
  });

  it("publishing completes the project, publishes the idea and logs history", () => {
    const idea = db.createIdea({ title: "X", category: "article", status: "developing", tags: "[]", createdAt: "" });
    const pub = db.createPublication({ name: "Grid Weekly" });
    const p = db.promoteIdea(idea.id, { publicationId: pub.id });
    const before = db.getAllPublicationHistory().length;
    const res = db.publishProject(p.id, "2026-11-25");
    expect(res.project.status).toBe("completed");
    expect(res.history).toMatchObject({ publication: "Grid Weekly", projectTitle: "X", publishedDate: "2026-11-25" });
    expect(db.getIdea(idea.id)!.status).toBe("published");
    expect(db.getAllPublicationHistory()).toHaveLength(before + 1);
  });

  it("publishing a project with no outlet completes it without inventing history", () => {
    const p = db.createProject({ ...base, title: "T", type: "article", status: "active" });
    const before = db.getAllPublicationHistory().length;
    expect(db.publishProject(p.id, "2026-11-25").history).toBeNull();
    expect(db.getAllPublicationHistory()).toHaveLength(before);
  });
});
