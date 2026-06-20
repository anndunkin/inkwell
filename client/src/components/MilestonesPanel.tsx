import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown, ChevronUp, Plus, Pencil, Trash2, Check, Circle, Clock, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Milestone, InsertMilestone } from "@shared/schema";

// ---- helpers ----------------------------------------------------------------

function parseList(json: string | null | undefined, fallback: string[]): string[] {
  if (!json) return fallback;
  try { return JSON.parse(json) as string[]; } catch { return fallback; }
}

const DEFAULT_MILESTONE_NAMES = [
  "First Draft", "Second Draft", "With Editor", "Final Review",
  "Fact Check", "Copy Edit", "Submitted", "Published",
];

const STATUS_OPTIONS = ["pending", "in-progress", "complete"] as const;
type MilestoneStatus = typeof STATUS_OPTIONS[number];

function StatusIcon({ status }: { status: string }) {
  if (status === "complete")    return <Check className="w-3.5 h-3.5 text-green-500" />;
  if (status === "in-progress") return <Clock className="w-3.5 h-3.5 text-blue-500" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
}

function statusLabel(s: string) {
  if (s === "in-progress") return "In Progress";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusBadgeVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "complete")    return "default";
  if (s === "in-progress") return "secondary";
  return "outline";
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ---- inline row form -------------------------------------------------------

interface MilestoneRowFormProps {
  milestoneNames: string[];
  initial?: Partial<Milestone>;
  onSave: (data: Partial<InsertMilestone>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function MilestoneRowForm({ milestoneNames, initial, onSave, onCancel, isLoading }: MilestoneRowFormProps) {
  const [name, setName] = useState(initial?.name ?? milestoneNames[0] ?? "First Draft");
  const [status, setStatus] = useState<string>(initial?.status ?? "pending");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    onSave({ name, status, dueDate: dueDate || null, notes: notes || null });
  }

  return (
    <form onSubmit={submit} className="space-y-2 pt-2 pb-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Name</label>
          <Select value={name} onValueChange={setName}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {milestoneNames.map(n => (
                <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s} className="text-xs">{statusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Due Date <span className="font-normal">(optional)</span></label>
        <Input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Notes <span className="font-normal">(optional)</span></label>
        <Input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes…"
          className="h-7 text-xs"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!name || isLoading}>
          {initial?.id ? "Update" : "Add Milestone"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---- main panel -------------------------------------------------------------

interface MilestonesPanelProps {
  projectId: number;
  projectTitle: string;
}

export default function MilestonesPanel({ projectId, projectTitle }: MilestonesPanelProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryKey = ["/api/milestones", projectId];

  const { data: milestoneList = [] } = useQuery<Milestone[]>({
    queryKey,
    queryFn: () => ipc().milestones.getForProject(projectId),
    enabled: expanded,
  });

  const { data: namesRaw } = useQuery<string | null>({
    queryKey: ["/api/settings/milestoneNames"],
    queryFn: () => ipc().settings.get("milestoneNames"),
  });
  const milestoneNames = parseList(namesRaw, DEFAULT_MILESTONE_NAMES);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
    // Also invalidate Deadlines page since milestones with due dates appear there
    queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
  }

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertMilestone>) =>
      ipc().milestones.create({ projectId, name: data.name!, status: data.status ?? "pending", dueDate: data.dueDate ?? null, notes: data.notes ?? null, sortOrder: 0, createdAt: "" }),
    onSuccess: () => { invalidate(); toast({ title: "Milestone added" }); setAdding(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertMilestone> }) =>
      ipc().milestones.update(id, data),
    onSuccess: () => { invalidate(); toast({ title: "Milestone updated" }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ipc().milestones.delete(id),
    onSuccess: () => { invalidate(); toast({ title: "Milestone deleted" }); },
  });

  // Quick status cycle on click: pending → in-progress → complete → pending
  function cycleStatus(m: Milestone) {
    const next: Record<string, MilestoneStatus> = {
      pending: "in-progress",
      "in-progress": "complete",
      complete: "pending",
    };
    updateMutation.mutate({ id: m.id, data: { status: next[m.status] ?? "pending" } });
  }

  const total = milestoneList.length;
  const done  = milestoneList.filter(m => m.status === "complete").length;

  return (
    <div className="border-t border-border mt-2 pt-2">
      {/* Header row — always visible */}
      <button
        onClick={() => { setExpanded(v => !v); setAdding(false); setEditingId(null); }}
        className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="font-medium flex items-center gap-1.5">
          Milestones
          {total > 0 && (
            <span className="bg-muted px-1.5 py-0.5 rounded text-xs">{done}/{total}</span>
          )}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* Collapsed summary: show up to 3 milestone names with status dots */}
      {!expanded && total > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {milestoneList.slice(0, 3).map(m => (
            <span key={m.id} className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <StatusIcon status={m.status} />
              {m.name}
            </span>
          ))}
          {total > 3 && <span className="text-xs text-muted-foreground">+{total - 3} more</span>}
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="mt-2 space-y-1">
          {milestoneList.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground italic py-1">No milestones yet.</p>
          )}

          {milestoneList.map(m => (
            editingId === m.id ? (
              <div key={m.id} className="bg-muted/40 rounded p-2">
                <MilestoneRowForm
                  milestoneNames={milestoneNames}
                  initial={m}
                  onSave={data => updateMutation.mutate({ id: m.id, data })}
                  onCancel={() => setEditingId(null)}
                  isLoading={updateMutation.isPending}
                />
              </div>
            ) : (
              <div key={m.id} className="group flex items-start justify-between gap-2 py-1 rounded hover:bg-muted/30 px-1 -mx-1">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <button
                    onClick={() => cycleStatus(m)}
                    title={`Status: ${statusLabel(m.status)} — click to advance`}
                    className="mt-0.5 shrink-0 hover:scale-110 transition-transform"
                  >
                    <StatusIcon status={m.status} />
                  </button>
                  <div className="min-w-0">
                    <span className={`text-xs font-medium ${m.status === "complete" ? "line-through text-muted-foreground" : ""}`}>
                      {m.name}
                    </span>
                    {m.dueDate && (
                      <span className="text-xs text-muted-foreground ml-1.5">· {formatDate(m.dueDate)}</span>
                    )}
                    {m.notes && (
                      <p className="text-xs text-muted-foreground truncate">{m.notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => { setEditingId(m.id); setAdding(false); }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(m.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          ))}

          {/* Add form */}
          {adding ? (
            <div className="bg-muted/40 rounded p-2">
              <MilestoneRowForm
                milestoneNames={milestoneNames}
                onSave={data => createMutation.mutate(data)}
                onCancel={() => setAdding(false)}
                isLoading={createMutation.isPending}
              />
            </div>
          ) : (
            <button
              onClick={() => { setAdding(true); setEditingId(null); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors py-1"
            >
              <Plus className="w-3 h-3" /> Add milestone
            </button>
          )}
        </div>
      )}
    </div>
  );
}
