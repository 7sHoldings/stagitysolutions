import "server-only";
import { createSign } from "node:crypto";
import { db, decryptJson, encryptJson } from "@/lib/i9/server";

/**
 * Copies onboarding files to Google Drive (one folder per employee).
 *
 * Two ways to connect (the first one configured wins):
 *  1. "Connect Google Drive" button (OAuth): HR signs in once with hr@; files go to that account's
 *     Drive under "Stagity Onboarding". Needs GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in Vercel;
 *     the refresh token is stored encrypted in stagity_settings (google_drive_token). Scope: drive.file
 *     (the portal can only see files it created).
 *  2. Service account: GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_DRIVE_FOLDER_ID (Shared drive).
 * If neither is set, every call is a no-op (the portal still keeps its own copy).
 */
type Key = { client_email: string; private_key: string };
let cached: { token: string; exp: number } | null = null;
const folderCache = new Map<string, string>();

function key(): Key | null {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw || !process.env.GOOGLE_DRIVE_FOLDER_ID) return null;
    const k = JSON.parse(raw) as Key;
    return k.client_email && k.private_key ? k : null;
  } catch {
    return null;
  }
}

export const oauthAvailable = () => !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);

type OAuthConn = { refreshToken: string; email: string; rootId: string };
async function oauthConn(): Promise<OAuthConn | null> {
  if (!oauthAvailable()) return null;
  const { data } = await db().from("stagity_settings").select("value").eq("key", "google_drive_token").maybeSingle();
  return data?.value ? decryptJson<OAuthConn>(data.value as string) : null;
}
export async function saveOAuthConn(c: OAuthConn, by: string) {
  await db().from("stagity_settings").upsert({ key: "google_drive_token", value: encryptJson(c), updated_at: new Date().toISOString(), updated_by: by });
  cached = null;
  folderCache.clear();
}
export async function clearOAuthConn() {
  await db().from("stagity_settings").delete().eq("key", "google_drive_token");
  cached = null;
  folderCache.clear();
}

/** Who Drive is connected as (or null). */
export async function driveStatus(): Promise<{ mode: "oauth" | "service"; email: string } | null> {
  const c = await oauthConn();
  if (c) return { mode: "oauth", email: c.email };
  const k = key();
  return k ? { mode: "service", email: k.client_email } : null;
}
export const driveConfigured = async () => !!(await driveStatus());

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Exchanges an OAuth refresh token for an access token. */
export async function refreshAccess(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!res.ok) { console.error("Drive token refresh failed", res.status, await res.text()); return null; }
  return (await res.json()) as { access_token: string; expires_in: number };
}

async function token(): Promise<{ token: string; root: string } | null> {
  const conn = await oauthConn();
  if (conn) {
    if (cached && cached.exp > Date.now() + 60_000) return { token: cached.token, root: conn.rootId };
    const j = await refreshAccess(conn.refreshToken);
    if (!j) return null;
    cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return { token: j.access_token, root: conn.rootId };
  }
  const k = key();
  if (!k) return null;
  const root = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  if (cached && cached.exp > Date.now() + 60_000) return { token: cached.token, root };
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: k.client_email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(k.private_key.replace(/\\n/g, "\n"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  if (!res.ok) { console.error("Drive auth failed", res.status, await res.text()); return null; }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return { token: j.access_token, root };
}

/** Creates the "Stagity Onboarding" folder in the connected account's My Drive (OAuth mode). */
export async function createRootFolder(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Stagity Onboarding", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) { console.error("Drive root folder failed", res.status, await res.text()); return null; }
  return ((await res.json()) as { id: string }).id;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function folder(name: string, parent: string, t: string): Promise<string | null> {
  const ck = `${parent}/${name}`;
  if (folderCache.has(ck)) return folderCache.get(ck)!;
  const search = new URLSearchParams({
    q: `name = '${q(name)}' and '${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
  });
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?${search}`, { headers: { authorization: `Bearer ${t}` } });
  const fj = found.ok ? ((await found.json()) as { files: { id: string }[] }) : { files: [] };
  let id = fj.files[0]?.id ?? null;
  if (!id) {
    const made = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({ name, parents: [parent], mimeType: "application/vnd.google-apps.folder" }),
    });
    if (!made.ok) { console.error("Drive folder failed", made.status, await made.text()); return null; }
    id = ((await made.json()) as { id: string }).id;
  }
  folderCache.set(ck, id);
  return id;
}

/**
 * Saves a file to  <root>/<employee folder>/<subfolder?>/<fileName>, replacing a file with the same name.
 * Never throws: Drive problems are logged and the portal carries on.
 */
export async function saveToDrive(employeeFolder: string, fileName: string, bytes: Uint8Array, mime: string, subfolder?: string): Promise<boolean> {
  try {
    const auth = await token();
    if (!auth) return false;
    const t = auth.token;
    const root = auth.root;
    let parent = await folder(employeeFolder, root, t);
    if (parent && subfolder) parent = await folder(subfolder, parent, t);
    if (!parent) return false;
    // Replace an existing file with the same name (e.g. a re-signed W-4).
    const search = new URLSearchParams({ q: `name = '${q(fileName)}' and '${parent}' in parents and trashed = false`, fields: "files(id)", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    const ex = await fetch(`https://www.googleapis.com/drive/v3/files?${search}`, { headers: { authorization: `Bearer ${t}` } });
    const existing = ex.ok ? ((await ex.json()) as { files: { id: string }[] }).files[0]?.id : undefined;
    const boundary = `stagity${Date.now()}`;
    const meta = JSON.stringify(existing ? { name: fileName } : { name: fileName, parents: [parent] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`),
      Buffer.from(bytes),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const url = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=multipart&supportsAllDrives=true`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
    const res = await fetch(url, { method: existing ? "PATCH" : "POST", headers: { authorization: `Bearer ${t}`, "content-type": `multipart/related; boundary=${boundary}` }, body });
    if (!res.ok) { console.error("Drive upload failed", res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("Drive error", e);
    return false;
  }
}

/** "Panchal, Krutarth" — folder name for an employee. */
export const employeeFolderName = (p: { first_name: string; last_name: string }) => `${p.last_name}, ${p.first_name}`;
