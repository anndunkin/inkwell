import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Lightbulb, CalendarX, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EntryRow } from "@/components/ScheduleView";
import { useAllMilestones, useDeadlines, useIdeas, useProjects, refreshAll } from "@/lib/data";
import { buildEntries } from "@/lib/schedule";
import { daysUntil, greeting, formatDate, todayStr } from "@/lib/dates";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";

function Block({ title, count, children, testId }: { title: string; count?: number; children: React.ReactNode; testId: string }) {
  return (
    <section className="mb-8" data-testid={testId}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
        {title}{count !== undefined ? ` (${count})` : ""}
      </h2>
      {children}
    </section>
  );
}

export default function TodayPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const deadlines = useDeadlines();
  const milestones = useAllMilestones();
  const projects = useProjects();
  const ideas = useIdeas();

  const entries = useMemo(
    () => buildEntries(deadlines.data ?? [], milestones.data ?? [], projects.data ?? []),
    [deadlines.data, milestones.data, projects.data],
  );
  // Only pending entries from projects that are still open.
  const openIds = new Set((projects.data ?? []).filter(p => p.status === "active" || p.status === "on-hold").map(p => p.id));
  const live = entries.filter(e => e.status === "pending" && (e.projectId === null || openIds.has(e.projectId)));
  const overdue = live.filter(e => daysUntil(e.dueDate) < 0);
  const soon = live.filter(e => { const d = daysUntil(e.dueDate); return d >= 0 && d <= 7; });

  const datedProjects = new Set(live.map(e => e.projectId).filter((x): x is number => x !== null));
  const needsDate = (projects.data ?? []).filter(p => p.status === "active" && !datedProjects.has(p.id));
  const recentIdeas = (ideas.data ?? []).filter(i => i.status === "new" || i.status === "developing").slice(0, 4);

  async function promote(id: number) {
    const project = await ipc().ideas.promote(id, {});
    await refreshAll();
    toast({ title: "Idea promoted to a project" });
    navigate(`/projects/${project.id}`);
  }

  if (deadlines.isLoading || projects.isLoading) {
    return <div className="p-6 max-w-3xl mx-auto space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  }

  const caughtUp = overdue.length === 0 && soon.length === 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-greeting">{greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{formatDate(todayStr(), "long")}</p>
      </div>

      {overdue.length > 0 && (
        <Block title="Overdue" count={overdue.length} testId="today-overdue">
          <div className="space-y-2">{overdue.map(e => <EntryRow key={e.key} entry={e} />)}</div>
        </Block>
      )}

      <Block title="Due in the next 7 days" count={soon.length} testId="today-soon">
        {soon.length > 0
          ? <div className="space-y-2">{soon.map(e => <EntryRow key={e.key} entry={e} />)}</div>
          : caughtUp
            ? <div className="rounded-lg border bg-card p-6 text-center" data-testid="today-caught-up">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p className="font-medium text-sm">You are all caught up</p>
                <p className="text-xs text-muted-foreground mt-1">Nothing is overdue or due this week.</p>
              </div>
            : <p className="text-sm text-muted-foreground">Nothing else due this week.</p>}
      </Block>

      {needsDate.length > 0 && (
        <Block title="Projects with no dates" count={needsDate.length} testId="today-needs-date">
          <div className="space-y-2">
            {needsDate.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CalendarX className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Link href={`/projects/${p.id}`} className="text-sm font-medium hover:underline truncate">{p.title}</Link>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => navigate(`/projects/${p.id}`)}>Add dates</Button>
              </div>
            ))}
          </div>
        </Block>
      )}

      {recentIdeas.length > 0 && (
        <Block title="Ideas waiting" testId="today-ideas">
          <div className="space-y-2">
            {recentIdeas.map(i => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm truncate">{i.title}</span>
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1 shrink-0" onClick={() => promote(i.id)} data-testid={`button-today-promote-${i.id}`}>
                  Promote <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}
