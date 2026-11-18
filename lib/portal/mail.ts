import "server-only";
import { send } from "@/lib/i9/mail";
import { db, siteOrigin } from "@/lib/i9/server";
import { TS_BUCKET } from "./server";
import { dayName, periodFor, periodLabel } from "./dates";

export function sendTimesheetReminder(to: string, firstName: string, subject: string, lines: string[], link: string) {
  return send(to, subject, [`Hi ${firstName},`, ...lines], { label: "Submit timesheet", href: link });
}

export function sendTimesheetReviewed(to: string, firstName: string, week: string, approved: boolean, note: string, link: string) {
  return send(
    to,
    approved ? `Timesheet approved: ${week}` : `Timesheet not approved: ${week}`,
    approved
      ? [`Hi ${firstName},`, `Your timesheet for ${week} has been approved. Thank you!`, ...(note ? [`Note from HR: ${note}`] : [])]
      : [`Hi ${firstName},`, `Your timesheet for ${week} was not approved.`, `Reason: ${note}`, "Please correct it, upload the client-approved timesheet, and submit again."],
    { label: "Open timesheet", href: link },
  );
}

export function sendHrDigest(to: string, subject: string, lines: string[], link: string) {
  return send(to, subject, lines, { label: "Open HR portal", href: link });
}

/** Who gets "timesheet submitted" emails: ACCOUNTS_EMAILS if set, otherwise HR_EMAILS. */
function accountsTeam(): string[] {
  const list = (process.env.ACCOUNTS_EMAILS || process.env.HR_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
  return [...new Set(list)];
}

/**
 * Emails the accounts team when a consultant submits a timesheet, with the uploaded
 * client-approved timesheet attached and a link to approve or reject it in the HR portal.
 */
export async function notifyTimesheetSubmitted(timesheetId: string) {
  const to = accountsTeam();
  if (!to.length) return;
  const { data: s } = await db()
    .from("stagity_timesheets")
    .select("id, week_start, total_hours, notes, submitted_at, stagity_people(first_name, last_name, email, client_name)")
    .eq("id", timesheetId)
    .single();
  if (!s) return;
  const p = s.stagity_people as unknown as { first_name: string; last_name: string; email: string; client_name: string | null };
  const period = periodFor(s.week_start);
  const [{ data: days }, { data: files }] = await Promise.all([
    db().from("stagity_timesheet_days").select("work_date, hours").eq("timesheet_id", s.id).order("work_date"),
    db().from("stagity_timesheet_files").select("storage_path, original_name, mime_type").eq("timesheet_id", s.id).order("uploaded_at"),
  ]);

  const attachments: { filename: string; content: Uint8Array; contentType?: string }[] = [];
  let size = 0;
  let skipped = 0;
  for (const f of files ?? []) {
    const { data: blob } = await db().storage.from(TS_BUCKET).download(f.storage_path);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (size + bytes.length > 20 * 1024 * 1024) { skipped++; continue; } // stay under Gmail's 25 MB limit
    size += bytes.length;
    attachments.push({ filename: f.original_name ?? "approved-timesheet", content: bytes, contentType: f.mime_type ?? undefined });
  }

  const name = `${p.first_name} ${p.last_name}`;
  const hours = (days ?? []).map((d) => `${dayName(d.work_date)} ${d.work_date.slice(5).replace("-", "/")}: ${Number(d.hours)}`).join(" · ");
  const link = `${siteOrigin()}/hr/timesheets/${s.id}`;
  for (const addr of to) {
    await send(
      addr,
      `Timesheet submitted: ${name}, ${periodLabel(period)}`,
      [
        `${name}${p.client_name ? ` (${p.client_name})` : ""} submitted their timesheet for ${periodLabel(period)}: ${Number(s.total_hours)} hours.`,
        `Hours: ${hours || "none entered"}.`,
        ...(s.notes ? [`Consultant's note: ${s.notes}`] : []),
        attachments.length
          ? `The approved timesheet they uploaded is attached${skipped ? ` (${skipped} more file(s) too large to attach; see the portal)` : ""}.`
          : "No attachment could be included; open it in the portal.",
        "Check that it shows the client's approval and matching hours, then approve or reject it in the HR portal. The consultant is emailed either way.",
      ],
      { label: "Review in HR portal", href: link },
      { attachments, signature: "Stagity Solutions Portal" },
    );
  }
}
