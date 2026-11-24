"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, db, I9_BUCKET, requireHr, siteOrigin } from "@/lib/i9/server";
import { sendI9Task, sendWelcome } from "@/lib/i9/mail";
import { TS_BUCKET } from "@/lib/portal/server";
import { issueTempPassword, openI9 } from "@/lib/portal/accounts";
import type { ActionState } from "../actions";
import { addDays, todayCT } from "@/lib/portal/dates";
import { startFor } from "@/lib/onboarding/start";
import { OB_BUCKET } from "@/lib/onboarding/server";
import { recomputeDraft, syncDraftInvoices } from "@/lib/invoices/server";

const clip = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const num = (v: string) => (v ? Number(v) : null);

/** Personal details only. Rates, vendor and client are set when the consultant is added to a vendor. */
function details(formData: FormData) {
  return {
    first_name: clip(formData.get("first"), 80),
    last_name: clip(formData.get("last"), 80),
    phone: clip(formData.get("phone"), 30) || null,
    kind: clip(formData.get("kind"), 20) === "employee" ? "employee" : "consultant",
    start_date: clip(formData.get("startDate"), 10) || null,
    ...(formData.has("endDate") ? { end_date: clip(formData.get("endDate"), 10) || null } : {}),
    ...(formData.has("adpId") ? { adp_employee_id: clip(formData.get("adpId"), 30) || null } : {}),
  };
}

function problem(d: ReturnType<typeof details>): string | null {
  if (!d.first_name || !d.last_name) return "Enter first and last name.";
  if ((d.start_date && !isDate(d.start_date)) || (d.end_date && !isDate(d.end_date))) return "Enter valid dates.";
  return null;
}

/** Vendor onboarding: puts a consultant on a vendor with their pay rate, bill rate and client details. */
export async function assignConsultant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  const vendorId = clip(formData.get("vendorId"), 60);
  const pay = num(clip(formData.get("payRate"), 12));
  const bill = num(clip(formData.get("billRate"), 12));
  const managerEmail = clip(formData.get("managerEmail"), 200).toLowerCase() || null;
  if (!personId) return { error: "Choose a consultant." };
  const monthly = num(clip(formData.get("monthlyPay"), 12));
  if (monthly !== null && (!Number.isFinite(monthly) || monthly < 0 || monthly > 1_000_000)) return { error: "Enter a valid monthly amount." };
  const isMonthly = monthly !== null && monthly > 0;
  if (!isMonthly && (pay === null || !Number.isFinite(pay) || pay < 0 || pay > 10000)) return { error: "Enter the consultant's hourly pay rate (or a flat monthly amount)." };
  if (pay !== null && (!Number.isFinite(pay) || pay < 0 || pay > 10000)) return { error: "Enter a valid hourly pay rate." };
  const { data: vend } = await db().from("stagity_vendors").select("send_invoices").eq("id", vendorId).maybeSingle();
  if (!vend) return { error: "Vendor not found." };
  if (vend.send_invoices && bill === null) return { error: "Enter the hourly bill rate to the vendor." };
  if (bill !== null && (!Number.isFinite(bill) || bill < 0 || bill > 10000)) return { error: "Enter a valid bill rate." };
  if (managerEmail && !emailOk(managerEmail)) return { error: "Enter a valid client manager email." };
  const termsRaw = clip(formData.get("personTerms"), 4);
  const terms = termsRaw ? Number(termsRaw) : null;
  if (terms !== null && (!Number.isInteger(terms) || terms < 0 || terms > 180)) return { error: "Payment terms must be 0–180 days, or leave it empty for the vendor default." };
  const { error } = await db()
    .from("stagity_people")
    .update({
      vendor_id: vendorId,
      pay_rate: pay,
      monthly_pay: isMonthly ? monthly : null,
      bill_rate: bill,
      client_name: clip(formData.get("clientName"), 120) || null,
      client_manager_name: clip(formData.get("managerName"), 120) || null,
      client_manager_email: managerEmail,
      po_number: clip(formData.get("poNumber"), 80) || null,
      payment_terms_days: terms,
      kind: "consultant",
    })
    .eq("id", personId);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, "consultant_assigned", { personId, vendorId, pay, monthly, bill });
  await syncDraftInvoices(personId);
  const { data: drafts } = await db().from("stagity_invoices").select("id").eq("person_id", personId).eq("status", "draft");
  for (const dr of drafts ?? []) await recomputeDraft(dr.id);
  revalidatePath("/hr/vendors");
  revalidatePath(`/hr/people/${personId}`);
  return { ok: true, message: "Saved." };
}

