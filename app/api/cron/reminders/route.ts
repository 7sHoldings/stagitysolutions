import { timingSafeEqual } from "node:crypto";
import { db, siteOrigin } from "@/lib/i9/server";
import { company } from "@/lib/content";
import { send } from "@/lib/i9/mail";
import { addDays, addMonths, deadlineFor, money, monthLabel, monthStart, payDateFor, payrollSheetDate, periodFor, periodLabel, todayCT, weekStartOf, type Period } from "@/lib/portal/dates";
import { sendHrDigest, sendTimesheetReminder } from "@/lib/portal/mail";
import { missingPeriods, monthOverview, type ConsultantRow, type SheetRow } from "@/lib/portal/timesheets";
import { ensureDraftRun, gross, payrollCsv } from "@/lib/portal/payroll";
import { requestInvoiceReviews } from "@/lib/invoices/auto";
import { sendSignupReminder } from "@/lib/i9/mail";
import { sendAnnouncement, type AckRow } from "@/lib/announce";
import { FILE_KINDS, onboardingSteps, sendOnboardingReminder } from "@/lib/onboarding/server";

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
 * 3. Vendor invoices: when a period is over and fully approved, the team (hr@, timesheets@, accounts@) gets a
 *    "please review" email with the draft PDF and approved timesheets. An admin must click Approve & send.
 * 4. Payroll (20th; Friday before if it's a weekend): a preview sheet 3 business days before,
 *    and the final ADP RUN sheet on the morning of the business day before payroll, emailed to accounts@
 * 5. Portal sign-up: daily reminder (hr@) to people who haven't signed in and set a password, until their sign-up due date
 * 6. Announcement: daily reminder to anyone who hasn't clicked "I acknowledge", until the acknowledge-by date
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

  // ---- 3. Vendor invoices: never sent automatically. Complete, approved drafts → "please review" email to the team ----
  try {
    const inv = await requestInvoiceReviews();
    log.push(...inv.notified.map((m) => `invoice-review:${m}`), ...inv.failed.map((m) => `invoice-review-failed:${m}`));
  } catch (e) {
    console.error("Invoice review emails failed:", e);
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

  // ---- 5. Portal sign-up reminders (hr@): daily until their sign-up due date ----
  {
    const { data: invited } = await db()
      .from("stagity_people")
      .select("id, first_name, email, signup_due, temp_password_expires_at, must_change_password")
      .eq("active", true)
      .or("must_change_password.eq.true,profile_completed_at.is.null")
      .not("email", "is", null)
      .not("password_hash", "is", null) // never sent a login yet → nothing to remind about
      .gte("signup_due", today)
      .lt("created_at", `${today}T06:00:00Z`); // not on the day they were registered (they just got the welcome email)
    for (const p of invited ?? []) {
      if (needs.has(p.id)) continue; // already got a timesheet reminder today (max one email a day)
      if (!(await once(p.id, "signup-reminder", today))) continue;
      const tempValid = !!p.temp_password_expires_at && new Date(p.temp_password_expires_at) > new Date();
      await sendSignupReminder(p.email!, p.first_name, `${portal}/login`, p.signup_due!, tempValid, !p.must_change_password);
      log.push(`signup-reminder:${p.email}`);
    }
  }

  // ---- 6. Announcement: daily reminder to anyone who hasn't acknowledged, until the acknowledge-by date ----
  {
    const { data: pending } = await db()
      .from("stagity_acknowledgments")
      .select("*")
      .is("acknowledged_at", null)
      .not("sent_at", "is", null)
      .gte("ack_by", today)
      .lt("sent_at", `${today}T06:00:00Z`); // at most once a day
    for (const r of (pending ?? []) as AckRow[]) {
      if (await sendAnnouncement(r, "automatic")) log.push(`ack-reminder:${r.email}`);
    }
  }

  // ---- 7. Onboarding: daily reminder until the due date (only once they've signed in), and document-expiry alerts to HR ----
  {
    const { data: obs } = await db()
      .from("stagity_onboarding")
      .select("person_id, due_date, stagity_people!inner(first_name, email, active, must_change_password)")
      .is("completed_at", null)
      .gte("due_date", today)
      .lt("started_at", `${today}T06:00:00Z`);
    for (const o of obs ?? []) {
      const p = o.stagity_people as unknown as { first_name: string; email: string | null; active: boolean; must_change_password: boolean };
      if (!p.active || !p.email || p.must_change_password || needs.has(o.person_id)) continue; // sign-up reminders cover people who haven't signed in
      const st = await onboardingSteps(o.person_id);
      if (!st || st.complete) continue;
      if (!(await once(o.person_id, "onboarding-reminder", today))) continue;
      await sendOnboardingReminder(p.email, p.first_name, o.due_date!, st.steps.filter((x) => !x.done).map((x) => x.label));
      log.push(`onboarding-reminder:${p.email}`);
    }
    // Work documents expiring in 60, 30 or 7 days → one email to hr@ listing them.
    const soon = await db()
      .from("stagity_onboarding_files")
      .select("id, kind, expires_on, person_id, stagity_people!inner(first_name, last_name, active)")
      .not("expires_on", "is", null)
      .lte("expires_on", addDays(today, 60))
      .gte("expires_on", today);
    const due = (soon.data ?? []).filter((f) => [60, 30, 7].includes(Math.round((Date.parse(`${f.expires_on}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000)));
    if (due.length && (await once(null, "document-expiry", today))) {
      await send(company.email, `${due.length} employee document${due.length === 1 ? "" : "s"} expiring soon`, [
        "These employee documents expire soon. Ask for renewed copies (and re-verify the Form I-9 if it's work authorization):",
        due.map((f) => {
          const p = f.stagity_people as unknown as { first_name: string; last_name: string };
          return `• ${p.first_name} ${p.last_name}: ${FILE_KINDS[f.kind] ?? f.kind} expires ${f.expires_on}`;
        }).join("\n"),
      ], { label: "Open onboarding", href: `${siteOrigin()}/hr/onboarding` }, { signature: "Stagity Solutions Portal" });
      log.push(`document-expiry:${due.length}`);
    }
  }

  // Housekeeping
  await db().from("stagity_hr_login_codes").delete().lt("created_at", addDays(today, -30));
  return Response.json({ today, actions: log.length, log });
}
