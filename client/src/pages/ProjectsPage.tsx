import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, FolderOpen, BookOpen, RefreshCw } from "lucide-react";
import MilestonePipeline from "@/components/MilestonePipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema, type Project, type InsertProject, type Idea } from "@shared/schema";
import { z } from "zod";

const DEFAULT_PROJECT_TYPES = ["article", "book", "essay", "blog", "speech", "report", "policy", "white paper", "other"];
const DEFAULT_PUBLICATIONS: string[] = [];
const STATUSES = ["active", "on-hold", "completed", "cancelled"];

const STATUS_COLS: Record<string, string> = {
  active: "bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800",
  "on-hold": "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800",
  completed: "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800",
  cancelled: "bg-gray-50 border-gray-200 dark:bg-gray-900/10 dark:border-gray-700",
};

const formSchema = insertProjectSchema.extend({ title: z.string().min(1, "Title is required") });
type FormValues = z.infer<typeof formSchema>;

function parseList(json: string | null | undefined, fallback: string[]): string[] {
  if (!json) return fallback;
  try { return JSON.parse(json) as string[]; } catch { return fallback; }
}

export default function ProjectsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  const { data: projects, isLoading } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: ideas } = useQuery<Idea[]>({ queryKey: ["/api/ideas"] });
  const { data: projectTypesRaw } = useQuery<string | null>({ queryKey: ["/api/settings/projectTypes"], queryFn: () => ipc().settings.get("projectTypes") });
  const { data: publicationsRaw } = useQuery<string | null>({ queryKey: ["/api/settings/publications"], queryFn: () => ipc().settings.get("publications") });

  const projectTypes = parseList(projectTypesRaw, DEFAULT_PROJECT_TYPES);
  const publications = parseList(publicationsRaw, DEFAULT_PUBLICATIONS);

  const INTERVALS = ["weekly", "biweekly", "monthly", "quarterly", "annual"];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "", type: "article", status: "active", ideaId: null, publication: "", isRecurring: false, recurringInterval: null, notes: "", createdAt: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertProject) => ipc().projects.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); toast({ title: "Project created" }); closeDialog(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertProject> }) => ipc().projects.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); toast({ title: "Project updated" }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ipc().projects.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); toast({ title: "Project deleted" }); },
  });

  function openNew() {
    setEditProject(null);
    form.reset({ title: "", description: "", type: "article", status: "active", ideaId: null, publication: "", isRecurring: false, recurringInterval: null, notes: "", createdAt: "" });
    setDialogOpen(true);
  }

  function openEdit(p: Project) {
    setEditProject(p);
    form.reset({ title: p.title, description: p.description ?? "", type: p.type, status: p.status, ideaId: p.ideaId, publication: p.publication ?? "", isRecurring: p.isRecurring ?? false, recurringInterval: p.recurringInterval ?? null, notes: p.notes ?? "", createdAt: p.createdAt });
    setDialogOpen(true);
  }

  function closeDialog() { setDialogOpen(false); setEditProject(null); }

  function onSubmit(values: FormValues) {
    const data = { ...values, publication: values.publication || null };
    if (editProject) updateMutation.mutate({ id: editProject.id, data });
    else createMutation.mutate(data);
  }

  const filtered = (projects ?? []).filter(p => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<string, Project[]> = {};
  for (const s of STATUSES) grouped[s] = filtered.filter(p => p.status === s);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{projects?.length ?? 0} projects</p>
        </div>
        <Button onClick={openNew} data-testid="button-new-project" size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-projects" className="pl-9" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger data-testid="select-filter-project-status" className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex border border-border rounded-md overflow-hidden">
          <button onClick={() => setViewMode("kanban")} data-testid="button-kanban-view" className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>Kanban</button>
          <button onClick={() => setViewMode("list")} data-testid="button-list-view" className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>List</button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects found</p>
          <p className="text-sm mt-1">Start a new writing project to track your progress.</p>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUSES.map(s => (
            <div key={s} className={`rounded-lg border p-3 ${STATUS_COLS[s]}`}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 capitalize text-muted-foreground">
                {s} <span className="ml-1 bg-background/60 px-1.5 py-0.5 rounded text-xs">{grouped[s].length}</span>
              </h3>
              <div className="space-y-2">
                {grouped[s].map(p => (
                  <div key={p.id} data-testid={`project-card-${p.id}`} className="group bg-card rounded-md p-3 border border-border shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start gap-1 mb-1.5">
                      <p className="text-sm font-medium leading-snug flex-1">{p.title}</p>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => openEdit(p)} data-testid={`button-edit-project-${p.id}`} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => deleteMutation.mutate(p.id)} data-testid={`button-delete-project-${p.id}`} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs capitalize">{p.type}</Badge>
                      {p.isRecurring && (
                        <Badge variant="secondary" className="text-xs gap-1"><RefreshCw className="w-2.5 h-2.5" />{p.recurringInterval}</Badge>
                      )}
                    </div>
                    {p.publication && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <BookOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{p.publication}</span>
                      </div>
                    )}
                    {p.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{p.description}</p>}
                    <MilestonePipeline projectId={p.id} projectTitle={p.title} />
                  </div>
                ))}
                {grouped[s].length === 0 && <p className="text-xs text-muted-foreground text-center py-4">None</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} data-testid={`project-row-${p.id}`} className="group flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  {p.publication && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <BookOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{p.publication}</span>
                    </div>
                  )}
                  {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Badge variant="outline" className="text-xs capitalize">{p.type}</Badge>
                <Badge variant="outline" className={`text-xs status-${p.status}`}>{p.status}</Badge>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(p)} data-testid={`button-edit-project-${p.id}`} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteMutation.mutate(p.id)} data-testid={`button-delete-project-${p.id}`} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>{editProject ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input data-testid="input-project-title" placeholder="Project name…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea data-testid="input-project-description" placeholder="What's this project about?" rows={3} {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-project-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{projectTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-project-status"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="publication" render={({ field }) => (
                <FormItem>
                  <FormLabel>Publication <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-project-publication"><SelectValue placeholder="Select a publication…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="">Unspecified</SelectItem>
                      {publications.map(pub => <SelectItem key={pub} value={pub}>{pub}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              {(ideas?.length ?? 0) > 0 && (
                <FormField control={form.control} name="ideaId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked Idea <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <Select value={field.value ? String(field.value) : "none"} onValueChange={v => field.onChange(v === "none" ? null : parseInt(v))}>
                      <FormControl><SelectTrigger data-testid="select-project-idea"><SelectValue placeholder="Choose an idea…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">No linked idea</SelectItem>
                        {ideas?.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
              {/* Recurring */}
              <FormField control={form.control} name="isRecurring" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isRecurring"
                      checked={!!field.value}
                      onChange={e => field.onChange(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <label htmlFor="isRecurring" className="text-sm font-medium cursor-pointer select-none flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /> Recurring project
                    </label>
                  </div>
                </FormItem>
              )} />
              {form.watch("isRecurring") && (
                <FormField control={form.control} name="recurringInterval" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repeat interval</FormLabel>
                    <Select value={field.value ?? "monthly"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-project-interval"><SelectValue placeholder="Select interval…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {INTERVALS.map(i => <SelectItem key={i} value={i} className="capitalize">{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea data-testid="input-project-notes" placeholder="Any additional notes…" rows={2} {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" data-testid="button-save-project" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editProject ? "Update" : "Create Project"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
