import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Cta from "@/components/Cta";
import { getService, services } from "@/lib/content";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = getService(slug);
  if (!s) return {};
  return {
    title: s.title,
    description: s.heroLine,
    alternates: { canonical: `/services/${s.slug}` },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getService(slug);
  if (!s) notFound();

  const practice = s.group === "data" ? { label: "Data & AI", href: "/services#data-ai" } : { label: "Services", href: "/services" };
  const related = s.related.map((r) => getService(r)).filter(Boolean);

  return (
    <>
      <section className="container" style={{ paddingTop: 56, paddingBottom: 96, display: "flex", flexDirection: "column", gap: 48 }}>
        <nav aria-label="Breadcrumb">
          <ol className="breadcrumb">
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href={practice.href}>{practice.label}</Link>
            </li>
            <li aria-current="page" style={{ color: "var(--ink)" }}>
              {s.title}
            </li>
          </ol>
        </nav>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 56, alignItems: "flex-end" }}>
          <div style={{ flex: "3 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
            <h1 className="display-lg">{s.title}</h1>
            <p className="lead" style={{ maxWidth: 640 }}>
              {s.heroLine}
            </p>
            <div className="btn-row">
              <Link href="/contact" className="btn btn-primary">
                Discuss your project
              </Link>
              <a href="#approach" className="btn btn-outline">
                See our approach
              </a>
            </div>
          </div>
          <aside className="glance" style={{ flex: "1 1 320px", minWidth: 0 }}>
            <p className="eyebrow" style={{ color: "var(--muted)", fontSize: 13 }}>
              At a glance
            </p>
            <dl style={{ margin: 0 }}>
              {s.glance.map((g) => (
                <div key={g.label} className="glance-row">
                  <dt>{g.label}</dt>
                  <dd>{g.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 0 }}>
        <div className="split">
          <div className="side">
            <p className="eyebrow">Overview</p>
          </div>
          <div className="main text" style={{ display: "flex", flexDirection: "column", gap: 20, fontSize: 18 }}>
            {s.intro.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="split">
          <div className="side">
            <p className="eyebrow">Capabilities</p>
            <h2 className="h2">What we deliver</h2>
          </div>
          <div className="main cap-grid">
            {s.capabilities.map((c) => (
              <div key={c.title} className="cap">
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dark" id="approach" style={{ scrollMarginTop: 80 }}>
        <div className="container section">
          <div className="section-head">
            <div className="titles">
              <p className="eyebrow">Our approach</p>
              <h2 className="display-md">{s.approachTitle}</h2>
            </div>
          </div>
          <ol className="line-grid" style={{ listStyle: "none", padding: 0, margin: 0, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {s.approach.map((step, i) => (
              <li key={step.title} className="grid-cell">
                <span className="num-label">{String(i + 1).padStart(2, "0")}</span>
                <h3 style={{ fontSize: 26 }}>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container section">
        <div className="split">
          <div className="side">
            <p className="eyebrow">Outcomes</p>
            <h2 className="h2">How we help</h2>
          </div>
          <ul className="main arrow-list">
            {s.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      </section>

      {related.length > 0 && (
        <section className="tinted">
          <div className="container section-sm" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <h2 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>Related services</h2>
            <div className="tile-grid">
              {related.map((r) => (
                <Link key={r!.slug} href={`/services/${r!.slug}`} className="tile">
                  {r!.title}
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Cta title={`Have a ${s.shortTitle ?? s.title} project in mind?`} text="" />
    </>
  );
}
