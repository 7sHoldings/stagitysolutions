"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit, db, requireHr, siteOrigin } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { OB_BUCKET, checkComplete, requestSignatures, sendOnboardingInvite } from "@/lib/onboarding/server";
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
