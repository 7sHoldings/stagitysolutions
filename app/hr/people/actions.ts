"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr, siteOrigin } from "@/lib/i9/server";
import { sendI9Task, sendWelcome } from "@/lib/i9/mail";
import { hashPassword, tempPassword } from "@/lib/portal/server";
import type { ActionState } from "../actions";
import { recomputeDraft, syncDraftInvoices } from "@/lib/invoices/server";

const clip = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const TEMP_DAYS = 7;

const num = (v: string) => (v ? Number(v) : null);

function details(formData: FormData) {
  const rate = clip(formData.get("payRate"), 12);
  const consultant = clip(formData.get("kind"), 20) !== "employee";
  return {
    first_name: clip(formData.get("first"), 80),
    last_name: clip(formData.get("last"), 80),
    phone: clip(formData.get("phone"), 30) || null,
    kind: clip(formData.get("kind"), 20) === "employee" ? "employee" : "consultant",
    client_name: clip(formData.get("clientName"), 120) || null,
    client_manager_name: clip(formData.get("managerName"), 120) || null,
    client_manager_email: clip(formData.get("managerEmail"), 200).toLowerCase() || null,
    pay_rate: rate ? Number(rate) : null,
    start_date: clip(formData.get("startDate"), 10) || null,
    end_date: clip(formData.get("endDate"), 10) || null,
    adp_employee_id: clip(formData.get("adpId"), 30) || null,
    vendor_id: consultant ? clip(formData.get("vendorId"), 60) || null : null,
    bill_rate: consultant ? num(clip(formData.get("billRate"), 12)) : null,
    po_number: consultant ? clip(formData.get("poNumber"), 80) || null : null,
  };
}

function problem(d: ReturnType<typeof details>): string | null {
  if (!d.first_name || !d.last_name) return "Enter first and last name.";
  if (d.pay_rate !== null && (!Number.isFinite(d.pay_rate) || d.pay_rate < 0 || d.pay_rate > 10000)) return "Enter a valid hourly rate.";
  if (d.kind === "consultant" && d.pay_rate === null) return "Enter the consultant's hourly pay rate.";
  for (const r of [d.bill_rate]) if (r !== null && (!Number.isFinite(r) || r < 0 || r > 10000)) return "Enter a valid bill rate.";
  if (d.client_manager_email && !emailOk(d.client_manager_email)) return "Enter a valid client manager email.";
  if ((d.start_date && !isDate(d.start_date)) || (d.end_date && !isDate(d.end_date))) return "Enter valid dates.";
  return null;
}

async function issueTempPassword(id: string) {
  const pw = tempPassword();
  const { data: p } = await db()
    .from("stagity_people")
    .select("session_version")
    .eq("id", id)
    .single();
  await db()
    .from("stagity_people")
    .update({
      password_hash: await hashPassword(pw),
      must_change_password: true,
      temp_password_expires_at: new Date(Date.now() + TEMP_DAYS * 86400_000).toISOString(),
      session_version: (p?.session_version ?? 1) + 1,
      failed_logins: 0,
      locked_until: null,
    })
    .eq("id", id);
  return pw;
}

async function openI9(personId: string, hr: string, p: { first_name: string; last_name: string; email: string; job?: string | null }, firstDay: string | null) {
  const { data: existing } = await db().from("stagity_i9_cases").select("id").eq("person_id", personId).neq("status", "cancelled").limit(1).maybeSingle();
  if (existing) return false;
  const { data } = await db()
    .from("stagity_i9_cases")
    .insert({ created_by: hr, person_id: personId, employee_first_name: p.first_name, employee_last_name: p.last_name, employee_email: p.email, first_day: firstDay })
    .select("id")
    .single();
  if (data) await audit(data.id, `hr:${hr}`, "case_created", { personId, firstDay });
  return true;
}

export async function registerPerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const d = details(formData);
  const email = clip(formData.get("email"), 200).toLowerCase();
  const err = problem(d) ?? (emailOk(email) ? null : "Enter a valid email.");
  if (err) return { error: err };
  const { data: dup } = await db().from("stagity_people").select("id").eq("email", email).maybeSingle();
  if (dup) return { error: "Someone with that email is already registered." };

  const { data: p, error } = await db().from("stagity_people").insert({ ...d, email, created_by: hr }).select("*").single();
  if (error || !p) return { error: "Couldn't register. " + (error?.message ?? "") };
  await audit(null, `hr:${hr}`, "person_registered", { personId: p.id, email });

  const wantsI9 = formData.get("startI9") === "on";
  if (wantsI9) await openI9(p.id, hr, p, d.start_date);
  const pw = await issueTempPassword(p.id);
  const tasks = [...(wantsI9 ? ["complete your Form I-9"] : []), ...(d.kind === "consultant" ? ["submit your weekly timesheets"] : [])];
  const sent = await sendWelcome(email, d.first_name, pw, `${siteOrigin()}/portal/login`, tasks);
  revalidatePath("/hr/people");
  return {
    ok: true,
    message: sent
      ? `${d.first_name} is registered. We emailed them the sign-in link and a temporary password.`
      : `${d.first_name} is registered, but the email failed. Give them this temporary password yourself: ${pw}`,
  };
}

export async function updatePerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const d = details(formData);
  const err = problem(d);
  if (err) return { error: err };
  const { error } = await db().from("stagity_people").update(d).eq("id", id);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, "person_updated", { personId: id });
  await syncDraftInvoices(id); // new vendor/bill rate applies to open drafts
  const { data: drafts } = await db().from("stagity_invoices").select("id").eq("person_id", id).eq("status", "draft");
  for (const dr of drafts ?? []) await recomputeDraft(dr.id);
  revalidatePath(`/hr/people/${id}`);
  return { ok: true, message: "Saved." };
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { data: p } = await db().from("stagity_people").select("*").eq("id", id).single();
  if (!p) return { error: "Not found." };
  const pw = await issueTempPassword(id);
  const sent = await sendWelcome(p.email, p.first_name, pw, `${siteOrigin()}/portal/login`, []);
  await audit(null, `hr:${hr}`, "temp_password_issued", { personId: id });
  return {
    ok: true,
    message: sent ? `New temporary password emailed to ${p.email}.` : `Email failed. Give them this temporary password: ${pw}`,
  };
}

export async function setActive(formData: FormData) {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const active = formData.get("active") === "true";
  const { data: p } = await db().from("stagity_people").select("session_version").eq("id", id).single();
  await db().from("stagity_people").update({ active, session_version: (p?.session_version ?? 1) + 1 }).eq("id", id);
  await audit(null, `hr:${hr}`, active ? "person_reactivated" : "person_deactivated", { personId: id });
  revalidatePath(`/hr/people/${id}`);
}

export async function startI9(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const firstDay = clip(formData.get("firstDay"), 10);
  const { data: p } = await db().from("stagity_people").select("*").eq("id", id).single();
  if (!p) return { error: "Not found." };
  if (firstDay && !isDate(firstDay)) return { error: "Enter a valid first day." };
  const opened = await openI9(id, hr, p, firstDay || p.start_date);
  if (!opened) return { error: "This person already has a Form I-9." };
  const sent = await sendI9Task(p.email, p.first_name, `${siteOrigin()}/portal/i9`, firstDay || p.start_date);
  revalidatePath(`/hr/people/${id}`);
  return { ok: true, message: sent ? "Form I-9 started and the employee was emailed." : "Form I-9 started (email failed; tell the employee to sign in)." };
}
