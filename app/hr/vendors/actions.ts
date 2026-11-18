"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr } from "@/lib/i9/server";
import type { ActionState } from "../actions";
import { assignConsultant } from "../people/actions";

const clip = (v: FormDataEntryValue | null, max = 300) => String(v ?? "").trim().slice(0, max);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/** "a@x.com; b@y.com, c@z.com" → ["a@x.com", "b@y.com", "c@z.com"] (lowercased, de-duplicated). */
const splitEmails = (v: string) => [...new Set(v.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

export async function saveVendor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const row = {
    name: clip(formData.get("name"), 160),
    ap_email: splitEmails(clip(formData.get("apEmail"), 500)).join(", "),
    cc_emails: splitEmails(clip(formData.get("ccEmails"), 500)).join(", ") || null,
    address: clip(formData.get("address"), 500) || null,
    payment_terms_days: Number(clip(formData.get("terms"), 4) || 30),
    billing_cycle: clip(formData.get("cycle"), 10) === "weekly" ? "weekly" : "monthly",
    attach_timesheets: formData.get("attach") === "on",
    active: id ? formData.get("active") === "on" : true,
    notes: clip(formData.get("notes"), 1000) || null,
    send_invoices: formData.get("sendInvoices") === "on",
  };
  if (!row.name) return { error: "Enter the vendor name." };
  if (row.send_invoices && !row.ap_email) return { error: "Enter the vendor email(s) for invoices, separated by commas." };
  if (row.ap_email && !row.ap_email.split(", ").every(emailOk)) return { error: "Check the vendor email(s), separated by commas." };
  if (row.cc_emails && !row.cc_emails.split(", ").every(emailOk)) return { error: "Check the CC emails (comma-separated)." };
  if (!Number.isInteger(row.payment_terms_days) || row.payment_terms_days < 0 || row.payment_terms_days > 180) return { error: "Payment terms must be 0–180 days." };

  // Optional first consultant (new vendor only): check before saving anything.
  const personId = id ? "" : clip(formData.get("personId"), 60);
  if (personId && !clip(formData.get("payRate"), 12) && !clip(formData.get("monthlyPay"), 12)) {
    return { error: "Enter the consultant's pay rate (or flat monthly pay), or leave the consultant empty." };
  }
  if (personId && row.send_invoices && !clip(formData.get("billRate"), 12)) {
    return { error: "Enter the consultant's bill rate, or leave the consultant empty." };
  }

  const { data: saved, error } = id
    ? await db().from("stagity_vendors").update(row).eq("id", id).select("id").single()
    : await db().from("stagity_vendors").insert(row).select("id").single();
  if (error || !saved) return { error: error?.message ?? "Couldn't save the vendor." };
  await audit(null, `hr:${hr}`, id ? "vendor_updated" : "vendor_created", { vendorId: saved.id, name: row.name });

  if (personId) {
    formData.set("vendorId", saved.id);
    const r = await assignConsultant({}, formData);
    if (r.error) return { error: `${row.name} was added, but the consultant wasn't: ${r.error}` };
  }
  revalidatePath("/hr/vendors");
  return { ok: true, message: id ? "Saved." : `${row.name} added${personId ? " with its consultant" : ""}.` };
}

/** Deletes a vendor. Refused if invoices were already sent to it; its consultants are simply unassigned. */
export async function deleteVendor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { data: v } = await db().from("stagity_vendors").select("id, name").eq("id", id).maybeSingle();
  if (!v) return { error: "Not found." };
  const { count } = await db().from("stagity_invoices").select("id", { count: "exact", head: true }).eq("vendor_id", id).neq("status", "draft");
  if (count) return { error: `Invoices were already sent to ${v.name}, so it must be kept for your records. Untick "Active" to hide it instead.` };
  const { data: drafts } = await db().from("stagity_invoices").select("id").eq("vendor_id", id);
  if (drafts?.length) {
    await db().from("stagity_timesheet_days").update({ invoice_id: null }).in("invoice_id", drafts.map((d) => d.id));
    await db().from("stagity_invoices").delete().in("id", drafts.map((d) => d.id));
  }
  await db().from("stagity_people").update({ vendor_id: null }).eq("vendor_id", id);
  const { error } = await db().from("stagity_vendors").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, "vendor_deleted", { vendorId: id, name: v.name });
  revalidatePath("/hr/vendors");
  return { ok: true, message: `${v.name} deleted.` };
}
