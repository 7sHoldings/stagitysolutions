"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr } from "@/lib/i9/server";
import { recomputeDraft, syncDraftInvoices } from "@/lib/invoices/server";
import { approveAndSend } from "@/lib/invoices/send";
import { requestInvoiceReviews } from "@/lib/invoices/auto";
import { todayCT } from "@/lib/portal/dates";
import { round2, settle } from "@/lib/invoices/payments";
import { sendPaymentReminder, sendShortPaymentEmail } from "@/lib/invoices/send";
import type { ActionState } from "../actions";

const clip = (v: FormDataEntryValue | null, max = 500) => String(v ?? "").trim().slice(0, max);

function refresh(id?: string) {
  revalidatePath("/hr/invoices");
  revalidatePath("/hr/payments");
  revalidatePath("/hr");
  if (id) revalidatePath(`/hr/invoices/${id}`);
}

export async function sendInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const r = await approveAndSend(id, hr);
  refresh(id);
  return r.error ? { error: r.error } : { ok: true, message: r.message };
}

export async function updateDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { error } = await db()
    .from("stagity_invoices")
    .update({ po_number: clip(formData.get("poNumber"), 80) || null, notes: clip(formData.get("notes"), 1000) || null })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { error: error.message };
  await recomputeDraft(id);
  await audit(null, `hr:${hr}`, "invoice_draft_updated", { invoiceId: id });
  refresh(id);
  return { ok: true, message: "Saved." };
}

/** Records money received for an invoice (full or partial). Fully paid invoices are closed automatically. */
export async function markPaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const paidOn = clip(formData.get("paidOn"), 10) || todayCT();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > todayCT()) return { error: "Enter the date the money arrived (not in the future)." };
  const { data: inv } = await db().from("stagity_invoices").select("status, total, amount_received, adjustment, imported").eq("id", id).single();
  if (!inv || inv.status !== "sent") return { error: "This invoice isn't waiting for payment." };
  // An old invoice with no amount entered: just mark it paid.
  if (inv.imported && Number(inv.total) <= 0) {
    await db().from("stagity_invoices").update({ status: "paid", paid_at: paidOn }).eq("id", id);
    await audit(null, `hr:${hr}`, "invoice_payment_recorded", { invoiceId: id, paidOn, noAmount: true });
    refresh(id);
    return { ok: true, message: "Marked paid." };
  }
  const amount = round2(Number(clip(formData.get("amount"), 14)));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount received." };
  const left = round2(Number(inv.total) - Number(inv.amount_received) - Number(inv.adjustment));
  if (amount > left + 0.005) return { error: `That's more than what's left on this invoice (${left.toFixed(2)}).` };
  await db().from("stagity_invoice_payments").insert({ invoice_id: id, amount, received_on: paidOn, note: clip(formData.get("note"), 300) || null, created_by: hr });
  const r = await settle(id);
  await audit(null, `hr:${hr}`, "invoice_payment_recorded", { invoiceId: id, amount, paidOn });
  refresh(id);
  if (r?.done) return { ok: true, message: "Paid in full." };
  return { ok: true, message: `Recorded. ${(left - amount).toFixed(2)} still short.` };
}

/** Old invoices (sent before the portal): fix the amount, invoice number or invoice date. */
export async function editImported(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const number = clip(formData.get("number"), 40);
  const issue = clip(formData.get("issueDate"), 10);
  const totalRaw = clip(formData.get("total"), 14);
  const total = totalRaw ? round2(Number(totalRaw)) : 0;
  if (!number) return { error: "Enter the invoice number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) return { error: "Enter the invoice date." };
  if (!Number.isFinite(total) || total < 0) return { error: "Enter a valid amount." };
  const { data: inv } = await db()
    .from("stagity_invoices")
    .select("imported, status, amount_received, stagity_people(payment_terms_days), stagity_vendors(payment_terms_days)")
    .eq("id", id)
    .single();
  if (!inv?.imported) return { error: "Only old invoices can be edited." };
  if (total > 0 && Number(inv.amount_received) > total) return { error: "The amount can't be less than what's already been received." };
  const terms = (inv.stagity_people as unknown as { payment_terms_days: number | null })?.payment_terms_days ?? (inv.stagity_vendors as unknown as { payment_terms_days: number })?.payment_terms_days ?? 30;
  const { addDays } = await import("@/lib/portal/dates");
  const { error } = await db()
    .from("stagity_invoices")
    .update({ number, issue_date: issue, due_date: addDays(issue, terms), total, sent_at: `${issue}T12:00:00Z` })
    .eq("id", id);
  if (error) return { error: error.message.includes("duplicate") ? "Another invoice already has that number." : error.message };
  if (Number(inv.amount_received) > 0) await settle(id);
  await audit(null, `hr:${hr}`, "invoice_old_edited", { invoiceId: id, number, issue, total });
  refresh(id);
  return { ok: true, message: "Saved." };
}

/** Removes an old-invoice placeholder that doesn't apply (e.g. the consultant wasn't working that month). */
export async function removeImported(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { data: inv } = await db().from("stagity_invoices").select("imported, number").eq("id", id).single();
  if (!inv?.imported) return { error: "Only old invoices can be removed." };
  await db().from("stagity_invoice_payments").delete().eq("invoice_id", id);
  await db().from("stagity_invoices").delete().eq("id", id);
  await audit(null, `hr:${hr}`, "invoice_old_removed", { invoiceId: id, number: inv.number });
  refresh();
  return { ok: true, message: "Removed." };
}

/** Undo: removes every recorded payment and accepted difference, back to "awaiting payment". */
export async function markUnpaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  await db().from("stagity_invoice_payments").delete().eq("invoice_id", id);
  await db().from("stagity_invoices").update({ status: "sent", paid_at: null, amount_received: 0, adjustment: 0, adjustment_reason: null }).eq("id", id).in("status", ["sent", "paid"]);
  await audit(null, `hr:${hr}`, "invoice_unpaid", { invoiceId: id });
  refresh(id);
  return { ok: true, message: "Payments cleared. Waiting for payment again." };
}

