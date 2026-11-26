import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ScheduleView from "@/components/ScheduleView";
import DeadlineDialog from "@/components/DeadlineDialog";
import { useAllMilestones, useDeadlines, useProjects, PRIORITIES } from "@/lib/data";
import { buildEntries } from "@/lib/schedule";
import type { Deadline } from "@shared/schema";

export default function SchedulePage() {
  const deadlines = useDeadlines();
  const milestones = useAllMilestones();
  const projects = useProjects();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priority, setPriority] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);

  const all = useMemo(
    () => buildEntries(deadlines.data ?? [], milestones.data ?? [], projects.data ?? []),
    [deadlines.data, milestones.data, projects.data],
  );
  const entries = all.filter(e => {
    if (!showDone && e.status !== "pending") return false;
    if (projectFilter !== "all" && String(e.projectId ?? "none") !== projectFilter) return false;
    if (priority !== "all" && (e.kind !== "deadline" || e.priority !== priority)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !(e.projectTitle ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Schedule</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Deadlines and project stages, together</p>
        </div>
        <Button size="sm" className="gap-1.5" data-testid="button-new-deadline" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> New deadline
        </Button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search-schedule" className="pl-9" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-44" data-testid="select-filter-project"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="none">No project</SelectItem>
            {(projects.data ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36" data-testid="select-filter-priority"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any priority</SelectItem>
            {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} data-testid="checkbox-show-completed" />
          Show completed
        </label>
      </div>

      <ScheduleView entries={entries} onEdit={(d) => { setEditing(d); setDialogOpen(true); }} emptyText="Nothing on the schedule. Add a deadline, or give a project stage a due date." />
      <DeadlineDialog open={dialogOpen} editing={editing} onClose={() => { setDialogOpen(false); setEditing(null); }} />
    </div>
  );
}
