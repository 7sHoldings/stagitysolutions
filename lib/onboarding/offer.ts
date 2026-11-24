import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { db } from "@/lib/i9/server";
import { company } from "@/lib/content";
import { OB_BUCKET } from "./server";

/**
 * Default offer letter. HR can edit it in the portal (Onboarding → Offer letter template).
 * {{placeholders}} are filled from the offer; "## " starts a heading and "- " a bullet.
 */
export const DEFAULT_OFFER_TEMPLATE = `{{date}}

{{employee_name}}
{{employee_address}}

Dear {{first_name}},

We are pleased to offer you the position of {{job_title}} with {{company}}. We were impressed with your skills and experience, and we are excited to have you on our team.

## Position
- Job title: {{job_title}}
- Employment type: {{employment_type}}
- Start date: {{start_date}}
- Work location: {{work_location}}
- Client: {{client}}

## Compensation
- Pay: {{pay}}
- Pay schedule: {{pay_schedule}}
- Payroll is processed through ADP. Timesheets approved by the client must be submitted in the Stagity Solutions employee portal every week.

## Job description
{{job_description}}

## Job duties
{{job_duties}}

## Terms
This offer is contingent on your completion of Form I-9 and verification of your eligibility to work in the United States through E-Verify, and on your completing the new-hire paperwork in the employee portal. Your employment with {{company}} is at-will, which means either you or the company may end it at any time, with or without cause or notice.

{{extra_terms}}

Please review this letter and sign below to accept the offer. If you have any questions, contact us at {{hr_email}} or {{phone}}.

We look forward to working with you.

Sincerely,`;

export const PLACEHOLDERS = [
  "date", "employee_name", "first_name", "employee_address", "job_title", "employment_type", "start_date", "pay", "pay_schedule",
  "work_location", "client", "job_description", "job_duties", "extra_terms", "company", "hr_email", "phone",
];

export type Offer = {
  id: string; person_id: string; offer_date: string; job_title: string; start_date: string | null; employment_type: string;
  pay_type: "hourly" | "salary" | "monthly"; pay_amount: number; pay_schedule: string; work_location: string | null; client_name: string | null;
  job_description: string | null; job_duties: string | null; extra_terms: string | null; body_snapshot: string | null;
  signature_id: string | null; status: string; countersigned_at: string | null; countersigned_by: string | null;
};

const longDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "To be confirmed");
export const payText = (o: Pick<Offer, "pay_type" | "pay_amount">) => {
  const n = Number(o.pay_amount).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  return o.pay_type === "hourly" ? `${n} per hour` : o.pay_type === "monthly" ? `${n} per month` : `${n} per year`;
};

