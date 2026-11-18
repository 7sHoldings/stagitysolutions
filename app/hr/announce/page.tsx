import { db, requireHr } from "@/lib/i9/server";
import { addMonths, monthLabel, monthStart, todayCT, addDays } from "@/lib/portal/dates";
import { announcementBody, announcementSubject, longDate, type AckRow } from "@/lib/announce";
import HrNav from "../HrNav";
import { PreviewButton, RemindButton, RowActions, SendForm } from "./forms";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

export default async function Announce() {
  const hr = await requireHr();
  const [{ data }, { data: draft }] = await Promise.all([
    db().from("stagity_acknowledgments").select("*").order("created_at", { ascending: false }),
    db().from("stagity_settings").select("value").eq("key", "announce_draft_recipients").maybeSingle(),
  ]);
  const rows = (data ?? []) as AckRow[];
  const campaigns = [...new Set(rows.map((r) => r.campaign))];
  const today = todayCT();
  const defaultMonth = addMonths(monthStart(today), 1).slice(0, 7);
  const defaultAckBy = addDays(today, 7);
  const previewMonth = `${defaultMonth}-01`;

  return (
    <section className="container hr-page">
      <HrNav active="/hr/announce" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">Announcements</h1>
          <p className="muted">Email consultants about the new timesheet process and track who has acknowledged it.</p>
        </div>
        <PreviewButton subject={announcementSubject(previewMonth)} body={announcementBody("Krutarth", previewMonth, defaultAckBy)} />
      </div>

      {campaigns.map((c) => {
        const list = rows.filter((r) => r.campaign === c).sort((a, b) => Number(!!a.acknowledged_at) - Number(!!b.acknowledged_at) || a.name.localeCompare(b.name));
        const done = list.filter((r) => r.acknowledged_at).length;
        const first = list[0];
        return (
          <article key={c} className="hr-panel">
            <div className="hr-title" style={{ marginBottom: 8 }}>
              <div>
                <h2 className="i9-h3">New timesheet process{first?.start_month ? `, from ${monthLabel(first.start_month)}` : ""}</h2>
                <p className="muted i9-small">
                  <strong>{done} of {list.length}</strong> acknowledged{first?.ack_by ? ` · due ${longDate(first.ack_by)}` : ""}
                </p>
                <div className="ack-bar" aria-hidden="true"><span style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
              </div>
              <RemindButton campaign={c} pending={list.length - done} />
            </div>
            <div className="i9-table-wrap">
              <table className="i9-table">
                <thead><tr><th>Consultant</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong><div className="muted i9-small">{r.email}</div></td>
                      <td>
                        {r.acknowledged_at ? (
                          <span className="i9-badge s-closed">✓ Acknowledged {when(r.acknowledged_at)}</span>
                        ) : r.sent_at ? (
                          <span className="i9-badge s-section1_complete">Waiting · emailed {when(r.sent_at)}{r.send_count > 1 ? ` (${r.send_count}×)` : ""}</span>
                        ) : (
                          <span className="i9-badge s-cancelled">Not sent</span>
                        )}
                      </td>
                      <td>{!r.acknowledged_at && <RowActions id={r.id} name={r.name} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}

      <SendForm defaultRecipients={campaigns.length ? "" : draft?.value ?? ""} defaultMonth={defaultMonth} defaultAckBy={defaultAckBy} />
    </section>
  );
}
