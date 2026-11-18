"use server";

import { redirect } from "next/navigation";
import { audit, db, endHrSession, hrEmails, i9Configured, newLoginCode, sha256, startHrSession } from "@/lib/i9/server";
import { sendLoginCode } from "@/lib/i9/mail";
import { checkPassword, hashPassword, passwordProblem } from "@/lib/portal/server";

export type LoginState = { step: "email" | "code"; email?: string; message?: string; error?: string };
export type PasswordState = { error?: string; needsSetup?: boolean };

/** Everyday sign-in: email + password. */
export async function signInWithPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const cfg = i9Configured();
  if (!cfg.ok) return { error: `HR portal isn't configured yet (missing: ${cfg.missing.join(", ")}).` };
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const fail: PasswordState = { error: "Email or password is incorrect." };
  if (!email || !password) return fail;
  if (!hrEmails().includes(email)) {
    await checkPassword(password, "scrypt.AAAAAAAAAAAAAAAAAAAAAA==.AAAA"); // even out timing
    await audit(null, `unknown:${email.slice(0, 120)}`, "hr_login_denied");
    return fail;
  }
  const { data: acct } = await db().from("stagity_admin_accounts").select("*").eq("email", email).maybeSingle();
  if (!acct) return { needsSetup: true, error: "You haven't set a password yet. Use the link below to set one with a one-time email code." };
  if (acct.locked_until && new Date(acct.locked_until) > new Date()) {
    return { error: "Too many attempts. Try again in 15 minutes, or reset your password with an email code." };
  }
  if (!(await checkPassword(password, acct.password_hash))) {
    const failed = acct.failed_logins + 1;
    await db()
      .from("stagity_admin_accounts")
      .update({ failed_logins: failed, locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null })
      .eq("email", email);
    await audit(null, `hr:${email}`, "hr_login_failed");
    return fail;
  }
  await db().from("stagity_admin_accounts").update({ failed_logins: 0, locked_until: null }).eq("email", email);
  await startHrSession(email);
  await audit(null, `hr:${email}`, "hr_login");
  redirect("/hr");
}

/** First-time setup or "forgot password": email a one-time code. */
export async function requestCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const cfg = i9Configured();
  if (!cfg.ok) return { step: "email", error: `HR portal isn't configured yet (missing: ${cfg.missing.join(", ")}).` };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const generic: LoginState = {
    step: "code",
    email,
    message: "If that address is an admin, we've emailed it a 6-digit code.",
  };
  if (!hrEmails().includes(email)) {
    await audit(null, `unknown:${email.slice(0, 120)}`, "hr_login_denied");
    return generic; // don't reveal which addresses are valid
  }

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db()
    .from("stagity_hr_login_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) return { step: "email", error: "Too many codes requested. Try again in an hour." };

  const code = newLoginCode();
  await db()
    .from("stagity_hr_login_codes")
    .insert({ email, code_hash: sha256(`${email}:${code}`), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  const sent = await sendLoginCode(email, code);
  if (!sent) return { step: "email", error: "We couldn't send the code email. Check the SMTP settings." };
  return generic;
}

/** Checks the emailed code, saves the new password and signs in. */
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const pw = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fail: LoginState = { step: "code", email, error: "That code is incorrect or has expired." };
  const problem = passwordProblem(pw);
  if (problem) return { step: "code", email, error: problem };
  if (pw !== confirm) return { step: "code", email, error: "The two passwords don't match." };
  if (!hrEmails().includes(email) || code.length !== 6) return fail;

  const { data: row } = await db()
    .from("stagity_hr_login_codes")
    .select("*")
    .eq("email", email)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || row.attempts >= 5) return fail;

  if (row.code_hash !== sha256(`${email}:${code}`)) {
    await db().from("stagity_hr_login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return fail;
  }
  await db().from("stagity_hr_login_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await db()
    .from("stagity_admin_accounts")
    .upsert({ email, password_hash: await hashPassword(pw), failed_logins: 0, locked_until: null, updated_at: new Date().toISOString() });
  await startHrSession(email);
  await audit(null, `hr:${email}`, "hr_password_set");
  redirect("/hr");
}

export async function signOut() {
  await endHrSession();
  redirect("/hr/login");
}
