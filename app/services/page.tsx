import type { Metadata } from "next";
import Link from "next/link";
import Cta from "@/components/Cta";
import { icons } from "@/components/Icons";
import { coreServices, dataServices } from "@/lib/content";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Application development, cloud, BI & analytics, enterprise mobility, infrastructure management, BPO and a full Data & AI practice.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <section className="container hero" style={{ paddingBottom: 40 }}>
        <p className="eyebrow">Services</p>
        <h1 className="display-lg" style={{ maxWidth: 980 }}>
          Technology services for every stage of your business.
        </h1>
        <p className="lead" style={{ maxWidth: 640 }}>
          From custom applications to cloud, data and day-to-day support — one partner for the full life of your
          technology.
        </p>
      </section>

      <section className="container section" style={{ paddingTop: 64 }}>
        <div className="split">
          <div className="side">
            <p className="eyebrow">Core services</p>
            <h2 className="h2">What we do</h2>
          </div>
          <div className="main num-list">
            {coreServices.map((s, i) => (
              <Link key={s.slug} href={`/services/${s.slug}`} className="num-row">
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <span className="num-title">{s.title}</span>
                <span className="num-text">{s.summary}</span>
                <span className="arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="dark" id="data-ai" style={{ scrollMarginTop: 80 }}>
        <div className="container section">
          <div className="section-head">
            <div className="titles">
              <p className="eyebrow">Data &amp; AI practice</p>
              <h2 className="display-md">From raw data to decisions you can act on.</h2>
            </div>
            <p className="lead" style={{ maxWidth: 420 }}>
              Modern data platforms, strategy, analytics and machine learning — delivered end to end.
            </p>
          </div>
          <div className="line-grid">
            {dataServices.map((s) => (
              <Link key={s.slug} href={`/services/${s.slug}`} className="grid-cell">
                <span style={{ color: "var(--on-dark-accent)" }}>{icons[s.slug]}</span>
                <h3 style={{ marginTop: "auto" }}>{s.title}</h3>
                <p>{s.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Cta title="Not sure where to start?" text="Tell us about your goals and we'll recommend the right next step." />
    </>
  );
}
