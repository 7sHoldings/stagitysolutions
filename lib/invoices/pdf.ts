import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { company } from "@/lib/content";

// Layout follows Stagity's existing invoice: logo top right, company address, INVOICE, bill-to block,
// Invoice# / Invoice Date / Invoice Period / Employee Name, an Item–Description–Unit Price–Quantity–Amount table,
// and a Subtotal / Total / Amount Paid / Balance Due box.

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

const ink = rgb(0.08, 0.08, 0.1);
const grey = rgb(0.45, 0.47, 0.5);
const border = rgb(0.35, 0.35, 0.38);
const shade = rgb(0.91, 0.91, 0.92);

const mdY = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const L = 54;
  const R = 558;

  // Logo, top right
  try {
    const logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public/logo.png")));
    const w = 190;
    const h = (logo.height * w) / logo.width;
    page.drawImage(logo, { x: R - w, y: 752 - h, width: w, height: h });
  } catch {
    right(page, company.legalName, R, 720, sansBold, 16);
  }

  // Company address, left
  [company.legalName, company.addressLine1 + ",", company.addressLine2].forEach((t, i) =>
    page.drawText(t, { x: L, y: 640 - i * 12, size: 10.5, font: serifBold, color: ink }),
  );

  // INVOICE title, right (letter-spaced)
  const title = d.draft ? "DRAFT  INVOICE" : "INVOICE";
  const spacing = 3;
  const titleWidth = [...title].reduce((a, ch) => a + sansBold.widthOfTextAtSize(ch, 17) + spacing, -spacing);
  let tx = R - titleWidth;
  for (const ch of title) {
    page.drawText(ch, { x: tx, y: 590, size: 17, font: sansBold, color: d.draft ? grey : ink });
    tx += sansBold.widthOfTextAtSize(ch, 17) + spacing;
  }

  // Bill to, left
  const billTo = [d.vendor.name + ",", ...(d.vendor.address ? d.vendor.address.split(/\r?\n/).filter(Boolean) : [])];
  billTo.flatMap((t) => wrap(t, serifBold, 10.5, 250)).slice(0, 6).forEach((t, i) =>
    page.drawText(t, { x: L, y: 545 - i * 13, size: 10.5, font: serifBold, color: ink }),
  );

  // Invoice details, right
  const meta: [string, string][] = [
    ["Invoice#", d.number],
    ["Invoice Date", mdY(d.issueDate)],
    ["Due Date", mdY(d.dueDate)],
    ["Invoice Period", d.periodLabel],
    ["Employee Name", d.consultant],
  ];
  if (d.poNumber) meta.push(["PO / Reference", d.poNumber]);
  meta.forEach(([k, v], i) => {
    const y = 548 - i * 22;
    page.drawText(k, { x: 380, y, size: 9, font: sansBold, color: ink });
    page.drawText(v, { x: 472, y, size: 9, font: sans, color: ink });
  });

  // Line-item table
  const top = 400;
  const tableBottom = 255;
  const cols = { item: L + 10, desc: L + 92, price: 420, qty: 490, amount: R - 8 };
  page.drawRectangle({ x: L, y: top - 28, width: R - L, height: 28, color: shade, borderColor: border, borderWidth: 1 });
  page.drawText("Item", { x: cols.item, y: top - 18, size: 10.5, font: sansBold, color: ink });
  page.drawText("Description", { x: cols.desc, y: top - 18, size: 10.5, font: sansBold, color: ink });
  right(page, "Unit Price", cols.price, top - 18, sansBold, 10.5);
  right(page, "Quantity", cols.qty + 6, top - 18, sansBold, 10.5);
  right(page, "Amount", cols.amount, top - 18, sansBold, 10.5);
  page.drawRectangle({ x: L, y: tableBottom, width: R - L, height: top - 28 - tableBottom, borderColor: border, borderWidth: 1 });

  const rows: [string, string, number, number][] = [
    ["Hours", d.client ? `Consulting services at ${d.client}` : "Consulting services", d.billRate, d.regularHours],
  ];
  if (d.overtimeHours > 0) rows.push(["OT Hours", "Overtime hours", d.billOtRate, d.overtimeHours]);
  let y = top - 56;
  for (const [item, desc, price, qty] of rows) {
    page.drawText(item, { x: cols.item, y, size: 11, font: sansBold, color: ink });
    page.drawText(wrap(desc, sans, 9.5, 220)[0], { x: cols.desc, y, size: 9.5, font: sans, color: ink });
    right(page, `$${amt(price)}`, cols.price, y, sans, 9.5);
    right(page, amt(qty), cols.qty, y, sans, 9.5);
    right(page, amt(Math.round(price * qty * 100) / 100), cols.amount, y, sans, 9.5);
    page.drawLine({ start: { x: L, y: y - 6 }, end: { x: R, y: y - 6 }, thickness: 0.75, color: border });
    y -= 30;
  }

  // Totals box (right) and payment instructions (left)
  const boxTop = tableBottom - 6;
  const boxH = 140;
  const split = 370;
  page.drawRectangle({ x: L, y: boxTop - boxH, width: R - L, height: boxH, borderColor: border, borderWidth: 1 });
  page.drawLine({ start: { x: split, y: boxTop }, end: { x: split, y: boxTop - boxH }, thickness: 1, color: border });
  const paid = d.amountPaid ?? 0;
  const totals: [string, number][] = [["Subtotal", d.total], ["Total", d.total], ["Amount Paid", paid]];
  totals.forEach(([k, v], i) => {
    const ty = boxTop - 22 - i * 26;
    page.drawText(k, { x: split + 16, y: ty, size: 10.5, font: sansBold, color: ink });
    right(page, amt(v), cols.amount, ty, sans, 10);
    if (i === 0) page.drawLine({ start: { x: split, y: ty - 9 }, end: { x: R, y: ty - 9 }, thickness: 0.75, color: border });
  });
  page.drawRectangle({ x: split, y: boxTop - boxH, width: R - split, height: 32, color: shade, borderColor: border, borderWidth: 1 });
  page.drawText("Balance Due", { x: split + 16, y: boxTop - boxH + 11, size: 11, font: sansBold, color: ink });
  right(page, `$${amt(d.total - paid)}`, cols.amount, boxTop - boxH + 11, sansBold, 11);

  let py = boxTop - 18;
  const leftW = split - L - 24;
  const terms = d.termsDays === 0 ? "Payment due on receipt." : `Payment terms: Net ${d.termsDays}.`;
  page.drawText(terms, { x: L + 12, y: py, size: 9, font: sansBold, color: ink });
  py -= 14;
  for (const t of wrap(d.paymentInstructions, sans, 8.5, leftW).slice(0, 6)) {
    page.drawText(t, { x: L + 12, y: py, size: 8.5, font: sans, color: ink });
    py -= 11.5;
  }
  if (d.notes) {
    py -= 4;
    for (const t of wrap(d.notes, sans, 8.5, leftW).slice(0, 3)) {
      page.drawText(t, { x: L + 12, y: py, size: 8.5, font: sans, color: grey });
      py -= 11.5;
    }
  }

  // Footer
  const footer = `${company.legalName} · ${company.phone} · ${company.email}`;
  page.drawText(footer, { x: (612 - sans.widthOfTextAtSize(footer, 8.5)) / 2, y: 40, size: 8.5, font: sans, color: grey });
  return doc.save();
}
