import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { autoSendEnabled, periodCompleteness } from "@/lib/invoices/server";
import { addMonths, money, monthEnd, monthLabel, monthStart, shortDate, todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import MonthPicker from "../MonthPicker";
import { refreshDrafts, setAutoSend } from "./actions";
import { MarkPaidButton, RunAutomationButton, SendButton } from "./forms";

type Row = {
  id: string; number: string; status: string; period_start: string; period_end: string; total: number; regular_hours: number;
  overtime_hours: number; due_date: string | null; sent_at: string | null; paid_at: string | null; person_id: string;
  stagity_people: { first_name: string; last_name: string; client_name: string | null };
  stagity_vendors: { name: string };
};


export default async function Invoices({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const hr = await requireHr();
  const today = todayCT();
  const q = (await searchParams).month;
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

  // ---- One month at a time: was each consultant invoiced? ----
  const thisMonth = monthStart(today);
  const month = q && /^\d{4}-\d{2}$/.test(q) ? `${q}-01` : addMonths(thisMonth, -1); // default: last month
  const overlaps = (r: Row, m: string) => r.period_start <= monthEnd(m) && r.period_end >= m;
  type Status = "paid" | "sent" | "overdue" | "draft" | "missing" | "progress";
  const people = (consultants ?? []).filter((p) => {
    const employed = (!p.start_date || p.start_date <= monthEnd(month)) && (!p.end_date || p.end_date >= month);
    return (employed && p.active) || rows.some((r) => r.person_id === p.id && overlaps(r, month));
  });
  const list = people.map((p) => {
    const invs = rows.filter((r) => r.person_id === p.id && overlaps(r, month));
    const done = invs.filter((r) => r.status !== "draft");
    const draft = invs.find((r) => r.status === "draft") ?? null;
    let status: Status;
    if (done.length) status = done.every((r) => r.status === "paid") ? "paid" : done.some((r) => r.status === "sent" && r.due_date && r.due_date < today) ? "overdue" : "sent";
    else if (monthEnd(month) >= today) status = "progress";
    else status = draft ? "draft" : "missing";
    return { p, done, draft, status };
  });
  const order: Record<Status, number> = { missing: 0, draft: 1, overdue: 2, sent: 3, progress: 4, paid: 5 };
  list.sort((a, b) => order[a.status] - order[b.status] || a.p.last_name.localeCompare(b.p.last_name));
  const monthNotInvoiced = list.filter((x) => x.status === "missing" || x.status === "draft").length;
  const monthTotal = list.reduce((a, x) => a + x.done.reduce((t, r) => t + Number(r.total), 0), 0);
  const ym = (m: string) => m.slice(0, 7);

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
        <div><span className="hr-sum-n" style={{ color: monthNotInvoiced ? "#b91c1c" : undefined }}>{monthNotInvoiced}</span><span className="muted i9-small">Not invoiced in {monthLabel(month)}</span></div>
        <div><span className="hr-sum-n">{drafts.length}</span><span className="muted i9-small">Drafts to review</span></div>
        <div><span className="hr-sum-n">{money(awaiting)}</span><span className="muted i9-small">Awaiting payment ({sent.length} sent)</span></div>
        <div><span className="hr-sum-n" style={{ color: overdue.length ? "#b91c1c" : undefined }}>{overdue.length}</span><span className="muted i9-small">Overdue</span></div>
      </div>

      {/* One month at a time */}
      <div className="hr-panel">
        <div className="inv-month-head">
          <div>
            <h2 className="i9-h3">Invoices for {monthLabel(month)}</h2>
            <p className="muted i9-small">
              {list.length} consultant{list.length === 1 ? "" : "s"} · {money(monthTotal)} invoiced
              {monthNotInvoiced ? <> · <strong style={{ color: "#b91c1c" }}>{monthNotInvoiced} not invoiced</strong></> : null}
            </p>
          </div>
          <MonthPicker base="/hr/invoices" month={month} current={today} />
        </div>
        <div className="i9-table-wrap">
          <table className="i9-table">
            <thead><tr><th>Consultant</th><th>Vendor</th><th className="i9-num">Hours</th><th className="i9-num">Amount</th><th>Invoice</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map(({ p, done, draft, status }) => {
                const inv = done[0] ?? draft;
                const hours = (done.length ? done : draft ? [draft] : []).reduce((a, r) => a + Number(r.regular_hours) + Number(r.overtime_hours), 0);
                const amount = (done.length ? done : draft ? [draft] : []).reduce((a, r) => a + Number(r.total), 0);
                return (
                  <tr key={p.id}>
                    <td><Link href={`/hr/people/${p.id}`}><strong>{p.first_name} {p.last_name}</strong></Link></td>
                    <td>{(p.stagity_vendors as unknown as { name: string } | null)?.name ?? <span className="muted">No vendor</span>}</td>
                    <td className="i9-num">{inv ? hours : "—"}</td>
                    <td className="i9-num">{inv ? <strong>{money(amount)}</strong> : "—"}</td>
                    <td>{done.length ? done.map((r) => <div key={r.id}><Link href={`/hr/invoices/${r.id}`}>#{r.number}</Link>{r.sent_at ? <span className="muted i9-small"> · sent {shortDate(todayCT(new Date(r.sent_at)))}</span> : null}</div>) : <span className="muted">—</span>}</td>
                    <td><span className={`inv-status ${status}`}>{{ paid: "Paid", sent: "Sent", overdue: "Overdue", draft: "Draft, not sent", missing: "Not invoiced", progress: "In progress" }[status]}</span></td>
                    <td className="hr-td-actions">
                      {status === "missing" ? (
                        <Link className="btn btn-outline hr-btn-xs" href={`/hr/timesheets?month=${ym(month)}`}>Check timesheets</Link>
                      ) : draft && !done.length ? (
                        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                          <a className="btn btn-outline hr-btn-xs" href={`/hr/invoices/${draft.id}/pdf`} target="_blank" rel="noreferrer">Preview</a>
                          {status === "draft" && <SendButton id={draft.id} label="Send" vendor={draft.stagity_vendors.name} total={money(Number(draft.total))} />}
                        </div>
                      ) : inv ? (
                        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                          {done.filter((r) => r.status === "sent").map((r) => (
                            <MarkPaidButton key={r.id} id={r.id} number={r.number} amount={money(Number(r.total))} vendor={r.stagity_vendors.name} today={today} />
                          ))}
                          <Link className="btn btn-outline hr-btn-xs" href={`/hr/invoices/${inv.id}`}>Open</Link>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={7} className="muted">No consultants were working in {monthLabel(month)}.</td></tr>}
            </tbody>
          </table>
        </div>
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
        <p className="muted i9-small">When a vendor pays, click <strong>Mark paid</strong> and enter the date the money arrived.</p>
        <div className="i9-table-wrap">
          <table className="i9-table">
            <thead><tr><th>Invoice</th><th>Consultant</th><th>Month</th><th className="i9-num">Amount</th><th>Sent</th><th>Expected by</th><th></th></tr></thead>
            <tbody>
              {sent.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/hr/invoices/${r.id}`}><strong>#{r.number}</strong></Link></td>
                  <td>{name(r)}<div className="muted i9-small">{r.stagity_vendors.name}</div></td>
                  <td>{periodText(r)}</td>
                  <td className="i9-num"><strong>{money(Number(r.total))}</strong></td>
                  <td>{r.sent_at ? shortDate(todayCT(new Date(r.sent_at))) : "—"}</td>
                  <td>{r.due_date && r.due_date < today ? <span className="i9-dot late">overdue · {shortDate(r.due_date)}</span> : r.due_date ? shortDate(r.due_date) : "—"}</td>
                  <td className="hr-td-actions"><MarkPaidButton id={r.id} number={r.number} amount={money(Number(r.total))} vendor={r.stagity_vendors.name} today={today} /></td>
                </tr>
              ))}
              {!sent.length && <tr><td colSpan={7} className="muted">Nothing awaiting payment.</td></tr>}
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