async function setting(key: string) {
  const { data } = await db().from("stagity_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}
export const offerTemplate = async () => (await setting("offer_letter_template")) || DEFAULT_OFFER_TEMPLATE;
export async function companySigner() {
  const [name, title, image] = await Promise.all([setting("offer_signer_name"), setting("offer_signer_title"), setting("offer_signature_path")]);
  return { name: name ?? "", title: title ?? "", imagePath: image };
}

/** Fills the template for one person. */
export function fillTemplate(tpl: string, o: Offer, p: { first_name: string; last_name: string; address?: string }) {
  const v: Record<string, string> = {
    date: longDate(o.offer_date), employee_name: `${p.first_name} ${p.last_name}`, first_name: p.first_name, employee_address: p.address ?? "",
    job_title: o.job_title, employment_type: o.employment_type, start_date: longDate(o.start_date), pay: payText(o), pay_schedule: o.pay_schedule,
    work_location: o.work_location || "To be confirmed", client: o.client_name || "To be confirmed",
    job_description: o.job_description || "", job_duties: o.job_duties || "", extra_terms: o.extra_terms || "",
    company: company.legalName, hr_email: company.email, phone: company.phone,
  };
  return tpl
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => v[k] ?? "")
    .split("\n")
    .filter((line, i, arr) => !(line.trim() === "" && (arr[i - 1] ?? "").trim() === "")) // collapse blank runs left by empty fields
    .join("\n")
    .replace(/^- (Client|Work location): To be confirmed\n/gm, (m) => (o.client_name || o.work_location ? m : ""));
}

type SigBlock = { name: string; title?: string; signedAt?: string | null; image?: Uint8Array | null };

/** Letterhead + body + two signature blocks (employee / company). */
export async function buildOfferPdf(body: string, employee: SigBlock, employer: SigBlock) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sigFont = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  let logo = null;
  try { logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public/logo.png"))); } catch { /* no logo */ }
  const W = 612, H = 792, M = 64, width = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - 56;
  const header = () => {
    if (logo) { const s = 120 / logo.width; page.drawImage(logo, { x: M, y: H - 40 - logo.height * s, width: 120, height: logo.height * s }); }
    page.drawText(company.legalName, { x: W - M - sans.widthOfTextAtSize(company.legalName, 9), y: H - 50, size: 9, font: sans, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`${company.addressLine1}, ${company.addressLine2}`, { x: W - M - sans.widthOfTextAtSize(`${company.addressLine1}, ${company.addressLine2}`, 8), y: H - 62, size: 8, font: sans, color: rgb(0.45, 0.45, 0.45) });
    page.drawLine({ start: { x: M, y: H - 92 }, end: { x: W - M, y: H - 92 }, thickness: 0.8, color: rgb(0.07, 0.35, 0.84) });
    y = H - 118;
  };
  header();
  const newPageIfNeeded = (need: number) => { if (y - need < 70) { page = doc.addPage([W, H]); header(); } };
  const wrap = (text: string, f: PDFFont, size: number, w: number) => {
    const out: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(t, size) > w && line) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { y -= 8; continue; }
    if (line.startsWith("## ")) {
      newPageIfNeeded(30); y -= 6;
      page.drawText(line.slice(3), { x: M, y, size: 12, font: bold, color: rgb(0.07, 0.2, 0.45) }); y -= 18; continue;
    }
    const bullet = line.startsWith("- ");
    const text = bullet ? line.slice(2) : line;
    for (const [i, l] of wrap(text, font, 11, bullet ? width - 16 : width).entries()) {
      newPageIfNeeded(16);
      if (bullet && i === 0) page.drawText("•", { x: M + 2, y, size: 11, font });
      page.drawText(l, { x: bullet ? M + 16 : M, y, size: 11, font }); y -= 15;
    }
  }
  // Signature blocks
  newPageIfNeeded(150); y -= 24;
  const col = (x: number, label: string, s: SigBlock) => {
    let yy = y;
    page.drawText(label, { x, y: yy, size: 9, font: sans, color: rgb(0.4, 0.4, 0.4) }); yy -= 46;
    page.drawLine({ start: { x, y: yy }, end: { x: x + 210, y: yy }, thickness: 0.7 });
    page.drawText(s.name || " ", { x, y: yy - 14, size: 10.5, font: bold });
    if (s.title) page.drawText(s.title, { x, y: yy - 27, size: 9.5, font });
    page.drawText(`Date: ${s.signedAt ? longDate(s.signedAt.slice(0, 10)) : "________________"}`, { x, y: yy - (s.title ? 40 : 27), size: 9.5, font });
    return yy;
  };
  const lineYEmp = col(M, "ACCEPTED AND AGREED: EMPLOYEE", employee);
  const lineYCo = col(M + 260, `FOR ${company.legalName.toUpperCase()}`, employer);
  if (employee.signedAt) page.drawText(employee.name, { x: M + 2, y: lineYEmp + 8, size: 18, font: sigFont, color: rgb(0.05, 0.15, 0.45) });
  if (employer.signedAt) {
    if (employer.image) {
      try {
        const img = await doc.embedPng(employer.image).catch(() => doc.embedJpg(employer.image!));
        const h = 38, w = Math.min(200, (img.width / img.height) * h);
        page.drawImage(img, { x: M + 262, y: lineYCo + 3, width: w, height: h });
      } catch { page.drawText(employer.name, { x: M + 262, y: lineYCo + 8, size: 18, font: sigFont, color: rgb(0.05, 0.15, 0.45) }); }
    } else page.drawText(employer.name, { x: M + 262, y: lineYCo + 8, size: 18, font: sigFont, color: rgb(0.05, 0.15, 0.45) });
  }
  return doc.save();
}

/** Loads the saved company signature image (if HR uploaded one). */
export async function companySignatureImage(pathInBucket: string | null) {
  if (!pathInBucket) return null;
  const { data } = await db().storage.from(OB_BUCKET).download(pathInBucket);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
