import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { company } from "@/lib/content";
import { money } from "@/lib/portal/dates";

export type InvoicePdfData = {
  number: string;
  issueDate: string; // yyyy-mm-dd
  dueDate: string;
  termsDays: number;
  vendor: { name: string; address: string | null; apEmail: string };
  consultant: string;
  client: string | null;
  periodStart: string;
  periodEnd: string;
  poNumber: string | null;
  regularHours: number;
  overtimeHours: number;
  billRate: number;
  billOtRate: number;
  total: number;
  paymentInstructions: string;
  notes: string | null;
  draft?: boolean;
};

const ink = rgb(0.043, 0.071, 0.125);
const muted = rgb(0.36, 0.4, 0.47);
const accent = rgb(0.07, 0.35, 0.84);
const line = rgb(0.85, 0.87, 0.9);

const usDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let cur = "";
    for (const word of para.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && cur) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

function right(page: PDFPage, text: string, xRight: number, y: number, font: PDFFont, size: number, color = ink) {
  page.drawText(text, { x: xRight - font.widthOfTextAtSize(text, size), y, size, font, color });
}

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${d.number}`);
  doc.setAuthor(company.legalName);
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = 48;
  const R = 564;

  try {
    const logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public/logo.png")));
    const w = 170;
    page.drawImage(logo, { x: L - 6, y: 792 - 48 - (logo.height * w) / logo.width, width: w, height: (logo.height * w) / logo.width });
  } catch {
    page.drawText(company.legalName, { x: L, y: 730, size: 18, font: bold, color: ink });
  }

  right(page, d.draft ? "DRAFT INVOICE" : "INVOICE", R, 740, bold, 24, d.draft ? muted : ink);
  const meta: [string, string][] = [
    ["Invoice #", d.number],
    ["Invoice date", usDate(d.issueDate)],
    ["Due date", usDate(d.dueDate)],
    ["Terms", d.termsDays === 0 ? "Due on receipt" : `Net ${d.termsDays}`],
  ];
  meta.forEach(([k, v], i) => {
    const y = 712 - i * 16;
    right(page, k, R - 120, y, font, 10, muted);
    right(page, v, R, y, bold, 10);
  });

  // From / Bill to
  let y = 630;
  page.drawText("FROM", { x: L, y, size: 9, font: bold, color: accent });
  page.drawText("BILL TO", { x: 320, y, size: 9, font: bold, color: accent });
  const from = [company.legalName, company.addressLine1, company.addressLine2, company.phone, company.email];
  const to = [d.vendor.name, ...(d.vendor.address ? d.vendor.address.split(/\r?\n/).filter(Boolean) : []), d.vendor.apEmail];
  from.forEach((t, i) => page.drawText(t, { x: L, y: y - 16 - i * 14, size: 10, font: i === 0 ? bold : font, color: ink }));
  to.flatMap((t) => wrap(t, font, 10, 240)).forEach((t, i) => page.drawText(t, { x: 320, y: y - 16 - i * 14, size: 10, font: i === 0 ? bold : font, color: ink }));

  // Assignment details
  y = 520;
  page.drawRectangle({ x: L, y: y - 46, width: R - L, height: 58, color: rgb(0.96, 0.965, 0.973) });
  const details: [string, string][] = [
    ["Consultant", d.consultant],
    ["Client", d.client ?? "—"],
    ["Service period", `${usDate(d.periodStart)} – ${usDate(d.periodEnd)}`],
    ["PO / reference", d.poNumber || "—"],
  ];
  details.forEach(([k, v], i) => {
    const x = L + 12 + i * 129;
    page.drawText(k, { x, y: y - 8, size: 8.5, font, color: muted });
    wrap(v, bold, 10, 120).slice(0, 2).forEach((t, j) => page.drawText(t, { x, y: y - 24 - j * 12, size: 10, font: bold, color: ink }));
  });

  // Line items
  y = 440;
  const cols = { desc: L, hours: 380, rate: 470, amount: R };
  page.drawText("DESCRIPTION", { x: cols.desc, y, size: 9, font: bold, color: muted });
  right(page, "HOURS", cols.hours, y, bold, 9, muted);
  right(page, "RATE", cols.rate, y, bold, 9, muted);
  right(page, "AMOUNT", cols.amount, y, bold, 9, muted);
  page.drawLine({ start: { x: L, y: y - 8 }, end: { x: R, y: y - 8 }, thickness: 1, color: line });
  const rows: [string, number, number][] = [[`Professional services: ${d.consultant} (regular hours)`, d.regularHours, d.billRate]];
  if (d.overtimeHours > 0) rows.push([`Professional services: ${d.consultant} (overtime hours)`, d.overtimeHours, d.billOtRate]);
  y -= 28;
  for (const [desc, hours, rate] of rows) {
    page.drawText(desc, { x: cols.desc, y, size: 10, font, color: ink });
    right(page, hours.toFixed(2), cols.hours, y, font, 10);
    right(page, money(rate), cols.rate, y, font, 10);
    right(page, money(Math.round(hours * rate * 100) / 100), cols.amount, y, font, 10);
    page.drawLine({ start: { x: L, y: y - 10 }, end: { x: R, y: y - 10 }, thickness: 0.5, color: line });
    y -= 26;
  }
  y -= 6;
  right(page, "Total hours", cols.rate, y, font, 10, muted);
  right(page, (d.regularHours + d.overtimeHours).toFixed(2), cols.amount, y, font, 10);
  y -= 26;
  page.drawRectangle({ x: 360, y: y - 10, width: R - 360, height: 30, color: ink });
  page.drawText("TOTAL DUE", { x: 372, y: y + 0.5, size: 11, font: bold, color: rgb(1, 1, 1) });
  right(page, money(d.total), R - 12, y + 0.5, bold, 13, rgb(1, 1, 1));

  // Payment instructions & notes
  y -= 56;
  if (d.paymentInstructions) {
    page.drawText("PAYMENT INSTRUCTIONS", { x: L, y, size: 9, font: bold, color: accent });
    y -= 15;
    for (const t of wrap(d.paymentInstructions, font, 10, R - L).slice(0, 8)) {
      page.drawText(t, { x: L, y, size: 10, font, color: ink });
      y -= 14;
    }
    y -= 10;
  }
  if (d.notes) {
    page.drawText("NOTES", { x: L, y, size: 9, font: bold, color: accent });
    y -= 15;
    for (const t of wrap(d.notes, font, 10, R - L).slice(0, 6)) {
      page.drawText(t, { x: L, y, size: 10, font, color: ink });
      y -= 14;
    }
  }

  page.drawLine({ start: { x: L, y: 70 }, end: { x: R, y: 70 }, thickness: 0.5, color: line });
  page.drawText(`Thank you for your business. Questions about this invoice: ${company.email} · ${company.phone}`, { x: L, y: 54, size: 9, font, color: muted });
  return doc.save();
}
