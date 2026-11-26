import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InkwellDB, localDateStr } from "../../electron/db";

const base = { description: null, notes: null, ideaId: null, publication: null, publicationId: null, createdAt: "" };
const dl = (projectId: number, dueDate: string) => ({ title: "Piece", projectId, dueDate, priority: "medium", status: "pending", notes: null, createdAt: "" });
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); };

describe("skipRecurringOccurrence", () => {
  let db: InkwellDB;
  beforeEach(() => { db = new InkwellDB(":memory:"); });
  afterEach(() => db.close());

  it("marks open deadlines skipped, closes the project and schedules the next occurrence", () => {
    const p = db.createProject({ ...base, title: "Column", type: "article", status: "active", isRecurring: true, recurringInterval: "weekly" });
    const due = inDays(3);
    const d = db.createDeadline(dl(p.id, due));
    const r = db.skipRecurringOccurrence(p.id);
    expect(r.skipped).toBe(1);
    expect(r.next).not.toBeNull();
    expect(db.getDeadline(d.id)!.status).toBe("skipped");
    expect(db.getProject(p.id)!.status).toBe("cancelled");
    const nextDl = db.getAllDeadlines().filter(x => x.projectId === r.next!.id);
    expect(nextDl).toHaveLength(1);
    expect(nextDl[0].status).toBe("pending");
    expect(nextDl[0].dueDate > due).toBe(true);
  });

  it("an overdue occurrence is followed by a future one, not another overdue date", () => {
    const p = db.createProject({ ...base, title: "Column", type: "article", status: "active", isRecurring: true, recurringInterval: "weekly" });
    db.createDeadline(dl(p.id, "2020-01-01"));
    const r = db.skipRecurringOccurrence(p.id);
    const nextDl = db.getAllDeadlines().find(x => x.projectId === r.next!.id)!;
    expect(nextDl.dueDate > localDateStr()).toBe(true);
  });

  it("does not touch completed deadlines or delete anything", () => {
    const p = db.createProject({ ...base, title: "Column", type: "article", status: "active", isRecurring: true, recurringInterval: "monthly" });
    const done = db.createDeadline({ ...dl(p.id, "2020-01-01"), status: "completed" });
    db.createDeadline(dl(p.id, inDays(5)));
    db.skipRecurringOccurrence(p.id);
    expect(db.getDeadline(done.id)!.status).toBe("completed");
    expect(db.getAllDeadlines().filter(x => x.projectId === p.id)).toHaveLength(2);
  });

  it("refuses, changing nothing, when not recurring, no interval, or nothing open", () => {
    const a = db.createProject({ ...base, title: "A", type: "article", status: "active", isRecurring: false, recurringInterval: null });
    db.createDeadline(dl(a.id, inDays(2)));
    expect(() => db.skipRecurringOccurrence(a.id)).toThrow(/not recurring/);
    const b = db.createProject({ ...base, title: "B", type: "article", status: "active", isRecurring: true, recurringInterval: null });
    db.createDeadline(dl(b.id, inDays(2)));
    expect(() => db.skipRecurringOccurrence(b.id)).toThrow(/interval/);
    const c = db.createProject({ ...base, title: "C", type: "article", status: "active", isRecurring: true, recurringInterval: "weekly" });
    expect(() => db.skipRecurringOccurrence(c.id)).toThrow(/no open deadline/);
    expect(db.getProject(a.id)!.status).toBe("active");
    expect(db.getAllDeadlines().every(x => x.status === "pending")).toBe(true);
    expect(db.getAllProjects()).toHaveLength(3);
  });
});
