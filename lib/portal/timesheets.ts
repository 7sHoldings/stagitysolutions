import "server-only";
import { db } from "@/lib/i9/server";
import { addDays, monthEnd, monthStart, weekStartOf, periodsInMonth, round2, splitOvertime, todayCT, type Period } from "./dates";

export type SheetRow = { id: string; person_id: string; week_start: string; status: string; total_hours: number; submitted_at: string | null; ai_status: string | null };
export type ConsultantRow = {
  id: string; first_name: string; last_name: string; email: string; client_name: string | null;
  start_date: string | null; end_date: string | null; active: boolean;
};

/** Timesheet periods in the month this consultant owes (only periods that have started, within employment). */
export function expectedPeriods(p: Pick<ConsultantRow, "start_date" | "end_date">, month: string, today = todayCT()): Period[] {
  return periodsInMonth(month).filter(
    (x) => x.start <= today && (!p.start_date || x.end >= p.start_date) && (!p.end_date || x.start <= p.end_date),
  );
}

export async function monthOverview(month: string) {
  const m = monthStart(month);
  const periods = periodsInMonth(m);
  const [{ data: people }, { data: sheets }] = await Promise.all([
    db()
      .from("stagity_people")
      .select("id, first_name, last_name, email, client_name, start_date, end_date, active")
      .eq("kind", "consultant")
      .or(`end_date.is.null,end_date.gte.${m}`)
      .order("last_name"),
    db()
      .from("stagity_timesheets")
      .select("id, person_id, week_start, status, total_hours, submitted_at, ai_status")
      .gte("week_start", m)
      .lte("week_start", monthEnd(m)),
  ]);
  const consultants = ((people ?? []) as ConsultantRow[]).filter(
    (p) => (!p.start_date || p.start_date <= monthEnd(m)) && (p.active || (sheets ?? []).some((s) => s.person_id === p.id)),
  );
  const byKey = new Map<string, SheetRow>();
  (sheets ?? []).forEach((s) => byKey.set(`${s.person_id}:${s.week_start}`, s as SheetRow));
  return { periods, consultants, sheet: (pid: string, start: string) => byKey.get(`${pid}:${start}`) };
}

/** Owed periods that aren't submitted yet (missing, draft or sent back). */
export function missingPeriods(p: ConsultantRow, month: string, sheet: (pid: string, start: string) => SheetRow | undefined) {
  return expectedPeriods(p, month).filter((x) => {
    const s = sheet(p.id, x.start);
    return !s || s.status === "draft" || s.status === "rejected";
  });
}

/** A month is complete when the month is over and every owed period is approved by HR. */
export async function monthStatus(personId: string, month: string) {
  const m = monthStart(month);
  const { data: p } = await db().from("stagity_people").select("start_date, end_date").eq("id", personId).single();
  const owed = expectedPeriods(p ?? { start_date: null, end_date: null }, m);
  const { data: sheets } = await db()
    .from("stagity_timesheets")
    .select("week_start, status")
    .eq("person_id", personId)
    .gte("week_start", m)
    .lte("week_start", monthEnd(m));
  const approved = owed.filter((x) => sheets?.some((s) => s.week_start === x.start && s.status === "approved")).length;
  return { owed: owed.length, approved, complete: monthEnd(m) < todayCT() && approved === owed.length };
}

/**
 * Overtime is hours over 40 in a Sun–Sat workweek, even when the week is split across two
 * timesheets at month end. Recomputes the split for every unpaid day in that workweek.
 */
export async function recomputeWeekOvertime(personId: string, anyDate: string) {
  const mon = weekStartOf(anyDate); // Sunday
  const { data: days } = await db()
    .from("stagity_timesheet_days")
    .select("id, work_date, hours, payroll_run_id")
    .eq("person_id", personId)
    .gte("work_date", mon)
    .lte("work_date", addDays(mon, 6))
    .order("work_date");
  if (!days?.length) return;
  const split = splitOvertime(days.map((d) => Number(d.hours)));
  for (let i = 0; i < days.length; i++) {
    if (days[i].payroll_run_id) continue; // already paid: leave as is
    await db()
      .from("stagity_timesheet_days")
      .update({ regular_hours: round2(split[i].regular), overtime_hours: round2(split[i].overtime) })
      .eq("id", days[i].id);
  }
}
