import Link from "next/link";
import { db } from "@/lib/i9/server";
import { requirePerson } from "@/lib/portal/server";
import { addDays, addMonths, deadlineFor, monthLabel, monthStart, payDateFor, periodLabel, periodsInMonth, todayCT, type Period } from "@/lib/portal/dates";
import { signOutPortal } from "./actions";

const tsLabel: Record<string, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Needs changes" };
const tsClass: Record<string, string> = { draft: "s-invited", submitted: "s-everify_submitted", approved: "s-closed", rejected: "s-section1_complete" };

export default async function PortalHome() {
  const p = await requirePerson();
  const today = todayCT();
  const { data: i9 } = await db()
    .from("stagity_i9_cases")
    .select("status")
    .eq("person_id", p.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Timesheet periods for this month and the two before it (newest first), within employment.
  let periods: Period[] = [];
  const sheets = new Map<string, { status: string; total_hours: number; review_note: string | null }>();
  if (p.kind === "consultant") {
    const months = [monthStart(today), addMonths(today, -1), addMonths(today, -2)];
    periods = months
      .flatMap((m) => periodsInMonth(m).reverse())
      .filter((x) => x.start <= today && (!p.start_date || x.end >= p.start_date) && (!p.end_date || x.start <= p.end_date));
    const { data } = await db().from("stagity_timesheets").select("week_start, status, total_hours, review_note").eq("person_id", p.id).gte("week_start", months[2]);
    data?.forEach((s) => sheets.set(s.week_start, s));
  }
  const closingMonth = Number(today.slice(8)) <= 20 ? addMonths(today, -1) : monthStart(today);

  return (
    <section className="container i9-page" style={{ maxWidth: 880 }}>
      <div className="hero-row" style={{ alignItems: "center" }}>
        <div>
          <p className="eyebrow">Employee portal</p>
          <h1 className="h2">Hi, {p.first_name}</h1>
        </div>
        <form action={signOutPortal} className="i9-signout">
          <Link href="/portal/set-password" className="muted">Change password</Link>
          <button className="btn btn-outline">Sign out</button>
        </form>
      </div>

      {i9?.status === "invited" && (
        <Link href="/portal/i9" className="i9-task">
          <strong>Complete your Form I-9</strong>
          <span className="muted">Required before your first day of work. About 10 minutes.</span>
        </Link>
      )}

      {p.kind === "consultant" && (
        <div className="i9-card">
          <h2 className="i9-h3">Weekly timesheets</h2>
          <p className="muted i9-small">
            Each week, enter your hours for every weekday (0 for holidays or days off) and upload the timesheet your client approved.
            Weeks that cross into a new month are split, so each month can be finished on its own. {monthLabel(closingMonth)} timesheets
            are due by <strong>{deadlineFor(closingMonth)}</strong> and must be in before payroll on {payDateFor(closingMonth)}.
          </p>
          <div className="i9-weeks">
            {periods.map((x) => {
              const w = x.start;
              const s = sheets.get(w);
              const status = s?.status ?? "missing";
              return (
                <Link key={w} href={`/portal/timesheets/${w}`} className="i9-week">
                  <span>
                    <strong>{periodLabel(x)}</strong>
                    {s?.status === "rejected" && s.review_note && <span className="i9-small muted"> · {s.review_note}</span>}
                  </span>
                  <span className="i9-week-right">
                    {s ? <span className="i9-small muted">{Number(s.total_hours)} h</span> : null}
                    <span className={`i9-badge ${tsClass[status] ?? "s-cancelled"}`}>{tsLabel[status] ?? "Not started"}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
