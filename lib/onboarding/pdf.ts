import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { company } from "@/lib/content";
import { WORK_STATUSES, type Deposit, type Personal, type W4 } from "./server";

const EIN = "85-2309537"; // Stagity Solutions LLC (from the AKKODIS SOW signature block)
const asset = (f: string) => readFile(path.join(process.cwd(), "lib/onboarding/assets", f));
const usd = (n: number) => (n ? n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "");
const mdY = (iso: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "");
const ssnFmt = (s: string) => s.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{4})$/, "$1-$2-$3");

/** Fills the official IRS Form W-4, 2026 edition (lib/onboarding/assets/fw4.pdf), and adds the typed signature. */
export async function buildW4Pdf(p: Personal, w: W4) {
  const doc = await PDFDocument.load(await asset("fw4.pdf"), { ignoreEncryption: true });
  const form = doc.getForm();
  const set = (name: string, v: string) => {
    try { form.getTextField(`topmostSubform[0].Page1[0].${name}`).setText(v); } catch { /* field missing in this edition */ }
  };
  const check = (name: string, on: boolean) => {
    try { if (on) form.getCheckBox(`topmostSubform[0].Page1[0].${name}`).check(); } catch { /* ignore */ }
  };
  set("Step1a[0].f1_01[0]", `${p.firstName}${p.middleInitial ? ` ${p.middleInitial}` : ""}`);
  set("Step1a[0].f1_02[0]", p.lastName);
  set("Step1a[0].f1_03[0]", `${p.street}${p.apt ? `, ${p.apt}` : ""}`);
  set("Step1a[0].f1_04[0]", `${p.city}, ${p.state} ${p.zip}`);
  set("f1_05[0]", ssnFmt(p.ssn));
  check("c1_1[0]", w.filingStatus === "single");
  check("c1_1[1]", w.filingStatus === "married_joint");
  check("c1_1[2]", w.filingStatus === "head");
  check("c1_2[0]", w.multipleJobs);
  check("c1_3[0]", w.exempt);
  set("Step3_ReadOrder[0].f1_06[0]", usd(w.childrenAmount));
  set("Step3_ReadOrder[0].f1_07[0]", usd(w.otherDependentsAmount));
  set("f1_08[0]", usd(w.childrenAmount + w.otherDependentsAmount));
  set("f1_09[0]", usd(w.otherIncome));
  set("f1_10[0]", usd(w.deductions));
  set("f1_11[0]", usd(w.extraWithholding));
  set("f1_12[0]", `${company.legalName}\n${company.addressLine1}, ${company.addressLine2}`);
  set("f1_14[0]", EIN);
  form.flatten();
  const page = doc.getPages()[0];
  const font = await doc.embedFont(StandardFonts.HelveticaOblique);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(w.signedName, { x: 110, y: 96, size: 13, font });
  page.drawText(mdY(w.signedAt.slice(0, 10)), { x: 466, y: 96, size: 11, font: plain });
  page.drawText(`Signed electronically in the Stagity Solutions portal, ${new Date(w.signedAt).toUTCString()}`, { x: 36, y: 8, size: 6.5, font: plain, color: rgb(0.35, 0.35, 0.35) });
  return doc.save();
}

/** Fills the Stagity Direct Deposit Agreement form (it has no form fields, so text is placed on the page). */
export async function buildDepositPdf(name: string, d: Deposit) {
  const doc = await PDFDocument.load(await asset("direct-deposit.pdf"));
  const page = doc.getPages()[0];
  const H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sig = await doc.embedFont(StandardFonts.HelveticaOblique);
  // Coordinates measured from the form (top-based y converted to PDF space).
  const at = (text: string, x: number, top: number, f: PDFFont = font, size = 11) => page.drawText(text, { x, y: H - top, size, font: f });
  at(name, 116, 226);
  at(d.bankName, 152, 426);
  at(d.bankState, 384, 426);
  at(d.routing, 104, 446);
  at(d.account, 104, 467);
  at("X", d.accountType === "checking" ? 348.5 : 404, 467, font, 10);
  at(d.signedName, 162, 537, sig, 13);
  at(mdY(d.signedAt.slice(0, 10)), 372, 537);
  page.drawText(`Signed electronically in the Stagity Solutions portal on ${new Date(d.signedAt).toUTCString()}`, { x: 31, y: H - 610, size: 7, font, color: rgb(0.35, 0.35, 0.35) });
  return doc.save();
}

