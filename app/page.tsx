import Link from "next/link";
import Cta from "@/components/Cta";
import { icons } from "@/components/Icons";
import Photo from "@/components/Photo";
import { coreServices, dataServices, industries, jobs, photos } from "@/lib/content";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="container hero">
        <p className="pill">
          <span className="dot" aria-hidden="true" />
          IT services · Consulting · Data &amp; AI — Dallas, Texas
        </p>
        <h1 className="display-xl" style={{ maxWidth: 1060 }}>
          Engineering the technology behind growing enterprises.
        </h1>
        <div className="hero-row">
          <p className="lead" style={{ maxWidth: 600 }}>
            We design, build and run the applications, cloud platforms and data systems your business depends on —
            with a team that learns how you work before writing a line of code.
          </p>
          <div className="btn-row">
            <Link href="/contact" className="btn btn-primary">
              Start a project
            </Link>
            <Link href="/services" className="btn btn-outline">
              Our services
            </Link>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="media hero-media">
          <Photo src={photos.hero} alt="Stagity Solutions team collaborating around laptops" sizes="(max-width: 1280px) 100vw, 1200px" priority />
          <div className="facts">
            <div>
              <p className="fact-value">{coreServices.length}</p>
              <p className="fact-label">core service lines</p>
            </div>
            <div>
              <p className="fact-value">{industries.length}</p>
              <p className="fact-label">industries served</p>
            </div>
            <div>
              <p className="fact-value">End-to-end</p>
              <p className="fact-label">strategy, build and support</p>
            </div>
            <div>
              <p className="fact-value">Dallas, TX</p>
              <p className="fact-label">headquarters</p>
            </div>
          </div>
        </div>
      </div>

      {/* Services */}
      <section className="container section">
        <div className="split">
          <div className="side">
            <p className="eyebrow">Services</p>
            <h2 className="h2">What we do</h2>
            <p className="text" style={{ maxWidth: 380 }}>
              Six service lines that cover the full life of your technology — from the first plan to long-term support.
            </p>
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

      {/* Data & AI */}
      <section className="dark" id="data-ai">
        <div className="container section">
          <div className="section-head">
            <div className="titles">
              <p className="eyebrow">Data &amp; AI practice</p>
              <h2 className="display-md">From raw data to decisions you can act on.</h2>
            </div>
            <Link href="/services#data-ai" className="btn btn-outline">
              Explore Data &amp; AI
            </Link>
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

      {/* Process */}
      <section className="container section">
        <div className="section-head">
          <div className="titles" style={{ maxWidth: 640 }}>
            <p className="eyebrow">How we work</p>
            <h2 className="h2">Understand first. Then build what fits.</h2>
          </div>
          <p className="text" style={{ maxWidth: 420 }}>
            A simple, transparent process — so you always know what&apos;s happening and why.
          </p>
        </div>
        <ol className="steps" style={{ listStyle: "none", padding: 0 }}>
          {[
            ["Analyze", "We study your processes, systems and goals before recommending anything."],
            ["Plan", "A clear roadmap: architecture, tools, timeline and budget, agreed up front."],
            ["Deliver", "We build and launch with a focus on reliability, security and performance."],
            ["Improve", "Ongoing support and optimization as your business grows."],
          ].map(([title, text], i) => (
            <li key={title} className="step">
              <div className="marker">
                <span className="circle">{i + 1}</span>
                <span className="rule" />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Industries */}
      <section className="tinted">
        <div className="container section">
          <div className="section-head">
            <div className="titles">
              <p className="eyebrow">Industries</p>
              <h2 className="h2">Experience where it matters most</h2>
            </div>
            <Link href="/industries" className="btn btn-outline">
              All industries
            </Link>
          </div>
          <div className="card-grid">
            {industries.map((ind) => (
              <Link key={ind.slug} href={`/industries#${ind.slug}`} className="industry-card">
                <div className="media">
                  <Photo src={ind.image} alt="" sizes="(max-width: 700px) 100vw, (max-width: 1200px) 50vw, 300px" />
                </div>
                <h3>{ind.title}</h3>
                <p>{ind.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Company */}
      <section className="container section">
        <div className="split">
          <div className="side">
            <p className="eyebrow">Company</p>
          </div>
          <div className="main" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(26px, 3vw, 40px)",
                lineHeight: 1.2,
                letterSpacing: "-0.025em",
                fontWeight: 500,
              }}
            >
              Stagity Solutions is an IT services and consulting company helping organizations work better, faster and
              more cost-effectively through the right technology.
            </p>
            <div className="form-grid text" style={{ gap: 32 }}>
              <p>
                Our core practices cover application development and maintenance, enterprise mobility, business analytics
                and visualization, cloud, and infrastructure services.
              </p>
              <p>
                We combine proven consulting with the latest technical innovation — and we measure success by the
                long-term results our clients see.
              </p>
            </div>
            <Link href="/about" style={{ fontWeight: 600 }}>
              More about us →
            </Link>
          </div>
        </div>
      </section>

      {/* Careers strip */}
      {jobs.length > 0 && (
        <section style={{ borderTop: "1px solid var(--line)" }}>
          <div className="container hero-row" style={{ paddingTop: 72, paddingBottom: 72, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p className="eyebrow">Careers</p>
              <h2 style={{ fontSize: "clamp(24px, 2.6vw, 32px)", letterSpacing: "-0.02em" }}>
                We&apos;re hiring a {jobs[0].title} in {jobs[0].location}.
              </h2>
            </div>
            <Link href="/careers" className="btn btn-outline">
              View open roles →
            </Link>
          </div>
        </section>
      )}

      <Cta />
    </>
  );
}
