import { timingSafeEqual } from "node:crypto";
import { db, hrEmails, siteOrigin } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { addDays, addMonths, deadlineFor, money, monthEnd, monthLabel, monthStart, payDateFor, periodFor, periodLabel, todayCT } from "@/lib/portal/dates";
import { sendHrDigest, sendTimesheetReminder } from "@/lib/portal/mail";
import { missingPeriods, monthOverview } from "@/lib/portal/timesheets";
import { ensureDraftRun, gross, payrollCsv } from "@/lib/portal/payroll";
import { autoSendInvoices } from "@/lib/invoices/auto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs every morning (vercel.json). US Central time.
 *
 * 1. Timesheet reminders to consultants
 *    Friday               → this week's timesheet
 *    25th, 28th, last day → anything missing for the current month
 *    1st, 3rd, 5th        → last month, due on the 5th
 *    8th, 12th, 15th      → last month, overdue: must be in before payroll on the 20th
 * 2. HR summaries on the 6th and 16th (who's still missing)
 * 3. Vendor invoices: any invoice whose period is over and fully approved is sent automatically
 * 4. Payroll: on the 16th and 19th the draft payroll for last month is refreshed and emailed to HR
 *    with the ADP RUN file attached (payroll runs on the 20th)
 */
async function once(personId: string | null, kind: string, today: string) {
  const { error } = await db().from("stagity_reminder_log").insert({ person_id: personId, kind, sent_on: today });
  return !error; // unique constraint → already done today
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
  const portal = `${siteOrigin()}/portal`;
  const log: string[] = [];

  // ---- 1. Consultant reminders ----
  if (isFriday) {
    const current = periodFor(today);
    const { consultants, sheet } = await monthOverview(thisMonth);
    for (const p of consultants.filter((c) => c.active)) {
      if ((p.start_date && p.start_date > today) || (p.end_date && p.end_date < current.start)) continue;
      const s = sheet(p.id, current.start);
      if (s && ["submitted", "approved"].includes(s.status)) continue;
      if (!(await once(p.id, "weekly", today))) continue;
      await sendTimesheetReminder(p.email, p.first_name, `Timesheet reminder: ${periodLabel(current)}`, [
        `Please enter your hours for ${periodLabel(current)} (every weekday; 0 for holidays or days off) and upload the timesheet approved in your client's portal.`,
      ], portal);
      log.push(`weekly:${p.email}`);
    }
  }

  const monthEndDay = [25, 28].includes(day) || monthEnd(thisMonth) === today;
  const dueDay = [1, 3, 5].includes(day);
  const overdueDay = [8, 12, 15].includes(day);
  if (monthEndDay || dueDay || overdueDay) {
    const month = monthEndDay ? thisMonth : lastMonth;
    const { consultants, sheet } = await monthOverview(month);
    for (const p of consultants.filter((c) => c.active)) {
      // At month end, don't nag about the period that's still in progress.
      const missing = missingPeriods(p, month, sheet).filter((x) => !(monthEndDay && x.end >= today && monthEnd(thisMonth) !== today));
      if (!missing.length) continue;
      if (!(await once(p.id, "monthly", today))) continue;
      const list = missing.map(periodLabel).join(", ");
      const [subject, lines] = overdueDay
        ? [
            `Overdue: ${monthLabel(month)} timesheets needed before payroll`,
            [
              `Your ${monthLabel(month)} timesheets were due on ${deadlineFor(month)} and we still need: ${list}.`,
              `Please submit them as soon as possible. They must be in and approved before payroll on ${payDateFor(month)}, or those hours move to the following month's payroll.`,
            ],
          ]
        : [
            day === 5 ? `Today is the deadline: ${monthLabel(month)} timesheets` : `Reminder: ${monthLabel(month)} timesheets due ${deadlineFor(month)}`,
            [
              `We still need your client-approved timesheets for: ${list}.`,
              `Fill in every weekday (0 for holidays or days off). The deadline is ${deadlineFor(month)}.`,
            ],
          ];
      await sendTimesheetReminder(p.email, p.first_name, subject, lines, portal);
      log.push(`monthly:${p.email}`);
    }
  }

  // ---- 2. HR summaries ----
  if (day === 6 || day === 16) {
    const { consultants, sheet } = await monthOverview(lastMonth);
    const missing = consultants
      .filter((c) => c.active)
      .map((p) => ({ p, periods: missingPeriods(p, lastMonth, sheet) }))
      .filter((x) => x.periods.length);
    const { count: toReview } = await db().from("stagity_timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted");
    for (const to of hrEmails()) {
      if (!(await once(null, `hr-digest:${to}`, today))) continue;
      await sendHrDigest(to, `${monthLabel(lastMonth)} timesheets: ${missing.length} consultant${missing.length === 1 ? "" : "s"} still missing`, [
        missing.length
          ? `Still missing after the ${deadlineFor(lastMonth)} deadline: ${missing.map((x) => `${x.p.first_name} ${x.p.last_name} (${x.periods.map(periodLabel).join(", ")})`).join("; ")}.`
          : `Everyone has submitted their ${monthLabel(lastMonth)} timesheets.`,
        `${toReview ?? 0} submitted timesheet(s) are waiting for your review. Payroll for ${monthLabel(lastMonth)} runs on ${payDateFor(lastMonth)}.`,
      ], `${siteOrigin()}/hr/timesheets?month=${lastMonth.slice(0, 7)}`);
      log.push(`digest:${to}`);
    }
  }

  // ---- 3. Vendor invoices ----
  try {
    const inv = await autoSendInvoices();
    log.push(...inv.sent.map((m) => `invoice:${m}`), ...inv.failed.map((m) => `invoice-failed:${m}`));
    if (inv.failed.length && (await once(null, "invoice-failures", today))) {
      for (const to of hrEmails()) {
        await sendHrDigest(to, "Some vendor invoices couldn't be sent automatically", [
          `${inv.failed.length} invoice(s) are complete but couldn't be sent. Open the Invoices page to see them and send manually.`,
        ], `${siteOrigin()}/hr/invoices`);
      }
    }
  } catch (e) {
    console.error("Auto invoices failed:", e);
  }

  // ---- 4. Payroll sheet ----
  if (day === 16 || day === 19) {
    const run = await ensureDraftRun(lastMonth, "automatic");
    if (run && run.status === "draft" && (await once(null, "payroll-sheet", today))) {
      const { filename, body, items } = await payrollCsv(run.id);
      const total = items.reduce((a, i) => a + gross(i), 0);
      const { consultants, sheet } = await monthOverview(lastMonth);
      const missing = consultants.filter((c) => c.active && missingPeriods(c, lastMonth, sheet).length).map((c) => `${c.first_name} ${c.last_name}`);
      const noAdp = items.filter((i) => !(i.stagity_people as { adp_employee_id: string | null }).adp_employee_id).length;
      for (const to of hrEmails()) {
        await send(
          to,
          `Payroll for ${monthLabel(lastMonth)} is ready for review (pays ${run.pay_date})`,
          [
            `The ${monthLabel(lastMonth)} payroll sheet is attached for ADP RUN: ${items.length} consultant(s), estimated gross ${money(total)}.`,
            ...(missing.length ? [`Still missing timesheets (not included yet): ${missing.join(", ")}.`] : ["All timesheets for the month are in."]),
            ...(noAdp ? [`${noAdp} consultant(s) have no ADP employee ID yet. Add it on their profile.`] : []),
            day === 19
              ? "Payroll runs tomorrow. Review it, add any bonuses or reimbursements, then lock it in the HR portal after importing into ADP."
              : "Review it in the HR portal. It updates automatically as more timesheets are approved; you'll get a final copy on the 19th.",
          ],
          { label: "Open payroll", href: `${siteOrigin()}/hr/payroll/${run.id}` },
          { attachments: [{ filename, content: Buffer.from(body), contentType: "text/csv" }] },
        );
      }
      log.push(`payroll-sheet:${run.id}`);
    }
  }

  // Housekeeping
  await db().from("stagity_hr_login_codes").delete().lt("created_at", addDays(today, -30));
  return Response.json({ today, actions: log.length, log });
}
