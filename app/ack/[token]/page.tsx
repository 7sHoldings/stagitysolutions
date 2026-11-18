import type { Metadata } from "next";
import { db } from "@/lib/i9/server";
import { announcementBody, firstNameOf } from "@/lib/announce";
import { company } from "@/lib/content";
import AckButton from "./AckButton";

export const metadata: Metadata = { title: "Please acknowledge", robots: { index: false, follow: false } };

/** Personal link from the announcement email: shows the announcement and records the acknowledgment. */
export default async function AckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? (await db().from("stagity_acknowledgments").select("name, start_month, ack_by, acknowledged_at").eq("token", token).maybeSingle()).data
    : null;
  if (!row?.start_month) {
    return (
      <section className="container i9-page" style={{ maxWidth: 680 }}>
        <h1 className="h2">This link isn&apos;t valid</h1>
        <p className="lead">Please use the link from your latest email, or contact {company.timesheetsEmail}.</p>
      </section>
    );
  }
  // Same text as the email, minus the greeting/sign-off and the "click the button" line.
  const body = announcementBody(firstNameOf(row.name), row.start_month, row.ack_by).slice(1, -3);
  return (
    <section className="container i9-page ack-page" style={{ maxWidth: 720 }}>
      <div>
        <p className="eyebrow">Stagity Solutions</p>
        <h1 className="h2">New timesheet process</h1>
        <p className="lead" style={{ marginTop: 10 }}>Hi {firstNameOf(row.name)}, please read this and confirm at the bottom.</p>
      </div>
      <div className="help-card ack-body">
        {body.map((p, i) => (p.startsWith("## ") ? <h2 key={i} className="i9-h3">{p.slice(3)}</h2> : <p key={i} style={{ whiteSpace: "pre-line" }}>{p}</p>))}
      </div>
      <div className="help-card">
        <AckButton token={token} done={!!row.acknowledged_at} />
      </div>
      <p className="muted i9-small">Questions? Email {company.timesheetsEmail} or call {company.phone}.</p>
    </section>
  );
}
