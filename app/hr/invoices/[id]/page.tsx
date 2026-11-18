import Link from "next/link";
import { notFound } from "next/navigation";
import { db, requireHr } from "@/lib/i9/server";
import { periodCompleteness } from "@/lib/invoices/server";
import { loadInvoice } from "@/lib/invoices/send";
import { money, sheetLabel, shortDate, todayCT } from "@/lib/portal/dates";
import HrNav from "../../HrNav";
import BackLink from "../../BackLink";
import { DraftEditForm, PaidForm, SendButton, UnpaidButton, VoidForm } from "../forms";

const label: Record<string, string> = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void" };
const cls: Record<string, string> = { draft: "s-section1_complete", sent: "s-everify_submitted", paid: "s-closed", void: "s-cancelled" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const loaded = await loadInvoice(id);
  if (!loaded) notFound();
  const { inv, vendor, person } = loaded;
  const [{ data: days }, completeness] = await Promise.all([
    db().from("stagity_timesheet_days").select("timesheet_id, hours, stagity_timesheets(week_start)").eq("invoice_id", id),
    periodCompleteness(inv),
  ]);
  const weeks = new Map<string, { id: string; hours: number }>();
  for (const d of days ?? []) {
    const w = (d.stagity_timesheets as unknown as { week_start: string }).week_start;
    const cur = weeks.get(w) ?? { id: d.timesheet_id, hours: 0 };
    cur.hours += Number(d.hours);
    weeks.set(w, cur);
  }
  const draft = inv.status === "draft";
  const consultant = `${person.first_name} ${person.last_name}`;

  return (
    <section className="container hr-page">
      <HrNav active="/hr/invoices" email={hr} />
      <BackLink href={`/hr/invoices?month=${inv.period_start.slice(0, 7)}`} label="All invoices" />
      <div className="hr-detail-head">
        <div>
          <h1 className="h2">{draft ? "Draft invoice" : `Invoice ${inv.number}`}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>{consultant} · {vendor.name} · {shortDate(inv.period_start)} – {shortDate(inv.period_end)}</p>
        </div>
        <div className="hr-detail-actions">
          <span className={`i9-badge ${cls[inv.status]}`}>{label[inv.status]}</span>
          <a className="btn btn-outline hr-btn-sm" href={`/hr/invoices/${id}/pdf`} target="_blank" rel="noreferrer">{draft ? "Preview PDF" : "View PDF"}</a>
          {draft && <SendButton id={id} vendor={vendor.name} total={money(Number(inv.total))} to={[vendor.ap_email, vendor.cc_emails].filter(Boolean).join(", ")} />}
        </div>
      </div>
      {draft && completeness.complete && (
        <p className="inv-ready">
          <strong>Ready to send.</strong> Every timesheet in this period is approved.{" "}
          {inv.review_requested_at
            ? `The team was emailed to review it on ${new Date(inv.review_requested_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}.`
            : "The team will be emailed to review it."}{" "}
          Check the details below, then tap <strong>Approve &amp; send</strong>.
        </p>
      )}

      <div className="i9-card">
        <dl className="i9-dl">
          <div className="i9-row"><dt>Bill to</dt><dd>{vendor.name} · {vendor.ap_email}{vendor.cc_emails ? ` (cc ${vendor.cc_emails})` : ""}</dd></div>
          <div className="i9-row"><dt>Client</dt><dd>{person.client_name ?? "—"}</dd></div>
          <div className="i9-row"><dt>Hours × rate</dt><dd>{Number(inv.regular_hours) + Number(inv.overtime_hours)} × {money(Number(inv.bill_rate))}</dd></div>
          <div className="i9-row"><dt>Total</dt><dd><strong>{money(Number(inv.total))}</strong></dd></div>
          {inv.due_date && <div className="i9-row"><dt>Expected payment by</dt><dd>{inv.due_date} (internal, not on the invoice)</dd></div>}
          {inv.sent_at && <div className="i9-row"><dt>Sent</dt><dd>{new Date(inv.sent_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT to {inv.sent_to} by {inv.sent_by}</dd></div>}
          {inv.paid_at && <div className="i9-row"><dt>Paid</dt><dd>{inv.paid_at}</dd></div>}
          {inv.voided_reason && <div className="i9-row"><dt>Voided</dt><dd>{inv.voided_reason}</dd></div>}
        </dl>
      </div>

      <div className="i9-card">
        <h2 className="i9-h3">Approved timesheets on this invoice</h2>
        {draft && !completeness.complete && (
          <p className="form-status err">
            {completeness.approved} of {completeness.expected} weeks in this period are approved
            {inv.period_end >= todayCT() ? " and the period hasn't ended yet" : ""}. You can still send it, but later hours will go on a new invoice.
          </p>
        )}
        <div className="i9-weeks">
          {[...weeks].sort().map(([w, x]) => (
            <Link key={w} href={`/hr/timesheets/${x.id}`} className="i9-week"><strong>{sheetLabel(w)}</strong><span className="i9-small muted">{x.hours} h in this period</span></Link>
          ))}
        </div>
      </div>

      {draft && (
        <div className="form-card">
          <h2 className="i9-h3">PO number &amp; note (optional)</h2>
          <DraftEditForm id={id} poNumber={inv.po_number ?? ""} notes={inv.notes ?? ""} />
          <p className="muted i9-small">
            Sending assigns the invoice number and emails {vendor.ap_email}{vendor.cc_emails ? ` (cc ${vendor.cc_emails})` : ""} the PDF and the approved timesheets. accounts@ gets a copy.
          </p>
          <SendButton id={id} vendor={vendor.name} total={money(Number(inv.total))} to={[vendor.ap_email, vendor.cc_emails].filter(Boolean).join(", ")} />
        </div>
      )}
      {inv.status === "paid" && (
        <div className="form-card">
          <h2 className="i9-h3">Paid{inv.paid_at ? ` on ${inv.paid_at}` : ""}</h2>
          <UnpaidButton id={id} />
        </div>
      )}
      {inv.status === "sent" && (
        <div className="form-card">
          <h2 className="i9-h3">Payment</h2>
          <PaidForm id={id} today={todayCT()} />
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 6 }}>
            <p className="muted i9-small" style={{ margin: "0 0 8px" }}>Sent by mistake or with wrong hours?</p>
            <VoidForm id={id} />
          </div>
        </div>
      )}
    </section>
  );
}
