import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { addMonths, monthLabel, monthStart, todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import { NewRunForm } from "./forms";

export default async function Payroll() {
  const hr = await requireHr();
  const { data: runs } = await db().from("stagity_payroll_runs").select("*").order("period_month", { ascending: false });
  const last = addMonths(monthStart(todayCT()), -1).slice(0, 7);
  return (
    <section className="container i9-page">
      <HrNav active="/hr/payroll" email={hr} />
      <h1 className="h2">Payroll</h1>
      <p className="muted">
        Each month&apos;s approved timesheets (due by the 5th) are paid on the 20th of the next month (the Friday before if the 20th is a weekend). The final ADP sheet is emailed to you the morning of the business day before payroll. Calculate the payroll, add any bonuses
        or reimbursements, lock it, then download the file and import it into ADP RUN.
      </p>
      <NewRunForm defaultMonth={last} />
      <div className="i9-table-wrap">
        <table className="i9-table">
          <thead><tr><th>Month worked</th><th>Pay date</th><th>Status</th></tr></thead>
          <tbody>
            {runs?.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/hr/payroll/${r.id}`}>{monthLabel(r.period_month)}</Link></td>
                <td>{r.pay_date}</td>
                <td><span className={`i9-badge ${r.status === "locked" ? "s-closed" : "s-section1_complete"}`}>{r.status === "locked" ? "Locked" : "Draft"}</span></td>
              </tr>
            ))}
            {!runs?.length && <tr><td colSpan={3} className="muted">No payroll runs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
