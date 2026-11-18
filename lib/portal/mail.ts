import "server-only";
import { send } from "@/lib/i9/mail";

export function sendTimesheetReminder(to: string, firstName: string, subject: string, lines: string[], link: string) {
  return send(to, subject, [`Hi ${firstName},`, ...lines], { label: "Submit timesheet", href: link });
}

export function sendTimesheetReviewed(to: string, firstName: string, week: string, approved: boolean, note: string, link: string) {
  return send(
    to,
    approved ? `Timesheet approved: ${week}` : `Timesheet needs changes: ${week}`,
    approved
      ? [`Hi ${firstName},`, `HR approved your timesheet for ${week}. Thank you!`]
      : [`Hi ${firstName},`, `HR sent back your timesheet for ${week}.`, `Note from HR: ${note || "(none)"}`, "Please fix it and submit again."],
    { label: "Open timesheet", href: link },
  );
}

export function sendHrDigest(to: string, subject: string, lines: string[], link: string) {
  return send(to, subject, lines, { label: "Open HR portal", href: link });
}
