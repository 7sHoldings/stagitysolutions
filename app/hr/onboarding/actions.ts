"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit, db, requireHr, siteOrigin } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { OB_BUCKET, checkComplete, requestSignatures, sendNewHireEmail, sendOnboardingInvite } from "@/lib/onboarding/server";
import { DEFAULT_OFFER_TEMPLATE, buildOfferPdf, companySignatureImage, companySigner, fillTemplate, offerTemplate, type Offer } from "@/lib/onboarding/offer";
import { stampSignedPdf } from "@/lib/onboarding/pdf";
import { issueTempPassword } from "@/lib/portal/accounts";
import { syncAllToDrive, syncFileToDrive } from "@/lib/onboarding/sync";
import { clearOAuthConn, driveConfigured } from "@/lib/gdrive";
import { startFor } from "@/lib/onboarding/start";
import { addDays, todayCT } from "@/lib/portal/dates";
import type { ActionState } from "../actions";

const clip = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function refresh(personId?: string) {
  revalidatePath("/hr/onboarding");
  if (personId) revalidatePath(`/hr/onboarding/${personId}`);
}

/** Starts onboarding for one or more people: picks the documents to sign and emails each person. */
export async function startOnboarding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const ids = formData.getAll("personId").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const templateIds = formData.getAll("templateId").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const due = clip(formData.get("due"), 10) || addDays(todayCT(), 7);
  const notify = formData.get("notify") === "on";
  if (!ids.length) return { error: "Choose at least one person." };
  if (!isDate(due)) return { error: "Enter a valid due date." };
  const r = await startFor(ids, templateIds, due, notify, hr);
  refresh();
  return r.failed.length ? { error: `Started for ${r.started.length}. Email failed for: ${r.failed.join(", ")}.` } : { ok: true, message: `Onboarding started for ${r.started.join(", ")}${notify ? " and they were emailed" : ""}.` };
}

// ---------- Company documents (templates to sign) ----------

export async function getTemplateUploadUrl(name: string) {
  await requireHr();
  if (!name.toLowerCase().endsWith(".pdf")) return { error: "Please upload a PDF." };
  const path = `templates/${randomUUID()}.pdf`;
  const { data, error } = await db().storage.from(OB_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Upload isn't available right now." };
  return { url: data.signedUrl, path };
}

export async function saveTemplate(path: string, title: string, description: string, defaultForNew: boolean) {
  const hr = await requireHr();
  if (!path.startsWith("templates/") || path.includes("..")) return { error: "Invalid upload." };
  if (!title.trim()) return { error: "Enter a title." };
  const { error } = await db().from("stagity_doc_templates").insert({ created_by: hr, title: title.trim().slice(0, 120), description: description.trim().slice(0, 300) || null, storage_path: path, default_for_new: defaultForNew });
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, "doc_template_added", { title });
  refresh();
  return { ok: true };
}

export async function setTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const field = clip(formData.get("field"), 20);
  const value = formData.get("value") === "true";
  if (!["active", "default_for_new"].includes(field)) return { error: "Invalid." };
  await db().from("stagity_doc_templates").update({ [field]: value }).eq("id", id);
  await audit(null, `hr:${hr}`, "doc_template_updated", { id, field, value });
  refresh();
  return { ok: true, message: "Saved." };
}

