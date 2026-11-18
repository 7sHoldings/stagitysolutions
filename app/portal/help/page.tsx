import type { Metadata } from "next";
import Link from "next/link";
import { requirePerson } from "@/lib/portal/server";
import { company } from "@/lib/content";

export const metadata: Metadata = { title: "Help", robots: { index: false, follow: false } };

/** Employee-only guide (requires sign-in). */
export default async function PortalHelp() {
  const p = await requirePerson();
  return (
    <section className="container i9-page help-page" style={{ maxWidth: 880 }}>
      <div>
        <p className="eyebrow">Help</p>
        <h1 className="h2">How to submit your timesheet</h1>
        <p className="lead" style={{ marginTop: 12 }}>Everything you need to know, {p.first_name}. It takes about 2 minutes a week.</p>
      </div>

      <nav className="help-toc" aria-label="On this page">
        <a href="#weekly">Weekly timesheet</a>
        <a href="#deadlines">Deadlines &amp; payroll</a>
        <a href="#after">After you submit</a>
        <a href="#account">Your account</a>
        <a href="#faq">Questions</a>
      </nav>

      <section id="weekly" className="help-card">
        <h2 className="i9-h3">1. Submit your weekly timesheet</h2>
        <ol className="help-steps">
          <li>On your <Link href="/portal">Timesheets</Link> page, the <strong>To submit</strong> box lists the weeks waiting for you. Click <strong>Fill timesheet</strong>.</li>
          <li>
            <strong>Hours:</strong> enter hours for every weekday (Monday–Friday). Put <strong>0</strong> for holidays or days you didn&apos;t work.
            Weekends are locked. Tip: <em>8 h every weekday</em> fills a standard week in one click.
          </li>
          <li>
            <strong>Approved timesheet:</strong> click <em>Upload approved timesheet</em> and add a screenshot or PDF from your client or vendor portal.
            It must show that it&apos;s <strong>approved</strong> and the hours per day. You can add more than one file.
          </li>
          <li><strong>Notes (optional):</strong> anything HR should know, e.g. &ldquo;Thanksgiving holiday on Thursday&rdquo;.</li>
          <li>Click <strong>Submit to HR</strong>. If anything is missing, the page tells you exactly what to fix.</li>
        </ol>
        <div className="help-tip">
          <strong>Not finished?</strong> Click <em>Save draft</em> to keep the hours you&apos;ve entered and come back later.
        </div>
        <ul className="help-list">
          <li>Weeks run <strong>Sunday to Saturday</strong>. You can submit from the last weekday of the week (usually Friday).</li>
          <li>
            A week that crosses into a new month is split into two short timesheets (for example Mon Nov 30, then Tue Dec 1–Fri Dec 4), so each
            month can be finished on time.
          </li>
        </ul>
      </section>

      <section id="deadlines" className="help-card">
        <h2 className="i9-h3">2. Deadlines &amp; payroll</h2>
        <div className="help-grid">
          <div className="help-fact"><span className="help-fact-k">Each week</span><strong>Submit by the Tuesday after the week ends</strong></div>
          <div className="help-fact"><span className="help-fact-k">Each month</span><strong>All weeks submitted by the 5th of the next month</strong></div>
          <div className="help-fact"><span className="help-fact-k">Payroll</span><strong>The 20th (the Friday before if it&apos;s a weekend)</strong></div>
        </div>
        <p className="help-warn">
          If your timesheets aren&apos;t submitted <strong>and approved</strong> before payroll is processed, the pay for those hours is moved to the
          <strong> following month&apos;s payroll</strong>.
        </p>
        <p className="muted i9-small">
          Reminders come from {company.timesheetsEmail}: every Tuesday for the week before, then daily through Friday if it&apos;s still missing, and every
          2 days for anything missing from last month.
        </p>
      </section>

      <section id="after" className="help-card">
        <h2 className="i9-h3">3. After you submit</h2>
        <ul className="help-list">
          <li>HR checks your hours against the approved timesheet. You&apos;ll get an email when it&apos;s <strong>approved</strong>.</li>
          <li>
            If something is wrong, it&apos;s <strong>returned with a comment</strong> (shown on your Timesheets page and emailed to you). Fix it, upload the
            approved timesheet if needed, and submit again.
          </li>
          <li>Submitted timesheets are locked. If you notice a mistake after submitting, email {company.timesheetsEmail} and HR can return it to you.</li>
        </ul>
        <div className="help-status">
          <span className="i9-badge s-cancelled">Not started</span>
          <span className="i9-badge s-invited">Draft</span>
          <span className="i9-badge s-everify_submitted">Waiting for HR</span>
          <span className="i9-badge s-closed">Approved</span>
          <span className="i9-badge s-section1_complete">Not approved</span>
        </div>
      </section>

      <section id="account" className="help-card">
        <h2 className="i9-h3">4. Your account</h2>
        <ul className="help-list">
          <li>Sign in at <strong>stagitysolutions.com → Sign in → Employee sign in</strong> with your email and password.</li>
          <li>To change your password, use <Link href="/portal/set-password">Change password</Link> in the menu.</li>
          <li>Forgot it? On the sign-in page click <strong>Forgot your password?</strong> and we&apos;ll email you a code to set a new one.</li>
          <li>If HR has started your Form I-9, you&apos;ll find it under <Link href="/portal/i9">Form I-9</Link>.</li>
        </ul>
      </section>

      <section id="faq" className="help-card">
        <h2 className="i9-h3">Questions</h2>
        <details className="help-q"><summary>My client hasn&apos;t approved my timesheet yet. What do I do?</summary>
          <p>Enter your hours and click <em>Save draft</em>. Once your client approves it, upload the approved screenshot and submit. Remember the monthly deadline of the 5th.</p>
        </details>
        <details className="help-q"><summary>It was a holiday or I didn&apos;t work that day.</summary>
          <p>Enter <strong>0</strong> for those days and add a short note (e.g. &ldquo;Thanksgiving holiday&rdquo;). Every weekday needs a number, even if it&apos;s 0.</p>
        </details>
        <details className="help-q"><summary>I worked on a weekend.</summary>
          <p>Weekends can&apos;t be entered in the portal. Email {company.timesheetsEmail} and HR will help.</p>
        </details>
        <details className="help-q"><summary>My client portal shows one timesheet for the whole week, but my week is split at month end.</summary>
          <p>Upload the same approved screenshot to both short timesheets.</p>
        </details>
        <details className="help-q"><summary>I can&apos;t upload my file.</summary>
          <p>Use a PDF, JPG or PNG under 10 MB. On a phone, a screenshot works well. If it still fails, email it to {company.timesheetsEmail}.</p>
        </details>
        <p className="muted" style={{ marginTop: 8 }}>
          Still stuck? Email <a href={`mailto:${company.timesheetsEmail}`}>{company.timesheetsEmail}</a> or call {company.phone}.
        </p>
      </section>
    </section>
  );
}
