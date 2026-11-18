import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { addMonths, deadlineFor, monthEnd, monthLabel, monthStart, payDateFor, periodLabel, shortDate, todayCT } from "@/lib/portal/dates";
import { expectedPeriods, missingPeriods, monthOverview } from "@/lib/portal/timesheets";
import HrNav from "../HrNav";
import { RemindAllButton, RemindButton } from "./forms";

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

  // When each consultant was last reminded (automatic or by you).
  const { data: logs } = await db()
    .from("stagity_reminder_log")
    .select("person_id, sent_on")
    .in("person_id", consultants.length ? consultants.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("sent_on", { ascending: false });
  const lastReminded = new Map<string, string>();
  for (const l of logs ?? []) if (l.person_id && !lastReminded.has(l.person_id)) lastReminded.set(l.person_id, l.sent_on);

  const rows = consultants.map((p) => {
    const owed = expectedPeriods(p, month);
    const missing = missingPeriods(p, month, sheet);
    const approved = owed.filter((x) => sheet(p.id, x.start)?.status === "approved").length;
    return { p, owed, missing, approved, complete: monthEnd(month) < today && approved === owed.length };
  });
  const needReminder = rows.filter((r) => r.p.active && r.missing.length);
  const completeCount = rows.filter((r) => r.complete).length;

  return (
    <section className="container hr-page">
      <HrNav active="/hr/timesheets" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">Timesheets · {monthLabel(month)}</h1>
          <p className="muted">
            Due <strong>{shortDate(deadline)}</strong> · late accepted until payroll on <strong>{shortDate(payDateFor(month))}</strong>
          </p>
        </div>
        <div className="hr-month-nav">
          <Link className="btn btn-outline hr-btn-sm" href={`/hr/timesheets?month=${ym(addMonths(month, -1))}`} aria-label="Previous month">←</Link>
          <span className="hr-month-name">{monthLabel(month)}</span>
          <Link className="btn btn-outline hr-btn-sm" href={`/hr/timesheets?month=${ym(addMonths(month, 1))}`} aria-label="Next month">→</Link>
        </div>
      </div>

      <div className="hr-summary">
        <div><span className="hr-sum-n">{consultants.length}</span><span className="muted i9-small">consultants</span></div>
        <div><span className="hr-sum-n" style={{ color: "#15803d" }}>{completeCount}</span><span className="muted i9-small">month complete</span></div>
        <div><span className="hr-sum-n" style={{ color: needReminder.length ? "#b45309" : undefined }}>{needReminder.length}</span><span className="muted i9-small">missing timesheets</span></div>
        <div className="hr-sum-action">
          <RemindAllButton month={month} monthName={monthLabel(month)} people={needReminder.map((r) => ({ name: `${r.p.first_name} ${r.p.last_name}`, count: r.missing.length }))} />
        </div>
      </div>

      <div className="i9-table-wrap">
        <table className="i9-table i9-grid">
          <thead>
            <tr>
              <th>Consultant</th>
              {periods.map((x) => <th key={x.start}>{periodLabel(x)}</th>)}
              <th>Month</th>
              <th>Reminder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, owed, missing, approved, complete }) => {
              const owedSet = new Set(owed.map((x) => x.start));
              const last = lastReminded.get(p.id);
              return (
                <tr key={p.id}>
                  <td><Link href={`/hr/people/${p.id}`}><strong>{p.first_name} {p.last_name}</strong></Link><div className="muted i9-small">{p.client_name ?? ""}</div></td>
                  {periods.map((x) => {
                    const s = sheet(p.id, x.start);
                    if (!s) {
                      if (!owedSet.has(x.start)) return <td key={x.start}><span className="muted">—</span></td>;
                      return <td key={x.start}><span className={`i9-dot ${pastDeadline ? "late" : "missing"}`}>{pastDeadline ? "late" : "missing"}</span></td>;
                    }
                    const late = s.submitted_at && todayCT(new Date(s.submitted_at)) > deadline;
                    const label = s.status === "submitted" ? "review" : s.status === "rejected" ? "rejected" : s.status;
                    return (
                      <td key={x.start}>
                        <Link href={`/hr/timesheets/${s.id}`} className={`i9-dot ${s.status}`}>
                          {label} · {Number(s.total_hours)}h{late ? " · late" : ""}
                        </Link>
                      </td>
                    );
                  })}
                  <td>
                    <span className={`i9-dot ${complete ? "approved" : missing.length && pastDeadline ? "late" : "draft"}`}>
                      {complete ? "complete" : `${approved}/${owed.length} approved`}
                    </span>
                  </td>
                  <td>
                    <div className="hr-remind-cell">
                      {missing.length > 0 && p.active ? (
                        <RemindButton
                          personId={p.id}
                          month={month}
                          name={`${p.first_name} ${p.last_name}`}
                          email={p.email}
                          missing={missing.map(periodLabel)}
                          monthName={monthLabel(month)}
                          remindedToday={last === today}
                        />
                      ) : (
                        <span className="muted i9-small">{complete ? "All in" : "Nothing missing"}</span>
                      )}
                      <span className="muted i9-small">{last ? `Last reminded ${last === today ? "today" : shortDate(last)}` : "Not reminded yet"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!consultants.length && <tr><td colSpan={periods.length + 3} className="muted">No consultants for this month.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="hr-panel hr-info">
        <h2 className="i9-h3">Automatic reminders</h2>
        <ul className="hr-info-list">
          <li><strong>Every Tuesday:</strong> consultants are asked to submit last week (Sun–Sat), with the approved screenshot.</li>
          <li><strong>Wednesday–Friday:</strong> a daily reminder if last week still isn&apos;t submitted.</li>
          <li><strong>From the 1st, every 2 days:</strong> anyone missing last month&apos;s timesheets, until they&apos;re in (due the 5th).</li>
          <li>At most one email per consultant per day, sent from timesheets@. You get a summary on the 6th.</li>
        </ul>
      </div>
    </section>
  );
}