/** The Stagity "Employee Personal Information" form, laid out like the Word version. */
export async function buildPersonalPdf(p: Personal, extra: { emergency?: { name: string; phone: string; relationship: string }; deposit?: Deposit | null }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  const title = (t: string) => { y -= 10; page.drawText(t, { x: 50, y, size: 12, font: bold, color: rgb(0.07, 0.35, 0.84) }); y -= 8; page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.8, color: rgb(0.8, 0.84, 0.9) }); y -= 18; };
  const row = (k: string, v: string, k2?: string, v2?: string) => {
    page.drawText(k, { x: 50, y, size: 9.5, font: bold }); page.drawText(v || "—", { x: 170, y, size: 10.5, font });
    if (k2) { page.drawText(k2, { x: 330, y, size: 9.5, font: bold }); page.drawText(v2 || "—", { x: 440, y, size: 10.5, font }); }
    y -= 20;
  };
  page.drawText(`${company.legalName}: Employee Personal Information`, { x: 50, y, size: 15, font: bold }); y -= 26;
  title("Personal details");
  row("First name", p.firstName, "M.I.", p.middleInitial);
  row("Last name", p.lastName);
  row("Street address", p.street, "Apt #", p.apt);
  row("City", p.city, "State / ZIP", `${p.state} ${p.zip}`);
  row("SSN", ssnFmt(p.ssn), "DOB", mdY(p.dob));
  row("Working status", WORK_STATUSES.find((w) => w.value === p.workStatus)?.label ?? p.workStatus, "OPT/EAD #", p.statusNumber);
  row("Status exp date", mdY(p.statusExpires));
  row("Cell phone", p.cellPhone, "Home phone", p.homePhone);
  row("Personal email", p.personalEmail);
  title("Employee work info");
  row("Work full address", p.workAddress);
  row("Work phone", p.workPhone, "Work email", p.workEmail);
  if (extra.deposit) {
    title("Direct deposit info");
    row("Bank name", extra.deposit.bankName, "State", extra.deposit.bankState);
    row("Account #", extra.deposit.account, "Routing #", extra.deposit.routing);
  }
  if (extra.emergency) {
    title("Emergency contact");
    row("Contact name", extra.emergency.name, "Relationship", extra.emergency.relationship);
    row("Phone number", extra.emergency.phone);
  }
  page.drawText("Submitted through the Stagity Solutions employee portal. Confidential.", { x: 50, y: 40, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  return doc.save();
}

/** Appends a signature certificate page to a document the employee signed in the portal. */
export async function stampSignedPdf(original: Uint8Array, s: { title: string; name: string; email: string; signedAt: string; ip: string; sha256: string }) {
  const doc = await PDFDocument.load(original, { ignoreEncryption: true });
  const page: PDFPage = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sig = await doc.embedFont(StandardFonts.HelveticaOblique);
  let y = 720;
  const line = (k: string, v: string) => { page.drawText(k, { x: 60, y, size: 10, font: bold }); page.drawText(v, { x: 200, y, size: 10, font }); y -= 22; };
  page.drawText("Electronic signature certificate", { x: 60, y, size: 18, font: bold }); y -= 40;
  line("Document", s.title);
  line("Signed by", s.name);
  line("Email", s.email);
  line("Signed at", new Date(s.signedAt).toUTCString());
  line("IP address", s.ip || "unknown");
  line("Document SHA-256", s.sha256.slice(0, 32));
  page.drawText(s.sha256.slice(32), { x: 200, y: y + 8, size: 10, font }); y -= 20;
  page.drawText(s.name, { x: 60, y: y - 10, size: 26, font: sig }); y -= 24;
  page.drawLine({ start: { x: 60, y }, end: { x: 360, y }, thickness: 0.8 }); y -= 14;
  page.drawText("Signature", { x: 60, y, size: 9, font });
  page.drawText(
    `${s.name} reviewed this document in the ${company.legalName} employee portal and agreed to sign it electronically by typing their full name.`,
    { x: 60, y: y - 40, size: 9, font, maxWidth: 490, lineHeight: 12 },
  );
  return doc.save();
}
