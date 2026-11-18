"use server";

import { randomUUID } from "node:crypto";
import { audit, db, encryptJson, hrEmails, I9_BUCKET, siteOrigin } from "@/lib/i9/server";
import { portalPerson } from "@/lib/portal/server";
import { sendHrSection1Done } from "@/lib/i9/mail";
import { listADocs, listBDocs, listCDocs, usStates, type CitizenshipStatus, type Section1 } from "@/lib/i9/forms";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/** The signed-in person's open I-9 case (Section 1 not yet signed). */
async function openCase() {
  const p = await portalPerson();
  if (!p || p.must_change_password) return null;
  const { data } = await db()
    .from("stagity_i9_cases")
    .select("*")
    .eq("person_id", p.id)
    .eq("status", "invited")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getUploadUrl(list: string, side: string, mime: string) {
  const c = await openCase();
  if (!c) return { error: "Please sign in again." };
  if (!["A", "B", "C"].includes(list) || !["front", "back"].includes(side)) return { error: "Invalid upload." };
  const ext = MIME_EXT[mime];
  if (!ext) return { error: "Please upload a photo (JPG, PNG, HEIC) or a PDF." };
  const path = `${c.id}/${randomUUID()}-${list}-${side}.${ext}`;
  const { data, error } = await db().storage.from(I9_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Upload isn't available right now. Please try again." };
  return { url: data.signedUrl, path };
}

export async function recordUpload(path: string, list: string, side: string, mime: string, name: string) {
  const c = await openCase();
  if (!c) return { error: "Please sign in again." };
  if (!path.startsWith(`${c.id}/`) || path.includes("..")) return { error: "Invalid upload." };
  const folder = path.split("/")[0];
  const file = path.slice(folder.length + 1);
  const { data: found } = await db().storage.from(I9_BUCKET).list(folder, { search: file });
  if (!found?.some((f) => f.name === file)) return { error: "The upload didn't finish. Please try again." };

  // Replace any earlier upload for the same document side.
  const { data: old } = await db().from("stagity_i9_documents").select("id, storage_path").eq("case_id", c.id).eq("list", list).eq("side", side);
  if (old?.length) {
    await db().storage.from(I9_BUCKET).remove(old.map((o) => o.storage_path));
    await db().from("stagity_i9_documents").delete().in("id", old.map((o) => o.id));
  }
  const { error } = await db()
    .from("stagity_i9_documents")
    .insert({ case_id: c.id, list, side, storage_path: path, mime_type: mime, original_name: name.slice(0, 200) });
  if (error) return { error: "Couldn't save the upload. Please try again." };
  await audit(c.id, "employee", "document_uploaded", { list, side });
  return { ok: true };
}

const s = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export async function submitSection1(input: Record<string, unknown>) {
  const c = await openCase();
  if (!c) return { error: "Your Form I-9 isn't open for changes. Please contact HR." };

  const status = s(input.status, 30) as CitizenshipStatus;
  const choice = (input.docChoice ?? {}) as Record<string, unknown>;
  const data: Section1 = {
    lastName: s(input.lastName, 80),
    firstName: s(input.firstName, 80),
    middleInitial: s(input.middleInitial, 1).toUpperCase(),
    otherLastNames: s(input.otherLastNames, 120),
    address: s(input.address, 160),
    apt: s(input.apt, 20),
    city: s(input.city, 80),
    state: s(input.state, 2).toUpperCase(),
    zip: s(input.zip, 10),
    dob: s(input.dob, 10),
    ssn: s(input.ssn, 20).replace(/\D/g, ""),
    email: s(input.email, 200),
    phone: s(input.phone, 30),
    status,
    lprNumber: status === "lpr" ? s(input.lprNumber, 20) : "",
    workAuthExpires: status === "authorized_alien" ? (input.workAuthNA ? "N/A" : s(input.workAuthExpires, 10)) : "",
    alienIdType: status === "authorized_alien" ? (s(input.alienIdType, 10) as Section1["alienIdType"]) : "",
    alienUscisNumber: status === "authorized_alien" && input.alienIdType === "uscis" ? s(input.alienUscisNumber, 20) : "",
    i94Number: status === "authorized_alien" && input.alienIdType === "i94" ? s(input.i94Number, 20) : "",
    foreignPassportNumber: status === "authorized_alien" && input.alienIdType === "passport" ? s(input.foreignPassportNumber, 30) : "",
    passportCountry: status === "authorized_alien" && input.alienIdType === "passport" ? s(input.passportCountry, 60) : "",
    signature: s(input.signature, 160),
    signedAt: new Date().toISOString(),
    noPreparer: input.noPreparer === true,
    docChoice: {
      mode: choice.mode === "BC" ? "BC" : "A",
      a: s(choice.a, 200),
      b: s(choice.b, 200),
      c: s(choice.c, 200),
    },
  };

  const err = (m: string) => ({ error: m });
  if (!data.lastName || !data.firstName) return err("Enter your legal first and last name.");
  if (!data.address || !data.city || !usStates.includes(data.state) || !/^\d{5}(-\d{4})?$/.test(data.zip)) {
    return err("Enter your full U.S. address, including a valid state and ZIP code.");
  }
  if (!isDate(data.dob)) return err("Enter your date of birth.");
  if (data.ssn.length !== 9) return err("Enter your 9-digit Social Security number (required because Stagity uses E-Verify).");
  if (!["citizen", "noncitizen_national", "lpr", "authorized_alien"].includes(status)) return err("Choose your citizenship or immigration status.");
  if (status === "lpr" && !data.lprNumber) return err("Enter your USCIS number or A-Number.");
  if (status === "authorized_alien") {
    if (data.workAuthExpires !== "N/A" && !isDate(data.workAuthExpires)) return err("Enter when your work authorization expires, or choose N/A.");
    if (data.alienIdType === "uscis" && !data.alienUscisNumber) return err("Enter your USCIS number or A-Number.");
    if (data.alienIdType === "i94" && !data.i94Number) return err("Enter your Form I-94 admission number.");
    if (data.alienIdType === "passport" && (!data.foreignPassportNumber || !data.passportCountry)) return err("Enter your foreign passport number and country of issuance.");
    if (!data.alienIdType) return err("Choose which number you'll provide (USCIS/A-Number, I-94 or foreign passport).");
  }
  if (data.docChoice.mode === "A" ? !listADocs.includes(data.docChoice.a) : !listBDocs.includes(data.docChoice.b) || !listCDocs.includes(data.docChoice.c)) {
    return err("Choose the documents you're providing.");
  }
  if (!data.noPreparer) return err("Confirm that you completed Section 1 yourself.");
  if (input.attest !== true) return err("Tick the attestation to sign.");
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(data.signature) !== norm(`${data.firstName} ${data.lastName}`)) {
    return err(`To sign, type your name exactly as "${data.firstName} ${data.lastName}".`);
  }

  const { data: docs } = await db().from("stagity_i9_documents").select("list, side").eq("case_id", c.id);
  const has = (list: string) => docs?.some((d) => d.list === list && d.side === "front");
  if (data.docChoice.mode === "A" ? !has("A") : !has("B") || !has("C")) {
    return err("Upload a photo of the front of each document before signing.");
  }

  const { error } = await db()
    .from("stagity_i9_cases")
    .update({
      section1_enc: encryptJson(data),
      section1_signed_at: data.signedAt,
      status: "section1_complete",
    })
    .eq("id", c.id)
    .eq("status", "invited");
  if (error) return err("Something went wrong saving your form. Please try again.");
  await audit(c.id, "employee", "section1_signed", { status, docMode: data.docChoice.mode });

  const name = `${data.firstName} ${data.lastName}`;
  await Promise.all(hrEmails().map((to) => sendHrSection1Done(to, name, `${siteOrigin()}/hr/cases/${c.id}`)));
  return { ok: true };
}
