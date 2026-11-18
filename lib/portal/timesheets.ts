import "server-only";
import { db } from "@/lib/i9/server";
import { addDays, monthEnd, monthStart, mondayOf, todayCT, weeksInMonth } from "./dates";

export type SheetRow = { id: string; person_id: string; week_start: string; status: string; total_hours: number; submitted_at: string | null };
export type ConsultantRow = {
  id: string; first_name: string; last_name: string; email: string; client_name: string | null;
  start_date: string | null; end_date: string | null; active: boolean;
};

/** Weeks in the month this consultant was expected to work (up to the current week). */
export function expectedWeeks(p: ConsultantRow, month: string, today = todayCT()): string[] {
  const current = mondayOf(today);
  return weeksInMonth(month).filter(
    (w) => w <= current && (!p.start_date || addDays(w, 6) >= p.start_date) && (!p.end_date || w <= p.end_date),
  );
}

export async function monthOverview(month: string) {
  const m = monthStart(month);
  const weeks = weeksInMonth(m);
  const [{ data: people }, { data: sheets }] = await Promise.all([
    db()
      .from("stagity_people")
      .select("id, first_name, last_name, email, client_name, start_date, end_date, active")
      .eq("kind", "consultant")
      .or(`end_date.is.null,end_date.gte.${m}`)
      .order("last_name"),
    db()
      .from("stagity_timesheets")
      .select("id, person_id, week_start, status, total_hours, submitted_at")
      .gte("week_start", weeks[0])
      .lte("week_start", monthEnd(m)),
  ]);
  const consultants = ((people ?? []) as ConsultantRow[]).filter((p) => (!p.start_date || p.start_date <= monthEnd(m)) && (p.active || (sheets ?? []).some((s) => s.person_id === p.id)));
  const byKey = new Map<string, SheetRow>();
  (sheets ?? []).forEach((s) => byKey.set(`${s.person_id}:${s.week_start}`, s as SheetRow));
  return { weeks, consultants, sheet: (pid: string, w: string) => byKey.get(`${pid}:${w}`) };
}

/** Expected weeks that haven't been submitted (missing, draft or sent back). */
export function missingWeeks(p: ConsultantRow, month: string, sheet: (pid: string, w: string) => SheetRow | undefined) {
  return expectedWeeks(p, month).filter((w) => {
    const s = sheet(p.id, w);
    return !s || s.status === "draft" || s.status === "rejected";
  });
}
