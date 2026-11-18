import "server-only";
import { createHmac, randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/i9/server";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  kind: "consultant" | "employee";
  active: boolean;
  must_change_password: boolean;
  session_version: number;
  client_name: string | null;
  client_manager_name: string | null;
  client_manager_email: string | null;
  pay_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  adp_employee_id: string | null;
};

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt.${salt.toString("base64")}.${key.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, salt, key] = stored.split(".");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(want, got);
}

/** Easy-to-type temporary password, e.g. "Kp7m-Qx4t-Wn9c". */
export function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const block = () => Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join("");
  return `${block()}-${block()}-${block()}`;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number.";
  return null;
}

// ---------- Portal session ----------

const COOKIE = "stagity_portal";
const HOURS = 12;

function sign(v: string) {
  const secret = process.env.I9_SESSION_SECRET;
  if (!secret) throw new Error("I9_SESSION_SECRET is not set");
  return createHmac("sha256", "portal:" + secret).update(v).digest("base64url");
}

export async function startPortalSession(p: { id: string; session_version: number }) {
  const exp = Date.now() + HOURS * 3600_000;
  const v = `${p.id}.${p.session_version}.${exp}`;
  (await cookies()).set(COOKIE, `${v}.${sign(v)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: HOURS * 3600,
  });
}

export async function endPortalSession() {
  (await cookies()).delete(COOKIE);
}

export async function portalPerson(): Promise<Person | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw || !process.env.I9_SESSION_SECRET) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [id, ver, exp, sig] = parts;
  const a = Buffer.from(sign(`${id}.${ver}.${exp}`));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b) || Number(exp) < Date.now()) return null;
  const { data } = await db().from("stagity_people").select("*").eq("id", id).maybeSingle();
  if (!data || !data.active || String(data.session_version) !== ver) return null;
  return data as Person;
}

/** For portal pages: signed-in person who has already set their own password. */
export async function requirePerson(): Promise<Person> {
  const p = await portalPerson();
  if (!p) redirect("/portal/login");
  if (p.must_change_password) redirect("/portal/set-password");
  return p;
}
export const TS_BUCKET = "timesheets";
