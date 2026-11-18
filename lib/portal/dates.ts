// Date helpers (client + server). All dates are "yyyy-mm-dd" strings in US Central time.

export const TZ = "America/Chicago";

export function todayCT(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const toDate = (d: string) => new Date(d + "T00:00:00Z");
const fromDate = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromDate(x);
}

/** Monday of the week containing d (weeks run Monday–Sunday). */
export function mondayOf(d: string): string {
  const dow = toDate(d).getUTCDay(); // 0 = Sunday
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export const monthStart = (d: string) => d.slice(0, 8) + "01";
export function addMonths(month: string, n: number): string {
  const x = toDate(monthStart(month));
  x.setUTCMonth(x.getUTCMonth() + n);
  return fromDate(x);
}
export const monthEnd = (month: string) => addDays(addMonths(month, 1), -1);

/** Approved timesheets for a month are due by the 5th of the next month. */
export const deadlineFor = (month: string) => addMonths(month, 1).slice(0, 8) + "05";
/** Payroll for a month is paid on the 20th of the next month. */
export const payDateFor = (month: string) => addMonths(month, 1).slice(0, 8) + "20";

/** Mondays of every week that has at least one day in the month. */
export function weeksInMonth(month: string): string[] {
  const out: string[] = [];
  for (let m = mondayOf(monthStart(month)); m <= monthEnd(month); m = addDays(m, 7)) out.push(m);
  return out;
}

export function monthLabel(month: string) {
  return toDate(monthStart(month)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function shortDate(d: string) {
  return toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function weekLabel(monday: string) {
  return `${shortDate(monday)} – ${shortDate(addDays(monday, 6))}`;
}

export const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** FLSA overtime: hours over 40 in the workweek (Mon–Sun), counted in day order. */
export function splitOvertime(hours: number[]): { regular: number; overtime: number }[] {
  let running = 0;
  return hours.map((h) => {
    const regular = Math.max(0, Math.min(h, 40 - running));
    running += h;
    return { regular: round2(regular), overtime: round2(h - regular) };
  });
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// ---------- Timesheet periods ----------
// A timesheet covers one Mon–Sun week, split at month boundaries, so every month's hours can be
// finished and approved on their own (e.g. Mon Aug 31 is its own period; Sep 1–6 is the next).

export type Period = { start: string; end: string };

/** The timesheet period that contains a date. */
export function periodFor(d: string): Period {
  const mon = mondayOf(d);
  const ms = monthStart(d);
  const me = monthEnd(d);
  const sun = addDays(mon, 6);
  return { start: mon > ms ? mon : ms, end: sun < me ? sun : me };
}

/** True if d is the first day of a timesheet period. */
export const isPeriodStart = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && periodFor(d).start === d;

/** All timesheet periods in a month, in order. */
export function periodsInMonth(month: string): Period[] {
  const out: Period[] = [];
  for (let d = monthStart(month); d <= monthEnd(month); d = addDays(periodFor(d).end, 1)) out.push(periodFor(d));
  return out;
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isWeekend = (d: string) => [0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay());
export const dayName = (d: string) => dayNames[(new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7];

export function periodLabel(p: Period) {
  return p.start === p.end ? shortDate(p.start) : `${shortDate(p.start)} – ${shortDate(p.end)}`;
}

/** Last day to submit a month's timesheets without being late (the 5th of the next month). */
export const submitDeadline = deadlineFor;

/** Last weekday (Mon–Fri) in a period; consultants can submit from this day on. Falls back to the period end. */
export function submitFrom(p: Period): string {
  for (let d = p.end; d >= p.start; d = addDays(d, -1)) if (!isWeekend(d)) return d;
  return p.end;
}

/** Label for a timesheet by its start date, e.g. "Aug 31" or "Sep 1 – Sep 6". */
export const sheetLabel = (start: string) => periodLabel(periodFor(start));
