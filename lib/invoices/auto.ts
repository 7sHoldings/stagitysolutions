import "server-only";
import { audit, db, siteOrigin } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { company } from "@/lib/content";
import { addDays, money, weekStartOf } from "@/lib/portal/dates";
import { buildInvoicePdf } from "./pdf";
import { periodCompleteness, syncDraftInvoices } from "./server";
import { approvedTimesheetFiles, loadInvoice, pdfData, periodLabel } from "./send";

const mdY = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

/**
 * Daily (and "Check now" on the Invoices page):
 * 1. brings all approved hours onto draft invoices;
 * 2. for every draft whose period is over and fully approved, emails hr@, timesheets@ and accounts@
 *    ONE "ready for review" email with the draft PDF, the approved timesheets and a link to approve.
 *
 * Nothing is ever sent to a vendor here. An admin must open the invoice and click "Approve & send".
 */
export async function requestInvoiceReviews(): Promise<{ notified: string[]; failed: string[]; waiting: number }> {
  const { data: people } = await db().from("stagity_people").select("id").eq("kind", "consultant").not("vendor_id", "is", null);
  for (const p of people ?? []) await syncDraftInvoices(p.id);

  const { data: drafts } = await db()
    .from("stagity_invoices")
    .select("id, person_id, period_start, period_end, total, review_requested_at, stagity_vendors(active, send_invoices)")
    .eq("status", "draft")
    .is("review_requested_at", null);
  const notified: string[] = [];
  const failed: string[] = [];
  let waiting = 0;
  for (const d of drafts ?? []) {
    const v = d.stagity_vendors as unknown as { active: boolean; send_invoices: boolean } | null;
    if (!v?.active || v.send_invoices === false || Number(d.total) <= 0) continue;
    if (!(await periodCompleteness(d)).complete) {
      waiting++;
      continue;
    }
    const r = await sendReviewEmail(d.id);
    (r.ok ? notified : failed).push(r.label);
  }
  return { notified, failed, waiting };
}

/** "Invoice ready for review" email to the team, with the draft invoice and approved timesheets attached. */
export async function sendReviewEmail(id: string): Promise<{ ok: boolean; label: string }> {
  const loaded = await loadInvoice(id);
  if (!loaded) return { ok: false, label: id };
  const { inv, vendor, person } = loaded;
  const consultant = `${person.first_name} ${person.last_name}`;
  const period = periodLabel(inv.period_start, inv.period_end);
  const label = `${consultant} (${period})`;
  const data = await pdfData(loaded);
  const pdf = await buildInvoicePdf({ ...data, draft: true });

  // Weekly breakdown of the approved hours.
  const { data: days } = await db().from("stagity_timesheet_days").select("work_date, hours").eq("invoice_id", id);
  const byWeek = new Map<string, number>();
  for (const day of days ?? []) byWeek.set(weekStartOf(day.work_date), (byWeek.get(weekStartOf(day.work_date)) ?? 0) + Number(day.hours));
  const weekLines = [...byWeek].sort(([a], [b]) => a.localeCompare(b)).map(([w, h]) => {
    const from = w < inv.period_start ? inv.period_start : w;
    const to = addDays(w, 6) > inv.period_end ? inv.period_end : addDays(w, 6);
    return `• ${mdY(from)} – ${mdY(to)}: ${Math.round(h * 100) / 100} h (approved)`;
  });
  const hours = Number(inv.regular_hours) + Number(inv.overtime_hours);
  const files = await approvedTimesheetFiles(id);
  const to = [vendor.ap_email, vendor.cc_emails].filter(Boolean).join(", ");

  const ok = await send(
    [company.email, company.timesheetsEmail, company.accountsEmail].join(", "),
    `Please review: ${consultant} invoice for ${period} (${money(Number(inv.total))}) to ${vendor.name}`,
    [
      "Hi team,",
      `All of ${consultant}'s timesheets for ${period} are approved, so the invoice to ${vendor.name} is ready. It has NOT been sent to the vendor yet.`,
      "## Approved timesheets",
      weekLines.join("\n") || "(none)",
      "## Invoice",
      [
        `Consultant: ${consultant}`,
        `Vendor: ${vendor.name}`,
        `Period: ${period} (${mdY(inv.period_start)} to ${mdY(inv.period_end)})`,
        `Total: ${money(Number(inv.total))} (${hours} hours × ${money(Number(inv.bill_rate))})`,
        `Will be emailed to: ${to}`,
      ].join("\n"),
      `Attached: the draft invoice PDF and ${files.length} approved timesheet file${files.length === 1 ? "" : "s"} from ${person.first_name}. The vendor gets the same timesheets with the final invoice.`,
      "Please check it and click the button to approve and send it to the vendor. The invoice number is assigned when you send it.",
    ],
    { label: "Review & send invoice", href: `${siteOrigin()}/hr/invoices/${id}` },
    {
      from: "accounts",
      signature: "Stagity Solutions Portal",
      attachments: [{ filename: `DRAFT invoice - ${consultant} - ${period}.pdf`, content: pdf, contentType: "application/pdf" }, ...files],
    },
  );
  if (ok) {
    await db().from("stagity_invoices").update({ review_requested_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
    await audit(null, "system", "invoice_review_requested", { invoiceId: id, total: inv.total });
  }
  return { ok, label };
}
