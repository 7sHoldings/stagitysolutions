import type { Metadata } from "next";
import Link from "next/link";
import Cta from "@/components/Cta";
import { faqCategories, faqs } from "@/lib/faq";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "Answers to common questions about Stagity Solutions — services, Data & AI, industries, pricing, process, careers and how to contact us.",
  alternates: { canonical: "/faq" },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <section className="container hero" style={{ paddingBottom: 48 }}>
        <p className="eyebrow">FAQ</p>
        <h1 className="display-lg" style={{ maxWidth: 900 }}>
          Questions, answered.
        </h1>
        <p className="lead" style={{ maxWidth: 640 }}>
          Everything people usually ask us. Can&apos;t find yours? Use the chat in the corner or{" "}
          <Link href="/contact">contact our team</Link>.
        </p>
        <nav aria-label="FAQ topics" className="chips" style={{ gap: 8 }}>
          {faqCategories.map((c) => (
            <a key={c} href={`#${slug(c)}`} className="chip chip-topic" style={{ fontSize: 15, padding: "10px 16px" }}>
              {c}
            </a>
          ))}
        </nav>
      </section>

      <section className="container" style={{ paddingBottom: 64 }}>
        {faqCategories.map((cat) => (
          <div key={cat} id={slug(cat)} className="split" style={{ padding: "56px 0", borderTop: "1px solid var(--line)", scrollMarginTop: 96 }}>
            <div className="side">
              <h2 className="h2" style={{ fontSize: "clamp(28px, 3vw, 38px)" }}>
                {cat}
              </h2>
            </div>
            <div className="main faq-list">
              {faqs
                .filter((f) => f.category === cat)
                .map((f) => (
                  <details key={f.id} className="faq-item">
                    <summary>{f.q}</summary>
                    <div className="faq-answer">
                      <p>{f.a}</p>
                      {f.links && f.links.length > 0 && (
                        <p className="bubble-links" style={{ marginTop: 12 }}>
                          {f.links.map((l) => (
                            <a key={l.href + l.label} href={l.href}>
                              {l.label} →
                            </a>
                          ))}
                        </p>
                      )}
                    </div>
                  </details>
                ))}
            </div>
          </div>
        ))}
      </section>

      <Cta title="Still have a question?" text="Our team is happy to help. We reply within one business day." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
