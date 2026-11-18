import Link from "next/link";
import { requireHr } from "@/lib/i9/server";
import { addDays, addMonths, deadlineFor, monthLabel, monthStart, payDateFor, shortDate, todayCT } from "@/lib/portal/dates";
import { expectedWeeks, missingWeeks, monthOverview } from "@/lib/portal/timesheets";
import HrNav from "../HrNav";
import { RemindButton } from "./forms";

export default async function HrTimesheets({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const hr = await requireHr();
  const q = (await searchParams).month;
  const today = todayCT();
  const defaultMonth = Number(today.slice(8)) <= 5 ? addMonths(today, -1) : monthStart(today);
  const month = q && /^\d{4}-\d{2}$/.test(q) ? `${q}-01` : defaultMonth;
  const { weeks, consultants, sheet } = await monthOverview(month);
  const deadline = deadlineFor(month);
  const ym = (m: string) => m.slice(0, 7);

  return (
    <section className="container i9-page">
      <HrNav active="/hr/timesheets" email={hr} />
      <div className="hero-row" style={{ alignItems: "flex-end" }}>
        <div>
          <h1 className="h2">Timesheets: {monthLabel(month)}</h1>
          <p className="muted">Due by {deadline} · payroll {payDateFor(month)}</p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-outline" href={`/hr/timesheets?month=${ym(addMonths(month, -1))}`}>← {monthLabel(addMonths(month, -1))}</Link>
          <Link className="btn btn-outline" href={`/hr/timesheets?month=${ym(addMonths(month, 1))}`}>{monthLabel(addMonths(month, 1))} →</Link>
        </div>
      </div>
      <div className="i9-table-wrap">
        <table className="i9-table i9-grid">
          <thead>
            <tr>
              <th>Consultant</th>
              {weeks.map((w) => <th key={w}>{shortDate(w)}–{shortDate(addDays(w, 6))}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {consultants.map((p) => {
              const expected = new Set(expectedWeeks(p, month));
              const missing = missingWeeks(p, month, sheet);
              return (
                <tr key={p.id}>
                  <td><Link href={`/hr/people/${p.id}`}>{p.last_name}, {p.first_name}</Link><div className="muted i9-small">{p.client_name ?? ""}</div></td>
                  {weeks.map((w) => {
                    const s = sheet(p.id, w);
                    if (!s) return <td key={w}>{expected.has(w) ? <span className={`i9-dot ${today > deadline ? "late" : "missing"}`}>{today > deadline ? "late" : "missing"}</span> : <span className="muted">—</span>}</td>;
                    const late = s.submitted_at && todayCT(new Date(s.submitted_at)) > deadline;
                    return (
                      <td key={w}>
                        <Link href={`/hr/timesheets/${s.id}`} className={`i9-dot ${s.status}`}>
                          {s.status === "rejected" ? "sent back" : s.status} · {Number(s.total_hours)}h{late ? " · late" : ""}
                        </Link>
                      </td>
                    );
                  })}
                  <td>{missing.length > 0 && p.active ? <RemindButton personId={p.id} month={month} /> : null}</td>
                </tr>
              );
            })}
            {!consultants.length && <tr><td colSpan={weeks.length + 2} className="muted">No consultants for this month.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted i9-small">
        Reminders go out automatically: every Friday, on the 25th, 28th and last day of the month, and on the 1st, 3rd and 5th. HR gets a list of
        anyone still missing on the 6th.
      </p>
    </section>
  );
}
