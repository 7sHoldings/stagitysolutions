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
- Timesheet/payroll rules: weeks run Mon–Sun; overtime is hours over 40 per week at 1.5×; a month's timesheets are due the 5th of the next month; payroll is paid on the 20th; late timesheets roll to the next payroll. Dates use US Central time (`lib/portal/dates.ts`).
- Vendor invoices: timesheet days link to invoices via `stagity_timesheet_days.invoice_id`. Drafts are rebuilt by `syncDraftInvoices`/`recomputeDraft` (`lib/invoices/server.ts`); sent invoices are never changed, only voided (which frees the hours for a new draft).
- The official Form I-9 PDF lives at `lib/i9/assets/i-9.pdf` (edition 01/20/25). Field mapping is in `lib/i9/pdf.ts`. Re-map it when USCIS publishes a new edition.
- Schema changes go through Supabase migrations (`apply_migration`). Run the security advisor afterwards.
