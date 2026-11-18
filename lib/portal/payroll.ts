import "server-only";
import { db } from "@/lib/i9/server";
import { monthEnd, payDateFor, round2 } from "./dates";

type Run = { id: string; period_month: string; include_late: boolean };

/**
 * Approved, unpaid hours that belong in this payroll run: everything worked on or before the end
 * of the period. Timesheets are due on the 5th but late ones are accepted until payroll is locked;
 * anything approved after that goes on the next month's payroll.
 */
export async function eligibleDays(run: Run) {
  const { data } = await db()
    .from("stagity_timesheet_days")
    .select("id, person_id, work_date, regular_hours, overtime_hours, stagity_timesheets!inner(status)")
    .is("payroll_run_id", null)
    .lte("work_date", monthEnd(run.period_month))
    .eq("stagity_timesheets.status", "approved");
  return data ?? [];
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

/** Creates (or returns) the draft payroll run for a month and refreshes it from approved timesheets. */
export async function ensureDraftRun(period: string, actor: string) {
  let { data: run } = await db().from("stagity_payroll_runs").select("*").eq("period_month", period).maybeSingle();
  if (!run) {
    const ins = await db().from("stagity_payroll_runs").insert({ period_month: period, pay_date: payDateFor(period), created_by: actor }).select("*").single();
    run = ins.data;
  }
  if (run && run.status === "draft") await rebuildItems(run);
  return run as { id: string; period_month: string; pay_date: string; status: string; include_late: boolean } | null;
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV for ADP RUN payroll import. */
export async function payrollCsv(runId: string) {
  const { data: run } = await db().from("stagity_payroll_runs").select("*").eq("id", runId).single();
  const { data: items } = await db().from("stagity_payroll_items").select("*, stagity_people(first_name, last_name, adp_employee_id)").eq("run_id", runId);
  const header = ["Employee ID", "Last Name", "First Name", "Regular Hours", "Overtime Hours", "Rate", "Bonus", "Reimbursement", "Gross Pay", "Pay Date", "Period", "Note"];
  const lines = (items ?? []).map((i) => {
    const p = i.stagity_people as { first_name: string; last_name: string; adp_employee_id: string | null };
    return [p.adp_employee_id ?? "", p.last_name, p.first_name, Number(i.regular_hours).toFixed(2), Number(i.overtime_hours).toFixed(2),
      Number(i.rate).toFixed(2), Number(i.bonus).toFixed(2), Number(i.reimbursement).toFixed(2), gross(i).toFixed(2), run?.pay_date ?? "",
      (run?.period_month ?? "").slice(0, 7), i.note ?? ""].map(csvCell).join(",");
  });
  return {
    filename: `stagity-payroll-${(run?.period_month ?? "").slice(0, 7)}.csv`,
    body: [header.join(","), ...lines].join("\r\n") + "\r\n",
    items: items ?? [],
  };
}
