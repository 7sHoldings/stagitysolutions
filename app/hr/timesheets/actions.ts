"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr, siteOrigin } from "@/lib/i9/server";
import { sendTimesheetReminder, sendTimesheetReviewed } from "@/lib/portal/mail";
import { deadlineFor, monthLabel, payDateFor, periodLabel, sheetLabel, shortDate, todayCT } from "@/lib/portal/dates";
import { missingPeriods, monthOverview, type ConsultantRow } from "@/lib/portal/timesheets";
import type { ActionState } from "../actions";
import { releaseTimesheet, syncDraftInvoices } from "@/lib/invoices/server";

export async function reviewTimesheet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const { data: s } = await db().from("stagity_timesheets").select("*, stagity_people(first_name, email)").eq("id", id).single();
  if (!s) return { error: "Not found." };
  if (decision === "reject" && !note) return { error: "Add a comment telling the consultant why, e.g. the timesheet is not approved." };
  if (decision === "approve" && s.status !== "submitted") return { error: "Only submitted timesheets can be approved." };
  if (decision === "reject" && !["submitted", "approved"].includes(s.status)) return { error: "This timesheet can't be sent back." };
  if (decision === "reject") {
    const { count } = await db().from("stagity_timesheet_days").select("id", { count: "exact", head: true }).eq("timesheet_id", id).not("payroll_run_id", "is", null);
    if (count) return { error: "These hours are already in a payroll run. Fix it with a payroll adjustment instead." };
  }
  if (decision === "reject") {
    const blocked = await releaseTimesheet(id);
    if (blocked) return { error: blocked };
  }
  const approved = decision === "approve";
  await db()
    .from("stagity_timesheets")
    .update({ status: approved ? "approved" : "rejected", reviewed_at: new Date().toISOString(), reviewed_by: hr, review_note: note || null })
    .eq("id", id);
  await audit(null, `hr:${hr}`, approved ? "timesheet_approved" : "timesheet_rejected", { timesheetId: id, note: note || null });
  const person = s.stagity_people as { first_name: string; email: string };
  await sendTimesheetReviewed(person.email, person.first_name, sheetLabel(s.week_start), approved, note, `${siteOrigin()}/portal/timesheets/${s.week_start}`);
  let invoiceNote = "";
  if (approved) {
    const reason = await syncDraftInvoices(s.person_id);
    invoiceNote = reason ? ` Not invoiced: ${reason.toLowerCase()} for this consultant (People page).` : " Added to a draft vendor invoice.";
  }
  revalidatePath("/hr/timesheets");
  revalidatePath(`/hr/timesheets/${id}`);
  revalidatePath("/hr/invoices");
  return { ok: true, message: approved ? `Approved. The consultant was emailed.${invoiceNote}` : "Rejected. The consultant was emailed your comment." };
}

async function sendReminder(p: ConsultantRow, month: string, sheet: Parameters<typeof missingPeriods>[2], hr: string) {
  const weeks = missingPeriods(p, month, sheet);
  if (!weeks.length) return { skipped: true as const };
  const sent = await sendTimesheetReminder(
    p.email,
    p.first_name,
    `Reminder: timesheets for ${monthLabel(month)}`,
    [
      `We're still missing your approved timesheets for: ${weeks.map(periodLabel).join(", ")}.`,
      `Please fill in every weekday (0 for holidays or days off) and upload a screenshot of the approved timesheet from your client or vendor portal. ${monthLabel(month)} timesheets are due ${shortDate(deadlineFor(month))} and must be in before payroll on ${shortDate(payDateFor(month))}.`,
    ],
    `${siteOrigin()}/portal`,
  );
  if (sent) {
    await db().from("stagity_reminder_log").insert({ person_id: p.id, kind: "manual", sent_on: todayCT() }); // ignored if already logged today
    await audit(null, `hr:${hr}`, "timesheet_reminder_sent", { personId: p.id, month, weeks: weeks.map((w) => w.start) });
  }
  return { sent, weeks };
}

export async function remindConsultant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = String(formData.get("personId") ?? "");
  const month = String(formData.get("month") ?? "");
  const { consultants, sheet } = await monthOverview(month);
  const p = consultants.find((c) => c.id === personId);
  if (!p) return { error: "Not found." };
  const r = await sendReminder(p, month, sheet, hr);
  if ("skipped" in r) return { error: "Nothing is missing for this month." };
  revalidatePath("/hr/timesheets");
  return r.sent ? { ok: true, message: `Reminder sent to ${p.email}.` } : { error: "The email couldn't be sent. Check the timesheets@ email settings." };
}

export async function remindAll(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const month = String(formData.get("month") ?? "");
  const { consultants, sheet } = await monthOverview(month);
  let sent = 0;
  let failed = 0;
  for (const p of consultants.filter((c) => c.active)) {
    const r = await sendReminder(p, month, sheet, hr);
    if ("skipped" in r) continue;
    if (r.sent) sent++;
    else failed++;
  }
  revalidatePath("/hr/timesheets");
  if (!sent && !failed) return { error: "No one is missing timesheets for this month." };
  return failed ? { error: `Sent ${sent}, but ${failed} couldn't be sent. Check the timesheets@ email settings.` } : { ok: true, message: `Reminders sent to ${sent} consultant${sent === 1 ? "" : "s"}.` };
}
