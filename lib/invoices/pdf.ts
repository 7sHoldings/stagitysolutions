import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { company } from "@/lib/content";

// Stagity vendor invoice: brand header, bill-to/from, total, details strip, one line (hours × rate), total.

export type InvoicePdfData = {
  number: string;
  issueDate: string; // yyyy-mm-dd
  periodLabel: string; // e.g. "September 2026"
  vendor: { name: string; address: string | null; apEmail: string };
  consultant: string;
  client: string | null;
  periodStart: string;
  periodEnd: string;
  poNumber: string | null;
  hours: number; // all hours worked in the period
  billRate: number;
  total: number; // hours × billRate
  notes: string | null;
  draft?: boolean;
};

const ink = rgb(0.043, 0.071, 0.125); // #0b1220
const body = rgb(0.23, 0.27, 0.34);
const muted = rgb(0.36, 0.4, 0.47);
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

  // Total card
  const cardX = 404;
  page.drawRectangle({ x: cardX, y: y - 62, width: R - cardX, height: 74, color: ink });
  page.drawRectangle({ x: cardX, y: y - 62, width: 4, height: 74, color: orange });
  page.drawText("TOTAL", { x: cardX + 18, y: y - 8, size: 8, font: bold, color: rgb(0.68, 0.72, 0.78) });
  page.drawText(usd(d.total), { x: cardX + 18, y: y - 40, size: 22, font: bold, color: white });

  // Details strip
  y = 532;
  const details: [string, string][] = [
    ["Invoice date", mdY(d.issueDate)],
    ["Service period", d.periodLabel],
    ["Consultant", d.consultant],
    ...(d.poNumber ? ([["PO / reference", d.poNumber]] as [string, string][]) : []),
  ];
  const colW = W / 4;
  page.drawRectangle({ x: L, y: y - 40, width: W, height: 52, color: panel });
  details.forEach(([k, v], i) => {
    const x = L + 16 + i * colW;
    label(k, x, y - 6);
    page.drawText(wrap(v, bold, 10.5, colW - 22)[0], { x, y: y - 24, size: 10.5, font: bold, color: ink });
  });

  // One line: total hours × bill rate
  y = 452;
  const c = { desc: L, hours: 382, rate: 466, amount: R };
  label("Description", c.desc, y);
  right(page, "HOURS", c.hours, y, bold, 8, muted);
  right(page, "RATE", c.rate, y, bold, 8, muted);
  right(page, "AMOUNT", c.amount, y, bold, 8, muted);
  page.drawLine({ start: { x: L, y: y - 9 }, end: { x: R, y: y - 9 }, thickness: 1.5, color: ink });
  y -= 32;
  page.drawText(`${d.consultant}: consulting services`, { x: c.desc, y, size: 10.5, font: bold, color: ink });
  page.drawText(wrap(`${d.client ? `${d.client} · ` : ""}${d.periodLabel}`, font, 9, 300)[0], { x: c.desc, y: y - 14, size: 9, font, color: muted });
  right(page, d.hours.toFixed(2), c.hours, y, font, 10.5, body);
  right(page, usd(d.billRate), c.rate, y, font, 10.5, body);
  right(page, usd(d.total), c.amount, y, bold, 10.5);
  page.drawLine({ start: { x: L, y: y - 26 }, end: { x: R, y: y - 26 }, thickness: 0.75, color: line });

  // Total
  y -= 56;
  page.drawText("Total", { x: 372, y, size: 12, font: bold, color: ink });
  right(page, usd(d.total), R, y, bold, 14);

  if (d.notes) {
    y -= 50;
    label("Notes", L, y);
    wrap(d.notes, font, 9.5, W).slice(0, 3).forEach((t, i) => page.drawText(t, { x: L, y: y - 16 - i * 13.5, size: 9.5, font, color: body }));
  }

  page.drawRectangle({ x: 0, y: 0, width: 612, height: 6, color: ink });
  return doc.save();
}
