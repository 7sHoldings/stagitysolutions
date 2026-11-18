# Stagity Solutions — website

Marketing website for [stagitysolutions.com](https://stagitysolutions.com). Built with Next.js (App Router), deployed on Vercel. Contact form messages are stored in Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local   # add the Supabase values
npm run dev                  # http://localhost:3000
```

## Where to edit things

| What | File |
| --- | --- |
| Company phone, email, address | `lib/content.ts` → `company` |
| Services (all 10 service pages) | `lib/content.ts` → `services` |
| Industries | `lib/content.ts` → `industries` |
| Job openings | `lib/content.ts` → `jobs` (remove all to hide the careers strip) |
| Colors, fonts, spacing | `app/globals.css` (top of file) |
| Home page layout | `app/page.tsx` |
| Chatbot & FAQ questions/answers | `lib/faq.ts` (shown in the chat and on /faq) |
| Old WordPress URL redirects | `next.config.ts` |

Photo placeholders are the grey `.media` boxes — add images to `public/images/` and use `next/image`.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (`Stagity-Solutions` project) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SMTP_USER` | Google Workspace address that sends the alerts (hr@stagitysolutions.com) |
| `SMTP_PASS` | Google App Password for that account (Sensitive) |
| `NOTIFY_TO` | Optional — where enquiry alerts go (defaults to SMTP_USER) |

## Contact form

Submissions go to the `stagity_contact_submissions` table in the **Stagity-Solutions** Supabase project. Visitors can only insert rows (row-level security); view messages in Supabase → Table Editor.

## Chat assistant

The chat bubble answers from the question bank in `lib/faq.ts` — no AI service or API cost. It matches what visitors type using keywords (`lib/faqMatch.ts`). When it can't find an answer, it shows a short contact form that saves to `stagity_contact_submissions` (interest = "Chat assistant").

Every question typed in the chat is logged to `stagity_chat_questions`. Check rows where `answered = false` to see what to add to the FAQ next.

## Email addresses (`lib/content.ts`)

| Address | Sends | Receives |
| --- | --- | --- |
| timesheets@stagitysolutions.com | timesheet reminders, approved/rejected emails to consultants | "timesheet submitted" emails with the attachment, missing-timesheet summary (6th) |
| accounts@stagitysolutions.com | vendor invoices | a copy of every invoice, the ADP payroll sheet (preview + final), invoice failures |
| hr@stagitysolutions.com | HR sign-in codes, welcome/temporary passwords, Form I-9 | vendor questions about invoices (printed on invoices; invoice reply-to) |

## HR portal (`/hr`) and employee portal (`/portal`)

Private pages, not linked from the public site and blocked from search engines.

**Accounts.** HR signs in at `/hr/login` with a 6-digit code emailed to an address in `HR_EMAILS`. HR registers each consultant or employee
on **People** (name, email, phone, client, client manager, hourly rate, ADP employee ID). The system emails them the portal link and a temporary
password (valid 7 days); on first sign-in they must choose their own password. HR can resend a temporary password or deactivate an account.

**Form I-9** (DHS alternative procedure for E-Verify employers). HR starts it when registering someone (or from their profile). The employee signs in,
completes Section 1, uploads document photos and e-signs. HR reviews the copies, holds a live video call where the employee shows the same originals,
completes and signs Section 2, then records the E-Verify case number and result. **Official Form I-9 (PDF)** fills the USCIS form
(`lib/i9/assets/i-9.pdf`, edition 01/20/25, expires 05/31/2027) and appends the document copies. When USCIS publishes a new edition, replace
that file and re-check the field names in `lib/i9/pdf.ts`.

**Timesheets.** Consultants enter hours for every weekday (0 for holidays/days off; weekends optional) and upload the timesheet their client
approved. Timesheets cover a Sun–Sat week **split at month end** (e.g. Sun Aug 30–Mon Aug 31 is one period, Tue Sep 1–Sat Sep 5 the next), so each month can be
completed on its own. Uploading the client-approved timesheet (screenshot or PDF) is required, and notes for HR are optional.
When a consultant submits, the timesheets inbox gets an email with the hours and the uploaded approved
timesheet attached. HR opens it in the portal and approves (consultant emailed; hours flow to the vendor invoice and payroll) or rejects with a
comment (consultant emailed the reason). Overtime (over 40 h per Sun–Sat workweek, across a split) is calculated automatically.

| Rule | Value |
| --- | --- |
| Approved timesheets for a month are due | 5th of the next month |
| Payroll for that month is paid | 20th of the next month (Friday before if the 20th is a Saturday or Sunday) |
| Late timesheets | accepted until payroll is locked (before the 20th); approved after that → next month's payroll |
| Reminders (daily cron, `vercel.json`) | Tuesday for last week (Sun–Sat), again Wed–Fri if missing; every 2 days for last month's gaps until filled; one email/day max; HR summary on the 6th |
| Vendor invoices | sent automatically each morning once a consultant's period (usually the month) is over and fully approved (can be turned off) |
| Payroll sheet | preview 3 business days before payroll; final ADP RUN sheet the morning of the business day before payroll (upload before 3 PM) |

**Payroll.** HR calculates the month's payroll (approved hours × rate, overtime × 1.5), adds bonuses or reimbursements, locks it (hours are
marked paid so they can't be paid twice) and downloads the CSV for **ADP RUN** import. ADP calculates taxes, deductions and net pay.

**Vendor invoices.** Each consultant has a vendor (Vendors page: AP email, CC, address, payment terms, weekly or monthly billing)
and a bill rate (and optional PO number) on their profile. Invoices show one line: all hours worked (regular + overtime) × bill rate = total. Approving a timesheet adds its hours to a draft invoice for that
billing period. HR previews the PDF and clicks **Approve & send**: the invoice gets its number (the date it is raised, YYYYMMDD, e.g. August hours invoiced on Sept 1, 2026 → `20260901`; a second invoice that day gets `-2`), and it's emailed from the HR
Gmail account to the vendor with the PDF and the approved timesheets attached (HR gets a bcc). Then mark it paid, or void and reissue it.

**Data:** `stagity_vendors`, `stagity_invoices`, `stagity_settings`, `stagity_people`, `stagity_timesheets`, `stagity_timesheet_days`, `stagity_timesheet_files`, `stagity_payroll_runs`,
`stagity_payroll_items`, `stagity_reminder_log`, `stagity_i9_cases`, `stagity_i9_documents`, `stagity_i9_audit` (append-only),
`stagity_hr_login_codes`; private storage buckets `i9-documents` and `timesheets`. RLS is on with no policies, so only the server (secret key)
can access them. I-9 data (including SSN) is encrypted with AES-256-GCM before it's stored; passwords are hashed with scrypt.

**Environment variables:** `SUPABASE_SECRET_KEY`, `I9_ENCRYPTION_KEY`, `I9_SESSION_SECRET`, `HR_EMAILS`, `CRON_SECRET`, optional `TIMESHEETS_SMTP_PASS` / `ACCOUNTS_SMTP_PASS` (plus the existing
`SUPABASE_URL` and `SMTP_*`). Back up `I9_ENCRYPTION_KEY` somewhere safe: without it, stored I-9 records can't be decrypted.
