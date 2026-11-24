import "server-only";
import { db } from "@/lib/i9/server";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Re-totals an invoice's payments. Fully settled (received + accepted difference ≥ total) → "paid"
 * with paid_at = the last payment date; otherwise it stays "sent" (outstanding or short-paid).
 */
export async function settle(invoiceId: string) {
  const [{ data: inv }, { data: pays }] = await Promise.all([
    db().from("stagity_invoices").select("total, adjustment, status").eq("id", invoiceId).single(),
    db().from("stagity_invoice_payments").select("amount, received_on").eq("invoice_id", invoiceId),
  ]);
  if (!inv || (inv.status !== "sent" && inv.status !== "paid")) return;
  const received = round2((pays ?? []).reduce((a, p) => a + Number(p.amount), 0));
  const done = received + Number(inv.adjustment) >= Number(inv.total) - 0.005;
  const last = (pays ?? []).map((p) => p.received_on as string).sort().pop() ?? null;
  await db()
    .from("stagity_invoices")
    .update({ amount_received: received, status: done ? "paid" : "sent", paid_at: done ? last : null })
    .eq("id", invoiceId);
  return { received, done };
}

/** What we expect to land in the bank: the total, less the vendor's VMS/admin fee if it has one. */
export const expectedAmount = (total: number, vmsPct: number | null | undefined) => round2(total * (1 - Number(vmsPct ?? 0) / 100));
