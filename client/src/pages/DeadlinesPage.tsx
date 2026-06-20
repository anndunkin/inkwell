import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Pencil, Trash2, Calendar, CheckCircle2, AlertCircle, Milestone as MilestoneIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  insertDeadlineSchema, type Deadline, type InsertDeadline, type Project, type Milestone,
} from "@shared/schema";
import { z } from "zod";

const formSchema = insertDeadlineSchema.extend({
  title: z.string().min(1, "Title is required"),
  dueDate: z.string().min(1, "Due date is required"),
});
type FormValues = z.infer<typeof formSchema>;

const PRIORITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["pending", "completed", "missed"];

// ---- unified entry type -----------------------------------------------------

type EntryKind = "deadline" | "milestone";

interface UnifiedEntry {
  kind: EntryKind;
  id: number;           // deadline.id or milestone.id
  title: string;        // deadline.title or `${project.title} — ${milestone.name}`
  dueDate: string;      // YYYY-MM-DD
  status: string;       // deadline.status or milestone.status mapped to pending/complete
  priority?: string;    // deadlines only
  projectId?: number | null;
  projectTitle?: string;
  milestoneName?: string;
  raw: Deadline | Milestone;
}

function milestoneToStatus(s: string): string {
  if (s === "complete") return "completed";
  return "pending";
}

// ---- helpers ----------------------------------------------------------------

