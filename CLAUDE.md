# Stagity Solutions website: notes for Claude

## Git workflow (owner's standing instruction)
- **Always merge finished changes into `main` and push.** No need to ask first. Commit on the working branch, push it, then merge into `main` and push `main`.
- Run `npx next build` before merging. Don't merge a failing build.

## Project
- Next.js (App Router) on Vercel (project `stagitysolutions`), Supabase project **Stagity-Solutions** (`pzpfqmypiknltzdqlxkl`).
- See `README.md` for where content lives, environment variables, and how the HR/employee portals work.
- The owner follows along on a phone and isn't a developer. Explain results in plain language and check mobile layouts.

## HR & employee portals (`/hr`, `/portal`)
- All portal tables use RLS with **no policies**. Only the server, using `SUPABASE_SECRET_KEY` via `db()` in `lib/i9/server.ts`, can access them. Never add anon/authenticated policies or expose these tables to the browser.
- Form I-9 data (incl. SSN) is encrypted with `I9_ENCRYPTION_KEY` (`encryptJson`/`decryptJson`). Never change or rotate that key without migrating existing records.
- Audit important actions with `audit()`. `stagity_i9_audit` is append-only.
- Timesheet/payroll rules: timesheet periods are Sun–Sat weeks split at month end (`periodFor`); every weekday must be filled (0 for holidays), weekends can't have hours; overtime is hours over 40 per Sun–Sat workweek at 1.5×; a month's timesheets are due the 5th of the next month, late ones accepted until payroll is locked. Payroll is the 20th (Friday before if a weekend); the final ADP sheet is due the business day before, before 3 PM. The daily cron (`app/api/cron/reminders`) sends reminders (Tue for last week, Wed–Fri if missing, every 2 days for last month; max one email/day), auto-sends complete vendor invoices, and emails the payroll sheet (preview, then final on the day before payroll). Dates use US Central time (`lib/portal/dates.ts`).
- Email roles (`lib/content.ts`, `send(..., { from })` in `lib/i9/mail.ts`): timesheets@ sends reminders/approvals to consultants and receives submitted timesheets; accounts@ sends vendor invoices and receives the ADP sheet; hr@ is the invoice-questions contact and handles logins/I-9.
- Vendor invoices: timesheet days link to invoices via `stagity_timesheet_days.invoice_id`. Drafts are rebuilt by `syncDraftInvoices`/`recomputeDraft` (`lib/invoices/server.ts`); sent invoices are never changed, only voided (which frees the hours for a new draft). Vendor invoices: one line item (all hours × bill rate) and the total, plus a weekly hours breakdown. No due date, payment instructions, balance due, overtime line or thank-you text (owner removed these).
- Timesheet submission requires every weekday filled and at least one uploaded approved-timesheet file. On submit the timesheets inbox is emailed with the attachment (`notifyTimesheetSubmitted`). HR verifies approval by eye; no AI check (owner decided against it). HR approval triggers invoicing and payroll.
- Portal passwords: consultants can change theirs when signed in, or use "Forgot password?" (`/portal/forgot`, 6-digit code emailed from hr@, 15 min, `stagity_password_resets`). HR can also email a new temporary password from the person's profile.
- Header/footer depend on the area (`lib/area.ts`): public pages get the website menu with "Sign in" (`/sign-in` chooser); employee portal pages get only Timesheets / Form I-9 / Change password / Sign out and a slim footer; admin pages get "Admin portal" with the HR tabs.
- Rates live on the vendor assignment: `assignConsultant` (Vendors page) sets vendor, pay rate, bill rate, client, PO on `stagity_people`; registration/profile edit only touch personal fields. `deletePerson`/`deleteVendor` refuse when sent invoices, locked payroll or a started I-9 exist.
- Pay: hourly (`pay_rate` × approved hours, OT 1.5×) or a flat monthly amount (`stagity_people.monthly_pay`, paid every month the person is active, whatever the hours). Set on the vendor assignment, or on the person's profile ("Pay") for people not on a vendor. Employees can be "payroll only" with no email/login.
- Payroll lines are editable before locking (Edit pop-up: hours, rate, flat amount, bonus, reimbursement, note). Changing hours/rate/amount sets `stagity_payroll_items.manual`, and `rebuildItems` keeps manual lines as they are; "Undo my changes" resets. "Add someone" adds a one-off flat line.
- Vendors with `send_invoices = false` ("We don't invoice"): no drafts or emails, bill rate optional, hidden from the Invoices month list; consultants still do timesheets and payroll.
- Announcements (`/hr/announce`, `lib/announce.ts`, table `stagity_acknowledgments`): emails from timesheets@ with a personal "I acknowledge" link (`/ack/[token]`, public, noindex); HR sees who acknowledged and can remind. The email text lives in `announcementBody` (used by the email, preview and ack page). `send()` paragraphs: "## " = heading, "\n" = line break.
- Sign-up tracking: "signed up" = `must_change_password` false. `stagity_people.signup_due` (set at registration, default +7 days; a new temp password extends it a week). The cron emails a daily sign-up reminder from hr@ until then (skipped the day of registration and on days a timesheet reminder went out), and re-sends the announcement daily to anyone who hasn't acknowledged until `ack_by`.
- Admin sign-in is email + password (`stagity_admin_accounts`, scrypt, 5-try lockout); admins must also be in `HR_EMAILS`. The emailed 6-digit code is only for first-time setup / forgot password.
- Employees can't enter weekend hours (ignored server-side); submitted/approved timesheets are read-only; after submit they return to `/portal?submitted=`.
- Admin UI: forms open in pop-ups (`app/hr/Modal.tsx`: `ModalButton`, `ConfirmAction` for "Are you sure?"). Avoid browser `confirm()`.
- The official Form I-9 PDF lives at `lib/i9/assets/i-9.pdf` (edition 01/20/25). Field mapping is in `lib/i9/pdf.ts`. Re-map it when USCIS publishes a new edition.
- Schema changes go through Supabase migrations (`apply_migration`). Run the security advisor afterwards.
