import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIdeaSchema, type Idea, type InsertIdea } from "@shared/schema";
import { z } from "zod";

const formSchema = insertIdeaSchema.extend({
  title: z.string().min(1, "Title is required"),
  tagsInput: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const CATEGORIES = ["general", "article", "book", "essay", "blog", "speech", "report", "policy", "other"];
const STATUSES = ["new", "developing", "parked", "published"];

export default function IdeasPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIdea, setEditIdea] = useState<Idea | null>(null);

  const { data: ideas, isLoading } = useQuery<Idea[]>({ queryKey: ["/api/ideas"] });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "", category: "general", status: "new", tags: "[]", notes: "", tagsInput: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertIdea) => ipc().ideas.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ideas"] }); toast({ title: "Idea saved" }); closeDialog(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertIdea> }) => ipc().ideas.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ideas"] }); toast({ title: "Idea updated" }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ipc().ideas.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ideas"] }); toast({ title: "Idea deleted" }); },
  });

  function openNew() {
    setEditIdea(null);
    form.reset({ title: "", description: "", category: "general", status: "new", tags: "[]", notes: "", tagsInput: "" });
    setDialogOpen(true);
  }

  function openEdit(idea: Idea) {
    setEditIdea(idea);
    const tags = JSON.parse(idea.tags || "[]") as string[];
    form.reset({ title: idea.title, description: idea.description ?? "", category: idea.category, status: idea.status, tags: idea.tags, notes: idea.notes ?? "", tagsInput: tags.join(", ") });
    setDialogOpen(true);
  }

  function closeDialog() { setDialogOpen(false); setEditIdea(null); }

  function onSubmit(values: FormValues) {
    const tags = JSON.stringify(values.tagsInput ? values.tagsInput.split(",").map(t => t.trim()).filter(Boolean) : []);
    const payload: InsertIdea = { title: values.title, description: values.description, category: values.category, status: values.status, tags, notes: values.notes, createdAt: "" };
    if (editIdea) updateMutation.mutate({ id: editIdea.id, data: payload });
    else createMutation.mutate(payload);
  }

  const filtered = (ideas ?? []).filter(i => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterCat !== "all" && i.category !== filterCat) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) && !(i.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<string, Idea[]> = {};
  for (const s of STATUSES) {
    grouped[s] = filtered.filter(i => i.status === s);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Writing Ideas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ideas?.length ?? 0} total ideas</p>
        </div>
        <Button onClick={openNew} data-testid="button-new-idea" size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> New Idea
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-ideas" className="pl-9" placeholder="Search ideas…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger data-testid="select-filter-status" className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger data-testid="select-filter-category" className="w-36"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No ideas found</p>
          <p className="text-sm mt-1">Add your first writing idea to get started.</p>
        </div>
      ) : filterStatus !== "all" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(idea => <IdeaCard key={idea.id} idea={idea} onEdit={openEdit} onDelete={id => deleteMutation.mutate(id)} />)}
        </div>
      ) : (
        <div className="space-y-8">
          {STATUSES.map(s => grouped[s].length > 0 && (
            <div key={s}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 capitalize">{s} ({grouped[s].length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped[s].map(idea => <IdeaCard key={idea.id} idea={idea} onEdit={openEdit} onDelete={id => deleteMutation.mutate(id)} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>{editIdea ? "Edit Idea" : "New Writing Idea"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input data-testid="input-idea-title" placeholder="What's the idea?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea data-testid="input-idea-description" placeholder="Describe the idea…" rows={3} {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-idea-category"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-idea-status"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="tagsInput" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags <span className="text-muted-foreground font-normal">(comma-separated)</span></FormLabel>
                  <FormControl><Input data-testid="input-idea-tags" placeholder="policy, grid, energy…" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea data-testid="input-idea-notes" placeholder="Research links, reference notes…" rows={2} {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" data-testid="button-save-idea" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editIdea ? "Update" : "Save Idea"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IdeaCard({ idea, onEdit, onDelete }: { idea: Idea; onEdit: (i: Idea) => void; onDelete: (id: number) => void }) {
  const tags = JSON.parse(idea.tags || "[]") as string[];
  return (
    <Card data-testid={`idea-card-${idea.id}`} className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium leading-snug flex-1">{idea.title}</h3>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => onEdit(idea)} data-testid={`button-edit-idea-${idea.id}`} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => onDelete(idea.id)} data-testid={`button-delete-idea-${idea.id}`} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        {idea.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{idea.description}</p>}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className={`text-xs status-${idea.status}`}>{idea.status}</Badge>
          <Badge variant="outline" className="text-xs capitalize">{idea.category}</Badge>
          {tags.map((t, i) => <span key={i} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm">{t}</span>)}
        </div>
      </CardContent>
    </Card>
  );
}

// Placeholder for missing import
function Lightbulb({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
}
