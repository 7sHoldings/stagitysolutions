import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/i9/server";
import { addDays, monthEnd, monthStart, mondayOf, round2, todayCT } from "@/lib/portal/dates";

export type Vendor = {
  id: string; name: string; ap_email: string; cc_emails: string | null; address: string | null;
  payment_terms_days: number; billing_cycle: "weekly" | "monthly"; attach_timesheets: boolean; active: boolean; notes: string | null;
};

export type Invoice = {
  id: string; number: string; vendor_id: string; person_id: string; period_start: string; period_end: string;
  status: "draft" | "sent" | "paid" | "void"; regular_hours: number; overtime_hours: number; bill_rate: number; bill_ot_rate: number;
  total: number; po_number: string | null; notes: string | null; issue_date: string | null; due_date: string | null;
  sent_at: string | null; sent_by: string | null; sent_to: string | null; paid_at: string | null; voided_reason: string | null;
};

export const isDraftNumber = (n: string) => n.startsWith("DRAFT-");

/** Vendor invoices bill every hour worked (regular + overtime) at the consultant's bill rate. */
export function invoiceTotal(i: { regular_hours: number; overtime_hours: number; bill_rate: number }) {
  return round2((Number(i.regular_hours) + Number(i.overtime_hours)) * Number(i.bill_rate));
}

export async function getSetting(key: string): Promise<string> {
  const { data } = await db().from("stagity_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}

/** Recalculates a draft's hours and totals from its attached timesheet days. Deletes empty drafts. */
export async function recomputeDraft(invoiceId: string) {
  const { data: inv } = await db().from("stagity_invoices").select("*, stagity_people(bill_rate, po_number)").eq("id", invoiceId).single();
  if (!inv || inv.status !== "draft") return;
  const { data: days } = await db().from("stagity_timesheet_days").select("regular_hours, overtime_hours").eq("invoice_id", invoiceId);
  if (!days?.length) {
    await db().from("stagity_invoices").delete().eq("id", invoiceId);
    return;
  }
  const p = inv.stagity_people as { bill_rate: number | null; po_number: string | null };
  const rate = Number(p.bill_rate ?? 0);
  const otRate = rate; // overtime hours are billed at the same rate
  const regular = round2(days.reduce((a, d) => a + Number(d.regular_hours), 0));
  const overtime = round2(days.reduce((a, d) => a + Number(d.overtime_hours), 0));
  await db()
    .from("stagity_invoices")
    .update({
      regular_hours: regular,
      overtime_hours: overtime,
      bill_rate: rate,
      bill_ot_rate: otRate,
      total: invoiceTotal({ regular_hours: regular, overtime_hours: overtime, bill_rate: rate }),
      po_number: inv.po_number ?? p.po_number,
    })
    .eq("id", invoiceId);
}

/**
 * Puts a consultant's approved, not-yet-invoiced hours onto draft invoices
 * (one per week or per month, following the vendor's billing cycle).
 * Returns a reason if invoicing isn't set up for this person.
 */
export async function syncDraftInvoices(personId: string): Promise<string | null> {
  const { data: p } = await db().from("stagity_people").select("id, vendor_id, bill_rate, stagity_vendors(billing_cycle, active)").eq("id", personId).single();
  if (!p) return "Not found";
  const vendor = p.stagity_vendors as unknown as { billing_cycle: "weekly" | "monthly"; active: boolean } | null;
  if (!p.vendor_id || !vendor) return "No vendor set";
  if (p.bill_rate == null) return "No bill rate set";

  const { data: days } = await db()
    .from("stagity_timesheet_days")
    .select("id, work_date, stagity_timesheets!inner(status)")
    .eq("person_id", personId)
    .is("invoice_id", null)
    .gt("hours", 0)
    .eq("stagity_timesheets.status", "approved");
  if (!days?.length) return null;

  const groups = new Map<string, string[]>();
  for (const d of days) {
    const start = vendor.billing_cycle === "weekly" ? mondayOf(d.work_date) : monthStart(d.work_date);
    groups.set(start, [...(groups.get(start) ?? []), d.id]);
  }
  for (const [start, ids] of groups) {
    const end = vendor.billing_cycle === "weekly" ? addDays(start, 6) : monthEnd(start);
    let { data: draft } = await db().from("stagity_invoices").select("id").eq("person_id", personId).eq("period_start", start).eq("status", "draft").maybeSingle();
    if (!draft) {
      const ins = await db()
        .from("stagity_invoices")
        .insert({ number: `DRAFT-${randomUUID()}`, vendor_id: p.vendor_id, person_id: personId, period_start: start, period_end: end })
        .select("id")
        .single();
      draft = ins.data;
    }
    if (!draft) continue;
    await db().from("stagity_timesheet_days").update({ invoice_id: draft.id }).in("id", ids);
    await recomputeDraft(draft.id);
  }
  return null;
}

/**
 * Called before a timesheet is sent back: removes its hours from draft invoices.
 * Returns an error if the hours are already on an invoice that was sent.
 */
export async function releaseTimesheet(timesheetId: string): Promise<string | null> {
  const { data: days } = await db().from("stagity_timesheet_days").select("id, invoice_id, stagity_invoices(status, number)").eq("timesheet_id", timesheetId).not("invoice_id", "is", null);
  const sent = days?.find((d) => (d.stagity_invoices as unknown as { status: string } | null)?.status !== "draft");
  if (sent) {
    const n = (sent.stagity_invoices as unknown as { number: string }).number;
    return `These hours are on invoice ${n}, which was already sent. Void that invoice first.`;
  }
  const drafts = [...new Set((days ?? []).map((d) => d.invoice_id as string))];
  if (days?.length) await db().from("stagity_timesheet_days").update({ invoice_id: null }).in("id", days.map((d) => d.id));
  for (const id of drafts) await recomputeDraft(id);
  return null;
}

/** Expected vs approved weeks for a draft's period (so HR knows if a monthly invoice is complete). */
export async function periodCompleteness(inv: Pick<Invoice, "person_id" | "period_start" | "period_end">) {
  const { data: person } = await db().from("stagity_people").select("start_date, end_date").eq("id", inv.person_id).single();
  const today = todayCT();
  const weeks: string[] = [];
  for (let w = mondayOf(inv.period_start); w <= inv.period_end; w = addDays(w, 7)) {
    if (w > mondayOf(today)) break;
    if (person?.start_date && addDays(w, 6) < person.start_date) continue;
    if (person?.end_date && w > person.end_date) continue;
    weeks.push(w);
  }
  const { data: sheets } = await db().from("stagity_timesheets").select("week_start, status").eq("person_id", inv.person_id).in("week_start", weeks.length ? weeks : ["1900-01-01"]);
  const approved = weeks.filter((w) => sheets?.some((s) => s.week_start === w && s.status === "approved")).length;
  const periodOver = inv.period_end < today;
  return { expected: weeks.length, approved, complete: periodOver && approved === weeks.length };
}
