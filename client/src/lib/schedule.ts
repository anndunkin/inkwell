import type { Deadline, Milestone, Project } from "@shared/schema";
import { daysUntil } from "@/lib/dates";

export interface ScheduleEntry {
  key: string;
  kind: "deadline" | "milestone";
  id: number;
  /** Deadline title, or the milestone (stage) name. */
  title: string;
  dueDate: string;
  status: "pending" | "completed" | "missed";
  priority?: string;
  projectId: number | null;
  projectTitle?: string;
  raw: Deadline | Milestone;
}

export function buildEntries(deadlines: Deadline[], milestones: Milestone[], projects: Project[]): ScheduleEntry[] {
  const titles = new Map(projects.map(p => [p.id, p.title]));
  const fromDeadlines: ScheduleEntry[] = deadlines.map(d => ({
    key: `deadline-${d.id}`, kind: "deadline", id: d.id, title: d.title, dueDate: d.dueDate,
    status: (d.status === "completed" || d.status === "missed" ? d.status : "pending"),
    priority: d.priority, projectId: d.projectId ?? null,
    projectTitle: d.projectId ? titles.get(d.projectId) : undefined, raw: d,
  }));
  const fromMilestones: ScheduleEntry[] = milestones
    .filter(m => !!m.dueDate)
    .map(m => ({
      key: `milestone-${m.id}`, kind: "milestone", id: m.id, title: m.name, dueDate: m.dueDate!,
      status: m.status === "completed" ? "completed" : "pending",
      projectId: m.projectId, projectTitle: titles.get(m.projectId) ?? "Unknown project", raw: m,
    }));
  return [...fromDeadlines, ...fromMilestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
}

export interface Groups {
  overdue: ScheduleEntry[];
  thisWeek: ScheduleEntry[];
  upcoming: ScheduleEntry[];
  done: ScheduleEntry[];
}

export function groupEntries(entries: ScheduleEntry[]): Groups {
  const pending = entries.filter(e => e.status === "pending");
  return {
    overdue: pending.filter(e => daysUntil(e.dueDate) < 0),
    thisWeek: pending.filter(e => { const d = daysUntil(e.dueDate); return d >= 0 && d <= 7; }),
    upcoming: pending.filter(e => daysUntil(e.dueDate) > 7),
    done: entries.filter(e => e.status !== "pending").sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
  };
}

export function entryLabel(e: ScheduleEntry, showProject: boolean): string {
  return e.kind === "milestone" && showProject && e.projectTitle ? `${e.projectTitle} — ${e.title}` : e.title;
}
