import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { siteOrigin } from "@/lib/i9/server";

export const GOOGLE_REDIRECT_PATH = "/api/google/callback";
export const googleRedirectUri = () => `${siteOrigin()}${GOOGLE_REDIRECT_PATH}`;

const sign = (v: string) => createHmac("sha256", process.env.I9_SESSION_SECRET ?? "").update(`gdrive:${v}`).digest("base64url");

/** CSRF-safe state: random nonce + expiry, signed with the session secret. */
export function makeState() {
  const v = `${randomBytes(12).toString("base64url")}.${Date.now() + 10 * 60_000}`;
  return `${v}.${sign(v)}`;
}
export function checkState(state: string | null) {
  if (!state) return false;
  const i = state.lastIndexOf(".");
  const v = state.slice(0, i);
  const a = Buffer.from(state.slice(i + 1));
  const b = Buffer.from(sign(v));
  return a.length === b.length && timingSafeEqual(a, b) && Number(v.split(".")[1]) > Date.now();
}