/** Pay for payroll, for people not on a vendor (e.g. employees): hourly rate and/or flat monthly amount. */
export async function setPay(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  const pay = num(clip(formData.get("payRate"), 12));
  const monthly = num(clip(formData.get("monthlyPay"), 12));
  if (pay !== null && (!Number.isFinite(pay) || pay < 0 || pay > 10000)) return { error: "Enter a valid hourly rate." };
  if (monthly !== null && (!Number.isFinite(monthly) || monthly < 0 || monthly > 1_000_000)) return { error: "Enter a valid monthly amount." };
  if (pay === null && !monthly) return { error: "Enter a flat monthly amount or an hourly rate." };
  const { error } = await db().from("stagity_people").update({ pay_rate: pay, monthly_pay: monthly && monthly > 0 ? monthly : null }).eq("id", personId);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, "pay_updated", { personId, pay, monthly });
  revalidatePath(`/hr/people/${personId}`);
  return { ok: true, message: "Saved." };
}

export async function unassignConsultant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const personId = clip(formData.get("personId"), 60);
  await db().from("stagity_people").update({ vendor_id: null }).eq("id", personId);
  await audit(null, `hr:${hr}`, "consultant_unassigned", { personId });
  revalidatePath("/hr/vendors");
  return { ok: true, message: "Unassigned." };
}

export async function registerPerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const d = details(formData);
  const email = clip(formData.get("email"), 200).toLowerCase();
  const noLogin = !email && d.kind === "employee";
  const err = problem(d) ?? (noLogin || emailOk(email) ? null : d.kind === "employee" ? "Enter a valid email, or leave it empty for payroll only." : "Enter a valid email.");
  if (err) return { error: err };
  if (email) {
    const { data: dup } = await db().from("stagity_people").select("id").eq("email", email).maybeSingle();
    if (dup) return { error: "Someone with that email is already registered." };
  }

  const dueRaw = clip(formData.get("signupDue"), 10);
  const signupDue = email ? (isDate(dueRaw) ? dueRaw : addDays(todayCT(), 7)) : null;
  const { data: p, error } = await db().from("stagity_people").insert({ ...d, email: email || null, created_by: hr, signup_due: signupDue }).select("*").single();
  if (error || !p) return { error: "Couldn't register. " + (error?.message ?? "") };
  await audit(null, `hr:${hr}`, "person_registered", { personId: p.id, email: email || null });
  if (noLogin) {
    revalidatePath("/hr/people");
    return { ok: true, message: `${d.first_name} is added for payroll only (no portal login). Set their pay on their profile.` };
  }

  const wantsI9 = formData.get("startI9") === "on";
  const wantsOnboarding = formData.get("startOnboarding") === "on";
  if (wantsOnboarding) {
    const { data: defaults } = await db().from("stagity_doc_templates").select("id").eq("active", true).eq("default_for_new", true);
    await startFor([p.id], (defaults ?? []).map((t) => t.id), signupDue ?? addDays(todayCT(), 7), false, hr);
  }
  if (wantsI9) await openI9(p.id, hr, p, d.start_date);
  const pw = await issueTempPassword(p.id);
  const tasks = [...(wantsOnboarding ? ["complete your new-hire paperwork (W-4, direct deposit, documents)"] : []), ...(wantsI9 ? ["complete your Form I-9"] : []), ...(d.kind === "consultant" ? ["submit your weekly timesheets"] : [])];
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
  const newEmail = clip(formData.get("email"), 200).toLowerCase();
  const extra: { email?: string } = {};
  if (newEmail) {
    if (!emailOk(newEmail)) return { error: "Enter a valid email." };
    const { data: cur } = await db().from("stagity_people").select("email").eq("id", id).single();
    if (!cur?.email) {
      const { data: dup } = await db().from("stagity_people").select("id").eq("email", newEmail).maybeSingle();
      if (dup) return { error: "Someone with that email is already registered." };
      extra.email = newEmail;
    }
  }
  const { error } = await db().from("stagity_people").update({ ...d, ...extra }).eq("id", id);
  if (error) return { error: error.message };
  await audit(null, `hr:${hr}`, "person_updated", { personId: id, ...(extra.email ? { emailAdded: extra.email } : {}) });

  revalidatePath(`/hr/people/${id}`);
  return { ok: true, message: "Saved." };
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { data: p } = await db().from("stagity_people").select("*").eq("id", id).single();
  if (!p) return { error: "Not found." };
  if (!p.email) return { error: "Add their email first (Personal details), then send a login." };
  const pw = await issueTempPassword(id);
  // A fresh temporary password gives them another week; keep a later due date if HR set one.
  const week = addDays(todayCT(), 7);
  await db().from("stagity_people").update({ signup_due: p.signup_due && p.signup_due > week ? p.signup_due : week }).eq("id", id);
  const sent = await sendWelcome(p.email, p.first_name, pw, `${siteOrigin()}/portal/login`, []);
  await audit(null, `hr:${hr}`, "temp_password_issued", { personId: id });
  return {
    ok: true,
    message: sent ? `New temporary password emailed to ${p.email}.` : `Email failed. Give them this temporary password: ${pw}`,
  };
}

