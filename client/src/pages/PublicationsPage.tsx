import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Plus, Pencil, Trash2, Clock, RefreshCw, ChevronDown, ChevronUp, CalendarDays, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicationHistory, Project, PublicationNote } from "@shared/schema";

// ---- helpers ----------------------------------------------------------------

function parseList(json: string | null | undefined, fallback: string[]): string[] {
  if (!json) return fallback;
  try { return JSON.parse(json) as string[]; } catch { return fallback; }
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

const INTERVAL_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

function nextDueDate(lastDate: string, interval: string): Date {
  const days = INTERVAL_DAYS[interval] ?? 30;
  const d = new Date(lastDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d;
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((date.getTime() - now.getTime()) / 86_400_000);
}

function statusColor(days: number): string {
  if (days < 0) return "text-destructive";
  if (days <= 7) return "text-orange-500";
  if (days <= 14) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

// ---- LogDialog: add/edit a history entry ------------------------------------

interface LogDialogProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  editing: PublicationHistory | null;
}

function LogDialog({ open, onClose, projects, editing }: LogDialogProps) {
  // Query publications fresh inside the dialog so newly added outlets appear
  // immediately without needing to close and reopen.
  const { data: pubsRaw } = useQuery<string | null>({
    queryKey: ["/api/settings/publications"],
    queryFn: () => ipc().settings.get("publications"),
  });
  const publications = parseList(pubsRaw, []);
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [pub, setPub] = useState(editing?.publication ?? "");
  const [projectId, setProjectId] = useState<string>(editing?.projectId ? String(editing.projectId) : "none");
  const [projectTitle, setProjectTitle] = useState(editing?.projectTitle ?? "");
  const [date, setDate] = useState(editing?.publishedDate ?? today);
  const [notes, setNotes] = useState(editing?.notes ?? "");

  // sync when editing changes
  useState(() => {
    setPub(editing?.publication ?? "");
    setProjectId(editing?.projectId ? String(editing.projectId) : "none");
    setProjectTitle(editing?.projectTitle ?? "");
    setDate(editing?.publishedDate ?? today);
    setNotes(editing?.notes ?? "");
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof ipc>["0"] extends never ? never : Parameters<typeof ipc.prototype.pubHistory.create>[0]) =>
      ipc().pubHistory.create(data as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pubHistory"] });
      toast({ title: "Entry logged" });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: never }) => ipc().pubHistory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pubHistory"] });
      toast({ title: "Entry updated" });
      onClose();
    },
  });

  function save() {
    if (!pub || !date) return;
    // Resolve project title from linked project if one is selected
    const linkedProject = projects.find(p => String(p.id) === projectId);
    const resolvedTitle = linkedProject ? linkedProject.title : projectTitle || "Untitled";
    const data = {
      publication: pub,
      projectId: linkedProject ? linkedProject.id : null,
      projectTitle: resolvedTitle,
      publishedDate: date,
      notes: notes || null,
      createdAt: "",
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: data as never });
    } else {
      createMutation.mutate(data as never);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Entry" : "Log Published Work"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Publication</label>
            <Select value={pub} onValueChange={setPub}>
              <SelectTrigger><SelectValue placeholder="Select publication…" /></SelectTrigger>
              <SelectContent>
                {publications.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Project <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Select value={projectId} onValueChange={v => {
              setProjectId(v);
              if (v !== "none") {
                const p = projects.find(p => String(p.id) === v);
                if (p) setProjectTitle(p.title);
              }
            }}>
              <SelectTrigger><SelectValue placeholder="Link to a project…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked project</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {projectId === "none" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Article / Piece Title</label>
              <Input placeholder="Title of the piece…" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Published Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Textarea placeholder="Any notes…" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!pub || !date || createMutation.isPending || updateMutation.isPending}>
            {editing ? "Update" : "Log Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- PublicationNotesSection ------------------------------------------------

function PublicationNotesSection({ name, savedNotes }: { name: string; savedNotes: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(savedNotes);

  const upsertMutation = useMutation({
    mutationFn: (notes: string) => ipc().pubNotes.upsert(name, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pubNotes"] }),
  });

  function handleBlur() {
    if (value !== savedNotes) upsertMutation.mutate(value);
  }

  return (
    <div className="border-t border-border">
      <button
        data-testid={`button-toggle-pub-notes-${name}`}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <StickyNote className="w-3.5 h-3.5" />
          Notes{savedNotes ? "" : <span className="text-muted-foreground/60"> (empty)</span>}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-6 pb-4">
          <Textarea
            data-testid={`textarea-pub-notes-${name}`}
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={handleBlur}
            rows={3}
            className="resize-y min-h-[4.5rem] text-sm"
            placeholder="Add contacts, submission guidelines, rates..."
          />
        </div>
      )}
    </div>
  );
}

// ---- PublicationCard --------------------------------------------------------

interface PubCardProps {
  name: string;
  entries: PublicationHistory[];
  recurringProjects: Project[];
  savedNotes: string;
  onLog: (pub: string) => void;
  onEdit: (entry: PublicationHistory) => void;
  onDelete: (id: number) => void;
}

function PublicationCard({ name, entries, recurringProjects, savedNotes, onLog, onEdit, onDelete }: PubCardProps) {
  const [expanded, setExpanded] = useState(false);
  const latest = entries[0]; // already sorted desc by date
  const dayCount = latest ? daysSince(latest.publishedDate) : null;

  // Recurring projects targeting this publication
  const recurring = recurringProjects.filter(p => p.publication === name && p.isRecurring && p.recurringInterval);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{name}</CardTitle>
            {recurring.length > 0 && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <RefreshCw className="w-3 h-3" /> Recurring
              </Badge>
            )}
          </div>
          {latest ? (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Last published <span className="font-medium text-foreground">{formatDate(latest.publishedDate)}</span>
              <span className="text-muted-foreground">({dayCount === 0 ? "today" : `${dayCount}d ago`})</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1 italic">No publications recorded yet</p>
          )}
        </div>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => onLog(name)}>
          <Plus className="w-3.5 h-3.5" /> Log
        </Button>
      </CardHeader>

      {/* Recurring next-due section */}
      {recurring.length > 0 && (
        <div className="px-6 pb-3 space-y-1.5">
          {recurring.map(p => {
            if (!p.recurringInterval) return null;
            const lastDate = latest?.publishedDate;
            if (!lastDate) return (
              <div key={p.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                <span className="font-medium">{p.title}</span> — no history to calculate next due
              </div>
            );
            const next = nextDueDate(lastDate, p.recurringInterval);
            const until = daysUntil(next);
            return (
              <div key={p.id} className={`text-xs flex items-center gap-1.5 ${statusColor(until)}`}>
                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium text-foreground">{p.title}</span>
                <span className="capitalize text-muted-foreground">({p.recurringInterval})</span>
                <span>—</span>
                <span className={`font-medium ${statusColor(until)}`}>
                  {until < 0
                    ? `${Math.abs(until)}d overdue`
                    : until === 0
                      ? "due today"
                      : `due in ${until}d`}
                </span>
                <span className="text-muted-foreground">({next.toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>
              </div>
            );
          })}
        </div>
      )}

      {/* History toggle */}
      {entries.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-6 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <span>{entries.length} {entries.length === 1 ? "entry" : "entries"} in history</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {expanded && (
            <div className="px-6 pb-4 space-y-2">
              {entries.map(entry => (
                <div key={entry.id} className="group flex items-center justify-between gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <span className="font-medium truncate">{entry.projectTitle || "Untitled"}</span>
                    <span className="text-muted-foreground ml-2">{formatDate(entry.publishedDate)}</span>
                    {entry.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.notes}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => onEdit(entry)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => onDelete(entry.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PublicationNotesSection key={`${name}:${savedNotes}`} name={name} savedNotes={savedNotes} />
    </Card>
  );
}

// ---- Main page --------------------------------------------------------------

export default function PublicationsPage() {
  const { toast } = useToast();
  const [logOpen, setLogOpen] = useState(false);
  const [logPub, setLogPub] = useState<string>("");
  const [editing, setEditing] = useState<PublicationHistory | null>(null);

  const { data: history = [] } = useQuery<PublicationHistory[]>({
    queryKey: ["/api/pubHistory"],
    queryFn: () => ipc().pubHistory.getAll(),
  });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: pubsRaw } = useQuery<string | null>({
    queryKey: ["/api/settings/publications"],
    queryFn: () => ipc().settings.get("publications"),
  });
  const publications = parseList(pubsRaw, []);
  const { data: pubNotes = [] } = useQuery<PublicationNote[]>({
    queryKey: ["pubNotes"],
    queryFn: () => ipc().pubNotes.getAll(),
  });
  const notesByPub: Record<string, string> = {};
  for (const n of pubNotes) notesByPub[n.publicationName] = n.notes;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ipc().pubHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pubHistory"] });
      toast({ title: "Entry deleted" });
    },
  });

  function openLog(pub: string) {
    setLogPub(pub);
    setEditing(null);
    setLogOpen(true);
  }

  function openEdit(entry: PublicationHistory) {
    setEditing(entry);
    setLogPub(entry.publication);
    setLogOpen(true);
  }

  // Group history by publication
  const byPub: Record<string, PublicationHistory[]> = {};
  for (const pub of publications) byPub[pub] = [];
  for (const entry of history) {
    if (!byPub[entry.publication]) byPub[entry.publication] = [];
    byPub[entry.publication].push(entry);
  }
  // Ensure entries within each pub are sorted newest-first
  for (const pub of Object.keys(byPub)) {
    byPub[pub].sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
  }

  // Sort publication cards: those with history first (most recent first), then without
  const sorted = [...publications].sort((a, b) => {
    const aLast = byPub[a]?.[0]?.publishedDate ?? "";
    const bLast = byPub[b]?.[0]?.publishedDate ?? "";
    if (aLast && !bLast) return -1;
    if (!aLast && bLast) return 1;
    return bLast.localeCompare(aLast);
  });

  const recurringProjects = projects.filter(p => p.isRecurring);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Publications</h1>
          </div>
          <p className="text-sm text-muted-foreground">Track when you last wrote for each outlet and when recurring pieces are due.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setLogPub(""); setLogOpen(true); }}>
          <Plus className="w-4 h-4" /> Log Entry
        </Button>
      </div>

      {publications.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No publications configured</p>
          <p className="text-sm mt-1">Add publications in Settings to start tracking.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1">
          {sorted.map(pub => (
            <PublicationCard
              key={pub}
              name={pub}
              entries={byPub[pub] ?? []}
              recurringProjects={recurringProjects}
              savedNotes={notesByPub[pub] ?? ""}
              onLog={openLog}
              onEdit={openEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      <LogDialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        projects={projects}
        editing={editing}
      />
    </div>
  );
}
