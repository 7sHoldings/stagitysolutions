"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr } from "@/lib/i9/server";
import { recomputeDraft, syncDraftInvoices } from "@/lib/invoices/server";
import { approveAndSend } from "@/lib/invoices/send";
import { todayCT } from "@/lib/portal/dates";
import type { ActionState } from "../actions";

const clip = (v: FormDataEntryValue | null, max = 500) => String(v ?? "").trim().slice(0, max);

function refresh(id?: string) {
  revalidatePath("/hr/invoices");
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

export async function markPaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const paidOn = clip(formData.get("paidOn"), 10) || todayCT();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Enter a valid date." };
  await db().from("stagity_invoices").update({ status: "paid", paid_at: paidOn }).eq("id", id).eq("status", "sent");
  await audit(null, `hr:${hr}`, "invoice_paid", { invoiceId: id, paidOn });
  refresh(id);
  return { ok: true, message: "Marked as paid." };
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

export async function saveInvoiceSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const value = clip(formData.get("paymentInstructions"), 1500);
  await db().from("stagity_settings").upsert({ key: "invoice_payment_instructions", value, updated_at: new Date().toISOString(), updated_by: hr });
  await audit(null, `hr:${hr}`, "invoice_settings_updated");
  refresh();
  return { ok: true, message: "Saved." };
}
