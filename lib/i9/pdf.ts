import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFName, PDFArray, PDFRef, StandardFonts, rgb } from "pdf-lib";
import type { DocEntry, Section1, Section2 } from "./forms";

// Fills the official USCIS Form I-9 (edition stored in lib/i9/assets/i-9.pdf).
// Field names were mapped from that file; re-check them if USCIS publishes a new edition.

const mdY = (iso: string) => {
  if (!iso || iso === "N/A") return iso || "";
  const d = iso.length === 10 ? iso : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));
  return `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
};

/** Short names for the form's document boxes (USCIS accepts common abbreviations). */
const SHORT: Record<string, string> = {
  "U.S. Passport": "U.S. Passport",
  "U.S. Passport Card": "U.S. Passport Card",
  "Permanent Resident Card (Form I-551)": "Perm. Resident Card (I-551)",
  "Foreign passport with temporary I-551 stamp or printed notation on a machine-readable immigrant visa": "Foreign Passport w/ I-551 Stamp",
  "Employment Authorization Document (Form I-766)": "EAD (I-766)",
  "Foreign passport with Form I-94 or I-94A (nonimmigrant authorized to work)": "Foreign Passport",
  "Passport from the Federated States of Micronesia or the Republic of the Marshall Islands with Form I-94": "FSM/RMI Passport",
  "Driver's license issued by a U.S. state or outlying possession": "Driver's License",
  "ID card issued by federal, state or local government agency": "Government ID Card",
  "School ID card with a photograph": "School ID Card",
  "Voter's registration card": "Voter Registration Card",
  "U.S. Military card or draft record": "U.S. Military Card",
  "Military dependent's ID card": "Military Dependent ID Card",
  "U.S. Coast Guard Merchant Mariner Card": "USCG Merchant Mariner Card",
  "Native American tribal document": "Native American Tribal Doc.",
  "Driver's license issued by a Canadian government authority": "Canadian Driver's License",
  "School record or report card (under age 18)": "School Record",
  "Clinic, doctor or hospital record (under age 18)": "Medical Record",
  "Day-care or nursery school record (under age 18)": "Day-care Record",
  "U.S. Social Security account number card (without employment restrictions)": "Social Security Card",
  "Certification of report of birth issued by the U.S. Department of State (Form DS-1350, FS-545, FS-240)": "Cert. of Report of Birth",
  "Original or certified copy of a U.S. birth certificate bearing an official seal": "Birth Certificate",
  "U.S. Citizen ID Card (Form I-197)": "U.S. Citizen ID Card (I-197)",
  "Identification Card for Use of Resident Citizen in the United States (Form I-179)": "Resident Citizen ID (I-179)",
  "Employment authorization document issued by the Department of Homeland Security": "DHS Employment Auth. Doc.",
  "Form I-94/I-94A": "Form I-94",
};

export type Attachment = { label: string; mime: string; bytes: Uint8Array };

/** Removes the widgets of a field that sit on a given page (used for fields shared with Supplement B). */
function detachWidgetsOnPage(doc: PDFDocument, fieldName: string, pageIndex: number) {
  const field = doc.getForm().getField(fieldName);
  const page = doc.getPage(pageIndex);
  const kids = field.acroField.dict.lookup(PDFName.of("Kids"));
  if (!(kids instanceof PDFArray)) return;
  for (let i = kids.size() - 1; i >= 0; i--) {
    const ref = kids.get(i);
    const widget = doc.context.lookup(ref);
    const p = widget && "get" in widget ? (widget as { get(n: PDFName): unknown }).get(PDFName.of("P")) : null;
    if (p instanceof PDFRef && p === page.ref) {
      kids.remove(i);
      const annots = page.node.Annots();
      if (annots) {
        const idx = annots.indexOf(ref as PDFRef);
        if (idx !== undefined && idx >= 0) annots.remove(idx);
      }
    }
  }
}

export async function buildI9Pdf(s1: Section1, s2: Section2 | null, extra: { everifyCase?: string | null; attachments?: Attachment[] }) {
  const blank = await readFile(path.join(process.cwd(), "lib/i9/assets/i-9.pdf"));
  const doc = await PDFDocument.load(blank);
  const form = doc.getForm();
  detachWidgetsOnPage(doc, "Document Title 1", 3);

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const set = (name: string, value: string | undefined | null) => {
    if (!value) return;
    try {
      const field = form.getTextField(name);
      const width = field.acroField.getWidgets()[0]?.getRectangle().width ?? 200;
      // Shrink long text (e.g. document titles) so it fits the box.
      const size = Math.max(5.5, Math.min(10, (width - 6) / Math.max(1, helv.widthOfTextAtSize(value, 1))));
      if (field.getMaxLength() === undefined) field.setFontSize(Math.floor(size * 2) / 2);
      field.setText(value);
    } catch (e) {
      console.warn(`I-9 PDF: couldn't fill "${name}":`, e);
    }
  };
  const check = (name: string) => {
    try {
      form.getCheckBox(name).check();
    } catch (e) {
      console.warn(`I-9 PDF: couldn't check "${name}":`, e);
    }
  };

  // ----- Section 1 -----
  set("Last Name (Family Name)", s1.lastName);
  set("First Name Given Name", s1.firstName);
  set("Employee Middle Initial (if any)", s1.middleInitial);
  set("Employee Other Last Names Used (if any)", s1.otherLastNames || "N/A");
  set("Address Street Number and Name", s1.address);
  set("Apt Number (if any)", s1.apt);
  set("City or Town", s1.city);
  try { form.getDropdown("State").select(s1.state); } catch { /* unknown code */ }
  set("ZIP Code", s1.zip);
  set("Date of Birth mmddyyyy", mdY(s1.dob));
  set("US Social Security Number", s1.ssn);
  set("Employees E-mail Address", s1.email);
  set("Telephone Number", s1.phone);
  check({ citizen: "CB_1", noncitizen_national: "CB_2", lpr: "CB_3", authorized_alien: "CB_4" }[s1.status]);
  if (s1.status === "lpr") set("3 A lawful permanent resident Enter USCIS or ANumber", s1.lprNumber);
  if (s1.status === "authorized_alien") {
    set("Exp Date mmddyyyy", mdY(s1.workAuthExpires));
    if (s1.alienIdType === "uscis") set("USCIS ANumber", s1.alienUscisNumber);
    if (s1.alienIdType === "i94") set("Form I94 Admission Number", s1.i94Number);
    if (s1.alienIdType === "passport") set("Foreign Passport Number and Country of IssuanceRow1", `${s1.foreignPassportNumber}, ${s1.passportCountry}`);
  }
  set("Signature of Employee", `${s1.signature} (e-signed)`);
  set("Today's Date mmddyyy", mdY(s1.signedAt));

  // ----- Section 2 -----
  if (s2) {
    const a = s2.documents.listA;
    const fillDoc = (d: DocEntry | undefined, f: [string, string, string, string]) => {
      if (!d) return;
      set(f[0], SHORT[d.title] ?? d.title);
      set(f[1], d.issuingAuthority);
      set(f[2], d.number);
      set(f[3], mdY(d.expires));
    };
    fillDoc(a[0], ["Document Title 1", "Issuing Authority 1", "Document Number 0 (if any)", "Expiration Date if any"]);
    fillDoc(a[1], ["Document Title 2 If any", "Issuing Authority_2", "Document Number If any_2", "List A.  Document 2. Expiration Date (if any)"]);
    fillDoc(a[2], ["List A.   Document Title 3.  If any", "List A. Document 3.  Enter Issuing Authority", "List A.  Document 3 Number.  If any", "Document Number if any_3"]);
    fillDoc(s2.documents.listB ?? undefined, ["List B Document 1 Title", "List B Issuing Authority 1", "List B Document Number 1", "List B Expiration Date 1"]);
    fillDoc(s2.documents.listC ?? undefined, ["List C Document Title 1", "List C Issuing Authority 1", "List C Document Number 1", "List C Expiration Date 1"]);
    const info = [s2.additionalInfo, extra.everifyCase ? `E-Verify case ${extra.everifyCase}` : ""].filter(Boolean).join(" · ");
    set("Additional Information", info);
    if (s2.altProcedure) check("CB_Alt");
    set("FirstDayEmployed mmddyyyy", mdY(s2.firstDay));
    set("Last Name First Name and Title of Employer or Authorized Representative", `${s2.repLastName}, ${s2.repFirstName}, ${s2.repTitle}`);
    set("Signature of Employer or AR", `${s2.signature} (e-signed)`);
    set("S2 Todays Date mmddyyyy", mdY(s2.signedAt));
    set("Employers Business or Org Name", s2.businessName);
    set("Employers Business or Org Address", s2.businessAddress);
  }
  form.updateFieldAppearances(helv);
  for (const f of form.getFields()) f.enableReadOnly(); // the generated record can't be edited

  // ----- Document copies -----
  if (extra.attachments?.length) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const att of extra.attachments) {
      try {
        if (att.mime === "application/pdf") {
          const src = await PDFDocument.load(att.bytes, { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          pages.forEach((p) => doc.addPage(p));
          continue;
        }
        const img = att.mime === "image/png" ? await doc.embedPng(att.bytes) : att.mime === "image/jpeg" ? await doc.embedJpg(att.bytes) : null;
        const page = doc.addPage([612, 792]);
        page.drawText(`Document copy: ${att.label}`, { x: 40, y: 750, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
        if (!img) {
          page.drawText("This file type can't be embedded. Open the original in the HR portal.", { x: 40, y: 720, size: 11, font });
          continue;
        }
        const scale = Math.min(532 / img.width, 680 / img.height, 1);
        page.drawImage(img, { x: 40, y: 730 - img.height * scale, width: img.width * scale, height: img.height * scale });
      } catch (e) {
        console.warn("I-9 PDF: couldn't attach", att.label, e);
      }
    }
  }
  return doc.save();
}
