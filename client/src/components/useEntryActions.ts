import { ipc } from "@/lib/ipc";
import { refreshAll } from "@/lib/data";
import { addDays, todayStr } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import type { ScheduleEntry } from "@/lib/schedule";

/** Complete, reopen, snooze and delete for any schedule entry, deadline or milestone. */
export function useEntryActions() {
  const { toast } = useToast();
  const confirm = useConfirm();

  async function complete(e: ScheduleEntry) {
    try {
      if (e.kind === "deadline") await ipc().deadlines.update(e.id, { status: "completed" });
      else await ipc().milestones.update(e.id, { status: "completed", completedAt: todayStr() });
    } catch (err) {
      toast({ title: "Could not mark complete", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      return;
    } finally {
      // Always re-read so every page reflects what was actually saved.
      await refreshAll();
    }
    toast({ title: e.kind === "deadline" ? "Deadline completed" : `${e.title} completed` });
  }

  async function reopen(e: ScheduleEntry) {
    if (e.kind === "deadline") await ipc().deadlines.update(e.id, { status: "pending" });
    else await ipc().milestones.update(e.id, { status: "not_started", completedAt: null });
    await refreshAll();
  }

  async function snooze(e: ScheduleEntry, days = 7) {
    // Snooze from today when overdue, otherwise push the existing date out.
    const from = e.dueDate < todayStr() ? todayStr() : e.dueDate;
    const next = addDays(from, days);
    if (e.kind === "deadline") await ipc().deadlines.update(e.id, { dueDate: next });
    else await ipc().milestones.update(e.id, { dueDate: next });
    await refreshAll();
    toast({ title: `Moved to ${next}` });
  }

  async function remove(e: ScheduleEntry) {
    const ok = await confirm({
      title: `Delete ${e.kind === "milestone" ? "stage" : "deadline"} "${e.title}"?`,
      description: e.kind === "milestone" ? "The stage is removed from its project's pipeline." : undefined,
    });
    if (!ok) return;
    if (e.kind === "deadline") await ipc().deadlines.delete(e.id);
    else await ipc().milestones.delete(e.id);
    await refreshAll();
    toast({ title: "Deleted" });
  }

  return { complete, reopen, snooze, remove };
}
