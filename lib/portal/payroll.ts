import "server-only";
import { db } from "@/lib/i9/server";
import { deadlineFor, monthEnd, round2, todayCT } from "./dates";

type Run = { id: string; period_month: string; include_late: boolean };

/**
 * Approved, unpaid hours that belong in this payroll run:
 * worked on or before the end of the period, and submitted by the period's deadline (the 5th),
 * unless the run includes late timesheets. Late hours roll into the next run automatically.
 */
export async function eligibleDays(run: Run) {
  const { data } = await db()
    .from("stagity_timesheet_days")
    .select("id, person_id, work_date, regular_hours, overtime_hours, stagity_timesheets!inner(status, submitted_at)")
    .is("payroll_run_id", null)
    .lte("work_date", monthEnd(run.period_month))
    .eq("stagity_timesheets.status", "approved");
  const deadline = deadlineFor(run.period_month);
  return (data ?? []).filter((d) => {
    const ts = d.stagity_timesheets as unknown as { submitted_at: string | null };
    return run.include_late || (ts.submitted_at && todayCT(new Date(ts.submitted_at)) <= deadline);
  });
}

/** Rebuilds a draft run's items from timesheets, keeping HR's bonus/reimbursement/notes. */
export async function rebuildItems(run: Run) {
  const days = await eligibleDays(run);
  const totals = new Map<string, { regular: number; overtime: number }>();
  for (const d of days) {
    const t = totals.get(d.person_id) ?? { regular: 0, overtime: 0 };
    t.regular += Number(d.regular_hours);
    t.overtime += Number(d.overtime_hours);
    totals.set(d.person_id, t);
  }
  const [{ data: existing }, { data: people }] = await Promise.all([
    db().from("stagity_payroll_items").select("*").eq("run_id", run.id),
    db().from("stagity_people").select("id, pay_rate").in("id", [...totals.keys()].length ? [...totals.keys()] : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const rate = new Map((people ?? []).map((p) => [p.id, Number(p.pay_rate ?? 0)]));
  const keep = new Map((existing ?? []).map((i) => [i.person_id, i]));
  const ids = new Set([...totals.keys(), ...[...keep.values()].filter((i) => Number(i.bonus) || Number(i.reimbursement) || i.note).map((i) => i.person_id)]);
  const rows = [...ids].map((pid) => ({
    run_id: run.id,
    person_id: pid,
    regular_hours: round2(totals.get(pid)?.regular ?? 0),
    overtime_hours: round2(totals.get(pid)?.overtime ?? 0),
    rate: keep.get(pid)?.rate && !totals.has(pid) ? Number(keep.get(pid)!.rate) : rate.get(pid) ?? Number(keep.get(pid)?.rate ?? 0),
    bonus: Number(keep.get(pid)?.bonus ?? 0),
    reimbursement: Number(keep.get(pid)?.reimbursement ?? 0),
    note: keep.get(pid)?.note ?? null,
  }));
  await db().from("stagity_payroll_items").delete().eq("run_id", run.id);
  if (rows.length) await db().from("stagity_payroll_items").insert(rows);
  return days;
}

export const gross = (i: { regular_hours: number; overtime_hours: number; rate: number; bonus: number }) =>
  round2(Number(i.regular_hours) * Number(i.rate) + Number(i.overtime_hours) * Number(i.rate) * 1.5 + Number(i.bonus));
