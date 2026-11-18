import { hrSession } from "@/lib/i9/server";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { loadInvoice, pdfData } from "@/lib/invoices/send";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hrSession())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const loaded = await loadInvoice(id);
  if (!loaded) return new Response("Not found", { status: 404 });
  const pdf = await buildInvoicePdf(await pdfData(loaded));
  const name = loaded.inv.status === "draft" ? "Draft invoice" : `Invoice ${loaded.inv.number}`;
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"`, "cache-control": "no-store" },
  });
}
