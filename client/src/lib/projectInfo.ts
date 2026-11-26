import type { Milestone, Project } from "@shared/schema";
import type { ScheduleEntry } from "@/lib/schedule";
import { orderedFor } from "@/lib/data";

export interface ProjectSummary {
  project: Project;
  stages: Milestone[];
  done: number;
  /** First stage not completed, or null when every stage is done or none exist. */
  current: Milestone | null;
  next: ScheduleEntry | null;
}

export function summarize(project: Project, milestones: Milestone[], entries: ScheduleEntry[]): ProjectSummary {
  const stages = orderedFor(milestones, project.id);
  const done = stages.filter(s => s.status === "completed").length;
  const current = stages.find(s => s.status !== "completed") ?? null;
  const next = entries.filter(e => e.projectId === project.id && e.status === "pending").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  return { project, stages, done, current, next };
}

export const STATUS_STYLE: Record<string, string> = {
  active: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  "on-hold": "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  completed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
};
