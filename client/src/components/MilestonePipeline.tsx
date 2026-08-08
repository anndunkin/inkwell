import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ipc } from "@/lib/ipc";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Milestone, InsertMilestone } from "@shared/schema";

const DEFAULT_MILESTONE_NAMES = [
  "First Draft", "Second Draft", "With Editor", "Final Review",
  "Fact Check", "Copy Edit", "Submitted", "Published",
];

function parseList(json: string | null | undefined, fallback: string[]): string[] {
  if (!json) return fallback;
  try { return JSON.parse(json) as string[]; } catch { return fallback; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function abbreviate(name: string, max = 12): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

/** Order milestones by their position in the settings name sequence. */
function orderMilestones(list: Milestone[], names: string[]): Milestone[] {
  const rank = (m: Milestone) => {
    const i = names.indexOf(m.name);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder || a.id - b.id);
}

// ---- Advance / complete dialog ---------------------------------------------

interface AdvanceDialogProps {
  milestone: Milestone;
  projectTitle: string;
  milestoneNames: string[];
  existing: Milestone[];
  onClose: () => void;
  onComplete: (nextName: string | null, nextDue: string | null) => void;
  onIncomplete: () => void;
  isPending: boolean;
}

function MilestoneAdvanceDialog({
  milestone, projectTitle, milestoneNames, existing, onClose, onComplete, onIncomplete, isPending,
}: AdvanceDialogProps) {
  const alreadyDone = milestone.status === "completed";

  const idx = milestoneNames.indexOf(milestone.name);
  const isLast = idx !== -1 && idx === milestoneNames.length - 1;

  // Default next: the first not-yet-existing name after this one in the sequence,
  // falling back to the immediate next name.
  const existingNames = new Set(existing.map(m => m.name));
  const defaultNext = (() => {
    if (idx === -1) return milestoneNames[0] ?? "";
    for (let i = idx + 1; i < milestoneNames.length; i++) {
      if (!existingNames.has(milestoneNames[i])) return milestoneNames[i];
    }
    return milestoneNames[idx + 1] ?? "";
  })();

  const [nextName, setNextName] = useState(defaultNext);
  const [nextDue, setNextDue] = useState("");

  if (alreadyDone) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{milestone.name} — Mark as incomplete?</DialogTitle>
            <DialogDescription>
              {projectTitle}: reopen this milestone and clear its completion date.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button data-testid="button-milestone-incomplete" onClick={onIncomplete} disabled={isPending}>
              Mark Incomplete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{milestone.name} — Mark Complete?</DialogTitle>
          <DialogDescription>
            {projectTitle}: complete “{milestone.name}”
            {isLast ? " — the final stage in the pipeline." : " and advance to the next stage."}
          </DialogDescription>
        </DialogHeader>

        {!isLast && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Next milestone</label>
              <Select value={nextName} onValueChange={setNextName}>
                <SelectTrigger data-testid="select-next-milestone"><SelectValue placeholder="Choose next…" /></SelectTrigger>
                <SelectContent>
                  {milestoneNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Next due date <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="button-milestone-advance"
            onClick={() => onComplete(isLast ? null : (nextName || null), nextDue || null)}
            disabled={isPending}
          >
            {isLast ? "Mark Complete" : "Mark Complete & Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Add dialog ------------------------------------------------------------

interface AddDialogProps {
  milestoneNames: string[];
  onClose: () => void;
  onAdd: (name: string, due: string | null) => void;
  isPending: boolean;
}

function AddMilestoneDialog({ milestoneNames, onClose, onAdd, isPending }: AddDialogProps) {
  const [name, setName] = useState(milestoneNames[0] ?? "");
  const [due, setDue] = useState("");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Milestone</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Milestone</label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger data-testid="select-add-milestone"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                {milestoneNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Due date <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="button-add-milestone-confirm" onClick={() => onAdd(name, due || null)} disabled={!name || isPending}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Pipeline --------------------------------------------------------------

export default function MilestonePipeline({ projectId, projectTitle }: { projectId: number; projectTitle: string }) {
  const { toast } = useToast();
  const [advancing, setAdvancing] = useState<Milestone | null>(null);
  const [adding, setAdding] = useState(false);

  const queryKey = ["/api/milestones", projectId];
  const { data: list = [] } = useQuery<Milestone[]>({
    queryKey,
    queryFn: () => ipc().milestones.getForProject(projectId),
  });
  const { data: namesRaw } = useQuery<string | null>({
    queryKey: ["/api/settings/milestoneNames"],
    queryFn: () => ipc().settings.get("milestoneNames"),
  });
  const milestoneNames = parseList(namesRaw, DEFAULT_MILESTONE_NAMES);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
  }

  const createMutation = useMutation({
    mutationFn: (data: InsertMilestone) => ipc().milestones.create(data),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertMilestone> }) => ipc().milestones.update(id, data),
    onSuccess: () => {
      invalidate();
      queryClient.refetchQueries({ queryKey: ["/api/deadlines"] });
    },
  });

  const ordered = orderMilestones(list, milestoneNames);
  const activeId = ordered.find(m => m.status !== "completed")?.id ?? null;

  async function handleComplete(nextName: string | null, nextDue: string | null) {
    const m = advancing;
    if (!m) return;
    await updateMutation.mutateAsync({ id: m.id, data: { status: "completed", completedAt: today() } });
    if (nextName && !ordered.some(x => x.name === nextName)) {
      await createMutation.mutateAsync({
        projectId, name: nextName, status: "not_started",
        dueDate: nextDue, notes: null, sortOrder: 0, createdAt: "",
      });
    }
    toast({ title: `${m.name} completed` });
    setAdvancing(null);
  }

  async function handleIncomplete() {
    const m = advancing;
    if (!m) return;
    await updateMutation.mutateAsync({ id: m.id, data: { status: "not_started", completedAt: null } });
    toast({ title: `${m.name} reopened` });
    setAdvancing(null);
  }

  async function handleAdd(name: string, due: string | null) {
    await createMutation.mutateAsync({
      projectId, name, status: "not_started",
      dueDate: due, notes: null, sortOrder: 0, createdAt: "",
    });
    toast({ title: "Milestone added" });
    setAdding(false);
  }

  return (
    <div className="border-t border-border mt-2 pt-2.5">
      {ordered.length === 0 ? (
        <button
          data-testid={`button-add-first-milestone-${projectId}`}
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus className="w-3 h-3" /> Add first milestone
        </button>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          {ordered.map((m, i) => {
            const done = m.status === "completed";
            const active = m.id === activeId;
            return (
              <div key={m.id} className="flex items-center">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                <button
                  data-testid={`milestone-chip-${m.id}`}
                  onClick={() => setAdvancing(m)}
                  title={`${m.name} — ${m.status}`}
                  className={
                    "flex items-center gap-1 rounded-full border transition-colors " +
                    (done
                      ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300 px-2 py-0.5 text-[11px]"
                      : active
                        ? "bg-background border-primary text-foreground font-semibold px-2.5 py-1 text-xs ring-1 ring-primary/40"
                        : "bg-muted/40 border-border text-muted-foreground px-2 py-0.5 text-[11px]")
                  }
                >
                  {done && <Check className="w-3 h-3 shrink-0" />}
                  {abbreviate(m.name)}
                </button>
              </div>
            );
          })}
          <button
            data-testid={`button-add-milestone-${projectId}`}
            onClick={() => setAdding(true)}
            title="Add milestone"
            className="ml-1 flex items-center gap-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary px-1.5 py-0.5 text-[11px] transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}

      {advancing && (
        <MilestoneAdvanceDialog
          milestone={advancing}
          projectTitle={projectTitle}
          milestoneNames={milestoneNames}
          existing={ordered}
          onClose={() => setAdvancing(null)}
          onComplete={handleComplete}
          onIncomplete={handleIncomplete}
          isPending={updateMutation.isPending || createMutation.isPending}
        />
      )}
      {adding && (
        <AddMilestoneDialog
          milestoneNames={milestoneNames}
          onClose={() => setAdding(false)}
          onAdd={handleAdd}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}
