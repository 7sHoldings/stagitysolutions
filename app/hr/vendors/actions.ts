"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr } from "@/lib/i9/server";
import type { ActionState } from "../actions";

const clip = (v: FormDataEntryValue | null, max = 300) => String(v ?? "").trim().slice(0, max);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function saveVendor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const row = {
    name: clip(formData.get("name"), 160),
    ap_email: clip(formData.get("apEmail"), 200).toLowerCase(),
    cc_emails: clip(formData.get("ccEmails"), 500).toLowerCase() || null,
    address: clip(formData.get("address"), 500) || null,
    payment_terms_days: Number(clip(formData.get("terms"), 4) || 30),
    billing_cycle: clip(formData.get("cycle"), 10) === "weekly" ? "weekly" : "monthly",
    attach_timesheets: formData.get("attach") === "on",
    active: id ? formData.get("active") === "on" : true,
    notes: clip(formData.get("notes"), 1000) || null,
  };
  if (!row.name) return { error: "Enter the vendor name." };
  if (!emailOk(row.ap_email)) return { error: "Enter a valid invoice (AP) email." };
  if (row.cc_emails && !row.cc_emails.split(",").every((e) => emailOk(e.trim()))) return { error: "Check the CC emails (comma-separated)." };
  if (!Number.isInteger(row.payment_terms_days) || row.payment_terms_days < 0 || row.payment_terms_days > 180) return { error: "Payment terms must be 0–180 days." };

  const { error } = id ? await db().from("stagity_vendors").update(row).eq("id", id) : await db().from("stagity_vendors").insert(row);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, id ? "vendor_updated" : "vendor_created", { vendorId: id || null, name: row.name });
  revalidatePath("/hr/vendors");
  return { ok: true, message: id ? "Saved." : `${row.name} added.` };
}
