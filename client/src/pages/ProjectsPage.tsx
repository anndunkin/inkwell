import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Search, FolderOpen, LayoutList, Columns3, Trash2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import RowMenu from "@/components/RowMenu";
import { useConfirm } from "@/components/ConfirmProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useProjects, useAllMilestones, useDeadlines, usePublications, useTemplates, useProjectTypes, refreshAll, PROJECT_STATUSES,
} from "@/lib/data";
import { buildEntries } from "@/lib/schedule";
import { summarize, STATUS_STYLE, type ProjectSummary } from "@/lib/projectInfo";
import { daysUntil, relativeDue } from "@/lib/dates";

const VIEW_KEY = "inkwell.projectsView";

function NextDue({ s }: { s: ProjectSummary }) {
  if (!s.next) return <span className="text-muted-foreground">No dates</span>;
  const d = daysUntil(s.next.dueDate);
  return <span className={d < 0 ? "text-red-500 font-medium" : d <= 3 ? "text-orange-500 font-medium" : ""}>{relativeDue(s.next.dueDate)}</span>;
}

function Progress({ s }: { s: ProjectSummary }) {
  if (s.stages.length === 0) return <span className="text-muted-foreground text-xs">No stages</span>;
  return (
    <div className="min-w-0">
      <p className="text-sm truncate">{s.current ? s.current.name : "All stages done"}</p>
      <div className="flex items-center gap-2 mt-1">
        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${(s.done / s.stages.length) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">{s.done}/{s.stages.length}</span>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, navigate] = useLocation();
  const projects = useProjects();
  const milestones = useAllMilestones();
  const deadlines = useDeadlines();
  const pubs = usePublications();
  const templates = useTemplates();
  const { data: types } = useProjectTypes();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const [view, setView] = useState<"list" | "board">(() => (localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list"));
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  // quick add
  const [title, setTitle] = useState("");
  const [type, setType] = useState("article");
  const [outlet, setOutlet] = useState("none");
  const [templateId, setTemplateId] = useState("default");
  const [error, setError] = useState("");

  const entries = useMemo(
    () => buildEntries(deadlines.data ?? [], milestones.data ?? [], projects.data ?? []),
    [deadlines.data, milestones.data, projects.data],
  );
  const summaries = useMemo(
    () => (projects.data ?? []).map(p => summarize(p, milestones.data ?? [], entries)),
    [projects.data, milestones.data, entries],
  );

  const visible = summaries.filter(s => {
    const st = s.project.status;
    if (filter === "open" && st !== "active" && st !== "on-hold") return false;
    if (filter !== "open" && filter !== "all" && st !== filter) return false;
    if (search && !s.project.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    // soonest next date first, undated last
    const ad = a.next?.dueDate ?? "9999", bd = b.next?.dueDate ?? "9999";
    return ad.localeCompare(bd) || a.project.title.localeCompare(b.project.title);
  });

  function setView_(v: "list" | "board") { setView(v); localStorage.setItem(VIEW_KEY, v); }
  const outletName = (id: number | null) => (pubs.data ?? []).find(p => p.id === id)?.name ?? "";

  async function create() {
    if (!title.trim()) return setError("Title is required");
    const tid = templateId === "default" ? undefined : templateId === "none" ? null : parseInt(templateId, 10);
    const project = await ipc().projects.create({
      title: title.trim(), description: null, type, status: "active", ideaId: null, publication: null,
      publicationId: outlet === "none" ? null : parseInt(outlet, 10), isRecurring: false, recurringInterval: null, notes: null, createdAt: "",
    }, tid === undefined ? (templates.data ?? []).find(t => t.isDefault)?.id ?? null : tid);
    await refreshAll();
    toast({ title: "Project created" });
    setTitle(""); setAdding(false);
    navigate(`/projects/${project.id}`);
  }

  async function setStatus(id: number, status: string) {
    await ipc().projects.update(id, { status });
    await refreshAll();
  }

  async function remove(s: ProjectSummary) {
    const dl = (deadlines.data ?? []).filter(d => d.projectId === s.project.id).length;
    const ok = await confirm({
      title: `Delete "${s.project.title}"?`,
      description: `This also deletes its ${s.stages.length} stage${s.stages.length === 1 ? "" : "s"} and ${dl} deadline${dl === 1 ? "" : "s"}. Publication history is kept.`,
    });
    if (!ok) return;
    await ipc().projects.delete(s.project.id);
    await refreshAll();
    toast({ title: "Project deleted" });
  }

  const menu = (s: ProjectSummary) => (
    <RowMenu
      label={`Actions for ${s.project.title}`}
      testId={`menu-project-${s.project.id}`}
      items={[
        ...PROJECT_STATUSES.filter(st => st !== s.project.status).map(st => ({
          label: `Mark ${st}`, onSelect: () => setStatus(s.project.id, st), testId: `button-status-${st}-${s.project.id}`,
        })),
        { label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, destructive: true, separated: true, onSelect: () => remove(s), testId: `button-delete-project-${s.project.id}` },
      ]}
    />
  );

  const loading = projects.isLoading || milestones.isLoading;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{(projects.data ?? []).length} total</p>
        </div>
        <Button size="sm" className="gap-1.5" data-testid="button-new-project" onClick={() => setAdding(a => !a)}>
          <Plus className="w-4 h-4" /> New project
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border bg-card p-4 mb-5" data-testid="quick-add-project">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end">
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="np-title" className="text-xs font-medium text-muted-foreground">Title</label>
              <Input id="np-title" autoFocus data-testid="input-project-title" placeholder="Working title" value={title}
                onChange={e => { setTitle(e.target.value); setError(""); }}
                onKeyDown={e => { if (e.key === "Enter") void create(); }} />
              {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-36 capitalize" data-testid="select-project-type"><SelectValue /></SelectTrigger>
                <SelectContent>{types.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Outlet</label>
              <Select value={outlet} onValueChange={setOutlet}>
                <SelectTrigger className="w-40" data-testid="select-project-outlet"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None yet</SelectItem>
                  {(pubs.data ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Stages</label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="w-40" data-testid="select-project-template"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default template</SelectItem>
                  {(templates.data ?? []).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  <SelectItem value="none">No stages</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => { setAdding(false); setError(""); }}>Cancel</Button>
            <Button size="sm" data-testid="button-save-project" onClick={create}>Create project</Button>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-projects" className="pl-9" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40" data-testid="select-project-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open projects</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {PROJECT_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex border border-border rounded-md overflow-hidden" role="group" aria-label="Projects view">
          <button type="button" aria-pressed={view === "list"} data-testid="view-projects-list" onClick={() => setView_("list")}
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${view === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
            <LayoutList className="w-3.5 h-3.5" /> List
          </button>
          <button type="button" aria-pressed={view === "board"} data-testid="view-projects-board" onClick={() => setView_("board")}
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${view === "board" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
            <Columns3 className="w-3.5 h-3.5" /> Board
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects here</p>
          <p className="text-sm mt-1">Create a project, or promote an idea.</p>
        </div>
      ) : view === "list" ? (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm" data-testid="projects-table">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="font-medium px-4 py-2.5">Project</th>
                <th className="font-medium px-3 py-2.5">Outlet</th>
                <th className="font-medium px-3 py-2.5">Stage</th>
                <th className="font-medium px-3 py-2.5">Next due</th>
                <th className="font-medium px-3 py-2.5">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visible.map(s => (
                <tr key={s.project.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`project-row-${s.project.id}`}>
                  <td className="px-4 py-3 max-w-[18rem]">
                    <Link href={`/projects/${s.project.id}`} className="font-medium hover:underline inline-flex items-center gap-1.5 max-w-full" data-testid={`link-project-${s.project.id}`}>
                      <span className="truncate">{s.project.title}</span>
                      {s.project.isRecurring && <RefreshCw className="w-3 h-3 text-muted-foreground shrink-0" aria-label="Recurring" />}
                    </Link>
                    <p className="text-xs text-muted-foreground capitalize">{s.project.type}</p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{outletName(s.project.publicationId) || s.project.publication || "—"}</td>
                  <td className="px-3 py-3"><Progress s={s} /></td>
                  <td className="px-3 py-3 whitespace-nowrap"><NextDue s={s} /></td>
                  <td className="px-3 py-3"><Badge variant="outline" className={`text-xs ${STATUS_STYLE[s.project.status] ?? ""}`}>{s.project.status}</Badge></td>
                  <td className="px-2 py-3">{menu(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Board summaries={visible} filter={filter} showClosed={showClosed} setShowClosed={setShowClosed} menu={menu} />
      )}
    </div>
  );
}

function Board({ summaries, filter, showClosed, setShowClosed, menu }: {
  summaries: ProjectSummary[]; filter: string; showClosed: boolean; setShowClosed: (b: boolean) => void; menu: (s: ProjectSummary) => React.ReactNode;
}) {
  const col = (st: string) => summaries.filter(s => s.project.status === st);
  const Card = ({ s }: { s: ProjectSummary }) => (
    <div className="rounded-lg border bg-card p-3" data-testid={`project-card-${s.project.id}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/projects/${s.project.id}`} className="text-sm font-medium hover:underline break-words min-w-0">{s.project.title}</Link>
        {menu(s)}
      </div>
      <p className="text-xs text-muted-foreground capitalize mt-0.5">{s.project.type}</p>
      <div className="mt-2"><Progress s={s} /></div>
      <p className="text-xs mt-2"><NextDue s={s} /></p>
    </div>
  );
  const open = ["active", "on-hold"];
  const closed = ["completed", "cancelled"].filter(st => col(st).length > 0);
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {open.map(st => (
          <div key={st}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">{st} ({col(st).length})</h2>
            <div className="space-y-2">{col(st).map(s => <Card key={s.project.id} s={s} />)}</div>
          </div>
        ))}
      </div>
      {closed.length > 0 && (
        <div className="mt-8">
          <button type="button" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3"
            onClick={() => setShowClosed(!showClosed)} aria-expanded={showClosed} data-testid="toggle-closed-projects">
            {showClosed || filter === "completed" || filter === "cancelled" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Completed and cancelled ({closed.reduce((n, st) => n + col(st).length, 0)})
          </button>
          {(showClosed || filter === "completed" || filter === "cancelled") && (
            <div className="grid gap-4 md:grid-cols-2">
              {closed.map(st => (
                <div key={st}><h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">{st}</h2>
                  <div className="space-y-2">{col(st).map(s => <Card key={s.project.id} s={s} />)}</div></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
