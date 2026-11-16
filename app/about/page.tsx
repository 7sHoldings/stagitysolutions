import type { Metadata } from "next";
import Link from "next/link";
import Cta from "@/components/Cta";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Stagity Solutions is an IT services, consulting and solutions company based in Dallas, Texas, focused on innovative solutions for our customers.",
  alternates: { canonical: "/about" },
};

const values = [
  ["Understand first", "We learn your business, systems and goals before recommending anything."],
  ["Right-fit technology", "We choose tools and architecture for your needs and budget — not the other way round."],
  ["Long-term partnership", "We stay with you after launch, supporting and improving as you grow."],
];

export default function AboutPage() {
  return (
    <>
      <section className="container hero">
        <p className="eyebrow">Company</p>
        <h1 className="display-lg" style={{ maxWidth: 1000 }}>
          A technology partner, empowered by innovation.
        </h1>
      </section>

      <div className="container">
        <div className="media" style={{ height: 420 }} aria-hidden="true" />
      </div>

      <section className="container section">
        <div className="split">
          <div className="side">
            <p className="eyebrow">Our story</p>
          </div>
          <div className="main text" style={{ display: "flex", flexDirection: "column", gap: 22, fontSize: 18 }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(24px, 2.6vw, 34px)",
                lineHeight: 1.25,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
                fontWeight: 500,
              }}
            >
              Stagity Solutions is a new-age IT services, consulting and solutions company with a primary focus on
              innovative solutions for our customers.
            </p>
            <p>
              We provide quality IT services and integrated solutions across software development, system integration, ERP
              solutions and product development. Our core practices include application development and maintenance,
              enterprise mobility, business analytics and visualization, cloud, and infrastructure services.
            </p>
            <p>
              Through proven IT consulting, we help organizations meet their technology challenges and reach their business
              objectives in a better, faster and more cost-effective way — with efficient application and system design,
              and the latest technical innovations.
            </p>
            <p>
              Our diverse range of services and our focus on lasting results have made us a trusted technology and
              consulting partner for our clients.
            </p>
          </div>
        </div>
      </section>

      <section className="dark">
        <div className="container section">
          <div className="section-head">
            <div className="titles">
              <p className="eyebrow">How we work</p>
              <h2 className="display-md">What you can expect from us.</h2>
            </div>
          </div>
          <div className="line-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {values.map(([t, d], i) => (
              <div key={t} className="grid-cell">
                <span className="num-label">{String(i + 1).padStart(2, "0")}</span>
                <h3 style={{ fontSize: 26 }}>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container section-sm">
        <div className="hero-row" style={{ alignItems: "center" }}>
          <h2 className="h2" style={{ maxWidth: 640 }}>
            Explore our services and industries.
          </h2>
          <div className="btn-row">
            <Link href="/services" className="btn btn-outline">
              Services
            </Link>
            <Link href="/industries" className="btn btn-outline">
              Industries
            </Link>
          </div>
        </div>
      </section>

      <Cta />
    </>
  );
}
