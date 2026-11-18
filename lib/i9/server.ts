import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/*
 * Remote Form I-9 — server helpers.
 *
 * Required environment variables (Vercel → Settings → Environment Variables, mark as Sensitive):
 *   SUPABASE_URL            — already set for the contact form
 *   SUPABASE_SECRET_KEY     — Supabase secret (service role) key. Server-only; never exposed to browsers.
 *   I9_ENCRYPTION_KEY       — 32 random bytes, base64. Encrypts Section 1/2 data (incl. SSN) before it is stored.
 *   I9_SESSION_SECRET       — random string (32+ chars). Signs the HR login cookie.
 *   HR_EMAILS               — comma-separated list of HR emails allowed to sign in (e.g. hr@stagitysolutions.com)
 *   SMTP_USER / SMTP_PASS   — already set; used to email login codes and employee links.
 */

export class I9ConfigError extends Error {}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new I9ConfigError(`${name} is not set`);
  return v;
}

export function i9Configured(): { ok: true } | { ok: false; missing: string[] } {
  const missing = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "I9_ENCRYPTION_KEY", "I9_SESSION_SECRET", "HR_EMAILS"].filter(
    (n) => !process.env[n],
  );
  return missing.length ? { ok: false, missing } : { ok: true };
}

let _db: SupabaseClient | null = null;
/** Supabase client using the secret key. Bypasses RLS — only ever use on the server. */
export function db(): SupabaseClient {
  if (!_db) {
    _db = createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _db;
}

export const I9_BUCKET = "i9-documents";

// ---------- Encryption (AES-256-GCM) ----------

function encKey(): Buffer {
  const key = Buffer.from(env("I9_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new I9ConfigError("I9_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptJson<T>(payload: string | null): T | null {
  if (!payload) return null;
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown encryption format");
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const out = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(out.toString("utf8")) as T;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Long random token for the employee's private link. Only its hash is stored. */
export function newEmployeeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// ---------- Request info & audit ----------

export async function requestInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

export async function audit(caseId: string | null, actor: string, action: string, details?: Record<string, unknown>) {
  const { ip, userAgent } = await requestInfo();
  const { error } = await db()
    .from("stagity_i9_audit")
    .insert({ case_id: caseId, actor, action, details: details ?? null, ip, user_agent: userAgent });
  if (error) console.error("I-9 audit insert failed:", error.message);
}

// ---------- HR session (signed cookie) ----------

const SESSION_COOKIE = "stagity_hr";
const SESSION_HOURS = 8;

export function hrEmails(): string[] {
  return (process.env.HR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function sign(value: string) {
  return createHmac("sha256", env("I9_SESSION_SECRET")).update(value).digest("base64url");
}

export async function startHrSession(email: string) {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const value = `${Buffer.from(email).toString("base64url")}.${exp}`;
  (await cookies()).set(SESSION_COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endHrSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Returns the signed-in HR email, or null. */
export async function hrSession(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw || !process.env.I9_SESSION_SECRET) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [emailB64, exp, sig] = parts;
  const expected = Buffer.from(sign(`${emailB64}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now()) return null;
  const email = Buffer.from(emailB64, "base64url").toString("utf8");
  // Removing someone from HR_EMAILS revokes their access immediately.
  return hrEmails().includes(email) ? email : null;
}

export async function requireHr(): Promise<string> {
  const email = await hrSession();
  if (!email) redirect("/hr/login");
  return email;
}

// ---------- Employee link ----------

export async function caseForToken(token: string) {
  if (!token || token.length < 30) return null;
  const { data } = await db()
    .from("stagity_i9_cases")
    .select("*")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!data) return null;
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return { ...data, expired: true as const };
  return { ...data, expired: false as const };
}

export function siteOrigin(): string {
  return process.env.SITE_URL || "https://stagitysolutions.com";
}
