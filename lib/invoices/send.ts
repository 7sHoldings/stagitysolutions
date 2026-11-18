import "server-only";
import { audit, db, hrEmails } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { TS_BUCKET } from "@/lib/portal/server";
import { addDays, money, todayCT } from "@/lib/portal/dates";
import { company } from "@/lib/content";
import { buildInvoicePdf, type InvoicePdfData } from "./pdf";
import { getSetting, recomputeDraft, type Invoice, type Vendor } from "./server";

type Loaded = { inv: Invoice; vendor: Vendor; person: { first_name: string; last_name: string; client_name: string | null } };

export async function loadInvoice(id: string): Promise<Loaded | null> {
  const { data } = await db()
    .from("stagity_invoices")
    .select("*, stagity_vendors(*), stagity_people(first_name, last_name, client_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { stagity_vendors, stagity_people, ...inv } = data;
  return { inv: inv as Invoice, vendor: stagity_vendors as Vendor, person: stagity_people as Loaded["person"] };
}

export async function pdfData({ inv, vendor, person }: Loaded): Promise<InvoicePdfData> {
  const today = todayCT();
  const issue = inv.issue_date ?? today;
  return {
    number: inv.number.startsWith("DRAFT-") ? "(assigned when sent)" : inv.number,
    issueDate: issue,
    dueDate: inv.due_date ?? addDays(issue, vendor.payment_terms_days),
    termsDays: vendor.payment_terms_days,
    vendor: { name: vendor.name, address: vendor.address, apEmail: vendor.ap_email },
    consultant: `${person.first_name} ${person.last_name}`,
    client: person.client_name,
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    poNumber: inv.po_number,
    regularHours: Number(inv.regular_hours),
    overtimeHours: Number(inv.overtime_hours),
    billRate: Number(inv.bill_rate),
    billOtRate: Number(inv.bill_ot_rate),
    total: Number(inv.total),
    paymentInstructions: await getSetting("invoice_payment_instructions"),
    notes: inv.notes,
    draft: inv.status === "draft",
  };
}

/** Approves a draft: assigns the invoice number, builds the PDF and emails it to the vendor. */
export async function approveAndSend(id: string, hr: string): Promise<{ error?: string; message?: string }> {
  await recomputeDraft(id); // pick up any rate change before sending
  const loaded = await loadInvoice(id);
  if (!loaded) return { error: "This draft no longer exists (its hours may have been sent back)." };
  const { inv, vendor, person } = loaded;
  if (inv.status !== "draft") return { error: "This invoice was already sent." };
  if (!vendor.active) return { error: `${vendor.name} is marked inactive.` };
  if (Number(inv.total) <= 0) return { error: "The invoice total is $0. Check the consultant's bill rate." };

  const { data: number, error: numErr } = await db().rpc("stagity_next_invoice_number");
  if (numErr || !number) return { error: "Couldn't assign an invoice number." };
  const issue = todayCT();
  const due = addDays(issue, vendor.payment_terms_days);
  const ready: Loaded = { ...loaded, inv: { ...inv, number: number as string, issue_date: issue, due_date: due, status: "sent" } };
  const pdf = await buildInvoicePdf({ ...(await pdfData(ready)), draft: false });

  const attachments: { filename: string; content: Uint8Array; contentType?: string }[] = [
    { filename: `Invoice ${number}.pdf`, content: pdf, contentType: "application/pdf" },
  ];
  if (vendor.attach_timesheets) {
    const { data: days } = await db().from("stagity_timesheet_days").select("timesheet_id").eq("invoice_id", id);
    const sheetIds = [...new Set((days ?? []).map((d) => d.timesheet_id as string))];
    const [{ data: files }, { data: sheets }] = await Promise.all([
      db().from("stagity_timesheet_files").select("timesheet_id, storage_path, original_name, mime_type").in("timesheet_id", sheetIds.length ? sheetIds : ["00000000-0000-0000-0000-000000000000"]),
      db().from("stagity_timesheets").select("id, week_start").in("id", sheetIds.length ? sheetIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const seen = new Set<string>();
    for (const f of files ?? []) {
      if (seen.has(f.storage_path)) continue;
      seen.add(f.storage_path);
      const { data: blob } = await db().storage.from(TS_BUCKET).download(f.storage_path);
      const week = sheets?.find((x) => x.id === f.timesheet_id)?.week_start ?? "";
      if (blob) attachments.push({ filename: `Approved timesheet ${week} - ${f.original_name ?? "file"}`, content: new Uint8Array(await blob.arrayBuffer()), contentType: f.mime_type ?? undefined });
    }
  }

  const consultant = `${person.first_name} ${person.last_name}`;
  const cc = (vendor.cc_emails ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const ok = await send(
    vendor.ap_email,
    `Invoice ${number}: ${consultant}, ${inv.period_start} to ${inv.period_end}`,
    [
      "Hello,",
      `Please find attached invoice ${number} for ${consultant}'s services${person.client_name ? ` at ${person.client_name}` : ""} from ${inv.period_start} to ${inv.period_end}.`,
      `Amount due: ${money(Number(inv.total))}, due by ${due}.${inv.po_number ? ` PO/reference: ${inv.po_number}.` : ""}`,
      ...(vendor.attach_timesheets ? ["The client-approved timesheets for this period are attached."] : []),
      `Please reply to this email or contact ${company.email} with any questions.`,
      "Thank you.",
    ],
    undefined,
    { cc, bcc: hrEmails(), attachments, signature: `${company.name} Accounts` },
  );
  if (!ok) return { error: "The email couldn't be sent, so the invoice is still a draft. Check the email settings and try again." };

  await db()
    .from("stagity_invoices")
    .update({ number, status: "sent", issue_date: issue, due_date: due, sent_at: new Date().toISOString(), sent_by: hr, sent_to: [vendor.ap_email, ...cc].join(", ") })
    .eq("id", id);
  await audit(null, `hr:${hr}`, "invoice_sent", { invoiceId: id, number, total: inv.total, to: vendor.ap_email });
  return { message: `Invoice ${number} sent to ${vendor.ap_email}.` };
}
