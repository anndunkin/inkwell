import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Calendar as CalendarIcon, CheckCircle2, AlertCircle, Flag, ChevronLeft, ChevronRight, List, CalendarDays,
  Pencil, Trash2, Clock, RotateCcw, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import RowMenu from "@/components/RowMenu";
import { useEntryActions } from "@/components/useEntryActions";
import { daysUntil, formatDate, relativeDue, toDateStr, todayStr } from "@/lib/dates";
import { entryLabel, groupEntries, type ScheduleEntry } from "@/lib/schedule";
import type { Deadline } from "@shared/schema";

type ViewMode = "agenda" | "calendar";
const VIEW_KEY = "inkwell.scheduleView";

function loadView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "agenda"; } catch { return "agenda"; }
}

// ---- one row, used by Today, Schedule and the project page -------------------

export function EntryRow({
  entry, showProject = true, onEdit, compact = false,
}: {
  entry: ScheduleEntry;
  showProject?: boolean;
  onEdit?: (d: Deadline) => void;
  compact?: boolean;
}) {
  const actions = useEntryActions();
  const days = daysUntil(entry.dueDate);
  const pending = entry.status === "pending";
  const overdue = pending && days < 0;
  const urgent = pending && days >= 0 && days <= 3;
  const done = !pending;

  return (
    <div
      data-testid={`schedule-row-${entry.key}`}
      className={`flex items-center justify-between gap-3 rounded-lg border bg-card ${compact ? "p-2.5" : "p-3"} ${
        overdue ? "border-l-4 border-l-red-400" : urgent ? "border-l-4 border-l-orange-400" : ""
      }`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="mt-0.5 shrink-0">
          {entry.kind === "milestone"
            ? <Flag className="w-4 h-4 text-purple-500" aria-label="Milestone" />
            : <CalendarIcon className="w-4 h-4 text-muted-foreground" aria-label="Deadline" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
              {entryLabel(entry, showProject)}
            </p>
            {done && entry.status === "completed" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
            {overdue && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            {entry.kind === "milestone" && <Badge variant="outline" className="text-xs border-purple-300 text-purple-600 dark:text-purple-400">stage</Badge>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
            <span className={overdue ? "text-red-500 font-medium" : urgent ? "text-orange-500 font-medium" : ""}>
              {done ? (entry.status === "completed" ? "Completed" : entry.status === "skipped" ? "Skipped" : "Missed") : relativeDue(entry.dueDate)}
            </span>
            <span>·</span>
            <span>{formatDate(entry.dueDate)}</span>
            {showProject && entry.projectId && entry.kind === "deadline" && entry.projectTitle && (
              <>
                <span>·</span>
                <Link href={`/projects/${entry.projectId}`} className="text-primary hover:underline">{entry.projectTitle}</Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {entry.kind === "deadline" && entry.priority && (
          <Badge variant="outline" className={`text-xs priority-${entry.priority}`}>{entry.priority}</Badge>
        )}
        {pending ? (
          <Button
            variant="ghost" size="sm" className="h-8 px-2 gap-1 text-muted-foreground hover:text-green-600"
            onClick={() => actions.complete(entry)} data-testid={`button-complete-${entry.key}`} title="Mark complete"
          >
            <CheckCircle2 className="w-4 h-4" /> <span className="hidden sm:inline text-xs">Done</span>
          </Button>
        ) : (
          <Button
            variant="ghost" size="sm" className="h-8 px-2 gap-1 text-muted-foreground"
            onClick={() => actions.reopen(entry)} data-testid={`button-reopen-${entry.key}`} title="Reopen"
          >
            <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline text-xs">Reopen</span>
          </Button>
        )}
        <RowMenu
          label={`Actions for ${entry.title}`}
          testId={`menu-${entry.key}`}
          items={[
            ...(entry.projectId ? [] : []),
            ...(pending ? [{ label: "Snooze one week", icon: <Clock className="w-3.5 h-3.5" />, onSelect: () => actions.snooze(entry, 7), testId: `button-snooze-${entry.key}` }] : []),
            ...(entry.kind === "deadline" && onEdit ? [{ label: "Edit", icon: <Pencil className="w-3.5 h-3.5" />, onSelect: () => onEdit(entry.raw as Deadline), testId: `button-edit-${entry.key}` }] : []),
            ...(entry.projectId ? [{ label: "Open project", icon: <ExternalLink className="w-3.5 h-3.5" />, onSelect: () => { window.location.hash = `#/projects/${entry.projectId}`; }, testId: `button-open-project-${entry.key}` }] : []),
            { label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, destructive: true, separated: true, onSelect: () => actions.remove(entry), testId: `button-delete-${entry.key}` },
          ]}
        />
      </div>
    </div>
  );
}

// ---- agenda -----------------------------------------------------------------

function Section({ title, items, ...rest }: { title: string; items: ScheduleEntry[]; showProject: boolean; onEdit?: (d: Deadline) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-7" data-testid={`section-${title.toLowerCase().replace(/\W+/g, "-")}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">{title} ({items.length})</h2>
      <div className="space-y-2">{items.map(e => <EntryRow key={e.key} entry={e} {...rest} />)}</div>
    </section>
  );
}

export function Agenda({ entries, showProject, onEdit }: { entries: ScheduleEntry[]; showProject: boolean; onEdit?: (d: Deadline) => void }) {
  const g = groupEntries(entries);
  return (
    <>
      <Section title="Overdue" items={g.overdue} showProject={showProject} onEdit={onEdit} />
      <Section title="Due this week" items={g.thisWeek} showProject={showProject} onEdit={onEdit} />
      <Section title="Upcoming" items={g.upcoming} showProject={showProject} onEdit={onEdit} />
      <Section title="Completed / missed / skipped" items={g.done} showProject={showProject} onEdit={onEdit} />
    </>
  );
}

// ---- month calendar -----------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function chipClass(e: ScheduleEntry): string {
  if (e.status !== "pending") return "bg-muted text-muted-foreground line-through";
  if (daysUntil(e.dueDate) < 0) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  return e.kind === "milestone"
    ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
}

export function MonthCalendar({ entries, showProject, onEdit }: { entries: ScheduleEntry[]; showProject: boolean; onEdit?: (d: Deadline) => void }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selected, setSelected] = useState<string>(todayStr());

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const e of entries) { if (!map.has(e.dueDate)) map.set(e.dueDate, []); map.get(e.dueDate)!.push(e); }
    return map;
  }, [entries]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const weeks = cells.slice(35).some(d => d.getMonth() === cursor.getMonth()) ? 6 : 5;
  const today = todayStr();
  const selectedEntries = byDay.get(selected) ?? [];

  return (
    <div data-testid="month-calendar">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium" style={{ fontFamily: "var(--font-display)" }} data-testid="calendar-month-label">
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8" onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); setSelected(todayStr()); }} data-testid="calendar-today">Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} data-testid="calendar-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} data-testid="calendar-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border border-border rounded-lg overflow-hidden bg-border gap-px">
        {WEEKDAYS.map(d => <div key={d} className="bg-muted/60 text-xs font-medium text-muted-foreground text-center py-1.5">{d}</div>)}
        {cells.slice(0, weeks * 7).map(d => {
          const ds = toDateStr(d);
          const items = byDay.get(ds) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isSel = ds === selected;
          return (
            <button
              key={ds}
              type="button"
              onClick={() => setSelected(ds)}
              data-testid={`calendar-day-${ds}`}
              aria-label={`${formatDate(ds)}, ${items.length} item${items.length === 1 ? "" : "s"}`}
              className={`min-h-[84px] p-1.5 text-left align-top flex flex-col gap-1 bg-card hover:bg-muted/40 transition-colors ${inMonth ? "" : "opacity-50"} ${isSel ? "ring-2 ring-primary ring-inset" : ""}`}
            >
              <span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${ds === today ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"}`}>{d.getDate()}</span>
              {items.slice(0, 2).map(e => (
                <span key={e.key} title={entryLabel(e, showProject)} className={`block truncate rounded px-1 py-0.5 text-[11px] leading-tight ${chipClass(e)}`}>
                  {entryLabel(e, showProject)}
                </span>
              ))}
              {items.length > 2 && <span className="text-[11px] text-muted-foreground">+{items.length - 2} more</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-5" data-testid="calendar-day-panel">
        <h3 className="text-sm font-medium mb-2">{formatDate(selected, "long")}</h3>
        {selectedEntries.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          : <div className="space-y-2">{selectedEntries.map(e => <EntryRow key={e.key} entry={e} showProject={showProject} onEdit={onEdit} />)}</div>}
      </div>
    </div>
  );
}

// ---- wrapper with the Agenda / Calendar toggle -------------------------------

export default function ScheduleView({
  entries, showProject = true, onEdit, emptyText = "Nothing scheduled yet.",
}: {
  entries: ScheduleEntry[];
  showProject?: boolean;
  onEdit?: (d: Deadline) => void;
  emptyText?: string;
}) {
  const [view, setView] = useState<ViewMode>(loadView);
  function choose(v: ViewMode) { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="flex border border-border rounded-md overflow-hidden" role="group" aria-label="Schedule view">
          <button type="button" onClick={() => choose("agenda")} data-testid="view-agenda" aria-pressed={view === "agenda"}
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${view === "agenda" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
            <List className="w-3.5 h-3.5" /> Agenda
          </button>
          <button type="button" onClick={() => choose("calendar")} data-testid="view-calendar" aria-pressed={view === "calendar"}
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${view === "calendar" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
            <CalendarDays className="w-3.5 h-3.5" /> Calendar
          </button>
        </div>
      </div>
      {view === "calendar"
        ? <MonthCalendar entries={entries} showProject={showProject} onEdit={onEdit} />
        : entries.length === 0
          ? <div className="text-center py-14 text-muted-foreground"><CalendarIcon className="w-9 h-9 mx-auto mb-3 opacity-30" /><p className="text-sm">{emptyText}</p></div>
          : <Agenda entries={entries} showProject={showProject} onEdit={onEdit} />}
    </div>
  );
}
