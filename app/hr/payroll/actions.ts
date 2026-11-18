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
  const includeLate = formData.get("includeLate") === "on";
  await db().from("stagity_payroll_runs").update({ include_late: includeLate }).eq("id", id);
  await rebuildItems({ ...run, include_late: includeLate });
  await audit(null, `hr:${hr}`, "payroll_recalculated", { runId: id, includeLate });
  revalidatePath(`/hr/payroll/${id}`);
}

export async function saveItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const { data: item } = await db().from("stagity_payroll_items").select("run_id").eq("id", id).single();
  if (!item || !(await draftRun(item.run_id))) return { error: "This payroll is locked." };
  const num = (k: string) => Math.round((Number(formData.get(k)) || 0) * 100) / 100;
  const bonus = num("bonus");
  const reimbursement = num("reimbursement");
  if (bonus < 0 || reimbursement < 0) return { error: "Amounts can't be negative." };
  await db()
    .from("stagity_payroll_items")
    .update({ bonus, reimbursement, note: String(formData.get("note") ?? "").slice(0, 300) || null })
    .eq("id", id);
  await audit(null, `hr:${hr}`, "payroll_item_updated", { itemId: id, bonus, reimbursement });
  revalidatePath(`/hr/payroll/${item.run_id}`);
  return { ok: true, message: "Saved" };
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
