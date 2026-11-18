"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, db, requireHr } from "@/lib/i9/server";
import { monthStart, payDateFor } from "@/lib/portal/dates";
import { rebuildItems } from "@/lib/portal/payroll";
import type { ActionState } from "../actions";

export async function createRun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const ym = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(ym)) return { error: "Choose a month." };
  const period = monthStart(`${ym}-01`);
  const { data: dup } = await db().from("stagity_payroll_runs").select("id").eq("period_month", period).maybeSingle();
  if (dup) redirect(`/hr/payroll/${dup.id}`);
  const { data: run, error } = await db()
    .from("stagity_payroll_runs")
    .insert({ period_month: period, pay_date: payDateFor(period), created_by: hr })
    .select("*")
    .single();
  if (error || !run) return { error: error?.message ?? "Couldn't create the run." };
  await rebuildItems(run);
  await audit(null, `hr:${hr}`, "payroll_created", { runId: run.id, period });
  redirect(`/hr/payroll/${run.id}`);
}

async function draftRun(id: string) {
  const { data } = await db().from("stagity_payroll_runs").select("*").eq("id", id).single();
  return data?.status === "draft" ? data : null;
}

export async function recalculate(formData: FormData) {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const run = await draftRun(id);
  if (!run) return;
  await rebuildItems(run);
  await audit(null, `hr:${hr}`, "payroll_recalculated", { runId: id });
  revalidatePath(`/hr/payroll/${id}`);
}

/**
 * Edits one payroll line. Changing hours, rate or the flat amount marks the line as edited by hand,
 * so "Recalculate" keeps HR's numbers. Bonus / reimbursement / note alone don't.
 */
export async function saveItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const { data: item } = await db().from("stagity_payroll_items").select("*").eq("id", id).single();
  if (!item || !(await draftRun(item.run_id))) return { error: "This payroll is locked." };
  const raw = (k: string) => String(formData.get(k) ?? "").trim();
  const num = (k: string) => Math.round((Number(raw(k)) || 0) * 100) / 100;
  const payType = raw("payType") === "flat" ? "flat" : "hourly";
  const update = {
    regular_hours: num("regular"),
    overtime_hours: num("overtime"),
    rate: num("rate"),
    flat_amount: payType === "flat" ? num("flat") : null,
    bonus: num("bonus"),
    reimbursement: num("reimbursement"),
    note: raw("note").slice(0, 300) || null,
  };
  if (Object.values(update).some((v) => typeof v === "number" && (v < 0 || v > 1_000_000))) return { error: "Amounts must be between 0 and 1,000,000." };
  if (payType === "flat" && !raw("flat")) return { error: "Enter the flat amount, or switch to hourly." };
  const changed =
    update.regular_hours !== Number(item.regular_hours) ||
    update.overtime_hours !== Number(item.overtime_hours) ||
    update.rate !== Number(item.rate) ||
    (update.flat_amount ?? null) !== (item.flat_amount == null ? null : Number(item.flat_amount));
  await db().from("stagity_payroll_items").update({ ...update, manual: item.manual || changed }).eq("id", id);
  await audit(null, `hr:${hr}`, "payroll_item_updated", { itemId: id, ...update, manual: item.manual || changed });
  revalidatePath(`/hr/payroll/${item.run_id}`);
  return { ok: true, message: "Saved" };
}

/** Throws away HR's hand edits on a line and recalculates it from timesheets / the person's pay setup. */
export async function resetItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const { data: item } = await db().from("stagity_payroll_items").select("run_id").eq("id", id).single();
  const run = item ? await draftRun(item.run_id) : null;
  if (!item || !run) return { error: "This payroll is locked." };
  await db().from("stagity_payroll_items").update({ manual: false }).eq("id", id);
  await rebuildItems(run);
  await audit(null, `hr:${hr}`, "payroll_item_reset", { itemId: id });
  revalidatePath(`/hr/payroll/${item.run_id}`);
  return { ok: true, message: "Recalculated" };
}

/** Adds someone to this month's payroll by hand (e.g. a one-off payment). */
export async function addItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const runId = String(formData.get("runId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  if (!(await draftRun(runId))) return { error: "This payroll is locked." };
  if (!personId) return { error: "Choose a person." };
  const { data: dup } = await db().from("stagity_payroll_items").select("id").eq("run_id", runId).eq("person_id", personId).maybeSingle();
  if (dup) return { error: "They're already on this payroll. Edit their line instead." };
  const amount = Math.round((Number(formData.get("amount")) || 0) * 100) / 100;
  if (amount <= 0) return { error: "Enter the amount to pay." };
  await db().from("stagity_payroll_items").insert({ run_id: runId, person_id: personId, flat_amount: amount, manual: true, note: String(formData.get("note") ?? "").slice(0, 300) || null });
  await audit(null, `hr:${hr}`, "payroll_item_added", { runId, personId, amount });
  revalidatePath(`/hr/payroll/${runId}`);
  return { ok: true, message: "Added" };
}

export async function lockRun(formData: FormData) {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const run = await draftRun(id);
  if (!run) return;
  const days = await rebuildItems(run); // final recalculation
  if (days.length) {
    await db().from("stagity_timesheet_days").update({ payroll_run_id: id }).in("id", days.map((d) => d.id));
  }
  await db().from("stagity_payroll_runs").update({ status: "locked", locked_at: new Date().toISOString(), locked_by: hr }).eq("id", id);
  await audit(null, `hr:${hr}`, "payroll_locked", { runId: id, days: days.length });
  revalidatePath(`/hr/payroll/${id}`);
  revalidatePath("/hr/payroll");
}
