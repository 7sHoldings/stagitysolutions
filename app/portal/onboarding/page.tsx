import type { Metadata } from "next";
import Link from "next/link";
import { requirePerson } from "@/lib/portal/server";
import { onboardingSteps } from "@/lib/onboarding/server";

export const metadata: Metadata = { title: "Onboarding", robots: { index: false, follow: false } };

const savedMsg: Record<string, string> = {
  personal: "Personal information saved.", w4: "Form W-4 signed.", deposit: "Direct Deposit Agreement signed.", documents: "Documents submitted.", signed: "Document signed.",
};

export default async function OnboardingHome({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const p = await requirePerson();
  const { saved } = await searchParams;
  const s = await onboardingSteps(p.id);
  if (!s) {
    return (
      <section className="container i9-page" style={{ maxWidth: 720 }}>
        <h1 className="h2">Onboarding</h1>
        <p className="lead">There&apos;s nothing for you to complete right now. HR will email you if any new-hire paperwork is needed.</p>
        <Link href="/portal" className="btn btn-outline hr-btn-sm">Go to timesheets</Link>
      </section>
    );
  }
  const next = s.steps.find((x) => !x.done);
  return (
    <section className="container i9-page ob-page" style={{ maxWidth: 760 }}>
      <div>
        <p className="eyebrow">Welcome to Stagity Solutions</p>
        <h1 className="h2">{s.complete ? "Onboarding complete 🎉" : "Your new-hire paperwork"}</h1>
        <p className="lead" style={{ marginTop: 10 }}>
          {s.complete ? "Thank you! HR has everything it needs." : `${s.done} of ${s.total} done${s.ob.due_date ? ` · please finish by ${new Date(`${s.ob.due_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}` : ""}.`}
        </p>
        <div className="ack-bar" style={{ maxWidth: "none", height: 8 }}><span style={{ width: `${(s.done / s.total) * 100}%` }} /></div>
      </div>
      {saved && savedMsg[saved] && <p className="form-status ok" role="status">✓ {savedMsg[saved]}</p>}
      {s.ob.returned_note && !s.complete && (
        <p className="form-status err"><strong>HR asked you to update something:</strong> {s.ob.returned_note}</p>
      )}
      <ol className="ob-steps">
        {s.steps.map((x, i) => (
          <li key={x.key} className={x.done ? "done" : x === next ? "next" : ""}>
            <span className="ob-num" aria-hidden="true">{x.done ? "✓" : i + 1}</span>
            <span className="ob-label">
              <strong>{x.label}</strong>
              {x.detail && !x.done && <span className="muted i9-small">{x.detail}</span>}
            </span>
            <Link href={x.href} className={`btn hr-btn-sm ${x === next ? "btn-primary" : "btn-outline"}`}>{x.done ? "View / edit" : x === next ? "Start" : "Open"}</Link>
          </li>
        ))}
      </ol>
      <p className="muted i9-small">Your information is encrypted and only Stagity Solutions HR can see it. Questions? Email hr@stagitysolutions.com.</p>
    </section>
  );
}