/**
 * Emails a login (temporary password) to everyone who has an email but never got one
 * (e.g. people added in bulk). Each gets the standard welcome email from hr@.
 */
export async function sendPendingLogins(_prev: ActionState): Promise<ActionState> {
  const hr = await requireHr();
  const { data: people } = await db()
    .from("stagity_people")
    .select("id, first_name, email, kind, signup_due")
    .eq("active", true)
    .not("email", "is", null)
    .is("password_hash", null);
  if (!people?.length) return { ok: true, message: "Everyone already has a login." };
  const sent: string[] = [];
  const failed: string[] = [];
  const week = addDays(todayCT(), 7);
  for (const p of people) {
    const pw = await issueTempPassword(p.id);
    if (!p.signup_due || p.signup_due < week) await db().from("stagity_people").update({ signup_due: week }).eq("id", p.id);
    const ok = await sendWelcome(p.email!, p.first_name, pw, `${siteOrigin()}/portal/login`, p.kind === "consultant" ? ["submit your weekly timesheets"] : []);
    if (ok) sent.push(p.first_name);
    else {
      failed.push(p.first_name);
      await db().from("stagity_people").update({ password_hash: null }).eq("id", p.id); // so "Send login emails" can retry
    }
    await audit(null, `hr:${hr}`, "login_sent", { personId: p.id, ok });
  }
  revalidatePath("/hr/people");
  if (failed.length) return { error: `Sent to ${sent.join(", ") || "nobody"}. Couldn't email ${failed.join(", ")}; check the email settings and try again.` };
  return { ok: true, message: `Login emails sent to ${sent.length}: ${sent.join(", ")}.` };
}

/** Changes the date until which daily "please set up your account" reminders are sent. */
export async function setSignupDue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const due = clip(formData.get("signupDue"), 10);
  if (due && !isDate(due)) return { error: "Enter a valid date." };
  await db().from("stagity_people").update({ signup_due: due || null }).eq("id", id);
  await audit(null, `hr:${hr}`, "signup_due_set", { personId: id, due: due || null });
  revalidatePath(`/hr/people/${id}`);
  revalidatePath("/hr/people");
  return { ok: true, message: due ? "Saved." : "Reminders stopped." };
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
  if (!p.email) return { error: "Add their email first (Personal details)." };
  if (firstDay && !isDate(firstDay)) return { error: "Enter a valid first day." };
  const opened = await openI9(id, hr, p, firstDay || p.start_date);
  if (!opened) return { error: "This person already has a Form I-9." };
  const sent = await sendI9Task(p.email, p.first_name, `${siteOrigin()}/portal/i9`, firstDay || p.start_date);
  revalidatePath(`/hr/people/${id}`);
  return { ok: true, message: sent ? "Form I-9 started and the employee was emailed." : "Form I-9 started (email failed; tell the employee to sign in)." };
}

