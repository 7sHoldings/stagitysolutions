import { timingSafeEqual } from "node:crypto";
import { db, siteOrigin } from "@/lib/i9/server";
import { company } from "@/lib/content";
import { send } from "@/lib/i9/mail";
import { addDays, addMonths, deadlineFor, money, monthLabel, monthStart, payDateFor, payrollSheetDate, periodFor, periodLabel, todayCT, weekStartOf, type Period } from "@/lib/portal/dates";
import { sendHrDigest, sendTimesheetReminder } from "@/lib/portal/mail";
import { missingPeriods, monthOverview, type ConsultantRow, type SheetRow } from "@/lib/portal/timesheets";
import { ensureDraftRun, gross, payrollCsv } from "@/lib/portal/payroll";
import { autoSendInvoices } from "@/lib/invoices/auto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs every morning (vercel.json). US Central time. Workweeks run Sunday–Saturday.
 *
 * 1. Timesheet reminders to consultants (at most one email per person per day, listing everything missing)
 *    Tuesday              → invite to fill last week (Sun–Sat) + upload the approved screenshot
 *    Wednesday–Friday     → again, if last week still isn't submitted
 *    Every 2 days         → anything missing for last month (1st, 3rd, 5th = deadline, 7th, …) until it's in
 * 2. Summary to the timesheets inbox on the 6th (who missed the deadline)
 * 3. Vendor invoices: any invoice whose period is over and fully approved is sent automatically from accounts@
 * 4. Payroll (20th; Friday before if it's a weekend): a preview sheet 3 business days before,
 *    and the final ADP RUN sheet on the morning of the business day before payroll, emailed to accounts@
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
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  const weekly = dow >= 2 && dow <= 5; // Tue–Fri
  const everyOtherDay = day % 2 === 1; // 1st, 3rd, 5th, …
  const lastWeekStart = addDays(weekStartOf(today), -7);
  const lastWeek: Period[] = [...new Map([periodFor(lastWeekStart), periodFor(addDays(lastWeekStart, 6))].map((x) => [x.start, x])).values()];

  type Need = { p: ConsultantRow; periods: Period[]; overdue: boolean };
  const needs = new Map<string, Need>();
  const add = (p: ConsultantRow, periods: Period[], overdue = false) => {
    if (!periods.length) return;
    const n = needs.get(p.id) ?? { p, periods: [], overdue: false };
    for (const x of periods) if (!n.periods.some((y) => y.start === x.start)) n.periods.push(x);
    n.overdue ||= overdue;
    needs.set(p.id, n);
  };
  const views = new Map<string, { consultants: ConsultantRow[]; sheet: (pid: string, start: string) => SheetRow | undefined }>();
  const view = async (m: string) => views.get(m) ?? views.set(m, await monthOverview(m)).get(m)!;

  if (weekly) {
    // Last week (both halves if it crossed into a new month); on Tuesday also any older gaps this month.
    for (const m of [...new Set([monthStart(lastWeekStart), monthStart(addDays(lastWeekStart, 6)), thisMonth])]) {
      const { consultants, sheet } = await view(m);
      for (const p of consultants.filter((c) => c.active)) {
        const missing = missingPeriods(p, m, sheet).filter((x) => (dow === 2 ? x.end < today : lastWeek.some((w) => w.start === x.start)));
        add(p, missing);
      }
    }
  }
  if (everyOtherDay) {
    // Last month (and the month before, in case anything is still outstanding after payroll).
    for (const m of [lastMonth, addMonths(lastMonth, -1)]) {
      const { consultants, sheet } = await view(m);
      for (const p of consultants.filter((c) => c.active)) add(p, missingPeriods(p, m, sheet), today > deadlineFor(m));
    }
  }

  for (const { p, periods, overdue } of needs.values()) {
    if (!(await once(p.id, "timesheet-reminder", today))) continue;
    periods.sort((a, b) => a.start.localeCompare(b.start));
    const lastM = periods.some((x) => monthStart(x.start) === lastMonth) && today <= payrollSheetDate(lastMonth);
    const subject = overdue
      ? `Overdue timesheets: please submit before payroll`
      : dow === 2 && periods.some((x) => lastWeek.some((w) => w.start === x.start))
        ? `Please submit your timesheet for ${periodLabel({ start: lastWeekStart, end: addDays(lastWeekStart, 6) })}`
        : "Reminder: timesheets to submit";
    await sendTimesheetReminder(p.email, p.first_name, subject, [
      `Please fill in your hours and upload a screenshot of the approved timesheet from your client or vendor portal for: ${periods.map(periodLabel).join(", ")}.`,
      "Enter hours for every weekday. Put 0 for holidays or days you didn't work.",
      ...(lastM
        ? [`${monthLabel(lastMonth)} timesheets ${today > deadlineFor(lastMonth) ? "were" : "are"} due by ${deadlineFor(lastMonth)} and must be in before payroll on ${payDateFor(lastMonth)}.`]
        : []),
    ], portal);
    log.push(`reminder:${p.email}`);
  }

  // ---- 2. HR summaries ----
  if (day === 6) {
    const { consultants, sheet } = await monthOverview(lastMonth);
    const missing = consultants
      .filter((c) => c.active)
      .map((p) => ({ p, periods: missingPeriods(p, lastMonth, sheet) }))
      .filter((x) => x.periods.length);
    const { count: toReview } = await db().from("stagity_timesheets").select("id", { count: "exact", head: true }).eq("status", "submitted");
    for (const to of [company.timesheetsEmail]) {
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
      for (const to of [company.accountsEmail]) {
        await sendHrDigest(to, "Some vendor invoices couldn't be sent automatically", [
          `${inv.failed.length} invoice(s) are complete but couldn't be sent. Open the Invoices page to see them and send manually.`,
        ], `${siteOrigin()}/hr/invoices`);
      }
    }
  } catch (e) {
    console.error("Auto invoices failed:", e);
  }

  // ---- 4. Payroll sheet ----
  const sheetDay = payrollSheetDate(lastMonth);
  let previewDay = sheetDay;
  for (let i = 0; i < 2; ) {
    previewDay = addDays(previewDay, -1);
    if (![0, 6].includes(new Date(previewDay + "T00:00:00Z").getUTCDay())) i++;
  }
  const finalSheet = today === sheetDay;
  if (finalSheet || today === previewDay) {
    const run = await ensureDraftRun(lastMonth, "automatic");
    if (run && run.status === "draft" && (await once(null, finalSheet ? "payroll-sheet-final" : "payroll-sheet-preview", today))) {
      const { filename, body, items } = await payrollCsv(run.id);
      const total = items.reduce((a, i) => a + gross(i), 0);
      const { consultants, sheet } = await monthOverview(lastMonth);
      const missing = consultants.filter((c) => c.active && missingPeriods(c, lastMonth, sheet).length).map((c) => `${c.first_name} ${c.last_name}`);
      const noAdp = items.filter((i) => !(i.stagity_people as { adp_employee_id: string | null }).adp_employee_id).length;
      for (const to of [company.accountsEmail]) {
        await send(
          to,
          finalSheet ? `ADP payroll sheet for ${monthLabel(lastMonth)}: upload today before 3 PM (pays ${run.pay_date})` : `Payroll preview for ${monthLabel(lastMonth)} (pays ${run.pay_date})`,
          [
            `The ${monthLabel(lastMonth)} payroll sheet is attached for ADP RUN: ${items.length} consultant(s), estimated gross ${money(total)}.`,
            ...(missing.length ? [`Still missing timesheets (not included yet): ${missing.join(", ")}.`] : ["All timesheets for the month are in."]),
            ...(noAdp ? [`${noAdp} consultant(s) have no ADP employee ID yet. Add it on their profile.`] : []),
            finalSheet
              ? `This is the final sheet. Upload it to ADP RUN today before 3 PM for payroll on ${run.pay_date}, then lock the payroll in the HR portal.`
              : `This is a preview. It updates as more timesheets are approved; the final sheet arrives on the morning of ${sheetDay}.`,
          ],
          { label: "Open payroll", href: `${siteOrigin()}/hr/payroll/${run.id}` },
          { attachments: [{ filename, content: Buffer.from(body), contentType: "text/csv" }], signature: "Stagity Solutions Portal" },
        );
      }
      log.push(`payroll-sheet:${run.id}`);
    }
  }

  // Housekeeping
  await db().from("stagity_hr_login_codes").delete().lt("created_at", addDays(today, -30));
  return Response.json({ today, actions: log.length, log });
}
