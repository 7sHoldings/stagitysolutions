"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr } from "@/lib/i9/server";
import type { ActionState } from "../actions";

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
  };
  if (!row.name) return { error: "Enter the vendor name." };
  if (!row.ap_email || !row.ap_email.split(", ").every(emailOk)) return { error: "Enter the vendor email(s) for invoices, separated by commas." };
  if (row.cc_emails && !row.cc_emails.split(", ").every(emailOk)) return { error: "Check the CC emails (comma-separated)." };
  if (!Number.isInteger(row.payment_terms_days) || row.payment_terms_days < 0 || row.payment_terms_days > 180) return { error: "Payment terms must be 0–180 days." };

  const { error } = id ? await db().from("stagity_vendors").update(row).eq("id", id) : await db().from("stagity_vendors").insert(row);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, id ? "vendor_updated" : "vendor_created", { vendorId: id || null, name: row.name });
  revalidatePath("/hr/vendors");
  return { ok: true, message: id ? "Saved." : `${row.name} added.` };
}
