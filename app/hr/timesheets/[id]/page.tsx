import Link from "next/link";
import { notFound } from "next/navigation";
import { db, requireHr } from "@/lib/i9/server";
import { TS_BUCKET } from "@/lib/portal/server";
import { dayName, datesBetween, periodFor, sheetLabel, shortDate } from "@/lib/portal/dates";
import HrNav from "../../HrNav";
import { ReviewForm } from "../forms";

export default async function HrTimesheet({ params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: s } = await db().from("stagity_timesheets").select("*, stagity_people(id, first_name, last_name, client_name, client_manager_name)").eq("id", id).maybeSingle();
  if (!s) notFound();
  const p = s.stagity_people as { id: string; first_name: string; last_name: string; client_name: string | null; client_manager_name: string | null };
  const [{ data: days }, { data: files }] = await Promise.all([
    db().from("stagity_timesheet_days").select("*").eq("timesheet_id", id),
    db().from("stagity_timesheet_files").select("*").eq("timesheet_id", id).order("uploaded_at"),
  ]);
  const urls = new Map<string, string>();
  if (files?.length) {
    const { data } = await db().storage.from(TS_BUCKET).createSignedUrls(files.map((f) => f.storage_path), 600);
    data?.forEach((x) => x.path && x.signedUrl && urls.set(x.path, x.signedUrl));
  }
  const period = periodFor(s.week_start);
  const dates = datesBetween(period.start, period.end);
  const ot = days?.reduce((a, d) => a + Number(d.overtime_hours), 0) ?? 0;

  return (
    <section className="container hr-page">
      <HrNav active="/hr/timesheets" email={hr} />
      <div>
        <p><Link href={`/hr/timesheets?month=${s.week_start.slice(0, 7)}`}>← Timesheets</Link></p>
        <h1 className="h2">{p.first_name} {p.last_name}: {sheetLabel(s.week_start)}</h1>
        <p className="muted">
          {p.client_name ?? "No client"}{p.client_manager_name ? ` · manager ${p.client_manager_name}` : ""} · status <span className={`i9-dot ${s.status}`}>{s.status}</span>
          {s.submitted_at ? ` · submitted ${new Date(s.submitted_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT` : ""}
        </p>
      </div>
      <div className="i9-table-wrap">
        <table className="i9-table i9-grid">
          <thead><tr><th>Day</th>{dates.map((d) => <th key={d}>{dayName(d)} {shortDate(d)}</th>)}<th>Total</th></tr></thead>
          <tbody>
            <tr>
              <td>Hours</td>
              {dates.map((d) => { const h = days?.find((x) => x.work_date === d)?.hours; return <td key={d}>{h === undefined || h === null ? "—" : Number(h)}</td>; })}
              <td><strong>{Number(s.total_hours)}</strong>{ot > 0 && <div className="i9-small muted">{ot} OT</div>}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {s.notes && <p className="form-status" style={{ background: "var(--surface)" }}><strong>Consultant&apos;s note:</strong> {s.notes}</p>}

      <div className="i9-card">
        <h2 className="i9-h3">Client-approved timesheet</h2>
        {files?.length ? (
          <div className="i9-docs">
            {files.map((f) => {
              const url = urls.get(f.storage_path);
              return (
                <figure key={f.id} className="i9-doc">
                  {url && f.mime_type?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={f.original_name ?? "timesheet"} /></a>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="i9-pdf">Open PDF</a>
                  )}
                  <figcaption>{f.original_name}</figcaption>
                </figure>
              );
            })}
          </div>
        ) : <p className="muted">No file uploaded.</p>}
      </div>
      {["submitted", "approved"].includes(s.status) && <ReviewForm id={id} status={s.status} />}
      {s.review_note && <p className="muted">HR note: {s.review_note}</p>}
    </section>
  );
}
