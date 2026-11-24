import Link from "next/link";
import { db, i9Configured, requireHr } from "@/lib/i9/server";
import { addMonths, money, deadlineFor, monthLabel, monthStart, payDateFor, todayCT } from "@/lib/portal/dates";
import { missingPeriods, monthOverview } from "@/lib/portal/timesheets";
import HrNav from "./HrNav";

function Tile({ n, label, href }: { n: number | string; label: string; href: string }) {
  return (
    <Link href={href} className="i9-tile">
      <span className="i9-tile-n">{n}</span>
      <span className="muted">{label}</span>
    </Link>
  );
}

export default async function HrHome() {
  const cfg = i9Configured();
  if (!cfg.ok) {
    return (
      <section className="container hero" style={{ maxWidth: 720 }}>
        <h1 className="h2">HR portal isn&apos;t set up yet</h1>
        <p className="lead">Add these environment variables in Vercel, then redeploy: {cfg.missing.join(", ")}.</p>
      </section>
    );
  }
  const hr = await requireHr();
  const today = todayCT();
  const month = Number(today.slice(8)) <= 20 ? addMonths(today, -1) : monthStart(today); // last month is being collected until payroll on the 20th
  const [{ count: i9Review }, { count: i9Waiting }, { count: tsReview }, overview, { data: run }, { count: invDrafts }] = await Promise.all([
    db().from("stagity_i9_cases").select("id", { count: "exact", head: true }).in("status", ["section1_complete", "section2_complete"]),
    db().from("stagity_i9_cases").select("id", { count: "exact", head: true }).eq("status", "invited"),
    db().from("stagity_timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    monthOverview(month),
    db().from("stagity_payroll_runs").select("id, status").eq("period_month", addMonths(monthStart(today), -1)).maybeSingle(),
    db().from("stagity_invoices").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);
  const { data: unpaid } = await db().from("stagity_invoices").select("total, amount_received, adjustment, due_date").eq("status", "sent");
  const leftOf = (r: { total: number; amount_received: number; adjustment: number }) => Number(r.total) - Number(r.amount_received) - Number(r.adjustment);
  const outstanding = (unpaid ?? []).reduce((a, r) => a + leftOf(r), 0);
  const overdueCount = (unpaid ?? []).filter((r) => leftOf(r) > 0 && r.due_date && r.due_date < today).length;
  const missing = overview.consultants.filter((p) => p.active && missingPeriods(p, month, overview.sheet).length > 0).length;
  const payMonth = addMonths(monthStart(today), -1);

  return (
    <section className="container hr-page">
      <HrNav active="/hr" email={hr} />
      <h1 className="h2">Overview</h1>
      <div className="i9-tiles">
        <Tile n={tsReview ?? 0} label="Timesheets to review" href="/hr/timesheets" />
        <Tile n={invDrafts ?? 0} label="Vendor invoices ready to send" href="/hr/invoices" />
        <Tile n={money(outstanding)} label={`Not yet received from vendors${overdueCount ? ` (${overdueCount} overdue)` : ""}`} href="/hr/payments?view=open" />
        <Tile n={missing} label={`Consultants missing ${monthLabel(month)} timesheets (due ${deadlineFor(month)}, payroll ${payDateFor(month)})`} href={`/hr/timesheets?month=${month.slice(0, 7)}`} />
        <Tile n={i9Review ?? 0} label="Form I-9s needing HR action" href="/hr/i9" />
        <Tile n={i9Waiting ?? 0} label="Form I-9s waiting for the employee" href="/hr/i9" />
        <Tile
          n={run ? (run.status === "locked" ? "Locked" : "Draft") : "Not started"}
          label={`${monthLabel(payMonth)} payroll, pays ${payDateFor(payMonth)}`}
          href={run ? `/hr/payroll/${run.id}` : "/hr/payroll"}
        />
      </div>
    </section>
  );
}