/** A one-off document for one person (e.g. their offer letter). */
export async function getPersonDocUploadUrl(personId: string, name: string) {
  await requireHr();
  if (!/^[0-9a-f-]{36}$/.test(personId)) return { error: "Invalid person." };
  if (!name.toLowerCase().endsWith(".pdf")) return { error: "Please upload a PDF." };
  const path = `people/${personId}/to-sign/${randomUUID()}.pdf`;
  const { data, error } = await db().storage.from(OB_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Upload isn't available right now." };
  return { url: data.signedUrl, path };
}

export async function addPersonDoc(personId: string, path: string, title: string, notify: boolean) {
  const hr = await requireHr();
  if (!path.startsWith(`people/${personId}/to-sign/`) || path.includes("..")) return { error: "Invalid upload." };
  if (!title.trim()) return { error: "Enter a title, e.g. Offer letter." };
  await db().from("stagity_signatures").insert({ person_id: personId, title: title.trim().slice(0, 120), source_path: path, requested_by: hr });
  await db().from("stagity_onboarding").update({ completed_at: null }).eq("person_id", personId);
  await audit(null, `hr:${hr}`, "signature_requested", { personId, title });
  if (notify) {
    const { data: p } = await db().from("stagity_people").select("first_name, email").eq("id", personId).single();
    if (p?.email) await send(p.email, `Please sign: ${title.trim()}`, [`Hi ${p.first_name},`, `Stagity Solutions HR has added "${title.trim()}" for you to review and sign in the employee portal.`], { label: "Review and sign", href: `${siteOrigin()}/portal/onboarding` });
  }
  refresh(personId);
  return { ok: true };
}

export async function requestTemplateFor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  const templateId = clip(formData.get("templateId"), 60);
  if (!templateId) return { error: "Choose a document." };
  await requestSignatures(personId, [templateId], hr);
  await db().from("stagity_onboarding").update({ completed_at: null }).eq("person_id", personId);
  refresh(personId);
  return { ok: true, message: "Added." };
}

export async function cancelSignature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { data: s } = await db().from("stagity_signatures").select("person_id, status, title").eq("id", id).single();
  if (!s || s.status !== "pending") return { error: "Only unsigned documents can be removed." };
  await db().from("stagity_signatures").update({ status: "cancelled" }).eq("id", id);
  await audit(null, `hr:${hr}`, "signature_cancelled", { id, title: s.title });
  await checkComplete(s.person_id);
  refresh(s.person_id);
  return { ok: true, message: "Removed." };
}

/** Sends items back to the employee with a note (e.g. a blurry ID photo). */
export async function returnItems(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  const items = formData.getAll("item").map(String).filter((x) => ["personal", "w4", "deposit", "documents"].includes(x));
  const note = clip(formData.get("note"), 500);
  if (!items.length) return { error: "Choose what needs fixing." };
  if (!note) return { error: "Tell them what to fix." };
  const reset: Record<string, null> = { completed_at: null };
  if (items.includes("personal")) reset.personal_submitted_at = null;
  if (items.includes("w4")) reset.w4_submitted_at = null;
  if (items.includes("deposit")) reset.deposit_submitted_at = null;
  if (items.includes("documents")) reset.docs_submitted_at = null;
  await db().from("stagity_onboarding").update({ ...reset, returned_note: note, returned_items: items }).eq("person_id", personId);
  const { data: p } = await db().from("stagity_people").select("first_name, email").eq("id", personId).single();
  if (p?.email) {
    await send(p.email, "Please update your onboarding", [`Hi ${p.first_name},`, "HR reviewed your onboarding and needs you to update something:", note], { label: "Open onboarding", href: `${siteOrigin()}/portal/onboarding` });
  }
  await audit(null, `hr:${hr}`, "onboarding_returned", { personId, items, note });
  refresh(personId);
  return { ok: true, message: "Sent back. They were emailed." };
}

export async function setDue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  const due = clip(formData.get("due"), 10);
  if (due && !isDate(due)) return { error: "Enter a valid date." };
  await db().from("stagity_onboarding").update({ due_date: due || null }).eq("person_id", personId);
  await audit(null, `hr:${hr}`, "onboarding_due_set", { personId, due });
  refresh(personId);
  return { ok: true, message: "Saved." };
}

export async function resendInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  const { data: p } = await db().from("stagity_people").select("first_name, email, stagity_onboarding(due_date)").eq("id", personId).single();
  if (!p?.email) return { error: "No email on file." };
  const due = (p.stagity_onboarding as unknown as { due_date: string | null } | null)?.due_date ?? null;
  const ok = await sendOnboardingInvite(p.email, p.first_name, due);
  await audit(null, `hr:${hr}`, "onboarding_invite_resent", { personId, ok });
  return ok ? { ok: true, message: `Emailed ${p.email}.` } : { error: "Email failed." };
}

// ---------- New hire: one form, one email ----------

