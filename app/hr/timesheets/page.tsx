import Link from "next/link";
import { requireHr } from "@/lib/i9/server";
import { addMonths, deadlineFor, monthEnd, monthLabel, monthStart, payDateFor, periodLabel, todayCT } from "@/lib/portal/dates";
import { expectedPeriods, missingPeriods, monthOverview } from "@/lib/portal/timesheets";
import HrNav from "../HrNav";
import { RemindButton } from "./forms";

export default async function HrTimesheets({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const hr = await requireHr();
  const q = (await searchParams).month;
  const today = todayCT();
  // Until payroll on the 20th, default to last month (the one being collected).
  const defaultMonth = Number(today.slice(8)) <= 20 ? addMonths(today, -1) : monthStart(today);
  const month = q && /^\d{4}-\d{2}$/.test(q) ? `${q}-01` : defaultMonth;
  const { periods, consultants, sheet } = await monthOverview(month);
  const deadline = deadlineFor(month);
  const pastDeadline = today > deadline;
  const ym = (m: string) => m.slice(0, 7);

  return (
    <section className="container i9-page">
      <HrNav active="/hr/timesheets" email={hr} />
      <div className="hero-row" style={{ alignItems: "flex-end" }}>
        <div>
          <h1 className="h2">Timesheets: {monthLabel(month)}</h1>
          <p className="muted">Due {deadline} · late is accepted until payroll on {payDateFor(month)}</p>
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
              {periods.map((x) => <th key={x.start}>{periodLabel(x)}</th>)}
              <th>Month</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {consultants.map((p) => {
              const owed = expectedPeriods(p, month);
              const owedSet = new Set(owed.map((x) => x.start));
              const missing = missingPeriods(p, month, sheet);
              const approved = owed.filter((x) => sheet(p.id, x.start)?.status === "approved").length;
              const complete = monthEnd(month) < today && approved === owed.length;
              return (
                <tr key={p.id}>
                  <td><Link href={`/hr/people/${p.id}`}>{p.last_name}, {p.first_name}</Link><div className="muted i9-small">{p.client_name ?? ""}</div></td>
                  {periods.map((x) => {
                    const s = sheet(p.id, x.start);
                    if (!s) {
                      if (!owedSet.has(x.start)) return <td key={x.start}><span className="muted">—</span></td>;
                      return <td key={x.start}><span className={`i9-dot ${pastDeadline ? "late" : "missing"}`}>{pastDeadline ? "late" : "missing"}</span></td>;
                    }
                    const late = s.submitted_at && todayCT(new Date(s.submitted_at)) > deadline;
                    return (
                      <td key={x.start}>
                        <Link href={`/hr/timesheets/${s.id}`} className={`i9-dot ${s.status}`}>
                          {s.status === "rejected" ? "sent back" : s.status} · {Number(s.total_hours)}h{late ? " · late" : ""}
                        </Link>
                      </td>
                    );
                  })}
                  <td>
                    <span className={`i9-dot ${complete ? "approved" : missing.length && pastDeadline ? "late" : "draft"}`}>
                      {complete ? "complete" : `${approved}/${owed.length} approved`}
                    </span>
                  </td>
                  <td>{missing.length > 0 && p.active ? <RemindButton personId={p.id} month={month} /> : null}</td>
                </tr>
              );
            })}
            {!consultants.length && <tr><td colSpan={periods.length + 3} className="muted">No consultants for this month.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted i9-small">
        Weeks that cross into a new month are split, so each month can be completed on its own. Every weekday must be filled in (0 for
        holidays). When a consultant&apos;s month is complete (all periods approved), their vendor invoice is sent automatically, and the
        hours go on that month&apos;s payroll.
      </p>
      <p className="muted i9-small">
        Automatic reminders (one email a day at most): every Tuesday for last week (Sun–Sat), then Wednesday–Friday if it&apos;s still
        missing; and every 2 days for anything missing from last month (deadline the 5th) until it&apos;s in. HR gets a summary on the 6th.
      </p>
    </section>
  );
}
