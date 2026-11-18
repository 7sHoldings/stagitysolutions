"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, db, encryptJson, requireHr } from "@/lib/i9/server";
import type { DocEntry, Section2 } from "@/lib/i9/forms";
import { company } from "@/lib/content";

export type ActionState = { ok?: boolean; error?: string; message?: string; link?: string };

const clip = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function docFrom(formData: FormData, prefix: string): DocEntry | null {
  const title = clip(formData.get(`${prefix}_title`), 200);
  if (!title) return null;
  const expiresNA = formData.get(`${prefix}_expires_na`) === "on";
  return {
    title,
    issuingAuthority: clip(formData.get(`${prefix}_authority`), 120),
    number: clip(formData.get(`${prefix}_number`), 60),
    expires: expiresNA ? "N/A" : clip(formData.get(`${prefix}_expires`), 10),
  };
}

export async function completeSection2(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const { data: c } = await db().from("stagity_i9_cases").select("*").eq("id", id).single();
  if (!c) return { error: "Case not found." };
  if (c.status !== "section1_complete") return { error: "Section 2 can only be completed after Section 1, and only once." };

  const mode = clip(formData.get("mode"), 2);
  const listA = mode === "A" ? ["a1", "a2", "a3"].map((p) => docFrom(formData, p)).filter((d): d is DocEntry => !!d) : [];
  const listB = mode === "BC" ? docFrom(formData, "b") : null;
  const listC = mode === "BC" ? docFrom(formData, "c") : null;
  if (mode === "A" && listA.length === 0) return { error: "Enter the List A document details." };
  if (mode === "BC" && (!listB || !listC)) return { error: "Enter both the List B and List C document details." };
  for (const d of [...listA, listB, listC].filter((x): x is DocEntry => !!x)) {
    if (!d.issuingAuthority || !d.number) return { error: `Enter the issuing authority and number for "${d.title}".` };
    if (d.expires !== "N/A" && !isDate(d.expires)) return { error: `Enter an expiration date (or tick N/A) for "${d.title}".` };
  }

  const firstDay = clip(formData.get("firstDay"), 10);
  const videoCallAt = clip(formData.get("videoCallAt"), 30);
  const repFirstName = clip(formData.get("repFirstName"), 80);
  const repLastName = clip(formData.get("repLastName"), 80);
  const repTitle = clip(formData.get("repTitle"), 120);
  const signature = clip(formData.get("signature"), 160);
  if (!isDate(firstDay)) return { error: "Enter the employee's first day of employment." };
  if (!videoCallAt) return { error: "Enter when the live video call took place." };
  if (formData.get("examinedLive") !== "on" || formData.get("altProcedure") !== "on") {
    return { error: "Confirm the live video examination and the alternative procedure." };
  }
  if (formData.get("attest") !== "on") return { error: "Tick the employer certification." };
  if (!repFirstName || !repLastName || !repTitle) return { error: "Enter your name and title." };
  if (signature.toLowerCase().replace(/\s+/g, " ") !== `${repFirstName} ${repLastName}`.toLowerCase().replace(/\s+/g, " ")) {
    return { error: "Type your full name exactly as entered above to sign." };
  }
  const allDocsNoted = formData.get("copiesRetained") === "on";
  if (!allDocsNoted) return { error: "Confirm that clear copies of all documents (front and back) are uploaded." };

  const signedAt = new Date().toISOString();
  const section2: Section2 = {
    documents: { listA, listB, listC },
    firstDay,
    additionalInfo: clip(formData.get("additionalInfo"), 1000),
    altProcedure: true,
    videoCallAt: new Date(videoCallAt).toISOString(),
    repFirstName,
    repLastName,
    repTitle,
    signature,
    signedAt,
    businessName: company.legalName,
    businessAddress: company.addressLine1 + (company.addressLine2 ? `, ${company.addressLine2}` : ""),
  };

  const { error } = await db()
    .from("stagity_i9_cases")
    .update({
      section2_enc: encryptJson(section2),
      section2_signed_at: signedAt,
      section2_signed_by: hr,
      video_call_at: section2.videoCallAt,
      first_day: firstDay,
      status: "section2_complete",
    })
    .eq("id", id)
    .eq("status", "section1_complete");
  if (error) return { error: "Couldn't save Section 2. " + error.message };
  await audit(id, `hr:${hr}`, "section2_signed", { mode, firstDay, videoCallAt: section2.videoCallAt });
  revalidatePath(`/hr/cases/${id}`);
  revalidatePath("/hr");
  return { ok: true, message: "Section 2 signed. Now create the E-Verify case and record its number below." };
}

export async function saveEverify(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const caseNumber = clip(formData.get("caseNumber"), 40);
  const result = clip(formData.get("result"), 60);
  if (!caseNumber) return { error: "Enter the E-Verify case number." };
  const status = result === "Employment Authorized" || result === "Closed" ? "closed" : "everify_submitted";
  const { error } = await db()
    .from("stagity_i9_cases")
    .update({ everify_case_number: caseNumber, everify_status: result || null, status })
    .eq("id", id)
    .in("status", ["section2_complete", "everify_submitted", "closed"]);
  if (error) return { error: error.message };
  await audit(id, `hr:${hr}`, "everify_updated", { caseNumber, result: result || null });
  revalidatePath(`/hr/cases/${id}`);
  revalidatePath("/hr");
  return { ok: true, message: "E-Verify details saved." };
}

export async function saveRecordInfo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  const terminatedOn = clip(formData.get("terminatedOn"), 10);
  const notes = clip(formData.get("notes"), 2000);
  if (terminatedOn && !isDate(terminatedOn)) return { error: "Enter a valid date." };
  const { error } = await db()
    .from("stagity_i9_cases")
    .update({ terminated_on: terminatedOn || null, notes: notes || null })
    .eq("id", id);
  if (error) return { error: error.message };
  await audit(id, `hr:${hr}`, "record_info_updated", { terminatedOn: terminatedOn || null });
  revalidatePath(`/hr/cases/${id}`);
  return { ok: true, message: "Saved." };
}

export async function cancelCase(formData: FormData) {
  const hr = await requireHr();
  const id = clip(formData.get("id"), 60);
  await db()
    .from("stagity_i9_cases")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "invited");
  await audit(id, `hr:${hr}`, "case_cancelled");
  revalidatePath("/hr");
  redirect("/hr");
}
