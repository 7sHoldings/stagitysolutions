"use server";

import { redirect } from "next/navigation";
import { audit, db, endHrSession, hrEmails, i9Configured, newLoginCode, sha256, startHrSession } from "@/lib/i9/server";
import { sendLoginCode } from "@/lib/i9/mail";

export type LoginState = { step: "email" | "code"; email?: string; message?: string; error?: string };

export async function requestCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const cfg = i9Configured();
  if (!cfg.ok) return { step: "email", error: `HR portal isn't configured yet (missing: ${cfg.missing.join(", ")}).` };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const generic: LoginState = {
    step: "code",
    email,
    message: "If that address is on the HR list, we've emailed it a 6-digit code.",
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

export async function verifyCode(prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const fail: LoginState = { step: "code", email, error: "That code is incorrect or has expired." };
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
  await startHrSession(email);
  await audit(null, `hr:${email}`, "hr_login");
  redirect("/hr");
}

export async function signOut() {
  await endHrSession();
  redirect("/hr/login");
}
