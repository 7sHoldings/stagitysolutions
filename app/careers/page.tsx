import type { Metadata } from "next";
import Link from "next/link";
import Photo from "@/components/Photo";
import { company, jobs, photos } from "@/lib/content";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join Stagity Solutions. See current openings or send us your resume.",
  alternates: { canonical: "/careers" },
};

export default function CareersPage() {
  return (
    <>
      <section className="container hero">
        <p className="eyebrow">Careers</p>
        <h1 className="display-lg" style={{ maxWidth: 1000 }}>
          Technology isn&apos;t just a job here. It&apos;s a vocation.
        </h1>
        <p className="lead" style={{ maxWidth: 680 }}>
          We love being disruptive innovators. Our passion for what we do drives us to keep learning, try new ways of
          working and grow together.
        </p>
      </section>

      <div className="container" style={{ marginBottom: 96 }}>
        <div className="media" style={{ height: 420 }}>
          <Photo src={photos.careers} alt="Colleagues working together at a laptop" sizes="(max-width: 1280px) 100vw, 1200px" priority />
        </div>
      </div>

      <section className="dark">
        <div className="container section">
          <div className="section-head">
            <div className="titles">
              <p className="eyebrow">Current openings</p>
              <h2 className="display-md">{jobs.length > 0 ? "Find your next role." : "No openings right now."}</h2>
            </div>
            <p className="lead" style={{ maxWidth: 400, fontSize: 16 }}>
              {jobs.length > 0 ? "Don't see your role? Send your resume to " : "We're not hiring at the moment, but we'd still love to hear from you. Send your resume to "}
              <a href={`mailto:${company.email}`} style={{ color: "#fff", textDecoration: "underline" }}>
                {company.email}
              </a>
              {jobs.length > 0 ? "." : " and we'll keep it on file for future roles."}
            </p>
          </div>
          {jobs.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,.2)" }}>
            {jobs.map((j) => (
              <div key={j.title} className="job-row">
                <h3>{j.title}</h3>
                <p className="job-desc">
                  {j.description} {j.qualification}.
                </p>
                <p className="job-meta">
                  {j.location}
                  <br />
                  <span style={{ color: "var(--on-dark)" }}>{j.type}</span>
                </p>
                <a
                  className="btn btn-light"
                  href={`mailto:${company.email}?subject=${encodeURIComponent(`Application: ${j.title}`)}`}
                >
                  Apply
                </a>
              </div>
            ))}
          </div>
          )}
        </div>
      </section>

      <section className="container section-sm">
        <div className="hero-row" style={{ alignItems: "center" }}>
          <h2 className="h2" style={{ maxWidth: 640 }}>
            Questions about working with us?
          </h2>
          <Link href="/contact" className="btn btn-outline">
            Contact us
          </Link>
        </div>
      </section>
    </>
  );
}
