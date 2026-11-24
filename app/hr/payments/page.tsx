import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { addDays, addMonths, money, monthEnd, monthLabel, monthStart, todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import MonthPicker from "../MonthPicker";
import { MarkPaidButton, ShortPayActions } from "../invoices/forms";
import { expectedAmount } from "@/lib/invoices/payments";
import { periodLabel, shortPaymentLines } from "@/lib/invoices/send";
import { TermsButton, UndoReceived } from "./forms";

type Row = {
  id: string; number: string; status: "sent" | "paid"; period_start: string; period_end: string; total: number;
  issue_date: string | null; due_date: string | null; paid_at: string | null;
  amount_received: number; adjustment: number; adjustment_reason: string | null; short_emailed_at: string | null;
  stagity_people: { first_name: string; last_name: string };
  stagity_vendors: { name: string; ap_email: string; cc_emails: string | null; vms_fee_pct: number | null; dispute_days: number | null };
};
type View = "worked" | "due" | "open";

const DAY = 86400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const nice = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");

export default async function Payments({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const hr = await requireHr();
  const q = await searchParams;
  const today = todayCT();
  const view: View = q.view === "due" ? "due" : q.view === "open" ? "open" : "worked";
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? `${q.month}-01` : view === "due" ? monthStart(today) : addMonths(monthStart(today), -1);

  const { data } = await db()
    .from("stagity_invoices")
    .select("id, number, status, period_start, period_end, total, issue_date, due_date, paid_at, amount_received, adjustment, adjustment_reason, short_emailed_at, stagity_people(first_name, last_name), stagity_vendors(name, ap_email, cc_emails, vms_fee_pct, dispute_days)")
    .in("status", ["sent", "paid"])
    .order("due_date", { ascending: true })
    .limit(2000);
  const all = (data ?? []) as unknown as Row[];

  // ---- Totals across everything (not just the selected month) ----
  const open = all.filter((r) => r.status === "sent");
  const overdue = open.filter((r) => r.due_date && r.due_date < today);
  const shortPaid = open.filter((r) => Number(r.amount_received) > 0);
  const soon = open.filter((r) => r.due_date && r.due_date >= today && r.due_date <= addDays(today, 30));
  const { data: monthPays } = await db().from("stagity_invoice_payments").select("amount").gte("received_on", monthStart(today));
  const receivedThisMonthAmt = (monthPays ?? []).reduce((a, p) => a + Number(p.amount), 0);
  // Payments for short-paid invoices (for the email preview).
  const { data: shortPays } = shortPaid.length
    ? await db().from("stagity_invoice_payments").select("invoice_id, amount, received_on").in("invoice_id", shortPaid.map((r) => r.id)).order("received_on")
    : { data: [] as { invoice_id: string; amount: number; received_on: string }[] };
  const left = (r: Row) => (r.status === "paid" ? 0 : Number(r.total) - Number(r.amount_received) - Number(r.adjustment));
  const sum = (rows: Row[]) => rows.reduce((a, r) => a + left(r), 0);
  const sumReceived = (rows: Row[]) => rows.reduce((a, r) => a + Number(r.amount_received), 0);

  // ---- The selected list ----
  const inMonth = (d: string | null) => !!d && d >= month && d <= monthEnd(month);
  const rows =
    view === "open" ? open
    : view === "due" ? all.filter((r) => inMonth(r.due_date))
    : all.filter((r) => r.period_start <= monthEnd(month) && r.period_end >= month);
  rows.sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid") || String(a.due_date).localeCompare(String(b.due_date)));
  const listReceived = sumReceived(rows);
  const listOpen = sum(rows);

  const tab = (v: View, label: string) => (
    <Link href={`/hr/payments?view=${v}${v === "open" ? "" : `&month=${month.slice(0, 7)}`}`} className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined}>{label}</Link>
  );
  const title = view === "open" ? "All unpaid invoices" : view === "due" ? `Payments expected in ${monthLabel(month)}` : `Invoices for work in ${monthLabel(month)}`;

  return (
    <section className="container hr-page">
      <HrNav active="/hr/payments" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">Payments</h1>
          <p className="muted">Track which vendor invoices have been paid into your bank account. Expected date = invoice date + payment terms (e.g. invoice Nov 5 + Net 45 = Dec 20).</p>
        </div>
      </div>

      <div className="hr-summary hr-summary-4">
        <Link href="/hr/payments?view=open" className="pay-sum"><span className="hr-sum-n">{money(sum(open))}</span><span className="muted i9-small">Outstanding ({open.length} invoice{open.length === 1 ? "" : "s"}{shortPaid.length ? `, ${shortPaid.length} short-paid` : ""})</span></Link>
        <Link href="/hr/payments?view=open" className="pay-sum"><span className="hr-sum-n" style={{ color: overdue.length ? "#b91c1c" : undefined }}>{money(sum(overdue))}</span><span className="muted i9-small">Overdue ({overdue.length})</span></Link>
        <div className="pay-sum"><span className="hr-sum-n">{money(sum(soon))}</span><span className="muted i9-small">Expected in the next 30 days ({soon.length})</span></div>
        <div className="pay-sum"><span className="hr-sum-n" style={{ color: "#15803d" }}>{money(receivedThisMonthAmt)}</span><span className="muted i9-small">Received in {monthLabel(monthStart(today))}</span></div>
      </div>

      <div className="hr-panel">
        <div className="inv-month-head">
          <div>
            <h2 className="i9-h3">{title}</h2>
            <p className="muted i9-small">
              {rows.length} invoice{rows.length === 1 ? "" : "s"} · <span style={{ color: "#15803d" }}>{money(listReceived)} received</span> · <strong>{money(listOpen)} not received</strong>
            </p>
          </div>
          {view !== "open" && <MonthPicker base="/hr/payments" month={month} current={today} query={`view=${view}`} />}
        </div>
        <nav className="pay-views" aria-label="Show">
          {tab("worked", "By month worked")}
          {tab("due", "By expected date")}
          {tab("open", "All unpaid")}
        </nav>

        {rows.length ? (
          <div className="i9-table-wrap">
            <table className="i9-table pay-table">
              <thead>
                <tr><th>Consultant · vendor</th><th>Invoice</th><th>Terms</th><th>Expected by</th><th className="i9-num">Amount</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const terms = r.issue_date && r.due_date ? daysBetween(r.issue_date, r.due_date) : null;
                  const late = r.status === "sent" && r.due_date ? daysBetween(r.due_date, today) : 0;
                  const paidLate = r.status === "paid" && r.due_date && r.paid_at ? daysBetween(r.due_date, r.paid_at) : 0;
                  const name = `${r.stagity_people.first_name} ${r.stagity_people.last_name}`;
                  return (
                    <tr key={r.id} className={r.status === "sent" && late > 0 ? "pay-overdue" : ""}>
                      <td className="pay-who"><strong>{name}</strong><div className="muted i9-small">{r.stagity_vendors.name}</div></td>
                      <td data-label="Invoice"><Link href={`/hr/invoices/${r.id}`}>#{r.number}</Link><div className="muted i9-small">{monthLabel(r.period_start)} · sent {nice(r.issue_date)}</div></td>
                      <td data-label="Terms">{terms == null ? "—" : r.status === "sent" && r.issue_date ? <TermsButton id={r.id} issueDate={r.issue_date} days={terms} /> : `Net ${terms}`}</td>
                      <td data-label="Expected by">{nice(r.due_date)}</td>
                      <td className="i9-num pay-amt" data-label="Amount">
                        <strong>{money(Number(r.total))}</strong>
                        {Number(r.amount_received) > 0 && r.status === "sent" && <div className="i9-small" style={{ color: "#15803d" }}>{money(Number(r.amount_received))} received</div>}
                        {r.stagity_vendors.vms_fee_pct ? <div className="muted i9-small">expect {money(expectedAmount(Number(r.total), r.stagity_vendors.vms_fee_pct))} after {Number(r.stagity_vendors.vms_fee_pct)}% VMS fee</div> : null}
                      </td>
                      <td className="pay-status">
                        {r.status === "paid" ? (
                          <>
                            <span className="i9-badge s-closed">✓ Received {nice(r.paid_at)}{paidLate > 0 ? ` (${paidLate} d late)` : ""}</span>
                            {Number(r.adjustment) > 0 && <div className="muted i9-small">{money(Number(r.adjustment))} less: {r.adjustment_reason}</div>}
                          </>
                        ) : Number(r.amount_received) > 0 ? (
                          <>
                            <span className="i9-badge pay-short">Short {money(left(r))}</span>
                            {r.short_emailed_at && <div className="muted i9-small">Vendor emailed {nice(r.short_emailed_at.slice(0, 10))}</div>}
                          </>
                        ) : late > 0 ? (
                          <span className="i9-badge pay-late">Overdue {late} day{late === 1 ? "" : "s"}</span>
                        ) : (
                          <span className="i9-badge s-everify_submitted">{late === 0 ? "Due today" : `Due in ${-late} day${late === -1 ? "" : "s"}`}</span>
                        )}
                      </td>
                      <td className="hr-td-actions pay-act">
                        {r.status === "sent" && Number(r.amount_received) > 0 ? (
                          <ShortPayActions
                            id={r.id}
                            diff={money(left(r))}
                            vendor={r.stagity_vendors.name}
                            to={[r.stagity_vendors.ap_email, r.stagity_vendors.cc_emails].filter(Boolean).join(", ")}
                            emailedAt={r.short_emailed_at}
                            preview={shortPaymentLines({
                              consultant: name, number: r.number, period: periodLabel(r.period_start, r.period_end), total: Number(r.total), received: Number(r.amount_received),
                              payments: (shortPays ?? []).filter((p) => p.invoice_id === r.id),
                            })}
                          />
                        ) : r.status === "sent" ? (
                          <MarkPaidButton id={r.id} number={r.number} amount={money(Number(r.total))} vendor={r.stagity_vendors.name} today={today} remaining={expectedAmount(Number(r.total), r.stagity_vendors.vms_fee_pct)} />
                        ) : (
                          <UndoReceived id={r.id} number={r.number} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{view === "open" ? "Nothing outstanding. Every sent invoice has been paid. 🎉" : "No sent invoices here."}</p>
        )}
      </div>
      <p className="muted i9-small">
        Default terms come from the vendor (Vendors page → Edit → Payment terms) or the consultant&apos;s own terms on that vendor. You can change one invoice&apos;s terms with
        the ✎ next to &ldquo;Net&rdquo;. Tap <strong>Mark paid</strong> when the money arrives in the bank.
      </p>
    </section>
  );
}
