"use server";

import { redirect } from "next/navigation";
import { audit, db } from "@/lib/i9/server";
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
  redirect("/portal");
}

export async function signOutPortal() {
  await endPortalSession();
  redirect("/portal/login");
}
