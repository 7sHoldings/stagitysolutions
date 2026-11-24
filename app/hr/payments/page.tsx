import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { addDays, addMonths, money, monthEnd, monthLabel, monthStart, todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import MonthPicker from "../MonthPicker";
import { EditOldButton, MarkPaidButton, RemindVendorButton, ShortPayActions } from "../invoices/forms";
import { expectedAmount } from "@/lib/invoices/payments";
import { paymentReminderLines, periodLabel, shortPaymentLines } from "@/lib/invoices/send";
import { TermsButton, UndoReceived, VendorFilter } from "./forms";

type Row = {
  id: string; vendor_id: string; number: string; status: "sent" | "paid"; period_start: string; period_end: string; total: number;
  issue_date: string | null; due_date: string | null; paid_at: string | null;
  amount_received: number; adjustment: number; adjustment_reason: string | null; short_emailed_at: string | null; imported: boolean; last_reminder_at: string | null;
  stagity_people: { first_name: string; last_name: string };
  stagity_vendors: { name: string; ap_email: string; cc_emails: string | null; vms_fee_pct: number | null; dispute_days: number | null };
};
type View = "worked" | "due" | "open";

const DAY = 86400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const nice = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");

export default async function Payments({ searchParams }: { searchParams: Promise<{ month?: string; view?: string; vendor?: string }> }) {
  const hr = await requireHr();
  const q = await searchParams;
  const today = todayCT();
  const view: View = q.view === "due" ? "due" : q.view === "open" ? "open" : "worked";
  // "All months": chosen in the month menu, or automatically when a vendor is picked without a month.
  const allMonths = q.month === "all" || (!!q.vendor && !q.month);
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? `${q.month}-01` : view === "due" ? monthStart(today) : addMonths(monthStart(today), -1);

  const { data } = await db()
    .from("stagity_invoices")
    .select("id, vendor_id, number, status, period_start, period_end, total, issue_date, due_date, paid_at, amount_received, adjustment, adjustment_reason, short_emailed_at, imported, last_reminder_at, stagity_people(first_name, last_name), stagity_vendors(name, ap_email, cc_emails, vms_fee_pct, dispute_days)")
    .in("status", ["sent", "paid"])
    .order("due_date", { ascending: true })
    .limit(2000);
  const all = (data ?? []) as unknown as Row[];

  // ---- Totals across everything (not just the selected month) ----
  const open = all.filter((r) => r.status === "sent");
  const noAmount = (r: Row) => r.imported && Number(r.total) <= 0;
  const overdue = open.filter((r) => !noAmount(r) && r.due_date && r.due_date < today);
  const toCheck = open.filter(noAmount);
  const shortPaid = open.filter((r) => Number(r.amount_received) > 0);
  const soon = open.filter((r) => !noAmount(r) && r.due_date && r.due_date >= today && r.due_date <= addDays(today, 30));
  const { data: monthPays } = await db().from("stagity_invoice_payments").select("amount").gte("received_on", monthStart(today));
  const receivedThisMonthAmt = (monthPays ?? []).reduce((a, p) => a + Number(p.amount), 0);
  // Payments for short-paid invoices (for the email preview).
  const { data: shortPays } = shortPaid.length
    ? await db().from("stagity_invoice_payments").select("invoice_id, amount, received_on").in("invoice_id", shortPaid.map((r) => r.id)).order("received_on")
    : { data: [] as { invoice_id: string; amount: number; received_on: string }[] };
  const left = (r: Row) => (r.status === "paid" ? 0 : Number(r.total) - Number(r.amount_received) - Number(r.adjustment));
  const sum = (rows: Row[]) => rows.reduce((a, r) => a + left(r), 0);
  const sumReceived = (rows: Row[]) => rows.reduce((a, r) => a + Number(r.amount_received), 0);

  // ---- Vendor filter ----
  const vendorList = [...new Map(all.map((r) => [r.vendor_id, { id: r.vendor_id, name: r.stagity_vendors.name }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const vendorId = q.vendor && vendorList.some((v) => v.id === q.vendor) ? q.vendor : "";
  const vq = vendorId ? `&vendor=${vendorId}` : "";

  // ---- The selected list ----
  const inMonth = (d: string | null) => !!d && d >= month && d <= monthEnd(month);
  const rows =
    view === "open" ? open
    : allMonths ? [...all]
    : view === "due" ? all.filter((r) => inMonth(r.due_date))
    : all.filter((r) => r.period_start <= monthEnd(month) && r.period_end >= month);
  if (vendorId) rows.splice(0, rows.length, ...rows.filter((r) => r.vendor_id === vendorId));
  rows.sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid") || String(a.due_date).localeCompare(String(b.due_date)) || a.stagity_people.last_name.localeCompare(b.stagity_people.last_name));
  const toItem = (r: Row) => ({
    number: r.number, consultant: `${r.stagity_people.first_name} ${r.stagity_people.last_name}`, period: periodLabel(r.period_start, r.period_end),
    issueDate: r.issue_date, dueDate: r.due_date, outstanding: Math.round(left(r) * 100) / 100, imported: r.imported,
  });
  const remindable = rows.filter((r) => r.status === "sent" && left(r) > 0.005);
  const lastReminders = remindable.map((r) => r.last_reminder_at).filter(Boolean).sort() as string[];
  const remindVendor = { last: lastReminders.pop() ?? null };
  const listReceived = sumReceived(rows);
  const listOpen = sum(rows);

  const tab = (v: View, label: string) => (
    <Link href={`/hr/payments?view=${v}${v === "open" ? "" : `&month=${allMonths ? "all" : month.slice(0, 7)}`}${vq}`} className={view === v ? "on" : ""} aria-current={view === v ? "page" : undefined}>{label}</Link>
  );
  const vendorName = vendorList.find((v) => v.id === vendorId)?.name;
  const title =
    view === "open" ? `All unpaid invoices${vendorName ? `: ${vendorName}` : ""}`
    : allMonths ? `All invoices${vendorName ? `: ${vendorName}` : ""}`
    : view === "due" ? `Payments expected in ${monthLabel(month)}`
    : `Invoices for work in ${monthLabel(month)}`;

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

      {toCheck.length > 0 && (
        <div className="hr-notice" style={{ marginBottom: 16 }}>
          <strong>{toCheck.length} old invoice{toCheck.length === 1 ? "" : "s"} (Jan–Oct) to check.</strong> For each month: tap <strong>Mark paid</strong> if the vendor paid,
          or <strong>Enter amount</strong> if it&apos;s still unpaid so it counts as outstanding. Use <strong>Enter amount → Remove this month</strong> if no invoice was sent.{" "}
          <Link href="/hr/payments?view=open">See all</Link>
        </div>
      )}

      <div className="hr-panel">
        <div className="inv-month-head">
          <div>
            <h2 className="i9-h3">{title}</h2>
            <p className="muted i9-small">
              {rows.length} invoice{rows.length === 1 ? "" : "s"} · <span style={{ color: "#15803d" }}>{money(listReceived)} received</span> · <strong>{money(listOpen)} not received</strong>
            </p>
          </div>
          {view !== "open" && <MonthPicker base="/hr/payments" month={allMonths ? "all" : month} current={today} query={`view=${view}${vq}`} allowAll />}
        </div>
        <div className="pay-toolbar">
          <nav className="pay-views" aria-label="Show">
            {tab("worked", "By month worked")}
            {tab("due", "By expected date")}
            {tab("open", "All unpaid")}
          </nav>
          <VendorFilter vendors={vendorList} value={vendorId} view={view} />
        </div>
        {vendorId && remindable.length > 0 && (
          <div className="pay-remind">
            <span>
              <strong>{remindable.length} unpaid invoice{remindable.length === 1 ? "" : "s"}</strong> from {vendorList.find((v) => v.id === vendorId)?.name} here,{" "}
              <strong>{money(sum(remindable))}</strong> outstanding{remindVendor?.last ? ` · last reminder ${nice(remindVendor.last.slice(0, 10))}` : ""}.
            </span>
            <RemindVendorButton
              ids={remindable.map((r) => r.id)}
              vendor={remindable[0].stagity_vendors.name}
              to={[remindable[0].stagity_vendors.ap_email, remindable[0].stagity_vendors.cc_emails].filter(Boolean).join(", ")}
              preview={paymentReminderLines(remindable[0].stagity_vendors.name, remindable.map(toItem), today)}
            />
          </div>
        )}

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
                      <td data-label="Invoice"><Link href={`/hr/invoices/${r.id}`}>#{r.number}</Link>{r.imported && <span className="pay-old">before portal</span>}<div className="muted i9-small">{monthLabel(r.period_start)} · sent {nice(r.issue_date)}</div></td>
                      <td data-label="Terms">{terms == null ? "—" : r.status === "sent" && r.issue_date ? <TermsButton id={r.id} issueDate={r.issue_date} days={terms} /> : `Net ${terms}`}</td>
                      <td data-label="Expected by">{nice(r.due_date)}</td>
                      <td className="i9-num pay-amt" data-label="Amount">
                        {noAmount(r) ? <span className="muted">—</span> : <strong>{money(Number(r.total))}</strong>}
                        {Number(r.amount_received) > 0 && r.status === "sent" && <div className="i9-small" style={{ color: "#15803d" }}>{money(Number(r.amount_received))} received</div>}
                        {r.stagity_vendors.vms_fee_pct ? <div className="muted i9-small">expect {money(expectedAmount(Number(r.total), r.stagity_vendors.vms_fee_pct))} after {Number(r.stagity_vendors.vms_fee_pct)}% VMS fee</div> : null}
                      </td>
                      <td className="pay-status">
                        {r.status === "paid" ? (
                          <>
                            <span className="i9-badge s-closed">✓ Received {nice(r.paid_at)}{paidLate > 0 ? ` (${paidLate} d late)` : ""}</span>
                            {Number(r.adjustment) > 0 && <div className="muted i9-small">{money(Number(r.adjustment))} less: {r.adjustment_reason}</div>}
                          </>
                        ) : noAmount(r) ? (
                          <span className="i9-badge s-cancelled">Mark paid, or enter amount if unpaid</span>
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
                          <MarkPaidButton id={r.id} number={r.number} amount={money(Number(r.total))} vendor={r.stagity_vendors.name} today={noAmount(r) && r.due_date && r.due_date < today ? r.due_date : today} remaining={expectedAmount(Number(r.total), r.stagity_vendors.vms_fee_pct)} noAmount={noAmount(r)} />
                        ) : (
                          <UndoReceived id={r.id} number={r.number} />
                        )}
                        {r.status === "sent" && left(r) > 0.005 && r.due_date && r.due_date < today && (
                          <RemindVendorButton
                            ids={[r.id]}
                            vendor={r.stagity_vendors.name}
                            to={[r.stagity_vendors.ap_email, r.stagity_vendors.cc_emails].filter(Boolean).join(", ")}
                            preview={paymentReminderLines(r.stagity_vendors.name, [toItem(r)], today)}
                            label={r.last_reminder_at ? `Remind again` : "Remind"}
                            className="hr-link"
                          />
                        )}
                        {r.imported && r.issue_date && <EditOldButton id={r.id} number={r.number} issueDate={r.issue_date} total={Number(r.total)} label={noAmount(r) ? "Enter amount" : "Edit"} />}
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
