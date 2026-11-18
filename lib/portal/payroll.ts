import "server-only";
import { db } from "@/lib/i9/server";
import { monthEnd, monthStart, payDateFor, round2 } from "./dates";

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

/**
 * Rebuilds a draft run's lines.
 * - Hourly people: approved timesheet hours × pay rate (overtime 1.5×).
 * - Flat monthly people (stagity_people.monthly_pay): that amount every month they're active,
 *   whatever the hours (hours are still shown for reference).
 * - Lines HR edited by hand (manual) are kept exactly as they are.
 * Bonus, reimbursement and notes are always kept.
 */
export async function rebuildItems(run: Run) {
  const days = await eligibleDays(run);
  const totals = new Map<string, { regular: number; overtime: number }>();
  for (const d of days) {
    const t = totals.get(d.person_id) ?? { regular: 0, overtime: 0 };
    t.regular += Number(d.regular_hours);
    t.overtime += Number(d.overtime_hours);
    totals.set(d.person_id, t);
  }
  const start = monthStart(run.period_month);
  const end = monthEnd(run.period_month);
  const [{ data: existing }, { data: hourly }, { data: flat }] = await Promise.all([
    db().from("stagity_payroll_items").select("*").eq("run_id", run.id),
    db().from("stagity_people").select("id, pay_rate, monthly_pay").in("id", totals.size ? [...totals.keys()] : ["00000000-0000-0000-0000-000000000000"]),
    // Everyone on a flat monthly amount who worked for us at some point in this month.
    db().from("stagity_people").select("id, pay_rate, monthly_pay, start_date, end_date, active").gt("monthly_pay", 0),
  ]);
  const people = new Map<string, { pay_rate: number | null; monthly_pay: number | null }>();
  for (const p of hourly ?? []) people.set(p.id, p);
  const flatIds = new Set<string>();
  for (const p of flat ?? []) {
    const inMonth = (!p.start_date || p.start_date <= end) && (!p.end_date || p.end_date >= start);
    // Inactive people are only paid flat if they have an end date inside this month (their last month).
    if (inMonth && (p.active || (p.end_date && p.end_date >= start))) {
      people.set(p.id, p);
      flatIds.add(p.id);
    }
  }
  const keep = new Map((existing ?? []).map((i) => [i.person_id, i]));
  const ids = new Set([
    ...totals.keys(),
    ...flatIds,
    ...[...keep.values()].filter((i) => i.manual || Number(i.bonus) || Number(i.reimbursement) || i.note).map((i) => i.person_id),
  ]);
  const rows = [...ids].map((pid) => {
    const old = keep.get(pid);
    const extras = { bonus: Number(old?.bonus ?? 0), reimbursement: Number(old?.reimbursement ?? 0), note: old?.note ?? null };
    if (old?.manual) {
      return { run_id: run.id, person_id: pid, regular_hours: Number(old.regular_hours), overtime_hours: Number(old.overtime_hours), rate: Number(old.rate), flat_amount: old.flat_amount == null ? null : Number(old.flat_amount), manual: true, ...extras };
    }
    const p = people.get(pid);
    const monthly = p?.monthly_pay != null && Number(p.monthly_pay) > 0 ? Number(p.monthly_pay) : null;
    return {
      run_id: run.id,
      person_id: pid,
      regular_hours: round2(totals.get(pid)?.regular ?? 0),
      overtime_hours: round2(totals.get(pid)?.overtime ?? 0),
      rate: p?.pay_rate != null ? Number(p.pay_rate) : Number(old?.rate ?? 0),
      flat_amount: monthly,
      manual: false,
      ...extras,
    };
  });
  await db().from("stagity_payroll_items").delete().eq("run_id", run.id);
  if (rows.length) await db().from("stagity_payroll_items").insert(rows);
  return days;
}

type Line = { regular_hours: number; overtime_hours: number; rate: number; bonus: number; flat_amount?: number | null };

/** True when the line pays a flat amount instead of hours × rate. */
export const isFlat = (i: Line) => i.flat_amount != null;

/** Gross pay: flat amount (if set) or regular × rate + overtime × rate × 1.5, plus bonus. */
export const gross = (i: Line) =>
  round2(
    (isFlat(i) ? Number(i.flat_amount) : Number(i.regular_hours) * Number(i.rate) + Number(i.overtime_hours) * Number(i.rate) * 1.5) + Number(i.bonus),
  );

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
  (items ?? []).sort((a, b) => String((a.stagity_people as { last_name: string }).last_name).localeCompare(String((b.stagity_people as { last_name: string }).last_name)));
  const header = ["Employee ID", "Last Name", "First Name", "Regular Hours", "Overtime Hours", "Rate", "Salary", "Bonus", "Reimbursement", "Gross Pay", "Pay Date", "Period", "Note"];
  const lines = (items ?? []).map((i) => {
    const p = i.stagity_people as { first_name: string; last_name: string; adp_employee_id: string | null };
    return [p.adp_employee_id ?? "", p.last_name, p.first_name, Number(i.regular_hours).toFixed(2), Number(i.overtime_hours).toFixed(2),
      isFlat(i) ? "" : Number(i.rate).toFixed(2), isFlat(i) ? Number(i.flat_amount).toFixed(2) : "", Number(i.bonus).toFixed(2), Number(i.reimbursement).toFixed(2), gross(i).toFixed(2), run?.pay_date ?? "",
      (run?.period_month ?? "").slice(0, 7), i.note ?? ""].map(csvCell).join(",");
  });
  return {
    filename: `stagity-payroll-${(run?.period_month ?? "").slice(0, 7)}.csv`,
    body: [header.join(","), ...lines].join("\r\n") + "\r\n",
    items: items ?? [],
  };
}
