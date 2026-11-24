import Link from "next/link";
import { db } from "@/lib/i9/server";
import { requirePerson } from "@/lib/portal/server";
import { onboardingSteps } from "@/lib/onboarding/server";
import { addMonths, dayName, deadlineFor, monthLabel, monthStart, payDateFor, periodFor, periodsInMonth, shortDate, submitFrom, todayCT, type Period } from "@/lib/portal/dates";

const rangeLabel = (x: Period) => (x.start === x.end ? `${dayName(x.start)} ${shortDate(x.start)}` : `${dayName(x.start)} ${shortDate(x.start)} – ${dayName(x.end)} ${shortDate(x.end)}`);

const tsLabel: Record<string, string> = { draft: "Draft", submitted: "Waiting for HR", approved: "Approved", rejected: "Not approved" };
const tsClass: Record<string, string> = { draft: "s-invited", submitted: "s-everify_submitted", approved: "s-closed", rejected: "s-section1_complete" };

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ submitted?: string; welcome?: string }> }) {
  const p = await requirePerson();
  const { submitted, welcome } = await searchParams;
  const onboarding = await onboardingSteps(p.id);
  const today = todayCT();
  const { data: i9 } = await db()
    .from("stagity_i9_cases")
    .select("status")
    .eq("person_id", p.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Timesheet periods for this month and last month (newest first), within employment.
  let periods: Period[] = [];
  const sheets = new Map<string, { status: string; total_hours: number; review_note: string | null }>();
  if (p.kind === "consultant") {
    const months = [monthStart(today), addMonths(today, -1)];
    periods = months
      .flatMap((m) => periodsInMonth(m).reverse())
      .filter((x) => x.start <= today && (!p.start_date || x.end >= p.start_date) && (!p.end_date || x.start <= p.end_date));
    const { data } = await db().from("stagity_timesheets").select("week_start, status, total_hours, review_note").eq("person_id", p.id).gte("week_start", months[1]);
    data?.forEach((s) => sheets.set(s.week_start, s));
  }
  // Needs action: past periods (or ones that can be submitted now) that aren't submitted yet.
  const todo = periods
    .filter((x) => submitFrom(x) <= today)
    .filter((x) => { const st = sheets.get(x.start)?.status; return !st || st === "draft" || st === "rejected"; })
    .reverse();
  const byMonth = new Map<string, Period[]>();
  for (const x of periods) byMonth.set(monthStart(x.start), [...(byMonth.get(monthStart(x.start)) ?? []), x]);
  const closingMonth = Number(today.slice(8)) <= 20 ? addMonths(today, -1) : monthStart(today);

  return (
    <section className="container i9-page" style={{ maxWidth: 880 }}>
      <div>
        <h1 className="h2">Hi, {p.first_name}</h1>
      </div>
      {welcome && (
        <p className="form-status ok" role="status">
          ✓ You&apos;re all set up. {p.kind === "consultant" ? "Submit your timesheets below, starting with November." : ""} Click <Link href="/portal/help">Help</Link> any time for the step-by-step guide.
        </p>
      )}
      {submitted && /^\d{4}-\d{2}-\d{2}$/.test(submitted) && (
        <p className="form-status ok" role="status">
          ✓ Your timesheet for {rangeLabel(periodFor(submitted))} was submitted. HR will review it and you&apos;ll get an email when it&apos;s approved.
        </p>
      )}

      {onboarding && !onboarding.complete && (
        <Link href="/portal/onboarding" className="i9-task">
          <strong>Finish your new-hire paperwork</strong>
          <span>{onboarding.done} of {onboarding.total} done · W-4, direct deposit, documents and signatures →</span>
        </Link>
      )}

      {i9?.status === "invited" && (
        <Link href="/portal/i9" className="i9-task">
          <strong>Complete your Form I-9</strong>
          <span className="muted">Required before your first day of work. About 10 minutes.</span>
        </Link>
      )}

      {p.kind === "consultant" && (
        <>
          <div className={`ts-todo ${todo.length ? "" : "done"}`}>
            <div>
              <h2 className="i9-h3">{todo.length ? `${todo.length} timesheet${todo.length === 1 ? "" : "s"} to submit` : "You're all caught up"}</h2>
              <p className="muted i9-small">
                {monthLabel(closingMonth)} timesheets are due by <strong>{shortDate(deadlineFor(closingMonth))}</strong> (payroll {shortDate(payDateFor(closingMonth))}).
              </p>
            </div>
            {todo.map((x) => {
              const s = sheets.get(x.start);
              return (
                <Link key={x.start} href={`/portal/timesheets/${x.start}`} className="ts-todo-row">
                  <span>
                    <strong>{rangeLabel(x)}</strong>
                    {s?.status === "rejected" ? (
                      <span className="ts-reason">Not approved: {s.review_note || "please fix and resubmit"}</span>
                    ) : (
                      <span className="muted i9-small">{s?.status === "draft" ? "Draft saved, not submitted" : "Not started"}</span>
                    )}
                  </span>
                  <span className="btn btn-primary ts-cta">{s?.status === "rejected" ? "Fix & resubmit" : s?.status === "draft" ? "Continue" : "Fill timesheet"}</span>
                </Link>
              );
            })}
          </div>

          {[...byMonth].map(([m, list]) => {
            const approved = list.filter((x) => sheets.get(x.start)?.status === "approved").length;
            return (
              <div key={m} className="i9-card ts-month">
                <div className="ts-month-head">
                  <h2 className="i9-h3">{monthLabel(m)}</h2>
                  <span className="muted i9-small">{approved} of {list.length} approved</span>
                </div>
                <div className="ts-list">
                  {list.map((x) => {
                    const s = sheets.get(x.start);
                    const status = s?.status ?? "missing";
                    return (
                      <Link key={x.start} href={`/portal/timesheets/${x.start}`} className="ts-row">
                        <span className="ts-row-main">
                          <strong>{rangeLabel(x)}</strong>
                          <span className="muted i9-small">{s ? `${Number(s.total_hours)} hours` : x.start > today ? "" : "No hours entered"}</span>
                        </span>
                        <span className={`i9-badge ${tsClass[status] ?? "s-cancelled"}`}>{tsLabel[status] ?? "Not started"}</span>
                        <span className="ts-chev" aria-hidden="true">›</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="muted i9-small">
            Weeks run Sunday to Saturday. Weeks that cross into a new month are split, so each month can be finished on its own.{" "}
            <Link href="/portal/help">How to submit your timesheet →</Link>
          </p>
        </>
      )}
    </section>
  );
}
