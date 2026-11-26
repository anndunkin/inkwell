import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import type {
  Idea, Project, Deadline, Milestone, Publication, PublicationHistory, MilestoneTemplate,
} from "@shared/schema";

export const useIdeas = () => useQuery<Idea[]>({ queryKey: ["/api/ideas"] });
export const useProjects = () => useQuery<Project[]>({ queryKey: ["/api/projects"] });
export const useDeadlines = () => useQuery<Deadline[]>({ queryKey: ["/api/deadlines"] });
export const useAllMilestones = () => useQuery<Milestone[]>({ queryKey: ["/api/milestones"], queryFn: () => ipc().milestones.getAll() });
export const usePublications = () => useQuery<Publication[]>({ queryKey: ["/api/publications"] });
export const useTemplates = () => useQuery<MilestoneTemplate[]>({ queryKey: ["/api/templates"] });
export const usePubHistory = () => useQuery<PublicationHistory[]>({ queryKey: ["/api/pubHistory"], queryFn: () => ipc().pubHistory.getAll() });
export const useProjectTypes = () => {
  const q = useQuery<string | null>({ queryKey: ["/api/settings/projectTypes"], queryFn: () => ipc().settings.get("projectTypes") });
  return { ...q, data: parseList(q.data, DEFAULT_PROJECT_TYPES) };
};

export const DEFAULT_PROJECT_TYPES = ["article", "book", "essay", "blog", "speech", "report", "policy", "white paper", "other"];

export function parseList(json: string | null | undefined, fallback: string[] = []): string[] {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fallback;
  } catch { return fallback; }
}

export function parseStages(t: MilestoneTemplate | undefined | null): string[] {
  return t ? parseList(t.stages, []) : [];
}

/** After any write, re-read everything that is currently on screen. */
export function refreshAll() {
  return queryClient.invalidateQueries();
}

/** Milestones of one project in the project's own order. */
export function orderedFor(milestones: Milestone[], projectId: number): Milestone[] {
  return milestones
    .filter(m => m.projectId === projectId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export const PROJECT_STATUSES = ["active", "on-hold", "completed", "cancelled"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const INTERVALS = ["weekly", "biweekly", "monthly", "quarterly", "annual"] as const;
