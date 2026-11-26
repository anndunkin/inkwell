import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, Trash2, Rocket, RefreshCw, Save, Layers, Lightbulb,
} from "lucide-react";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import RowMenu from "@/components/RowMenu";
import AutoField from "@/components/AutoField";
import ScheduleView from "@/components/ScheduleView";
import DeadlineDialog from "@/components/DeadlineDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useProjects, useAllMilestones, useDeadlines, usePublications, useTemplates, useProjectTypes, useIdeas, usePubHistory,
  refreshAll, orderedFor, PROJECT_STATUSES, INTERVALS,
} from "@/lib/data";
import { buildEntries } from "@/lib/schedule";
import { formatDate, todayStr, daysUntil } from "@/lib/dates";
import { STATUS_STYLE } from "@/lib/projectInfo";
import type { Milestone, Project, Deadline } from "@shared/schema";

const STAGE_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

function stageTone(m: Milestone): string {
  if (m.status === "completed") return "bg-green-100 text-green-900 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700";
  if (m.status === "blocked") return "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700";
  if (m.status === "in_progress") return "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700";
  return "bg-card text-foreground border-border";
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const confirm = useConfirm();

  const projects = useProjects();
  const milestones = useAllMilestones();
  const deadlines = useDeadlines();
  const pubs = usePublications();
  const templates = useTemplates();
  const ideas = useIdeas();
  const history = usePubHistory();
  const { data: types } = useProjectTypes();

  const [selected, setSelected] = useState<number | null>(null);
  const [newStage, setNewStage] = useState("");
  const [dlOpen, setDlOpen] = useState(false);
  const [editingDl, setEditingDl] = useState<Deadline | null>(null);
  const [publishDate, setPublishDate] = useState(todayStr());
  const [tplName, setTplName] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);

  const project = (projects.data ?? []).find(p => p.id === id);
  const stages = useMemo(() => orderedFor(milestones.data ?? [], id), [milestones.data, id]);
  const entries = useMemo(
    () => buildEntries((deadlines.data ?? []).filter(d => d.projectId === id), stages, projects.data ?? []).filter(e => e.projectId === id),
    [deadlines.data, stages, projects.data, id],
  );

  if (projects.isLoading) return <div className="p-6 max-w-5xl mx-auto"><Skeleton className="h-10 w-80 mb-4" /><Skeleton className="h-40" /></div>;
  if (!project) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-20" data-testid="project-not-found">
        <p className="font-medium">That project no longer exists.</p>
        <Link href="/projects" className="text-primary hover:underline text-sm">Back to projects</Link>
      </div>
    );
  }

  const idea = project.ideaId ? (ideas.data ?? []).find(i => i.id === project.ideaId) : undefined;
  const sel = stages.find(s => s.id === selected) ?? null;
  const last = stages[stages.length - 1];
  const readyToPublish = !!last && last.status === "completed" && project.status !== "completed" && project.status !== "cancelled";
  const projectHistory = (history.data ?? []).filter(h => h.projectId === id).sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));

  async function patch(data: Partial<Project>) {
    await ipc().projects.update(id, data);
    await refreshAll();
  }
  async function updateStage(m: Milestone, data: Partial<Milestone>) {
    await ipc().milestones.update(m.id, data);
    await refreshAll();
  }
  async function setStageStatus(m: Milestone, status: string) {
    await updateStage(m, { status, completedAt: status === "completed" ? (m.completedAt ?? todayStr()) : null });
    if (status === "completed") toast({ title: `${m.name} completed` });
  }
  async function move(m: Milestone, dir: -1 | 1) {
    const ids = stages.map(s => s.id);
    const i = ids.indexOf(m.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await ipc().milestones.reorder(id, ids);
    await refreshAll();
  }
  async function addStage() {
    const name = newStage.trim();
    if (!name) return;
    const m = await ipc().milestones.create({ projectId: id, name, status: "not_started", dueDate: null, completedAt: null, notes: null, sortOrder: stages.length, createdAt: "" });
    await ipc().milestones.reorder(id, [...stages.map(s => s.id), m.id]);
    setNewStage("");
    await refreshAll();
    setSelected(m.id);
  }
  async function deleteStage(m: Milestone) {
    const ok = await confirm({ title: `Delete stage "${m.name}"?`, description: "Only this project's stage is removed. Templates are not affected." });
    if (!ok) return;
    await ipc().milestones.delete(m.id);
    setSelected(null);
    await refreshAll();
  }
  async function applyTemplate(tid: string) {
    await ipc().projects.applyTemplate(id, parseInt(tid, 10));
    await refreshAll();
    toast({ title: "Stages added from template" });
  }
  async function saveTemplate() {
    const name = tplName.trim();
    if (!name) return;
    if ((templates.data ?? []).some(t => t.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "A template with that name already exists", variant: "destructive" });
      return;
    }
    await ipc().templates.create({ name, stages: stages.map(s => s.name) });
    await refreshAll();
    setTplName(""); setSavingTpl(false);
    toast({ title: `Template "${name}" saved` });
  }
  async function publish() {
    await ipc().projects.publish(id, publishDate);
    await refreshAll();
    toast({ title: "Marked as published", description: project!.publicationId || project!.publication ? "Added to publication history." : undefined });
  }
  async function removeProject() {
    const dl = (deadlines.data ?? []).filter(d => d.projectId === id).length;
    const ok = await confirm({
      title: `Delete "${project!.title}"?`,
      description: `This also deletes its ${stages.length} stage${stages.length === 1 ? "" : "s"} and ${dl} deadline${dl === 1 ? "" : "s"}. Publication history is kept.`,
    });
    if (!ok) return;
    await ipc().projects.delete(id);
    await refreshAll();
    toast({ title: "Project deleted" });
    navigate("/projects");
  }
  async function spawnNext() {
    const next = await ipc().deadlines.spawnRecurring(id);
    await refreshAll();
    toast({ title: next ? "Next occurrence scheduled" : "Nothing to schedule yet", description: next ? undefined : "Give this project a due date first." });
  }

  const outletValue = project.publicationId ? String(project.publicationId) : "none";

  return (
    <div className="p-6 max-w-5xl mx-auto" data-testid="project-page">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3" data-testid="link-back-projects">
        <ArrowLeft className="w-4 h-4" /> Projects
      </Link>

      {/* header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <AutoField
            value={project.title} required ariaLabel="Project title" testId="input-project-page-title"
            onSave={v => patch({ title: v.trim() })}
            className="text-xl md:text-xl font-semibold h-auto py-1.5 px-2 -mx-2 border-transparent hover:border-input focus-visible:border-input shadow-none bg-transparent"
          />
        </div>
        <RowMenu label="Project actions" testId="menu-project-page" items={[
          { label: "Delete project", icon: <Trash2 className="w-3.5 h-3.5" />, destructive: true, onSelect: removeProject, testId: "button-delete-project-page" },
        ]} />
      </div>

      <div className="flex gap-3 flex-wrap items-end mb-6">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <Select value={project.status} onValueChange={v => patch({ status: v })}>
            <SelectTrigger className={`w-36 capitalize border ${STATUS_STYLE[project.status] ?? ""}`} data-testid="select-page-status"><SelectValue /></SelectTrigger>
            <SelectContent>{PROJECT_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Type</label>
          <Select value={project.type} onValueChange={v => patch({ type: v })}>
            <SelectTrigger className="w-36 capitalize" data-testid="select-page-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(types.includes(project.type) ? types : [project.type, ...types]).map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Outlet</label>
          <Select value={outletValue} onValueChange={v => patch({ publicationId: v === "none" ? null : parseInt(v, 10), publication: null })}>
            <SelectTrigger className="w-48" data-testid="select-page-outlet"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None yet</SelectItem>
              {(pubs.data ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {readyToPublish && (
        <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700 p-4 mb-6 flex items-center gap-3 flex-wrap" data-testid="publish-banner">
          <Rocket className="w-5 h-5 text-green-700 dark:text-green-300 shrink-0" />
          <div className="flex-1 min-w-48">
            <p className="text-sm font-medium">All stages are done. Mark this project published?</p>
            <p className="text-xs text-muted-foreground">
              {project.publicationId ? "It will be added to this outlet's publication history." : "Choose an outlet above to also record it in publication history."}
            </p>
          </div>
          <Input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} className="w-40" aria-label="Published date" data-testid="input-publish-date" />
          <Button size="sm" onClick={publish} data-testid="button-publish">Mark published</Button>
        </div>
      )}

      {/* pipeline */}
      <section className="mb-8" data-testid="pipeline">
        <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stages ({stages.filter(s => s.status === "completed").length}/{stages.length})</h2>
          <div className="flex items-center gap-2">
            {(templates.data ?? []).length > 0 && (
              <Select value="" onValueChange={applyTemplate}>
                <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-apply-template"><SelectValue placeholder="Add from template…" /></SelectTrigger>
                <SelectContent>{(templates.data ?? []).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {stages.length > 0 && !savingTpl && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setSavingTpl(true)} data-testid="button-save-as-template"><Layers className="w-3.5 h-3.5" /> Save as template</Button>
            )}
          </div>
        </div>
        {savingTpl && (
          <div className="flex gap-2 mb-3 items-center">
            <Input autoFocus placeholder="Template name" value={tplName} onChange={e => setTplName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void saveTemplate(); }} className="max-w-xs h-9" data-testid="input-template-name" />
            <Button size="sm" onClick={saveTemplate} data-testid="button-confirm-template"><Save className="w-3.5 h-3.5 mr-1" /> Save</Button>
            <Button size="sm" variant="outline" onClick={() => setSavingTpl(false)}>Cancel</Button>
          </div>
        )}

        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">No stages yet. Add one below or pick a template.</p>
        ) : (
          <ol className="flex flex-wrap gap-2" aria-label="Project stages">
            {stages.map((m, i) => {
              const overdue = m.status !== "completed" && m.dueDate && daysUntil(m.dueDate) < 0;
              return (
                <li key={m.id}>
                  <button
                    type="button" onClick={() => setSelected(selected === m.id ? null : m.id)} data-testid={`stage-${m.id}`}
                    aria-pressed={selected === m.id}
                    className={`text-left rounded-lg border px-3 py-2 min-w-[8.5rem] max-w-[14rem] transition-shadow ${stageTone(m)} ${selected === m.id ? "ring-2 ring-primary" : "hover:shadow-sm"}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {m.status === "completed" ? <Check className="w-3.5 h-3.5 shrink-0" /> : <span className="text-xs opacity-60 shrink-0">{i + 1}</span>}
                      <span className="break-words min-w-0">{m.name}</span>
                    </span>
                    <span className={`block text-xs mt-0.5 ${overdue ? "text-red-600 dark:text-red-400 font-medium" : "opacity-75"}`}>
                      {m.status === "completed" ? `Done ${m.completedAt ? formatDate(m.completedAt) : ""}` : m.dueDate ? `Due ${formatDate(m.dueDate)}` : "No date"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {sel && (
          <div className="mt-3 rounded-lg border bg-card p-4" data-testid="panel-stage">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <AutoField value={sel.name} required ariaLabel="Stage name" testId="input-stage-name" onSave={v => updateStage(sel, { name: v.trim() })} className="font-medium h-9" />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Move stage earlier" disabled={stages[0].id === sel.id} onClick={() => move(sel, -1)} data-testid="button-stage-left"><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Move stage later" disabled={last.id === sel.id} onClick={() => move(sel, 1)} data-testid="button-stage-right"><ChevronRight className="w-4 h-4" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete stage" onClick={() => deleteStage(sel)} data-testid="button-stage-delete"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Status</label>
                <Select value={sel.status} onValueChange={v => setStageStatus(sel, v)}>
                  <SelectTrigger data-testid="select-stage-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="stage-due" className="block text-xs text-muted-foreground mb-1">Due date</label>
                <Input id="stage-due" type="date" value={sel.dueDate ?? ""} onChange={e => updateStage(sel, { dueDate: e.target.value || null })} data-testid="input-stage-due" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">Notes</label>
              <AutoField multiline rows={2} value={sel.notes ?? ""} ariaLabel="Stage notes" testId="input-stage-notes" placeholder="Anything about this stage" onSave={v => updateStage(sel, { notes: v || null })} />
            </div>
            {sel.status !== "completed" && (
              <Button size="sm" className="mt-3 gap-1" onClick={() => setStageStatus(sel, "completed")} data-testid="button-stage-complete"><Check className="w-4 h-4" /> Mark complete</Button>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-3 max-w-md">
          <Input placeholder="Add a stage" value={newStage} onChange={e => setNewStage(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void addStage(); }} className="h-9" data-testid="input-new-stage" />
          <Button size="sm" variant="outline" className="gap-1 h-9" onClick={addStage} data-testid="button-add-stage"><Plus className="w-4 h-4" /> Add</Button>
        </div>
      </section>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="dates" data-testid="tab-dates">Dates</TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">Notes</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4 space-y-6">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <AutoField multiline rows={4} value={project.description ?? ""} ariaLabel="Description" testId="input-project-description" placeholder="What is this piece about?" onSave={v => patch({ description: v || null })} />
          </div>
          {idea && (
            <p className="text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> From idea: <Link href="/ideas" className="text-primary hover:underline">{idea.title}</Link></p>
          )}
          <div className="rounded-lg border p-4" data-testid="recurrence">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Recurring</p>
                <p className="text-xs text-muted-foreground">For columns and regular pieces. Completing a deadline schedules the next one.</p>
              </div>
              <Switch checked={project.isRecurring} aria-label="Recurring" data-testid="switch-recurring"
                onCheckedChange={c => patch({ isRecurring: c, recurringInterval: c ? (project.recurringInterval ?? "monthly") : null })} />
            </div>
            {project.isRecurring && (
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <Select value={project.recurringInterval ?? "monthly"} onValueChange={v => patch({ recurringInterval: v })}>
                  <SelectTrigger className="w-40 capitalize" data-testid="select-interval"><SelectValue /></SelectTrigger>
                  <SelectContent>{INTERVALS.map(i => <SelectItem key={i} value={i} className="capitalize">{i}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={spawnNext} data-testid="button-spawn-next">Schedule next occurrence</Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="dates" className="pt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" className="gap-1" data-testid="button-project-add-deadline" onClick={() => { setEditingDl(null); setDlOpen(true); }}><Plus className="w-4 h-4" /> Add deadline</Button>
          </div>
          <ScheduleView entries={entries} showProject={false} onEdit={d => { setEditingDl(d); setDlOpen(true); }} emptyText="No dates yet. Give a stage a due date or add a deadline." />
          <DeadlineDialog open={dlOpen} editing={editingDl} projectId={id} onClose={() => { setDlOpen(false); setEditingDl(null); }} />
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <AutoField multiline rows={10} value={project.notes ?? ""} ariaLabel="Project notes" testId="input-project-notes" placeholder="Research links, editor feedback, anything else" onSave={v => patch({ notes: v || null })} />
          <p className="text-xs text-muted-foreground mt-1">Saved when you click away.</p>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          {projectHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not published or submitted anywhere yet.</p>
          ) : (
            <ul className="space-y-2">
              {projectHistory.map(h => (
                <li key={h.id} className="rounded-lg border bg-card p-3 text-sm flex items-center justify-between gap-3">
                  <span className="font-medium">{h.publication}</span>
                  <span className="text-muted-foreground text-xs">{formatDate(h.publishedDate, "long")}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
