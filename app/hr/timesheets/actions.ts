"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr, siteOrigin } from "@/lib/i9/server";
import { sendTimesheetReminder, sendTimesheetReviewed } from "@/lib/portal/mail";
import { deadlineFor, monthLabel, weekLabel } from "@/lib/portal/dates";
import { missingWeeks, monthOverview } from "@/lib/portal/timesheets";
import type { ActionState } from "../actions";
import { releaseTimesheet, syncDraftInvoices } from "@/lib/invoices/server";

export async function reviewTimesheet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const { data: s } = await db().from("stagity_timesheets").select("*, stagity_people(first_name, email)").eq("id", id).single();
  if (!s) return { error: "Not found." };
  if (decision === "reject" && !note) return { error: "Add a note telling the consultant what to fix." };
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
  await sendTimesheetReviewed(person.email, person.first_name, weekLabel(s.week_start), approved, note, `${siteOrigin()}/portal/timesheets/${s.week_start}`);
  let invoiceNote = "";
  if (approved) {
    const reason = await syncDraftInvoices(s.person_id);
    invoiceNote = reason ? ` Not invoiced: ${reason.toLowerCase()} for this consultant (People page).` : " Added to a draft vendor invoice.";
  }
  revalidatePath("/hr/timesheets");
  revalidatePath(`/hr/timesheets/${id}`);
  revalidatePath("/hr/invoices");
  return { ok: true, message: approved ? `Approved.${invoiceNote}` : "Sent back to the consultant." };
}

export async function remindConsultant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = String(formData.get("personId") ?? "");
  const month = String(formData.get("month") ?? "");
  const { consultants, sheet } = await monthOverview(month);
  const p = consultants.find((c) => c.id === personId);
  if (!p) return { error: "Not found." };
  const weeks = missingWeeks(p, month, sheet);
  if (!weeks.length) return { error: "Nothing is missing for this month." };
  const sent = await sendTimesheetReminder(
    p.email,
    p.first_name,
    `Reminder: timesheets for ${monthLabel(month)}`,
    [
      `We're still missing your approved timesheets for: ${weeks.map(weekLabel).join(", ")}.`,
      `Please enter your hours and upload the client-approved timesheets by ${deadlineFor(month)} so you're included in payroll.`,
    ],
    `${siteOrigin()}/portal`,
  );
  await audit(null, `hr:${hr}`, "timesheet_reminder_sent", { personId, month, weeks });
  return sent ? { ok: true, message: `Reminder sent to ${p.email}.` } : { error: "Email failed." };
}
