import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { company } from "@/lib/content";

// Stagity vendor invoice: brand header, amount due up front, details strip, line items, totals, how to pay.

export type InvoicePdfData = {
  number: string;
  issueDate: string; // yyyy-mm-dd
  dueDate: string;
  termsDays: number;
  periodLabel: string; // e.g. "September 2026"
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
  amountPaid?: number;
  paymentInstructions: string;
  notes: string | null;
  draft?: boolean;
};

const ink = rgb(0.043, 0.071, 0.125); // #0b1220
const body = rgb(0.23, 0.27, 0.34);
const muted = rgb(0.36, 0.4, 0.47);
const blue = rgb(0.07, 0.35, 0.84); // #1259d6
const sky = rgb(0.16, 0.66, 0.88); // logo blue
const orange = rgb(0.94, 0.49, 0.06); // #f07c10
const line = rgb(0.88, 0.9, 0.93);
const panel = rgb(0.96, 0.97, 0.98);
const white = rgb(1, 1, 1);

const mdY = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  doc.setSubject(`${d.consultant}: ${d.periodLabel}`);
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = 48;
  const R = 564;
  const W = R - L;
  const paid = d.amountPaid ?? 0;
  const due = Math.round((d.total - paid) * 100) / 100;

  // Draft watermark (drawn first so it sits behind everything)
  if (d.draft) page.drawText("DRAFT", { x: 150, y: 260, size: 130, font: bold, color: rgb(0.93, 0.94, 0.96), rotate: degrees(30) });

  // Brand stripe
  page.drawRectangle({ x: 0, y: 784, width: 408, height: 8, color: sky });
  page.drawRectangle({ x: 408, y: 784, width: 204, height: 8, color: orange });

  // Header: logo left, INVOICE + number right
  try {
    const logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public/logo.png")));
    const w = 176;
    const h = (logo.height * w) / logo.width;
    page.drawImage(logo, { x: L - 6, y: 762 - h, width: w, height: h });
  } catch {
    page.drawText(company.legalName, { x: L, y: 724, size: 18, font: bold, color: ink });
  }
  right(page, d.draft ? "DRAFT INVOICE" : "INVOICE", R, 728, bold, 26, d.draft ? muted : ink);
  right(page, d.draft ? "Number assigned when sent" : `No. ${d.number}`, R, 708, font, 11, muted);

  // From / Bill to / Amount due
  let y = 650;
  const label = (t: string, x: number, yy: number, c = muted) => page.drawText(t.toUpperCase(), { x, y: yy, size: 8, font: bold, color: c });
  label("Bill to", L, y);
  label("From", L + 200, y);
  const billTo = [d.vendor.name, ...(d.vendor.address ? d.vendor.address.split(/\r?\n/).map((t) => t.replace(/,\s*$/, "")).filter(Boolean) : [])];
  billTo.flatMap((t, i) => wrap(t, i ? font : bold, 10, 180).map((w) => [w, i] as const)).slice(0, 6)
    .forEach(([t, i], j) => page.drawText(t, { x: L, y: y - 16 - j * 14, size: 10, font: i ? font : bold, color: i ? body : ink }));
  [company.legalName, company.addressLine1, company.addressLine2, company.phone, company.email]
    .forEach((t, i) => page.drawText(t, { x: L + 200, y: y - 16 - i * 14, size: 10, font: i ? font : bold, color: i ? body : ink }));

  // Amount due card
  const cardX = 404;
  page.drawRectangle({ x: cardX, y: y - 76, width: R - cardX, height: 88, color: ink });
  page.drawRectangle({ x: cardX, y: y - 76, width: 4, height: 88, color: orange });
  page.drawText(paid > 0 && due <= 0 ? "PAID IN FULL" : "AMOUNT DUE", { x: cardX + 18, y: y - 8, size: 8, font: bold, color: rgb(0.68, 0.72, 0.78) });
  page.drawText(usd(due), { x: cardX + 18, y: y - 38, size: 22, font: bold, color: white });
  page.drawText(d.termsDays === 0 ? "Due on receipt" : `Due ${mdY(d.dueDate)}`, { x: cardX + 18, y: y - 60, size: 10, font, color: rgb(0.85, 0.88, 0.92) });

  // Details strip
  y = 532;
  const details: [string, string][] = [
    ["Invoice date", mdY(d.issueDate)],
    ["Service period", d.periodLabel],
    ["Terms", d.termsDays === 0 ? "Due on receipt" : `Net ${d.termsDays}`],
    [d.poNumber ? "PO / reference" : "Consultant", d.poNumber || d.consultant],
  ];
  page.drawRectangle({ x: L, y: y - 40, width: W, height: 52, color: panel });
  details.forEach(([k, v], i) => {
    const x = L + 16 + i * (W / 4);
    label(k, x, y - 6);
    page.drawText(wrap(v, bold, 10.5, W / 4 - 22)[0], { x, y: y - 24, size: 10.5, font: bold, color: ink });
  });

  // Line items
  y = 452;
  const c = { desc: L, hours: 382, rate: 466, amount: R };
  label("Description", c.desc, y);
  right(page, "HOURS", c.hours, y, bold, 8, muted);
  right(page, "RATE", c.rate, y, bold, 8, muted);
  right(page, "AMOUNT", c.amount, y, bold, 8, muted);
  page.drawLine({ start: { x: L, y: y - 9 }, end: { x: R, y: y - 9 }, thickness: 1.5, color: ink });
  const service = d.client ? `Consulting services at ${d.client}` : "Consulting services";
  const rows: [string, string, number, number][] = [[`${d.consultant}: regular hours`, `${service} · ${d.periodLabel}`, d.regularHours, d.billRate]];
  if (d.overtimeHours > 0) rows.push([`${d.consultant}: overtime hours`, `Hours over 40 in a workweek · ${d.periodLabel}`, d.overtimeHours, d.billOtRate]);
  y -= 32;
  for (const [title, sub, hours, rate] of rows) {
    page.drawText(title, { x: c.desc, y, size: 10.5, font: bold, color: ink });
    page.drawText(wrap(sub, font, 9, 300)[0], { x: c.desc, y: y - 14, size: 9, font, color: muted });
    right(page, hours.toFixed(2), c.hours, y, font, 10.5, body);
    right(page, usd(rate), c.rate, y, font, 10.5, body);
    right(page, usd(Math.round(hours * rate * 100) / 100), c.amount, y, bold, 10.5);
    page.drawLine({ start: { x: L, y: y - 26 }, end: { x: R, y: y - 26 }, thickness: 0.75, color: line });
    y -= 46;
  }

  // Totals
  y -= 2;
  const tl = 372;
  const totals: [string, string][] = [
    ["Total hours", (d.regularHours + d.overtimeHours).toFixed(2)],
    ["Subtotal", usd(d.total)],
    ["Amount paid", paid ? `-${usd(paid)}` : usd(0)],
  ];
  for (const [k, v] of totals) {
    page.drawText(k, { x: tl, y, size: 10, font, color: muted });
    right(page, v, R, y, font, 10, body);
    y -= 20;
  }
  y -= 14;
  page.drawRectangle({ x: tl - 12, y: y - 12, width: R - tl + 12, height: 32, color: blue });
  page.drawText("Balance due", { x: tl, y: y - 1, size: 11, font: bold, color: white });
  right(page, usd(due), R - 12, y - 1, bold, 13, white);

  // How to pay / Questions
  y = 214;
  page.drawLine({ start: { x: L, y: y + 16 }, end: { x: R, y: y + 16 }, thickness: 0.75, color: line });
  label("How to pay", L, y, blue);
  label("Questions?", 404, y, blue);
  let py = y - 16;
  const instr = d.paymentInstructions || "Please contact us for payment details.";
  for (const t of wrap(instr, font, 9.5, 330).slice(0, 7)) {
    page.drawText(t, { x: L, y: py, size: 9.5, font, color: body });
    py -= 13.5;
  }
  if (!d.draft) page.drawText(`Please include invoice no. ${d.number} with your payment.`, { x: L, y: py - 4, size: 9.5, font: bold, color: ink });
  ["Contact our accounts team:", company.email, company.phone].forEach((t, i) =>
    page.drawText(t, { x: 404, y: y - 16 - i * 13.5, size: 9.5, font: i ? bold : font, color: i ? ink : body }),
  );
  if (d.notes) {
    label("Notes", L, py - 32);
    wrap(d.notes, font, 9.5, W).slice(0, 3).forEach((t, i) => page.drawText(t, { x: L, y: py - 48 - i * 13.5, size: 9.5, font, color: body }));
  }

  // Footer
  page.drawText("Thank you for your business.", { x: L, y: 48, size: 10, font: bold, color: ink });
  right(page, `${company.legalName} · ${company.url.replace("https://", "")}`, R, 48, font, 9, muted);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 6, color: ink });

  return doc.save();
}
