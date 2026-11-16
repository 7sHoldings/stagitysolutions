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
| Old WordPress URL redirects | `next.config.ts` |

Photo placeholders are the grey `.media` boxes — add images to `public/images/` and use `next/image`.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (`Stagity-Solutions` project) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |

## Contact form

Submissions go to the `stagity_contact_submissions` table in the **Stagity-Solutions** Supabase project. Visitors can only insert rows (row-level security); view messages in Supabase → Table Editor.
