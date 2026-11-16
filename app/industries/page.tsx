import type { Metadata } from "next";
import Link from "next/link";
import Cta from "@/components/Cta";
import { industries } from "@/lib/content";

export const metadata: Metadata = {
  title: "Industries",
  description: "Technology services for banking & finance, insurance, manufacturing & retail, and health care.",
  alternates: { canonical: "/industries" },
};

export default function IndustriesPage() {
  return (
    <>
      <section className="container hero" style={{ paddingBottom: 56 }}>
        <p className="eyebrow">Industries</p>
        <h1 className="display-lg" style={{ maxWidth: 940 }}>
          Experience where it matters most.
        </h1>
        <p className="lead" style={{ maxWidth: 640 }}>
          We bring our services to industries where reliability, security and customer experience matter every day.
        </p>
      </section>

      <section className="container" style={{ paddingBottom: 64 }}>
        {industries.map((ind, i) => (
          <article
            key={ind.slug}
            id={ind.slug}
            style={{
              scrollMarginTop: 96,
              display: "flex",
              flexWrap: "wrap",
              gap: 56,
              alignItems: "center",
              padding: "64px 0",
              borderTop: "1px solid var(--line)",
              flexDirection: i % 2 ? "row-reverse" : "row",
            }}
          >
            <div className="media" style={{ flex: "1 1 420px", minWidth: 0, aspectRatio: "4 / 3", borderRadius: 20 }} aria-hidden="true" />
            <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
              <p className="eyebrow">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="h2">{ind.title}</h2>
              {ind.body.map((p, j) => (
                <p key={j} className="text">
                  {p}
                </p>
              ))}
              <Link href="/contact" style={{ fontWeight: 600 }}>
                Talk to us about {ind.title.toLowerCase()} →
              </Link>
            </div>
          </article>
        ))}
      </section>

      <Cta />
    </>
  );
}
