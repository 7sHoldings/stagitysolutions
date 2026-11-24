"use server";

import { randomUUID, createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, db } from "@/lib/i9/server";
import { portalPerson } from "@/lib/portal/server";
import {
  OB_BUCKET, FILE_KINDS, checkComplete, decryptPersonal, encryptDeposit, encryptPersonal, encryptW4, requiredDocs, validRouting,
  WORK_STATUSES, type Deposit, type Personal, type W4,
} from "@/lib/onboarding/server";
import { stampSignedPdf } from "@/lib/onboarding/pdf";

export type ObState = { error?: string; message?: string; ok?: boolean };

const get = (f: FormData, k: string, max = 160) => String(f.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const digits = (v: string) => v.replace(/\D/g, "");
const money = (f: FormData, k: string) => {
  const n = Number(get(f, k, 14).replace(/[$,]/g, "") || 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

/** Signed-in person with onboarding started (or null). */
async function me() {
  const p = await portalPerson();
  if (!p || p.must_change_password) return null;
  const { data: ob } = await db().from("stagity_onboarding").select("*").eq("person_id", p.id).maybeSingle();
  return ob ? { p, ob } : null;
}

async function after(personId: string, action: string) {
  await audit(null, `person:${personId}`, action);
  await checkComplete(personId);
  revalidatePath("/portal/onboarding");
}

export async function savePersonal(_prev: ObState, f: FormData): Promise<ObState> {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  const v: Personal = {
    firstName: get(f, "firstName", 60), middleInitial: get(f, "middleInitial", 2).toUpperCase(), lastName: get(f, "lastName", 60),
    street: get(f, "street"), apt: get(f, "apt", 30), city: get(f, "city", 60), state: get(f, "state", 2).toUpperCase(), zip: get(f, "zip", 10),
    ssn: digits(get(f, "ssn", 15)), dob: get(f, "dob", 10),
    workStatus: get(f, "workStatus", 20), statusNumber: get(f, "statusNumber", 40), statusExpires: get(f, "statusExpires", 10),
    cellPhone: get(f, "cellPhone", 30), homePhone: get(f, "homePhone", 30), personalEmail: get(f, "personalEmail", 120).toLowerCase(),
    workAddress: get(f, "workAddress", 200), workPhone: get(f, "workPhone", 30), workEmail: get(f, "workEmail", 120).toLowerCase(),
  };
  if (!v.firstName || !v.lastName) return { error: "Enter your first and last name as on your Social Security card." };
  if (!v.street || !v.city || !/^[A-Z]{2}$/.test(v.state) || !/^\d{5}(-\d{4})?$/.test(v.zip)) return { error: "Enter your full home address (street, city, state and 5-digit ZIP)." };
  if (!/^\d{9}$/.test(v.ssn) || /^(000|666|9)/.test(v.ssn)) return { error: "Enter your 9-digit Social Security number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dob) || v.dob > "2010-01-01" || v.dob < "1920-01-01") return { error: "Enter your date of birth." };
  if (!WORK_STATUSES.some((w) => w.value === v.workStatus)) return { error: "Choose your working status." };
  if (v.workStatus !== "citizen" && (!v.statusNumber || !/^\d{4}-\d{2}-\d{2}$/.test(v.statusExpires)) && v.workStatus !== "green_card") {
    return { error: "Enter your OPT/EAD/visa number and the status expiry date." };
  }
  if (digits(v.cellPhone).length < 10) return { error: "Enter your cell phone with area code." };
  if (v.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.personalEmail)) return { error: "Check your personal email." };
  if (!v.workAddress) return { error: "Enter your work location (client office address, or 'Remote' with your city)." };
  await db().from("stagity_onboarding").update({ personal_enc: encryptPersonal(v), personal_submitted_at: new Date().toISOString(), work_status: v.workStatus }).eq("person_id", m.p.id);
  await after(m.p.id, "onboarding_personal_saved");
  redirect("/portal/onboarding?saved=personal");
}

export async function saveW4(_prev: ObState, f: FormData): Promise<ObState> {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  if (!m.ob.personal_submitted_at) return { error: "Please complete the Personal Information form first (your name, SSN and address go on the W-4)." };
  const fs = get(f, "filingStatus", 20) as W4["filingStatus"];
  const children = Math.round(Number(get(f, "children", 3) || 0));
  const others = Math.round(Number(get(f, "others", 3) || 0));
  const w: W4 = {
    filingStatus: fs, multipleJobs: f.get("multipleJobs") === "on",
    childrenAmount: children * 2000, otherDependentsAmount: others * 500,
    otherIncome: money(f, "otherIncome"), deductions: money(f, "deductions"), extraWithholding: money(f, "extraWithholding"),
    exempt: f.get("exempt") === "on", signedName: get(f, "signedName", 120), signedAt: new Date().toISOString(),
  };
  if (!["single", "married_joint", "head"].includes(fs)) return { error: "Choose your filing status (Step 1c)." };
  if (!Number.isInteger(children) || children < 0 || children > 20 || !Number.isInteger(others) || others < 0 || others > 20) return { error: "Enter the number of dependents (0 if none)." };
  if ([w.otherIncome, w.deductions, w.extraWithholding].some((n) => Number.isNaN(n))) return { error: "Amounts in Step 4 must be numbers (0 if none)." };
  const personal = decryptPersonal(m.ob.personal_enc);
  const expected = `${personal?.firstName ?? ""} ${personal?.lastName ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
  const typed = w.signedName.toLowerCase().replace(/\s+/g, " ").trim();
  if (!typed || f.get("agree") !== "on") return { error: "Type your full name and tick the box to sign." };
  if (personal && !(typed.includes(personal.firstName.toLowerCase()) && typed.includes(personal.lastName.toLowerCase()))) {
    return { error: `Please sign with your full legal name (${expected}).` };
  }
  await db().from("stagity_onboarding").update({ w4_enc: encryptW4(w), w4_submitted_at: w.signedAt }).eq("person_id", m.p.id);
  await after(m.p.id, "onboarding_w4_signed");
  redirect("/portal/onboarding?saved=w4");
}

export async function saveDeposit(_prev: ObState, f: FormData): Promise<ObState> {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  const d: Deposit = {
    bankName: get(f, "bankName", 80), bankState: get(f, "bankState", 40), accountType: get(f, "accountType", 10) === "savings" ? "savings" : "checking",
    routing: digits(get(f, "routing", 12)), account: digits(get(f, "account", 20)), signedName: get(f, "signedName", 120), signedAt: new Date().toISOString(),
  };
  const confirm = digits(get(f, "accountConfirm", 20));
  if (!d.bankName || !d.bankState) return { error: "Enter your bank's name and the state where you opened the account." };
  if (!validRouting(d.routing)) return { error: "That routing number isn't valid. It's the 9 digits at the bottom-left of a check." };
  if (d.account.length < 4 || d.account.length > 17) return { error: "Enter your account number (4–17 digits)." };
  if (d.account !== confirm) return { error: "The two account numbers don't match." };
  if (!d.signedName || f.get("agree") !== "on") return { error: "Type your full name and tick the box to sign the agreement." };
  await db().from("stagity_onboarding").update({ deposit_enc: encryptDeposit(d), deposit_last4: d.account.slice(-4), deposit_submitted_at: d.signedAt }).eq("person_id", m.p.id);
  await after(m.p.id, "onboarding_deposit_signed");
  redirect("/portal/onboarding?saved=deposit");
}

// ---------- Document uploads ----------

const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };

export async function getDocUploadUrl(kind: string, mime: string) {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  if (!FILE_KINDS[kind]) return { error: "Unknown document type." };
  const ext = MIME_EXT[mime];
  if (!ext) return { error: "Please upload a PDF or a photo (JPG, PNG)." };
  const path = `people/${m.p.id}/${kind}/${randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(OB_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Upload isn't available right now." };
  return { url: data.signedUrl, path };
}

export async function recordDoc(kind: string, path: string, mime: string, name: string, expires: string) {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  if (!FILE_KINDS[kind] || !path.startsWith(`people/${m.p.id}/${kind}/`) || path.includes("..")) return { error: "Invalid upload." };
  const folder = path.slice(0, path.lastIndexOf("/"));
  const file = path.slice(folder.length + 1);
  const { data: found } = await db().storage.from(OB_BUCKET).list(folder, { search: file });
  if (!found?.some((x) => x.name === file)) return { error: "The upload didn't finish. Please try again." };
  const { data, error } = await db()
    .from("stagity_onboarding_files")
    .insert({ person_id: m.p.id, kind, storage_path: path, mime_type: mime, original_name: name.slice(0, 200), expires_on: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the upload." };
  revalidatePath("/portal/onboarding/documents");
  return { ok: true, id: data.id as string };
}

export async function removeDoc(id: string) {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  const { data: f } = await db().from("stagity_onboarding_files").select("storage_path").eq("id", id).eq("person_id", m.p.id).maybeSingle();
  if (!f) return { error: "Not found." };
  await db().storage.from(OB_BUCKET).remove([f.storage_path]);
  await db().from("stagity_onboarding_files").delete().eq("id", id);
  await db().from("stagity_onboarding").update({ docs_submitted_at: null, completed_at: null }).eq("person_id", m.p.id);
  revalidatePath("/portal/onboarding/documents");
  return { ok: true };
}

export async function submitDocs(_prev: ObState): Promise<ObState> {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  const { data: files } = await db().from("stagity_onboarding_files").select("kind").eq("person_id", m.p.id);
  const have = new Set((files ?? []).map((x) => x.kind));
  const missing = requiredDocs(m.ob.work_status).filter((k) => !have.has(k));
  if (missing.length) return { error: `Still needed: ${missing.map((k) => FILE_KINDS[k]).join(", ")}.` };
  await db().from("stagity_onboarding").update({ docs_submitted_at: new Date().toISOString() }).eq("person_id", m.p.id);
  await after(m.p.id, "onboarding_docs_submitted");
  redirect("/portal/onboarding?saved=documents");
}

// ---------- E-signatures ----------

export async function signDocument(_prev: ObState, f: FormData): Promise<ObState> {
  const m = await me();
  if (!m) return { error: "Please sign in again." };
  const id = get(f, "id", 60);
  const name = get(f, "signedName", 120);
  if (!name || name.split(" ").length < 2) return { error: "Type your full name (first and last) to sign." };
  if (f.get("agree") !== "on") return { error: "Tick the box to agree to sign electronically." };
  const { data: s } = await db().from("stagity_signatures").select("*").eq("id", id).eq("person_id", m.p.id).maybeSingle();
  if (!s || s.status !== "pending") return { error: "This document isn't waiting for your signature." };
  const { data: blob } = await db().storage.from(OB_BUCKET).download(s.source_path);
  if (!blob) return { error: "Couldn't open the document. Please contact HR." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const signedAt = new Date().toISOString();
  let signed: Uint8Array;
  try {
    signed = await stampSignedPdf(bytes, { title: s.title, name, email: m.p.email, signedAt, ip, sha256: sha });
  } catch {
    return { error: "This document couldn't be signed (the PDF may be protected). Please contact HR." };
  }
  const signedPath = `people/${m.p.id}/signed/${id}.pdf`;
  const { error: upErr } = await db().storage.from(OB_BUCKET).upload(signedPath, signed, { contentType: "application/pdf", upsert: true });
  if (upErr) return { error: "Couldn't save the signed copy. Please try again." };
  await db()
    .from("stagity_signatures")
    .update({ status: "signed", signed_at: signedAt, signed_name: name, signed_ip: ip || null, signed_ua: h.get("user-agent")?.slice(0, 300) ?? null, doc_sha256: sha, signed_path: signedPath })
    .eq("id", id)
    .eq("status", "pending");
  await after(m.p.id, "onboarding_document_signed");
  redirect("/portal/onboarding?saved=signed");
}
