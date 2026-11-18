import "server-only";
import { db } from "@/lib/i9/server";
import { autoSendEnabled, periodCompleteness, syncDraftInvoices } from "./server";
import { approveAndSend } from "./send";

/**
 * Daily: brings all approved hours onto drafts, then sends every draft whose period is over and
 * fully approved (e.g. a consultant's whole August, once every August timesheet is approved).
 */
export async function autoSendInvoices(opts: { force?: boolean } = {}): Promise<{ sent: string[]; failed: string[]; waiting: number }> {
  const { data: people } = await db().from("stagity_people").select("id").eq("kind", "consultant").not("vendor_id", "is", null);
  for (const p of people ?? []) await syncDraftInvoices(p.id);
  // `force` = HR clicked "Run automation now", which works even if the daily auto-send is switched off.
  if (!opts.force && !(await autoSendEnabled())) return { sent: [], failed: [], waiting: 0 };

  const { data: drafts } = await db()
    .from("stagity_invoices")
    .select("id, person_id, period_start, period_end, total, stagity_vendors(active, send_invoices)")
    .eq("status", "draft");
  const sent: string[] = [];
  const failed: string[] = [];
  let waiting = 0;
  for (const d of drafts ?? []) {
    const v = d.stagity_vendors as unknown as { active: boolean; send_invoices: boolean } | null;
    if (!v?.active || v.send_invoices === false || Number(d.total) <= 0) continue;
    const c = await periodCompleteness(d);
    if (!c.complete) {
      waiting++;
      continue;
    }
    const r = await approveAndSend(d.id, "automatic");
    (r.error ? failed : sent).push(r.error ? `${d.id}: ${r.error}` : r.message ?? d.id);
  }
  return { sent, failed, waiting };
}
