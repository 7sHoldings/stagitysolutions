import { timingSafeEqual } from "node:crypto";
import { db, hrEmails, siteOrigin } from "@/lib/i9/server";
import { addDays, addMonths, deadlineFor, monthEnd, monthLabel, monthStart, mondayOf, todayCT, weekLabel } from "@/lib/portal/dates";
import { sendHrDigest, sendTimesheetReminder } from "@/lib/portal/mail";
import { missingWeeks, monthOverview } from "@/lib/portal/timesheets";

export const dynamic = "force-dynamic";

/**
 * Runs daily (vercel.json). Reminder schedule, US Central time:
 *   Friday                       → consultants who haven't submitted this week
 *   25th, 28th, last day         → anyone missing weeks of the current month
 *   1st, 3rd, 5th                → anyone still missing last month (deadline is the 5th)
 *   6th                          → HR gets a list of who missed the deadline
 */
async function remindOnce(personId: string | null, kind: string, today: string) {
  const { error } = await db().from("stagity_reminder_log").insert({ person_id: personId, kind, sent_on: today });
  return !error; // unique constraint → already sent today
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || auth.length !== want.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(want))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = todayCT();
  const day = Number(today.slice(8));
  const isFriday = new Date(today + "T00:00:00Z").getUTCDay() === 5;
  const thisMonth = monthStart(today);
  const lastMonth = addMonths(thisMonth, -1);
  const link = `${siteOrigin()}/portal`;
  const sent: string[] = [];

  // Weekly Friday reminder for the current week
  if (isFriday) {
    const week = mondayOf(today);
    const { consultants, sheet } = await monthOverview(thisMonth);
    for (const p of consultants.filter((c) => c.active)) {
      if (p.start_date && p.start_date > today) continue;
      if (p.end_date && p.end_date < week) continue;
      const s = sheet(p.id, week);
      if (s && ["submitted", "approved"].includes(s.status)) continue;
      if (!(await remindOnce(p.id, "weekly", today))) continue;
      await sendTimesheetReminder(p.email, p.first_name, `Timesheet reminder: week of ${weekLabel(week)}`, [
        `Please enter your hours for ${weekLabel(week)} and upload the timesheet approved in your client's portal.`,
      ], link);
      sent.push(`weekly:${p.email}`);
    }
  }

  // Month-end and deadline reminders
  const lastDay = monthEnd(thisMonth) === today;
  const monthEndDay = [25, 28].includes(day) || lastDay;
  const deadlineDay = [1, 3, 5].includes(day);
  if (monthEndDay || deadlineDay) {
    const month = deadlineDay ? lastMonth : thisMonth;
    const { consultants, sheet } = await monthOverview(month);
    for (const p of consultants.filter((c) => c.active)) {
      const weeks = missingWeeks(p, month, sheet).filter((w) => w !== mondayOf(today) || deadlineDay);
      if (!weeks.length) continue;
      if (!(await remindOnce(p.id, "monthly", today))) continue;
      const final = day === 5;
      await sendTimesheetReminder(
        p.email,
        p.first_name,
        final ? `Today is the deadline: ${monthLabel(month)} timesheets` : `Reminder: ${monthLabel(month)} timesheets due ${deadlineFor(month)}`,
        [
          `We still need your client-approved timesheets for: ${weeks.map(weekLabel).join(", ")}.`,
          `The deadline is ${deadlineFor(month)}. Timesheets received after that are paid in the following month's payroll.`,
        ],
        link,
      );
      sent.push(`monthly:${p.email}`);
    }
  }

  // HR digest after the deadline
  if (day === 6) {
    const { consultants, sheet } = await monthOverview(lastMonth);
    const late = consultants.filter((c) => c.active).map((p) => ({ p, weeks: missingWeeks(p, lastMonth, sheet) })).filter((x) => x.weeks.length);
    const { count: toReview } = await db().from("stagity_timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted");
    for (const to of hrEmails()) {
      if (!(await remindOnce(null, `hr-digest:${to}`, today))) continue;
      await sendHrDigest(to, `${monthLabel(lastMonth)} timesheets: ${late.length} missing after the deadline`, [
        late.length
          ? `These consultants missed the ${deadlineFor(lastMonth)} deadline: ${late.map((x) => `${x.p.first_name} ${x.p.last_name} (${x.weeks.length} week${x.weeks.length > 1 ? "s" : ""})`).join("; ")}.`
          : `Everyone submitted their ${monthLabel(lastMonth)} timesheets on time.`,
        `${toReview ?? 0} submitted timesheet(s) are waiting for your review. Payroll for ${monthLabel(lastMonth)} runs on the 20th.`,
      ], `${siteOrigin()}/hr/timesheets?month=${lastMonth.slice(0, 7)}`);
      sent.push(`digest:${to}`);
    }
  }

  // Housekeeping: old login codes
  await db().from("stagity_hr_login_codes").delete().lt("created_at", addDays(today, -30));
  return Response.json({ today, sent: sent.length });
}
