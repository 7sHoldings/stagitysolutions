import "server-only";
import { randomBytes } from "node:crypto";
import { audit, db, siteOrigin } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { addMonths, monthLabel } from "@/lib/portal/dates";
import { company } from "@/lib/content";

export type AckRow = {
  id: string; campaign: string; name: string; email: string; token: string;
  start_month: string | null; ack_by: string | null; sent_at: string | null; send_count: number; acknowledged_at: string | null;
};

export const newToken = () => randomBytes(24).toString("base64url");

/** "2026-11-25" → "Wednesday, November 25, 2026" */
export const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export const announcementSubject = (startMonth: string) =>
  `Action required: New timesheet process starting with ${monthLabel(startMonth)} timesheets. Please acknowledge`;

/**
 * The announcement text. Used for the email, the in-app preview and the acknowledgment page,
 * so all three always say the same thing.
 */
export function announcementBody(firstName: string, startMonth: string, ackBy: string | null): string[] {
  const month = monthLabel(startMonth);
  const next = monthLabel(addMonths(startMonth, 1));
  return [
    `Hi ${firstName},`,
    `We're moving our timesheet and payroll process to the new Stagity Solutions employee portal, starting with your ${month} timesheets. This replaces sending timesheets by email.`,
    "## What's changing",
    [
      `• In the next few days you'll get a separate email from ${company.email} with your portal login and a temporary password.`,
      "• Each week you'll enter your hours in the portal and upload your approved timesheet (a screenshot or PDF from your client or vendor portal).",
      `• You'll get automatic reminders from ${company.timesheetsEmail}.`,
    ].join("\n"),
    "## Weekly timesheets",
    [
      "• Weeks run Sunday to Saturday.",
      "• Enter hours for every weekday (Monday to Friday). Enter 0 for holidays, PTO or days you didn't work.",
      "• Upload the client-approved timesheet for that week. It must show the Approved status and the hours per day. Unapproved timesheets will be returned.",
      "• Submit by the Tuesday after each week ends. You'll get a reminder on Tuesday, and again each day through Friday if it's still missing.",
    ].join("\n"),
    "## Monthly deadline and payroll",
    [
      `• All approved timesheets for a month must be submitted by the 5th of the following month. For example, ${month} timesheets are due by ${next.split(" ")[0]} 5.`,
      "• Payroll is processed on the 20th of each month, or the Friday before if the 20th falls on a weekend.",
      "• If your timesheets are not submitted and approved before payroll is processed, your pay for those hours will move to the following month's payroll.",
    ].join("\n"),
    "## After you submit",
    [
      "• HR reviews your timesheet. You'll get an email when it's approved.",
      "• If something is wrong, it will be returned with a comment. Fix it and submit again.",
      "• After you sign in, click Help in the menu for the full step-by-step guide.",
    ].join("\n"),
    "## Please acknowledge",
    `Click the button below to confirm you've read and understood the new process${ackBy ? `, by ${longDate(ackBy)}` : ""}.`,
    `If you have any questions, reply to this email or contact us at ${company.timesheetsEmail} or ${company.phone}.`,
    "Thank you,",
  ];
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Emails the announcement to one recipient with their personal "I acknowledge" link. */
export async function sendAnnouncement(row: AckRow, hr: string): Promise<boolean> {
  if (!row.start_month) return false;
  const ok = await send(
    row.email,
    announcementSubject(row.start_month),
    announcementBody(firstNameOf(row.name), row.start_month, row.ack_by),
    { label: "I acknowledge", href: `${siteOrigin()}/ack/${row.token}` },
    { from: "timesheets", replyTo: company.timesheetsEmail, signature: "Stagity Solutions" },
  );
  if (ok) {
    await db().from("stagity_acknowledgments").update({ sent_at: new Date().toISOString(), send_count: row.send_count + 1 }).eq("id", row.id);
    await audit(null, `hr:${hr}`, "announcement_sent", { campaign: row.campaign, email: row.email, n: row.send_count + 1 });
  }
  return ok;
}
