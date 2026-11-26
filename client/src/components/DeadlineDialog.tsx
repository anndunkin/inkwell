import { useEffect, useState } from "react";
import { ipc } from "@/lib/ipc";
import { refreshAll, PRIORITIES, useProjects } from "@/lib/data";
import { todayStr } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Deadline } from "@shared/schema";

/** Add or edit a deadline. Pass `projectId` to preselect and lock the project. */
export default function DeadlineDialog({
  open, onClose, editing, projectId,
}: { open: boolean; onClose: () => void; editing: Deadline | null; projectId?: number }) {
  const { toast } = useToast();
  const { data: projects = [] } = useProjects();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayStr());
  const [priority, setPriority] = useState("medium");
  const [project, setProject] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setDueDate(editing?.dueDate ?? todayStr());
    setPriority(editing?.priority ?? "medium");
    setProject(String(editing?.projectId ?? projectId ?? "none").replace("null", "none"));
    setNotes(editing?.notes ?? "");
    setError("");
  }, [open, editing, projectId]);

  async function save() {
    if (!title.trim()) return setError("Title is required");
    if (!dueDate) return setError("Due date is required");
    const data = {
      title: title.trim(), dueDate, priority,
      projectId: project === "none" ? null : parseInt(project, 10),
      status: editing?.status ?? "pending", notes: notes || null, createdAt: editing?.createdAt ?? "",
    };
    if (editing) await ipc().deadlines.update(editing.id, data);
    else await ipc().deadlines.create(data);
    await refreshAll();
    toast({ title: editing ? "Deadline updated" : "Deadline added" });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)" }}>{editing ? "Edit deadline" : "New deadline"}</DialogTitle>
          <DialogDescription className="sr-only">Deadline details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="dl-title" className="text-sm font-medium">Title</label>
            <Input id="dl-title" data-testid="input-deadline-title" placeholder="What's due?" value={title} onChange={e => setTitle(e.target.value)} />
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="dl-date" className="text-sm font-medium">Due date</label>
              <Input id="dl-date" data-testid="input-deadline-date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-deadline-priority"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {!projectId && projects.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger data-testid="select-deadline-project"><SelectValue placeholder="Link to a project…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="dl-notes" className="text-sm font-medium">Notes</label>
            <Textarea id="dl-notes" data-testid="input-deadline-notes" rows={2} placeholder="Venue, contact…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" data-testid="button-save-deadline" onClick={save}>{editing ? "Update" : "Add deadline"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
