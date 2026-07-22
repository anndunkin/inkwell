import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Lightbulb, FolderOpen, Calendar, ArrowRight, Milestone as MilestoneIcon } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Idea, Project, Deadline, Milestone } from "@shared/schema";

interface UpcomingItem {
  key: string;
  kind: "deadline" | "milestone";
  id: number;
  title: string;
  dueDate: string;
  priority?: string;
}

function daysUntil(dateStr: string) {
  const due = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Dashboard() {
  const { data: ideas, isLoading: ideasLoading } = useQuery<Idea[]>({ queryKey: ["/api/ideas"] });
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: deadlines, isLoading: deadlinesLoading } = useQuery<Deadline[]>({ queryKey: ["/api/deadlines"] });
  const { data: milestones, isLoading: milestonesLoading } = useQuery<Milestone[]>({
    queryKey: ["/api/milestones"],
    queryFn: () => ipc().milestones.getAll(),
  });

  const activeProjects = projects?.filter(p => p.status === "active") ?? [];
  const projectTitle = Object.fromEntries((projects ?? []).map(p => [p.id, p.title]));

  const pendingDeadlineItems: UpcomingItem[] = (deadlines ?? [])
    .filter(d => d.status === "pending")
    .map(d => ({ key: `deadline-${d.id}`, kind: "deadline", id: d.id, title: d.title, dueDate: d.dueDate, priority: d.priority }));

  const pendingMilestoneItems: UpcomingItem[] = (milestones ?? [])
    .filter(m => !!m.dueDate && m.status !== "completed")
    .map(m => ({
      key: `milestone-${m.id}`,
      kind: "milestone",
      id: m.id,
      title: `${projectTitle[m.projectId] ?? "Project"} — ${m.name}`,
      dueDate: m.dueDate!,
    }));

  // Merge deadlines and milestones, soonest due date first.
  const pendingItems = [...pendingDeadlineItems, ...pendingMilestoneItems]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcomingDeadlines = pendingItems.slice(0, 5);
  const overdueCount = pendingItems.filter(d => daysUntil(d.dueDate) < 0).length;
  const newIdeas = ideas?.filter(i => i.status === "new") ?? [];

  const stats = [
    { label: "Writing Ideas", value: ideas?.length ?? 0, sub: `${newIdeas.length} new`, icon: Lightbulb, href: "/ideas", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Active Projects", value: activeProjects.length, sub: `${projects?.length ?? 0} total`, icon: FolderOpen, href: "/projects", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" },
    { label: "Upcoming Deadlines", value: pendingItems.length, sub: overdueCount > 0 ? `${overdueCount} overdue` : "all on track", icon: Calendar, href: "/deadlines", color: overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400", bg: overdueCount > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Good evening</h1>
        <p className="text-muted-foreground text-sm">Here's a summary of your writing workspace.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, sub, icon: Icon, href, color, bg }) => (
          <Link key={label} href={href}>
            <a data-testid={`card-stat-${label.replace(/\s+/g, '-').toLowerCase()}`} className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                      {ideasLoading || projectsLoading || deadlinesLoading || milestonesLoading
                        ? <Skeleton className="h-8 w-12 mb-1" />
                        : <p className="text-3xl font-semibold text-foreground">{value}</p>
                      }
                      <p className={`text-xs mt-0.5 ${color}`}>{sub}</p>
                    </div>
                    <div className={`p-2.5 rounded-lg ${bg}`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>Upcoming Deadlines</CardTitle>
              <Link href="/deadlines">
                <a className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></a>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {deadlinesLoading || milestonesLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No upcoming deadlines</p>
            ) : (
              <div className="space-y-2">
                {upcomingDeadlines.map(d => {
                  const days = daysUntil(d.dueDate);
                  const overdue = days < 0;
                  const urgent = days >= 0 && days <= 3;
                  return (
                    <div key={d.key} data-testid={`deadline-row-${d.id}`} className={`flex items-center justify-between p-2.5 rounded-md bg-muted/50 ${overdue ? "border-l-4 border-red-400" : urgent ? "border-l-4 border-orange-400" : ""}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{d.title}</p>
                        <p className={`text-xs ${overdue ? "text-red-500" : urgent ? "text-orange-500" : "text-muted-foreground"}`}>
                          {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`} · {formatDate(d.dueDate)}
                        </p>
                      </div>
                      {d.kind === "milestone" ? (
                        <Badge variant="outline" className="text-xs shrink-0 ml-2 gap-1 border-purple-300 text-purple-600 dark:text-purple-400">
                          <MilestoneIcon className="w-3 h-3" /> milestone
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={`text-xs shrink-0 ml-2 priority-${d.priority}`}>{d.priority}</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Projects */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>Active Projects</CardTitle>
              <Link href="/projects">
                <a className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></a>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {projectsLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active projects</p>
            ) : (
              <div className="space-y-2">
                {activeProjects.slice(0, 5).map(p => (
                  <div key={p.id} data-testid={`project-row-${p.id}`} className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.type}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 ml-2 status-active">Active</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Ideas */}
        <Card className="col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>Recent Ideas</CardTitle>
              <Link href="/ideas">
                <a className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></a>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {ideasLoading ? (
              <div className="grid grid-cols-3 gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
            ) : (ideas?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No ideas yet. <Link href="/ideas"><a className="text-primary hover:underline">Add your first idea.</a></Link></p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {[...(ideas ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6).map(idea => (
                  <div key={idea.id} data-testid={`idea-card-${idea.id}`} className="p-3 rounded-md bg-muted/50 border border-border/50">
                    <p className="text-sm font-medium mb-1 line-clamp-2">{idea.title}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-xs status-${idea.status}`}>{idea.status}</Badge>
                      <span className="text-xs text-muted-foreground capitalize">{idea.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
