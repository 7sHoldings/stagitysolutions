import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { autoSendEnabled, periodCompleteness } from "@/lib/invoices/server";
import { money, shortDate, todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import { refreshDrafts, setAutoSend } from "./actions";
import { SendButton } from "./forms";

type Row = {
  id: string; number: string; status: string; period_start: string; period_end: string; total: number; regular_hours: number;
  overtime_hours: number; due_date: string | null; sent_at: string | null; paid_at: string | null; person_id: string;
  stagity_people: { first_name: string; last_name: string; client_name: string | null };
  stagity_vendors: { name: string };
};

export default async function Invoices() {
  const hr = await requireHr();
  const today = todayCT();
  const { data } = await db()
    .from("stagity_invoices")
    .select("id, number, status, period_start, period_end, total, regular_hours, overtime_hours, due_date, sent_at, paid_at, person_id, stagity_people(first_name, last_name, client_name), stagity_vendors(name)")
    .neq("status", "void")
    .order("period_start", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as unknown as Row[];
  const drafts = rows.filter((r) => r.status === "draft");
  const sent = rows.filter((r) => r.status === "sent");
  const paid = rows.filter((r) => r.status === "paid").slice(0, 30);
  const complete = await Promise.all(drafts.map((d) => periodCompleteness(d)));
  const outstanding = sent.reduce((a, r) => a + Number(r.total), 0);
  const overdue = sent.filter((r) => r.due_date && r.due_date < today);

  // Approved hours that can't be invoiced because the consultant has no vendor or bill rate.
  const { data: loose } = await db()
    .from("stagity_timesheet_days")
    .select("person_id, stagity_timesheets!inner(status), stagity_people!inner(first_name, last_name, vendor_id, bill_rate)")
    .is("invoice_id", null)
    .gt("hours", 0)
    .eq("stagity_timesheets.status", "approved");
  const missingSetup = new Map<string, string>();
  for (const d of loose ?? []) {
    const p = d.stagity_people as unknown as { first_name: string; last_name: string; vendor_id: string | null; bill_rate: number | null };
    if (!p.vendor_id || p.bill_rate == null) missingSetup.set(d.person_id, `${p.first_name} ${p.last_name}`);
  }
  const auto = await autoSendEnabled();
  const name = (r: Row) => `${r.stagity_people.first_name} ${r.stagity_people.last_name}`;

  return (
    <section className="container i9-page">
      <HrNav active="/hr/invoices" email={hr} />
      <div className="hero-row" style={{ alignItems: "flex-end" }}>
        <div>
          <h1 className="h2">Vendor invoices</h1>
          <p className="muted">Approving a timesheet adds its hours to a draft invoice. Invoices are emailed to the vendor from {process.env.SMTP_USER ?? "your HR email"} with the PDF and the approved timesheets.</p>
        </div>
        <form action={refreshDrafts}><button className="btn btn-outline">Refresh drafts</button></form>
      </div>

      <div className={`form-status ${auto ? "ok" : ""}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: auto ? undefined : "var(--surface)" }}>
        <span>
          <strong>Automatic sending is {auto ? "on" : "off"}.</strong>{" "}
          {auto
            ? "Each morning, any invoice whose period is over and fully approved (e.g. a consultant's whole month) is sent to the vendor automatically."
            : "Drafts wait for you to click Approve & send."}
        </span>
        <form action={setAutoSend}>
          <input type="hidden" name="on" value={auto ? "false" : "true"} />
          <button className="btn btn-outline" style={{ minHeight: 38, padding: "6px 16px", fontSize: 14 }}>{auto ? "Turn off" : "Turn on"}</button>
        </form>
      </div>

      {missingSetup.size > 0 && (
        <p className="form-status err">
          Approved hours not invoiced. Set the vendor and bill rate for: {[...missingSetup].map(([id, n], i) => <span key={id}>{i ? ", " : ""}<Link href={`/hr/people/${id}`}>{n}</Link></span>)}.
        </p>
      )}

      <div className="i9-tiles">
        <div className="i9-tile"><span className="i9-tile-n">{drafts.length}</span><span className="muted">Drafts to review</span></div>
        <div className="i9-tile"><span className="i9-tile-n">{money(outstanding)}</span><span className="muted">Outstanding ({sent.length} sent)</span></div>
        <div className="i9-tile"><span className="i9-tile-n" style={{ color: overdue.length ? "#b91c1c" : undefined }}>{overdue.length}</span><span className="muted">Overdue</span></div>
      </div>

      <div>
        <h2 className="i9-h3" style={{ marginBottom: 12 }}>Drafts</h2>
        <div className="i9-table-wrap">
          <table className="i9-table">
            <thead><tr><th>Consultant · vendor</th><th>Period</th><th className="i9-num">Hours</th><th className="i9-num">Amount</th><th>Timesheets</th><th></th></tr></thead>
            <tbody>
              {drafts.map((r, i) => (
                <tr key={r.id}>
                  <td><Link href={`/hr/invoices/${r.id}`}>{name(r)}</Link><div className="muted i9-small">{r.stagity_vendors.name}</div></td>
                  <td>{shortDate(r.period_start)} – {shortDate(r.period_end)}</td>
                  <td className="i9-num">{Number(r.regular_hours) + Number(r.overtime_hours)}</td>
                  <td className="i9-num"><strong>{money(Number(r.total))}</strong></td>
                  <td>
                    <span className={`i9-dot ${complete[i].complete ? "approved" : "draft"}`}>
                      {complete[i].approved}/{complete[i].expected} weeks{complete[i].complete ? " · complete" : ""}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row" style={{ alignItems: "flex-start" }}>
                      <a className="btn btn-outline" style={{ minHeight: 40, padding: "8px 16px", fontSize: 14.5 }} href={`/hr/invoices/${r.id}/pdf`} target="_blank" rel="noreferrer">Preview</a>
                      <SendButton id={r.id} vendor={r.stagity_vendors.name} total={money(Number(r.total))} />
                    </div>
                  </td>
                </tr>
              ))}
              {!drafts.length && <tr><td colSpan={6} className="muted">No drafts. They appear when you approve timesheets.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="i9-h3" style={{ marginBottom: 12 }}>Sent: awaiting payment</h2>
        <div className="i9-table-wrap">
          <table className="i9-table">
            <thead><tr><th>Invoice</th><th>Consultant · vendor</th><th>Period</th><th className="i9-num">Amount</th><th>Due</th></tr></thead>
            <tbody>
              {sent.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/hr/invoices/${r.id}`}>{r.number}</Link></td>
                  <td>{name(r)}<div className="muted i9-small">{r.stagity_vendors.name}</div></td>
                  <td>{shortDate(r.period_start)} – {shortDate(r.period_end)}</td>
                  <td className="i9-num">{money(Number(r.total))}</td>
                  <td>{r.due_date && r.due_date < today ? <span className="i9-dot late">overdue · {r.due_date}</span> : r.due_date}</td>
                </tr>
              ))}
              {!sent.length && <tr><td colSpan={5} className="muted">Nothing outstanding.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {paid.length > 0 && (
        <details className="i9-card">
          <summary className="i9-h3">Paid (latest {paid.length})</summary>
          <table className="i9-table" style={{ marginTop: 12 }}>
            <tbody>
              {paid.map((r) => (
                <tr key={r.id}><td><Link href={`/hr/invoices/${r.id}`}>{r.number}</Link></td><td>{name(r)}</td><td className="i9-num">{money(Number(r.total))}</td><td>paid {r.paid_at}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <p className="muted i9-small">Vendors (invoice email, weekly or monthly billing) are on the <Link href="/hr/vendors">Vendors</Link> page. Bill rates are set on each consultant&apos;s profile. Invoices bill all hours worked × the bill rate.</p>
    </section>
  );
}
