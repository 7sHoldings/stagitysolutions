import "server-only";
import { db } from "@/lib/i9/server";
import { driveConfigured, employeeFolderName, saveToDrive } from "@/lib/gdrive";
import { FILE_KINDS, OB_BUCKET, decryptDeposit, decryptPersonal, decryptW4 } from "./server";
import { buildDepositPdf, buildPersonalPdf, buildW4Pdf } from "./pdf";

async function person(personId: string) {
  const { data } = await db().from("stagity_people").select("first_name, last_name, emergency_name, emergency_phone, emergency_relationship").eq("id", personId).single();
  return data;
}

/** Re-saves the filled forms (Personal Information, W-4, Direct Deposit) to the employee's Drive folder. */
export async function syncFormsToDrive(personId: string) {
  if (!(await driveConfigured())) return;
  const [p, { data: ob }] = await Promise.all([person(personId), db().from("stagity_onboarding").select("personal_enc, w4_enc, deposit_enc").eq("person_id", personId).single()]);
  if (!p || !ob) return;
  const folder = employeeFolderName(p);
  const personal = decryptPersonal(ob.personal_enc);
  const w4 = decryptW4(ob.w4_enc);
  const dep = decryptDeposit(ob.deposit_enc);
  const name = personal ? `${personal.firstName} ${personal.lastName}` : `${p.first_name} ${p.last_name}`;
  if (personal) {
    const emergency = p.emergency_name ? { name: p.emergency_name, phone: p.emergency_phone ?? "", relationship: p.emergency_relationship ?? "" } : undefined;
    await saveToDrive(folder, "Employee Personal Information.pdf", await buildPersonalPdf(personal, { deposit: dep, emergency }), "application/pdf", "Forms");
  }
  if (personal && w4) await saveToDrive(folder, "Form W-4.pdf", await buildW4Pdf(personal, w4), "application/pdf", "Forms");
  if (dep) await saveToDrive(folder, "Direct Deposit Agreement.pdf", await buildDepositPdf(name, dep), "application/pdf", "Forms");
}

/** Copies one stored file (uploaded document or signed PDF) to the employee's Drive folder. */
export async function syncFileToDrive(personId: string, storagePath: string, fileName: string, subfolder: string) {
  if (!(await driveConfigured())) return;
  const p = await person(personId);
  const { data: blob } = await db().storage.from(OB_BUCKET).download(storagePath);
  if (!p || !blob) return;
  await saveToDrive(employeeFolderName(p), fileName, new Uint8Array(await blob.arrayBuffer()), blob.type || "application/octet-stream", subfolder);
}

/** File name for an uploaded document, e.g. "Driver's license (copy) - IMG_2041.jpg". */
export const docFileName = (kind: string, original: string) => `${(FILE_KINDS[kind] ?? kind).replace(/[\\/:*?"<>|]/g, "")} - ${original.replace(/[\\/:*?"<>|]/g, "_")}`;

/** Everything for one person (used by HR's "Copy to Google Drive" button). */
export async function syncAllToDrive(personId: string) {
  if (!(await driveConfigured())) return { ok: false, count: 0 };
  await syncFormsToDrive(personId);
  const [{ data: files }, { data: sigs }] = await Promise.all([
    db().from("stagity_onboarding_files").select("kind, storage_path, original_name").eq("person_id", personId),
    db().from("stagity_signatures").select("title, signed_path").eq("person_id", personId).eq("status", "signed"),
  ]);
  for (const f of files ?? []) await syncFileToDrive(personId, f.storage_path, docFileName(f.kind, f.original_name ?? "file"), "Documents");
  for (const s of sigs ?? []) if (s.signed_path) await syncFileToDrive(personId, s.signed_path, `${s.title.replace(/[\\/:*?"<>|]/g, "")} (signed).pdf`, "Signed");
  return { ok: true, count: (files?.length ?? 0) + (sigs?.length ?? 0) + 3 };
}