/** Accepts the shortfall (e.g. VMS fee, discount) and closes the invoice as paid. */
export async function acceptDifference(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const reason = clip(formData.get("reason"), 40);
  const note = clip(formData.get("note"), 300);
  if (!["VMS fee", "Discount", "Timesheet correction", "Other"].includes(reason)) return { error: "Choose a reason." };
  if (reason === "Other" && !note) return { error: "Add a short note for 'Other'." };
  const { data: inv } = await db().from("stagity_invoices").select("status, total, amount_received, adjustment").eq("id", id).single();
  if (!inv || inv.status !== "sent" || Number(inv.amount_received) <= 0) return { error: "Record the payment you received first." };
  const diff = round2(Number(inv.total) - Number(inv.amount_received));
  await db().from("stagity_invoices").update({ adjustment: diff, adjustment_reason: note ? `${reason}: ${note}` : reason }).eq("id", id);
  await settle(id);
  await audit(null, `hr:${hr}`, "invoice_difference_accepted", { invoiceId: id, diff, reason, note });
  refresh(id);
  return { ok: true, message: `Closed. ${diff.toFixed(2)} accepted as ${reason}.` };
}

/** Emails the vendor about a short payment and asks them to pay the balance or explain it. */
export async function emailShortPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const extra = clip(formData.get("message"), 1500);
  const r = await sendShortPaymentEmail(id, extra);
  if (r.error) return { error: r.error };
  await audit(null, `hr:${hr}`, "invoice_short_payment_emailed", { invoiceId: id });
  refresh(id);
  return { ok: true, message: r.message };
}

export async function voidInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const reason = clip(formData.get("reason"), 300);
  if (!reason) return { error: "Enter a reason for voiding." };
  const { data: inv } = await db().from("stagity_invoices").select("person_id, status, number").eq("id", id).single();
  if (!inv || !["sent", "draft"].includes(inv.status)) return { error: "Only drafts and unpaid sent invoices can be voided." };
  if (inv.status === "draft") return { error: "Drafts don't need voiding. Send the timesheet back instead if the hours are wrong." };
  await db().from("stagity_invoices").update({ status: "void", voided_reason: reason }).eq("id", id);
  // Free the hours so a corrected invoice can be created.
  await db().from("stagity_timesheet_days").update({ invoice_id: null }).eq("invoice_id", id);
  await syncDraftInvoices(inv.person_id);
  await audit(null, `hr:${hr}`, "invoice_voided", { invoiceId: id, number: inv.number, reason });
  refresh(id);
  return { ok: true, message: `Invoice ${inv.number} voided. Its hours are back on a new draft so you can correct and resend.` };
}

export async function refreshDrafts(): Promise<void> {
  const hr = await requireHr();
  const { data: people } = await db().from("stagity_people").select("id").eq("kind", "consultant").not("vendor_id", "is", null);
  for (const p of people ?? []) await syncDraftInvoices(p.id);
  const { data: drafts } = await db().from("stagity_invoices").select("id").eq("status", "draft");
  for (const d of drafts ?? []) await recomputeDraft(d.id);
  await audit(null, `hr:${hr}`, "invoice_drafts_refreshed");
  refresh();
}

/**
 * "Check now": updates drafts and emails the team about any invoice that just became ready
 * (same as the morning check). Never sends anything to a vendor.
 */
export async function checkReadyNow(_prev: ActionState): Promise<ActionState> {
  const hr = await requireHr();
  const r = await requestInvoiceReviews();
  await audit(null, `hr:${hr}`, "invoice_check_now", { notified: r.notified.length, failed: r.failed.length, waiting: r.waiting });
  refresh();
  if (r.failed.length) return { error: `Couldn't email the review for: ${r.failed.join("; ")}. Check the email settings.` };
  if (r.notified.length) return { ok: true, message: `Ready for review (email sent to the team): ${r.notified.join(", ")}.` };
  return { ok: true, message: r.waiting ? `Nothing new is ready. ${r.waiting} draft${r.waiting === 1 ? " is" : "s are"} still waiting for approved timesheets or the end of the month.` : "Nothing new is ready." };
}

/** Emails one vendor a payment reminder for the selected unpaid invoices. */
export async function remindVendor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const ids = clip(formData.get("ids"), 4000).split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const r = await sendPaymentReminder(ids, clip(formData.get("message"), 1500));
  if (r.error) return { error: r.error };
  await audit(null, `hr:${hr}`, "vendor_payment_reminder", { invoices: ids });
  refresh();
  return { ok: true, message: r.message };
}
