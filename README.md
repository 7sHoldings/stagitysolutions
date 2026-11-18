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

## HR portal: remote Form I-9 (`/hr`)

Remote I-9 using the DHS **alternative procedure** for E-Verify employers (live video document review).
Not linked from the public site and blocked from search engines.

**Flow**
1. HR signs in at `/hr/login` with a 6-digit code emailed to an address in `HR_EMAILS`.
2. HR creates a case → the employee gets a private link (`/i9/<token>`, valid 14 days, single use).
3. Employee completes Section 1, uploads document photos (front/back) and e-signs.
4. HR reviews the copies, holds a live video call where the employee shows the same originals, completes and signs Section 2 (alternative-procedure box checked).
5. HR creates the case in E-Verify and records the case number and result.
6. "Print / save as PDF" produces the record with document copies. Enter the end date when someone leaves to get the retention date.

**Data:** `stagity_i9_cases`, `stagity_i9_documents`, `stagity_i9_audit` (append-only), `stagity_hr_login_codes`, and the private
`i9-documents` storage bucket. RLS is on with no policies, so only the server (secret key) can access them.
Section 1/2 data (including SSN) is encrypted with AES-256-GCM before it's stored.

**Environment variables:** `SUPABASE_SECRET_KEY`, `I9_ENCRYPTION_KEY`, `I9_SESSION_SECRET`, `HR_EMAILS` (plus the existing
`SUPABASE_URL` and `SMTP_*`). Back up `I9_ENCRYPTION_KEY` somewhere safe: without it, stored records can't be decrypted.
