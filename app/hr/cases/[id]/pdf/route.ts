import { audit, db, decryptJson, hrSession, I9_BUCKET } from "@/lib/i9/server";
import { buildI9Pdf, type Attachment } from "@/lib/i9/pdf";
import type { Section1, Section2 } from "@/lib/i9/forms";

export const dynamic = "force-dynamic";

/** Official Form I-9, filled from the record, followed by the document copies. HR only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const hr = await hrSession();
  if (!hr) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const { data: c } = await db().from("stagity_i9_cases").select("*").eq("id", id).maybeSingle();
  const s1 = c ? decryptJson<Section1>(c.section1_enc) : null;
  if (!c || !s1) return new Response("Section 1 isn't complete yet.", { status: 404 });
  const s2 = decryptJson<Section2>(c.section2_enc);

  const { data: docs } = await db().from("stagity_i9_documents").select("*").eq("case_id", id).order("list").order("side");
  const attachments: Attachment[] = [];
  for (const d of docs ?? []) {
    const { data: blob } = await db().storage.from(I9_BUCKET).download(d.storage_path);
    if (blob) attachments.push({ label: `List ${d.list}, ${d.side}`, mime: d.mime_type ?? blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) });
  }

  const pdf = await buildI9Pdf(s1, s2, { everifyCase: c.everify_case_number, attachments });
  await audit(id, `hr:${hr}`, "i9_pdf_downloaded");
  const name = `I-9 ${c.employee_last_name} ${c.employee_first_name}`.replace(/[^\w -]/g, "");
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