/**
 * Deletes a person and their working records (draft timesheets, uploads, draft invoices/payroll lines,
 * an unstarted I-9). Refused if anything must be kept: sent/paid invoices, locked payroll, or an I-9
 * with Section 1 completed. Use Deactivate for those.
 */
export async function deletePerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { data: p } = await db().from("stagity_people").select("id, first_name, last_name, email").eq("id", id).maybeSingle();
  if (!p) return { error: "Not found." };

  const [{ count: sentInvoices }, { data: payroll }, { data: i9s }] = await Promise.all([
    db().from("stagity_invoices").select("id", { count: "exact", head: true }).eq("person_id", id).neq("status", "draft"),
    db().from("stagity_payroll_items").select("id, stagity_payroll_runs(status)").eq("person_id", id),
    db().from("stagity_i9_cases").select("id, status").eq("person_id", id),
  ]);
  const lockedPayroll = (payroll ?? []).some((x) => (x.stagity_payroll_runs as unknown as { status: string } | null)?.status === "locked");
  const startedI9 = (i9s ?? []).some((c) => !["invited", "cancelled"].includes(c.status));
  if (sentInvoices || lockedPayroll || startedI9) {
    const why = [sentInvoices ? "sent invoices" : "", lockedPayroll ? "locked payroll" : "", startedI9 ? "a completed Form I-9" : ""].filter(Boolean).join(", ");
    return { error: `${p.first_name} has ${why}, which must be kept for your records. Use Deactivate instead.` };
  }

  // Remove uploaded timesheet files from storage, then the rows.
  const { data: sheets } = await db().from("stagity_timesheets").select("id").eq("person_id", id);
  const sheetIds = (sheets ?? []).map((s) => s.id);
  if (sheetIds.length) {
    const { data: files } = await db().from("stagity_timesheet_files").select("storage_path").in("timesheet_id", sheetIds);
    if (files?.length) await db().storage.from(TS_BUCKET).remove(files.map((f) => f.storage_path));
  }
  const i9Ids = (i9s ?? []).map((c) => c.id);
  if (i9Ids.length) {
    const { data: docs } = await db().from("stagity_i9_documents").select("storage_path").in("case_id", i9Ids);
    if (docs?.length) await db().storage.from(I9_BUCKET).remove(docs.map((d) => d.storage_path));
  }
  const [{ data: obFiles }, { data: obSigs }] = await Promise.all([
    db().from("stagity_onboarding_files").select("storage_path").eq("person_id", id),
    db().from("stagity_signatures").select("source_path, signed_path").eq("person_id", id),
  ]);
  const obPaths = [...(obFiles ?? []).map((f) => f.storage_path), ...(obSigs ?? []).flatMap((x) => [x.signed_path, x.source_path.startsWith("people/") ? x.source_path : null])].filter(Boolean) as string[];
  if (obPaths.length) await db().storage.from(OB_BUCKET).remove(obPaths);
  await db().from("stagity_timesheet_days").update({ invoice_id: null, payroll_run_id: null }).eq("person_id", id);
  await db().from("stagity_invoices").delete().eq("person_id", id).eq("status", "draft");
  await db().from("stagity_payroll_items").delete().eq("person_id", id);
  await db().from("stagity_timesheet_days").delete().eq("person_id", id);
  if (sheetIds.length) await db().from("stagity_timesheets").delete().in("id", sheetIds);
  if (i9Ids.length) await db().from("stagity_i9_cases").delete().in("id", i9Ids);
  const { error } = await db().from("stagity_people").delete().eq("id", id);
  if (error) return { error: `Couldn't delete: ${error.message}` };
  await audit(null, `hr:${hr}`, "person_deleted", { personId: id, email: p.email, name: `${p.first_name} ${p.last_name}` });
  revalidatePath("/hr/people");
  redirect("/hr/people");
}
