import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/ContactForm";
import { company, jobs } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Talk to Stagity Solutions about your project. Call +1 (469) 547-1010 or send us a message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <section className="container" style={{ paddingTop: 96, paddingBottom: 120 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 72, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 400px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
            <p className="eyebrow">Contact</p>
            <h1 className="display-lg">Let&apos;s talk.</h1>
            <p className="lead" style={{ maxWidth: 460 }}>
              Tell us about your project or question. We&apos;ll get back to you within one business day.
            </p>
            <div className="detail-list" style={{ marginTop: 16 }}>
              <div>
                <p className="label">Phone</p>
                <a className="value" href={company.phoneHref}>
                  {company.phone}
                </a>
              </div>
              <div>
                <p className="label">Email</p>
                <a className="value" href={`mailto:${company.email}`}>
                  {company.email}
                </a>
              </div>
              <div>
                <p className="label">Office</p>
                <p className="value">
                  {company.addressLine1}
                  <br />
                  {company.addressLine2}
                </p>
              </div>
            </div>
          </div>
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
            <ContactForm />
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 120 }}>
        <div className="media" style={{ height: 420, background: "#E3E7EE" }}>
          <iframe
            title="Map showing Stagity Solutions office at 4101 McEwen Rd, Dallas, TX"
            src="https://www.google.com/maps?q=4101+McEwen+Rd+Suite+517,+Dallas,+TX+75244&output=embed"
            style={{ border: 0, width: "100%", height: "100%", display: "block" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      {jobs.length > 0 && (
        <section className="tinted">
          <div className="container section-sm hero-row" style={{ alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p className="eyebrow">Careers</p>
              <h2 style={{ fontSize: "clamp(24px, 2.6vw, 32px)", letterSpacing: "-0.02em" }}>
                Looking for a job? See our current openings.
              </h2>
            </div>
            <Link href="/careers" className="btn btn-outline">
              View open roles →
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
