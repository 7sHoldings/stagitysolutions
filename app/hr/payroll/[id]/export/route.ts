import { db, hrSession } from "@/lib/i9/server";
import { gross } from "@/lib/portal/payroll";

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV for ADP RUN payroll import. Columns may need mapping to your RUN import template. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hrSession())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const { data: run } = await db().from("stagity_payroll_runs").select("*").eq("id", id).maybeSingle();
  if (!run) return new Response("Not found", { status: 404 });
  const { data: items } = await db().from("stagity_payroll_items").select("*, stagity_people(first_name, last_name, adp_employee_id)").eq("run_id", id);
  const header = ["Employee ID", "Last Name", "First Name", "Regular Hours", "Overtime Hours", "Rate", "Bonus", "Reimbursement", "Gross Pay", "Pay Date", "Period", "Note"];
  const lines = (items ?? []).map((i) => {
    const p = i.stagity_people as { first_name: string; last_name: string; adp_employee_id: string | null };
    return [p.adp_employee_id ?? "", p.last_name, p.first_name, Number(i.regular_hours).toFixed(2), Number(i.overtime_hours).toFixed(2),
      Number(i.rate).toFixed(2), Number(i.bonus).toFixed(2), Number(i.reimbursement).toFixed(2), gross(i).toFixed(2), run.pay_date,
      run.period_month.slice(0, 7), i.note ?? ""].map(csv).join(",");
  });
  const body = [header.join(","), ...lines].join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="stagity-payroll-${run.period_month.slice(0, 7)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
