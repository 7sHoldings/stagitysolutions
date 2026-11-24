"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr } from "@/lib/i9/server";
import { addDays } from "@/lib/portal/dates";
import type { ActionState } from "../actions";

/** Changes an unpaid invoice's payment terms: expected date = invoice date + N days. */
export async function setInvoiceTerms(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const days = Number(String(formData.get("days") ?? "").trim());
  if (!Number.isInteger(days) || days < 0 || days > 365) return { error: "Enter the number of days (0–365)." };
  const { data: inv } = await db().from("stagity_invoices").select("issue_date, status").eq("id", id).maybeSingle();
  if (!inv?.issue_date || inv.status === "draft" || inv.status === "void") return { error: "Only sent invoices have payment terms." };
  const due = addDays(inv.issue_date, days);
  await db().from("stagity_invoices").update({ due_date: due }).eq("id", id);
  await audit(null, `hr:${hr}`, "invoice_terms_changed", { invoiceId: id, days, due });
  revalidatePath("/hr/payments");
  revalidatePath(`/hr/invoices/${id}`);
  return { ok: true, message: `Expected by ${due}.` };
}
