/**
 * Local-calendar date helpers. Inkwell stores due dates as YYYY-MM-DD strings.
 * Everything here uses the user's local time zone, never UTC, so a date does
 * not shift by a day in the evening.
 */

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today as YYYY-MM-DD in local time. */
export function todayStr(): string {
  return toDateStr(new Date());
}

/** Parse YYYY-MM-DD (or an ISO timestamp) as a local-midnight Date. */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from today to dateStr (negative when in the past). */
export function daysUntil(dateStr: string): number {
  const due = parseDate(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function formatDate(dateStr: string, style: "short" | "long" = "short"): string {
  return parseDate(dateStr).toLocaleDateString("en-US", {
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Human description of a due date relative to today. */
export function relativeDue(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days}d left`;
}
