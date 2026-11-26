import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Plus, Trash2, Pencil, ExternalLink } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import RowMenu from "@/components/RowMenu";
import AutoField from "@/components/AutoField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePublications, useProjects, usePubHistory, refreshAll } from "@/lib/data";
import { todayStr, formatDate, parseDate } from "@/lib/dates";
import type { Publication, PublicationHistory } from "@shared/schema";

function daysSince(dateStr: string): number {
  return Math.floor((parseDate(todayStr()).getTime() - parseDate(dateStr).getTime()) / 86_400_000);
}
function sinceLabel(dateStr: string): string {
  const d = daysSince(dateStr);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 60) return `${d} days ago`;
  return `${Math.round(d / 30)} months ago`;
}

function LogDialog({ open, onClose, outlet, editing }: { open: boolean; onClose: () => void; outlet: Publication; editing: PublicationHistory | null }) {
  const { toast } = useToast();
  const { data: projects = [] } = useProjects();
  const [projectId, setProjectId] = useState("none");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setProjectId(editing?.projectId ? String(editing.projectId) : "none");
    setTitle(editing?.projectTitle ?? "");
    setDate(editing?.publishedDate ?? todayStr());
    setNotes(editing?.notes ?? "");
    setError("");
  }, [open, editing]);

  async function save() {
    if (!date) return setError("Date is required");
    const linked = projects.find(p => String(p.id) === projectId);
    const resolved = linked?.title ?? (title.trim() || "Untitled");
    const data = { publication: outlet.name, projectId: linked?.id ?? null, projectTitle: resolved, publishedDate: date, notes: notes || null, createdAt: "" };
    if (editing) await ipc().pubHistory.update(editing.id, data);
    else await ipc().pubHistory.create(data);
    await refreshAll();
    toast({ title: editing ? "Entry updated" : "Entry logged" });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)" }}>{editing ? "Edit entry" : `Log a piece in ${outlet.name}`}</DialogTitle>
          <DialogDescription className="sr-only">Publication history entry</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Project <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger data-testid="select-log-project"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked project</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {projectId === "none" && (
            <div className="space-y-1.5">
              <label htmlFor="log-title" className="text-sm font-medium">Title of the piece</label>
              <Input id="log-title" data-testid="input-log-title" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="log-date" className="text-sm font-medium">Date</label>
            <Input id="log-date" type="date" data-testid="input-log-date" value={date} onChange={e => setDate(e.target.value)} />
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="log-notes" className="text-sm font-medium">Notes</label>
            <Textarea id="log-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} data-testid="button-save-log">{editing ? "Update" : "Log entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PublicationsPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const pubs = usePublications();
  const projects = useProjects();
  const history = usePubHistory();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<PublicationHistory | null>(null);

  const list = [...(pubs.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const selected = list.find(p => p.id === selectedId) ?? list[0] ?? null;

  const entriesFor = (name: string) => (history.data ?? []).filter(h => h.publication.toLowerCase() === name.toLowerCase());
  const lastFor = (name: string) => entriesFor(name).map(h => h.publishedDate).sort().pop();

  async function add() {
    const name = newName.trim();
    if (!name) return;
    if (list.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "That outlet already exists", variant: "destructive" });
      return;
    }
    const p = await ipc().publications.create({ name });
    await refreshAll();
    setNewName(""); setSelectedId(p.id);
  }
  async function patch(p: Publication, data: Partial<Publication>) {
    try { await ipc().publications.update(p.id, data); await refreshAll(); }
    catch { toast({ title: "Could not save", description: "An outlet with that name may already exist.", variant: "destructive" }); await refreshAll(); }
  }
  async function remove(p: Publication) {
    const n = (projects.data ?? []).filter(x => x.publicationId === p.id).length;
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      description: `${n} project${n === 1 ? "" : "s"} will lose this outlet. Publication history entries are kept.`,
    });
    if (!ok) return;
    await ipc().publications.delete(p.id);
    setSelectedId(null);
    await refreshAll();
    toast({ title: "Outlet deleted" });
  }
  async function removeLog(h: PublicationHistory) {
    const ok = await confirm({ title: `Delete the entry for "${h.projectTitle}"?` });
    if (!ok) return;
    await ipc().pubHistory.delete(h.id);
    await refreshAll();
  }

  const targeting = selected ? (projects.data ?? []).filter(p => p.publicationId === selected.id && (p.status === "active" || p.status === "on-hold")) : [];
  const entries = selected ? entriesFor(selected.name).sort((a, b) => b.publishedDate.localeCompare(a.publishedDate)) : [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Publications</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Outlets you write for, with notes and history</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <aside>
          <div className="flex gap-2 mb-3">
            <Input placeholder="Add an outlet" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void add(); }} className="h-9" data-testid="input-new-publication" />
            <Button size="sm" className="h-9 gap-1" onClick={add} data-testid="button-add-publication"><Plus className="w-4 h-4" /> Add</Button>
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outlets yet.</p>
          ) : (
            <ul className="space-y-1" data-testid="publication-list">
              {list.map(p => {
                const last = lastFor(p.name);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setSelectedId(p.id)} data-testid={`publication-${p.id}`}
                      className={`w-full text-left rounded-md px-3 py-2 border ${selected?.id === p.id ? "bg-primary/10 border-primary/40" : "border-transparent hover:bg-muted"}`}>
                      <span className="block text-sm font-medium truncate">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{last ? `Last piece ${sinceLabel(last)}` : "No history yet"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0">
          {!selected ? (
            <div className="text-center py-20 text-muted-foreground"><BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Add an outlet to start.</p></div>
          ) : (
            <div data-testid="publication-detail" key={selected.id}>
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <AutoField value={selected.name} required ariaLabel="Outlet name" testId="input-publication-name" onSave={v => patch(selected, { name: v.trim() })}
                    className="text-lg md:text-lg font-semibold h-auto py-1.5 px-2 -mx-2 border-transparent hover:border-input focus-visible:border-input shadow-none bg-transparent" />
                </div>
                <RowMenu label="Outlet actions" testId="menu-publication" items={[
                  { label: "Delete outlet", icon: <Trash2 className="w-3.5 h-3.5" />, destructive: true, onSelect: () => remove(selected), testId: "button-delete-publication" },
                ]} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 mb-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Guidelines link</label>
                  <div className="flex gap-1.5">
                    <AutoField value={selected.guidelinesUrl ?? ""} ariaLabel="Guidelines link" testId="input-publication-url" placeholder="https://…" onSave={v => patch(selected, { guidelinesUrl: v.trim() || null })} />
                    {selected.guidelinesUrl && /^https?:\/\//i.test(selected.guidelinesUrl) && (
                      <a href={selected.guidelinesUrl} target="_blank" rel="noreferrer" aria-label="Open guidelines" className="p-2 rounded border hover:bg-muted shrink-0"><ExternalLink className="w-4 h-4" /></a>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Rate</label>
                  <AutoField value={selected.rate ?? ""} ariaLabel="Rate" testId="input-publication-rate" placeholder="e.g. $0.50 per word" onSave={v => patch(selected, { rate: v.trim() || null })} />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-xs text-muted-foreground mb-1">Notes (editor contacts, pitching tips)</label>
                <AutoField multiline rows={5} value={selected.notes} ariaLabel="Notes" testId="input-publication-notes" onSave={v => patch(selected, { notes: v })} />
              </div>

              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">In progress here ({targeting.length})</h2>
              {targeting.length === 0 ? <p className="text-sm text-muted-foreground mb-6">No open projects target this outlet.</p> : (
                <ul className="space-y-1.5 mb-6">
                  {targeting.map(p => (
                    <li key={p.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline truncate">{p.title}</Link>
                      <Badge variant="outline" className="text-xs capitalize">{p.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History ({entries.length})</h2>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEditingLog(null); setLogOpen(true); }} data-testid="button-log-entry"><Plus className="w-4 h-4" /> Log a piece</Button>
              </div>
              {entries.length === 0 ? <p className="text-sm text-muted-foreground">Nothing logged yet.</p> : (
                <ul className="space-y-1.5">
                  {entries.map(h => (
                    <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2" data-testid={`history-${h.id}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{h.projectTitle}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(h.publishedDate, "long")}{h.notes ? ` · ${h.notes}` : ""}</p>
                      </div>
                      <RowMenu label={`Actions for ${h.projectTitle}`} testId={`menu-history-${h.id}`} items={[
                        { label: "Edit", icon: <Pencil className="w-3.5 h-3.5" />, onSelect: () => { setEditingLog(h); setLogOpen(true); }, testId: `button-edit-history-${h.id}` },
                        { label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, destructive: true, separated: true, onSelect: () => removeLog(h), testId: `button-delete-history-${h.id}` },
                      ]} />
                    </li>
                  ))}
                </ul>
              )}
              <LogDialog open={logOpen} onClose={() => { setLogOpen(false); setEditingLog(null); }} outlet={selected} editing={editingLog} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
