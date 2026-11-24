import "server-only";
import { createSign } from "node:crypto";

/**
 * Copies onboarding files to Google Drive (one folder per employee) using a Google Cloud service account.
 *
 * Setup (once): create a service account, enable the Drive API, add the service account as a
 * "Content manager" of a Shared Drive folder, then set in Vercel:
 *   GOOGLE_SERVICE_ACCOUNT_JSON = the whole JSON key file
 *   GOOGLE_DRIVE_FOLDER_ID      = the folder ID from the Drive URL
 * Without these, every call is a no-op (the portal still keeps its own copy).
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
export const driveConfigured = () => !!key();

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function token(): Promise<string | null> {
  const k = key();
  if (!k) return null;
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
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
  return j.access_token;
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
    const t = await token();
    const root = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!t || !root) return false;
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
