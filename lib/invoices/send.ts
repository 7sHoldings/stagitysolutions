import "server-only";
import { audit, db } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { TS_BUCKET } from "@/lib/portal/server";
import { addDays, weekStartOf, money, monthLabel, shortDate, todayCT } from "@/lib/portal/dates";
import { company } from "@/lib/content";
import { buildInvoicePdf, type InvoicePdfData } from "./pdf";
import { recomputeDraft, type Invoice, type Vendor } from "./server";

const mdY = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

type Loaded = { inv: Invoice; vendor: Vendor; person: { first_name: string; last_name: string; client_name: string | null; payment_terms_days: number | null } };

export async function loadInvoice(id: string): Promise<Loaded | null> {
  const { data } = await db()
    .from("stagity_invoices")
    .select("*, stagity_vendors(*), stagity_people(first_name, last_name, client_name, payment_terms_days)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { stagity_vendors, stagity_people, ...inv } = data;
  return { inv: inv as Invoice, vendor: stagity_vendors as Vendor, person: stagity_people as Loaded["person"] };
}

export async function pdfData({ inv, vendor, person }: Loaded): Promise<InvoicePdfData> {
  const { data: days } = await db().from("stagity_timesheet_days").select("work_date, hours").eq("invoice_id", inv.id);
  const byWeek = new Map<string, number>();
  for (const day of days ?? []) {
    const m = weekStartOf(day.work_date);
    byWeek.set(m, (byWeek.get(m) ?? 0) + Number(day.hours));
  }
  const weeks = [...byWeek].sort(([a], [b]) => a.localeCompare(b)).map(([m, hours]) => {
    const from = m < inv.period_start ? inv.period_start : m;
    const to = addDays(m, 6) > inv.period_end ? inv.period_end : addDays(m, 6);
    return { label: `${mdY(from)} – ${mdY(to)}`, hours: Math.round(hours * 100) / 100 };
  });
  const today = todayCT();
  const issue = inv.issue_date ?? today;
  return {
    number: inv.number.startsWith("DRAFT-") ? "Assigned on send" : inv.number,
    issueDate: issue,
    periodLabel: periodLabel(inv.period_start, inv.period_end),
    vendor: { name: vendor.name, address: vendor.address, apEmail: vendor.ap_email },
    consultant: `${person.first_name} ${person.last_name}`,
    client: person.client_name,
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    poNumber: inv.po_number,
    hours: Number(inv.regular_hours) + Number(inv.overtime_hours),
    weeks,
    billRate: Number(inv.bill_rate),
    total: Number(inv.total),
    notes: inv.notes,
    draft: inv.status === "draft",
  };
}

/** "September 2026" for a whole month, otherwise "Sep 7 – Sep 13, 2026". */
export function periodLabel(start: string, end: string) {
  const fullMonth = start.endsWith("-01") && addDays(end, 1).endsWith("-01") && start.slice(0, 7) === end.slice(0, 7);
  return fullMonth ? monthLabel(start) : `${shortDate(start)} – ${shortDate(end)}, ${end.slice(0, 4)}`;
}

/**
 * Invoice number = the date the invoice is raised, YYYYMMDD (e.g. August hours invoiced on
 * September 1, 2026 → 20260901). A second invoice raised the same day gets -2, then -3, …
 */
async function nextInvoiceNumber(issueDate: string): Promise<string> {
  const base = issueDate.replace(/-/g, "");
  const { data } = await db().from("stagity_invoices").select("number").like("number", `${base}%`);
  const used = new Set((data ?? []).map((r) => r.number));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export type MailFile = { filename: string; content: Uint8Array; contentType?: string };

/** The approved-timesheet screenshots/PDFs the consultant uploaded for the weeks on this invoice. */
export async function approvedTimesheetFiles(invoiceId: string): Promise<MailFile[]> {
  const { data: days } = await db().from("stagity_timesheet_days").select("timesheet_id").eq("invoice_id", invoiceId);
  const sheetIds = [...new Set((days ?? []).map((d) => d.timesheet_id as string))];
  if (!sheetIds.length) return [];
  const [{ data: files }, { data: sheets }] = await Promise.all([
    db().from("stagity_timesheet_files").select("timesheet_id, storage_path, original_name, mime_type").in("timesheet_id", sheetIds),
    db().from("stagity_timesheets").select("id, week_start").in("id", sheetIds),
  ]);
  const out: MailFile[] = [];
  const seen = new Set<string>();
  for (const f of files ?? []) {
    if (seen.has(f.storage_path)) continue;
    seen.add(f.storage_path);
    const { data: blob } = await db().storage.from(TS_BUCKET).download(f.storage_path);
    const week = sheets?.find((x) => x.id === f.timesheet_id)?.week_start ?? "";
    if (blob) out.push({ filename: `Approved timesheet ${week} - ${f.original_name ?? "file"}`, content: new Uint8Array(await blob.arrayBuffer()), contentType: f.mime_type ?? undefined });
  }
  return out;
}

/** Approves a draft: assigns the invoice number, builds the PDF and emails it to the vendor. */
export async function approveAndSend(id: string, hr: string): Promise<{ error?: string; message?: string }> {
  await recomputeDraft(id); // pick up any rate change before sending
  const loaded = await loadInvoice(id);
  if (!loaded) return { error: "This draft no longer exists (its hours may have been sent back)." };
  const { inv, vendor, person } = loaded;
  if (inv.status !== "draft") return { error: "This invoice was already sent." };
  if (!vendor.active) return { error: `${vendor.name} is marked inactive.` };
  if ((vendor as Vendor & { send_invoices?: boolean }).send_invoices === false) return { error: `${vendor.name} is set to "We don't invoice".` };
  if (Number(inv.total) <= 0) return { error: "The invoice total is $0. Check the consultant's bill rate." };

  const issue = todayCT();
  const number = await nextInvoiceNumber(issue);
  // Reserve the number now (unique), so two sends can't take the same one.
  const { error: reserveErr } = await db().from("stagity_invoices").update({ number }).eq("id", id).eq("status", "draft");
  if (reserveErr) return { error: "Couldn't assign an invoice number. Please try again." };
  // The consultant's own payment terms win over the vendor default.
  const due = addDays(issue, person.payment_terms_days ?? vendor.payment_terms_days);
  const ready: Loaded = { ...loaded, inv: { ...inv, number, issue_date: issue, due_date: due, status: "sent" } };
  const pdf = await buildInvoicePdf({ ...(await pdfData(ready)), draft: false });

  // The vendor always gets the consultant's client-approved timesheets with the invoice.
  const attachments = [{ filename: `Invoice ${number}.pdf`, content: pdf, contentType: "application/pdf" }, ...(await approvedTimesheetFiles(id))];

  const consultant = `${person.first_name} ${person.last_name}`;
  const cc = (vendor.cc_emails ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const ok = await send(
    vendor.ap_email.split(/,\s*/).filter(Boolean).join(", "),
    // e.g. "Krutarth Panchal invoice for September 2026 (#20261001)"
    `${consultant} invoice for ${periodLabel(inv.period_start, inv.period_end)} (#${number})`,
    [
      "Hello,",
      `This email is regarding the ${consultant} invoice. Please find attached invoice #${number} for ${periodLabel(inv.period_start, inv.period_end)} (${mdY(inv.period_start)} to ${mdY(inv.period_end)}).`,
      `Total: ${money(Number(inv.total))} (${Number(inv.regular_hours) + Number(inv.overtime_hours)} hours × ${money(Number(inv.bill_rate))}).${inv.po_number ? ` PO/reference: ${inv.po_number}.` : ""}`,
      "The client-approved timesheets for this period are attached.",
      "Please acknowledge once received.",
      `If you have any questions, please reach out to ${company.invoiceQuestionsEmail} or ${company.phone}.`,
      "Thanks & Regards,",
    ],
    undefined,
    { cc, bcc: [company.accountsEmail], attachments, from: "accounts", replyTo: company.invoiceQuestionsEmail },
  );
  if (!ok) {
    await db().from("stagity_invoices").update({ number: inv.number }).eq("id", id).eq("status", "draft");
    return { error: "The email couldn't be sent, so the invoice is still a draft. Check the email settings and try again." };
  }

  await db()
    .from("stagity_invoices")
    .update({ number, status: "sent", issue_date: issue, due_date: due, sent_at: new Date().toISOString(), sent_by: hr, sent_to: [vendor.ap_email, ...cc].join(", ") })
    .eq("id", id);
  await audit(null, `hr:${hr}`, "invoice_sent", { invoiceId: id, number, total: inv.total, to: vendor.ap_email });
  return { message: `Invoice ${number} sent to ${[vendor.ap_email, ...cc].join(", ")}.` };
}

/** Body lines of the short-payment email (also shown as a preview before sending). */
export function shortPaymentLines(o: { consultant: string; number: string; period: string; total: number; received: number; payments: { amount: number; received_on: string }[]; extra?: string }) {
  const diff = Math.round((o.total - o.received) * 100) / 100;
  return [
    "Hello,",
    `This is regarding invoice #${o.number} for ${o.consultant} (${o.period}).`,
    [
      `Invoice amount: ${money(o.total)}`,
      ...o.payments.map((p) => `Payment received on ${mdY(p.received_on)}: ${money(Number(p.amount))}`),
      `Short by: ${money(diff)}`,
    ].join("\n"),
    `The payment we received is ${money(diff)} less than the invoice amount. Could you please check and send the remaining balance, or let us know the reason for the difference (for example, any fee or deduction)?`,
    ...(o.extra ? [o.extra] : []),
    "A copy of the invoice is attached for reference. Thank you.",
    "Thanks & Regards,",
  ];
}

export async function sendShortPaymentEmail(id: string, extra = ""): Promise<{ error?: string; message?: string }> {
  const loaded = await loadInvoice(id);
  if (!loaded) return { error: "Invoice not found." };
  const { inv, vendor, person } = loaded;
  const { data: pays } = await db().from("stagity_invoice_payments").select("amount, received_on").eq("invoice_id", id).order("received_on");
  const received = (pays ?? []).reduce((a, p) => a + Number(p.amount), 0);
  if (inv.status !== "sent" || received <= 0 || received >= Number(inv.total) - 0.005) return { error: "This invoice isn't short-paid." };
  const consultant = `${person.first_name} ${person.last_name}`;
  const period = periodLabel(inv.period_start, inv.period_end);
  const pdf = await buildInvoicePdf({ ...(await pdfData(loaded)), draft: false });
  const cc = (vendor.cc_emails ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const ok = await send(
    vendor.ap_email.split(/,\s*/).filter(Boolean).join(", "),
    `Short payment: ${consultant} invoice #${inv.number} (${period})`,
    shortPaymentLines({ consultant, number: inv.number, period, total: Number(inv.total), received, payments: pays ?? [], extra }),
    undefined,
    { cc, bcc: [company.accountsEmail], from: "accounts", replyTo: company.invoiceQuestionsEmail, attachments: [{ filename: `Invoice ${inv.number}.pdf`, content: pdf, contentType: "application/pdf" }] },
  );
  if (!ok) return { error: "The email couldn't be sent. Check the email settings and try again." };
  await db().from("stagity_invoices").update({ short_emailed_at: new Date().toISOString() }).eq("id", id);
  return { message: `Emailed ${vendor.ap_email}.` };
}

// ---------- Payment reminders to vendors ----------

export type ReminderItem = { number: string; consultant: string; period: string; issueDate: string | null; dueDate: string | null; outstanding: number; imported: boolean };

const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Professional payment-reminder text (also shown as a preview before sending). */
export function paymentReminderLines(vendorName: string, items: ReminderItem[], today: string, extra = "") {
  const total = items.reduce((a, i) => a + i.outstanding, 0);
  const one = items.length === 1;
  const line = (i: ReminderItem) => {
    const late = i.dueDate && i.dueDate < today ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${i.dueDate}T12:00:00Z`)) / 86400_000) : 0;
    return `• Invoice #${i.number}: ${i.consultant}, ${i.period}${i.issueDate ? `, invoiced ${longDay(i.issueDate)}` : ""}${i.dueDate ? `, due ${longDay(i.dueDate)}` : ""}: ${money(i.outstanding)}${late > 0 ? ` (${late} day${late === 1 ? "" : "s"} past due)` : ""}`;
  };
  return [
    `Dear ${vendorName} Accounts Payable Team,`,
    "I hope you are doing well.",
    `This is a friendly reminder that the following invoice${one ? "" : "s"} from Stagity Solutions LLC ${one ? "remains" : "remain"} unpaid as of ${longDay(today)}:`,
    items.map(line).join("\n"),
    `Total outstanding: ${money(total)}`,
    `Could you please confirm the payment status and the expected payment date? If payment has already been sent, kindly share the payment details (date, amount and reference number) so we can match it on our end.`,
    ...(extra ? [extra] : []),
    `${items.some((i) => !i.imported) ? `A copy of the invoice${one ? " is" : "s are"} attached for your reference. ` : ""}If you have any questions, please contact us at ${company.invoiceQuestionsEmail} or ${company.phone}.`,
    "Thank you for your prompt attention to this matter.",
    "Best regards,",
  ];
}

/** Loads unpaid invoices (with an amount) for one vendor, ready for a reminder. */
export async function reminderItems(ids: string[]) {
  const { data } = await db()
    .from("stagity_invoices")
    .select("id, number, status, period_start, period_end, total, amount_received, adjustment, issue_date, due_date, imported, vendor_id, reminder_count, stagity_people(first_name, last_name), stagity_vendors(*)")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const rows = (data ?? []).filter((r) => r.status === "sent" && Number(r.total) - Number(r.amount_received) - Number(r.adjustment) > 0.005);
  return rows.map((r) => {
    const p = r.stagity_people as unknown as { first_name: string; last_name: string };
    return {
      id: r.id as string,
      vendorId: r.vendor_id as string,
      vendor: r.stagity_vendors as unknown as Vendor,
      reminderCount: Number(r.reminder_count ?? 0),
      item: {
        number: r.number as string,
        consultant: `${p.first_name} ${p.last_name}`,
        period: periodLabel(r.period_start, r.period_end),
        issueDate: r.issue_date as string | null,
        dueDate: r.due_date as string | null,
        outstanding: Math.round((Number(r.total) - Number(r.amount_received) - Number(r.adjustment)) * 100) / 100,
        imported: !!r.imported,
      } as ReminderItem,
    };
  });
}

export async function sendPaymentReminder(ids: string[], extra = ""): Promise<{ error?: string; message?: string }> {
  const rows = await reminderItems(ids);
  if (!rows.length) return { error: "Nothing unpaid to remind about (enter the amount for old invoices first)." };
  const vendorIds = new Set(rows.map((r) => r.vendorId));
  if (vendorIds.size > 1) return { error: "Choose one vendor at a time." };
  const vendor = rows[0].vendor;
  if (!vendor.ap_email) return { error: `${vendor.name} has no email on file. Add it on the Vendors page.` };
  const today = todayCT();
  // Attach the PDFs of invoices sent from the portal.
  const attachments: { filename: string; content: Uint8Array; contentType?: string }[] = [];
  for (const r of rows.filter((x) => !x.item.imported)) {
    const loaded = await loadInvoice(r.id);
    if (loaded) attachments.push({ filename: `Invoice ${r.item.number}.pdf`, content: await buildInvoicePdf({ ...(await pdfData(loaded)), draft: false }), contentType: "application/pdf" });
  }
  const one = rows.length === 1;
  const total = rows.reduce((a, r) => a + r.item.outstanding, 0);
  const cc = (vendor.cc_emails ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const ok = await send(
    vendor.ap_email.split(/,\s*/).filter(Boolean).join(", "),
    one
      ? `Payment reminder: Invoice #${rows[0].item.number} (${rows[0].item.consultant}, ${rows[0].item.period})`
      : `Payment reminder: ${rows.length} outstanding invoices from Stagity Solutions LLC (${money(total)})`,
    paymentReminderLines(vendor.name, rows.map((r) => r.item), today, extra),
    undefined,
    { cc, bcc: [company.accountsEmail], from: "accounts", replyTo: company.invoiceQuestionsEmail, attachments },
  );
  if (!ok) return { error: "The email couldn't be sent. Check the email settings and try again." };
  const now = new Date().toISOString();
  for (const r of rows) await db().from("stagity_invoices").update({ last_reminder_at: now, reminder_count: r.reminderCount + 1 }).eq("id", r.id);
  return { message: `Reminder sent to ${vendor.ap_email} for ${rows.length} invoice${one ? "" : "s"} (${money(total)}).` };
}
