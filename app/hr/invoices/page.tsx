import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { autoSendEnabled, periodCompleteness } from "@/lib/invoices/server";
import { addMonths, money, monthEnd, monthLabel, monthStart, shortDate, todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import { refreshDrafts, setAutoSend } from "./actions";
import { RunAutomationButton, SendButton } from "./forms";

type Row = {
  id: string; number: string; status: string; period_start: string; period_end: string; total: number; regular_hours: number;
  overtime_hours: number; due_date: string | null; sent_at: string | null; paid_at: string | null; person_id: string;
  stagity_people: { first_name: string; last_name: string; client_name: string | null };
  stagity_vendors: { name: string };
};

const shortMonth = (m: string) => new Date(m + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function Invoices() {
  const hr = await requireHr();
  const today = todayCT();
  const [{ data }, { data: consultants }] = await Promise.all([
    db()
      .from("stagity_invoices")
      .select("id, number, status, period_start, period_end, total, regular_hours, overtime_hours, due_date, sent_at, paid_at, person_id, stagity_people(first_name, last_name, client_name), stagity_vendors(name)")
      .neq("status", "void")
      .order("period_start", { ascending: false })
      .limit(500),
    db()
      .from("stagity_people")
      .select("id, first_name, last_name, active, start_date, end_date, vendor_id, stagity_vendors(name)")
      .eq("kind", "consultant")
      .order("last_name"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const drafts = rows.filter((r) => r.status === "draft");
  const sent = rows.filter((r) => r.status === "sent");
  const paid = rows.filter((r) => r.status === "paid").slice(0, 30);
  const complete = await Promise.all(drafts.map((d) => periodCompleteness(d)));
  const awaiting = sent.reduce((a, r) => a + Number(r.total), 0);
  const overdue = sent.filter((r) => r.due_date && r.due_date < today);

  // ---- By month: which consultant was invoiced for which month ----
  const thisMonth = monthStart(today);
  const months = [-3, -2, -1, 0].map((n) => addMonths(thisMonth, n));
  const overlaps = (r: Row, m: string) => r.period_start <= monthEnd(m) && r.period_end >= m;
  const people = (consultants ?? []).filter((p) => p.active || rows.some((r) => r.person_id === p.id));
  type Cell = { kind: "sent" | "paid" | "draft" | "missing" | "progress" | "na"; invoices: Row[] };
  const cellFor = (p: (typeof people)[number], m: string): Cell => {
    const employed = (!p.start_date || p.start_date <= monthEnd(m)) && (!p.end_date || p.end_date >= m);
    const invs = rows.filter((r) => r.person_id === p.id && overlaps(r, m));
    const done = invs.filter((r) => r.status !== "draft");
    if (done.length) return { kind: done.every((r) => r.status === "paid") ? "paid" : "sent", invoices: done };
    if (!employed) return { kind: "na", invoices: [] };
    if (monthEnd(m) >= today) return { kind: "progress", invoices: invs };
    if (invs.length) return { kind: "draft", invoices: invs };
    return { kind: "missing", invoices: [] };
  };
  const grid = people.map((p) => ({ p, cells: months.map((m) => cellFor(p, m)) }));
  const notInvoiced = grid.reduce((a, g) => a + g.cells.filter((c) => c.kind === "missing" || c.kind === "draft").length, 0);

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
  const periodText = (r: Row) => {
    const full = r.period_start.endsWith("-01") && r.period_end === monthEnd(r.period_start);
    return full ? monthLabel(r.period_start) : `${shortDate(r.period_start)} – ${shortDate(r.period_end)}`;
  };

  return (
    <section className="container hr-page">
      <HrNav active="/hr/invoices" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">Vendor invoices</h1>
          <p className="muted">Sent from accounts@stagitysolutions.com with the PDF and approved timesheets. Each invoice is sent only once.</p>
        </div>
        <div className="btn-row" style={{ alignItems: "flex-start" }}>
          <form action={refreshDrafts}><button className="btn btn-outline hr-btn-sm">Refresh drafts</button></form>
          <RunAutomationButton />
        </div>
      </div>

      <div className={`hr-auto ${auto ? "on" : ""}`}>
        <span>
          <strong>Automatic sending is {auto ? "on" : "off"}.</strong>{" "}
          {auto ? "Each morning, any invoice whose month is over and fully approved is sent to the vendor." : "Drafts wait for you to click Approve & send."}
        </span>
        <form action={setAutoSend}>
          <input type="hidden" name="on" value={auto ? "false" : "true"} />
          <button className="btn btn-outline hr-btn-xs">{auto ? "Turn off" : "Turn on"}</button>
        </form>
      </div>

      {missingSetup.size > 0 && (
        <div className="hr-notice">
          Approved hours can&apos;t be invoiced. Add these consultants to a vendor with a bill rate: {[...missingSetup].map(([id, n], i) => <span key={id}>{i ? ", " : ""}<Link href={`/hr/people/${id}`}>{n}</Link></span>)}.
        </div>
      )}

      <div className="hr-summary hr-summary-4">
        <div><span className="hr-sum-n" style={{ color: notInvoiced ? "#b91c1c" : undefined }}>{notInvoiced}</span><span className="muted i9-small">Months not invoiced</span></div>
        <div><span className="hr-sum-n">{drafts.length}</span><span className="muted i9-small">Drafts to review</span></div>
        <div><span className="hr-sum-n">{money(awaiting)}</span><span className="muted i9-small">Awaiting payment ({sent.length} sent)</span></div>
        <div><span className="hr-sum-n" style={{ color: overdue.length ? "#b91c1c" : undefined }}>{overdue.length}</span><span className="muted i9-small">Overdue</span></div>
      </div>

      {/* By month */}
      <div className="hr-panel">
        <div className="hr-panel-head">
          <h2 className="i9-h3">By month</h2>
          <span className="muted i9-small">Which consultants were invoiced for each month</span>
        </div>
        <div className="i9-table-wrap">
          <table className="i9-table inv-grid">
            <thead>
              <tr>
                <th>Consultant</th>
                {months.map((m) => <th key={m}>{shortMonth(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.map(({ p, cells }) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/hr/people/${p.id}`}><strong>{p.first_name} {p.last_name}</strong></Link>
                    <div className="muted i9-small">{(p.stagity_vendors as unknown as { name: string } | null)?.name ?? "No vendor"}</div>
                  </td>
                  {cells.map((c, i) => (
                    <td key={months[i]}>
                      {c.kind === "sent" || c.kind === "paid" ? (
                        c.invoices.map((r) => (
                          <Link key={r.id} href={`/hr/invoices/${r.id}`} className={`inv-cell ${r.status}`}>
                            <strong>{money(Number(r.total))}</strong>
                            <span>#{r.number} · {r.status === "paid" ? "Paid" : r.due_date && r.due_date < today ? "Overdue" : "Sent"}</span>
                          </Link>
                        ))
                      ) : c.kind === "draft" ? (
                        <Link href={`/hr/invoices/${c.invoices[0].id}`} className="inv-cell draft">
                          <strong>{money(Number(c.invoices[0].total))}</strong>
                          <span>Draft · not sent</span>
                        </Link>
                      ) : c.kind === "missing" ? (
                        <Link href={`/hr/timesheets?month=${months[i].slice(0, 7)}`} className="inv-cell missing">
                          <strong>Not invoiced</strong>
                          <span>Check timesheets</span>
                        </Link>
                      ) : c.kind === "progress" ? (
                        <span className="inv-cell progress"><strong>In progress</strong><span>{c.invoices.length ? `Draft ${money(Number(c.invoices[0].total))}` : "Month not over"}</span></span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {!grid.length && <tr><td colSpan={months.length + 1} className="muted">No consultants yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted i9-small">“Not invoiced” means the month is over and nothing was sent for that consultant, usually because timesheets aren&apos;t all approved yet.</p>
      </div>

      {/* Drafts */}
      <div className="hr-panel">
        <h2 className="i9-h3">Drafts</h2>
        <div className="i9-table-wrap">
          <table className="i9-table">
            <thead><tr><th>Consultant</th><th>Month</th><th className="i9-num">Hours</th><th className="i9-num">Amount</th><th>Timesheets</th><th></th></tr></thead>
            <tbody>
              {drafts.map((r, i) => (
                <tr key={r.id}>
                  <td><Link href={`/hr/invoices/${r.id}`}><strong>{name(r)}</strong></Link><div className="muted i9-small">{r.stagity_vendors.name}</div></td>
                  <td>{periodText(r)}</td>
                  <td className="i9-num">{Number(r.regular_hours) + Number(r.overtime_hours)}</td>
                  <td className="i9-num"><strong>{money(Number(r.total))}</strong></td>
                  <td>
                    <span className={`i9-dot ${complete[i].complete ? "approved" : "draft"}`}>
                      {complete[i].approved}/{complete[i].expected} weeks approved{complete[i].complete ? " · ready" : ""}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row" style={{ alignItems: "flex-start", justifyContent: "flex-end" }}>
                      <a className="btn btn-outline hr-btn-xs" href={`/hr/invoices/${r.id}/pdf`} target="_blank" rel="noreferrer">Preview</a>
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

      {/* Sent */}
      <div className="hr-panel">
        <h2 className="i9-h3">Sent · awaiting payment</h2>
        <div className="i9-table-wrap">
          <table className="i9-table">
            <thead><tr><th>Invoice</th><th>Consultant</th><th>Month</th><th className="i9-num">Amount</th><th>Sent</th><th>Expected by</th></tr></thead>
            <tbody>
              {sent.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/hr/invoices/${r.id}`}><strong>#{r.number}</strong></Link></td>
                  <td>{name(r)}<div className="muted i9-small">{r.stagity_vendors.name}</div></td>
                  <td>{periodText(r)}</td>
                  <td className="i9-num"><strong>{money(Number(r.total))}</strong></td>
                  <td>{r.sent_at ? shortDate(todayCT(new Date(r.sent_at))) : "—"}</td>
                  <td>{r.due_date && r.due_date < today ? <span className="i9-dot late">overdue · {shortDate(r.due_date)}</span> : r.due_date ? shortDate(r.due_date) : "—"}</td>
                </tr>
              ))}
              {!sent.length && <tr><td colSpan={6} className="muted">Nothing awaiting payment.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {paid.length > 0 && (
        <details className="hr-panel">
          <summary className="i9-h3" style={{ cursor: "pointer" }}>Paid (latest {paid.length})</summary>
          <div className="i9-table-wrap" style={{ marginTop: 12 }}>
            <table className="i9-table">
              <thead><tr><th>Invoice</th><th>Consultant</th><th>Month</th><th className="i9-num">Amount</th><th>Paid on</th></tr></thead>
              <tbody>
                {paid.map((r) => (
                  <tr key={r.id}><td><Link href={`/hr/invoices/${r.id}`}>#{r.number}</Link></td><td>{name(r)}</td><td>{periodText(r)}</td><td className="i9-num">{money(Number(r.total))}</td><td>{r.paid_at ? shortDate(r.paid_at) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