export async function newHire(_prev: ActionState, formData: FormData): Promise<ActionState & { personId?: string }> {
  const hr = await requireHr();
  const first = clip(formData.get("first"), 80);
  const last = clip(formData.get("last"), 80);
  const email = clip(formData.get("email"), 200).toLowerCase();
  const phone = clip(formData.get("phone"), 30) || null;
  const startDate = clip(formData.get("startDate"), 10) || null;
  const due = clip(formData.get("due"), 10) || addDays(todayCT(), 7);
  if (!first || !last) return { error: "Enter their first and last name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  if ((startDate && !isDate(startDate)) || !isDate(due)) return { error: "Check the dates." };
  const { data: dup } = await db().from("stagity_people").select("id").eq("email", email).maybeSingle();
  if (dup) return { error: "Someone with that email is already registered. Start onboarding for them from the list instead." };
  const offer = offerFields(formData);
  if (offer.error) return { error: offer.error };

  const { data: p, error } = await db()
    .from("stagity_people")
    .insert({ first_name: first, last_name: last, email, phone, kind: "consultant", start_date: startDate, signup_due: due, created_by: hr })
    .select("id")
    .single();
  if (error || !p) return { error: "Couldn't create the person. " + (error?.message ?? "") };
  await audit(null, `hr:${hr}`, "person_registered", { personId: p.id, email, via: "new_hire" });
  const templateIds = formData.getAll("templateId").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  await startFor([p.id], templateIds, due, false, hr);
  let hasOffer = false;
  if (offer.values) {
    const r = await createOffer(p.id, offer.values, hr, true);
    if (r.error) return { error: `${first} was added, but the offer letter wasn't: ${r.error}` };
    hasOffer = true;
  }
  const pw = await issueTempPassword(p.id);
  const sent = await sendNewHireEmail(email, first, pw, due, hasOffer);
  refresh();
  revalidatePath("/hr/people");
  return sent
    ? { ok: true, personId: p.id, message: `${first} is set up. We emailed the welcome, instructions and their login.` }
    : { error: `${first} is set up, but the email failed. Give them this temporary password: ${pw}`, personId: p.id };
}

// ---------- Offer letters ----------

type OfferValues = {
  offer_date: string; job_title: string; start_date: string | null; employment_type: string; pay_type: "hourly" | "salary" | "monthly"; pay_amount: number;
  pay_schedule: string; work_location: string | null; client_name: string | null; job_description: string | null; job_duties: string | null; extra_terms: string | null;
};

function offerFields(f: FormData): { values?: OfferValues; error?: string } {
  const title = clip(f.get("jobTitle"), 120);
  if (!title) return {}; // no offer letter requested
  const amount = Number(clip(f.get("payAmount"), 14).replace(/[$,]/g, ""));
  const payType = clip(f.get("payType"), 10);
  const start = clip(f.get("startDate"), 10);
  const offerDate = clip(f.get("offerDate"), 10) || todayCT();
  if (!["hourly", "salary", "monthly"].includes(payType)) return { error: "Choose how they're paid (hourly, monthly or yearly salary)." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter their pay amount for the offer letter." };
  if ((start && !isDate(start)) || !isDate(offerDate)) return { error: "Check the offer and start dates." };
  return {
    values: {
      offer_date: offerDate, job_title: title, start_date: start || null, employment_type: clip(f.get("employmentType"), 60) || "Full-time W-2",
      pay_type: payType as OfferValues["pay_type"], pay_amount: Math.round(amount * 100) / 100,
      pay_schedule: clip(f.get("paySchedule"), 160) || "Monthly, on the 20th of each month for the previous month",
      work_location: clip(f.get("workLocation"), 200) || null, client_name: clip(f.get("clientName"), 120) || null,
      job_description: clip(f.get("jobDescription"), 4000) || null, job_duties: clip(f.get("jobDuties"), 4000) || null, extra_terms: clip(f.get("extraTerms"), 2000) || null,
    },
  };
}

async function createOffer(personId: string, v: OfferValues, hr: string, send: boolean) {
  const [{ data: p }, tpl] = await Promise.all([
    db().from("stagity_people").select("first_name, last_name, address_line1, address_line2, city, state, zip").eq("id", personId).single(),
    offerTemplate(),
  ]);
  if (!p) return { error: "Person not found." };
  // Cancel an earlier offer that hasn't been signed yet.
  const { data: old } = await db().from("stagity_offers").select("id, signature_id, status").eq("person_id", personId).in("status", ["draft", "sent"]);
  for (const o of old ?? []) {
    await db().from("stagity_offers").update({ status: "cancelled" }).eq("id", o.id);
    if (o.signature_id) await db().from("stagity_signatures").update({ status: "cancelled" }).eq("id", o.signature_id).eq("status", "pending");
  }
  const address = [p.address_line1, p.address_line2, p.city && `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(", ");
  const { data: offer, error } = await db().from("stagity_offers").insert({ ...v, person_id: personId, created_by: hr }).select("*").single();
  if (error || !offer) return { error: error?.message ?? "Couldn't save the offer." };
  const body = fillTemplate(tpl, offer as Offer, { first_name: p.first_name, last_name: p.last_name, address });
  await db().from("stagity_offers").update({ body_snapshot: body }).eq("id", offer.id);
  if (send) {
    const signer = await companySigner();
    const pdf = await buildOfferPdf(body, { name: `${p.first_name} ${p.last_name}` }, { name: signer.name, title: signer.title });
    const path = `people/${personId}/offer/${offer.id}.pdf`;
    const up = await db().storage.from(OB_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (up.error) return { error: "Couldn't save the offer letter PDF." };
    const { data: sig } = await db()
      .from("stagity_signatures")
      .insert({ person_id: personId, title: "Employment Offer Letter", source_path: path, requested_by: hr, offer_id: offer.id })
      .select("id")
      .single();
    await db().from("stagity_offers").update({ status: "sent", signature_id: sig?.id ?? null }).eq("id", offer.id);
    await db().from("stagity_onboarding").update({ completed_at: null }).eq("person_id", personId);
  }
  await audit(null, `hr:${hr}`, "offer_created", { personId, offerId: offer.id, send });
  return { ok: true, offerId: offer.id as string };
}

export async function saveOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  const v = offerFields(formData);
  if (v.error) return { error: v.error };
  if (!v.values) return { error: "Enter the job title." };
  const { data: ob } = await db().from("stagity_onboarding").select("person_id").eq("person_id", personId).maybeSingle();
  if (!ob) await startFor([personId], [], addDays(todayCT(), 7), false, hr);
  const r = await createOffer(personId, v.values, hr, true);
  if (r.error) return { error: r.error };
  if (formData.get("notify") === "on") {
    const { data: p } = await db().from("stagity_people").select("first_name, email").eq("id", personId).single();
    if (p?.email) await send(p.email, "Your offer letter from Stagity Solutions LLC", [`Hi ${p.first_name},`, "Your Employment Offer Letter is ready. Please review and sign it in the employee portal."], { label: "Review and sign", href: `${siteOrigin()}/portal/onboarding` });
  }
  refresh(personId);
  return { ok: true, message: "Offer letter created and added to their documents to sign." };
}

/** HR signs after the employee: re-renders the letter with both signatures and emails the final copy. */
export async function countersignOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const offerId = clip(formData.get("offerId"), 60);
  const { data: o } = await db().from("stagity_offers").select("*").eq("id", offerId).single();
  if (!o || o.status !== "employee_signed" || !o.signature_id) return { error: "The employee hasn't signed this offer yet." };
  const signer = await companySigner();
  if (!signer.name) return { error: "Add the company signer's name (and signature image) under Onboarding → Offer letter settings first." };
  const { data: sig } = await db().from("stagity_signatures").select("*").eq("id", o.signature_id).single();
  const { data: p } = await db().from("stagity_people").select("first_name, last_name, email").eq("id", o.person_id).single();
  if (!sig || !p) return { error: "Missing signature record." };
  const now = new Date().toISOString();
  const image = await companySignatureImage(signer.imagePath);
  let pdf = await buildOfferPdf(o.body_snapshot ?? "", { name: sig.signed_name, signedAt: sig.signed_at }, { name: signer.name, title: signer.title, signedAt: now, image });
  pdf = await stampSignedPdf(pdf, { title: sig.title, name: sig.signed_name, email: p.email ?? "", signedAt: sig.signed_at, ip: sig.signed_ip ?? "", sha256: sig.doc_sha256 ?? "" });
  pdf = await stampSignedPdf(pdf, { title: `${sig.title} (countersigned)`, name: `${signer.name}${signer.title ? `, ${signer.title}` : ""}`, email: hr, signedAt: now, ip: "", sha256: createHash("sha256").update(pdf).digest("hex") });
  const finalPath = `people/${o.person_id}/signed/${sig.id}-final.pdf`;
  const up = await db().storage.from(OB_BUCKET).upload(finalPath, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return { error: "Couldn't save the final PDF." };
  await db().from("stagity_signatures").update({ signed_path: finalPath, countersigned_at: now, countersigned_by: hr }).eq("id", sig.id);
  await db().from("stagity_offers").update({ status: "completed", countersigned_at: now, countersigned_by: hr }).eq("id", offerId);
  if (p.email) {
    await send(p.email, "Your signed offer letter from Stagity Solutions LLC", [`Hi ${p.first_name},`, "Attached is your fully signed Employment Offer Letter for your records. Welcome aboard!"], undefined, {
      attachments: [{ filename: "Offer Letter - Stagity Solutions.pdf", content: pdf, contentType: "application/pdf" }],
    });
  }
  await audit(null, `hr:${hr}`, "offer_countersigned", { offerId });
  await syncFileToDrive(o.person_id, finalPath, "Offer Letter (fully signed).pdf", "Signed");
  refresh(o.person_id);
  return { ok: true, message: "Countersigned. They were emailed the final copy." };
}

export async function saveOfferSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const tpl = String(formData.get("template") ?? "").slice(0, 20000);
  const name = clip(formData.get("signerName"), 120);
  const title = clip(formData.get("signerTitle"), 120);
  const now = new Date().toISOString();
  const rows = [
    { key: "offer_letter_template", value: tpl.trim() || DEFAULT_OFFER_TEMPLATE, updated_at: now, updated_by: hr },
    { key: "offer_signer_name", value: name, updated_at: now, updated_by: hr },
    { key: "offer_signer_title", value: title, updated_at: now, updated_by: hr },
  ];
  const { error } = await db().from("stagity_settings").upsert(rows);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, "offer_settings_saved");
  refresh();
  return { ok: true, message: "Saved. New offer letters use this template." };
}

export async function getSignatureUploadUrl(mime: string) {
  await requireHr();
  if (!["image/png", "image/jpeg"].includes(mime)) return { error: "Please upload a PNG or JPG of your signature." };
  const path = `company/signature-${randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`;
  const { data, error } = await db().storage.from(OB_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Upload isn't available right now." };
  return { url: data.signedUrl, path };
}

export async function saveSignatureImage(path: string) {
  const hr = await requireHr();
  if (!path.startsWith("company/signature-") || path.includes("..")) return { error: "Invalid upload." };
  await db().from("stagity_settings").upsert({ key: "offer_signature_path", value: path, updated_at: new Date().toISOString(), updated_by: hr });
  await audit(null, `hr:${hr}`, "company_signature_uploaded");
  refresh();
  return { ok: true };
}

export async function copyToDrive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  if (!(await driveConfigured())) return { error: "Google Drive isn't connected yet (see the setup steps on the Onboarding page)." };
  const r = await syncAllToDrive(personId);
  await audit(null, `hr:${hr}`, "onboarding_copied_to_drive", { personId });
  return r.ok ? { ok: true, message: "Copied to Google Drive." } : { error: "Couldn't copy to Google Drive." };
}

export async function disconnectDrive(_prev: ActionState): Promise<ActionState> {
  const hr = await requireHr();
  await clearOAuthConn();
  await audit(null, `hr:${hr}`, "google_drive_disconnected");
  refresh();
  return { ok: true, message: "Disconnected." };
}