function daysUntil(dateStr: string) {
  const due = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function DeadlinesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDeadline, setEditDeadline] = useState<Deadline | null>(null);

  const { data: deadlines, isLoading: loadingDeadlines } = useQuery<Deadline[]>({ queryKey: ["/api/deadlines"] });
  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: allMilestones, isLoading: loadingMilestones } = useQuery<Milestone[]>({
    queryKey: ["/api/milestones"],
    queryFn: () => ipc().milestones.getAll(),
  });

  const isLoading = loadingDeadlines || loadingMilestones;

  const projectMap = Object.fromEntries((projects ?? []).map(p => [p.id, p.title]));

  // ---- build unified list --------------------------------------------------
  const milestoneEntries: UnifiedEntry[] = (allMilestones ?? [])
    .filter(m => !!m.dueDate)
    .map(m => ({
      kind: "milestone",
      id: m.id,
      title: `${projectMap[m.projectId] ?? "Unknown project"} — ${m.name}`,
      dueDate: m.dueDate!,
      status: milestoneToStatus(m.status),
      projectId: m.projectId,
      projectTitle: projectMap[m.projectId],
      milestoneName: m.name,
      raw: m,
    }));

  const deadlineEntries: UnifiedEntry[] = (deadlines ?? []).map(d => ({
    kind: "deadline",
    id: d.id,
    title: d.title,
    dueDate: d.dueDate,
    status: d.status,
    priority: d.priority,
    projectId: d.projectId,
    projectTitle: d.projectId ? projectMap[d.projectId] : undefined,
    raw: d,
  }));

  const allEntries: UnifiedEntry[] = [...deadlineEntries, ...milestoneEntries]
    .filter(e => {
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      if (filterPriority !== "all") {
        if (e.kind === "milestone") return false; // milestones have no priority
        if (e.priority !== filterPriority) return false;
      }
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const overdue   = allEntries.filter(e => e.status === "pending" && daysUntil(e.dueDate) < 0);
  const dueSoon   = allEntries.filter(e => e.status === "pending" && daysUntil(e.dueDate) >= 0 && daysUntil(e.dueDate) <= 7);
  const upcoming  = allEntries.filter(e => e.status === "pending" && daysUntil(e.dueDate) > 7);
  const done      = allEntries.filter(e => e.status === "completed" || e.status === "missed");

  // ---- mutations -----------------------------------------------------------
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", projectId: null, dueDate: "", priority: "medium", status: "pending", notes: "", createdAt: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertDeadline) => ipc().deadlines.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({ title: "Deadline added" });
      closeDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertDeadline> }) => ipc().deadlines.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({ title: "Deadline updated" });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ipc().deadlines.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({ title: "Deadline deleted" });
    },
  });

  const completeDeadlineMutation = useMutation({
    mutationFn: (id: number) => ipc().deadlines.update(id, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({ title: "Marked as complete" });
    },
  });

  const completeMilestoneMutation = useMutation({
    mutationFn: (id: number) => ipc().milestones.update(id, { status: "complete" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/milestones"] }); // per-project cache too
      toast({ title: "Milestone marked complete" });
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: (id: number) => ipc().milestones.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
      toast({ title: "Milestone deleted" });
    },
  });

  function openNew() {
    setEditDeadline(null);
    const today = new Date().toISOString().split("T")[0];
    form.reset({ title: "", projectId: null, dueDate: today, priority: "medium", status: "pending", notes: "", createdAt: "" });
    setDialogOpen(true);
  }

  function openEdit(d: Deadline) {
    setEditDeadline(d);
    form.reset({ title: d.title, projectId: d.projectId, dueDate: d.dueDate, priority: d.priority, status: d.status, notes: d.notes ?? "", createdAt: d.createdAt });
    setDialogOpen(true);
  }

  function closeDialog() { setDialogOpen(false); setEditDeadline(null); }

  function onSubmit(values: FormValues) {
    if (editDeadline) updateMutation.mutate({ id: editDeadline.id, data: values });
    else createMutation.mutate(values);
  }

  // ---- row renderer --------------------------------------------------------
  const renderEntry = (e: UnifiedEntry) => {
    const days = daysUntil(e.dueDate);
    const isOverdue = days < 0 && e.status === "pending";
    const isUrgent  = days >= 0 && days <= 3 && e.status === "pending";
    const isDone    = e.status === "completed" || e.status === "missed";

    return (
      <div
        key={`${e.kind}-${e.id}`}
        data-testid={`deadline-row-${e.id}`}
        className={`group flex items-center justify-between p-3.5 rounded-lg border bg-card hover:shadow-sm transition-shadow ${
          isOverdue ? "border-l-4 border-l-red-400 border-r-border border-t-border border-b-border"
          : isUrgent ? "border-l-4 border-l-orange-400 border-r-border border-t-border border-b-border"
          : "border-border"
        }`}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Kind icon */}
          <div className="mt-0.5 shrink-0 text-muted-foreground">
            {e.kind === "milestone"
              ? <MilestoneIcon className="w-4 h-4 text-purple-500" />
              : <Calendar className="w-4 h-4" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                {e.title}
              </p>
              {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
              {isOverdue && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
              {e.kind === "milestone" && (
                <Badge variant="outline" className="text-xs border-purple-300 text-purple-600 dark:text-purple-400">milestone</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className={isOverdue ? "text-red-500 font-medium" : isUrgent ? "text-orange-500 font-medium" : ""}>
                {isDone ? (e.status === "completed" ? "Completed" : "Missed")
                  : isOverdue ? `${Math.abs(days)}d overdue`
                  : days === 0 ? "Due today"
                  : `${days}d left`}
              </span>
              <span>·</span>
              <span>{formatDate(e.dueDate)}</span>
              {e.projectTitle && (
                <><span>·</span><span className="text-primary">{e.projectTitle}</span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          {e.kind === "deadline" && <Badge variant="outline" className={`text-xs priority-${e.priority}`}>{e.priority}</Badge>}

          {/* Complete button */}
          {e.status === "pending" && (
            <button
              onClick={() => {
                if (e.kind === "deadline") completeDeadlineMutation.mutate(e.id);
                else completeMilestoneMutation.mutate(e.id);
              }}
              data-testid={`button-complete-deadline-${e.id}`}
              className="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-muted-foreground hover:text-green-600 transition-colors"
              title="Mark complete"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}

          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {e.kind === "deadline" && (
              <button
                onClick={() => openEdit(e.raw as Deadline)}
                data-testid={`button-edit-deadline-${e.id}`}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => {
                if (e.kind === "deadline") deleteMutation.mutate(e.id);
                else deleteMilestoneMutation.mutate(e.id);
              }}
              data-testid={`button-delete-deadline-${e.id}`}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (title: string, items: UnifiedEntry[]) => items.length > 0 ? (
    <div className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title} ({items.length})
      </h2>
      <div className="space-y-2">{items.map(renderEntry)}</div>
    </div>
  ) : null;

  const pendingDeadlines = (deadlines ?? []).filter(d => d.status === "pending").length;
  const pendingMilestones = (allMilestones ?? []).filter(m => m.dueDate && m.status !== "complete").length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Deadlines</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pendingDeadlines} deadline{pendingDeadlines !== 1 ? "s" : ""} · {pendingMilestones} milestone{pendingMilestones !== 1 ? "s" : ""} pending
          </p>
        </div>
        <Button onClick={openNew} data-testid="button-new-deadline" size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> New Deadline
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-deadlines"
            className="pl-9"
            placeholder="Search deadlines and milestones…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger data-testid="select-filter-deadline-status" className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger data-testid="select-filter-priority" className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : allEntries.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No deadlines found</p>
          <p className="text-sm mt-1">Add a deadline or set a due date on a milestone.</p>
        </div>
      ) : filterStatus !== "all" ? (
        <div className="space-y-2">{allEntries.map(renderEntry)}</div>
      ) : (
        <>
          {renderSection("Overdue", overdue)}
          {renderSection("Due This Week", dueSoon)}
          {renderSection("Upcoming", upcoming)}
          {renderSection("Completed / Missed", done)}
        </>
      )}

      {/* New/Edit Deadline dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>
              {editDeadline ? "Edit Deadline" : "New Deadline"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input data-testid="input-deadline-title" placeholder="What's due?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="dueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input data-testid="input-deadline-date" type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-deadline-priority"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              {(projects?.length ?? 0) > 0 && (
                <FormField control={form.control} name="projectId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked Project <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <Select
                      value={field.value ? String(field.value) : "none"}
                      onValueChange={v => field.onChange(v === "none" ? null : parseInt(v))}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-deadline-project">
                          <SelectValue placeholder="Link to a project…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No project</SelectItem>
                        {projects?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
              {editDeadline && (
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-deadline-status"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      data-testid="input-deadline-notes"
                      placeholder="Publication, venue, contact…"
                      rows={2}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                  type="submit"
                  data-testid="button-save-deadline"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editDeadline ? "Update" : "Add Deadline"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
