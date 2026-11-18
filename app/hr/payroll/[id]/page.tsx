import Link from "next/link";
import { notFound } from "next/navigation";
import { db, requireHr } from "@/lib/i9/server";
import { deadlineFor, money, monthLabel, round2 } from "@/lib/portal/dates";
import { gross } from "@/lib/portal/payroll";
import HrNav from "../../HrNav";
import { lockRun, recalculate } from "../actions";
import { ItemEditor } from "../forms";

export default async function PayrollRun({ params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: run } = await db().from("stagity_payroll_runs").select("*").eq("id", id).maybeSingle();
  if (!run) notFound();
  const { data: items } = await db()
    .from("stagity_payroll_items")
    .select("*, stagity_people(id, first_name, last_name, adp_employee_id)")
    .eq("run_id", id);
  const rows = (items ?? [])
    .map((i) => ({ ...i, p: i.stagity_people as { id: string; first_name: string; last_name: string; adp_employee_id: string | null } }))
    .sort((a, b) => a.p.last_name.localeCompare(b.p.last_name));
  const draft = run.status === "draft";
  const total = round2(rows.reduce((a, i) => a + gross(i), 0));
  const reimb = round2(rows.reduce((a, i) => a + Number(i.reimbursement), 0));
  const missingAdp = rows.filter((r) => !r.p.adp_employee_id);

  return (
    <section className="container hr-page">
      <HrNav active="/hr/payroll" email={hr} />
      <div className="hero-row" style={{ alignItems: "flex-end" }}>
        <div>
          <p><Link href="/hr/payroll">← Payroll</Link></p>
          <h1 className="h2">Payroll: {monthLabel(run.period_month)}</h1>
          <p className="muted">Pay date {run.pay_date} · timesheet deadline {deadlineFor(run.period_month)} · {draft ? "Draft" : `Locked by ${run.locked_by}`}</p>
        </div>
        <a className="btn btn-primary" href={`/hr/payroll/${id}/export`}>Download ADP RUN file</a>
      </div>

      {missingAdp.length > 0 && (
        <p className="form-status err">Add an ADP employee ID for: {missingAdp.map((r) => `${r.p.first_name} ${r.p.last_name}`).join(", ")} (People page).</p>
      )}
      {rows.some((r) => !Number(r.rate)) && (
        <p className="form-status err">
          No pay rate for: {rows.filter((r) => !Number(r.rate)).map((r) => `${r.p.first_name} ${r.p.last_name}`).join(", ")}. Add them to their vendor with a pay rate (Vendors page), then recalculate.
        </p>
      )}

      <div className="i9-table-wrap">
        <table className="i9-table">
          <thead>
            <tr><th>Consultant</th><th className="i9-num">Regular h</th><th className="i9-num">OT h</th><th className="i9-num">Rate</th><th className="i9-num">Gross</th><th>{draft ? "Bonus · Reimbursement · Note" : "Reimb. / note"}</th></tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/hr/people/${i.p.id}`}>{i.p.last_name}, {i.p.first_name}</Link><div className="muted i9-small">ADP ID {i.p.adp_employee_id ?? "—"}</div></td>
                <td className="i9-num">{Number(i.regular_hours)}</td>
                <td className="i9-num">{Number(i.overtime_hours)}</td>
                <td className="i9-num">{money(Number(i.rate))}</td>
                <td className="i9-num"><strong>{money(gross(i))}</strong>{Number(i.bonus) > 0 && <div className="i9-small muted">incl. {money(Number(i.bonus))} bonus</div>}</td>
                <td>
                  {draft ? (
                    <ItemEditor id={i.id} bonus={Number(i.bonus)} reimbursement={Number(i.reimbursement)} note={i.note ?? ""} />
                  ) : (
                    <span className="i9-small">{Number(i.reimbursement) ? money(Number(i.reimbursement)) : ""} {i.note ?? ""}</span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">No approved hours for this period yet.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td><strong>Total</strong></td><td className="i9-num">{round2(rows.reduce((a, i) => a + Number(i.regular_hours), 0))}</td><td className="i9-num">{round2(rows.reduce((a, i) => a + Number(i.overtime_hours), 0))}</td><td></td><td className="i9-num"><strong>{money(total)}</strong></td><td className="i9-small">+ {money(reimb)} reimbursements</td></tr></tfoot>
          )}
        </table>
      </div>
      <p className="muted i9-small">Gross = regular hours × rate + overtime hours × rate × 1.5 + bonus. ADP RUN calculates taxes, deductions and net pay.</p>

      {draft && (
        <div className="form-card">
          <h2 className="i9-h3">Finish</h2>
          <form action={recalculate} className="i9-stack">
            <input type="hidden" name="id" value={id} />
            <p className="muted i9-small">Includes every timesheet approved so far, including late ones. Anything approved after you lock goes on next month&apos;s payroll.</p>
            <button className="btn btn-outline" style={{ alignSelf: "flex-start" }}>Recalculate from timesheets</button>
          </form>
          <form action={lockRun} className="i9-stack">
            <input type="hidden" name="id" value={id} />
            <p className="muted i9-small">Locking marks these hours as paid so they can&apos;t be paid twice. Do this once the numbers are final.</p>
            <button className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Lock payroll</button>
          </form>
        </div>
      )}
    </section>
  );
}
