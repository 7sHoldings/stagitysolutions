"use server";

import { redirect } from "next/navigation";
import { audit, db, newLoginCode, sha256 } from "@/lib/i9/server";
import { sendPasswordResetCode } from "@/lib/i9/mail";
import { checkPassword, endPortalSession, hashPassword, passwordProblem, portalPerson, startPortalSession } from "@/lib/portal/server";

export type FormState = { error?: string; message?: string };

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const fail = { error: "Email or password is incorrect." };
  if (!email || !password) return fail;

  const { data: p } = await db().from("stagity_people").select("*").eq("email", email).maybeSingle();
  if (!p || !p.active) {
    await checkPassword(password, "scrypt.AAAAAAAAAAAAAAAAAAAAAA==.AAAA"); // even out timing
    return fail;
  }
  if (p.locked_until && new Date(p.locked_until) > new Date()) {
    return { error: "Too many attempts. Try again in 15 minutes, or ask HR to reset your password." };
  }
  if (!(await checkPassword(password, p.password_hash))) {
    const failed = p.failed_logins + 1;
    await db()
      .from("stagity_people")
      .update({ failed_logins: failed, locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null })
      .eq("id", p.id);
    await audit(null, `person:${p.id}`, "portal_login_failed");
    return fail;
  }
  if (p.must_change_password && p.temp_password_expires_at && new Date(p.temp_password_expires_at) < new Date()) {
    return { error: "Your temporary password has expired. Ask HR to send you a new one." };
  }
  await db().from("stagity_people").update({ failed_logins: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq("id", p.id);
  await startPortalSession(p);
  await audit(null, `person:${p.id}`, "portal_login");
  redirect(p.must_change_password ? "/portal/set-password" : "/portal");
}

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const p = await portalPerson();
  if (!p) redirect("/portal/login");
  const pw = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = passwordProblem(pw);
  if (problem) return { error: problem };
  if (pw !== confirm) return { error: "The two passwords don't match." };
  const version = p.session_version + 1; // signs out any other sessions
  await db()
    .from("stagity_people")
    .update({ password_hash: await hashPassword(pw), must_change_password: false, temp_password_expires_at: null, session_version: version })
    .eq("id", p.id);
  await startPortalSession({ id: p.id, session_version: version });
  await audit(null, `person:${p.id}`, "password_set");
  redirect(p.profile_completed_at ? "/portal" : "/portal/details");
}

export async function signOutPortal() {
  await endPortalSession();
  redirect("/portal/login");
}

// ---------- Forgot password ----------

export type ResetState = { step: "email" | "code"; email?: string; message?: string; error?: string };

export async function requestPasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const generic: ResetState = { step: "code", email, message: "If that email has a portal account, we've sent it a 6-digit code. Check your inbox (and spam)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { step: "email", error: "Enter the email you use to sign in." };

  const { data: p } = await db().from("stagity_people").select("id, first_name, email, active").eq("email", email).maybeSingle();
  if (!p || !p.active) return generic; // don't reveal which emails have accounts

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db().from("stagity_password_resets").select("id", { count: "exact", head: true }).eq("person_id", p.id).gte("created_at", since);
  if ((count ?? 0) >= 5) return { step: "email", error: "Too many codes requested. Try again in an hour, or contact HR." };

  const code = newLoginCode();
  await db()
    .from("stagity_password_resets")
    .insert({ person_id: p.id, code_hash: sha256(`${p.id}:${code}`), expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
  await sendPasswordResetCode(p.email, p.first_name, code);
  await audit(null, `person:${p.id}`, "password_reset_requested");
  return generic;
}

export async function completePasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const pw = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fail: ResetState = { step: "code", email, error: "That code is incorrect or has expired. Request a new one." };

  const problem = passwordProblem(pw);
  if (problem) return { step: "code", email, error: problem };
  if (pw !== confirm) return { step: "code", email, error: "The two passwords don't match." };
  if (code.length !== 6) return fail;

  const { data: p } = await db().from("stagity_people").select("id, active, session_version").eq("email", email).maybeSingle();
  if (!p || !p.active) return fail;
  const { data: row } = await db()
    .from("stagity_password_resets")
    .select("*")
    .eq("person_id", p.id)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || row.attempts >= 5) return fail;
  if (row.code_hash !== sha256(`${p.id}:${code}`)) {
    await db().from("stagity_password_resets").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return fail;
  }

  const version = p.session_version + 1; // signs out every other session
  await db().from("stagity_password_resets").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await db()
    .from("stagity_people")
    .update({
      password_hash: await hashPassword(pw),
      must_change_password: false,
      temp_password_expires_at: null,
      session_version: version,
      failed_logins: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", p.id);
  await startPortalSession({ id: p.id, session_version: version });
  await audit(null, `person:${p.id}`, "password_reset_completed");
  redirect("/portal");
}

// ---------- Contact details (required once after first sign-in) ----------

const digits = (v: string) => v.replace(/\D/g, "");

export async function saveDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const p = await portalPerson();
  if (!p) redirect("/portal/login");
  const get = (k: string, max = 120) => String(formData.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const row = {
    phone: get("phone", 30),
    address_line1: get("address1", 160),
    address_line2: get("address2", 160) || null,
    city: get("city", 80),
    state: get("state", 2).toUpperCase(),
    zip: get("zip", 10),
    emergency_name: get("emergencyName", 120),
    emergency_relationship: get("emergencyRelationship", 60),
    emergency_phone: get("emergencyPhone", 30),
  };
  if (digits(row.phone).length < 10 || digits(row.phone).length > 15) return { error: "Enter your phone number with area code." };
  if (!row.address_line1 || !row.city) return { error: "Enter your home address and city." };
  if (!/^[A-Z]{2}$/.test(row.state)) return { error: "Choose your state." };
  if (!/^\d{5}(-\d{4})?$/.test(row.zip)) return { error: "Enter a 5-digit ZIP code." };
  if (!row.emergency_name || !row.emergency_relationship) return { error: "Enter your emergency contact's name and relationship." };
  if (digits(row.emergency_phone).length < 10 || digits(row.emergency_phone).length > 15) return { error: "Enter your emergency contact's phone number with area code." };
  if (digits(row.emergency_phone) === digits(row.phone)) return { error: "Your emergency contact needs a different phone number from yours." };
  const first = !p.profile_completed_at;
  await db().from("stagity_people").update({ ...row, profile_completed_at: p.profile_completed_at ?? new Date().toISOString() }).eq("id", p.id);
  await audit(null, `person:${p.id}`, first ? "profile_completed" : "profile_updated");
  if (first) redirect("/portal?welcome=1");
  return { message: "Saved." };
}
