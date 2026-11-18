import { hrSession } from "@/lib/i9/server";
import { payrollCsv } from "@/lib/portal/payroll";

/** CSV for ADP RUN payroll import. Columns may need mapping to your RUN import template. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hrSession())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const { filename, body } = await payrollCsv(id);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
