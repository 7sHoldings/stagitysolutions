import { PDFDocument } from "pdf-lib";
import { audit, db, requireHr } from "@/lib/i9/server";
import { decryptDeposit, decryptPersonal, decryptW4 } from "@/lib/onboarding/server";
import { buildDepositPdf, buildPersonalPdf, buildW4Pdf } from "@/lib/onboarding/pdf";

export const dynamic = "force-dynamic";

/** Downloads the filled forms for one person: ?form=personal | w4 | deposit | all (one combined PDF). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  const form = new URL(req.url).searchParams.get("form") ?? "all";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [{ data: ob }, { data: p }] = await Promise.all([
    db().from("stagity_onboarding").select("personal_enc, w4_enc, deposit_enc").eq("person_id", id).maybeSingle(),
    db().from("stagity_people").select("first_name, last_name, emergency_name, emergency_phone, emergency_relationship").eq("id", id).maybeSingle(),
  ]);
  if (!ob || !p) return new Response("Not found", { status: 404 });
  const personal = decryptPersonal(ob.personal_enc);
  const w4 = decryptW4(ob.w4_enc);
  const dep = decryptDeposit(ob.deposit_enc);
  const parts: Uint8Array[] = [];
  const name = personal ? `${personal.firstName}${personal.middleInitial ? ` ${personal.middleInitial}` : ""} ${personal.lastName}` : `${p.first_name} ${p.last_name}`;
  if ((form === "personal" || form === "all") && personal) {
    parts.push(await buildPersonalPdf(personal, { deposit: dep, emergency: p.emergency_name ? { name: p.emergency_name, phone: p.emergency_phone ?? "", relationship: p.emergency_relationship ?? "" } : undefined }));
  }
  if ((form === "w4" || form === "all") && personal && w4) parts.push(await buildW4Pdf(personal, w4));
  if ((form === "deposit" || form === "all") && dep) parts.push(await buildDepositPdf(name, dep));
  if (!parts.length) return new Response("Nothing submitted yet.", { status: 404 });
  let out = parts[0];
  if (parts.length > 1) {
    const merged = await PDFDocument.create();
    for (const part of parts) {
      const d = await PDFDocument.load(part);
      (await merged.copyPages(d, d.getPageIndices())).forEach((pg) => merged.addPage(pg));
    }
    out = await merged.save();
  }
  await audit(null, `hr:${hr}`, "onboarding_pdf_downloaded", { personId: id, form });
  const file = `${p.last_name}-${p.first_name}-${form === "all" ? "new-hire-forms" : form}.pdf`.replace(/[^\w.-]+/g, "_");
  return new Response(Buffer.from(out), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${file}"`, "cache-control": "no-store" } });
}
