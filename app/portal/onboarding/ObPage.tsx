import Link from "next/link";

/** Shared header for onboarding step pages. */
export default function ObPage({ step, title, intro, children }: { step: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="container i9-page ob-page" style={{ maxWidth: 820 }}>
      <Link href="/portal/onboarding" className="hr-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        Onboarding checklist
      </Link>
      <div>
        <p className="eyebrow">{step}</p>
        <h1 className="h2">{title}</h1>
        {intro && <p className="lead" style={{ marginTop: 10 }}>{intro}</p>}
      </div>
      {children}
    </section>
  );
}
